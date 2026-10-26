import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "../bin/compat-check.mjs";
import { toJSON, render } from "../lib/report.mjs";
import { packageFixture } from "./fixture-utils.mjs";
import { panelHarness } from "./support/panel-harness.mjs";

// Catches reports silently dropping dependency declarations before consumers see them.
test("successful JSON reports expose required host relationships without changing the verdict", () => {
  const fixture = packageFixture(
    'export const inject=["settings"]; export function apply(ctx){ctx.settings.known();}',
  );
  try {
    const result = run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    });
    const before = JSON.stringify(result.verdict);
    const report = toJSON(result);
    assert.deepEqual(
      report.dependencyGraph?.edges
        ?.filter((e) => e.kind === "dependency")
        .map((e) => [e.service, e.requirement, e.side]),
      [["settings", "required", "host"]],
    );
    assert.equal(JSON.stringify(result.verdict), before);
  } finally {
    fixture.cleanup();
  }
});

// Catches provider flattening that would connect a client's service to a host consumer.
test("real extraction retains each provide source side independently of other service uses", () => {
  const fixture = packageFixture(
    'export const provide=["hostSvc"];export function apply(ctx){ctx.provide("callSvc",{});}',
    {
      meta: {
        dsh: {
          bundle: { patch: "cordis.patch.yml" },
          client: { platform: "web", inject: ["client-dep-package"] },
        },
      },
      files: {
        "client.js":
          'export function apply(ctx){ctx.provide("clientSvc",{});ctx.hostSvc.use();}',
      },
    },
  );
  try {
    const result = run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    });
    const sites = result.extract.report.perPlugin.sample.provideSites;
    assert.deepEqual(sites?.map((s) => [s.service, s.sides, s.file]).sort(), [
      ["callSvc", ["host"], "index.js"],
      ["clientSvc", ["client"], "client.js"],
      ["hostSvc", ["host"], "index.js"],
    ]);
    assert.ok(
      sites.every(
        (s) =>
          Number.isInteger(s.start) &&
          Number.isInteger(s.end) &&
          s.end > s.start,
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

const graphModule = await import("../lib/dependency-graph.mjs");
const graphOf = (perPlugin, options = {}) =>
  graphModule.buildDependencyGraph({
    extraction: { perPlugin, scanComplete: true },
    ...options,
  });
const dependency = (service, kind = "required-inject", side = "host") => ({
  service,
  kind,
  file: `${side}.js`,
  line: 1,
  start: 0,
  end: 10,
  sides: [side],
});
const provider = (service, side = "host") => ({
  providedServices: [service],
  provideSites: [
    { service, file: `${side}.js`, line: 1, start: 0, end: 10, sides: [side] },
  ],
});
const byId = (graph, id) => graph.nodes.find((n) => n.id === id);

// Catches flattening optional, scoped, soft-read, unknown and client-package declarations into host requirements.
test("relationships retain requirement, source side and client-package namespace", () => {
  const graph = graphOf({
    consumer: {
      dependencies: [
        dependency("a"),
        dependency("b", "optional-read"),
        dependency("c", "scoped-inject"),
        dependency("d", "descriptor-inject"),
        dependency("e", "read", "client"),
        { service: "f", kind: "future" },
      ],
      clientInject: ["a"],
      subContexts: [{ file: "host.js", names: ["child"] }],
      fileSides: { "host.js": ["host"] },
    },
  });
  assert.deepEqual(
    graph.edges
      .filter((e) => e.kind === "dependency")
      .map((e) => [e.service, e.requirement, e.side]),
    [
      ["a", "required", "host"],
      ["b", "optional", "host"],
      ["c", "subcontext", "host"],
      ["d", "unknown", "host"],
      ["e", "optional", "client"],
      ["f", "unknown", "unknown"],
    ],
  );
  const injected = graph.edges.find((e) => e.kind === "client-package-inject");
  assert.equal(byId(graph, injected.to).kind, "client-package");
  assert.notEqual(injected.to, graph.edges[0].to);
  assert.deepEqual(graph.nodes.find((n) => n.kind === "plugin").subContexts, [
    { file: "host.js", names: ["child"] },
  ]);
});

// Catches missing or unrelated loader evidence being mistaken for ACTIVE, and disabled candidates being hidden.
test("candidate providers keep multiple and disabled loader entries without asserting service activation", () => {
  const graph = graphOf(
    {
      one: provider("svc"),
      two: provider("svc"),
      consumer: { dependencies: [dependency("svc")] },
    },
    {
      entries: [
        { id: "x", packageName: "one", state: "ACTIVE", disabled: true },
        { id: "group", packageName: "two", state: "FAILED", group: true },
      ],
    },
  );
  const candidates = graph.edges.filter((e) => e.kind === "candidate-provider");
  assert.equal(candidates.length, 2);
  assert.equal(byId(graph, candidates[0].from).loaderState, "disabled");
  assert.equal(byId(graph, candidates[1].from).loaderState, "unknown");
  assert.equal(
    candidates.every((e) => e.potential === true),
    true,
  );
  assert.equal(graph.nodes.find((n) => n.kind === "service").state, "unknown");
});

// Catches losing transitive consumers or turning declaration cycles into runtime failures.
test("same-side declarations expose potential transitive paths and cycles", () => {
  const graph = graphOf({
    a: { ...provider("aSvc"), dependencies: [dependency("bSvc")] },
    b: { ...provider("bSvc"), dependencies: [dependency("aSvc")] },
    c: { dependencies: [dependency("bSvc", "optional-read")] },
  });
  const impact = graph.impacts.find((i) => byId(graph, i.plugin).name === "a");
  assert.deepEqual(
    impact.affected.map((i) => byId(graph, i.plugin).name).sort(),
    ["b", "c"],
  );
  const toC = impact.affected.find((i) => byId(graph, i.plugin).name === "c");
  assert.equal(toC.path.length, 4);
  assert.deepEqual(toC.requirements, ["required", "optional"]);
  assert.equal(graph.cycles.length, 1);
  assert.equal(graph.cycles[0].potential, true);
  assert.deepEqual(
    graph.cycles[0].plugins.map((id) => byId(graph, id).name).sort(),
    ["a", "a", "b"],
  );
});

// Catches cross-side or unattributed provide strings creating false propagation paths.
test("client provisions and unknown provider sources never become host propagation evidence", () => {
  const graph = graphOf({
    client: provider("svc", "client"),
    legacy: { providedServices: ["svc"] },
    host: { dependencies: [dependency("svc")] },
    ui: { dependencies: [dependency("svc", "required-inject", "client")] },
  });
  const client = graph.impacts.find(
    (i) => byId(graph, i.plugin).name === "client",
  );
  assert.deepEqual(
    client.affected.map((i) => byId(graph, i.plugin).name),
    ["ui"],
  );
  assert.equal(
    graph.impacts.find((i) => byId(graph, i.plugin).name === "legacy").affected
      .length,
    0,
  );
  assert.equal(
    graph.edges.find(
      (e) =>
        e.kind === "candidate-provider" &&
        byId(graph, e.from).name === "legacy",
    ).side,
    "unknown",
  );
  assert.equal(graph.coverage.status, "limited");
});

// Catches graph expansion or traversal silently exceeding its published budget.
test("node edge and traversal limits explicitly report incomplete relationships", () => {
  const source = {
    a: provider("aSvc"),
    b: { ...provider("bSvc"), dependencies: [dependency("aSvc")] },
    c: { dependencies: [dependency("bSvc")] },
  };
  for (const limits of [
    { nodes: 2 },
    { edges: 1 },
    { traversal: 1 },
    { items: 1 },
  ]) {
    const graph = graphOf(source, { limits });
    assert.equal(graph.coverage.truncated, true, JSON.stringify(limits));
    assert.equal(graph.coverage.status, "limited");
    assert.ok(graph.coverage.reasons.length);
    assert.ok(graph.nodes.length <= graph.coverage.limits.nodes);
    assert.ok(graph.edges.length <= graph.coverage.limits.edges);
    assert.equal(graphModule.validateDependencyGraph(graph), true);
  }
});

// Catches inherited dictionary keys being mistaken for plugin names, services or evidence.
test("prototype-like names round trip as data and malformed graph references are rejected", () => {
  const source = JSON.parse(
    '{"__proto__":{"providedServices":["constructor"],"provideSites":[{"service":"constructor","sides":["host"]}]},"constructor":{"dependencies":[{"service":"constructor","kind":"required-inject","sides":["host"]}]}}',
  );
  const graph = graphOf(source);
  assert.equal(graph.nodes.filter((n) => n.kind === "plugin").length, 2);
  assert.equal(
    graphModule.validateDependencyGraph(JSON.parse(JSON.stringify(graph))),
    true,
  );
  const bad = structuredClone(graph);
  bad.edges[0].to = "missing";
  assert.equal(graphModule.validateDependencyGraph(bad), false);
  assert.equal(graphModule.validateDependencyGraph(null), false);
});

// Catches graphs hiding a consumer simply because it accesses a context service without inject.
test("source attributed service calls remain visible when no dependency declaration exists", () => {
  const graph = graphOf({
    consumer: {
      callSites: [
        {
          service: "actual",
          method: "run",
          file: "client.js",
          line: 2,
          start: 10,
          end: 30,
          sides: ["client"],
        },
      ],
      services: ["actual"],
    },
  });
  assert.deepEqual(
    graph.edges
      .filter((e) => e.kind === "dependency")
      .map((e) => [e.service, e.side, e.requirement, e.source.file]),
    [["actual", "client", "unknown", "client.js"]],
  );
});

// Catches corrupt optional graph paths fabricating consumers across disconnected sides or dependencies.
test("optional graph validation rejects fabricated paths and unbounded nested payloads", () => {
  const graph = graphOf({
    a: provider("svc"),
    b: { dependencies: [dependency("svc")] },
  });
  for (const mutate of [
    (g) => g.impacts[0].affected[0].path.reverse(),
    (g) => (g.impacts[0].affected[0].side = "client"),
    (g) => (g.impacts[0].affected[0].requirements[0] = "optional"),
    (g) => (g.impacts[0].affected[0].plugin = g.impacts[0].plugin),
    (g) =>
      (g.nodes[0].entries = Array(20001).fill({
        id: "x",
        state: "ACTIVE",
        disabled: false,
      })),
    (g) => {
      g.coverage.truncated = true;
      g.coverage.status = "complete";
    },
    (g) => (g.nodes.find((n) => n.kind === "service").state = "ACTIVE"),
    (g) => (g.edges[0].source.line = Infinity),
  ]) {
    const bad = structuredClone(graph);
    mutate(bad);
    assert.equal(graphModule.validateDependencyGraph(bad), false);
  }
});

// Catches a dependency view hiding disabled alternative candidates or presenting potential paths as measured failures.
test("dependency panel renders candidate states, requirements and potential paths while rejecting corrupt extension data", async () => {
  const module = await import("../lib/workflow-panels.mjs").catch((error) => {
    if (error.code === "ERR_MODULE_NOT_FOUND")
      assert.fail("依赖关系视图尚无可渲染组件");
    throw error;
  });
  const graph = graphOf(
    {
      a: provider("svc"),
      alternate: provider("svc"),
      b: { dependencies: [dependency("svc", "optional-read")] },
    },
    {
      entries: [
        {
          id: "disabled",
          packageName: "alternate",
          disabled: true,
          state: "ACTIVE",
        },
      ],
    },
  );
  const fixture = packageFixture("export function apply(){}");
  const report = toJSON(
    run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  const payload = (graph) => ({
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    baseline: null,
    report: { ...report, dependencyGraph: graph },
  });
  let h;
  try {
    h = await panelHarness(payload(graph));
    for (const label of [
      "插件及 loader 条目",
      "服务依赖及候选提供者",
      "提供声明（仅候选）",
      "潜在受影响插件及关系路径",
    ]) {
      const toggle = h.find(
        (n) => n.type === "button" && n.props["aria-label"] === "展开" + label,
      );
      assert(toggle, label);
      toggle.props.onClick();
      h.render();
    }
    for (const part of [
      "a",
      "alternate",
      "b",
      "svc",
      "可选",
      "disabled",
      "潜在",
      "host",
    ])
      assert.ok(h.text().includes(part), part);
    h.dispose();
    const bad = structuredClone(graph);
    bad.edges[0].to = "missing";
    h = await panelHarness(payload(bad));
    assert.ok(h.text().includes("不可用"));
    assert.ok(!h.text().includes("alternate"));
    assert.ok(
      !h.find(
        (n) =>
          n.type === "button" &&
          n.props["aria-label"] === "展开插件及 loader 条目",
      ),
    );
    // Missing optional data remains explicit without suppressing core results.
    const missing = module.createDependencyPanel(
      {
        createElement: (type, props, ...children) => ({
          type,
          props,
          children,
        }),
      },
      graphModule,
    )({ graph: null });
    assert.match(JSON.stringify(missing), /未提供/);
  } finally {
    h?.dispose();
    fixture.cleanup();
  }
});

// Catches CLI consumers receiving only a total count with no actionable service relationship.
test("CLI explains required relationships and limits without changing quiet output", () => {
  const fixture = packageFixture(
    'export const inject=["settings"];export function apply(){}',
  );
  try {
    const result = run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    });
    const output = render(result, {});
    assert.ok(output.includes("sample → settings [host/必需]"));
    assert.ok(output.includes("候选提供者"));
    assert.ok(output.includes("提供声明仅为候选"));
    assert.equal(render(result, { quiet: true }).split("\n").length, 1);
  } finally {
    fixture.cleanup();
  }
});

// Protects caller attribution: shared source files alone do not establish both runtime sides.
test("shared helper provide sites keep each proven caller side", () => {
  const fixture = packageFixture(
    "import {register} from './shared.js';export function apply(ctx){register(ctx,'hostOnly');}",
    {
      meta: {
        exports: { ".": "./index.js", "./client": "./client.js" },
        dsh: {
          bundle: { patch: "cordis.patch.yml" },
          client: { platform: "web" },
        },
      },
      files: {
        "client.js":
          "import {register} from './shared.js';export function apply(ctx){register(ctx,'clientOnly');}",
        "shared.js": "export function register(ctx,name){ctx.provide(name,{})}",
      },
    },
  );
  try {
    const result = run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    });
    assert.deepEqual(
      result.extract.report.perPlugin.sample.provideSites.map((site) => [
        site.service,
        site.sides,
        site.file,
      ]),
      [
        ["hostOnly", ["host"], "shared.js"],
        ["clientOnly", ["client"], "shared.js"],
      ],
    );
  } finally {
    fixture.cleanup();
  }
});

