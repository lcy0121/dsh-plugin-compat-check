import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { loadCatalog } from "../lib/catalog.mjs";
import { validateReportBody, sealReportBody } from "../lib/contracts.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";
const root = new URL("../", import.meta.url).pathname;
const rules = JSON.parse(
  fs.readFileSync(new URL("../rules/severity.json", import.meta.url)),
);
function fixture(source, side = "client") {
  return packageFixture(
    side === "host" ? source : "export function apply() {}",
    {
      meta: {
        type: "module",
        exports: { ".": "./index.js", "./client": "./client.js" },
        dsh: { client: { platform: "web" } },
      },
      files: {
        "client.js": side === "client" ? source : "export function apply() {}",
      },
    },
  );
}
function evaluate(
  source,
  { version = "0.2.1-rc.3", side = "client", customRules = rules } = {},
) {
  const f = fixture(source, side);
  try {
    const { catalog, evidence } = loadCatalog(root, version);
    const extraction = extractWithProvenance(f.nm, { catalog });
    const verdict = buildVerdicts({
      report: extraction.report,
      rules: customRules,
      catalog,
      dshVersion: version,
    });
    const report = sealReportBody({
      ...verdict,
      toolVersion: TOOL_VERSION,
      catalog: evidence,
      inputs: { hasRuntimeSurface: false },
      extraction: {
        scanComplete: extraction.report.scanComplete,
        diagnostics: extraction.report.diagnostics,
        manifests: extraction.report.manifests,
      },
    });
    assert.deepEqual(validateReportBody(report), []);
    return { p: verdict.plugins.sample, extraction };
  } finally {
    f.cleanup();
  }
}
const invalid = (p) =>
  p.findings.filter((f) => f.category === "api-argument-invalid");
const notes = (p) => p.coverage.limitations.join("\n");

test("invalid rc.3 literal draft policy is a located nonfatal static risk, including guarded calls", () => {
  for (const call of [
    "ctx.uiWorkspace.startSession",
    "ctx.uiWorkspace.startSession?.",
  ]) {
    const { p } = evaluate(
      `export function apply(ctx){${call}(undefined,{whenDraftExists:'overwrite'})}`,
    );
    assert.equal(invalid(p).length, 1);
    const finding = invalid(p)[0];
    assert.equal(finding.severity, "degraded");
    assert.equal(finding.certainty, "certain");
    assert.equal(finding.impactBasis, "inferred");
    assert.equal(finding.location.file, "client.js");
    assert.equal(finding.location.line, 1);
    assert.equal(finding.evidence.dshVersion, "0.2.1-rc.3");
    assert.equal(finding.evidence.option, "whenDraftExists");
    assert.equal(p.verdict, "partial");
    assert.equal(p.resolved.uiWorkspace.disposition, "finding");
    assert.equal(
      p.findings.some((f) => f.category === "declaration-mismatch"),
      false,
    );
  }
});

test("rc.3 valid draft policies and legacy clearPreviousDraft remain usable", () => {
  for (const options of [
    "{whenDraftExists:'keep'}",
    "{whenDraftExists:'replace'}",
    "{whenDraftExists:'append'}",
    "{clearPreviousDraft:true}",
    "{whenDraftExists:'keep',clearPreviousDraft:true}",
  ]) {
    const { p } = evaluate(
      `export function apply(ctx){ctx.uiWorkspace.startSession(undefined,${options})}`,
    );
    assert.equal(invalid(p).length, 0);
    assert.equal(
      p.findings.some((f) => f.category === "api-option-unsupported"),
      false,
    );
    assert.doesNotMatch(notes(p), /clearPreviousDraft.*弃用/);
  }
  assert.match(
    notes(
      evaluate(
        "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'keep',clearPreviousDraft:true})}",
      ).p,
    ),
    /whenDraftExists.*优先/,
  );
});

test("draft policy is version specific rather than borrowed from an adjacent or future host", () => {
  const source =
    "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'append'})}";
  const old = evaluate(source, { version: "0.2.1-rc.2" }).p;
  assert.equal(
    old.findings.filter((f) => f.category === "api-option-unsupported").length,
    1,
  );
  assert.equal(
    old.findings.some((f) => f.severity === "fatal"),
    false,
  );
  assert.equal(evaluate(source).p.findings.length, 0);
  for (const version of ["0.2.0-rc.2", "0.2.1-rc.4", null]) {
    // The fallback catalogue must not supply parameter/lifetime certification.
    const p = evaluate(source, { version }).p;
    assert.equal(invalid(p).length, 0);
    assert.equal(
      p.findings.some((f) => f.category === "api-option-unsupported"),
      false,
    );
    assert.match(notes(p), /语义.*未审查/);
  }
});

