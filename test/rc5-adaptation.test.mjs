import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadCatalog } from "../lib/catalog.mjs";
import { runUpgradePreview } from "../lib/upgrade-preview.mjs";
import { packageFixture } from "./fixture-utils.mjs";
import {
  acceptanceTarget,
  assertBrowserAcceptance,
} from "../tools/acceptance-target.mjs";
const root = new URL("..", import.meta.url).pathname;
test("rc.5 uses its own reviewed catalogue; rc.4 and future references remain uncertified", () => {
  for (const [version, reference, verified] of [
    ["0.2.1-rc.3", "0.2.1-rc.3", true],
    ["0.2.1-rc.4", "0.2.1-rc.3", false],
    ["0.2.1-rc.5", "0.2.1-rc.5", true],
    ["0.2.1-rc.6", "0.2.1-rc.5", false],
    ["9.9.9", "0.2.1-rc.5", false],
  ]) {
    const c = loadCatalog(root, version);
    assert.equal(c.evidence.referenceVersion, reference);
    assert.equal(c.evidence.verified, verified);
  }
  assert.equal(
    loadCatalog(
      root,
      "0.2.1-rc.5",
      path.join(root, "rules/dsh-api-catalog-0.2.1-rc.5.json"),
    ).evidence.verified,
    false,
  );
});
test("rc.5 preview compares both directions and same version without executing source or borrowing ordinary state", async (t) => {
  const f = packageFixture(
    'throw Error("MUST NOT EXECUTE");export function apply(ctx){ctx.tools.register({name:"fixture"})}',
    { meta: { engines: { dsh: "0.2.1-rc.3" } } },
  );
  t.after(f.cleanup);
  for (const [currentVersion, targetVersion] of [
    ["0.2.1-rc.3", "0.2.1-rc.5"],
    ["0.2.1-rc.5", "0.2.1-rc.3"],
    ["0.2.1-rc.5", "0.2.1-rc.5"],
  ]) {
    const r = await runUpgradePreview({
      nm: f.nm,
      currentVersion,
      targetVersion,
    });
    assert.equal(r.status, "compared", r.error);
    assert.equal(r.currentReport.catalog.verified, true);
    assert.equal(r.targetReport.catalog.verified, true);
    assert.equal(r.baseline, null);
    assert.equal(r.cache, null);
    if (currentVersion === targetVersion) assert.equal(r.summary.added, 0);
  }
  for (const targetVersion of ["0.2.1-rc.4", "0.2.1-rc.6", "^0.2.1", null]) {
    const r = await runUpgradePreview({
      nm: "/missing/do-not-read",
      currentVersion: "0.2.1-rc.5",
      targetVersion,
    });
    assert.equal(r.status, "unsupported-version");
    assert.equal(r.exitCode, 3);
  }
});
test("rc.5 author default includes a fourth exact cell and all exports preserve its identity", (t) => {
  const f = packageFixture(
    'throw Error("MUST NOT EXECUTE");export function apply(ctx){ctx.tools.register({name:"fixture"})}',
  );
  t.after(f.cleanup);
  for (const format of ["json", "sarif", "junit", "html"]) {
    const r = spawnSync(
      process.execPath,
      ["tools/author-ci.mjs", "--package", f.pkg, "--format", format],
      { encoding: "utf8", timeout: 45000, maxBuffer: 8 * 1024 * 1024 },
    );
    assert.notEqual(r.status, 3, r.stderr + r.stdout);
    assert.match(r.stdout, /0.2.1-rc.5/);
    if (format === "json") {
      const m = JSON.parse(r.stdout);
      assert.equal(m.cells.length, 4);
      const c = m.cells.find((c) => c.dshVersion === "0.2.1-rc.5");
      assert.equal(c.report.catalog.verified, true);
      assert.equal(c.report.observation.mode, "catalogue");
    }
  }
});
test("rc.5 live target refuses mismatches and cannot pass without a browser", () => {
  assert.equal(acceptanceTarget("0.2.1-rc.5", "0.2.1-rc.5"), true);
  assert.throws(() => acceptanceTarget("0.2.1-rc.3", "0.2.1-rc.5"), /mismatch/);
  assert.throws(
    () => assertBrowserAcceptance("0.2.1-rc.5", false, false),
    /browser/,
  );
  assert.doesNotThrow(() => assertBrowserAcceptance("0.2.1-rc.5", false, true));
});
test("explicit rc.5 runner rejects an old executable and reports cleanup rather than skipped success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-rc5-mismatch-"));
  try {
    fs.writeFileSync(path.join(dir, "dsh"), "#!/bin/sh\necho 0.2.1-rc.3\n", {
      mode: 0o700,
    });
    const r = spawnSync(process.execPath, ["tools/rc2-live.mjs"], {
      encoding: "utf8",
      timeout: 10000,
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        DSC_ACCEPTANCE_DSH_VERSION: "0.2.1-rc.5",
      },
    });
    assert.notEqual(r.status, 0);
    const v = JSON.parse(r.stdout);
    assert.equal(v.ok, false);
    assert.match(v.error, /mismatch/);
    assert.equal(v.cleanup.privateRootRemoved, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("ACP evidence rejects stdout diagnostics, incomplete frame tails and error responses", async () => {
  const { parseAcpFrames } = await import("../tools/rc5-acp-stdout.mjs");
  assert.equal(
    parseAcpFrames('{"jsonrpc":"2.0","id":1,"result":{}}\n').length,
    1,
  );
  for (const text of [
    'diagnostic\n{"jsonrpc":"2.0"}\n',
    '{"jsonrpc":"2.0"}\npartial',
    '{"jsonrpc":"1.0","id":1}\n',
    '{"jsonrpc":"2.0","id":1,"error":{"code":-1}}\n',
    "",
  ])
    assert.throws(() => parseAcpFrames(text));
});

test("ACP frames require a real request or response envelope, not merely jsonrpc and id", async () => {
  const { parseAcpFrames } = await import("../tools/rc5-acp-stdout.mjs");
  for (const f of [
    { jsonrpc: "2.0", id: 1 },
    { jsonrpc: "2.0", id: { x: 1 }, result: {} },
    { jsonrpc: "2.0", id: 1, method: "x", result: {} },
  ])
    assert.throws(() => parseAcpFrames(JSON.stringify(f)));
});

test("ACP resource receipt requires an actual completed tool notification, not just a second model response", async () => {
  const { assertAcpResourceOutcome } = await import(
    "../tools/rc5-acp-stdout.mjs"
  );
  assert.equal(
    assertAcpResourceOutcome([
      {
        method: "session/update",
        params: {
          update: { sessionUpdate: "tool_call_update", status: "completed" },
        },
      },
    ]),
    true,
  );
  for (const frames of [
    [],
    [
      {
        method: "session/update",
        params: {
          update: { sessionUpdate: "tool_call_update", status: "failed" },
        },
      },
    ],
    [
      {
        method: "other",
        params: {
          update: { sessionUpdate: "tool_call_update", status: "completed" },
        },
      },
    ],
  ])
    assert.throws(() => assertAcpResourceOutcome(frames));
});
