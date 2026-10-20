import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { snapshotPackage, SampleError } from "./static-sample.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { exitCodeForSummary } from "../lib/contracts.mjs";

try {
  const { source, workDir, sample, catalog, rules, dshVersion } = workerData;
  const nm = path.join(workDir, "node_modules");
  const pkg = path.join(nm, "sample");
  const fingerprint = snapshotPackage(source, pkg);
  if (!sample) parentPort.postMessage({ ok: true, value: fingerprint });
  else if (fingerprint.sha256 !== sample.sha256)
    parentPort.postMessage({
      ok: true,
      value: { errorCode: "hash-mismatch", hashVerified: false },
    });
  else {
    const meta = JSON.parse(
      fs.readFileSync(path.join(pkg, "package.json"), "utf8"),
    );
    if (
      meta.name !== sample.name ||
      meta.version !== sample.version ||
      !meta.dsh ||
      typeof meta.dsh !== "object" ||
      Array.isArray(meta.dsh) ||
      meta.name.startsWith("@deepseek-ai/")
    )
      throw new SampleError("identity-mismatch");
    const extracted = extractWithProvenance(nm, { catalog });
    const verdict = buildVerdicts({
      report: extracted.report,
      hostSurface: null,
      rules,
      catalog,
      dshVersion,
    });
    const plugin = verdict.plugins[sample.name];
    if (!plugin || Object.keys(verdict.plugins).length !== 1)
      throw new SampleError("identity-mismatch");
    // No inputs, absolute temporary paths, raw evidence, source, logs or baseline in this view.
    const report = {
      verdict: plugin.verdict,
      vacuous: plugin.vacuous,
      coverage: plugin.coverage,
      observation: {
        ...verdict.observation,
        profileId: null,
        dshVersion: null,
        probedAt: null,
      },
      scanComplete: extracted.report.scanComplete,
      diagnostics: extracted.report.diagnostics.map((d) => ({
        kind: d.kind,
        file: d.file ?? null,
      })),
      findings: plugin.findings.map((f) =>
        Object.fromEntries(
          [
            "category",
            "severity",
            "certainty",
            "impactBasis",
            "service",
            "method",
            "location",
            "impact",
            "basis",
            "ruleSource",
            "ruleRef",
          ].map((k) => [k, f[k] ?? null]),
        ),
      ),
      dispositions: plugin.checked,
    };
    if (Buffer.byteLength(JSON.stringify(report)) > 96 * 1024)
      throw new SampleError("report-budget-exceeded");
    parentPort.postMessage({
      ok: true,
      value: {
        hashVerified: true,
        fingerprint,
        report: JSON.parse(JSON.stringify(report)),
        exitCode: exitCodeForSummary(verdict.summary),
      },
    });
  }
} catch (error) {
  parentPort.postMessage({
    ok: true,
    value: {
      errorCode: error instanceof SampleError ? error.code : "analysis-failed",
      hashVerified: false,
    },
  });
}
