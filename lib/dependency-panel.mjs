/** Stateless React factory; staged verbatim into the shipped client. */
export function createDependencyPanel(React, GraphContract = {}) {
  const h = React.createElement;
  const requirement = {
    required: "必需",
    optional: "可选 / 软读取",
    subcontext: "子作用域",
    unknown: "必需性未知",
  };
  const table = (caption, headers, rows) =>
    h(
      "div",
      { style: { overflowX: "auto", marginBottom: 16 } },
      h(
        "table",
        { style: { borderCollapse: "collapse", width: "100%", fontSize: 13 } },
        h(
          "caption",
          { style: { textAlign: "left", fontWeight: 600, padding: "8px 0" } },
          caption,
        ),
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...headers.map((label, i) =>
              h(
                "th",
                {
                  key: i,
                  scope: "col",
                  style: {
                    textAlign: "left",
                    padding: 6,
                    borderBottom: "1px solid #777",
                  },
                },
                label,
              ),
            ),
          ),
        ),
        h(
          "tbody",
          null,
          ...rows.map((row, i) =>
            h(
              "tr",
              { key: i },
              ...row.map((cell, j) =>
                h(
                  "td",
                  {
                    key: j,
                    style: {
                      verticalAlign: "top",
                      padding: 6,
                      borderBottom: "1px solid #9995",
                      overflowWrap: "anywhere",
                    },
                  },
                  cell,
                ),
              ),
            ),
          ),
        ),
      ),
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
    const relationshipRows = graph.edges
      .filter((edge) => edge.kind === "dependency")
      .map((edge) => {
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
      });
    const providerRows = graph.edges
      .filter((edge) => edge.kind === "candidate-provider")
      .map((edge) => [
        candidateLabel(edge),
        edge.service,
        edge.side,
        (consumers.get(edge.to) || [])
          .map((c) => `${name(c.from)}（${requirement[c.requirement]}）`)
          .join("；") || "没有同端消费者证据",
        source(edge),
      ]);
    const packageRows = graph.edges
      .filter((edge) => edge.kind === "client-package-inject")
      .map((edge) => [
        name(edge.from),
        name(edge.to),
        "client 包级 inject；不作为 host 服务关系或传播依据",
      ]);
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
    const impactRows = graph.impacts.flatMap((impact) =>
      impact.affected.map((row) => [
        name(impact.plugin),
        name(row.plugin),
        row.side,
        "潜在影响；非实测故障",
        pathLabel(impact.plugin, row.path),
      ]),
    );
    const cycleRows = graph.cycles.map((cycle) => [
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
        graph.nodes
          .filter((node) => node.kind === "plugin")
          .map((node) => [
            node.name,
            entries(node),
            node.subContexts
              .filter((context) => context.names.length)
              .map(
                (context) =>
                  `${context.file || "位置未知"}: ${context.names.join(", ")}`,
              )
              .join("；") || "未提取到命名线索",
          ]),
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
