/** Repository-controlled syntax characterization. Never executes target source. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";

const catalog = {
  host: { settings: { methods: ["known"] }, tools: { methods: ["register"] } },
  client: {},
};
export const matrix = JSON.parse(
  fs.readFileSync(
    new URL("../test/fixtures/syntax-matrix.json", import.meta.url),
    "utf8",
  ),
);
const sort = (values) =>
  values.sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b), "en"),
  );
const findingSummary = (verdict) =>
  sort(
    verdict.findings.map((f) => [
      f.category,
      f.service + (f.method ? "." + f.method : ""),
      f.certainty,
    ]),
  );

// Pure exported matcher permits mutation tests without exposing arbitrary CLI fixtures.
export function compareExpectation(expected, actual) {
  return [
    ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
  ].filter((key) => !isDeepStrictEqual(expected[key], actual[key]));
}

export function measureSyntaxRow(row) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-syntax-matrix-"));
  try {
    const nm = path.join(root, "node_modules"),
      pkg = path.join(nm, "sample");
    fs.mkdirSync(pkg, { recursive: true });
    const files = {
      "index.js": row.source,
      ...row.files,
      "cordis.patch.yml": row.patch ?? "- name: sample\n",
      "package.json": JSON.stringify({
        name: "sample",
        version: "1.0.0",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
        ...row.meta,
      }),
    };
    for (const [name, content] of Object.entries(files)) {
      const target = path.resolve(pkg, name);
      if (!target.startsWith(pkg + path.sep))
        throw new Error("Fixture path outside package");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const { report } = extractWithProvenance(nm, { catalog });
    const p = report.perPlugin.sample;
    const base = { report, catalog, dshVersion: "0.2.0" };
    const catalogue = buildVerdicts(base).plugins.sample;
    // Synthetic observation, not a real DSH runtime or business execution.
    const observed = buildVerdicts({
      ...base,
      hostSurface: {
        observationVersion: 1,
        profileId: nm,
        dshVersion: "0.2.0",
        probedAt: new Date().toISOString(),
        root: {
          settings: { present: true, methods: { known: "function" } },
          tools: { present: true, methods: { register: "function" } },
          ...row.observation,
        },
      },
      observationTarget: { profileId: nm },
    }).plugins.sample;
    const diagnostics = [...new Set(p.diagnostics.map((d) => d.kind))].sort();
    const actual = {
      classification: diagnostics.length
        ? "abstained"
        : p.callSites.some((s) => s.inferredReceiver)
          ? "inferred"
          : "supported",
      calls: sort(
        p.callSites.map((s) => [
          `${s.service}.${s.method}`,
          s.file,
          s.inferredReceiver,
          s.guarded,
          s.evidenceSource,
        ]),
      ),
      dependencies: sort(
        p.dependencies.map((d) => [d.service, d.kind, d.inferred]),
      ),
      diagnostics,
      coverage: observed.coverage.status,
      findings: findingSummary(observed),
      catalogueFindings: findingSummary(catalogue),
    };
    return {
      actual,
      evidence: {
        callSites: p.callSites,
        diagnostics: p.diagnostics,
        dependencies: p.dependencies,
        coverage: observed.coverage,
        catalogueCoverage: catalogue.coverage,
      },
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

export function runSyntaxMatrix() {
  const rows = matrix.rows.map((row) => {
    try {
      const { actual, evidence } = measureSyntaxRow(row);
      const mismatches = compareExpectation(row.expected, actual);
      return {
        id: row.id,
        title: row.title,
        pass: !mismatches.length,
        expected: row.expected,
        actual,
        mismatches,
        evidence,
      };
    } catch (error) {
      return {
        id: row.id,
        title: row.title,
        pass: false,
        expected: row.expected,
        error: error.message,
      };
    }
  });
  return {
    schemaVersion: 1,
    scope:
      "Controlled static syntax fixtures; synthetic host evidence; no target execution or business certification",
    total: rows.length,
    failed: rows.filter((r) => !r.pass).length,
    rows,
  };
}

export function main(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== "--json"))
    throw new Error("Usage: node tools/syntax-matrix.mjs [--json]");
  const report = runSyntaxMatrix();
  if (args.includes("--json"))
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  else {
    console.log(report.scope);
    console.log("RESULT\tCLASS\tCASE\tDETAIL");
    for (const row of report.rows) {
      console.log(
        `${row.pass ? "PASS" : "FAIL"}\t${row.expected.classification}\t${row.id}\t${row.title}`,
      );
      if (!row.pass) console.log(JSON.stringify(row, null, 2));
    }
    console.log(`${report.total - report.failed}/${report.total} passed`);
  }
  return report.failed ? 1 : 0;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
