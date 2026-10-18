/** Pure evidence-driven compatibility verdicts. Unknown is not absence. */
import { normalizeObservation } from "./observation.mjs";
import { declaredSupport } from "./declarations.mjs";
export const IMPACT_BASIS = { MEASURED: "measured", INFERRED: "inferred" };
export const CERTAINTY = { CERTAIN: "certain", SUSPECTED: "suspected" };
export const CATEGORY = {
  HOST_SERVICE_MISSING: "host-service-missing",
  HOST_METHOD_MISSING: "host-method-missing",
  UNPROVIDED_DEPENDENCY: "unprovided-dependency",
  DECLARATION_MISMATCH: "declaration-mismatch",
  DECLARED_INCOMPATIBLE: "declared-incompatible",
  CLIENT_ENTRY_MISSING: "client-entry-missing",
  HOST_ENTRY_INACTIVE: "host-entry-inactive",
};
export const DISPOSITION = {
  FINDING: "finding",
  CLIENT_SIDE: "client-side",
  SELF_PROVIDED: "self-provided",
  RUNTIME_FACILITY: "runtime-facility",
  FILTERED: "filtered",
  ABSTAINED: "abstained",
  GUARDED: "guarded",
  NO_CALLS: "no-calls",
  UNKNOWN: "unknown",
};
const builtin = new Set([
  "loader",
  "logger",
  "fiber",
  "effect",
  "inject",
  "provide",
  "reflect",
  "scope",
  "root",
  "get",
  "set",
  "on",
  "off",
  "once",
  "emit",
  "parallel",
  "waterfall",
  "bail",
  "start",
  "stop",
  "dispose",
  "isActive",
  "extend",
  "isolate",
  "intercept",
  "plugin",
]);
const rank = {
  finding: 60,
  guarded: 50,
  filtered: 40,
  "client-side": 30,
  "self-provided": 25,
  "runtime-facility": 24,
  abstained: 20,
  "no-calls": 10,
  unknown: 100,
};
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const location = (s) =>
  s
    ? {
        file: s.file,
        line: s.line,
        column: s.column ?? null,
        start: s.start ?? null,
        end: s.end ?? null,
      }
    : null;
