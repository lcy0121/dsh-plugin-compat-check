import * as React from "react";
import { assertEnvelope, catalogLines } from "../../lib/contracts.mjs";
import { nextSteps } from "../../lib/finding-guidance.mjs";
import {
  assertUpgradePreview,
  SUPPORTED_PREVIEW_VERSIONS,
} from "../../lib/upgrade-contract.mjs";
import { validateDependencyGraph } from "../../lib/dependency-graph.mjs";
import {
  REVIEW_STATUS_LABELS,
  REVIEW_LIMITS,
  validateReviewInput,
  validateReviewEnvelope,
} from "../../lib/finding-review.mjs";
import {
  validateFunctionalHealthResult,
  canonicalFunctionalManifest,
} from "../../lib/functional-health-contract.mjs";
import * as WorkflowPanelFactory from "../../lib/workflow-panels.mjs";
import {
  ui,
  Button,
  Badge as StatusBadge,
  Card,
  Alert,
  Fold,
  Scope,
} from "./components/ui/index.jsx";
const ReportContract = { assertEnvelope, catalogLines };
const FindingGuidance = { nextSteps };
const UpgradeContract = { assertUpgradePreview, SUPPORTED_PREVIEW_VERSIONS };
const DependencyGraphContract = { validateDependencyGraph };
const FindingReviewContract = {
  REVIEW_STATUS_LABELS,
  REVIEW_LIMITS,
  validateReviewInput,
  validateReviewEnvelope,
};
const FunctionalHealthContract = {
  validateFunctionalHealthResult,
  canonicalFunctionalManifest,
};

const h = (type, props, ...children) =>
  React.createElement(ui[type] || type, props, ...children);
var DependencyPanel = WorkflowPanelFactory.createDependencyPanel(
  React,
  DependencyGraphContract,
  ui,
);
var FindingReviewPanel = WorkflowPanelFactory.createFindingReviewPanel(
  React,
  FindingReviewContract,
  ui,
);
var FunctionalHealthPanel = WorkflowPanelFactory.createFunctionalHealthPanel(
  React,
  FunctionalHealthContract,
  ui,
);

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
var SEVERITY = {
  fatal: "致命",
  "feature-dead": "功能失效",
  degraded: "降级",
};
var CATEGORY = {
  "api-argument-invalid": "API参数不符",
  "api-option-unsupported": "版本选项未支持",
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
    for (var k in prev)
      if (
        Object.prototype.hasOwnProperty.call(prev, k) &&
        prev[k] !== null &&
        prev[k] !== undefined
      )
        next[k] = prev[k];
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
    for (var k in a)
      if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
  }
  return out;
}

/** C3 · 详情页 section：这个插件的完整结论 + 每条发现的证据 */
function acceptPayload(data) {
  try {
    return ReportContract.assertEnvelope(data);
  } catch (error) {
    console.warn(
      "[dsh-plugin-compat-check] invalid report",
      String((error && error.message) || error),
    );
    throw new Error(
      "无法读取体检报告：报告格式或版本不受支持，请刷新页面并确认宿主与插件版本一致。",
    );
  }
}

function useCompatibility() {
  var state = React.useState({ phase: "loading", data: null, error: null });
  var alive = React.useRef(true),
    latest = React.useRef(null),
    pending = React.useRef(null),
    queuedForce = React.useRef(false);
  var set = state[1];
  var load = React.useCallback(function (refresh, background) {
    if (pending.current) {
      if (refresh) queuedForce.current = true;
      return pending.current;
    }
    function read(url) {
      return fetch(url, {
        headers: {
          accept: "application/json",
          "X-DSH-Compat-Request": "1",
        },
        credentials: "same-origin",
      }).then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      });
    }
    var request = Promise.resolve()
      .then(function () {
        return read(
          refresh
            ? ROUTE + "?refresh=1"
            : background
              ? ROUTE + "?metadata=1"
              : ROUTE,
        );
      })
      .then(function (data) {
        if (
          background &&
          data.kind === "plugin-compat-check/report-metadata" &&
          data.ok &&
          latest.current &&
          data.computedAt === latest.current.computedAt &&
          data.nodeModules === latest.current.nodeModules &&
          data.dshVersion === latest.current.report.dshVersion &&
          (data.reviewsRevision || null) ===
            ((latest.current.reviews && latest.current.reviews.revision) ||
              null) &&
          (data.reviewsError || null) ===
            ((latest.current.reviews && latest.current.reviews.error) ||
              null) &&
          (data.reviewsContextToken || null) ===
            ((latest.current.reviews && latest.current.reviews.contextToken) ||
              null)
        ) {
          return Object.assign({}, latest.current, { cache: data.cache });
        }
        return background ? read(ROUTE) : data;
      })
      .then(function (data) {
        data = acceptPayload(data);
        if (!data.ok && latest.current)
          throw new Error(data.error || "后台刷新失败");
        if (!alive.current) return;
        latest.current = data;
        set({ phase: "done", data: data, error: null });
      })
      .catch(function (error) {
        if (!alive.current) return;
        var message = String((error && error.message) || error);
        if (latest.current && latest.current.ok) {
          var previous = latest.current;
          var kept = Object.assign({}, previous, {
            cache: Object.assign({}, previous.cache, {
              hit: true,
              stale: true,
              refreshing: false,
              refreshError: message,
            }),
          });
          set({ phase: "done", data: kept, error: message });
        } else set({ phase: "error", data: null, error: message });
      })
      .then(function () {
        pending.current = null;
        if (queuedForce.current && alive.current) {
          queuedForce.current = false;
          return load(true, false);
        }
      });
    pending.current = request;
    return request;
  }, []);
  React.useEffect(
    function () {
      alive.current = true;
      var timer;
      function schedule() {
        if (alive.current)
          timer = setTimeout(function () {
            return load(false, true).then(schedule);
          }, 2000);
      }
      load(false).then(schedule);
      return function () {
        alive.current = false;
        clearTimeout(timer);
      };
    },
    [load],
  );
  return { value: state[0], reload: load };
}

