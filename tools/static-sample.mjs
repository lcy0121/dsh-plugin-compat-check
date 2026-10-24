/** Immutable-by-copy inputs for the offline batch runner; never import target code. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  readStaticDirectory,
  readStaticFile,
  lowerInputLimits,
} from "../lib/static-input.mjs";

export const SAMPLE_LIMITS = Object.freeze({
  entries: 4096,
  depth: 32,
  fileBytes: 2 * 1024 * 1024,
  bytes: 16 * 1024 * 1024,
  timeMs: 10000,
});
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export class SampleError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const stable = (a, b) =>
  ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every((k) => a[k] === b[k]);

/** Bound reads before allocation, reject links/devices/FIFOs, detect ordinary concurrent writes. */
export function readRegular(
  file,
  maxBytes,
  code = "unsafe-sample",
  check = () => {},
) {
  try {
    return readStaticFile(file, maxBytes, check);
  } catch (error) {
    if (error instanceof SampleError) throw error;
    throw new SampleError(
      error.code === "STATIC_INPUT_BUDGET" ? "sample-budget-exceeded" : code,
    );
  }
}

/** SHA-256 of UTF-8 JSON sorted [POSIX path, byte length, file SHA-256] rows. */
export function snapshotPackage(source, destination, overrides = {}) {
  const limits = lowerInputLimits(SAMPLE_LIMITS, overrides),
    started = Date.now();
  const check = () => {
    if (Date.now() - started > limits.timeMs)
      throw new SampleError("sample-budget-exceeded");
  };
  const list = (dir, max) => {
    try {
      return readStaticDirectory(dir, max, check);
    } catch (error) {
      if (error.code === "STATIC_INPUT_BUDGET")
        throw new SampleError("sample-budget-exceeded");
      throw error;
    }
  };
  const root = path.resolve(source);
  if (fs.realpathSync(root) !== root || !fs.lstatSync(root).isDirectory())
    throw new SampleError("unsafe-sample");
  const rows = [];
  let entries = 0,
    totalBytes = 0;
  const walk = (relative, depth) => {
    if (depth > limits.depth) throw new SampleError("sample-budget-exceeded");
    const dir = path.join(root, relative);
    const before = fs.lstatSync(dir);
    if (!before.isDirectory() || fs.realpathSync(dir) !== dir)
      throw new SampleError("unsafe-sample");
    fs.mkdirSync(path.join(destination, relative), {
      recursive: true,
      mode: 0o700,
    });
    check();
    const names = list(dir, limits.entries - entries);
    if (entries + names.length > limits.entries)
      throw new SampleError("sample-budget-exceeded");
    entries += names.length;
    for (const name of names) {
      check();
      const rel = relative ? `${relative}/${name}` : name;
      const full = path.join(root, rel);
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) walk(rel, depth + 1);
      else {
        if (!stat.isFile() || fs.realpathSync(full) !== full)
          throw new SampleError("unsafe-sample");
        if (
          stat.size > limits.fileBytes ||
          totalBytes + stat.size > limits.bytes
        )
          throw new SampleError("sample-budget-exceeded");
        const bytes = readRegular(
          full,
          limits.fileBytes,
          "unsafe-sample",
          check,
        );
        totalBytes += bytes.length;
        fs.writeFileSync(path.join(destination, rel), bytes, {
          flag: "wx",
          mode: 0o600,
        });
        rows.push([rel, bytes.length, sha256(bytes)]);
      }
    }
    if (
      !stable(before, fs.lstatSync(dir)) ||
      JSON.stringify(names) !== JSON.stringify(list(dir, names.length))
    )
      throw new SampleError("unsafe-sample");
  };
  walk("", 0);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    sha256: sha256(JSON.stringify(rows)),
    files: rows.length,
    bytes: totalBytes,
  };
}
