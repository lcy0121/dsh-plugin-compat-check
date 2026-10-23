// Client half of dsh-plugin-compat-check — the overview table (docs/Plan.md §5 C2).
//
// This file is a PREBUILT artifact: the host does not build plugin client code.
// If it moves to src/ the entry fails to activate with "run pnpm build before
// launch", so it stays here as plain, dependency-free JS.
//
// Contract (docs/Plan.md §7.3, verified on 0.2.0-rc.2):
//   window.__ModuleLoader__.load({ id: "<package name>", factory })
//   factory(require) -> { name, inject: ["slots"], apply(ctx) }
//
// `inject` here lists OTHER CLIENT PLUGIN PACKAGES, not service names.
//
// The slot this fills is `settings.plugins.tab`, whose host page is
// Settings → 内置插件 (served by @deepseek-ai/dsh-client-ui-settings-plugins).
// That page already has a 插件列表 tab, so this one must answer a DIFFERENT
// question: it is a **verdict** table ("is what I have installed actually
// compatible"), not an inventory.
//
// Data comes from the host half over HTTP: GET /plugin-compat-check/report.
// The browser cannot read the filesystem, and the verdict must not be computed
// twice — one kernel, one answer.

window.__ModuleLoader__.load({
  id: "dsh-plugin-compat-check",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    // BEGIN GENERATED REPORT CONTRACT
    var ReportContract = (function () {
/** Browser-safe runtime type contracts. No imports: staged into the prebuilt
 * client and plugin host from this single source. Unknown additive fields are
 * preserved. Version changes or missing evidence fail closed as tool errors.
 * @typedef {{status:'complete'|'limited',verifiedCalls:number,limitations:string[]}} Coverage
 * @typedef {{category:string,severity:'fatal'|'feature-dead'|'degraded',certainty:'certain'|'suspected',impactBasis:'measured'|'inferred',location:object|null}} Finding
 * @typedef {{mode:'catalogue'|'runtime',bound:boolean,usable:boolean,notes:string[],profileId:string|null,dshVersion:string|null,probedAt:string|null}} Observation
 */
const REPORT_SCHEMA = 1;
const REPORT_KIND = "plugin-compat-check/result";
const ENVELOPE_KIND = "plugin-compat-check/report";
/** Reviewed catalogue bytes, not a promise of plugin business compatibility.
 * Adding a version requires source verification, rule review and integration
 * evidence; extraction alone must never extend this list. */
const CATALOG_REFERENCES = Object.freeze([
  Object.freeze({
    version: "0.2.0-rc.2",
    file: "dsh-api-catalog.json",
    sha256: "1331bf3220c1e06cfe087237077118d002dc04c32d027ce01da74c6a0d1dc9ad",
  }),
  Object.freeze({
    version: "0.2.1-rc.2",
    file: "dsh-api-catalog-0.2.1-rc.2.json",
    sha256: "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
  }),
]);
function describeCatalog({
  targetVersion = null,
  referenceVersion = null,
  sha256,
  override = false,
}) {
  const known =
    !override &&
    CATALOG_REFERENCES.find(
      (c) => c.version === referenceVersion && c.sha256 === sha256,
    );
  const verified = Boolean(known && targetVersion === referenceVersion);
  return {
    targetVersion,
    referenceVersion,
    sha256,
    selection: override ? "override" : verified ? "exact" : "fallback",
    verified,
    certifiedVersions: known ? [known.version] : [],
    scope:
      "仅核验内置目录字节及对应精确版本的集成；不代表业务验收或运行时观测。",
    warning: verified
      ? null
      : override
        ? "自定义参考目录未认证；目录自报版本或相同字节不扩大已验收范围，请在实际目标宿主复核。"
        : "目标 DSH 版本未知或未认证；普通体检使用参考目录回退，不能据此认定该版本已验收。",
  };
}
function catalogLines(c) {
  if (!c) return ["API 目录身份未提供；版本范围未认证，请重新体检。"];
  return [
    "目标 DSH：" + (c.targetVersion || "未知"),
    "参考目录：" + (c.referenceVersion || "未知") + " · SHA-256：" + c.sha256,
    "目录认证范围：" +
      (c.certifiedVersions.join("、") || "无") +
      "；" +
      c.scope,
    ...(c.warning ? [c.warning] : []),
  ];
}
const record = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v) => typeof v === "string" && v.length > 0;
const nullableText = (v) => v === null || typeof v === "string";
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const strings = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const verdicts = ["ok", "partial", "broken", "unknown"];
const severities = ["fatal", "feature-dead", "degraded"];
const certainties = ["certain", "suspected"];
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
function coherentVerdict(p) {
  if (!Array.isArray(p.findings)) return false;
  return (
    p.verdict === "unknown" ||
    p.verdict ===
      (p.findings.some((f) => f?.severity === "fatal")
        ? "broken"
        : p.findings.length
          ? "partial"
          : "ok")
  );
}
function snapshotFinding(f) {
  return (
    record(f) &&
    text(f.key) &&
    text(f.category) &&
    severities.includes(f.severity) &&
    certainties.includes(f.certainty) &&
    nullableText(f.location)
  );
}
function checkedEntry(v) {
  return record(v) && text(v.service) && dispositions.includes(v.disposition);
}
// Producers resolve relative observation paths before serialization. Lexical
// normalization here is platform independent and needs no browser Node shim.
function pathIdentity(v) {
  const normalized = v.replace(/\\/g, "/");
  const parts = [];
  for (const part of normalized.split("/")) {
    if (part === "..") parts.pop();
    else if (part && part !== ".") parts.push(part);
  }
  return (normalized.startsWith("/") ? "/" : "") + parts.join("/");
}
function need(errors, condition, path) {
  if (!condition) errors.push(path);
}
function exitCodeForSummary(summary) {
  return summary.broken > 0
    ? 2
    : summary.partial > 0 || summary.unknown > 0
      ? 1
      : 0;
}
function createFailure(error, options = {}) {
  return {
    ...options,
    schemaVersion: REPORT_SCHEMA,
    kind: REPORT_KIND,
    ok: false,
    exitCode: 3,
    toolVersion: options.toolVersion ?? null,
    error: String(error || "Unknown tool error"),
    inputs: options.inputs || {},
  };
}
function validateObservation(value) {
  const e = [];
  if (!record(value)) return ["observation"];
  need(e, ["runtime", "catalogue"].includes(value.mode), "observation.mode");
  need(e, typeof value.bound === "boolean", "observation.bound");
  need(e, typeof value.usable === "boolean", "observation.usable");
  need(e, strings(value.notes), "observation.notes");
  for (const key of ["profileId", "dshVersion", "probedAt"])
    need(e, nullableText(value[key]), "observation." + key);
  if (value.probedAt !== null)
    need(
      e,
      Number.isFinite(Date.parse(value.probedAt)),
      "observation.probedAt",
    );
  need(
    e,
    (value.mode === "runtime") === value.usable,
    "observation.mode/usable",
  );
  return e;
}
function validateFinding(f) {
  const e = [];
  if (!record(f)) return ["finding"];
  need(e, text(f.category), "finding.category");
  need(e, severities.includes(f.severity), "finding.severity");
  need(e, certainties.includes(f.certainty), "finding.certainty");
  need(
    e,
    ["inferred", "measured"].includes(f.impactBasis),
    "finding.impactBasis",
  );
  need(e, text(f.impact), "finding.impact");
  need(e, text(f.basis), "finding.basis");
  for (const key of ["service", "method"])
    if (f[key] !== undefined) need(e, nullableText(f[key]), "finding." + key);
  need(
    e,
    f.location === null ||
      (record(f.location) &&
        text(f.location.file) &&
        Number.isSafeInteger(f.location.line) &&
        f.location.line > 0),
    "finding.location",
  );
  if (f.evidence !== undefined) need(e, record(f.evidence), "finding.evidence");
  if (record(f.location)) {
    for (const key of ["column", "start", "end"])
      if (f.location[key] !== undefined && f.location[key] !== null)
        need(e, integer(f.location[key]), "finding.location." + key);
    if (integer(f.location.start) && integer(f.location.end))
      need(e, f.location.end >= f.location.start, "finding.location.span");
  }
  return e;
}
function validateBaseline(value) {
  const e = [];
  if (!record(value) || value.schemaVersion !== 2)
    return ["baseline.schemaVersion"];
  need(e, nullableText(value.dshVersion), "baseline.dshVersion");
  need(
    e,
    record(value.identity) && text(value.identity.mode),
    "baseline.identity",
  );
  if (!record(value.plugins)) return [...e, "baseline.plugins"];
  for (const [name, p] of Object.entries(value.plugins)) {
    if (!record(p)) {
      e.push("baseline.plugin:" + name);
      continue;
    }
    need(
      e,
      nullableText(p.version) && verdicts.includes(p.verdict),
      "baseline.plugin:" + name,
    );
    need(e, Array.isArray(p.findings), "baseline.findings:" + name);
    need(e, coherentVerdict(p), "baseline.verdict/findings:" + name);
    if (p.vacuous !== undefined)
      need(e, typeof p.vacuous === "boolean", "baseline.vacuous:" + name);
    for (const f of Array.isArray(p.findings) ? p.findings : []) {
      if (!record(f)) {
        e.push("baseline.finding:" + name);
        continue;
      }
      need(e, snapshotFinding(f), "baseline.finding:" + name);
    }
  }
  return e;
}
function validateBaselineResult(b) {
  if (b === null) return [];
  const e = [];
  if (!record(b)) return ["baseline result"];
  if (b.error !== undefined) {
    need(e, text(b.error) && text(b.note), "baseline.error");
    return e;
  }
  need(e, typeof b.wrote === "boolean", "baseline.wrote");
  need(e, record(b.badge), "baseline.badge");
  if (record(b.badge)) {
    need(
      e,
      typeof b.badge.show === "boolean" &&
        nullableText(b.badge.text) &&
        nullableText(b.badge.detail) &&
        [null, "worse", "better", "mixed", "neutral"].includes(
          b.badge.direction,
        ),
      "baseline.badge.fields",
    );
  }
  if (b.diff !== null) {
    need(
      e,
      record(b.diff) && typeof b.diff.comparable === "boolean",
      "baseline.diff",
    );
    if (record(b.diff)) {
      for (const key of [
        "added",
        "removed",
        "worsened",
        "improved",
        "updated",
      ]) {
        need(e, Array.isArray(b.diff[key]), "baseline.diff." + key);
        for (const entry of Array.isArray(b.diff[key]) ? b.diff[key] : []) {
          const at = "baseline.diff." + key;
          if (!record(entry)) {
            e.push(at + ".entry");
            continue;
          }
          need(e, text(entry.name), at + ".name");
          if (key === "added" || key === "removed") {
            need(e, nullableText(entry.version), at + ".version");
            continue;
          }
          need(
            e,
            nullableText(entry.versionFrom) &&
              nullableText(entry.versionTo) &&
              typeof entry.versionChanged === "boolean" &&
              verdicts.includes(entry.verdictFrom) &&
              verdicts.includes(entry.verdictTo) &&
              text(entry.reason),
            at + ".fields",
          );
          for (const field of ["newFindings", "goneFindings"]) {
            need(
              e,
              Array.isArray(entry[field]) &&
                entry[field].every(snapshotFinding),
              at + "." + field,
            );
          }
          need(
            e,
            Array.isArray(entry.changedFindings) &&
              entry.changedFindings.every(
                (c) =>
                  record(c) && snapshotFinding(c.from) && snapshotFinding(c.to),
              ),
            at + ".changedFindings",
          );
        }
      }
      for (const key of ["dshVersionFrom", "dshVersionTo", "reason"])
        need(e, nullableText(b.diff[key]), "baseline.diff." + key);
      need(
        e,
        typeof b.diff.dshVersionChanged === "boolean",
        "baseline.diff.dshVersionChanged",
      );
    }
  }
  return e;
}
function validateReportBody(body) {
  const e = [];
  if (!record(body)) return ["report"];
  need(
    e,
    body.schemaVersion === REPORT_SCHEMA && body.kind === REPORT_KIND,
    "report.schemaVersion/kind",
  );
  need(e, typeof body.ok === "boolean", "report.ok");
  need(e, nullableText(body.toolVersion), "report.toolVersion");
  need(e, record(body.inputs), "report.inputs");
  if (body.ok === false) {
    need(e, body.exitCode === 3 && text(body.error), "report.error/exitCode");
    return e;
  }
  need(e, body.error === null, "report.error");
  need(e, nullableText(body.dshVersion), "report.dshVersion");
  // Older schema-1 reports remain readable, but consumers show missing identity.
  if (body.catalog !== undefined) {
    const c = body.catalog;
    if (
      !record(c) ||
      !nullableText(c.referenceVersion) ||
      !/^[a-f0-9]{64}$/.test(c.sha256)
    )
      e.push("report.catalog");
    else {
      const expected = describeCatalog({
        targetVersion: body.dshVersion,
        referenceVersion: c.referenceVersion,
        sha256: c.sha256,
        override: c.selection === "override",
      });
      if (
        c.selection !== "override" &&
        !CATALOG_REFERENCES.some(
          (k) => k.version === c.referenceVersion && k.sha256 === c.sha256,
        )
      )
        e.push("report.catalog.identity");
      for (const [key, value] of Object.entries(expected))
        need(
          e,
          JSON.stringify(c[key]) === JSON.stringify(value),
          "report.catalog." + key,
        );
    }
  }
  e.push(...validateObservation(body.observation));
  if (
    record(body.observation) &&
    body.observation.bound &&
    body.observation.usable
  ) {
    const o = body.observation;
    if (text(body.dshVersion) && text(o.dshVersion))
      need(
        e,
        o.dshVersion === body.dshVersion,
        "observation/report.dshVersion",
      );
    if (text(body.inputs?.nodeModules) && text(o.profileId))
      need(
        e,
        pathIdentity(o.profileId) === pathIdentity(body.inputs.nodeModules),
        "observation/report.profileId",
      );
  }
  e.push(...validateBaselineResult(body.baseline));
  const summary = body.summary,
    plugins = body.plugins;
  if (!record(summary) || !record(plugins))
    return [...e, "report.summary/plugins"];
  for (const key of [...verdicts, "limited", "vacuousOk"])
    need(e, integer(summary[key]), "summary." + key);
  const counts = {
    ok: 0,
    partial: 0,
    broken: 0,
    unknown: 0,
    limited: 0,
    vacuousOk: 0,
  };
  for (const [name, p] of Object.entries(plugins)) {
    if (!record(p)) {
      e.push("plugin:" + name);
      continue;
    }
    need(
      e,
      p.name === name &&
        nullableText(p.version) &&
        verdicts.includes(p.verdict),
      "plugin.identity/verdict:" + name,
    );
    need(e, typeof p.vacuous === "boolean", "plugin.vacuous:" + name);
    if (verdicts.includes(p.verdict)) counts[p.verdict]++;
    if (p.vacuous && p.verdict === "ok") counts.vacuousOk++;
    const c = p.coverage;
    need(
      e,
      record(c) &&
        ["complete", "limited"].includes(c.status) &&
        integer(c.verifiedCalls) &&
        strings(c.limitations),
      "plugin.coverage:" + name,
    );
    if (c?.status === "limited") counts.limited++;
    for (const key of [
      "findings",
      "checked",
      "clientSide",
      "filtered",
      "abstained",
      "runtimeFacilities",
    ])
      need(e, Array.isArray(p[key]), "plugin." + key + ":" + name);
    if (Array.isArray(p.findings))
      for (const f of p.findings)
        e.push(...validateFinding(f).map((x) => name + ":" + x));
    need(e, coherentVerdict(p), "plugin.verdict/findings:" + name);
    if (record(c) && integer(c.verifiedCalls))
      need(
        e,
        p.vacuous === (p.verdict === "ok" && c.verifiedCalls === 0),
        "plugin.vacuous/coverage:" + name,
      );
    if (record(c) && strings(c.limitations) && Array.isArray(p.clientSide))
      need(
        e,
        (c.status === "limited") ===
          (c.limitations.length > 0 ||
            p.clientSide.length > 0 ||
            p.vacuous === true),
        "plugin.coverage/status:" + name,
      );
    need(e, record(p.resolved), "plugin.resolved:" + name);
    if (record(p.resolved))
      for (const [service, value] of Object.entries(p.resolved))
        need(
          e,
          checkedEntry(value) && value.service === service,
          "plugin.resolved.entry:" + name + "." + service,
        );
    for (const [key, valid] of [
      ["checked", checkedEntry],
      ["clientSide", (v) => record(v) && text(v.service) && text(v.note)],
      [
        "filtered",
        (v) => record(v) && text(v.service) && text(v.method) && text(v.reason),
      ],
      ["abstained", (v) => record(v) && text(v.service) && text(v.basis)],
      ["runtimeFacilities", (v) => record(v) && text(v.name) && text(v.reason)],
    ])
      if (Array.isArray(p[key]))
        need(e, p[key].every(valid), "plugin." + key + ".entry:" + name);
  }
  for (const key of Object.keys(counts))
    need(e, counts[key] === summary[key], "summary.count:" + key);
  need(e, body.exitCode === exitCodeForSummary(summary), "report.exitCode");
  need(
    e,
    record(body.extraction) &&
      typeof body.extraction.scanComplete === "boolean" &&
      Array.isArray(body.extraction.diagnostics) &&
      Array.isArray(body.extraction.manifests),
    "report.extraction",
  );
  return e;
}
function assertReportBody(body) {
  const errors = validateReportBody(body);
  if (errors.length) throw new Error("报告契约不匹配: " + errors.join(", "));
  return body;
}
function sealReportBody(input) {
  const observation = input.observation || {};
  const plugins = Object.fromEntries(
    Object.entries(input.plugins || {}).map(([name, p]) => [
      name,
      {
        ...p,
        findings: p.findings.map((f) => ({
          ...f,
          location: f.location ?? null,
        })),
      },
    ]),
  );
  return assertReportBody({
    ...input,
    schemaVersion: REPORT_SCHEMA,
    kind: REPORT_KIND,
    ok: true,
    error: null,
    exitCode: exitCodeForSummary(input.summary),
    summary: { limited: 0, vacuousOk: 0, ...input.summary },
    plugins,
    observation: {
      profileId: null,
      dshVersion: null,
      probedAt: null,
      ...observation,
    },
    baseline: input.baseline ?? null,
  });
}
function failureEnvelope(error, options = {}) {
  const report = createFailure(error, {
    toolVersion: options.toolVersion ?? null,
    inputs: options.report?.inputs || {},
  });
  return {
    ...options,
    schemaVersion: REPORT_SCHEMA,
    kind: ENVELOPE_KIND,
    ok: false,
    error: report.error,
    exitCode: 3,
    toolVersion: report.toolVersion,
    baseline: null,
    report,
  };
}
function validateEnvelope(data) {
  if (
    !record(data) ||
    data.schemaVersion !== REPORT_SCHEMA ||
    data.kind !== ENVELOPE_KIND
  )
    return ["envelope.schemaVersion/kind"];
  const e = validateReportBody(data.report);
  if (Object.hasOwn(data, "issueReport"))
    need(e, typeof data.issueReport === "string", "envelope.issueReport");
  need(
    e,
    typeof data.ok === "boolean" && data.ok === data.report?.ok,
    "envelope.ok",
  );
  need(e, data.exitCode === data.report?.exitCode, "envelope.exitCode");
  need(e, data.error === data.report?.error, "envelope.error");
  need(
    e,
    data.toolVersion === data.report?.toolVersion,
    "envelope.toolVersion",
  );
  need(
    e,
    JSON.stringify(data.baseline) ===
      JSON.stringify(data.report?.baseline ?? null),
    "envelope.baseline",
  );
  return e;
}
function assertEnvelope(data) {
  const errors = validateEnvelope(data);
  if (errors.length) throw new Error("报告契约不匹配: " + errors.join(", "));
  return data;
}

return { assertEnvelope: assertEnvelope, catalogLines: catalogLines };
    })();
    // END GENERATED REPORT CONTRACT

    // BEGIN GENERATED FINDING GUIDANCE
    var FindingGuidance = (function () {
/** Presentation-only follow-up checks. Never changes a finding or performs work. */
function nextSteps(finding) {
  if (!finding || typeof finding !== "object") return [];
  switch (finding.category) {
    case "client-entry-missing":
      return [
        '检查该插件 package.json 的 dsh.client 与 exports["./client"] 客户端入口声明，并在实际安装制品中核对入口文件是否存在、可读且已随包交付。',
        "把已装插件的精确版本与制品文件清单对照；如需作者处理，提供缺失入口的包内相对位置，不猜测修复版本。",
        "补充同一目标的浏览器加载结果，并实际操作客户端功能、核验实际功能结果；静态入口发现不等于业务失败已实测。",
      ];
    case "declared-incompatible":
      return [
        "复核已装插件 package.json 的 engines.dsh 与官方 peerDependencies、字段格式及目标 DSH 版本；按报告所用声明策略核对生效字段。",
        "只读核对目标 profile 的 compatibility.json 是否有该插件名、插件精确版本与目标 DSH 精确版本的记录；未观测或未授予不等于可自行添加豁免。",
        "补充该目标的实际加载与功能结果；声明冲突不证明已经实际加载失败，豁免也不证明业务通过。",
      ];
    case "host-entry-inactive": {
      const state = finding.evidence?.state;
      const step =
        state === "FAILED"
          ? "定位该包对应的 FAILED loader 条目，先在本机查看失败原因与同次启动日志，核对导入、初始化失败发生在哪一步。"
          : state === "PENDING"
            ? "定位该包对应的 PENDING loader 条目，核对顶层必需 inject 与各依赖服务的提供者是否在同一宿主实际激活。"
            : "在同一目标宿主重新读取该包映射的 loader 条目状态，核对条目身份、启用状态与采样时间，不从说明文本猜测状态。";
      return [
        step,
        "补充同一 profile、DSH 版本和时间的服务观测及 loader 状态；LOADING、禁用或无法映射的条目不能代替 FAILED 或 PENDING 证据。",
        "服务或条目状态恢复后仍需实际操作对应功能并核验结果；激活成功不能代替业务验收。",
      ];
    }
    case "unprovided-dependency": {
      const absent = finding.evidence?.status === "absent";
      const steps = [
        absent
          ? "核对本次明确 absent 的服务观测是否属于同一 profile、DSH 版本与依赖作用域，并查看该服务的提供者是否实际激活。"
          : "该依赖仍待确认：补充同一 profile、DSH 版本与有效采样时间的服务观测；省略键或未采样不能确认服务缺失，也不能确认插件挂起。",
        finding.evidence?.hardInject === true
          ? "在报告给出的源码位置检查顶层必需 inject 与激活前提，再对照实际 loader 状态；依赖声明本身不能证明已经挂起。"
          : "在报告给出的源码位置区分可选或子作用域依赖与顶层硬依赖；不推断整个插件挂起，实际操作相关功能核验影响。",
      ];
      if (finding.evidence?.status === "unreadable")
        steps.push(
          "先在本机核对采样读取失败原因；只补安全的结构观测，不执行 getter 来消除未知。",
        );
      steps.push(
        "核对服务提供者的包声明与实际运行状态；提供声明只是线索，不自动安装依赖或认定某包能提供该服务。",
      );
      return steps;
    }
    case "host-service-missing":
      return [
        "在报告给出的源码位置核对服务读取及必需 inject 的作用域，并确认 absent 观测绑定同一 profile、DSH 版本与采样时间。",
        "核对该服务的实际提供者及 loader 状态，补充相关功能操作结果；服务缺失的推断影响不等于业务失败已实测。",
      ];
    case "host-method-missing":
      return [
        "在报告给出的文件与行号核对实际方法调用、Context 绑定及能力守卫，检查是否存在报告尚未识别的兜底。",
        "补充同一目标服务的完整方法结构观测，区分目录线索、未采样方法与明确缺失；实际操作对应功能核验推断影响。",
        "需要替代 API 时先查该目标版本的源码或官方契约并保留出处；本报告不猜测替代方法或修复版本。",
      ];
    case "declaration-mismatch":
      return [
        "对照已装插件的兼容声明、精确目标版本及报告中的具体 API 发现，分别核对声明范围与运行时证据。",
        "在已有源码位置检查调用与守卫，并补充同一目标的服务观测和实际功能结果；声明放行不证明业务通过。",
      ];
    default:
      return [
        "先核对该发现的类别、依据、已有包内位置和目标版本；缺少位置或状态时保留待确认，不补造证据。",
        "补充同一 profile、DSH 版本与采样时间的相关观测，再实际操作对应功能核验影响；不根据未知类别猜测修复。",
      ];
  }
}

return { nextSteps: nextSteps };
    })();
    // END GENERATED FINDING GUIDANCE

    // BEGIN GENERATED UPGRADE CONTRACT
    var UpgradeContract = (function () {
/** Browser-safe preview contract, also staged into the plugin. No imports. */
const SUPPORTED_PREVIEW_VERSIONS = Object.freeze([
  "0.2.0-rc.2",
  "0.2.1-rc.2",
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
function compareUpgradeFindings(currentReport, targetReport) {
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
function upgradeExitCode(changes) {
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
function assertUpgradePreview(value) {
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

const UPGRADE_PREVIEW_LIMITATIONS = Object.freeze([
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
function createUpgradeFailure(error, options = {}) {
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

return { assertUpgradePreview: assertUpgradePreview, SUPPORTED_PREVIEW_VERSIONS: SUPPORTED_PREVIEW_VERSIONS };
    })();
    // END GENERATED UPGRADE CONTRACT

    // BEGIN GENERATED DEPENDENCY GRAPH
    var DependencyGraphContract = (function () {
/** Browser-safe explanatory graph. Declarations never establish activation or failure. */
const GRAPH_KIND = "plugin-compat-check/dependency-graph";
const GRAPH_LIMITS = Object.freeze({
  nodes: 1000,
  edges: 4000,
  traversal: 20000,
  items: 20000,
});
const graphRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const graphText = (value) => typeof value === "string" && value.length > 0;
const graphArray = (value) => (Array.isArray(value) ? value : []);
const graphSides = (value) => {
  const sides = graphArray(value).filter(
    (side) => side === "host" || side === "client",
  );
  return sides.length ? [...new Set(sides)] : ["unknown"];
};
const graphId = (...parts) => JSON.stringify(parts);
const graphSource = (value) => ({
  file: typeof value?.file === "string" ? value.file : null,
  line: Number.isSafeInteger(value?.line) ? value.line : null,
  start: Number.isSafeInteger(value?.start) ? value.start : null,
  end: Number.isSafeInteger(value?.end) ? value.end : null,
});
const graphRequirement = (kind) =>
  kind === "required-inject"
    ? "required"
    : kind === "scoped-inject"
      ? "subcontext"
      : ["optional-read", "read"].includes(kind)
        ? "optional"
        : "unknown";

function buildDependencyGraph({
  extraction,
  verdict,
  entries,
  limits = {},
} = {}) {
  const report = extraction?.report || extraction || {};
  const budget = Object.fromEntries(
    Object.entries(GRAPH_LIMITS).map(([key, max]) => [
      key,
      Number.isSafeInteger(limits[key]) && limits[key] >= 0
        ? Math.min(limits[key], max)
        : max,
    ]),
  );
  const nodes = [],
    edges = [],
    impacts = [],
    cycles = [],
    reasons = new Set();
  const nodeMap = new Map(),
    edgeKeys = new Set(),
    plugins = new Map();
  let truncated = false,
    items = 0,
    steps = 0,
    pathItems = 0;
  const limit = (reason) => {
    truncated = true;
    reasons.add(reason);
  };
  const consume = () => {
    if (items >= budget.items) {
      limit("输入条目达到预算，关系及来源未完整读取");
      return false;
    }
    items++;
    return true;
  };
  const addNode = (node) => {
    if (nodeMap.has(node.id)) return nodeMap.get(node.id);
    if (nodes.length >= budget.nodes) {
      limit("节点达到预算，关系图已截断");
      return null;
    }
    nodes.push(node);
    nodeMap.set(node.id, node);
    return node;
  };
  const addEdge = (edge) => {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) return;
    const key = JSON.stringify(edge);
    if (edgeKeys.has(key)) return;
    if (edges.length >= budget.edges) {
      limit("关系达到预算，关系图已截断");
      return;
    }
    edgeKeys.add(key);
    edges.push({ id: `edge:${edges.length}`, ...edge });
  };
  const service = (name, side) =>
    addNode({
      id: graphId("service", side, name),
      kind: "service",
      name,
      side,
      state: "unknown",
    });
  const entryMap = new Map();
  const rows = Array.isArray(entries)
    ? entries
    : graphArray(verdict?.observation?.entries?.plugins);
  for (const row of rows) {
    if (!consume()) break;
    if (!graphRecord(row) || !graphText(row.packageName) || row.group) continue;
    if (!entryMap.has(row.packageName)) entryMap.set(row.packageName, []);
    entryMap.get(row.packageName).push({
      id: typeof row.id === "string" ? row.id : null,
      state: typeof row.state === "string" ? row.state : "unknown",
      disabled: row.disabled === true,
    });
  }
  if (report.scanComplete !== true)
    reasons.add("静态提取覆盖不完整或未声明，关系可能缺失");
  for (const [name, p] of Object.entries(report.perPlugin || {})) {
    if (!consume()) break;
    if (!graphRecord(p)) continue;
    const entryRows = entryMap.get(name) || [];
    const enabled = entryRows.filter((row) => !row.disabled);
    const states = [...new Set(enabled.map((row) => row.state))];
    const loaderState =
      entryRows.length && !enabled.length
        ? "disabled"
        : states.length === 1
          ? states[0]
          : states.length > 1
            ? "mixed"
            : "unknown";
    if (loaderState === "unknown")
      reasons.add("部分插件未提供可映射 loader 条目，状态为未知");
    const node = addNode({
      id: graphId("plugin", name),
      kind: "plugin",
      name,
      entries: entryRows,
      loaderState,
      subContexts: [],
    });
    if (!node) break;
    plugins.set(name, { node, plugin: p });
    if (graphArray(p.diagnostics).length)
      reasons.add("部分源码存在提取诊断，关系可能缺失");
    for (const context of graphArray(p.subContexts)) {
      if (!consume()) break;
      if (!graphRecord(context)) continue;
      const names = [];
      for (const name of graphArray(context.names)) {
        if (!consume()) break;
        if (graphText(name)) names.push(name);
      }
      node.subContexts.push({
        file: typeof context.file === "string" ? context.file : null,
        names,
      });
    }
  }
  for (const { node, plugin: p } of plugins.values()) {
    const declaredRelations = new Set();
    for (const dependency of graphArray(p.dependencies)) {
      if (!consume()) break;
      if (!graphText(dependency?.service)) continue;
      const sides = graphSides(dependency.sides);
      if (sides.includes("unknown"))
        reasons.add("部分依赖端归属未知，不用于传播推导");
      if (graphRequirement(dependency.kind) === "unknown")
        reasons.add("部分依赖必需性未证实，保留未知标记");
      for (const side of sides) {
        declaredRelations.add(graphId(dependency.service, side));
        const target = service(dependency.service, side);
        if (target)
          addEdge({
            kind: "dependency",
            from: node.id,
            to: target.id,
            service: dependency.service,
            side,
            requirement: graphRequirement(dependency.kind),
            declarationKind:
              typeof dependency.kind === "string" ? dependency.kind : "unknown",
            source: graphSource(dependency),
            potential: true,
          });
      }
    }
    for (const site of graphArray(p.callSites)) {
      if (!consume()) break;
      if (!graphText(site?.service)) continue;
      for (const side of graphSides(site.sides)) {
        const key = graphId(site.service, side);
        if (declaredRelations.has(key)) continue;
        declaredRelations.add(key);
        reasons.add("部分服务只见调用点，依赖必需性未知");
        const target = service(site.service, side);
        if (target)
          addEdge({
            kind: "dependency",
            from: node.id,
            to: target.id,
            service: site.service,
            side,
            requirement: "unknown",
            declarationKind: "call",
            source: graphSource(site),
            potential: true,
          });
      }
    }
    const provided = new Set();
    for (const site of graphArray(p.provideSites)) {
      if (!consume()) break;
      if (!graphText(site?.service)) continue;
      provided.add(site.service);
      for (const side of graphSides(site.sides)) {
        if (side === "unknown")
          reasons.add("部分提供声明缺少端归属，只列候选，不用于传播推导");
        const target = service(site.service, side);
        if (target)
          addEdge({
            kind: "candidate-provider",
            from: node.id,
            to: target.id,
            service: site.service,
            side,
            source: graphSource(site),
            sideMatch: side === "unknown" ? "unverified" : "source",
            potential: true,
          });
      }
    }
    for (const name of graphArray(p.providedServices)) {
      if (!consume()) break;
      if (!graphText(name) || provided.has(name)) continue;
      reasons.add("部分提供声明缺少端归属，只列候选，不用于传播推导");
      const target = service(name, "unknown");
      if (target)
        addEdge({
          kind: "candidate-provider",
          from: node.id,
          to: target.id,
          service: name,
          side: "unknown",
          source: graphSource(null),
          sideMatch: "unverified",
          potential: true,
        });
    }
    if (
      p.clientInject !== undefined &&
      p.clientInject !== null &&
      !Array.isArray(p.clientInject)
    )
      reasons.add("客户端包 inject 声明格式未识别，未猜测服务关系");
    for (const name of graphArray(p.clientInject)) {
      if (!consume()) break;
      if (!graphText(name)) {
        reasons.add("客户端包 inject 含未识别条目");
        continue;
      }
      const target = addNode({
        id: graphId("client-package", name),
        kind: "client-package",
        name,
        side: "client",
      });
      if (target)
        addEdge({
          kind: "client-package-inject",
          from: node.id,
          to: target.id,
          side: "client",
          potential: true,
        });
    }
  }
  const provisions = new Map(),
    consumers = new Map(),
    cycleKeys = new Set();
  for (const edge of edges) {
    if (edge.side === "unknown") continue;
    const map =
      edge.kind === "candidate-provider"
        ? provisions
        : edge.kind === "dependency"
          ? consumers
          : null;
    const key = edge.kind === "candidate-provider" ? edge.from : edge.to;
    if (map) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(edge);
    }
  }
  const step = () => {
    if (steps >= budget.traversal) {
      limit("传播遍历达到预算，潜在影响及环未完整枚举");
      return false;
    }
    steps++;
    return true;
  };
  for (const { node } of plugins.values()) {
    const affected = [],
      queue = [
        {
          plugin: node.id,
          side: null,
          path: [],
          requirements: [],
          plugins: [node.id],
        },
      ],
      seen = new Set();
    for (let head = 0; head < queue.length; head++) {
      if (!step()) break;
      const current = queue[head];
      for (const provision of provisions.get(current.plugin) || []) {
        if (!step()) break;
        if (current.side && provision.side !== current.side) continue;
        for (const dependency of consumers.get(provision.to) || []) {
          if (!step()) break;
          const path = [...current.path, provision.id, dependency.id];
          const requirement = [...current.requirements, dependency.requirement];
          const pluginPath = [...current.plugins, dependency.from];
          if (pathItems + path.length > budget.traversal) {
            limit("关系路径达到预算，潜在影响及环未完整列出");
            continue;
          }
          if (dependency.from === node.id) {
            const ring = pluginPath.slice(0, -1);
            const key = JSON.stringify([
              provision.side,
              [
                ...ring.map((_, i) =>
                  JSON.stringify([...ring.slice(i), ...ring.slice(0, i)]),
                ),
              ].sort()[0],
            ]);
            if (!cycleKeys.has(key)) {
              pathItems += path.length;
              cycleKeys.add(key);
              cycles.push({
                plugins: pluginPath,
                side: provision.side,
                path,
                potential: true,
              });
            }
            continue;
          }
          const key = graphId(dependency.from, provision.side);
          if (seen.has(key)) continue;
          seen.add(key);
          pathItems += path.length;
          affected.push({
            plugin: dependency.from,
            side: provision.side,
            path,
            requirements: requirement,
            potential: true,
          });
          queue.push({
            plugin: dependency.from,
            side: provision.side,
            path,
            requirements: requirement,
            plugins: pluginPath,
          });
        }
      }
    }
    impacts.push({ plugin: node.id, potential: true, affected });
  }
  return {
    schemaVersion: 1,
    kind: GRAPH_KIND,
    nodes,
    edges,
    impacts,
    cycles,
    coverage: {
      status: reasons.size ? "limited" : "complete",
      truncated,
      reasons: [...reasons],
      limits: budget,
    },
    notes: [
      "提供声明仅为候选线索；loader 条目状态不证明服务已注册。",
      "多个候选不表示实际选择了其中之一；替代提供者、禁用条目及可选依赖均需在真实宿主复核。",
      "受影响者及环仅表示同端声明关系的潜在影响，不表示实际挂起或失败；可选及子作用域依赖不等于根插件阻断。",
      "host/client 独立；client 包 inject 不当作 host 服务依赖；端未知的声明不用于传播推导。",
    ],
  };
}

/** Reject malformed optional views before rendering without changing the core report. */
function validateDependencyGraph(graph) {
  if (
    !graphRecord(graph) ||
    graph.kind !== GRAPH_KIND ||
    graph.schemaVersion !== 1
  )
    return false;
  const coverage = graph.coverage;
  if (
    !graphRecord(coverage) ||
    !["limited", "complete"].includes(coverage.status) ||
    typeof coverage.truncated !== "boolean" ||
    !Array.isArray(coverage.reasons) ||
    coverage.reasons.length > 100 ||
    !coverage.reasons.every(graphText) ||
    !graphRecord(coverage.limits)
  )
    return false;
  if (
    (coverage.truncated && coverage.status !== "limited") ||
    (coverage.status === "complete" && coverage.reasons.length) ||
    (coverage.status === "limited" && !coverage.reasons.length)
  )
    return false;
  for (const [key, max] of Object.entries(GRAPH_LIMITS))
    if (
      !Number.isSafeInteger(coverage.limits[key]) ||
      coverage.limits[key] < 0 ||
      coverage.limits[key] > max
    )
      return false;
  if (
    !Array.isArray(graph.nodes) ||
    graph.nodes.length > coverage.limits.nodes ||
    !Array.isArray(graph.edges) ||
    graph.edges.length > coverage.limits.edges ||
    !Array.isArray(graph.impacts) ||
    !Array.isArray(graph.cycles) ||
    !Array.isArray(graph.notes) ||
    graph.notes.length > 100 ||
    !graph.notes.every(graphText)
  )
    return false;
  const nodes = new Map(),
    edges = new Map();
  const validSide = (side) => ["host", "client", "unknown"].includes(side);
  const nonnegative = (value) =>
    value === null || (Number.isSafeInteger(value) && value >= 0);
  const source = (value) =>
    graphRecord(value) &&
    (value.file === null || typeof value.file === "string") &&
    nonnegative(value.line) &&
    nonnegative(value.start) &&
    nonnegative(value.end) &&
    (value.start === null || value.end === null || value.end >= value.start);
  let nestedItems = 0,
    pathItems = 0;
  for (const node of graph.nodes) {
    if (
      !graphRecord(node) ||
      !graphText(node.id) ||
      nodes.has(node.id) ||
      !graphText(node.name) ||
      !["plugin", "service", "client-package"].includes(node.kind)
    )
      return false;
    if (node.kind === "plugin") {
      if (
        !graphText(node.loaderState) ||
        !Array.isArray(node.entries) ||
        !Array.isArray(node.subContexts)
      )
        return false;
      nestedItems += node.entries.length + node.subContexts.length;
      if (nestedItems > coverage.limits.items) return false;
      if (
        !node.entries.every(
          (row) =>
            graphRecord(row) &&
            (row.id === null || typeof row.id === "string") &&
            graphText(row.state) &&
            typeof row.disabled === "boolean",
        )
      )
        return false;
      for (const context of node.subContexts) {
        if (
          !graphRecord(context) ||
          (context.file !== null && typeof context.file !== "string") ||
          !Array.isArray(context.names)
        )
          return false;
        nestedItems += context.names.length;
        if (
          nestedItems > coverage.limits.items ||
          !context.names.every(graphText)
        )
          return false;
      }
    } else if (
      !validSide(node.side) ||
      (node.kind === "service" && node.state !== "unknown") ||
      (node.kind === "client-package" && node.side !== "client")
    )
      return false;
    nodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (
      !graphRecord(edge) ||
      !graphText(edge.id) ||
      edges.has(edge.id) ||
      !nodes.has(edge.from) ||
      !nodes.has(edge.to) ||
      nodes.get(edge.from).kind !== "plugin" ||
      !validSide(edge.side) ||
      edge.potential !== true
    )
      return false;
    if (edge.kind === "client-package-inject") {
      if (
        nodes.get(edge.to).kind !== "client-package" ||
        edge.side !== "client"
      )
        return false;
    } else if (["dependency", "candidate-provider"].includes(edge.kind)) {
      if (
        nodes.get(edge.to).kind !== "service" ||
        !graphText(edge.service) ||
        nodes.get(edge.to).name !== edge.service ||
        nodes.get(edge.to).side !== edge.side ||
        !source(edge.source)
      )
        return false;
      if (
        edge.kind === "dependency" &&
        (!["required", "optional", "subcontext", "unknown"].includes(
          edge.requirement,
        ) ||
          !graphText(edge.declarationKind) ||
          edge.requirement !== graphRequirement(edge.declarationKind))
      )
        return false;
      if (
        edge.kind === "candidate-provider" &&
        edge.sideMatch !== (edge.side === "unknown" ? "unverified" : "source")
      )
        return false;
    } else return false;
    edges.set(edge.id, edge);
  }
  const validPath = (path, from, to, side, requirements, pluginPath) => {
    if (!Array.isArray(path) || path.length < 2 || path.length % 2)
      return false;
    pathItems += path.length;
    if (pathItems > coverage.limits.traversal) return false;
    if (
      requirements &&
      (!Array.isArray(requirements) || requirements.length * 2 !== path.length)
    )
      return false;
    if (
      pluginPath &&
      (!Array.isArray(pluginPath) ||
        pluginPath.length !== path.length / 2 + 1 ||
        pluginPath[0] !== from)
    )
      return false;
    let current = from;
    for (let i = 0; i < path.length; i += 2) {
      const provider = edges.get(path[i]),
        consumer = edges.get(path[i + 1]);
      if (
        provider?.kind !== "candidate-provider" ||
        consumer?.kind !== "dependency" ||
        provider.side !== side ||
        consumer.side !== side ||
        provider.from !== current ||
        provider.to !== consumer.to
      )
        return false;
      if (requirements && requirements[i / 2] !== consumer.requirement)
        return false;
      current = consumer.from;
      if (pluginPath && pluginPath[i / 2 + 1] !== current) return false;
    }
    return current === to;
  };
  if (
    graph.impacts.length > graph.nodes.length ||
    graph.cycles.length > coverage.limits.traversal
  )
    return false;
  const roots = new Set();
  let relationships = 0;
  for (const impact of graph.impacts) {
    if (
      !graphRecord(impact) ||
      nodes.get(impact.plugin)?.kind !== "plugin" ||
      roots.has(impact.plugin) ||
      impact.potential !== true ||
      !Array.isArray(impact.affected) ||
      impact.affected.length > coverage.limits.traversal
    )
      return false;
    roots.add(impact.plugin);
    const affected = new Set();
    for (const row of impact.affected) {
      if (
        ++relationships > coverage.limits.traversal ||
        !graphRecord(row) ||
        nodes.get(row.plugin)?.kind !== "plugin" ||
        row.plugin === impact.plugin ||
        row.potential !== true ||
        !["host", "client"].includes(row.side) ||
        !Array.isArray(row.requirements) ||
        !validPath(
          row.path,
          impact.plugin,
          row.plugin,
          row.side,
          row.requirements,
        )
      )
        return false;
      const key = graphId(row.plugin, row.side);
      if (affected.has(key)) return false;
      affected.add(key);
    }
  }
  for (const cycle of graph.cycles) {
    if (
      !graphRecord(cycle) ||
      cycle.potential !== true ||
      !["host", "client"].includes(cycle.side) ||
      !Array.isArray(cycle.plugins) ||
      cycle.plugins.length < 2 ||
      cycle.plugins[0] !== cycle.plugins.at(-1) ||
      !cycle.plugins.every((id) => nodes.get(id)?.kind === "plugin") ||
      !validPath(
        cycle.path,
        cycle.plugins[0],
        cycle.plugins[0],
        cycle.side,
        null,
        cycle.plugins,
      )
    )
      return false;
  }
  return true;
}

return { buildDependencyGraph:buildDependencyGraph, validateDependencyGraph:validateDependencyGraph };
    })();
    // END GENERATED DEPENDENCY GRAPH

    // BEGIN GENERATED FINDING REVIEW
    var FindingReviewContract = (function () {
/** Browser-safe manual-review contract. Reviews never modify canonical findings. */
const REVIEW_STATUS_LABELS = Object.freeze({
  pending: "待确认",
  reviewed: "已复核",
  "false-positive": "误报",
  fixed: "已修复",
  "needs-review": "待重审",
});
const REVIEW_LIMITS = Object.freeze({
  fileBytes: 1024 * 1024,
  records: 1000,
  note: 4000,
  findings: 5000,
  identityBytes: 128 * 1024,
});
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const hash = (x) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const safe = (x) =>
  typeof x === "string" &&
  !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(
    x,
  );
function fail(message) {
  throw Object.assign(new Error(message), { code: "REVIEW_INVALID" });
}
function stableIdentity(value) {
  const seen = new Set();
  let nodes = 0;
  function visit(x, depth = 0) {
    if (++nodes > 50000 || depth > 30) fail("Review identity exceeds limits");
    if (x === null || typeof x === "string" || typeof x === "boolean") return x;
    if (typeof x === "number" && Number.isFinite(x)) return x;
    if (typeof x !== "object" || seen.has(x)) fail("Invalid review identity");
    seen.add(x);
    const out = Array.isArray(x)
      ? x.map((v) => visit(v, depth + 1))
      : Object.fromEntries(
          Object.keys(x)
            .sort()
            .filter((k) => x[k] !== undefined)
            .map((k) => [k, visit(x[k], depth + 1)]),
        );
    seen.delete(x);
    return out;
  }
  const result = JSON.stringify(visit(value));
  if (result.length > REVIEW_LIMITS.identityBytes)
    fail("Review identity exceeds limits");
  return result;
}
function validateReviewInput(input) {
  if (
    !object(input) ||
    Object.keys(input).sort().join(",") !== "contextToken,findingId,note,status"
  )
    fail("Invalid review fields");
  if (!hash(input.contextToken) || !hash(input.findingId))
    fail("Invalid review context or finding ID");
  if (
    !Object.hasOwn(REVIEW_STATUS_LABELS, input.status) ||
    input.status === "needs-review"
  )
    fail("Invalid manual review status");
  if (!safe(input.note) || input.note.length > REVIEW_LIMITS.note)
    fail("Invalid review note");
  if (input.status !== "pending" && !input.note.trim())
    fail("Review note is required");
  return {
    contextToken: input.contextToken,
    findingId: input.findingId,
    status: input.status,
    note: input.note.trim(),
  };
}
function validateReviewDocument(doc) {
  if (
    !object(doc) ||
    Object.keys(doc).sort().join(",") !== "records,revision,schemaVersion" ||
    doc.schemaVersion !== 1 ||
    !hash(doc.revision) ||
    !Array.isArray(doc.records) ||
    doc.records.length > REVIEW_LIMITS.records
  )
    fail("Invalid review storage");
  const seen = new Set();
  for (const record of doc.records) {
    if (
      !object(record) ||
      Object.keys(record).sort().join(",") !==
        "findingId,identity,lineage,note,pluginName,pluginVersion,status,updatedAt"
    )
      fail("Invalid review record");
    validateReviewInput({
      contextToken: doc.revision,
      findingId: record.findingId,
      status: record.status,
      note: record.note,
    });
    if (
      !safe(record.pluginName) ||
      !record.pluginName ||
      record.pluginName.length > 500 ||
      !safe(record.pluginVersion) ||
      !record.pluginVersion ||
      record.pluginVersion.length > 200 ||
      typeof record.identity !== "string" ||
      record.identity.length > REVIEW_LIMITS.identityBytes ||
      typeof record.lineage !== "string" ||
      record.lineage.length > 2000 ||
      !Number.isFinite(Date.parse(record.updatedAt)) ||
      seen.has(record.findingId)
    )
      fail("Invalid review record identity");
    const binding = JSON.parse(record.identity);
    if (
      !object(binding) ||
      !object(binding.scope) ||
      !object(binding.finding) ||
      binding.pluginName !== record.pluginName ||
      binding.pluginVersion !== record.pluginVersion ||
      !safe(binding.finding.category) ||
      !binding.finding.category ||
      [
        "profileId",
        "originalPath",
        "mode",
        "toolVersion",
        "dshVersion",
        "rulesIdentity",
        "catalogIdentity",
        "sourceIdentity",
      ].some((key) => !safe(binding.scope[key]) || !binding.scope[key]) ||
      stableIdentity(binding) !== record.identity ||
      stableIdentity([
        record.pluginName,
        binding.finding.category,
        binding.finding.service ?? null,
        binding.finding.method ?? null,
      ]) !== record.lineage
    )
      fail("Invalid review binding");
    seen.add(record.findingId);
  }
  return doc;
}
/** Validate an optional API sidecar without trusting it to be a renderable review. */
function validateReviewEnvelope(value, report) {
  try {
    const keys = (x, want) =>
      object(x) && Object.keys(x).sort().join(",") === want;
    const text = (x, max) => safe(x) && x.length > 0 && x.length <= max;
    const note = (x) => safe(x) && x.length <= REVIEW_LIMITS.note;
    const manual = (x) =>
      Object.hasOwn(REVIEW_STATUS_LABELS, x) && x !== "needs-review";
    const record = (r, summary = false) =>
      keys(
        r,
        summary
          ? "findingId,note,noteTruncated,pluginName,pluginVersion,status,updatedAt"
          : "findingId,note,pluginName,pluginVersion,status,updatedAt",
      ) &&
      hash(r.findingId) &&
      text(r.pluginName, 500) &&
      text(r.pluginVersion, 200) &&
      manual(r.status) &&
      note(r.note) &&
      (r.status === "pending" ||
        r.note.trim().length > 0 ||
        (summary && r.noteTruncated)) &&
      text(r.updatedAt, 40) &&
      Number.isFinite(Date.parse(r.updatedAt)) &&
      (!summary ||
        (typeof r.noteTruncated === "boolean" && r.note.length <= 200));
    if (
      !keys(value, "contextToken,error,history,items,revision,schemaVersion") ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.items) ||
      value.items.length > REVIEW_LIMITS.findings ||
      !Array.isArray(value.history) ||
      value.history.length > REVIEW_LIMITS.records ||
      !(value.error === null || text(value.error, 4000))
    )
      return false;
    if (value.error && value.contextToken === null && value.revision === null)
      return value.items.length === 0 && value.history.length === 0;
    if (!hash(value.contextToken) || !hash(value.revision)) return false;
    const seenSlots = new Set(),
      seenHistory = new Set();
    for (const item of value.items) {
      if (
        !keys(
          item,
          "findingId,findingIndex,history,historyCount,note,pluginName,pluginVersion,record,reviewReason,status",
        ) ||
        !hash(item.findingId) ||
        !text(item.pluginName, 500) ||
        !text(item.pluginVersion, 200) ||
        !Number.isSafeInteger(item.findingIndex) ||
        item.findingIndex < 0 ||
        !Object.hasOwn(REVIEW_STATUS_LABELS, item.status) ||
        !note(item.note) ||
        !Array.isArray(item.history) ||
        item.history.length > 3 ||
        !Number.isSafeInteger(item.historyCount) ||
        item.historyCount < item.history.length ||
        item.historyCount > REVIEW_LIMITS.records ||
        !(item.reviewReason === null || text(item.reviewReason, 4000))
      )
        return false;
      const slot = JSON.stringify([item.pluginName, item.findingIndex]);
      if (seenSlots.has(slot)) return false;
      seenSlots.add(slot);
      if (report) {
        const plugin = report.plugins?.[item.pluginName];
        if (
          !plugin ||
          plugin.version !== item.pluginVersion ||
          !Array.isArray(plugin.findings) ||
          item.findingIndex >= plugin.findings.length
        )
          return false;
      }
      if (item.record !== null) {
        if (
          !record(item.record) ||
          item.record.findingId !== item.findingId ||
          item.record.pluginName !== item.pluginName ||
          item.record.pluginVersion !== item.pluginVersion ||
          item.record.status !== item.status ||
          item.record.note !== item.note
        )
          return false;
      } else if (
        item.note !== "" ||
        !["pending", "needs-review"].includes(item.status)
      )
        return false;
      if (
        item.status === "needs-review" &&
        (!item.historyCount || !item.reviewReason)
      )
        return false;
      if (item.historyCount > 0 && !item.reviewReason) return false;
      const local = new Set();
      for (const previous of item.history) {
        if (
          !record(previous, true) ||
          previous.findingId === item.findingId ||
          previous.pluginName !== item.pluginName ||
          local.has(previous.findingId)
        )
          return false;
        local.add(previous.findingId);
      }
    }
    for (const previous of value.history) {
      if (!record(previous) || seenHistory.has(previous.findingId))
        return false;
      seenHistory.add(previous.findingId);
    }
    if (report) {
      let count = 0;
      for (const plugin of Object.values(report.plugins || {})) {
        if (!Array.isArray(plugin.findings)) return false;
        count += plugin.findings.length;
      }
      if (count !== value.items.length) return false;
    }
    return true;
  } catch {
    return false;
  }
}
/** Exact identity includes evidence; lineage only offers old records as review history. */
function combineReviews(
  context,
  records,
  { revision = "0".repeat(64), error = null } = {},
) {
  const byId = new Map(),
    byLineage = new Map(),
    currentIds = new Set(context.findings.map((f) => f.findingId));
  const publicRecord = (r) => ({
    findingId: r.findingId,
    pluginName: r.pluginName,
    pluginVersion: r.pluginVersion,
    status: r.status,
    note: r.note,
    updatedAt: r.updatedAt,
  });
  for (const record of records) {
    byId.set(record.findingId, record);
    if (!byLineage.has(record.lineage)) byLineage.set(record.lineage, []);
    byLineage.get(record.lineage).push(record);
  }
  const items = context.findings.map((entry) => {
    const exact = byId.get(entry.findingId);
    const record =
      exact?.identity === entry.identity ? publicRecord(exact) : null;
    const previous = byLineage.get(entry.lineage) || [];
    const historyCount = previous.length - (exact ? 1 : 0);
    // Keep row summaries bounded; the independent history retains each full note once.
    const history = [];
    for (let i = previous.length - 1; i >= 0 && history.length < 3; i--) {
      if (previous[i].findingId === entry.findingId) continue;
      const old = publicRecord(previous[i]);
      history.push({
        ...old,
        note: old.note.slice(0, 200),
        noteTruncated: old.note.length > 200,
      });
    }
    return {
      findingId: entry.findingId,
      pluginName: entry.pluginName,
      pluginVersion: entry.pluginVersion,
      findingIndex: entry.findingIndex,
      status: record?.status || (historyCount ? "needs-review" : "pending"),
      note: record?.note || "",
      record,
      history,
      historyCount,
      reviewReason: historyCount
        ? "插件源码或版本、规则、目录、工具、观察目标或发现证据已变化；旧处置仅供参考，需要重新核实。"
        : null,
    };
  });
  return {
    schemaVersion: 1,
    contextToken: context.contextToken,
    revision,
    error,
    items,
    history: records
      .filter((r) => !currentIds.has(r.findingId))
      .map(publicRecord),
  };
}

return { REVIEW_STATUS_LABELS:REVIEW_STATUS_LABELS, REVIEW_LIMITS:REVIEW_LIMITS, validateReviewInput:validateReviewInput, validateReviewEnvelope:validateReviewEnvelope };
    })();
    // END GENERATED FINDING REVIEW

    // BEGIN GENERATED FUNCTIONAL HEALTH CONTRACT
    var FunctionalHealthContract = (function () {
/** Pure declarations/results contract. Author declarations never imply execution or compatibility. */
const FUNCTIONAL_HEALTH_KIND = "plugin-compat-check/functional-health";
const FUNCTIONAL_HEALTH_LIMITS = Object.freeze({
  checks: 32,
  path: 256,
  selector: 160,
  responseBytes: 65536,
  requestMs: 3000,
  totalMs: 180000,
});
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) =>
  object(v) && Object.keys(v).every((k) => allowed.includes(k));
const exactVersion = (v) =>
  typeof v === "string" &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
    v,
  );
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const bounded = (v, n) =>
  typeof v === "string" && v.length > 0 && v.length <= n;
const artifactValid = (a) =>
  keys(a, ["name", "version", "sha256"]) &&
  typeof a.name === "string" &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(a.name) &&
  a.name.length <= 214 &&
  exactVersion(a.version) &&
  digest(a.sha256);
function validFunctionalPath(v) {
  return (
    bounded(v, FUNCTIONAL_HEALTH_LIMITS.path) &&
    /^\/(?!\/)[A-Za-z0-9/_.,~-]*$/.test(v) &&
    !v.split("/").some((p) => p === ".." || p === ".")
  );
}
function validateFunctionalManifest(value) {
  const errors = [];
  if (
    !keys(value, ["schemaVersion", "artifact", "dshVersion", "checks"]) ||
    value.schemaVersion !== 1 ||
    !artifactValid(value.artifact) ||
    !exactVersion(value.dshVersion)
  )
    errors.push("Invalid manifest schema or exact artifact/DSH identity");
  if (
    !Array.isArray(value?.checks) ||
    value.checks.length < 1 ||
    value.checks.length > FUNCTIONAL_HEALTH_LIMITS.checks
  )
    errors.push("Expected 1..32 bounded checks");
  else {
    const seen = new Set();
    for (const c of value.checks) {
      if (
        !object(c) ||
        !bounded(c.id, 64) ||
        !/^[A-Za-z0-9_-]+$/.test(c.id) ||
        seen.has(c.id) ||
        !validFunctionalPath(c.path)
      ) {
        errors.push("Invalid check id/path or duplicate id");
        continue;
      }
      seen.add(c.id);
      if (c.type === "http") {
        if (
          !keys(c, ["id", "type", "path", "status", "json"]) ||
          !Number.isInteger(c.status) ||
          c.status < 200 ||
          c.status > 599 ||
          (c.status >= 300 && c.status < 400)
        )
          errors.push("Invalid HTTP check");
        if (
          c.json !== undefined &&
          (!keys(c.json, ["pointer", "equals"]) ||
            typeof c.json.pointer !== "string" ||
            c.json.pointer.length > 256 ||
            !/^(?:\/(?:[^~\u0000-\u001f]|~[01])*)*$/.test(c.json.pointer) ||
            !Object.hasOwn(c.json, "equals") ||
            ![null, "string", "boolean", "number"].includes(
              c.json.equals === null ? null : typeof c.json.equals,
            ) ||
            (typeof c.json.equals === "string" && c.json.equals.length > 256) ||
            (typeof c.json.equals === "number" &&
              !Number.isFinite(c.json.equals)))
        )
          errors.push(
            "JSON assertion must be a bounded JSON pointer and scalar value",
          );
      } else if (c.type === "dom") {
        if (
          !keys(c, [
            "id",
            "type",
            "path",
            "selector",
            "minCount",
            "maxCount",
          ]) ||
          !bounded(c.selector, FUNCTIONAL_HEALTH_LIMITS.selector) ||
          !/^[A-Za-z0-9_#.*\[\]="'\- >]+$/.test(c.selector) ||
          !Number.isInteger(c.minCount) ||
          !Number.isInteger(c.maxCount) ||
          c.minCount < 0 ||
          c.maxCount < c.minCount ||
          c.maxCount > 1000
        )
          errors.push("Invalid bounded DOM selector/count check");
      } else errors.push("Only HTTP GET and DOM selector counts are supported");
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, value };
}

/** Imported evidence is an offline assertion, not a signature or compatibility verdict. */
function validateFunctionalHealthResult(value, expectedIdentity = {}) {
  const errors = [];
  const iso = (v) =>
    typeof v === "string" &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
  if (
    !keys(value, [
      "schemaVersion",
      "kind",
      "status",
      "identity",
      "startedAt",
      "completedAt",
      "checks",
      "cleanup",
      "limitations",
      "error",
      "declaration",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== FUNCTIONAL_HEALTH_KIND ||
    !["tested-pass", "tested-failed", "error"].includes(value.status)
  )
    errors.push("Invalid functional health result schema/status");
  const declarationValidation = validateFunctionalManifest(value?.declaration);
  if (!declarationValidation.valid)
    errors.push("Missing or invalid executed declaration");
  const id = value?.identity;
  if (
    declarationValidation.valid &&
    (value.declaration.dshVersion !== id?.dshVersion ||
      ["name", "version", "sha256"].some(
        (k) => value.declaration.artifact[k] !== id?.artifact?.[k],
      ))
  )
    errors.push("Executed declaration identity differs from result");
  if (
    !keys(id, ["artifact", "dshVersion", "manifestSha256"]) ||
    !artifactValid(id.artifact) ||
    !exactVersion(id.dshVersion) ||
    !digest(id.manifestSha256)
  )
    errors.push("Invalid exact evidence identity");
  if (
    !iso(value?.startedAt) ||
    !iso(value?.completedAt) ||
    value.completedAt < value.startedAt ||
    Date.parse(value.completedAt) - Date.parse(value.startedAt) >
      FUNCTIONAL_HEALTH_LIMITS.totalMs + 30000
  )
    errors.push("Invalid bounded measurement times");
  if (
    !keys(value?.cleanup, ["stopped", "removed", "errors"]) ||
    typeof value.cleanup.stopped !== "boolean" ||
    typeof value.cleanup.removed !== "boolean" ||
    (value.cleanup.errors !== undefined &&
      (!Array.isArray(value.cleanup.errors) ||
        value.cleanup.errors.length > 8 ||
        value.cleanup.errors.some((x) => !bounded(x, 512))))
  )
    errors.push("Invalid cleanup evidence");
  if (
    !Array.isArray(value?.limitations) ||
    value.limitations.length < 1 ||
    value.limitations.length > 8 ||
    value.limitations.some((x) => !bounded(x, 512)) ||
    (value.error !== undefined && !bounded(value.error, 1024))
  )
    errors.push("Invalid limitations/error summary");
  const seen = new Set();
  if (!Array.isArray(value?.checks) || value.checks.length > 32)
    errors.push("Invalid check evidence");
  else
    for (const c of value.checks) {
      const e = c?.evidence;
      if (
        !keys(c, ["id", "type", "status", "evidence"]) ||
        !bounded(c.id, 64) ||
        !/^[A-Za-z0-9_-]+$/.test(c.id) ||
        seen.has(c.id) ||
        !["http", "dom"].includes(c.type) ||
        !["pass", "failed", "error"].includes(c.status) ||
        !keys(e, [
          "httpStatus",
          "responseBytes",
          "jsonMatched",
          "count",
          "elapsedMs",
          "error",
        ]) ||
        !Number.isFinite(e.elapsedMs) ||
        e.elapsedMs < 0 ||
        e.elapsedMs > FUNCTIONAL_HEALTH_LIMITS.totalMs
      ) {
        errors.push("Invalid check row");
        continue;
      }
      seen.add(c.id);
      if (c.status === "error") {
        if (!bounded(e.error, 256)) errors.push("Missing check error");
      } else if (c.type === "http") {
        if (
          !Number.isInteger(e.httpStatus) ||
          e.httpStatus < 200 ||
          e.httpStatus > 599 ||
          !Number.isInteger(e.responseBytes) ||
          e.responseBytes < 0 ||
          e.responseBytes > 65536 ||
          (e.jsonMatched !== undefined && typeof e.jsonMatched !== "boolean") ||
          e.count !== undefined ||
          e.error !== undefined
        )
          errors.push("Invalid HTTP evidence");
      } else if (
        !Number.isInteger(e.count) ||
        e.count < 0 ||
        e.httpStatus !== undefined ||
        e.responseBytes !== undefined ||
        e.jsonMatched !== undefined ||
        e.error !== undefined
      )
        errors.push("Invalid DOM evidence");
    }
  if (errors.length) return { valid: false, errors };
  if (declarationValidation.valid && Array.isArray(value?.checks)) {
    const expected = value.declaration.checks;
    if (
      (value.status !== "error" && value.checks.length !== expected.length) ||
      value.checks.length > expected.length
    )
      errors.push("Evidence must cover every declared check in order");
    for (let i = 0; i < value.checks.length; i++) {
      const row = value.checks[i],
        check = expected[i];
      if (!row || !check || row.id !== check.id || row.type !== check.type) {
        errors.push("Evidence check identity/order differs from declaration");
        continue;
      }
      if (row.status === "error") continue;
      const e = row.evidence;
      if (!object(e)) continue;
      const passed =
        check.type === "http"
          ? e.httpStatus === check.status &&
            (!check.json || e.jsonMatched === true)
          : e.count >= check.minCount && e.count <= check.maxCount;
      if (
        row.status !== (passed ? "pass" : "failed") ||
        (check.type === "http" &&
          Boolean(check.json) !== (e.jsonMatched !== undefined))
      )
        errors.push("Evidence outcome conflicts with executed expectation");
    }
  }
  if (
    value?.status === "tested-pass" &&
    (!value.checks?.length ||
      value.checks.some((c) => c?.status !== "pass") ||
      value.cleanup?.stopped !== true ||
      value.cleanup?.removed !== true ||
      value.cleanup?.errors?.length ||
      value.error !== undefined)
  )
    errors.push("Pass conflicts with checks or cleanup");
  if (
    value?.status === "tested-failed" &&
    (!value.checks?.some((c) => c?.status === "failed") ||
      value.checks.some((c) => c?.status === "error") ||
      value.cleanup?.stopped !== true ||
      value.cleanup?.removed !== true ||
      value.error !== undefined)
  )
    errors.push("Failed measurement conflicts with checks/cleanup");
  if (value?.status === "error" && !bounded(value.error, 1024))
    errors.push("Missing run error");
  if (errors.length) return { valid: false, errors };
  const staleReasons = [];
  if (
    !expectedIdentity.artifact ||
    !["name", "version", "sha256"].every(
      (k) => typeof expectedIdentity.artifact[k] === "string",
    )
  )
    staleReasons.push("Current artifact identity unavailable");
  else
    for (const key of ["name", "version", "sha256"])
      if (id.artifact[key] !== expectedIdentity.artifact[key])
        staleReasons.push("Artifact " + key + " changed");
  if (!expectedIdentity.dshVersion)
    staleReasons.push("Current DSH version unavailable");
  else if (id.dshVersion !== expectedIdentity.dshVersion)
    staleReasons.push("DSH version changed");
  if (!expectedIdentity.manifestSha256)
    staleReasons.push("Current declaration identity unavailable");
  else if (id.manifestSha256 !== expectedIdentity.manifestSha256)
    staleReasons.push("Declaration changed");
  return {
    valid: true,
    value,
    current: staleReasons.length === 0,
    staleReasons,
  };
}

/** SHA256 identity rule: UTF-8 of JSON with recursively sorted object keys and preserved array order, no whitespace. */
function canonicalFunctionalManifest(value) {
  const validation = validateFunctionalManifest(value);
  if (!validation.valid) throw Error(validation.errors.join("; "));
  const ordered = (v) =>
    Array.isArray(v)
      ? v.map(ordered)
      : object(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, ordered(v[k])]),
          )
        : v;
  return JSON.stringify(ordered(value));
}

return { validateFunctionalHealthResult:validateFunctionalHealthResult, canonicalFunctionalManifest:canonicalFunctionalManifest };
    })();
    // END GENERATED FUNCTIONAL HEALTH CONTRACT

    // BEGIN GENERATED WORKFLOW PANELS
    var WorkflowPanelFactory = (function () {
/** Stateless React factory; staged verbatim into the shipped client. */
function createDependencyPanel(React, GraphContract = {}) {
  const h = React.createElement;
  const requirement = {
    required: "必需",
    optional: "可选 / 软读取",
    subcontext: "子作用域",
    unknown: "必需性未知",
  };
  const table = (caption, headers, rows) =>
    h(
      "div",
      { style: { overflowX: "auto", marginBottom: 16 } },
      h(
        "table",
        { style: { borderCollapse: "collapse", width: "100%", fontSize: 13 } },
        h(
          "caption",
          { style: { textAlign: "left", fontWeight: 600, padding: "8px 0" } },
          caption,
        ),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...headers.map((label, i) =>
              h(
                "th",
                {
                  key: i,
                  scope: "col",
                  style: {
                    textAlign: "left",
                    padding: 6,
                    borderBottom: "1px solid #777",
                  },
                },
                label,
              ),
            ),
          ),
        ),
        h(
          "tbody",
          null,
          ...rows.map((row, i) =>
            h(
              "tr",
              { key: i },
              ...row.map((cell, j) =>
                h(
                  "td",
                  {
                    key: j,
                    style: {
                      verticalAlign: "top",
                      padding: 6,
                      borderBottom: "1px solid #9995",
                      overflowWrap: "anywhere",
                    },
                  },
                  cell,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  return function DependencyPanel({ graph } = {}) {
    if (graph === undefined || graph === null)
      return h(
        "section",
        { "aria-label": "依赖关系与潜在影响" },
        h("h3", null, "依赖关系与潜在影响"),
        h("p", null, "本报告未提供依赖关系视图；请重新体检。"),
      );
    let valid = false;
    try {
      valid =
        typeof GraphContract.validateDependencyGraph === "function" &&
        GraphContract.validateDependencyGraph(graph);
    } catch {}
    if (!valid)
      return h(
        "section",
        { "aria-label": "依赖关系与潜在影响" },
        h("h3", null, "依赖关系与潜在影响"),
        h(
          "p",
          { role: "status" },
          "依赖关系视图不可用：扩展数据格式或引用无效，请重新体检。兼容结论仍按原始证据显示。",
        ),
      );
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const name = (id) => nodes.get(id)?.name || id;
    const entries = (node) =>
      node.entries.length
        ? node.entries
            .map(
              (row) =>
                `${row.id || "未命名条目"}: ${row.disabled ? "disabled / 已禁用" : row.state}`,
            )
            .join("；")
        : "unknown / 未提供 loader 条目";
    const candidates = new Map(),
      consumers = new Map();
    for (const edge of graph.edges) {
      const map =
        edge.kind === "candidate-provider"
          ? candidates
          : edge.kind === "dependency"
            ? consumers
            : null;
      if (map) {
        if (!map.has(edge.to)) map.set(edge.to, []);
        map.get(edge.to).push(edge);
      }
    }
    const candidateLabel = (edge) =>
      `${name(edge.from)} [${edge.side}; ${entries(nodes.get(edge.from))}]${edge.side === "unknown" ? "（端未知；不参与传播推导）" : ""}`;
    const source = (edge) =>
      edge.source?.file
        ? `${edge.source.file}${edge.source.line === null ? "" : ":" + edge.source.line}`
        : "来源位置未知";
    const relationshipRows = graph.edges
      .filter((edge) => edge.kind === "dependency")
      .map((edge) => {
        const known = candidates.get(edge.to) || [];
        const unknown =
          candidates.get(
            JSON.stringify(["service", "unknown", edge.service]),
          ) || [];
        const choices = [...known, ...(edge.side === "unknown" ? [] : unknown)];
        return [
          name(edge.from),
          edge.service,
          edge.side,
          requirement[edge.requirement],
          choices.length
            ? choices.map(candidateLabel).join("；")
            : "未找到可定位的候选提供者（不等于宿主缺失）",
          source(edge),
        ];
      });
    const providerRows = graph.edges
      .filter((edge) => edge.kind === "candidate-provider")
      .map((edge) => [
        candidateLabel(edge),
        edge.service,
        edge.side,
        (consumers.get(edge.to) || [])
          .map((c) => `${name(c.from)}（${requirement[c.requirement]}）`)
          .join("；") || "没有同端消费者证据",
        source(edge),
      ]);
    const packageRows = graph.edges
      .filter((edge) => edge.kind === "client-package-inject")
      .map((edge) => [
        name(edge.from),
        name(edge.to),
        "client 包级 inject；不作为 host 服务关系或传播依据",
      ]);
    const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
    const pathLabel = (origin, path) => {
      const parts = [name(origin)];
      for (let i = 0; i < path.length; i += 2) {
        const provider = edgeMap.get(path[i]),
          consumer = edgeMap.get(path[i + 1]);
        parts.push(
          `${provider.service} [${provider.side}]`,
          `${name(consumer.from)}（${requirement[consumer.requirement]}）`,
        );
      }
      return parts.join(" → ");
    };
    const impactRows = graph.impacts.flatMap((impact) =>
      impact.affected.map((row) => [
        name(impact.plugin),
        name(row.plugin),
        row.side,
        "潜在影响；非实测故障",
        pathLabel(impact.plugin, row.path),
      ]),
    );
    const cycleRows = graph.cycles.map((cycle) => [
      cycle.side,
      pathLabel(cycle.plugins[0], cycle.path),
      "潜在声明环；不据此认定挂起或失败",
    ]);
    return h(
      "section",
      { "aria-label": "依赖关系与潜在影响" },
      h("h3", null, "依赖关系与潜在影响"),
      ...graph.notes.map((note, i) => h("p", { key: `note:${i}` }, note)),
      h(
        "p",
        null,
        `关系覆盖：${graph.coverage.status === "complete" ? "已覆盖本次提取输入（不等于运行时完整）" : "有限"}${graph.coverage.truncated ? "；已截断，不能当作全量关系或全量受影响者" : ""}。节点 ${graph.nodes.length}，关系 ${graph.edges.length}。`,
      ),
      ...graph.coverage.reasons.map((reason, i) =>
        h("p", { key: `reason:${i}`, role: "note" }, `覆盖限制：${reason}`),
      ),
      table(
        "插件及 loader 条目",
        [
          "插件",
          "宿主条目状态（不代表服务状态）",
          "Context 名称线索（非子作用域证明）",
        ],
        graph.nodes
          .filter((node) => node.kind === "plugin")
          .map((node) => [
            node.name,
            entries(node),
            node.subContexts
              .filter((context) => context.names.length)
              .map(
                (context) =>
                  `${context.file || "位置未知"}: ${context.names.join(", ")}`,
              )
              .join("；") || "未提取到命名线索",
          ]),
      ),
      relationshipRows.length
        ? table(
            "服务依赖及候选提供者",
            [
              "消费者",
              "服务",
              "端",
              "依赖方式",
              "候选提供者 / loader 状态",
              "依赖来源",
            ],
            relationshipRows,
          )
        : h("p", null, "本次未提取到服务依赖；不等于没有运行时依赖。"),
      providerRows.length
        ? table(
            "提供声明（仅候选）",
            [
              "候选插件 / loader 状态",
              "服务",
              "端",
              "同端潜在消费者",
              "提供来源",
            ],
            providerRows,
          )
        : null,
      packageRows.length
        ? table("客户端包依赖", ["消费者", "客户端包", "语义"], packageRows)
        : null,
      impactRows.length
        ? table(
            "潜在受影响插件及关系路径",
            ["候选起点", "潜在受影响者", "端", "证据边界", "路径"],
            impactRows,
          )
        : h("p", null, "未枚举到可证明同端的传播路径；不等于没有潜在影响。"),
      cycleRows.length
        ? table("潜在声明环", ["端", "关系路径", "说明"], cycleRows)
        : h("p", null, "本次覆盖内未枚举到声明环。"),
      h(
        "p",
        null,
        `预算：节点 ${graph.coverage.limits.nodes}；关系 ${graph.coverage.limits.edges}；传播遍历及路径 ${graph.coverage.limits.traversal}；输入条目 ${graph.coverage.limits.items}。`,
      ),
    );
  };
}
/** Browser-safe React factory. Manual actions stay separate from kernel results. */
function createFindingReviewPanel(React, ReviewContract) {
  const h = React.createElement,
    labels = ReviewContract.REVIEW_STATUS_LABELS;
  function ReviewRow({ item, contextToken, onSave, disabled }) {
    const [status, setStatus] = React.useState(
      item.record?.status || "pending",
    );
    const [note, setNote] = React.useState(item.note || "");
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [message, setMessage] = React.useState("");
    const current = React.useRef({ contextToken, findingId: item.findingId });
    current.current = { contextToken, findingId: item.findingId };
    React.useEffect(() => {
      setStatus(item.record?.status || "pending");
      setNote(item.note || "");
      setError("");
      setMessage("");
    }, [contextToken, item.findingId, item.record?.updatedAt]);
    const save = async () => {
      if (busy || disabled) return;
      const target = { contextToken, findingId: item.findingId };
      try {
        const input = ReviewContract.validateReviewInput({
          ...target,
          status,
          note,
        });
        setBusy(true);
        setError("");
        setMessage("");
        await onSave(input);
        if (
          current.current.contextToken === target.contextToken &&
          current.current.findingId === target.findingId
        )
          setMessage("人工处置已保存");
      } catch (reason) {
        if (
          current.current.contextToken === target.contextToken &&
          current.current.findingId === target.findingId
        )
          setError(reason?.message || "保存人工处置失败");
      } finally {
        setBusy(false);
      }
    };
    return h(
      "article",
      {
        "data-review-finding": item.findingId,
        style: {
          border: "1px solid #d0d5dd",
          padding: "12px",
          marginBottom: "10px",
          borderRadius: "6px",
        },
      },
      h(
        "strong",
        null,
        `${item.pluginName}@${item.pluginVersion} · 发现 ${item.findingIndex + 1} · ${labels[item.status] || item.status}`,
      ),
      item.reviewReason ? h("p", { role: "status" }, item.reviewReason) : null,
      item.record
        ? h(
            "p",
            null,
            `原记录：${labels[item.record.status]} · ${item.record.updatedAt} · ${item.record.note}`,
          )
        : null,
      item.history?.length
        ? h(
            "details",
            null,
            h(
              "summary",
              null,
              `旧处置摘要（${item.historyCount || item.history.length}；完整依据见历史处置）`,
            ),
            item.history.map((record) =>
              h(
                "p",
                { key: record.findingId },
                `${record.pluginName}@${record.pluginVersion} · ${labels[record.status]} · ${record.updatedAt} · ${record.note}${record.noteTruncated ? "…" : ""}`,
              ),
            ),
          )
        : null,
      h(
        "label",
        null,
        "人工状态 ",
        h(
          "select",
          {
            "aria-label": `${item.pluginName} 发现 ${item.findingIndex + 1} 人工状态`,
            value: status,
            disabled: busy || disabled,
            onChange: (e) => {
              setStatus(e.target.value);
              setMessage("");
            },
          },
          Object.keys(labels)
            .filter((x) => x !== "needs-review")
            .map((value) => h("option", { key: value, value }, labels[value])),
        ),
      ),
      h(
        "label",
        { style: { display: "block", marginTop: "8px" } },
        "核实依据 ",
        h("textarea", {
          "aria-label": `${item.pluginName} 发现 ${item.findingIndex + 1} 核实依据`,
          value: note,
          maxLength: ReviewContract.REVIEW_LIMITS.note,
          disabled: busy || disabled,
          rows: 3,
          style: { display: "block", width: "100%" },
          onChange: (e) => {
            setNote(e.target.value);
            setMessage("");
          },
        }),
      ),
      h(
        "button",
        { type: "button", disabled: busy || disabled, onClick: save },
        busy ? "保存中…" : "保存人工处置",
      ),
      error ? h("p", { role: "alert" }, error) : null,
      message ? h("p", { role: "status" }, message) : null,
    );
  }
  return function FindingReviewPanel({ report, reviews, onSave }) {
    const [saved, setSaved] = React.useState(null);
    const [limit, setLimit] = React.useState(20);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [historyLimit, setHistoryLimit] = React.useState(20);
    const current = React.useRef(reviews?.contextToken);
    current.current = reviews?.contextToken;
    React.useEffect(() => {
      setSaved(null);
      setLimit(20);
      setHistoryOpen(false);
      setHistoryLimit(20);
    }, [reviews?.contextToken, reviews?.revision]);
    const active =
      saved && saved.contextToken === reviews?.contextToken ? saved : reviews;
    if (active == null) return null;
    if (!ReviewContract.validateReviewEnvelope(active, report))
      return h(
        "section",
        { "aria-label": "发现的人工处置", style: { marginTop: "16px" } },
        h("h3", null, "发现的人工处置"),
        h(
          "p",
          { role: "alert" },
          "人工处置数据无效，本节暂不可用；请刷新后重试。",
        ),
      );
    const save = async (input) => {
      const result = await onSave(input),
        next = result?.reviews || result;
      if (!ReviewContract.validateReviewEnvelope(next, report))
        throw new Error("保存响应无效");
      if (next.error) throw new Error(next.error);
      if (
        current.current !== input.contextToken ||
        next.contextToken !== input.contextToken
      )
        throw new Error("报告已变化，请重新核实");
      setSaved(next);
      return next;
    };
    const items = (active.items || []).filter(
      (item) =>
        !report?.plugins || Object.hasOwn(report.plugins, item.pluginName),
    );
    return h(
      "section",
      { "aria-label": "发现的人工处置", style: { marginTop: "16px" } },
      h("h3", null, "发现的人工处置"),
      h(
        "p",
        null,
        "人工记录仅供核实追踪，不改变内核发现、总结论、退出码、基线或兼容性豁免；新风险仍完整显示。",
      ),
      active.error ? h("p", { role: "alert" }, active.error) : null,
      items.length
        ? items.slice(0, limit).map((item) =>
            h(ReviewRow, {
              key: item.findingId,
              item,
              contextToken: active.contextToken,
              onSave: save,
              disabled: !!active.error || typeof onSave !== "function",
            }),
          )
        : h("p", null, "当前没有可处置的发现。"),
      items.length > limit
        ? h(
            "button",
            { type: "button", onClick: () => setLimit((n) => n + 20) },
            `显示更多处置（已显示 ${Math.min(limit, items.length)} / ${items.length}）`,
          )
        : null,
      active.history?.length
        ? h(
            "details",
            {
              open: historyOpen,
              onToggle: (e) => setHistoryOpen(e.target.open),
            },
            h("summary", null, `历史处置完整依据（${active.history.length}）`),
            historyOpen
              ? active.history
                  .slice(0, historyLimit)
                  .map((record) =>
                    h(
                      "p",
                      { key: record.findingId },
                      `${record.pluginName}@${record.pluginVersion} · ${labels[record.status]} · ${record.updatedAt} · ${record.note}`,
                    ),
                  )
              : null,
            historyOpen && active.history.length > historyLimit
              ? h(
                  "button",
                  {
                    type: "button",
                    onClick: () => setHistoryLimit((n) => n + 20),
                  },
                  "显示更多历史处置",
                )
              : null,
          )
        : null,
    );
  };
}
/** Offline UI for explicitly imported health evidence. Never starts a runner. */
function createFunctionalHealthPanel(React, HealthContract) {
  const h = React.createElement;
  const statusLabels = {
    "tested-pass": "所选检查通过",
    "tested-failed": "所选检查失败",
    error: "检查未完成",
    pass: "通过",
    failed: "失败",
  };
  return function FunctionalHealthPanel({ report }) {
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const request = React.useRef(0);
    React.useEffect(
      () => () => {
        request.current++;
      },
      [],
    );
    const load = async (event) => {
      const file = event.target.files?.[0],
        id = ++request.current;
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        if (
          !Number.isSafeInteger(file.size) ||
          file.size < 1 ||
          file.size > 512 * 1024
        )
          throw new Error("记录超过大小限制（512 KiB）");
        const parsed = JSON.parse(await file.text());
        const checked = HealthContract.validateFunctionalHealthResult(parsed);
        if (!checked.valid) throw new Error(checked.errors.join("；"));
        if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined")
          throw new Error("当前浏览器无法核验记录摘要");
        const bytes = new TextEncoder().encode(
          HealthContract.canonicalFunctionalManifest(parsed.declaration),
        );
        const digest = Array.from(
          new Uint8Array(
            await globalThis.crypto.subtle.digest("SHA-256", bytes),
          ),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== parsed.identity.manifestSha256)
          throw new Error("检查声明与记录摘要不一致");
        if (request.current === id) setResult(parsed);
      } catch (reason) {
        if (request.current === id)
          setError("导入失败：" + (reason?.message || reason));
      } finally {
        if (request.current === id) setBusy(false);
      }
    };
    const artifact = result?.identity.artifact,
      current = artifact && report?.plugins?.[artifact.name];
    const versionsMatch =
      current?.version === artifact?.version &&
      report?.dshVersion === result?.identity.dshVersion;
    return h(
      "section",
      { "aria-label": "功能健康检查", style: { marginTop: "16px" } },
      h("h3", null, "功能健康检查（独立实测记录）"),
      h(
        "p",
        null,
        "在仓库CLI中显式运行所选HTTP/DOM检查后，可导入JSON记录。本面板只读取所选文件，不执行检查、安装插件或访问目标服务。",
      ),
      h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "导入功能健康检查记录",
        disabled: busy,
        onChange: load,
      }),
      busy ? h("p", { role: "status" }, "正在核验记录…") : null,
      error ? h("p", { role: "alert" }, error) : null,
      !result
        ? h(
            "p",
            null,
            "尚未导入功能实测记录。静态发现、宿主状态和业务健康是不同证据。",
          )
        : h(
            "div",
            { "data-functional-health": result.status },
            h(
              "p",
              null,
              `${artifact.name}@${artifact.version} · DSH ${result.identity.dshVersion} · ${statusLabels[result.status]}`,
            ),
            h(
              "p",
              { role: "status" },
              versionsMatch
                ? "插件与DSH版本相符；当前安装制品尚未核验，此处保留所选制品的历史记录。"
                : "记录与当前报告目标不一致或插件未安装；不用于认证当前目标。",
            ),
            h(
              "p",
              null,
              "测量时间：" + result.startedAt + " → " + result.completedAt,
            ),
            h("p", null, "制品 SHA-256：" + artifact.sha256),
            h(
              "p",
              null,
              "声明 SHA-256：" +
                result.identity.manifestSha256 +
                "；摘要校验不是作者签名或业务认证。",
            ),
            h(
              "table",
              { "aria-label": "功能健康检查结果" },
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th", null, "检查与声明"),
                  h("th", null, "独立实测"),
                ),
              ),
              h(
                "tbody",
                null,
                result.checks.map((check, i) => {
                  const declaration = result.declaration.checks[i],
                    expected =
                      declaration.type === "http"
                        ? `GET ${declaration.path}，HTTP ${declaration.status}` +
                          (declaration.json
                            ? `，JSON ${declaration.json.pointer} = ${JSON.stringify(declaration.json.equals)}`
                            : "")
                        : `${declaration.path} · ${declaration.selector} · 数量 ${declaration.minCount}–${declaration.maxCount}`;
                  return h(
                    "tr",
                    { key: check.id },
                    h("td", null, `${check.id} · ${expected}`),
                    h(
                      "td",
                      null,
                      `${statusLabels[check.status] || check.status} · ${JSON.stringify(check.evidence)}`,
                    ),
                  );
                }),
              ),
            ),
            result.error ? h("p", { role: "alert" }, result.error) : null,
            h(
              "p",
              null,
              "资源清理：" +
                (result.cleanup.stopped && result.cleanup.removed
                  ? "已停止并清理自有环境"
                  : "未确认完整清理"),
            ),
            h(
              "ul",
              null,
              result.limitations.map((text, i) => h("li", { key: i }, text)),
            ),
            h(
              "p",
              null,
              "仅证明记录中的所选检查结果，不改普通兼容性结论、风险计数、基线或人工处置；不认证全部业务。",
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  request.current++;
                  setResult(null);
                  setError("");
                  setBusy(false);
                },
              },
              "清除健康检查记录",
            ),
          ),
    );
  };
}

return { createDependencyPanel:createDependencyPanel, createFindingReviewPanel:createFindingReviewPanel, createFunctionalHealthPanel:createFunctionalHealthPanel };
    })();
    // END GENERATED WORKFLOW PANELS

    var React = require("react");
    var DependencyPanel = WorkflowPanelFactory.createDependencyPanel(React, DependencyGraphContract);
    var FindingReviewPanel = WorkflowPanelFactory.createFindingReviewPanel(React, FindingReviewContract);
    var FunctionalHealthPanel = WorkflowPanelFactory.createFunctionalHealthPanel(React, FunctionalHealthContract);

    var SLOT = "settings.plugins.tab";
    var LABEL = "兼容性";
    var ROUTE = "/plugin-compat-check/report";
    // C3：单插件视图的两个槽位。实测（docs/Plan.md §5 C3）：
    //   - 详情页不是「抽屉」，是侧栏插件面板**换了 React 视图状态**：
    //     侧栏轨道按钮 [class*="panelRow"][aria-label="插件"] → 卡片标题
    //     button[class*="cardOpen"][aria-label="查看 <名字>"] → 返回用 button[class*="crumb"]。
    //     没有 URL/hash 路由，所以只能靠点击驱动。
    //   - `plugins.item` 是**列表卡片**的槽：角标挂在这里，用户不用点进去就能扫一眼。
    // `plugins.item` **不注册**（原因见 apply 里的注释）：它拿不到插件身份。
    // 我们自己那个配置页条目的 id，仅用于台账兜底。
    var SELF_ITEM_ID = "dsh-plugin-compat-check";
    var SLOT_DETAIL = "plugins.detail.section";
    var SLOT_DETAIL_BADGE = "plugins.detail.badge";

    var VERDICT = {
      broken: { text: "不兼容", color: "#dc2626" },
      partial: { text: "部分可用", color: "#d97706" },
      unknown: { text: "未知", color: "#6b7280" },
      ok: { text: "可用", color: "#16a34a" },
    };
    var SEVERITY = { fatal: "致命", "feature-dead": "功能失效", degraded: "降级" };
    var CATEGORY = {
      "host-service-missing": "服务缺失",
      "host-method-missing": "方法缺失",
      "unprovided-dependency": "依赖服务待确认",
      "declaration-mismatch": "声明与实测不符",
      "declared-incompatible": "版本声明不支持",
      "client-entry-missing": "客户端入口不可交付",
      "host-entry-inactive": "宿主条目未激活",
    };

    // 渲染侧标记：只在我们的组件体里设置。页面上出现同名文字**不能**证明
    // 是我们渲染的，这个标记能 —— 验收要经得起这个追问（docs/Plan.md §7.2.1 ③）。
    function mark(extra) {
      try {
        var prev = window.__COMPAT_CHECK__ || {};
        var next = { slot: SLOT, label: LABEL };
        for (var k in prev) if (Object.prototype.hasOwnProperty.call(prev, k) && prev[k] !== null && prev[k] !== undefined) next[k] = prev[k];
        for (var j in extra) {
          if (!Object.prototype.hasOwnProperty.call(extra, j)) continue;
          // ⚠️ `null` **不覆盖**已有值。早先这里用 Object.assign，于是
          // 一次 `detailFor: null` 的渲染会把前一次好好的诊断信息抹掉 ——
          // 而"诊断信息自己把证据抹掉"恰恰是最难查的那种。
          if (extra[j] === null || extra[j] === undefined) continue;
          next[j] = extra[j];
        }
        next.at = Date.now();
        window.__COMPAT_CHECK__ = next;
      } catch (error) {
        /* 诊断绝不影响渲染 */
      }
    }

    function mergeStyle() {
      var out = {};
      for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        if (!a) continue;
        for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
      }
      return out;
    }

    /** C3 · 详情页 section：这个插件的完整结论 + 每条发现的证据 */
    function acceptPayload(data) {
      try { return ReportContract.assertEnvelope(data); }
      catch (error) {
        console.warn('[dsh-plugin-compat-check] invalid report', String(error && error.message || error));
        throw new Error('无法读取体检报告：报告格式或版本不受支持，请刷新页面并确认宿主与插件版本一致。');
      }
    }

    function useCompatibility() {
      var state = React.useState({ phase: "loading", data: null, error: null });
      var alive = React.useRef(true), latest = React.useRef(null), pending = React.useRef(null), queuedForce = React.useRef(false);
      var set = state[1];
      var load = React.useCallback(function (refresh, background) {
        if (pending.current) {if(refresh)queuedForce.current=true;return pending.current;}
        function read(url) {
          return fetch(url, {headers:{accept:"application/json"},credentials:"same-origin"}).then(function(res){
            if(!res.ok)throw new Error("HTTP " + res.status);
            return res.json();
          });
        }
        var request = Promise.resolve().then(function(){
          return read(refresh ? ROUTE + "?refresh=1" : background ? ROUTE + "?metadata=1" : ROUTE);
        }).then(function(data){
          if(background && data.kind === "plugin-compat-check/report-metadata" && data.ok && latest.current
            && data.computedAt === latest.current.computedAt && data.nodeModules === latest.current.nodeModules
            && data.dshVersion === latest.current.report.dshVersion
            && (data.reviewsRevision || null) === (latest.current.reviews && latest.current.reviews.revision || null)
            && (data.reviewsError || null) === (latest.current.reviews && latest.current.reviews.error || null)
            && (data.reviewsContextToken || null) === (latest.current.reviews && latest.current.reviews.contextToken || null)) {
            return Object.assign({},latest.current,{cache:data.cache});
          }
          return background ? read(ROUTE) : data;
        }).then(function(data){
          data = acceptPayload(data);
          if(!data.ok && latest.current)throw new Error(data.error || "后台刷新失败");
          if(!alive.current)return;
          latest.current=data;
          set({phase:"done",data:data,error:null});
        }).catch(function(error){
          if(!alive.current)return;
          var message=String(error && error.message || error);
          if(latest.current && latest.current.ok){
            var previous=latest.current;
            var kept=Object.assign({},previous,{cache:Object.assign({},previous.cache,{hit:true,stale:true,refreshing:false,refreshError:message})});
            set({phase:"done",data:kept,error:message});
          }else set({phase:"error",data:null,error:message});
        }).then(function(){pending.current=null;if(queuedForce.current && alive.current){queuedForce.current=false;return load(true,false);}});
        pending.current=request;
        return request;
      }, []);
      React.useEffect(function () {
        alive.current = true;
        var timer;
        function schedule(){if(alive.current)timer=setTimeout(function(){return load(false,true).then(schedule);},2000);}
        load(false).then(schedule);
        return function () {alive.current=false;clearTimeout(timer);};
      }, [load]);
      return {value:state[0],reload:load};
    }

    var styles = {
      root: { padding: "12px 4px", font: "13px/1.5 system-ui, -apple-system, sans-serif", color: "inherit" },
      head: { display: "flex", alignItems: "baseline", gap: "10px", flexWrap: "wrap", marginBottom: "10px" },
      title: { font: "600 14px system-ui, -apple-system, sans-serif" },
      meta: { opacity: 0.65, fontSize: "12px" },
      btn: {
        padding: "3px 10px", borderRadius: "6px",
        border: "1px solid rgba(127,127,127,.45)", background: "transparent",
        color: "inherit", fontSize: "12px", cursor: "pointer",
      },
      table: { width: "100%", borderCollapse: "collapse", fontSize: "12.5px" },
      th: {
        textAlign: "left", fontWeight: 600, padding: "6px 8px",
        borderBottom: "1px solid rgba(127,127,127,.35)", whiteSpace: "nowrap",
      },
      td: { padding: "6px 8px", borderBottom: "1px solid rgba(127,127,127,.16)", verticalAlign: "top" },
      mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "11.5px", opacity: 0.85 },
      pill: {
        display: "inline-block", padding: "1px 7px", borderRadius: "999px",
        fontSize: "11.5px", fontWeight: 600, color: "#fff", whiteSpace: "nowrap",
      },
      note: { opacity: 0.7, fontSize: "12px", marginTop: "10px" },
      err: { padding: "10px", borderRadius: "8px", background: "rgba(220,38,38,.08)", fontSize: "12.5px" },
      hint: { opacity: 0.6, fontSize: "12px", padding: "10px 0" },
      finding: { marginTop: "3px" },
      suspect: { opacity: 0.75, fontStyle: "italic" },
      dim: { opacity: 0.6, fontSize: "11.5px", marginTop: "4px" },
    };

    function Sev(p) {
      var s = p.severity;
      var color = s === "fatal" ? "#dc2626" : s === "feature-dead" ? "#d97706" : "#6b7280";
      return React.createElement("span", { style: { color: color, fontWeight: 600 } }, SEVERITY[s] || s);
    }

    function Coverage(p) {
      var c = p.plugin.coverage;
      if (!c) return null;
      return React.createElement("div", { style: styles.dim },
        "证据覆盖：" + (c.status === "complete" ? "完整" : "有限") + "；已验证调用 " + c.verifiedCalls,
        c.limitations.length ? React.createElement("details", null,
          React.createElement("summary", { style: { cursor: "pointer" } }, "覆盖限制（" + c.limitations.length + "）"),
          c.limitations.map(function (note, i) {
            return React.createElement("div", { key: i }, "覆盖限制：" + note);
          })) : null);
    }

    function EvidenceLegend() {
      return React.createElement("div", { style: styles.note },
        "确定（certain）可由明确静态事实或合格运行时观测支持；疑似（suspected）表示当前证据不足以确定该条发现。",
        "影响依据：实测（measured）须有对应观测，推断（inferred）不等于业务影响已实测。",
        "未观测不等于缺失；没有已验证调用仍可能存在服务依赖或客户端功能；调用核验和覆盖完整均不等于业务验收通过。");
    }

    function Findings(p) {
      var pl = p.plugin;
      if (!pl.findings || pl.findings.length === 0) {
        var parts = [p.hideCoverage ? null : React.createElement(Coverage, { key: "coverage", plugin: pl })];
        if (pl.vacuous) {
          parts.push(React.createElement("div", { key: "v", style: styles.suspect },
            "本轮未发现冲突，但没有已验证调用；插件仍可能依赖 DSH 服务或包含未验证的客户端功能，不能据此确认业务可用。"));
        }
        var noCalls = Object.keys(pl.resolved || {})
          .map(function (k) { return pl.resolved[k]; })
          .filter(function (c) { return c.disposition === "no-calls"; });
        if (noCalls.length) {
          parts.push(React.createElement("div", { key: "n", style: styles.dim },
            "无证据可判（只出现名字，没有调用点）：" + noCalls.map(function (c) { return c.service; }).join("、")));
        }
        if (pl.clientSide && pl.clientSide.length) {
          parts.push(React.createElement("div", { key: "c", style: styles.dim },
            "客户端半边（命令行测不到，需界面验证）：" + pl.clientSide.map(function (c) { return c.service; }).join("、")));
        }
        return parts.length ? React.createElement("div", null, parts) : null;
      }
      return React.createElement("div", null, p.hideCoverage ? null : React.createElement(Coverage, { plugin: pl }), pl.findings.map(function (f, i) {
        var api = f.service ? (f.method ? f.service + "." + f.method : f.service) : "(包声明)";
        var loc = f.location ? f.location.file + ":" + f.location.line : "—";
        return React.createElement("div", { key: i, style: styles.finding },
          React.createElement(Sev, { severity: f.severity }),
          React.createElement("span", null, " " + (CATEGORY[f.category] || f.category) + " "),
          React.createElement("code", { style: styles.mono }, api),
          React.createElement("span", { style: styles.mono }, " @ " + loc),
          React.createElement("span", {
            style: styles.suspect,
            title: f.certainty === "certain" ? "当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；不等于影响已实测。" : "当前证据不足以确定该条发现；存在运行时观测也不代表该调用已验证。",
          }, f.certainty === "certain" ? " [确定]" : " [疑似]"),
          f.impact ? React.createElement("div", { style: styles.dim },
            (f.impactBasis === "measured" ? "影响（实测）：" : f.impactBasis === "inferred" ? "影响（推断，非实测）：" : "影响（依据未提供）：") + f.impact) : null,
          f.basis ? React.createElement("div", { style: styles.dim }, "依据：" + f.basis) : null,
          React.createElement("div", { style: { marginTop: "6px" } },
            React.createElement("strong", null, "下一步核实"),
            React.createElement("ol", { style: { margin: "4px 0", paddingLeft: "22px" } },
              FindingGuidance.nextSteps(f).map(function (step, j) {
                return React.createElement("li", { key: j }, step);
              }))));
      }));
    }

    /**
     * 从槽位给的 props 里解析出「这是哪个插件」。
     *
     * ## 契约（读自宿主源码 + 实测印证；三种形态都见过）
     *
     * 详情页的 `subject` 按**条目种类**有两个分支：
     *
     * | 条目种类 | subject 形态 | 对应谁 |
     * |---|---|---|
     * | 安装的包 | `{ kind: "package", pkg: { name, version, … } }` | **社区插件卡**（最该有角标的） |
     * | 官方 bundle | `{ kind: "bundle", pkg: { name, version, rows: […] } }` | 官方 bundle 卡 |
     * | 面板条目 | `{ kind: "item", id }` | 第三方配置页注册的条目（id 不是包名） |
     *
     * 这两种形态是**踩出来的**，不是猜的：
     *   - 第一版按 `props.name` / `props.entry.name` 猜 → 一条都没匹配上，
     *     角标全部**静默不渲染**（页面看起来正常，只是少了个东西）；
     *   - 第二版按 `subject.id` → 打开官方 bundle 卡时拿到
     *     `{kind:"bundle", pkg:{...}}`，`subject.id` 是 undefined，于是又一次静默失败。
     *
     * 解析顺序：`subject.pkg.name` → `subject.id`（是包名）→ 台账（id → 包名）
     * → `props.id` 同上 → 自家条目 id。都不中返回 null，**角标不渲染**：
     * 渲染一个猜的结论比不渲染更糟 —— 用户会当真。
     */
    function pickPlugin(data, props) {
      var report = data && data.report;
      if (!report || !report.plugins) return null;
      var plugins = report.plugins;

      var byPkg = function (name, how) {
        if (typeof name !== 'string' || name === '') return null;
        return plugins[name] ? { name: name, plugin: plugins[name], how: how } : null;
      };

      var subj = props && props.subject;
      if (subj && typeof subj === 'object') {
        var pkg = subj.pkg;
        var direct = typeof pkg === 'string' ? pkg : (pkg && typeof pkg === 'object' ? pkg.name : null);
        var hit = byPkg(direct, 'subject.pkg.name');
        if (hit) return hit;
        hit = byPkg(subj.id, 'subject.id=包名');
        if (hit) return hit;
        hit = lookupLedger(report, subj.id);
        if (hit) return hit;
      }
      if (props && typeof props === 'object') {
        var hit2 = byPkg(props.id, 'props.id=包名');
        if (hit2) return hit2;
        hit2 = lookupLedger(report, props.id);
        if (hit2) return hit2;
        if (props.view) {
          hit2 = byPkg(SELF_ITEM_ID, '自家条目 id');
          if (hit2) return hit2;
        }
      }
      return null;
    }

    /** 条目 id → 关联包名（台账由宿主半边的 computeReport 采集） */
    function lookupLedger(report, id) {
      if (typeof id !== 'string' || id === '') return null;
      var items = report.items || [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || it.id !== id) continue;
        var pkg = it.packageName || it.package || it.name;
        if (typeof pkg === 'string' && report.plugins[pkg]) {
          return { name: pkg, plugin: report.plugins[pkg], how: '台账条目 ' + id + ' → ' + pkg };
        }
      }
      return null;
    }

    /** 结论档位 → 角标的颜色与文字（多处共用，避免文案分叉） */
    function verdictOf(plugin) {
      if (!plugin) return null;
      return VERDICT[plugin.verdict] || VERDICT.unknown;
    }

    /** 详情页要的是**单个插件**的结论；数据源与总览表同一个路由，所以不可能两边不一致。 */
    function usePluginState() {
      return useCompatibility();
    }

    /**
     * C4 · 基线角标：回答「**和上次比变了没有**」，并给出方向。
     *
     * 规则是 docs/Plan.md §2 第 5 题的落地：**任何变化都打**，不只是变差。
     * 只有变差才亮会漏掉"某个插件被修好了、你可以放心留着了" —— 那同样是用户要知道的事。
     * 没有基线时**不打**角标，但要说清是「还没比过」而不是「没问题」。
     */
    function Badge(p) {
      var b = p.baseline;
      if (!b) return null;
      if (b.note) {
        return React.createElement("div", { style: mergeStyle(styles.dim, { marginTop: 0, marginBottom: "8px" }) },
          b.note);
      }
      if (b.error) {
        return React.createElement("div", { style: styles.dim }, "基线差分没算成：" + b.error);
      }
      var badge = b.badge || {};
      if (!badge.show) {
        return React.createElement("div", { style: mergeStyle(styles.dim, { marginTop: 0, marginBottom: "8px" }) },
          badge.detail || "与上次相比没有任何变化");
      }
      var color = badge.direction === "worse" ? "#dc2626"
        : badge.direction === "better" ? "#16a34a" : "#6b7280";
      var diff = b.diff || {};
      var lines = [];
      (diff.worsened || []).forEach(function (e) {
        lines.push("↓ " + e.name + "@" + (e.versionFrom || "?") + "→" + (e.versionTo || "?") + "：" + e.reason);
        (e.newFindings || []).forEach(function (f) {
          lines.push("    新增：" + f.key + " @ " + (f.location || "—"));
        });
      });
      (diff.improved || []).forEach(function (e) { lines.push("↑ " + e.name + "：" + e.reason); });
      (diff.added || []).forEach(function (e) { lines.push("+ " + e.name + "@" + e.version); });
      (diff.removed || []).forEach(function (e) { lines.push("− " + e.name + "@" + e.version); });
      return React.createElement("div", { style: { marginBottom: "10px" } },
        React.createElement("span", {
          style: mergeStyle(styles.pill, { background: color }),
        }, badge.text),
        diff.dshVersionChanged
          ? React.createElement("span", { style: mergeStyle(styles.dim, { marginLeft: "8px" }) },
            "DSH " + (diff.dshVersionFrom || "?") + " → " + (diff.dshVersionTo || "?"))
          : null,
        React.createElement("div", { style: mergeStyle(styles.mono, { marginTop: "4px", whiteSpace: "pre-wrap" }) },
          lines.join("\n")));
    }

    function DetailSection(props) {
      try {
        return DetailSectionBody(props);
      } catch (error) {
        // 组件体抛异常会被 React 静默丢弃（整棵子树消失），
        // 而"跑了但什么都没渲染"是最难查的形态。所以自己抓、自己报。
        mark({ detailSectionError: String((error && error.message) || error) });
        return React.createElement("div", { style: styles.err },
          "dsh-plugin-compat-check: 渲染时出错 —— " + String((error && error.message) || error));
      }
    }

    function DetailSectionBody(props) {
      var st = usePluginState();
      var data = st.value.data;
      var hit = pickPlugin(data, props);
      // 解析失败时把**看到的形状**记下来。角标静默不渲染是最难查的形态：
      // 页面看起来正常，只是少了个东西。所以把"为什么没匹配上"留成可查的证据。
      if (!hit) {
        try {
          var subj = props && props.subject;
          var pkg = subj && subj.pkg;
          mark({
            detailUnmatched: {
              hasProps: Boolean(props),
              hasSubject: Boolean(subj),
              subjectKind: subj && subj.kind || null,
              subjectId: subj && subj.id || null,
              pkgType: typeof pkg,
              pkgName: typeof pkg === 'string' ? pkg : (pkg && pkg.name) || null,
              inReport: Boolean(data && data.report && data.report.plugins),
              pluginCount: data && data.report && data.report.plugins ? Object.keys(data.report.plugins).length : 0,
            },
          });
        } catch (e) { /* 诊断 */ }
      }
      mark({ detailSectionRendered: true, detailFor: hit ? hit.name : null });

      if (st.value.phase === "loading") {
        return React.createElement("div", { style: styles.hint }, "正在体检…");
      }
      if (st.value.phase === "error" || !data || data.ok === false) {
        return React.createElement("div", { style: styles.err },
          "拿不到体检结果（这是工具的问题，不是这个插件的结论）："
          + (st.value.error || (data && data.error) || "未知原因"));
      }
      if (!hit) {
        // 找不到对应项**也要说明**，而不是渲染一个空白 ——
        // 空白会被读成"这个插件没问题"，而它其实是"我们没算出来"。
        return React.createElement("div", { style: styles.dim },
          "这个插件不在本次体检范围内（可能它不是带 dsh 清单的社区插件，或它的条目用了别的键名）。"
          + "请以「兼容性」总览页为准。");
      }
      var pl = hit.plugin;
      var v = verdictOf(pl);
      return React.createElement("div", { style: styles.root, "data-compat-detail": hit.name },
        React.createElement("div", { style: styles.head },
          React.createElement("span", { style: mergeStyle(styles.pill, { background: v.color }) }, v.text),
          React.createElement("span", { style: styles.meta },
            "dsh-plugin-compat-check · " + (pl.findings || []).length + " 条发现"),
          React.createElement("button", {
            style: styles.btn, type: "button",
            onClick: function () { st.reload(true); },
          }, "重新检查")),
        React.createElement(Findings, { plugin: pl }),
        React.createElement(EvidenceLegend));
    }

    /** C3 · 详情页角标：一行字，放在标题行 */
    function DetailBadge(props) {
      var st = usePluginState();
      var data = st.value.data;
      var hit = pickPlugin(data, props);
      mark({ detailBadgeRendered: true, detailBadgeFor: hit ? hit.name : null });
      if (!hit) return null;
      var v = verdictOf(hit.plugin);
      if (!v) return null;
      return React.createElement("span", {
        "data-compat-detail-badge": hit.name,
        style: mergeStyle(styles.pill, { background: v.color }),
        title: "dsh-plugin-compat-check",
      }, v.text);
    }

    function UpgradeDetails(p) {
      var r = p.result;
      if (!r.ok) return React.createElement("div", { role: "status", style: styles.err }, r.error);
      var groups = [["added", "新增"], ["worsened", "变重"], ["resolved", "消失"], ["improved", "减轻"], ["unchanged", "不变"]];
      return React.createElement("div", { "data-upgrade-result": "compared" },
        React.createElement("p", null, "静态版本对比：" + r.currentVersion + " → " + r.targetVersion),
        React.createElement("p", { role: "status" }, "新增 " + r.summary.added + " · 变重 " + r.summary.worsened + " · 消失 " + r.summary.resolved + " · 减轻 " + r.summary.improved + " · 不变 " + r.summary.unchanged),
        !r.summary.added && !r.summary.worsened ? React.createElement("p", { style: styles.note }, "本次没有发现新增或变重的静态风险；目标版本仍可能有原有风险，不等于业务通过。") : null,
        groups.map(function (group) {
          return r.changes[group[0]].length ? React.createElement("details", { key: group[0], open: group[0] === "added" || group[0] === "worsened" },
            React.createElement("summary", null, group[1] + "（" + r.changes[group[0]].length + "）"),
            r.changes[group[0]].map(function (entry, i) {
              var f = entry.finding || entry.after;
              return React.createElement("div", { key: i, style: { margin: "8px 0" } },
                React.createElement("div", null, entry.plugin + " · " + f.category + " · " + [f.service, f.method].filter(Boolean).join(".")),
                React.createElement("div", { style: styles.mono }, f.severity + " / " + f.certainty + " / " + f.impactBasis + (f.location ? " · " + f.location.file + ":" + f.location.line : "")),
                entry.before ? React.createElement("div", { style: styles.dim }, "此前：" + entry.before.severity + " / " + entry.before.certainty + " / " + entry.before.impactBasis) : null,
                React.createElement("div", null, f.impact), React.createElement("div", { style: styles.dim }, f.basis));
            })) : null;
        }),
        ["currentReport", "targetReport"].map(function (side) {
          var report = r[side], s = report.summary;
          return React.createElement("details", { key: side },
            React.createElement("summary", null, (side === "currentReport" ? "当前版本" : "目标版本") + "静态结果 " + report.dshVersion + " · 不兼容 " + s.broken + " · 部分可用 " + s.partial + " · 未知 " + s.unknown),
            Object.keys(report.plugins).map(function (name) {
              var pl = report.plugins[name];
              return React.createElement("div", { key: name, style: { margin: "8px 0" } },
                React.createElement("div", null, name + "@" + (pl.version || "?") + " · " + pl.verdict + (pl.vacuous ? " · 无已验证调用" : "")),
                React.createElement(Findings, { plugin: pl }));
            }));
        }),
        React.createElement("details", null,
          React.createElement("summary", null, "查看输入制品、目录来源与预测限制"),
          React.createElement("div", { style: styles.mono }, "输入 SHA-256：" + r.artifact.sha256),
          r.artifact.packages.map(function (item, i) { return React.createElement("div", { key: i, style: styles.mono }, item.name + "@" + (item.version || "?") + " SHA-256：" + item.sha256); }),
          ["current", "target"].map(function (side) {
            var c = r.catalogs[side];
            return React.createElement("div", { key: side, style: styles.mono }, "API 目录：" + c.version + " · " + c.file + " · SHA-256：" + c.sha256 + " · 来源：" + c.source.host + " / " + c.source.client);
          }),
          React.createElement("div", { style: styles.mono }, "规则：" + r.rules.file + " · SHA-256：" + r.rules.sha256),
          r.limitations.map(function (note, i) { return React.createElement("div", { key: i, style: styles.note }, note); })));
    }

    function UpgradePreview(p) {
      var target = React.useState(""), state = React.useState({ phase: "idle" }), generation = React.useRef(0);
      var currentVersion = p.data.report.dshVersion;
      // A review revision update may fetch a fresh JSON object for the same report.
      // Cache serialization by object reference; local form renders do not repeat it.
      var reportIdentity = React.useRef(null);
      if (!reportIdentity.current || reportIdentity.current.report !== p.data.report) {
        reportIdentity.current = { report: p.data.report, content: JSON.stringify(p.data.report) };
      }
      React.useEffect(function () {
        generation.current++;
        state[1]({ phase: "idle" });
        return function () { generation.current++; };
      }, [currentVersion, p.data.nodeModules, p.data.computedAt, p.data.reviews && p.data.reviews.contextToken, reportIdentity.current.content]);
      async function run() {
        var requested = String(target[0]).trim(), ticket = ++generation.current;
        state[1]({ phase: "loading" });
        try {
          var response = await fetch("/plugin-compat-check/upgrade-preview?targetVersion=" + encodeURIComponent(requested) + "&currentVersion=" + encodeURIComponent(currentVersion || ""), { credentials: "same-origin", headers: { Accept: "application/json" } });
          if (!response.ok) throw Error("HTTP " + response.status);
          var result;
          try { result = UpgradeContract.assertUpgradePreview(await response.json()); }
          catch (error) { throw Error("升级预检结果格式无效，请确认宿主与客户端版本一致。"); }
          if (result.currentVersion !== currentVersion || result.targetVersion !== requested) throw Error("升级预检版本已变化，请刷新普通报告后重试。");
          if (ticket === generation.current) state[1]({ phase: "done", result: result });
        } catch (error) {
          if (ticket === generation.current) state[1]({ phase: "error", error: String(error.message || error) });
        }
      }
      return React.createElement("details", { style: { margin: "14px 0" }, "data-upgrade-preview": true },
        React.createElement("summary", { style: { cursor: "pointer" } }, "升级前兼容性预检（静态）"),
        React.createElement("p", { style: styles.note }, "比较同一组已安装制品在两个版本目录下的静态风险。静态预测不等于目标版本业务通过；不自动安装或升级。当前版本：" + (currentVersion || "未知") + "。可选目录版本：" + UpgradeContract.SUPPORTED_PREVIEW_VERSIONS.join("、")),
        React.createElement("input", { "aria-label": "目标 DSH 版本", placeholder: "输入精确目标版本", value: target[0], style: styles.btn,
          onChange: function (event) { generation.current++; target[1](event.target.value); state[1]({ phase: "idle" }); } }),
        React.createElement("button", { type: "button", style: styles.btn, disabled: state[0].phase === "loading" || !String(target[0]).trim(), onClick: run }, "运行升级预检"),
        state[0].phase === "loading" ? React.createElement("p", { role: "status" }, "正在捕获相同制品并比较静态风险……") : null,
        state[0].phase === "error" ? React.createElement("p", { role: "status", style: styles.err }, state[0].error) : null,
        state[0].phase === "done" ? React.createElement(UpgradeDetails, { result: state[0].result }) : null);
    }

    function ReportPreview(p) {
      var shown = React.useState(false), copied = React.useState("");
      var text = typeof p.data.issueReport === "string" ? p.data.issueReport : null;
      return React.createElement("div", null,
        React.createElement("button", { type: "button", style: styles.btn,
          onClick: function () { shown[1](!shown[0]); copied[1](""); },
        }, shown[0] ? "关闭报告预览" : "预览故障报告"),
        shown[0] ? React.createElement("div", { style: { margin: "10px 0" } },
          React.createElement("p", { style: styles.note }, "这是本次完整报告，筛选不会删减导出内容。保留插件名与包内位置；请预览敏感信息后再分享。"),
          text === null ? React.createElement("div", { role: "status" }, "当前报告未提供导出文本，请刷新并确认宿主与客户端版本一致。") :
          React.createElement("div", null,
            React.createElement("textarea", { "aria-label": "故障报告预览", readOnly: true, value: text, rows: 14,
              style: mergeStyle(styles.mono, { width: "100%", boxSizing: "border-box", color: "inherit", background: "transparent" }),
              onFocus: function (event) { event.target.select(); },
            }),
            React.createElement("button", { type: "button", style: styles.btn, onClick: async function () {
              try {
                if (typeof navigator === "undefined" || !navigator.clipboard || !navigator.clipboard.writeText) throw Error("Clipboard unavailable");
                await navigator.clipboard.writeText(text); copied[1]("已复制。请确认敏感信息后再分享。");
              } catch (error) { copied[1]("无法自动复制，请选中预览文本手动复制。"); }
            } }, "复制报告"),
            React.createElement("span", { role: "status", style: styles.meta }, copied[0]))) : null);
    }

    function ReportMeta(p) {
      var d = p.data, c = d.cache;
      var cache = c && c.hit ? "缓存报告（约 " + Math.max(0, Math.round(c.ageMs / 1000)) + " 秒前）" : "本次重新计算的报告";
      if (c && c.stale) cache += "；输入已变化，报告待刷新";
      if (c && c.refreshing) cache += "；后台正在刷新";
      return React.createElement("div", { style: styles.note },
        React.createElement("div", null, "报告时间：" + (d.computedAt || "未提供") + " · " + cache),
        React.createElement("div", null, "体检对象：" + (d.nodeModules || "未提供") + " · 目标 DSH：" + (d.report.dshVersion || "未知")),
        React.createElement("div", { "data-catalog-status": d.report.catalog && d.report.catalog.verified ? "verified" : "uncertified", role: d.report.catalog && d.report.catalog.verified ? undefined : "alert", style: d.report.catalog && d.report.catalog.verified ? undefined : styles.err },
          ReportContract.catalogLines(d.report.catalog).map(function (line, i) { return React.createElement("div", { key: i }, line); })),
        c && c.refreshError ? React.createElement("div", { role: "status", style: styles.err }, "最近刷新失败，保留上次成功报告：" + c.refreshError) : null);
    }

    async function saveFindingReview(body) {
      var response=await fetch('/plugin-compat-check/reviews',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});
      var result=await response.json();
      if(!response.ok||!result.ok||result.reviews?.error)throw new Error(result.error||result.reviews?.error||'人工处置保存失败');
      return result.reviews;
    }

    function Table(p) {
      var data = p.data;
      var report = data && data.report;
      var queryState = React.useState(""), verdictState = React.useState("all"), certaintyState = React.useState("all"), pendingState = React.useState("all"), risksState = React.useState(false);
      if (!report) return null;
      var names = Object.keys(report.plugins);
      names.sort(function (a, b) {
        var rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
        var d = rank[report.plugins[a].verdict] - rank[report.plugins[b].verdict];
        return d !== 0 ? d : a.localeCompare(b);
      });
      var diff = data.baseline && data.baseline.diff, comparable = Boolean(diff && diff.comparable), risks = {};
      if (comparable) {
        (diff.worsened || []).forEach(function (entry) { risks[entry.name] = true; });
        (diff.added || []).forEach(function (entry) { if (report.plugins[entry.name] && report.plugins[entry.name].findings.length) risks[entry.name] = true; });
      }
      var shown = names.filter(function (name) {
        var pl = report.plugins[name];
        var pending = pl.coverage.status !== "complete" || pl.vacuous || (pl.clientSide || []).length > 0;
        return name.toLowerCase().includes(String(queryState[0]).trim().toLowerCase())
          && (verdictState[0] === "all" || pl.verdict === verdictState[0])
          && (certaintyState[0] === "all" || pl.findings.some(function (f) { return f.certainty === certaintyState[0]; }))
          && (pendingState[0] === "all" || (pendingState[0] === "pending" ? pending : !pending))
          && (!risksState[0] || (comparable && risks[name]));
      });
      var s = report.summary || {};
      function select(label, state, options) {
        return React.createElement("select", { "aria-label": label, value: state[0], style: styles.btn,
          onChange: function (event) { state[1](event.target.value); },
        }, options.map(function (option) { return React.createElement("option", { key: option[0], value: option[0] }, option[1]); }));
      }
      return React.createElement("div", { style: styles.root },
        React.createElement("div", { style: styles.head },
          React.createElement("span", { style: styles.title }, "兼容性"),
          React.createElement("span", { style: styles.meta },
            names.length + " 个插件 · 可用 " + (s.ok || 0) + " · 部分可用 " + (s.partial || 0)
            + " · 不兼容 " + (s.broken || 0)
            + (s.vacuousOk ? " · 其中 " + s.vacuousOk + " 个「可用」没有已验证调用" : "")),
          React.createElement("button", { style: styles.btn, type: "button", onClick: function () { p.onReload(); } }, "重新检查")),
        React.createElement(ReportMeta, { data: data }),
        React.createElement(Badge, { baseline: data.baseline }),
        React.createElement("div", { style: mergeStyle(styles.head, { marginTop: "12px" }) },
          React.createElement("input", { "aria-label": "搜索插件", placeholder: "搜索插件名称", value: queryState[0],
            style: mergeStyle(styles.btn, { minWidth: "150px" }), onChange: function (event) { queryState[1](event.target.value); } }),
          select("按结论筛选", verdictState, [["all", "全部结论"], ["broken", "不兼容"], ["partial", "部分可用"], ["unknown", "未知"], ["ok", "可用"]]),
          select("按确定性筛选", certaintyState, [["all", "全部确定性"], ["certain", "含确定发现"], ["suspected", "含疑似发现"]]),
          select("按验证状态筛选", pendingState, [["all", "全部验证状态"], ["pending", "有待验证部分"], ["complete", "无待验证部分"]]),
          React.createElement("button", { type: "button", style: styles.btn, "aria-pressed": risksState[0], onClick: function () { risksState[1](!risksState[0]); } }, "本次新增风险"),
          React.createElement("button", { type: "button", style: styles.btn, onClick: function () { queryState[1](""); verdictState[1]("all"); certaintyState[1]("all"); pendingState[1]("all"); risksState[1](false); } }, "清除筛选")),
        risksState[0] ? React.createElement("div", { role: "status", style: styles.note }, comparable
          ? "仅显示基线差分中的新增或变重风险；无变化不表示业务通过。"
          : "尚无可比较基线；本视图不能判断新增风险，不表示没有风险。") : null,
        React.createElement("div", { style: styles.meta }, "显示 " + shown.length + " / " + names.length + " 个插件；筛选仅改变呈现。"),
        React.createElement(ReportPreview, { data: data }),
        React.createElement(UpgradePreview, { data: data }),
        React.createElement(DependencyPanel, {graph: report.dependencyGraph}),
        React.createElement(FindingReviewPanel, {report:report,reviews:data.reviews,onSave:saveFindingReview}),
        React.createElement(FunctionalHealthPanel, {report:report}),
        !shown.length ? React.createElement("div", { role: "status", style: styles.note }, "没有符合筛选条件的插件。清除筛选可查看完整报告。") : null,
        React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("table", { style: styles.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: styles.th }, "插件"),
            React.createElement("th", { style: styles.th }, "结论"),
            React.createElement("th", { style: styles.th }, "发现与核实"))),
          React.createElement("tbody", null, shown.map(function (n) {
            var pl = report.plugins[n], v = VERDICT[pl.verdict] || VERDICT.unknown;
            return React.createElement("tr", { key: n, "data-compat-plugin": n },
              React.createElement("td", { style: styles.td },
                React.createElement("div", null, n),
                React.createElement("div", { style: styles.mono }, "@" + (pl.version || "?") + (pl.vacuous ? " · 无已验证调用" : ""))),
              React.createElement("td", { style: styles.td }, React.createElement("span", { style: Object.assign({}, styles.pill, { background: v.color }) }, v.text)),
              React.createElement("td", { style: styles.td },
                React.createElement(Coverage, { plugin: pl }),
                React.createElement("details", null,
                  React.createElement("summary", { style: { cursor: "pointer", marginTop: "6px" } }, "查看 " + pl.findings.length + " 条发现与未验证项"),
                  React.createElement(Findings, { plugin: pl, hideCoverage: true }))));
          })))),
        React.createElement(EvidenceLegend),
        React.createElement("div", { style: styles.note }, "工具版本：" + (data.toolVersion || "未知") + " · " + (report.hasRuntimeSurface ? "方法级证据含宿主运行时观测；以每条发现为准。" : "方法级证据来自官方 API 契约目录，静态事实单独判定。")),
        React.createElement("details", null,
          React.createElement("summary", { style: styles.meta }, "查看采样与检查信息"),
          React.createElement("div", { style: styles.note }, (report.observation && report.observation.notes || []).join("；")),
          React.createElement("div", { style: styles.note }, "对象来源：" + (data.nodeModulesWhy || "未提供") + (data.elapsedMs !== undefined ? " · 耗时 " + data.elapsedMs + "ms" : ""))));
    }

    function Panel() {
      var st = useCompatibility();
      var value = st.value;
      mark({
        state: value.phase,
        renders: ((window.__COMPAT_CHECK__ || {}).renders || 0) + 1,
        // 验收要能断言"角标真的按差分管了"，所以把它的状态一起标出来
        badgeShow: Boolean(value.data && value.data.baseline && value.data.baseline.badge
          && value.data.baseline.badge.show),
        badgeText: (value.data && value.data.baseline && value.data.baseline.badge
          && value.data.baseline.badge.text) || null,
      });

      if (value.phase === "loading") {
        return React.createElement("div", { style: styles.root },
          React.createElement("div", { style: styles.hint }, "正在体检已装插件……"));
      }
      if (value.phase === "error") {
        return React.createElement("div", { style: styles.root },
          React.createElement("div", { style: styles.err },
            React.createElement("div", { style: { fontWeight: 600, marginBottom: "4px" } }, "拿不到体检结果"),
            React.createElement("div", null, value.error),
            React.createElement("div", { style: { marginTop: "6px", opacity: 0.75 } },
              "这一条是工具本身的问题，不是插件的结论 —— 请不要据此判断兼容性。")),
          React.createElement("button", {
            style: styles.btn, type: "button",
            onClick: function () { st.reload(true); },
          }, "重试"));
      }
      var data = value.data;
      if (!data || data.ok === false) {
        return React.createElement("div", { style: styles.root },
          React.createElement("div", { style: styles.err },
            React.createElement("div", { style: { fontWeight: 600, marginBottom: "4px" } }, "体检没跑成"),
            React.createElement("div", null, (data && data.error) || "未知原因")));
      }
      return React.createElement(Table, { data: data, onReload: function () { st.reload(true); } });
    }

    function apply(ctx) {
      console.log("[dsh-plugin-compat-check] CLIENT-HALF-APPLIED");
      // 最外层 try：注册失败也**绝不能**把客户端启动带崩 ——
      // 那正好是本工具要检测的那类故障（健康检查插件自己制造故障）。
      try {
        registerSlot(ctx, SLOT, { name: SLOT, id: "dsh-plugin-compat-check", order: 1, label: LABEL }, Panel, "tab");
        // C3：**详情页**的两个槽位。各自独立注册 —— 一个槽位在某个版本上不存在时，
        // 另一个照常工作，而不是一起静默消失。
        //
        // ⚠️ 为什么不注册 `plugins.item`（曾经注册过）：
        // 实测它的 props 是 `{view:"summary"}`，**没有插件身份**（宿主用
        // `renderSlot("plugins.item", {view}, {only: entryId})` 限定，只对匹配的
        // 条目渲染，而那个 entryId 是**配置页注册时给的 id**，不是包名）。
        // 也就是说它加不到"社区插件卡"上 —— 想给某插件的卡片加角标，需要知道那个
        // 卡片的 entry id，而我们无从得知。硬撑只会得到一个永不出现的组件，
        // 或者一个挂在自己配置页上的角标。**概览本来就有地方放**：
        // `settings.plugins.tab`（设置 → 内置插件 → 兼容性）。
        registerSlot(ctx, SLOT_DETAIL, { name: SLOT_DETAIL, id: "dsh-plugin-compat-check/detail", order: 1 }, DetailSection, "detail");
        registerSlot(ctx, SLOT_DETAIL_BADGE, { name: SLOT_DETAIL_BADGE, id: "dsh-plugin-compat-check/detail-badge", order: 1 }, DetailBadge, "detail-badge");
      } catch (error) {
        console.warn("[dsh-plugin-compat-check] REGISTER-THREW (outer) " + String(error));
      }
    }

    var registered = [];

    /**
     * 注册一个槽位，并把结果**记在标记里**。
     *
     * 为什么要记账：注册失败必须是**响的**。静默失败会让人以为"这个槽位不渲染"，
     * 而真相是"我们没注册上" —— 两者要查的方向完全不同。实测（docs/Plan.md §5 C3）
     * 三个 detail 槽位都真的渲染，所以一旦它们不出现，第一个该怀疑的是注册。
     */
    function registerSlot(ctx, slot, spec, Comp, tag) {
      try {
        ctx.slots.inject(slot, function () {
          return ctx.slots.register(spec, Comp);
        });
        registered.push(slot);
        console.log("[dsh-plugin-compat-check] REGISTERED " + slot);
      } catch (error) {
        console.warn("[dsh-plugin-compat-check] REGISTER-THREW " + slot + " " + String(error));
      }
      mark({ registered: registered.slice() });
    }

    exports.name = "dsh-plugin-compat-check";
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
