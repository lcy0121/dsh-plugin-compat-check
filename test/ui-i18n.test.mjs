import { test } from "node:test";
import assert from "node:assert/strict";

const modulePath = new URL("../plugin/src/i18n/runtime.mjs", import.meta.url);
const load = () => import(modulePath.href);

test("locale follows host BCP-47 language, overrides it locally and resumes following without changing host", async () => {
  const { createLocaleStore } = await load();
  let host = "zh-CN",
    changed;
  const saved = new Map();
  const store = createLocaleStore({
    language: () => host,
    browserLanguages: () => ["ko-KR"],
    storage: {
      getItem: (k) => saved.get(k),
      setItem: (k, v) => saved.set(k, v),
    },
    observe: (fn) => {
      changed = fn;
      return () => {
        changed = null;
      };
    },
  });
  assert.equal(store.locale(), "zh");
  const seen = [];
  const stop = store.subscribe(() => seen.push(store.locale()));
  host = "en-US";
  changed();
  assert.equal(store.locale(), "en");
  store.setPreference("ko");
  assert.equal(store.locale(), "ko");
  host = "zh-TW";
  changed();
  assert.equal(store.locale(), "ko");
  store.setPreference("auto");
  assert.equal(store.locale(), "zh");
  assert.equal(host, "zh-TW");
  assert.deepEqual(seen, ["en", "ko", "zh"]);
  assert.throws(() => store.setPreference("de"));
  stop();
  assert.equal(changed, null);
});

test("locale falls back safely with denied storage and unsupported host languages", async () => {
  const { createLocaleStore } = await load();
  const store = createLocaleStore({
    language: () => "fr-FR",
    browserLanguages: () => ["fr"],
    storage: {
      getItem() {
        throw Error("denied");
      },
      setItem() {
        throw Error("denied");
      },
    },
  });
  assert.equal(store.locale(), "en");
  store.setPreference("ko");
  assert.equal(store.locale(), "ko");
  assert.equal(
    createLocaleStore({
      language: () => "",
      browserLanguages: () => [],
    }).locale(),
    "zh",
  );
});

