import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

function withFakeDsh(script,check){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-runner-test-'));
  try{
    const bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'dsh'),'#!/usr/bin/env node\n'+script,{mode:0o755});
    // The old implementation invokes global pkill even when installation fails.
    // Intercept it before running either version; never touch user processes.
    fs.writeFileSync(path.join(bin,'pkill'),'#!/bin/sh\necho "$@" >> "$DSH_HOME/pkill-calls"\n',{mode:0o755});
    fs.writeFileSync(path.join(bin,'pgrep'),'#!/bin/sh\nexit 1\n',{mode:0o755});
    const home=path.join(dir,'dsh');fs.mkdirSync(path.join(home,'profiles','plugincheck'),{recursive:true});fs.writeFileSync(path.join(home,'profiles','plugincheck','sentinel'),'untouched');
    const scriptPath=path.join(dir,'check.sh');
    fs.writeFileSync(scriptPath,fs.readFileSync('dsh-plugin-compat-check.sh','utf8').replace('WORKDIR=/tmp/dsh-plugin-compat-check',`WORKDIR=${JSON.stringify(path.join(dir,'work'))}`));
    check({dir,home,scriptPath,env:{...process.env,PATH:bin+path.delimiter+process.env.PATH,DSH_HOME:home,DSC_KERNEL:path.resolve('.')}});
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('installation/network failure is a tool error and stdout is a single JSON document',()=>{
  withFakeDsh('const a=process.argv.slice(2);if(a.includes("--version")){console.log("0.2.0");}else if(a.includes("--dump-config")){process.exit(0);}else{console.error("network unavailable");process.exit(1);}',({home,env,scriptPath})=>{
    const r=spawnSync('bash',[scriptPath,'file:/fake-plugin','--json','--timeout','1'],{env,encoding:'utf8',timeout:5000});
    assert.equal(r.status,3);assert.equal(JSON.parse(r.stdout).status,'tool-error');
    assert.equal(fs.readFileSync(path.join(home,'profiles/plugincheck/sentinel'),'utf8'),'untouched');
    assert.deepEqual(fs.readdirSync(path.join(home,'profiles')),['plugincheck']);
  });
});
test('probe clone preserves relative local dependency destinations',()=>{
 const fake=`const fs=require('node:fs'),path=require('node:path');
 (async()=>{const a=process.argv.slice(2),name=a[a.indexOf('--profile')+1],profile=path.join(process.env.DSH_HOME,'profiles',name);
 if(a.includes('--version')){console.log('0.2.0');return;}
 if(a.includes('plugin')){
  if(a.includes('install')){const pkg=JSON.parse(fs.readFileSync(path.join(profile,'package.json')));for(const field of ['dependencies','devDependencies','optionalDependencies'])for(const spec of Object.values(pkg[field]||{})){const target=path.resolve(profile,spec.replace(/^(file:|link:)/,''));if(!fs.existsSync(path.join(target,'package.json')))throw new Error('local dependency destination lost: '+target);}}
  return;
 }
 global.setTimeout=fn=>{queueMicrotask(fn);return {unref(){}}};
 const probe=await import('file://'+path.join(process.env.DSC_OUT_DIR,'probe','index.mjs'));
 probe.apply({get:n=>n==='loader'?{entries:()=>[]}:undefined,effect(){}});setInterval(()=>{},1000);
 })().catch(e=>{console.error(e);process.exit(1)});`;
 withFakeDsh(fake,({home,env})=>{
  const source=path.join(home,'profiles','source'),neighbor=path.join(home,'profiles','neighbor');
  fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});fs.mkdirSync(neighbor);
  fs.writeFileSync(path.join(neighbor,'package.json'),'{}');
  const original={dependencies:{sample:'file:../neighbor'},devDependencies:{dev:'link:../neighbor'},optionalDependencies:{optional:'file:../neighbor'},dsh:{profile:{bundles:[]}}};
  fs.writeFileSync(path.join(source,'package.json'),JSON.stringify(original));
  const code=`import {probeProfile} from ${JSON.stringify(new URL('../lib/probe-runner.mjs',import.meta.url).href)};console.log(JSON.stringify(await probeProfile(${JSON.stringify(path.join(source,'node_modules'))},{timeoutSec:5,services:['tools']})));`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
  assert.equal(out.error,null,JSON.stringify(out));assert.ok(out.surface);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source,'package.json'))),original);
 });
});
test('arrival packs an owned source copy with all staging inputs',()=>{
 withFakeDsh(`const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);if(a.includes('--dump-config')){fs.mkdirSync(path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]),{recursive:true});}else{console.error('controlled stop before host');process.exit(1);}`,({dir,home,env})=>{
  fs.writeFileSync(path.join(dir,'bin','npm'),`#!/usr/bin/env node
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2),source=a[1],dest=a[a.indexOf('--pack-destination')+1];
fs.writeFileSync(path.join(process.env.DSH_HOME,'pack-record.json'),JSON.stringify({source,dest,inputs:['lib/verdict.mjs','rules/dsh-api-catalog.json','skill/SKILL.md','LICENSE'].map(f=>[f,fs.existsSync(path.join(source,'..',f))])}));fs.writeFileSync(path.join(dest,'candidate.tgz'),'fake');
`,{mode:0o755});
  const r=spawnSync(process.execPath,['tools/client-arrival.mjs','--json'],{env:{...env,DSC_CHROME:process.execPath},encoding:'utf8',timeout:15000});
  assert.equal(r.status,3,r.stderr+r.stdout);
  const record=JSON.parse(fs.readFileSync(path.join(home,'pack-record.json')));
  assert.ok(record.source.startsWith(record.dest+path.sep),JSON.stringify(record));
  assert.ok(record.inputs.every(([,exists])=>exists),JSON.stringify(record));
  assert.equal(fs.existsSync(record.dest),false);
 });
});
test('arrival --break never labels an unrelated startup failure as expected',()=>{
 withFakeDsh(`const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);if(a.includes('--dump-config'))fs.mkdirSync(path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]),{recursive:true});else if(!a.includes('plugin')){console.error('startup failed: controlled unrelated failure');process.exit(1);}`,({env})=>{
  const r=spawnSync(process.execPath,['tools/client-arrival.mjs','--no-plugin','--break','--timeout','1000'],{env:{...env,DSC_CHROME:process.execPath},encoding:'utf8',timeout:10000});
  assert.equal(r.status,1,r.stdout+r.stderr);
  assert.match(r.stdout,/非预期/);
  assert.doesNotMatch(r.stdout,/正是负向对照期望|不是工具出错/);
 });
});
test('arrival text includes failed compatibility report details despite complete delivery',async()=>{
 const {compatibilityText}=await import('../tools/arrival-text.mjs');
 assert.match(compatibilityText({ok:false,error:'controlled backend failure',toolVersion:'0.1.1'}),/controlled backend failure/);
 assert.match(compatibilityText({ok:false,error:null}),/无法读取|失败/);
 assert.equal(compatibilityText(null),'');
 assert.match(compatibilityText({ok:true,error:null,toolVersion:'0.1.1'}),/0\.1\.1/);
});
test('only an explicit DSH compatibility rejection is classified incompatible',()=>{
  withFakeDsh('const a=process.argv.slice(2);if(a.includes("--version")){console.log("0.2.0");}else if(a.includes("--dump-config")){process.exit(0);}else{console.error("Plugin sample@1 is incompatible with dsh 0.2.0: peerDependencies mismatch");process.exit(1);}',({env,scriptPath})=>{
    const r=spawnSync('bash',[scriptPath,'file:/fake-plugin','--json','--timeout','1'],{env,encoding:'utf8',timeout:5000});
    assert.equal(r.status,2);assert.equal(JSON.parse(r.stdout).status,'gate-rejected');
  });
});
test('unrelated caffeinate process is not targeted by cleanup',()=>{
  withFakeDsh('process.exit(1)',({dir,env,scriptPath})=>{
    fs.writeFileSync(path.join(dir,'bin','pkill'),'#!/bin/sh\necho "$@" >> "$DSH_HOME/pkill-calls"\n',{mode:0o755});
    spawnSync('bash',[scriptPath,'file:/fake-plugin','--json','--timeout','1'],{env,encoding:'utf8',timeout:5000});
    assert.equal(fs.existsSync(path.join(env.DSH_HOME,'pkill-calls')),false);
  });
});
test('owned runner passes inventory to the actual probe and reports mapped loader failure',()=>{
 const fake=`const fs=require('node:fs'),path=require('node:path');
 (async()=>{const a=process.argv.slice(2),name=a[a.indexOf('--profile')+1],profile=path.join(process.env.DSH_HOME,'profiles',name);
 if(a.includes('--version')){console.log('0.2.0');return;}
 if(a.includes('--dump-config')){if(fs.existsSync(profile))throw new Error('profile directory already exists; choose an unused profile name');fs.mkdirSync(profile,{recursive:true});return;}
 if(a.includes('plugin')){
  if(!a.some(v=>v.includes('/probe'))){const pkg=path.join(profile,'node_modules','sample');fs.mkdirSync(pkg,{recursive:true});fs.writeFileSync(path.join(pkg,'package.json'),JSON.stringify({name:'sample',version:'1',type:'module',main:'index.js',dsh:{bundle:{}}}));fs.writeFileSync(path.join(pkg,'index.js'),'export function apply(){}');}
  return;
 }
 global.setTimeout=fn=>{queueMicrotask(fn);return {unref(){}}};
 const probe=await import('file://'+path.join(process.env.DSC_OUT_DIR,'probe','index.mjs'));
 probe.apply({get:n=>n==='loader'?{entries:()=>[{id:'sample',options:{name:'sample'},fiber:{state:3}}]}:undefined,effect(){}});
 setInterval(()=>{},1000);
 })().catch(e=>{console.error(e);process.exit(1)});`;
 withFakeDsh(fake,({env,scriptPath})=>{
  const r=spawnSync('bash',[scriptPath,'file:/fake-plugin','--json','--timeout','5'],{env,encoding:'utf8',timeout:15000});
  const out=JSON.parse(r.stdout);assert.equal(r.status,2,JSON.stringify(out));
  assert.ok(out.plugins.sample.findings.some(f=>f.category==='host-entry-inactive'&&f.impactBasis==='measured'));
 });
});

