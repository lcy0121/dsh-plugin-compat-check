import test from "node:test";
import assert from "node:assert/strict";
import { renderSarif, renderJUnit } from "../lib/author-ci-output.mjs";
function finding() {
  return {
    category: "host-method-missing",
    severity: "fatal",
    certainty: "certain",
    impactBasis: "inferred",
    impact: "feature unavailable",
    basis: "catalogue",
    location: { file: "index.js", line: 3 },
  };
}
function cell(findings = []) {
  return {
    dshVersion: "0.2.1-rc.2",
    status: "analyzed",
    error: null,
    identity: {
      package: { name: "sample", version: "1.0.0", sha256: "a".repeat(64) },
      rulesSha256: "b".repeat(64),
      catalogSha256: "c".repeat(64),
      toolVersion: "0.1.4",
    },
    report: { plugins: { sample: { findings } } },
  };
}
function matrix(cells) {
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/author-ci",
    toolVersion: "0.1.4",
    identity: cells[0].identity,
    policy: {},
    cells,
    gate: {
      status: "blocked",
      exitCode: 2,
      reasons: cells.flatMap((c) =>
        c.report.plugins.sample.findings.map((f, findingIndex) => ({
          dshVersion: c.dshVersion,
          pluginName: "sample",
          findingIndex,
          code: "finding",
          message: f.impact,
        })),
      ),
    },
    limitations: ["Static evidence; no business acceptance."],
  };
}
test("SARIF preserves evidence and package identity with only actual relative source locations", () => {
  const m = matrix([cell([finding()])]),
    s = renderSarif(m);
  assert.equal(s.version, "2.1.0");
  const r = s.runs[0].results[0];
  assert.equal(r.level, "error");
  assert.equal(r.properties.certainty, "certain");
  assert.equal(r.properties.impactBasis, "inferred");
  assert.equal(r.locations[0].physicalLocation.region.startLine, 3);
  assert.equal(
    r.locations[0].physicalLocation.artifactLocation.uri,
    "index.js",
  );
  assert.equal(s.runs[0].properties.identity.package.sha256, "a".repeat(64));
  for (const file of [
    "/private/tmp/index.js",
    "../escape.js",
    "C:\\secret.js",
  ]) {
    m.cells[0].report.plugins.sample.findings[0].location.file = file;
    assert.equal(renderSarif(m).runs[0].results[0].locations, undefined);
  }
});
test("JUnit maps policy failure and tool errors while XML escaping evidence", () => {
  const f = finding();
  f.impact = 'a < b & "c"';
  const m = matrix([cell([f])]);
  const xml = renderJUnit(m);
  assert.match(xml, /<failure/);
  assert.match(xml, /a &lt; b &amp; &quot;c&quot;/);
  assert.match(xml, /sample/);
  assert.match(xml, /certainty/);
  const bad = matrix([cell()]);
  bad.cells[0].status = "error";
  bad.cells[0].error = "unreadable <file>";
  bad.cells[0].report = null;
  bad.gate = {
    status: "error",
    exitCode: 3,
    reasons: [
      {
        dshVersion: bad.cells[0].dshVersion,
        code: "cell-error",
        message: bad.cells[0].error,
      },
    ],
    counts: {},
  };
  assert.match(renderJUnit(bad), /<error/);
  assert.equal(
    renderSarif(bad).runs[0].invocations[0].executionSuccessful,
    false,
  );
});
test("allowed existing findings remain SARIF diagnostics but do not become JUnit failures", () => {
  const m = matrix([cell([finding()])]);
  m.gate = { status: "pass", exitCode: 0, reasons: [], counts: {} };
  assert.equal(renderSarif(m).runs[0].results.length, 1);
  assert.doesNotMatch(renderJUnit(m), /<failure/);
  assert.match(renderJUnit(m), /business acceptance/i);
});
test("SARIF converts parser zero-based columns to one-based regions", () => {
  const f = finding();
  f.location.column = 0;
  const m = matrix([cell([f])]);
  assert.equal(
    renderSarif(m).runs[0].results[0].locations[0].physicalLocation.region
      .startColumn,
    1,
  );
  f.location.column = 27;
  assert.equal(
    renderSarif(m).runs[0].results[0].locations[0].physicalLocation.region
      .startColumn,
    28,
  );
});
