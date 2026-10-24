/** Trusted data verification; execute in the supervised worker for wall-clock bounds. */
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readStaticFile } from "../lib/static-input.mjs";
import { runWorkerTask } from "../lib/worker-analysis.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function verifyFunctionalArtifact(file, expected) {
  if (typeof file !== "string" || !file.endsWith(".tgz"))
    throw Error("Expected bounded regular local .tgz artifact");
  const bytes = readStaticFile(file, 32 * 1024 * 1024);
  if (hash(bytes) !== expected.sha256)
    throw Error("Artifact SHA256 differs from declaration");
  const tar = gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 });
  // Only ordinary USTAR regular files/directories are supported. Do not let
  // installer PAX/GNU path rewriting disagree with the identity inspected here.
  if (tar.length < 1024 || tar.length % 512)
    throw Error("Invalid tar block alignment");
  let pkg = null,
    terminated = false;
  const paths = new Set();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const head = tar.subarray(offset, offset + 512);
    if (head.every((b) => b === 0)) {
      if (
        offset + 1024 > tar.length ||
        !tar.subarray(offset).every((b) => b === 0)
      )
        throw Error("Invalid tar termination or concatenated artifact");
      terminated = true;
      break;
    }
    const str = (a, b) =>
      head.subarray(a, b).toString("utf8").replace(/\0.*$/s, "");
    const checksumText = str(148, 156).trim();
    const checksum = head.reduce(
      (sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (
      !/^[0-7]+$/.test(checksumText) ||
      parseInt(checksumText, 8) !== checksum
    )
      throw Error("Invalid tar header checksum");
    if (
      head.subarray(257, 263).toString() !== "ustar\0" ||
      head.subarray(263, 265).toString() !== "00"
    )
      throw Error("Unsupported tar format; ordinary npm USTAR files only");
    const type = str(156, 157);
    if (!["", "0", "5"].includes(type) || str(157, 257))
      throw Error(
        "Unsupported tar entry: extensions, links and special files are refused",
      );
    const name = (str(345, 500) ? str(345, 500) + "/" : "") + str(0, 100);
    const normalized = type === "5" ? name.replace(/\/$/, "") : name;
    if (
      !/^[A-Za-z0-9@._+ /-]+$/.test(name) ||
      !normalized.startsWith("package/") ||
      normalized.split("/").some((p) => !p || p === "." || p === "..") ||
      (type !== "5" && name.endsWith("/"))
    )
      throw Error("Unsafe or unsupported tar path");
    if (paths.has(normalized)) throw Error("Duplicate tar path");
    paths.add(normalized);
    const sizeText = str(124, 136).trim();
    if (!/^[0-7]+$/.test(sizeText)) throw Error("Invalid tar size");
    const size = parseInt(sizeText, 8);
    if (
      !Number.isSafeInteger(size) ||
      offset + 512 + Math.ceil(size / 512) * 512 > tar.length ||
      (type === "5" && size !== 0)
    )
      throw Error("Truncated or invalid tar artifact");
    if (name === "package/package.json") {
      if (pkg || !["", "0"].includes(type) || size > 65536)
        throw Error("Unsafe or duplicate package identity");
      pkg = JSON.parse(
        tar.subarray(offset + 512, offset + 512 + size).toString("utf8"),
      );
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!terminated) throw Error("Missing tar termination");
  if (!pkg || pkg.name !== expected.name || pkg.version !== expected.version)
    throw Error("Artifact package name/version differs from declaration");
  return bytes;
}

export async function verifyFunctionalArtifactInWorker(
  file,
  expected,
  { timeoutMs = 10000, signal } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000)
    throw Error("Invalid artifact verification budget");
  const bytes = await runWorkerTask(
    new URL("./functional-artifact-worker.mjs", import.meta.url),
    { file, expected },
    { timeoutMs, signal },
  );
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
