import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const repo = path.resolve(".");
function host(body) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-workflows-host-")),
    home = path.join(root, "home"),
    nm = path.join(home, "profiles/P/node_modules"),
    pkg = path.join(nm, "demo");
  writePackageFixture(
    pkg,
    {
      name: "demo",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      exports: { ".": "./index.js", "./client": "./missing.js" },
      dsh: { client: { platform: "web" } },
    },
    'export function apply(){throw Error("must not execute")}',
  );
  const script = `import assert from 'node:assert/strict';import fs from 'node:fs';import {Readable} from 'node:stream';import {apply} from ${JSON.stringify(new URL("../plugin/index.js", import.meta.url).href)};
 const root=${JSON.stringify(root)},home=${JSON.stringify(home)},nm=${JSON.stringify(nm)},pkg=${JSON.stringify(pkg)},routes=new Map(),effects=[];let tool;
 const ctx={get:()=>undefined,inject:(deps,cb)=>{const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path)}},tools:{register:t=>{tool=t;return()=>{}}}});if(typeof off==='function')effects.push(off);return off;},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);}};apply(ctx);
 const request=async(pathname='/plugin-compat-check/report',body,headers={},method=body===undefined?'GET':'POST')=>{const route=routes.get(pathname.split('?')[0]);assert(route,'Requested workflow route is not registered: '+pathname);const req=Readable.from(body===undefined?[]:[Buffer.from(typeof body==='string'?body:JSON.stringify(body))]);Object.assign(req,{method,url:pathname,headers:{'x-dsh-compat-request':'1',host:'127.0.0.1:8123',origin:'http://127.0.0.1:8123','content-type':'application/json',...headers},socket:{encrypted:false}});let text,status;await route.handler(req,{writeHead:c=>status=c,setHeader(){},end:t=>text=t});return {status,body:JSON.parse(text)};};
 try{${body};console.log('WORKFLOWS_OK')}finally{for(const off of effects)off();}process.exit(0);`;
  try {
    const out = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        timeout: 20000,
        encoding: "utf8",
        env: {
          ...process.env,
          DSH_HOME: home,
          DSC_PROFILE: "P",
          DSH_VERSION: "0.2.1-rc.2",
          DSC_KERNEL: repo,
          DSC_PROBE_REPORT: "",
          DSC_OUT_DIR: path.join(root, "diagnostic"),
          DSC_AUTORUN_MS: "60000",
          DSC_SCAN_DELAYS: "60000",
        },
      },
    );
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.match(out.stdout, /WORKFLOWS_OK/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test("manual finding review persists beside the report without changing findings, summary or baseline", () =>
  host(`
 const first=await request();assert.equal(first.body.ok,true,first.body.error);assert(first.body.reviews,'Report must expose separate manual reviews');
 const reviews=first.body.reviews;assert.equal(reviews.error,null);const item=reviews.items.find(r=>r.pluginName==='demo');assert(item);assert.equal(item.status,'pending');
 const baselineDir=home+'/dsh-plugin-compat-check';const baselines=fs.readdirSync(baselineDir).filter(f=>f.startsWith('baseline.')).map(f=>[f,fs.readFileSync(baselineDir+'/'+f,'utf8')]);
 const saved=await request('/plugin-compat-check/reviews',{contextToken:reviews.contextToken,findingId:item.findingId,status:'false-positive',note:'人工复核：有独立验证依据'});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.reviews.items.find(r=>r.findingId===item.findingId).status,'false-positive');
 const later=await request();assert.deepEqual(later.body.report,first.body.report);assert.deepEqual(later.body.baseline,first.body.baseline);assert.equal(later.body.reviews.items.find(r=>r.findingId===item.findingId).status,'false-positive');
 for(const [file,bytes] of baselines)assert.equal(fs.readFileSync(baselineDir+'/'+file,'utf8'),bytes,'Review write must not advance baseline');
 const meta=await request('/plugin-compat-check/report?metadata=1');assert.equal(meta.body.reviewsRevision,later.body.reviews.revision);assert.notEqual(meta.body.reviewsRevision,reviews.revision);
 const agent=await tool.execute({});assert.equal(agent.reviews.items.find(r=>r.findingId===item.findingId).status,'false-positive');assert(tool.output.schema.properties.reviews,'Tool output schema must declare review sidecar');
`));
test("manual review writes enforce origin, JSON bounds and fresh report identity", () =>
  host(`
 const first=(await request()).body;assert(first.reviews,'Review metadata is required');const item=first.reviews.items[0],body={contextToken:first.reviews.contextToken,findingId:item.findingId,status:'reviewed',note:'核对过'};
 assert.equal((await request('/plugin-compat-check/reviews',body,{origin:'http://127.0.0.1:8124'})).status,403);
 assert.equal((await request('/plugin-compat-check/reviews',body,{'content-type':'text/plain'})).status,415);
 assert.equal((await request('/plugin-compat-check/reviews',undefined,{},'GET')).status,405);
 assert.equal((await request('/plugin-compat-check/reviews','x'.repeat(20000))).status,413);
 assert.equal((await request('/plugin-compat-check/reviews',{...body,contextToken:'obsolete'})).status,409);
 const manifest=JSON.parse(fs.readFileSync(pkg+'/package.json'));manifest.version='2.0.0';fs.writeFileSync(pkg+'/package.json',JSON.stringify(manifest));
 const changed=await request('/plugin-compat-check/reviews',body);assert.equal(changed.status,409,JSON.stringify(changed.body));
 assert(!fs.readdirSync(home+'/dsh-plugin-compat-check').some(f=>f.startsWith('reviews.')),'Changed input must not create a review file');
`));

test("same-version source changes require review again and reject the previous token", () =>
  host(`
 const first=(await request()).body,item=first.reviews.items[0],input={contextToken:first.reviews.contextToken,findingId:item.findingId,status:'reviewed',note:'已复核原始制品'};
 assert.equal((await request('/plugin-compat-check/reviews',input)).status,200);
 fs.appendFileSync(pkg+'/index.js','\\n// actual source changed while keeping package version and finding\\n');
 const next=(await request('/plugin-compat-check/report?refresh=1')).body;assert.deepEqual(next.report.plugins.demo.findings,first.report.plugins.demo.findings);
 assert.notEqual(next.reviews.contextToken,first.reviews.contextToken,'Changed source must not reuse a review token');
 assert.equal(next.reviews.items[0].status,'needs-review');assert(next.reviews.items[0].historyCount>0);
 assert.equal((await request('/plugin-compat-check/reviews',input)).status,409);
`));

test("unloading a host cancels an incomplete manual-review request without writing records", () =>
  host(`
 const first=await request();assert(first.body.reviews);
 const route=routes.get('/plugin-compat-check/reviews'),req=new Readable({read(){}});Object.assign(req,{method:'POST',url:'/plugin-compat-check/reviews',headers:{'x-dsh-compat-request':'1',host:'127.0.0.1:8123',origin:'http://127.0.0.1:8123','content-type':'application/json'},socket:{}});
 let status,text;const pending=route.handler(req,{writeHead:s=>status=s,end:t=>text=t});req.push('{');for(const off of effects.splice(0))off();await pending;
 assert.equal(status,409);assert.equal(JSON.parse(text).ok,false);assert.equal(routes.has('/plugin-compat-check/reviews'),false);
 assert(!fs.readdirSync(home+'/dsh-plugin-compat-check').some(f=>f.startsWith('reviews.')));
`));

test("interrupted review writers preserve accepted data and fail closed on their retained lock", async (t) => {
  const { reviewContext, saveReview, readReviews } = await import(
    "../lib/finding-review-store.mjs"
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-review-interrupt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, "profile/node_modules");
  fs.mkdirSync(nm, { recursive: true });
  const report = {
    toolVersion: "0.1.4",
    dshVersion: "0.2.1-rc.2",
    observation: { mode: "catalogue" },
    plugins: {
      demo: {
        version: "1.0.0",
        findings: [
          {
            category: "client-entry-missing",
            severity: "fatal",
            certainty: "certain",
            service: null,
            method: null,
            location: null,
          },
        ],
      },
    },
  };
  const context = await reviewContext(report, {
      nodeModules: nm,
      rulesIdentity: "r",
      catalogIdentity: "c",
      sourceIdentity: "s",
    }),
    item = context.findings[0];
  const body = {
    contextToken: context.contextToken,
    findingId: item.findingId,
    status: "reviewed",
    note: "Accepted record before interruption",
  };
  await saveReview(context, body, { dshHome: root });
  const accepted = await readReviews(context, { dshHome: root });
  const script = `import {saveReview} from ${JSON.stringify(new URL("../lib/finding-review-store.mjs", import.meta.url).href)};await saveReview(${JSON.stringify(context)},${JSON.stringify({ ...body, status: "fixed", note: "Interrupted write" })},{dshHome:${JSON.stringify(root)},canCommit:()=>process.exit(23)});`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.status, 23, child.stdout + child.stderr);
  await assert.rejects(
    saveReview(context, body, { dshHome: root }),
    (error) => error.code === "REVIEW_BUSY",
  );
  assert.deepEqual(await readReviews(context, { dshHome: root }), accepted);
});

