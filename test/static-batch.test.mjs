import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "tools/static-batch.mjs");
const pinned = path.join(root, "test/fixtures/static-batch.json");
function invoke(args, env = {}) {
  const child = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, ...env },
  });
  assert.equal(child.signal, null, child.stderr);
  assert(
    child.stdout.startsWith("{"),
    "batch CLI must return structured JSON: " + child.stderr,
  );
  return {
    code: child.status,
    body: JSON.parse(child.stdout),
    stderr: child.stderr,
  };
}
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function sample(t, source = "export default class Plugin {}") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-batch-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "pkg"));
  const files = {
    "package.json": JSON.stringify({
      name: "sample",
      version: "1.0.0",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
    "cordis.patch.yml": "- name: ./index.js\n",
    "index.js": typeof source === "function" ? source(dir) : source,
  };
  for (const [name, bytes] of Object.entries(files))
    fs.writeFileSync(path.join(dir, "pkg", name), bytes);
  // Independent implementation of the documented tree format, never the production helper.
  const digest = () =>
    sha(
      JSON.stringify(
        Object.keys(files)
          .sort()
          .map((name) => [
            name,
            Buffer.byteLength(files[name]),
            sha(files[name]),
          ]),
      ),
    );
  const manifest = {
    schemaVersion: 1,
    kind: "plugin-compat-check/batch-manifest",
    dshVersion: "0.2.1-rc.2",
    samples: [
      {
        id: "one",
        path: "pkg",
        name: "sample",
        version: "1.0.0",
        sha256: digest(),
      },
    ],
  };
  const file = path.join(dir, "manifest.json");
  const save = () => fs.writeFileSync(file, JSON.stringify(manifest));
  save();
  return { dir, file, manifest, save };
}

test("fixed hashes aggregate literal static verdicts, limitations and author review", () => {
  const { code, body } = invoke(["--manifest", pinned]);
  assert.equal(code, 2);
  assert.equal(body.kind, "plugin-compat-check/batch-result");
  assert.equal(body.ok, true);
  assert.equal(body.summary.samples, 4);
  assert.equal(body.summary.analyzed, 4);
  assert.equal(body.summary.errors, 0);
  assert.equal(body.summary.ok, 2);
  assert.equal(body.summary.partial, 1);
  assert.equal(body.summary.broken, 1);
  assert.equal(body.summary.limited, 4);
  assert.equal(body.summary.vacuousOk, 2);
  assert.deepEqual(
    body.samples.map((x) => x.report.verdict),
    ["ok", "partial", "broken", "ok"],
  );
  for (const row of body.samples) {
    assert.equal(row.hashVerified, true);
    assert.equal(row.reviewStatus, "pending-author-review");
    assert.equal(row.report.observation.mode, "catalogue");
    assert.equal(row.report.observation.usable, false);
    assert.equal(row.report.coverage.status, "limited");
    for (const f of row.report.findings)
      assert.equal(f.impactBasis, "inferred");
  }
  const missing = body.samples[1].report.findings[0];
  assert.equal(missing.certainty, "suspected");
  assert.equal(missing.location.file, "index.js");
  assert.equal(missing.location.line, 12);
  assert.equal(body.samples[2].report.scanComplete, false);
  assert.equal(body.policy.executesTargetCode, false);
});

test("fingerprint uses the frozen whole-tree digest", () => {
  const { code, body } = invoke([
    "--hash",
    path.join(root, "test/fixtures/labels/healthy"),
  ]);
  assert.equal(code, 0);
  assert.equal(
    body.sha256,
    JSON.parse(fs.readFileSync(pinned)).samples[0].sha256,
  );
  assert.equal(body.files, 3);
});

test("changed bytes fail the hash gate and other samples still run", (t) => {
  const s = sample(t);
  fs.appendFileSync(path.join(s.dir, "pkg/index.js"), "\n// changed");
  fs.cpSync(
    path.join(root, "test/fixtures/labels/healthy"),
    path.join(s.dir, "healthy"),
    { recursive: true },
  );
  const healthy = JSON.parse(fs.readFileSync(pinned)).samples[0];
  s.manifest.samples.push({ ...healthy, id: "two", path: "healthy" });
  s.save();
  const { code, body } = invoke(["--manifest", s.file]);
  assert.equal(code, 3);
  assert.equal(body.summary.errors, 1);
  assert.equal(body.summary.analyzed, 1);
  assert.equal(body.summary.ok, 1);
  assert.deepEqual(
    body.samples.map((x) => x.errorCode),
    ["hash-mismatch", undefined],
  );
  assert.equal(body.samples[0].report, null);
  assert.equal(body.samples[0].hashVerified, false);
  assert.equal(body.samples[1].report.verdict, "ok");
  assert.equal(body.samples[1].hashVerified, true);
});

test("identity mismatch cannot masquerade as an empty successful scan", (t) => {
  const s = sample(t);
  s.manifest.samples[0].name = "other";
  s.save();
  const { code, body } = invoke(["--manifest", s.file]);
  assert.equal(code, 3);
  assert.equal(body.samples[0].errorCode, "identity-mismatch");
  assert.equal(body.summary.ok, 0);
});

test("target source is never executed, adjacent observations and exemptions are ignored", (t) => {
  const s = sample(
    t,
    (dir) =>
      `require('node:fs').writeFileSync(${JSON.stringify(path.join(dir, "must-not-execute"))}, 'bad');\nexport const inject = ['noSuchServiceAnywhere'];\nexport function apply(ctx) {ctx.effect(() => {});}`,
  );
  const marker = path.join(s.dir, "must-not-execute");
  assert.equal(fs.existsSync(marker), false);
  fs.writeFileSync(
    path.join(s.dir, "probe-report.json"),
    JSON.stringify({ services: { noSuchServiceAnywhere: { present: true } } }),
  );
  fs.writeFileSync(
    path.join(s.dir, "compatibility.json"),
    "private-exemption-sentinel",
  );
  const before = fs.readFileSync(
    path.join(s.dir, "compatibility.json"),
    "utf8",
  );
  const { code, body } = invoke(["--manifest", s.file], {
    DSH_HOME: s.dir,
    TMPDIR: s.dir,
  });
  assert.equal(code, 1);
  assert.equal(body.samples[0].report.findings[0].certainty, "suspected");
  assert.equal(body.samples[0].report.observation.usable, false);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(
    fs.readFileSync(path.join(s.dir, "compatibility.json"), "utf8"),
    before,
  );
  assert.deepEqual(fs.readdirSync(s.dir).sort(), [
    "compatibility.json",
    "manifest.json",
    "pkg",
    "probe-report.json",
  ]);
  assert(!JSON.stringify(body).includes(s.dir));
});

test("symlinks and oversized input fail closed before scanning", (t) => {
  const s = sample(t);
  fs.symlinkSync(
    path.join(s.dir, "manifest.json"),
    path.join(s.dir, "pkg/link"),
  );
  let result = invoke(["--manifest", s.file]);
  assert.equal(result.code, 3);
  assert.equal(result.body.samples[0].errorCode, "unsafe-sample");
  fs.unlinkSync(path.join(s.dir, "pkg/link"));
  fs.writeFileSync(
    path.join(s.dir, "pkg/large"),
    Buffer.alloc(2 * 1024 * 1024 + 1),
  );
  result = invoke(["--manifest", s.file]);
  assert.equal(result.body.samples[0].errorCode, "sample-budget-exceeded");
});

test("invalid manifests never partially run, including empty, traversal and excess queues", (t) => {
  const s = sample(t);
  const cases = [
    { ...s.manifest, samples: [] },
    { ...s.manifest, dshVersion: "latest" },
    {
      ...s.manifest,
      samples: Array.from({ length: 17 }, (_, i) => ({
        ...s.manifest.samples[0],
        id: `s${i}`,
      })),
    },
    {
      ...s.manifest,
      samples: [{ ...s.manifest.samples[0], path: "../outside" }],
    },
    { ...s.manifest, samples: [{ ...s.manifest.samples[0], sha256: null }] },
    { ...s.manifest, samples: [s.manifest.samples[0], s.manifest.samples[0]] },
  ];
  for (const value of cases) {
    fs.writeFileSync(s.file, JSON.stringify(value));
    const { code, body } = invoke(["--manifest", s.file]);
    assert.equal(code, 3);
    assert.equal(body.errorCode, "invalid-manifest");
    assert.deepEqual(body.samples, []);
  }
});

test("worker timeout and total budget retain every selected sample as a tool error", (t) => {
  const s = sample(t);
  let result = invoke(["--manifest", s.file, "--sample-timeout-ms", "1"], {
    TMPDIR: s.dir,
  });
  assert.equal(result.code, 3);
  assert.equal(result.body.samples[0].errorCode, "sample-timeout");
  assert.deepEqual(fs.readdirSync(s.dir).sort(), ["manifest.json", "pkg"]);
  s.manifest.samples.push({ ...s.manifest.samples[0], id: "two" });
  s.save();
  result = invoke(["--manifest", s.file, "--batch-timeout-ms", "1"]);
  assert.equal(result.code, 3);
  assert.equal(result.body.samples.length, 2);
  assert.equal(result.body.summary.analyzed, 0);
  assert(result.body.samples.every((x) => x.exitCode === 3));
});

test("delta compares only identical artifacts and policy, never reuses a prior verdict", (t) => {
  const s = sample(t);
  const first = invoke(["--manifest", s.file]).body;
  const previous = path.join(s.dir, "previous.json");
  fs.writeFileSync(previous, JSON.stringify(first));
  let result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.code, 0);
  assert.equal(result.body.delta.samples[0].status, "unchanged");
  first.samples[0].report.verdict = "broken";
  fs.writeFileSync(previous, JSON.stringify(first));
  result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.code, 3);
  assert.equal(result.body.errorCode, "invalid-previous");
  first.samples[0].report.verdict = "ok";
  first.identity.rulesSha256 = "0".repeat(64);
  fs.writeFileSync(previous, JSON.stringify(first));
  result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.body.delta.samples[0].status, "incomparable");
  // A cached success cannot hide a newly changed package.
  fs.appendFileSync(path.join(s.dir, "pkg/index.js"), "\n// mutation");
  result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.code, 3);
  assert.equal(result.body.samples[0].errorCode, "hash-mismatch");
});