var styles = {
  root: { minWidth: 0 },
  head: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "10px",
  },
  title: { fontSize: "20px", fontWeight: 650, letterSpacing: "-.03em" },
  meta: { color: "hsl(var(--dsc-muted-foreground))", fontSize: "12px" },
  btn: {},
  table: {},
  th: {},
  td: {},
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "12px",
    overflowWrap: "anywhere",
  },
  pill: {},
  note: {
    color: "hsl(var(--dsc-muted-foreground))",
    fontSize: "12px",
    marginTop: "10px",
  },
  err: {
    padding: "12px",
    border: "1px solid #dc262640",
    borderRadius: "8px",
    background: "#dc262608",
    fontSize: "13px",
  },
  hint: { color: "hsl(var(--dsc-muted-foreground))", padding: "12px 0" },
  finding: {
    marginTop: "12px",
    paddingTop: "10px",
    borderTop: "1px solid hsl(var(--dsc-border))",
  },
  suspect: { color: "hsl(var(--dsc-muted-foreground))", fontSize: "12px" },
  dim: {
    color: "hsl(var(--dsc-muted-foreground))",
    fontSize: "12px",
    marginTop: "4px",
  },
};

function Sev(p) {
  var s = p.severity;
  var color =
    s === "fatal" ? "#dc2626" : s === "feature-dead" ? "#d97706" : "#6b7280";
  return h(
    "span",
    { style: { color: color, fontWeight: 600 } },
    SEVERITY[s] || s,
  );
}

function Coverage(p) {
  var c = p.plugin.coverage;
  if (!c) return null;
  return h(
    "div",
    { style: styles.dim },
    "证据覆盖：" +
      (c.status === "complete" ? "完整" : "有限") +
      "；已验证调用 " +
      c.verifiedCalls,
    c.limitations.length
      ? h(
          "details",
          null,
          h(
            "summary",
            { style: { cursor: "pointer" } },
            "覆盖限制（" + c.limitations.length + "）",
          ),
          c.limitations.map(function (note, i) {
            return h("div", { key: i }, "覆盖限制：" + note);
          }),
        )
      : null,
  );
}

function EvidenceLegend() {
  return h(
    "div",
    { style: styles.note },
    "确定（certain）可由明确静态事实或合格运行时观测支持；疑似（suspected）表示当前证据不足以确定该条发现。",
    "影响依据：实测（measured）须有对应观测，推断（inferred）不等于业务影响已实测。",
    "未观测不等于缺失；没有已验证调用仍可能存在服务依赖或客户端功能；调用核验和覆盖完整均不等于业务验收通过。",
  );
}

