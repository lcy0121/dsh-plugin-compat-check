/** Private local state locks. Recovery never infers death from lock age or PID reuse. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
const MAX_BYTES = 8192;
const fail = (message, code = "STATE_LOCK_UNSAFE") =>
  Object.assign(new Error(message), { code });
const same = (a, b) => a.dev === b.dev && a.ino === b.ino;
const guardPath = (lock) => lock + ".recovery-lock";
export function stateDirectory(dir, { create = false } = {}) {
  if (create) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (
    !st.isDirectory() ||
    st.isSymbolicLink() ||
    (process.getuid && st.uid !== process.getuid())
  )
    throw fail("Unsafe state directory");
  if (st.mode & 0o077) {
    if (create) fs.chmodSync(dir, 0o700);
    else throw fail("State directory must be private (0700)");
  }
}
// A process-local start/instance marker, not an OS birth-time attestation.
// Any existing PID (including a reused PID) blocks recovery, so writers never
// need external commands or a platform process-list query to create metadata.
const selfBirth = `node:${new Date(Date.now() - process.uptime() * 1000).toISOString()}:${randomUUID()}`;
function record(lock) {
  return {
    schemaVersion: 1,
    kind: "dsh-plugin-compat-check/state-lock",
    lock: path.resolve(lock),
    pid: process.pid,
    uid: process.getuid?.() ?? null,
    host: os.hostname(),
    birth: selfBirth,
    createdAt: new Date().toISOString(),
    nonce: randomUUID(),
  };
}
function readLock(lock) {
  let fd;
  try {
    fd = fs.openSync(
      lock,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const st = fs.fstatSync(fd);
    if (
      !st.isFile() ||
      st.nlink !== 1 ||
      st.size > MAX_BYTES ||
      (process.getuid && st.uid !== process.getuid()) ||
      st.mode & 0o022
    )
      throw fail("Lock is nonregular, oversized, linked, or unsafe");
    const buf = Buffer.alloc(MAX_BYTES + 1);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n > MAX_BYTES) throw fail("Lock metadata exceeds limit");
    const bytes = buf.subarray(0, n);
    if (!same(st, fs.lstatSync(lock))) throw fail("Lock changed while reading");
    const token = createHash("sha256")
      .update(`${st.dev}:${st.ino}:`)
      .update(bytes)
      .digest("hex");
    return { st, bytes, token };
  } catch (error) {
    if (error.code === "STATE_LOCK_UNSAFE") throw error;
    throw fail(`Lock cannot be read safely: ${error.code || error.message}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function unlinkSame(lock, original) {
  const current = readLock(lock);
  if (!same(current.st, original.st) || !current.bytes.equals(original.bytes))
    throw fail("Lock changed; refusing to remove replacement");
  fs.unlinkSync(lock);
}
function createLock(lock) {
  const fd = fs.openSync(
    lock,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  const st = fs.fstatSync(fd);
  let owned;
  try {
    const bytes = Buffer.from(JSON.stringify(record(lock)) + "\n");
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
    owned = { st, bytes };
  } catch (error) {
    // An incomplete record is deliberately left for explicit operator diagnosis.
    fs.closeSync(fd);
    throw error;
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try {
        unlinkSame(lock, owned);
      } catch {
      } finally {
        fs.closeSync(fd);
      }
    },
  };
}
function noRecovery(lock) {
  try {
    fs.lstatSync(guardPath(lock));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  throw fail(
    "State lock recovery is in progress or interrupted; recovery guard requires operator diagnosis",
    "EEXIST",
  );
}
export function acquireStateLock(lock) {
  stateDirectory(path.dirname(lock), { create: true });
  noRecovery(lock);
  const held = createLock(lock);
  try {
    noRecovery(lock);
    return held;
  } catch (error) {
    held.release();
    throw error;
  }
}
function orphan(lock) {
  const observed = readLock(lock);
  let value;
  try {
    value = JSON.parse(observed.bytes.toString("utf8"));
  } catch {
    throw fail("Legacy empty or malformed lock; automatic recovery refused");
  }
  if (
    value?.schemaVersion !== 1 ||
    value.kind !== "dsh-plugin-compat-check/state-lock" ||
    value.lock !== lock ||
    !Number.isSafeInteger(value.pid) ||
    value.pid <= 1 ||
    typeof value.host !== "string" ||
    typeof value.birth !== "string" ||
    !value.birth ||
    typeof value.nonce !== "string" ||
    value.nonce.length < 16 ||
    typeof value.createdAt !== "string" ||
    !Number.isFinite(Date.parse(value.createdAt))
  )
    throw fail("Legacy or incomplete holder identity; recovery refused");
  if (
    value.host !== os.hostname() ||
    value.uid !== (process.getuid?.() ?? null)
  )
    throw fail("Holder host or user identity differs; recovery refused");
  try {
    process.kill(value.pid, 0);
  } catch (error) {
    if (error.code === "ESRCH") return { ...observed, holder: value };
    throw fail(
      `Holder identity is unknown (${error.code || "signal failed"}); recovery refused`,
    );
  }
  throw fail(
    "Holder PID is active, reused or identity cannot be confirmed; recovery refused",
  );
}
/** Trusted local entry point only. Tool/path-bound state lock, no wildcard cleanup. */
export function recoverStateLock(lock, { confirm } = {}) {
  lock = path.resolve(lock);
  if (!path.basename(lock).endsWith(".lock") || path.basename(lock) === ".lock")
    throw fail("Expected an exact state .lock path");
  stateDirectory(path.dirname(lock));
  const guard = createLock(guardPath(lock));
  try {
    const observed = orphan(lock);
    if (confirm === undefined)
      return {
        status: "orphan",
        lock,
        token: observed.token,
        holder: observed.holder,
      };
    if (typeof confirm !== "string" || confirm !== observed.token)
      throw fail("Confirmation token is stale; inspect this exact lock again");
    const checked = orphan(lock);
    if (checked.token !== observed.token)
      throw fail("Lock changed during recovery");
    unlinkSame(lock, observed);
    return { status: "recovered", lock };
  } finally {
    guard.release();
  }
}
