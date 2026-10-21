import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../bin/compat-check.mjs";
import { render, toJSON } from "../lib/report.mjs";
import { assertReportBody, CATALOG_REFERENCES } from "../lib/contracts.mjs";
import { loadCatalog } from "../lib/catalog.mjs";
import { SUPPORTED_PREVIEW_VERSIONS } from "../lib/upgrade-contract.mjs";
import { renderIssueReport } from "../lib/issue-report.mjs";
import { panelHarness } from "./support/panel-harness.mjs";
const root = path.resolve("."),
  nm = path.join(root, "test/fixtures/labels");
const result = (dshVersion, catalog) =>
  run({ nm, dshVersion, catalog, baseline: false, _ignoreAutoProbe: true });

test("ordinary reports distinguish an exact reviewed catalogue from unknown and future version fallback", () => {
  for (const [version, reference, selection, verified] of [
    ["0.2.0-rc.2", "0.2.0-rc.2", "exact", true],
    ["0.2.1-rc.2", "0.2.1-rc.2", "exact", true],
    ["9.9.9", "0.2.1-rc.2", "fallback", false],
    ["0.2.1-rc.1", "0.2.0-rc.2", "fallback", false],
    [undefined, "0.2.0-rc.2", "fallback", false],
  ]) {
    const body = toJSON(result(version)),
      c = body.catalog;
    assert(c, "Missing catalogue evidence for " + version);
    assert.equal(c.targetVersion, version ?? null);
    assert.equal(c.referenceVersion, reference);
    assert.equal(c.selection, selection);
    assert.equal(c.verified, verified);
    assert.match(c.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(c.certifiedVersions, [reference]);
    assert.match(c.scope, /不代表业务验收/);
    if (!verified) assert.match(c.warning, /未认证/);
  }
});

test("explicit catalogues cannot self-certify even when claiming the target version or copying known bytes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-catalog-"));
  try {
    const custom = path.join(tmp, "custom.json");
    fs.writeFileSync(
      custom,
      JSON.stringify({ _dshVersion: "9.9.9", host: {}, client: {} }),
    );
    for (const file of [
      custom,
      path.join(root, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
    ]) {
      const c = toJSON(result("9.9.9", file)).catalog;
      assert(c);
      assert.equal(c.verified, false);
      assert.equal(c.selection, "override");
      assert.deepEqual(c.certifiedVersions, []);
      assert.match(c.warning, /未认证/);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("changed bundled bytes fail closed and upgrade support cannot exceed the reviewed registry", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-catalog-pin-"));
  try {
    fs.mkdirSync(path.join(tmp, "rules"));
    fs.copyFileSync(
      path.join(root, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
      path.join(tmp, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
    );
    assert.equal(loadCatalog(tmp, "0.2.1-rc.2").evidence.verified, true);
    fs.appendFileSync(
      path.join(tmp, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
      " ",
    );
    assert.throws(() => loadCatalog(tmp, "0.2.1-rc.2"), /摘要/);
    assert.deepEqual(
      [...SUPPORTED_PREVIEW_VERSIONS].sort(),
      CATALOG_REFERENCES.map((c) => c.version).sort(),
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("fallback warning and reference digest remain visible in text, quiet and sanitized issue export", () => {
  const raw = result("9.9.9"),
    body = toJSON(raw);
  for (const text of [
    render(raw, {}),
    render(raw, { quiet: true }),
    renderIssueReport(body),
  ]) {
    assert.match(text, /9\.9\.9/);
    assert.match(text, /0\.2\.1-rc\.2/);
    assert.match(text, /未认证/);
    assert.match(
      text,
      /90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743/,
    );
  }
});

test("report contract rejects forged future certification, catalogue version and digest", () => {
  const original = toJSON(result("9.9.9"));
  assert(original.catalog);
  for (const mutate of [
    (b) => (b.catalog.verified = true),
    (b) => (b.catalog.referenceVersion = "9.9.9"),
    (b) => (b.catalog.sha256 = "0".repeat(64)),
    (b) => (b.catalog.targetVersion = "0.2.1-rc.2"),
    (b) => b.catalog.certifiedVersions.push("9.9.9"),
    (b) => (b.catalog.warning = null),
  ]) {
    const body = structuredClone(original);
    mutate(body);
    assert.throws(() => assertReportBody(body), /catalog/);
  }
});

test("panel displays the actual target, reference digest and fallback warning without hiding plugin rows", async () => {
  const report = toJSON(result("9.9.9"));
  const data = {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    baseline: null,
    report,
    computedAt: "2026-10-22T00:00:00Z",
    nodeModules: nm,
  };
  const h = await panelHarness(data);
  assert.match(h.text(), /9\.9\.9/);
  assert.match(h.text(), /参考目录.*0\.2\.1-rc\.2/);
  assert.match(h.text(), /未认证/);
  assert.match(
    h.text(),
    /90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743/,
  );
  assert(h.rows().length > 0);
});
