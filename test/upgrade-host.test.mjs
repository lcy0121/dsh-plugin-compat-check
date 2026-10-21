import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
const repo = path.resolve(".");
function execute(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-upgrade-host-")),
    nm = path.join(root, "home/profiles/upgrade/node_modules"),
    pkg = path.join(nm, "upgrade-demo");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "upgrade-demo",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
      engines: { dsh: "<0.2.1-rc.1" },
      peerDependencies: { "@deepseek-ai/dsh": ">=0.2.0-rc.2 <0.2.1-rc.1" },
    }),
  );
  fs.writeFileSync(
    path.join(pkg, "index.js"),
    'export function apply(){throw Error("never execute")}',
  );
  fs.writeFileSync(path.join(pkg, "cordis.patch.yml"), "- name: ./index.js\n");
  fs.writeFileSync(path.join(nm, "../probe-report.json"), "{corrupt");
  fs.writeFileSync(
    path.join(nm, "../compatibility.json"),
    JSON.stringify({ "upgrade-demo@1.0.0": ["0.2.1-rc.2"] }),
  );
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {apply} from ${JSON.stringify(pathToFileURL(path.join(repo, "plugin/index.js")).href)};
 const root=${JSON.stringify(root)},nm=${JSON.stringify(nm)},pkg=${JSON.stringify(pkg)},routes=new Map(),effects=[];let tool;
 const ctx={get:()=>undefined,inject:(deps,cb)=>{const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path);}},tools:{register:t=>{tool=t;return()=>{};}}});if(typeof off==='function')effects.push(off);return off;},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);}};apply(ctx);
 const route=routes.get('/plugin-compat-check/upgrade-preview');assert(route,'Upgrade route not registered');
 const request=async(query,headers={host:'127.0.0.1:8123'},method='GET')=>{let code,text;await route.handler({headers,method,url:'/plugin-compat-check/upgrade-preview?'+query,socket:{encrypted:false}},{writeHead:c=>code=c,setHeader(){},end:t=>text=t});return {status:code,body:JSON.parse(text)};};
 try{${body};console.log('UPGRADE_HOST_OK')}finally{for(const off of effects)off();}process.exit(0);`;
  try {
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 20000,
        env: {
          ...process.env,
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
