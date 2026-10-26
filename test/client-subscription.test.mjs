import { test } from "node:test";
import assert from "node:assert/strict";
import { createReportStore } from "../plugin/src/report-store.mjs";
const turn = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const report = (target = "A", time = "1") => ({
  kind: "plugin-compat-check/report",
  ok: true,
  computedAt: time,
  nodeModules: target,
  report: { dshVersion: "0.2.1-rc.3", plugins: {} },
  cache: { hit: false },
});
function fixture({ hidden = false, fetcher } = {}) {
  const timers = new Map(),
    listeners = new Set(),
    calls = [];
  let id = 0,
    validations = 0;
  const document = {
    visibilityState: hidden ? "hidden" : "visible",
    addEventListener: (type, fn) => {
      assert.equal(type, "visibilitychange");
      listeners.add(fn);
    },
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const store = createReportStore({
    document,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => (fetcher ? await fetcher(url, options) : report()),
      };
    },
    validate: (value) => {
      validations++;
      if (!value?.ok || !value.report) throw Error("invalid report");
      return value;
    },
    setTimeout: (fn, ms) => {
      assert.equal(ms, 2000);
      timers.set(++id, fn);
      return id;
    },
    clearTimeout: (key) => timers.delete(key),
  });
  return {
    store,
    document,
    timers,
    calls,
    listeners,
    get validations() {
      return validations;
    },
    async tick() {
      const [key, fn] = timers.entries().next().value || [];
      assert(fn, "one poll timer expected");
      timers.delete(key);
      await fn();
      await turn();
    },
    async visible(value) {
      document.visibilityState = value ? "visible" : "hidden";
      for (const fn of [...listeners]) fn();
      await turn();
    },
  };
}
test("overview, detail and badge share one request, one poll chain and one validated report", async () => {
  const f = fixture({
    fetcher: (url) =>
      url.includes("metadata=1")
        ? {
            kind: "plugin-compat-check/report-metadata",
            ok: true,
            computedAt: "1",
            nodeModules: "A",
            dshVersion: "0.2.1-rc.3",
            cache: { hit: true, ageMs: 2000 },
          }
        : report(),
  });
  const entry = f.store.target("/report"),
    a = [],
    b = [],
    c = [];
  const off = [
    entry.subscribe((v) => a.push(v)),
    entry.subscribe((v) => b.push(v)),
    entry.subscribe((v) => c.push(v)),
  ];
  await turn();
  assert.equal(f.calls.length, 1);
  assert.equal(f.timers.size, 1);
  assert.equal(f.listeners.size, 1);
  assert.equal(a.at(-1).data, b.at(-1).data);
  const original = a.at(-1).data.report;
  await f.tick();
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /metadata=1/);
  assert.equal(f.validations, 1);
  assert.equal(entry.snapshot().data.report, original);
  off[0].unsubscribe();
  off[1].unsubscribe();
  assert.equal(f.timers.size, 1);
  off[2].unsubscribe();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
});
test("hidden document pauses requests and aborts pending work; late responses cannot publish after resume", async () => {
  let resolve;
  const f = fixture({
      hidden: true,
      fetcher: () => new Promise((r) => (resolve = r)),
    }),
    entry = f.store.target("/report"),
    values = [];
  const sub = entry.subscribe((v) => values.push(v));
  await turn();
  assert.equal(f.calls.length, 0);
  await f.visible(true);
  assert.equal(f.calls.length, 1);
  await f.visible(false);
  assert(f.calls[0].options.signal.aborted);
  resolve(report("old"));
  await turn();
  assert.equal(entry.snapshot().data, null);
  assert.equal(f.timers.size, 0);
  await f.visible(true);
  assert.equal(f.calls.length, 2);
  resolve(report("new"));
  await turn();
  assert.equal(entry.snapshot().data.nodeModules, "new");
  sub.unsubscribe();
});
test("only visible subscribers activate the shared stream, and none-visible stops it without losing the last valid snapshot", async () => {
  const f = fixture(),
    e = f.store.target("/report"),
    a = e.subscribe(() => {}, { visible: false }),
    b = e.subscribe(() => {}, { visible: false });
  await turn();
  assert.equal(f.calls.length, 0);
  a.setVisible(true);
  await turn();
  assert.equal(f.calls.length, 1);
  b.setVisible(true);
  a.setVisible(false);
  assert.equal(f.timers.size, 1);
  b.setVisible(false);
  assert.equal(f.timers.size, 0);
  assert.equal(e.snapshot().data.nodeModules, "A");
  a.unsubscribe();
  b.unsubscribe();
  assert.equal(f.listeners.size, 0);
});
test("manual refreshes during an in-flight request coalesce into one subsequent forced refresh", async () => {
  const pending = [];
  const f = fixture({ fetcher: () => new Promise((r) => pending.push(r)) }),
    e = f.store.target("/report");
  const sub = e.subscribe(() => {});
  await turn();
  const a = e.refresh(true),
    b = e.refresh(true);
  assert.equal(f.calls.length, 1);
  pending.shift()(report());
  await turn();
  assert.equal(f.calls.length, 2);
  assert.match(f.calls[1].url, /refresh=1/);
  pending.shift()(report("A", "2"));
  await Promise.all([a, b]);
  assert.equal(e.snapshot().data.computedAt, "2");
  assert.equal(f.timers.size, 1);
  sub.unsubscribe();
});
test("targets are isolated and last-unsubscribe/dispose suppress ignored-abort responses and retries", async () => {
  const pending = [];
  const f = fixture({ fetcher: () => new Promise((r) => pending.push(r)) });
  const a = f.store.target("/report?target=A"),
    b = f.store.target("/report?target=B");
  const sa = a.subscribe(() => {}),
    sb = b.subscribe(() => {});
  await turn();
  assert.equal(f.calls.length, 2);
  sa.unsubscribe();
  assert(f.calls[0].options.signal.aborted);
  pending[0](report("A"));
  pending[1](report("B"));
  await turn();
  assert.equal(a.snapshot().data, null);
  assert.equal(b.snapshot().data.nodeModules, "B");
  const request = b.refresh(true);
  await turn();
  f.store.dispose();
  assert(f.calls[2].options.signal.aborted);
  pending[2](report("stale"));
  await request;
  assert.equal(b.snapshot().data.nodeModules, "B");
  assert.equal(f.timers.size, 0);
  assert.equal(f.listeners.size, 0);
  sb.unsubscribe();
});
test("invalid full responses retain valid data with a visible error and recover on refresh", async () => {
  let value = report();
  const f = fixture({ fetcher: () => value }),
    e = f.store.target("/report"),
    sub = e.subscribe(() => {});
  await turn();
  const previous = e.snapshot().data.report;
  value = { bad: true };
  await e.refresh(true);
  assert.equal(e.snapshot().data.report, previous);
  assert.match(e.snapshot().data.cache.refreshError, /invalid report/);
  assert.equal(e.snapshot().data.cache.stale, true);
  value = report("A", "next");
  await e.refresh(true);
  assert.equal(e.snapshot().error, null);
  assert.equal(e.snapshot().data.computedAt, "next");
  sub.unsubscribe();
});
test("changed metadata and malformed cache metadata require a fully validated read before reuse", async () => {
  let meta = {
    kind: "plugin-compat-check/report-metadata",
    ok: true,
    computedAt: "1",
    nodeModules: "A",
    dshVersion: "0.2.1-rc.3",
    cache: { hit: true, ageMs: "wrong" },
  };
  const f = fixture({
      fetcher: (url) => (url.includes("metadata=1") ? meta : report()),
    }),
    e = f.store.target("/report"),
    sub = e.subscribe(() => {});
  await turn();
  await f.tick();
  assert.equal(f.calls.length, 3);
  assert.equal(f.validations, 2);
  meta = { ...meta, computedAt: "changed", cache: { hit: true } };
  await f.tick();
  assert.equal(f.calls.length, 5);
  assert.equal(f.validations, 3);
  sub.unsubscribe();
});

test("a manual refresh interrupted by visibility is retried as force when visible again", async () => {
  const pending = [];
  const f = fixture({
      fetcher: (url) =>
        url === "/report" ? report() : new Promise((r) => pending.push(r)),
    }),
    e = f.store.target("/report"),
    sub = e.subscribe(() => {});
  try {
    await turn();
    const force = e.refresh(true);
    await turn();
    await f.visible(false);
    await f.visible(true);
    const resumed = e.refresh(false);
    assert.match(f.calls.at(-1).url, /refresh=1/);
    pending[0](report());
    pending[1](report("A", "fresh"));
    await Promise.all([force, resumed]);
    assert.equal(e.snapshot().data.computedAt, "fresh");
  } finally {
    sub.unsubscribe();
  }
});
