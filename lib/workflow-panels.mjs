// Native fallback for consumers of the pure factory without the UI adapter.
function createDisclosure(React, h) {
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
            "aria-label": `${open ? "收起" : "展开"}${title}`,
            "aria-expanded": open,
            onClick: () => setOpen((value) => !value),
          },
          open ? "收起" : "展开",
        ),
      ),
      open ? content() : null,
    );
  };
}
/** Stateless React factory; staged verbatim into the shipped client. */
export function createDependencyPanel(React, GraphContract = {}, UI = {}) {
  const h = (type, props, ...children) =>
    React.createElement(UI[type] || type, props, ...children);
  const requirement = {
    required: "必需",
    optional: "可选 / 软读取",
    subcontext: "子作用域",
    unknown: "必需性未知",
  };
  const Disclosure = createDisclosure(React, h);
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
      ? React.useMemo(compute, [rows, page])
      : compute();
    return h(
      "div",
      null,
      h(
        "table",
        { "aria-label": caption, className: "compat-relation-table" },
        h("caption", null, `${caption} · ${rows.length} 项`),
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
              { "aria-label": `${caption}分页` },
              h(
                "span",
                null,
                `第 ${page + 1} / ${Math.ceil(rows.length / pageSize)} 页`,
              ),
              h(
                "button",
                {
                  type: "button",
                  "aria-label": `上一页${caption}`,
                  disabled: page === 0,
                  onClick: () => setPage(page - 1),
                },
                "上一页",
              ),
              h(
                "button",
                {
                  type: "button",
                  "aria-label": `下一页${caption}`,
                  disabled: (page + 1) * pageSize >= rows.length,
                  onClick: () => setPage(page + 1),
                },
                "下一页",
              ),
            )
        : null,
    );
  }
  const table = (caption, headers, rows) =>
    h(
      UI.Fold || Disclosure,
      { key: caption, title: caption, count: `${rows.length} 项` },
      () => h(PagedTable, { caption, headers, rows }),
    );
  return function DependencyPanel({ graph } = {}) {
    if (graph === undefined || graph === null)
      return h(
        "section",
        { "aria-label": "依赖关系与潜在影响" },
        h("h3", null, "依赖关系与潜在影响"),
        h("p", null, "本报告未提供依赖关系视图；请重新体检。"),
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
        { "aria-label": "依赖关系与潜在影响" },
        h("h3", null, "依赖关系与潜在影响"),
        h(
          "p",
          { role: "status" },
          "依赖关系视图不可用：扩展数据格式或引用无效，请重新体检。兼容结论仍按原始证据显示。",
        ),
      );
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const name = (id) => nodes.get(id)?.name || id;
    const entries = (node) =>
      node.entries.length
        ? node.entries
            .map(
              (row) =>
                `${row.id || "未命名条目"}: ${row.disabled ? "disabled / 已禁用" : row.state}`,
            )
            .join("；")
        : "unknown / 未提供 loader 条目";
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
      `${name(edge.from)} [${edge.side}; ${entries(nodes.get(edge.from))}]${edge.side === "unknown" ? "（端未知；不参与传播推导）" : ""}`;
    const source = (edge) =>
      edge.source?.file
        ? `${edge.source.file}${edge.source.line === null ? "" : ":" + edge.source.line}`
        : "来源位置未知";
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
          requirement[edge.requirement],
          choices.length
            ? choices.map(candidateLabel).join("；")
            : "未找到可定位的候选提供者（不等于宿主缺失）",
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
          .map((c) => `${name(c.from)}（${requirement[c.requirement]}）`)
          .join("；") || "没有同端消费者证据",
        source(edge),
      ],
    );
    const packageRows = rowsOf(
      graph.edges.filter((edge) => edge.kind === "client-package-inject"),
      (edge) => [
        name(edge.from),
        name(edge.to),
        "client 包级 inject；不作为 host 服务关系或传播依据",
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
          `${name(consumer.from)}（${requirement[consumer.requirement]}）`,
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
              "潜在影响；非实测故障",
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
      "潜在声明环；不据此认定挂起或失败",
    ]);
    return h(
      "section",
      { "aria-label": "依赖关系与潜在影响" },
      h("h3", null, "依赖关系与潜在影响"),
      ...graph.notes.map((note, i) => h("p", { key: `note:${i}` }, note)),
      h(
        "p",
        null,
        `关系覆盖：${graph.coverage.status === "complete" ? "已覆盖本次提取输入（不等于运行时完整）" : "有限"}${graph.coverage.truncated ? "；已截断，不能当作全量关系或全量受影响者" : ""}。节点 ${graph.nodes.length}，关系 ${graph.edges.length}。`,
      ),
      ...graph.coverage.reasons.map((reason, i) =>
        h("p", { key: `reason:${i}`, role: "note" }, `覆盖限制：${reason}`),
      ),
      table(
        "插件及 loader 条目",
        [
          "插件",
          "宿主条目状态（不代表服务状态）",
          "Context 名称线索（非子作用域证明）",
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
                  `${context.file || "位置未知"}: ${context.names.join(", ")}`,
              )
              .join("；") || "未提取到命名线索",
          ],
        ),
      ),
      relationshipRows.length
        ? table(
            "服务依赖及候选提供者",
            [
              "消费者",
              "服务",
              "端",
              "依赖方式",
              "候选提供者 / loader 状态",
              "依赖来源",
            ],
            relationshipRows,
          )
        : h("p", null, "本次未提取到服务依赖；不等于没有运行时依赖。"),
      providerRows.length
        ? table(
            "提供声明（仅候选）",
            [
              "候选插件 / loader 状态",
              "服务",
              "端",
              "同端潜在消费者",
              "提供来源",
            ],
            providerRows,
          )
        : null,
      packageRows.length
        ? table("客户端包依赖", ["消费者", "客户端包", "语义"], packageRows)
        : null,
      impactRows.length
        ? table(
            "潜在受影响插件及关系路径",
            ["候选起点", "潜在受影响者", "端", "证据边界", "路径"],
            impactRows,
          )
        : h("p", null, "未枚举到可证明同端的传播路径；不等于没有潜在影响。"),
      cycleRows.length
        ? table("潜在声明环", ["端", "关系路径", "说明"], cycleRows)
        : h("p", null, "本次覆盖内未枚举到声明环。"),
      h(
        "p",
        null,
        `预算：节点 ${graph.coverage.limits.nodes}；关系 ${graph.coverage.limits.edges}；传播遍历及路径 ${graph.coverage.limits.traversal}；输入条目 ${graph.coverage.limits.items}。`,
      ),
    );
  };
}
/** Browser-safe React factory. Manual actions stay separate from kernel results. */
export function createFindingReviewPanel(React, ReviewContract, UI = {}) {
  const h = (type, props, ...children) =>
      React.createElement(UI[type] || type, props, ...children),
    labels = ReviewContract.REVIEW_STATUS_LABELS;
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
  }) {
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
          setMessage("人工处置已保存");
      } catch (reason) {
        if (
          current.current.contextToken === target.contextToken &&
          current.current.findingId === target.findingId &&
          !current.current.stale
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
        "data-review-stale": stale,
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
        `${item.pluginName}@${item.pluginVersion} · 发现 ${item.findingIndex + 1} · ${labels[item.status] || item.status}`,
      ),
      stale
        ? h(
            "p",
            { role: "status" },
            "草稿已过期：原报告或发现已变化。不会保存到当前发现；请复制后在新发现中重新核实，或显式放弃草稿。",
          )
        : null,
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
            disabled: busy || (!stale && disabled),
            onChange: (e) => {
              onEdit({ status: e.target.value, note });
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
        busy ? "保存中…" : "保存人工处置",
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
                      "当前浏览器无法复制，请选择核实依据后手动复制",
                    );
                  await navigator.clipboard.writeText(
                    `${item.pluginName}@${item.pluginVersion} · 发现 ${item.findingIndex + 1} · ${labels[status]}\n${note}`,
                  );
                  setMessage("草稿已复制；请在当前发现中重新核实后保存");
                } catch (reason) {
                  setError(reason?.message || "复制失败，请手动复制");
                }
              },
            },
            "复制草稿",
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
            "放弃草稿",
          )
        : null,
      error ? h("p", { role: "alert" }, error) : null,
      message ? h("p", { role: "status" }, message) : null,
    );
  }
  return function FindingReviewPanel({ report, reviews, onSave }) {
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
      setLimit(20);
      setHistoryOpen(false);
      setHistoryLimit(20);
    }, [reviews?.contextToken]);
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
        throw new Error("保存响应无效");
      if (next.error) throw new Error(next.error);
      if (
        current.current.token !== input.contextToken ||
        next.contextToken !== input.contextToken
      )
        throw new Error("报告已变化，请重新核实");
      if (
        current.current.revision !== requestedRevision &&
        current.current.revision !== next.revision
      )
        throw new Error("人工处置记录已变化，草稿已保留；请刷新核实后重试");
      setSaved(next);
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
    const rows = [...drafts].map(([key, draft]) => ({
      key,
      item: currentItems.get(key) || draft.item,
      contextToken: draft.contextToken,
      draft,
      stale: !currentItems.has(key) || !!active?.error,
    }));
    for (const item of items.slice(0, limit)) {
      const key = draftKey(token, item.findingId);
      if (!drafts.has(key))
        rows.push({ key, item, contextToken: token, stale: false });
    }
    return h(
      "section",
      { "aria-label": "发现的人工处置", style: { marginTop: "16px" } },
      h("h3", null, "发现的人工处置"),
      h(
        "p",
        null,
        "人工记录仅供核实追踪，不改变内核发现、总结论、退出码、基线或兼容性豁免；新风险仍完整显示。",
      ),
      !valid
        ? h(
            "p",
            { role: "alert" },
            "人工处置数据无效或暂不可用；保留未保存草稿，请刷新后重试。",
          )
        : active.error
          ? h("p", { role: "alert" }, active.error)
          : null,
      rows.length
        ? rows.map((row) =>
            h(ReviewRow, {
              ...row,
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
                    });
                  return next;
                }),
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
      active?.history?.length
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
/** Offline UI for explicitly imported health evidence. Never starts a runner. */
export function createFunctionalHealthPanel(React, HealthContract, UI = {}) {
  const h = (type, props, ...children) =>
    React.createElement(UI[type] || type, props, ...children);
  const Disclosure = createDisclosure(React, h);
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
          throw new Error("记录超过大小限制（512 KiB）");
        const parsed = JSON.parse(await file.text());
        const checked = HealthContract.validateFunctionalHealthResult(parsed);
        if (!checked.valid) throw new Error(checked.errors.join("；"));
        if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined")
          throw new Error("当前浏览器无法核验记录摘要");
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
          throw new Error("检查声明与记录摘要不一致");
        if (request.current === id) setResult(parsed);
      } catch (reason) {
        if (request.current === id)
          setError("导入失败：" + (reason?.message || reason));
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
      { "aria-label": "功能健康检查", style: { marginTop: "16px" } },
      h("h3", null, "功能健康检查（独立实测记录）"),
      h(
        "p",
        null,
        "在仓库CLI中显式运行所选HTTP/DOM检查后，可导入JSON记录。本面板只读取所选文件，不执行检查、安装插件或访问目标服务。",
      ),
      h("input", {
        type: "file",
        accept: ".json,application/json",
        "aria-label": "导入功能健康检查记录",
        disabled: busy,
        onChange: load,
      }),
      busy ? h("p", { role: "status" }, "正在核验记录…") : null,
      error ? h("p", { role: "alert" }, error) : null,
      !result
        ? h(
            "p",
            null,
            "尚未导入功能实测记录。静态发现、宿主状态和业务健康是不同证据。",
          )
        : h(
            "div",
            { "data-functional-health": result.status },
            h(
              "p",
              null,
              `${artifact.name}@${artifact.version} · DSH ${result.identity.dshVersion} · ${statusLabels[result.status]}`,
            ),
            h(
              "p",
              { role: "status" },
              versionsMatch
                ? "插件与DSH版本相符；当前安装制品尚未核验，此处保留所选制品的历史记录。"
                : "记录与当前报告目标不一致或插件未安装；不用于认证当前目标。",
            ),
            h(
              "p",
              null,
              "测量时间：" + result.startedAt + " → " + result.completedAt,
            ),
            h("p", null, "制品 SHA-256：" + artifact.sha256),
            h(
              "p",
              null,
              "声明 SHA-256：" +
                result.identity.manifestSha256 +
                "；摘要校验不是作者签名或业务认证。",
            ),
            h(
              UI.Fold || Disclosure,
              {
                title: "功能健康检查结果",
                count: `${result.checks.length} 项`,
              },
              () =>
                h(
                  "table",
                  { "aria-label": "功能健康检查结果" },
                  h(
                    "thead",
                    null,
                    h(
                      "tr",
                      null,
                      h("th", null, "检查与声明"),
                      h("th", null, "独立实测"),
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
                            : `${declaration.path} · ${declaration.selector} · 数量 ${declaration.minCount}–${declaration.maxCount}`;
                      return h(
                        "tr",
                        { key: check.id },
                        h("td", null, `${check.id} · ${expected}`),
                        h(
                          "td",
                          null,
                          `${statusLabels[check.status] || check.status} · ${JSON.stringify(check.evidence)}`,
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
              "资源清理：" +
                (result.cleanup.stopped && result.cleanup.removed
                  ? "已停止并清理自有环境"
                  : "未确认完整清理"),
            ),
            h(
              "ul",
              null,
              result.limitations.map((text, i) => h("li", { key: i }, text)),
            ),
            h(
              "p",
              null,
              "仅证明记录中的所选检查结果，不改普通兼容性结论、风险计数、基线或人工处置；不认证全部业务。",
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
              "清除健康检查记录",
            ),
          ),
    );
  };
}