function Findings(p) {
  var pl = p.plugin;
  if (!pl.findings || pl.findings.length === 0) {
    var parts = [
      p.hideCoverage ? null : h(Coverage, { key: "coverage", plugin: pl }),
    ];
    if (pl.vacuous) {
      parts.push(
        h(
          "div",
          { key: "v", style: styles.suspect },
          "本轮未发现冲突，但没有已验证调用；插件仍可能依赖 DSH 服务或包含未验证的客户端功能，不能据此确认业务可用。",
        ),
      );
    }
    var noCalls = Object.keys(pl.resolved || {})
      .map(function (k) {
        return pl.resolved[k];
      })
      .filter(function (c) {
        return c.disposition === "no-calls";
      });
    if (noCalls.length) {
      parts.push(
        h(
          "div",
          { key: "n", style: styles.dim },
          "无证据可判（只出现名字，没有调用点）：" +
            noCalls
              .map(function (c) {
                return c.service;
              })
              .join("、"),
        ),
      );
    }
    if (pl.clientSide && pl.clientSide.length) {
      parts.push(
        h(
          "div",
          { key: "c", style: styles.dim },
          "客户端半边（命令行测不到，需界面验证）：" +
            pl.clientSide
              .map(function (c) {
                return c.service;
              })
              .join("、"),
        ),
      );
    }
    return parts.length ? h("div", null, parts) : null;
  }
  return h(
    "div",
    null,
    p.hideCoverage ? null : h(Coverage, { plugin: pl }),
    pl.findings.map(function (f, i) {
      var api = f.service
        ? f.method
          ? f.service + "." + f.method
          : f.service
        : "(包声明)";
      var loc = f.location ? f.location.file + ":" + f.location.line : "—";
      return h(
        "div",
        { key: i, style: styles.finding },
        h(Sev, { severity: f.severity }),
        h("span", null, " " + (CATEGORY[f.category] || f.category) + " "),
        h("code", { style: styles.mono }, api),
        h("span", { style: styles.mono }, " @ " + loc),
        h(
          "span",
          {
            style: styles.suspect,
            title:
              f.certainty === "certain"
                ? "当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；不等于影响已实测。"
                : "当前证据不足以确定该条发现；存在运行时观测也不代表该调用已验证。",
          },
          f.certainty === "certain" ? " [确定]" : " [疑似]",
        ),
        f.impact
          ? h(
              "div",
              { style: styles.dim },
              (f.impactBasis === "measured"
                ? "影响（实测）："
                : f.impactBasis === "inferred"
                  ? "影响（推断，非实测）："
                  : "影响（依据未提供）：") + f.impact,
            )
          : null,
        f.basis ? h("div", { style: styles.dim }, "依据：" + f.basis) : null,
        h(
          "div",
          { style: { marginTop: "6px" } },
          h("strong", null, "下一步核实"),
          h(
            "ol",
            { style: { margin: "4px 0", paddingLeft: "22px" } },
            FindingGuidance.nextSteps(f).map(function (step, j) {
              return h("li", { key: j }, step);
            }),
          ),
        ),
      );
    }),
  );
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
    if (typeof name !== "string" || name === "") return null;
    return plugins[name]
      ? { name: name, plugin: plugins[name], how: how }
      : null;
  };

  var subj = props && props.subject;
  if (subj && typeof subj === "object") {
    var pkg = subj.pkg;
    var direct =
      typeof pkg === "string"
        ? pkg
        : pkg && typeof pkg === "object"
          ? pkg.name
          : null;
    var hit = byPkg(direct, "subject.pkg.name");
    if (hit) return hit;
    hit = byPkg(subj.id, "subject.id=包名");
    if (hit) return hit;
    hit = lookupLedger(report, subj.id);
    if (hit) return hit;
  }
  if (props && typeof props === "object") {
    var hit2 = byPkg(props.id, "props.id=包名");
    if (hit2) return hit2;
    hit2 = lookupLedger(report, props.id);
    if (hit2) return hit2;
    if (props.view) {
      hit2 = byPkg(SELF_ITEM_ID, "自家条目 id");
      if (hit2) return hit2;
    }
  }
  return null;
}

/** 条目 id → 关联包名（台账由宿主半边的 computeReport 采集） */
function lookupLedger(report, id) {
  if (typeof id !== "string" || id === "") return null;
  var items = report.items || [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || it.id !== id) continue;
    var pkg = it.packageName || it.package || it.name;
    if (typeof pkg === "string" && report.plugins[pkg]) {
      return {
        name: pkg,
        plugin: report.plugins[pkg],
        how: "台账条目 " + id + " → " + pkg,
      };
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
    return h(
      "div",
      {
        style: mergeStyle(styles.dim, {
          marginTop: 0,
          marginBottom: "8px",
        }),
      },
      b.note,
    );
  }
  if (b.error) {
    return h("div", { style: styles.dim }, "基线差分没算成：" + b.error);
  }
  var badge = b.badge || {};
  if (!badge.show) {
    return h(
      "div",
      {
        style: mergeStyle(styles.dim, {
          marginTop: 0,
          marginBottom: "8px",
        }),
      },
      badge.detail || "与上次相比没有任何变化",
    );
  }
  var color =
    badge.direction === "worse"
      ? "#dc2626"
      : badge.direction === "better"
        ? "#16a34a"
        : "#6b7280";
  var diff = b.diff || {};
  var lines = [];
  (diff.worsened || []).forEach(function (e) {
    lines.push(
      "↓ " +
        e.name +
        "@" +
        (e.versionFrom || "?") +
        "→" +
        (e.versionTo || "?") +
        "：" +
        e.reason,
    );
    (e.newFindings || []).forEach(function (f) {
      lines.push("    新增：" + f.key + " @ " + (f.location || "—"));
    });
  });
  (diff.improved || []).forEach(function (e) {
    lines.push("↑ " + e.name + "：" + e.reason);
  });
  (diff.added || []).forEach(function (e) {
    lines.push("+ " + e.name + "@" + e.version);
  });
  (diff.removed || []).forEach(function (e) {
    lines.push("− " + e.name + "@" + e.version);
  });
  return h(
    "div",
    { style: { marginBottom: "10px" } },
    h(
      StatusBadge,
      {
        tone:
          badge.direction === "worse"
            ? "broken"
            : badge.direction === "better"
              ? "ok"
              : "neutral",
      },
      badge.text,
    ),
    diff.dshVersionChanged
      ? h(
          "span",
          { style: mergeStyle(styles.dim, { marginLeft: "8px" }) },
          "DSH " +
            (diff.dshVersionFrom || "?") +
            " → " +
            (diff.dshVersionTo || "?"),
        )
      : null,
    h(
      "div",
      {
        style: mergeStyle(styles.mono, {
          marginTop: "4px",
          whiteSpace: "pre-wrap",
        }),
      },
      lines.join("\n"),
    ),
  );
}

