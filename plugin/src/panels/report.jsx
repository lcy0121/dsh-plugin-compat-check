import { HistoryTools } from "./history.jsx";
/** Ordinary report layout, filters, export and auxiliary panels. */
import * as React from "react";
import {
  h,
  useMemo,
  styles,
  mergeStyle,
  VERDICT,
  Coverage,
  EvidenceLegend,
  FindingDisclosure,
} from "../components/report-common.jsx";
import {
  Card,
  Button,
  Separator,
  Alert,
  DeferredPanel,
  Pager,
  Badge as StatusBadge,
} from "../components/ui/index.jsx";
import { catalogLines } from "../../../lib/contracts.mjs";
import { UpgradePreview } from "./upgrade.jsx";
export function createReportPanels({
  ReviewContract,
  DependencyPanel,
  FindingReviewPanel,
  FunctionalHealthPanel,
  Badge,
}) {
  const ReportContract = { catalogLines };
  function ReportPreview(p) {
    var shown = React.useState(false),
      copied = React.useState("");
    var text =
      typeof p.data.issueReport === "string" ? p.data.issueReport : null;
    return h(
      "div",
      null,
      h("h3", null, "故障报告"),
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
              { style: styles.paragraph },
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
                  h(
                    "span",
                    { role: "status", style: styles.annotation },
                    copied[0],
                  ),
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
      { className: "compat-meta compat-report-meta" },
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
              d.report.catalog?.warning ||
                "API目录身份未提供，目标版本未认证。",
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
    const [pagination, setPagination] = React.useState(null);
    const [reviewFocus, setReviewFocus] = React.useState(null);
    const [mainFocus, setMainFocus] = React.useState(null);
    const sequence = React.useRef(0);
    const reviewIndex = useMemo(() => {
      const byPlugin = new Map(),
        byId = new Map();
      if (
        ReviewContract.validateReviewEnvelope(data?.reviews, report) &&
        !data.reviews.error
      ) {
        for (const item of data.reviews.items) {
          if (!byPlugin.has(item.pluginName))
            byPlugin.set(item.pluginName, new Map());
          byPlugin.get(item.pluginName).set(item.findingIndex, item);
          byId.set(item.findingId, item);
        }
      }
      return { byPlugin, byId, token: data?.reviews?.contextToken };
    }, [report, data?.reviews]);
    const names = useMemo(
      () =>
        Object.keys(report?.plugins || {}).sort((a, b) => {
          const rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
          return (
            rank[report.plugins[a].verdict] - rank[report.plugins[b].verdict] ||
            a.localeCompare(b)
          );
        }),
      [report],
    );
    const diff = data?.baseline?.diff;
    const comparable = Boolean(diff?.comparable);
    const risks = useMemo(() => {
      const result = new Set();
      if (comparable) {
        for (const entry of diff.worsened || []) result.add(entry.name);
        for (const entry of diff.added || [])
          if (report?.plugins[entry.name]?.findings.length)
            result.add(entry.name);
      }
      return result;
    }, [diff, report, comparable]);
    const filterKey = JSON.stringify([
      queryState[0],
      verdictState[0],
      certaintyState[0],
      pendingState[0],
      risksState[0],
    ]);
    const shown = useMemo(() => {
      const query = String(queryState[0]).trim().toLowerCase();
      return names.filter((name) => {
        const pl = report.plugins[name];
        const pending =
          pl.coverage.status !== "complete" ||
          pl.vacuous ||
          (pl.clientSide || []).length > 0;
        return (
          name.toLowerCase().includes(query) &&
          (verdictState[0] === "all" || pl.verdict === verdictState[0]) &&
          (certaintyState[0] === "all" ||
            pl.findings.some((f) => f.certainty === certaintyState[0])) &&
          (pendingState[0] === "all" ||
            (pendingState[0] === "pending" ? pending : !pending)) &&
          (!risksState[0] || (comparable && risks.has(name)))
        );
      });
    }, [names, report, filterKey, risks, comparable]);
    const pageSize = 50;
    const page =
      pagination?.report === report && pagination?.filterKey === filterKey
        ? Math.min(
            pagination.page,
            Math.max(0, Math.ceil(shown.length / pageSize) - 1),
          )
        : 0;
    const visible = shown.slice(page * pageSize, (page + 1) * pageSize);
    if (!report) return null;
    const locateMain = (token, id) => {
      if (token !== reviewIndex.token) return;
      const item = reviewIndex.byId.get(id);
      if (!item) return;
      queryState[1]("");
      verdictState[1]("all");
      certaintyState[1]("all");
      pendingState[1]("all");
      risksState[1](false);
      setPagination({
        report,
        filterKey: JSON.stringify(["", "all", "all", "all", false]),
        page: Math.floor(names.indexOf(item.pluginName) / pageSize),
      });
      setMainFocus({
        contextToken: token,
        findingId: id,
        nonce: ++sequence.current,
      });
    };
    var s = report.summary || {};
    function select(label, state, options) {
      return h(
        "select",
        {
          "aria-label": label,
          value: state[0],
          style: styles.btn,
          onChange: function (event) {
            setPagination(null);
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
              { className: "compat-coverage-note" },
              `${s.vacuousOk} 个“可用”没有已验证调用；未发现冲突不等于业务通过。`,
            )
          : null,
        h(
          "div",
          { className: "compat-report-context" },
          h(ReportMeta, { data: data }),
          h(Badge, { baseline: data.baseline }),
        ),
        h(Separator, { className: "compat-section-divider" }),
        h(
          "div",
          { className: "compat-toolbar" },
          h("input", {
            "aria-label": "搜索插件",
            placeholder: "搜索插件名称",
            value: queryState[0],
            style: mergeStyle(styles.btn, { minWidth: "150px" }),
            onChange: function (event) {
              setPagination(null);
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
                setPagination(null);
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
                setPagination(null);
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
              { role: "status", style: styles.paragraph },
              comparable
                ? "仅显示基线差分中的新增或变重风险；无变化不表示业务通过。"
                : "尚无可比较基线；本视图不能判断新增风险，不表示没有风险。",
            )
          : null,
        h(
          "div",
          { style: styles.annotation },
          "显示 " +
            shown.length +
            " / " +
            names.length +
            " 个插件；筛选仅改变呈现。",
        ),
        !shown.length
          ? h(
              "div",
              { role: "status", style: styles.paragraph },
              "没有符合筛选条件的插件。清除筛选可查看完整报告。",
            )
          : null,
        h(Separator, { className: "compat-results-divider" }),
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
              visible.map(function (n) {
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
                    h(FindingDisclosure, {
                      plugin: pl,
                      reviewItems: reviewIndex.byPlugin.get(n),
                      reviewContext: reviewIndex.token,
                      onReview: (item) =>
                        setReviewFocus({
                          contextToken: reviewIndex.token,
                          findingId: item.findingId,
                          nonce: ++sequence.current,
                        }),
                      focus:
                        mainFocus &&
                        mainFocus.contextToken === reviewIndex.token &&
                        reviewIndex.byId.get(mainFocus.findingId)
                          ?.pluginName === n
                          ? mainFocus
                          : null,
                      focusIndex: reviewIndex.byId.get(mainFocus?.findingId)
                        ?.findingIndex,
                    }),
                  ),
                );
              }),
            ),
          ),
        ),
        h(Pager, {
          page,
          total: shown.length,
          pageSize,
          label: "插件兼容性结果",
          onPageChange: (next) =>
            setPagination({ report, filterKey, page: next }),
        }),
      ),
      h(
        "div",
        { className: "compat-auxiliary", "aria-label": "辅助工具与证据" },
        h(Card, { className: "p-4" }, h(ReportPreview, { data: data })),
        h(
          Card,
          { "aria-label": "升级前兼容性预检" },
          h(UpgradePreview, { data: data }),
        ),
        h(
          DeferredPanel,
          { title: "依赖关系与潜在影响", label: "依赖关系与潜在影响" },
          () => h(DependencyPanel, { graph: report.dependencyGraph }),
        ),
        h(
          DeferredPanel,
          {
            title: "发现的人工处置",
            label: "发现的人工处置",
            active:
              reviewFocus &&
              reviewFocus.contextToken === reviewIndex.token &&
              reviewIndex.byId.has(reviewFocus?.findingId),
          },
          () =>
            h(FindingReviewPanel, {
              report: report,
              reviews: data.reviews,
              onSave: saveFindingReview,
              focus:
                reviewFocus?.contextToken === reviewIndex.token
                  ? reviewFocus
                  : null,
              onLocateMain: locateMain,
            }),
        ),
        h(HistoryTools, { data }),
        h(
          DeferredPanel,
          { title: "功能健康检查（独立实测记录）", label: "功能健康检查" },
          () => h(FunctionalHealthPanel, { report: report }),
        ),
      ),
      h(
        Card,
        {
          className: "compat-report-information",
          "aria-label": "报告说明与检查信息",
        },
        h("h3", null, "报告说明与检查信息"),
        h(EvidenceLegend),
        h(
          "div",
          { style: styles.annotationParagraph },
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
          h("summary", { style: styles.annotation }, "查看采样与检查信息"),
          h(
            "div",
            { style: styles.annotationParagraph },
            ((report.observation && report.observation.notes) || []).join("；"),
          ),
          h(
            "div",
            { style: styles.annotationParagraph },
            "对象来源：" +
              (data.nodeModulesWhy || "未提供") +
              (data.elapsedMs !== undefined
                ? " · 耗时 " + data.elapsedMs + "ms"
                : ""),
          ),
        ),
      ),
    );
  }
  return { Table };
}
