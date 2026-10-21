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
