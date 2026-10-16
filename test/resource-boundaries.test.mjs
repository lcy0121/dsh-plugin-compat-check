import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import * as workers from "../lib/worker-analysis.mjs";
import { packageFixture, fixtureCatalog as catalog } from "./fixture-utils.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { ReportService } from "../lib/report-service.mjs";
const job = new URL("./support/resource-worker.mjs", import.meta.url);
const record = (name, metrics) => {
  if (process.env.DSC_ENGINEERING_LOG)
    fs.appendFileSync(
      process.env.DSC_ENGINEERING_LOG,
      JSON.stringify({ name, ...metrics }) + "\n",
    );
};
function supervisor() {
  assert.equal(
    typeof workers.runWorkerTask,
    "function",
    "resource supervisor must own worker lifecycle",
  );
  return workers.runWorkerTask;
}

test("worker success is returned only after its CPU job has stopped", async () => {
  const run = supervisor(),
    counter = new SharedArrayBuffer(4);
  const result = await run(
    job,
    { action: "result", counter },
    { timeoutMs: 2000 },
  );
  assert.equal(result.answer, 42);
  const stopped = Atomics.load(new Int32Array(counter), 0);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(
    Atomics.load(new Int32Array(counter), 0),
    stopped,
    "settled workers must not consume CPU",
  );
});
test("worker timeout leaves the parent responsive and a later extraction works", async () => {
  const run = supervisor(),
    counter = new SharedArrayBuffer(4);
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10),
    start = performance.now();
  try {
    await assert.rejects(
      run(job, { action: "cpu", counter }, { timeoutMs: 220 }),
      (e) => e.code === "DSC_WORKER_TIMEOUT",
    );
  } finally {
    clearInterval(timer);
  }
  assert.ok(ticks >= 3, "worker computation must not block parent timers");
  const stopped = Atomics.load(new Int32Array(counter), 0);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(Atomics.load(new Int32Array(counter), 0), stopped);
  const f = packageFixture("export function apply(ctx){ctx.settings.known()}");
  try {
    const e = await workers.extractInWorker(f.nm, { catalog });
    assert.deepEqual(e.report.perPlugin.sample.calls.settings, ["known"]);
  } finally {
    f.cleanup();
  }
  record("timeout", {
    milliseconds: performance.now() - start,
    parentTicks: ticks,
    workerStopped: true,
    recovery: true,
  });
});
test("worker heap exhaustion is contained and a fresh worker recovers", async () => {
  const run = supervisor(),
    start = performance.now();
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  try {
    await assert.rejects(
      run(
        job,
        { action: "memory" },
        {
          timeoutMs: 10000,
          resourceLimits: {
            maxOldGenerationSizeMb: 32,
            maxYoungGenerationSizeMb: 8,
          },
        },
      ),
      (e) => e.code === "ERR_WORKER_OUT_OF_MEMORY",
    );
  } finally {
    clearInterval(timer);
  }
  assert.ok(
    ticks > 0,
    "parent must remain alive and scheduled during heap pressure",
  );
  assert.equal(
    (await run(job, { action: "result" }, { timeoutMs: 2000 })).answer,
    42,
  );
  record("heap", {
    oldGenerationLimitMb: 32,
    milliseconds: performance.now() - start,
    parentTicks: ticks,
    recovery: true,
  });
});
describe(
  "production extractor pressure",
  { skip: process.env.DSC_ENGINEERING_LARGE !== "1" },
  () => {
    test("production extractor heap pressure is isolated", async () => {
      const f = packageFixture(
        Array.from({ length: 8 }, (_, i) => `import './f${i}.js';`).join("") +
          "export function apply(){}",
      );
      const body = Array.from({ length: 80000 }, (_, i) => `var v${i}=0;`).join(
        "",
      );
      let ticks = 0;
      const timer = setInterval(() => ticks++, 10),
        start = performance.now();
      try {
        for (let i = 0; i < 8; i++)
          fs.writeFileSync(path.join(f.pkg, `f${i}.js`), body);
        await assert.rejects(
          workers.extractInWorker(f.nm),
          (e) => e.code === "ERR_WORKER_OUT_OF_MEMORY",
        );
        assert.ok(ticks > 0);
        fs.writeFileSync(
          path.join(f.pkg, "index.js"),
          "export function apply(ctx){ctx.settings.known()}",
        );
        const recovered = await workers.extractInWorker(f.nm, { catalog });
        assert.deepEqual(recovered.report.perPlugin.sample.calls.settings, [
          "known",
        ]);
        record("extractor-heap", {
          oldGenerationLimitMb: 512,
          sourceFiles: 9,
          sourcePayloadBytes: body.length * 8,
          parentTicks: ticks,
          milliseconds: performance.now() - start,
          recovery: true,
        });
      } finally {
        clearInterval(timer);
        f.cleanup();
      }
    });
  },
);

