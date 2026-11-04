import test from "node:test";
import assert from "node:assert/strict";
import { resolveProfileTarget } from "../plugin/lib/profile-target.js";
const run = (o = {}) =>
  resolveProfileTarget({
    argv: [],
    env: {},
    home: "/home/u",
    existsSync: () => true,
    ...o,
  });
test("unknown identity never defaults to desktop", () =>
  assert.equal(run().dir, null));
for (const p of [
  "/custom/profiles/work",
  "C:\\custom\\profiles\\work",
  "\\\\server\\share\\profiles\\work",
])
  test(`positional identity ${p}`, () =>
    assert.match(
      run({ argv: ["node", "host", p], env: { DSH_PROFILE: "stale" } }).dir,
      /work[\\/]node_modules$/,
    ));
test("explicit request wins and uses custom home", () =>
  assert.equal(
    run({
      requestedProfile: "chosen",
      argv: ["--profile=other"],
      env: { DSH_HOME: "/custom" },
    }).dir,
    "/custom/profiles/chosen/node_modules",
  ));
test("DSC_PROFILE configured override retained", () =>
  assert.match(
    run({ env: { DSC_PROFILE: "chosen" } }).dir,
    /chosen\/node_modules$/,
  ));
test("conflicting argv is ambiguous", () =>
  assert.equal(run({ argv: ["--profile=a", "--profile=b"] }).dir, null));
test("stale home cannot relocate absolute running profile", () =>
  assert.equal(
    run({ argv: ["/actual/profiles/a"], env: { DSH_HOME: "/stale" } }).dir,
    "/actual/profiles/a/node_modules",
  ));
test("installation alone is not runtime identity", () =>
  assert.equal(
    run({
      modulePath:
        "/d/profiles/a/node_modules/dsh-plugin-compat-check/plugin/index.js",
    }).dir,
    null,
  ));
test("pnpm install corroborates environment profile only within home", () =>
  assert.equal(
    run({
      env: { DSH_HOME: "/d", DSH_PROFILE: "a" },
      modulePath:
        "/d/profiles/a/node_modules/.pnpm/pkg/node_modules/dsh-plugin-compat-check/plugin/index.js",
    }).dir,
    "/d/profiles/a/node_modules",
  ));
test("unverified context data does not assert identity", () =>
  assert.equal(run({ context: { profile: "desktop" } }).dir, null));
test("invalid and missing explicit profiles fail closed", () => {
  assert.equal(run({ requestedProfile: "../bad" }).dir, null);
  assert.equal(
    run({ requestedProfile: "a", existsSync: () => false }).dir,
    null,
  );
});

// Real host wrapper must pass the VM host's identity rather than imported module globals.
import { loadHost } from "./support/host-harness.mjs";
import vm from "node:vm";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
test("host default target respects known identity and ignores unverified context", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "profile-target-"));
  try {
    fs.mkdirSync(path.join(home, "profiles", "known", "node_modules"), {
      recursive: true,
    });
    const { sandbox } = loadHost({
      DSH_HOME: home,
      DSC_PROFILE: "",
      DSH_PROFILE: "stale",
      DSH_ACTIVE_PROFILE: "",
      DSH_PROFILE_NAME: "",
      DSH_PROFILE_DIR: "",
    });
    sandbox.process.argv = [
      "node",
      "host",
      path.join(home, "profiles", "known"),
    ];
    sandbox.ctx = { profile: "wrong" };
    assert.equal(
      vm.runInContext("resolveNodeModules().dir", sandbox),
      path.join(home, "profiles", "known", "node_modules"),
    );
    sandbox.process.argv = ["node", "host"];
    assert.equal(vm.runInContext("resolveNodeModules().dir", sandbox), null);
    assert.equal(
      vm.runInContext('resolveNodeModules("known").dir', sandbox),
      path.join(home, "profiles", "known", "node_modules"),
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
for (const target of [
  "C:\\custom\\profiles\\work",
  "C:/custom/profiles/work",
  "\\\\server\\share\\profiles\\work",
])
  test(`host parses Windows current profile ${target}`, () => {
    const { sandbox } = loadHost({
      DSC_PROFILE: "",
      DSH_HOME: "C:\\stale",
      DSH_PROFILE: "stale",
    });
    sandbox.process.platform = "win32";
    sandbox.process.argv = ["electron", "host", target];
    const actual = vm.runInContext("resolveNodeModules()", sandbox);
    assert.match(actual.why, /指定 profile 不存在: work/);
    assert.doesNotMatch(actual.why, /stale/);
  });
test("simultaneous host resolutions keep separate custom homes and identities", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "profile-isolation-"));
  try {
    const homes = ["one", "two"].map((n) => path.join(home, n));
    for (const h of homes)
      fs.mkdirSync(path.join(h, "profiles", "active", "node_modules"), {
        recursive: true,
      });
    const hosts = homes.map((h) =>
      loadHost({ DSH_HOME: h, DSC_PROFILE: "active" }),
    );
    const results = await Promise.all(
      hosts.map(({ sandbox }) =>
        Promise.resolve(vm.runInContext("resolveNodeModules().dir", sandbox)),
      ),
    );
    assert.deepEqual(
      results,
      homes.map((h) => path.join(h, "profiles", "active", "node_modules")),
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
