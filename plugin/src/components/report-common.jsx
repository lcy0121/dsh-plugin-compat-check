/** Shared report typography and bounded finding presentation. */
import * as React from "react";
import { ui, Pager, Fold, Badge as StatusBadge } from "./ui/index.jsx";
import { nextSteps } from "../../../lib/finding-guidance.mjs";
const FindingGuidance = { nextSteps };
const h = (type, props, ...children) =>
  React.createElement(ui[type] || type, props, ...children);

const useMemo = React.useMemo || ((compute) => compute());

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

var styles = {
  root: { minWidth: 0 },
  head: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
    marginBottom: "10px",
  },
  title: { fontSize: "var(--dsc-font-heading)", fontWeight: 600 },
  annotation: {
    color: "hsl(var(--dsc-muted-foreground))",
    fontSize: "var(--dsc-font-body)",
  },
  annotationParagraph: {
    color: "hsl(var(--dsc-muted-foreground))",
    fontSize: "var(--dsc-font-body)",
    marginTop: "10px",
  },
  btn: {},
  table: {},
  th: {},
  td: {},
  mono: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: "var(--dsc-font-body)",
    overflowWrap: "anywhere",
  },
  pill: {},
  paragraph: {
    color: "hsl(var(--dsc-foreground))",
    fontSize: "var(--dsc-font-body)",
    marginTop: "10px",
  },
  err: {
    padding: "12px",
    border: "1px solid #dc262640",
    borderRadius: "8px",
    background: "#dc262608",
    fontSize: "var(--dsc-font-body)",
  },
  hint: { color: "hsl(var(--dsc-muted-foreground))", padding: "12px 0" },
  finding: {
    marginTop: "12px",
    paddingTop: "10px",
    borderTop: "1px solid hsl(var(--dsc-border))",
  },
  evidence: {
    color: "hsl(var(--dsc-foreground))",
    fontSize: "var(--dsc-font-body)",
  },
  body: {
    color: "hsl(var(--dsc-foreground))",
    fontSize: "var(--dsc-font-body)",
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
    { style: styles.body },
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
    { style: styles.paragraph },
    "确定（certain）可由明确静态事实或合格运行时观测支持；疑似（suspected）表示当前证据不足以确定该条发现。",
    "影响依据：实测（measured）须有对应观测，推断（inferred）不等于业务影响已实测。",
    "未观测不等于缺失；没有已验证调用仍可能存在服务依赖或客户端功能；调用核验和覆盖完整均不等于业务验收通过。",
  );
}

function PagedList({ items, label, renderItem, focusIndex, focus }) {
  const completed = React.useRef(null);
  const [selection, setSelection] = React.useState(null);
  const page =
    selection?.items === items
      ? Math.min(selection.page, Math.max(0, Math.ceil(items.length / 50) - 1))
      : 0;
  React.useEffect(() => {
    if (
      !focus ||
      completed.current === focus.nonce ||
      !Number.isInteger(focusIndex) ||
      focusIndex < 0 ||
      focusIndex >= items.length
    )
      return;
    const targetPage = Math.floor(focusIndex / 50);
    if (page !== targetPage) {
      setSelection({ items, page: targetPage });
      return;
    }
    const node = Array.from(
      globalThis.document?.querySelectorAll?.("[data-finding-id]") || [],
    ).find(
      (node) =>
        node.dataset.findingId === focus.findingId &&
        node.dataset.findingContext === focus.contextToken,
    );
    node?.scrollIntoView?.({ block: "center" });
    node?.focus?.({ preventScroll: true });
    completed.current = focus.nonce;
  }, [focus?.nonce, page, items]);
  const start = page * 50;
  return h(
    "div",
    { "data-paged-list": label },
    items
      .slice(start, start + 50)
      .map((item, i) => renderItem(item, start + i)),
    h(Pager, {
      page,
      total: items.length,
      label,
      onPageChange: (next) => setSelection({ items, page: next }),
    }),
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
          { key: "v", style: styles.evidence },
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
          { key: "n", style: styles.body },
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
          { key: "c", style: styles.body },
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
    h(PagedList, {
      items: pl.findings,
      label: p.label || "插件发现",
      focus: p.focus,
      focusIndex: p.focusIndex,
      renderItem: function (f, i) {
        var api = f.service
          ? f.method
            ? f.service + "." + f.method
            : f.service
          : "(包声明)";
        var loc = f.location ? f.location.file + ":" + f.location.line : "—";
        return h(
          "div",
          {
            key: i,
            style: styles.finding,
            "data-compat-finding": i + 1,
            tabIndex: p.reviewItems?.has(i) ? -1 : undefined,
            "data-finding-id": p.reviewItems?.get(i)?.findingId,
            "data-finding-context": p.reviewContext,
          },
          p.reviewItems?.has(i)
            ? h(
                "button",
                {
                  type: "button",
                  "data-review-link": p.reviewItems.get(i).findingId,
                  onClick: () => p.onReview(p.reviewItems.get(i)),
                },
                "核实与人工处置",
              )
            : null,
          h(Sev, { severity: f.severity }),
          h("span", null, " " + (CATEGORY[f.category] || f.category) + " "),
          h("code", { style: styles.mono }, api),
          h("span", { style: styles.mono }, " @ " + loc),
          h(
            "span",
            {
              style: styles.evidence,
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
                { style: styles.body },
                (f.impactBasis === "measured"
                  ? "影响（实测）："
                  : f.impactBasis === "inferred"
                    ? "影响（推断，非实测）："
                    : "影响（依据未提供）：") + f.impact,
              )
            : null,
          f.basis ? h("div", { style: styles.body }, "依据：" + f.basis) : null,
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
      },
    }),
  );
}
function FindingDisclosure({ plugin, focus, ...props }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    if (focus) setOpen(true);
  }, [focus?.nonce]);
  return h(
    Fold,
    {
      title: "查看 " + plugin.findings.length + " 条发现与未验证项",
      framed: false,
      open,
      onOpenChange: setOpen,
    },
    () => h(Findings, { ...props, plugin, focus, hideCoverage: true }),
  );
}
export {
  FindingDisclosure,
  h,
  useMemo,
  VERDICT,
  SEVERITY,
  CATEGORY,
  mergeStyle,
  styles,
  Sev,
  Coverage,
  EvidenceLegend,
  PagedList,
  Findings,
};
