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
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){ctx.settings.absent=undefined;ctx.settings.absent();}}',{},p=>{assert.equal(p.callSites.some(s=>s.method==='absent'),false);assert.ok(p.diagnostics.some(d=>d.kind==='flow-service-mutation'));});
});
test('var declarations bind the enclosing function rather than the block',()=>{
 scan('export function apply(ctx){if(true){var ctx={settings:{absent(){}}};}ctx.settings.absent();}',{},p=>assert.ok(!p.callSites.some(s=>s.service==='settings'&&!s.inferredReceiver)));
});
test('delete invalidates a controlling method capability check',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){delete ctx.settings.absent;ctx.settings.absent();}}',{},p=>{assert.equal(p.callSites.some(s=>s.method==='absent'),false);assert.ok(p.diagnostics.some(d=>d.kind==='flow-service-mutation'));});
});
test('receiver replacement invalidates a controlling method capability check',()=>{
 scan('export function apply(ctx){if(typeof ctx.settings.absent === "function"){ctx.settings={};ctx.settings.absent();}}',{},p=>{assert.equal(p.callSites.some(s=>s.method==='absent'),false);assert.ok(p.diagnostics.some(d=>d.kind==='flow-service-mutation'));});
});
test('an uncalled nested function cannot change the caller service binding',()=>{
 scan('export function apply(ctx){let svc=ctx.settings;function unused(){svc=ctx.tools;}svc.absent();}',{},p=>{
  assert.deepEqual(p.calls.settings,['absent']);assert.ok(!p.calls.tools?.includes('absent'));
 });
});
test('unreadable scoped inventory is an error rather than an empty successful scan',()=>{
 const f=packageFixture('export function apply(){}'),scope=path.join(f.nm,'@scope');
 const original=fs.opendirSync;
 try{
  fs.mkdirSync(scope);fs.renameSync(f.pkg,path.join(scope,'sample'));
  fs.opendirSync=function(file,...args){if(path.resolve(String(file))===scope){const error=new Error('EACCES');error.code='EACCES';throw error;}return original.call(fs,file,...args);};
  assert.throws(()=>extractWithProvenance(f.nm,{catalog}),/EACCES/);
 }finally{fs.opendirSync=original;f.cleanup();}
});

test('host conditional exports follow Node import conditions and object order',()=>{
 for(const exports of [
  {node:'./actual.js',default:'./index.js'},
  {'.':{node:'./actual.js',import:'./index.js'}},
  {'.':{node:{types:'./types.d.ts',import:'./actual.js'},default:'./index.js'}},
  {'.':['./actual.js','./index.js']},
  {'.':{require:'./index.js',import:'./actual.js'}},
  {'.':{node:{'module-sync':'./actual.js',default:'./index.js'}}},
  {'.':['../invalid.js','./actual.js']},
 ]){
  const f=packageFixture('export function apply(ctx){ctx.settings.known()}',{meta:{exports},files:{'actual.js':'export function apply(ctx){ctx.settings.absent()}','types.d.ts':'export declare function apply(ctx:unknown):void;'}});
  try{
   fs.writeFileSync(path.join(f.pkg,'cordis.patch.yml'),'- name: sample\n');
   const {report}=extractWithProvenance(f.nm,{catalog});
   const resolved=spawnSync(process.execPath,['--input-type=module','-e',`process.stdout.write(import.meta.resolve('sample'))`],{cwd:f.root,encoding:'utf8',timeout:5000});
   assert.equal(resolved.status,0,resolved.stderr);
   assert.equal(fs.realpathSync(new URL(resolved.stdout)),fs.realpathSync(path.join(f.pkg,'actual.js')));
   assert.deepEqual(report.perPlugin.sample.files['host-entry'],['actual.js'],JSON.stringify(exports));
   assert.deepEqual(report.perPlugin.sample.calls.settings,['absent']);
   assert.equal(report.scanComplete,true);
  }finally{f.cleanup();}
 }
});