function DetailSection(props) {
  try {
    return DetailSectionBody(props);
  } catch (error) {
    // 组件体抛异常会被 React 静默丢弃（整棵子树消失），
    // 而"跑了但什么都没渲染"是最难查的形态。所以自己抓、自己报。
    mark({ detailSectionError: String((error && error.message) || error) });
    return h(
      "div",
      { style: styles.err },
      "dsh-plugin-compat-check: 渲染时出错 —— " +
        String((error && error.message) || error),
    );
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
          subjectKind: (subj && subj.kind) || null,
          subjectId: (subj && subj.id) || null,
          pkgType: typeof pkg,
          pkgName: typeof pkg === "string" ? pkg : (pkg && pkg.name) || null,
          inReport: Boolean(data && data.report && data.report.plugins),
          pluginCount:
            data && data.report && data.report.plugins
              ? Object.keys(data.report.plugins).length
              : 0,
        },
      });
    } catch (e) {
      /* 诊断 */
    }
  }
  mark({ detailSectionRendered: true, detailFor: hit ? hit.name : null });

  if (st.value.phase === "loading") {
    return h("div", { style: styles.hint }, "正在体检…");
  }
  if (st.value.phase === "error" || !data || data.ok === false) {
    return h(
      "div",
      { style: styles.err },
      "拿不到体检结果（这是工具的问题，不是这个插件的结论）：" +
        (st.value.error || (data && data.error) || "未知原因"),
    );
  }
  if (!hit) {
    // 找不到对应项**也要说明**，而不是渲染一个空白 ——
    // 空白会被读成"这个插件没问题"，而它其实是"我们没算出来"。
    return h(
      "div",
      { style: styles.dim },
      "这个插件不在本次体检范围内（可能它不是带 dsh 清单的社区插件，或它的条目用了别的键名）。" +
        "请以「兼容性」总览页为准。",
    );
  }
  var pl = hit.plugin;
  var v = verdictOf(pl);
  return h(
    "div",
    { style: styles.root, "data-compat-detail": hit.name },
    h(
      "div",
      { style: styles.head },
      h(StatusBadge, { tone: pl.verdict }, v.text),
      h(
        "span",
        { style: styles.meta },
        "dsh-plugin-compat-check · " + (pl.findings || []).length + " 条发现",
      ),
      h(
        "button",
        {
          style: styles.btn,
          type: "button",
          onClick: function () {
            st.reload(true);
          },
        },
        "重新检查",
      ),
    ),
    h(Findings, { plugin: pl }),
    h(EvidenceLegend),
  );
}

/** C3 · 详情页角标：一行字，放在标题行 */
function DetailBadge(props) {
  var st = usePluginState();
  var data = st.value.data;
  var hit = pickPlugin(data, props);
  mark({
    detailBadgeRendered: true,
    detailBadgeFor: hit ? hit.name : null,
  });
  if (!hit) return null;
  var v = verdictOf(hit.plugin);
  if (!v) return null;
  return h(
    StatusBadge,
    {
      "data-compat-detail-badge": hit.name,
      tone: hit.plugin.verdict,
      title: "dsh-plugin-compat-check",
    },
    v.text,
  );
}

function UpgradeDetails(p) {
  var r = p.result;
  if (!r.ok) return h("div", { role: "status", style: styles.err }, r.error);
  var groups = [
    ["added", "新增"],
    ["worsened", "变重"],
    ["resolved", "消失"],
    ["improved", "减轻"],
    ["unchanged", "不变"],
  ];
  return h(
    "div",
    { "data-upgrade-result": "compared" },
    h("p", null, "静态版本对比：" + r.currentVersion + " → " + r.targetVersion),
    h(
      "p",
      { role: "status" },
      "新增 " +
        r.summary.added +
        " · 变重 " +
        r.summary.worsened +
        " · 消失 " +
        r.summary.resolved +
        " · 减轻 " +
        r.summary.improved +
        " · 不变 " +
        r.summary.unchanged,
    ),
    !r.summary.added && !r.summary.worsened
      ? h(
          "p",
          { style: styles.note },
          "本次没有发现新增或变重的静态风险；目标版本仍可能有原有风险，不等于业务通过。",
        )
      : null,
    groups.map(function (group) {
      return r.changes[group[0]].length
        ? h(
            "details",
            {
              key: group[0],
              open: group[0] === "added" || group[0] === "worsened",
            },
            h(
              "summary",
              null,
              group[1] + "（" + r.changes[group[0]].length + "）",
            ),
            r.changes[group[0]].map(function (entry, i) {
              var f = entry.finding || entry.after;
              return h(
                "div",
                { key: i, style: { margin: "8px 0" } },
                h(
                  "div",
                  null,
                  entry.plugin +
                    " · " +
                    f.category +
                    " · " +
                    [f.service, f.method].filter(Boolean).join("."),
                ),
                h(
                  "div",
                  { style: styles.mono },
                  f.severity +
                    " / " +
                    f.certainty +
                    " / " +
                    f.impactBasis +
                    (f.location
                      ? " · " + f.location.file + ":" + f.location.line
                      : ""),
                ),
                entry.before
                  ? h(
                      "div",
                      { style: styles.dim },
                      "此前：" +
                        entry.before.severity +
                        " / " +
                        entry.before.certainty +
                        " / " +
                        entry.before.impactBasis,
                    )
                  : null,
                h("div", null, f.impact),
                h("div", { style: styles.dim }, f.basis),
              );
            }),
          )
        : null;
    }),
    ["currentReport", "targetReport"].map(function (side) {
      var report = r[side],
        s = report.summary;
      return h(
        "details",
        { key: side },
        h(
          "summary",
          null,
          (side === "currentReport" ? "当前版本" : "目标版本") +
            "静态结果 " +
            report.dshVersion +
            " · 不兼容 " +
            s.broken +
            " · 部分可用 " +
            s.partial +
            " · 未知 " +
            s.unknown,
        ),
        Object.keys(report.plugins).map(function (name) {
          var pl = report.plugins[name];
          return h(
            "div",
            { key: name, style: { margin: "8px 0" } },
            h(
              "div",
              null,
              name +
                "@" +
                (pl.version || "?") +
                " · " +
                pl.verdict +
                (pl.vacuous ? " · 无已验证调用" : ""),
            ),
            h(Findings, { plugin: pl }),
          );
        }),
      );
    }),
    h(
      "details",
      null,
      h("summary", null, "查看输入制品、目录来源与预测限制"),
      h("div", { style: styles.mono }, "输入 SHA-256：" + r.artifact.sha256),
      r.artifact.packages.map(function (item, i) {
        return h(
          "div",
          { key: i, style: styles.mono },
          item.name + "@" + (item.version || "?") + " SHA-256：" + item.sha256,
        );
      }),
      ["current", "target"].map(function (side) {
        var c = r.catalogs[side];
        return h(
          "div",
          { key: side, style: styles.mono },
          "API 目录：" +
            c.version +
            " · " +
            c.file +
            " · SHA-256：" +
            c.sha256 +
            " · 来源：" +
            c.source.host +
            " / " +
            c.source.client,
        );
      }),
      h(
        "div",
        { style: styles.mono },
        "规则：" + r.rules.file + " · SHA-256：" + r.rules.sha256,
      ),
      r.limitations.map(function (note, i) {
        return h("div", { key: i, style: styles.note }, note);
      }),
    ),
  );
}

