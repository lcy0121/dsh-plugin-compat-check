import {
  baselineText,
  evidenceNote,
  baselineDetail,
  baselineBadge,
} from "./i18n/presentation.mjs";
import { useLocale } from "./i18n/locale.jsx";
import { t, builtin } from "./i18n/runtime.mjs";
import {
  h,
  styles,
  VERDICT,
  CATEGORY,
  mergeStyle,
  Findings,
  EvidenceLegend,
} from "./components/report-common.jsx";
import { createReportPanels } from "./panels/report.jsx";
import * as React from "react";
import { createReportStore } from "./report-store.mjs";
import { assertEnvelope, catalogLines } from "../../lib/contracts.mjs";
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
import { ui, Badge as StatusBadge, Scope } from "./components/ui/index.jsx";
const ReportContract = { assertEnvelope, catalogLines };

const DependencyGraphContract = { validateDependencyGraph };
const FindingReviewContract = {
  categoryLabel: (value) => builtin(CATEGORY[value]) || value,
  REVIEW_STATUS_LABELS,
  REVIEW_LIMITS,
  validateReviewInput,
  validateReviewEnvelope,
};
const FunctionalHealthContract = {
  validateFunctionalHealthResult,
  canonicalFunctionalManifest,
};

const memo = (component) =>
  (React.memo || ((value) => value))(function LocalizedPanel(props) {
    useLocale();
    return component(props);
  });

var DependencyPanel = memo(
  WorkflowPanelFactory.createDependencyPanel(
    React,
    DependencyGraphContract,
    ui,
  ),
);
var FindingReviewPanel = memo(
  WorkflowPanelFactory.createFindingReviewPanel(
    React,
    FindingReviewContract,
    ui,
  ),
);
var FunctionalHealthPanel = memo(
  WorkflowPanelFactory.createFunctionalHealthPanel(
    React,
    FunctionalHealthContract,
    ui,
  ),
);

const { Table } = createReportPanels({
  ReviewContract: FindingReviewContract,
  DependencyPanel,
  FindingReviewPanel,
  FunctionalHealthPanel,
  Badge,
});
var SLOT = "settings.plugins.tab";
var LABEL = t("兼容性");
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
      t(
        "无法读取体检报告：报告格式或版本不受支持，请刷新页面并确认宿主与插件版本一致。",
      ),
    );
  }
}

const reportStore = createReportStore({ validate: acceptPayload });
function useCompatibility(active = true, route = ROUTE) {
  const entry = reportStore.target(route);
  const state = React.useState({ route, value: entry.snapshot() });
  const subscription = React.useRef(null);
  React.useEffect(() => {
    const current = reportStore.target(route);
    const handle = current.subscribe((value) => state[1]({ route, value }), {
      visible: active,
    });
    subscription.current = handle;
    return () => {
      handle.unsubscribe();
      if (subscription.current === handle) subscription.current = null;
    };
  }, [route]);
  React.useEffect(() => {
    subscription.current?.setVisible(active);
  }, [active]);
  const reload = React.useCallback(
    (force = true) => reportStore.target(route).refresh(force),
    [route],
  );
  return {
    value: state[0].route === route ? state[0].value : entry.snapshot(),
    reload,
  };
}