test('unresolved package exports abstain instead of certifying a legacy fallback',()=>{
 for(const exports of [
  {'.':{node:null,default:'./index.js'}},
  {'./other':'./index.js'},
  {'.':{development:'./actual.js',default:'./index.js'}},
  {'.':[{development:'./actual.js'},'./index.js']},
  {'.':['./actual%20file.js','./index.js']},
  {'.':['./actual.js?variant','./index.js']},
  {'.':{node:{types:'./types.d.ts'}}},
  {'.':'../outside.js'},
 ]){
  const f=packageFixture('export function apply(ctx){ctx.settings.known()}',{meta:{exports},files:{'actual.js':'export function apply(ctx){ctx.settings.absent()}'}});
  try{
   fs.writeFileSync(path.join(f.pkg,'cordis.patch.yml'),'- name: sample\n');
   const {report}=extractWithProvenance(f.nm,{catalog});
   assert.equal(report.scanComplete,false,JSON.stringify(exports));
   assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='entry-resolution-uncertain'));
   assert.deepEqual(report.perPlugin.sample.entryFiles,[]);
  }finally{f.cleanup();}
 }
});

test('a relative patch entry takes precedence over uncertain package exports',()=>{
 scan('export function apply(ctx){ctx.settings.absent()}',{meta:{exports:{'.':{custom:'./other.js'}}}},p=>{
  assert.deepEqual(p.files['host-entry'],['index.js']);
  assert.equal(p.diagnostics.some(d=>d.kind==='entry-resolution-uncertain'),false);
 });
});