test("background polling observes manual storage corruption and recovery without a revision change", () =>
  host(`
 const first=(await request()).body;
 const {createHash}=await import('node:crypto');const file=home+'/dsh-plugin-compat-check/reviews.'+createHash('sha256').update(fs.realpathSync(nm)).digest('hex')+'.json';
 const {panelHarness}=await import(${JSON.stringify(new URL("./support/panel-harness.mjs", import.meta.url).href)});
 let releaseFirst;const initialRead=new Promise(resolve=>releaseFirst=resolve);let reads=0;
 const timers=[];const h=await panelHarness(first,{timers:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return fn;},clearTimeout:()=>{}},fetcher:async(url)=>{if(++reads===1)await initialRead;return{ok:true,json:async()=>(await request(url)).body};}});
 try{assert.equal(timers.filter(t=>t.ms===2000).length,0,'Polling starts only after the initial response');releaseFirst();
 const deadline=Date.now()+5000;while(!timers.some(t=>t.ms===2000)){assert(Date.now()<deadline,'Initial report must render and schedule polling');await h.settle();}
 fs.writeFileSync(file,'{corrupt');await timers.filter(t=>t.ms===2000).at(-1).fn();await h.settle();assert.match(h.text(),/Review storage cannot be read/);
 fs.unlinkSync(file);await timers.filter(t=>t.ms===2000).at(-1).fn();await h.settle();assert.doesNotMatch(h.text(),/Review storage cannot be read/);
 assert.deepEqual((await request()).body.report,first.report);
 }finally{h.dispose();}
`));

