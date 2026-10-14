import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { extractWithProvenance } from '../lib/extract.mjs';
import { packageFixture, fixtureCatalog as catalog } from './fixture-utils.mjs';

function scan(source, opts, check) {
  const f = packageFixture(source, opts);
  try { check(extractWithProvenance(f.nm, { catalog }).report.perPlugin.sample); }
  finally { f.cleanup(); }
}

test('string examples cannot provide a missing service', () => {
  scan('export const inject=["missingSvc"]; const example="ctx.provide(\'missingSvc\')";', {},
    p => assert.deepEqual(p.providedServices, []));
});
test('template expressions contain executable calls', () => {
  scan('export function apply(ctx){return `${ctx.settings.absent()}`;}', {},
    p => assert.deepEqual(p.calls.settings, ['absent']));
});
test('commented bindings cannot assign local object calls to host services', () => {
  scan('// const svc=ctx.get("settings");\nexport function apply(ctx){const svc={absent(){}};svc.absent();}', {},
    p => assert.deepEqual(p.calls, {}));
});
test('lexical scopes retain different services for the same alias', () => {
  scan('function a(ctx){const svc=ctx.get("settings");svc.known();}\nfunction b(ctx){const svc=ctx.get("tools");svc.register();}', {},
    p => { assert.deepEqual(p.calls.settings, ['known']); assert.deepEqual(p.calls.tools, ['register']); });
});
test('an assigned service alias retains its binding evidence', () => {
  scan('export function apply(ctx){let reg=null;reg=ctx.tools;reg.register();}', {}, p => {
    assert.deepEqual(p.calls.tools,['register']);
    assert.ok(p.localBindings.some(b=>b.variable==='reg' && b.service==='tools'));
  });
});
test('side-effect imports are part of the source graph', () => {
  scan("import './worker.js'; export function apply(){}", {
    files: { 'worker.js': 'export function register(ctx){ctx.settings.absent();}' },
  }, p => { assert.ok(p.files['host-entry'].includes('worker.js')); assert.deepEqual(p.calls.settings, ['absent']); });
});
test('same-line independent calls have separate spans and guards', () => {
  scan('export function apply(ctx){ctx.settings.absent?.();ctx.settings.absent();}', {}, p => {
    const sites = p.callSites.filter(s => s.service === 'settings' && s.method === 'absent');
    assert.equal(sites.length, 2); assert.notEqual(sites[0].start, sites[1].start);
    assert.deepEqual(sites.map(s => s.guarded), [true, false]);
    assert.ok(!p.guardedPairs.includes('settings.absent'));
  });
});
test('a nearby non-controlling typeof check is not a guard', () => {
  scan('export function apply(ctx){if(typeof ctx.settings.absent === "function")console.log("yes");ctx.settings.absent();}', {},
    p => assert.equal(p.callSites.find(s => s.method === 'absent').guarded, false));
});
test('an actual controlling capability check guards its consequent only', () => {
  scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){ctx.settings.absent();}}', {},
    p => assert.equal(p.callSites.find(s => s.method === 'absent').guarded, true));
});
test('optional service access is observed but does not guarantee an optional method', () => {
  scan('export function apply(ctx){ctx.settings?.absent();}', {}, p => {
    assert.deepEqual(p.calls.settings, ['absent']); assert.equal(p.callSites[0].guarded, false);
  });
});
test('parse failures are explicit extraction diagnostics', () => {
  scan('export function apply(ctx){ @@@', {},
    p => assert.ok(p.diagnostics.some(d => d.kind === 'parse-error' && d.file === 'index.js')));
});
test('package-relative imports cannot scan files outside the package root', () => {
  const f = packageFixture("import '../outside.js';export function apply(){};");
  try {
    fs.writeFileSync(path.join(f.nm, 'outside.js'), 'ctx.settings.secret();');
    const p = extractWithProvenance(f.nm, { catalog }).report.perPlugin.sample;
    assert.equal(p.calls.settings, undefined);
    assert.ok(p.diagnostics.some(d => d.kind === 'path-outside-package'));
  } finally { f.cleanup(); }
});
test('directory symlink aliases do not amplify synchronous scans', () => {
  const f = packageFixture('export function apply(){}');
  try {
    fs.symlinkSync('.', path.join(f.pkg, 'link-a'), 'dir');
    fs.symlinkSync('.', path.join(f.pkg, 'link-b'), 'dir');
    const script = `import {extractWithProvenance} from ${JSON.stringify(new URL('../lib/extract.mjs', import.meta.url).href)}; console.log(JSON.stringify(extractWithProvenance(${JSON.stringify(f.nm)}).provenance.packages.sample.counts));`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 2000 });
    assert.equal(r.status, 0, 'scan must finish within its bounded input budget');
    assert.ok(Object.values(JSON.parse(r.stdout)).reduce((a,b)=>a+b,0) < 10);
  } finally { f.cleanup(); }
});
test('capability guards do not silently cross a deferred function boundary',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){setTimeout(()=>ctx.settings.absent(),100);}}',{},p=>assert.equal(p.callSites.find(s=>s.method==='absent').guarded,false));
});
test('a method reassignment invalidates a previous capability guard',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){ctx.settings.absent=undefined;ctx.settings.absent();}}',{},p=>assert.equal(p.callSites.find(s=>s.method==='absent').guarded,false));
});
test('var declarations bind the enclosing function rather than the block',()=>{
 scan('export function apply(ctx){if(true){var ctx={settings:{absent(){}}};}ctx.settings.absent();}',{},p=>assert.ok(!p.callSites.some(s=>s.service==='settings'&&!s.inferredReceiver)));
});
test('delete invalidates a controlling method capability check',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){delete ctx.settings.absent;ctx.settings.absent();}}',{},p=>assert.equal(p.callSites.find(s=>s.method==='absent').guarded,false));
});
test('receiver replacement invalidates a controlling method capability check',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){ctx.settings={};ctx.settings.absent();}}',{},p=>assert.equal(p.callSites.find(s=>s.method==='absent').guarded,false));
});
test('an uncalled nested function cannot change the caller service binding',()=>{
 scan('export function apply(ctx){let svc=ctx.settings;function unused(){svc=ctx.tools;}svc.absent();}',{},p=>{
  assert.deepEqual(p.calls.settings,['absent']);assert.ok(!p.calls.tools?.includes('absent'));
 });
});
test('unreadable scoped inventory is an error rather than an empty successful scan',()=>{
 const f=packageFixture('export function apply(){}'),scope=path.join(f.nm,'@scope');
 const original=fs.readdirSync;
 try{
  fs.mkdirSync(scope);fs.renameSync(f.pkg,path.join(scope,'sample'));
  fs.readdirSync=function(file,...args){if(path.resolve(String(file))===scope){const error=new Error('EACCES');error.code='EACCES';throw error;}return original.call(fs,file,...args);};
  assert.throws(()=>extractWithProvenance(f.nm,{catalog}),/EACCES/);
 }finally{fs.readdirSync=original;f.cleanup();}
});
