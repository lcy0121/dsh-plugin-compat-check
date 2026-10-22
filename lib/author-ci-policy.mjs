/** Pure author CI gate. Kernel reports remain unchanged and independently useful. */
import { assertReportBody, CATALOG_REFERENCES } from "./contracts.mjs";
const severities = ["fatal", "feature-dead", "degraded"];
const certainties = ["certain", "suspected"];
export const DEFAULT_POLICY = Object.freeze({
  schemaVersion: 1,
  mode: "all",
  severities: Object.freeze([...severities]),
  certainties: Object.freeze([...certainties]),
  requireCompleteCoverage: true,
  allowVacuous: false,
});
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const samePackage = (a, b) =>
  a?.name === b?.name && a?.version === b?.version && a?.sha256 === b?.sha256;
const text = (v) => typeof v === "string" && v.length > 0;
const need = (condition, message) => {
  if (!condition) throw Error(message);
};
export function validatePolicy(policy) {
  need(record(policy), "Policy must be an object");
  need(
    Object.keys(policy).length === Object.keys(DEFAULT_POLICY).length &&
      Object.keys(policy).every((k) => Object.hasOwn(DEFAULT_POLICY, k)),
    "Policy has missing or unknown fields",
  );
  need(
    policy.schemaVersion === 1 && ["all", "new"].includes(policy.mode),
    "Invalid policy schemaVersion or mode",
  );
  for (const [key, allowed] of [
    ["severities", severities],
    ["certainties", certainties],
  ])
    need(
      Array.isArray(policy[key]) &&
        policy[key].every((v) => allowed.includes(v)) &&
        new Set(policy[key]).size === policy[key].length,
      "Invalid policy " + key,
    );
  need(
    typeof policy.requireCompleteCoverage === "boolean" &&
      typeof policy.allowVacuous === "boolean",
    "Invalid policy coverage flags",
  );
  return policy;
}
function validIdentity(i) {
  return (
    record(i) &&
    record(i.package) &&
    text(i.package.name) &&
    text(i.package.version) &&
    hash(i.package.sha256) &&
    hash(i.rulesSha256) &&
    hash(i.catalogSha256) &&
    text(i.toolVersion)
  );
}
function validateCells(cells, { baseline = false } = {}) {
  need(
    Array.isArray(cells) && cells.length > 0,
    "Matrix requires at least one version cell",
  );
  const seen = new Set();
  let first;
  for (const c of cells) {
    need(
      record(c) && text(c.dshVersion) && !seen.has(c.dshVersion),
      "Missing or duplicate matrix version",
    );
    seen.add(c.dshVersion);
    need(
      ["analyzed", "unsupported", "error"].includes(c.status),
      "Invalid matrix cell status",
    );
    if (c.status !== "analyzed") {
      need(!baseline, "Previous matrix contains unavailable evidence");
      need(c.report === null && text(c.error), "Invalid failed cell");
      continue;
    }
    need(
      c.error === null && validIdentity(c.identity),
      "Invalid analyzed cell identity",
    );
    assertReportBody(c.report);
    need(
      c.kernelExitCode === c.report.exitCode,
      "Cell kernel exit code mismatch",
    );
    const r = c.report,
      i = c.identity,
      cat = CATALOG_REFERENCES.find((x) => x.version === c.dshVersion);
    need(
      r.ok === true &&
        r.dshVersion === c.dshVersion &&
        r.toolVersion === i.toolVersion,
      "Cell report identity mismatch",
    );
    need(
      cat &&
        i.catalogSha256 === cat.sha256 &&
        r.catalog?.verified === true &&
        r.catalog.sha256 === i.catalogSha256,
      "Cell catalogue identity mismatch",
    );
    need(
      Object.keys(r.plugins).length === 1 &&
        r.plugins[i.package.name]?.version === i.package.version,
      "Selected package/report mismatch",
    );
    if (first)
      need(
        samePackage(i.package, first.package) &&
          i.rulesSha256 === first.rulesSha256 &&
          i.toolVersion === first.toolVersion,
        "Cross-cell identity mismatch",
      );
    else first = i;
  }
}
function validatePrevious(previous, cells) {
  need(
    record(previous) &&
      previous.schemaVersion === 1 &&
      previous.kind === "plugin-compat-check/author-ci",
    "Previous matrix schema mismatch",
  );
  validatePolicy(previous.policy);
  validateCells(previous.cells, { baseline: true });
  const current = cells.filter((c) => c.status === "analyzed");
  need(
    current.length === cells.length,
    "Current matrix contains unavailable evidence",
  );
  need(
    previous.cells.length === cells.length,
    "Previous version matrix differs",
  );
  need(
    record(previous.identity) && record(previous.identity.package),
    "Previous matrix identity missing",
  );
  const head = previous.cells[0].identity;
  need(
    previous.toolVersion === head.toolVersion &&
      samePackage(previous.identity.package, head.package) &&
      previous.identity.rulesSha256 === head.rulesSha256,
    "Previous matrix identity mismatch",
  );
  for (const c of current) {
    const p = previous.cells.find((x) => x.dshVersion === c.dshVersion);
    need(
      p &&
        p.identity.package.name === c.identity.package.name &&
        p.identity.toolVersion === c.identity.toolVersion &&
        p.identity.rulesSha256 === c.identity.rulesSha256 &&
        p.identity.catalogSha256 === c.identity.catalogSha256,
      "Previous evidence is not comparable",
    );
  }
}
function findingKey(f) {
  return JSON.stringify([
    f.category,
    f.service ?? null,
    f.method ?? null,
    f.location?.file ?? null,
    f.location?.line ?? null,
    f.location?.column ?? null,
    f.severity,
    f.certainty,
  ]);
}
export function evaluateMatrix(
  cells,
  policy = DEFAULT_POLICY,
  previous = null,
) {
  const reasons = [],
    counts = {
      cells: Array.isArray(cells) ? cells.length : 0,
      analyzed: 0,
      findings: 0,
      matched: 0,
      suppressed: 0,
      errors: 0,
    };
  const finish = (exitCode) => ({
    status: exitCode === 0 ? "pass" : exitCode === 3 ? "error" : "blocked",
    exitCode,
    reasons,
    counts,
  });
  try {
    validatePolicy(policy);
    validateCells(cells);
    if (policy.mode === "new") validatePrevious(previous, cells);
  } catch (error) {
    reasons.push({
      dshVersion: null,
      code: "invalid-evidence",
      message: error.message,
    });
    counts.errors++;
    return finish(3);
  }
  let fatal = false,
    risk = false,
    tool = false;
  for (const c of cells) {
    if (c.status !== "analyzed") {
      tool = true;
      counts.errors++;
      reasons.push({
        dshVersion: c.dshVersion,
        code: c.status === "unsupported" ? "unsupported-version" : "cell-error",
        message: c.error,
      });
      continue;
    }
    counts.analyzed++;
    const add = (code, message, pluginName) => {
      risk = true;
      reasons.push({
        dshVersion: c.dshVersion,
        ...(pluginName ? { pluginName } : {}),
        code,
        message,
      });
    };
    if (c.report.extraction.scanComplete !== true)
      add("incomplete-extraction", "Selected source extraction is incomplete");
    for (const [pluginName, p] of Object.entries(c.report.plugins)) {
      if (p.verdict === "unknown")
        add("unknown-verdict", "Plugin verdict is unknown", pluginName);
      if (policy.requireCompleteCoverage && p.coverage.status !== "complete")
        add(
          "incomplete-coverage",
          p.coverage.limitations.join("; ") || "Coverage is limited",
          pluginName,
        );
      if (!policy.allowVacuous && p.vacuous)
        add(
          "vacuous",
          "No verified calls; this is not business acceptance",
          pluginName,
        );
      const prev =
        policy.mode === "new"
          ? previous.cells.find((x) => x.dshVersion === c.dshVersion).report
              .plugins[pluginName]
          : null;
      const old = new Map();
      for (const f of prev?.findings || [])
        old.set(findingKey(f), (old.get(findingKey(f)) || 0) + 1);
      p.findings.forEach((f, findingIndex) => {
        counts.findings++;
        if (
          !policy.severities.includes(f.severity) ||
          !policy.certainties.includes(f.certainty)
        )
          return;
        const key = findingKey(f);
        if (old.get(key) > 0) {
          old.set(key, old.get(key) - 1);
          counts.suppressed++;
          return;
        }
        counts.matched++;
        risk = true;
        if (f.severity === "fatal") fatal = true;
        reasons.push({
          dshVersion: c.dshVersion,
          pluginName,
          findingIndex,
          code: "finding",
          message: `${f.severity}/${f.certainty}: ${f.category}: ${f.impact}`,
        });
      });
    }
  }
  return finish(tool ? 3 : fatal ? 2 : risk ? 1 : 0);
}
