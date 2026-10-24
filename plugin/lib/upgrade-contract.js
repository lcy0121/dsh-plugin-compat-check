// Generated from lib/upgrade-contract.mjs; run node plugin/scripts/stage-contract.mjs
/** Browser-safe preview contract, also staged into the plugin. No imports. */
export const SUPPORTED_PREVIEW_VERSIONS = Object.freeze([
  "0.2.0-rc.2",
  "0.2.1-rc.2",
  "0.2.1-rc.3",
]);
const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const text = (x) => typeof x === "string" && x.length > 0;
const strings = (x) =>
  Array.isArray(x) && x.every((v) => typeof v === "string");
const hash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const integer = (x) => Number.isSafeInteger(x) && x >= 0;
const severityRank = { degraded: 0, "feature-dead": 1, fatal: 2 };
const certaintyRank = { suspected: 0, certain: 1 };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const findingKey = (plugin, f) =>
  JSON.stringify([
    plugin,
    f.category,
    f.service ?? null,
    f.method ?? null,
    f.location?.file ?? null,
    f.location?.line ?? null,
    f.location?.column ?? null,
    f.location?.start ?? null,
    f.location?.end ?? null,
  ]);

/** Keys retain plugin and exact source span; severity and certainty change independently. */
export function compareUpgradeFindings(currentReport, targetReport) {
  const changes = {
    added: [],
    worsened: [],
    resolved: [],
    unchanged: [],
    improved: [],
  };
  const collect = (report) => {
    const entries = new Map();
    for (const plugin of Object.keys(report.plugins).sort())
      for (const finding of report.plugins[plugin].findings) {
        const key = findingKey(plugin, finding);
        if (!entries.has(key)) entries.set(key, []);
        entries.get(key).push({ plugin, finding });
      }
    return entries;
  };
  const before = collect(currentReport),
    after = collect(targetReport);
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(key) || [],
      next = after.get(key) || [];
    for (let i = 0; i < Math.max(old.length, next.length); i++) {
      if (!old[i]) {
        changes.added.push(next[i]);
        continue;
      }
      if (!next[i]) {
        changes.resolved.push(old[i]);
        continue;
      }
      const a = old[i].finding,
        b = next[i].finding;
      const severity = severityRank[b.severity] - severityRank[a.severity];
      const certainty = certaintyRank[b.certainty] - certaintyRank[a.certainty];
      if (severity > 0 || certainty > 0)
        changes.worsened.push({ plugin: old[i].plugin, before: a, after: b });
      else if (severity < 0 || certainty < 0)
        changes.improved.push({ plugin: old[i].plugin, before: a, after: b });
      else changes.unchanged.push(next[i]);
    }
  }
  return changes;
}
export function upgradeExitCode(changes) {
  const risks = [
    ...changes.added.map((x) => x.finding),
    ...changes.worsened.map((x) => x.after),
  ];
  return risks.some((f) => f.severity === "fatal") ? 2 : risks.length ? 1 : 0;
}
function finding(f) {
  return (
    record(f) &&
    text(f.category) &&
    Object.hasOwn(severityRank, f.severity) &&
    Object.hasOwn(certaintyRank, f.certainty) &&
    ["inferred", "measured"].includes(f.impactBasis) &&
    text(f.impact) &&
    text(f.basis) &&
    (f.evidence === undefined || record(f.evidence)) &&
    [f.service, f.method].every(
      (x) => x === undefined || x === null || typeof x === "string",
    ) &&
    (f.location === null ||
      (record(f.location) &&
        text(f.location.file) &&
        Number.isSafeInteger(f.location.line) &&
        f.location.line > 0 &&
        ["column", "start", "end"].every(
          (k) =>
            f.location[k] === undefined ||
            f.location[k] === null ||
            integer(f.location[k]),
        ) &&
        (!(integer(f.location.start) && integer(f.location.end)) ||
          f.location.end >= f.location.start)))
  );
}
function report(body, version, artifactHash) {
  if (
    !record(body) ||
    body.schemaVersion !== 1 ||
    body.kind !== "plugin-compat-check/result" ||
    body.ok !== true ||
    body.error !== null ||
    body.dshVersion !== version ||
    !text(body.toolVersion) ||
    body.baseline !== null ||
    body.cache !== null ||
    !record(body.inputs) ||
    body.inputs.artifactSha256 !== artifactHash ||
    body.inputs.hasRuntimeSurface !== false ||
    !record(body.observation) ||
    body.observation.mode !== "catalogue" ||
    body.observation.usable !== false ||
    body.observation.bound !== false ||
    body.observation.profileId !== null ||
    body.observation.dshVersion !== null ||
    body.observation.probedAt !== null ||
    !strings(body.observation.notes) ||
    !record(body.plugins) ||
    !record(body.summary) ||
    !record(body.extraction) ||
    typeof body.extraction.scanComplete !== "boolean" ||
    !Array.isArray(body.extraction.diagnostics) ||
    !Array.isArray(body.extraction.manifests)
  )
    return false;
  const counts = {
    ok: 0,
    partial: 0,
    broken: 0,
    unknown: 0,
    limited: 0,
    vacuousOk: 0,
  };
  for (const [name, p] of Object.entries(body.plugins)) {
    if (
      !record(p) ||
      p.name !== name ||
      !(p.version === null || typeof p.version === "string") ||
      !Object.hasOwn(counts, p.verdict) ||
      ["limited", "vacuousOk"].includes(p.verdict) ||
      typeof p.vacuous !== "boolean" ||
      !Array.isArray(p.findings) ||
      !p.findings.every(finding) ||
      !record(p.coverage) ||
      !["complete", "limited"].includes(p.coverage.status) ||
      !integer(p.coverage.verifiedCalls) ||
      !strings(p.coverage.limitations) ||
      !record(p.resolved)
    )
      return false;
    for (const key of [
      "checked",
      "clientSide",
      "filtered",
      "abstained",
      "runtimeFacilities",
    ])
      if (!Array.isArray(p[key])) return false;
    if (
      p.verdict !== "unknown" &&
      p.verdict !==
        (p.findings.some((f) => f.severity === "fatal")
          ? "broken"
          : p.findings.length
            ? "partial"
            : "ok")
    )
      return false;
    if (
      p.vacuous !== (p.verdict === "ok" && p.coverage.verifiedCalls === 0) ||
      (p.coverage.status === "limited") !==
        (p.coverage.limitations.length > 0 ||
          p.clientSide.length > 0 ||
          p.vacuous)
    )
      return false;
    const dispositions = [
      "finding",
      "client-side",
      "self-provided",
      "runtime-facility",
      "filtered",
      "abstained",
      "guarded",
      "no-calls",
      "unknown",
    ];
    const checked = (x) =>
      record(x) && text(x.service) && dispositions.includes(x.disposition);
    if (
      !p.checked.every(checked) ||
      !Object.entries(p.resolved).every(
        ([svc, x]) => checked(x) && x.service === svc,
      ) ||
      !p.clientSide.every(
        (x) => record(x) && text(x.service) && text(x.note),
      ) ||
      !p.filtered.every(
        (x) => record(x) && text(x.service) && text(x.method) && text(x.reason),
      ) ||
      !p.abstained.every(
        (x) => record(x) && text(x.service) && text(x.basis),
      ) ||
      !p.runtimeFacilities.every(
        (x) => record(x) && text(x.name) && text(x.reason),
      )
    )
      return false;
    counts[p.verdict]++;
    if (p.coverage.status === "limited") counts.limited++;
    if (p.vacuous && p.verdict === "ok") counts.vacuousOk++;
  }
  return (
    Object.entries(counts).every(([k, v]) => body.summary[k] === v) &&
    body.exitCode ===
      (counts.broken ? 2 : counts.partial || counts.unknown ? 1 : 0)
  );
}
export function assertUpgradePreview(value) {
  const errors = [],
    need = (ok, key) => {
      if (!ok) errors.push(key);
    };
  if (!record(value)) throw new Error("升级预检契约不匹配: preview");
  need(
    value.schemaVersion === 1 &&
      value.kind === "plugin-compat-check/upgrade-preview",
    "schemaVersion/kind",
  );
  need(
    value.mode === "static-version-comparison" &&
      ["compared", "unsupported-version", "error"].includes(value.status),
    "mode/status",
  );
  need(
    text(value.toolVersion) &&
      value.baseline === null &&
      value.cache === null &&
      strings(value.limitations),
    "identity/isolation",
  );
  need(
    [value.currentVersion, value.targetVersion].every(
      (x) => x === null || typeof x === "string",
    ),
    "versions",
  );
  need(
    same(value.supportedVersions, SUPPORTED_PREVIEW_VERSIONS),
    "supportedVersions",
  );
  const groups = ["added", "worsened", "resolved", "unchanged", "improved"];
  need(record(value.changes) && record(value.summary), "changes/summary");
  for (const key of groups) {
    need(Array.isArray(value.changes?.[key]), "changes." + key);
    need(
      integer(value.summary?.[key]) &&
        value.summary[key] === value.changes?.[key]?.length,
      "summary." + key,
    );
    for (const item of Array.isArray(value.changes?.[key])
      ? value.changes[key]
      : [])
      need(
        record(item) &&
          text(item.plugin) &&
          (["worsened", "improved"].includes(key)
            ? finding(item.before) && finding(item.after)
            : finding(item.finding)),
        "finding." + key,
      );
  }
  need(integer(value.summary?.limitedPlugins), "summary.limitedPlugins");
  if (value.status === "compared") {
    need(
      value.ok === true &&
        value.error === null &&
        SUPPORTED_PREVIEW_VERSIONS.includes(value.currentVersion) &&
        SUPPORTED_PREVIEW_VERSIONS.includes(value.targetVersion),
      "compared.versions/ok",
    );
    need(record(value.catalogs), "catalogs");
    for (const side of ["current", "target"]) {
      const item = value.catalogs?.[side];
      need(
        record(item) &&
          item.version === value[side + "Version"] &&
          text(item.file) &&
          hash(item.sha256) &&
          record(item.source) &&
          text(item.source.host) &&
          text(item.source.client),
        "catalog." + side,
      );
    }
    need(
      record(value.rules) && text(value.rules.file) && hash(value.rules.sha256),
      "rules",
    );
    need(
      record(value.artifact) &&
        hash(value.artifact.sha256) &&
        Array.isArray(value.artifact.packages) &&
        value.artifact.packages.every(
          (p) =>
            record(p) &&
            text(p.name) &&
            (p.version === null || typeof p.version === "string") &&
            hash(p.sha256),
        ),
      "artifact",
    );
    const validReports =
      report(
        value.currentReport,
        value.currentVersion,
        value.artifact?.sha256,
      ) &&
      report(value.targetReport, value.targetVersion, value.artifact?.sha256);
    need(validReports, "canonicalReports");
    if (validReports) {
      const identities = (body) =>
        Object.values(body.plugins)
          .map((p) => JSON.stringify([p.name, p.version]))
          .sort();
      const currentIdentities = identities(value.currentReport);
      const targetIdentities = identities(value.targetReport);
      const artifactIdentities = Array.isArray(value.artifact?.packages)
        ? value.artifact.packages.map((p) =>
            JSON.stringify([p?.name, p?.version]),
          )
        : [];
      const artifactIdentitySet = new Set(artifactIdentities),
        currentIdentitySet = new Set(currentIdentities);
      need(
        same(currentIdentities, targetIdentities),
        "canonicalReports.same-input",
      );
      need(
        artifactIdentitySet.size === artifactIdentities.length &&
          currentIdentities.length === artifactIdentities.length &&
          currentIdentities.every((identity) =>
            artifactIdentitySet.has(identity),
          ) &&
          artifactIdentities.every((identity) =>
            currentIdentitySet.has(identity),
          ),
        "artifact.package-identities",
      );
      need(
        same(
          value.changes,
          compareUpgradeFindings(value.currentReport, value.targetReport),
        ),
        "changes.evidence",
      );
      const limited = new Set(
        [
          ...Object.values(value.currentReport.plugins),
          ...Object.values(value.targetReport.plugins),
        ]
          .filter((p) => p.coverage.status === "limited")
          .map((p) => p.name),
      );
      need(
        value.summary?.limitedPlugins === limited.size,
        "summary.limitedPlugins/count",
      );
    }
    if (!errors.length)
      need(value.exitCode === upgradeExitCode(value.changes), "exitCode");
  } else {
    need(
      value.ok === false && text(value.error) && value.exitCode === 3,
      "failure.error/exitCode",
    );
    need(
      ["artifact", "catalogs", "rules", "currentReport", "targetReport"].every(
        (k) => value[k] === null,
      ),
      "failure.evidence",
    );
    need(
      groups.every((k) => value.changes?.[k]?.length === 0) &&
        value.summary?.limitedPlugins === 0,
      "failure.changes",
    );
    if (value.status === "unsupported-version")
      need(
        !SUPPORTED_PREVIEW_VERSIONS.includes(value.currentVersion) ||
          !SUPPORTED_PREVIEW_VERSIONS.includes(value.targetVersion),
        "unsupported-version",
      );
  }
  if (errors.length)
    throw new Error("升级预检契约不匹配: " + errors.join(", "));
  return value;
}

