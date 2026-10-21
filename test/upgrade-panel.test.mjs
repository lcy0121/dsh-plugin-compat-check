import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { catalogPathFor } from "../lib/catalog.mjs";
import { toJSON } from "../lib/report.mjs";
import { panelHarness } from "./support/panel-harness.mjs";
function ordinary() {
  const nm = path.resolve("test/fixtures/labels"),
    catalog = JSON.parse(
      fs.readFileSync(catalogPathFor(path.resolve("."), "0.2.0-rc.2")),
    ),
    rules = JSON.parse(fs.readFileSync("rules/severity.json")),
    extract = extractWithProvenance(nm, { catalog }),
    verdict = buildVerdicts({
      report: extract.report,
      catalog,
      rules,
      dshVersion: "0.2.0-rc.2",
    });
  const report = toJSON({
    extract,
    verdict,
    error: null,
    baseline: null,
    inputs: { nodeModules: nm },
  });
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    baseline: null,
    report,
  };
}
function enter(h, value) {
  const input = h.field("目标 DSH 版本");
  assert(input, "Upgrade target input is missing");
  input.props.onChange({ target: { value } });
  h.render();
}
function click(h) {
  const button = h.button("运行升级预检");
  assert(button, "Upgrade preflight entry missing");
  return button.props.onClick();
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-upgrade-panel-")),
    nm = path.join(root, "node_modules"),
    pkg = path.join(nm, "upgrade-demo");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "upgrade-demo",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
      engines: { dsh: "<0.2.1-rc.1" },
      peerDependencies: { "@deepseek-ai/dsh": ">=0.2.0-rc.2 <0.2.1-rc.1" },
    }),
  );
  fs.writeFileSync(path.join(pkg, "index.js"), "export function apply(){}");
  fs.writeFileSync(path.join(pkg, "cordis.patch.yml"), "- name: ./index.js\n");
  return { root, nm };
}
test("preflight is explicit and sends only version context to a separate same-origin route, preserving the ordinary report", async () => {
  const data = ordinary(),
    before = JSON.stringify(data),
    requests = [];
  const h = await panelHarness(data, {
    fetcher: async (url, options) => {
      requests.push({ url, options });
      if (String(url).includes("/upgrade-preview"))
        return { ok: false, status: 503 };
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  assert.equal(requests.length, 1);
  enter(h, "0.2.1-rc.2");
  await click(h);
  await h.settle();
  assert.equal(requests.length, 2);
  const query = new URL(requests[1].url, "http://localhost");
  assert.equal(query.pathname, "/plugin-compat-check/upgrade-preview");
  assert.equal(query.searchParams.get("targetVersion"), "0.2.1-rc.2");
  assert.equal(query.searchParams.get("currentVersion"), "0.2.0-rc.2");
  assert.equal(query.searchParams.has("probe"), false);
  assert.equal(requests[1].options.credentials, "same-origin");
  assert.match(h.text(), /HTTP 503/);
  assert.equal(h.rows().length, 4);
  assert.equal(JSON.stringify(data), before);
});
test("actual static comparison is displayed separately with added findings, catalogue provenance, artifact identity and coverage limits", async () => {
  const data = ordinary(),
    f = fixture();
  let preview;
  try {
    const h = await panelHarness(data, {
      fetcher: async (url) => {
        if (!String(url).includes("/upgrade-preview"))
          return { ok: true, json: async () => structuredClone(data) };
        const { runUpgradePreview } = await import(
          "../lib/upgrade-preview.mjs"
        );
        preview = await runUpgradePreview({
          nm: f.nm,
          currentVersion: "0.2.0-rc.2",
          targetVersion: "0.2.1-rc.2",
        });
        return { ok: true, json: async () => structuredClone(preview) };
      },
    });
    enter(h, "0.2.1-rc.2");
    await click(h);
    await h.settle();
    assert.match(h.text(), /新增.*1/);
    assert.match(h.text(), /upgrade-demo/);
    assert.match(h.text(), /declared-incompatible/);
    assert.match(h.text(), /certain/);
    assert.match(h.text(), /inferred/);
    assert.match(h.text(), /静态.*不.*业务|不等于.*业务/);
    assert.match(h.text(), new RegExp(preview.artifact.sha256));
    assert.match(h.text(), /dsh-api-catalog/);
    assert.equal(h.rows().length, 4);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
test("unknown version uses the core unsupported response and cannot appear as no new risk", async () => {
  const data = ordinary();
  const h = await panelHarness(data, {
    fetcher: async (url) => {
      if (!String(url).includes("/upgrade-preview"))
        return { ok: true, json: async () => structuredClone(data) };
      const { runUpgradePreview } = await import("../lib/upgrade-preview.mjs");
      return {
        ok: true,
        json: async () =>
          await runUpgradePreview({
            nm: "/not-read",
            currentVersion: "0.2.0-rc.2",
            targetVersion: "9.9.9",
          }),
      };
    },
  });
  enter(h, "9.9.9");
  await click(h);
  await h.settle();
  assert.match(h.text(), /未认证/);
  assert.doesNotMatch(
    h.text(h.find((n) => n.props["data-upgrade-preview"])),
    /新增风险.*0/,
  );
  assert.equal(h.rows().length, 4);
});
test("malformed comparison cannot be presented as success", async () => {
  const data = ordinary();
  const h = await panelHarness(data, {
    fetcher: async (url) =>
      String(url).includes("/upgrade-preview")
        ? { ok: true, json: async () => ({ ok: true, summary: { added: 0 } }) }
        : { ok: true, json: async () => structuredClone(data) },
  });
  enter(h, "0.2.1-rc.2");
  await click(h);
  await h.settle();
  assert.match(h.text(), /预检.*格式|预检.*无效|预检.*契约/);
  assert.equal(h.rows().length, 4);
});
test("editing the target while a request is pending hides stale success and preserves ordinary filters", async () => {
  const data = ordinary();
  let release;
  const h = await panelHarness(data, {
    fetcher: async (url) =>
      String(url).includes("/upgrade-preview")
        ? await new Promise((resolve) => {
            release = resolve;
          })
        : { ok: true, json: async () => structuredClone(data) },
  });
  enter(h, "0.2.1-rc.2");
  const pending = click(h);
  h.render();
  assert.match(h.text(), /正在捕获/);
  enter(h, "9.9.9");
  release({ ok: false, status: 503 });
  await pending;
  await h.settle();
  assert.doesNotMatch(
    h.text(h.find((n) => n.props["data-upgrade-preview"])),
    /HTTP 503|正在捕获/,
  );
  assert.equal(h.field("目标 DSH 版本").props.value, "9.9.9");
  assert.equal(h.rows().length, 4);
});
test("a response for a different target is rejected instead of labeling it as the requested prediction", async () => {
  const data = ordinary(),
    f = fixture();
  try {
    const { runUpgradePreview } = await import("../lib/upgrade-preview.mjs");
    const r = await runUpgradePreview({
      nm: f.nm,
      currentVersion: "0.2.0-rc.2",
      targetVersion: "0.2.0-rc.2",
    });
    const h = await panelHarness(data, {
      fetcher: async (url) =>
        String(url).includes("/upgrade-preview")
          ? { ok: true, json: async () => structuredClone(r) }
          : { ok: true, json: async () => structuredClone(data) },
    });
    enter(h, "0.2.1-rc.2");
    await click(h);
    await h.settle();
    assert.match(h.text(), /预检版本已变化/);
    assert.equal(h.rows().length, 4);
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
});
