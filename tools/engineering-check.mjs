#!/usr/bin/env node
/** Reproducible engineering scenarios; all input/state belongs to this run. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { command } from "../lib/probe-runner.mjs";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-engineering-"));
const cancellation = new AbortController();
let interrupted = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    interrupted = true;
    cancellation.abort();
  });
try {
  const log = path.join(dir, "metrics.jsonl");
  const run = await command(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      path.join(root, "test/resource-boundaries.test.mjs"),
      path.join(root, "test/baseline-contention.test.mjs"),
    ],
    {
      env: {
        ...process.env,
        DSC_ENGINEERING_LOG: log,
        DSC_ENGINEERING_LARGE: "1",
      },
      timeoutMs: 60000,
      signal: cancellation.signal,
    },
  );
  const metrics = fs.existsSync(log)
    ? fs
        .readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((s) => JSON.parse(s))
    : [];
  const ok = run.code === 0 && metrics.length === 6;
  if (!ok) process.stderr.write(run.error || run.output);
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        kind: "plugin-compat-check/engineering",
        ok,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        metrics,
        scope:
          "Owned synthetic inputs only. Heap pressure covers a controlled 32 MiB policy and the actual extractor at the production 512/64 MiB and 10-second defaults. Not a whole-process RSS limit or platform certification.",
      },
      null,
      2,
    ),
  );
  if (!ok) process.exitCode = 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  if (interrupted) process.exitCode = 130;
}