test("delta distinguishes added, removed, changed and different budget or artifact identities", (t) => {
  const s = sample(t);
  const first = invoke(["--manifest", s.file]).body;
  assert.match(first.identity.analysisSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.identity.nodeVersion, process.versions.node);
  const previous = path.join(s.dir, "previous.json");
  fs.writeFileSync(previous, JSON.stringify(first));
  s.manifest.samples[0].id = "new";
  s.save();
  let result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.deepEqual(result.body.delta.samples, [
    { id: "new", status: "added" },
    { id: "one", status: "removed" },
  ]);
  s.manifest.samples[0].id = "one";
  s.manifest.samples[0].sha256 = "0".repeat(64);
  s.save();
  result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.body.delta.samples[0].status, "incomparable");
  s.manifest.samples[0].sha256 = first.samples[0].sha256;
  s.save();
  result = invoke([
    "--manifest",
    s.file,
    "--previous",
    previous,
    "--sample-timeout-ms",
    "9000",
  ]);
  assert.equal(result.body.delta.comparable, false);
  assert.equal(result.body.delta.samples[0].status, "incomparable");
  first.samples[0] = {
    ...first.samples[0],
    status: "error",
    report: null,
    exitCode: 3,
    hashVerified: false,
    errorCode: "sample-timeout",
  };
  first.summary = {
    samples: 1,
    analyzed: 0,
    errors: 1,
    ok: 0,
    partial: 0,
    broken: 0,
    unknown: 0,
    limited: 0,
    vacuousOk: 0,
  };
  first.ok = false;
  first.exitCode = 3;
  fs.writeFileSync(previous, JSON.stringify(first));
  result = invoke(["--manifest", s.file, "--previous", previous]);
  assert.equal(result.code, 0);
  assert.equal(result.body.delta.samples[0].status, "changed");
});