test('owned runners reject failed, empty or invalid version queries without inheriting a stale version',()=>{
 const fake=`const fs=require('node:fs'),path=require('node:path');
 (async()=>{const a=process.argv.slice(2),name=a[a.indexOf('--profile')+1],profile=path.join(process.env.DSH_HOME,'profiles',name);
 if(a.includes('--version')){fs.writeFileSync(process.env.DSC_VERSION_TRACE,JSON.stringify({inherited:Object.hasOwn(process.env,'DSC_DSH_VERSION')}));if(process.env.DSC_VERSION_MODE==='failed')process.exit(7);if(process.env.DSC_VERSION_MODE==='invalid')console.log('not-a-dsh-version');return;}
 if(a.includes('--dump-config')){fs.mkdirSync(profile,{recursive:true});return;}
 if(a.includes('plugin'))return;
 global.setTimeout=fn=>{queueMicrotask(fn);return {unref(){}}};
 const probe=await import('file://'+path.join(process.env.DSC_OUT_DIR,'probe','index.mjs'));
 probe.apply({get:n=>n==='loader'?{entries:()=>[]}:undefined,effect(){}});setInterval(()=>{},1000);
 })().catch(e=>{console.error(e);process.exit(1)});`;
 withFakeDsh(fake,({dir,home,env})=>{
  const source=path.join(home,'profiles','source');fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});fs.writeFileSync(path.join(source,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));
  for(const mode of ['failed','empty','invalid'])for(const api of ['probeProfile','installAndProbe']){
   const expr=api==='probeProfile'?`probeProfile(${JSON.stringify(path.join(source,'node_modules'))},{timeoutSec:5})`:`installAndProbe('file:/fake-plugin',{timeoutSec:5,servicesFor:()=>({services:[],manifests:[]})})`;
   const code=`import {probeProfile,installAndProbe} from ${JSON.stringify(new URL('../lib/probe-runner.mjs',import.meta.url).href)};console.log(JSON.stringify(await ${expr}));`;
   const trace=path.join(dir,'version-trace.json');
   const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...env,DSC_VERSION_MODE:mode,DSC_VERSION_TRACE:trace,DSC_DSH_VERSION:'inherited-not-observed'},encoding:'utf8',timeout:15000});
   assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout);
   assert.match(out.error||'',/DSH version/i,JSON.stringify({api,mode,out}));
   if(api==='probeProfile'){assert.equal(out.surface,null);assert.equal(out.tempProfileRemoved,true);}
   else{assert.equal(out.status,'tool-error');assert.equal(out.exitCode,3);assert.equal(out.cleanup.tempProfileRemoved,true);}
   assert.equal(JSON.parse(fs.readFileSync(trace)).inherited,false);
  }
 });
});
