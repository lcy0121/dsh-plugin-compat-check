// Generated from lib/dependency-graph.mjs; run node plugin/scripts/stage-contract.mjs
/** Browser-safe explanatory graph. Declarations never establish activation or failure. */
const GRAPH_KIND = "plugin-compat-check/dependency-graph";
const GRAPH_LIMITS = Object.freeze({
  nodes: 1000,
  edges: 4000,
  traversal: 20000,
  items: 20000,
});
const graphRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const graphText = (value) => typeof value === "string" && value.length > 0;
const graphArray = (value) => (Array.isArray(value) ? value : []);
const graphSides = (value) => {
  const sides = graphArray(value).filter(
    (side) => side === "host" || side === "client",
  );
  return sides.length ? [...new Set(sides)] : ["unknown"];
};
const graphId = (...parts) => JSON.stringify(parts);
const graphSource = (value) => ({
  file: typeof value?.file === "string" ? value.file : null,
  line: Number.isSafeInteger(value?.line) ? value.line : null,
  start: Number.isSafeInteger(value?.start) ? value.start : null,
  end: Number.isSafeInteger(value?.end) ? value.end : null,
});
const graphRequirement = (kind) =>
  kind === "required-inject"
    ? "required"
    : kind === "scoped-inject"
      ? "subcontext"
      : ["optional-read", "read"].includes(kind)
        ? "optional"
        : "unknown";