test("directory links, FIFO inputs and excessive depth are rejected without hanging", (t) => {
  const s = sample(t);
  fs.symlinkSync(path.join(s.dir, "pkg"), path.join(s.dir, "alias"));
  s.manifest.samples[0].path = "alias";
  s.save();
  let result = invoke(["--manifest", s.file]);
  assert.equal(result.body.samples[0].errorCode, "unsafe-sample");
  s.manifest.samples[0].path = "pkg";
  s.save();
  const fifo = path.join(s.dir, "fifo");
  assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
  result = invoke(["--manifest", fifo]);
  assert.equal(result.code, 3);
  assert.equal(result.body.errorCode, "invalid-manifest");
  fs.mkdirSync(path.join(s.dir, "pkg", ...Array(33).fill("deep")), {
    recursive: true,
  });
  result = invoke(["--manifest", s.file]);
  assert.equal(result.body.samples[0].errorCode, "sample-budget-exceeded");
});

test("unknown and conflicting CLI options produce a JSON tool failure", () => {
  for (const args of [
    ["--probe-boot"],
    ["--manifest", pinned, "--hash", root],
    ["--manifest", pinned, "--sample-timeout-ms", "10001"],
  ]) {
    const { code, body } = invoke(args);
    assert.equal(code, 3);
    assert.equal(body.errorCode, "invalid-arguments");
  }
});

test("entry and aggregate byte limits reject complete oversized trees", (t) => {
  const s = sample(t);
  for (let i = 0; i < 4094; i++)
    fs.writeFileSync(path.join(s.dir, "pkg", `f${i}`), "");
  let result = invoke(["--manifest", s.file]);
  assert.equal(result.body.samples[0].errorCode, "sample-budget-exceeded");
  for (let i = 0; i < 4094; i++)
    fs.unlinkSync(path.join(s.dir, "pkg", `f${i}`));
  for (let i = 0; i < 8; i++)
    fs.writeFileSync(
      path.join(s.dir, "pkg", `f${i}`),
      Buffer.alloc(2 * 1024 * 1024),
    );
  result = invoke(["--manifest", s.file]);
  assert.equal(result.body.samples[0].errorCode, "sample-budget-exceeded");
  assert.equal(result.body.summary.analyzed, 0);
});

test("oversized reports become explicit tool errors rather than truncated successful findings", (t) => {
  const names = Array.from(
    { length: 180 },
    (_, i) => `service${i}${"a".repeat(600)}`,
  );
  const s = sample(
    t,
    `export const inject = ${JSON.stringify(names)}; export function apply(ctx) {ctx.effect(() => {});}`,
  );
  const { code, body } = invoke(["--manifest", s.file]);
  assert.equal(code, 3);
  assert.equal(body.samples[0].errorCode, "report-budget-exceeded");
  assert.equal(body.samples[0].report, null);
});
