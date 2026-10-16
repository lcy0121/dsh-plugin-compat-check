import { parentPort, workerData } from "node:worker_threads";
import { extractWithProvenance } from "./extract.mjs";
try {
  parentPort.postMessage({
    ok: true,
    value: extractWithProvenance(workerData.nm, workerData.options),
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
