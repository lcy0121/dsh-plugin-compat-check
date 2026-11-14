import test from "node:test";
import assert from "node:assert/strict";
import { validateManagerAcceptance } from "../tools/plugin-manager-acceptance.mjs";
function receipt(version = "0.2.2-rc.2") {
  const state = {
    dependency: "1.1.0",
    lifecycle: [{ event: "apply", version: "1.1.0" }],
  };
  const restore = { application: "applied", version: "1.1.0" };
  const r = {
    hostVersion: version,
    runtimePackageVersion: version,
    ok: true,
    hostStopped: true,
    cleaned: true,
    bundleContract: {
      registryUpdate: "registry",
      fileUpdateAbsent: true,
      oldUpdatableAbsent: true,
    },
    gitContract: {
      mode: "git",
      oldUpdatableAbsent: true,
      install: { application: "applied" },
      update: { result: { application: "applied" } },
      dependency: "git+http://127.0.0.1:3000/git/repo.git#" + "a".repeat(40),
      lifecycle: [{ version: "1.0.0" }, { version: "1.1.0" }],
    },
    cases: [
      { id: "install", result: { application: "applied" }, state },
      { id: "update", result: { result: { application: "applied" } }, state },
      {
        id: "enable-failure",
        result: {
          result: {
            application: "failed",
            stage: "enable",
            packageResult: { exitCode: 0 },
          },
          restore,
        },
        state,
      },
      {
        id: "bad-archive",
        result: {
          result: { application: "failed", stage: "install" },
          restore,
        },
        state,
      },
      {
        id: "cancel",
        cancelled: { status: "cancelled" },
        result: { result: { application: "cancelled" }, restore },
        state,
      },
      {
        id: "unexpected-package",
        result: {
          result: {
            application: "failed",
            error: { code: "unexpected-package" },
          },
          restore,
        },
        state,
      },
    ],
  };
  const lifecycle = [];
  for (const c of r.cases) {
    const v = c.id === "install" ? "1.0.0" : "1.1.0";
    c.before = { lifecycle: structuredClone(lifecycle) };
    lifecycle.push({ event: "apply", version: v });
    c.state = {
      dependency: v,
      packageVersion: v,
      bundle: { enabled: true, availability: "profile", version: v },
      lifecycle: structuredClone(lifecycle),
    };
  }
  return r;
}
for (const version of ["0.2.2-rc.2", "0.2.2-rc.3"])
  test("manager receipt binds all real controls to " + version, () =>
    assert.equal(validateManagerAcceptance(receipt(version), version).ok, true),
  );
test("manager CI cannot borrow an old host or a successful but incompletely restored operation", () => {
  assert.throws(() => validateManagerAcceptance(receipt(), "0.2.2-rc.3"));
  for (const mutate of [
    (r) => {
      r.cases = r.cases.filter((c) => c.id !== "unexpected-package");
    },
    (r) => {
      r.cases.find(
        (c) => c.id === "unexpected-package",
      ).result.result.error.code = "operation-error";
    },
    (r) => {
      r.cases.find((c) => c.id === "bad-archive").result.restore.application =
        "restart-required";
    },
    (r) => {
      r.cases.find((c) => c.id === "cancel").cancelled.status = "too-late";
    },
    (r) => {
      r.bundleContract.registryUpdate = "git";
    },
    (r) => {
      r.bundleContract.oldUpdatableAbsent = false;
    },
    (r) => {
      r.cases[0].state.lifecycle.push({ event: "apply", version: "9.9.9" });
    },
    (r) => {
      r.cases[2].state.packageVersion = "1.2.0";
    },
    (r) => {
      r.cases[2].state.bundle.enabled = false;
    },
    (r) => {
      r.cases[2].state.bundle.availability = "missing";
    },
    (r) => {
      r.cases[2].state.lifecycle = structuredClone(r.cases[2].before.lifecycle);
    },
    (r) => {
      r.cases[0].state.packageVersion = "9.9.9";
    },
    (r) => {
      r.gitContract.mode = "registry";
    },
    (r) => {
      r.gitContract.dependency = "git+http://127.0.0.1:3000/git/repo.git#main";
    },
    (r) => {
      r.gitContract.update.result.application = "failed";
    },
    (r) => {
      r.gitContract.lifecycle.pop();
    },
    (r) => {
      r.hostStopped = false;
    },
    (r) => {
      r.cleanupError = "stop failure";
    },
    (r) => {
      r.cleaned = false;
    },
  ]) {
    const r = receipt();
    mutate(r);
    assert.throws(() => validateManagerAcceptance(r, "0.2.2-rc.2"));
  }
});
