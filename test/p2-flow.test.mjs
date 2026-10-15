import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFixture, fixtureCatalog as catalog } from "./fixture-utils.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";

// Literal, independently specified counterexamples. No inspected code is run.
export const flowCases = [
  {
    name: "installed dsh-pet forwarding pattern",
    source: `async function consume(engine){for await(const chunk of engine.stream(options)) console.log(chunk)}export function apply(ctx){consume(ctx.llm)}`,
    want: ["llm.stream"],
  },
  {
    name: "constant computed keys",
    source: `export function apply(context){const s='settings';const m='abs'+'ent';context[s][m]();}`,
    want: ["settings.absent"],
  },
  {
    name: "reassigned constant key",
    source: `export function apply(ctx){let m='absent';m='known';ctx.settings[m]();}`,
    want: ["settings.known"],
  },
  {
    name: "local helper receives service",
    source: `function wire(service){service.absent()}\nexport function apply(ctx){wire(ctx.settings)}`,
    want: ["settings.absent"],
  },
  {
    name: "factory returns service",
    source: `const select=(scope)=>scope.settings;export function apply(ctx){select(ctx).absent()}`,
    want: ["settings.absent"],
  },
  {
    name: "factory returns closure",
    source: `const make=(scope)=>()=>scope.settings.absent();export function apply(ctx){make(ctx)()}`,
    want: ["settings.absent"],
  },
  {
    name: "factory returns object",
    source: `function box(scope){return {service:scope.settings}}export function apply(ctx){box(ctx).service.absent()}`,
    want: ["settings.absent"],
  },
  {
    name: "transparent Proxy",
    source: `export function apply(ctx){const wrapped=new Proxy(ctx,{});wrapped.settings.absent()}`,
    want: ["settings.absent"],
  },
  {
    name: "ESM named alias",
    source: `import {wire as connect} from './worker.js';export function apply(ctx){connect(ctx)}`,
    files: {
      "worker.js": `export function wire(scope){scope.settings.absent()}`,
    },
    want: ["settings.absent"],
    file: "worker.js",
  },
  {
    name: "ESM namespace",
    source: `import * as helpers from './worker.js';export function apply(ctx){helpers.wire(ctx.settings)}`,
    files: { "worker.js": `export function wire(service){service.absent()}` },
    want: ["settings.absent"],
    file: "worker.js",
  },
  {
    name: "ESM reexport",
    source: `import {connect} from './bridge.js';export function apply(ctx){connect(ctx)}`,
    files: {
      "bridge.js": `export {wire as connect} from './worker.js'`,
      "worker.js": `export function wire(scope){scope.settings.absent()}`,
    },
    want: ["settings.absent"],
    file: "worker.js",
  },
  {
    name: "ESM default factory",
    source: `import select from './worker.js';export function apply(ctx){select(ctx).absent()}`,
    files: { "worker.js": `export default (scope)=>scope.settings` },
    want: ["settings.absent"],
  },
  {
    name: "CommonJS helper",
    source: `const helpers=require('./worker.cjs');export function apply(ctx){helpers.wire(ctx)}`,
    files: {
      "worker.cjs": `exports.wire=function(scope){scope.settings.absent()}`,
    },
    want: ["settings.absent"],
    file: "worker.cjs",
  },
  {
    name: "identical conditional key",
    source: `export function apply(ctx){const key=flag?'settings':'settings';ctx[key].absent()}`,
    want: ["settings.absent"],
  },
  {
    name: "local objects are not Context",
    source: `function wire(scope){scope.settings.absent()}export function apply(ctx){wire({settings:{absent(){}}})}`,
    want: [],
  },
  {
    name: "same-name key on local Map",
    source: `export function apply(ctx){const settings=new Map(),key='absent';settings[key]()}`,
    want: [],
  },
  {
    name: "rebound imported helper",
    source: `import {wire} from './worker.js';export function apply(ctx){let call=wire;call=()=>{};call(ctx)}`,
    files: {
      "worker.js": `export function wire(scope){scope.settings.absent()}`,
    },
    want: [],
  },
  {
    name: "unknown computed key",
    source: `export function apply(ctx){ctx.settings[readName()]()}`,
    want: [],
    diagnostic: /dynamic/,
  },
  {
    name: "opaque Proxy",
    source: `export function apply(ctx){const wrapped=new Proxy(ctx,{get(){return {absent(){}}}});wrapped.settings.absent()}`,
    want: [],
    diagnostic: /proxy/,
  },
  {
    name: "ambiguous factory return",
    source: `function pick(scope){if(flag)return scope.settings;return {absent(){}}}export function apply(ctx){pick(ctx).absent()}`,
    want: [],
    diagnostic: /ambiguous/,
  },
  {
    name: "recursive factory",
    source: `function pick(scope){return pick(scope)}export function apply(ctx){pick(ctx).settings.absent()}`,
    want: [],
    diagnostic: /recurs|budget/,
  },
];
export function measureCase(c) {
  const f = packageFixture(c.source, {
    files: c.files || {},
    meta: c.meta || {},
  });
  try {
    const extraction = extractWithProvenance(f.nm, { catalog });
    const p = extraction.report.perPlugin.sample;
    const verdict = buildVerdicts({
      report: extraction.report,
      catalog,
      hostSurface: {
        observationVersion: 1,
        profileId: f.nm,
        dshVersion: "0.2.0",
        probedAt: new Date().toISOString(),
        root: {
          settings: { present: true, methods: { known: "function" } },
          tools: { present: true, methods: { register: "function" } },
        },
      },
      dshVersion: "0.2.0",
      observationTarget: { profileId: f.nm },
    });
    return {
      p,
      verdict: verdict.plugins.sample,
      pairs: [
        ...new Set(p.callSites.map((s) => s.service + "." + s.method)),
      ].sort(),
    };
  } finally {
    f.cleanup();
  }
}
for (const c of flowCases)
  test("P2 flow: " + c.name, () => {
    const { p, pairs, verdict } = measureCase(c);
    assert.deepEqual(pairs, c.want);
    for (const site of p.callSites) {
      assert.equal(site.evidenceSource, "ast");
      assert.equal(site.inferredReceiver, false);
      assert.equal(site.file, c.file || "index.js");
      assert.ok(site.end > site.start);
      assert.ok(site.line >= 1);
    }
    if (c.want.includes("settings.absent"))
      assert.ok(
        verdict.findings.some(
          (f) => f.method === "absent" && f.certainty === "certain",
        ),
      );
    if (c.diagnostic) {
      assert.ok(
        p.diagnostics.some((d) => c.diagnostic.test(d.kind)),
        JSON.stringify(p.diagnostics),
      );
      assert.equal(verdict.coverage.status, "limited");
    }
  });
