import test from "node:test";
import assert from "node:assert/strict";
import { loaderObservations } from "../plugin/lib/host-resources.js";
import { captureLoaderLabels } from "../probe/index.mjs";
import { loadHost } from "./support/host-harness.mjs";

const manifests = [{ name: "sample" }, { name: "other" }];
const context = (...entries) => ({
  loader: {
    *entries() {
      yield* entries;
    },
  },
});
const entry = (extra = {}) => ({
  id: "tree:child",
  options: { name: "sample" },
  disabled: false,
  fiber: { state: 3 },
  ...extra,
});

test("recursive loader entries map by package name and retain numeric states", () => {
  const result = loaderObservations(context(entry()), manifests);
  assert.equal(result.rows[0].packageName, "sample");
  assert.equal(result.rows[0].id, "tree:child");
  assert.equal(result.rows[0].state, "FAILED");
  assert.equal(
    captureLoaderLabels(context(entry()), {}).entries[0].stateCode,
    3,
  );
});
test("unknown state shapes cannot become measured FAILED or PENDING", () => {
  for (const state of ["3", "0", null, -1, 6, NaN]) {
    const result = loaderObservations(
      context(entry({ fiber: { state } })),
      manifests,
    );
    assert.equal(result.rows[0].state, "UNREADABLE", String(state));
  }
});
test("unknown effective disabled state cannot establish activation failure", () => {
  for (const disabled of [undefined, null, "false", 0]) {
    const result = loaderObservations(context(entry({ disabled })), manifests);
    assert.equal(result.rows[0].state, "UNREADABLE");
  }
});
test("tree-local ids alone are not package identity", () => {
  const result = loaderObservations(
    context(entry({ id: "sample", options: {} })),
    manifests,
  );
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.unmapped, ["sample"]);
});
test("conflicting package identities and ambiguous listing ids remain unmapped", () => {
  assert.equal(
    loaderObservations(context(entry({ packageName: "other" })), manifests).rows
      .length,
    0,
  );
  const result = loaderObservations(
    context(entry({ options: {} })),
    manifests,
    [
      { id: "tree:child", packageName: "sample" },
      { id: "tree:child", packageName: "other" },
    ],
  );
  assert.equal(result.rows.length, 0);
});
test("inject probe disposes returned Fiber and preserves old callable disposers", async () => {
  const { sandbox } = loadHost();
  let disposed = 0;
  const fiber = {
    dispose() {
      assert.equal(this, fiber);
      disposed++;
      return Promise.resolve();
    },
  };
  const dispose = sandbox.startInjectProbe({ inject: () => fiber }, {});
  assert.equal(typeof dispose, "function");
  await dispose();
  const old = () => disposed++;
  assert.equal(sandbox.startInjectProbe({ inject: () => old }, {}), old);
  assert.equal(disposed, 1);
});
test("diagnostic unknown states do not await a Fiber", async () => {
  const { sandbox } = loadHost();
  let awaited = false;
  const row = await sandbox.introspectEntry(
    entry({
      fiber: {
        state: "3",
        inject: {},
        await() {
          awaited = true;
        },
      },
    }),
  );
  assert.equal(awaited, false);
  assert.equal(row.fiberStateCode, null);
  assert.match(row.fiberState, /UNKNOWN/);
});
test("independent labels mark unknown disabled shape incomplete", () => {
  const label = captureLoaderLabels(
    context(entry({ disabled: undefined })),
    {},
  );
  assert.equal(label.complete, false);
  assert.equal(label.entries.length, 0);
});
test("unknown explicit package identity cannot borrow a known module name", () => {
  for (const item of [
    entry({ packageName: "unknown-not-manifest" }),
    entry({ options: { packageName: "unknown-not-manifest", name: "sample" } }),
  ]) {
    assert.equal(loaderObservations(context(item), manifests).rows.length, 0);
  }
  const alias = entry({
    packageName: "sample",
    options: { name: "./module-alias.js" },
  });
  assert.equal(
    loaderObservations(context(alias), manifests).rows[0].packageName,
    "sample",
  );
});
test("independent label budget counts rejected unknown entries as inspected work", () => {
  let inspected = 0;
  const ctx = {
    loader: {
      *entries() {
        for (let i = 0; i < 20002; i++) {
          inspected++;
          yield entry({ disabled: undefined });
        }
      },
    },
  };
  const label = captureLoaderLabels(ctx, {});
  assert.equal(inspected, 20001);
  assert.equal(label.complete, false);
  assert.equal(label.entries.length, 0);
});
test("independent truth scorer cannot infer package ownership from a tree-local id", async () => {
  const { scoreLabels } = await import("../tools/label-metrics.mjs");
  for (const id of ["sample", "include:sample"]) {
    const r = scoreLabels(
      { plugins: { sample: { verdict: "ok", findings: [] } } },
      {
        entries: [
          {
            id,
            name: null,
            packageName: null,
            stateCode: 3,
            disabled: false,
            group: false,
          },
        ],
      },
    );
    assert.equal(r.metrics.scored, 0);
    assert.equal(r.unmappedLabels.length, 1);
    assert.equal(r.rows[0].reason, "no-label");
  }
});
