// Client half of dsh-plugin-compat-check — the overview table (Plan.md §5 C2).
//
// This file is a PREBUILT artifact: the host does not build plugin client code.
// If it moves to src/ the entry fails to activate with "run pnpm build before
// launch", so it stays here as plain, dependency-free JS.
//
// Contract (Plan.md §7.3, verified on 0.2.0-rc.2):
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

    var React = require("react");

    var SLOT = "settings.plugins.tab";
    var LABEL = "兼容性";
    var ROUTE = "/plugin-compat-check/report";

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
    };

    // 渲染侧标记：只在我们的组件体里设置。页面上出现同名文字**不能**证明
    // 是我们渲染的，这个标记能 —— 验收要经得起这个追问（Plan.md §7.2.1 ③）。
    function mark(extra) {
      try {
        window.__COMPAT_CHECK__ = Object.assign(
          { slot: SLOT, label: LABEL },
          window.__COMPAT_CHECK__ || {},
          extra,
          { at: Date.now() },
        );
      } catch (error) {
        /* 诊断绝不影响渲染 */
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
          f.impact ? React.createElement("div", { style: styles.dim }, f.impact) : null);
      }));
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
          report.hasRuntimeSurface
            ? "方法级判定依据：宿主运行时面（确定）。"
            : "方法级判定依据：官方 API 目录（契约目录，不是运行时面）—— 因此方法级结论标为「疑似」。"
              + "「疑似」不是缺陷，是诚实：判不准时降级标注，而不是升格成确定。"),
        React.createElement("div", { style: styles.note },
          "判定内核：" + (data.kernelDir || "?")
          + " · 体检对象：" + (data.nodeModules || "?") + "（" + (data.nodeModulesWhy || "?") + "）"
          + (data.elapsedMs !== undefined ? " · 耗时 " + data.elapsedMs + "ms" : "")));
    }

    function Panel() {
      var st = useCompatibility();
      var value = st.value;
      mark({ state: value.phase, renders: ((window.__COMPAT_CHECK__ || {}).renders || 0) + 1 });

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
      try {
        ctx.slots.inject(SLOT, function () {
          return ctx.slots.register(
            { name: SLOT, id: "dsh-plugin-compat-check", order: 1, label: LABEL },
            Panel,
          );
        });
        console.log("[dsh-plugin-compat-check] REGISTERED " + SLOT);
      } catch (error) {
        // 注册失败也不能把客户端启动带崩 —— 那正好是本工具要检测的那类故障。
        console.warn("[dsh-plugin-compat-check] REGISTER-THREW " + String(error));
      }
    }

    exports.name = "dsh-plugin-compat-check";
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
