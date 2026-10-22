#!/usr/bin/env node
/** Repository-only opt-in executor; never staged into the npm plugin. */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import {
  FUNCTIONAL_HEALTH_KIND,
  FUNCTIONAL_HEALTH_LIMITS as LIMITS,
  validateFunctionalManifest,
} from "../lib/functional-health-contract.mjs";

function originUrl(origin) {
  const u = new URL(origin);
  if (
    u.protocol !== "http:" ||
    u.hostname !== "127.0.0.1" ||
    !u.port ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("Expected owned loopback HTTP origin");
  return u;
}
function readHttp(url, { signal, token }) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    const req = http.get(
      url,
      { signal, headers: token ? { Authorization: "Bearer " + token } : {} },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          reject(Error("Redirect refused"));
          return;
        }
        res.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > LIMITS.responseBytes)
            req.destroy(Error("Response exceeds byte budget"));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes,
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(LIMITS.requestMs, () =>
      req.destroy(Error("HTTP request timed out")),
    );
    req.on("error", reject);
  });
}
function pointerValue(value, pointer) {
  for (const part of pointer === "" ? [] : pointer.slice(1).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, key)
    )
      return { found: false };
    value = value[key];
  }
  return { found: true, value };
}
export async function executeFunctionalChecks(
  checks,
  { origin, token = null, signal, dom = null } = {},
) {
  originUrl(origin);
  const manifest = validateFunctionalManifest({
    schemaVersion: 1,
    artifact: {
      name: "health-check",
      version: "1.0.0",
      sha256: "0".repeat(64),
    },
    dshVersion: "0.0.0",
    checks,
  });
  if (!manifest.valid) throw Error(manifest.errors.join("; "));
  const results = [];
  for (const check of checks) {
    const started = Date.now();
    try {
      signal?.throwIfAborted();
      let passed, evidence;
      if (check.type === "http") {
        const response = await readHttp(new URL(check.path, origin), {
          token,
          signal: AbortSignal.any([
            ...(signal ? [signal] : []),
            AbortSignal.timeout(LIMITS.requestMs),
          ]),
        });
        passed = response.status === check.status;
        evidence = {
          httpStatus: response.status,
          responseBytes: response.bytes,
        };
        if (check.json) {
          let matches = false;
          try {
            const found = pointerValue(
              JSON.parse(response.body),
              check.json.pointer,
            );
            matches = found.found && Object.is(found.value, check.json.equals);
          } catch {
            /* Non-JSON is a failed declared JSON expectation, not a tool failure. */
          }
          evidence.jsonMatched = matches;
          passed &&= matches;
        }
      } else {
        if (!dom) throw Error("Owned Chrome required for DOM check");
        const count = await dom.count(check);
        passed = count >= check.minCount && count <= check.maxCount;
        evidence = { count };
      }
      results.push({
        id: check.id,
        type: check.type,
        status: passed ? "pass" : "failed",
        evidence: { ...evidence, elapsedMs: Date.now() - started },
      });
    } catch (error) {
      results.push({
        id: check.id,
        type: check.type,
        status: "error",
        evidence: {
          error:
            error.name === "AbortError"
              ? "Cancelled or timed out"
              : String(error.message).slice(0, 256),
          elapsedMs: Date.now() - started,
        },
      });
    }
  }
  return results;
}
function readManifestFile(file) {
  const before = fs.lstatSync(file);
  if (before.isSymbolicLink() || !before.isFile())
    throw Error(
      "Manifest must be a regular file; symlinks and special files are refused",
    );
  if (before.size > 65536) throw Error("Manifest exceeds byte budget");
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY |
      (fs.constants.O_NONBLOCK || 0) |
      (fs.constants.O_NOFOLLOW || 0),
  );
  try {
    const opened = fs.fstatSync(fd);
    if (
      !opened.isFile() ||
      opened.dev !== before.dev ||
      opened.ino !== before.ino
    )
      throw Error("Manifest regular file identity changed while opening");
    if (opened.size > 65536) throw Error("Manifest exceeds byte budget");
    const buffer = Buffer.alloc(65537);
    let used = 0;
    while (used < buffer.length) {
      const count = fs.readSync(fd, buffer, used, buffer.length - used, null);
      if (!count) break;
      used += count;
    }
    if (used > 65536) throw Error("Manifest exceeds byte budget");
    return buffer.subarray(0, used);
  } finally {
    fs.closeSync(fd);
  }
}

export async function functionalHealthMain(args = process.argv.slice(2)) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--run") {
      if (options.run) throw Error("Duplicate --run");
      options.run = true;
    } else if (
      ["--manifest", "--artifact", "--out", "--chrome"].includes(key)
    ) {
      if (options[key] || !args[i + 1] || args[i + 1].startsWith("--"))
        throw Error("Missing or duplicate " + key);
      options[key] = args[++i];
    } else throw Error("Unknown option " + key);
  }
  if (!options["--manifest"] || !options["--artifact"])
    throw Error(
      "Required: --manifest <json> --artifact <local.tgz> [--run --out <new.json>]",
    );
  const file = readManifestFile(options["--manifest"]);
  const manifest = JSON.parse(file.toString("utf8"));
  const validated = validateFunctionalManifest(manifest);
  if (!validated.valid) throw Error(validated.errors.join("; "));
  if (!options.run)
    return {
      schemaVersion: 1,
      kind: FUNCTIONAL_HEALTH_KIND,
      status: "reviewed",
      manifest,
      plan: [
        "Verify local tarball SHA256 and package name/version",
        "Require exact installed DSH version",
        "Initialize private web profile, install selected artifact, start owned host",
        "Run bounded same-origin GET / read-only DOM checks and clean owned processes",
      ],
      limits: LIMITS,
      limitations: [
        "Review does not execute, install, contact DSH, or access the network",
        "Private profile is not an OS sandbox",
        "Artifacts require ordinary bounded USTAR files; PAX/GNU extensions, links, unsafe or duplicate paths and concatenated archives are refused",
        "Passing declared checks does not certify complete business functionality or compatibility",
      ],
    };
  if (!options["--out"]) throw Error("--run requires --out <new.json>");
  const { runFunctionalHealth } = await import(
    "./functional-health-runtime.mjs"
  );
  return runFunctionalHealth({
    manifest,
    artifact: path.resolve(options["--artifact"]),
    out: path.resolve(options["--out"]),
    chromePath: options["--chrome"],
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  functionalHealthMain()
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (result.status === "error") process.exitCode = 3;
      else if (result.status === "tested-failed") process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write(error.message + "\n");
      process.exitCode = 3;
    });
