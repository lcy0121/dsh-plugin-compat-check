#!/usr/bin/env node
/** Offline provenance and API diff only. Never grants compatibility support. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import semver from "semver";

const SOURCES = {
  host: "dsh/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js",
  client:
    "dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js",
};
const BOOT = "dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json";
const JSON_LIMIT = 2 * 1024 * 1024;
const HEADER_LIMIT = 8 * 1024 * 1024;
const ENTRY_LIMIT = 8 * 1024 * 1024;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const requireThat = (condition, message) => {
  if (!condition) throw new Error(message);
};
const sameStat = (a, b) =>
  ["dev", "ino", "size", "mtimeMs", "ctimeMs"].every(
    (key) => a[key] === b[key],
  );

function openRegular(file, limit) {
  requireThat(
    fs.lstatSync(file).isFile(),
    `${file}: expected a regular file (no symlinks)`,
  );
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      (fs.constants.O_NOFOLLOW || 0) |
      (fs.constants.O_NONBLOCK || 0),
  );
  try {
    const stat = fs.fstatSync(fd);
    requireThat(
      stat.isFile() && stat.size <= limit,
      `${file}: regular file exceeds size limit`,
    );
    return { fd, stat };
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function readJson(file) {
  const { fd, stat } = openRegular(file, JSON_LIMIT);
  try {
    const bytes = Buffer.alloc(stat.size);
    requireThat(
      fs.readSync(fd, bytes, 0, bytes.length, 0) === bytes.length,
      `${file}: truncated read`,
    );
    requireThat(
      sameStat(stat, fs.fstatSync(fd)) && sameStat(stat, fs.statSync(file)),
      `${file}: changed while reading`,
    );
    return {
      value: JSON.parse(bytes.toString("utf8")),
      sha256: sha(bytes),
      path: path.resolve(file),
    };
  } finally {
    fs.closeSync(fd);
  }
}

function validateCatalog(catalog, provenance) {
  requireThat(record(catalog), "Invalid catalogue object");
  if (provenance) {
    requireThat(
      typeof catalog._dshVersion === "string" &&
        semver.valid(catalog._dshVersion) === catalog._dshVersion,
      "Candidate requires an exact valid _dshVersion",
    );
    requireThat(
      record(catalog._source) && record(catalog._sourceSha256),
      "Candidate requires _source and _sourceSha256",
    );
    for (const side of ["host", "client"]) {
      requireThat(
        catalog._source[side] === SOURCES[side],
        `${side}: unexpected source path`,
      );
      requireThat(
        typeof catalog._sourceSha256[side] === "string" &&
          /^[a-f0-9]{64}$/.test(catalog._sourceSha256[side]),
        `${side}: invalid source SHA-256`,
      );
    }
  }
  const normalized = {};
  for (const side of ["host", "client"]) {
    requireThat(
      record(catalog[side]) && Object.keys(catalog[side]).length > 0,
      `${side}: expected nonempty service map`,
    );
    normalized[side] = Object.fromEntries(
      Object.keys(catalog[side])
        .sort()
        .map((service) => {
          const value = catalog[side][service];
          requireThat(
            /^[A-Za-z][\w.]*$/.test(service) &&
              record(value) &&
              Object.keys(value).length === 1 &&
              Array.isArray(value.methods),
            `${side}.${service}: invalid service shape`,
          );
          const methods = value.methods;
          requireThat(
            methods.every(
              (method) =>
                typeof method === "string" && /^[A-Za-z_$][\w$]*$/.test(method),
            ) && new Set(methods).size === methods.length,
            `${side}.${service}: invalid or duplicate method names`,
          );
          return [service, { methods: [...methods].sort() }];
        }),
    );
  }
  return normalized;
}

// Bound every entry the Python extractor reads before starting it. The extractor
// also checks packed entries, byte boundaries, and optional ASAR integrity hashes.
function inspectAsar(file) {
  const { fd, stat } = openRegular(file, 4 * 1024 ** 3);
  try {
    const prefix = Buffer.alloc(16);
    requireThat(
      fs.readSync(fd, prefix, 0, 16, 0) === 16,
      "Truncated ASAR header",
    );
    const headerSize = prefix.readUInt32LE(4),
      jsonSize = prefix.readUInt32LE(12);
    requireThat(
      prefix.readUInt32LE(0) === 4 &&
        headerSize >= 8 &&
        headerSize <= HEADER_LIMIT &&
        jsonSize <= headerSize - 8 &&
        8 + headerSize <= stat.size,
      "Invalid or oversized ASAR header",
    );
    const bytes = Buffer.alloc(jsonSize);
    requireThat(
      fs.readSync(fd, bytes, 0, jsonSize, 16) === jsonSize,
      "Truncated ASAR directory",
    );
    const header = JSON.parse(bytes.toString("utf8"));
    for (const logical of [...Object.values(SOURCES), BOOT]) {
      let node = header;
      for (const part of logical.split("/")) {
        requireThat(
          record(node) && record(node.files) && Object.hasOwn(node.files, part),
          `Missing ASAR source ${logical}`,
        );
        node = node.files[part];
      }
      requireThat(
        record(node) &&
          !node.unpacked &&
          !Object.hasOwn(node, "link") &&
          !Object.hasOwn(node, "files"),
        `Unsupported ASAR source ${logical}`,
      );
      const offset =
        typeof node.offset === "string" && /^\d+$/.test(node.offset)
          ? Number(node.offset)
          : NaN;
      const size = node.size;
      requireThat(
        Number.isSafeInteger(offset) &&
          offset >= 0 &&
          Number.isSafeInteger(size) &&
          size >= 0 &&
          size <= ENTRY_LIMIT &&
          8 + headerSize + offset + size <= stat.size,
        `Invalid, oversized or out-of-bounds ASAR source ${logical}`,
      );
    }
    requireThat(
      sameStat(stat, fs.fstatSync(fd)),
      "ASAR changed while inspecting",
    );
    return stat;
  } finally {
    fs.closeSync(fd);
  }
}

function diffSide(before, candidate) {
  const oldNames = Object.keys(before),
    newNames = Object.keys(candidate);
  const methodsAdded = [],
    methodsRemoved = [];
  for (const service of [...new Set([...oldNames, ...newNames])].sort()) {
    const oldMethods = before[service]?.methods || [],
      newMethods = candidate[service]?.methods || [];
    for (const method of newMethods)
      if (!oldMethods.includes(method)) methodsAdded.push({ service, method });
    for (const method of oldMethods)
      if (!newMethods.includes(method))
        methodsRemoved.push({ service, method });
  }
  return {
    servicesAdded: newNames.filter((name) => !Object.hasOwn(before, name)),
    servicesRemoved: oldNames.filter((name) => !Object.hasOwn(candidate, name)),
    methodsAdded,
    methodsRemoved,
  };
}

function review(options) {
  const before = readJson(options.before),
    candidate = readJson(options.candidate);
  const oldApi = validateCatalog(before.value, false),
    newApi = validateCatalog(candidate.value, true);
  const asar = path.resolve(options.asar),
    original = inspectAsar(asar);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-catalog-review-"));
  try {
    fs.chmodSync(scratch, 0o700);
    const extractedPath = path.join(scratch, "extracted.json");
    const extractor = fileURLToPath(
      new URL("./catalog/extract-host-api.py", import.meta.url),
    );
    const child = spawnSync("python3", ["-I", extractor, asar, extractedPath], {
      encoding: "utf8",
      timeout: 10000,
      killSignal: "SIGKILL",
      maxBuffer: 1024 * 1024,
    });
    requireThat(
      !child.error && child.status === 0,
      `ASAR extraction failed: ${child.error?.code || child.signal || (child.stderr || child.stdout || `exit ${child.status}`).trim().slice(0, 1500)}`,
    );
    requireThat(
      sameStat(original, fs.lstatSync(asar)),
      "ASAR changed during extraction",
    );
    const actual = readJson(extractedPath).value;
    const actualApi = validateCatalog(actual, true);
    requireThat(
      candidate.value._dshVersion === actual._dshVersion,
      "Candidate DSH version does not match ASAR",
    );
    for (const side of ["host", "client"]) {
      requireThat(
        candidate.value._sourceSha256[side] === actual._sourceSha256[side],
        `${side}: candidate source SHA-256 does not match ASAR`,
      );
      requireThat(
        JSON.stringify(newApi[side]) === JSON.stringify(actualApi[side]),
        `${side}: candidate API contents do not match ASAR extraction`,
      );
    }
    const identity = ({ value, ...rest }) => ({
      ...rest,
      dshVersion: value._dshVersion ?? null,
    });
    return {
      kind: "plugin-compat-check/catalog-review",
      schemaVersion: 1,
      sourceVerified: true,
      before: identity(before),
      candidate: identity(candidate),
      source: { asar, paths: actual._source, sha256: actual._sourceSha256 },
      diff: {
        host: diffSide(oldApi.host, newApi.host),
        client: diffSide(oldApi.client, newApi.client),
      },
      semanticReview: "pending",
      integrationAcceptance: "pending",
      certification: "not-granted",
    };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2),
    options = {},
    json = args.includes("--json");
  try {
    for (let i = 0; i < args.length; i++) {
      const flag = args[i];
      if (flag === "--json") {
        requireThat(!options.json, "Duplicate --json");
        options.json = true;
        continue;
      }
      requireThat(
        ["--before", "--candidate", "--asar"].includes(flag),
        `Unknown argument: ${flag}`,
      );
      const key = flag.slice(2);
      requireThat(
        !options[key] && args[i + 1] && !args[i + 1].startsWith("--"),
        `Missing or duplicate ${flag}`,
      );
      options[key] = args[++i];
    }
    requireThat(
      options.before && options.candidate && options.asar,
      "Usage: node tools/catalog-review.mjs --before <catalog.json> --candidate <candidate.json> --asar <app.asar> [--json]",
    );
    const result = review(options);
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `Source verified: ${result.candidate.dshVersion}; candidate SHA-256 ${result.candidate.sha256}`,
      );
      console.log(JSON.stringify(result.diff, null, 2));
      console.log(
        "Semantic review: pending; integration acceptance: pending; compatibility certification: not granted. Exit 0 verifies provenance and diff only.",
      );
    }
  } catch (error) {
    const result = {
      kind: "plugin-compat-check/catalog-review",
      schemaVersion: 1,
      sourceVerified: false,
      error: String(error.message),
      certification: "not-granted",
    };
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.error(`Cannot review catalogue: ${result.error}`);
    process.exitCode = 3;
  }
}
main();