test("invalid worker budgets and malformed replies cannot produce success", async () => {
  const run = supervisor();
  for (const timeoutMs of [0, -1, NaN, Infinity, 2147483648])
    await assert.rejects(
      run(job, { action: "result" }, { timeoutMs }),
      /budget|预算/,
    );
  for (const limit of [0, NaN, Infinity, 1024])
    await assert.rejects(
      run(
        job,
        { action: "result" },
        { resourceLimits: { maxOldGenerationSizeMb: limit } },
      ),
      /budget|预算/,
    );
  await assert.rejects(
    run(job, { action: "malformed" }, { timeoutMs: 2000 }),
    /protocol|协议/,
  );
  await assert.rejects(
    run(job, { action: "exit" }, { timeoutMs: 2000 }),
    /未返回/,
  );
  await assert.rejects(
    run(job, { action: "error" }, { timeoutMs: 2000 }),
    /controlled worker failure/,
  );
});
test("large packages retain partial diagnostics without executing their source", async () => {
  const f = packageFixture(
    'throw new Error("inspected source executed");export function apply(ctx){ctx.settings.known()}',
  );
  try {
    fs.writeFileSync(
      path.join(f.pkg, "oversized.js"),
      "/*" + "x".repeat(2 * 1024 * 1024) + "*/",
    );
    const count = process.env.DSC_ENGINEERING_LARGE === "1" ? 2400 : 96;
    const width = count === 2400 ? 20000 : 2000;
    for (let i = 0; i < count; i++)
      fs.writeFileSync(
        path.join(f.pkg, `part-${i}.js`),
        'export const x="' + "x".repeat(width) + '";',
      );
    fs.writeFileSync(
      path.join(f.pkg, "index.js"),
      Array.from({ length: count }, (_, i) => `import './part-${i}.js';`).join(
        "",
      ) +
        `import './oversized.js';throw new Error("inspected source executed");export function apply(ctx){ctx.settings.known()}`,
    );
    const start = performance.now();
    const e = await workers.extractInWorker(f.nm, {
      catalog,
      ...(count === 2400
        ? {}
        : { limits: { files: 32, bytes: 64 * 1024, fileBytes: 4096 } }),
    });
    const p = e.report.perPlugin.sample;
    assert.deepEqual(p.calls.settings, ["known"]);
    assert.equal(e.report.scanComplete, false);
    assert.ok(p.diagnostics.some((d) => d.kind === "scan-budget-exceeded"));
    const verdict = buildVerdicts({ report: e.report, catalog }).plugins.sample;
    assert.equal(verdict.coverage.status, "limited");
    record("large-package", {
      files: count + 2,
      sourceBytes: fs
        .readdirSync(f.pkg)
        .filter((n) => n.endsWith(".js"))
        .reduce((sum, n) => sum + fs.statSync(path.join(f.pkg, n)).size, 0),
      oversizedBytes: 2 * 1024 * 1024,
      milliseconds: performance.now() - start,
      scanComplete: false,
      sourceExecuted: false,
    });
  } finally {
    f.cleanup();
  }
});
test("concurrent forced report requests share a worker and failed refresh preserves evidence", async () => {
  const run = supervisor();
  let computes = 0,
    fail = false;
  const service = new ReportService(
    async () => {
      computes++;
      try {
        return {
          ok: true,
          result: await run(
            job,
            { action: fail ? "cpu" : "result" },
            { timeoutMs: fail ? 100 : 2000 },
          ),
        };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    { ttlMs: 0 },
  );
  const start = performance.now(),
    results = await Promise.all(
      Array.from({ length: 64 }, () => service.get("one", {}, true)),
    );
  assert.equal(computes, 1);
  assert.ok(results.every((r) => r.ok && r.result.answer === 42));
  fail = true;
  const failed = await service.get("one", {}, true);
  assert.equal(failed.ok, false);
  assert.equal(service.state("one").report.result.answer, 42);
  assert.match(service.state("one").error, /时间预算/);
  record("report-contention", {
    requests: 64,
    computesBeforeRefresh: 1,
    milliseconds: performance.now() - start,
    failedRefreshRetainedReport: true,
  });
});
