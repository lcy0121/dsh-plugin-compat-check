/** Host upgrade boundary; pure factories preserve generation ownership. */
import { readFileSync, promises as fsPromises } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createUpgradeFailure as upgradeFailure,
  SUPPORTED_PREVIEW_VERSIONS,
} from "./upgrade-contract.js";
import { terminalText } from "./report-contract.js";

export function createUpgradeRuntime({
  resolveKernelDir,
  resolveNodeModules,
  resolveDshVersion,
  errText,
}) {
  function unavailableUpgrade(error, options = {}) {
    let toolVersion = "unknown";
    try {
      toolVersion = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      ).version;
    } catch {}
    return upgradeFailure(error, {
      toolVersion,
      currentVersion: resolveDshVersion(),
      targetVersion: options.targetVersion,
      ...options,
    });
  }

  async function serveUpgradePreview(state, options = {}) {
    const currentVersion = resolveDshVersion(),
      targetVersion = options.targetVersion || null;
    const failure = (error) =>
      unavailableUpgrade(error, { currentVersion, targetVersion });
    try {
      if (state.disposed) return failure("Plugin generation disposed / 已卸载");
      if (options.currentVersion && options.currentVersion !== currentVersion)
        return failure("当前 DSH 版本已变化，请刷新普通报告后重新预检");
      if (options.invalidRequest) return failure(options.invalidRequest);
      if (
        !SUPPORTED_PREVIEW_VERSIONS.includes(currentVersion) ||
        !SUPPORTED_PREVIEW_VERSIONS.includes(targetVersion)
      )
        return unavailableUpgrade(
          "版本未认证：仅支持有明确 API 目录的精确版本 " +
            SUPPORTED_PREVIEW_VERSIONS.join("、"),
          { currentVersion, targetVersion, status: "unsupported-version" },
        );
      const kernel = resolveKernelDir();
      if (!kernel) return failure("找不到升级预检内核");
      const engine = await import(
        pathToFileURL(join(kernel, "lib/upgrade-preview.mjs")).href
      );
      if (state.disposed) return failure("Plugin generation disposed / 已卸载");
      const nm = resolveNodeModules(options.profile || null);
      const canonical = nm.dir && (await fsPromises.realpath(nm.dir));
      if (state.disposed) return failure("Plugin generation disposed / 已卸载");
      const key = JSON.stringify([canonical, currentVersion, targetVersion]);
      if (state.upgradeFlight && state.upgradeFlight.key !== key)
        return failure("另一目标的升级预检正在运行，请稍后重试");
      let flight = state.upgradeFlight;
      if (!flight) {
        const controller = new AbortController();
        flight = {
          key,
          controller,
          promise: engine.runUpgradePreview(
            { nm: nm.dir, currentVersion, targetVersion },
            { signal: controller.signal },
          ),
        };
        state.upgradeFlight = flight;
      }
      try {
        const result = await flight.promise;
        if (!state.disposed) return result;
        return failure(
          [
            result.ok ? null : result.error,
            "Plugin generation disposed / 已卸载",
          ]
            .filter(Boolean)
            .join("；"),
        );
      } finally {
        if (state.upgradeFlight === flight) state.upgradeFlight = null;
      }
    } catch (error) {
      return failure(errText(error));
    }
  }

  async function upgradeToolResult(state, options) {
    let preview, text;
    try {
      const kernel = resolveKernelDir();
      if (!kernel) throw Error("找不到升级预检内核");
      const { renderUpgradePreview } = await import(
        pathToFileURL(join(kernel, "lib/upgrade-preview.mjs")).href
      );
      preview = await serveUpgradePreview(state, options);
      text = renderUpgradePreview(preview);
    } catch (error) {
      preview = unavailableUpgrade(errText(error), {
        targetVersion: options.targetVersion,
      });
      text =
        "升级预检无法比较：" +
        terminalText(preview.error) +
        "；静态预测不等于目标版本业务通过。";
    }
    return {
      schemaVersion: 1,
      kind: "plugin-compat-check/tool-result",
      ok: preview.ok,
      error: preview.error,
      exitCode: preview.exitCode,
      toolVersion: preview.toolVersion,
      report: null,
      baseline: null,
      cache: null,
      nodeModules: "",
      hasRuntimeSurface: false,
      summary: preview.ok
        ? `静态升级预检：新增 ${preview.summary.added} / 变重 ${preview.summary.worsened}；不等于目标版本业务通过`
        : "升级预检无法比较",
      text,
      upgradePreview: preview,
    };
  }
  return { unavailableUpgrade, serveUpgradePreview, upgradeToolResult };
}