test("P2 flow preserves the side of each invocation into a shared module", () => {
  const c = {
    source: `import {wire} from './worker.js';export function apply(ctx){wire(ctx.settings)}`,
    files: {
      "client.js": `import {wire} from './worker.js';export function apply(ctx){wire(ctx.tools)}`,
      "worker.js": `export function wire(service){service.absent()}`,
    },
    meta: {
      exports: { ".": "./index.js", "./client": "./client.js" },
      dsh: {
        bundle: { patch: "cordis.patch.yml" },
        client: { platform: "web" },
      },
    },
  };
  const { p } = measureCase(c);
  assert.deepEqual(p.callSites.map((s) => [s.service, s.sides]).sort(), [
    ["settings", ["host"]],
    ["tools", ["client"]],
  ]);
});
test("P2 synchronous forwarding preserves the controlling guard and invalidates mutations", () => {
  const safe = measureCase({
    source: `function wire(service){service.absent()}export function apply(ctx){if(typeof ctx.settings.absent==='function')wire(ctx.settings)}`,
  });
  assert.equal(
    safe.p.callSites.find((s) => s.method === "absent")?.guarded,
    true,
  );
  const unsafe = measureCase({
    source: `function wipe(service){service.absent=undefined}export function apply(ctx){if(typeof ctx.settings.absent==='function'){wipe(ctx.settings);ctx.settings.absent()}}`,
  });
  assert.equal(
    unsafe.p.callSites.find((s) => s.method === "absent")?.guarded,
    false,
  );
});

