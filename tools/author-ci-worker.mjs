/** Trusted bounded worker. Copies bytes; never imports the selected package. */
import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import semver from "semver";
import { snapshotPackage, sha256, readRegular } from "./static-sample.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { CATALOG_REFERENCES } from "../lib/contracts.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";
try {
  const { source, workDir, versions } = workerData,
    nm = path.join(workDir, "node_modules"),
    selected = path.join(nm, "selected");
  const fingerprint = snapshotPackage(source, selected),
    meta = JSON.parse(readRegular(path.join(selected, "package.json"), 65536));
  if (
    typeof meta.name !== "string" ||
    meta.name.length > 214 ||
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(meta.name) ||
    meta.name.startsWith("@deepseek-ai/") ||
    semver.valid(meta.version) !== meta.version ||
    !meta.dsh ||
    typeof meta.dsh !== "object" ||
    Array.isArray(meta.dsh)
  )
    throw Error(
      "Selected artifact requires a third-party package name, exact version and dsh declaration",
    );
  const packageIdentity = {
    name: meta.name,
    version: meta.version,
    sha256: fingerprint.sha256,
  };
  const rulesFile = new URL("../rules/severity.json", import.meta.url),
    rulesSha256 = sha256(fs.readFileSync(rulesFile));
  const cells = [];
  for (const dshVersion of versions) {
    const reference = CATALOG_REFERENCES.find((c) => c.version === dshVersion);
    const identity = {
      package: packageIdentity,
      catalogSha256: reference?.sha256 || null,
      rulesSha256,
      toolVersion: TOOL_VERSION,
    };
    if (!reference) {
      cells.push({
        dshVersion,
        status: "unsupported",
        report: null,
        kernelExitCode: 3,
        error: "Target has no certified exact catalogue",
        identity,
      });
      continue;
    }
    try {
      const result = run({
        nm,
        dshVersion,
        baseline: false,
        _ignoreAutoProbe: true,
      });
      if (result.error) throw Error("Selected artifact analysis failed");
      const report = toJSON(result);
      report.inputs = { source: "selected-package" };
      if (
        Object.keys(report.plugins).length !== 1 ||
        !report.plugins[meta.name]
      )
        throw Error("Selected artifact was not uniquely analyzed");
      if (Buffer.byteLength(JSON.stringify(report)) > 2 * 1024 * 1024)
        throw Error("Report exceeds output budget");
      cells.push({
        dshVersion,
        status: "analyzed",
        report,
        kernelExitCode: report.exitCode,
        error: null,
        identity,
      });
    } catch (error) {
      cells.push({
        dshVersion,
        status: "error",
        report: null,
        kernelExitCode: 3,
        error: "Selected artifact analysis failed or exceeded report budget",
        identity,
      });
    }
    if (sha256(fs.readFileSync(rulesFile)) !== rulesSha256)
      throw Error("Rules changed while scanning");
  }
  parentPort.postMessage({
    ok: true,
    value: { identity: { package: packageIdentity, rulesSha256 }, cells },
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error.message) });
}
