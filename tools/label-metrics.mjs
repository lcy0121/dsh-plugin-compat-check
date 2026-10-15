/** Offline scoring. Gold loader rows never enter the compatibility predictor. */
import { normalizeObservation } from "../lib/observation.mjs";

const STATES = [
  "PENDING",
  "LOADING",
  "ACTIVE",
  "FAILED",
  "DISPOSED",
  "UNLOADING",
];
const stateName = (code) => STATES[code] || "NO_FIBER_OR_UNREADABLE";
const ratio = (n, d) => (d ? n / d : null);

export function predictionInput(surface, labels, nm, explicitVersion) {
  const version = explicitVersion || surface?.dshVersion;
  if (typeof version !== "string" || !version.trim())
    throw new Error("Missing observed DSH version");
  const target = {
    profileId: nm,
    dshVersion: version,
    maxAgeMs: 24 * 60 * 60 * 1000,
  };
  const observed = normalizeObservation(surface, target);
  if (!observed.bound || !observed.usable)
    throw new Error("Prediction probe identity/version/freshness mismatch");
  if (
    labels?.labelVersion !== 1 ||
    labels.source !== "loader.entries" ||
    labels.available !== true ||
    labels.complete !== true ||
    !Array.isArray(labels.entries)
  )
    throw new Error(
      "Independent loader labels are missing, incomplete or unavailable; recollect with --probe-boot",
    );
  const labelIdentity = normalizeObservation(
    { ...labels, observationVersion: 1, root: {} },
    target,
  );
  if (!labelIdentity.usable)
    throw new Error("Loader label identity/version/freshness mismatch");
  if (
    typeof surface.sampleId !== "string" ||
    !surface.sampleId ||
    labels.sampleId !== surface.sampleId ||
    labels.probedAt !== surface.probedAt
  )
    throw new Error(
      "Probe and independent labels must belong to the same sample",
    );
  if (Date.parse(surface.probedAt) > Date.now() + 60000)
    throw new Error("Probe timestamp is in the future");
  for (const row of labels.entries) {
    if (
      !row ||
      typeof row !== "object" ||
      !("stateCode" in row) ||
      (row.stateCode !== null &&
        (!Number.isInteger(row.stateCode) ||
          row.stateCode < 0 ||
          row.stateCode > 5))
    )
      throw new Error("Malformed independent loader label row");
  }
  // Allowlist, not a delete-list: no current or future answer-bearing field can
  // flow into buildVerdicts. CLI auto-discovery is disabled by the caller too.
  return {
    version,
    surface: {
      observationVersion: surface.observationVersion,
      profileId: surface.profileId,
      dshVersion: surface.dshVersion,
      probedAt: surface.probedAt,
      wanted: surface.wanted,
      root: surface.root,
    },
  };
}

export function scoreLabels(tool, labels) {
  const names = new Set(Object.keys(tool.plugins || {}));
  const mapped = new Map(),
    unmappedLabels = [];
  for (const entry of labels.entries) {
    if (entry.group) continue;
    // No suffix/prefix matching: @one/foo and @two/foo cannot share a label.
    const declared = [entry.packageName, entry.name].filter(
      (n) => typeof n === "string",
    );
    const matches = [...new Set(declared.filter((n) => names.has(n)))];
    if (!matches.length && !declared.length && typeof entry.id === "string") {
      const id = entry.id.replace(/^include:/, "");
      if (names.has(id)) matches.push(id);
    }
    if (matches.length !== 1) {
      unmappedLabels.push(entry);
      continue;
    }
    const rows = mapped.get(matches[0]) || [];
    rows.push(entry);
    mapped.set(matches[0], rows);
  }
  const rows = [],
    unmatched = [],
    tally = {};
  let tp = 0,
    fp = 0,
    fn = 0,
    tn = 0;
  for (const [plugin, prediction] of Object.entries(tool.plugins || {})) {
    const entries = mapped.get(plugin) || [];
    const enabled = entries.filter((e) => !e.disabled);
    const states = enabled.map((e) => stateName(e.stateCode));
    const fatal = (prediction.findings || []).filter(
      (f) => f.severity === "fatal",
    );
    const failed = enabled.some((e) => e.stateCode === 0 || e.stateCode === 3);
    const active =
      enabled.length > 0 && enabled.every((e) => e.stateCode === 2);
    let verdict = "unscored",
      reason = null;
    if (!entries.length) {
      unmatched.push(plugin);
      reason = "no-label";
    } else if (!enabled.length) reason = "disabled";
    else if (failed) {
      if (fatal.length) {
        verdict = "true-positive";
        tp++;
      } else {
        verdict = "false-negative";
        fn++;
      }
    } else if (active) {
      if (fatal.length) {
        verdict = "false-positive";
        fp++;
      } else {
        verdict = "true-negative";
        tn++;
      }
    } else reason = "transient-or-unreadable";
    tally[verdict] = (tally[verdict] || 0) + 1;
    rows.push({
      plugin,
      labelState: states.join(",") || null,
      labelStates: states,
      disabled: entries.length > 0 && !enabled.length,
      toolVerdict: prediction.verdict,
      fatalCount: fatal.length,
      fatalApis: fatal.map((f) =>
        f.service
          ? `${f.service}${f.method ? "." + f.method : ""}`
          : f.category,
      ),
      verdict,
      reason,
    });
  }
  const byState = {};
  for (const row of labels.entries) {
    const state = stateName(row.stateCode);
    byState[state] = (byState[state] || 0) + 1;
  }
  return {
    coveredLayer: "① 宿主未激活（loader 自己的条目状态）",
    notCovered: ["② 静默降级（功能是死的）", "③ 客户端半边"],
    prediction: {
      mode: "service-shape-only",
      loaderEntriesUsed: false,
      autoProbeDiscovery: false,
    },
    loaderTotals: { total: labels.entries.length, byState },
    toolPlugins: rows.length,
    tally,
    unmatched,
    unmappedLabels,
    rows,
    metrics: {
      scored: tp + fp + fn + tn,
      unscored: rows.length - tp - fp - fn - tn,
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
    },
  };
}
