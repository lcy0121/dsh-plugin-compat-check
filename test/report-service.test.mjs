import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportService } from "../lib/report-service.mjs";
test("cold and forced concurrent requests share one real compute", async () => {
  let count = 0,
    release;
  const gate = new Promise((r) => (release = r));
  const service = new ReportService(async () => {
    count++;
    await gate;
    return { ok: true, value: count };
  });
  const a = service.get("A", {}, true),
    b = service.get("A", {}, true);
  await Promise.resolve();
  assert.equal(count, 1);
  release();
  assert.deepEqual(await a, await b);
});
test("failed background computation preserves valid report and exposes error", async () => {
  let now = 0,
    count = 0;
  const service = new ReportService(
    async () =>
      ++count === 1
        ? { ok: true, value: "valid" }
        : { ok: false, error: "broken" },
    { ttlMs: 1, clock: () => now },
  );
  await service.get("A");
  now = 2;
  const cached = await service.get("A");
  assert.equal(cached.value, "valid");
  await service.state("A").inflight;
  const after = await service.get("A");
  assert.equal(after.value, "valid");
  assert.equal(after.cache.refreshError, "broken");
});

const turn = () => new Promise((r) => setImmediate(r));
test("capacity evicts the least recently requested target and a return visit recomputes", async () => {
  let count = 0,
    now = 0;
  const evicted = [];
  const service = new ReportService(
    async () => ({ ok: true, value: ++count }),
    { maxTargets: 2, clock: () => now, onEvict: (key) => evicted.push(key) },
  );
  try {
    await service.get("A");
    now++;
    await service.get("B");
    now++;
    await service.get("A");
    now++;
    await service.get("C");
    assert.equal(service.states.size, 2);
    assert.deepEqual(evicted, ["B"]);
    assert.equal((await service.get("B")).value, 4);
  } finally {
    service.dispose();
  }
});
test("idle targets stop identity polling and drop reports and input references without a new request", async () => {
  let now = 0,
    observations = 0;
  const inputs = { large: "owned" };
  const service = new ReportService(async () => ({ ok: true, value: "old" }), {
    clock: () => now,
    idleMs: 10,
    watchMs: 5,
    identity: async () => {
      observations++;
      return "stable";
    },
  });
  await service.get("A", { inputs });
  const state = service.states.get("A");
  now = 11;
  await new Promise((r) => setTimeout(r, 30));
  const stopped = observations;
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(service.states.size, 0);
  assert.equal(observations, stopped);
  assert.equal(state.timer, null);
  assert.equal(state.report, null);
  assert.deepEqual(state.options, {});
  service.dispose();
});
test("eviction aborts a running target and suppresses its late publication, baseline commit and retry", async () => {
  let release, started;
  const gate = new Promise((r) => (release = r)),
    entered = new Promise((r) => (started = r));
  let oldGuard,
    commits = [];
  const service = new ReportService(
    async ({ name }, guard) => {
      if (name === "old") {
        oldGuard = guard;
        started();
        await gate;
      }
      guard.commit(() => commits.push(name));
      return { ok: true, value: name };
    },
    { maxTargets: 1 },
  );
  const old = service.get("A", { name: "old" });
  await entered;
  assert.equal((await service.get("B", { name: "new" })).value, "new");
  assert.equal(oldGuard.signal?.aborted, true);
  release();
  assert.equal((await old).ok, false);
  await turn();
  assert.deepEqual(commits, ["new"]);
  assert.equal(service.states.size, 1);
  assert.equal(service.states.has("A"), false);
  service.dispose();
  assert.equal(service.states.size, 0);
});
test("disposal aborts identity observations and leaves no cached options or watchdogs", async () => {
  let release, entered, signal;
  const gate = new Promise((r) => (release = r)),
    start = new Promise((r) => (entered = r));
  const service = new ReportService(async () => ({ ok: true }), {
    identity: async (_, { signal: s } = {}) => {
      signal = s;
      entered();
      await gate;
      return "identity";
    },
  });
  const pending = service.get("A", { input: "large" });
  await start;
  service.dispose();
  assert.equal(signal?.aborted, true);
  release();
  assert.equal((await pending).ok, false);
  assert.equal(service.states.size, 0);
});
test("LRU uses request order even when multiple requests share a clock tick", async () => {
  const evicted = [],
    service = new ReportService(async () => ({ ok: true }), {
      maxTargets: 2,
      clock: () => 0,
      onEvict: (key) => evicted.push(key),
    });
  try {
    await service.get("A");
    await service.get("B");
    await service.get("A");
    await service.get("C");
    assert.deepEqual(evicted, ["B"]);
  } finally {
    service.dispose();
  }
});
