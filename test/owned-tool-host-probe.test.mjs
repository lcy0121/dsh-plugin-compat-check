import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const carrier =
  process.env.DSC_HOST_ELECTRON ||
  "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
test(
  "installed rc22 real tools registry, native/PTC executor policies and prompt assembly",
  { skip: process.env.DSC_RC22_HOST_PROBE !== "1", timeout: 30000 },
  async () => {
    const archive =
      process.env.DSC_HOST_ASAR ||
      "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar";
    const review = JSON.parse(
      fs.readFileSync(
        new URL("../rules/dsh-0.2.2-rc.1-review.json", import.meta.url),
      ),
    );
    assert.equal(review.dshVersion, "0.2.2-rc.1");
    const digest = createHash("sha256");
    for await (const chunk of fs.createReadStream(archive))
      digest.update(chunk);
    assert.equal(
      digest.digest("hex"),
      review.asar.sha256,
      "Refusing unreviewed host ASAR before executing its carrier",
    );
    const output = execFileSync(carrier, ["tools/owned-tool-host-probe.cjs"], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      encoding: "utf8",
      timeout: 25000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const receipt = JSON.parse(output);
    assert.equal(receipt.ok, true);
    assert.equal(receipt.version, "0.2.2-rc.1");
    assert(receipt.checks.length >= 9);
  },
);
