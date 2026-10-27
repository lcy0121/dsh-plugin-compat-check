import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createHash } from "node:crypto";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { panelHarness } from "./support/panel-harness.mjs";
function sample() {
  const report = toJSON(
    run({
      nm: path.resolve("test/fixtures/labels"),
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
    computedAt: "2026-10-22T00:00:00.000Z",
    nodeModules: "/private/example/node_modules",
    reviews: {
      schemaVersion: 1,
      contextToken: "a".repeat(64),
      revision: "0".repeat(64),
      error: null,
      items: [],
      history: [],
    },
  };
}
test("overview exposes separate dependency, manual review and imported health sections without running checks", async () => {
  const data = sample(),
    before = JSON.stringify(data),
    urls = [];
  const h = await panelHarness(data, {
    fetcher: async (url, options) => {
      assert.equal(
        new Headers(options.headers).get("X-DSH-Compat-Request"),
        "1",
      );
      urls.push(url);
      return { ok: true, json: async () => data };
    },
  });
  try {
    assert.match(h.text(), /依赖关系与潜在(?:故障传播|影响)/);
    assert.match(h.text(), /发现的人工处置/);
    assert.match(h.text(), /功能健康检查/);
    assert(h.field("导入功能健康检查记录"));
    assert.deepEqual(urls, ["/plugin-compat-check/report"]);
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});
test("invalid or oversized imported health evidence stays local and cannot change the compatibility report", async () => {
  const data = sample(),
    before = JSON.stringify(data),
    urls = [];
  const h = await panelHarness(data, {
    fetcher: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => data };
    },
  });
  try {
    const input = h.field("导入功能健康检查记录");
    assert(input);
    await input.props.onChange({
      target: { files: [{ size: 8, text: async () => "{broken" }] },
    });
    await h.settle();
    assert.match(h.text(), /导入失败/);
    assert.deepEqual(h.rows().sort(), Object.keys(data.report.plugins).sort());
    let read = false;
    await input.props.onChange({
      target: {
        files: [
          {
            size: 2 * 1024 * 1024,
            text: async () => {
              read = true;
              return "{}";
            },
          },
        ],
      },
    });
    await h.settle();
    assert.equal(read, false);
    assert.match(h.text(), /大小限制/);
    assert.deepEqual(urls, ["/plugin-compat-check/report"]);
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});

// The expected hash is built from independently ordered literal JSON, not the UI helper.
function healthRecord(data, version) {
  const name = Object.keys(data.report.plugins)[0];
  const declaration = {
    artifact: {
      name,
      sha256: "a".repeat(64),
      version: version || data.report.plugins[name].version,
    },
    checks: [{ id: "ready", path: "/health", status: 200, type: "http" }],
    dshVersion: data.report.dshVersion,
    schemaVersion: 1,
  };
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/functional-health",
    status: "tested-pass",
    declaration,
    identity: {
      artifact: declaration.artifact,
      dshVersion: declaration.dshVersion,
      manifestSha256: createHash("sha256")
        .update(JSON.stringify(declaration))
        .digest("hex"),
    },
    startedAt: "2026-10-22T00:00:00.000Z",
    completedAt: "2026-10-22T00:00:01.000Z",
    checks: [
      {
        id: "ready",
        type: "http",
        status: "pass",
        evidence: { httpStatus: 200, responseBytes: 2, elapsedMs: 1 },
      },
    ],
    cleanup: { stopped: true, removed: true },
    limitations: ["Only the selected owned check was measured."],
  };
}
const importRecord = (input, record) =>
  input.props.onChange({
    target: {
      files: [{ size: 2048, text: async () => JSON.stringify(record) }],
    },
  });
test("verified health import remains historical, rejects a changed declaration, and preserves the ordinary report", async () => {
  const data = sample(),
    before = JSON.stringify(data),
    urls = [];
  const h = await panelHarness(data, {
    fetcher: async (url) => {
      urls.push(url);
      return { ok: true, json: async () => data };
    },
  });
  try {
    const input = h.field("导入功能健康检查记录"),
      record = healthRecord(data);
    await importRecord(input, record);
    await h.settle();
    assert.match(h.text(), /所选检查通过/);
    assert.match(h.text(), /当前安装制品尚未核验/);
    const tampered = structuredClone(record);
    tampered.declaration.checks[0].path = "/different";
    await importRecord(input, tampered);
    await h.settle();
    assert.match(h.text(), /声明与记录摘要不一致/);
    h.find(
      (n) =>
        n.type === "button" && n.props["aria-label"] === "展开功能健康检查结果",
    ).props.onClick();
    h.render();
    assert.match(h.text(), /GET \/health/);
    assert.doesNotMatch(h.text(), /GET \/different/);
    await importRecord(input, healthRecord(data, "99.0.0"));
    await h.settle();
    assert.match(h.text(), /不用于认证当前目标/);
    assert.equal(JSON.stringify(data), before);
    assert.deepEqual(urls, ["/plugin-compat-check/report"]);
  } finally {
    h.dispose();
  }
});
test("an older slow health import cannot replace the last selected evidence", async () => {
  const data = sample(),
    h = await panelHarness(data);
  try {
    const input = h.field("导入功能健康检查记录");
    let release;
    const older = input.props.onChange({
      target: {
        files: [
          {
            size: 2048,
            text: () =>
              new Promise((resolve) => {
                release = resolve;
              }),
          },
        ],
      },
    });
    await importRecord(input, healthRecord(data, "99.0.0"));
    await h.settle();
    release(JSON.stringify(healthRecord(data)));
    await older;
    await h.settle();
    assert.match(h.text(), /99.0.0/);
    assert.match(h.text(), /不用于认证当前目标/);
    assert.doesNotMatch(h.text(), /当前安装制品尚未核验/);
  } finally {
    h.dispose();
  }
});

test("shared history disclosure updates the controlled review history and hides it on collapse", async () => {
  const data = sample();
  data.reviews.items = Object.entries(data.report.plugins).flatMap(
    ([pluginName, plugin]) =>
      plugin.findings.map((finding, findingIndex) => ({
        findingId: createHash("sha256")
          .update(pluginName + findingIndex)
          .digest("hex"),
        pluginName,
        pluginVersion: plugin.version,
        findingIndex,
        status: "pending",
        note: "",
        record: null,
        history: [],
        historyCount: 0,
        reviewReason: null,
      })),
  );
  data.reviews.history = [
    {
      findingId: "b".repeat(64),
      pluginName: "historical-demo",
      pluginVersion: "0.0.1",
      status: "reviewed",
      note: "Complete historical rationale",
      updatedAt: "2026-10-21T00:00:00.000Z",
    },
  ];
  const before = JSON.stringify(data);
  const h = await panelHarness(data);
  try {
    const expand = h.field("展开历史处置完整依据（1）");
    assert(expand);
    assert.doesNotMatch(h.text(), /Complete historical rationale/);
    expand.props.onClick();
    h.render();
    assert.match(h.text(), /Complete historical rationale/);
    h.field("收起历史处置完整依据（1）").props.onClick();
    h.render();
    assert.doesNotMatch(h.text(), /Complete historical rationale/);
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});

function withReviewItems(data) {
  data.reviews.items = Object.entries(data.report.plugins).flatMap(
    ([pluginName, plugin]) =>
      plugin.findings.map((_, findingIndex) => ({
        findingId: createHash("sha256")
          .update(pluginName + findingIndex)
          .digest("hex"),
        pluginName,
        pluginVersion: plugin.version,
        findingIndex,
        status: "pending",
        note: "",
        record: null,
        history: [],
        historyCount: 0,
        reviewReason: null,
      })),
  );
  return data;
}
test("polling retains dirty drafts under original context, copy and discard are explicit, and new findings stay clean", async () => {
  let data = withReviewItems(sample()),
    copied;
  const timers = new Map();
  let id = 0;
  const h = await panelHarness(data, {
    clipboard: {
      writeText: async (text) => {
        copied = text;
      },
    },
    fetcher: async () => ({
      ok: true,
      json: async () => structuredClone(data),
    }),
    timers: {
      setTimeout: (fn, ms) => {
        timers.set(++id, { fn, ms });
        return id;
      },
      clearTimeout: (k) => timers.delete(k),
    },
  });
  const item = data.reviews.items[0],
    label = `${item.pluginName} 发现 ${item.findingIndex + 1} 核实依据`;
  const poll = async () => {
    const t = [...timers.values()].find((t) => t.ms === 2000);
    assert(t);
    await t.fn();
    await h.settle();
  };
  try {
    h.field(label).props.onChange({
      target: { value: "未保存的独立核实依据" },
    });
    h.render();
    data = { ...data, reviews: { ...data.reviews, revision: "1".repeat(64) } };
    await poll();
    assert.equal(h.field(label).props.value, "未保存的独立核实依据");
    data = {
      ...data,
      computedAt: "2026-10-22T00:00:01.000Z",
      reviews: { ...data.reviews, contextToken: "b".repeat(64) },
    };
    await poll();
    assert.match(h.text(), /草稿已过期/);
    const old = h.find((n) => n.props["data-review-stale"] === true);
    assert(old);
    assert.equal(
      h.find(
        (n) =>
          n.type === "textarea" && n.props.value === "未保存的独立核实依据",
      ).props.disabled,
      false,
    );
    const save = h
      .nodes(old)
      .find((n) => n.type === "button" && h.text(n) === "保存人工处置");
    assert(save.props.disabled);
    assert(
      h
        .nodes()
        .some(
          (n) =>
            n.type === "textarea" &&
            n.props["aria-label"] === label &&
            n.props.value === "",
        ),
    );
    await h.button("复制草稿").props.onClick();
    h.render();
    assert.match(copied, /未保存的独立核实依据/);
    h.button("放弃草稿").props.onClick();
    h.render();
    assert.doesNotMatch(h.text(), /草稿已过期/);
    assert.equal(h.field(label).props.value, "");
  } finally {
    h.dispose();
  }
});

test("late save responses cannot clear expired drafts or mark a new context as saved; unavailable reviews retain drafts", async () => {
  let data = withReviewItems(sample()),
    release;
  const timers = new Map();
  let id = 0;
  const h = await panelHarness(data, {
    fetcher: async (url) =>
      url.includes("/reviews")
        ? new Promise((r) => {
            release = r;
          })
        : { ok: true, json: async () => structuredClone(data) },
    timers: {
      setTimeout: (fn, ms) => {
        timers.set(++id, { fn, ms });
        return id;
      },
      clearTimeout: (k) => timers.delete(k),
    },
  });
  const old = structuredClone(data.reviews),
    item = old.items[0],
    label = `${item.pluginName} 发现 ${item.findingIndex + 1} 核实依据`;
  const poll = async () => {
    await [...timers.values()].find((t) => t.ms === 2000).fn();
    await h.settle();
  };
  try {
    h.field(label).props.onChange({ target: { value: "保留这份核实依据" } });
    h.render();
    const save = h.button("保存人工处置").props.onClick();
    data = {
      ...data,
      reviews: { ...data.reviews, contextToken: "c".repeat(64) },
    };
    await poll();
    release({ ok: true, json: async () => ({ ok: true, reviews: old }) });
    await save;
    await h.settle();
    assert.match(h.text(), /草稿已过期/);
    assert.doesNotMatch(h.text(), /人工处置已保存/);
    assert(
      h.find(
        (n) => n.type === "textarea" && n.props.value === "保留这份核实依据",
      ),
    );
    data = { ...data, reviews: null };
    await poll();
    assert(
      h.find(
        (n) => n.type === "textarea" && n.props.value === "保留这份核实依据",
      ),
    );
  } finally {
    h.dispose();
  }
});

test("a delayed save cannot overwrite a newer revision of the same report or clear its draft", async () => {
  let data = withReviewItems(sample()),
    release;
  const timers = new Map();
  let id = 0;
  const old = structuredClone(data.reviews),
    item = old.items[0],
    label = `${item.pluginName} 发现 ${item.findingIndex + 1} 核实依据`;
  const h = await panelHarness(data, {
    fetcher: async (url) =>
      url.includes("/reviews")
        ? new Promise((r) => {
            release = r;
          })
        : { ok: true, json: async () => structuredClone(data) },
    timers: {
      setTimeout: (fn, ms) => {
        timers.set(++id, { fn, ms });
        return id;
      },
      clearTimeout: (k) => timers.delete(k),
    },
  });
  try {
    h.field(label).props.onChange({
      target: { value: "较新记录到达前的草稿" },
    });
    h.render();
    const saving = h.button("保存人工处置").props.onClick();
    data = { ...data, reviews: { ...data.reviews, revision: "f".repeat(64) } };
    await [...timers.values()].find((t) => t.ms === 2000).fn();
    await h.settle();
    release({ ok: true, json: async () => ({ ok: true, reviews: old }) });
    await saving;
    await h.settle();
    assert.equal(h.field(label).props.value, "较新记录到达前的草稿");
    assert.doesNotMatch(h.text(), /人工处置已保存/);
    assert.match(h.text(), /记录已变化/);
  } finally {
    h.dispose();
  }
});

test("review filters expose category, API, source and saved rationale without altering original risks", async () => {
  const data = withReviewItems(sample()),
    item = data.reviews.items[0];
  data.report.plugins[item.pluginName].findings[item.findingIndex].location = {
    file: "lib/owned.js",
    line: 42,
  };
  const before = JSON.stringify(data),
    h = await panelHarness(data);
  try {
    assert.match(h.text(), /类别：/);
    assert.match(h.text(), /lib\/owned.js:42/);
    h.field("筛选处置插件").props.onChange({
      target: { value: item.pluginName },
    });
    h.render();
    assert.equal(
      h.nodes().filter((n) => n.props["data-review-finding"]).length,
      1,
    );
    h.field("筛选人工状态").props.onChange({ target: { value: "reviewed" } });
    h.render();
    assert.equal(
      h.nodes().filter((n) => n.props["data-review-finding"]).length,
      0,
    );
    assert.match(h.text(), /没有符合筛选的处置发现/);
    assert.deepEqual(h.rows().sort(), Object.keys(data.report.plugins).sort());
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});

test("main-to-review navigation activates unvisited editors and reverse navigation clears main filters", async () => {
  const data = withReviewItems(sample()),
    item = data.reviews.items[0];
  const h = await panelHarness(data, {
    intersectionObserver: class {
      constructor(callback, options) {
        if (!options) callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  });
  try {
    assert.equal(
      h.nodes().filter((n) => n.props["data-review-finding"]).length,
      0,
    );
    const count = data.report.plugins[item.pluginName].findings.length;
    h.field(`展开查看 ${count} 条发现与未验证项`).props.onClick();
    h.render();
    const jump = h.find(
      (n) =>
        n.type === "button" && n.props["data-review-link"] === item.findingId,
    );
    assert(jump);
    jump.props.onClick();
    await h.settle();
    assert(h.find((n) => n.props["data-review-finding"] === item.findingId));
    assert.equal(
      h.find((n) => n.props["data-review-finding"] === item.findingId).props[
        "data-review-focused"
      ],
      true,
    );
    h.field("搜索插件").props.onChange({
      target: { value: "does-not-match-any-plugin" },
    });
    h.render();
    assert.equal(h.rows().length, 0);
    const back = h.find(
      (n) =>
        n.type === "button" && n.props["data-main-link"] === item.findingId,
    );
    assert(back);
    back.props.onClick();
    await h.settle();
    assert(h.rows().includes(item.pluginName));
    assert(h.find((n) => n.props["data-finding-id"] === item.findingId));
  } finally {
    h.dispose();
  }
});

test("identity navigation crosses both plugin and finding pages while filtered dirty drafts stay mounted", async () => {
  const data = sample(),
    seed = data.report.plugins["@label/broken-client"],
    targetName = "@zz/navigation-target";
  for (let i = 0; i < 65; i++)
    data.report.plugins[`@page/plugin-${String(i).padStart(2, "0")}`] = {
      ...structuredClone(seed),
      name: `@page/plugin-${String(i).padStart(2, "0")}`,
    };
  data.report.plugins[targetName] = {
    ...structuredClone(seed),
    name: targetName,
    findings: Array.from({ length: 123 }, (_, i) => ({
      ...structuredClone(seed.findings[0]),
      method: `ownedMethod${i}`,
    })),
  };
  data.report.summary.broken += 66;
  data.report.summary.limited += 66;
  withReviewItems(data);
  const target = data.reviews.items.find(
      (i) => i.pluginName === targetName && i.findingIndex === 122,
    ),
    before = JSON.stringify(data);
  const h = await panelHarness(data, {
    intersectionObserver: class {
      constructor(callback, options) {
        if (!options) callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  });
  try {
    h.field("搜索插件").props.onChange({ target: { value: targetName } });
    h.render();
    h.field("展开查看 123 条发现与未验证项").props.onClick();
    h.render();
    for (let i = 0; i < 2; i++) {
      h.field("下一页插件发现").props.onClick();
      h.render();
    }
    h.find(
      (n) => n.props["data-review-link"] === target.findingId,
    ).props.onClick();
    await h.settle();
    const row = () =>
      h.find((n) => n.props["data-review-finding"] === target.findingId);
    assert(row());
    assert(
      h.nodes().filter((n) => n.props["data-review-finding"]).length <= 21,
    );
    const editorLabel = `${targetName} 发现 123 核实依据`;
    h.field(editorLabel).props.onChange({
      target: { value: "owned draft at page three" },
    });
    h.render();
    h.field("筛选处置插件").props.onChange({
      target: { value: "@nonmatching" },
    });
    h.render();
    h.field("筛选人工状态").props.onChange({ target: { value: "reviewed" } });
    h.render();
    assert(row());
    assert.equal(h.field(editorLabel).props.value, "owned draft at page three");
    h.field("搜索插件").props.onChange({ target: { value: "@nonmatching" } });
    h.render();
    h.find(
      (n) => n.props["data-main-link"] === target.findingId,
    ).props.onClick();
    await h.settle();
    assert(h.rows().includes(targetName));
    assert(h.find((n) => n.props["data-finding-id"] === target.findingId));
    assert.match(h.text(h.field("插件兼容性结果分页")), /第\s+2\s*\/\s*2\s+页/);
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});

test("history panels stay folded and perform no background reads; snapshots and archives open only on explicit action", async () => {
  const data = sample(),
    requests = [];
  const h = await panelHarness(data, {
    fetcher: async (url, opts) => {
      if (url === "/plugin-compat-check/history") {
        const body = JSON.parse(opts.body);
        requests.push(body);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result:
              body.action === "review-state"
                ? {
                    revision: "0".repeat(64),
                    capacity: {
                      records: 0,
                      recordLimit: 1000,
                      bytes: 0,
                      byteLimit: 1048576,
                      historical: 0,
                    },
                    archives: [],
                    archiveLimit: 100,
                  }
                : {
                    items: [],
                    capacity: {
                      records: 0,
                      recordLimit: 20,
                      bytes: 0,
                      byteLimit: 67108864,
                    },
                  },
          }),
        };
      }
      return { ok: true, json: async () => data };
    },
  });
  try {
    assert.equal(requests.length, 0);
    h.field("展开本地历史报告与趋势").props.onClick();
    h.render();
    assert.equal(requests.length, 0);
    h.button("加载历史报告").props.onClick();
    await h.settle();
    assert.equal(requests.at(-1).action, "snapshot-list");
    assert.match(h.text(), /历史快照不认证当前目标/);
    h.field("展开人工处置记录管理").props.onClick();
    h.render();
    h.button("加载处置容量与归档").props.onClick();
    await h.settle();
    assert.equal(requests.at(-1).action, "review-state");
    assert.match(h.text(), /1000/);
    assert.match(h.text(), /只作历史参考/);
  } finally {
    h.dispose();
  }
});

test("archive confirmation is explicit, export is previewed, and snapshot actions retain ordinary risks", async () => {
  const data = sample(),
    before = JSON.stringify(data),
    requests = [];
  let records = 1;
  const state = () => ({
    revision: "b".repeat(64),
    capacity: {
      records,
      recordLimit: 1000,
      bytes: 700,
      byteLimit: 1048576,
      historical: 0,
    },
    archives: [],
    archiveLimit: 100,
  });
  const h = await panelHarness(data, {
    fetcher: async (url, opts) => {
      if (url === "/plugin-compat-check/history") {
        const body = JSON.parse(opts.body);
        requests.push(body);
        if (body.action === "review-archive") {
          assert.equal(body.confirm, true);
          records = 0;
        }
        const result =
          body.action === "review-export"
            ? {
                schemaVersion: 1,
                kind: "plugin-compat-check/review-archive",
                targetKey: "a".repeat(64),
                createdAt: "2026-10-27T00:00:00Z",
                document: {
                  schemaVersion: 1,
                  revision: "a".repeat(64),
                  records: [],
                },
              }
            : body.action.startsWith("review-")
              ? state()
              : {
                  items: [],
                  capacity: {
                    records: 0,
                    recordLimit: 20,
                    bytes: 0,
                    byteLimit: 67108864,
                  },
                };
        return { ok: true, json: async () => ({ ok: true, result }) };
      }
      return { ok: true, json: async () => data };
    },
  });
  try {
    h.field("展开人工处置记录管理").props.onClick();
    h.render();
    h.button("加载处置容量与归档").props.onClick();
    await h.settle();
    h.button("归档全部处置").props.onClick();
    h.render();
    assert.equal(
      requests.filter((r) => r.action === "review-archive").length,
      0,
    );
    h.button("确认归档或移除").props.onClick();
    await h.settle();
    assert.equal(records, 0);
    h.button("预览导出活动处置").props.onClick();
    await h.settle();
    assert.match(h.field("历史JSON导出预览").props.value, /review-archive/);
    assert(h.button("下载历史JSON"));
    h.field("展开本地历史报告与趋势").props.onClick();
    h.render();
    h.field("快照备注").props.onChange({ target: { value: "before upgrade" } });
    h.render();
    h.button("保存当前报告快照").props.onClick();
    await h.settle();
    assert.equal(requests.at(-1).label, "before upgrade");
    assert.equal(JSON.stringify(data), before);
    assert.equal(h.rows().length, 4);
  } finally {
    h.dispose();
  }
});
test("invalid and oversized history imports never issue writes", async () => {
  const data = sample(),
    requests = [];
  const h = await panelHarness(data, {
    fetcher: async (url, opts) => {
      if (url === "/plugin-compat-check/history") {
        requests.push(JSON.parse(opts.body));
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              items: [],
              capacity: {
                records: 0,
                recordLimit: 20,
                bytes: 0,
                byteLimit: 67108864,
              },
            },
          }),
        };
      }
      return { ok: true, json: async () => data };
    },
  });
  try {
    h.field("展开本地历史报告与趋势").props.onClick();
    h.render();
    h.button("加载历史报告").props.onClick();
    await h.settle();
    for (const file of [
      {
        size: 9000000,
        text: async () => {
          throw Error("must not read");
        },
      },
      { size: 10, text: async () => "{invalid" },
    ]) {
      await h
        .field("导入历史快照（不认证当前）")
        .props.onChange({ target: { files: [file], value: "owned" } });
      h.render();
    }
    assert.equal(requests.length, 1);
    assert.match(h.text(), /JSON|导入/);
  } finally {
    h.dispose();
  }
});

test("metadata timestamps retain an open history session; an import finishing after report identity change cannot write", async () => {
  let data = withReviewItems(sample()),
    release;
  const calls = [];
  const h = await panelHarness(data, {
    fetcher: async (url, opts) => {
      if (url === "/plugin-compat-check/history") {
        calls.push(JSON.parse(opts.body));
        return {
          ok: true,
          json: async () => ({
            ok: true,
            result: {
              items: [],
              capacity: {
                records: 0,
                recordLimit: 20,
                bytes: 0,
                byteLimit: 67108864,
              },
            },
          }),
        };
      }
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  try {
    h.field("展开本地历史报告与趋势").props.onClick();
    h.render();
    h.button("加载历史报告").props.onClick();
    await h.settle();
    assert(h.field("检索历史快照"));
    data = structuredClone(data);
    data.computedAt = "2026-10-28T00:00:00Z";
    data.report.observation.probedAt = "2026-10-28T00:00:00Z";
    h.button("重新检查").props.onClick();
    await h.settle();
    assert(
      h.field("检索历史快照"),
      "metadata-only timestamp must not reset history state",
    );
    const pending = h.field("导入历史快照（不认证当前）").props.onChange({
      target: {
        files: [{ size: 100, text: () => new Promise((r) => (release = r)) }],
        value: "owned",
      },
    });
    data = structuredClone(data);
    data.computedAt = "2026-10-28T01:00:00Z";
    data.report.plugins["@label/broken-client"].version = "2.0.0";
    data.reviews.contextToken = "f".repeat(64);
    h.button("重新检查").props.onClick();
    await h.settle();
    release("{}");
    await pending;
    await h.settle();
    assert.equal(calls.filter((c) => c.action === "snapshot-import").length, 0);
  } finally {
    h.dispose();
  }
});

test("a report change aborts a pending history request and allows the next explicit action", async () => {
  let data = sample(),
    release;
  let calls = 0;
  const response = () => ({
    ok: true,
    json: async () => ({
      ok: true,
      result: {
        items: [],
        capacity: {
          records: 0,
          recordLimit: 20,
          bytes: 0,
          byteLimit: 67108864,
        },
      },
    }),
  });
  const h = await panelHarness(data, {
    fetcher: async (url) => {
      if (url === "/plugin-compat-check/history") {
        if (++calls === 1)
          return new Promise((r) => (release = () => r(response())));
        return response();
      }
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  try {
    h.field("展开本地历史报告与趋势").props.onClick();
    h.render();
    h.button("加载历史报告").props.onClick();
    await h.settle();
    assert.equal(calls, 1);
    data = structuredClone(data);
    data.computedAt = "2026-10-28T00:00:00Z";
    data.report.plugins["@label/broken-client"].version = "2.0.0";
    data.reviews.contextToken = "c".repeat(64);
    h.button("重新检查").props.onClick();
    await h.settle();
    h.button("加载历史报告").props.onClick();
    await h.settle();
    assert.equal(calls, 2);
    assert(h.field("检索历史快照"));
  } finally {
    release?.();
    await h.settle();
    h.dispose();
  }
});
