import { parentPort, workerData } from "node:worker_threads";
import { extractWithProvenance } from "./extract.mjs";
import {
  assertAnalysisBudget,
  assertAnalysisBytes,
} from "./analysis-budget.mjs";
try {
  const value = extractWithProvenance(workerData.nm, workerData.options);
  assertAnalysisBudget(value.report, workerData.options?.analysisLimits);
  assertAnalysisBytes(value, workerData.options?.analysisLimits);
  parentPort.postMessage({
    ok: true,
    value,
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
