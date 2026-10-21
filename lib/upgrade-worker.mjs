import { parentPort, workerData } from "node:worker_threads";
import { extractWithProvenance } from "./extract.mjs";
import { buildVerdicts } from "./verdict.mjs";
import { sealReportBody } from "./contracts.mjs";
import { TOOL_VERSION } from "./version.mjs";

try {
  const { nm, current, target, rules, artifact } = workerData;
  const catalog = {
    host: { ...current.catalog.host, ...target.catalog.host },
    client: { ...current.catalog.client, ...target.catalog.client },
  };
  // One extraction of the same copied bytes; catalogue union affects only
  // recognition of weak bare/alias names. Each verdict uses its own catalogue.
  const extracted = extractWithProvenance(nm, { catalog });
  const reportFor = (item) =>
    sealReportBody({
      ...buildVerdicts({
        report: extracted.report,
        hostSurface: null,
        entryStates: [],
        rules,
        catalog: item.catalog,
        dshVersion: item.version,
      }),
      toolVersion: TOOL_VERSION,
      catalog: item.evidence,
      inputs: {
        mode: "static-version-comparison",
        artifactSha256: artifact.sha256,
        hasRuntimeSurface: false,
      },
      extraction: {
        scanComplete: extracted.report.scanComplete,
        diagnostics: extracted.report.diagnostics,
        manifests: extracted.report.manifests,
      },
      baseline: null,
      cache: null,
    });
  parentPort.postMessage({
    ok: true,
    value: {
      currentReport: reportFor(current),
      targetReport: reportFor(target),
    },
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
