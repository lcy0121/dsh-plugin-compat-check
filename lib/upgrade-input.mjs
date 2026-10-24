/** Private bounded static snapshots. Target files are data, never modules. */
import fs from "node:fs";
import os from "node:os";
import { runWorkerTask } from "./worker-analysis.mjs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readStaticDirectory } from "./static-input.mjs";

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const UPGRADE_CAPTURE_LIMITS = Object.freeze({
  bytes: 256 * 1024 * 1024,
  fileBytes: 8 * 1024 * 1024,
  entries: 50000,
  depth: 32,
  timeMs: 10000,
});
const stamp = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inside = (root, file) =>
  file === root || file.startsWith(root + path.sep);
const fail = (message) => new Error(`升级预检输入无法稳定捕获：${message}`);

/** Worker-only capture into the root already owned by its supervisor. */
export function captureUpgradeInputOwned(nm, overrides = {}, root) {
  const limits = { ...UPGRADE_CAPTURE_LIMITS, ...overrides };
  for (const [key, value] of Object.entries(limits))
    if (
      !Object.hasOwn(UPGRADE_CAPTURE_LIMITS, key) ||
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      value > UPGRADE_CAPTURE_LIMITS[key]
    )
      throw fail("无效捕获预算 " + key);
  if (typeof nm !== "string" || !nm) throw fail("node_modules 路径缺失");
  const snapshotNm = path.join(root, "node_modules"),
    started = Date.now();
  const observe = (copy) => {
    let bytes = 0,
      entries = 0;
    const records = [],
      packages = [],
      inventory = [];
    const check = () => {
      if (
        bytes > limits.bytes ||
        entries > limits.entries ||
        Date.now() - started > limits.timeMs
      )
        throw fail("捕获预算超限，不发布部分输入");
    };
    const list = (dir) => {
      const before = fs.lstatSync(dir);
      if (!before.isDirectory() || fs.realpathSync(dir) !== dir)
        throw fail("目录身份变化");
      const names = readStaticDirectory(dir, limits.entries - entries, check);
      entries += names.length;
      check();
      records.push(["directory", dir, stamp(before), names]);
      return { names, before };
    };
    const verifyDir = (dir, { names, before }) => {
      if (
        !same(stamp(before), stamp(fs.lstatSync(dir))) ||
        !same(names, readStaticDirectory(dir, names.length, check)) ||
        fs.realpathSync(dir) !== dir
      )
        throw fail("目录在读取时变化");
    };
    const read = (file) => {
      let fd;
      try {
        const before = fs.lstatSync(file);
        if (!before.isFile() || fs.realpathSync(file) !== file)
          throw fail("文件包含链接或不是普通文件");
        bytes += before.size;
        check();
        if (before.size > limits.fileBytes) throw fail("单文件预算超限");
        fd = fs.openSync(
          file,
          fs.constants.O_RDONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK,
        );
        const opened = fs.fstatSync(fd);
        if (!opened.isFile() || !same(stamp(before), stamp(opened)))
          throw fail("文件身份变化");
        const buffer = Buffer.alloc(before.size + 1);
        let length = 0,
          n;
        while (
          length < buffer.length &&
          (n = fs.readSync(fd, buffer, length, buffer.length - length, null))
        )
          length += n;
        if (
          length !== before.size ||
          !same(stamp(before), stamp(fs.fstatSync(fd))) ||
          !same(stamp(before), stamp(fs.lstatSync(file))) ||
          fs.realpathSync(file) !== file
        )
          throw fail("文件在读取时变化");
        const data = buffer.subarray(0, length);
        records.push(["file", file, stamp(before), sha256(data)]);
        return data;
      } finally {
        if (fd !== undefined) fs.closeSync(fd);
      }
    };
    const write = (dest, data) => {
      if (!copy) return;
      fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      fs.writeFileSync(dest, data, { flag: "wx", mode: 0o400 });
    };
    const walk = (
      source,
      dest,
      packageRoot,
      packageDest,
      rows,
      relative = "",
      depth = 0,
    ) => {
      if (depth > limits.depth) throw fail("目录深度预算超限");
      check();
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) {
        const target = fs.readlinkSync(source);
        let real = null;
        try {
          real = fs.realpathSync(source);
        } catch (e) {
          if (!["ENOENT", "ELOOP"].includes(e.code)) throw e;
        }
        records.push(["link", source, stamp(stat), target, real]);
        rows.push([relative, "symlink", target]);
        if (copy) {
          // Escaped/broken links stay visibly unresolved inside the owned tree.
          const newTarget =
            real && inside(packageRoot, real)
              ? path.join(packageDest, path.relative(packageRoot, real))
              : path.join(root, "unresolved-links", sha256(relative));
          fs.symlinkSync(path.relative(path.dirname(dest), newTarget), dest);
        }
      } else if (stat.isDirectory()) {
        const observed = list(source);
        rows.push([relative, "directory"]);
        if (copy) fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
        for (const name of observed.names)
          walk(
            path.join(source, name),
            path.join(dest, name),
            packageRoot,
            packageDest,
            rows,
            relative ? relative + "/" + name : name,
            depth + 1,
          );
        verifyDir(source, observed);
      } else if (stat.isFile()) {
        const data = read(source);
        rows.push([relative, data.length, sha256(data)]);
        write(dest, data);
      } else throw fail("不支持设备、管道等输入类型");
    };
    const canonical = fs.realpathSync(nm),
      nmLink = fs.lstatSync(nm);
    records.push(["node_modules", nm, stamp(nmLink), canonical]);
    const observed = list(canonical);
    if (copy) fs.mkdirSync(snapshotNm, { mode: 0o700 });
    for (const entry of observed.names) {
      let bases = [entry],
        scopeObservation;
      if (entry.startsWith("@")) {
        scopeObservation = list(path.join(canonical, entry));
        bases = scopeObservation.names.map((name) => path.join(entry, name));
      }
      for (const base of bases) {
        const source = path.join(canonical, base);
        let packageRoot;
        try {
          packageRoot = fs.realpathSync(source);
        } catch (e) {
          if (e.code === "ENOENT") {
            records.push(["missing", source]);
            continue;
          }
          throw e;
        }
        const packageStat = fs.lstatSync(source);
        records.push(["package-root", source, stamp(packageStat), packageRoot]);
        if (!fs.lstatSync(packageRoot).isDirectory()) continue;
        const manifest = path.join(packageRoot, "package.json");
        let data;
        try {
          data = read(manifest);
        } catch (e) {
          if (["ENOENT", "ENOTDIR"].includes(e.code)) {
            records.push(["no-manifest", source]);
            continue;
          }
          throw e;
        }
        let meta;
        try {
          meta = JSON.parse(data);
        } catch {
          /* Keep invalid metadata for inventory diagnostics. */
        }
        const plugin =
          meta &&
          typeof meta === "object" &&
          !Array.isArray(meta) &&
          "dsh" in meta &&
          !String(meta.name ?? "").startsWith("@deepseek-ai/");
        const dest = path.join(snapshotNm, base),
          rows = [];
        if (plugin) {
          const name = typeof meta.name === "string" ? meta.name : base;
          if (packages.some((item) => item.name === name))
            throw fail("同名插件重复安装，无法按插件身份可靠比较：" + name);
          walk(packageRoot, dest, packageRoot, dest, rows);
          packages.push({
            name: typeof meta.name === "string" ? meta.name : base,
            version: typeof meta.version === "string" ? meta.version : null,
            sha256: sha256(JSON.stringify(rows)),
          });
        } else write(path.join(dest, "package.json"), data);
        inventory.push([
          base,
          sha256(data),
          plugin ? sha256(JSON.stringify(rows)) : null,
        ]);
      }
      if (scopeObservation)
        verifyDir(path.join(canonical, entry), scopeObservation);
    }
    verifyDir(canonical, observed);
    if (
      fs.realpathSync(nm) !== canonical ||
      !same(stamp(nmLink), stamp(fs.lstatSync(nm)))
    )
      throw fail("node_modules 身份变化");
    return {
      signature: sha256(JSON.stringify(records)),
      artifact: { sha256: sha256(JSON.stringify(inventory)), packages },
    };
  };
  const first = observe(true),
    second = observe(false);
  if (first.signature !== second.signature)
    throw fail("两次观察的目录、文件字节或链接身份不一致");
  const freeze = (dir) => {
    for (const name of readStaticDirectory(dir, limits.entries, () => {
      if (Date.now() - started > limits.timeMs) throw fail("捕获预算超限");
    })) {
      const child = path.join(dir, name);
      if (fs.lstatSync(child).isDirectory()) freeze(child);
    }
    fs.chmodSync(dir, 0o500);
  };
  freeze(root);
  return { nm: snapshotNm, artifact: first.artifact };
}