const edgeCases = [
  {
    name: "called ordinary ctx parameter is a local object",
    source: `function wire(ctx){ctx.settings.absent()}export function apply(root){wire({settings:{absent(){}}})}`,
    want: [],
  },
  {
    name: "standalone guess cannot erase a proven synchronous guard",
    source: `function wire(ctx){ctx.settings.absent()}export function apply(root){if(typeof root.settings.absent==='function')wire(root)}`,
    want: ["settings.absent"],
    guarded: true,
  },
  {
    name: "branch alias cannot select the last visited service",
    source: `export function apply(ctx){let service=ctx.settings;if(flag)service=ctx.tools;service.absent()}`,
    want: [],
    diagnostic: /ambiguous/,
  },
  {
    name: "loop key cannot select the last visited value",
    source: `export function apply(ctx){let key='settings';while(flag){key='tools'}ctx[key].absent()}`,
    want: [],
    diagnostic: /ambiguous|dynamic/,
  },
  {
    name: "Proxy spread is not a proven empty handler",
    source: `export function apply(ctx){const p=new Proxy(ctx,{...traps});p.settings.absent()}`,
    want: [],
    diagnostic: /proxy/,
  },
  {
    name: "Proxy handler escape is not transparent",
    source: `export function apply(ctx){const traps={};configure(traps);const p=new Proxy(ctx,traps);p.settings.absent()}`,
    want: [],
    diagnostic: /proxy/,
  },
  {
    name: "unknown external target preserves a flow limitation",
    source: `import external from 'external-package';export function apply(ctx){external(ctx)}`,
    want: [],
    diagnostic: /unknown-target/,
  },
  {
    name: "CJS default factory",
    source: `const select=require('./worker.cjs');export function apply(ctx){select(ctx).absent()}`,
    files: {
      "worker.cjs": `module.exports=function(scope){return scope.settings}`,
    },
    want: ["settings.absent"],
  },
  {
    name: "ESM import followed by local export",
    source: `import {wire} from './bridge.js';export function apply(ctx){wire(ctx)}`,
    files: {
      "bridge.js": `import {wire} from './worker.js';export {wire}`,
      "worker.js": `export function wire(scope){scope.settings.absent()}`,
    },
    want: ["settings.absent"],
  },
  {
    name: "cyclic export aliases are bounded",
    source: `import {wire} from './a.js';export function apply(ctx){wire(ctx)}`,
    files: {
      "a.js": `import {wire} from './b.js';export {wire}`,
      "b.js": `import {wire} from './a.js';export {wire}`,
    },
    want: [],
    diagnostic: /cycle/,
  },
  {
    name: "exported helper is not another plugin entry",
    source: `import {apply as wire} from './worker.js';export function apply(root){wire({settings:{absent(){}}})}`,
    files: { "worker.js": `export function apply(ctx){ctx.settings.absent()}` },
    want: [],
  },
  {
    name: "async return is not a synchronous service",
    source: `async function select(scope){return scope.settings}export function apply(ctx){select(ctx).absent()}`,
    want: [],
    diagnostic: /async/,
  },
];
for (const c of edgeCases)
  test("P2 boundary: " + c.name, () => {
    const { p, pairs, verdict } = measureCase(c);
    assert.deepEqual(pairs, c.want);
    if (c.guarded) assert.ok(p.callSites.every((s) => s.guarded));
    if (c.diagnostic) {
      assert.ok(
        p.diagnostics.some((d) => c.diagnostic.test(d.kind)),
        JSON.stringify(p.diagnostics),
      );
      assert.equal(verdict.coverage.status, "limited");
    }
  });
test("P2 rejects expansion beyond the constant string budget without allocating exponential strings", () => {
  const declarations = Array.from(
    { length: 25 },
    (_, i) => `const k${i + 1}=k${i}+k${i};`,
  ).join("");
  const { p } = measureCase({
    source: `export function apply(ctx){const k0='a';${declarations}ctx.settings[k25]()}`,
  });
  assert.ok(p.diagnostics.some((d) => /budget/.test(d.kind)));
  assert.equal(p.callSites.length, 0);
});

