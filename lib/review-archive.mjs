/** Review archives never restore a reviewed status into current findings. */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { validateReviewDocument, REVIEW_LIMITS } from "./finding-review.mjs";
import { reviewStorage, loadReviewDocument } from "./finding-review-store.mjs";
import {
  getContent,
  historyHash,
  historyId,
  historyFault,
  contentObjects,
  putContent,
  removeContent,
  historyCheck,
  assertHistoryCommit,
} from "./local-history-store.mjs";
import { acquireStateLock } from "./state-lock.mjs";
export const REVIEW_ARCHIVE_LIMITS = Object.freeze({
  files: 100,
  fileBytes: REVIEW_LIMITS.fileBytes + 8192,
  totalBytes: 101 * 1024 * 1024,
});
export function validateReviewArchive(data, target) {
  if (
    !data ||
    Object.keys(data).sort().join(",") !==
      "createdAt,document,kind,schemaVersion,targetKey" ||
    data.kind !== "plugin-compat-check/review-archive" ||
    data.schemaVersion !== 1 ||
    data.targetKey !== target ||
    !historyId(target) ||
    typeof data.createdAt !== "string" ||
    data.createdAt.length > 40 ||
    !Number.isFinite(Date.parse(data.createdAt))
  )
    throw historyFault(
      "Invalid review archive target/schema / 归档目标或结构无效",
    );
  validateReviewDocument(data.document);
  for (const r of data.document.records) {
    if (
      historyHash(r.identity) !== r.findingId ||
      historyHash(JSON.parse(r.identity).scope.profileId) !== target
    )
      throw historyFault("Invalid review archive identity binding");
  }
  return data;
}
function archives(context, options) {
  return contentObjects(
    "review-archive",
    context.targetKey,
    REVIEW_ARCHIVE_LIMITS.files,
    REVIEW_ARCHIVE_LIMITS.fileBytes,
    REVIEW_ARCHIVE_LIMITS.totalBytes,
    options,
  ).map((x) => ({
    ...x,
    data: validateReviewArchive(x.data, context.targetKey),
  }));
}
export async function reviewArchiveState(context, options = {}) {
  const doc = await loadReviewDocument(reviewStorage(context, options));
  historyCheck(options);
  const ids = new Set(context.findings.map((f) => f.findingId));
  const list = archives(context, options);
  let usedBytes = 0;
  try {
    usedBytes = (await fs.lstat(reviewStorage(context, options))).size;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    revision: doc.revision,
    capacity: {
      records: doc.records.length,
      recordLimit: REVIEW_LIMITS.records,
      bytes: usedBytes,
      byteLimit: REVIEW_LIMITS.fileBytes,
      historical: doc.records.filter((r) => !ids.has(r.findingId)).length,
    },
    archiveLimit: REVIEW_ARCHIVE_LIMITS.files,
    archives: list
      .map((x) => ({
        id: x.id,
        createdAt: x.data.createdAt,
        records: x.data.document.records.length,
        bytes: x.bytes,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}
export async function exportActiveReviews(context, options = {}) {
  const document = await loadReviewDocument(reviewStorage(context, options));
  historyCheck(options);
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/review-archive",
    targetKey: context.targetKey,
    createdAt: new Date().toISOString(),
    document,
  };
}
async function withReviewLock(context, options, run) {
  const file = reviewStorage(context, options);
  const { stateDirectory } = await import("./state-lock.mjs");
  historyCheck(options);
  stateDirectory(path.dirname(file), { create: true });
  const lock = acquireStateLock(file + ".lock");
  try {
    return await run(file);
  } finally {
    lock.release();
  }
}
function addArchive(context, data, options) {
  const all = archives(context, options),
    bytes = Buffer.byteLength(JSON.stringify(data) + "\n"),
    id = historyHash(JSON.stringify(data) + "\n");
  if (
    !all.some((x) => x.id === id) &&
    (all.length >= REVIEW_ARCHIVE_LIMITS.files ||
      all.reduce((n, x) => n + x.bytes, 0) + bytes >
        REVIEW_ARCHIVE_LIMITS.totalBytes)
  )
    throw historyFault("归档容量已满；请先导出并显式移除不再保留的归档");
  return putContent(
    "review-archive",
    context.targetKey,
    data,
    REVIEW_ARCHIVE_LIMITS.fileBytes,
    options,
  );
}
export async function archiveReviews(context, input, options = {}) {
  if (
    !input ||
    Object.keys(input).sort().join(",") !== "contextToken,mode,revision" ||
    input.contextToken !== context.contextToken ||
    !["history", "all"].includes(input.mode) ||
    !historyId(input.revision)
  )
    throw historyFault("Invalid archive request");
  return withReviewLock(context, options, async (file) => {
    const doc = await loadReviewDocument(file);
    if (doc.revision !== input.revision)
      throw historyFault(
        "Review revision / 修订已变化，请重新加载",
        "REVIEW_STALE",
      );
    const current = new Set(context.findings.map((f) => f.findingId)),
      selected = doc.records.filter(
        (r) => input.mode === "all" || !current.has(r.findingId),
      );
    if (!selected.length) throw historyFault("没有可归档的记录 / empty");
    await assertHistoryCommit(options);
    const data = {
      schemaVersion: 1,
      kind: "plugin-compat-check/review-archive",
      targetKey: context.targetKey,
      createdAt: new Date().toISOString(),
      document: { ...doc, records: selected },
    };
    addArchive(context, data, options);
    const next = {
        schemaVersion: 1,
        revision: historyHash(randomUUID()),
        records: doc.records.filter((r) => !selected.includes(r)),
      },
      temp = path.join(path.dirname(file), `.reviews-${randomUUID()}.tmp`);
    const bytes = JSON.stringify(next) + "\n";
    if (Buffer.byteLength(bytes) > REVIEW_LIMITS.fileBytes)
      throw historyFault("Review storage exceeds limits; 活动记录未改动");
    try {
      const handle = await fs.open(temp, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const latest = await loadReviewDocument(file);
      if (latest.revision !== doc.revision)
        throw historyFault("Review revision changed", "REVIEW_STALE");
      await assertHistoryCommit(options);
      await fs.rename(temp, file);
    } finally {
      await fs.rm(temp, { force: true }).catch(() => {});
    }
    return reviewArchiveState(context, options);
  });
}
export async function readReviewArchive(context, id, options = {}) {
  if (!historyId(id)) throw historyFault("Invalid archive ID");
  const item = getContent(
    "review-archive",
    context.targetKey,
    id,
    REVIEW_ARCHIVE_LIMITS.fileBytes,
    options,
  );
  validateReviewArchive(item.data, context.targetKey);
  return { id, referenceOnly: true, data: item.data };
}
export async function importReviewArchive(context, data, options = {}) {
  validateReviewArchive(data, context.targetKey);
  return withReviewLock(context, options, async () => {
    await assertHistoryCommit(options);
    addArchive(context, data, options);
    return reviewArchiveState(context, options);
  });
}
export async function deleteReviewArchive(context, id, options = {}) {
  return withReviewLock(context, options, async () => {
    await assertHistoryCommit(options);
    removeContent(
      "review-archive",
      context.targetKey,
      id,
      REVIEW_ARCHIVE_LIMITS.fileBytes,
      options,
    );
    return reviewArchiveState(context, options);
  });
}
