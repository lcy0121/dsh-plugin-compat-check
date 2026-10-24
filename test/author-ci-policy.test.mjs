import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_POLICY,
  validatePolicy,
  evaluateMatrix,
} from "../lib/author-ci-policy.mjs";
import {
  sealReportBody,
  describeCatalog,
  CATALOG_REFERENCES,
} from "../lib/contracts.mjs";
export function cell(findings = [], options = {}) {
  const version = "0.2.1-rc.2",
    name = "sample",
    verdict = options.unknown
      ? "unknown"
      : findings.some((f) => f.severity === "fatal")
        ? "broken"
        : findings.length
          ? "partial"
          : "ok";
  const vacuous = options.vacuous ?? false,
    limited = options.limited || vacuous;
  const report = sealReportBody({
    toolVersion: "0.1.4",
    inputs: {},
    dshVersion: version,
    catalog: describeCatalog({
      targetVersion: version,
      referenceVersion: version,
      sha256: CATALOG_REFERENCES[1].sha256,
    }),
    summary: {
      ok: 0,
      partial: 0,
      broken: 0,
      unknown: 0,
      [verdict]: 1,
      limited: limited ? 1 : 0,
      vacuousOk: vacuous ? 1 : 0,
    },
    plugins: {
      [name]: {
        name,
        version: "1.0.0",
        verdict,
        vacuous,
        coverage: {
          status: limited ? "limited" : "complete",
          verifiedCalls: vacuous ? 0 : 1,
          limitations: limited ? ["limited"] : [],
        },
        findings,
        checked: [],
        clientSide: [],
        filtered: [],
        abstained: [],
        runtimeFacilities: [],
        resolved: {},
      },
    },
    observation: { mode: "catalogue", bound: false, usable: false, notes: [] },
    extraction: { scanComplete: true, diagnostics: [], manifests: [] },
  });
  return {
    dshVersion: version,
    status: "analyzed",
    kernelExitCode: report.exitCode,
    report,
    error: null,
    identity: {
      package: { name, version: "1.0.0", sha256: "a".repeat(64) },
      catalogSha256: report.catalog.sha256,
      rulesSha256: "b".repeat(64),
      toolVersion: "0.1.4",
    },
  };
}
export function finding(
  severity = "fatal",
  certainty = "certain",
  location = { file: "index.js", line: 3 },
) {
  return {
    category: "host-method-missing",
    service: "x",
    method: "y",
    severity,
    certainty,
    impactBasis: "inferred",
    impact: "feature unavailable",
    basis: "catalogue",
    location,
  };
}
export function matrix(cells) {
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/author-ci",
    toolVersion: "0.1.4",
    identity: {
      package: cells[0].identity.package,
      rulesSha256: cells[0].identity.rulesSha256,
    },
    policy: DEFAULT_POLICY,
    cells,
    gate: evaluateMatrix(cells),
    limitations: ["Static evidence; no business acceptance."],
  };
}
test("strict policy rejects typos, invalid enum, duplicate selections and missing fields", () => {
  assert.equal(validatePolicy(DEFAULT_POLICY), DEFAULT_POLICY);
  for (const p of [
    { ...DEFAULT_POLICY, foo: true },
    { ...DEFAULT_POLICY, mode: "other" },
    { ...DEFAULT_POLICY, severities: ["fatal", "fatal"] },
    { ...DEFAULT_POLICY, allowVacuous: "yes" },
    {},
  ])
    assert.throws(() => validatePolicy(p));
});
test("all mode separates kernel exit codes from configurable gates", () => {
  assert.equal(evaluateMatrix([cell()]).exitCode, 0);
  assert.equal(evaluateMatrix([cell([finding()])]).exitCode, 2);
  assert.equal(evaluateMatrix([cell([finding("degraded")])]).exitCode, 1);
  assert.equal(
    evaluateMatrix([cell([finding()])], {
      ...DEFAULT_POLICY,
      severities: ["degraded"],
    }).exitCode,
    0,
  );
});
test("coverage unknown vacuity and empty input fail closed", () => {
  for (const c of [
    cell([], { limited: true }),
    cell([], { unknown: true }),
    cell([], { vacuous: true }),
  ])
    assert.equal(evaluateMatrix([c]).exitCode, 1);
  assert.equal(evaluateMatrix([]).exitCode, 3);
  assert.equal(
    evaluateMatrix([cell([], { vacuous: true })], {
      ...DEFAULT_POLICY,
      allowVacuous: true,
      requireCompleteCoverage: false,
    }).exitCode,
    0,
  );
});
test("new mode suppresses matching findings but retains new and worsened certainty", () => {
  const p = { ...DEFAULT_POLICY, mode: "new" },
    before = matrix([cell([finding("fatal", "suspected")])]);
  assert.equal(
    evaluateMatrix([cell([finding("fatal", "suspected")])], p, before).exitCode,
    0,
  );
  assert.equal(evaluateMatrix([cell([finding()])], p, before).exitCode, 2);
  assert.equal(
    evaluateMatrix(
      [cell([finding("fatal", "suspected", { file: "other.js", line: 3 })])],
      p,
      before,
    ).exitCode,
    2,
  );
  assert.equal(
    evaluateMatrix([cell([], { limited: true })], p, before).exitCode,
    1,
  );
});
test("baseline and current malformed identities/reports cannot suppress gates", () => {
  const p = { ...DEFAULT_POLICY, mode: "new" },
    current = cell([finding()]),
    before = matrix([cell([finding()])]);
  assert.equal(evaluateMatrix([current], p).exitCode, 3);
  for (const mutate of [
    (m) => m.cells.push(structuredClone(m.cells[0])),
    (m) => delete m.cells[0].report.plugins.sample.findings[0].impact,
    (m) => (m.cells[0].identity.rulesSha256 = "c".repeat(64)),
    (m) => (m.cells[0].report.plugins.sample.name = "alien"),
    (m) => (m.identity.package.name = "alien"),
  ]) {
    const bad = structuredClone(before);
    mutate(bad);
    assert.equal(evaluateMatrix([current], p, bad).exitCode, 3);
  }
  const malformed = structuredClone(current);
  malformed.report.summary.broken = 0;
  assert.equal(evaluateMatrix([malformed]).exitCode, 3);
});
test("package revision changes are comparable but tool/catalogue changes are not", () => {
  const p = { ...DEFAULT_POLICY, mode: "new" },
    c = cell([finding()]),
    before = matrix([cell([finding()])]);
  before.identity.package = {
    ...before.identity.package,
    version: "0.9.0",
    sha256: "c".repeat(64),
  };
  before.cells[0].identity.package = before.identity.package;
  before.cells[0].report.plugins.sample.version = "0.9.0";
  assert.equal(evaluateMatrix([c], p, before).exitCode, 0);
  before.toolVersion = "0.0.0";
  assert.equal(evaluateMatrix([c], p, before).exitCode, 3);
});
test("mixed unsupported/error cells preserve analyzed diagnostics and take exit 3 precedence", () => {
  const c = cell([finding()]),
    bad = {
      dshVersion: "99.0.0",
      status: "unsupported",
      report: null,
      error: "Unreviewed version",
      identity: null,
    };
  const result = evaluateMatrix([c, bad]);
  assert.equal(result.exitCode, 3);
  assert.equal(result.counts.findings, 1);
  assert(result.reasons.some((r) => r.code === "finding"));
  assert(result.reasons.some((r) => r.code === "unsupported-version"));
});
test("baseline matching counts duplicate findings instead of hiding newly repeated calls", () => {
  const p = { ...DEFAULT_POLICY, mode: "new" },
    before = matrix([cell([finding()])]),
    c = cell([finding(), finding()]);
  assert.equal(evaluateMatrix([c], p, before).counts.matched, 1);
  assert.equal(evaluateMatrix([c], p, before).counts.suppressed, 1);
  assert.equal(evaluateMatrix([c], p, before).exitCode, 2);
});
test("severity upgrade and unknown current evidence cannot be baseline suppressed", () => {
  const p = { ...DEFAULT_POLICY, mode: "new" },
    before = matrix([cell([finding("degraded")])]);
  assert.equal(evaluateMatrix([cell([finding()])], p, before).exitCode, 2);
  assert.equal(
    evaluateMatrix([cell([], { unknown: true })], p, before).exitCode,
    1,
  );
});

test("contradictory kernel exit codes invalidate current and previous evidence", () => {
  const c = cell();
  c.kernelExitCode = 2;
  assert.equal(evaluateMatrix([c]).exitCode, 3);
  const before = matrix([cell()]);
  before.cells[0].kernelExitCode = 2;
  assert.equal(
    evaluateMatrix([cell()], { ...DEFAULT_POLICY, mode: "new" }, before)
      .exitCode,
    3,
  );
});

test("programmatic previous evidence uses the same finite serialized input budget", () => {
  const c = cell(),
    previous = matrix([c]);
  previous.limitations = ["x".repeat(8 * 1024 * 1024)];
  const result = evaluateMatrix(
    [c],
    { ...DEFAULT_POLICY, mode: "new" },
    previous,
  );
  assert.equal(result.exitCode, 3);
  assert.match(result.reasons[0].message, /output.*budget/i);
});
