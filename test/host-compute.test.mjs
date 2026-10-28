import test from "node:test";
import assert from "node:assert/strict";
import { buildVerdicts } from "../lib/verdict.mjs";
import { packageFixture, fixtureCatalog as catalog } from "./fixture-utils.mjs";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createReportRuntime } from "../plugin/lib/host-reports.js";
import { assertAnalysisBudget } from "../lib/analysis-budget.mjs";
import { ReportService } from "../lib/report-service.mjs";

test("service indexing visits each dependency a bounded number of times", () => {
  for (const size of [250, 500, 1000]) {
    const services = Array.from({ length: size }, (_, i) => `unknown${i}`);
    let reads = 0;
    const dependencies = services.map((service) => ({
      get service() {
        reads++;
        return service;
      },
      kind: "required-inject",
      sides: ["host"],
    }));
    const verdict = buildVerdicts({
      report: {
        perPlugin: { sample: { services, dependencies } },
      },
      catalog,
    });
    assert.equal(Object.keys(verdict.plugins.sample.resolved).length, size);
    assert(reads <= services.length * 3, `dependency visits: ${reads}`);
  }
});

test(
  "host refresh terminates started CPU work, keeps heartbeat and previous report/baseline, then recovers",
  { timeout: 15000 },
  async () => {
    const f = packageFixture(
      "export function apply(ctx){ctx.settings.known()}",
    );
    const kernel = path.join(f.root, "kernel"),
      marker = path.join(kernel, "started");
    for (const dir of ["lib", "rules"])
      fs.cpSync(path.resolve(dir), path.join(kernel, dir), { recursive: true });
    fs.symlinkSync(
      path.resolve("node_modules"),
      path.join(kernel, "node_modules"),
      "dir",
    );
    const worker = path.join(kernel, "lib/host-report-worker.mjs"),
      original = fs.readFileSync(worker);
    const previousHome = process.env.DSH_HOME;
    process.env.DSH_HOME = path.join(f.root, "home");
    const workerOptions = { timeoutMs: 2000 };
    const runtime = createReportRuntime({
      resolveKernelDir: () => kernel,
      resolveNodeModules: () => ({ dir: f.nm, why: "owned fixture" }),
      resolveDshVersion: () => "0.2.1-rc.3",
      errText: (e) => e.message,
      log() {},
      analysisWorkerOptions: workerOptions,
    });
    const state = {};
    const service = new ReportService(
      (options, guard) =>
        runtime.computeReport(
          state,
          { get() {} },
          { ...options, _cacheGuard: guard },
        ),
      { watchMs: 60000 },
    );
    let timer;
    try {
      const first = await service.get("owned");
      assert.equal(first.ok, true, first.error);
      assert.equal(first.baseline.wrote, true);
      const baseline = fs.readFileSync(first.baseline.file);
      // Trusted test kernel simulates CPU work AFTER extraction and host sampling.
      // No inspected plugin code is loaded or executed.
      fs.writeFileSync(
        worker,
        `import fs from 'node:fs';let n=0;for(;;){if(++n%100000===0)fs.writeFileSync(${JSON.stringify(marker)},String(n));}`,
      );
      let beats = 0;
      timer = setInterval(() => beats++, 10);
      const refreshing = service.get("owned", {}, true);
      for (let i = 0; !fs.existsSync(marker) && i < 300; i++)
        await new Promise((r) => setTimeout(r, 5));
      assert(
        fs.existsSync(marker),
        "observed post-extraction CPU worker start",
      );
      const failed = await refreshing;
      assert.equal(failed.ok, false);
      assert.match(failed.error, /预算|budget/);
      assert(beats > 5, "host event loop stays responsive during CPU work");
      const stopped = fs.readFileSync(marker);
      await new Promise((r) => setTimeout(r, 40));
      assert.deepEqual(
        fs.readFileSync(marker),
        stopped,
        "worker reclaimed before rejection settles",
      );
      const retained = await service.get("owned");
      assert.equal(retained.report, first.report);
      assert(retained.cache.refreshError);
      assert.deepEqual(fs.readFileSync(first.baseline.file), baseline);
      fs.writeFileSync(worker, original);
      workerOptions.limits = { services: 0 };
      const limited = await service.get("owned", {}, true);
      assert.equal(limited.ok, false);
      assert.match(limited.error, /budget|预算/);
      assert.deepEqual(fs.readFileSync(first.baseline.file), baseline);
      delete workerOptions.limits;
      assert.equal((await service.get("owned", {}, true)).ok, true);
      // Exercise the actual host-computation supervisor's abort path after start.
      fs.copyFileSync(path.resolve("test/support/resource-worker.mjs"), worker);
      const supervisor = await import(
        pathToFileURL(path.join(kernel, "lib/worker-analysis.mjs"))
      );
      const lastBaseline = fs.readFileSync(first.baseline.file);
      const counter = new SharedArrayBuffer(4),
        controller = new AbortController();
      const cancelled = supervisor.computeHostReportInWorker(
        { action: "cpu", counter },
        { signal: controller.signal, timeoutMs: 2000 },
      );
      for (
        let i = 0;
        Atomics.load(new Int32Array(counter), 0) === 0 && i < 300;
        i++
      )
        await new Promise((r) => setTimeout(r, 5));
      assert(Atomics.load(new Int32Array(counter), 0) > 0);
      controller.abort();
      await assert.rejects(cancelled, (e) => e.code === "DSC_WORKER_ABORTED");
      const count = Atomics.load(new Int32Array(counter), 0);
      await new Promise((r) => setTimeout(r, 40));
      assert.equal(Atomics.load(new Int32Array(counter), 0), count);
      assert.deepEqual(fs.readFileSync(first.baseline.file), lastBaseline);
    } finally {
      clearInterval(timer);
      service.dispose();
      if (previousHome === undefined) delete process.env.DSH_HOME;
      else process.env.DSH_HOME = previousHome;
      f.cleanup();
    }
  },
);

