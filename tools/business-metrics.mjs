/** Feature API-risk predictions vs independent UI + durable-state observations.
 * No loader answers, browser outcomes or fault controls enter the predictor.
 */
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const identityKeys = [
  "sampleId",
  "suiteId",
  "artifactDigest",
  "dshVersion",
  "toolVersion",
];
function identityOf(value) {
  const out = {};
  for (const k of identityKeys) {
    if (typeof value[k] !== "string" || !value[k])
      throw Error("Missing business identity: " + k);
    out[k] = value[k];
  }
  return out;
}
export function businessOutcome(observed) {
  if (!object(observed)) throw Error("Malformed business postconditions");
  if (observed.harnessError !== undefined) {
    if (typeof observed.harnessError !== "string")
      throw Error("Malformed harness error");
    return "harness-error";
  }
  for (const k of ["persisted", "uiAfterReload", "actionAvailable"])
    if (observed[k] !== undefined && typeof observed[k] !== "boolean")
      throw Error("Malformed business postcondition: " + k);
  if (
    observed.requestStatus !== undefined &&
    (!Number.isInteger(observed.requestStatus) ||
      observed.requestStatus < 100 ||
      observed.requestStatus > 599)
  )
    throw Error("Malformed request postcondition");
  if (observed.actionAvailable === false) {
    if (observed.requestStatus !== undefined)
      throw Error("Unavailable action contradicts HTTP receipt");
    return "failed";
  }
  if (
    observed.requestStatus === undefined ||
    observed.persisted === undefined ||
    observed.uiAfterReload === undefined
  )
    return "unobserved";
  return observed.requestStatus >= 200 &&
    observed.requestStatus < 300 &&
    observed.persisted &&
    observed.uiAfterReload
    ? "passed"
    : "failed";
}
export function featurePredictions(report, features, identity) {
  const rows = features.map((feature) => {
    const p = report.plugins?.[feature.plugin];
    if (!p) throw Error("Missing predicted feature plugin: " + feature.plugin);
    const findings = (p.findings || []).filter(
      (f) =>
        f.severity === "fatal" ||
        f.category === "declared-incompatible" ||
        (f.severity === "feature-dead" &&
          feature.spans.some(
            (s) =>
              f.location?.file === s.file &&
              Number.isInteger(f.location.line) &&
              f.location.line >= s.start &&
              f.location.line <= s.end,
          )),
    );
    return {
      featureId: feature.id,
      flagged: findings.length > 0,
      coverageLimited: p.coverage?.status !== "complete",
      clientVerified: false,
      findings: findings.map((f) => ({
        category: f.category,
        severity: f.severity,
        service: f.service ?? null,
        method: f.method ?? null,
        location: f.location ?? null,
        impactBasis: f.impactBasis ?? "inferred",
      })),
    };
  });
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-predictions",
    ...identityOf(identity),
    predictedAt: new Date().toISOString(),
    rows,
  };
}
const empty = () => ({
  scored: 0,
  unscored: 0,
  truePositive: 0,
  falsePositive: 0,
  falseNegative: 0,
  trueNegative: 0,
  precision: null,
  recall: null,
});
export function scoreBusiness(predictions, labels) {
  if (
    predictions?.schemaVersion !== 1 ||
    predictions.kind !== "plugin-compat-check/business-predictions" ||
    labels?.schemaVersion !== 1 ||
    labels.kind !== "plugin-compat-check/business-labels" ||
    labels.source !== "browser-action+profile-state" ||
    !Array.isArray(predictions.rows) ||
    !Array.isArray(labels.rows)
  )
    throw Error("Unsupported business artifact schema/source");
  const context = predictions.predictionContext;
  if (
    context !== undefined &&
    (!object(context) ||
      ![
        "feature-scoped-static-api-risk",
        "feature-scoped-service-observed-api-risk",
      ].includes(context.mode) ||
      (context.mode === "feature-scoped-service-observed-api-risk" &&
        (context.rootOnly !== true ||
          typeof context.observationSha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(context.observationSha256))) ||
      (context.mode === "feature-scoped-static-api-risk" &&
        (context.rootOnly !== undefined ||
          context.observationSha256 !== undefined)))
  )
    throw Error("Unsupported business prediction context");
  const identity = identityOf(predictions);
  for (const k of identityKeys)
    if (labels[k] !== identity[k])
      throw Error("Business identity mismatch: " + k);
  if (!/^[a-f0-9]{64}$/.test(identity.artifactDigest))
    throw Error("Invalid artifact digest");
  if (
    !Number.isFinite(Date.parse(predictions.predictedAt)) ||
    !Number.isFinite(Date.parse(labels.collectedAt)) ||
    Date.parse(labels.collectedAt) < Date.parse(predictions.predictedAt)
  )
    throw Error("Business label time precedes prediction time");
  const byFeature = new Map();
  for (const row of predictions.rows) {
    if (
      typeof row.featureId !== "string" ||
      !row.featureId ||
      typeof row.flagged !== "boolean" ||
      byFeature.has(row.featureId)
    )
      throw Error("Invalid or duplicate prediction feature");
    byFeature.set(row.featureId, row);
  }
  if (!Array.isArray(predictions.casePlan) || !predictions.casePlan.length)
    throw Error("Missing sealed planned cases");
  const plan = new Map();
  for (const c of predictions.casePlan) {
    if (
      !c ||
      typeof c.caseId !== "string" ||
      !c.caseId ||
      plan.has(c.caseId) ||
      !byFeature.has(c.featureId) ||
      !["none", "http-503", "dom-control-missing"].includes(c.control)
    )
      throw Error("Invalid planned business case");
    plan.set(c.caseId, c);
  }
  if (
    [...byFeature.keys()].some(
      (id) => ![...plan.values()].some((c) => c.featureId === id),
    )
  )
    throw Error("Incomplete planned feature coverage");
  if (labels.rows.length !== plan.size)
    throw Error("Incomplete planned business cases");
  const metrics = { baseline: empty(), faultInjected: empty() },
    ids = new Set(),
    rows = [];
  for (const row of labels.rows) {
    if (typeof row.caseId !== "string" || !row.caseId || ids.has(row.caseId))
      throw Error("Duplicate or missing business case id");
    ids.add(row.caseId);
    const expected = plan.get(row.caseId);
    if (
      !expected ||
      expected.featureId !== row.featureId ||
      expected.control !== row.control
    )
      throw Error("Business case feature/control differs from sealed plan");
    if (!byFeature.has(row.featureId)) throw Error("Unknown business feature");
    if (!["none", "http-503", "dom-control-missing"].includes(row.control))
      throw Error("Unknown business case control");
    const p = byFeature.get(row.featureId),
      outcome = businessOutcome(row.observed),
      m = metrics[row.control === "none" ? "baseline" : "faultInjected"];
    if (row.outcome !== undefined && row.outcome !== outcome)
      throw Error("Business label contradicts postconditions");
    let classification = "unscored";
    if (outcome === "unobserved" || outcome === "harness-error") m.unscored++;
    else {
      m.scored++;
      classification =
        outcome === "failed"
          ? p.flagged
            ? "truePositive"
            : "falseNegative"
          : p.flagged
            ? "falsePositive"
            : "trueNegative";
      m[classification]++;
    }
    rows.push({
      caseId: row.caseId,
      featureId: row.featureId,
      control: row.control,
      outcome,
      flagged: p.flagged,
      classification,
      coverageLimited: p.coverageLimited,
      clientVerified: p.clientVerified,
    });
  }
  for (const m of Object.values(metrics)) {
    m.precision =
      m.truePositive + m.falsePositive
        ? m.truePositive / (m.truePositive + m.falsePositive)
        : null;
    m.recall =
      m.truePositive + m.falseNegative
        ? m.truePositive / (m.truePositive + m.falseNegative)
        : null;
  }
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-measurement",
    ...identity,
    rows,
    metrics,
    prediction: {
      mode: context?.mode || "feature-scoped-static-api-risk",
      ...(context?.mode === "feature-scoped-service-observed-api-risk"
        ? { rootOnly: true, observationSha256: context.observationSha256 }
        : {}),
      businessLabelsUsed: false,
      loaderLabelsUsed: false,
      autoProbeDiscovery: false,
    },
    scope:
      "No API-risk warning is not business success. Limited/client coverage remains disclosed. Baseline and controlled HTTP/DOM faults are separate cohorts; neither measures ecosystem accuracy. Historical paired artifacts can be replayed, not treated as current runtime evidence.",
  };
}
export function businessExitCode(report) {
  const m = Object.values(report.metrics);
  if (!m.some((v) => v.scored)) return 3;
  if (m.some((v) => v.falsePositive || v.falseNegative || v.unscored)) return 1;
  return 0;
}