test("P2 factory with an implicit undefined branch does not establish a service", () => {
  const { p, pairs } = measureCase({
    source: `function pick(scope){if(flag)return scope.settings}export function apply(ctx){pick(ctx).absent()}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /ambiguous/.test(d.kind)));
});
test("P2 generator bodies are not promoted by merely creating an iterator", () => {
  const { p, pairs } = measureCase({
    source: `function* wire(scope){scope.settings.absent()}export function apply(ctx){wire(ctx)}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /generator/.test(d.kind)));
});
test("P2 object branches retain both possible field assignments", () => {
  const { p, pairs } = measureCase({
    source: `export function apply(ctx){const box={service:ctx.settings};if(flag)box.service=ctx.tools;box.service.absent()}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /ambiguous/.test(d.kind)));
});
test("P2 local method receiver carries a proven service through this", () => {
  const { p, pairs } = measureCase({
    source: `export function apply(ctx){const box={service:ctx.settings,wire(){this.service.absent()}};box.wire()}`,
  });
  assert.deepEqual(pairs, ["settings.absent"]);
  assert.ok(p.callSites.every((s) => !s.inferredReceiver));
});

test("P2 reexported apply is a real entry with a proven Context", () => {
  const { p, pairs } = measureCase({
    source: `export {activate as apply} from './worker.js'`,
    files: {
      "worker.js": `export function activate(scope){scope.settings.absent()}`,
    },
  });
  assert.deepEqual(pairs, ["settings.absent"]);
  assert.ok(p.callSites.every((s) => !s.inferredReceiver));
});
test("P2 CommonJS exported apply proves its first parameter", () => {
  const { p, pairs } = measureCase({
    source: `exports.apply=function(scope){scope.settings.absent()}`,
  });
  assert.deepEqual(pairs, ["settings.absent"]);
  assert.ok(p.callSites.every((s) => !s.inferredReceiver));
});
test("P2 long helper chains stop at a diagnosed depth budget", () => {
  const fns = Array.from(
    { length: 24 },
    (_, i) =>
      `function f${i}(scope){return ${i === 23 ? "scope.settings" : `f${i + 1}(scope)`}}`,
  ).join("");
  const { p } = measureCase({
    source: fns + `export function apply(ctx){f0(ctx).absent()}`,
  });
  assert.ok(p.diagnostics.some((d) => d.kind === "flow-budget-exceeded"));
});
test("P2 repeated call contexts stop at a diagnosed count budget", () => {
  const { p } = measureCase({
    source: `function wire(scope){scope.settings.absent()}export function apply(ctx){${"wire(ctx);".repeat(1050)}}`,
  });
  assert.ok(p.diagnostics.some((d) => d.kind === "flow-budget-exceeded"));
  assert.equal(p.callSites.filter((s) => s.service === "settings").length, 1);
});

test("P2 imported capability predicate uses its own lexical key binding", () => {
  const { p } = measureCase({
    source: `import {canUse} from './worker.js';const KEY='other';export function apply(ctx){if(canUse(ctx.settings))ctx.settings.absent()}`,
    files: {
      "worker.js": `const KEY='absent';export function canUse(service){return typeof service[KEY]==='function'}`,
    },
  });
  assert.equal(p.callSites.find((s) => s.method === "absent")?.guarded, true);
});
test("P2 async boolean helper is a Promise, not a controlling capability proof", () => {
  const { p } = measureCase({
    source: `async function canUse(service){return typeof service.absent==='function'}export function apply(ctx){if(canUse(ctx.settings))ctx.settings.absent()}`,
  });
  assert.equal(p.callSites.find((s) => s.method === "absent")?.guarded, false);
});

test("P2 logical branch does not overwrite a receiver unconditionally", () => {
  const { p, pairs } = measureCase({
    source: `export function apply(ctx){let service=ctx.settings;flag&&(service=ctx.tools);service.absent()}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /ambiguous/.test(d.kind)));
});
test("P2 zero-iteration for-loop update cannot choose a computed service", () => {
  const { p, pairs } = measureCase({
    source: `export function apply(ctx){let key='settings';for(;flag;key='tools'){}ctx[key].absent()}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /dynamic|ambiguous/.test(d.kind)));
});

test("P2 deep reexport chains stop at a diagnosed module budget", () => {
  const files = {};
  for (let i = 0; i < 48; i++)
    files[`m${i}.js`] =
      i === 47
        ? `export function wire(scope){scope.settings.absent()}`
        : `export {wire} from './m${i + 1}.js'`;
  const { p, pairs } = measureCase({
    source: `import {wire} from './m0.js';export function apply(ctx){wire(ctx)}`,
    files,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => d.kind === "flow-module-budget"));
});

test("P2 unrelated constant calls cannot exhaust the DSH flow budget", () => {
  const { p, pairs } = measureCase({
    source: `function value(v){return v+1}function wire(scope){scope.settings.absent()}export function apply(ctx){${"value(1);".repeat(1400)}wire(ctx)}`,
  });
  assert.deepEqual(pairs, ["settings.absent"]);
  assert.ok(!p.diagnostics.some((d) => d.kind === "flow-budget-exceeded"));
});

test("P2 guessed Context names are not expanded as proven interprocedural inputs", () => {
  const { p, pairs } = measureCase({
    source: `function forward(ctx){wire(ctx.settings)}function wire(service){service.absent()}export function apply(){}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => d.kind === "flow-inferred-forwarding"));
});

