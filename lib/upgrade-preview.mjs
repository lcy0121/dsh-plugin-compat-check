/** Offline version prediction: no installation, runtime probe, cache or baseline. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./catalog.mjs";
import { TOOL_VERSION } from "./version.mjs";
import { captureUpgradeInput, sha256 } from "./upgrade-input.mjs";
import { runWorkerTask } from "./worker-analysis.mjs";
import { assertReportBody } from "./contracts.mjs";
import {
  SUPPORTED_PREVIEW_VERSIONS,
  assertUpgradePreview,
  compareUpgradeFindings,
  upgradeExitCode,
  createUpgradeFailure as createContractUpgradeFailure,
  UPGRADE_PREVIEW_LIMITATIONS,
} from "./upgrade-contract.mjs";
export { SUPPORTED_PREVIEW_VERSIONS } from "./upgrade-contract.mjs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const limitations = UPGRADE_PREVIEW_LIMITATIONS;
/** Preserve the public API while the pure factory also works without a kernel. */
export function createUpgradeFailure(error, options = {}) {
  if (error && typeof error === "object" && !(error instanceof Error))
    return createContractUpgradeFailure({
      ...error,
      toolVersion: TOOL_VERSION,
    });
  return createContractUpgradeFailure(error, {
    ...options,
    toolVersion: TOOL_VERSION,
  });
}

/**
 * Capture a caller-selected installed node_modules once and predict only exact
 * catalogue versions. Budgets may only lower the production capture/worker caps.
 */
