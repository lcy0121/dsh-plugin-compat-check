/** Immutable-by-copy inputs for the offline batch runner; never import target code. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

export const SAMPLE_LIMITS = Object.freeze({
  entries: 4096,
  depth: 32,
  fileBytes: 2 * 1024 * 1024,
  bytes: 16 * 1024 * 1024,
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
export function readRegular(file, maxBytes, code = "unsafe-sample") {
  let fd;
  try {
    const before = fs.lstatSync(file);
    if (!before.isFile()) throw new SampleError(code);
    if (before.size > maxBytes) throw new SampleError("sample-budget-exceeded");
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || !stable(before, opened))
      throw new SampleError(code);
    const bytes = Buffer.alloc(before.size + 1);
    let length = 0,
      n;
    while (
      length < bytes.length &&
      (n = fs.readSync(fd, bytes, length, bytes.length - length, null))
    )
      length += n;
    if (
      length !== before.size ||
      !stable(before, fs.fstatSync(fd)) ||
      !stable(before, fs.lstatSync(file))
    )
      throw new SampleError(code);
    return bytes.subarray(0, length);
  } catch (error) {
    if (error instanceof SampleError) throw error;
    throw new SampleError(code);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** SHA-256 of UTF-8 JSON sorted [POSIX path, byte length, file SHA-256] rows. */
export function snapshotPackage(source, destination) {
  const root = path.resolve(source);
  if (fs.realpathSync(root) !== root || !fs.lstatSync(root).isDirectory())
    throw new SampleError("unsafe-sample");
  const rows = [];
  let entries = 0,
    totalBytes = 0;
  const walk = (relative, depth) => {
    if (depth > SAMPLE_LIMITS.depth)
      throw new SampleError("sample-budget-exceeded");
    const dir = path.join(root, relative);
    const before = fs.lstatSync(dir);
    if (!before.isDirectory() || fs.realpathSync(dir) !== dir)
      throw new SampleError("unsafe-sample");
    fs.mkdirSync(path.join(destination, relative), {
      recursive: true,
      mode: 0o700,
    });
    const names = fs.readdirSync(dir).sort();
    if (entries + names.length > SAMPLE_LIMITS.entries)
      throw new SampleError("sample-budget-exceeded");
    entries += names.length;
    for (const name of names) {
      const rel = relative ? `${relative}/${name}` : name;
      const full = path.join(root, rel);
      const stat = fs.lstatSync(full);
      if (stat.isDirectory()) walk(rel, depth + 1);
      else {
        if (!stat.isFile() || fs.realpathSync(full) !== full)
          throw new SampleError("unsafe-sample");
        if (
          stat.size > SAMPLE_LIMITS.fileBytes ||
          totalBytes + stat.size > SAMPLE_LIMITS.bytes
        )
          throw new SampleError("sample-budget-exceeded");
        const bytes = readRegular(full, SAMPLE_LIMITS.fileBytes);
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
      JSON.stringify(names) !== JSON.stringify(fs.readdirSync(dir).sort())
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
