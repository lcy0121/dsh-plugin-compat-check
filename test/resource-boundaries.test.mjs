import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import * as workers from "../lib/worker-analysis.mjs";
import { packageFixture, fixtureCatalog as catalog } from "./fixture-utils.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { ReportService } from "../lib/report-service.mjs";
import { spawnSync } from "node:child_process";
import { extractWithProvenance } from "../lib/extract.mjs";
import { collectPackageSources } from "../lib/source-graph.mjs";
import { runAsync } from "../bin/compat-check.mjs";
import { readStaticFile, readStaticDirectory } from "../lib/static-input.mjs";
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
    counter = new SharedArrayBuffer(4),
    // Allow cold worker startup under concurrent CI load; production stays at 10s.
    timeoutMs = 1000,
    totalElapsedLimitMs = 5000;
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10),
    start = performance.now();
  try {
    await assert.rejects(
      run(job, { action: "cpu", counter }, { timeoutMs }),
      (e) => e.code === "DSC_WORKER_TIMEOUT",
    );
  } finally {
    clearInterval(timer);
  }
  const timeoutMilliseconds = performance.now() - start,
    stopped = Atomics.load(new Int32Array(counter), 0);
  assert.ok(stopped > 0, "CPU job must have started before its timeout");
  assert.ok(ticks >= 3, "worker computation must not block parent timers");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(Atomics.load(new Int32Array(counter), 0), stopped);
  const f = packageFixture("export function apply(ctx){ctx.settings.known()}");
  try {
    const e = await workers.extractInWorker(f.nm, { catalog });
    assert.deepEqual(e.report.perPlugin.sample.calls.settings, ["known"]);
  } finally {
    f.cleanup();
  }
  const milliseconds = performance.now() - start;
  assert.ok(
    milliseconds < totalElapsedLimitMs,
    `timeout and recovery must settle within ${totalElapsedLimitMs}ms (got ${milliseconds}ms)`,
  );
  record("timeout", {
    milliseconds,
    timeoutMilliseconds,
    timeoutBudgetMs: timeoutMs,
    totalElapsedLimitMs,
    counterAtTimeout: stopped,
    workerStarted: true,
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

test(
  "FIFO manifests and links to them cannot block the ordinary CLI",
  { skip: process.platform === "win32" },
  () => {
    for (const linked of [false, true]) {
      const f = packageFixture('throw Error("target executed")');
      try {
        const manifest = path.join(f.pkg, "package.json"),
          fifo = path.join(f.root, "manifest-fifo");
        fs.unlinkSync(manifest);
        assert.equal(spawnSync("mkfifo", [linked ? fifo : manifest]).status, 0);
        if (linked) fs.symlinkSync(fifo, manifest);
        const out = spawnSync(
          process.execPath,
          ["bin/compat-check.mjs", "--nm", f.nm, "--json", "--no-baseline"],
          { encoding: "utf8", timeout: 3000 },
        );
        assert.equal(
          out.error,
          undefined,
          "CLI must reject the nonregular input before the external deadline",
        );
        const body = JSON.parse(out.stdout);
        assert.equal(body.extraction.scanComplete, false);
        assert.ok(
          body.extraction.diagnostics.some(
            (d) => d.kind === "invalid-package-metadata",
          ),
        );
      } finally {
        f.cleanup();
      }
    }
  },
);

test("oversized manifests are diagnosed before their plugin enters the inventory", () => {
  const f = packageFixture('throw Error("target executed")');
  try {
    const manifest = path.join(f.pkg, "package.json");
    const meta = JSON.parse(fs.readFileSync(manifest));
    meta.padding = "x".repeat(65536);
    fs.writeFileSync(manifest, JSON.stringify(meta));
    const out = extractWithProvenance(f.nm, { catalog });
    assert.equal(out.report.scanComplete, false);
    assert.deepEqual(Object.keys(out.report.perPlugin), []);
    assert.ok(
      out.report.diagnostics.some(
        (d) =>
          d.kind === "invalid-package-metadata" &&
          d.code === "STATIC_INPUT_BUDGET",
      ),
    );
  } finally {
    f.cleanup();
  }
});

test("patch bytes share the per-file and total source budgets", () => {
  for (const limits of [{ fileBytes: 128 }, { bytes: 128 }]) {
    const f = packageFixture(
      "export function apply(ctx){ctx.settings.known()}",
    );
    try {
      fs.writeFileSync(
        path.join(f.pkg, "cordis.patch.yml"),
        "#" + "x".repeat(256) + "\n- name: ./index.js\n",
      );
      const out = extractWithProvenance(f.nm, { catalog, limits });
      assert.equal(out.report.scanComplete, false);
      assert.ok(
        out.report.perPlugin.sample.diagnostics.some(
          (d) => d.kind === "scan-budget-exceeded",
        ),
      );
    } finally {
      f.cleanup();
    }
  }
});

test(
  "FIFO patches and links to them retain an unreadable-input diagnostic",
  { skip: process.platform === "win32" },
  () => {
    for (const linked of [false, true]) {
      const f = packageFixture(
        "export function apply(ctx){ctx.settings.known()}",
      );
      try {
        const patch = path.join(f.pkg, "cordis.patch.yml"),
          fifo = path.join(f.pkg, "patch-fifo");
        fs.unlinkSync(patch);
        assert.equal(spawnSync("mkfifo", [linked ? fifo : patch]).status, 0);
        if (linked) fs.symlinkSync(fifo, patch);
        const out = extractWithProvenance(f.nm, { catalog });
        assert.equal(out.report.scanComplete, false);
        assert.ok(
          out.report.perPlugin.sample.diagnostics.some(
            (d) => d.kind === "patch-unreadable",
          ),
        );
      } finally {
        f.cleanup();
      }
    }
  },
);

test("a wide directory stops enumeration within its entry budget", () => {
  const f = packageFixture("export function apply(ctx){ctx.settings.known()}");
  const original = fs.realpathSync;
  let resolved = 0;
  try {
    for (let i = 0; i < 256; i++)
      fs.writeFileSync(path.join(f.pkg, "part-" + i + ".txt"), "data");
    fs.realpathSync = function (...args) {
      resolved++;
      return original.apply(fs, args);
    };
    const out = extractWithProvenance(f.nm, {
      catalog,
      limits: { entries: 16 },
    });
    assert.equal(out.report.scanComplete, false);
    assert.ok(
      out.report.perPlugin.sample.diagnostics.some(
        (d) => d.kind === "scan-budget-exceeded",
      ),
    );
    assert.ok(
      resolved < 80,
      `must stop inspecting entries, got ${resolved} path resolutions`,
    );
  } finally {
    fs.realpathSync = original;
    f.cleanup();
  }
});

test("directory enumeration checks time inside a single wide directory", () => {
  const f = packageFixture("export function apply(ctx){ctx.settings.known()}");
  const original = fs.realpathSync,
    clock = Date.now;
  let elapsed = 0,
    resolved = 0;
  try {
    for (let i = 0; i < 256; i++)
      fs.writeFileSync(path.join(f.pkg, "part-" + i + ".txt"), "data");
    Date.now = () => elapsed;
    fs.realpathSync = function (...args) {
      resolved++;
      elapsed++;
      return original.apply(fs, args);
    };
    const meta = JSON.parse(fs.readFileSync(path.join(f.pkg, "package.json")));
    const out = collectPackageSources(f.pkg, meta, { limits: { timeMs: 20 } });
    assert.ok(out[4].some((d) => d.kind === "scan-budget-exceeded"));
    assert.ok(
      resolved < 80,
      `deadline must stop the inner loop, got ${resolved}`,
    );
  } finally {
    fs.realpathSync = original;
    Date.now = clock;
    f.cleanup();
  }
});

test("ordinary asynchronous CLI analysis is supervised and cannot advance a timed-out baseline", async () => {
  const f = packageFixture("export function apply(ctx){ctx.settings.known()}");
  const baseline = path.join(f.root, "state", "baseline.json");
  try {
    fs.mkdirSync(path.dirname(baseline));
    fs.writeFileSync(baseline, "old baseline");
    const out = await runAsync(
      { nm: f.nm, baselineFile: baseline },
      { timeoutMs: 1 },
    );
    assert.match(out.error || "", /时间预算/);
    assert.equal(fs.readFileSync(baseline, "utf8"), "old baseline");
    assert.deepEqual(fs.readdirSync(path.dirname(baseline)), ["baseline.json"]);
    const recovered = await runAsync({ nm: f.nm, baseline: false });
    assert.equal(recovered.error, null);
    assert.deepEqual(recovered.extract.report.perPlugin.sample.calls.settings, [
      "known",
    ]);
  } finally {
    f.cleanup();
  }
});

test("static input budgets reject invalid values and cannot raise production limits", () => {
  const f = packageFixture("export function apply(){}");
  try {
    for (const inventoryLimits of [
      { manifestBytes: NaN },
      { entries: Infinity },
      { timeMs: 5001 },
      { unknown: 1 },
    ])
      assert.throws(
        () => extractWithProvenance(f.nm, { inventoryLimits }),
        /budget/i,
      );
    for (const limits of [
      { fileBytes: NaN },
      { entries: Infinity },
      { timeMs: 5001 },
      { files: 2001 },
    ])
      assert.throws(() => extractWithProvenance(f.nm, { limits }), /budget/i);
    for (const max of [NaN, -1, Infinity])
      assert.throws(
        () => readStaticFile(path.join(f.pkg, "package.json"), max),
        /budget/i,
      );
  } finally {
    f.cleanup();
  }
});

test("patch accounting can exhaust the budget before otherwise small source files", () => {
  const f = packageFixture(
    "export function apply(ctx){ctx.settings.known()} // padding",
  );
  try {
    fs.writeFileSync(
      path.join(f.pkg, "cordis.patch.yml"),
      "#" + "x".repeat(80) + "\n- name: ./index.js\n",
    );
    const out = extractWithProvenance(f.nm, {
      catalog,
      limits: { bytes: 128, fileBytes: 128 },
    });
    assert.ok(
      out.report.perPlugin.sample.diagnostics.some(
        (d) => d.kind === "scan-budget-exceeded" && d.file === "index.js",
      ),
    );
    assert.equal(out.report.scanComplete, false);
  } finally {
    f.cleanup();
  }
});

test("bounded input failures close both file and directory descriptors", () => {
  const f = packageFixture("export function apply(){}");
  const open = fs.openSync,
    opendir = fs.opendirSync;
  let fd, handle;
  try {
    fs.openSync = function (...args) {
      fd = open.apply(fs, args);
      return fd;
    };
    let checks = 0;
    assert.throws(
      () =>
        readStaticFile(path.join(f.pkg, "package.json"), 65536, () => {
          if (++checks === 2) throw new Error("controlled read deadline");
        }),
      /controlled read deadline/,
    );
    assert.throws(
      () => fs.fstatSync(fd),
      (e) => e.code === "EBADF",
    );
    fs.opendirSync = function (...args) {
      handle = opendir.apply(fs, args);
      return handle;
    };
    assert.throws(() => readStaticDirectory(f.pkg, 1), /entry budget/);
    assert.throws(
      () => handle.readSync(),
      (e) => e.code === "ERR_DIR_CLOSED",
    );
    assert.ok(
      readStaticFile(path.join(f.pkg, "package.json"), 65536).length > 0,
    );
  } finally {
    fs.openSync = open;
    fs.opendirSync = opendir;
    f.cleanup();
  }
});

test("a manifest disappearing after its bounded read is incomplete input, not an absent package", () => {
  for (const action of ["unlink", "rename-parent"]) {
    const f = packageFixture("export function apply(){}");
    const open = fs.openSync,
      read = fs.readSync;
    const manifest = path.join(f.pkg, "package.json");
    let descriptor;
    try {
      fs.openSync = function (file, ...args) {
        const fd = open.call(fs, file, ...args);
        if (String(file) === manifest) descriptor = fd;
        return fd;
      };
      fs.readSync = function (fd, ...args) {
        const n = read.call(fs, fd, ...args);
        if (fd === descriptor && n > 0) {
          if (action === "unlink") fs.unlinkSync(manifest);
          else fs.renameSync(f.pkg, f.pkg + "-moved");
        }
        return n;
      };
      const out = extractWithProvenance(f.nm, { catalog });
      assert.equal(out.report.scanComplete, false);
      assert.ok(
        out.report.diagnostics.some((d) => d.code === "STATIC_INPUT_CHANGED"),
      );
      assert.throws(
        () => fs.fstatSync(descriptor),
        (e) => e.code === "EBADF",
      );
    } finally {
      fs.openSync = open;
      fs.readSync = read;
      f.cleanup();
    }
  }
});
