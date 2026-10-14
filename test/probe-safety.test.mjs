import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {serviceShape,normalizeObservation} from '../lib/observation.mjs';
import {privateDiagnostic} from '../plugin/lib/host-resources.js';
import {baselineTransaction} from '../lib/state-store.mjs';
import {snapshotForBaseline} from '../lib/baseline.mjs';
test('shape collection never runs accessors or serializes secrets',()=>{
 let reads=0;const service={secret:'PRIVATE',method(){},get danger(){reads++;throw new Error('PRIVATE');}};
 const shape=serviceShape(service);assert.equal(reads,0);assert.ok(!JSON.stringify(shape).includes('PRIVATE'));
 assert.equal(shape.complete,false,'Accessor function shape is unobservable without invoking it');
});
test('private diagnostic refuses symlink output and shared directories',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-private-test-'));
 try{const sentinel=path.join(dir,'sentinel');fs.writeFileSync(sentinel,'untouched');
 const output=path.join(dir,'out.json');fs.symlinkSync(sentinel,output);
 assert.equal(privateDiagnostic(output,{secret:'bad'}),false);assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
 fs.chmodSync(dir,0o755);assert.equal(privateDiagnostic(path.join(dir,'other.json'),{}),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('busy baseline lock leaves stored report untouched',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-lock-test-')),file=path.join(dir,'baseline.json');
 try{fs.writeFileSync(file,'old');fs.writeFileSync(file+'.lock','busy');
 const out=baselineTransaction(file,snapshotForBaseline({plugins:{}},null));
 assert.equal(out.wrote,false);assert.match(out.writeError,/另一个进程/);assert.equal(fs.readFileSync(file,'utf8'),'old');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('a bound stale or wrong-version observation is unusable',()=>{
 const surface={observationVersion:1,profileId:'/profile/node_modules',dshVersion:'0.2',probedAt:'2000-01-01',root:{jobs:{present:false}}};
 assert.equal(normalizeObservation(surface,{profileId:surface.profileId,maxAgeMs:1000}).usable,false);
 assert.equal(normalizeObservation(surface,{dshVersion:'0.3'}).usable,false);
});
import {sampleServices} from '../lib/observation.mjs';
import {buildVerdicts} from '../lib/verdict.mjs';
import {extractWithProvenance} from '../lib/extract.mjs';
import {packageFixture} from './fixture-utils.mjs';
test('an unrelated getter does not conceal a missing method or invent a missing inherited method',()=>{
 const fixture=packageFixture('export function apply(ctx){ctx.settings.absent();ctx.settings.toString();}');let reads=0;
 try{const service={known(){},get data(){reads++;return 'PRIVATE';}};
 const observed=sampleServices({get:()=>service},['settings'],{profileId:fixture.nm,dshVersion:'0.2.0'});
 const report=extractWithProvenance(fixture.nm).report;
 const p=buildVerdicts({report,hostSurface:observed,dshVersion:'0.2.0',observationTarget:{profileId:fixture.nm}}).plugins.sample;
 assert.equal(reads,0);assert.ok(p.findings.some(f=>f.method==='absent'&&f.certainty==='certain'));
 assert.ok(!p.findings.some(f=>f.method==='toString'));
 }finally{fixture.cleanup();}
});
test('an accessor target is unknown, and null does not prove a missing hard service',()=>{
 const fixture=packageFixture('export function apply(ctx){ctx.settings.factory();ctx.settings.known();}');let reads=0;
 try{const service={known(){},get factory(){reads++;return ()=>{};}};
 const observed=sampleServices({get:()=>service},['settings'],{profileId:fixture.nm,dshVersion:'0.2.0'});
 const p=buildVerdicts({report:extractWithProvenance(fixture.nm).report,hostSurface:observed,dshVersion:'0.2.0'}).plugins.sample;
 assert.equal(reads,0);assert.ok(!p.findings.some(f=>f.method==='factory'));assert.equal(p.coverage.status,'limited');
 const nullable=sampleServices({get:()=>null},['settings']);assert.notEqual(nullable.root.settings.status,'absent');
 const boxed=serviceShape(0);assert.equal(boxed.methods.toFixed,'function');
 }finally{fixture.cleanup();}
});
test('optional calls do not hide observed non-functions, while typeof guards do',()=>{
 const fixture=packageFixture('export function apply(ctx){ctx.settings.changed?.();if(typeof ctx.settings.safe === "function")ctx.settings.safe?.();}');
 try{const observed=sampleServices({get:()=>({changed:1,safe:1})},['settings'],{profileId:fixture.nm,dshVersion:'0.2.0'});
 const p=buildVerdicts({report:extractWithProvenance(fixture.nm).report,hostSurface:observed,dshVersion:'0.2.0'}).plugins.sample;
 assert.ok(p.findings.some(f=>f.method==='changed'));assert.ok(!p.findings.some(f=>f.method==='safe'));
 }finally{fixture.cleanup();}
});
