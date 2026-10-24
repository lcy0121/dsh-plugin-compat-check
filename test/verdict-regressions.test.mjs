import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildVerdicts } from '../lib/verdict.mjs';
import { extractWithProvenance } from '../lib/extract.mjs';
import { packageFixture, writePackageFixture, fixtureCatalog as catalog } from './fixture-utils.mjs';

function result(source, surface, opts={}) {
  const f=packageFixture(source,opts);
  try {
    const {report}=extractWithProvenance(f.nm,{catalog});
    return buildVerdicts({report,hostSurface:surface,catalog,rules:{services:{}},dshVersion:'0.2.0',...opts.verdict}).plugins.sample;
  }finally{f.cleanup();}
}
const present={root:{settings:{present:true,methods:{known:{}}}}};
test('unobserved service does not become a certain fatal dependency',()=>{
  const p=result('export const inject=["missingSvc"];',{root:{}});
  assert.ok(!p.findings.some(f=>f.certainty==='certain'||f.severity==='fatal'));
  assert.equal(p.coverage.status,'limited');
});
test('a hard inject cannot be revoked by an optional read',()=>{
  const p=result('export const inject=["missingSvc"]; export function apply(ctx){ctx.get("missingSvc",false);}',{root:{missingSvc:{present:false}}});
  assert.equal(p.verdict,'broken');assert.ok(p.findings.some(f=>f.category==='host-service-missing'));
});
test('client evidence cannot hide a missing host hard dependency',()=>{
  const p=result('export const inject=["missingSvc"];export function apply(ctx){ctx.missingSvc.absent();}',{root:{missingSvc:{present:false}}},{
    meta:{dsh:{bundle:{patch:'cordis.patch.yml'},client:{platform:'web'}},exports:{'.':'./index.js','./client':'./client.js'}},
    files:{'client.js':'export function apply(ctx){ctx.missingSvc.absent();}'},
  });
  assert.equal(p.verdict,'broken');
});
test('a builtin method name on a proven service is still checked',()=>{
  const p=result('export function apply(ctx){ctx.settings.set("x");}',present);
  assert.ok(p.findings.some(f=>f.method==='set'));
});
test('guarded and unguarded calls of one missing method remain reportable',()=>{
  const p=result('export function apply(ctx){ctx.settings.absent?.();ctx.settings.absent();}',present);
  assert.ok(p.findings.some(f=>f.method==='absent'));
});
test('suspected evidence cannot produce a certain measured declaration conflict',()=>{
  const p=result('export function apply(ctx){ctx.settings.absent();}',null,{meta:{dsh:{bundle:{patch:'cordis.patch.yml'},compatibility:{'0.2.0':'compatible'}}}});
  assert.ok(!p.findings.some(f=>f.category==='declaration-mismatch'&&f.certainty==='certain'));
});
test('DSH peer ranges include prereleases and workspace peers bind current runtime',()=>{
  const p=result('export function apply(ctx){ctx.settings.absent();}',present,{meta:{peerDependencies:{'@deepseek-ai/dsh':'^0.2.0','@deepseek-ai/dsh-tools':'workspace:^'}},verdict:{dshVersion:'0.2.0-rc.2'}});
  assert.ok(p.findings.some(f=>f.category==='declaration-mismatch'));
});
test('unreadable or truncated observations cannot prove absence',()=>{
  const p=result('export function apply(ctx){ctx.settings.absent();}',{root:{settings:{present:true,methods:{},truncated:true}}});
  assert.ok(!p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'));
  const q=result('export const inject=["missingSvc"];',{root:{missingSvc:{present:false,error:'access denied'}}});
  assert.ok(!q.findings.some(f=>f.severity==='fatal'));
});
test('a bound observation from another profile/version cannot upgrade certainty',()=>{
  const p=result('export function apply(ctx){ctx.settings.absent();}',{
    observationVersion:1,profileId:'/different/profile',dshVersion:'0.1.0',root:present.root,
  },{verdict:{observationTarget:{profileId:'/target/profile',dshVersion:'0.2.0'}}});
  assert.ok(!p.findings.some(f=>f.certainty==='certain'));
});
test('actual failed loader state is included in the report',()=>{
  const p=result('export function apply(){}',null,{verdict:{entryStates:[{packageName:'sample',id:'sample',state:'FAILED',disabled:false,failureReason:'fixture failure'}]}});
  assert.equal(p.verdict,'broken');assert.ok(p.findings.some(f=>f.category==='host-entry-inactive'&&f.impactBasis==='measured'));
});
test('disabled and loading entries do not become fatal failures',()=>{
  for(const row of [{packageName:'sample',state:'FAILED',disabled:true},{packageName:'sample',state:'LOADING',disabled:false}]){
    const p=result('export function apply(){}',null,{verdict:{entryStates:[row]}});
    assert.ok(!p.findings.some(f=>f.severity==='fatal'));
  }
});
test('a provide declaration cannot hide a complete observed missing method',()=>{
 const p=result('export const provide=["settings"];export function apply(ctx){ctx.settings.absent();ctx.tools.register();}',{root:{settings:{present:true,methods:{known:'function'}},tools:{present:true,methods:{register:'function'}}}});
 assert.ok(p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'));
});
test('an unobserved external provider always limits consumer coverage',()=>{
 const f=packageFixture('export const inject=["settings"];');
 try{const {report}=extractWithProvenance(f.nm,{catalog});
 report.perPlugin.provider={version:'1',services:['settings'],providedServices:['settings'],dependencies:[],callSites:[]};
 const p=buildVerdicts({report,hostSurface:{root:{}},catalog}).plugins.sample;
 assert.equal(p.coverage.status,'limited');assert.ok(p.coverage.limitations.some(s=>s.includes('settings')));
 }finally{f.cleanup();}
});
for (const provider of ['self', 'external']) {
 for (const [state, info, category] of [
  ['absent', {present:false}, 'host-service-missing'],
  ['missing-method', {present:true,methods:{known:'function'}}, 'host-method-missing'],
  ['unobserved', null, null],
  ['unreadable', {status:'unreadable',error:'unavailable'}, null],
  ['incomplete', {present:true,methods:{},truncated:true}, null],
 ]) test(`${provider} provide declaration cannot override ${state} runtime evidence`,()=>{
  const f=packageFixture(`export const inject=['settings'];${provider==='self'?"export const provide=['settings'];":''}export function apply(ctx){ctx.settings.absent()}`);
  try {
   if(provider==='external')writePackageFixture(path.join(f.nm,'provider'),{name:'provider',version:'1.0.0',main:'index.js',dsh:{}},"export const provide=['settings'];export function apply(){}");
   const {report}=extractWithProvenance(f.nm,{catalog});
   const p=buildVerdicts({report,catalog,dshVersion:'0.2.1-rc.2',hostSurface:{observationVersion:1,profileId:f.nm,dshVersion:'0.2.1-rc.2',probedAt:new Date().toISOString(),root:info?{settings:info}:{}},observationTarget:{profileId:f.nm,maxAgeMs:86400000}}).plugins.sample;
   if(category){
    const finding=p.findings.find(x=>x.category===category);
    assert.ok(finding,JSON.stringify(p));assert.equal(finding.certainty,'certain');
    if(state==='absent'){assert.equal(finding.severity,'fatal');assert.equal(p.verdict,'broken');}
   }else{
    assert.ok(!p.findings.some(x=>x.category==='host-service-missing'||x.category==='host-method-missing'));
    assert.equal(p.coverage.status,'limited');
   }
  }finally{f.cleanup();}
 });
}
test('ordinary function ctx parameters do not produce certain host failures',()=>{
 const p=result('function harmless(ctx){ctx.settings.absent()} export function apply(){harmless({settings:{absent(){}}});}',present);
 assert.ok(!p.findings.some(f=>f.certainty==='certain'));assert.equal(p.coverage.status,'limited');
});
test('an exported entry apply arrow receives a proven Context regardless of parameter name',()=>{
 const p=result('export const apply=(host)=>host.settings.absent();',present);
 assert.ok(p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'));
});
test('an imported utility named apply is not automatically a proven entry Context',()=>{
 const p=result("import './utility.js';export function apply(ctx){ctx.settings.known();}",present,{files:{'utility.js':'export function apply(ctx){ctx.settings.absent();}'}});
 assert.ok(!p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'));assert.equal(p.coverage.status,'limited');
});
test('an alias exported as inject retains the real top-level dependency contract',()=>{
 const p=result('const DEPS=["missingSvc"];export {DEPS as inject};export function apply(){}',{root:{missingSvc:{present:false}}});
 assert.equal(p.verdict,'broken');
});
test('a similarly named export injectScope does not become a top-level hard inject',()=>{
 const p=result('export const injectScope=["missingSvc"];export function apply(ctx){ctx.settings.known();}',{root:{missingSvc:{present:false},settings:{present:true,methods:{known:'function'}}}});
 assert.ok(!p.findings.some(f=>f.severity==='fatal'));assert.equal(p.coverage.status,'limited');
});
test('an unsupported official peer range remains visible even when APIs exist',()=>{
 const p=result('export function apply(ctx){ctx.settings.known();}',present,{meta:{peerDependencies:{'@deepseek-ai/dsh':'^99.0.0'}}});
 assert.ok(p.findings.some(f=>f.category==='declared-incompatible'&&f.certainty==='certain'&&f.impactBasis==='inferred'));
 assert.ok(!p.findings.some(f=>f.severity==='fatal'));
});

test('a helper with a returning alternate cannot suppress a missing method',()=>{
 for(const helper of [
  `function has(s){if(typeof s.absent==='function')return true;else return true;return false;}`,
  `function has(s){if(typeof s.absent==='function')return true;else {return true;}return false;}`,
 ]){
  const p=result(helper+'export function apply(ctx){if(has(ctx.settings))ctx.settings.absent();}',present);
  assert.ok(p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'),helper);
 }
});

test('a proved boolean capability helper still protects the missing method',()=>{
 for(const helper of [
  `function has(s){return typeof s.absent==='function';}`,
  `function has(s){if(typeof s.absent==='function')return true;console.log('unavailable');return false;}`,
 ]){
  const p=result(helper+'export function apply(ctx){if(has(ctx.settings))ctx.settings.absent();}',present);
  assert.equal(p.findings.some(f=>f.method==='absent'),false,helper);
 }
});

test('entry CommonJS exports preserve hard injection without promoting ordinary descriptors',()=>{
 const surface={root:{...present.root,missingSvc:{present:false}}};
 for(const source of [
  `exports.inject=['missingSvc'];exports.apply=function(ctx){ctx.settings.known()}`,
  `module.exports.inject=['missingSvc'];module.exports.apply=function(ctx){ctx.settings.known()}`,
  `exports['inject']=['missingSvc'];exports.apply=function(ctx){ctx.settings.known()}`,
  `module.exports={inject:['missingSvc'],apply(ctx){ctx.settings.known()}}`,
  `const deps=['missingSvc'];const plugin={inject:deps,apply(ctx){ctx.settings.known()}};module.exports=plugin;`,
 ]){
  const p=result(source,surface);
  assert.equal(p.verdict,'broken',source);
  assert.ok(p.findings.some(f=>f.category==='host-service-missing'&&f.certainty==='certain'),source);
 }
 for(const source of [
  `const descriptor={inject:['missingSvc']};export function apply(ctx){ctx.settings.known()}`,
  `function make(exports){exports.inject=['missingSvc']}make({});export function apply(ctx){ctx.settings.known()}`,
  `exports.inject=['missingSvc'];module.exports={apply(ctx){ctx.settings.known()}}`,
  `const plugin={inject:['missingSvc']};module.exports={...plugin,apply(ctx){ctx.settings.known()}}`,
 ]){
  const p=result(source,surface);
  assert.equal(p.findings.some(f=>f.severity==='fatal'),false,source);
 }
});

test('non-entry CommonJS metadata cannot create a hard dependency for its importer',()=>{
 const p=result(`require('./helper.cjs');export function apply(ctx){ctx.settings.known()}`,{root:{...present.root,missingSvc:{present:false}}},{files:{'helper.cjs':`exports.inject=['missingSvc'];exports.apply=function(){};`}});
 assert.ok(!p.findings.some(f=>f.severity==='fatal'));
 assert.equal(p.coverage.status,'limited');
});

test('dynamic entry injection cannot silently count as complete coverage',()=>{
 for(const source of [
  `exports.inject=getDependencies();exports.apply=function(ctx){ctx.settings.known()}`,
  `const extra=getDependencies();export const inject={...extra};export function apply(ctx){ctx.settings.known()}`,
  `export const inject=[unknownService];export function apply(ctx){ctx.settings.known()}`,
  `exports.inject=[...getDependencies()];exports.apply=function(ctx){ctx.settings.known()}`,
 ]){
  const f=packageFixture(source);
  try{
   const {report}=extractWithProvenance(f.nm,{catalog});
   assert.equal(report.scanComplete,false,source);
   assert.ok(report.perPlugin.sample.diagnostics.some(d=>d.kind==='inject-unresolved'),source);
   const p=buildVerdicts({report,hostSurface:present,catalog}).plugins.sample;
   assert.equal(p.coverage.status,'limited',source);
  }finally{f.cleanup();}
 }
});

test('mutated or escaped injection metadata retracts hard dependency proof',()=>{
 for(const source of [
  `const deps=['missingSvc'];exports.inject=deps;deps.pop();exports.apply=function(){}`,
  `exports.inject=['missingSvc'];exports.inject.length=0;exports.apply=function(){}`,
  `const map={missingSvc:null};exports.inject=map;delete map.missingSvc;exports.apply=function(){}`,
  `const map={};exports.inject=map;map.missingSvc=null;exports.apply=function(){}`,
  `const map={missingSvc:null};exports.inject=map;mutate(map);exports.apply=function(){}`,
  `const deps=['missingSvc'];exports.inject=deps;mutate(deps);exports.apply=function(){}`,
  `export const inject=['missingSvc'];inject.pop();export function apply(){}`,
  `export const inject={missingSvc:null};delete inject.missingSvc;export function apply(){}`,
  `const deps=['missingSvc'];deps.pop();exports.inject=deps;exports.apply=function(){}`,
  `const deps=['missingSvc'];deps.length=0;exports.inject=deps;exports.apply=function(){}`,
 ]){
  const p=result(source,{root:{missingSvc:{present:false}}});
  assert.ok(!p.findings.some(f=>f.severity==='fatal'),source);
  assert.equal(p.coverage.status,'limited',source);
 }
});

test('service map keys deleted before export are not injected',()=>{
 const p=result(`const map={missingSvc:null};delete map.missingSvc;exports.inject=map;exports.apply=function(ctx){ctx.settings.known()}`,{root:{...present.root,missingSvc:{present:false}}});
 assert.ok(!p.findings.some(f=>f.service==='missingSvc'));
});

test('entry inject objects use Cordis service-map keys rather than required/optional lists',()=>{
 for(const source of [
  `export const inject={missingSvc:null};export function apply(){}`,
  `exports.inject={missingSvc:null};exports.apply=function(){};`,
 ]){
  const p=result(source,{root:{missingSvc:{present:false}}});
  assert.equal(p.verdict,'broken',source);
 }
 const p=result(`export const inject={required:['missingSvc'],optional:['other']};export function apply(){}`,{root:{required:{present:false},optional:{present:false},missingSvc:{present:false}}});
 assert.ok(p.findings.some(f=>f.service==='required'&&f.severity==='fatal'));
 assert.ok(!p.findings.some(f=>f.service==='missingSvc'));
});