// The oracle resolves paths and inspects file types; it never imports target code.
function nodeEntry(f, spec, requireMode=false) {
 const script=`import fs from 'node:fs';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';try{const file=${requireMode?'createRequire(import.meta.url).resolve('+JSON.stringify(spec)+')':'fileURLToPath(import.meta.resolve('+JSON.stringify(spec)+'))'};console.log(JSON.stringify({file:fs.statSync(file).isFile()?fs.realpathSync(file):null}))}catch(error){console.log(JSON.stringify({file:null,error:error.code}))}`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:f.pkg,encoding:'utf8',timeout:5000});
 assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);
}
for(const target of ['./actual','./directory'])test(`exports target ${target} cannot borrow an extension or directory index`,()=>{
 const f=packageFixture('throw Error("Target code must not execute")',{meta:{exports:target,dsh:{},type:'module'},files:{'actual.js':'export function apply(ctx){ctx.settings.known()}','directory/index.js':'export function apply(ctx){ctx.settings.known()}'}});
 try{
  assert.equal(nodeEntry(f,'sample').file,null);
  const {report}=extractWithProvenance(f.nm,{catalog}),p=report.perPlugin.sample;
  assert.equal(report.scanComplete,false);assert.deepEqual(p.entryFiles,[]);
  assert.ok(p.diagnostics.some(d=>d.kind==='source-unresolved'||d.kind==='entry-resolution-uncertain'));
 }finally{f.cleanup();}
});
for(const source of [
 "import './helper';export function apply(ctx){ctx.settings.known()}",
 "export {wire} from './helper';export function apply(ctx){ctx.settings.known()}",
 "exports.apply=function(ctx){import('./helper');ctx.settings.known()}",
])test(`ESM relative resolution is exact: ${source.split(';')[0]}`,()=>{
 const f=packageFixture(source,{files:{'helper.js':'export function wire(ctx){ctx.settings.absent()}'}});
 try{
  assert.equal(nodeEntry(f,'./helper').file,null);
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,false);
  assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='source-unresolved'&&d.file==='helper'));
  assert.ok(!report.perPlugin.sample.files['host-entry'].includes('helper.js'));
 }finally{f.cleanup();}
});
for(const [label,meta,files,want]of [
 ['legacy main extension',{main:'./actual',dsh:{}},{'actual.js':'export function apply(ctx){ctx.settings.known()}'},'actual.js'],
 ['legacy main directory',{main:'./directory',dsh:{}},{'directory/index.js':'export function apply(ctx){ctx.settings.known()}'},'directory/index.js'],
 ['legacy missing main fallback',{main:'./missing',dsh:{}},{},'index.js'],
 ['require extension',{}, {'helper.js':'exports.wire=function(ctx){ctx.settings.absent()}'},'helper.js'],
 ['require directory',{}, {'helper/index.js':'exports.wire=function(ctx){ctx.settings.absent()}'},'helper/index.js'],
 ['require package main',{}, {'helper/package.json':'{"main":"./actual"}','helper/actual.js':'exports.wire=function(ctx){ctx.settings.absent()}'},'helper/actual.js'],
 ['require ignored nonstring main',{}, {'helper/package.json':'{"main":3}','helper/index.js':'exports.wire=function(ctx){ctx.settings.absent()}'},'helper/index.js'],
])test(`${label} retains Node-compatible resolution`,()=>{
 const requireMode=label.startsWith('require');
 const f=packageFixture(requireMode?"const helper=require('./helper');exports.apply=function(ctx){helper.wire(ctx)}":'export function apply(ctx){ctx.settings.known()}',{meta,files});
 try{
  assert.equal(nodeEntry(f,requireMode?'./helper':'sample',requireMode).file,fs.realpathSync(path.join(f.pkg,want)));
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,true,JSON.stringify(report.perPlugin.sample.diagnostics));
  assert.ok(report.perPlugin.sample.files['host-entry'].includes(want));
  if(requireMode)assert.ok(report.perPlugin.sample.callSites.some(s=>s.method==='absent'&&!s.inferredReceiver));
  else assert.deepEqual(report.perPlugin.sample.entryFiles,[want]);
 }finally{f.cleanup();}
});
for(const extension of ['.cjs','.mjs','.ts'])test(`extensionless require cannot guess ${extension}`,()=>{
 const f=packageFixture("require('./helper');exports.apply=function(ctx){ctx.settings.known()}",{files:{['helper'+extension]:'exports.wire=function(ctx){ctx.settings.absent()}'}});
 try{
  assert.equal(nodeEntry(f,'./helper',true).file,null);
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,false);
  assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='source-unresolved'));
 }finally{f.cleanup();}
});
test('a relative patch entry must resolve exactly even when an extension candidate exists',()=>{
 const f=packageFixture('export function apply(ctx){ctx.settings.known()}',{files:{'actual.js':'export function apply(ctx){ctx.settings.known()}'}});
 try{
  fs.writeFileSync(path.join(f.pkg,'cordis.patch.yml'),'- name: ./actual\n');
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,false);assert.deepEqual(report.perPlugin.sample.entryFiles,[]);
 }finally{f.cleanup();}
});
test('a require edge cannot prove an unresolved ESM import of the same specifier',()=>{
 const f=packageFixture("require('./helper');import {wire} from './helper';export function apply(ctx){wire(ctx)}",{files:{'helper.js':'export function wire(ctx){ctx.settings.absent()}'}});
 try{
  const {report}=extractWithProvenance(f.nm,{catalog}),p=report.perPlugin.sample;
  assert.equal(report.scanComplete,false);
  assert.ok(p.diagnostics.some(d=>d.kind==='source-unresolved'));
  assert.ok(!p.callSites.some(s=>s.file==='helper.js'&&!s.inferredReceiver));
 }finally{f.cleanup();}
});
for(const kind of ['directory','dangling-link'])test(`CommonJS directory metadata cannot silently ignore a ${kind}`,()=>{
 const f=packageFixture("require('./helper');exports.apply=function(ctx){ctx.settings.known()}",{files:{'helper/index.js':'exports.value=1'}});
 try{
  const file=path.join(f.pkg,'helper/package.json');
  if(kind==='directory')fs.mkdirSync(file);else fs.symlinkSync(path.join(f.pkg,'missing.json'),file);
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,false);
  assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='source-unreadable'));
 }finally{f.cleanup();}
});
for(const value of [null,[],3])test(`CommonJS directory rejects non-object metadata ${JSON.stringify(value)}`,()=>{
 const f=packageFixture("require('./helper');exports.apply=function(ctx){ctx.settings.known()}",{files:{'helper/package.json':JSON.stringify(value),'helper/index.js':'exports.value=1'}});
 try{
  assert.equal(nodeEntry(f,'./helper',true).file,null);
  const {report}=extractWithProvenance(f.nm,{catalog});
  assert.equal(report.scanComplete,false);
  assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='entry-resolution-uncertain'));
 }finally{f.cleanup();}
});
test('expiry between the verified source read and require resolution retains a partial report',()=>{
 const f=packageFixture("require('./helper.js');export function apply(ctx){ctx.settings.known()}",{files:{'helper.js':'exports.value=1'}});
 const entry=fs.realpathSync(path.join(f.pkg,'index.js')),originalStat=fs.lstatSync,originalNow=Date.now;
 let entryChecks=0,now=0;
 try{
  // Keep real descriptor I/O. Advance the clock after readStaticFile verifies
  // the entry path, as if parsing used up the remaining resolution budget.
  fs.lstatSync=function(file,...args){const stat=originalStat.call(fs,file,...args);if(path.resolve(String(file))===entry&&++entryChecks===2)now=100;return stat;};
  Date.now=()=>now;
  const {report}=extractWithProvenance(f.nm,{catalog,limits:{timeMs:50}});
  assert.equal(now,100);assert.equal(report.scanComplete,false);
  assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='scan-budget-exceeded'));
  assert.deepEqual(report.perPlugin.sample.calls.settings,['known']);
 }finally{fs.lstatSync=originalStat;Date.now=originalNow;f.cleanup();}
});

