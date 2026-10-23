import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { diffAgainstBaseline, badgeFor } from "./baseline.mjs";
import { TOOL_VERSION } from "./version.mjs";
import { readStaticFile } from "./static-input.mjs";

export const digest = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function baselineIdentity(nm, mode, rules, catalog) {
  let profileId = path.resolve(nm);
  try {
    profileId = fs.realpathSync(nm);
  } catch {}
  return {
    profileId,
    mode,
    toolVersion: TOOL_VERSION,
    rulesDigest: digest(rules),
    catalogDigest: digest(catalog),
  };
}
export function baselinePath(nm, mode = "catalogue", profile = null) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  const parts = path.resolve(nm).split(path.sep),
    i = parts.lastIndexOf("profiles");
  const key = (
    profile ||
    (i >= 0 ? parts[i + 1] : "unknown") ||
    "unknown"
  ).replace(/[^\w.-]/g, "_");
  let canonical = path.resolve(nm);
  try {
    canonical = fs.realpathSync(nm);
  } catch {}
  return path.join(
    home,
    "dsh-plugin-compat-check",
    `baseline.${key}.${digest(canonical).slice(0, 12)}.${mode}.json`,
  );
}
export function readBaseline(file) {
  try {
    if (!fs.existsSync(file))
      return { prev: null, note: "还没有基线（这是第一次体检）" };
    return {
      prev: JSON.parse(readStaticFile(file, 8 * 1024 * 1024).toString("utf8")),
      note: null,
    };
  } catch {
    return { prev: null, note: "基线读不出来，这次不做比较" };
  }
}
/** Atomic replace never follows an existing output-file symlink. */
export function writeBaseline(file, snapshot) {
  const temporary = path.join(
    path.dirname(file),
    `.baseline-${randomUUID()}.tmp`,
  );
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(temporary, JSON.stringify(snapshot, null, 2) + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    fs.renameSync(temporary, file);
    return null;
  } catch (error) {
    return `基线写不进去（${error.message}）`;
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {}
  }
}

/** Serialize read/compare/replace across processes. Busy locks never overwrite newer state. */
export function baselineTransaction(file, snapshot, { advance = true } = {}) {
  let fd = null;
  const lock = file + ".lock";
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())
    )
      throw new Error("Unsafe baseline directory");
    if (stat.mode & 0o077) fs.chmodSync(dir, 0o700);
    fd = fs.openSync(
      lock,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY,
      0o600,
    );
    const { prev, note } = readBaseline(file),
      diff = diffAgainstBaseline(prev, snapshot);
    const out = { file, note, diff, badge: badgeFor(diff), wrote: false };
    if (advance) {
      const error = writeBaseline(file, snapshot);
      if (error) out.writeError = error;
      else out.wrote = true;
    } else
      out.note = [note, "本次扫描不完整或仅预览，保留上次基线"]
        .filter(Boolean)
        .join("；");
    return out;
  } catch (error) {
    return {
      file,
      note: "基线不可用，本次不比较",
      diff: null,
      badge: badgeFor(null),
      wrote: false,
      writeError:
        error.code === "EEXIST"
          ? "另一个进程正在更新基线；本次保留上次状态"
          : error.message,
    };
  } finally {
    if (fd !== null) {
      fs.closeSync(fd);
      try {
        fs.unlinkSync(lock);
      } catch {}
    }
  }
}
