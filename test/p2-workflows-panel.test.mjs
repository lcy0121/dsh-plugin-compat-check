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
