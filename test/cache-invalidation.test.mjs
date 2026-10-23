import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ReportService } from "../lib/report-service.mjs";
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("background refresh did not settle");
}

// Missing invalidation would keep a successful report after its inputs change.
test("identity changes refresh in background without dropping the valid report", async () => {
  let identity = "installed-v1",
    count = 0;
  const service = new ReportService(
    async () => ({ ok: true, value: ++count }),
    { identity: async () => identity, watchMs: 10 },
  );
  try {
    await service.get("profile-A");
    identity = "installed-v2";
    await until(() => service.state("profile-A").report?.value === 2);
    const result = await service.get("profile-A");
    assert.equal(result.value, 2);
    assert.equal(result.cache.stale, false);
  } finally {
    service.dispose?.();
  }
});
test("change during a flight suppresses old publication and old baseline commit, then coalesces refreshes", async () => {
  let release,
    count = 0,
    commits = [],
    value = "before";
  const gate = new Promise((r) => (release = r));
  const service = new ReportService(async (_options, guard) => {
    const seen = value;
    count++;
    if (count === 2) await gate;
    guard.commit(() => commits.push(seen));
    return { ok: true, value: seen };
  });
  try {
    await service.get("A");
    value = "intermediate";
    const pending = service.get("A", {}, true);
    await tick();
    value = "after";
    for (let i = 0; i < 30; i++) service.invalidate("A", "changed");
    release();
    await pending;
    await until(() => service.state("A").report?.value === "after");
    assert.deepEqual(commits, ["before", "after"]);
    assert.equal(count, 3);
  } finally {
    service.dispose?.();
  }
});
test("refresh failure retains stale report, exposes error, and recovers on later observation", async () => {
  let value = "good",
    fail = false;
  const service = new ReportService(async () =>
    fail ? { ok: false, error: "read failed" } : { ok: true, value },
  );
  try {
    await service.get("A");
    fail = true;
    service.invalidate("A", "update");
    await until(() => service.state("A").error === "read failed");
    const old = await service.get("A");
    assert.equal(old.value, "good");
    assert.equal(old.cache.stale, true);
    assert.equal(old.cache.refreshError, "read failed");
    fail = false;
    value = "recovered";
    service.invalidate("A", "retry");
    await until(() => service.state("A").report?.value === "recovered");
    assert.equal((await service.get("A")).cache.refreshError, null);
  } finally {
    service.dispose?.();
  }
});
test("invalidating one canonical target cannot replace another target and disposal suppresses late success", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const service = new ReportService(async ({ value }) => {
    if (value === "late") await gate;
    return { ok: true, value };
  });
  await service.get("A", { value: "A" });
  await service.get("B", { value: "B" });
  service.invalidate("A", "update");
  await until(() => !service.state("A").inflight);
  assert.equal((await service.get("B")).value, "B");
  const pending = service.get("A", { value: "late" }, true);
  await tick();
  service.dispose?.();
  release();
  assert.equal((await pending).ok, false);
  assert.equal(service.state("A").report.value, "A");
  assert.equal((await service.get("B")).ok, false);
});
test("bounded filesystem identity notices same-path edits, inventory and judgment inputs without executing plugins", async () => {
  const { reportIdentity } = await import("../lib/report-identity.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-")),
    nm = path.join(root, "node_modules"),
    pkg = path.join(nm, "demo");
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "demo", dsh: {}, main: "index.js" }),
  );
  await fs.writeFile(
    path.join(pkg, "index.js"),
    'throw Error("MUST NOT RUN");',
  );
  const file = path.join(root, "rules.json");
  await fs.writeFile(file, "{}");
  try {
    const opts = {
      nodeModules: nm,
      files: [file],
      context: { dshVersion: "0.2.0-rc.2" },
    };
    let previous = (await reportIdentity(opts)).digest;
    for (const change of [
      () =>
        fs.writeFile(
          path.join(pkg, "index.js"),
          'throw Error("CHANGED CODE");',
        ),
      () => fs.writeFile(file, '{"severity":1}'),
      () =>
        fs.writeFile(
          path.join(pkg, "package.json"),
          JSON.stringify({ name: "demo", version: "2", dsh: {} }),
        ),
      () => fs.rm(pkg, { recursive: true }),
    ]) {
      await change();
      const next = (await reportIdentity(opts)).digest;
      assert.notEqual(next, previous);
      previous = next;
    }
    assert.notEqual(
      (await reportIdentity({ ...opts, context: { dshVersion: "0.2.1-rc.2" } }))
        .digest,
      previous,
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ordinary HTTP reports refresh after source and loader changes without force, and separate active targets", async () => {
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-host-")),
    home = path.join(root, "home"),
    nm = path.join(home, "profiles/A/node_modules"),
    pkg = path.join(nm, "demo");
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "demo", version: "1", dsh: {}, main: "index.js" }),
  );
  await fs.writeFile(
    path.join(pkg, "index.js"),
    "export function apply(ctx){ctx.tools.register({});ctx.customService.ping()}",
  );
  await fs.mkdir(path.join(home, "profiles/B/node_modules"), {
    recursive: true,
  });
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {apply} from ${JSON.stringify(pathToFileURL(path.resolve("plugin/index.js")).href)};
  const routes=new Map(),effects=[],entry={id:'slot-demo',disabled:false,options:{},fiber:{state:2}};let custom={ping(){}};
  const ctx={get:n=>n==='loader'?{entries:()=>[entry]}:n==='pluginManager'?{list:async()=>[{id:'slot-demo',packageName:'demo'}]}:n==='customService'?custom:undefined,inject:(deps,cb)=>{if(deps[0]!=='webServer')return;const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path)}}});if(off)effects.push(off);},effect:f=>{const off=f();if(off)effects.push(off);}};apply(ctx);
  const request=async()=>{let text;await routes.get('/plugin-compat-check/report').handler({method:'GET',headers:{'x-dsh-compat-request':'1',host:'127.0.0.1'},url:'/plugin-compat-check/report',socket:{}},{writeHead(){},end:t=>text=t});return JSON.parse(text);};
  async function waitFor(fn){let last;for(let i=0;i<200;i++){const r=await request();last=r;if(fn(r))return r;await new Promise(r=>setTimeout(r,20));}assert.fail('automatic refresh did not settle: '+JSON.stringify({plugins:last.report?.plugins,cache:last.cache}));}
  try{
    const first=await request();assert.equal(first.ok,true,first.error);assert.equal(first.report.plugins.demo.version,'1');
    const meta=JSON.parse(fs.readFileSync(${JSON.stringify(path.join(pkg, "package.json"))}));meta.version='2';fs.writeFileSync(${JSON.stringify(path.join(pkg, "package.json"))},JSON.stringify(meta));
    const second=await waitFor(r=>r.report?.plugins.demo.version==='2');assert.notEqual(second.computedAt,first.computedAt);
    entry.disabled=true;await waitFor(r=>r.loaderCoverage?.rows[0]?.disabled===true);
    entry.disabled=false;await waitFor(r=>r.loaderCoverage?.rows[0]?.disabled===false);
    custom=undefined;await waitFor(r=>r.report?.plugins.demo.findings.some(f=>f.service==='customService' && f.evidence?.status==='absent'));
    process.env.DSC_PROFILE='B';const other=await request();assert.equal(other.ok,true,other.error);assert.equal(Object.keys(other.report.plugins).length,0);assert.match(other.nodeModules,/profiles\\/B\\/node_modules/);
    process.env.DSH_VERSION='0.2.1-rc.2';const version=await request();assert.equal(version.report.dshVersion,'0.2.1-rc.2');await new Promise(r=>setTimeout(r,200));process.env.DSH_VERSION='0.2.0-rc.2';const restored=await request();assert.equal(restored.report.dshVersion,'0.2.0-rc.2');
    for(const off of effects)off();assert.equal(routes.has('/plugin-compat-check/report'),false);
  }finally{for(const off of effects)off();}process.exit(0);`;
  try {
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 20000,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSC_PROFILE: "A",
          DSH_VERSION: "0.2.0-rc.2",
          DSC_KERNEL: path.resolve("."),
          DSC_CACHE_WATCH_MS: "30",
          DSC_AUTORUN_MS: "60000",
          DSC_OUT_DIR: "",
        },
      },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("mounted panel receives background results, retains filters and last report on errors, and cancels polling on unmount", async () => {
  const { panelHarness } = await import("./support/panel-harness.mjs");
  const { run } = await import("../bin/compat-check.mjs"),
    { toJSON } = await import("../lib/report.mjs");
  const report = toJSON(
    run({
      nm: path.resolve("test/fixtures/labels"),
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  let current = {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    report,
    computedAt: "2026-10-22T00:00:00Z",
    nodeModules: "/example/A",
    baseline: null,
  };
  const timers = new Map();
  let id = 0,
    fail = false;
  const h = await panelHarness(current, {
    timers: {
      setTimeout: (fn) => {
        timers.set(++id, fn);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    fetcher: async (url) => {
      if (fail) throw Error("network down");
      return {
        ok: true,
        json: async () =>
          url.includes("metadata=1")
            ? {
                kind: "plugin-compat-check/report-metadata",
                ok: true,
                computedAt: current.computedAt,
                nodeModules: current.nodeModules,
                dshVersion: current.report.dshVersion,
                cache: current.cache,
              }
            : structuredClone(current),
      };
    },
  });
  try {
    h.field("搜索插件").props.onChange({ target: { value: "healthy" } });
    h.render();
    h.field("按结论筛选").props.onChange({ target: { value: "broken" } });
    h.render();
    assert.deepEqual(h.rows(), []);
    const changed = structuredClone(current);
    changed.computedAt = "2026-10-22T01:00:00Z";
    changed.report.plugins["@label/healthy"] = structuredClone(
      changed.report.plugins["@label/broken-client"],
    );
    changed.report.plugins["@label/healthy"].name = "@label/healthy";
    changed.report.summary.ok = 1;
    changed.report.summary.broken = 2;
    changed.report.summary.vacuousOk = 1;
    current = changed;
    assert(timers.size, "No automatic polling registered");
    let next = [...timers.entries()][0];
    timers.delete(next[0]);
    await next[1]();
    await h.settle();
    assert.deepEqual(h.rows(), ["@label/healthy"]);
    assert.equal(h.field("搜索插件").props.value, "healthy");
    assert.equal(h.field("按结论筛选").props.value, "broken");
    fail = true;
    next = [...timers.entries()][0];
    timers.delete(next[0]);
    await next[1]();
    await h.settle();
    assert.deepEqual(h.rows(), ["@label/healthy"]);
    assert.match(h.text(), /network down/);
  } finally {
    h.dispose();
  }
  assert.equal(timers.size, 0);
});

test("each rules/catalog/probe/grants input and canonical context has its own observed identity", async () => {
  const { reportIdentity } = await import("../lib/report-identity.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-inputs-")),
    nm = path.join(root, "node_modules");
  await fs.mkdir(nm);
  const files = [
    "severity.json",
    "dsh-api-catalog.json",
    "probe.json",
    "compatibility.json",
  ].map((name) => path.join(root, name));
  try {
    for (const file of files) await fs.writeFile(file, "{}");
    const options = {
      nodeModules: nm,
      files,
      context: { dshVersion: "0.2.0-rc.2", active: "/profile/A" },
    };
    let before = (await reportIdentity(options)).digest;
    for (const file of files) {
      await fs.writeFile(file, '{"updated":true}');
      const after = (await reportIdentity(options)).digest;
      assert.notEqual(after, before, path.basename(file));
      before = after;
    }
    assert.notEqual(
      (
        await reportIdentity({
          ...options,
          context: { ...options.context, active: "/profile/B" },
        })
      ).digest,
      before,
    );
    const pkg = path.join(nm, "added");
    await fs.mkdir(pkg);
    await fs.writeFile(
      path.join(pkg, "package.json"),
      '{"name":"added","dsh":{}}',
    );
    assert.notEqual((await reportIdentity(options)).digest, before);
    // Broken npm links are an inventory condition, not an unreadable identity failure.
    await fs.symlink("/nonexistent/dsc-cache-bin", path.join(nm, ".bin"));
    assert.equal(typeof (await reportIdentity(options)).digest, "string");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("identity read failure marks old report stale and later successful reads recover automatically", async () => {
  let fail = false,
    value = "first";
  const service = new ReportService(async () => ({ ok: true, value }), {
    watchMs: 10,
    identity: async () => {
      if (fail) throw Error("identity unreadable");
      return value;
    },
  });
  try {
    await service.get("A");
    fail = true;
    await until(() => service.state("A").error === "identity unreadable");
    const result = await service.get("A");
    assert.equal(result.value, "first");
    assert.equal(result.cache.stale, true);
    assert.match(result.cache.refreshError, /identity unreadable/);
    value = "repaired";
    fail = false;
    await until(() => service.state("A").report?.value === "repaired");
    assert.equal((await service.get("A")).cache.stale, false);
  } finally {
    service.dispose();
  }
});

test("host event storms coalesce identity work and refresh only when observed inputs actually changed", async () => {
  let identity = "one",
    reads = 0,
    computes = 0;
  const service = new ReportService(
    async () => ({ ok: true, value: ++computes }),
    {
      identity: async () => {
        reads++;
        return identity;
      },
      watchMs: 60000,
    },
  );
  try {
    await service.get("A");
    const initialReads = reads;
    for (let i = 0; i < 50; i++) service.notify();
    await tick();
    await tick();
    assert.equal(service.state("A").report.value, 1);
    assert.equal(reads, initialReads + 1);
    identity = "two";
    for (let i = 0; i < 50; i++) service.notify();
    await until(() => service.state("A").report.value === 2);
    assert.equal(computes, 2);
    service.dispose();
    identity = "three";
    service.notify();
    await tick();
    assert.equal(computes, 2);
  } finally {
    service.dispose();
  }
});

test("malformed dependency manifests do not prevent observing valid DSH plugins", async () => {
  const { reportIdentity } = await import("../lib/report-identity.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-malformed-"));
  try {
    for (const [name, bytes] of [
      ["null", "null"],
      ["number", "3"],
      ["string", '"text"'],
      ["array", "[]"],
      ["corrupt", "{"],
      ["valid", '{"name":"valid","dsh":{},"inject":{"required":{}}}'],
    ]) {
      await fs.mkdir(path.join(root, name));
      await fs.writeFile(path.join(root, name, "package.json"), bytes);
    }
    const observed = await reportIdentity({ nodeModules: root });
    assert.deepEqual(observed.manifests, [{ name: "valid" }]);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("FIFO and symlinked FIFO identity inputs fail promptly instead of blocking a worker", async () => {
  const { spawnSync } = await import("node:child_process"),
    { reportIdentity } = await import("../lib/report-identity.mjs");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-fifo-")),
    nm = path.join(root, "node_modules"),
    fifo = path.join(root, "fifo"),
    link = path.join(root, "link");
  await fs.mkdir(nm);
  assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
  await fs.symlink(fifo, link);
  try {
    for (const file of [fifo, link]) {
      const started = Date.now();
      await assert.rejects(
        reportIdentity({ nodeModules: nm, files: [file] }),
        /普通文件/,
      );
      assert(
        Date.now() - started < 2000,
        "Special-file read blocked until the worker timeout",
      );
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("forced request joining a superseded flight waits for the new generation instead of returning obsolete success or a transient failure", async () => {
  let value = "one",
    release,
    entered;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (entered = r));
  const service = new ReportService(
    async () => {
      const seen = value;
      if (seen === "two") {
        entered();
        await gate;
      }
      return { ok: true, value: seen };
    },
    { identity: async () => value },
  );
  try {
    await service.get("A");
    value = "two";
    service.invalidate("A");
    await started;
    const forced = service.get("A", {}, true);
    value = "three";
    release();
    const result = await forced;
    assert.equal(result.ok, true, result.error);
    assert.equal(result.value, "three");
  } finally {
    service.dispose();
  }
});

test("slow identity observations and concurrent cached GETs retain one watchdog timer chain", async () => {
  const { createHook } = await import("node:async_hooks");
  const active = new Set();
  let peak = 0;
  const hook = createHook({
    init(id, type) {
      if (type === "Timeout") {
        active.add(id);
        peak = Math.max(peak, active.size);
      }
    },
    destroy(id) {
      active.delete(id);
    },
  });
  const service = new ReportService(
    async () => ({ ok: true, value: "valid" }),
    {
      watchMs: 10,
      identity: async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "same";
      },
    },
  );
  hook.enable();
  try {
    await service.get("A");
    for (let i = 0; i < 180; i++) {
      await service.get("A");
      await new Promise((r) => setTimeout(r, 1));
    }
    assert(
      peak < 12,
      "Watchdog timers grew during one slow observation: " + peak,
    );
  } finally {
    service.dispose();
    await service.state("A").checking;
    await tick();
    hook.disable();
  }
});

test("manual refresh during a metadata poll queues one force request instead of losing user intent", async () => {
  const { panelHarness } = await import("./support/panel-harness.mjs"),
    { run } = await import("../bin/compat-check.mjs"),
    { toJSON } = await import("../lib/report.mjs");
  const report = toJSON(
    run({
      nm: path.resolve("test/fixtures/labels"),
      dshVersion: "0.2.1-rc.2",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  const data = {
    schemaVersion: 1,
    kind: "plugin-compat-check/report",
    ok: true,
    error: null,
    exitCode: report.exitCode,
    toolVersion: report.toolVersion,
    report,
    computedAt: "2026-10-22T00:00:00Z",
    nodeModules: "/example/A",
    baseline: null,
  };
  const timers = new Map(),
    urls = [];
  let id = 0,
    release,
    entered;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (entered = r));
  const h = await panelHarness(data, {
    timers: {
      setTimeout: (fn) => {
        timers.set(++id, fn);
        return id;
      },
      clearTimeout: (id) => timers.delete(id),
    },
    fetcher: async (url) => {
      urls.push(url);
      if (url.includes("metadata=1")) {
        entered();
        await gate;
        return {
          ok: true,
          json: async () => ({
            kind: "plugin-compat-check/report-metadata",
            ok: true,
            computedAt: data.computedAt,
            nodeModules: data.nodeModules,
            dshVersion: report.dshVersion,
          }),
        };
      }
      return { ok: true, json: async () => structuredClone(data) };
    },
  });
  try {
    const next = [...timers.entries()][0];
    timers.delete(next[0]);
    const polling = next[1]();
    await started;
    h.button("重新检查").props.onClick();
    h.button("重新检查").props.onClick();
    release();
    await polling;
    await h.settle();
    assert.equal(urls.filter((url) => url.includes("refresh=1")).length, 1);
  } finally {
    release();
    h.dispose();
  }
});

test("ordinary host commits only the current filesystem generation to the real persistent baseline", async () => {
  const { spawnSync } = await import("node:child_process"),
    { pathToFileURL } = await import("node:url");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-baseline-")),
    home = path.join(root, "home"),
    nm = path.join(home, "profiles/cache/node_modules"),
    pkg = path.join(nm, "demo");
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(
    path.join(pkg, "package.json"),
    '{"name":"demo","version":"1","main":"index.js","dsh":{}}',
  );
  await fs.writeFile(
    path.join(pkg, "index.js"),
    "export function apply(ctx){ctx.tools.register({})}",
  );
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {apply} from ${JSON.stringify(pathToFileURL(path.resolve("plugin/index.js")).href)};
    const routes=new Map(),effects=[],holds=new Map();let reads=0;
    function hold(at){let enter,release;const started=new Promise(r=>enter=r),gate=new Promise(r=>release=r);const item={started,gate,enter,release};holds.set(at,item);return item;}
    const manager={list:async()=>{const pause=holds.get(++reads);if(pause){pause.enter();await pause.gate;}return [];}};
    const ctx={get:n=>n==='pluginManager'?manager:undefined,inject:(deps,cb)=>{if(deps[0]!=='webServer')return;const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path)}}});if(off)effects.push(off);},effect:f=>{const off=f();if(off)effects.push(off);}};apply(ctx);
    const request=async(force=false)=>{let text;await routes.get('/plugin-compat-check/report').handler({method:'GET',headers:{'x-dsh-compat-request':'1',host:'127.0.0.1'},url:'/plugin-compat-check/report'+(force?'?refresh=1':''),socket:{}},{writeHead(){},end:t=>text=t});return JSON.parse(text);};
    const meta=${JSON.stringify(path.join(pkg, "package.json"))};const writeVersion=v=>fs.writeFileSync(meta,JSON.stringify({name:'demo',version:v,main:'index.js',dsh:{}}));
    try{
      const first=await request();assert.equal(first.ok,true,first.error);assert.equal(first.baseline.wrote,true);const file=first.baseline.file;
      assert.equal(JSON.parse(fs.readFileSync(file)).plugins.demo.version,'1');
      const extracting=hold(reads+2);writeVersion('2');const pending=request(true);await extracting.started;
      writeVersion('3');const finishing=hold(reads+1);extracting.release();await finishing.started;
      assert.equal(JSON.parse(fs.readFileSync(file)).plugins.demo.version,'1','Superseded extraction advanced the baseline before final identity validation');
      finishing.release();const latest=await pending;assert.equal(latest.ok,true,latest.error);assert.equal(latest.report.plugins.demo.version,'3');
      assert.equal(JSON.parse(fs.readFileSync(file)).plugins.demo.version,'3');
    }finally{for(const pause of holds.values())pause.release();for(const off of effects)off();}process.exit(0);`;
  try {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSC_PROFILE: "cache",
          DSH_VERSION: "0.2.0-rc.2",
          DSC_KERNEL: path.resolve("."),
          DSC_CACHE_WATCH_MS: "5000",
          DSC_AUTORUN_MS: "60000",
          DSC_PROBE_REPORT: "",
          DSC_OUT_DIR: "",
        },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("final publication samples identity after computation instead of trusting a preexisting stale observation", async () => {
  let value = "one",
    blockCompute = false,
    blockIdentity = false,
    computeEntered,
    computeRelease,
    identityEntered,
    identityRelease;
  const computeStarted = new Promise((r) => (computeEntered = r)),
    computeGate = new Promise((r) => (computeRelease = r)),
    identityStarted = new Promise((r) => (identityEntered = r)),
    identityGate = new Promise((r) => (identityRelease = r));
  const service = new ReportService(
    async () => {
      const captured = value;
      if (blockCompute) {
        blockCompute = false;
        computeEntered();
        await computeGate;
      }
      return { ok: true, value: captured };
    },
    {
      identity: async () => {
        const captured = value;
        if (blockIdentity) {
          blockIdentity = false;
          identityEntered();
          await identityGate;
        }
        return captured;
      },
      watchMs: 60000,
    },
  );
  try {
    await service.get("A");
    blockCompute = true;
    const forced = service.get("A", {}, true);
    await computeStarted;
    blockIdentity = true;
    service.notify();
    await identityStarted;
    value = "two";
    computeRelease();
    await tick();
    identityRelease();
    const result = await forced;
    assert.equal(result.ok, true, result.error);
    assert.equal(result.value, "two");
  } finally {
    computeRelease();
    identityRelease();
    service.dispose();
  }
});