// Presentation-only pages retain the full canonical arrays for export and counts.

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
    hit = byPkg(subj.id, t("subject.id=包名"));
    if (hit) return hit;
    hit = lookupLedger(report, subj.id);
    if (hit) return hit;
  }
  if (props && typeof props === "object") {
    var hit2 = byPkg(props.id, t("props.id=包名"));
    if (hit2) return hit2;
    hit2 = lookupLedger(report, props.id);
    if (hit2) return hit2;
    if (props.view) {
      hit2 = byPkg(SELF_ITEM_ID, t("自家条目 id"));
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
        how: t("台账条目 {p0} → {p1}", { p0: id, p1: pkg }),
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
function usePluginState(props) {
  return useCompatibility(props?.reportVisible !== false);
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
        style: mergeStyle(styles.body, {
          marginTop: 0,
          marginBottom: "8px",
        }),
      },
      baselineText(b.note),
    );
  }
  if (b.error) {
    return h(
      "div",
      { style: styles.body },
      t("基线差分没算成：{p0}", { p0: b.error }),
    );
  }
  var badge = b.badge || {};
  if (!badge.show) {
    return h(
      "div",
      {
        style: mergeStyle(styles.body, {
          marginTop: 0,
          marginBottom: "8px",
        }),
      },
      baselineDetail(b) || t("与上次相比没有任何变化"),
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
        evidenceNote(e.reason),
    );
    (e.newFindings || []).forEach(function (f) {
      lines.push(
        t("    新增：{p0} @ {p1}", { p0: f.key, p1: f.location || "—" }),
      );
    });
  });
  (diff.improved || []).forEach(function (e) {
    lines.push("↑ " + e.name + "：" + evidenceNote(e.reason));
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
      baselineBadge(b),
    ),
    diff.dshVersionChanged
      ? h(
          "span",
          { style: mergeStyle(styles.body, { marginLeft: "8px" }) },
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
      t("dsh-plugin-compat-check: 渲染时出错 —— {p0}", {
        p0: String((error && error.message) || error),
      }),
    );
  }
}

function DetailSectionBody(props) {
  var st = usePluginState(props);
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
    return h("div", { style: styles.hint }, t("正在体检…"));
  }
  if (st.value.phase === "error" || !data || data.ok === false) {
    return h(
      "div",
      { style: styles.err },
      t("拿不到体检结果（这是工具的问题，不是这个插件的结论）：{p0}", {
        p0: st.value.error || (data && data.error) || t("未知原因"),
      }),
    );
  }
  if (!hit) {
    // 找不到对应项**也要说明**，而不是渲染一个空白 ——
    // 空白会被读成"这个插件没问题"，而它其实是"我们没算出来"。
    return h(
      "div",
      { style: styles.body },
      t(
        "这个插件不在本次体检范围内（可能它不是带 dsh 清单的社区插件，或它的条目用了别的键名）。请以「兼容性」总览页为准。",
        {},
      ),
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
        { style: styles.annotation },
        t("dsh-plugin-compat-check · {p0} 条发现", {
          p0: (pl.findings || []).length,
        }),
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
        t("重新检查"),
      ),
    ),
    h(Findings, { plugin: pl }),
    h(EvidenceLegend),
  );
}

/** C3 · 详情页角标：一行字，放在标题行 */
function DetailBadge(props) {
  var st = usePluginState(props);
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

function Panel(props) {
  var st = useCompatibility(props?.reportVisible !== false);
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
      h("div", { style: styles.hint }, t("正在体检已装插件……")),
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
          t("拿不到体检结果"),
        ),
        h("div", null, value.error),
        h(
          "div",
          { style: { marginTop: "6px", opacity: 0.75 } },
          t("这一条是工具本身的问题，不是插件的结论 —— 请不要据此判断兼容性。"),
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
        t("重试"),
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
          t("体检没跑成"),
        ),
        h("div", null, (data && data.error) || t("未知原因")),
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
    if (typeof ctx.effect === "function")
      ctx.effect(() => () => reportStore.dispose());
    registerSlot(
      ctx,
      SLOT,
      {
        name: SLOT,
        id: "dsh-plugin-compat-check",
        order: 1,
        label: () => t("兼容性"),
      },
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
        useLocale();
        const [visible, setVisible] = React.useState(
          typeof IntersectionObserver !== "function",
        );
        const mounted = React.useRef(false);
        if (visible) mounted.current = true;
        return h(
          Scope,
          { inline: tag === "detail-badge", onVisibilityChange: setVisible },
          mounted.current
            ? h(Comp, { ...props, reportVisible: visible })
            : h("span", {
                "aria-hidden": true,
                style: { display: "inline-block", height: "1px", width: "1px" },
              }),
        );
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
