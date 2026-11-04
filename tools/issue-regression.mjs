#!/usr/bin/env node
/** Mandatory issue regression entry. Fetches only the pinned official host source when absent. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.resolve(process.argv[2] || "tmp/issue-regression");
fs.mkdirSync(output, { recursive: true });
const review = JSON.parse(
  fs.readFileSync(path.join(root, "rules/dsh-0.2.1-rc.5-review.json")),
);
const { sourceArchiveUrl, sourceArchiveSha256 } = review.upstream;
const archive = path.resolve(
  process.env.DSC_HOST_SOURCE_ARCHIVE || path.join(output, "rc5-source.tgz"),
);
const limit = 64 * 1024 * 1024;
let download;
try {
  if (!fs.existsSync(archive)) {
    const response = await fetch(sourceArchiveUrl, {
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok)
      throw Error("Official host source unavailable: " + response.status);
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > limit) throw Error("Official host source exceeds 64 MiB");
      chunks.push(chunk);
    }
    download = Buffer.concat(chunks);
  }
  const bytes =
    download ||
    (() => {
      const st = fs.lstatSync(archive);
      if (!st.isFile() || st.size > limit)
        throw Error("Expected bounded regular host source archive");
      return fs.readFileSync(archive);
    })();
  if (createHash("sha256").update(bytes).digest("hex") !== sourceArchiveSha256)
    throw Error("Official host source SHA256 mismatch");
  if (download) {
    fs.mkdirSync(path.dirname(archive), { recursive: true });
    fs.writeFileSync(archive, download, { flag: "wx" });
  }
  const files = [
    "identity-runtime-state",
    "cache",
    "input-lifecycle",
    "profile-target",
    "tool-json",
    "tool-host-validator",
    "catalog-signature-omissions",
    "verdict-regressions",
  ].map((name) => "test/" + name + ".test.mjs");
  const tap = path.join(output, "issues.tap"),
    stderr = path.join(output, "issues.stderr");
  const out = fs.openSync(tap, "w"),
    err = fs.openSync(stderr, "w");
  let run;
  try {
    run = spawnSync(
      process.execPath,
      ["--test", "--test-reporter=tap", ...files],
      {
        cwd: root,
        env: { ...process.env, DSC_HOST_SOURCE_ARCHIVE: archive },
        stdio: ["ignore", out, err],
        timeout: 180000,
      },
    );
  } finally {
    fs.closeSync(out);
    fs.closeSync(err);
  }
  const log = fs.readFileSync(tap, "utf8");
  const count = (name) =>
    Number(new RegExp("^# " + name + " (\\d+)$", "m").exec(log)?.[1]);
  const summary = {
    ok:
      run.status === 0 &&
      count("tests") > 0 &&
      count("fail") === 0 &&
      count("skipped") === 0,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    sourceArchiveSha256,
    files,
    tests: count("tests"),
    pass: count("pass"),
    skip: count("skipped"),
    fail: count("fail"),
    scope:
      "Mandatory issue regressions including original official JSON/schema validator; not real-host or Windows acceptance.",
  };
  fs.writeFileSync(
    path.join(output, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(JSON.stringify(summary));
  if (!summary.ok)
    throw Error("Issue regressions failed or skipped; inspect " + output);
} catch (error) {
  fs.writeFileSync(
    path.join(output, "summary.json"),
    JSON.stringify(
      { ok: false, error: error.message, sourceArchiveSha256 },
      null,
      2,
    ) + "\n",
  );
  console.error(error.message);
  process.exitCode = 1;
}
