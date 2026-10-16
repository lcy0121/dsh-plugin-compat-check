import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
describe(
  "owned real DSH engineering",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test(
      "real DSH serves HTTP while the installed tgz analyses a large owned plugin",
      { timeout: 300000 },
      () => {
        const run = spawnSync(
          process.execPath,
          [
            fileURLToPath(
              new URL("../tools/engineering-live.mjs", import.meta.url),
            ),
          ],
          {
            env: process.env,
            encoding: "utf8",
            timeout: 290000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
        assert.equal(
          run.status,
          0,
          run.error?.message || run.stderr + run.stdout,
        );
        const result = JSON.parse(run.stdout);
        assert.equal(result.ok, true);
        assert.ok(result.http.samples >= 1);
        assert.ok(result.http.maxMilliseconds < 1500);
        assert.equal(result.artifactVersion, "0.1.1");
        assert.equal(result.reportAvailable, true);
        if (process.env.DSC_ENGINEERING_LIVE_LOG)
          fs.writeFileSync(
            process.env.DSC_ENGINEERING_LIVE_LOG,
            JSON.stringify(result, null, 2) + "\n",
          );
        assert.equal(result.cleanup.hostStopped, true);
        assert.equal(result.cleanup.privateRootRemoved, true);
      },
    );
  },
);
