/** Pure host analysis only. No ctx access and no baseline/state writes. */
import { parentPort, workerData } from "node:worker_threads";
import { buildVerdicts } from "./verdict.mjs";
import { toJSON } from "./report.mjs";
import { renderIssueReport } from "./issue-report.mjs";
import { snapshotForBaseline } from "./baseline.mjs";
import { baselineIdentity } from "./state-store.mjs";
import {
  assertAnalysisBudget,
  assertAnalysisBytes,
} from "./analysis-budget.mjs";

try {
  const { extracted, limits, inputs, catalogEvidence, ...options } = workerData;
  assertAnalysisBudget(extracted.report, limits);
  const verdict = buildVerdicts({ ...options, report: extracted.report });
  const canonical = toJSON({
    extract: extracted,
    verdict,
    inputs: { ...inputs, hasRuntimeSurface: verdict.observation.usable },
    entryStates: options.entryStates,
    catalog: catalogEvidence,
    baseline: null,
  });
  const snapshot = snapshotForBaseline(
    verdict,
    options.dshVersion,
    baselineIdentity(
      inputs.nodeModules,
      verdict.observation.mode,
      options.rules || {},
      options.catalog || {},
    ),
  );
  const value = {
    canonical,
    snapshot,
    issueReport: renderIssueReport(canonical),
  };
  assertAnalysisBytes(value, limits);
  parentPort.postMessage({ ok: true, value });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