test("all messages have English and Korean translations with identical interpolation fields", async () => {
  const { messages, formatMessage } = await load();
  const fields = (s) => [...s.matchAll(/\{(p\d+)\}/g)].map((x) => x[1]).sort();
  assert(Object.keys(messages.zh).length > 250);
  for (const language of ["en", "ko"]) {
    assert.deepEqual(
      Object.keys(messages[language]).sort(),
      Object.keys(messages.zh).sort(),
    );
    for (const [key, value] of Object.entries(messages[language])) {
      assert.equal(typeof value, "string", key);
      assert(value.trim(), key);
      assert.deepEqual(fields(value), fields(key), `${language}: ${key}`);
    }
  }
  assert.equal(
    formatMessage("x {p0} {p1}", { p0: "{p1}", p1: "<script>" }),
    "x {p1} <script>",
  );
});

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
    report,
    baseline: null,
    issueReport: "搜索插件 原始证据 <script>",
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
test("overview keeps results first, groups occasional tools behind one closed control and exports inside results", async () => {
  const h = await panelHarness(sample());
  try {
    const nodes = h.nodes();
    assert(h.field("展开高级工具"));
    assert.equal(h.field("导入功能健康检查记录"), undefined);
    assert.equal(h.field("展开人工处置记录管理"), undefined);
    const primary = nodes.find((n) =>
      n.props.className?.includes("compat-primary"),
    );
    assert(JSON.stringify(primary).includes("预览故障报告"));
    h.field("展开高级工具").props.onClick();
    await h.settle();
    assert(h.field("导入功能健康检查记录"));
    assert(h.field("展开人工处置记录管理"));
  } finally {
    h.dispose();
  }
});
test("language override updates controls and status labels while preserving filter, exports and report bytes", async () => {
  const data = sample(),
    before = JSON.stringify(data);
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
  const canonical = JSON.stringify(data);
  const h = await panelHarness(data, {
    clipboard: { writeText: async () => {} },
  });
  try {
    const review = h
      .nodes()
      .find((n) => n.type === "textarea" && !n.props.readOnly);
    assert(review);
    review.props.onChange({ target: { value: "搜索插件 原始人工依据" } });
    await h.settle();
    h.field("搜索插件").props.onChange({ target: { value: "@label" } });
    await h.settle();
    const language = () =>
      h.nodes().find((n) => n.props["data-ui-language"] !== undefined);
    assert(language());
    h.field("展开插件及 loader 条目").props.onClick();
    await h.settle();
    language().props.onChange({ target: { value: "en" } });
    await h.settle();
    assert(h.field("Search plugins"));
    assert(
      h
        .nodes()
        .some(
          (n) =>
            n.type === "table" &&
            n.props.className?.includes("compat-relation-table"),
        ),
      "Language must retain expanded dependency tables",
    );
    const filter = h
      .nodes()
      .find(
        (n) =>
          n.type === "select" &&
          n.props["aria-label"]?.includes("manual status"),
      );
    if (filter) assert.doesNotMatch(h.text(filter), /[\p{Script=Han}]/u);
    assert.equal(h.field("Search plugins").props.value, "@label");
    assert.match(h.text(), /Incompatible/);
    h.button("Preview diagnostic report").props.onClick();
    await h.settle();
    assert.equal(
      h.field("Diagnostic report preview").props.value,
      data.issueReport,
    );
    await h.button("Copy report").props.onClick();
    await h.settle();
    language().props.onChange({ target: { value: "ko" } });
    await h.settle();
    assert.match(h.text(), /호환/);
    assert(
      h
        .text()
        .includes(
          (await load()).messages.ko["已复制。请确认敏感信息后再分享。"],
        ),
    );
    const exportField = h
      .nodes()
      .find((n) => n.type === "textarea" && n.props.readOnly);
    assert.equal(exportField.props.value, data.issueReport);
    assert.equal(
      h.nodes().find((n) => n.type === "textarea" && !n.props.readOnly).props
        .value,
      "搜索插件 原始人工依据",
    );
    assert.equal(JSON.stringify(data), canonical);
  } finally {
    h.dispose();
  }
});

test("baseline and catalogue presentation localizes built-in status without translating unknown evidence", async () => {
  const { baselineText, catalogueLines } = await import(
    "../plugin/src/i18n/presentation.mjs"
  );
  const { localeStore } = await load();
  localeStore.setPreference("en");
  try {
    assert.match(
      baselineText(
        "尚无可比较的历史记录。本次检查覆盖不完整，暂不建立对比记录。",
      ),
      /incomplete/i,
    );
    assert.equal(
      baselineText("user evidence 尚无可比较的历史记录"),
      "user evidence 尚无可比较的历史记录",
    );
    const lines = catalogueLines({
      targetVersion: "0.2.1-rc.3",
      referenceVersion: "0.2.1-rc.3",
      sha256: "a".repeat(64),
      certifiedVersions: ["0.2.1-rc.3"],
      scope:
        "仅核验内置目录字节及对应精确版本的集成；不代表业务验收或运行时观测。",
    });
    assert(lines.every((x) => !/[\p{Script=Han}]/u.test(x)));
    assert(lines.some((x) => x.includes("a".repeat(64))));
  } finally {
    localeStore.setPreference("auto");
  }
});

test("shipped locale dictionaries avoid repeating Chinese keys in every translation pack", async () => {
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    new URL("../plugin/lib/client.js", import.meta.url),
    "utf8",
  );
  const { parse } = await import("@babel/parser");
  let duplicated = false;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "ObjectProperty" &&
      (node.key.name || node.key.value) === "搜索插件" &&
      node.value.value === "Search plugins"
    )
      duplicated = true;
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "extra", "comments"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(parse(source, { sourceType: "script" }));
  assert.equal(duplicated, false);
});
