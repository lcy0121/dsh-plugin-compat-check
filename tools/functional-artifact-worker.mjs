import { parentPort, workerData } from "node:worker_threads";
import { verifyFunctionalArtifact } from "./functional-artifact.mjs";
try {
  const bytes = verifyFunctionalArtifact(workerData.file, workerData.expected);
  // Transfer only the bounded verified bytes; installers never reopen the input.
  const value = Uint8Array.from(bytes);
  parentPort.postMessage({ ok: true, value }, [value.buffer]);
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
