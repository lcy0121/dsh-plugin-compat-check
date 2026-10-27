/** Explicit local history controls. Closed panels never fetch or mount large records. */
import * as React from "react";
import {
  h,
  useMemo,
  styles,
  PagedList,
  Findings,
  VERDICT,
} from "../components/report-common.jsx";
import { Fold, Alert } from "../components/ui/index.jsx";
import {
  compareReportSnapshots,
  validateReportSnapshot,
  REPORT_HISTORY_LIMITS,
} from "../../../lib/report-history-contract.mjs";
import {
  validateReviewDocument,
  validateReviewEnvelope,
} from "../../../lib/finding-review.mjs";
const bytes = (n) => `${Math.ceil((n || 0) / 1024)} KiB`;
function validateResult(action, value) {
  if (!value || typeof value !== "object") throw Error("历史管理响应无效");
  if (
    [
      "snapshot-list",
      "snapshot-save",
      "snapshot-import",
      "snapshot-delete",
    ].includes(action)
  ) {
    if (
      !Array.isArray(value.items) ||
      value.items.length > 20 ||
      !value.capacity ||
      value.items.some(
        (x) =>
          !x || typeof x.label !== "string" || !/^[a-f0-9]{64}$/.test(x.id),
      )
    )
      throw Error("历史列表响应无效");
  } else if (
    [
      "review-state",
      "review-archive",
      "review-import",
      "review-delete",
    ].includes(action)
  ) {
    if (
      !value.capacity ||
      !Array.isArray(value.archives) ||
      value.archives.length > 100 ||
      value.archives.some((x) => !x || !/^[a-f0-9]{64}$/.test(x.id))
    )
      throw Error("归档列表响应无效");
  } else if (action === "snapshot-read") validateReportSnapshot(value.data);
  else if (action === "review-read" || action === "review-export")
    validateReviewDocument(
      (action === "review-read" ? value.data : value).document,
    );
  return value;
}
function useHistoryActions(data) {
  const [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState(""),
    [notice, setNotice] = React.useState("");
  const owner = React.useRef(null),
    sequence = React.useRef(0),
    pending = React.useRef(null);
  const reportIdentity = React.useRef({ report: null, sequence: 0 });
  if (reportIdentity.current.report !== data.report)
    reportIdentity.current = {
      report: data.report,
      sequence: reportIdentity.current.sequence + 1,
    };
  const reviewToken = useMemo(
    () =>
      validateReviewEnvelope(data.reviews, data.report)
        ? data.reviews?.contextToken
        : null,
    [data.reviews, data.report],
  );
  const key = JSON.stringify([
    data.nodeModules,
    reviewToken,
    reviewToken ? 0 : reportIdentity.current.sequence,
  ]);
  owner.current = key;
  React.useEffect(() => {
    sequence.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setError("");
    setNotice("");
    return () => {
      sequence.current++;
      pending.current?.abort();
      pending.current = null;
    };
  }, [key]);
  const run = async (request, onSuccess) => {
    if (busy || pending.current || owner.current !== key) return;
    const token = ++sequence.current,
      context = owner.current,
      controller = new AbortController();
    pending.current = controller;
    const timer = setTimeout(() => controller.abort(), 50000);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const results = [];
      for (const spec of Array.isArray(request) ? request : [request]) {
        const response = await fetch("/plugin-compat-check/history", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-DSH-Compat-Request": "1",
          },
          body: JSON.stringify({
            ...spec,
            computedAt: data.computedAt,
            contextToken: data.reviews?.contextToken || null,
          }),
          signal: controller.signal,
        });
        const value = await response.json();
        if (!response.ok || !value.ok)
          throw Error(value.error || "本地历史操作失败");
        results.push(validateResult(spec.action, value.result));
      }
      if (owner.current === context && sequence.current === token) {
        onSuccess?.(Array.isArray(request) ? results : results[0]);
        setNotice("操作完成；历史记录不认证当前状态。");
      }
    } catch (e) {
      if (owner.current === context && sequence.current === token)
        setError(
          e.name === "AbortError"
            ? "操作已取消或超时，请核对容量与列表后重试。"
            : e.message || "本地历史操作失败",
        );
    } finally {
      clearTimeout(timer);
      if (sequence.current === token) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  return {
    busy,
    run,
    key,
    isCurrent: () => owner.current === key,
    status: h(
      "div",
      null,
      error ? h(Alert, { role: "alert" }, error) : null,
      notice ? h("p", { role: "status" }, notice) : null,
    ),
  };
}
function ExportPreview({ value, onClose }) {
  if (!value) return null;
  return h(
    "div",
    null,
    h(
      Alert,
      null,
      "导出包含目标路径、插件、源码位置及人工依据。请核对敏感信息后再下载或分享；不会自动上传。",
    ),
    h("textarea", {
      "aria-label": "历史JSON导出预览",
      readOnly: true,
      rows: 10,
      value: JSON.stringify(value, null, 2),
      style: { width: "100%" },
    }),
    h(
      "button",
      {
        type: "button",
        onClick: () => {
          const blob = new Blob([JSON.stringify(value) + "\n"], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download =
            value.kind === "plugin-compat-check/review-archive"
              ? "compat-review-archive.json"
              : "compat-report-snapshot.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
      },
      "下载历史JSON",
    ),
    h("button", { type: "button", onClick: onClose }, "关闭导出预览"),
  );
}
function ImportFile({ session, action, onSuccess, maxBytes, label }) {
  const [error, setError] = React.useState("");
  const serial = React.useRef(0);
  React.useEffect(
    () => () => {
      serial.current++;
    },
    [session.key],
  );
  return h(
    "div",
    null,
    h(
      "label",
      null,
      label,
      h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": label,
        disabled: session.busy,
        onChange: async (event) => {
          const input = event.target,
            file = input.files?.[0],
            token = ++serial.current;
          if (!file) return;
          setError("");
          try {
            if (
              !Number.isSafeInteger(file.size) ||
              file.size < 1 ||
              file.size > maxBytes
            )
              throw Error("导入文件超过大小限制");
            const data = JSON.parse(await file.text());
            if (token !== serial.current || !session.isCurrent()) return;
            session.run({ action, data }, onSuccess);
          } catch (reason) {
            if (token === serial.current && session.isCurrent())
              setError(reason.message || "导入JSON无效");
          } finally {
            input.value = "";
          }
        },
      }),
    ),
    error ? h(Alert, { role: "alert" }, error) : null,
  );
}
function ReviewArchiveContent({ data }) {
  const session = useHistoryActions(data),
    [state, setState] = React.useState(null),
    [confirm, setConfirm] = React.useState(null),
    [view, setView] = React.useState(null),
    [exported, setExported] = React.useState(null),
    [query, setQuery] = React.useState(""),
    [copyNotice, setCopyNotice] = React.useState("");
  React.useEffect(() => {
    setState(null);
    setConfirm(null);
    setView(null);
    setExported(null);
    setCopyNotice("");
  }, [session.key]);
  const rows = useMemo(
    () =>
      view?.data.document.records.filter((r) =>
        r.pluginName.toLowerCase().includes(query.toLowerCase()),
      ) || [],
    [view, query],
  );
  const operation = (request, done) =>
    session.run(request, (result) => {
      done?.(result);
      setConfirm(null);
    });
  return h(
    "div",
    null,
    h(
      "p",
      null,
      "归档保留完整身份与依据，导入或恢复只作历史参考，不会恢复为当前“已复核”。未保存草稿留在原编辑区。",
    ),
    h(
      "button",
      {
        type: "button",
        disabled: session.busy,
        onClick: () => operation({ action: "review-state" }, setState),
      },
      "加载处置容量与归档",
    ),
    session.status,
    copyNotice ? h("p", { role: "status" }, copyNotice) : null,
    state
      ? h(
          "div",
          null,
          h(
            "p",
            null,
            `活动处置 ${state.capacity.records} / ${state.capacity.recordLimit} 条，${bytes(state.capacity.bytes)} / ${bytes(state.capacity.byteLimit)}；可归档历史 ${state.capacity.historical} 条；归档 ${state.archives.length} / ${state.archiveLimit} 份。`,
          ),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy,
              onClick: () =>
                operation({ action: "review-export" }, setExported),
            },
            "预览导出活动处置",
          ),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy || !state.capacity.historical,
              onClick: () =>
                setConfirm({
                  action: "review-archive",
                  mode: "history",
                  revision: state.revision,
                }),
            },
            "归档历史处置",
          ),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy || !state.capacity.records,
              onClick: () =>
                setConfirm({
                  action: "review-archive",
                  mode: "all",
                  revision: state.revision,
                }),
            },
            "归档全部处置",
          ),
          h(ImportFile, {
            session,
            action: "review-import",
            onSuccess: setState,
            maxBytes: 1048576 + 8192,
            label: "导入处置归档（仅参考）",
          }),
          h(PagedList, {
            items: state.archives,
            label: "处置归档",
            renderItem: (item) =>
              h(
                "article",
                { key: item.id, style: styles.finding },
                h(
                  "p",
                  null,
                  `${item.createdAt} · ${item.records} 条 · ${bytes(item.bytes)} · ${item.id}`,
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: session.busy,
                    onClick: () =>
                      operation(
                        { action: "review-read", id: item.id },
                        setView,
                      ),
                  },
                  "查看或恢复为参考",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: session.busy,
                    onClick: () =>
                      setConfirm({ action: "review-delete", id: item.id }),
                  },
                  "移除归档",
                ),
              ),
          }),
        )
      : null,
    confirm
      ? h(
          Alert,
          null,
          h(
            "p",
            null,
            confirm.action === "review-delete"
              ? "将永久移除此本地归档。请先导出可信备份；不会自动删除其他历史。"
              : confirm.mode === "all"
                ? "先保存完整归档，再清空所有已保存活动处置（包括当前状态）。当前发现将需重新核实，未保存草稿保留。"
                : "先保存完整归档，再从活动文件移走旧发现的历史处置；当前发现的已保存状态保留。",
          ),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy,
              onClick: () => operation({ ...confirm, confirm: true }, setState),
            },
            "确认归档或移除",
          ),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy,
              onClick: () => setConfirm(null),
            },
            "取消",
          ),
        )
      : null,
    view
      ? h(
          "div",
          null,
          h("h4", null, "历史处置参考（不是当前已复核）"),
          h(
            "button",
            { type: "button", onClick: () => setExported(view.data) },
            "预览导出处置归档",
          ),
          h("input", {
            "aria-label": "检索归档插件",
            placeholder: "检索归档插件",
            value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
          h(PagedList, {
            items: rows,
            label: "归档处置依据",
            renderItem: (r) =>
              h(
                "article",
                { key: r.findingId, style: styles.finding },
                h(
                  "strong",
                  null,
                  `${r.pluginName}@${r.pluginVersion} · ${r.status}`,
                ),
                h("p", null, r.note),
                h(Fold, { title: "查看原处置身份", framed: false }, () =>
                  h(
                    "pre",
                    { style: { ...styles.mono, whiteSpace: "pre-wrap" } },
                    r.identity,
                  ),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    onClick: async () => {
                      try {
                        await navigator.clipboard.writeText(r.note);
                        if (session.isCurrent())
                          setCopyNotice(
                            "历史依据已复制；请重新核实当前发现后显式保存。",
                          );
                      } catch {
                        if (session.isCurrent())
                          setCopyNotice(
                            "无法自动复制，请选中依据或在导出预览中手动复制。",
                          );
                      }
                    },
                  },
                  "复制历史依据",
                ),
              ),
          }),
        )
      : null,
    h(ExportPreview, { value: exported, onClose: () => setExported(null) }),
  );
}
function SnapshotView({ snapshot }) {
  const [query, setQuery] = React.useState("");
  const names = useMemo(
    () =>
      Object.keys(snapshot.report.plugins)
        .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
        .sort(),
    [snapshot, query],
  );
  return h(
    "div",
    null,
    h(
      "p",
      null,
      `${snapshot.label} · 保存 ${snapshot.savedAt} · 检查 ${snapshot.computedAt}`,
    ),
    h(
      "p",
      null,
      `目标 ${snapshot.identity.profileId} · DSH ${snapshot.identity.dshVersion} · 工具 ${snapshot.identity.toolVersion}`,
    ),
    h(Fold, { title: "查看历史判定身份", framed: false }, () =>
      h(
        "pre",
        { style: { ...styles.mono, whiteSpace: "pre-wrap" } },
        JSON.stringify(snapshot.identity, null, 2),
      ),
    ),
    h("input", {
      "aria-label": "检索历史报告插件",
      value: query,
      placeholder: "检索历史报告插件",
      onChange: (e) => setQuery(e.target.value),
    }),
    h(PagedList, {
      items: names,
      label: "历史报告插件",
      renderItem: (name) =>
        h(
          "article",
          { key: name, style: styles.finding },
          h(
            "strong",
            null,
            `${name}@${snapshot.report.plugins[name].version} · ${VERDICT[snapshot.report.plugins[name].verdict]?.text}`,
          ),
          h(Fold, { title: `查看历史发现 ${name}`, framed: false }, () =>
            h(Findings, { plugin: snapshot.report.plugins[name] }),
          ),
        ),
    }),
  );
}
const directions = {
  added: "新增插件",
  removed: "移除插件",
  worsened: "风险增加",
  improved: "发现或结论改善（非业务认证）",
  updated: "版本变化",
  unchanged: "未变",
  "evidence-weaker": "证据减弱，不能判作修复",
};
function ReportHistoryContent({ data }) {
  const session = useHistoryActions(data),
    [state, setState] = React.useState(null),
    [label, setLabel] = React.useState(""),
    [query, setQuery] = React.useState(""),
    [view, setView] = React.useState(null),
    [exported, setExported] = React.useState(null),
    [before, setBefore] = React.useState(""),
    [after, setAfter] = React.useState(""),
    [comparison, setComparison] = React.useState(null),
    [pair, setPair] = React.useState(null),
    [confirm, setConfirm] = React.useState(null),
    [pluginQuery, setPluginQuery] = React.useState("");
  React.useEffect(() => {
    setState(null);
    setView(null);
    setExported(null);
    setComparison(null);
    setPair(null);
    setBefore("");
    setAfter("");
    setConfirm(null);
  }, [session.key]);
  const items = useMemo(
    () =>
      state?.items.filter((s) =>
        `${s.label} ${s.savedAt} ${s.identity.profileId} ${s.identity.dshVersion} ${(s.plugins || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ) || [],
    [state, query],
  );
  const rows = useMemo(
    () =>
      comparison?.rows.filter((r) =>
        r.name.toLowerCase().includes(pluginQuery.toLowerCase()),
      ) || [],
    [comparison, pluginQuery],
  );
  const selector = (name, value, set) =>
    h(
      "select",
      {
        "aria-label": name,
        value,
        onChange: (e) => {
          set(e.target.value);
          setComparison(null);
          setPair(null);
        },
      },
      h("option", { value: "" }, name),
      state?.items.map((item) =>
        h(
          "option",
          { key: item.id, value: item.id },
          `${item.label || "未命名"} · ${item.savedAt} · ${item.identity.dshVersion}`,
        ),
      ),
    );
  return h(
    "div",
    null,
    h(
      "p",
      null,
      "仅在点击保存时保留完整快照。历史快照不认证当前目标，摘要校验不是签名；静态/宿主观测和业务健康是不同证据。身份不相同时中性展示，证据减少不代表修复。",
    ),
    h("input", {
      "aria-label": "快照备注",
      value: label,
      maxLength: REPORT_HISTORY_LIMITS.label,
      placeholder: "例如：更新前、更新后",
      onChange: (e) => setLabel(e.target.value),
    }),
    h(
      "button",
      {
        type: "button",
        disabled: session.busy,
        onClick: () =>
          session.run({ action: "snapshot-save", label }, setState),
      },
      "保存当前报告快照",
    ),
    h(
      "button",
      {
        type: "button",
        disabled: session.busy,
        onClick: () => session.run({ action: "snapshot-list" }, setState),
      },
      "加载历史报告",
    ),
    session.status,
    state
      ? h(
          "div",
          null,
          h(
            "p",
            null,
            `历史报告 ${state.capacity.records} / ${state.capacity.recordLimit} 份，${bytes(state.capacity.bytes)} / ${bytes(state.capacity.byteLimit)}。容量用尽后请导出并显式移除；不会自动清理。`,
          ),
          h("input", {
            "aria-label": "检索历史快照",
            placeholder: "按备注、时间、版本或目标检索",
            value: query,
            onChange: (e) => setQuery(e.target.value),
          }),
          h(ImportFile, {
            session,
            action: "snapshot-import",
            onSuccess: setState,
            maxBytes: REPORT_HISTORY_LIMITS.fileBytes,
            label: "导入历史快照（不认证当前）",
          }),
          h(PagedList, {
            items,
            label: "历史快照",
            renderItem: (item) =>
              h(
                "article",
                { key: item.id, style: styles.finding },
                h(
                  "p",
                  null,
                  `${item.label || "未命名"} · ${item.savedAt} · DSH ${item.identity.dshVersion} · ${bytes(item.bytes)}`,
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: session.busy,
                    onClick: () =>
                      session.run(
                        { action: "snapshot-read", id: item.id },
                        (r) => setView(r.data),
                      ),
                  },
                  "查看快照",
                ),
                h(
                  "button",
                  {
                    type: "button",
                    disabled: session.busy,
                    onClick: () => setConfirm(item.id),
                  },
                  "移除快照",
                ),
              ),
          }),
          selector("对照起点快照", before, setBefore),
          selector("对照终点快照", after, setAfter),
          h(
            "button",
            {
              type: "button",
              disabled:
                session.busy ||
                !before ||
                !after ||
                before === after ||
                ![before, after].every((id) =>
                  state.items.some((item) => item.id === id),
                ),
              onClick: () =>
                session.run(
                  [
                    { action: "snapshot-read", id: before },
                    { action: "snapshot-read", id: after },
                  ],
                  (result) => {
                    const [a, b] = result.map((r) => r.data);
                    setComparison(compareReportSnapshots(a, b));
                    setPair([a, b]);
                  },
                ),
            },
            "对照两份历史报告",
          ),
        )
      : null,
    confirm
      ? h(
          Alert,
          null,
          h("p", null, "将永久移除此本地快照。请先预览导出并保留可信备份。"),
          h(
            "button",
            {
              type: "button",
              disabled: session.busy,
              onClick: () =>
                session.run(
                  { action: "snapshot-delete", id: confirm, confirm: true },
                  (r) => {
                    setState(r);
                    setConfirm(null);
                    setComparison(null);
                    setPair(null);
                    setView(null);
                  },
                ),
            },
            "确认移除快照",
          ),
          h(
            "button",
            { type: "button", onClick: () => setConfirm(null) },
            "取消",
          ),
        )
      : null,
    view
      ? h(
          "div",
          null,
          h("h4", null, "历史报告明细"),
          h(
            "button",
            { type: "button", onClick: () => setExported(view) },
            "预览导出历史快照",
          ),
          h(SnapshotView, { snapshot: view }),
        )
      : null,
    comparison
      ? h(
          "div",
          null,
          h(Alert, { role: "status" }, comparison.reason),
          comparison.comparable
            ? h(
                "div",
                null,
                h("input", {
                  "aria-label": "检索对照插件",
                  value: pluginQuery,
                  onChange: (e) => setPluginQuery(e.target.value),
                }),
                h(PagedList, {
                  items: rows,
                  label: "历史报告差分",
                  renderItem: (r) =>
                    h(
                      "article",
                      { key: r.name, style: styles.finding },
                      h(
                        "strong",
                        null,
                        `${r.name} · ${directions[r.direction]}`,
                      ),
                      h(
                        "p",
                        null,
                        `之前 ${r.from?.version || "—"} / ${r.from?.verdict || "—"} / 发现 ${r.from?.findings ?? 0}；之后 ${r.to?.version || "—"} / ${r.to?.verdict || "—"} / 发现 ${r.to?.findings ?? 0}`,
                      ),
                    ),
                }),
              )
            : null,
          pair?.map((snapshot, i) =>
            h(
              Fold,
              {
                key: i,
                title: i ? "查看对照终点完整报告" : "查看对照起点完整报告",
              },
              () => h(SnapshotView, { snapshot }),
            ),
          ),
        )
      : null,
    h(ExportPreview, { value: exported, onClose: () => setExported(null) }),
  );
}
export function HistoryTools({ data }) {
  return h(
    "div",
    { className: "compat-auxiliary" },
    h(Fold, { title: "人工处置记录管理", heading: true }, () =>
      h(ReviewArchiveContent, { data }),
    ),
    h(Fold, { title: "本地历史报告与趋势", heading: true }, () =>
      h(ReportHistoryContent, { data }),
    ),
  );
}