// Catches CLI loader evidence reaching verdicts but disappearing from the graph sidecar.
test("CLI JSON retains only accepted probe loader rows in dependency graph entries", () => {
  const fixture = packageFixture(
    'export const provide=["svc"];export function apply(){}',
  );
  try {
    const base = {
      observationVersion: 1,
      profileId: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      probedAt: new Date().toISOString(),
      root: {},
      entries: {
        plugins: [
          {
            id: "sample-entry",
            packageName: "sample",
            state: "FAILED",
            disabled: false,
          },
        ],
      },
    };
    const valid = run({
      nm: fixture.nm,
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
      _hostSurface: base,
    });
    assert.equal(valid.verdict.observation.usable, true);
    const plugin = toJSON(valid).dependencyGraph.nodes.find(
      (node) => node.kind === "plugin" && node.name === "sample",
    );
    assert.equal(plugin.loaderState, "FAILED");
    assert.deepEqual(plugin.entries, [
      { id: "sample-entry", state: "FAILED", disabled: false },
    ]);
    for (const change of [
      { probedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
      { probedAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() },
      { profileId: fixture.nm + "/other" },
      { dshVersion: "0.2.0-rc.2" },
    ]) {
      const rejected = run({
        nm: fixture.nm,
        dshVersion: "0.2.1-rc.2",
        baseline: false,
        _ignoreAutoProbe: true,
        _hostSurface: { ...base, ...change },
      });
      assert.equal(rejected.verdict.observation.usable, false);
      const node = toJSON(rejected).dependencyGraph.nodes.find(
        (node) => node.kind === "plugin" && node.name === "sample",
      );
      assert.equal(node.loaderState, "unknown");
      assert.deepEqual(node.entries, []);
    }
  } finally {
    fixture.cleanup();
  }
});

// Catches schema-valid relationship labels weakening required inject evidence or omitting path requirements.
test("dependency validation binds requirement labels to declarations and requires complete impact requirements", () => {
  const graph = graphOf({
    provider: provider("svc"),
    consumer: { dependencies: [dependency("svc")] },
  });
  const impact = graph.impacts.find((item) => item.affected.length);
  assert.ok(impact);
  for (const value of [undefined, null, 0, false, ""]) {
    const bad = structuredClone(graph);
    bad.impacts.find((item) => item.affected.length).affected[0].requirements =
      value;
    assert.equal(
      graphModule.validateDependencyGraph(bad),
      false,
      `requirements ${String(value)}`,
    );
  }
  assert.equal(graphModule.validateDependencyGraph(graph), true);
});

// Catches weakening a required declaration even when a matching forged path label is supplied.
test("dependency validation rejects declaration and requirement contradictions", () => {
  const weakened = graphOf({
    provider: provider("svc"),
    consumer: { dependencies: [dependency("svc")] },
  });
  weakened.edges.find((edge) => edge.kind === "dependency").requirement =
    "optional";
  weakened.impacts.find(
    (item) => item.affected.length,
  ).affected[0].requirements = ["optional"];
  assert.equal(graphModule.validateDependencyGraph(weakened), false);
});

test("large dependency disclosures format only the opened page, preserving all rows and limits", async () => {
  const { createDependencyPanel } = await import("../lib/workflow-panels.mjs");
  const graph = graphOf(
    Object.fromEntries(
      Array.from({ length: 123 }, (_, i) => [
        `p-${String(i).padStart(3, "0")}`,
        {},
      ]),
    ),
  );
  for (const node of graph.nodes)
    node.entries = [{ id: node.name, state: "ACTIVE", disabled: false }];
  assert.equal(graphModule.validateDependencyGraph(graph), true);
  let formatted = 0,
    page = 0;
  for (const node of graph.nodes)
    Object.defineProperty(node.entries[0], "state", {
      get() {
        formatted++;
        return "ACTIVE";
      },
      configurable: true,
    });
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children,
    }),
    useState: () => [
      page,
      (next) => {
        page = next;
      },
    ],
  };
  const Fold = () => {},
    Pager = () => {};
  const Panel = createDependencyPanel(
    React,
    {
      validateDependencyGraph(g) {
        const valid = graphModule.validateDependencyGraph(g);
        formatted = 0;
        return valid;
      },
    },
    { Fold, Pager },
  );
  const collect = (node) =>
    !node || typeof node !== "object"
      ? []
      : Array.isArray(node)
        ? node.flatMap(collect)
        : [node, ...node.children.flatMap(collect)];
  const root = Panel({ graph });
  assert.equal(formatted, 0, "closed tables must not format loader states");
  const fold = collect(root).find(
    (n) => n.type === Fold && n.props.title === "插件及 loader 条目",
  );
  const table = fold.children[0]();
  let content = table.type(table.props);
  assert.equal(formatted, 50);
  assert.equal(
    collect(content).filter((n) => n.type === "tbody")[0].children.length,
    50,
  );
  const pager = collect(content).find((n) => n.type === Pager);
  assert.equal(pager.props.total, 123);
  pager.props.onPageChange(2);
  content = table.type(table.props);
  assert.equal(formatted, 73);
  assert.equal(
    collect(content).filter((n) => n.type === "tbody")[0].children.length,
    23,
  );
  assert.match(JSON.stringify(content), /p-122/);
  assert.match(JSON.stringify(root), /预算|覆盖/);
});
