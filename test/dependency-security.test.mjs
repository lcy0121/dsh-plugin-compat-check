import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tool = fileURLToPath(
  new URL("../tools/dependency-security.mjs", import.meta.url),
);
const clean = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
};
function advisory(severity = "moderate") {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      sample: {
        name: "sample",
        severity,
        isDirect: true,
        via: [
          {
            source: 123,
            name: "sample",
            dependency: "sample",
            title: "example",
            url: "https://github.com/advisories/GHSA-test-test-test?token=private",
            severity,
            range: "<2.0.0",
          },
        ],
        effects: [],
        range: "<2.0.0",
        nodes: ["node_modules/sample"],
        fixAvailable: true,
      },
    },
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 1,
        high: 0,
        critical: 0,
        total: 1,
      },
    },
  };
}

// The double replaces only npm's external registry boundary. The CLI, files,
// process exit handling, lock selection and evidence sanitizer all stay real.
function run(t, scenario = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-dependency-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, "workspace"),
    bin = path.join(dir, "bin");
  fs.mkdirSync(path.join(root, "plugin"), { recursive: true });
  fs.mkdirSync(bin);
  const manifest = {
    name: "workspace",
    version: "1.0.0",
    dependencies: { sample: "1.0.0" },
    devDependencies: { devsample: "3.0.0" },
  };
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify(manifest));
  fs.writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": manifest,
        "node_modules/sample": { version: "1.0.0" },
        "node_modules/devsample": { version: "3.0.0", dev: true },
      },
    }),
  );
  fs.writeFileSync(
    path.join(root, "plugin/package.json"),
    JSON.stringify({
      name: "plugin",
      version: "1.0.0",
      dependencies: { sample: "2.0.0" },
      scripts: { preinstall: "exit 99" },
    }),
  );
  if (scenario.staleRoot)
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ ...manifest, dependencies: { sample: "9.0.0" } }),
    );
  if (scenario.pluginLock)
    fs.writeFileSync(
      path.join(root, "plugin/package-lock.json"),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { dependencies: { sample: scenario.pluginLock } },
          "node_modules/sample": { version: scenario.pluginLock },
        },
      }),
    );
  const log = path.join(dir, "calls.jsonl");
  fs.writeFileSync(
    path.join(bin, "npm"),
    String.raw`#!${process.execPath}
const fs = require('node:fs');
const scenario = JSON.parse(process.env.AUDIT_SCENARIO);
const args = process.argv.slice(2), manifest = JSON.parse(fs.readFileSync('package.json'));
fs.appendFileSync(process.env.AUDIT_CALLS, JSON.stringify({args, manifest, cwd: process.cwd()}) + '\n');
if (args[0] === 'install') {
  if (scenario.installError) process.exit(7);
  fs.writeFileSync('package-lock.json', JSON.stringify({lockfileVersion:3,packages:{'':manifest,'node_modules/sample':{version:manifest.dependencies.sample}}}));
  process.exit(0);
}
if (scenario.timeout) { setInterval(() => {}, 1000); } else {
  const response = manifest.name === 'workspace' ? scenario.root : scenario.plugin;
  if (scenario.stderr) process.stderr.write(scenario.stderr);
  process.stdout.write(typeof response === 'string' ? response : JSON.stringify(response));
  process.exit(scenario.status ?? (response?.metadata?.vulnerabilities?.total ? 1 : 0));
}
`,
    { mode: 0o755 },
  );
  const output = path.join(dir, "evidence.json");
  const before = fs.readFileSync(path.join(root, "package-lock.json"), "utf8");
  const result = spawnSync(
    process.execPath,
    [
      tool,
      "--root",
      root,
      "--output",
      output,
      "--timeout-ms",
      scenario.timeout ? "150" : "5000",
    ],
    {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        PATH: bin + path.delimiter + process.env.PATH,
        AUDIT_SCENARIO: JSON.stringify({
          root: clean,
          plugin: clean,
          ...scenario,
        }),
        AUDIT_CALLS: log,
      },
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(
    fs.readFileSync(path.join(root, "package-lock.json"), "utf8"),
    before,
  );
  assert.equal(
    fs.existsSync(path.join(root, "plugin/package-lock.json")),
    Boolean(scenario.pluginLock),
  );
  const evidence = fs.existsSync(output)
    ? JSON.parse(fs.readFileSync(output))
    : null;
  return {
    ...result,
    evidence,
    output,
    calls: fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse)
      : [],
  };
}

