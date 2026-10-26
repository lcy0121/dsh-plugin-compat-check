import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { renderIssueReport } from "../bin/issue-report.mjs";
import {
  snapshotForBaseline,
  diffAgainstBaseline,
  badgeFor,
} from "../lib/baseline.mjs";
import {
  validateReportBody,
  validateBaseline,
  validateEnvelope,
} from "../lib/contracts.mjs";
function clientAccept() {
  let registered;
  const sandbox = {
    window: { __ModuleLoader__: { load: (m) => (registered = m) } },
    console: { log() {}, warn() {} },
  };
  vm.runInNewContext(fs.readFileSync("plugin/lib/client.js", "utf8"), sandbox);
  const factory = registered.factory
    .toString()
    .replace(
      "return module.exports;",
      "module.exports.__accept=acceptPayload;return module.exports;",
    );
  return vm.runInNewContext("(" + factory + ")", sandbox)(() => ({})).__accept;
}
function envelope(report) {
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: report.ok,
    error: report.error,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    baseline: report.baseline,
    report,
  };
}
test("optional issueReport accepts only text while existing envelopes remain compatible", () => {
  const report = toJSON(
    run({
      nm: "test/fixtures/labels",
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  assert.deepEqual(validateEnvelope(envelope(report)), []);
  assert.deepEqual(
    validateEnvelope({ ...envelope(report), issueReport: "share preview" }),
    [],
  );
  for (const issueReport of [null, 42, {}, ["text"]])
    assert.ok(
      validateEnvelope({ ...envelope(report), issueReport }).includes(
        "envelope.issueReport",
      ),
    );
});
test("actual client rejects corrupt nested ledgers and baseline changes before rendering", () =>
  resultCase((_f, result) => {
    const body = toJSON(result),
      next = snapshotForBaseline(result.verdict, null),
      prev = structuredClone(next);
    prev.plugins.sample.verdict = "ok";
    prev.plugins.sample.findings = [];
    const diff = diffAgainstBaseline(prev, next);
    body.baseline = { wrote: false, diff, badge: badgeFor(diff) };
    const accept = clientAccept();
    assert.doesNotThrow(() => accept(envelope(body)));
    for (const mutate of [
      (d) => (d.plugins.sample.resolved.settings = null),
      (d) => (d.plugins.sample.resolved.settings.disposition = 42),
      (d) => d.plugins.sample.checked.push(null),
      (d) => d.plugins.sample.clientSide.push(null),
      (d) => d.plugins.sample.clientSide.push({ service: 42, note: "bad" }),
      (d) => d.plugins.sample.filtered.push(null),
      (d) => d.plugins.sample.abstained.push(null),
      (d) => d.plugins.sample.runtimeFacilities.push(null),
      (d) => (d.baseline.badge.show = "true"),
      (d) => (d.baseline.badge.text = {}),
      (d) => (d.baseline.diff.worsened[0] = null),
      (d) => (d.baseline.diff.worsened[0].newFindings[0] = null),
      (d) =>
        d.baseline.diff.worsened[0].changedFindings.push({
          from: null,
          to: null,
        }),
      (d) => d.baseline.diff.added.push(null),
    ]) {
      const bad = structuredClone(body);
      mutate(bad);
      assert.throws(() => accept(envelope(bad)), /报告|契约/);
    }
  }));
test("contradictory schema2 verdicts cannot manufacture baseline improvements", () =>
  resultCase((_f, result) => {
    const clean = snapshotForBaseline(result.verdict, null);
    clean.plugins.sample.verdict = "ok";
    clean.plugins.sample.findings = [];
    for (const verdict of ["broken", "partial"]) {
      const bad = structuredClone(clean);
      bad.plugins.sample.verdict = verdict;
      assert.ok(validateBaseline(bad).length > 0);
      assert.equal(diffAgainstBaseline(bad, clean).comparable, false);
    }
    const bad = snapshotForBaseline(result.verdict, null);
    bad.plugins.sample.verdict = "ok";
    assert.ok(validateBaseline(bad).length > 0);
  }));
test("bound observation identity and vacuous coverage agree with the report", () => {
  const f = packageFixture(
    "export function apply(ctx){ctx.settings.describe()}",
  );
  try {
    const result = run({
      nm: f.nm,
      baseline: false,
      dshVersion: "0.2.0-rc.2",
      _ignoreAutoProbe: true,
      _hostSurface: {
        observationVersion: 1,
        profileId: f.nm,
        dshVersion: "0.2.0-rc.2",
        probedAt: new Date().toISOString(),
        root: {
          settings: { present: true, methods: { describe: "function" } },
        },
      },
    });
    const body = toJSON(result);
    assert.equal(body.plugins.sample.coverage.status, "complete");
    assert.deepEqual(validateReportBody(body), []);
    for (const mutate of [
      (d) => (d.observation.dshVersion = "9.9.9"),
      (d) => (d.observation.profileId = "/foreign/node_modules"),
      (d) => (d.observation.profileId = body.inputs.nodeModules.slice(1)),
      (d) => {
        d.plugins.sample.coverage.verifiedCalls = 0;
        d.plugins.sample.checked = [];
      },
    ]) {
      const bad = structuredClone(body);
      mutate(bad);
      assert.ok(validateReportBody(bad).length > 0);
    }
    const unknown = structuredClone(body);
    unknown.observation.profileId = null;
    unknown.observation.dshVersion = null;
    assert.deepEqual(validateReportBody(unknown), []);
    const legacy = structuredClone(body);
    legacy.observation.bound = false;
    legacy.observation.profileId = "/legacy/unknown";
    assert.deepEqual(validateReportBody(legacy), []);
    const equivalent = structuredClone(body);
    equivalent.observation.profileId += "/../node_modules";
    assert.deepEqual(validateReportBody(equivalent), []);
    const relative = run({
      nm: f.nm,
      baseline: false,
      dshVersion: body.dshVersion,
      _ignoreAutoProbe: true,
      _hostSurface: {
        observationVersion: 1,
        profileId: path.relative(process.cwd(), f.nm),
        dshVersion: body.dshVersion,
        probedAt: body.observation.probedAt,
        root: {
          settings: { present: true, methods: { describe: "function" } },
        },
      },
    });
    assert.equal(toJSON(relative).observation.profileId, f.nm);
  } finally {
    f.cleanup();
  }
});
function resultCase(check) {
  const f = packageFixture("export function apply(ctx){ctx.settings.absent()}");
  try {
    const result = run({
      nm: f.nm,
      baseline: false,
      _hostSurface: {
        root: {
          settings: { present: true, methods: { describe: "function" } },
        },
      },
      _ignoreAutoProbe: true,
    });
    return check(f, result);
  } finally {
    f.cleanup();
  }
}
test("CLI result and JSON errors have a versioned machine contract and semantic exit code", () =>
  resultCase((_f, result) => {
    const body = toJSON(result);
    assert.equal(body.kind, "plugin-compat-check/result");
    assert.equal(body.ok, true);
    assert.equal(body.exitCode, 1);
    assert.ok(body.observation.notes.some((n) => n.includes("旧格式")));
    for (const args of [["--bogus"], ["--nm", "/missing-node-modules"]]) {
      const r = spawnSync(
        process.execPath,
        ["bin/compat-check.mjs", ...args, "--json"],
        { encoding: "utf8" },
      );
      assert.equal(r.status, 3);
      const error = JSON.parse(r.stdout);
      assert.equal(error.kind, "plugin-compat-check/result");
      assert.equal(error.ok, false);
      assert.equal(error.exitCode, 3);
      assert.equal(typeof error.error, "string");
    }
  }));
test("malformed nested findings in schema2 baseline are rejected neutrally before comparison", () =>
  resultCase((_f, result) => {
    const next = snapshotForBaseline(result.verdict, null);
    for (const mutate of [
      (p) => (p.findings[0] = null),
      (p) => (p.findings[0].severity = "banana"),
      (p) => (p.verdict = "banana"),
      (p) => (p.findings[0].certainty = false),
    ]) {
      const prior = structuredClone(next);
      mutate(prior.plugins.sample);
      let diff;
      assert.doesNotThrow(() => (diff = diffAgainstBaseline(prior, next)));
      assert.equal(diff.comparable, false);
      assert.match(diff.reason, /结构|契约/);
    }
  }));
test("public report validators reject lost evidence fields, allow additive fields, and preserve future evidence", async () =>
  resultCase((_f, result) => {
    // Import only after legacy producer assertions: no source-text-only test.
    return import("../lib/contracts.mjs").then(({ validateReportBody }) => {
      const body = toJSON(result);
      body.plugins.sample.findings[0].futureEvidence = { nested: ["kept"] };
      assert.deepEqual(validateReportBody(body), []);
      for (const mutate of [
        (d) => delete d.observation,
        (d) => delete d.plugins.sample.coverage,
        (d) => delete d.plugins.sample.findings[0].impactBasis,
        (d) => (d.summary.partial = 999),
        (d) => (d.schemaVersion = 99),
        (d) => {
          d.plugins.sample.verdict = "ok";
          d.summary.partial = 0;
          d.summary.ok = 1;
        },
        (d) => {
          d.plugins.sample.findings[0].location.start = 10;
          d.plugins.sample.findings[0].location.end = 1;
        },
      ]) {
        const bad = structuredClone(body);
        mutate(bad);
        assert.ok(validateReportBody(bad).length > 0);
      }
      assert.deepEqual(
        JSON.parse(JSON.stringify(body)).plugins.sample.findings[0]
          .futureEvidence,
        { nested: ["kept"] },
      );
    });
  }));
test("HTTP and model consumers carry the same complete report and baseline as the shared CLI body", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-contract-channels-"));
  const f = packageFixture("export function apply(ctx){ctx.settings.absent()}");
  try {
    const nm = path.join(home, "profiles/A/node_modules");
    fs.mkdirSync(nm, { recursive: true });
    fs.cpSync(f.pkg, path.join(nm, "sample"), { recursive: true });
    const probe = path.join(home, "probe.json");
    fs.writeFileSync(
      probe,
      JSON.stringify({
        observationVersion: 1,
        profileId: nm,
        dshVersion: "0.2.0-rc.2",
        probedAt: new Date().toISOString(),
        root: {
          settings: { present: true, methods: { describe: "function" } },
        },
      }),
    );
    const script = `import {apply} from ${JSON.stringify(new URL("../plugin/index.js", import.meta.url).href)};import {run} from ${JSON.stringify(new URL("../bin/compat-check.mjs", import.meta.url).href)};import {toJSON} from ${JSON.stringify(new URL("../lib/report.mjs", import.meta.url).href)};process.argv=['node','fake','--profile','A'];let tool,handler;const loader={entries:()=>[]};apply({get:n=>n==='connection'?{requestRejection:()=>undefined}:n==='loader'?loader:undefined,inject:(names,cb)=>{if(names.includes('tools'))cb({tools:{register:t=>tool=t},agents:{}});if(names.includes('webServer'))cb({webServer:{register:r=>{if(r.path==='/plugin-compat-check/report')handler=r.handler}}});return ()=>{}}});let http;await handler({method:'GET',headers:{'x-dsh-compat-request':'1',host:'127.0.0.1'},url:'/plugin-compat-check/report'},{writeHead(){},end(s){http=JSON.parse(s)}});const model=await tool.execute({});const error=await tool.execute({profile:'missing'});const cli=toJSON(run({nm:${JSON.stringify(nm)},probe:${JSON.stringify(probe)},dshVersion:'0.2.0-rc.2',baseline:false}));console.log('RESULT '+JSON.stringify({http,model,error,cli,schema:tool.output.schema}));`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSH_VERSION: "0.2.0-rc.2",
          DSC_KERNEL: path.resolve("."),
          DSC_PROBE_REPORT: probe,
          DSC_OUT_DIR: "",
          DSC_SCAN_DELAYS: "999999",
          DSC_AUTORUN_MS: "999999",
        },
      },
    );
    assert.equal(child.status, 0, child.stderr);
    const data = JSON.parse(
      child.stdout
        .split("\n")
        .find((l) => l.startsWith("RESULT "))
        .slice(7),
    );
    assert.deepEqual(data.model.report, data.http.report);
    assert.deepEqual(data.model.baseline, data.http.baseline);
    assert.equal(data.http.issueReport, renderIssueReport(data.http.report));
    assert.ok(!data.http.issueReport.includes(home));
    for (const field of ["plugins", "observation", "summary"])
      assert.deepEqual(data.cli[field], data.http.report[field]);
    assert.equal(data.http.report.kind, "plugin-compat-check/result");
    assert.equal(data.model.exitCode, 1);
    assert.equal(data.error.exitCode, 3);
    assert.equal(data.error.report.ok, false);
    assert.equal(data.schema.properties.report.oneOf[0].type, "object");
    assert.equal(data.schema.properties.report.oneOf[1].type, "null");
  } finally {
    f.cleanup();
    fs.rmSync(home, { recursive: true, force: true });
  }
});
test("actual client payload acceptance rejects missing evidence and unsupported versions", () =>
  resultCase((_f, result) => {
    const src = fs.readFileSync("plugin/lib/client.js", "utf8");
    let module;
    const sandbox = {
      window: { __ModuleLoader__: { load: (m) => (module = m) } },
      console: { log() {}, warn() {} },
      fetch() {},
      setTimeout() {},
      clearTimeout() {},
    };
    vm.runInNewContext(src, sandbox);
    // Expose the existing network acceptance function only in this VM instance.
    const body = module.factory
      .toString()
      .replace(
        "return module.exports;",
        "module.exports.__accept=acceptPayload;return module.exports;",
      );
    const factory = vm.runInNewContext("(" + body + ")", {
      ...sandbox,
      require: () => ({}),
    });
    const exported = factory(() => ({}));
    const core = toJSON(result);
    const envelope = {
      schemaVersion: 1,
      kind: "plugin-compat-check/report",
      ok: true,
      error: null,
      exitCode: core.exitCode,
      toolVersion: core.toolVersion,
      baseline: null,
      report: core,
    };
    assert.equal(
      exported.__accept(envelope).report.plugins.sample.findings.length,
      1,
    );
    for (const mutate of [
      (d) => delete d.report.observation,
      (d) => (d.schemaVersion = 88),
      (d) => delete d.report.plugins.sample.coverage,
    ]) {
      const bad = structuredClone(envelope);
      mutate(bad);
      assert.throws(() => exported.__accept(bad), /报告|contract|契约/);
    }
  }));

