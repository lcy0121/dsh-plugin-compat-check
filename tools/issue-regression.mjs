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
const archiveSpecs = [
  ["rc5", "DSC_HOST_SOURCE_ARCHIVE", "0.2.1-rc.5"],
  ["rc22", "DSC_RC22_SOURCE_ARCHIVE", "0.2.2-rc.1"],
  ["rc22-2", "DSC_RC22_2_SOURCE_ARCHIVE", "0.2.2-rc.2"],
  ["rc22-3", "DSC_RC22_3_SOURCE_ARCHIVE", "0.2.2-rc.3"],
];
const sourceArchives = [],
  archiveEnv = {};
try {
  for (const [name, env, version] of archiveSpecs) {
    const review = JSON.parse(
      fs.readFileSync(path.join(root, `rules/dsh-${version}-review.json`)),
    );
    const { sourceArchiveUrl, sourceArchiveSha256 } = review.upstream;
    const archive = path.resolve(
      process.env[env] || path.join(output, name + "-source.tgz"),
    );
    const limit = 64 * 1024 * 1024;
    let bytes,
      download = false;
    if (fs.existsSync(archive)) {
      const st = fs.lstatSync(archive);
      if (!st.isFile() || st.size > limit)
        throw Error("Expected bounded regular host source archive: " + version);
      bytes = fs.readFileSync(archive);
    } else {
      const response = await fetch(sourceArchiveUrl, {
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok)
        throw Error(
          "Official host source unavailable: " +
            version +
            ": " +
            response.status,
        );
      const chunks = [];
      let count = 0;
      for await (const chunk of response.body) {
        count += chunk.length;
        if (count > limit)
          throw Error("Official host source exceeds 64 MiB: " + version);
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
      download = true;
    }
    if (
      createHash("sha256").update(bytes).digest("hex") !== sourceArchiveSha256
    )
      throw Error("Official host source SHA256 mismatch: " + version);
    if (download) {
      fs.mkdirSync(path.dirname(archive), { recursive: true });
      fs.writeFileSync(archive, bytes, { flag: "wx" });
    }
    archiveEnv[env] = archive;
    sourceArchives.push({ version, sourceArchiveSha256 });
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
        env: {
          ...process.env,
          ...archiveEnv,
        },
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
    sourceArchiveSha256: sourceArchives[0].sourceArchiveSha256,
    rc22SourceArchiveSha256: sourceArchives[1].sourceArchiveSha256,
    sourceArchives,
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
      { ok: false, error: error.message, sourceArchives },
      null,
      2,
    ) + "\n",
  );
  console.error(error.message);
  process.exitCode = 1;
}