test("clean audits cover frozen root dev dependencies and separately resolved plugin pins", (t) => {
  const r = run(t);
  assert.equal(
    r.status,
    0,
    JSON.stringify({
      stderr: r.stderr,
      stdout: r.stdout,
      evidence: r.evidence,
      calls: r.calls,
    }),
  );
  assert.equal(r.evidence.status, "clean");
  assert.deepEqual(
    r.evidence.targets.map((x) => [x.target, x.status]),
    [
      ["workspace-lock", "clean"],
      ["plugin-runtime", "clean"],
    ],
  );
  assert.equal(r.calls.length, 3);
  for (const call of r.calls.filter((x) => x.args[0] === "audit")) {
    for (const flag of [
      "--package-lock-only",
      "--ignore-scripts",
      "--json",
      "--include=dev",
      "--include=optional",
      "--include=peer",
      "--audit-level=info",
    ])
      assert.ok(call.args.includes(flag), flag);
  }
  assert.equal(r.calls[0].manifest.devDependencies.devsample, "3.0.0");
  const installation = r.calls.find((x) => x.args[0] === "install");
  assert.equal(installation.manifest.dependencies.sample, "2.0.0");
  assert.equal(installation.manifest.scripts, undefined);
  assert.ok(installation.args.includes("--ignore-scripts"));
  assert.ok(installation.args.includes("--no-audit"));
  assert.equal(
    fs.existsSync(installation.cwd),
    false,
    "owned temporary graph is removed",
  );
});

test("moderate plugin-only advisories block and identify source, lock path and resolved version", (t) => {
  const r = run(t, { plugin: advisory() });
  assert.equal(
    r.status,
    1,
    JSON.stringify({
      stderr: r.stderr,
      stdout: r.stdout,
      evidence: r.evidence,
      calls: r.calls,
    }),
  );
  assert.equal(r.evidence.status, "vulnerable");
  assert.deepEqual(r.evidence.targets[1].findings[0], {
    dependency: "sample",
    source: "123",
    path: "node_modules/sample",
    version: "2.0.0",
    severity: "moderate",
    url: "https://github.com/advisories/GHSA-test-test-test",
    range: "<2.0.0",
  });
  assert.doesNotMatch(fs.readFileSync(r.output, "utf8"), /private|token=/);
  assert.match(r.stdout, /plugin-runtime.*moderate.*sample/);
});

for (const severity of ["info", "low", "high", "critical", "future-severity"]) {
  test(`advisory severity ${severity} cannot pass`, (t) => {
    const r = run(t, { root: advisory(severity) });
    assert.equal(r.status, 1, r.stdout);
    assert.equal(r.evidence.status, "vulnerable");
    assert.equal(r.evidence.targets[0].findings[0].severity, severity);
  });
}

for (const [name, scenario, expectedError] of [
  ["stale root lock", { staleRoot: true }, "manifest-lock-mismatch"],
  [
    "stale independent plugin lock",
    { pluginLock: "1.0.0" },
    "manifest-lock-mismatch",
  ],
  ["malformed JSON", { root: "{broken" }, "invalid-audit-json"],
  ["empty JSON", { root: {} }, "invalid-audit-schema"],
  ["null JSON", { root: "null" }, "invalid-audit-schema"],
  [
    "registry error even with exit zero",
    {
      root: {
        error: {
          code: "E503",
          summary: "https://user:secret@example.test/?token=secret",
        },
      },
      status: 0,
    },
    "npm-registry-error",
  ],
  ["nonzero process with clean JSON", { status: 4 }, "unexpected-npm-exit"],
  [
    "inconsistent zero count",
    { root: { ...advisory(), metadata: clean.metadata } },
    "invalid-audit-schema",
  ],
  [
    "plugin lock generation failure",
    { installError: true },
    "plugin-lock-resolution-failed",
  ],
  ["bounded timeout", { timeout: true }, "npm-timeout"],
]) {
  test(`${name} fails closed with sanitized evidence`, (t) => {
    const r = run(t, { stderr: "secret=credential", ...scenario });
    assert.equal(r.status, 2, r.stderr);
    assert.equal(r.evidence.status, "error");
    assert.ok(
      r.evidence.targets.some(
        (x) => x.status === "error" && x.error === expectedError,
      ),
      JSON.stringify(r.evidence),
    );
    assert.doesNotMatch(
      JSON.stringify(r.evidence) + r.stdout + r.stderr,
      /secret|credential/,
    );
  });
}
