import { after, test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_VERSION } from "../lib/version.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const CLI = path.join(REPO, "bin/compat-check.mjs");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-upgrade-cli-"));
const home = path.join(temp, "home");
const nm = path.join(temp, "profile", "node_modules");
const plugin = path.join(nm, "upgrade-fixture");
const marker = path.join(temp, "executed");
fs.mkdirSync(home);
writePackageFixture(
  plugin,
  {
    name: "upgrade-fixture",
    version: "1.0.0",
    type: "module",
    engines: { dsh: "0.2.0-rc.2" },
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  },
  `import fs from 'node:fs';
fs.writeFileSync(${JSON.stringify(marker)}, 'executed');
export function apply(ctx) { ctx.logger.info('fixture'); }
`,
  "- name: ./index.js\n",
);
// A normal check attempts to read this adjacent probe. Upgrade mode must ignore it.
fs.writeFileSync(path.join(temp, "profile", "probe-report.json"), "{not-json");
fs.writeFileSync(path.join(temp, "environment-probe.json"), "{also-not-json");
after(() => fs.rmSync(temp, { recursive: true, force: true }));

const base = [
  "--nm",
  nm,
  "--dsh-version",
  "0.2.0-rc.2",
  "--upgrade-to",
  "0.2.1-rc.2",
];
function cli(args) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      HOME: home,
      DSH_HOME: home,
      DSC_PROBE: path.join(temp, "environment-probe.json"),
      DSC_PROBE_REPORT: path.join(temp, "environment-probe.json"),
      DSC_OUT_DIR: path.join(temp, "unexpected-probe-output"),
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { code: result.status, out: result.stdout, err: result.stderr };
}
function body(result) {
  assert.equal(result.err, "");
  const report = JSON.parse(result.out);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.kind, "plugin-compat-check/upgrade-preview");
  assert.equal(report.mode, "static-version-comparison");
  assert.equal(report.exitCode, result.code);
  assert.equal(report.baseline, null);
  assert.equal(report.cache, null);
  return report;
}
function inventory(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const file = path.join(dir, entry.name);
      return entry.isDirectory()
        ? [file, ...inventory(file)]
        : [`${file}:${fs.readFileSync(file).toString("base64")}`];
    })
    .sort();
}

test("upgrade CLI compares the same installed artifact without executing it or reading probes/writing state", () => {
  const before = inventory(temp);
  const result = cli([...base, "--json"]);
  const report = body(result);
  assert.equal(result.code, 1, result.out);
  assert.equal(report.status, "compared");
  assert.equal(report.currentVersion, "0.2.0-rc.2");
  assert.equal(report.targetVersion, "0.2.1-rc.2");
  assert.equal(report.currentReport.summary.broken, 0);
  assert.equal(report.targetReport.summary.partial, 1);
  assert.equal(
    report.changes.added[0].finding.category,
    "declared-incompatible",
  );
  assert.ok(report.changes.added.length > 0);
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(inventory(temp), before);
  assert.equal(cli([...base, "--no-baseline", "--json"]).out, result.out);
});

test("upgrade CLI renders a bounded human comparison with the JSON exit code", () => {
  const result = cli(base);
  assert.equal(result.code, 1, result.out + result.err);
  assert.match(result.out, /0\.2\.0-rc\.2/);
  assert.match(result.out, /0\.2\.1-rc\.2/);
  assert.match(result.out, /静态/);
  assert.match(result.out, /业务/);
});

test("--nm preserves the existing profile-directory shorthand", () => {
  const direct = cli([...base, "--json"]);
  const profile = cli([
    "--nm",
    path.dirname(nm),
    "--dsh-version",
    "0.2.0-rc.2",
    "--upgrade-to",
    "0.2.1-rc.2",
    "--json",
  ]);
  assert.equal(profile.code, direct.code);
  assert.equal(profile.out, direct.out);
});