test("wrong known option types are reported without serializing prompt or arbitrary enum content", () => {
  const source =
    "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{prompt:42,clearPreviousDraft:'secret-value',whenDraftExists:'credential-like-text'})}";
  const { p, extraction } = evaluate(source);
  assert.equal(invalid(p).length, 3);
  const serialized = JSON.stringify({
    p,
    sites: extraction.report.perPlugin.sample.callSites,
  });
  assert.equal(serialized.includes("secret-value"), false);
  assert.equal(serialized.includes("credential-like-text"), false);
  const safe = evaluate(
    "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{prompt:'private prompt'})}",
  );
  assert.equal(
    JSON.stringify(safe.extraction.report.perPlugin.sample.callSites).includes(
      "private prompt",
    ),
    false,
  );
});

test("lexical option aliases and known mutations use the value at the call", () => {
  const { p } = evaluate(
    "export function apply(ctx){const mode='bad';const opts={whenDraftExists:mode};opts.whenDraftExists='append';ctx.uiWorkspace.startSession(undefined,opts);opts.whenDraftExists=7;ctx.uiWorkspace.startSession(undefined,opts)}",
  );
  assert.equal(invalid(p).length, 1);
  assert.equal(invalid(p)[0].evidence.option, "whenDraftExists");
});

test("dynamic, spread, getter and escaped option objects abstain rather than invent a constant", () => {
  for (const code of [
    "const opts=makeOptions();ctx.uiWorkspace.startSession(undefined,opts)",
    "ctx.uiWorkspace.startSession(undefined,{...unknown,whenDraftExists:'bad'})",
    "ctx.uiWorkspace.startSession(...args)",
    "ctx.uiWorkspace.startSession(undefined,{get whenDraftExists(){throw Error('never evaluate')}})",
    "const opts={whenDraftExists:'bad'};external(opts);ctx.uiWorkspace.startSession(undefined,opts)",
  ]) {
    const { p } = evaluate(`export function apply(ctx){${code}}`);
    assert.equal(invalid(p).length, 0, code);
    assert.match(notes(p), /参数.*未能静态确定/, code);
  }
});

test("side effects in later arguments cannot leave stale option proof", () => {
  const { p } = evaluate(
    "export function apply(ctx){const opts={whenDraftExists:'bad'};function edit(){opts.whenDraftExists='append'}ctx.uiWorkspace.startSession(undefined,opts,edit())}",
  );
  assert.equal(invalid(p).length, 0);
});

test("unexpanded closures withdraw stale option and scalar aliases", () => {
  for (const code of [
    "const opts={whenDraftExists:'bad'};function edit(){opts.whenDraftExists='append'}edit();ctx.uiWorkspace.startSession(undefined,opts)",
    "let mode='bad';function edit(){mode='append'}edit();const opts={whenDraftExists:mode};ctx.uiWorkspace.startSession(undefined,opts)",
  ]) {
    const { p } = evaluate(`export function apply(ctx){${code}}`);
    assert.equal(invalid(p).length, 0);
    assert.match(notes(p), /参数.*未能静态确定/);
  }
});

test("different helper invocations do not collapse into a certain invalid argument", () => {
  const { p } = evaluate(
    "function run(c,o){c.uiWorkspace.startSession(undefined,o)} export function apply(ctx){run(ctx,{whenDraftExists:'bad'});run(ctx,{whenDraftExists:'append'})}",
  );
  assert.equal(invalid(p).length, 0);
  assert.match(notes(p), /参数.*未能静态确定/);
});

test("same-spelled local objects and host-side client names do not inherit client semantics", () => {
  for (const [source, side] of [
    [
      "export function apply(ctx){const uiWorkspace={startSession(){}};uiWorkspace.startSession(undefined,{whenDraftExists:'bad'})}",
      "client",
    ],
    [
      "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'bad'})}",
      "host",
    ],
  ]) {
    const { p } = evaluate(source, { side });
    assert.equal(invalid(p).length, 0);
    assert.doesNotMatch(notes(p), /语义提示/);
  }
});

test("official timer deprecations are notices without fabricated removal or incompatibility", () => {
  for (const version of ["0.2.1-rc.2", "0.2.1-rc.3"]) {
    const { p } = evaluate(
      "export function apply(ctx){ctx.timer.setTimeout(()=>{},1);ctx.timer.setInterval(()=>{},2)}",
      { version },
    );
    assert.equal(p.findings.length, 0);
    assert.equal(p.verdict, "ok");
    assert.match(notes(p), /弃用.*ctx.timeout/);
    assert.match(notes(p), /弃用.*ctx.interval/);
    assert.doesNotMatch(notes(p), /已移除|必然失败/);
  }
});