for(const [label,prefix,argument] of [
  ['plain template','','`./worker.js`'],
  ['lexical const',"const file='./worker.js';",'file'],
  ['constant concatenation',"const dir='./';const file=dir+'worker.js';",'file'],
  ['constant template',"const name='worker';",'`./${name}.js`'],
  ['block const',"const file='./wrong.js';",'file'],
])test(`CommonJS ${label} paths preserve imported Context proof`,()=>{
  const body=label==='block const'?"{const file='./worker.js';const helper=require(file);helper.wire(ctx)}":`const helper=require(${argument});helper.wire(ctx);`;
  scan(prefix+`exports.apply=function(ctx){${body}}`,{files:{'worker.js':'exports.wire=function(scope){scope.settings.absent()}','wrong.js':'exports.wire=function(scope){scope.tools.register()}'}},p=>{
    assert(p.files['host-entry'].includes('worker.js'));
    assert.deepEqual(p.calls.settings,['absent']);assert.equal(p.callSites.find(s=>s.service==='settings').inferredReceiver,false);assert.deepEqual(p.diagnostics,[]);
  });
});
for(const [label,source] of [
 ['unknown dynamic import','export function apply(){import(`./${unknown}.js`)}'],
 ['mutable path',"let file='./worker.js';file=external();exports.apply=function(ctx){require(file).wire(ctx)}"],
 ['shadowed path',"const file='./worker.js';exports.apply=function(ctx,file){require(file).wire(ctx)}"],
 ['TDZ alias',"const file=other;const other='./worker.js';exports.apply=function(ctx){require(file).wire(ctx)}"],
 ['changed const',"const file='./worker.js';file=external();exports.apply=function(ctx){require(file).wire(ctx)}"],
 ['computed object path',"const object={file:'./worker.js'};exports.apply=function(ctx){require(object.file).wire(ctx)}"],
 ['cyclic path',"const a=b,b=a;exports.apply=function(ctx){require(a).wire(ctx)}"],
])test(`unproved ${label} paths explicitly limit coverage`,()=>{
  scan(source,{files:{'worker.js':'exports.wire=function(ctx){ctx.settings.absent()}'}},p=>{
    assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));assert.equal(p.callSites.some(s=>s.service==='settings'&&!s.inferredReceiver),false);
  });
});
test('constant dynamic import adds its exact source without executing it',()=>{
 scan("const name='./worker.js';import(name);export function apply(){}",{files:{'worker.js':'throw Error("NEVER_IMPORT");ctx.settings.absent()'}},p=>{assert(p.files['host-entry'].includes('worker.js'));assert(!p.diagnostics.some(d=>d.kind==='module-path-uncertain'));});
});
test('module path string expansion remains bounded',()=>{
 scan('const path='+JSON.stringify('./'+'x'.repeat(8192))+ ';exports.apply=ctx=>require(path).wire(ctx)',{},p=>assert(p.diagnostics.some(d=>d.kind==='module-path-budget')));
});
test('a shadowed require cannot seed a package source graph',()=>{
 scan("exports.apply=function(ctx,require){require(`./worker.js`)}",{files:{'worker.js':'ctx.settings.absent()'}},p=>{assert(!p.files['host-entry'].includes('worker.js'));assert.equal(p.callSites.some(s=>s.service==='settings'),false);});
});
test('constant module aliases have a finite proof depth',()=>{
 const declarations="const p0='./worker.js';"+Array.from({length:40},(_,i)=>`const p${i+1}=p${i};`).join('');
 scan(declarations+'exports.apply=ctx=>require(p40).wire(ctx)',{files:{'worker.js':'exports.wire=ctx=>ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-budget'));assert(!p.files['host-entry'].includes('worker.js'));});
});
test('a direct eval prevents module binding proof without executing the eval',()=>{
 scan("const path='./worker.js';eval('throw Error(\"NEVER_EXECUTE\")');exports.apply=ctx=>require(path).wire(ctx)",{files:{'worker.js':'exports.wire=ctx=>ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));});
});
test('a closure replacing implicit require revokes module proof in sibling consumers',()=>{
 scan("const file='./worker.js';function replace(){require=()=>({wire(){}})}replace();exports.apply=ctx=>require(file).wire(ctx)",{files:{'worker.js':'exports.wire=ctx=>ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));});
});
test('named class expressions shadow outer module path constants',()=>{
 scan("const p='./worker.js';const C=class p{static load(){return import(p)}};exports.apply=()=>C.load()",{files:{'worker.js':'ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));});
});
test('static block var declarations cannot shadow the module require',()=>{
 scan("class C{static{var require=()=>{}}}exports.apply=ctx=>require('./worker.js').wire(ctx)",{files:{'worker.js':'exports.wire=ctx=>ctx.settings.absent()'}},p=>{assert(p.files['host-entry'].includes('worker.js'));assert(p.callSites.some(s=>s.service==='settings'&&!s.inferredReceiver));});
});
for(const [label,source] of [
 ['parameter property',"const file='./worker.js';export class C{constructor(private file:string){require(file)}}"],
 ['enum binding',"const file='./worker.js';{enum file{value}require(file)}"],
 ['namespace binding',"const file='./worker.js';{namespace file{export const value=1}require(file)}"],
])test(`TypeScript ${label} cannot borrow an outer constant module path`,()=>{
 scan('',{files:{'entry.ts':source,'cordis.patch.yml':'- name: ./entry.ts\n','worker.js':'ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));});
});
test('a closure eval cannot leave implicit require proof in sibling consumers',()=>{
 scan("const file='./worker.js';function replace(){eval('require=()=>({wire(){}})')}replace();exports.apply=ctx=>require(file).wire(ctx)",{files:{'worker.js':'exports.wire=ctx=>ctx.settings.absent()'}},p=>{assert(p.diagnostics.some(d=>d.kind==='module-path-uncertain'));assert(!p.files['host-entry'].includes('worker.js'));});
});
