import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const cli = new URL("../tools/author-ci.mjs", import.meta.url);
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-author-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "package");
  writePackageFixture(
    source,
    {
      name: "author-fixture",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: {},
    },
    'throw Error("target code must never execute");export function apply(ctx){ctx.noSuchService.missing();}',
  );
  return { root, source };
}
function run(args) {
  return spawnSync(process.execPath, [cli.pathname, ...args], {
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 8 * 1024 * 1024,
  });
}
test("offline author matrix preserves exact catalogue/kernel results, identity and selected source without execution", (t) => {
  const f = fixture(t),
    r = run(["--package", f.source]);
  assert.notEqual(r.status, 3, r.stderr + r.stdout);
  const m = JSON.parse(r.stdout);
  assert.equal(m.kind, "plugin-compat-check/author-ci");
  assert.equal(m.cells.length, 2);
  for (const c of m.cells) {
    assert.equal(c.status, "analyzed");
    assert.equal(c.report.catalog.verified, true);
    assert.equal(c.report.catalog.targetVersion, c.dshVersion);
    assert.equal(c.kernelExitCode, c.report.exitCode);
    assert.equal(c.report.baseline, null);
    assert.equal(c.report.observation.mode, "catalogue");
    assert.equal(c.identity.package.name, "author-fixture");
    assert.match(c.identity.package.sha256, /^[a-f0-9]{64}$/);
  }
  assert.notEqual(m.gate.status, "pass");
  assert(
    !r.stdout.includes(f.root),
    "private/source absolute paths must not be exported",
  );
  assert.deepEqual(fs.readdirSync(f.root), ["package"]);
});
test("unknown versions and bad inputs fail closed with machine readable output", (t) => {
  const f = fixture(t);
  for (const args of [
    ["--package", f.source, "--versions", "99.0.0"],
    ["--package", f.source, "--versions", "^0.2.1"],
    ["--package", f.source, "--versions", "0.2.1-rc.2,0.2.1-rc.2"],
    ["--package", path.join(f.root, "absent")],
    ["--package", f.source, "--typo"],
  ]) {
    const r = run(args);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    const m = JSON.parse(r.stdout);
    assert.equal(m.gate.status, "error");
    assert.notEqual(m.gate.reasons.length, 0);
  }
});
test("sidecar probes and grants outside the selected source cannot change author CI", (t) => {
  const f = fixture(t),
    first = run(["--package", f.source]);
  fs.writeFileSync(
    path.join(f.root, "compatibility.json"),
    JSON.stringify({ "author-fixture@1.0.0": ["0.2.1-rc.2"] }),
  );
  fs.writeFileSync(path.join(f.root, "probe-report.json"), "{broken");
  const second = run(["--package", f.source]);
  assert.equal(first.status, second.status);
  assert.deepEqual(JSON.parse(first.stdout), JSON.parse(second.stdout));
});
test("new policy without previous evidence and malformed previous input cannot pass", (t) => {
  const f = fixture(t),
    policy = path.join(f.root, "policy.json");
  fs.writeFileSync(
    policy,
    JSON.stringify({
      schemaVersion: 1,
      mode: "new",
      severities: ["fatal", "feature-dead", "degraded"],
      certainties: ["certain", "suspected"],
      requireCompleteCoverage: true,
      allowVacuous: false,
    }),
  );
  for (const more of [[], ["--previous", policy]]) {
    const r = run(["--package", f.source, "--policy", policy, ...more]);
    assert.equal(r.status, 3, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).gate.status, "error");
  }
});
test("standard serializers produce standalone output and retain the gate exit code", (t) => {
  const f = fixture(t),
    json = run(["--package", f.source]);
  for (const format of ["sarif", "junit"]) {
    const r = run(["--package", f.source, "--format", format]);
    assert.equal(r.status, json.status, r.stdout + r.stderr);
    if (format === "sarif") {
      assert.equal(JSON.parse(r.stdout).version, "2.1.0");
    } else {
      assert.match(r.stdout, /<testsuites|<testsuite/);
      assert.match(r.stdout, /author-fixture/);
    }
  }
});

test("bounded input rejects source symlinks, unsafe package links and oversized policy before execution", (t) => {
  const f = fixture(t),
    link = path.join(f.root, "linked");
  fs.symlinkSync(f.source, link, "dir");
  assert.equal(run(["--package", link]).status, 3);
  fs.symlinkSync(
    path.join(f.source, "index.js"),
    path.join(f.source, "linked.js"),
  );
  assert.equal(run(["--package", f.source]).status, 3);
  fs.unlinkSync(path.join(f.source, "linked.js"));
  const policy = path.join(f.root, "oversize.json");
  fs.writeFileSync(policy, " ".repeat(65537));
  assert.equal(run(["--package", f.source, "--policy", policy]).status, 3);
});