test("staging detects stale host/browser artifacts and updates both from the canonical contract", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-contract-stage-"));
  try {
    for (const sub of ["lib", "plugin/lib", "plugin/scripts"])
      fs.mkdirSync(path.join(dir, sub), { recursive: true });
    // The real stager now consumes several pure contracts and views. Copy the
    // source directory so this fixture exercises its complete production input.
    fs.cpSync("lib", path.join(dir, "lib"), { recursive: true });
    for (const name of [
      "plugin/lib/upgrade-contract.js",
      "plugin/lib/client.js",
      "plugin/lib/report-contract.js",
      "plugin/lib/finding-guidance.js",
      "plugin/scripts/stage-contract.mjs",
      "plugin/scripts/build-client.mjs",
      "plugin/tailwind.config.mjs",
    ])
      fs.copyFileSync(name, path.join(dir, name));
    fs.writeFileSync(
      path.join(dir, "plugin/package.json"),
      JSON.stringify({ type: "module" }),
    );
    // Source prepack tooling resolves the workspace dev dependencies.
    fs.symlinkSync(
      path.resolve("node_modules"),
      path.join(dir, "node_modules"),
      "dir",
    );
    fs.cpSync("plugin/src", path.join(dir, "plugin/src"), { recursive: true });
    const canonical = path.join(dir, "lib/contracts.mjs");
    fs.writeFileSync(
      canonical,
      fs
        .readFileSync(canonical, "utf8")
        .replace("REPORT_SCHEMA = 1", "REPORT_SCHEMA = 2"),
    );
    const cli = (args) =>
      spawnSync(
        process.execPath,
        [path.join(dir, "plugin/scripts/stage-contract.mjs"), ...args],
        { encoding: "utf8" },
      );
    assert.equal(cli(["--check"]).status, 1);
    const staged = cli([]);
    assert.equal(staged.status, 0, staged.stdout + staged.stderr);
    assert.equal(cli(["--check"]).status, 0);
    assert.equal(cli(["--check"]).status, 0);
    const updated = await import(
      "file://" + path.join(dir, "plugin/lib/report-contract.js")
    );
    assert.equal(updated.REPORT_SCHEMA, 2);
    let registered;
    vm.runInNewContext(
      fs.readFileSync(path.join(dir, "plugin/lib/client.js"), "utf8"),
      { window: { __ModuleLoader__: { load: (m) => (registered = m) } } },
    );
    const instrumented = registered.factory
      .toString()
      .replace(
        "return module.exports;",
        "module.exports.__accept=acceptPayload;return module.exports;",
      );
    const exported = vm.runInNewContext("(" + instrumented + ")")(() => ({}));
    const old = {
      schemaVersion: 1,
      kind: "plugin-compat-check/report",
      ok: false,
      error: "old",
      exitCode: 3,
      toolVersion: null,
      baseline: null,
      report: {
        schemaVersion: 1,
        kind: "plugin-compat-check/result",
        ok: false,
        error: "old",
        exitCode: 3,
        toolVersion: null,
        inputs: {},
      },
    };
    assert.throws(() => exported.__accept(old), /报告|契约/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
