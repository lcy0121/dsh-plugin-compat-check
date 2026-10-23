/** Repository CLI worker: compute only; the supervisor owns baseline commits. */
import { parentPort, workerData } from "node:worker_threads";
import { run } from "./compat-check.mjs";
try {
  parentPort.postMessage({
    ok: true,
    value: run({ ...workerData.options, _deferBaseline: true }),
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