test("symlink aliases retain distinct probe bindings and observe the policy beside the requested profile", async () => {
  const { spawnSync } = await import("node:child_process"),
    { pathToFileURL } = await import("node:url");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-cache-alias-")),
    home = path.join(root, "home"),
    a = path.join(home, "profiles/A/node_modules"),
    b = path.join(home, "profiles/B/node_modules"),
    pkg = path.join(a, "demo"),
    probe = path.join(root, "probe.json"),
    policy = path.join(path.dirname(b), "compatibility.json");
  await fs.mkdir(pkg, { recursive: true });
  await fs.mkdir(path.dirname(b), { recursive: true });
  await fs.symlink(a, b);
  await fs.writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "demo",
      version: "1.0.0",
      main: "index.js",
      dsh: {},
      engines: { dsh: "<0.2.0-rc.2" },
    }),
  );
  await fs.writeFile(path.join(pkg, "index.js"), "export function apply(){}");
  await fs.writeFile(
    probe,
    JSON.stringify({
      observationVersion: 1,
      profileId: a,
      dshVersion: "0.2.1-rc.2",
      probedAt: new Date().toISOString(),
      root: {},
    }),
  );
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {apply} from ${JSON.stringify(pathToFileURL(path.resolve("plugin/index.js")).href)};
    const routes=new Map(),effects=[];const ctx={get:()=>undefined,inject:(deps,cb)=>{if(deps[0]!=='webServer')return;const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path)}}});if(off)effects.push(off);},effect:f=>{const off=f();if(off)effects.push(off);}};apply(ctx);
    const request=async()=>{let text;await routes.get('/plugin-compat-check/report').handler({method:'GET',headers:{'x-dsh-compat-request':'1',host:'127.0.0.1'},url:'/plugin-compat-check/report',socket:{}},{writeHead(){},end:t=>text=t});return JSON.parse(text);};
    try{
      const first=await request();assert.equal(first.ok,true,first.error);assert.equal(first.report.observation.usable,true);assert.equal(first.nodeModules,${JSON.stringify(a)});
      process.env.DSC_PROFILE='B';const alias=await request();assert.equal(alias.ok,true,alias.error);assert.equal(alias.nodeModules,${JSON.stringify(b)},'Alias request reused the other raw profile binding');assert.equal(alias.report.observation.usable,false);assert(alias.report.observation.notes.join(' ').includes('profile/DSH'));assert(alias.report.plugins.demo.findings.some(f=>f.category==='declared-incompatible'));
      fs.writeFileSync(${JSON.stringify(policy)},JSON.stringify({'demo@1.0.0':['0.2.1-rc.2']}));
      let refreshed;for(let i=0;i<150;i++){const current=await request();if(current.ok && !current.report.plugins.demo.findings.some(f=>f.category==='declared-incompatible')){refreshed=current;break;}await new Promise(r=>setTimeout(r,20));}
      assert(refreshed,'Policy change beside requested alias did not refresh the report');assert.equal(refreshed.nodeModules,${JSON.stringify(b)});assert.equal(refreshed.report.observation.usable,false);
    }finally{for(const off of effects)off();}process.exit(0);`;
  try {
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          DSH_HOME: home,
          DSC_PROFILE: "A",
          DSH_VERSION: "0.2.1-rc.2",
          DSC_KERNEL: path.resolve("."),
          DSC_CACHE_WATCH_MS: "30",
          DSC_AUTORUN_MS: "60000",
          DSC_PROBE_REPORT: probe,
          DSC_OUT_DIR: "",
        },
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
