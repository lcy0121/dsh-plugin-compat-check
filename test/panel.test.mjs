import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { renderIssueReport } from "../bin/issue-report.mjs";
import { REPO } from "./helpers.mjs";
import { panelHarness } from "./support/panel-harness.mjs";
function sample() {
  const report = toJSON(
    run({
      nm: path.join(REPO, "test/fixtures/labels"),
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    baseline: null,
    report,
    computedAt: "2026-10-21T00:00:00.000Z",
    nodeModules: "/private/example/profile/node_modules",
    cache: { hit: true, ageMs: 500, refreshing: false },
    issueReport: renderIssueReport(report),
  };
}
function change(h, label, value) {
  const f = h.field(label);
  assert(f, "Missing control: " + label);
  f.props.onChange({ target: { value } });
  h.render();
}
test("panel search and combined verdict/certainty/verification filters change visible rows without altering report", async () => {
  const data = sample(),
    before = JSON.stringify(data);
  const h = await panelHarness(data);
  change(h, "搜索插件", "broken");
  assert.deepEqual(h.rows(), ["@label/broken-client", "@label/broken-service"]);
  change(h, "按结论筛选", "broken");
  assert.deepEqual(h.rows(), ["@label/broken-client"]);
  change(h, "按确定性筛选", "suspected");
  assert.deepEqual(h.rows(), []);
  assert.match(h.text(), /没有符合筛选条件/);
  change(h, "按确定性筛选", "certain");
  change(h, "按验证状态筛选", "pending");
  assert.deepEqual(h.rows(), ["@label/broken-client"]);
  assert.equal(JSON.stringify(data), before);
});
test("panel preview copies the same full sanitized report only on explicit copy, including hidden rows", async () => {
  const data = sample(),
    copied = [];
  const h = await panelHarness(data, {
    clipboard: { writeText: async (v) => copied.push(v) },
  });
  change(h, "搜索插件", "healthy");
  const b = h.button("预览故障报告");
  assert(b, "Preview entry missing");
  b.props.onClick();
  h.render();
  assert.equal(copied.length, 0);
  const preview = h.field("故障报告预览");
  assert(preview);
  assert.equal(preview.props.value, data.issueReport);
  assert.match(preview.props.value, /broken/);
  assert.doesNotMatch(preview.props.value, /\/private\/example/);
  const copy = h.button("复制报告");
  assert(copy);
  await copy.props.onClick();
  await h.settle();
  assert.deepEqual(copied, [data.issueReport]);
  assert.match(h.text(), /已复制/);
});
test("clipboard denial preserves a selectable preview and gives manual copy guidance", async () => {
  const h = await panelHarness(sample(), {
    clipboard: {
      writeText: async () => {
        throw Error("denied");
      },
    },
  });
  const b = h.button("预览故障报告");
  assert(b);
  b.props.onClick();
  h.render();
  await h.button("复制报告").props.onClick();
  await h.settle();
  assert(h.field("故障报告预览"));
  assert.match(h.text(), /手动复制/);
});
test("new-risk view cannot turn absent or incomparable baseline into a clean conclusion", async () => {
  const h = await panelHarness(sample());
  const b = h.button("本次新增风险");
  assert(b, "New-risk view missing");
  b.props.onClick();
  h.render();
  assert.match(h.text(), /没有可比较的基线|尚无可比较基线/);
  assert.match(h.text(), /不表示没有风险/);
});
test("panel keeps report time, cache age and pending coverage visible with collapsible details", async () => {
  const h = await panelHarness(sample());
  assert.match(h.text(), /2026-10-21/);
  assert.match(h.text(), /缓存/);
  assert(
    h.find((n) => n.type === "details"),
    "Details must be collapsible",
  );
  assert.match(h.text(), /证据覆盖/);
});

test("comparable new-risk view uses the existing baseline diff, including worsening, and excludes newly added healthy plugins", async () => {
  const { snapshotForBaseline, diffAgainstBaseline, badgeFor } = await import(
    "../lib/baseline.mjs"
  );
  const data = sample(),
    next = snapshotForBaseline(
      { plugins: data.report.plugins, observation: data.report.observation },
      data.report.dshVersion,
    );
  const previous = structuredClone(next);
  previous.plugins["@label/broken-client"].findings = [];
  previous.plugins["@label/broken-client"].verdict = "ok";
  previous.plugins["@label/broken-client"].vacuous = true;
  delete previous.plugins["@label/healthy"];
  const diff = diffAgainstBaseline(previous, next);
  assert.equal(diff.comparable, true);
  assert.equal(diff.worsened[0].name, "@label/broken-client");
  data.baseline = { wrote: false, badge: badgeFor(diff), diff };
  data.report.baseline = data.baseline;
  const h = await panelHarness(data);
  h.button("本次新增风险").props.onClick();
  h.render();
  assert.deepEqual(h.rows(), ["@label/broken-client"]);
  assert.match(h.text(), /无变化不表示业务通过/);
});
test("readable finding guidance is available in both collapsed-row details and the plugin detail section", async () => {
  for (const subject of [undefined, "@label/broken-client"]) {
    const h = await panelHarness(sample(), { subject });
    assert.match(h.text(), /下一步核实/);
  }
});

test("primary plugin results precede all auxiliary workflows and remain visible by default", async () => {
  const h = await panelHarness(sample());
  try {
    const nodes = h.nodes();
    const results = nodes.findIndex(
      (n) => n.type === "table" && n.props["aria-label"] === "插件兼容性结果",
    );
    assert(results >= 0, "The primary table needs an accessible identity");
    for (const label of ["依赖关系与潜在影响", "功能健康检查"])
      assert(
        results < nodes.findIndex((n) => n.props["aria-label"] === label),
        label,
      );
    assert(results < nodes.findIndex((n) => n.props["data-upgrade-preview"]));
    assert(
      results <
        nodes.findIndex(
          (n) => n.type === "button" && h.text(n) === "预览故障报告",
        ),
    );
    assert.equal(h.rows().length, 4);
  } finally {
    h.dispose();
  }
});

test("auxiliary loader table starts unmounted and its explicit toggle preserves report and main filters", async () => {
  const data = sample(),
    before = JSON.stringify(data);
  const h = await panelHarness(data);
  try {
    const findToggle = () =>
      h.find(
        (n) =>
          n.type === "button" &&
          n.props["aria-label"] === "展开插件及 loader 条目",
      );
    const toggle = findToggle();
    assert(toggle, "Large auxiliary tables need an explicit expansion control");
    assert.equal(toggle.props["aria-expanded"], false);
    assert(
      !h.find(
        (n) =>
          n.type === "table" && n.props["aria-label"] === "插件及 loader 条目",
      ),
    );
    change(h, "搜索插件", "healthy");
    toggle.props.onClick();
    h.render();
    const table = h.find(
      (n) =>
        n.type === "table" && n.props["aria-label"] === "插件及 loader 条目",
    );
    assert(table);
    const cells = h.nodes(table).filter((n) => n.type === "td");
    assert(cells.length > 0);
    const close = h.find(
      (n) =>
        n.type === "button" &&
        n.props["aria-label"] === "收起插件及 loader 条目",
    );
    assert.equal(close.props["aria-expanded"], true);
    close.props.onClick();
    h.render();
    assert(
      !h.find(
        (n) =>
          n.type === "table" && n.props["aria-label"] === "插件及 loader 条目",
      ),
    );
    assert.deepEqual(h.rows(), ["@label/healthy"]);
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});

test("overview and plugin detail use the same shadcn controls and semantic status badges", async () => {
  for (const subject of [undefined, "@label/broken-client"]) {
    const h = await panelHarness(sample(), { subject });
    try {
      assert(
        h.find((n) => n.type === "button" && n.props["data-slot"] === "button"),
      );
      assert(h.find((n) => n.props["data-slot"] === "badge"));
      if (!subject) {
        assert.equal(h.field("搜索插件").props["data-slot"], "input");
        assert.equal(h.field("按结论筛选").props["data-slot"], "native-select");
      }
    } finally {
      h.dispose();
    }
  }
});

test("report context stays with results while upgrade and report explanations have distinct cards", async () => {
  const data = sample();
  data.nodeModulesWhy = "isolated preview profile";
  const h = await panelHarness(data);
  try {
    const card = (label) =>
      h.find(
        (n) =>
          n.type === "section" &&
          n.props["data-slot"] === "card" &&
          n.props["aria-label"] === label,
      );
    const primary = card("兼容性体检结果");
    const upgrade = card("升级前兼容性预检");
    const explanation = card("报告说明与检查信息");
    assert(
      upgrade,
      "Upgrade preview must have the same card boundary as other tools",
    );
    assert(h.nodes(upgrade).some((n) => n.props["data-upgrade-preview"]));
    assert(
      explanation,
      "Report-wide legend and diagnostics need an explicit group",
    );
    assert.match(h.text(explanation), /确定（certain）.*影响依据/s);
    assert.match(h.text(explanation), /工具版本：/);
    assert.match(h.text(explanation), /isolated preview profile/);
    assert.doesNotMatch(h.text(primary), /工具版本：|对象来源：/);
    assert.match(h.text(primary), /2026-10-21|缓存/);
    const nodes = h.nodes(primary);
    const separators = nodes
      .map((n, i) => (n.props["data-slot"] === "separator" ? i : -1))
      .filter((i) => i >= 0);
    const search = nodes.indexOf(h.field("搜索插件"));
    const table = nodes.findIndex((n) => n.type === "table");
    assert.equal(separators.length, 2);
    assert(
      separators[0] < search && search < separators[1] && separators[1] < table,
    );
  } finally {
    h.dispose();
  }
});
