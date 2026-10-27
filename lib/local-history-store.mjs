/** Bounded private immutable JSON objects. Paths are derived from trusted target + hash IDs. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { stateDirectory, acquireStateLock } from "./state-lock.mjs";
import { readStaticFile, readStaticDirectory } from "./static-input.mjs";
export const historyHash = (value) =>
  createHash("sha256").update(value).digest("hex");
export const historyId = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function historyFault(message, code = "HISTORY_INVALID") {
  return Object.assign(Error(message), { code });
}
export function historyDirectory(options = {}) {
  return path.join(
    options.dshHome || process.env.DSH_HOME || path.join(os.homedir(), ".dsh"),
    "dsh-plugin-compat-check",
  );
}
export function historyFile(kind, target, id, options = {}) {
  if (
    !["review-archive", "report-snapshot"].includes(kind) ||
    !historyId(target) ||
    !historyId(id)
  )
    throw historyFault("Invalid local history identity");
  return path.join(historyDirectory(options), `${kind}.${target}.${id}.json`);
}
export function historyCheck(options = {}) {
  options.check?.();
}
export function readPrivateJSON(file, maxBytes, options = {}) {
  historyCheck(options);
  stateDirectory(path.dirname(file));
  const st = fs.lstatSync(file);
  if (
    st.nlink !== 1 ||
    (process.getuid && st.uid !== process.getuid()) ||
    st.mode & 0o077
  )
    throw historyFault("Unsafe history file permissions or links");
  const bytes = readStaticFile(file, maxBytes, () => historyCheck(options));
  return {
    bytes,
    data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  };
}
export function contentObjects(
  kind,
  target,
  maxCount,
  maxBytes,
  totalBytes,
  options = {},
) {
  if (!historyId(target)) throw historyFault("Invalid history target");
  const dir = historyDirectory(options);
  try {
    stateDirectory(dir);
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const prefix = `${kind}.${target}.`,
    files = readStaticDirectory(dir, 4096, () => historyCheck(options)).filter(
      (n) => n.startsWith(prefix) && n.endsWith(".json"),
    );
  if (files.length > maxCount)
    throw historyFault("历史记录超过容量限制；请保留原件并手动核实");
  let total = 0;
  return files.map((name) => {
    const id = name.slice(prefix.length, -5);
    if (!name.endsWith(".json") || !historyId(id))
      throw historyFault("Invalid history filename");
    const { bytes, data } = readPrivateJSON(
      historyFile(kind, target, id, options),
      maxBytes,
      options,
    );
    total += bytes.length;
    if (total > totalBytes) throw historyFault("历史记录总大小超过限制");
    if (historyHash(bytes) !== id)
      throw historyFault("History checksum mismatch; 原件已保留");
    return { id, bytes: bytes.length, data };
  });
}
function syncDirectory(dir) {
  const fd = fs.openSync(dir, "r");
  try {
    fs.fsyncSync(fd);
  } catch (e) {
    if (!["EINVAL", "ENOTSUP", "EBADF"].includes(e.code)) throw e;
  } finally {
    fs.closeSync(fd);
  }
}
export function putContent(kind, target, data, maxBytes, options = {}) {
  historyCheck(options);
  const bytes = JSON.stringify(data) + "\n";
  if (Buffer.byteLength(bytes) > maxBytes)
    throw historyFault("历史记录超过单文件大小限制");
  const id = historyHash(bytes),
    file = historyFile(kind, target, id, options),
    dir = path.dirname(file);
  stateDirectory(dir, { create: true });
  if (fs.existsSync(file)) {
    const existing = readPrivateJSON(file, maxBytes, options);
    if (!existing.bytes.equals(Buffer.from(bytes)))
      throw historyFault("History checksum mismatch");
    return id;
  }
  const temp = path.join(dir, `.history-${randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temp, "wx", 0o600);
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    historyCheck(options);
    fs.linkSync(temp, file);
    fs.unlinkSync(temp);
    syncDirectory(dir);
    return id;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    fs.rmSync(temp, { force: true });
  }
}
export function removeContent(kind, target, id, maxBytes, options = {}) {
  const file = historyFile(kind, target, id, options),
    read = readPrivateJSON(file, maxBytes, options);
  if (historyHash(read.bytes) !== id)
    throw historyFault("History checksum mismatch; 请独立备份后人工核实");
  historyCheck(options);
  fs.unlinkSync(file);
  syncDirectory(path.dirname(file));
}
export function historyLock(kind, target, options = {}) {
  historyCheck(options);
  if (!historyId(target)) throw historyFault("Invalid history target");
  const dir = historyDirectory(options);
  stateDirectory(dir, { create: true });
  return acquireStateLock(path.join(dir, `${kind}.${target}.lock`));
}
export async function assertHistoryCommit(options = {}) {
  historyCheck(options);
  if (options.canCommit && !(await options.canCommit()))
    throw historyFault(
      "Stale or unloaded history operation / 过期",
      "REVIEW_STALE",
    );
  historyCheck(options);
}

export function getContent(kind, target, id, maxBytes, options = {}) {
  const { data, bytes } = readPrivateJSON(
    historyFile(kind, target, id, options),
    maxBytes,
    options,
  );
  if (historyHash(bytes) !== id)
    throw historyFault("History checksum mismatch; 原件已保留");
  return { id, bytes: bytes.length, data };
}
