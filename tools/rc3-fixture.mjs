/** Test-only bridge installed exclusively into an owned temporary profile. */
import fs from "node:fs";
import path from "node:path";
export function installRc3Fixture(profile) {
  const dir = path.join(profile, "node_modules/@acceptance/rc3");
  const seededWorkspace = path.join(profile, "rc3-seeded-workspace");
  fs.mkdirSync(seededWorkspace);
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@acceptance/rc3",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      exports: {
        ".": "./index.js",
        "./client": "./lib/client.js",
        "./package.json": "./package.json",
        "./cordis.patch.yml": "./cordis.patch.yml",
      },
      dsh: {
        bundle: { patch: "cordis.patch.yml" },
        client: { platform: "web" },
      },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "cordis.patch.yml"),
    '- insert:\n    - id: acceptance-rc3\n      name: "@acceptance/rc3"\n',
  );
  fs.writeFileSync(
    path.join(dir, "index.js"),
    `import fs from 'node:fs';export const inject=['llm','appReady','agents','workspaceRegistry','sessionTitle'];export function apply(ctx){
 const receipt=${JSON.stringify(path.join(profile, "rc3-network.json"))};const record=()=>fs.writeFileSync(receipt,JSON.stringify({productionRequests:production}));
 if (${JSON.stringify(process.env.DSC_HTTP_AUTH_ACCEPTANCE === "1")}) {
  const shape=Object.fromEntries(Array.from({length:10000},(_,i)=>['field'+i,'OWNED_VALUE_NOT_FOR_EXPORT']));ctx.provide('hardeningBudget',shape);
  ctx.inject(['connection','webServer'], auth=>auth.webServer.register({kind:'exact',path:'/acceptance/auth-expiry',handler(req,res){
   const current=auth.connection.requestRejection(req);if(current!==undefined){res.writeHead(current);res.end('{}');return;}
   const now=Date.now;let expired;try{Date.now=()=>now()+31*24*60*60*1000;expired=auth.connection.requestRejection(req);}finally{Date.now=now;}
   res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({current:null,expired}));
  }}));
 }
 const original=globalThis.fetch;let production=0;record();
 globalThis.fetch=(input,...args)=>{const url=new URL(typeof input==='string'?input:input.url||String(input));if(url.hostname==='api.deepseek.com'){production++;record();throw Error('Acceptance forbids production model/listing requests');}return original(input,...args)};
 ctx.effect(()=>()=>{globalThis.fetch=original});
 ctx.effect(()=>ctx.appReady.onReady(async()=>{try{const w=await ctx.workspaceRegistry.create(${JSON.stringify(seededWorkspace)},'Owned navigation fixture');const h=await ctx.agents.create({sessionId:'rc3-navigation-seeded',meta:{cwd:${JSON.stringify(seededWorkspace)}},seed:[{type:'turn/start',seq:0,time:Date.now(),data:{turn:1}},{type:'turn/end',seq:1,time:Date.now(),data:{turn:1,reason:{kind:'completed'}}}]});ctx.effect(()=>()=>h.dispose());ctx.sessionTitle.rename(h.agent.session,'Owned navigation fixture');await w.attachSession(h.agent.id);const rows=await ctx.llm.listModels('deepseek-official');if(rows.length||production)throw Error('Unexpected credential discovery');console.log('RC3_NO_CREDENTIAL_DISCOVERY_PASS')}catch(e){console.error('RC3_DISCOVERY_FAILED',String(e))}}));
 }`,
  );
  fs.writeFileSync(
    path.join(dir, "lib/client.js"),
    `window.__ModuleLoader__.load({id:'@acceptance/rc3',factory:()=>({inject:['uiWorkspace','sessions','workspaces','conversation','layout','slots','pluginNavigation'],apply(ctx){window.__DSC_RC3__=ctx;ctx.effect(()=>()=>{delete window.__DSC_RC3__})}})});`,
  );
  const file = path.join(profile, "package.json"),
    pkg = JSON.parse(fs.readFileSync(file));
  pkg.dependencies["@acceptance/rc3"] = "file:" + dir;
  pkg.dsh.profile.bundles.push("@acceptance/rc3");
  fs.writeFileSync(file, JSON.stringify(pkg));
}