test("retained session lifetime is an ownership reminder rather than an invented leak finding", () => {
  const { p } = evaluate(
    "export async function apply(ctx){const ref=ctx.sessions.retain('owned',{source:'controllerOperation'});try{await ref.ready}finally{ref.release()}}",
  );
  assert.equal(p.findings.length, 0);
  assert.match(notes(p), /生命周期.*ready.*release/);
  assert.match(notes(p), /不证明.*泄漏/);
});

test("CLI text, ordinary JSON and version preview share the same semantic finding", (t) => {
  const f = fixture(
    "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'bad'})}",
  );
  t.after(f.cleanup);
  const run = (args) =>
    spawnSync(
      process.execPath,
      ["bin/compat-check.mjs", "--nm", f.nm, ...args],
      { encoding: "utf8", timeout: 15000 },
    );
  const json = run(["--dsh-version", "0.2.1-rc.3", "--no-baseline", "--json"]);
  assert.equal(json.status, 1, json.stderr);
  assert.equal(
    JSON.parse(json.stdout).plugins.sample.findings[0].category,
    "api-argument-invalid",
  );
  const text = run(["--dsh-version", "0.2.1-rc.3", "--no-baseline"]);
  assert.match(text.stdout, /参数.*不符|参数.*无效/);
  const preview = run([
    "--dsh-version",
    "0.2.1-rc.2",
    "--upgrade-to",
    "0.2.1-rc.3",
    "--json",
  ]);
  assert.equal(preview.status, 1, preview.stderr);
  const d = JSON.parse(preview.stdout);
  assert.ok(
    d.targetReport.plugins.sample.findings.some(
      (f) => f.category === "api-argument-invalid",
    ),
  );
});

test("malformed or unregistered semantic baselines cannot authorize new rules", async () => {
  const { validateSemanticBaselines } = await import(
    "../lib/api-semantics.mjs"
  );
  assert.equal(typeof validateSemanticBaselines, "function");
  assert.deepEqual(validateSemanticBaselines(rules), []);
  for (const mutate of [
    (d) => (d.apiSemantics.schemaVersion = 99),
    (d) => (d.apiSemantics.baselines["0.2.1-rc.3"].sourceArchiveSha256 = ""),
    (d) =>
      (d.apiSemantics.baselines["0.2.1-rc.4"] = {
        ...d.apiSemantics.baselines["0.2.1-rc.3"],
        sourceTag: "dsh-v0.2.1-rc.4",
      }),
  ]) {
    const changed = structuredClone(rules);
    mutate(changed);
    assert.ok(validateSemanticBaselines(changed).length);
    const { p } = evaluate(
      "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'bad'})}",
      { customRules: changed },
    );
    assert.equal(invalid(p).length, 0);
    assert.match(notes(p), /语义.*未审查/);
  }
});

test("syntax-only inferred Context cannot produce certain argument findings", () => {
  const { p } = evaluate(
    "ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'bad'})",
  );
  assert.equal(invalid(p).length, 1);
  assert.equal(invalid(p)[0].certainty, "suspected");
});

test("shipped panel renders parameter risks and maintenance notices from the canonical report", async () => {
  const { run } = await import("../bin/compat-check.mjs");
  const { toJSON } = await import("../lib/report.mjs");
  const { panelHarness } = await import("./support/panel-harness.mjs");
  const f = fixture(
    "export function apply(ctx){ctx.uiWorkspace.startSession(undefined,{whenDraftExists:'bad'});ctx.timer.setTimeout(()=>{},1);ctx.sessions.retain('owned',{source:'controllerOperation'})}",
  );
  let h;
  try {
    const report = toJSON(
      run({
        nm: f.nm,
        dshVersion: "0.2.1-rc.3",
        baseline: false,
        _ignoreAutoProbe: true,
      }),
    );
    h = await panelHarness({
      schemaVersion: 1,
      kind: "plugin-compat-check/report",
      ok: true,
      error: null,
      exitCode: report.exitCode,
      toolVersion: report.toolVersion,
      baseline: null,
      report,
      computedAt: "2026-10-25T00:00:00Z",
      nodeModules: f.nm,
    });
    for (const button of h
      .nodes()
      .filter(
        (n) =>
          n.type === "button" &&
          /^展开(?:查看 \d+ 条|覆盖限制)/.test(n.props["aria-label"] || ""),
      ))
      button.props.onClick();
    h.render();
    assert.match(h.text(), /API参数不符/);
    assert.match(h.text(), /弃用.*ctx.timeout/);
    assert.match(h.text(), /生命周期.*ready.*release/);
    assert.match(h.text(), /未实测业务失败/);
  } finally {
    h?.dispose();
    f.cleanup();
  }
});
