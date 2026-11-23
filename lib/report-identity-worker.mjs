import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import {
  readStaticDirectory,
  readStaticFile,
  lowerInputLimits,
  isSourceFile,
} from "./static-input.mjs";
const limits = lowerInputLimits(
  {
    entries: 50000,
    files: 50000,
    directories: 10000,
    bytes: 32 * 1024 * 1024,
    timeMs: 5000,
  },
  workerData.limits,
);
const started = Date.now();
const check = () => {
  if (Date.now() - started > limits.timeMs) throw Error("缓存身份时间预算超限");
};
let entries = 0,
  bytesRead = 0;
const list = (dir) => {
  const names = readStaticDirectory(dir, limits.entries - entries, check);
  entries += names.length;
  return names;
};
const hash = createHash("sha256");
const add = (value) => hash.update(JSON.stringify(value) + "\n");
let remaining = limits.files,
  directories = limits.directories;
const services = new Set(),
  manifests = [];
function metadata(file, full = true, packageRoot) {
  check();
  if (--remaining < 0) throw Error("缓存身份文件预算超限，等待后续刷新");
  const real = fs.realpathSync(file);
  if (
    packageRoot &&
    real !== packageRoot &&
    !real.startsWith(packageRoot + path.sep)
  ) {
    add([file, real, "outside-package"]);
    return null;
  }
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    // Child inventory is observed separately. Directory timestamps change on
    // ordinary runtime writes, and cannot identify the analyzed input bytes.
    add([file, real, "directory"]);
  } else if (full || (packageRoot && isSourceFile(real))) {
    add([
      file,
      real,
      stat.size,
      stat.mtimeMs,
      stat.ctimeMs,
      stat.ino,
      stat.mode,
    ]);
  } else if (
    (packageRoot && workerData.resolutionInputs === undefined) ||
    /\.(json|node)$/.test(file) ||
    fs.lstatSync(file).isSymbolicLink()
  ) {
    // Unsupported module candidates can affect resolution diagnostics, but
    // their changing data bytes are not JavaScript/TypeScript analysis inputs.
    add([file, real, stat.isFile() ? "file" : "special"]);
  }
  return stat;
}
function smallFile(file, limit = 1024 * 1024) {
  try {
    metadata(file);
    let bytes;
    try {
      bytes = readStaticFile(
        file,
        Math.min(limit, limits.bytes - bytesRead),
        check,
      );
    } catch (error) {
      if (error.code === "STATIC_INPUT_TYPE")
        throw Error("缓存身份输入不是预算内普通文件");
      throw error;
    }
    bytesRead += bytes.length;
    add(bytes.toString("base64"));
    return bytes;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) {
      add([file, "missing"]);
      return null;
    }
    throw error;
  }
}

function walk(packagePath, manifest) {
  const root = fs.realpathSync(packagePath);
  const patches = manifest.dsh?.bundle?.patch;
  const patchFiles = new Set(
    (Array.isArray(patches) ? patches : [patches])
      .filter((file) => typeof file === "string")
      .map((file) => path.resolve(root, file)),
  );
  for (const file of patchFiles) {
    if (file !== root && file.startsWith(root + path.sep)) {
      try {
        metadata(file, true, root);
      } catch (error) {
        if (["ENOENT", "ENOTDIR"].includes(error.code)) add([file, "missing"]);
        else throw error;
      }
    }
  }
  const seen = new Set(),
    queue = [root];
  while (queue.length) {
    if (--directories < 0) throw Error("缓存身份目录预算超限，等待后续刷新");
    const dir = queue.pop(),
      real = fs.realpathSync(dir);
    if (seen.has(real) || (real !== root && !real.startsWith(root + path.sep)))
      continue;
    seen.add(real);
    for (const entry of list(dir)) {
      const file = path.join(dir, entry);
      let stat;
      try {
        stat = metadata(
          file,
          isSourceFile(file) ||
            path.basename(file) === "package.json" ||
            patchFiles.has(file),
          root,
        );
      } catch (error) {
        if (error.code === "ENOENT") {
          if (
            isSourceFile(file) ||
            path.basename(file) === "package.json" ||
            patchFiles.has(file)
          )
            add([file, "missing"]);
          continue;
        }
        throw error;
      }
      if (stat?.isDirectory()) queue.push(file);
    }
  }
}
try {
  const { nodeModules, files = [], context = {} } = workerData;
  add(context);
  metadata(nodeModules);
  for (const name of list(nodeModules)) {
    const bases = name.startsWith("@")
      ? list(path.join(nodeModules, name)).map((n) => path.join(name, n))
      : [name];
    for (const base of bases) {
      const root = path.join(nodeModules, base);
      let bytes;
      try {
        bytes = smallFile(path.join(root, "package.json"), 65536);
      } catch (error) {
        if (remaining < 0 || error.code === "STATIC_INPUT_BUDGET") throw error;
        add([root, "unreadable-manifest", error.code || error.message]);
        continue;
      }
      if (!bytes) continue;
      let manifest;
      try {
        manifest = JSON.parse(bytes);
      } catch {
        continue;
      }
      if (
        !manifest ||
        typeof manifest !== "object" ||
        Array.isArray(manifest) ||
        !("dsh" in manifest) ||
        String(manifest.name || "").startsWith("@deepseek-ai/")
      )
        continue;
      manifests.push({ name: manifest.name });
      const inject = manifest.inject;
      for (const name of Array.isArray(inject)
        ? inject
        : inject && typeof inject === "object"
          ? [
              ...(Array.isArray(inject.required) ? inject.required : []),
              ...(Array.isArray(inject.optional) ? inject.optional : []),
            ]
          : [])
        if (typeof name === "string") services.add(name);
      walk(root, manifest);
    }
  }
  // Extraction supplies the exact opaque paths it tried. A matching observation
  // binds the cached report and review context to the actual target. Creation,
  // removal or retargeting during or after extraction invalidates publication.
  let resolutionChanged = false;
  for (const [root, file, expected] of workerData.resolutionInputs || []) {
    check();
    if (--remaining < 0) throw Error("缓存身份文件预算超限，等待后续刷新");
    if (!file.startsWith(root + path.sep) && file !== root)
      throw Error("Module resolution path outside package");
    let target = null;
    try {
      const real = fs.realpathSync(file);
      if (real.startsWith(root + path.sep) && fs.statSync(real).isFile())
        target = real;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) throw error;
    }
    add([file, "resolved", target]);
    if (target !== expected) resolutionChanged = true;
  }
  for (const file of files.filter(Boolean)) {
    const bytes = smallFile(file, 8 * 1024 * 1024);
    if (bytes && path.basename(file).startsWith("dsh-api-catalog"))
      try {
        for (const name of Object.keys(JSON.parse(bytes).host || {}))
          services.add(name);
      } catch {}
  }
  parentPort.postMessage({
    ok: true,
    value: {
      digest: hash.digest("hex"),
      resolutionChanged,
      services: [...services].sort(),
      manifests,
    },
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
