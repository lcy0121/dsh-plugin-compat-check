import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptanceTarget,
  uiAcceptanceVersion,
  assertBrowserAcceptance,
} from "../tools/acceptance-target.mjs";
test("new exact host requires real UI and rejects executable mismatch", () => {
  assert.equal(acceptanceTarget("0.2.2-rc.1", "0.2.2-rc.1"), true);
  assert.equal(uiAcceptanceVersion("0.2.2-rc.1"), "0.2.2-rc.1");
  assert.throws(() => acceptanceTarget("0.2.1-rc.5", "0.2.2-rc.1"), /mismatch/);
  assert.throws(
    () => assertBrowserAcceptance("0.2.2-rc.1", false, false),
    /browser/,
  );
});
test("new host runtime rejects Node22 and early24 without dropping old host support", async () => {
  const { assertHostRuntime } = await import("../tools/acceptance-target.mjs");
  assert.equal(typeof assertHostRuntime, "function");
  for (const v of ["22.19.0", "24.0.0", "24.8.0"])
    assert.throws(() => assertHostRuntime("0.2.2-rc.1", v), /24.9/);
  for (const v of ["24.9.0", "24.21.0", "26.13.0"])
    assert.doesNotThrow(() => assertHostRuntime("0.2.2-rc.1", v));
  assert.doesNotThrow(() => assertHostRuntime("0.2.1-rc.5", "22.19.0"));
  assert.throws(() => assertHostRuntime("0.2.2-rc.1", "garbage"), /runtime/);
});
test("CI keeps static Node22 while new host verifies its runtime before installation", async () => {
  const fs = await import("node:fs");
  const YAML = (await import("yaml")).default;
  const w = YAML.parse(
    fs.readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    ),
  );
  assert(w.jobs.test.strategy.matrix.node.includes("22.19.0"));
  const job = w.jobs["linux-live"];
  assert(job.strategy.matrix.dsh.includes("0.2.2-rc.1"));
  const pre = job.steps.findIndex(
    (s) => s.name === "Verify selected host runtime before installation",
  );
  assert(pre >= 0);
  assert(
    pre <
      job.steps.findIndex((s) => s.name?.startsWith("Install pinned official")),
  );
  const ui = job.steps.find((s) => s.run?.includes("node tools/ci-ui018.mjs"));
  assert(ui.if.includes("0.2.2-rc.1"));
  const download = job.steps.find((s) =>
    s.uses?.startsWith("actions/download-artifact"),
  );
  assert(download.if.includes("0.2.2-rc.1"));
  assert(
    w.jobs.test.steps.some((s) => s.run?.includes("DSC_RC22_SOURCE_ARCHIVE")),
  );
});
test("runtime admission queries the selected carrier rather than borrowing the controller version", async () => {
  const { readHostRuntime } = await import("../tools/acceptance-target.mjs");
  assert.equal(typeof readHostRuntime, "function");
  const driver = { command: "/owned/host", env: { OWNED: "1" } };
  const query = async (c, args, timeout, env) => {
    assert.equal(c, driver.command);
    assert.deepEqual(args, ["-p", "process.versions.node"]);
    assert.equal(env, driver.env);
    return "24.8.0\n";
  };
  await assert.rejects(readHostRuntime("0.2.2-rc.1", driver, query), /24.9/);
  assert.equal(
    await readHostRuntime("0.2.2-rc.1", driver, async () => "24.21.0\n"),
    "24.21.0",
  );
});
