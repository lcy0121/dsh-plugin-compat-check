import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { loadCatalog } from "../lib/catalog.mjs";
import { runUpgradePreview } from "../lib/upgrade-preview.mjs";
import { packageFixture } from "./fixture-utils.mjs";
const root = new URL("..", import.meta.url).pathname;
test("0.2.2-rc.1 selects independently reviewed bytes while future hosts remain uncertified", () => {
  const exact = loadCatalog(root, "0.2.2-rc.1");
  assert.equal(exact.evidence.verified, true);
  assert.equal(exact.catalog.host.tools.methods.includes("resolve"), true);
  assert.equal(
    exact.catalog.host.tools.methods.includes("executionMode"),
    false,
  );
  assert.equal(loadCatalog(root, "0.2.2-rc.2").evidence.verified, false);
  assert.equal(
    loadCatalog(root, "0.2.1-rc.5").evidence.referenceVersion,
    "0.2.1-rc.5",
  );
});
test("new catalogue participates in bidirectional static preview without executing the input", async (t) => {
  const f = packageFixture(
    'throw Error("DO_NOT_EXECUTE");export function apply(ctx){ctx.tools.resolve({})}',
  );
  t.after(f.cleanup);
  for (const [currentVersion, targetVersion] of [
    ["0.2.1-rc.5", "0.2.2-rc.1"],
    ["0.2.2-rc.1", "0.2.1-rc.5"],
    ["0.2.2-rc.1", "0.2.2-rc.1"],
  ]) {
    const r = await runUpgradePreview({
      nm: f.nm,
      currentVersion,
      targetVersion,
    });
    assert.equal(r.status, "compared", r.error);
    assert.equal(r.targetReport.catalog.verified, true);
    assert.equal(r.currentReport.catalog.verified, true);
    assert.equal(r.baseline, null);
    assert.equal(r.cache, null);
  }
  const r = await runUpgradePreview({
    nm: "/must-not-read",
    currentVersion: "0.2.2-rc.1",
    targetVersion: "0.2.2-rc.2",
  });
  assert.equal(r.status, "unsupported-version");
});
test("author defaults add the reviewed new host without silently dropping earlier targets", (t) => {
  const f = packageFixture(
    'export function apply(ctx){ctx.tools.register({name:"x"})}',
  );
  t.after(f.cleanup);
  const r = spawnSync(
    process.execPath,
    ["tools/author-ci.mjs", "--package", f.pkg],
    { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
  );
  assert.notEqual(r.status, 3, r.stderr + r.stdout);
  const v = JSON.parse(r.stdout);
  assert.deepEqual(
    v.cells.map((x) => x.dshVersion),
    ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.3", "0.2.1-rc.5", "0.2.2-rc.1"],
  );
  assert.equal(v.cells.at(-1).report.catalog.verified, true);
});
