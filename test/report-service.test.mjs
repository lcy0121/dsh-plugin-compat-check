import { test } from "node:test";
import assert from "node:assert/strict";
import { ReportService } from "../lib/report-service.mjs";
import { bounded } from "../lib/async-boundary.mjs";
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

test(
  "report deadline releases hung flights, preserves old success, and rejects late baseline publication",
  { timeout: 5000 },
  async () => {
    let mode = "good",
      release,
      guard,
      commits = 0;
    const service = new ReportService(
      async (_, g) => {
        if (mode === "hang") {
          guard = g;
          await new Promise((r) => {
            release = r;
          });
        }
        g.commit(() => commits++);
        return { ok: true, value: mode };
      },
      { timeoutMs: 1000 },
    );
    try {
      await service.get("A");
      mode = "hang";
      const failed = await service.get("A", {}, true);
      assert.equal(failed.ok, false);
      assert.match(failed.error, /超时/);
      assert.equal(guard.signal.aborted, true);
      const retained = await service.get("A");
      assert.equal(retained.value, "good");
      assert.equal(retained.cache.stale, true);
      assert.match(retained.cache.refreshError, /超时/);
      mode = "recovered";
      assert.equal((await service.get("A", {}, true)).value, "recovered");
      release();
      await turn();
      assert.equal(commits, 2);
      assert.equal((await service.get("A")).value, "recovered");
    } finally {
      release?.();
      service.dispose();
    }
  },
);

test(
  "hung identity has a deadline and disposal releases uncooperative cold work",
  { timeout: 5000 },
  async () => {
    const service = new ReportService(async () => ({ ok: true }), {
      identity: async () => new Promise(() => {}),
      identityTimeoutMs: 1000,
    });
    try {
      assert.match((await service.get("A")).error, /超时/);
      const pending = service.get("A");
      await turn();
      service.dispose();
      assert.equal((await pending).ok, false);
    } finally {
      service.dispose();
    }
  },
);

test("report deadline options can lower but never enlarge production budgets", () => {
  for (const options of [
    { timeoutMs: 45001 },
    { identityTimeoutMs: 12001 },
    { timeoutMs: 0 },
  ])
    assert.throws(
      () => new ReportService(async () => ({ ok: true }), options),
      /deadline/,
    );
});

test("unload between async freshness validation and publication cannot commit a baseline", async () => {
  let commits = 0;
  const service = new ReportService(async (_, guard) => {
    guard.commit(() => commits++);
    const verify = guard.isCurrent;
    guard.isCurrent = async () => {
      const current = await verify();
      queueMicrotask(() => service.dispose());
      return current;
    };
    return { ok: true };
  });
  try {
    assert.equal((await service.get("A")).ok, false);
    assert.equal(commits, 0);
    assert.equal(service.states.size, 0);
  } finally {
    service.dispose();
  }
});

test("invalidation after async freshness validation publishes only the replacement generation", async () => {
  const commits = [];
  let count = 0;
  const service = new ReportService(async (_, guard) => {
    const value = ++count;
    guard.commit(() => commits.push(value));
    if (value === 1) {
      const verify = guard.isCurrent;
      guard.isCurrent = async () => {
        const current = await verify();
        queueMicrotask(() => service.invalidate("A"));
        return current;
      };
    }
    return { ok: true, value };
  });
  try {
    assert.equal((await service.get("A")).value, 2);
    assert.deepEqual(commits, [2]);
  } finally {
    service.dispose();
  }
});

test("bounded rejection never becomes success for empty or non-Error reasons", async () => {
  for (const reason of [undefined, null, false, 0, "", "upstream failed"]) {
    await assert.rejects(
      bounded(() => Promise.reject(reason), { timeoutMs: 1000 }),
      (error) =>
        error instanceof Error && /失败|upstream failed/.test(error.message),
    );
    const service = new ReportService(() => Promise.reject(reason));
    try {
      const result = await service.get("A");
      assert.equal(result.ok, false);
      assert.equal(typeof result.error, "string");
    } finally {
      service.dispose();
    }
  }
});

test(
  "unreadable rejection objects still settle the deadline as a failure",
  { timeout: 3000 },
  async () => {
    for (const reason of [
      Object.create(null),
      {
        toString() {
          throw new Error("unreadable");
        },
      },
    ])
      await assert.rejects(
        bounded(() => Promise.reject(reason), { timeoutMs: 1000 }),
        /失败/,
      );
  },
);