export function buildDependencyGraph({
  extraction,
  verdict,
  entries,
  limits = {},
} = {}) {
  const report = extraction?.report || extraction || {};
  const budget = Object.fromEntries(
    Object.entries(GRAPH_LIMITS).map(([key, max]) => [
      key,
      Number.isSafeInteger(limits[key]) && limits[key] >= 0
        ? Math.min(limits[key], max)
        : max,
    ]),
  );
  const nodes = [],
    edges = [],
    impacts = [],
    cycles = [],
    reasons = new Set();
  const nodeMap = new Map(),
    edgeKeys = new Set(),
    plugins = new Map();
  let truncated = false,
    items = 0,
    steps = 0,
    pathItems = 0;
  const limit = (reason) => {
    truncated = true;
    reasons.add(reason);
  };
  const consume = () => {
    if (items >= budget.items) {
      limit("输入条目达到预算，关系及来源未完整读取");
      return false;
    }
    items++;
    return true;
  };
  const addNode = (node) => {
    if (nodeMap.has(node.id)) return nodeMap.get(node.id);
    if (nodes.length >= budget.nodes) {
      limit("节点达到预算，关系图已截断");
      return null;
    }
    nodes.push(node);
    nodeMap.set(node.id, node);
    return node;
  };
  const addEdge = (edge) => {
    if (!nodeMap.has(edge.from) || !nodeMap.has(edge.to)) return;
    const key = JSON.stringify(edge);
    if (edgeKeys.has(key)) return;
    if (edges.length >= budget.edges) {
      limit("关系达到预算，关系图已截断");
      return;
    }
    edgeKeys.add(key);
    edges.push({ id: `edge:${edges.length}`, ...edge });
  };
  const service = (name, side) =>
    addNode({
      id: graphId("service", side, name),
      kind: "service",
      name,
      side,
      state: "unknown",
    });
  const entryMap = new Map();
  const rows = Array.isArray(entries)
    ? entries
    : graphArray(verdict?.observation?.entries?.plugins);
  for (const row of rows) {
    if (!consume()) break;
    if (!graphRecord(row) || !graphText(row.packageName) || row.group) continue;
    if (!entryMap.has(row.packageName)) entryMap.set(row.packageName, []);
    entryMap.get(row.packageName).push({
      id: typeof row.id === "string" ? row.id : null,
      state: typeof row.state === "string" ? row.state : "unknown",
      disabled: row.disabled === true,
    });
  }
  if (report.scanComplete !== true)
    reasons.add("静态提取覆盖不完整或未声明，关系可能缺失");
  for (const [name, p] of Object.entries(report.perPlugin || {})) {
    if (!consume()) break;
    if (!graphRecord(p)) continue;
    const entryRows = entryMap.get(name) || [];
    const enabled = entryRows.filter((row) => !row.disabled);
    const states = [...new Set(enabled.map((row) => row.state))];
    const loaderState =
      entryRows.length && !enabled.length
        ? "disabled"
        : states.length === 1
          ? states[0]
          : states.length > 1
            ? "mixed"
            : "unknown";
    if (loaderState === "unknown")
      reasons.add("部分插件未提供可映射 loader 条目，状态为未知");
    const node = addNode({
      id: graphId("plugin", name),
      kind: "plugin",
      name,
      entries: entryRows,
      loaderState,
      subContexts: [],
    });
    if (!node) break;
    plugins.set(name, { node, plugin: p });
    if (graphArray(p.diagnostics).length)
      reasons.add("部分源码存在提取诊断，关系可能缺失");
    for (const context of graphArray(p.subContexts)) {
      if (!consume()) break;
      if (!graphRecord(context)) continue;
      const names = [];
      for (const name of graphArray(context.names)) {
        if (!consume()) break;
        if (graphText(name)) names.push(name);
      }
      node.subContexts.push({
        file: typeof context.file === "string" ? context.file : null,
        names,
      });
    }
  }
  for (const { node, plugin: p } of plugins.values()) {
    const declaredRelations = new Set();
    for (const dependency of graphArray(p.dependencies)) {
      if (!consume()) break;
      if (!graphText(dependency?.service)) continue;
      const sides = graphSides(dependency.sides);
      if (sides.includes("unknown"))
        reasons.add("部分依赖端归属未知，不用于传播推导");
      if (graphRequirement(dependency.kind) === "unknown")
        reasons.add("部分依赖必需性未证实，保留未知标记");
      for (const side of sides) {
        declaredRelations.add(graphId(dependency.service, side));
        const target = service(dependency.service, side);
        if (target)
          addEdge({
            kind: "dependency",
            from: node.id,
            to: target.id,
            service: dependency.service,
            side,
            requirement: graphRequirement(dependency.kind),
            declarationKind:
              typeof dependency.kind === "string" ? dependency.kind : "unknown",
            source: graphSource(dependency),
            potential: true,
          });
      }
    }
    for (const site of graphArray(p.callSites)) {
      if (!consume()) break;
      if (!graphText(site?.service)) continue;
      for (const side of graphSides(site.sides)) {
        const key = graphId(site.service, side);
        if (declaredRelations.has(key)) continue;
        declaredRelations.add(key);
        reasons.add("部分服务只见调用点，依赖必需性未知");
        const target = service(site.service, side);
        if (target)
          addEdge({
            kind: "dependency",
            from: node.id,
            to: target.id,
            service: site.service,
            side,
            requirement: "unknown",
            declarationKind: "call",
            source: graphSource(site),
            potential: true,
          });
      }
    }
    const provided = new Set();
    for (const site of graphArray(p.provideSites)) {
      if (!consume()) break;
      if (!graphText(site?.service)) continue;
      provided.add(site.service);
      for (const side of graphSides(site.sides)) {
        if (side === "unknown")
          reasons.add("部分提供声明缺少端归属，只列候选，不用于传播推导");
        const target = service(site.service, side);
        if (target)
          addEdge({
            kind: "candidate-provider",
            from: node.id,
            to: target.id,
            service: site.service,
            side,
            source: graphSource(site),
            sideMatch: side === "unknown" ? "unverified" : "source",
            potential: true,
          });
      }
    }
    for (const name of graphArray(p.providedServices)) {
      if (!consume()) break;
      if (!graphText(name) || provided.has(name)) continue;
      reasons.add("部分提供声明缺少端归属，只列候选，不用于传播推导");
      const target = service(name, "unknown");
      if (target)
        addEdge({
          kind: "candidate-provider",
          from: node.id,
          to: target.id,
          service: name,
          side: "unknown",
          source: graphSource(null),
          sideMatch: "unverified",
          potential: true,
        });
    }
    if (
      p.clientInject !== undefined &&
      p.clientInject !== null &&
      !Array.isArray(p.clientInject)
    )
      reasons.add("客户端包 inject 声明格式未识别，未猜测服务关系");
    for (const name of graphArray(p.clientInject)) {
      if (!consume()) break;
      if (!graphText(name)) {
        reasons.add("客户端包 inject 含未识别条目");
        continue;
      }
      const target = addNode({
        id: graphId("client-package", name),
        kind: "client-package",
        name,
        side: "client",
      });
      if (target)
        addEdge({
          kind: "client-package-inject",
          from: node.id,
          to: target.id,
          side: "client",
          potential: true,
        });
    }
  }
  const provisions = new Map(),
    consumers = new Map(),
    cycleKeys = new Set();
  for (const edge of edges) {
    if (edge.side === "unknown") continue;
    const map =
      edge.kind === "candidate-provider"
        ? provisions
        : edge.kind === "dependency"
          ? consumers
          : null;
    const key = edge.kind === "candidate-provider" ? edge.from : edge.to;
    if (map) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(edge);
    }
  }
  const step = () => {
    if (steps >= budget.traversal) {
      limit("传播遍历达到预算，潜在影响及环未完整枚举");
      return false;
    }
    steps++;
    return true;
  };
  for (const { node } of plugins.values()) {
    const affected = [],
      queue = [
        {
          plugin: node.id,
          side: null,
          path: [],
          requirements: [],
          plugins: [node.id],
        },
      ],
      seen = new Set();
    for (let head = 0; head < queue.length; head++) {
      if (!step()) break;
      const current = queue[head];
      for (const provision of provisions.get(current.plugin) || []) {
        if (!step()) break;
        if (current.side && provision.side !== current.side) continue;
        for (const dependency of consumers.get(provision.to) || []) {
          if (!step()) break;
          const path = [...current.path, provision.id, dependency.id];
          const requirement = [...current.requirements, dependency.requirement];
          const pluginPath = [...current.plugins, dependency.from];
          if (pathItems + path.length > budget.traversal) {
            limit("关系路径达到预算，潜在影响及环未完整列出");
            continue;
          }
          if (dependency.from === node.id) {
            const ring = pluginPath.slice(0, -1);
            const key = JSON.stringify([
              provision.side,
              [
                ...ring.map((_, i) =>
                  JSON.stringify([...ring.slice(i), ...ring.slice(0, i)]),
                ),
              ].sort()[0],
            ]);
            if (!cycleKeys.has(key)) {
              pathItems += path.length;
              cycleKeys.add(key);
              cycles.push({
                plugins: pluginPath,
                side: provision.side,
                path,
                potential: true,
              });
            }
            continue;
          }
          const key = graphId(dependency.from, provision.side);
          if (seen.has(key)) continue;
          seen.add(key);
          pathItems += path.length;
          affected.push({
            plugin: dependency.from,
            side: provision.side,
            path,
            requirements: requirement,
            potential: true,
          });
          queue.push({
            plugin: dependency.from,
            side: provision.side,
            path,
            requirements: requirement,
            plugins: pluginPath,
          });
        }
      }
    }
    impacts.push({ plugin: node.id, potential: true, affected });
  }
  return {
    schemaVersion: 1,
    kind: GRAPH_KIND,
    nodes,
    edges,
    impacts,
    cycles,
    coverage: {
      status: reasons.size ? "limited" : "complete",
      truncated,
      reasons: [...reasons],
      limits: budget,
    },
    notes: [
      "提供声明仅为候选线索；loader 条目状态不证明服务已注册。",
      "多个候选不表示实际选择了其中之一；替代提供者、禁用条目及可选依赖均需在真实宿主复核。",
      "受影响者及环仅表示同端声明关系的潜在影响，不表示实际挂起或失败；可选及子作用域依赖不等于根插件阻断。",
      "host/client 独立；client 包 inject 不当作 host 服务依赖；端未知的声明不用于传播推导。",
    ],
  };
}

