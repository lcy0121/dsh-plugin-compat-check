/** Owned rc.5 fixture: continuous runtime writes plus the real tool pipeline. */
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { refreshVisibleReport } from "./browser-session.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";

export function installIssue023Fixture(profile) {
  const dir = path.join(profile, "node_modules/@acceptance/issues023");
  fs.mkdirSync(path.join(dir, "state"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@acceptance/issues023",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      exports: {
        ".": "./index.js",
        "./package.json": "./package.json",
        "./cordis.patch.yml": "./cordis.patch.yml",
      },
      dsh: { bundle: { patch: "./cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "cordis.patch.yml"),
    '- insert:\n    - id: acceptance-issues023\n      name: "@acceptance/issues023"\n',
  );
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `import fs from 'node:fs';
export const inject=['tools','webServer','connection'];
export function apply(ctx){
 const root=${JSON.stringify(dir)};let writes=0;
 const write=()=>{const tmp=root+'/state/next.tmp';fs.writeFileSync(tmp,JSON.stringify({writes:++writes}));fs.renameSync(tmp,root+'/state/video-usage.json')};
 write();let timer;ctx.effect(()=>()=>clearInterval(timer));
 ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/acceptance/issues023',async handler(req,res){
  const denied=ctx.connection.requestRejection(req);if(denied!==undefined){res.writeHead(denied);res.end('{}');return;}
  if(req.method!=='GET'||req.headers['x-dsh-compat-request']!=='1'){res.writeHead(403);res.end('{}');return;}
  const mode=new URL(req.url,'http://localhost').searchParams.get('mode');
  if(mode==='start'||mode==='stop'){clearInterval(timer);if(mode==='start')timer=setInterval(write,25);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({writes}));return;}
  if(!['ordinary','failure','upgrade'].includes(mode)){res.writeHead(400);res.end('{}');return;}
  const before=writes;
  try{const result=await ctx.tools.execute({callId:'issue023-'+mode,name:'compat_check',arguments:mode==='failure'?{profile:'missing-issue023'}:mode==='upgrade'?{upgradeTo:'0.2.1-rc.3'}:{},signal:AbortSignal.timeout(25000),parent:Symbol('owned-acceptance')});
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({before,after:writes,result}));
  }catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}))}
 }}));
}`,
  );
  const file = path.join(profile, "package.json");
  const pkg = JSON.parse(fs.readFileSync(file));
  pkg.dependencies["@acceptance/issues023"] = "file:" + dir;
  pkg.dsh.profile.bundles.push("@acceptance/issues023");
  fs.writeFileSync(file, JSON.stringify(pkg));
}

export async function verifyIssue023({
  url,
  headers,
  profile,
  chrome,
  evalx,
  poll,
}) {
  const invoke = async (mode) => {
    const response = await fetch(
      new URL("/acceptance/issues023?mode=" + mode, url),
      {
        headers,
        signal: AbortSignal.timeout(30000),
      },
    );
    const text = await response.text();
    assert.equal(
      response.status,
      200,
      `issue023 ${mode}: ${response.status} ${text.slice(0, 1000)}`,
    );
    const receipt = JSON.parse(text);
    if (mode === "start" || mode === "stop") return receipt;
    assert.equal(receipt.result.isError, false, JSON.stringify(receipt.result));
    assert.equal(receipt.result.value.toolVersion, TOOL_VERSION);
    return receipt;
  };
  let first, cached;
  await invoke("start");
  try {
    first = await invoke("ordinary");
    assert.equal(first.result.value.ok, true, first.result.value.error);
    assert.equal(
      fs.realpathSync(first.result.value.nodeModules),
      fs.realpathSync(path.join(profile, "node_modules")),
    );
    const panel = await refreshVisibleReport(chrome, evalx, poll);
    assert.equal(panel.ok, true, panel.error);
    assert.equal(
      fs.realpathSync(panel.nodeModules),
      fs.realpathSync(first.result.value.nodeModules),
    );
    cached = await invoke("ordinary");
    assert.equal(cached.result.value.ok, true, cached.result.value.error);
    assert.equal(cached.result.value.cache?.hit, true);
    assert.equal(cached.result.value.cache?.stale, false);
    assert(
      cached.after > first.before,
      "runtime writes must overlap the tool and panel checks",
    );
  } finally {
    await invoke("stop");
  }
  const failure = await invoke("failure");
  assert.equal(failure.result.value.ok, false);
  assert.equal(failure.result.value.exitCode, 3);
  const upgrade = await invoke("upgrade");
  assert.equal(upgrade.result.value.ok, true, upgrade.result.value.error);
  assert.equal(upgrade.result.value.report, null);
  assert(upgrade.result.value.upgradePreview);
  return {
    realHost: true,
    installedArtifact: true,
    strictToolPipeline: true,
    noArgumentTool: true,
    activeProfile: true,
    settingsProfile: true,
    runtimeWrites: cached.after - first.before,
    cachedWithoutInvalidation: true,
    explicitFailure: true,
    staticUpgrade: true,
    scope:
      "Owned rc.5 profile and synthetic 25ms state writer; no Windows or user-site confirmation.",
  };
}
