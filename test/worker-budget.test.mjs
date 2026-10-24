import test from "node:test";
import assert from "node:assert/strict";
import { runReportWorkerTask as runWorkerTask } from "../lib/worker-analysis.mjs";
const job = new URL("./support/resource-worker.mjs", import.meta.url);
async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail("worker did not enter observed state");
}
test("worker budget is shared across concurrent jobs; queued cancellation never starts a thread and a freed slot recovers", async () => {
  const controllers = Array.from({ length: 3 }, () => new AbortController()),
    buffers = controllers.map(() => new SharedArrayBuffer(4));
  const tasks = controllers.map((c, i) =>
    runWorkerTask(
      job,
      { action: "cpu", counter: buffers[i] },
      { signal: c.signal, timeoutMs: 5000 },
    ).catch((e) => e),
  );
  try {
    await until(() =>
      [0, 1].every((i) => Atomics.load(new Int32Array(buffers[i]), 0) > 0),
    );
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(Atomics.load(new Int32Array(buffers[2]), 0), 0);
    controllers[2].abort();
    assert.equal((await tasks[2]).code, "DSC_WORKER_ABORTED");
    controllers[0].abort();
    await tasks[0];
    assert.equal((await runWorkerTask(job, { action: "result" })).answer, 42);
  } finally {
    controllers.forEach((c) => c.abort());
    await Promise.all(tasks);
  }
});
test("worker admission rejects excess queued jobs and releases all admission slots after cancellation", async () => {
  const controller = new AbortController();
  const tasks = Array.from({ length: 35 }, () =>
    runWorkerTask(
      job,
      { action: "cpu", counter: new SharedArrayBuffer(4) },
      { signal: controller.signal, timeoutMs: 5000 },
    ).catch((e) => e),
  );
  await new Promise((r) => setTimeout(r, 20));
  controller.abort();
  const outcomes = await Promise.all(tasks);
  assert(outcomes.some((e) => e.code === "DSC_WORKER_CAPACITY"));
  assert.equal((await runWorkerTask(job, { action: "result" })).answer, 42);
});
test("queued work has a deadline and cannot start after its caller timed out", async () => {
  const controller = new AbortController(),
    buffers = [new SharedArrayBuffer(4), new SharedArrayBuffer(4)];
  const tasks = buffers.map((counter) =>
    runWorkerTask(
      job,
      { action: "cpu", counter },
      { signal: controller.signal, timeoutMs: 5000 },
    ).catch((e) => e),
  );
  const queuedCounter = new SharedArrayBuffer(4);
  try {
    await until(() =>
      buffers.every((b) => Atomics.load(new Int32Array(b), 0) > 0),
    );
    await assert.rejects(
      runWorkerTask(
        job,
        { action: "cpu", counter: queuedCounter },
        { timeoutMs: 30 },
      ),
      (e) => e.code === "DSC_WORKER_TIMEOUT",
    );
    assert.equal(Atomics.load(new Int32Array(queuedCounter), 0), 0);
  } finally {
    controller.abort();
    await Promise.all(tasks);
  }
  assert.equal((await runWorkerTask(job, { action: "result" })).answer, 42);
});
test("saturated ordinary report work cannot refuse upgrade snapshot capture or owned cleanup", async (t) => {
  const fs = await import("node:fs"),
    os = await import("node:os"),
    path = await import("node:path");
  const { captureUpgradeInput } = await import("../lib/upgrade-input.mjs");
  const root = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "dsc-queue-cleanup-")),
    ),
    nm = path.join(root, "node_modules");
  fs.mkdirSync(nm);
  const existing = await captureUpgradeInput(nm),
    controller = new AbortController();
  const tasks = Array.from({ length: 34 }, () =>
    runWorkerTask(
      job,
      { action: "cpu", counter: new SharedArrayBuffer(4) },
      { signal: controller.signal, timeoutMs: 5000 },
    ).catch((e) => e),
  );
  try {
    await assert.doesNotReject(existing.dispose());
    const next = await captureUpgradeInput(nm);
    await next.dispose();
  } finally {
    controller.abort();
    await Promise.all(tasks);
    await existing.dispose().catch(() => {});
    fs.rmSync(root, { recursive: true, force: true });
  }
});
