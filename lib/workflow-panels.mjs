// Native fallback for consumers of the pure factory without the UI adapter.
function createDisclosure(React, h, t) {
  return function Disclosure({ title, count, children }) {
    const [open, setOpen] = React.useState(false);
    const content = Array.isArray(children) ? children[0] : children;
    return h(
      "section",
      { "data-slot": "collapsible" },
      h(
        "div",
        null,
        title,
        `（${count}）`,
        h(
          "button",
          {
            type: "button",
            "aria-label": t(open ? "收起{p0}" : "展开{p0}", { p0: title }),
            "aria-expanded": open,
            onClick: () => setOpen((value) => !value),
          },
          open ? t("收起") : t("展开"),
        ),
      ),
      open ? content() : null,
    );
  };
}
/** Stateless React factory; staged verbatim into the shipped client. */
export function createDependencyPanel(React, GraphContract = {}, UI = {}) {
  const explain = UI.evidenceNote || ((value) => value);
  const t =
    UI.t ||
    ((text, params = {}) =>
      text.replace(/\{(p\d+)\}/g, (match, key) =>
        Object.hasOwn(params, key) ? String(params[key]) : match,
      ));
  const h = (type, props, ...children) =>
    React.createElement(UI[type] || type, props, ...children);
  const requirement = {
    required: "必需",
    optional: "可选 / 软读取",
    subcontext: "子作用域",
    unknown: "必需性未知",
  };
  const Disclosure = createDisclosure(React, h, t);
  const pageSize = 50;
  // Keep source references, and only format the page the user opens.
  const rowsOf = (input, project) => ({
    length: input.length,
    page: (offset, size) => input.slice(offset, offset + size).map(project),
  });
  function PagedTable({ caption, headers, rows }) {
    const [requested, setPage] = React.useState(0);
    const page = Math.min(
      requested,
      Math.max(0, Math.ceil(rows.length / pageSize) - 1),
    );
    const compute = () => rows.page(page * pageSize, pageSize);
    const visible = React.useMemo
      ? React.useMemo(compute, [rows, page, UI.locale?.()])
      : compute();
    return h(
      "div",
      null,
      h(
        "table",
        { "aria-label": caption, className: "compat-relation-table" },
        h(
          "caption",
          null,
          t("{p0} · {p1} 项", { p0: caption, p1: rows.length }),
        ),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...headers.map((label, i) =>
              h("th", { key: i, scope: "col" }, label),
            ),
          ),
        ),
        h(
          "tbody",
          null,
          ...visible.map((row, i) =>
            h(
              "tr",
              { key: page * pageSize + i },
              ...row.map((cell, j) => h("td", { key: j }, cell)),
            ),
          ),
        ),
      ),
      rows.length > pageSize
        ? UI.Pager
          ? h(UI.Pager, {
              page,
              total: rows.length,
              pageSize,
              onPageChange: setPage,
              label: caption,
            })
          : h(
              "nav",
              { "aria-label": t("{p0}分页", { p0: caption }) },
              h(
                "span",
                null,
                t("第 {p0} / {p1} 页", {
                  p0: page + 1,
                  p1: Math.ceil(rows.length / pageSize),
                }),
              ),
              h(
                "button",
                {
                  type: "button",
                  "aria-label": t("上一页{p0}", { p0: caption }),
                  disabled: page === 0,
                  onClick: () => setPage(page - 1),
                },
                t("上一页"),
              ),
              h(
                "button",
                {
                  type: "button",
                  "aria-label": t("下一页{p0}", { p0: caption }),
                  disabled: (page + 1) * pageSize >= rows.length,
                  onClick: () => setPage(page + 1),
                },
                t("下一页"),
              ),
            )
        : null,
    );
  }
  const table = (id, caption, headers, rows) =>
    h(
      UI.Fold || Disclosure,
      {
        key: id,
        title: caption,
        count: t("{p0} 项", { p0: rows.length }),
      },
      () => h(PagedTable, { caption, headers, rows }),
    );
  return function DependencyPanel({ graph } = {}) {
    if (graph === undefined || graph === null)
      return h(
        "section",
        {
          "aria-label": t("依赖关系与潜在影响"),
          className: "compat-dependency-panel",
        },
        h("h3", null, t("依赖关系与潜在影响")),
        h("p", null, t("本报告未提供依赖关系视图；请重新体检。")),
      );
    let valid = false;
    try {
      valid =
        typeof GraphContract.validateDependencyGraph === "function" &&
        GraphContract.validateDependencyGraph(graph);
    } catch {}
    if (!valid)
      return h(
        "section",
        {
          "aria-label": t("依赖关系与潜在影响"),
          className: "compat-dependency-panel",
        },
        h("h3", null, t("依赖关系与潜在影响")),
        h(
          "p",
          { role: "status" },
          t(
            "依赖关系视图不可用：扩展数据格式或引用无效，请重新体检。兼容结论仍按原始证据显示。",
          ),
        ),
      );
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const name = (id) => nodes.get(id)?.name || id;
    const entries = (node) =>
      node.entries.length
        ? node.entries
            .map(
              (row) =>
                `${row.id || t("未命名条目")}: ${row.disabled ? t("disabled / 已禁用") : row.state}`,
            )
            .join("；")
        : t("unknown / 未提供 loader 条目");
    const candidates = new Map(),
      consumers = new Map();
    for (const edge of graph.edges) {
      const map =
        edge.kind === "candidate-provider"
          ? candidates
          : edge.kind === "dependency"
            ? consumers
            : null;
      if (map) {
        if (!map.has(edge.to)) map.set(edge.to, []);
        map.get(edge.to).push(edge);
      }
    }
    const candidateLabel = (edge) =>
      `${name(edge.from)} [${edge.side}; ${entries(nodes.get(edge.from))}]${edge.side === "unknown" ? t("（端未知；不参与传播推导）") : ""}`;
    const source = (edge) =>
      edge.source?.file
        ? `${edge.source.file}${edge.source.line === null ? "" : ":" + edge.source.line}`
        : t("来源位置未知");
    const relationshipRows = rowsOf(
      graph.edges.filter((edge) => edge.kind === "dependency"),
      (edge) => {
        const known = candidates.get(edge.to) || [];
        const unknown =
          candidates.get(
            JSON.stringify(["service", "unknown", edge.service]),
          ) || [];
        const choices = [...known, ...(edge.side === "unknown" ? [] : unknown)];
        return [
          name(edge.from),
          edge.service,
          edge.side,
          t(requirement[edge.requirement]),
          choices.length
            ? choices.map(candidateLabel).join("；")
            : t("未找到可定位的候选提供者（不等于宿主缺失）"),
          source(edge),
        ];
      },
    );
    const providerRows = rowsOf(
      graph.edges.filter((edge) => edge.kind === "candidate-provider"),
      (edge) => [
        candidateLabel(edge),
        edge.service,
        edge.side,
        (consumers.get(edge.to) || [])
          .map((c) => `${name(c.from)}（${t(requirement[c.requirement])}）`)
          .join("；") || t("没有同端消费者证据"),
        source(edge),
      ],
    );
    const packageRows = rowsOf(
      graph.edges.filter((edge) => edge.kind === "client-package-inject"),
      (edge) => [
        name(edge.from),
        name(edge.to),
        t("client 包级 inject；不作为 host 服务关系或传播依据"),
      ],
    );
    const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));
    const pathLabel = (origin, path) => {
      const parts = [name(origin)];
      for (let i = 0; i < path.length; i += 2) {
        const provider = edgeMap.get(path[i]),
          consumer = edgeMap.get(path[i + 1]);
        parts.push(
          `${provider.service} [${provider.side}]`,
          `${name(consumer.from)}（${t(requirement[consumer.requirement])}）`,
        );
      }
      return parts.join(" → ");
    };
    const impactRows = {
      length: graph.impacts.reduce(
        (count, impact) => count + impact.affected.length,
        0,
      ),
      page(offset, size) {
        const rows = [];
        let skipped = 0;
        for (const impact of graph.impacts) {
          if (skipped + impact.affected.length <= offset) {
            skipped += impact.affected.length;
            continue;
          }
          for (const row of impact.affected.slice(
            Math.max(0, offset - skipped),
            Math.max(0, offset - skipped) + size - rows.length,
          )) {
            rows.push([
              name(impact.plugin),
              name(row.plugin),
              row.side,
              t("潜在影响；非实测故障"),
              pathLabel(impact.plugin, row.path),
            ]);
          }
          if (rows.length >= size) break;
          skipped += impact.affected.length;
        }
        return rows;
      },
    };
    const cycleRows = rowsOf(graph.cycles, (cycle) => [
      cycle.side,
      pathLabel(cycle.plugins[0], cycle.path),
      t("潜在声明环；不据此认定挂起或失败"),
    ]);
    return h(
      "section",
      {
        "aria-label": t("依赖关系与潜在影响"),
        className: "compat-dependency-panel",
      },
      h("h3", null, t("依赖关系与潜在影响")),
      ...graph.notes.map((note, i) =>
        h("p", { key: `note:${i}` }, explain(note)),
      ),
      h(
        "p",
        null,
        t("关系覆盖：{p0}{p1}。节点 {p2}，关系 {p3}。", {
          p0:
            graph.coverage.status === "complete"
              ? t("已覆盖本次提取输入（不等于运行时完整）")
              : t("有限"),
          p1: graph.coverage.truncated
            ? t("；已截断，不能当作全量关系或全量受影响者")
            : "",
          p2: graph.nodes.length,
          p3: graph.edges.length,
        }),
      ),
      ...graph.coverage.reasons.map((reason, i) =>
        h(
          "p",
          { key: `reason:${i}`, role: "note" },
          t("覆盖限制：{p0}", { p0: explain(reason) }),
        ),
      ),
      table(
        "loaders",
        t("插件及 loader 条目"),
        [
          t("插件"),
          t("宿主条目状态（不代表服务状态）"),
          t("Context 名称线索（非子作用域证明）"),
        ],
        rowsOf(
          graph.nodes.filter((node) => node.kind === "plugin"),
          (node) => [
            node.name,
            entries(node),
            node.subContexts
              .filter((context) => context.names.length)
              .map(
                (context) =>
                  `${context.file || t("位置未知")}: ${context.names.join(", ")}`,
              )
              .join("；") || t("未提取到命名线索"),
          ],
        ),
      ),
      relationshipRows.length
        ? table(
            "services",
            t("服务依赖及候选提供者"),
            [
              t("消费者"),
              t("服务"),
              t("端"),
              t("依赖方式"),
              t("候选提供者 / loader 状态"),
              t("依赖来源"),
            ],
            relationshipRows,
          )
        : h("p", null, t("本次未提取到服务依赖；不等于没有运行时依赖。")),
      providerRows.length
        ? table(
            "providers",
            t("提供声明（仅候选）"),
            [
              t("候选插件 / loader 状态"),
              t("服务"),
              t("端"),
              t("同端潜在消费者"),
              t("提供来源"),
            ],
            providerRows,
          )
        : null,
      packageRows.length
        ? table(
            "packages",
            t("客户端包依赖"),
            [t("消费者"), t("客户端包"), t("语义")],
            packageRows,
          )
        : null,
      impactRows.length
        ? table(
            "impacts",
            t("潜在受影响插件及关系路径"),
            [
              t("候选起点"),
              t("潜在受影响者"),
              t("端"),
              t("证据边界"),
              t("路径"),
            ],
            impactRows,
          )
        : h("p", null, t("未枚举到可证明同端的传播路径；不等于没有潜在影响。")),
      cycleRows.length
        ? table(
            "cycles",
            t("潜在声明环"),
            [t("端"), t("关系路径"), t("说明")],
            cycleRows,
          )
        : h("p", null, t("本次覆盖内未枚举到声明环。")),
      h(
        "p",
        null,
        t("预算：节点 {p0}；关系 {p1}；传播遍历及路径 {p2}；输入条目 {p3}。", {
          p0: graph.coverage.limits.nodes,
          p1: graph.coverage.limits.edges,
          p2: graph.coverage.limits.traversal,
          p3: graph.coverage.limits.items,
        }),
      ),
    );
  };
}
/** Browser-safe React factory. Manual actions stay separate from kernel results. */
export function createFindingReviewPanel(React, ReviewContract, UI = {}) {
  const t =
    UI.t ||
    ((text, params = {}) =>
      text.replace(/\{(p\d+)\}/g, (match, key) =>
        Object.hasOwn(params, key) ? String(params[key]) : match,
      ));
  const h = (type, props, ...children) =>
      React.createElement(UI[type] || type, props, ...children),
    labels = ReviewContract.REVIEW_STATUS_LABELS;
  const uiMessage = UI.uiMessage || t;
  const messageText = UI.messageText || ((value) => value);
  const draftKey = (token, id) => `${token}:${id}`;
  function ReviewRow({
    item,
    contextToken,
    onSave,
    disabled,
    draft,
    stale,
    onEdit,
    onDiscard,
    finding,
    focus,
    onLocateMain,
  }) {
    const root = React.useRef(null);
    React.useEffect(() => {
      if (focus && !stale) {
        root.current?.scrollIntoView?.({ block: "center" });
        root.current?.focus?.({ preventScroll: true });
      }
    }, [focus?.nonce]);
    const status = draft?.status ?? item.record?.status ?? "pending";
    const note = draft?.note ?? item.note ?? "";
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [message, setMessage] = React.useState("");
    const current = React.useRef(null);
    current.current = { contextToken, findingId: item.findingId, stale };
    const save = async () => {
      if (busy || disabled || stale) return;
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
          current.current.findingId === target.findingId &&
          !current.current.stale
        )
          setMessage(uiMessage("人工处置已保存"));
      } catch (reason) {
        if (
          current.current.contextToken === target.contextToken &&
          current.current.findingId === target.findingId &&
          !current.current.stale
        )
          setError(reason?.message || t("保存人工处置失败"));
      } finally {
        setBusy(false);
      }
    };
    return h(
      "article",
      {
        ref: root,
        tabIndex: -1,
        "data-review-context": contextToken,
        "data-review-focused": !!focus,
        "data-review-finding": item.findingId,
        "data-review-stale": stale,
        className: "compat-review-item",
        style: {
          border: "1px solid hsl(var(--dsc-border))",
          padding: "12px",
          marginBottom: "10px",
          borderRadius: "6px",
        },
      },
      h(
        "strong",
        null,
        t("{p0}@{p1} · 发现 {p2} · {p3}", {
          p0: item.pluginName,
          p1: item.pluginVersion,
          p2: item.findingIndex + 1,
          p3: t(labels[item.status]) || item.status,
        }),
      ),
      finding
        ? h(
            "p",
            null,
            t("类别：{p0} · API：{p1} · 源码：{p2}", {
              p0:
                ReviewContract.categoryLabel?.(finding.category) ||
                finding.category,
              p1: finding.service
                ? [finding.service, finding.method].filter(Boolean).join(".")
                : t("声明/loader事实"),
              p2: finding.location
                ? `${finding.location.file}:${finding.location.line}`
                : t("未提供位置"),
            }),
          )
        : null,
      !stale && typeof onLocateMain === "function"
        ? h(
            "button",
            {
              type: "button",
              "data-main-link": item.findingId,
              style: { marginRight: "8px" },
              onClick: () => onLocateMain(contextToken, item.findingId),
            },
            t("返回主结果"),
          )
        : null,
      stale
        ? h(
            "p",
            { role: "status" },
            t(
              "草稿已过期：原报告或发现已变化。不会保存到当前发现；请复制后在新发现中重新核实，或显式放弃草稿。",
            ),
          )
        : null,
      item.reviewReason
        ? h(
            "p",
            { role: "status" },
            (UI.evidenceNote || ((v) => v))(item.reviewReason),
          )
        : null,
      item.record
        ? h(
            "p",
            null,
            t("原记录：{p0} · {p1} · {p2}{p3}", {
              p0: t(labels[item.record.status]),
              p1: item.record.updatedAt,
              p2: item.record.note.slice(0, 160),
              p3:
                item.record.note.length > 160 ? t("…（完整依据见编辑框）") : "",
            }),
          )
        : null,
      item.history?.length
        ? h(
            "details",
            null,
            h(
              "summary",
              null,
              t("旧处置摘要（{p0}；完整依据见历史处置）", {
                p0: item.historyCount || item.history.length,
              }),
            ),
            item.history.map((record) =>
              h(
                "p",
                { key: record.findingId },
                `${record.pluginName}@${record.pluginVersion} · ${t(labels[record.status])} · ${record.updatedAt} · ${record.note}${record.noteTruncated ? "…" : ""}`,
              ),
            ),
          )
        : null,
      h(
        "label",
        null,
        t("人工状态 "),
        h(
          "select",
          {
            "aria-label": t("{p0} 发现 {p1} 人工状态", {
              p0: item.pluginName,
              p1: item.findingIndex + 1,
            }),
            value: status,
            disabled: busy || (!stale && disabled),
            onChange: (e) => {
              onEdit({ status: e.target.value, note });
              setMessage("");
            },
          },
          Object.keys(labels)
            .filter((x) => x !== "needs-review")
            .map((value) =>
              h("option", { key: value, value }, t(labels[value])),
            ),
        ),
      ),
      h(
        "label",
        { className: "compat-review-note" },
        t("核实依据 "),
        h("textarea", {
          "aria-label": t("{p0} 发现 {p1} 核实依据", {
            p0: item.pluginName,
            p1: item.findingIndex + 1,
          }),
          value: note,
          maxLength: ReviewContract.REVIEW_LIMITS.note,
          disabled: busy || (!stale && disabled),
          rows: 3,
          style: { display: "block", width: "100%" },
          onChange: (e) => {
            onEdit({ status, note: e.target.value });
            setMessage("");
          },
        }),
      ),
      h(
        "button",
        { type: "button", disabled: busy || disabled || stale, onClick: save },
        busy ? t("保存中…") : t("保存人工处置"),
      ),
      draft
        ? h(
            "button",
            {
              type: "button",
              onClick: async () => {
                try {
                  if (!globalThis.navigator?.clipboard?.writeText)
                    throw new Error(
                      t("当前浏览器无法复制，请选择核实依据后手动复制"),
                    );
                  await navigator.clipboard.writeText(
                    t("{p0}@{p1} · 发现 {p2} · {p3}\n{p4}", {
                      p0: item.pluginName,
                      p1: item.pluginVersion,
                      p2: item.findingIndex + 1,
                      p3: t(labels[status]),
                      p4: note,
                    }),
                  );
                  setMessage(
                    uiMessage("草稿已复制；请在当前发现中重新核实后保存"),
                  );
                } catch (reason) {
                  setError(reason?.message || t("复制失败，请手动复制"));
                }
              },
            },
            t("复制草稿"),
          )
        : null,
      draft
        ? h(
            "button",
            {
              type: "button",
              disabled: busy,
              onClick: () => {
                onDiscard();
                setError("");
                setMessage("");
              },
            },
            t("放弃草稿"),
          )
        : null,
      error ? h("p", { role: "alert" }, error) : null,
      message ? h("p", { role: "status" }, messageText(message)) : null,
    );
  }
  return function FindingReviewPanel({
    report,
    reviews,
    onSave,
    focus,
    onLocateMain,
  }) {
    const [pluginFilter, setPluginFilter] = React.useState("");
    const [statusFilter, setStatusFilter] = React.useState("all");
    const [focused, setFocused] = React.useState(null);
    const [notice, setNotice] = React.useState("");
    const [saved, setSaved] = React.useState(null);
    const [drafts, setDrafts] = React.useState(() => new Map());
    const [limit, setLimit] = React.useState(20);
    const [historyOpen, setHistoryOpen] = React.useState(false);
    const [historyLimit, setHistoryLimit] = React.useState(20);
    const current = React.useRef(null);
    current.current = {
      token: reviews?.contextToken,
      revision: reviews?.revision,
    };
    React.useEffect(() => {
      setSaved(null);
    }, [reviews?.contextToken, reviews?.revision]);
    React.useEffect(() => {
      setFocused(null);
      setNotice("");
      setLimit(20);
      setHistoryOpen(false);
      setHistoryLimit(20);
    }, [reviews?.contextToken]);
    React.useEffect(() => {
      if (
        focus &&
        focus.contextToken === reviews?.contextToken &&
        Array.isArray(reviews?.items) &&
        reviews?.items?.some((item) => item.findingId === focus.findingId)
      ) {
        setPluginFilter("");
        setStatusFilter("all");
        setFocused(focus);
      }
    }, [focus?.nonce]);
    const candidate =
      saved && saved.contextToken === reviews?.contextToken ? saved : reviews;
    const valid =
      candidate != null &&
      ReviewContract.validateReviewEnvelope(candidate, report);
    const active = valid ? candidate : null;
    if (candidate == null && !drafts.size) return null;
    const discard = (key) =>
      setDrafts((previous) => {
        const next = new Map(previous);
        next.delete(key);
        return next;
      });
    const save = async (input) => {
      const requestedRevision = current.current.revision;
      const result = await onSave(input),
        next = result?.reviews || result;
      if (!ReviewContract.validateReviewEnvelope(next, report))
        throw new Error(t("保存响应无效"));
      if (next.error) throw new Error(next.error);
      if (
        current.current.token !== input.contextToken ||
        next.contextToken !== input.contextToken
      )
        throw new Error(t("报告已变化，请重新核实"));
      if (
        current.current.revision !== requestedRevision &&
        current.current.revision !== next.revision
      )
        throw new Error(t("人工处置记录已变化，草稿已保留；请刷新核实后重试"));
      setSaved(next);
      setNotice(
        uiMessage("人工处置已保存；筛选仅改变处置列表，原始风险仍完整保留。"),
      );
      setDrafts((previous) => {
        const key = draftKey(input.contextToken, input.findingId),
          draft = previous.get(key);
        if (
          !draft ||
          draft.status !== input.status ||
          draft.note.trim() !== input.note
        )
          return previous;
        const remaining = new Map(previous);
        remaining.delete(key);
        return remaining;
      });
      return next;
    };
    const items = (active?.items || []).filter(
      (item) =>
        !report?.plugins || Object.hasOwn(report.plugins, item.pluginName),
    );
    const token = active?.contextToken;
    const currentItems = new Map(
      items.map((item) => [draftKey(token, item.findingId), item]),
    );
    const filtered = items.filter(
      (item) =>
        item.pluginName
          .toLowerCase()
          .includes(pluginFilter.trim().toLowerCase()) &&
        (statusFilter === "all" || item.status === statusFilter),
    );
    const locateFinding = (item) =>
      report?.plugins?.[item.pluginName]?.findings?.[item.findingIndex];
    const rows = [...drafts].map(([key, draft]) => ({
      key,
      item: currentItems.get(key) || draft.item,
      contextToken: draft.contextToken,
      draft,
      finding: currentItems.has(key)
        ? locateFinding(currentItems.get(key))
        : draft.finding,
      stale: !currentItems.has(key) || !!active?.error,
    }));
    const visibleItems = filtered.slice(0, limit);
    const target =
      focused?.contextToken === token &&
      items.find((item) => item.findingId === focused.findingId);
    if (target && !visibleItems.includes(target)) visibleItems.push(target);
    for (const item of visibleItems) {
      const key = draftKey(token, item.findingId);
      if (!drafts.has(key))
        rows.push({
          key,
          item,
          finding: locateFinding(item),
          contextToken: token,
          stale: false,
        });
    }
    return h(
      "section",
      { "aria-label": t("发现的人工处置"), style: { marginTop: "16px" } },
      h("h3", null, t("发现的人工处置")),
      h(
        "p",
        null,
        t(
          "人工记录仅供核实追踪，不改变内核发现、总结论、退出码、基线或兼容性豁免；新风险仍完整显示。",
        ),
      ),
      valid && !active?.error && items.length
        ? h(
            "div",
            { className: "compat-toolbar" },
            h("input", {
              "aria-label": t("筛选处置插件"),
              placeholder: t("筛选处置插件名称"),
              value: pluginFilter,
              onChange: (e) => {
                setPluginFilter(e.target.value);
                setLimit(20);
                setFocused(null);
              },
            }),
            h(
              "select",
              {
                "aria-label": t("筛选人工状态"),
                value: statusFilter,
                onChange: (e) => {
                  setStatusFilter(e.target.value);
                  setLimit(20);
                  setFocused(null);
                },
              },
              h("option", { value: "all" }, t("全部人工状态")),
              Object.entries(labels).map(([value, label]) =>
                h("option", { key: value, value }, t(label)),
              ),
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  setPluginFilter("");
                  setStatusFilter("all");
                  setLimit(20);
                  setFocused(null);
                },
              },
              t("清除处置筛选"),
            ),
          )
        : null,
      h(
        "p",
        null,
        t("符合筛选 {p0} / {p1} 条；未保存草稿始终保留，筛选不改变原始风险。", {
          p0: filtered.length,
          p1: items.length,
        }),
      ),
      notice ? h("p", { role: "status" }, messageText(notice)) : null,
      !valid
        ? h(
            "p",
            { role: "alert" },
            t("人工处置数据无效或暂不可用；保留未保存草稿，请刷新后重试。"),
          )
        : active.error
          ? h("p", { role: "alert" }, active.error)
          : null,
      rows.length
        ? rows.map((row) =>
            h(ReviewRow, {
              ...row,
              focus:
                focused?.contextToken === row.contextToken &&
                focused.findingId === row.item.findingId
                  ? focused
                  : null,
              onLocateMain,
              onSave: save,
              disabled:
                !!active?.error || !valid || typeof onSave !== "function",
              onDiscard: () => discard(row.key),
              onEdit: (edit) =>
                setDrafts((previous) => {
                  const next = new Map(previous);
                  if (
                    !row.stale &&
                    edit.status === (row.item.record?.status || "pending") &&
                    edit.note === (row.item.note || "")
                  )
                    next.delete(row.key);
                  else
                    next.set(row.key, {
                      ...edit,
                      item: row.draft?.item || row.item,
                      contextToken: row.contextToken,
                      finding: row.draft?.finding || row.finding,
                    });
                  return next;
                }),
            }),
          )
        : h(
            "p",
            null,
            items.length
              ? t("没有符合筛选的处置发现。")
              : t("当前没有可处置的发现。"),
          ),
      filtered.length > limit
        ? h(
            "button",
            { type: "button", onClick: () => setLimit((n) => n + 20) },
            t("显示更多处置（已显示 {p0} / {p1}）", {
              p0: Math.min(limit, filtered.length),
              p1: filtered.length,
            }),
          )
        : null,
      active?.history?.length
        ? h(
            "details",
            {
              open: historyOpen,
              onToggle: (e) => setHistoryOpen(e.target.open),
            },
            h(
              "summary",
              null,
              t("历史处置完整依据（{p0}）", { p0: active.history.length }),
            ),
            historyOpen
              ? active.history
                  .slice(0, historyLimit)
                  .map((record) =>
                    h(
                      "p",
                      { key: record.findingId },
                      `${record.pluginName}@${record.pluginVersion} · ${t(labels[record.status])} · ${record.updatedAt} · ${record.note}`,
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
                  t("显示更多历史处置"),
                )
              : null,
          )
        : null,
    );
  };
}
/** Offline UI for explicitly imported health evidence. Never starts a runner. */
export function createFunctionalHealthPanel(React, HealthContract, UI = {}) {
  const t =
    UI.t ||
    ((text, params = {}) =>
      text.replace(/\{(p\d+)\}/g, (match, key) =>
        Object.hasOwn(params, key) ? String(params[key]) : match,
      ));
  const h = (type, props, ...children) =>
    React.createElement(UI[type] || type, props, ...children);
  const Disclosure = createDisclosure(React, h, t);
  const statusLabels = {
    "tested-pass": "所选检查通过",
    "tested-failed": "所选检查失败",
    error: "检查未完成",
    pass: "通过",
    failed: "失败",
  };
  return function FunctionalHealthPanel({ report }) {
    const [result, setResult] = React.useState(null);
    const [error, setError] = React.useState("");
    const [busy, setBusy] = React.useState(false);
    const request = React.useRef(0);
    React.useEffect(
      () => () => {
        request.current++;
      },
      [],
    );
    const load = async (event) => {
      const file = event.target.files?.[0],
        id = ++request.current;
      if (!file) return;
      setBusy(true);
      setError("");
      try {
        if (
          !Number.isSafeInteger(file.size) ||
          file.size < 1 ||
          file.size > 512 * 1024
        )
          throw new Error(t("记录超过大小限制（512 KiB）"));
        const parsed = JSON.parse(await file.text());
        const checked = HealthContract.validateFunctionalHealthResult(parsed);
        if (!checked.valid) throw new Error(checked.errors.join("；"));
        if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined")
          throw new Error(t("当前浏览器无法核验记录摘要"));
        const bytes = new TextEncoder().encode(
          HealthContract.canonicalFunctionalManifest(parsed.declaration),
        );
        const digest = Array.from(
          new Uint8Array(
            await globalThis.crypto.subtle.digest("SHA-256", bytes),
          ),
          (n) => n.toString(16).padStart(2, "0"),
        ).join("");
        if (digest !== parsed.identity.manifestSha256)
          throw new Error(t("检查声明与记录摘要不一致"));
        if (request.current === id) setResult(parsed);
      } catch (reason) {
        if (request.current === id)
          setError(t("导入失败：{p0}", { p0: reason?.message || reason }));
      } finally {
        if (request.current === id) setBusy(false);
      }
    };
    const artifact = result?.identity.artifact,
      current = artifact && report?.plugins?.[artifact.name];
    const versionsMatch =
      current?.version === artifact?.version &&
      report?.dshVersion === result?.identity.dshVersion;
    return h(
      "section",
      { "aria-label": t("功能健康检查"), style: { marginTop: "16px" } },
      h("h3", null, t("功能健康检查（独立实测记录）")),
      h(
        "p",
        null,
        t(
          "在仓库CLI中显式运行所选HTTP/DOM检查后，可导入JSON记录。本面板只读取所选文件，不执行检查、安装插件或访问目标服务。",
        ),
      ),
      h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": t("导入功能健康检查记录"),
        disabled: busy,
        onChange: load,
      }),
      busy ? h("p", { role: "status" }, t("正在核验记录…")) : null,
      error ? h("p", { role: "alert" }, error) : null,
      !result
        ? h(
            "p",
            null,
            t("尚未导入功能实测记录。静态发现、宿主状态和业务健康是不同证据。"),
          )
        : h(
            "div",
            { "data-functional-health": result.status },
            h(
              "p",
              null,
              `${artifact.name}@${artifact.version} · DSH ${result.identity.dshVersion} · ${t(statusLabels[result.status])}`,
            ),
            h(
              "p",
              { role: "status" },
              versionsMatch
                ? t(
                    "插件与DSH版本相符；当前安装制品尚未核验，此处保留所选制品的历史记录。",
                  )
                : t(
                    "记录与当前报告目标不一致或插件未安装；不用于认证当前目标。",
                  ),
            ),
            h(
              "p",
              null,
              t("测量时间：{p0} → {p1}", {
                p0: result.startedAt,
                p1: result.completedAt,
              }),
            ),
            h("p", null, t("制品 SHA-256：{p0}", { p0: artifact.sha256 })),
            h(
              "p",
              null,
              t("声明 SHA-256：{p0}；摘要校验不是作者签名或业务认证。", {
                p0: result.identity.manifestSha256,
              }),
            ),
            h(
              UI.Fold || Disclosure,
              {
                title: t("功能健康检查结果"),
                count: t("{p0} 项", { p0: result.checks.length }),
              },
              () =>
                h(
                  "table",
                  { "aria-label": t("功能健康检查结果") },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, t("检查与声明")),
                      h("th", null, t("独立实测")),
                    ),
                  ),
                  h(
                    "tbody",
                    null,
                    result.checks.map((check, i) => {
                      const declaration = result.declaration.checks[i],
                        expected =
                          declaration.type === "http"
                            ? `GET ${declaration.path}，HTTP ${declaration.status}` +
                              (declaration.json
                                ? `，JSON ${declaration.json.pointer} = ${JSON.stringify(declaration.json.equals)}`
                                : "")
                            : t("{p0} · {p1} · 数量 {p2}–{p3}", {
                                p0: declaration.path,
                                p1: declaration.selector,
                                p2: declaration.minCount,
                                p3: declaration.maxCount,
                              });
                      return h(
                        "tr",
                        { key: check.id },
                        h("td", null, `${check.id} · ${expected}`),
                        h(
                          "td",
                          null,
                          `${t(statusLabels[check.status]) || check.status} · ${JSON.stringify(check.evidence)}`,
                        ),
                      );
                    }),
                  ),
                ),
            ),
            result.error ? h("p", { role: "alert" }, result.error) : null,
            h(
              "p",
              null,
              t("资源清理：{p0}", {
                p0:
                  result.cleanup.stopped && result.cleanup.removed
                    ? t("已停止并清理自有环境")
                    : t("未确认完整清理"),
              }),
            ),
            h(
              "ul",
              null,
              result.limitations.map((text, i) => h("li", { key: i }, text)),
            ),
            h(
              "p",
              null,
              t(
                "仅证明记录中的所选检查结果，不改普通兼容性结论、风险计数、基线或人工处置；不认证全部业务。",
              ),
            ),
            h(
              "button",
              {
                type: "button",
                onClick: () => {
                  request.current++;
                  setResult(null);
                  setError("");
                  setBusy(false);
                },
              },
              t("清除健康检查记录"),
            ),
          ),
    );
  };
}
