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

    var React = require("react");

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
            && data.dshVersion === latest.current.report.dshVersion) {
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
      React.useEffect(function () {
        generation.current++;
        state[1]({ phase: "idle" });
        return function () { generation.current++; };
      }, [currentVersion, p.data]);
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
