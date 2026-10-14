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
 if(a.includes('--dump-config'))return;
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
