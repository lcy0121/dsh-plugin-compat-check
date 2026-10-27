/** Host reports boundary; pure factories preserve generation ownership. */
import { existsSync, promises as fsPromises } from "node:fs";
import path, { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { loaderObservations } from "./host-resources.js";
import { assertEnvelope, failureEnvelope } from "./report-contract.js";

export function createReportRuntime({
  resolveKernelDir,
  resolveNodeModules,
  resolveDshVersion,
  log,
  errText,
  attachFindingReviews,
}) {
  async function hostPluginListing(ctx, kernel, signal) {
    const { bounded } = await import(
      pathToFileURL(join(kernel, "lib", "async-boundary.mjs")).href
    );
    return bounded(() => ctx.get?.("pluginManager", false)?.list?.(), {
      timeoutMs: 1500,
      signal,
      label: "宿主插件列表读取",
    });
  }

  async function serveReport(state, ctx, force, options = {}) {
    if (state.disposed)
      return failureEnvelope("Plugin generation disposed / 已卸载");
    const kernel = resolveKernelDir(),
      nm = resolveNodeModules(options.profile || null);
    if (!kernel) return failureEnvelope("找不到判定内核");
    if (!nm.dir) {
      // Keep computeReport's version identity on target-resolution failures.
      const out = await computeReport(state, ctx, options);
      return failureEnvelope(out.error, out);
    }
    const canonical = await fsPromises.realpath(nm.dir),
      version = resolveDshVersion();
    const context = {
      nodeModules: canonical,
      observationProfile: path.resolve(nm.dir),
      kernel: await fsPromises.realpath(kernel),
      dshVersion: version,
      probe: process.env.DSC_PROBE_REPORT || null,
    };
    if (!state.reportService) {
      const [
        { ReportService },
        { reportIdentity },
        { catalogPathFor },
        { sampleServices },
      ] = await Promise.all([
        import(pathToFileURL(join(kernel, "lib", "report-service.mjs")).href),
        import(pathToFileURL(join(kernel, "lib", "report-identity.mjs")).href),
        import(pathToFileURL(join(kernel, "lib", "catalog.mjs")).href),
        import(pathToFileURL(join(kernel, "lib", "observation.mjs")).href),
      ]);
      if (state.disposed)
        return failureEnvelope("Plugin generation disposed / 已卸载");
      if (!state.reportService)
        state.reportService = new ReportService(
          async (options, guard) => {
            const out = await computeReport(state, ctx, {
              ...options,
              _cacheGuard: guard,
            });
            return out.ok
              ? assertEnvelope(out)
              : failureEnvelope(out.error, out);
          },
          {
            ttlMs: state.cacheTtlMs,
            watchMs: state.cacheWatchMs,
            onEvict: (key) => {
              for (const [token, target] of state.reviewTargets || [])
                if (target.key === key) state.reviewTargets.delete(token);
              state.reviewSidecars?.drop(key);
              state.lastReport = null;
              state.lastReportAt = 0;
            },
            identity: async (options, { signal }) => {
              const scope = options._cacheContext,
                current = resolveNodeModules(),
                currentVersion = resolveDshVersion();
              const active = current.dir
                ? await fsPromises.realpath(current.dir)
                : null;
              const requestedTarget = await fsPromises.realpath(
                options._nodeModules.dir,
              );
              const identity = await reportIdentity(
                {
                  nodeModules: scope.nodeModules,
                  context: {
                    ...scope,
                    currentVersion,
                    active,
                    requestedTarget,
                    probe: process.env.DSC_PROBE_REPORT || null,
                  },
                  files: [
                    join(scope.kernel, "rules", "severity.json"),
                    catalogPathFor(scope.kernel, currentVersion),
                    process.env.DSC_PROBE_REPORT,
                    join(
                      path.dirname(options._nodeModules.dir),
                      "compatibility.json",
                    ),
                  ],
                },
                { signal },
              );
              const sameHost = active === scope.nodeModules;
              const itemListing = sameHost
                ? await (async () => {
                    try {
                      const listing = await hostPluginListing(
                        ctx,
                        kernel,
                        signal,
                      );
                      return (
                        Array.isArray(listing)
                          ? listing
                          : listing?.items || listing?.plugins || []
                      ).map((i) => ({
                        id: i.id ?? i.entryId ?? i.slotId,
                        packageName: i.packageName ?? i.package ?? i.name,
                      }));
                    } catch (error) {
                      if (["TimeoutError", "AbortError"].includes(error.name))
                        throw error;
                      return [];
                    }
                  })()
                : [];
              const loader = sameHost
                ? loaderObservations(ctx, identity.manifests, itemListing)
                : null;
              const observation = sameHost
                ? sampleServices(
                    ctx,
                    [
                      ...identity.services,
                      ...(options._cacheInputs.services || []),
                    ],
                    {
                      profileId: scope.nodeModules,
                      dshVersion: currentVersion,
                    },
                  )
                : null;
              // Sampling timestamps are evidence, not a changing service identity.
              return JSON.stringify([
                identity.digest,
                loader,
                observation?.root || null,
              ]);
            },
          },
        );
    }
    if (!state.cacheEventDisposers && typeof ctx.on === "function") {
      state.cacheEventDisposers = [];
      // Verified in the bundled loader and plugin-manager emit sites; the
      // bounded watchdog also catches source edits and hosts without ctx.on.
      for (const event of [
        "plugin-manager/changed",
        "plugin-manager/install-state",
        "loader/entry-init",
        "loader/partial-dispose",
        "loader/volatile-update",
      ]) {
        try {
          const off = ctx.on(event, () => state.reportService?.notify());
          if (typeof off === "function") state.cacheEventDisposers.push(off);
        } catch {}
      }
    }
    const key = JSON.stringify(context);
    const inputs = state.reportService.states.get(key)?.options
      ?._cacheInputs || {
      services: [],
    };
    // Canonicalize cache identity only: preserve the requested path for the
    // existing exact probe/profile binding and the report's business target.
    const out = await state.reportService.get(
      key,
      {
        ...options,
        _cacheContext: context,
        _cacheInputs: inputs,
        _nodeModules: { dir: nm.dir, why: nm.why },
      },
      force,
    );
    if (state.disposed)
      return failureEnvelope("Plugin generation disposed / 已卸载");
    if (!out?.ok) return failureEnvelope(out?.error, out || {});
    return attachFindingReviews(state, assertEnvelope(out), key, kernel);
  }

  async function computeReport(state, ctx, options = {}) {
    if (state.disposed)
      return failureEnvelope("Plugin generation disposed / 已卸载");
    const started = Date.now();
    const out = {
      schemaVersion: 1,
      kind: "plugin-compat-check/report",
      computedAt: new Date().toISOString(),
      ok: false,
      error: null,
      kernelDir: null,
      // 「这份结论是哪一版工具给的」。面板是本插件的主要入口，
      // 少了它，用户来问"凭什么"时第一句就卡住 —— 而同一插件在不同版本的
      // 规则表/提取器下结论会变（见 lib/version.mjs 和 docs/Plan.md §1、§3 第 2 条）。
      toolVersion: null,
      nodeModules: null,
      nodeModulesWhy: null,
      // C4：与上次体检的差分包（没有基线时为 null，并带 note 说明为什么）
      baseline: null,
      report: null,
    };
    try {
      const kernel = resolveKernelDir();
      if (
        options._cacheContext &&
        (options._cacheContext.dshVersion !== resolveDshVersion() ||
          options._cacheContext.probe !==
            (process.env.DSC_PROBE_REPORT || null) ||
          options._cacheContext.nodeModules !==
            (await fsPromises.realpath(options._nodeModules.dir)) ||
          options._cacheContext.kernel !==
            (kernel && (await fsPromises.realpath(kernel))))
      )
        return failureEnvelope("报告上下文已变化，等待目标报告刷新");
      out.kernelDir = kernel;
      // 版本要**尽早**拿到：连"找不到内核"这条错误路径上，用户也需要知道
      // 是哪一版工具报的这个错。`version.mjs` 只在有内核时才读得到 ——
      // 读不到就保持 null，**不猜**。
      if (kernel) {
        try {
          const vmod = await import(
            pathToFileURL(join(kernel, "lib", "version.mjs")).href
          );
          out.toolVersion = vmod.TOOL_VERSION ?? null;
        } catch (error) {
          log(
            `版本读不到（${errText(error)}）—— 报告里的 toolVersion 将是 null`,
          );
        }
      }
      if (!kernel) {
        out.error =
          "找不到判定内核（lib/extract.mjs + lib/verdict.mjs）。" +
          "插件形态下它们是同仓库的相邻目录；发布形态请设 DSC_KERNEL。";
        return out;
      }
      const nm =
        options._nodeModules || resolveNodeModules(options.profile || null);
      out.nodeModules = nm.dir;
      out.nodeModulesWhy = nm.why;
      if (!nm.dir) {
        out.error = `找不到要体检的 node_modules：${nm.why}`;
        return out;
      }

      const { extractInWorker } = await import(
        pathToFileURL(join(kernel, "lib", "worker-analysis.mjs")).href
      );
      const { buildVerdicts } = await import(
        pathToFileURL(join(kernel, "lib", "verdict.mjs")).href
      );

      const { loadCatalog } = await import(
        pathToFileURL(join(kernel, "lib", "catalog.mjs")).href
      );
      const {
        file: catalogPath,
        catalog,
        evidence: catalogEvidence,
      } = loadCatalog(kernel, resolveDshVersion());
      const rulesPath = join(kernel, "rules", "severity.json");
      const { readStaticFile } = await import(
        pathToFileURL(join(kernel, "lib", "static-input.mjs")).href
      );
      const rulesBytes = readStaticFile(rulesPath, 8 * 1024 * 1024);
      const rules = JSON.parse(rulesBytes);
      out.analysisIdentity = {
        rulesSha256: createHash("sha256").update(rulesBytes).digest("hex"),
        catalogSha256: catalogEvidence.sha256,
      };

      // 运行时面：宿主半边**自己就在进程里**，所以它能拿到比探针更准的东西。
      // 第一版先读探针报告（如果外层给了路径），没有就退回目录 —— 并如实标注。
      let hostSurface = null,
        probeReadFailure = null;
      let surfaceWhy = "没有运行时面：结论中的方法级判定降为「疑似」";
      const probePath = process.env.DSC_PROBE_REPORT;
      if (probePath && existsSync(probePath)) {
        try {
          hostSurface = JSON.parse(
            readStaticFile(probePath, 8 * 1024 * 1024).toString("utf8"),
          );
          surfaceWhy = `运行时面来自探针报告 ${probePath}`;
        } catch (error) {
          probeReadFailure = `探针报告读不动（${errText(error)}）`;
          surfaceWhy = probeReadFailure + "，退回目录";
        }
      }
      out.surfaceWhy = surfaceWhy;

      const extracted = await extractInWorker(nm.dir, { catalog }, 10000, {
        signal: options._cacheGuard?.signal,
      });
      if (state.disposed)
        return failureEnvelope("Plugin generation disposed / 已卸载");
      if (options._cacheInputs)
        options._cacheInputs.services = extracted.report.services;
      const { sampleServices } = await import(
        pathToFileURL(join(kernel, "lib", "observation.mjs")).href
      );
      const currentTarget = resolveNodeModules();
      const sameHost =
        currentTarget.dir &&
        (await fsPromises.realpath(currentTarget.dir)) ===
          (await fsPromises.realpath(nm.dir));
      if (!hostSurface && sameHost) {
        hostSurface = sampleServices(ctx, extracted.report.services, {
          profileId: nm.dir,
          dshVersion: resolveDshVersion(),
        });
        surfaceWhy =
          (probeReadFailure ? probeReadFailure + "；" : "") +
          "当前宿主进程内采集的服务结构；未采集或读取失败不等于缺失";
      }
      const itemListing = await (async () => {
        try {
          const listing = await hostPluginListing(
            ctx,
            kernel,
            options._cacheGuard?.signal,
          );
          return (
            Array.isArray(listing)
              ? listing
              : listing?.items || listing?.plugins || []
          ).map((i) => ({
            id: i.id ?? i.entryId ?? i.slotId,
            packageName: i.packageName ?? i.package ?? i.name,
          }));
        } catch (error) {
          if (["TimeoutError", "AbortError"].includes(error.name)) throw error;
          return [];
        }
      })();
      const loaderState = sameHost
        ? loaderObservations(ctx, extracted.report.manifests, itemListing)
        : { rows: [], unmapped: [], available: false };
      out.loaderCoverage = loaderState;

      out.surfaceWhy = surfaceWhy;
      const { readProfileCompatibility } = await import(
        pathToFileURL(join(kernel, "lib", "profile-compatibility.mjs")).href
      );
      const compatibility = readProfileCompatibility(nm.dir);
      const verdict = buildVerdicts({
        report: extracted.report,
        hostSurface,
        rules,
        catalog,
        dshVersion: resolveDshVersion(),
        entryStates: loaderState.rows,
        observationTarget: { profileId: nm.dir, maxAgeMs: 24 * 60 * 60 * 1000 },
        compatibilityExemptions: compatibility.exemptions,
        compatibilityNotes: compatibility.notes,
      });

      // ── C4：基线差分 ──
      // 用**与 CLI 完全相同**的 lib/baseline.mjs。面板说"变差了"而命令行说"没变"
      // 这种分叉在结构上就不可能发生。
      let baseline = null,
        finalizeBaseline = null;
      try {
        const { snapshotForBaseline, diffAgainstBaseline, badgeFor } =
          await import(pathToFileURL(join(kernel, "lib", "baseline.mjs")).href);
        const store = await import(
          pathToFileURL(join(kernel, "lib", "state-store.mjs")).href
        );
        const identity = store.baselineIdentity(
          nm.dir,
          verdict.observation.mode,
          rules,
          catalog,
        );
        const snap = snapshotForBaseline(
          verdict,
          resolveDshVersion(),
          identity,
        );
        const bfile = store.baselinePath(nm.dir, verdict.observation.mode);
        if (state.disposed)
          return failureEnvelope("Plugin generation disposed / 已卸载");
        finalizeBaseline = () =>
          store.baselineTransaction(bfile, snap, {
            advance: extracted.report.scanComplete,
            skipReason: "incomplete",
          });
        if (!options._cacheGuard) baseline = finalizeBaseline();
      } catch (error) {
        baseline = {
          error: errText(error),
          note: "基线差分没算成（不影响本次结论）",
        };
      }

      // 只把面板要用的部分送过去：完整 report 在 desktop profile 上是 ~1 MB，
      // 而面板要的只是每个插件的结论与去处。
      // ── 面板条目台账：id → 包名 ──
      // `plugins.detail.*` 只收到 `{subject:{kind,id}}`，**没有包名**，而 id 常常
      // 不等于包名（插件面板自己那个条目的 id 就叫 `plugins`）。所以从面板管理器
      // 自己的只读服务里取这张表，让客户端能解析出"这是哪个插件"。
      // 取不到不算失败：客户端会退回到"id 就是包名"的判断，并如实不渲染角标。
      try {
        const pm =
          typeof ctx.get === "function"
            ? ctx.get("pluginManager", false)
            : undefined;
        const listing =
          pm && typeof pm.list === "function"
            ? await hostPluginListing(ctx, kernel, options._cacheGuard?.signal)
            : null;
        if (listing) {
          const arr = Array.isArray(listing)
            ? listing
            : listing.items || listing.plugins || [];
          out.items = arr
            .map((it) => {
              if (!it || typeof it !== "object") return null;
              const id = it.id ?? it.entryId ?? it.slotId ?? null;
              const pkg = it.packageName ?? it.package ?? it.name ?? null;
              return id && pkg
                ? { id, packageName: String(pkg), label: it.label ?? null }
                : null;
            })
            .filter(Boolean);
        }
      } catch (error) {
        if (["TimeoutError", "AbortError"].includes(error.name)) throw error;
        out.itemsError = errText(error);
      }

      const { toJSON } = await import(
        pathToFileURL(join(kernel, "lib", "report.mjs")).href
      );
      const { renderIssueReport } = await import(
        pathToFileURL(join(kernel, "lib", "issue-report.mjs")).href
      );
      if (state.disposed)
        return failureEnvelope("Plugin generation disposed / 已卸载");
      const canonical = toJSON({
        error: null,
        extract: extracted,
        verdict,
        entryStates: loaderState.rows,
        baseline,
        catalog: catalogEvidence,
        inputs: {
          nodeModules: nm.dir,
          hasRuntimeSurface: verdict.observation.usable,
          catalog: catalogPath,
          rules: rulesPath,
        },
      });
      if (options._cacheGuard && finalizeBaseline)
        options._cacheGuard.commit(() => {
          baseline = finalizeBaseline();
          canonical.baseline = baseline;
          out.baseline = baseline;
          out.report.baseline = baseline;
          out.issueReport = renderIssueReport(canonical);
        });
      out.issueReport = renderIssueReport(canonical);
      out.baseline = canonical.baseline;
      out.dshVersion = canonical.dshVersion;
      out.exitCode = canonical.exitCode;
      out.report = {
        ...canonical,
        hasRuntimeSurface: verdict.observation.usable,
        loaderCoverage: out.loaderCoverage,
        surfaceWhy,
        items: out.items || [],
        itemsError: out.itemsError || null,
        manifests: extracted.report.manifests,
        serviceCount: extracted.report.services.length,
        siteTotal: (extracted.report.callSites || []).length,
      };
      out.ok = true;
      out.elapsedMs = Date.now() - started;
    } catch (error) {
      out.error = errText(error);
    }
    return out;
  }
  return { hostPluginListing, serveReport, computeReport };
}