function UpgradePreview(p) {
  var target = React.useState(""),
    state = React.useState({ phase: "idle" }),
    generation = React.useRef(0);
  var currentVersion = p.data.report.dshVersion;
  // A review revision update may fetch a fresh JSON object for the same report.
  // Cache serialization by object reference; local form renders do not repeat it.
  var reportIdentity = React.useRef(null);
  if (
    !reportIdentity.current ||
    reportIdentity.current.report !== p.data.report
  ) {
    reportIdentity.current = {
      report: p.data.report,
      content: JSON.stringify(p.data.report),
    };
  }
  React.useEffect(
    function () {
      generation.current++;
      state[1]({ phase: "idle" });
      return function () {
        generation.current++;
      };
    },
    [
      currentVersion,
      p.data.nodeModules,
      p.data.computedAt,
      p.data.reviews && p.data.reviews.contextToken,
      reportIdentity.current.content,
    ],
  );
  async function run() {
    var requested = String(target[0]).trim(),
      ticket = ++generation.current;
    state[1]({ phase: "loading" });
    try {
      var response = await fetch(
        "/plugin-compat-check/upgrade-preview?targetVersion=" +
          encodeURIComponent(requested) +
          "&currentVersion=" +
          encodeURIComponent(currentVersion || ""),
        {
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "X-DSH-Compat-Request": "1",
          },
        },
      );
      if (!response.ok) throw Error("HTTP " + response.status);
      var result;
      try {
        result = UpgradeContract.assertUpgradePreview(await response.json());
      } catch (error) {
        throw Error("升级预检结果格式无效，请确认宿主与客户端版本一致。");
      }
      if (
        result.currentVersion !== currentVersion ||
        result.targetVersion !== requested
      )
        throw Error("升级预检版本已变化，请刷新普通报告后重试。");
      if (ticket === generation.current)
        state[1]({ phase: "done", result: result });
    } catch (error) {
      if (ticket === generation.current)
        state[1]({ phase: "error", error: String(error.message || error) });
    }
  }
  return h(
    "details",
    { style: { margin: "14px 0" }, "data-upgrade-preview": true },
    h("summary", { style: { cursor: "pointer" } }, "升级前兼容性预检（静态）"),
    h(
      "p",
      { style: styles.note },
      "比较同一组已安装制品在两个版本目录下的静态风险。静态预测不等于目标版本业务通过；不自动安装或升级。当前版本：" +
        (currentVersion || "未知") +
        "。可选目录版本：" +
        UpgradeContract.SUPPORTED_PREVIEW_VERSIONS.join("、"),
    ),
    h("input", {
      "aria-label": "目标 DSH 版本",
      placeholder: "输入精确目标版本",
      value: target[0],
      style: styles.btn,
      onChange: function (event) {
        generation.current++;
        target[1](event.target.value);
        state[1]({ phase: "idle" });
      },
    }),
    h(
      "button",
      {
        type: "button",
        style: styles.btn,
        disabled: state[0].phase === "loading" || !String(target[0]).trim(),
        onClick: run,
      },
      "运行升级预检",
    ),
    state[0].phase === "loading"
      ? h("p", { role: "status" }, "正在捕获相同制品并比较静态风险……")
      : null,
    state[0].phase === "error"
      ? h("p", { role: "status", style: styles.err }, state[0].error)
      : null,
    state[0].phase === "done"
      ? h(UpgradeDetails, { result: state[0].result })
      : null,
  );
}

