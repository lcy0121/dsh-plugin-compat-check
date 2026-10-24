import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const repo = path.resolve(".");
function execute(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-upgrade-host-")),
    nm = path.join(root, "home/profiles/upgrade/node_modules"),
    pkg = path.join(nm, "upgrade-demo");
  writePackageFixture(
    pkg,
    {
      name: "upgrade-demo",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
      engines: { dsh: "<0.2.1-rc.1" },
      peerDependencies: { "@deepseek-ai/dsh": ">=0.2.0-rc.2 <0.2.1-rc.1" },
    },
    'export function apply(){throw Error("never execute")}',
    "- insert:\n    - name: ./index.js\n",
  );
  fs.writeFileSync(path.join(nm, "../probe-report.json"), "{corrupt");
  fs.writeFileSync(
    path.join(nm, "../compatibility.json"),
    JSON.stringify({ "upgrade-demo@1.0.0": ["0.2.1-rc.2"] }),
  );
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {apply} from ${JSON.stringify(pathToFileURL(path.join(repo, "plugin/index.js")).href)};
 const root=${JSON.stringify(root)},nm=${JSON.stringify(nm)},pkg=${JSON.stringify(pkg)},routes=new Map(),effects=[];let tool;
 const ctx={get:()=>undefined,inject:(deps,cb)=>{const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path);}},tools:{register:t=>{tool=t;return()=>{};}}});if(typeof off==='function')effects.push(off);return off;},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);}};apply(ctx);
 const route=routes.get('/plugin-compat-check/upgrade-preview');assert(route,'Upgrade route not registered');
 const request=async(query,headers={host:'127.0.0.1:8123'},method='GET')=>{let code,text;await route.handler({headers:{'x-dsh-compat-request':'1',...headers},method,url:'/plugin-compat-check/upgrade-preview?'+query,socket:{encrypted:false}},{writeHead:c=>code=c,setHeader(){},end:t=>text=t});return {status:code,body:JSON.parse(text)};};
 try{${body};console.log('UPGRADE_HOST_OK')}finally{for(const off of effects)off();}process.exit(0);`;
  fs.mkdirSync(path.join(root, "temporary"));
  try {
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 20000,
        env: {
          ...process.env,
          TMPDIR: path.join(root, "temporary"),
          DSH_HOME: path.join(root, "home"),
          DSC_KERNEL: repo,
          DSC_PROFILE: "upgrade",
          DSH_VERSION: "0.2.0-rc.2",
          DSC_PROBE_REPORT: path.join(
            root,
            "home/profiles/upgrade/probe-report.json",
          ),
          DSC_AUTORUN_MS: "60000",
          DSC_OUT_DIR: path.join(root, "diagnostic"),
        },
      },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /UPGRADE_HOST_OK/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("HTTP and agent preflight are static, use no exemptions/baseline, and a later request rescans changed installed bytes", () =>
  execute(
    `const a=await request('currentVersion=0.2.0-rc.2&targetVersion=0.2.1-rc.2');assert.equal(a.status,200);assert.equal(a.body.ok,true);assert.equal(a.body.summary.added,1);assert.equal(a.body.currentReport.observation.usable,false);assert.equal(a.body.targetReport.observation.usable,false);assert.equal(a.body.baseline,null);assert.equal(a.body.cache,null);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));const agent=await tool.execute({upgradeTo:'0.2.1-rc.2'});assert.equal(agent.upgradePreview.mode,'static-version-comparison');assert.equal(agent.report,null);assert.equal(agent.hasRuntimeSurface,false);const m=JSON.parse(fs.readFileSync(pkg+'/package.json'));m.engines.dsh='>=0.2.0-rc.2 <0.3.0';fs.writeFileSync(pkg+'/package.json',JSON.stringify(m));const b=await request('targetVersion=0.2.1-rc.2');assert.equal(b.body.summary.added,0);assert.notEqual(a.body.artifact.sha256,b.body.artifact.sha256);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));`,
  ));
test("preflight route enforces same origin, GET, stale current-version context and explicit unknown target", () =>
  execute(
    `const cross=await request('targetVersion=0.2.1-rc.2',{host:'127.0.0.1:8123',origin:'http://127.0.0.1:8124'});assert.equal(cross.status,403);const post=await request('targetVersion=0.2.1-rc.2',undefined,'POST');assert.equal(post.status,405);const stale=await request('currentVersion=0.2.1-rc.2&targetVersion=0.2.1-rc.2');assert.equal(stale.body.status,'error');assert.equal(stale.body.exitCode,3);const unsupported=await request('targetVersion=9.9.9');assert.equal(unsupported.body.status,'unsupported-version');assert.equal(unsupported.body.exitCode,3);assert.match(JSON.stringify(unsupported.body),/未认证/);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));`,
  ));
test("unloading during a pending preflight cannot return success or leave the preview route registered", () =>
  execute(
    `const pending=request('targetVersion=0.2.1-rc.2');for(const off of effects)off();const out=await pending;assert.equal(out.body.ok,false);assert.equal(out.body.status,'error');assert.equal(out.body.exitCode,3);assert.match(out.body.error,/disposed|卸载/);assert.equal(routes.has('/plugin-compat-check/upgrade-preview'),false);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));`,
  ));
test("same-target requests can share an in-flight preflight while a different target is rejected as busy", () =>
  execute(
    `const a=request('targetVersion=0.2.1-rc.2');const b=request('targetVersion=0.2.1-rc.2');const c=request('targetVersion=0.2.0-rc.2');const results=await Promise.all([a,b,c]);assert.equal(results[0].body.ok,true);assert.equal(results[1].body.ok,true);assert.equal(results[0].body.artifact.sha256,results[1].body.artifact.sha256);assert.equal(results[2].body.ok,false);assert.match(results[2].body.error,/正在运行/);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));`,
  ));
test("invalid upgrade tool arguments retain the preview failure identity rather than ordinary report output", () =>
  execute(
    `const out=await tool.execute({upgradeTo:42});assert.equal(out.ok,false);assert.equal(out.report,null);assert.equal(out.upgradePreview.kind,'plugin-compat-check/upgrade-preview');assert.equal(out.upgradePreview.exitCode,3);assert.equal(out.baseline,null);assert.equal(out.cache,null);`,
  ));

// Cancel an observed copying task, rather than unloading before capture starts.
test("host remains responsive during real capture, unloads shared requests and a new generation recovers", () =>
  execute(
    `for(let i=0;i<4500;i++)fs.writeFileSync(pkg+'/data-'+i+'.txt','owned capture data');
     const first=request('targetVersion=0.2.1-rc.2'),same=request('targetVersion=0.2.1-rc.2');
     const end=Date.now()+5000;let copied=false;
     while(Date.now()<end&&!copied){copied=fs.readdirSync(root+'/temporary').some(n=>fs.existsSync(root+'/temporary/'+n+'/node_modules/upgrade-demo/data-0.txt'));if(!copied)await new Promise(r=>setTimeout(r,5));}
     assert(copied,'must observe real capture before host disposal');
     const busy=await request('targetVersion=0.2.0-rc.2');assert.equal(busy.body.ok,false);assert.match(busy.body.error,/正在运行/);
     const unsupported=await request('targetVersion=9.9.9');assert.equal(unsupported.body.status,'unsupported-version');
     for(const off of effects.splice(0))off();
     for(const out of await Promise.all([first,same])){assert.equal(out.body.ok,false);assert.match(out.body.error,/取消|卸载|disposed/);}
     assert.deepEqual(fs.readdirSync(root+'/temporary'),[]);assert(fs.existsSync(pkg+'/data-0.txt'));
     apply(ctx);const recovered=await tool.execute({upgradeTo:'0.2.1-rc.2'});assert.equal(recovered.upgradePreview.ok,true,recovered.upgradePreview.error);assert.deepEqual(fs.readdirSync(root+'/temporary'),[]);assert(!fs.existsSync(root+'/home/dsh-plugin-compat-check'));`,
  ));

test("host unload preserves primary cancellation and cleanup refusal diagnostics", () =>
  execute(
    `for(let i=0;i<1000;i++)fs.writeFileSync(pkg+'/data-'+i+'.txt','owned capture data');
     fs.writeFileSync(pkg+'/index.js',Array.from({length:20000},(_,i)=>'const x'+i+'='+i+';').join('\\n'));
     const pending=request('targetVersion=0.2.1-rc.2');
     let snapshot;const end=Date.now()+5000;
     while(Date.now()<end&&!snapshot){for(const name of fs.readdirSync(root+'/temporary')){const candidate=root+'/temporary/'+name;try{if((fs.statSync(candidate).mode&0o777)===0o500){snapshot=candidate;break;}}catch{}}if(!snapshot)await new Promise(r=>setTimeout(r,2));}
     assert(snapshot,'must observe frozen real snapshot before disposal');
     const backup=snapshot+'-saved';fs.renameSync(snapshot,backup);fs.writeFileSync(snapshot,'unrelated replacement');
     try {
       for(const off of effects.splice(0))off();const out=await pending;
       assert.equal(out.body.ok,false);assert.equal(out.body.artifact,null);
       assert.match(out.body.error,/取消/);assert.match(out.body.error,/清理.*未完成/);assert.match(out.body.error,/目录身份变化/);
       assert.equal(out.body.error.includes(root+'/temporary'),false);
       assert.equal(fs.readFileSync(snapshot,'utf8'),'unrelated replacement');assert(fs.existsSync(backup));
     } finally {
       fs.unlinkSync(snapshot);const writable=d=>{fs.chmodSync(d,0o700);for(const e of fs.readdirSync(d,{withFileTypes:true}))if(e.isDirectory())writable(d+'/'+e.name);};writable(backup);fs.rmSync(backup,{recursive:true});
     }`,
  ));