/** Only this closure can request deletion of its freshly allocated private root. */
export async function captureUpgradeInput(nm, overrides = {}, { signal } = {}) {
  if (signal?.aborted) throw abortCapture();
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "dsc-upgrade-input-"),
  );
  const owned = await fs.promises.lstat(root);
  let disposal;
  const dispose = () =>
    (disposal ||= runWorkerTask(
      new URL("./upgrade-cleanup-worker.mjs", import.meta.url),
      { root, identity: { dev: owned.dev, ino: owned.ino } },
      { timeoutMs: UPGRADE_CAPTURE_LIMITS.timeMs },
    ));
  try {
    const snapshot = await runWorkerTask(
      new URL("./upgrade-capture-worker.mjs", import.meta.url),
      { nm, limits: overrides, root },
      {
        timeoutMs: Math.min(
          overrides.timeMs ?? UPGRADE_CAPTURE_LIMITS.timeMs,
          UPGRADE_CAPTURE_LIMITS.timeMs,
        ),
        signal,
      },
    );
    return { ...snapshot, dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanupError) {
      throw upgradeCleanupError(error, cleanupError);
    }
    throw error;
  }
}
export function upgradeCleanupError(primary, cleanup) {
  const error = new Error(
    `${primary ? String(primary.message || primary) + "；" : ""}私有输入清理未完成：${cleanup.message || cleanup}`,
    primary ? { cause: primary } : undefined,
  );
  error.code = "DSC_UPGRADE_CLEANUP_FAILED";
  return error;
}
function abortCapture() {
  const error = new Error("升级预检已取消");
  error.code = "DSC_WORKER_ABORTED";
  return error;
}