test("a mixed supported and unsupported matrix retains analyzed evidence and still fails closed", (t) => {
  const f = fixture(t),
    r = run(["--package", f.source, "--versions", "0.2.1-rc.2,99.0.0"]);
  assert.equal(r.status, 3);
  const m = JSON.parse(r.stdout);
  assert.equal(m.cells.length, 2);
  assert.equal(m.cells[0].status, "analyzed");
  assert.equal(m.cells[1].status, "unsupported");
  assert.equal(m.cells[1].report, null);
  assert.equal(m.gate.status, "error");
});
test("previous evidence is reusable only with exact comparable identities and detects changed source bytes", (t) => {
  const f = fixture(t),
    before = JSON.parse(run(["--package", f.source]).stdout),
    previous = path.join(f.root, "previous.json"),
    policy = path.join(f.root, "new-policy.json");
  fs.writeFileSync(previous, JSON.stringify(before));
  fs.writeFileSync(policy, JSON.stringify({ ...before.policy, mode: "new" }));
  fs.appendFileSync(
    path.join(f.source, "index.js"),
    "\n// changed artifact bytes",
  );
  const r = run([
    "--package",
    f.source,
    "--policy",
    policy,
    "--previous",
    previous,
  ]);
  assert.notEqual(r.status, 3, r.stdout + r.stderr);
  const m = JSON.parse(r.stdout);
  assert.notEqual(m.identity.package.sha256, before.identity.package.sha256);
  assert.notEqual(
    m.gate.status,
    "pass",
    "current limited coverage stays blocked even with old risks",
  );
  const wrong = JSON.parse(JSON.stringify(before));
  wrong.identity.rulesSha256 = "a".repeat(64);
  fs.writeFileSync(previous, JSON.stringify(wrong));
  assert.equal(
    run(["--package", f.source, "--policy", policy, "--previous", previous])
      .status,
    3,
  );
});

test("HTML displays one saved snapshot after source removal and preserves its gate", (t) => {
  const f = fixture(t),
    scanned = run(["--package", f.source]);
  const report = path.join(f.root, "report.json");
  fs.writeFileSync(report, scanned.stdout);
  fs.rmSync(f.source, { recursive: true });
  const r = run(["--report", report, "--format", "html"]);
  assert.equal(r.status, scanned.status, r.stdout + r.stderr);
  assert.match(r.stdout, /^<!doctype html>/i);
  assert.match(r.stdout, /Policy gate/);
  assert.match(r.stdout, /Kernel exit code/);
  assert.match(r.stdout, /Coverage/);
  assert.match(r.stdout, /Vacuous/);
  assert.match(r.stdout, /not business acceptance/);
  const evidence = r.stdout
    .match(/<pre id="evidence">([\s\S]*?)<\/pre>/)[1]
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  assert.deepEqual(JSON.parse(evidence), JSON.parse(scanned.stdout));
});

test("HTML CLI renders input errors and unknown versions as readable failing evidence", (t) => {
  const f = fixture(t);
  for (const more of [
    ["--versions", "99.0.0"],
    ["--typo", "bad"],
  ]) {
    const r = run(["--package", f.source, "--format", "html", ...more]);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /^<!doctype html>/i);
    assert.match(r.stdout, /Policy gate: error/);
    assert.match(r.stdout, /unsupported|Unknown, missing or duplicate option/);
  }
});

test("HTML saved report rejects invalid evidence, conflicting options, links and oversized inputs", (t) => {
  const f = fixture(t),
    report = path.join(f.root, "report.json");
  const m = JSON.parse(run(["--package", f.source]).stdout);
  m.cells[0].kernelExitCode = 99;
  fs.writeFileSync(report, JSON.stringify(m));
  assert.equal(run(["--report", report, "--format", "html"]).status, 3);
  for (const args of [
    ["--package", f.source],
    ["--versions", "0.2.1-rc.2"],
    ["--format", "json"],
  ]) {
    assert.equal(run(["--report", report, ...args]).status, 3);
  }
  fs.writeFileSync(report, " ".repeat(8 * 1024 * 1024 + 1));
  assert.equal(run(["--report", report, "--format", "html"]).status, 3);
});

test("HTML renders untrusted saved messages as inert text with no executable elements or links", (t) => {
  const f = fixture(t),
    report = path.join(f.root, "report.json");
  const m = JSON.parse(run(["--package", f.source]).stdout);
  const payload =
    '</pre><script>alert(1)</script><img src="https://evil.invalid/x" onerror="x">';
  m.limitations.push(payload);
  m.gate.reasons[0].message = payload;
  fs.writeFileSync(report, JSON.stringify(m));
  const r = run(["--report", report, "--format", "html"]);
  assert.equal(r.status, m.gate.exitCode);
  assert.doesNotMatch(r.stdout, /<script|<img|<a\s|<iframe/i);
  assert.match(r.stdout, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("saved unsupported and tool-error reports remain readable, contradictory failure metadata is rejected", (t) => {
  const f = fixture(t),
    report = path.join(f.root, "saved.json");
  for (const args of [["--package", f.source, "--versions", "99.0.0"], []]) {
    const m = JSON.parse(run(args).stdout);
    fs.writeFileSync(report, JSON.stringify(m));
    const r = run(["--report", report, "--format", "html"]);
    assert.equal(r.status, 3);
    assert.match(r.stdout, /Target has no certified exact catalogue|Required:/);
    assert.doesNotMatch(r.stdout, /Invalid saved author CI evidence/);
  }
  const m = JSON.parse(
    run(["--package", f.source, "--versions", "99.0.0"]).stdout,
  );
  m.cells[0].kernelExitCode = 0;
  fs.writeFileSync(report, JSON.stringify(m));
  assert.match(
    run(["--report", report, "--format", "html"]).stdout,
    /Invalid saved author CI evidence/,
  );
});
