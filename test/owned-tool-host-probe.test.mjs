import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
const hostVersion = process.env.DSC_ACCEPTANCE_DSH_VERSION || "0.2.2-rc.1";
const carrier =
  process.env.DSC_HOST_ELECTRON ||
  "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness";
test(
  "selected exact host real tools registry, native/PTC executor policies and prompt assembly",
  { skip: process.env.DSC_RC22_HOST_PROBE !== "1", timeout: 30000 },
  async () => {
    const archive =
      process.env.DSC_HOST_ASAR ||
      "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar";
    assert(["0.2.2-rc.1", "0.2.2-rc.2", "0.2.2-rc.3"].includes(hostVersion));
    const review = JSON.parse(
      fs.readFileSync(
        new URL(`../rules/dsh-${hostVersion}-review.json`, import.meta.url),
      ),
    );
    assert.equal(review.dshVersion, hostVersion);
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
    assert.equal(receipt.version, hostVersion);
    assert(receipt.checks.length >= (hostVersion === "0.2.2-rc.1" ? 9 : 15));
    if (hostVersion !== "0.2.2-rc.1") {
      assert.match(
        receipt.checks.join("\n"),
        /caller ownerCtx.*controlled factory/,
      );
      assert.match(receipt.checks.join("\n"), /single\/array overloads/);
      assert.match(receipt.checks.join("\n"), /model-ordered/);
      assert.equal(Object.keys(receipt.sourceSha256).length, 8);
    }
  },
);

// Unsupported targets must stop before reading/importing any selected archive.
test("host tool probe rejects an unreviewed target before archive access", () => {
  const child = spawnSync(
    process.execPath,
    ["tools/owned-tool-host-probe.cjs"],
    {
      env: {
        ...process.env,
        DSC_ACCEPTANCE_DSH_VERSION: "99.0.0",
        DSC_HOST_ASAR: "/missing-owned-probe.asar",
      },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Refusing unreviewed exact host probe target/);
  assert.doesNotMatch(child.stderr, /ENOENT/);
});
