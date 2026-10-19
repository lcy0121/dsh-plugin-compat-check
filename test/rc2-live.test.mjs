import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

describe(
  "rc.2 actual declarations, subpath metadata and UI lifecycle",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test("real private host matches declaration evidence and shows one compatibility tab after re-enable", () => {
      const r = spawnSync(process.execPath, ["tools/rc2-live.mjs"], {
        encoding: "utf8",
        timeout: 300000,
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const value = JSON.parse(r.stdout);
      assert.equal(value.ok, true);
      if (value.applicable === false) return;
      assert.equal(value.declarationCases.length, 5);
      assert.ok(value.declarationCases.every((x) => x.matched));
      assert.equal(value.subpathMetadata, true);
      assert.deepEqual(value.originFence, {
        sameOriginStatus: 200,
        crossPortStatus: 403,
      });
      assert.equal(value.cleanup.privateRootRemoved, true);
      if (value.ui.available) {
        assert.equal(value.ui.tabCount, 1);
        assert.equal(value.ui.reenabled, true);
        assert.equal(value.ui.httpRestored, true);
      }
    });
  },
);
