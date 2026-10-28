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

test("dependency descriptions and coverage explanations translate in the shipped English and Korean panels", async () => {
  const data = sample(),
    before = JSON.stringify(data);
  const h = await panelHarness(data);
  try {
    for (const locale of ["en", "ko"]) {
      h.nodes()
        .find((n) => n.props["data-ui-language"] !== undefined)
        .props.onChange({ target: { value: locale } });
      await h.settle();
      const title = (await load()).messages[locale]["依赖关系与潜在影响"];
      const panel = h.nodes().find((n) => n.props["aria-label"] === title);
      assert(panel, title);
      assert.doesNotMatch(h.text(panel), /[\p{Script=Han}]/u);
    }
    assert.equal(
      JSON.stringify(data),
      before,
      "Presentation must not translate canonical evidence",
    );
  } finally {
    h.dispose();
  }
});

test("known coverage message templates translate without changing identifiers or arbitrary evidence", async () => {
  const { evidenceNote, profileSource } = await import(
    "../plugin/src/i18n/presentation.mjs"
  );
  const { localeStore } = await load();
  try {
    for (const locale of ["en", "ko"]) {
      localeStore.setPreference(locale);
      for (const text of [
        "settings 客户端尚未验证",
        "settings Context 绑定仅由语法推断",
        "Loader 有 3 个条目无法映射到包名",
        "结论从「ok」变为「broken」",
        "已有发现的严重度或证据确定性提高了",
      ]) {
        assert.doesNotMatch(evidenceNote(text), /[\p{Script=Han}]/u);
      }
      const raw = "用户说明：settings 客户端尚未验证";
      assert.equal(evidenceNote(raw), raw);
      assert.doesNotMatch(
        profileSource("process.argv 的 --profile ui-preview"),
        /[\p{Script=Han}]/u,
      );
      assert(
        profileSource(
          "process.argv 里的 profile 路径 /tmp/中文/profiles/example",
        ).includes("/tmp/中文/profiles/example"),
      );
      assert.equal(profileSource("自定义来源"), "自定义来源");
      assert.equal(
        evidenceNote("中文服务名 客户端尚未验证").includes("中文服务名"),
        true,
      );
    }
  } finally {
    localeStore.setPreference("auto");
  }
});

test("all producer-owned graph explanations and upgrade limitations have translations", async () => {
  const fs = await import("node:fs");
  const { parse } = await import("@babel/parser");
  const { messages } = await load();
  const literals = [];
  const ast = parse(
    fs.readFileSync(
      new URL("../lib/dependency-graph.mjs", import.meta.url),
      "utf8",
    ),
    { sourceType: "module" },
  );
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "CallExpression" &&
      (node.callee.name === "limit" ||
        node.callee.name === "translate" ||
        (node.callee.object?.name === "reasons" &&
          node.callee.property?.name === "add"))
    ) {
      for (const arg of node.arguments)
        if (arg.type === "StringLiteral") literals.push(arg.value);
    }
    if (
      node.type === "ObjectProperty" &&
      node.key.name === "notes" &&
      node.value.type === "ArrayExpression"
    ) {
      for (const value of node.value.elements)
        if (value.type === "StringLiteral") literals.push(value.value);
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
  visit(
    parse(
      fs.readFileSync(
        new URL("../lib/issue-report.mjs", import.meta.url),
        "utf8",
      ),
      { sourceType: "module" },
    ),
  );
  const { UPGRADE_PREVIEW_LIMITATIONS } = await import(
    "../lib/upgrade-contract.mjs"
  );
  for (const language of ["en", "ko"])
    for (const value of [...literals, ...UPGRADE_PREVIEW_LIMITATIONS]) {
      assert(messages[language][value], `${language}: ${value}`);
      assert.doesNotMatch(messages[language][value], /[\p{Script=Han}]/u);
    }
});

test("diagnostic preview and copied report follow locale while preserving redaction, commands and raw evidence", async () => {
  const { renderIssueReport } = await import("../lib/issue-report.mjs");
  const data = sample();
  const finding = Object.values(data.report.plugins).flatMap(
    (p) => p.findings,
  )[0];
  finding.basis = "原始依据不会被改写";
  finding.impact = "token=secret-must-stay-hidden";
  Object.values(data.report.plugins)[0].coverage.limitations.push(
    "settings 客户端尚未验证",
  );
  data.issueReport = renderIssueReport(data.report);
  const before = JSON.stringify(data),
    copied = [];
  const h = await panelHarness(data, {
    clipboard: { writeText: async (text) => copied.push(text) },
  });
  try {
    h.nodes()
      .find((n) => n.type === "button" && h.text(n) === "预览故障报告")
      .props.onClick();
    await h.settle();
    for (const locale of ["en", "ko", "zh"]) {
      h.nodes()
        .find((n) => n.props["data-ui-language"] !== undefined)
        .props.onChange({ target: { value: locale } });
      await h.settle();
      const vocabulary = (await load()).messages[locale];
      const output = h.field(vocabulary["故障报告预览"]).props.value;
      assert(
        output.startsWith(
          locale === "en"
            ? "# DSH plugin compatibility diagnostic report"
            : locale === "ko"
              ? "# DSH 플러그인 호환성 진단 보고서"
              : "# DSH 插件兼容性故障报告",
        ),
      );
      assert(output.includes("原始依据不会被改写"));
      assert(!output.includes("secret-must-stay-hidden"));
      if (locale !== "zh") {
        assert(!output.includes("settings 客户端尚未验证"));
        assert(!output.includes("本次探针明确记录该服务不存在"));
      }
      assert.deepEqual(
        output.match(/```sh\n[\s\S]*?\n```/g),
        data.issueReport.match(/```sh\n[\s\S]*?\n```/g),
      );
      const copy = h
        .nodes()
        .find(
          (n) => n.type === "button" && h.text(n) === vocabulary["复制报告"],
        );
      await copy.props.onClick();
      assert.equal(copied.at(-1), output);
    }
    assert.equal(JSON.stringify(data), before);
  } finally {
    h.dispose();
  }
});