export const UPGRADE_PREVIEW_LIMITATIONS = Object.freeze([
  "静态版本预测未认证未来环境或业务通过；没有新增风险仅表示本次未发现新增静态风险。",
  "对同一组插件的私有字节副本联合静态提取一次，识别名集合取两个目录的并集；随后各按对应版本目录独立判定，不能复用普通实时体检证明未来环境。",
  "API目录不是运行时服务面；确定性、推断影响、覆盖限制、无已验证调用及客户端待验证信息均保留。",
  "当前宿主运行时、探针、条目状态、profile豁免、缓存和基线不参与预测；不执行插件代码、不安装或升级。",
  "输入采用有界复制及两次一致性观察，检测普通并发变更；不是操作系统原子快照。",
  "退出码仅反映新增或变重风险：0无新增，1新增非致命，2新增致命，3预检不可用；目标版本原有风险仍列出。",
]);
const emptyChanges = () => ({
  added: [],
  worsened: [],
  resolved: [],
  unchanged: [],
  improved: [],
});
export function createUpgradeFailure(error, options = {}) {
  if (error && typeof error === "object" && !(error instanceof Error)) {
    options = error;
    error = options.error;
  }
  const value = {
    schemaVersion: 1,
    kind: "plugin-compat-check/upgrade-preview",
    toolVersion: text(options.toolVersion) ? options.toolVersion : "unknown",
    mode: "static-version-comparison",
    ok: false,
    error: String(error?.message || error || "升级预检不可用"),
    exitCode: 3,
    status:
      options.status === "unsupported-version"
        ? "unsupported-version"
        : "error",
    currentVersion:
      typeof options.currentVersion === "string"
        ? options.currentVersion
        : null,
    targetVersion:
      typeof options.targetVersion === "string" ? options.targetVersion : null,
    supportedVersions: [...SUPPORTED_PREVIEW_VERSIONS],
    catalogs: null,
    artifact: null,
    rules: null,
    currentReport: null,
    targetReport: null,
    changes: emptyChanges(),
    summary: {
      added: 0,
      worsened: 0,
      resolved: 0,
      unchanged: 0,
      improved: 0,
      limitedPlugins: 0,
    },
    limitations: [...UPGRADE_PREVIEW_LIMITATIONS],
    baseline: null,
    cache: null,
  };
  return assertUpgradePreview(value);
}
