/** Browser-safe React factory. Manual actions stay separate from kernel results. */
export function createFindingReviewPanel(React, ReviewContract) {
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
