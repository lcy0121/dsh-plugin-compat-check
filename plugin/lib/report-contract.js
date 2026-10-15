// Generated from lib/contracts.mjs; run node plugin/scripts/stage-contract.mjs
/** Browser-safe runtime type contracts. No imports: staged into the prebuilt
 * client and plugin host from this single source. Unknown additive fields are
 * preserved. Version changes or missing evidence fail closed as tool errors.
 * @typedef {{status:'complete'|'limited',verifiedCalls:number,limitations:string[]}} Coverage
 * @typedef {{category:string,severity:'fatal'|'feature-dead'|'degraded',certainty:'certain'|'suspected',impactBasis:'measured'|'inferred',location:object|null}} Finding
 * @typedef {{mode:'catalogue'|'runtime',bound:boolean,usable:boolean,notes:string[],profileId:string|null,dshVersion:string|null,probedAt:string|null}} Observation
 */
export const REPORT_SCHEMA = 1;
export const REPORT_KIND = "plugin-compat-check/result";
export const ENVELOPE_KIND = "plugin-compat-check/report";
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.length > 0;
const nullableText = (v) => v === null || typeof v === "string";
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const strings = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const verdicts = ["ok", "partial", "broken", "unknown"];
const severities = ["fatal", "feature-dead", "degraded"];
const certainties = ["certain", "suspected"];
function need(errors, condition, path) {
  if (!condition) errors.push(path);
}
export function exitCodeForSummary(summary) {
  return summary.broken > 0
    ? 2
    : summary.partial > 0 || summary.unknown > 0
      ? 1
      : 0;
}
export function createFailure(error, options = {}) {
  return {
    ...options,
    schemaVersion: REPORT_SCHEMA,
    kind: REPORT_KIND,
    ok: false,
    exitCode: 3,
    toolVersion: options.toolVersion ?? null,
    error: String(error || "Unknown tool error"),
    inputs: options.inputs || {},
  };
}
export function validateObservation(value) {
  const e = [];
  if (!record(value)) return ["observation"];
  need(e, ["runtime", "catalogue"].includes(value.mode), "observation.mode");
  need(e, typeof value.bound === "boolean", "observation.bound");
  need(e, typeof value.usable === "boolean", "observation.usable");
  need(e, strings(value.notes), "observation.notes");
  for (const key of ["profileId", "dshVersion", "probedAt"])
    need(e, nullableText(value[key]), "observation." + key);
  if (value.probedAt !== null)
    need(
      e,
      Number.isFinite(Date.parse(value.probedAt)),
      "observation.probedAt",
    );
  need(
    e,
    (value.mode === "runtime") === value.usable,
    "observation.mode/usable",
  );
  return e;
}
export function validateFinding(f) {
  const e = [];
  if (!record(f)) return ["finding"];
  need(e, text(f.category), "finding.category");
  need(e, severities.includes(f.severity), "finding.severity");
  need(e, certainties.includes(f.certainty), "finding.certainty");
  need(
    e,
    ["inferred", "measured"].includes(f.impactBasis),
    "finding.impactBasis",
  );
  need(e, text(f.impact), "finding.impact");
  need(e, text(f.basis), "finding.basis");
  for (const key of ["service", "method"])
    if (f[key] !== undefined) need(e, nullableText(f[key]), "finding." + key);
  need(
    e,
    f.location === null ||
      (record(f.location) &&
        text(f.location.file) &&
        Number.isSafeInteger(f.location.line) &&
        f.location.line > 0),
    "finding.location",
  );
  if (f.evidence !== undefined) need(e, record(f.evidence), "finding.evidence");
  if (record(f.location)) {
    for (const key of ["column", "start", "end"])
      if (f.location[key] !== undefined && f.location[key] !== null)
        need(e, integer(f.location[key]), "finding.location." + key);
    if (integer(f.location.start) && integer(f.location.end))
      need(e, f.location.end >= f.location.start, "finding.location.span");
  }
  return e;
}
export function validateBaseline(value) {
  const e = [];
  if (!record(value) || value.schemaVersion !== 2)
    return ["baseline.schemaVersion"];
  need(e, nullableText(value.dshVersion), "baseline.dshVersion");
  need(
    e,
    record(value.identity) && text(value.identity.mode),
    "baseline.identity",
  );
  if (!record(value.plugins)) return [...e, "baseline.plugins"];
  for (const [name, p] of Object.entries(value.plugins)) {
    if (!record(p)) {
      e.push("baseline.plugin:" + name);
      continue;
    }
    need(
      e,
      nullableText(p.version) && verdicts.includes(p.verdict),
      "baseline.plugin:" + name,
    );
    need(e, Array.isArray(p.findings), "baseline.findings:" + name);
    if (p.vacuous !== undefined)
      need(e, typeof p.vacuous === "boolean", "baseline.vacuous:" + name);
    for (const f of Array.isArray(p.findings) ? p.findings : []) {
      if (!record(f)) {
        e.push("baseline.finding:" + name);
        continue;
      }
      need(
        e,
        text(f.key) &&
          text(f.category) &&
          severities.includes(f.severity) &&
          certainties.includes(f.certainty) &&
          nullableText(f.location),
        "baseline.finding:" + name,
      );
    }
  }
  return e;
}
function validateBaselineResult(b) {
  if (b === null) return [];
  const e = [];
  if (!record(b)) return ["baseline result"];
  if (b.error !== undefined) {
    need(e, text(b.error) && text(b.note), "baseline.error");
    return e;
  }
  need(e, typeof b.wrote === "boolean", "baseline.wrote");
  need(e, record(b.badge), "baseline.badge");
  if (b.diff !== null) {
    need(
      e,
      record(b.diff) && typeof b.diff.comparable === "boolean",
      "baseline.diff",
    );
    if (record(b.diff))
      for (const key of ["added", "removed", "worsened", "improved", "updated"])
        need(e, Array.isArray(b.diff[key]), "baseline.diff." + key);
  }
  return e;
}
export function validateReportBody(body) {
  const e = [];
  if (!record(body)) return ["report"];
  need(
    e,
    body.schemaVersion === REPORT_SCHEMA && body.kind === REPORT_KIND,
    "report.schemaVersion/kind",
  );
  need(e, typeof body.ok === "boolean", "report.ok");
  need(e, nullableText(body.toolVersion), "report.toolVersion");
  need(e, record(body.inputs), "report.inputs");
  if (body.ok === false) {
    need(e, body.exitCode === 3 && text(body.error), "report.error/exitCode");
    return e;
  }
  need(e, body.error === null, "report.error");
  need(e, nullableText(body.dshVersion), "report.dshVersion");
  e.push(...validateObservation(body.observation));
  e.push(...validateBaselineResult(body.baseline));
  const summary = body.summary,
    plugins = body.plugins;
  if (!record(summary) || !record(plugins))
    return [...e, "report.summary/plugins"];
  for (const key of [...verdicts, "limited", "vacuousOk"])
    need(e, integer(summary[key]), "summary." + key);
  const counts = {
    ok: 0,
    partial: 0,
    broken: 0,
    unknown: 0,
    limited: 0,
    vacuousOk: 0,
  };
  for (const [name, p] of Object.entries(plugins)) {
    if (!record(p)) {
      e.push("plugin:" + name);
      continue;
    }
    need(
      e,
      p.name === name &&
        nullableText(p.version) &&
        verdicts.includes(p.verdict),
      "plugin.identity/verdict:" + name,
    );
    need(e, typeof p.vacuous === "boolean", "plugin.vacuous:" + name);
    if (verdicts.includes(p.verdict)) counts[p.verdict]++;
    if (p.vacuous && p.verdict === "ok") counts.vacuousOk++;
    const c = p.coverage;
    need(
      e,
      record(c) &&
        ["complete", "limited"].includes(c.status) &&
        integer(c.verifiedCalls) &&
        strings(c.limitations),
      "plugin.coverage:" + name,
    );
    if (c?.status === "limited") counts.limited++;
    for (const key of [
      "findings",
      "checked",
      "clientSide",
      "filtered",
      "abstained",
      "runtimeFacilities",
    ])
      need(e, Array.isArray(p[key]), "plugin." + key + ":" + name);
    if (Array.isArray(p.findings))
      for (const f of p.findings)
        e.push(...validateFinding(f).map((x) => name + ":" + x));
    if (Array.isArray(p.findings) && p.verdict !== "unknown") {
      const expected = p.findings.some((f) => f?.severity === "fatal")
        ? "broken"
        : p.findings.length
          ? "partial"
          : "ok";
      need(e, p.verdict === expected, "plugin.verdict/findings:" + name);
    }
    if (record(c) && strings(c.limitations) && Array.isArray(p.clientSide))
      need(
        e,
        (c.status === "limited") ===
          (c.limitations.length > 0 ||
            p.clientSide.length > 0 ||
            p.vacuous === true),
        "plugin.coverage/status:" + name,
      );
    need(e, record(p.resolved), "plugin.resolved:" + name);
  }
  for (const key of Object.keys(counts))
    need(e, counts[key] === summary[key], "summary.count:" + key);
  need(e, body.exitCode === exitCodeForSummary(summary), "report.exitCode");
  need(
    e,
    record(body.extraction) &&
      typeof body.extraction.scanComplete === "boolean" &&
      Array.isArray(body.extraction.diagnostics) &&
      Array.isArray(body.extraction.manifests),
    "report.extraction",
  );
  return e;
}
export function assertReportBody(body) {
  const errors = validateReportBody(body);
  if (errors.length) throw new Error("报告契约不匹配: " + errors.join(", "));
  return body;
}
export function sealReportBody(input) {
  const observation = input.observation || {};
  const plugins = Object.fromEntries(
    Object.entries(input.plugins || {}).map(([name, p]) => [
      name,
      {
        ...p,
        findings: p.findings.map((f) => ({
          ...f,
          location: f.location ?? null,
        })),
      },
    ]),
  );
  return assertReportBody({
    ...input,
    schemaVersion: REPORT_SCHEMA,
    kind: REPORT_KIND,
    ok: true,
    error: null,
    exitCode: exitCodeForSummary(input.summary),
    summary: { limited: 0, vacuousOk: 0, ...input.summary },
    plugins,
    observation: {
      profileId: null,
      dshVersion: null,
      probedAt: null,
      ...observation,
    },
    baseline: input.baseline ?? null,
  });
}
export function failureEnvelope(error, options = {}) {
  const report = createFailure(error, {
    toolVersion: options.toolVersion ?? null,
    inputs: options.report?.inputs || {},
  });
  return {
    ...options,
    schemaVersion: REPORT_SCHEMA,
    kind: ENVELOPE_KIND,
    ok: false,
    error: report.error,
    exitCode: 3,
    toolVersion: report.toolVersion,
    baseline: null,
    report,
  };
}
export function validateEnvelope(data) {
  if (
    !record(data) ||
    data.schemaVersion !== REPORT_SCHEMA ||
    data.kind !== ENVELOPE_KIND
  )
    return ["envelope.schemaVersion/kind"];
  const e = validateReportBody(data.report);
  need(
    e,
    typeof data.ok === "boolean" && data.ok === data.report?.ok,
    "envelope.ok",
  );
  need(e, data.exitCode === data.report?.exitCode, "envelope.exitCode");
  need(e, data.error === data.report?.error, "envelope.error");
  need(
    e,
    data.toolVersion === data.report?.toolVersion,
    "envelope.toolVersion",
  );
  need(
    e,
    JSON.stringify(data.baseline) ===
      JSON.stringify(data.report?.baseline ?? null),
    "envelope.baseline",
  );
  return e;
}
export function assertEnvelope(data) {
  const errors = validateEnvelope(data);
  if (errors.length) throw new Error("报告契约不匹配: " + errors.join(", "));
  return data;
}