test("hung host plugin listing fails cold and forced reports, keeps baseline, and recovers after late resolution", () =>
  host(`
 let mode='hang',late=[];ctx.get=name=>name==='pluginManager'?{list:()=>mode==='hang'?new Promise(resolve=>late.push(resolve)):[]}:undefined;
 const cold=(await request()).body;assert.equal(cold.ok,false);assert.match(cold.error,/超时/);assert.equal(cold.report.ok,false);
 mode='good';const good=(await request('/plugin-compat-check/report?refresh=1')).body;assert.equal(good.ok,true,good.error);
 const baselineDir=home+'/dsh-plugin-compat-check';const baselines=fs.readdirSync(baselineDir).filter(f=>f.startsWith('baseline.')).map(f=>[f,fs.readFileSync(baselineDir+'/'+f,'utf8')]);
 mode='hang';const failed=(await request('/plugin-compat-check/report?refresh=1')).body;assert.equal(failed.ok,false);assert.match(failed.error,/超时/);
 const retained=(await request()).body;assert.deepEqual(retained.report,good.report);assert.equal(retained.cache.stale,true);assert.match(retained.cache.refreshError,/超时/);
 for(const [file,bytes] of baselines)assert.equal(fs.readFileSync(baselineDir+'/'+file,'utf8'),bytes);
 mode='good';const recovered=(await request('/plugin-compat-check/report?refresh=1')).body;assert.equal(recovered.ok,true,recovered.error);
 for(const resolve of late)resolve([]);await new Promise(setImmediate);
 const final=(await request()).body;assert.deepEqual(final.report,recovered.report);
`));