test("unchanged existing risks remain visible while the preview exit code describes only added/worsened risks", () => {
  const result = cli([
    "--nm",
    nm,
    "--dsh-version",
    "0.2.1-rc.2",
    "--upgrade-to",
    "0.2.1-rc.2",
    "--json",
  ]);
  const report = body(result);
  assert.equal(result.code, 0, result.out);
  assert.equal(report.targetReport.exitCode, 1);
  assert.equal(report.targetReport.summary.partial, 1);
  assert.ok(report.changes.unchanged.length > 0);
  assert.equal(report.summary.added, 0);
  assert.equal(report.summary.worsened, 0);
});

test("unknown or non-exact versions are uncertified and never use a default catalog", () => {
  for (const [current, target] of [
    ["0.2.0-rc.2", "0.2.9"],
    ["0.2.9", "0.2.1-rc.2"],
    ["0.2.x", "0.2.1-rc.2"],
    ["0.2.0-rc.2", "^0.2.1"],
  ]) {
    const result = cli([
      "--nm",
      nm,
      "--dsh-version",
      current,
      "--upgrade-to",
      target,
      "--json",
    ]);
    const report = body(result);
    assert.equal(result.code, 3);
    assert.equal(report.status, "unsupported-version");
    assert.match(JSON.stringify(report), /未认证/);
    assert.equal(report.currentReport, null);
    assert.equal(report.targetReport, null);
  }
});

test("upgrade CLI reports missing values and unknown arguments in its own failure schema", () => {
  for (const args of [
    ["--nm", nm, "--upgrade-to", "0.2.1-rc.2", "--json"],
    ["--dsh-version", "0.2.0-rc.2", "--upgrade-to", "0.2.1-rc.2", "--json"],
    ["--nm", nm, "--dsh-version", "--upgrade-to", "0.2.1-rc.2", "--json"],
    ["--nm", nm, "--dsh-version", "0.2.0-rc.2", "--upgrade-to", "--json"],
    [...base, "--unknown-upgrade-flag", "--json"],
  ]) {
    const result = cli(args);
    const report = body(result);
    assert.equal(result.code, 3);
    assert.equal(report.status, "error");
    assert.ok(report.error);
  }
});

test("upgrade filesystem failures remain preview errors with no partial evidence", () => {
  const result = cli([
    "--nm",
    path.join(temp, "absent"),
    "--dsh-version",
    "0.2.0-rc.2",
    "--upgrade-to",
    "0.2.1-rc.2",
    "--json",
  ]);
  const report = body(result);
  assert.equal(result.code, 3);
  assert.equal(report.status, "error");
  assert.equal(report.currentReport, null);
  assert.equal(report.targetReport, null);
});

test("upgrade CLI rejects observation, baseline, override and alternate-output options", () => {
  const options = [
    ["--probe", "/missing-probe"],
    ["--probe-boot"],
    ["--probe-timeout", "1"],
    ["--probe-keep-dir", path.join(temp, "keep")],
    ["--baseline-file", path.join(temp, "baseline")],
    ["--dry-run"],
    ["--rules", "/missing-rules"],
    ["--catalog", "/missing-catalog"],
    ["--issue-report"],
    ["--quiet"],
    ["--profile", "desktop"],
  ];
  const before = inventory(temp);
  for (const option of options) {
    const result = cli([...base, ...option, "--json"]);
    const report = body(result);
    assert.equal(result.code, 3);
    assert.equal(report.status, "error");
    assert.ok(report.error.includes(option[0]), report.error);
  }
  assert.deepEqual(inventory(temp), before);
});

test("help and version remain independent of upgrade inputs and nm", () => {
  for (const flag of ["--help", "--version"]) {
    const result = cli(["--upgrade-to", "0.2.1-rc.2", flag]);
    assert.equal(result.code, 0, result.out + result.err);
    assert.equal(result.err, "");
    if (flag === "--help") assert.match(result.out, /--upgrade-to/);
    else
      assert.equal(
        result.out.trim(),
        `dsh-plugin-compat-check ${TOOL_VERSION}`,
      );
  }
});