/** Reject malformed optional views before rendering without changing the core report. */
export function validateDependencyGraph(graph) {
  if (
    !graphRecord(graph) ||
    graph.kind !== GRAPH_KIND ||
    graph.schemaVersion !== 1
  )
    return false;
  const coverage = graph.coverage;
  if (
    !graphRecord(coverage) ||
    !["limited", "complete"].includes(coverage.status) ||
    typeof coverage.truncated !== "boolean" ||
    !Array.isArray(coverage.reasons) ||
    coverage.reasons.length > 100 ||
    !coverage.reasons.every(graphText) ||
    !graphRecord(coverage.limits)
  )
    return false;
  if (
    (coverage.truncated && coverage.status !== "limited") ||
    (coverage.status === "complete" && coverage.reasons.length) ||
    (coverage.status === "limited" && !coverage.reasons.length)
  )
    return false;
  for (const [key, max] of Object.entries(GRAPH_LIMITS))
    if (
      !Number.isSafeInteger(coverage.limits[key]) ||
      coverage.limits[key] < 0 ||
      coverage.limits[key] > max
    )
      return false;
  if (
    !Array.isArray(graph.nodes) ||
    graph.nodes.length > coverage.limits.nodes ||
    !Array.isArray(graph.edges) ||
    graph.edges.length > coverage.limits.edges ||
    !Array.isArray(graph.impacts) ||
    !Array.isArray(graph.cycles) ||
    !Array.isArray(graph.notes) ||
    graph.notes.length > 100 ||
    !graph.notes.every(graphText)
  )
    return false;
  const nodes = new Map(),
    edges = new Map();
  const validSide = (side) => ["host", "client", "unknown"].includes(side);
  const nonnegative = (value) =>
    value === null || (Number.isSafeInteger(value) && value >= 0);
  const source = (value) =>
    graphRecord(value) &&
    (value.file === null || typeof value.file === "string") &&
    nonnegative(value.line) &&
    nonnegative(value.start) &&
    nonnegative(value.end) &&
    (value.start === null || value.end === null || value.end >= value.start);
  let nestedItems = 0,
    pathItems = 0;
  for (const node of graph.nodes) {
    if (
      !graphRecord(node) ||
      !graphText(node.id) ||
      nodes.has(node.id) ||
      !graphText(node.name) ||
      !["plugin", "service", "client-package"].includes(node.kind)
    )
      return false;
    if (node.kind === "plugin") {
      if (
        !graphText(node.loaderState) ||
        !Array.isArray(node.entries) ||
        !Array.isArray(node.subContexts)
      )
        return false;
      nestedItems += node.entries.length + node.subContexts.length;
      if (nestedItems > coverage.limits.items) return false;
      if (
        !node.entries.every(
          (row) =>
            graphRecord(row) &&
            (row.id === null || typeof row.id === "string") &&
            graphText(row.state) &&
            typeof row.disabled === "boolean",
        )
      )
        return false;
      for (const context of node.subContexts) {
        if (
          !graphRecord(context) ||
          (context.file !== null && typeof context.file !== "string") ||
          !Array.isArray(context.names)
        )
          return false;
        nestedItems += context.names.length;
        if (
          nestedItems > coverage.limits.items ||
          !context.names.every(graphText)
        )
          return false;
      }
    } else if (
      !validSide(node.side) ||
      (node.kind === "service" && node.state !== "unknown") ||
      (node.kind === "client-package" && node.side !== "client")
    )
      return false;
    nodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (
      !graphRecord(edge) ||
      !graphText(edge.id) ||
      edges.has(edge.id) ||
      !nodes.has(edge.from) ||
      !nodes.has(edge.to) ||
      nodes.get(edge.from).kind !== "plugin" ||
      !validSide(edge.side) ||
      edge.potential !== true
    )
      return false;
    if (edge.kind === "client-package-inject") {
      if (
        nodes.get(edge.to).kind !== "client-package" ||
        edge.side !== "client"
      )
        return false;
    } else if (["dependency", "candidate-provider"].includes(edge.kind)) {
      if (
        nodes.get(edge.to).kind !== "service" ||
        !graphText(edge.service) ||
        nodes.get(edge.to).name !== edge.service ||
        nodes.get(edge.to).side !== edge.side ||
        !source(edge.source)
      )
        return false;
      if (
        edge.kind === "dependency" &&
        (!["required", "optional", "subcontext", "unknown"].includes(
          edge.requirement,
        ) ||
          !graphText(edge.declarationKind) ||
          edge.requirement !== graphRequirement(edge.declarationKind))
      )
        return false;
      if (
        edge.kind === "candidate-provider" &&
        edge.sideMatch !== (edge.side === "unknown" ? "unverified" : "source")
      )
        return false;
    } else return false;
    edges.set(edge.id, edge);
  }
  const validPath = (path, from, to, side, requirements, pluginPath) => {
    if (!Array.isArray(path) || path.length < 2 || path.length % 2)
      return false;
    pathItems += path.length;
    if (pathItems > coverage.limits.traversal) return false;
    if (
      requirements &&
      (!Array.isArray(requirements) || requirements.length * 2 !== path.length)
    )
      return false;
    if (
      pluginPath &&
      (!Array.isArray(pluginPath) ||
        pluginPath.length !== path.length / 2 + 1 ||
        pluginPath[0] !== from)
    )
      return false;
    let current = from;
    for (let i = 0; i < path.length; i += 2) {
      const provider = edges.get(path[i]),
        consumer = edges.get(path[i + 1]);
      if (
        provider?.kind !== "candidate-provider" ||
        consumer?.kind !== "dependency" ||
        provider.side !== side ||
        consumer.side !== side ||
        provider.from !== current ||
        provider.to !== consumer.to
      )
        return false;
      if (requirements && requirements[i / 2] !== consumer.requirement)
        return false;
      current = consumer.from;
      if (pluginPath && pluginPath[i / 2 + 1] !== current) return false;
    }
    return current === to;
  };
  if (
    graph.impacts.length > graph.nodes.length ||
    graph.cycles.length > coverage.limits.traversal
  )
    return false;
  const roots = new Set();
  let relationships = 0;
  for (const impact of graph.impacts) {
    if (
      !graphRecord(impact) ||
      nodes.get(impact.plugin)?.kind !== "plugin" ||
      roots.has(impact.plugin) ||
      impact.potential !== true ||
      !Array.isArray(impact.affected) ||
      impact.affected.length > coverage.limits.traversal
    )
      return false;
    roots.add(impact.plugin);
    const affected = new Set();
    for (const row of impact.affected) {
      if (
        ++relationships > coverage.limits.traversal ||
        !graphRecord(row) ||
        nodes.get(row.plugin)?.kind !== "plugin" ||
        row.plugin === impact.plugin ||
        row.potential !== true ||
        !["host", "client"].includes(row.side) ||
        !Array.isArray(row.requirements) ||
        !validPath(
          row.path,
          impact.plugin,
          row.plugin,
          row.side,
          row.requirements,
        )
      )
        return false;
      const key = graphId(row.plugin, row.side);
      if (affected.has(key)) return false;
      affected.add(key);
    }
  }
  for (const cycle of graph.cycles) {
    if (
      !graphRecord(cycle) ||
      cycle.potential !== true ||
      !["host", "client"].includes(cycle.side) ||
      !Array.isArray(cycle.plugins) ||
      cycle.plugins.length < 2 ||
      cycle.plugins[0] !== cycle.plugins.at(-1) ||
      !cycle.plugins.every((id) => nodes.get(id)?.kind === "plugin") ||
      !validPath(
        cycle.path,
        cycle.plugins[0],
        cycle.plugins[0],
        cycle.side,
        null,
        cycle.plugins,
      )
    )
      return false;
  }
  return true;
}