test("semantic service budget rejects high cardinality instead of returning success", () => {
  assert.throws(
    () =>
      buildVerdicts({
        report: {
          perPlugin: {
            sample: {
              services: Array.from({ length: 20001 }, (_, i) => `svc${i}`),
            },
          },
        },
      }),
    /budget|预算/,
  );
});

test("supervised host computation preserves canonical report and does not execute source", async () => {
  const { extractInWorker, computeHostReportInWorker } = await import(
    "../lib/worker-analysis.mjs"
  );
  const { toJSON } = await import("../lib/report.mjs");
  const f = packageFixture(
    "throw Error('TARGET MUST NOT RUN'); export function apply(ctx){ctx.settings.known()}",
  );
  try {
    const extracted = await extractInWorker(f.nm, { catalog });
    const data = {
      extracted,
      catalog,
      dshVersion: "0.2.1-rc.3",
      inputs: { nodeModules: f.nm },
    };
    const value = await computeHostReportInWorker(data);
    const expected = toJSON({
      extract: extracted,
      verdict: buildVerdicts({
        report: extracted.report,
        catalog,
        dshVersion: data.dshVersion,
      }),
      inputs: { ...data.inputs, hasRuntimeSurface: false },
    });
    assert.deepEqual(
      JSON.parse(JSON.stringify(value.canonical)),
      JSON.parse(JSON.stringify(expected)),
    );
    assert.equal(
      value.snapshot.plugins.sample.verdict,
      expected.plugins.sample.verdict,
    );
    assert.match(value.issueReport, /sample/);
    await assert.rejects(
      computeHostReportInWorker(data, { limits: { reportBytes: 128 } }),
      /budget|预算/,
    );
    await assert.rejects(
      extractInWorker(f.nm, { catalog, analysisLimits: { callSites: 0 } }),
      /budget|预算/,
    );
    await assert.rejects(
      computeHostReportInWorker(data, { limits: { services: 20001 } }),
      /budget|预算/,
    );
  } finally {
    f.cleanup();
  }
});

test("semantic budgets cover global and per-plugin collections and may only decrease", () => {
  for (const field of ["services", "dependencies", "callSites"]) {
    const report = { perPlugin: { sample: { [field]: [1, 2] } } };
    assert.throws(
      () => assertAnalysisBudget(report, { [field]: 1 }),
      /budget|预算/,
    );
  }
  assert.throws(
    () => assertAnalysisBudget({ services: [1, 2] }, { services: 1 }),
    /budget|预算/,
  );
  assert.throws(
    () => assertAnalysisBudget({ perPlugin: { a: {}, b: {} } }, { plugins: 1 }),
    /budget|预算/,
  );
  for (const limits of [
    { services: 20001 },
    { dependencies: -1 },
    { callSites: 0.5 },
    { unexpected: 1 },
  ])
    assert.throws(() => assertAnalysisBudget({}, limits), /budget|预算/);
});