test("P2 computed scoped inject and constant service names preserve dependency evidence", () => {
  const { p } = measureCase({
    source: `export function apply(ctx){const operation='inject',service='settings';ctx[operation]([service],scope=>scope.settings.absent())}`,
  });
  assert.ok(
    p.dependencies.some(
      (d) => d.kind === "scoped-inject" && d.service === "settings",
    ),
  );
  assert.equal(
    p.callSites.find((s) => s.method === "absent")?.inferredReceiver,
    false,
  );
});
test("P2 constant ctx.get name preserves optional-read evidence", () => {
  const { p } = measureCase({
    source: `export function apply(ctx){const name='settings';const service=ctx.get(name,false);service.absent()}`,
  });
  assert.ok(
    p.dependencies.some(
      (d) => d.kind === "optional-read" && d.service === "settings",
    ),
  );
});
test("P2 constant provide name survives a helper boundary", () => {
  const { p } = measureCase({
    source: `function install(scope,name){scope.provide(name,{})}export function apply(ctx){install(ctx,'customService')}`,
  });
  assert.ok(p.providedServices.includes("customService"));
});

test("P2 computed destructuring uses the constant key, not the variable name", () => {
  const { pairs } = measureCase({
    source: `export function apply(ctx){const key='settings';const {[key]:service}=ctx;service.absent()}`,
  });
  assert.deepEqual(pairs, ["settings.absent"]);
});
test("P2 unknown destructuring keys cannot invent a service identity", () => {
  const { p, pairs } = measureCase({
    source: `export function apply(ctx){const {[dynamicKey]:service}=ctx;service.absent()}`,
  });
  assert.deepEqual(pairs, []);
  assert.ok(p.diagnostics.some((d) => /dynamic/.test(d.kind)));
});

test("P2 relevance pruning preserves IIFE prebuilt client module source coverage", () => {
  const { p } = measureCase({
    source: `export function apply(){}`,
    meta: {
      exports: { ".": "./index.js", "./client": "./client.js" },
      dsh: {
        bundle: { patch: "cordis.patch.yml" },
        client: { platform: "web" },
      },
    },
    files: {
      "client.js": `(()=>{function makeFactory(){return function(require){function apply(ctx){ctx.slots.register()}module.exports={apply};return module.exports;}}window.__ModuleLoader__.load({factory:makeFactory()})})()`,
    },
  });
  assert.ok(
    p.callSites.some(
      (s) =>
        s.service === "slots" &&
        s.method === "register" &&
        s.file === "client.js" &&
        s.sides.includes("client"),
    ),
  );
});

test("P2 captured-function relevance graphs have a diagnosed traversal budget", () => {
  const fns = Array.from(
    { length: 100 },
    (_, i) =>
      `function f${i}(){return ${i === 99 ? "external()" : `f${i + 1}()`}}`,
  ).join("");
  const { p } = measureCase({ source: fns + `export function apply(){f0()}` });
  assert.ok(p.diagnostics.some((d) => d.kind === "flow-capture-budget"));
});