function ReportPreview(p) {
  var shown = React.useState(false),
    copied = React.useState("");
  var text = typeof p.data.issueReport === "string" ? p.data.issueReport : null;
  return h(
    "div",
    null,
    h(
      "button",
      {
        type: "button",
        style: styles.btn,
        onClick: function () {
          shown[1](!shown[0]);
          copied[1]("");
        },
      },
      shown[0] ? "关闭报告预览" : "预览故障报告",
    ),
    shown[0]
      ? h(
          "div",
          { style: { margin: "10px 0" } },
          h(
            "p",
            { style: styles.note },
            "这是本次完整报告，筛选不会删减导出内容。保留插件名与包内位置；请预览敏感信息后再分享。",
          ),
          text === null
            ? h(
                "div",
                { role: "status" },
                "当前报告未提供导出文本，请刷新并确认宿主与客户端版本一致。",
              )
            : h(
                "div",
                null,
                h("textarea", {
                  "aria-label": "故障报告预览",
                  readOnly: true,
                  value: text,
                  rows: 14,
                  style: mergeStyle(styles.mono, {
                    width: "100%",
                    boxSizing: "border-box",
                    color: "inherit",
                    background: "transparent",
                  }),
                  onFocus: function (event) {
                    event.target.select();
                  },
                }),
                h(
                  "button",
                  {
                    type: "button",
                    style: styles.btn,
                    onClick: async function () {
                      try {
                        if (
                          typeof navigator === "undefined" ||
                          !navigator.clipboard ||
                          !navigator.clipboard.writeText
                        )
                          throw Error("Clipboard unavailable");
                        await navigator.clipboard.writeText(text);
                        copied[1]("已复制。请确认敏感信息后再分享。");
                      } catch (error) {
                        copied[1]("无法自动复制，请选中预览文本手动复制。");
                      }
                    },
                  },
                  "复制报告",
                ),
                h("span", { role: "status", style: styles.meta }, copied[0]),
              ),
        )
      : null,
  );
}

function ReportMeta(p) {
  var d = p.data,
    c = d.cache;
  var cache =
    c && c.hit
      ? "缓存报告（约 " + Math.max(0, Math.round(c.ageMs / 1000)) + " 秒前）"
      : "本次重新计算的报告";
  if (c && c.stale) cache += "；输入已变化，报告待刷新";
  if (c && c.refreshing) cache += "；后台正在刷新";
  return h(
    "div",
    { style: styles.note },
    h("div", null, "报告时间：" + (d.computedAt || "未提供") + " · " + cache),
    h(
      "div",
      null,
      "体检对象：" +
        (d.nodeModules || "未提供") +
        " · 目标 DSH：" +
        (d.report.dshVersion || "未知"),
    ),
    h(
      "div",
      {
        "data-catalog-status": d.report.catalog?.verified
          ? "verified"
          : "uncertified",
      },
      !d.report.catalog?.verified
        ? h(
            Alert,
            { role: "alert" },
            d.report.catalog?.warning || "API目录身份未提供，目标版本未认证。",
          )
        : null,
      h(
        "details",
        null,
        h(
          "summary",
          null,
          d.report.catalog?.verified
            ? "查看已认证目录与来源"
            : "查看目录与覆盖限制",
        ),
        ...ReportContract.catalogLines(d.report.catalog).map((line, i) =>
          h("div", { key: i }, line),
        ),
      ),
    ),
    c && c.refreshError
      ? h(
          "div",
          { role: "status", style: styles.err },
          "最近刷新失败，保留上次成功报告：" + c.refreshError,
        )
      : null,
  );
}

async function saveFindingReview(body) {
  var response = await fetch("/plugin-compat-check/reviews", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-DSH-Compat-Request": "1",
    },
    body: JSON.stringify(body),
  });
  var result = await response.json();
  if (!response.ok || !result.ok || result.reviews?.error)
    throw new Error(
      result.error || result.reviews?.error || "人工处置保存失败",
    );
  return result.reviews;
}

