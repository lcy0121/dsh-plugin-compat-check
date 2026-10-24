import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parentPort, workerData } from "node:worker_threads";
import {
  readStaticDirectory,
  readStaticFile,
  lowerInputLimits,
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
function metadata(file) {
  check();
  if (--remaining < 0) throw Error("缓存身份文件预算超限，等待后续刷新");
  const stat = fs.statSync(file);
  add([
    file,
    fs.realpathSync(file),
    stat.size,
    stat.mtimeMs,
    stat.ctimeMs,
    stat.ino,
    stat.mode,
  ]);
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

function walk(root) {
  const seen = new Set(),
    queue = [root],
    canonical = fs.realpathSync(root);
  while (queue.length) {
    if (--directories < 0) throw Error("缓存身份目录预算超限，等待后续刷新");
    const dir = queue.pop(),
      real = fs.realpathSync(dir);
    if (
      seen.has(real) ||
      (real !== canonical && !real.startsWith(canonical + path.sep))
    )
      continue;
    seen.add(real);
    for (const entry of list(dir)) {
      const file = path.join(dir, entry);
      let stat;
      try {
        stat = metadata(file);
      } catch (error) {
        if (error.code === "ENOENT") {
          add([file, "missing"]);
          continue;
        }
        throw error;
      }
      if (stat.isDirectory()) queue.push(file);
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
      walk(root);
    }
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
      services: [...services].sort(),
      manifests,
    },
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
