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
  if(a.includes('install') && fs.existsSync(path.join(profile,'pnpm-lock.yaml'))){const lock=fs.readFileSync(path.join(profile,'pnpm-lock.yaml'),'utf8');if(lock.includes('directory: ../neighbor'))throw new Error('local lock directory was not relocated');if(!lock.includes('remote@1.2.3'))throw new Error('remote pin lost');}
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
  const lock=`lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      sample:\n        specifier: file:../neighbor\n        version: file:../neighbor\npackages:\n  sample@file:../neighbor:\n    resolution: {directory: ../neighbor, type: directory}\n  remote@1.2.3:\n    resolution: {integrity: pinned-remote}\nsnapshots:\n  sample@file:../neighbor: {}\n  remote@1.2.3: {}\n`;
  fs.writeFileSync(path.join(source,'pnpm-lock.yaml'),lock);
  const code=`import {probeProfile} from ${JSON.stringify(new URL('../lib/probe-runner.mjs',import.meta.url).href)};console.log(JSON.stringify(await probeProfile(${JSON.stringify(path.join(source,'node_modules'))},{timeoutSec:5,services:['tools']})));`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
  assert.equal(out.error,null,JSON.stringify(out));assert.ok(out.surface);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(source,'package.json'))),original);
  assert.equal(fs.readFileSync(path.join(source,'pnpm-lock.yaml'),'utf8'),lock);
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
 if(a.includes('--version')){fs.writeFileSync('__TRACE__',JSON.stringify({inherited:Object.hasOwn(process.env,'DSC_DSH_VERSION')}));if('__MODE__'==='failed')process.exit(7);if('__MODE__'==='invalid')console.log('not-a-dsh-version');return;}
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
   fs.writeFileSync(path.join(dir,'bin','dsh'),'#!/usr/bin/env node\n'+fake.replace("'__TRACE__'",JSON.stringify(trace)).replaceAll('__MODE__',mode),{mode:0o755});
   const child=spawnSync(process.execPath,['--input-type=module','-e',code],{env:{...env,DSC_DSH_VERSION:'inherited-not-observed'},encoding:'utf8',timeout:15000});
   assert.equal(child.status,0,child.stderr);const out=JSON.parse(child.stdout);
   assert.match(out.error||'',/DSH version/i,JSON.stringify({api,mode,out}));
   if(api==='probeProfile'){assert.equal(out.surface,null);assert.equal(out.tempProfileRemoved,true);}
   else{assert.equal(out.status,'tool-error');assert.equal(out.exitCode,3);assert.equal(out.cleanup.tempProfileRemoved,true);}
   assert.equal(JSON.parse(fs.readFileSync(trace)).inherited,false);
  }
 });
});

test("cancelling an owned command waits for that process to stop", async () => {
  const { command } = await import("../lib/probe-runner.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-command-abort-")),
    marker = path.join(root, "pid");
  const controller = new AbortController();
  try {
    const pending = command(
      process.execPath,
      [
        "-e",
        `require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`,
        marker,
      ],
      { signal: controller.signal, timeoutMs: 1000 },
    );
    const deadline = Date.now() + 900;
    while (!fs.existsSync(marker) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 5));
    assert.ok(fs.existsSync(marker));
    const pid = Number(fs.readFileSync(marker));
    controller.abort();
    const result = await pending;
    assert.match(result.error, /abort/i);
    assert.equal(result.code, null);
    assert.throws(
      () => process.kill(pid, 0),
      (e) => e.code === "ESRCH",
    );
  } finally {
    controller.abort();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("an already aborted command cannot start its executable", async () => {
  const { command } = await import("../lib/probe-runner.mjs");
  const controller = new AbortController();
  controller.abort();
  const out = await command(
    process.execPath,
    ["-e", 'console.log("should not start")'],
    { signal: controller.signal },
  );
  assert.equal(out.code, null);
  assert.match(out.error, /abort/i);
  assert.equal(out.output, "");
});

test(
  "a detached descendant retaining pipes cannot hang command cancellation",
  { skip: process.platform === "win32" },
  async () => {
    const { command } = await import("../lib/probe-runner.mjs");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-pipe-abort-")),
      file = path.join(dir, "pids");
    const script = `const fs=require('node:fs'),{spawn}=require('node:child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore',process.stdout,process.stderr]});fs.writeFileSync(process.argv[1],JSON.stringify({parent:process.pid,descendant:child.pid}));setInterval(()=>{},1000)`;
    const controller = new AbortController();
    let pending, pids, settled;
    try {
      pending = command(process.execPath, ["-e", script, file], {
        signal: controller.signal,
        timeoutMs: 5000,
      });
      const end = Date.now() + 2000;
      while (!fs.existsSync(file) && Date.now() < end)
        await new Promise((r) => setTimeout(r, 5));
      assert.ok(fs.existsSync(file));
      pids = JSON.parse(fs.readFileSync(file));
      controller.abort();
      settled = await Promise.race([
        pending.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 400)),
      ]);
    } finally {
      controller.abort();
      if (pids)
        try {
          process.kill(-pids.descendant, "SIGKILL");
        } catch {}
      if (pending) await pending;
      fs.rmSync(dir, { recursive: true, force: true });
    }
    assert.equal(
      settled,
      true,
      "inherited descriptors must not extend the owned-command deadline",
    );
    assert.throws(
      () => process.kill(pids.parent, 0),
      (e) => e.code === "ESRCH",
    );
  },
);

