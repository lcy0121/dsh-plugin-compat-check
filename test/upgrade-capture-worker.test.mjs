import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { runUpgradePreview } from "../lib/upgrade-preview.mjs";
import { runWorkerTask } from "../lib/worker-analysis.mjs";
import { captureUpgradeInput } from "../lib/upgrade-input.mjs";
import { assertUpgradePreview } from "../lib/upgrade-contract.mjs";

function fixture(t, count = 8000) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-capture-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, "node_modules"),
    pkg = path.join(nm, "capture-fixture");
  writePackageFixture(
    pkg,
    {
      name: "capture-fixture",
      version: "1.0.0",
      main: "index.js",
      dsh: {},
    },
    "export default ctx => ctx.settings.get('x');",
  );
  for (let i = 0; i < count; i++)
    fs.writeFileSync(path.join(pkg, `data-${i}.txt`), "capture-data");
  return { root, nm, pkg };
}
const input = (f) => ({
  nm: f.nm,
  currentVersion: "0.2.0-rc.2",
  targetVersion: "0.2.1-rc.2",
});

// Moving capture back to the calling thread blocks the first scheduled heartbeat.
test("large real installed input starts and captures without blocking parent heartbeats", async (t) => {
  const f = fixture(t);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  const start = performance.now();
  const pending = runUpgradePreview(input(f));
  const callMilliseconds = performance.now() - start;
  try {
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(
      callMilliseconds < 200,
      `calling capture blocked parent for ${callMilliseconds}ms`,
    );
    assert.ok(ticks >= 2, "parent timers run while real files are captured");
    const result = await pending;
    assert.equal(result.status, "compared", result.error);
    assert.equal(result.artifact.packages[0].name, "capture-fixture");
  } finally {
    clearInterval(timer);
    await pending;
  }
});

async function until(predicate, message) {
  const end = performance.now() + 5000;
  while (performance.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(message);
}

// Removing abort supervision leaves this real CPU job running until timeout.
test("abort terminates an observed running worker before returning and a fresh worker recovers", async () => {
  const controller = new AbortController(),
    counter = new SharedArrayBuffer(4);
  const job = new URL("./support/resource-worker.mjs", import.meta.url);
  const pending = runWorkerTask(
    job,
    { action: "cpu", counter },
    { signal: controller.signal, timeoutMs: 2000 },
  );
  const rejected = assert.rejects(
    pending,
    (error) => error.code === "DSC_WORKER_ABORTED",
  );
  await until(
    () => Atomics.load(new Int32Array(counter), 0) > 0,
    "CPU task must start before cancellation",
  );
  controller.abort();
  await rejected;
  const stopped = Atomics.load(new Int32Array(counter), 0);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(Atomics.load(new Int32Array(counter), 0), stopped);
  assert.equal((await runWorkerTask(job, { action: "result" })).answer, 42);
});

function privateTemp(t, f) {
  const temporary = path.join(f.root, "temporary"),
    old = process.env.TMPDIR;
  fs.mkdirSync(temporary);
  process.env.TMPDIR = temporary;
  t.after(() => {
    if (old === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = old;
  });
  return temporary;
}
async function hasStarted(temporary) {
  for (const name of await fs.promises.readdir(temporary)) {
    try {
      await fs.promises.access(
        path.join(
          temporary,
          name,
          "node_modules",
          "capture-fixture",
          "data-0.txt",
        ),
      );
      return true;
    } catch {
      /* Capture has allocated ownership but has not copied yet. */
    }
  }
  return false;
}

// Skipping cleanup after terminating the capture thread leaves a partial tree.
test("aborting observed real capture cleans its owned snapshot and later preview recovers", async (t) => {
  const f = fixture(t),
    temporary = privateTemp(t, f),
    controller = new AbortController();
  const pending = runUpgradePreview(input(f), { signal: controller.signal });
  await until(
    () => hasStarted(temporary),
    "capture must copy real bytes before abort",
  );
  const abortedAt = performance.now();
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "error");
  assert.match(result.error, /取消/);
  assert.equal(result.artifact, null);
  assert.ok(
    performance.now() - abortedAt < 5000,
    "abort and partial-snapshot cleanup must settle",
  );
  assert.deepEqual(await fs.promises.readdir(temporary), []);
  assert.equal(
    fs.readFileSync(path.join(f.pkg, "data-0.txt"), "utf8"),
    "capture-data",
  );
  const recovered = await runUpgradePreview(input(f));
  assert.equal(recovered.status, "compared", recovered.error);
  assert.deepEqual(await fs.promises.readdir(temporary), []);
});

// A capture budget must terminate work already copying, not merely time startup.
test("parent enforces real capture timeout with heartbeats and removes its partial snapshot", async (t) => {
  const f = fixture(t, 16000),
    temporary = privateTemp(t, f);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10),
    start = performance.now();
  const pending = runUpgradePreview(input(f), {
    captureLimits: { timeMs: 1000 },
  });
  try {
    await until(
      () => hasStarted(temporary),
      "budgeted capture must copy real bytes before timeout",
    );
    const result = await pending;
    assert.equal(result.status, "error");
    assert.match(result.error, /时间预算|预算超限/);
    assert.equal(result.currentReport, null);
    assert.equal(result.artifact, null);
    assert.ok(ticks > 3, "capture and cleanup must keep scheduling the parent");
    assert.ok(
      performance.now() - start < 5000,
      "timeout plus cleanup stays bounded",
    );
    assert.deepEqual(await fs.promises.readdir(temporary), []);
  } finally {
    clearInterval(timer);
    await pending;
  }
});

