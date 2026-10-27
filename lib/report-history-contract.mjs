/** Browser-safe immutable report snapshots. History is evidence, never current certification. */
import { validateReportBody } from "./contracts.mjs";
import { snapshotForBaseline, diffAgainstBaseline } from "./baseline.mjs";
export const REPORT_HISTORY_LIMITS = Object.freeze({
  files: 20,
  fileBytes: 8 * 1024 * 1024,
  totalBytes: 64 * 1024 * 1024,
  label: 120,
});
const safe = (x) =>
  typeof x === "string" &&
  x.length > 0 &&
  x.length <= 4096 &&
  !/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(x);
const hex = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
export function validateReportSnapshot(value) {
  const fail = () => {
    throw Error("Invalid historical report snapshot / 历史报告身份或结构无效");
  };
  if (
    !value ||
    Object.keys(value).sort().join(",") !==
      "computedAt,identity,kind,label,report,savedAt,schemaVersion" ||
    value.schemaVersion !== 1 ||
    value.kind !== "plugin-compat-check/report-snapshot" ||
    typeof value.label !== "string" ||
    value.label.length > REPORT_HISTORY_LIMITS.label ||
    /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/u.test(value.label) ||
    !value.identity ||
    Object.keys(value.identity).sort().join(",") !==
      "catalogSha256,dshVersion,mode,originalPath,profileId,rulesSha256,sourceSha256,toolVersion"
  )
    fail();
  const i = value.identity;
  for (const field of [
    "profileId",
    "originalPath",
    "toolVersion",
    "dshVersion",
    "mode",
  ])
    if (!safe(i[field])) fail();
  for (const field of ["rulesSha256", "catalogSha256", "sourceSha256"])
    if (!hex(i[field])) fail();
  for (const field of ["savedAt", "computedAt"])
    if (
      typeof value[field] !== "string" ||
      value[field].length > 40 ||
      !Number.isFinite(Date.parse(value[field]))
    )
      fail();
  if (
    !value.report?.ok ||
    validateReportBody(value.report).length ||
    value.report.toolVersion !== i.toolVersion ||
    value.report.dshVersion !== i.dshVersion ||
    value.report.observation.mode !== i.mode ||
    value.report.catalog?.sha256 !== i.catalogSha256 ||
    value.report.inputs.nodeModules !== i.originalPath
  )
    fail();
  return value;
}
function findingEvidenceWeakened(previous, next) {
  const key = (f) =>
    JSON.stringify([
      f.category,
      f.service ?? null,
      f.method ?? null,
      f.location?.file ?? null,
      f.location?.line ?? null,
      f.location?.column ?? null,
      f.evidence?.entryId ?? null,
    ]);
  const prior = new Map();
  for (const finding of previous.findings) {
    const id = key(finding),
      known = prior.get(id) || { certain: false, measured: false };
    known.certain ||= finding.certainty === "certain";
    known.measured ||= finding.impactBasis === "measured";
    prior.set(id, known);
  }
  return next.findings.some((finding) => {
    const known = prior.get(key(finding));
    return (
      known &&
      ((known.certain && finding.certainty !== "certain") ||
        (known.measured && finding.impactBasis !== "measured"))
    );
  });
}
export function compareReportSnapshots(previous, next) {
  try {
    validateReportSnapshot(previous);
    validateReportSnapshot(next);
  } catch {
    return {
      comparable: false,
      reason: "历史报告结构或身份无效，不能判断改善或恶化。",
      rows: [],
    };
  }
  const fields = [
      "profileId",
      "originalPath",
      "dshVersion",
      "toolVersion",
      "mode",
      "rulesSha256",
      "catalogSha256",
    ],
    changed = fields.filter((k) => previous.identity[k] !== next.identity[k]);
  if (changed.length)
    return {
      comparable: false,
      reason:
        "目标、版本、采样或判定身份不同：" +
        changed.join("、") +
        "；仅可并列阅读，不判断改善或恶化。",
      rows: [],
    };
  const diff = diffAgainstBaseline(
    snapshotForBaseline(previous.report, previous.identity.dshVersion),
    snapshotForBaseline(next.report, next.identity.dshVersion),
  );
  if (!diff.comparable)
    return { comparable: false, reason: diff.reason, rows: [] };
  const worsened = new Map(diff.worsened.map((r) => [r.name, r])),
    improved = new Map(diff.improved.map((r) => [r.name, r]));
  const names = [
    ...new Set([
      ...Object.keys(previous.report.plugins),
      ...Object.keys(next.report.plugins),
    ]),
  ].sort();
  return {
    comparable: true,
    reason:
      "仅为相同判定身份的历史静态/观测报告差分；不代表业务验收，历史不认证当前目标。",
    sourceChanged:
      previous.identity.sourceSha256 !== next.identity.sourceSha256,
    rows: names.map((name) => {
      const a = previous.report.plugins[name],
        b = next.report.plugins[name],
        worse = worsened.get(name),
        better = improved.get(name),
        weaker =
          a &&
          b &&
          ((previous.report.observation.bound &&
            !next.report.observation.bound) ||
            (previous.report.hasRuntimeSurface &&
              !next.report.hasRuntimeSurface) ||
            findingEvidenceWeakened(a, b) ||
            (a.coverage.status === "complete" &&
              b.coverage.status !== "complete") ||
            b.coverage.verifiedCalls < a.coverage.verifiedCalls ||
            (!a.vacuous && b.vacuous) ||
            b.coverage.limitations.some(
              (note) => !a.coverage.limitations.includes(note),
            ));
      return {
        name,
        from: a
          ? {
              version: a.version,
              verdict: a.verdict,
              findings: a.findings.length,
            }
          : null,
        to: b
          ? {
              version: b.version,
              verdict: b.verdict,
              findings: b.findings.length,
            }
          : null,
        direction: !a
          ? "added"
          : !b
            ? "removed"
            : worse
              ? "worsened"
              : weaker
                ? "evidence-weaker"
                : better
                  ? "improved"
                  : a.version !== b.version
                    ? "updated"
                    : "unchanged",
        addedFindings: worse?.newFindings || [],
        removedFindings: better?.goneFindings || [],
      };
    }),
  };
}
