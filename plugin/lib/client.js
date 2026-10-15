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

return { assertEnvelope: assertEnvelope };
    })();
    // END GENERATED REPORT CONTRACT

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
      "unprovided-dependency": "无人提供的依赖",
      "declaration-mismatch": "声明与实测不符",
      "declared-incompatible": "版本声明不支持",
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
      var value = state[0];
      var set = state[1];
      var alive = React.useRef(true);

      var load = React.useCallback(function (refresh) {
        set({ phase: "loading", data: null, error: null });
        try {
          fetch(refresh ? ROUTE + "?refresh=1" : ROUTE, {
            headers: { accept: "application/json" },
            credentials: "same-origin",
          })
            .then(function (res) {
              if (!res.ok) throw new Error("HTTP " + res.status);
              return res.json();
            })
            .then(function (data) {
              data = acceptPayload(data);
              if (!alive.current) return;
              set({ phase: "done", data: data, error: null });
            })
            .catch(function (error) {
              if (!alive.current) return;
              // 取不到数据**也要说清楚是什么问题**。一个永远转圈的加载状态
              // 与一个永远空白的表格，用户无法区分"工具坏了"与"没问题"。
              set({ phase: "error", data: null, error: String((error && error.message) || error) });
            });
        } catch (error) {
          set({ phase: "error", data: null, error: String((error && error.message) || error) });
        }
      }, []);

      React.useEffect(function () {
        alive.current = true;
        load(false);
        return function () { alive.current = false; };
      }, [load]);

      return { value: value, reload: load };
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

    function Findings(p) {
      var pl = p.plugin;
      if (!pl.findings || pl.findings.length === 0) {
        var parts = [];
        if (pl.vacuous) {
          parts.push(React.createElement("div", { key: "v", style: styles.suspect },
            "这个插件没有用过任何 DSH 服务，因此没有可检查的东西 —— 「可用」在这里是空洞的。"));
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
      return React.createElement("div", null, pl.findings.map(function (f, i) {
        var api = f.service ? (f.method ? f.service + "." + f.method : f.service) : "(包声明)";
        var loc = f.location ? f.location.file + ":" + f.location.line : "—";
        return React.createElement("div", { key: i, style: styles.finding },
          React.createElement(Sev, { severity: f.severity }),
          React.createElement("span", null, " " + (CATEGORY[f.category] || f.category) + " "),
          React.createElement("code", { style: styles.mono }, api),
          React.createElement("span", { style: styles.mono }, " @ " + loc),
          f.certainty !== "certain"
            ? React.createElement("span", { style: styles.suspect, title: "没有运行时面，只能靠官方目录推断" }, " [疑似]")
            : null,
          f.impact ? React.createElement("div", { style: styles.dim },
            (f.impactBasis === "inferred" ? "影响（推断，非实测）：" : "影响：") + f.impact) : null,
          f.basis ? React.createElement("div", { style: styles.dim }, "依据：" + f.basis) : null);
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
        pl.vacuous ? React.createElement("div", { style: styles.dim },
          "这个插件的结论是空洞的：它没有用过任何 DSH 服务，所以没有可检查的东西。") : null);
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

    function Table(p) {
      var data = p.data;
      var report = data && data.report;
      if (!report) return null;
      var names = Object.keys(report.plugins);
      names.sort(function (a, b) {
        var rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
        var d = rank[report.plugins[a].verdict] - rank[report.plugins[b].verdict];
        return d !== 0 ? d : a.localeCompare(b);
      });
      var s = report.summary || {};
      return React.createElement("div", { style: styles.root },
        React.createElement("div", { style: styles.head },
          React.createElement("span", { style: styles.title }, "兼容性"),
          React.createElement("span", { style: styles.meta },
            names.length + " 个插件 · 可用 " + (s.ok || 0) + " · 部分可用 " + (s.partial || 0)
            + " · 不兼容 " + (s.broken || 0)
            + (s.vacuousOk ? " · 其中 " + s.vacuousOk + " 个「可用」无可检查对象" : "")),
          React.createElement("button", {
            style: styles.btn, type: "button",
            onClick: function () { p.onReload(); },
          }, "重新检查")),
        React.createElement(Badge, { baseline: data.baseline }),
        React.createElement("table", { style: styles.table },
          React.createElement("thead", null, React.createElement("tr", null,
            React.createElement("th", { style: styles.th }, "插件"),
            React.createElement("th", { style: styles.th }, "结论"),
            React.createElement("th", { style: styles.th }, "发现"))),
          React.createElement("tbody", null, names.map(function (n) {
            var pl = report.plugins[n];
            var v = VERDICT[pl.verdict] || VERDICT.unknown;
            return React.createElement("tr", { key: n },
              React.createElement("td", { style: styles.td },
                React.createElement("div", null, n),
                React.createElement("div", { style: styles.mono },
                  "@" + (pl.version || "?") + (pl.vacuous ? " · 无可检查对象" : ""))),
              React.createElement("td", { style: styles.td },
                React.createElement("span", { style: Object.assign({}, styles.pill, { background: v.color }) }, v.text)),
              React.createElement("td", { style: styles.td }, React.createElement(Findings, { plugin: pl })));
          }))),
        React.createElement("div", { style: styles.note },
          "工具版本：" + (data.toolVersion || "未知") + " · " + (report.summary.limited ? "部分证据尚未验证。 " : "") + (report.hasRuntimeSurface
            ? "方法级判定依据：宿主运行时面；确定性以每条证据为准。"
            : "方法级判定依据：官方 API 目录（契约目录，不是运行时面）—— 因此方法级结论标为「疑似」。"
              + "「疑似」不是缺陷，是诚实：判不准时降级标注，而不是升格成确定。")),
        React.createElement("div", { style: styles.note }, (report.observation && report.observation.notes || []).join("；")),
        React.createElement("div", { style: styles.note },
          "判定内核：" + (data.kernelDir || "?")
          + " · 体检对象：" + (data.nodeModules || "?") + "（" + (data.nodeModulesWhy || "?") + "）"
          + (data.elapsedMs !== undefined ? " · 耗时 " + data.elapsedMs + "ms" : "")));
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