test('command output pressure remains bounded during process shutdown',async()=>{
 const {command}=await import('../lib/probe-runner.mjs');
 const out=await command(process.execPath,['-e',`require('node:fs').writeSync(1,Buffer.alloc(8*1024*1024,97));setInterval(()=>{},1000)`],{timeoutMs:2000});
 assert.match(out.error,/output.*limit/i);assert.ok(Buffer.byteLength(out.output)<=1024*1024,'shutdown must stop collecting overflowing output');
});
test('command output preserves UTF8 split across pipe chunks',async()=>{
 const {command}=await import('../lib/probe-runner.mjs');const out=await command(process.execPath,['-e',`process.stdout.write('你'.repeat(100000),()=>process.exit(0))`]);
 assert.equal(out.code,0);assert.equal(out.output,'你'.repeat(100000));
});

test('probe cloning cannot rewrite symlinked source manifests or profile roots',()=>{
 for(const kind of ['manifest','profile','metadata'])withFakeDsh(`const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2),p=path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]);if(fs.existsSync(path.join(p,'.plugin-manager','control')))fs.writeFileSync(path.join(p,'.plugin-manager','control'),'changed');process.exit(1)`,({home,env})=>{
  const source=path.join(home,'profiles','linked'),original=path.join(home,'shared-manifest.json');
  const data=JSON.stringify({dependencies:{local:'file:../neighbor'},dsh:{profile:{bundles:[]}}});
  if(kind==='manifest'){fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});fs.writeFileSync(original,data);fs.symlinkSync(original,path.join(source,'package.json'));}
  else if(kind==='metadata'){fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});fs.writeFileSync(path.join(source,'package.json'),data);const meta=path.join(home,'meta');fs.mkdirSync(meta);fs.writeFileSync(path.join(meta,'control'),data);fs.symlinkSync(path.join(meta,'control'),original);fs.symlinkSync(meta,path.join(source,'.plugin-manager'),'dir');}
  else{const real=path.join(home,'real');fs.mkdirSync(path.join(real,'node_modules'),{recursive:true});fs.writeFileSync(path.join(real,'package.json'),data);fs.symlinkSync(path.join(real,'package.json'),original);fs.symlinkSync(real,source,'dir');}
  const code=`import {probeProfile} from ${JSON.stringify(new URL('../lib/probe-runner.mjs',import.meta.url).href)};console.log(JSON.stringify(await probeProfile(${JSON.stringify(path.join(source,'node_modules'))})));`;
  const run=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:10000});assert.equal(run.status,0,run.stderr);const out=JSON.parse(run.stdout);assert.ok(out.error);assert.equal(out.tempProfileRemoved,true);assert.equal(fs.readFileSync(original,'utf8'),data);
 });
});
