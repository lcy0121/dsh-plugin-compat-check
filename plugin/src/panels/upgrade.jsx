/** Explicit static upgrade comparison, isolated from ordinary report state. */
import * as React from "react";
import {
  h,
  useMemo,
  styles,
  Findings,
  Coverage,
  PagedList,
} from "../components/report-common.jsx";
import { Fold } from "../components/ui/index.jsx";
import {
  assertUpgradePreview,
  SUPPORTED_PREVIEW_VERSIONS,
} from "../../../lib/upgrade-contract.mjs";
const UpgradeContract = { assertUpgradePreview, SUPPORTED_PREVIEW_VERSIONS };
function UpgradeReportBody({ report, label }) {
  const names = useMemo(() => Object.keys(report.plugins), [report.plugins]);
  return h(PagedList, {
    items: names,
    label: label + "插件",
    renderItem: function (name) {
      const pl = report.plugins[name];
      return h(
        "div",
        { key: name, "data-upgrade-plugin": name, style: { margin: "8px 0" } },
        h(
          Fold,
          {
            title:
              name +
              "@" +
              (pl.version || "?") +
              " · " +
              pl.verdict +
              (pl.vacuous ? " · 无已验证调用" : "") +
              " · 发现 " +
              pl.findings.length,
            framed: false,
          },
          () =>
            h(Findings, {
              plugin: pl,
              hideCoverage: true,
              label: label + " " + name + "发现",
            }),
        ),
        h(Coverage, { plugin: pl }),
      );
    },
  });
}

function UpgradeDetails(p) {
  const r = p.result;
  if (!r.ok) return h("div", { role: "status", style: styles.err }, r.error);
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
          { style: styles.paragraph },
          "本次没有发现新增或变重的静态风险；目标版本仍可能有原有风险，不等于业务通过。",
        )
      : null,
    [
      ["added", "新增"],
      ["worsened", "变重"],
      ["resolved", "消失"],
      ["improved", "减轻"],
      ["unchanged", "不变"],
    ].map(([key, label]) =>
      r.changes[key].length
        ? h(
            Fold,
            {
              key,
              title: label + "（" + r.changes[key].length + "）",
              defaultOpen: key === "added" || key === "worsened",
              framed: false,
            },
            () =>
              h(PagedList, {
                items: r.changes[key],
                label: label + "风险",
                renderItem: function (entry, i) {
                  const f = entry.finding || entry.after;
                  return h(
                    "div",
                    {
                      key: i,
                      "data-upgrade-change": key,
                      style: { margin: "8px 0" },
                    },
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
                          { style: styles.body },
                          "此前：" +
                            entry.before.severity +
                            " / " +
                            entry.before.certainty +
                            " / " +
                            entry.before.impactBasis,
                        )
                      : null,
                    h("div", null, f.impact),
                    h("div", { style: styles.body }, f.basis),
                  );
                },
              }),
          )
        : null,
    ),
    ["currentReport", "targetReport"].map((side) => {
      const report = r[side],
        s = report.summary,
        label = side === "currentReport" ? "当前版本" : "目标版本";
      return h(
        Fold,
        {
          key: side,
          framed: false,
          title:
            label +
            "静态结果 " +
            report.dshVersion +
            " · 不兼容 " +
            s.broken +
            " · 部分可用 " +
            s.partial +
            " · 未知 " +
            s.unknown,
        },
        () => h(UpgradeReportBody, { report, label }),
      );
    }),
    h(Fold, { framed: false, title: "查看输入制品、目录来源与预测限制" }, () =>
      h(
        "div",
        null,
        h("div", { style: styles.mono }, "输入 SHA-256：" + r.artifact.sha256),
        h(PagedList, {
          items: r.artifact.packages,
          label: "输入制品",
          renderItem: (item, i) =>
            h(
              "div",
              { key: i, style: styles.mono },
              item.name +
                "@" +
                (item.version || "?") +
                " SHA-256：" +
                item.sha256,
            ),
        }),
        ["current", "target"].map((side) => {
          const c = r.catalogs[side];
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
        r.limitations.map((note, i) =>
          h("div", { key: i, style: styles.paragraph }, note),
        ),
      ),
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
    { "data-upgrade-preview": true, heading: true, keepMounted: true },
    h("summary", { style: { cursor: "pointer" } }, "升级前兼容性预检（静态）"),
    h(
      "p",
      { style: styles.paragraph },
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
export { UpgradePreview };