function Table(p) {
  var data = p.data;
  var report = data && data.report;
  var queryState = React.useState(""),
    verdictState = React.useState("all"),
    certaintyState = React.useState("all"),
    pendingState = React.useState("all"),
    risksState = React.useState(false);
  if (!report) return null;
  var names = Object.keys(report.plugins);
  names.sort(function (a, b) {
    var rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
    var d = rank[report.plugins[a].verdict] - rank[report.plugins[b].verdict];
    return d !== 0 ? d : a.localeCompare(b);
  });
  var diff = data.baseline && data.baseline.diff,
    comparable = Boolean(diff && diff.comparable),
    risks = {};
  if (comparable) {
    (diff.worsened || []).forEach(function (entry) {
      risks[entry.name] = true;
    });
    (diff.added || []).forEach(function (entry) {
      if (
        report.plugins[entry.name] &&
        report.plugins[entry.name].findings.length
      )
        risks[entry.name] = true;
    });
  }
  var shown = names.filter(function (name) {
    var pl = report.plugins[name];
    var pending =
      pl.coverage.status !== "complete" ||
      pl.vacuous ||
      (pl.clientSide || []).length > 0;
    return (
      name.toLowerCase().includes(String(queryState[0]).trim().toLowerCase()) &&
      (verdictState[0] === "all" || pl.verdict === verdictState[0]) &&
      (certaintyState[0] === "all" ||
        pl.findings.some(function (f) {
          return f.certainty === certaintyState[0];
        })) &&
      (pendingState[0] === "all" ||
        (pendingState[0] === "pending" ? pending : !pending)) &&
      (!risksState[0] || (comparable && risks[name]))
    );
  });
  var s = report.summary || {};
  function select(label, state, options) {
    return h(
      "select",
      {
        "aria-label": label,
        value: state[0],
        style: styles.btn,
        onChange: function (event) {
          state[1](event.target.value);
        },
      },
      options.map(function (option) {
        return h("option", { key: option[0], value: option[0] }, option[1]);
      }),
    );
  }
  return h(
    "div",
    { className: "compat-page" },
    h(
      Card,
      { className: "compat-primary", "aria-label": "兼容性体检结果" },
      h(
        "div",
        { className: "compat-heading" },
        h("h2", { className: "compat-title" }, "兼容性检查"),
        h(
          "span",
          { className: "compat-subtitle" },
          `${names.length} 个已安装插件`,
        ),
        h(
          Button,
          {
            variant: "default",
            type: "button",
            onClick: () => p.onReload(),
            style: { marginLeft: "auto" },
          },
          "重新检查",
        ),
      ),
      h(
        "div",
        { className: "compat-metrics", "aria-label": "兼容性摘要" },
        ...[
          ["broken", "不兼容"],
          ["partial", "部分可用"],
          ["unknown", "未知"],
          ["ok", "可用"],
        ].map(([key, label]) =>
          h(
            "div",
            { key },
            h("strong", null, s[key] || 0),
            h(StatusBadge, { tone: key }, label),
          ),
        ),
      ),
      s.vacuousOk
        ? h(
            "p",
            { className: "compat-meta" },
            `${s.vacuousOk} 个“可用”没有已验证调用；未发现冲突不等于业务通过。`,
          )
        : null,
      h(ReportMeta, { data: data }),
      h(Badge, { baseline: data.baseline }),
      h(
        "div",
        { className: "compat-toolbar" },
        h("input", {
          "aria-label": "搜索插件",
          placeholder: "搜索插件名称",
          value: queryState[0],
          style: mergeStyle(styles.btn, { minWidth: "150px" }),
          onChange: function (event) {
            queryState[1](event.target.value);
          },
        }),
        select("按结论筛选", verdictState, [
          ["all", "全部结论"],
          ["broken", "不兼容"],
          ["partial", "部分可用"],
          ["unknown", "未知"],
          ["ok", "可用"],
        ]),
        select("按确定性筛选", certaintyState, [
          ["all", "全部确定性"],
          ["certain", "含确定发现"],
          ["suspected", "含疑似发现"],
        ]),
        select("按验证状态筛选", pendingState, [
          ["all", "全部验证状态"],
          ["pending", "有待验证部分"],
          ["complete", "无待验证部分"],
        ]),
        h(
          "button",
          {
            type: "button",
            style: styles.btn,
            "aria-pressed": risksState[0],
            onClick: function () {
              risksState[1](!risksState[0]);
            },
          },
          "本次新增风险",
        ),
        h(
          "button",
          {
            type: "button",
            style: styles.btn,
            onClick: function () {
              queryState[1]("");
              verdictState[1]("all");
              certaintyState[1]("all");
              pendingState[1]("all");
              risksState[1](false);
            },
          },
          "清除筛选",
        ),
      ),
      risksState[0]
        ? h(
            "div",
            { role: "status", style: styles.note },
            comparable
              ? "仅显示基线差分中的新增或变重风险；无变化不表示业务通过。"
              : "尚无可比较基线；本视图不能判断新增风险，不表示没有风险。",
          )
        : null,
      h(
        "div",
        { style: styles.meta },
        "显示 " +
          shown.length +
          " / " +
          names.length +
          " 个插件；筛选仅改变呈现。",
      ),
      !shown.length
        ? h(
            "div",
            { role: "status", style: styles.note },
            "没有符合筛选条件的插件。清除筛选可查看完整报告。",
          )
        : null,
      h(
        "div",
        { style: { overflowX: "auto" } },
        h(
          "table",
          { className: "compat-results", "aria-label": "插件兼容性结果" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", { style: styles.th }, "插件"),
              h("th", { style: styles.th }, "结论"),
              h("th", { style: styles.th }, "发现与核实"),
            ),
          ),
          h(
            "tbody",
            null,
            shown.map(function (n) {
              var pl = report.plugins[n],
                v = VERDICT[pl.verdict] || VERDICT.unknown;
              return h(
                "tr",
                { key: n, "data-compat-plugin": n },
                h(
                  "td",
                  { style: styles.td },
                  h("div", null, n),
                  h(
                    "div",
                    { style: styles.mono },
                    "@" +
                      (pl.version || "?") +
                      (pl.vacuous ? " · 无已验证调用" : ""),
                  ),
                ),
                h(
                  "td",
                  { style: styles.td },
                  h(StatusBadge, { tone: pl.verdict }, v.text),
                ),
                h(
                  "td",
                  { style: styles.td },
                  h(Coverage, { plugin: pl }),
                  h(
                    "details",
                    null,
                    h(
                      "summary",
                      { style: { cursor: "pointer", marginTop: "6px" } },
                      "查看 " + pl.findings.length + " 条发现与未验证项",
                    ),
                    h(Findings, {
                      plugin: pl,
                      hideCoverage: true,
                    }),
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    ),
    h(
      "div",
      { className: "compat-auxiliary", "aria-label": "辅助工具与证据" },
      h(Card, { className: "p-4" }, h(ReportPreview, { data: data })),
      h(UpgradePreview, { data: data }),
      h(DependencyPanel, { graph: report.dependencyGraph }),
      h(FindingReviewPanel, {
        report: report,
        reviews: data.reviews,
        onSave: saveFindingReview,
      }),
      h(FunctionalHealthPanel, { report: report }),
    ),
    h(EvidenceLegend),
    h(
      "div",
      { style: styles.note },
      "工具版本：" +
        (data.toolVersion || "未知") +
        " · " +
        (report.hasRuntimeSurface
          ? "方法级证据含宿主运行时观测；以每条发现为准。"
          : "方法级证据来自官方 API 契约目录，静态事实单独判定。"),
    ),
    h(
      "details",
      null,
      h("summary", { style: styles.meta }, "查看采样与检查信息"),
      h(
        "div",
        { style: styles.note },
        ((report.observation && report.observation.notes) || []).join("；"),
      ),
      h(
        "div",
        { style: styles.note },
        "对象来源：" +
          (data.nodeModulesWhy || "未提供") +
          (data.elapsedMs !== undefined
            ? " · 耗时 " + data.elapsedMs + "ms"
            : ""),
      ),
    ),
  );
}

function Panel() {
  var st = useCompatibility();
  var value = st.value;
  mark({
    state: value.phase,
    renders: ((window.__COMPAT_CHECK__ || {}).renders || 0) + 1,
    // 验收要能断言"角标真的按差分管了"，所以把它的状态一起标出来
    badgeShow: Boolean(
      value.data &&
        value.data.baseline &&
        value.data.baseline.badge &&
        value.data.baseline.badge.show,
    ),
    badgeText:
      (value.data &&
        value.data.baseline &&
        value.data.baseline.badge &&
        value.data.baseline.badge.text) ||
      null,
  });

  if (value.phase === "loading") {
    return h(
      "div",
      { style: styles.root },
      h("div", { style: styles.hint }, "正在体检已装插件……"),
    );
  }
  if (value.phase === "error") {
    return h(
      "div",
      { style: styles.root },
      h(
        "div",
        { style: styles.err },
        h(
          "div",
          { style: { fontWeight: 600, marginBottom: "4px" } },
          "拿不到体检结果",
        ),
        h("div", null, value.error),
        h(
          "div",
          { style: { marginTop: "6px", opacity: 0.75 } },
          "这一条是工具本身的问题，不是插件的结论 —— 请不要据此判断兼容性。",
        ),
      ),
      h(
        "button",
        {
          style: styles.btn,
          type: "button",
          onClick: function () {
            st.reload(true);
          },
        },
        "重试",
      ),
    );
  }
  var data = value.data;
  if (!data || data.ok === false) {
    return h(
      "div",
      { style: styles.root },
      h(
        "div",
        { style: styles.err },
        h(
          "div",
          { style: { fontWeight: 600, marginBottom: "4px" } },
          "体检没跑成",
        ),
        h("div", null, (data && data.error) || "未知原因"),
      ),
    );
  }
  return h(Table, {
    data: data,
    onReload: function () {
      st.reload(true);
    },
  });
}

function apply(ctx) {
  console.log("[dsh-plugin-compat-check] CLIENT-HALF-APPLIED");
  // 最外层 try：注册失败也**绝不能**把客户端启动带崩 ——
  // 那正好是本工具要检测的那类故障（健康检查插件自己制造故障）。
  try {
    registerSlot(
      ctx,
      SLOT,
      { name: SLOT, id: "dsh-plugin-compat-check", order: 1, label: LABEL },
      Panel,
      "tab",
    );
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
    registerSlot(
      ctx,
      SLOT_DETAIL,
      { name: SLOT_DETAIL, id: "dsh-plugin-compat-check/detail", order: 1 },
      DetailSection,
      "detail",
    );
    registerSlot(
      ctx,
      SLOT_DETAIL_BADGE,
      {
        name: SLOT_DETAIL_BADGE,
        id: "dsh-plugin-compat-check/detail-badge",
        order: 1,
      },
      DetailBadge,
      "detail-badge",
    );
  } catch (error) {
    console.warn(
      "[dsh-plugin-compat-check] REGISTER-THREW (outer) " + String(error),
    );
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
      return ctx.slots.register(spec, function ThemedSlot(props) {
        return h(Scope, { inline: tag === "detail-badge" }, h(Comp, props));
      });
    });
    registered.push(slot);
    console.log("[dsh-plugin-compat-check] REGISTERED " + slot);
  } catch (error) {
    console.warn(
      "[dsh-plugin-compat-check] REGISTER-THREW " + slot + " " + String(error),
    );
  }
  mark({ registered: registered.slice() });
}

export { apply };
export const name = "dsh-plugin-compat-check";
export const inject = ["slots"];