function severity(rules, svc, method, fallback) {
  const rec = methodRule(rules, svc, method, "host");
  if (rec?.severity)
    return {
      severity: rec.severity,
      impact: rec.impact,
      ruleSource: "rule",
      ruleRef: `services.${svc}.methods.${method}`,
    };
  return {
    ...fallback,
    ruleSource: "default",
    ruleRef: own(rules?.services || {}, svc) ? `services.${svc}` : null,
  };
}
/** Rule semantics belong to a side, even when the service name is shared. */
export function methodRule(rules, service, method, side = "host") {
  const groups = rules?.services || {};
  const group = own(groups, service) ? groups[service] : null;
  const methods = group?.methods || {};
  const rule = own(methods, method) ? methods[method] : null;
  const layer = rule?.layer || group?.layer;
  if (!rule?.severity || (layer && layer !== "both" && layer !== side))
    return null;
  return rule;
}
export function declarationOf(p, version, options) {
  return declaredSupport(p, version, options);
}
export function buildVerdicts({
  report,
  hostSurface = null,
  rules = {},
  catalog = {},
  dshVersion = null,
  entryStates = [],
  observationTarget = {},
  compatibilityExemptions,
  compatibilityNotes = [],
}) {
  const observation = normalizeObservation(hostSurface, {
    dshVersion,
    ...observationTarget,
  });
  const hostCat = catalog.host || {},
    clientCat = catalog.client || {};
  const providers = new Set();
  // In-process loader evidence is independent. File-probe entries share the
  // probe's identity/age validation and must be rejected together with it.
  const probeEntries =
    observation.usable && Array.isArray(hostSurface?.entries?.plugins)
      ? hostSurface.entries.plugins.filter((r) => r && typeof r === "object")
      : [];
  const rows = [...(entryStates || []), ...probeEntries];
  for (const [pkg, p] of Object.entries(report.perPlugin || {})) {
    const states = rows.filter((r) => r.packageName === pkg && !r.group);
    if (
      states.length &&
      !states.some((r) => !r.disabled && r.state === "ACTIVE")
    )
      continue;
    for (const svc of p.providedServices || []) providers.add(svc);
  }
  const plugins = {},
    summary = { ok: 0, partial: 0, broken: 0, unknown: 0 };
  for (const [name, p] of Object.entries(report.perPlugin || {})) {
    const findings = [],
      checked = [],
      clientSide = [],
      filtered = [],
      abstained = [],
      runtimeFacilities = [];
    const resolved = Object.create(null);
    const limitations = [
      ...observation.notes,
      ...compatibilityNotes,
      ...(p.diagnostics || []).map((d) => `${d.kind}: ${d.file ?? ""}`),
    ];
    let verified = 0;
    const account = (service, disposition, extra = {}) => {
      const value = { service, disposition, ...extra };
      checked.push(value);
      if (
        !resolved[service] ||
        rank[disposition] > rank[resolved[service].disposition]
      )
        Object.defineProperty(resolved, service, {
          value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
    };
    const add = (f) => findings.push(f);
    const packageEntries = rows.filter(
      (r) => r.packageName === name && !r.group,
    );
    for (const row of packageEntries) {
      if (row.disabled) continue;
      if (row.state === "FAILED" || row.state === "PENDING")
        add({
          category: CATEGORY.HOST_ENTRY_INACTIVE,
          certainty: "certain",
          impactBasis: "measured",
          service: null,
          method: null,
          location: null,
          severity: "fatal",
          impact: `宿主条目 ${row.id ?? name} 当前为 ${row.state}`,
          basis: row.failureReason || `loader 实际状态：${row.state}`,
          evidence: { entryId: row.id ?? null, state: row.state },
          ruleSource: "runtime",
          ruleRef: "loader.entry.state",
        });
      else if (row.state !== "ACTIVE")
        limitations.push(`条目 ${row.id ?? name} 尚未稳定：${row.state}`);
    }
    if (p.clientHalf?.declared && p.clientHalf.ok === false)
      add({
        category: CATEGORY.CLIENT_ENTRY_MISSING,
        certainty: "certain",
        impactBasis: "inferred",
        service: null,
        method: null,
        location: null,
        severity: "fatal",
        impact: "声明的客户端入口不可交付，宿主可能拒绝加载客户端",
        basis: p.clientHalf.why,
        ruleSource: "static",
        ruleRef: "plugins.client.half",
      });
    const self = new Set(p.providedServices || []);
    for (const svc of p.services || []) {
      const allSites = (p.callSites || []).filter((s) => s.service === svc);
      const deps = (p.dependencies || []).filter((d) => d.service === svc);
      const sidesFor = (s) =>
        s.sides ||
        p.fileSides?.[s.file] ||
        ((p.files?.["client-entry"] || []).includes(s.file) ||
        (p.files?.["client-extra"] || []).includes(s.file)
          ? ["client"]
          : ["host"]);
      const hostSites = allSites.filter((s) => sidesFor(s).includes("host"));
      const clientSites = allSites.filter((s) =>
        sidesFor(s).includes("client"),
      );
      const hostDeps = deps.filter((d) => sidesFor(d).includes("host"));
      if (
        hostSites.some((s) => s.inferredReceiver) ||
        hostDeps.some((d) => d.inferred)
      )
        limitations.push(`${svc} Context 绑定仅由语法推断`);
      const legacyHard =
        !p.dependencies &&
        (p.declaredServices || []).includes(svc) &&
        !(p.softDeclaredServices || []).includes(svc);
      const hard =
        legacyHard || hostDeps.some((d) => d.kind === "required-inject");
      const hostUse = hostSites.length > 0 || hostDeps.length > 0 || legacyHard;
      const clientUse =
        clientSites.length > 0 ||
        deps.some((d) => sidesFor(d).includes("client"));
      if (clientUse || (!hostUse && own(clientCat, svc)))
        clientSide.push({ service: svc, note: "客户端证据未作浏览器功能验证" });
      if (!hostUse && clientUse) {
        account(svc, "client-side", {
          reason: "只有客户端需求，宿主面不用于判定",
        });
        limitations.push(`${svc} 客户端尚未验证`);
        continue;
      }
      if (builtin.has(svc)) {
        runtimeFacilities.push({
          name: svc,
          reason: "Cordis 上下文设施，不按 DSH 服务目录判定",
        });
        account(svc, "runtime-facility");
        continue;
      }
      const observed = observation.root[svc] || {
        status: "unobserved",
        methods: [],
        complete: false,
      };
      if (!hostUse && self.has(svc)) {
        account(svc, "self-provided", { reason: "插件提供声明，无消费调用" });
        continue;
      }
      if (
        (self.has(svc) || providers.has(svc)) &&
        !(observed.status === "present" && observed.complete)
      ) {
        limitations.push(`${svc} 仅有提供声明，没有完整的运行时方法证据`);
        account(svc, "abstained", { reason: "提供声明不是运行时可用证明" });
        continue;
      }
      const unknown =
        observed.status === "unobserved" || observed.status === "unreadable";
      if (unknown) {
        limitations.push(
          `${svc} ${observed.status === "unreadable" ? "采样失败" : "未采样"}`,
        );
      }
      if (observed.status === "absent") {
        const sev = hard
          ? {
              severity: "fatal",
              impact: "插件顶层硬依赖在本次运行时面中明确不存在",
            }
          : {
              severity: "degraded",
              impact: "读取或子作用域依赖的服务不存在；相关行为需进一步验证",
            };
        add({
          category: hard
            ? CATEGORY.HOST_SERVICE_MISSING
            : CATEGORY.UNPROVIDED_DEPENDENCY,
          certainty:
            hard ||
            [...hostSites, ...hostDeps].some(
              (s) => !s.inferredReceiver && !s.inferred,
            )
              ? "certain"
              : "suspected",
          impactBasis: "inferred",
          service: svc,
          method: null,
          location: location(hostDeps[0] || hostSites[0]),
          ...severity(rules, svc, null, sev),
          evidence: {
            status: "absent",
            hardInject: hard,
            inHostCatalog: own(hostCat, svc),
            providedByAnyInstalledPlugin: false,
          },
          basis: "本次探针明确记录该服务不存在；依赖种类与作用域独立保留",
        });
        account(svc, "finding", { reason: "运行时明确缺失" });
        continue;
      }
      let methods = null,
        methodSource = "目录";
      if (observed.status === "present" && observed.complete) {
        methods = observed.methods;
        methodSource = "运行时";
      } else if (
        unknown &&
        Array.isArray(hostCat[svc]?.methods) &&
        hostCat[svc].methods.length
      )
        methods = hostCat[svc].methods;
      if (!methods) {
        if (unknown && !own(hostCat, svc) && hostUse) {
          add({
            category: CATEGORY.UNPROVIDED_DEPENDENCY,
            certainty: "suspected",
            impactBasis: "inferred",
            service: svc,
            method: null,
            location: location(hostDeps[0] || hostSites[0]),
            severity: "degraded",
            impact: "该依赖没有足够运行时或目录证据，不能确认可用或缺失",
            basis: "未采样不等于不存在；仅列出待核实依赖",
            ruleSource: "default",
            ruleRef: null,
          });
          account(svc, "finding");
        } else {
          const reason =
            observed.status === "present"
              ? "方法采样缺失或被截断，不能判断缺方法"
              : "没有完整方法证据";
          abstained.push({ service: svc, basis: reason });
          account(svc, hostSites.length ? "abstained" : "no-calls", { reason });
          limitations.push(`${svc} ${reason}`);
        }
        continue;
      }
      const unknownMethods = new Set(observed.unknownMethods || []),
        nonCallable = new Set(observed.nonCallableMethods || []);
      const protectedCall = (s) =>
        s.guarded &&
        !(
          s.guardKind === "optional-method" &&
          nonCallable.has(s.method) &&
          !s.capabilityGuarded
        );
      for (const site of hostSites)
        if (unknownMethods.has(site.method))
          limitations.push(
            `${svc}.${site.method} 是未读取的访问器，可调用性未知`,
          );
      const missing = hostSites.filter(
        (s) => !methods.includes(s.method) && !unknownMethods.has(s.method),
      );
      if (hostSites.length === 0) {
        account(svc, "no-calls", {
          reason: "没有宿主调用点，不能证明功能可用",
        });
        continue;
      }
      account(svc, "abstained", {
        reason: `已比对 ${hostSites.length} 个宿主调用点，依据${methodSource}`,
      });
      for (const method of [...new Set(missing.map((s) => s.method))]) {
        const relevant = missing.filter((s) => s.method === method);
        const unsafe = relevant.filter((s) => !protectedCall(s));
        if (unsafe.length === 0) {
          filtered.push({
            service: svc,
            method,
            reason: "调用自身或控制它的分支明确检查方法能力",
          });
          account(svc, "guarded", { method });
          continue;
        }
        add({
          category: CATEGORY.HOST_METHOD_MISSING,
          certainty:
            methodSource === "运行时" &&
            unsafe.every(
              (s) => s.evidenceSource === "ast" && !s.inferredReceiver,
            )
              ? "certain"
              : "suspected",
          impactBasis: "inferred",
          service: svc,
          method,
          location: location(unsafe[0]),
          ...severity(rules, svc, method, {
            severity: "feature-dead",
            impact: "影响面未知",
          }),
          evidence: {
            methodSource,
            hostMethodCount: methods.length,
            callSource: unsafe[0].evidenceSource || "legacy",
            spans: unsafe.map((s) => ({
              file: s.file,
              start: s.start,
              end: s.end,
            })),
          },
          basis: `${methodSource}方法集没有此方法；源码存在未被方法能力检查保护的宿主调用`,
        });
        account(svc, "finding", { method });
      }
      if (methodSource === "运行时")
        verified += hostSites.filter(
          (s) => methods.includes(s.method) || protectedCall(s),
        ).length;
    }
    const declaration = declarationOf(p, dshVersion, {
      exemptions: compatibilityExemptions,
    });
    const rejectedPeers =
      declaration?.rejected ??
      declaration?.raw?.peers?.filter(
        (r) => r.source === "peerDependencies" && !r.compatible,
      ) ??
      [];
    const modern = declaration?.policy === "engines-first";
    if (modern && rejectedPeers.length && declaration.exempted === true)
      limitations.push(
        "声明范围未满足，但存在此插件与目标DSH的精确版本豁免；加载许可不证明API或业务兼容",
      );
    if (
      (rejectedPeers.length || declaration?.invalid) &&
      declaration?.exempted !== true
    ) {
      limitations.push(
        modern
          ? declaration.invalid
            ? declaration.invalid
            : "声明范围不匹配；精确版本豁免" +
              (declaration.exempted === null ? "未观测" : "未授予") +
              "，未实测加载结果"
          : "官方 peer 范围不匹配；未读取 exact-version 豁免，不能断言实际加载失败",
      );
      add({
        category: CATEGORY.DECLARED_INCOMPATIBLE,
        certainty: "certain",
        impactBasis: "inferred",
        service: null,
        method: null,
        location: null,
        severity: "degraded",
        impact: modern
          ? "按目标DSH声明规则未获放行；须核对精确豁免及实际加载，API存在不等于完整兼容"
          : "官方 peer 声明不支持当前 DSH；请确认版本范围与精确版本豁免，API 存在不等于完整兼容",
        basis:
          declaration.invalid ||
          rejectedPeers
            .map((r) => `${r.name}: ${r.range}，当前 ${dshVersion}`)
            .join("; "),
        evidence: {
          runtimeVersion: dshVersion,
          peers: rejectedPeers,
          exemption: modern
            ? declaration.exempted === null
              ? "unobserved"
              : "not-granted"
            : "unobserved",
          policy: declaration.policy ?? "legacy-peers",
          invalid: declaration.invalid ?? null,
        },
        ruleSource: "declaration",
        ruleRef: declaration.invalid
          ? "package.declaration"
          : rejectedPeers.some((r) => r.source === "engines.dsh")
            ? "package.engines.dsh"
            : "package.peerDependencies",
      });
    }
    if (declaration?.claimsCompatible && findings.length) {
      const certain = findings.every((f) => f.certainty === "certain");
      add({
        category: CATEGORY.DECLARATION_MISMATCH,
        certainty: certain ? "certain" : "suspected",
        impactBasis: "inferred",
        service: null,
        method: null,
        location: null,
        severity: "feature-dead",
        impact: `声明兼容 DSH ${dshVersion}，但发现 ${findings.length} 项${certain ? "有证据的冲突" : "待核实风险"}`,
        basis: certain
          ? "源码/运行时证据与兼容声明冲突"
          : "原始发现含疑似证据，不能称为实测不符",
        evidence: {
          declared: declaration.raw,
          measuredFindings: findings.length,
        },
        ruleSource: "declaration",
        ruleRef: null,
      });
    }
    for (const svc of p.services || [])
      if (!own(resolved, svc))
        account(svc, "no-calls", { reason: "没有可判定调用证据" });
    const verdict = findings.some((f) => f.severity === "fatal")
      ? "broken"
      : findings.length
        ? "partial"
        : "ok";
    const vacuous = verdict === "ok" && verified === 0;
    summary[verdict]++;
    if (vacuous) summary.vacuousOk = (summary.vacuousOk || 0) + 1;
    const limited = limitations.length > 0 || clientSide.length > 0 || vacuous;
    if (limited) summary.limited = (summary.limited || 0) + 1;
    Object.defineProperty(plugins, name, {
      value: {
        name,
        version: p.version,
        verdict,
        vacuous,
        findings,
        checked,
        resolved,
        clientSide,
        filtered,
        abstained,
        runtimeFacilities,
        coverage: {
          status: limited ? "limited" : "complete",
          verifiedCalls: verified,
          limitations: [...new Set(limitations)],
        },
      },
      enumerable: true,
    });
  }
  return {
    dshVersion,
    plugins,
    summary,
    categories: CATEGORY,
    certaintyLevels: CERTAINTY,
    observation: {
      ...observation,
      root: undefined,
      mode: observation.usable ? "runtime" : "catalogue",
    },
  };
}
