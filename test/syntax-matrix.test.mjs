import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

// A missing CLI, silently dropped row, or zero exit on mismatch breaks this contract.
test("syntax matrix CLI executes all controlled cases and reports evidence", () => {
  const result = spawnSync(
    process.execPath,
    ["tools/syntax-matrix.mjs", "--json"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.rows.length, 38);
  assert.equal(report.failed, 0);
  assert.ok(report.rows.every((row) => row.pass && row.actual && row.expected));
});

const { matrix, measureSyntaxRow, compareExpectation } = await import(
  "../tools/syntax-matrix.mjs"
);
for (const row of matrix.rows) {
  test("syntax matrix: " + row.id, () => {
    const { actual } = measureSyntaxRow(row);
    assert.deepEqual(actual, row.expected);
  });
}

test("matcher rejects missing or incorrect calls, dropped diagnostics and coverage drift", () => {
  const expected = {
    calls: [["settings.absent", "index.js", false, false, "ast"]],
    diagnostics: ["flow-dynamic-access"],
    coverage: "limited",
  };
  assert.deepEqual(compareExpectation(expected, { ...expected, calls: [] }), [
    "calls",
  ]);
  assert.deepEqual(
    compareExpectation(expected, {
      ...expected,
      calls: [["tools.absent", "index.js", false, false, "ast"]],
    }),
    ["calls"],
  );
  assert.deepEqual(
    compareExpectation(expected, { ...expected, diagnostics: [] }),
    ["diagnostics"],
  );
  assert.deepEqual(
    compareExpectation(expected, { ...expected, coverage: "complete" }),
    ["coverage"],
  );
});

test("CLI mismatch is nonzero and retains expected, actual and source evidence", () => {
  // Trusted test mutation only; the CLI accepts no external fixture path or code.
  const script = `import {matrix,main} from './tools/syntax-matrix.mjs';matrix.rows[0].expected.calls=[];process.exitCode=main(['--json']);`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.failed, 1);
  assert.equal(report.rows[0].pass, false);
  assert.deepEqual(report.rows[0].expected.calls, []);
  assert.deepEqual(report.rows[0].actual.calls, [
    ["settings.absent", "index.js", false, false, "ast"],
  ]);
  assert.equal(report.rows[0].evidence.callSites[0].file, "index.js");
  assert.ok(
    report.rows[0].evidence.callSites[0].end >
      report.rows[0].evidence.callSites[0].start,
  );
});

test("classification preserves weak and partial evidence without claiming runtime certification", () => {
  const byId = Object.fromEntries(
    matrix.rows.map((row) => [row.id, measureSyntaxRow(row)]),
  );
  assert.equal(byId["direct"].actual.classification, "supported");
  assert.deepEqual(byId["direct"].actual.findings, [
    ["host-method-missing", "settings.absent", "certain"],
  ]);
  assert.deepEqual(byId["direct"].actual.catalogueFindings, [
    ["host-method-missing", "settings.absent", "suspected"],
  ]);
  assert.equal(byId["bare-inferred"].actual.classification, "inferred");
  assert.equal(byId["bare-inferred"].actual.findings[0][2], "suspected");
  assert.equal(
    byId["unsupported-condition"].actual.classification,
    "abstained",
  );
  assert.equal(byId["unsupported-condition"].actual.calls.length, 1);
  assert.equal(
    byId["unsupported-condition"].actual.findings[0][2],
    "suspected",
  );
  assert.deepEqual(byId["cjs-inject-mutation"].actual.dependencies, [
    ["settings", "descriptor-inject", true],
  ]);
  assert.equal(byId["dynamic-computed"].actual.coverage, "limited");
  assert.deepEqual(byId["async-return"].actual.calls, [
    ["tools.register", "index.js", false, false, "ast"],
  ]);
  assert.equal(byId["async-return"].actual.coverage, "limited");
});

test("fixture source is parsed without executing even a top-level throw", () => {
  const row = structuredClone(matrix.rows[0]);
  row.source = `throw new Error('MATRIX_TARGET_EXECUTED');\n` + row.source;
  assert.deepEqual(measureSyntaxRow(row).actual, row.expected);
});

test("human CLI prints all rows and rejects unsupported arguments", () => {
  const result = spawnSync(process.execPath, ["tools/syntax-matrix.mjs"], {
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /38\/38 passed/);
  assert.match(result.stdout, /PASS\tsupported\tdirect/);
  assert.match(result.stdout, /PASS\tinferred\tbare-inferred/);
  assert.match(result.stdout, /PASS\tabstained\tdynamic-computed/);
  const invalid = spawnSync(
    process.execPath,
    ["tools/syntax-matrix.mjs", "--fixture=/tmp/untrusted.json"],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Usage:/);
});

// An invalid fixture must never leave a temporary package behind.
test("temporary fixtures are removed after fixture construction errors", () => {
  const roots = () =>
    fs
      .readdirSync(os.tmpdir())
      .filter((name) => name.startsWith("dsc-syntax-matrix-"))
      .sort();
  const before = roots();
  const row = structuredClone(matrix.rows[0]);
  row.files = { "../outside.js": 'throw new Error("must not write")' };
  assert.throws(() => measureSyntaxRow(row), /Fixture path outside package/);
  assert.deepEqual(roots(), before);
});
