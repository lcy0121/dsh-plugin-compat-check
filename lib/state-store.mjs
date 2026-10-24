import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { diffAgainstBaseline, badgeFor } from "./baseline.mjs";
import { TOOL_VERSION } from "./version.mjs";
import { acquireStateLock, stateDirectory } from "./state-lock.mjs";
import { readStaticFile } from "./static-input.mjs";
import { validateBaseline } from "./contracts.mjs";

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
    stateDirectory(path.dirname(file));
    const prev = JSON.parse(
      readStaticFile(file, 8 * 1024 * 1024).toString("utf8"),
    );
    if (validateBaseline(prev).length)
      throw new Error("Invalid baseline structure");
    return {
      prev,
      note: null,
      status: "valid",
    };
  } catch (error) {
    if (error.code === "ENOENT")
      return {
        prev: null,
        note: "还没有基线（这是第一次体检）",
        status: "missing",
      };
    return {
      prev: null,
      status: "unavailable",
      note:
        "基线格式不支持、损坏或不可安全读取，已保留原件；请人工核实或恢复可信备份后重试，本次不比较或覆盖" +
        (error.code === "STATE_LOCK_UNSAFE" ? "；" + error.message : ""),
    };
  }
}
/** Atomic replace never follows an existing output-file symlink. */
export function writeBaseline(file, snapshot) {
  const temporary = path.join(
    path.dirname(file),
    `.baseline-${randomUUID()}.tmp`,
  );
  try {
    stateDirectory(path.dirname(file), { create: true });
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
  let heldLock = null;
  const lock = file + ".lock";
  try {
    heldLock = acquireStateLock(lock);
    if (validateBaseline(snapshot).length)
      throw new Error("新基线结构无效，未写入；保留原状态");
    const { prev, note, status } = readBaseline(file),
      diff = diffAgainstBaseline(prev, snapshot);
    if (status === "unavailable") diff.reason = note;
    const out = { file, note, diff, badge: badgeFor(diff), wrote: false };
    if (status === "unavailable") {
      out.writeError = note;
      return out;
    }
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
          ? `另一个进程正在更新基线或锁已遗留；本次保留上次状态。可用对应源码仓库的 bin/recover-lock.mjs 检查 ${lock}`
          : error.message,
    };
  } finally {
    heldLock?.release();
  }
}
