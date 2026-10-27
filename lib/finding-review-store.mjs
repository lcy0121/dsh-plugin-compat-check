/** Bounded manual-review sidecar storage. Never mutates reports or baseline state. */
import fs from "node:fs/promises";
import { acquireStateLock, stateDirectory } from "./state-lock.mjs";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  stableIdentity,
  validateReviewInput,
  validateReviewDocument,
  combineReviews,
  REVIEW_LIMITS,
} from "./finding-review.mjs";
const digest = (x) => createHash("sha256").update(x).digest("hex");
const empty = () => ({
  schemaVersion: 1,
  revision: "0".repeat(64),
  records: [],
});
function fault(message, code = "REVIEW_INVALID") {
  return Object.assign(new Error(message), { code });
}
/** Options are trusted server inputs, never fields from an HTTP body. */
export async function reviewContext(
  report,
  {
    nodeModules,
    rulesIdentity,
    catalogIdentity,
    sourceIdentity,
    toolVersion,
  } = {},
) {
  if (
    !report ||
    !report.plugins ||
    typeof nodeModules !== "string" ||
    !nodeModules ||
    !rulesIdentity ||
    !catalogIdentity ||
    typeof sourceIdentity !== "string" ||
    !sourceIdentity.trim() ||
    sourceIdentity.length > 1000
  )
    throw fault("Review target/rules/catalog/source identity is required");
  const originalPath = path.resolve(nodeModules),
    profileId = await fs.realpath(originalPath);
  const scope = {
    profileId,
    originalPath,
    mode: report.observation?.mode || "catalogue",
    observationProfile: report.observation?.profileId ?? null,
    toolVersion: toolVersion || report.toolVersion,
    dshVersion: report.dshVersion,
    rulesIdentity,
    catalogIdentity,
    sourceIdentity,
  };
  // Changes in source span, severity, certainty, evidence, or API require fresh review.
  const findings = [];
  for (const [pluginName, plugin] of Object.entries(report.plugins)) {
    if (typeof plugin.version !== "string" || !plugin.version)
      throw fault("Exact plugin version is required for reviews");
    for (const [findingIndex, finding] of (plugin.findings || []).entries()) {
      if (findings.length >= REVIEW_LIMITS.findings)
        throw fault("Too many findings for review");
      const identity = stableIdentity({
        scope,
        pluginName,
        pluginVersion: plugin.version,
        finding,
      });
      const lineage = stableIdentity([
        pluginName,
        finding.category,
        finding.service ?? null,
        finding.method ?? null,
      ]);
      findings.push({
        findingId: digest(identity),
        identity,
        lineage,
        pluginName,
        pluginVersion: plugin.version,
        findingIndex,
      });
    }
  }
  const targetKey = digest(profileId);
  const contextToken = createHash("sha256")
    .update(stableIdentity(scope))
    .update("\n")
    .update(findings.map((f) => f.findingId).join("\n"))
    .digest("hex");
  return { targetKey, contextToken, findings };
}
function storage(context, options) {
  if (!/^[a-f0-9]{64}$/.test(context?.targetKey))
    throw fault("Invalid review context");
  const home =
    options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  return path.join(
    home,
    "dsh-plugin-compat-check",
    `reviews.${context.targetKey}.json`,
  );
}
async function safeDirectory(dir, options = {}) {
  try {
    stateDirectory(dir, options);
  } catch (error) {
    if (error.code === "ENOENT") throw error;
    throw fault(error.message, "REVIEW_STORAGE");
  }
}
async function load(file) {
  try {
    await safeDirectory(path.dirname(file));
    const stat = await fs.lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > REVIEW_LIMITS.fileBytes
    )
      throw fault(
        "Review storage is nonregular, symbolic-link or exceeds limits",
        "REVIEW_STORAGE",
      );
    const handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > REVIEW_LIMITS.fileBytes)
        throw fault("Invalid review storage", "REVIEW_STORAGE");
      const buffer = Buffer.alloc(REVIEW_LIMITS.fileBytes + 1);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > REVIEW_LIMITS.fileBytes)
        throw fault("Review storage exceeds limits", "REVIEW_STORAGE");
      const doc = validateReviewDocument(
        JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")),
      );
      for (const record of doc.records)
        if (digest(record.identity) !== record.findingId)
          throw fault("Review identity checksum mismatch", "REVIEW_STORAGE");
      return doc;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error.code === "ENOENT") return empty();
    throw fault(
      `Review storage cannot be read: ${error.message}`,
      "REVIEW_STORAGE",
    );
  }
}
/** Cheap invalidation only: safe directory and file metadata, never document contents. */
export async function reviewFileIdentity(context, options = {}) {
  const file = storage(context, options),
    dir = path.dirname(file);
  try {
    await safeDirectory(dir);
    const parent = await fs.lstat(dir, { bigint: true });
    let stat;
    try {
      stat = await fs.lstat(file, { bigint: true });
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (
      stat &&
      (!stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > BigInt(REVIEW_LIMITS.fileBytes))
    )
      throw fault(
        "Review storage is nonregular, symbolic-link or exceeds limits",
        "REVIEW_STORAGE",
      );
    const fields = (st) =>
      [
        st.dev,
        st.ino,
        st.mode,
        st.uid,
        st.gid,
        st.nlink,
        st.size,
        st.mtimeNs,
        st.ctimeNs,
      ].map(String);
    return JSON.stringify([fields(parent), stat ? fields(stat) : null]);
  } catch (error) {
    if (error.code === "ENOENT") return "missing-directory";
    throw fault(
      `Review storage cannot be read: ${error.message}`,
      "REVIEW_STORAGE",
    );
  }
}

export async function readReviews(context, options = {}) {
  try {
    const doc = await load(storage(context, options));
    return combineReviews(context, doc.records, { revision: doc.revision });
  } catch (error) {
    return combineReviews(context, [], { error: error.message });
  }
}
export async function saveReview(context, input, options = {}) {
  const body = validateReviewInput(input);
  if (body.contextToken !== context.contextToken)
    throw fault(
      "Stale review context; refresh the current report",
      "REVIEW_STALE",
    );
  const entry = context.findings.find((f) => f.findingId === body.findingId);
  if (!entry)
    throw fault("Unknown finding in current review context", "REVIEW_STALE");
  const file = storage(context, options),
    dir = path.dirname(file),
    lock = file + ".lock",
    temp = path.join(dir, `.reviews-${randomUUID()}.tmp`);
  await safeDirectory(dir, { create: true });
  let lockHandle = null;
  try {
    try {
      lockHandle = acquireStateLock(lock);
    } catch (error) {
      if (error.code === "EEXIST")
        throw fault(
          `人工处置写入锁仍存在或上次保存已中断：${lock}。刷新不会清除此锁；使用对应源码仓库的 bin/recover-lock.mjs 检查并显式恢复已确认退出的持有者；保留原始 JSON 及临时文件。`,
          "REVIEW_BUSY",
        );
      throw error;
    }
    const doc = await load(file);
    const record = {
      findingId: entry.findingId,
      identity: entry.identity,
      lineage: entry.lineage,
      pluginName: entry.pluginName,
      pluginVersion: entry.pluginVersion,
      status: body.status,
      note: body.note,
      updatedAt: new Date().toISOString(),
    };
    const records = doc.records.filter((r) => r.findingId !== entry.findingId);
    records.push(record);
    const next = { schemaVersion: 1, revision: digest(randomUUID()), records };
    validateReviewDocument(next);
    const bytes = JSON.stringify(next, null, 2) + "\n";
    if (Buffer.byteLength(bytes) > REVIEW_LIMITS.fileBytes)
      throw fault("Review storage exceeds limits");
    const handle = await fs.open(temp, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // Recheck the destination immediately before replacing. Bad data is never repaired implicitly.
    await load(file);
    if (options.canCommit && !(await options.canCommit()))
      throw fault(
        "Stale or unloaded host cannot commit review",
        "REVIEW_STALE",
      );
    await fs.rename(temp, file);
    return combineReviews(context, records, { revision: next.revision });
  } finally {
    await fs.rm(temp, { force: true }).catch(() => {});
    lockHandle?.release();
  }
}
