import test from "node:test";
import assert from "node:assert/strict";
const acceptance = await import("../tools/acceptance-target.mjs").catch(
  () => ({}),
);

test("an explicit acceptance target must match the actual host; rc.3 cannot skip green", () => {
  assert.equal(typeof acceptance.acceptanceTarget, "function");
  assert.equal(acceptance.acceptanceTarget("0.2.1-rc.3", "0.2.1-rc.3"), true);
  assert.throws(
    () => acceptance.acceptanceTarget("0.2.1-rc.2", "0.2.1-rc.3"),
    /mismatch/,
  );
  assert.throws(
    () => acceptance.acceptanceTarget("0.2.1-rc.3", "latest"),
    /exact/,
  );
  assert.equal(acceptance.acceptanceTarget("0.2.0-rc.2"), false);
  assert.equal(acceptance.acceptanceTarget("0.2.1-rc.3"), true);
  assert.equal(typeof acceptance.assertBrowserAcceptance, "function");
  assert.throws(
    () => acceptance.assertBrowserAcceptance("0.2.1-rc.3", false, false),
    /browser/,
  );
  assert.throws(
    () => acceptance.assertBrowserAcceptance(undefined, true, false),
    /browser/,
  );
  assert.doesNotThrow(() =>
    acceptance.assertBrowserAcceptance(undefined, false, false),
  );
  assert.doesNotThrow(() =>
    acceptance.assertBrowserAcceptance("0.2.1-rc.3", false, true),
  );
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("explicit rc.3 real runner refuses a mismatched executable without applicable:false success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-runtime-mismatch-"));
  try {
    fs.writeFileSync(path.join(dir, "dsh"), "#!/bin/sh\necho 0.2.1-rc.2\n", {
      mode: 0o700,
    });
    const r = spawnSync(process.execPath, ["tools/rc2-live.mjs"], {
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        DSC_ACCEPTANCE_DSH_VERSION: "0.2.1-rc.3",
        DEEPSEEK_API_KEY: "test-must-not-inherit",
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    const value = JSON.parse(r.stdout);
    assert.equal(value.ok, false);
    assert.match(value.error, /mismatch/);
    assert.equal(value.cleanup.privateRootRemoved, true);
    assert(!r.stdout.includes("test-must-not-inherit"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