export async function runUpgradePreview(input = {}, options = {}) {
  let snapshot;
  const { currentVersion, targetVersion } = input || {};
  const failure = (error) =>
    createUpgradeFailure(error, { currentVersion, targetVersion });
  try {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (k) => !["nm", "currentVersion", "targetVersion"].includes(k),
      )
    )
      throw new Error(
        "升级预检仅接受 nm、currentVersion、targetVersion；运行时、探针及覆盖参数不可混用",
      );
    if (
      !SUPPORTED_PREVIEW_VERSIONS.includes(currentVersion) ||
      !SUPPORTED_PREVIEW_VERSIONS.includes(targetVersion)
    )
      return createUpgradeFailure({
        error:
          "版本未认证：仅支持有明确API目录的精确版本 " +
          SUPPORTED_PREVIEW_VERSIONS.join("、"),
        currentVersion,
        targetVersion,
        status: "unsupported-version",
      });
    if (
      !options ||
      typeof options !== "object" ||
      Array.isArray(options) ||
      Object.keys(options).some(
        (k) => !["timeoutMs", "captureLimits"].includes(k),
      )
    )
      throw new Error("升级预检预算参数无效");
    const { timeoutMs = 10000, captureLimits = {} } = options;
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 10000 ||
      !captureLimits ||
      typeof captureLimits !== "object" ||
      Array.isArray(captureLimits)
    )
      throw new Error("升级预检 worker / 捕获预算无效");
    const reviewedCatalogFor = (version) => {
      const { file, catalog, evidence } = loadCatalog(ROOT, version);
      if (
        !catalog.host ||
        !catalog.client ||
        !catalog._source?.host ||
        !catalog._source?.client
      )
        throw new Error("API目录来源不完整");
      return {
        version,
        catalog,
        evidence,
        identity: {
          version,
          file: path.relative(ROOT, file).split(path.sep).join("/"),
          sha256: evidence.sha256,
          source: { ...catalog._source },
        },
      };
    };
    const current = reviewedCatalogFor(currentVersion),
      target = reviewedCatalogFor(targetVersion);
    const rulesFile = path.join(ROOT, "rules", "severity.json"),
      rulesBytes = fs.readFileSync(rulesFile);
    const rules = JSON.parse(rulesBytes);
    if (typeof input.nm !== "string" || !input.nm)
      throw new Error("升级预检需要 node_modules 或 profile 路径");
    const selected = path.resolve(input.nm);
    const nm =
      path.basename(selected) !== "node_modules" &&
      fs.existsSync(path.join(selected, "node_modules"))
        ? path.join(selected, "node_modules")
        : selected;
    snapshot = captureUpgradeInput(nm, captureLimits);
    const reports = await runWorkerTask(
      new URL("./upgrade-worker.mjs", import.meta.url),
      {
        nm: snapshot.nm,
        artifact: snapshot.artifact,
        current: {
          version: currentVersion,
          catalog: current.catalog,
          evidence: current.evidence,
        },
        target: {
          version: targetVersion,
          catalog: target.catalog,
          evidence: target.evidence,
        },
        rules,
      },
      { timeoutMs },
    );
    // Supervision resolves only after worker termination; cleanup occurs in finally.
    assertReportBody(reports.currentReport);
    assertReportBody(reports.targetReport);
    const changes = compareUpgradeFindings(
      reports.currentReport,
      reports.targetReport,
    );
    const limited = new Set(
      [
        ...Object.values(reports.currentReport.plugins),
        ...Object.values(reports.targetReport.plugins),
      ]
        .filter((p) => p.coverage.status === "limited")
        .map((p) => p.name),
    );
    const notes = [...limitations];
    if (
      !reports.currentReport.extraction.scanComplete ||
      !reports.targetReport.extraction.scanComplete
    )
      notes.push(
        "源码或插件清单覆盖不完整：保留已发现风险和诊断，未发现或已消失的发现不能证明修复或完整业务通过。",
      );
    return assertUpgradePreview({
      schemaVersion: 1,
      kind: "plugin-compat-check/upgrade-preview",
      toolVersion: TOOL_VERSION,
      mode: "static-version-comparison",
      status: "compared",
      ok: true,
      error: null,
      currentVersion,
      targetVersion,
      supportedVersions: [...SUPPORTED_PREVIEW_VERSIONS],
      catalogs: { current: current.identity, target: target.identity },
      artifact: snapshot.artifact,
      rules: { file: "rules/severity.json", sha256: sha256(rulesBytes) },
      ...reports,
      changes,
      summary: {
        ...Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [k, v.length]),
        ),
        limitedPlugins: limited.size,
      },
      exitCode: upgradeExitCode(changes),
      limitations: notes,
      baseline: null,
      cache: null,
    });
  } catch (error) {
    const message = String(error?.message || error)
      .replaceAll(snapshot?.nm || "\u0000", "<private-input>")
      .replace(/\/[^\s:'"]*dsc-upgrade-input-[^\s:'"]*/g, "<private-input>");
    return failure(message);
  } finally {
    snapshot?.dispose();
  }
}

export function renderUpgradePreview(result) {
  assertUpgradePreview(result);
  const lines = [
    `升级前兼容性预检（静态预测）：${result.currentVersion ?? "未知"} → ${result.targetVersion ?? "未知"}`,
  ];
  if (!result.ok)
    return [
      ...lines,
      `无法判定：${result.error}`,
      ...result.limitations.map((x) => `限制：${x}`),
    ].join("\n");
  lines.push(
    `新增 ${result.summary.added}；变重 ${result.summary.worsened}；消失 ${result.summary.resolved}；减轻 ${result.summary.improved}；不变 ${result.summary.unchanged}`,
  );
  if (!result.summary.added && !result.summary.worsened)
    lines.push("无新增或变重的静态风险；不代表未来业务通过。");
  for (const [group, label] of [
    ["added", "新增"],
    ["worsened", "变重"],
    ["resolved", "消失"],
    ["improved", "减轻"],
    ["unchanged", "不变"],
  ])
    for (const item of result.changes[group]) {
      const f = item.finding || item.after;
      lines.push(
        `${label}：${item.plugin} ${f.category} ${[f.service, f.method].filter(Boolean).join(".")} ${f.severity}/${f.certainty}/${f.impactBasis}${f.location ? ` @${f.location.file}:${f.location.line}` : ""}`,
      );
    }
  lines.push(`输入SHA-256：${result.artifact.sha256}`);
  for (const item of result.artifact.packages)
    lines.push(
      `插件制品：${item.name}@${item.version ?? "未知"} ${item.sha256}`,
    );
  for (const side of ["current", "target"]) {
    const item = result.catalogs[side];
    lines.push(
      `API目录：${item.version} ${item.file} SHA-256 ${item.sha256}；来源 ${item.source.host} / ${item.source.client}`,
    );
  }
  lines.push(`规则：${result.rules.file} SHA-256 ${result.rules.sha256}`);
  for (const side of ["currentReport", "targetReport"])
    for (const p of Object.values(result[side].plugins)) {
      lines.push(
        `${result[side].dshVersion} ${p.name}：${p.verdict}；覆盖 ${p.coverage.status}；已验证调用 ${p.coverage.verifiedCalls}${p.vacuous ? "；无已验证调用" : ""}`,
      );
      for (const note of p.coverage.limitations)
        lines.push(`  覆盖限制：${note}`);
    }
  return [...lines, ...result.limitations.map((x) => `限制：${x}`)].join("\n");
}
