#!/usr/bin/env node
/** Regenerate current counts; preserve dated evidence without claiming a rerun. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TOOL_VERSION } from "../lib/version.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export function repositoryCounts(files) {
  const fixtures = files.filter((file) => file.startsWith("test/fixtures/"));
  return {
    total: files.length,
    fixtures: fixtures.length,
    other: files.length - fixtures.length,
  };
}
export function successfulTestCount(log) {
  const tests = Number(/^(?:#|ℹ) tests (\d+)/m.exec(log)?.[1]);
  const failed = Number(/^(?:#|ℹ) fail (\d+)/m.exec(log)?.[1]);
  if (!Number.isSafeInteger(tests) || tests <= 0 || failed !== 0)
    throw new Error("Refusing to record a missing or failing test result");
  return tests;
}
function main(argv) {
  if (argv.length !== 2 || argv[0] !== "--test-summary")
    throw new Error("Supply --test-summary <successful TAP log>");
  const tests = successfulTestCount(fs.readFileSync(argv[1], "utf8"));
  const files = [
    ...new Set(
      execFileSync(
        "git",
        ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
        { cwd: root, encoding: "utf8" },
      )
        .split("\0")
        .filter((file) => file && fs.existsSync(path.join(root, file))),
    ),
  ];
  const previous = JSON.parse(
    fs.readFileSync(path.join(root, "docs/current-state.json"), "utf8"),
  );
  const state = {
    toolVersion: TOOL_VERSION,
    recordedAt: new Date().toISOString(),
    testFiles: fs
      .readdirSync(path.join(root, "test"))
      .filter((file) => file.endsWith(".test.mjs")).length,
    tests,
    repositoryFiles: repositoryCounts(files),
    verification: {
      ...previous.verification,
      platform: process.platform,
      arch: process.arch,
      optionalProfiles: Object.fromEntries(
        ["parityfix", "desktop"].map((name) => [
          name,
          fs.existsSync(
            path.join(os.homedir(), ".dsh/profiles", name, "node_modules"),
          ),
        ]),
      ),
    },
    scope:
      "Default-suite counts from the supplied TAP log; fixtures means test/fixtures/**, other includes support and production files. Optional profiles depend on local inputs. Dated acceptance summaries are preserved, not rerun by this script; detailed history stays in Git.",
  };
  fs.writeFileSync(
    path.join(root, "docs/current-state.json"),
    JSON.stringify(state, null, 2) + "\n",
  );
  console.log(
    `Recorded ${tests} tests / ${state.testFiles} test files / ${files.length} repository files`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main(process.argv.slice(2));
