import { runReportWorkerTask } from "./worker-analysis.mjs";
/** Bounded metadata walk runs off the host thread and never imports plugin code. */
export function reportIdentity(inputs, { signal } = {}) {
  return runReportWorkerTask(
    new URL("./report-identity-worker.mjs", import.meta.url),
    inputs,
    {
      timeoutMs: 5000,
      signal,
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 16,
      },
    },
  );
}