// A caller cannot redirect dispose to a live input or another concurrent tree.
test("concurrent captures own separate frozen bytes and disposal stays responsive and private", async (t) => {
  const f = fixture(t, 4000),
    temporary = privateTemp(t, f);
  const [first, second] = await Promise.all([
    captureUpgradeInput(f.nm),
    captureUpgradeInput(f.nm),
  ]);
  assert.notEqual(first.nm, second.nm);
  assert.equal(first.artifact.sha256, second.artifact.sha256);
  assert.equal(fs.statSync(path.dirname(first.nm)).mode & 0o777, 0o500);
  assert.equal(
    fs.statSync(path.join(first.nm, "capture-fixture", "data-0.txt")).mode &
      0o777,
    0o400,
  );
  first.nm = f.nm; // The data property is not cleanup authority.
  let ticks = 0;
  const timer = setInterval(() => ticks++, 1),
    start = performance.now();
  const disposal = first.dispose();
  const callMilliseconds = performance.now() - start;
  try {
    await disposal;
    assert.ok(
      callMilliseconds < 100,
      `dispose blocked parent for ${callMilliseconds}ms`,
    );
    assert.ok(ticks > 0);
    assert.equal(
      fs.readFileSync(
        path.join(second.nm, "capture-fixture", "data-0.txt"),
        "utf8",
      ),
      "capture-data",
    );
    assert.equal(
      fs.readFileSync(path.join(f.pkg, "data-0.txt"), "utf8"),
      "capture-data",
    );
  } finally {
    clearInterval(timer);
    await Promise.all([first.dispose(), second.dispose()]);
  }
  assert.deepEqual(await fs.promises.readdir(temporary), []);
});

function writable(dir) {
  fs.chmodSync(dir, 0o700);
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
    if (entry.isDirectory()) writable(path.join(dir, entry.name));
}
async function replaceOwnedRoot(temporary, predicate) {
  let root;
  await until(async () => {
    for (const name of await fs.promises.readdir(temporary)) {
      const candidate = path.join(temporary, name);
      try {
        if (await predicate(candidate)) {
          root = candidate;
          return true;
        }
      } catch {
        /* The lifecycle may be allocating this directory. */
      }
    }
    return false;
  }, "capture must reach the observed filesystem state before fault injection");
  const backups = [];
  // Active capture uses recursive mkdir for its destinations. If it recreates
  // the root between rename and replacement, retain that owned fragment too.
  for (let attempt = 0; ; attempt++) {
    const backup = root + `-saved-${attempt}`;
    fs.renameSync(root, backup);
    backups.push(backup);
    try {
      fs.writeFileSync(root, "replacement is not the owned snapshot", {
        flag: "wx",
      });
      break;
    } catch (error) {
      if (!["EISDIR", "EEXIST"].includes(error.code) || attempt > 32)
        throw error;
    }
  }
  return () => {
    assert.equal(
      fs.readFileSync(root, "utf8"),
      "replacement is not the owned snapshot",
    );
    fs.unlinkSync(root);
    for (const backup of backups) {
      writable(backup);
      fs.rmSync(backup, { recursive: true });
    }
  };
}

// Cleanup failure must fail closed, retain the primary capture failure, and
// never delete an unrelated replacement at its formerly owned pathname.
test("capture failure keeps its primary reason when cleanup refuses a replaced owned root", async (t) => {
  const f = fixture(t),
    temporary = privateTemp(t, f);
  const pending = captureUpgradeInput(f.nm).then(
    () => null,
    (error) => error,
  );
  const restore = await replaceOwnedRoot(temporary, async (root) => {
    await fs.promises.access(
      path.join(root, "node_modules", "capture-fixture", "data-0.txt"),
    );
    return true;
  });
  try {
    const error = await pending;
    assert.match(
      error.message,
      /ENOTDIR|ENOENT|EEXIST/,
      "keep the original failed capture reason",
    );
    assert.match(error.message, /清理.*(?:失败|未完成)/);
    assert.match(error.message, /目录身份变化/);
  } finally {
    restore();
  }
});

// A finally rejection must not bypass the public canonical failure contract.
test("preview returns a canonical failure when cleanup refuses a replaced frozen snapshot", async (t) => {
  const f = fixture(t, 1000),
    temporary = privateTemp(t, f);
  fs.writeFileSync(
    path.join(f.pkg, "index.js"),
    Array.from({ length: 20000 }, (_, i) => `const x${i}=${i};`).join("\n") +
      "\nexport default ctx => ctx.settings.get('x');",
  );
  const pending = runUpgradePreview(input(f)).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  const restore = await replaceOwnedRoot(
    temporary,
    async (root) => ((await fs.promises.stat(root)).mode & 0o777) === 0o500,
  );
  try {
    const outcome = await pending;
    assert.equal(
      outcome.error,
      undefined,
      "cleanup failures must return the canonical error result",
    );
    assert.equal(outcome.value.status, "error");
    assertUpgradePreview(outcome.value);
    assert.equal(outcome.value.artifact, null);
    assert.match(outcome.value.error, /清理.*(?:失败|未完成)/);
    assert.equal(outcome.value.error.includes(temporary), false);
  } finally {
    restore();
  }
});

// A directory at the same pathname is still a different cleanup identity.
test("dispose refuses a replacement directory and preserves its unrelated contents", async (t) => {
  const f = fixture(t, 1);
  privateTemp(t, f);
  const snapshot = await captureUpgradeInput(f.nm);
  const root = path.dirname(snapshot.nm),
    backup = root + "-owned-backup";
  fs.renameSync(root, backup);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "unrelated.txt"), "must survive");
  try {
    await assert.rejects(snapshot.dispose(), /目录身份变化/);
    assert.equal(
      fs.readFileSync(path.join(root, "unrelated.txt"), "utf8"),
      "must survive",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    writable(backup);
    fs.rmSync(backup, { recursive: true, force: true });
  }
});
