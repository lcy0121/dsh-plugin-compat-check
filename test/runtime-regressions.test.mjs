import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {snapshotForBaseline,diffAgainstBaseline,badgeFor} from '../lib/baseline.mjs';
import {packageFixture} from './fixture-utils.mjs';

test('baseline notices severity and certainty changes without changing finding keys',()=>{
  const previous={plugins:{sample:{version:'1',verdict:'partial',findings:[{service:'settings',method:'absent',category:'host-method-missing',severity:'degraded',certainty:'suspected'}]}}};
  const next=structuredClone(previous);next.plugins.sample.findings[0].severity='feature-dead';next.plugins.sample.findings[0].certainty='certain';
  const diff=diffAgainstBaseline(snapshotForBaseline(previous,'v'),snapshotForBaseline(next,'v'));
  assert.equal(diff.worsened.length,1);
});
test('a version-only upgrade has a neutral badge',()=>{
  const p={plugins:{sample:{version:'1',verdict:'ok',findings:[]}}},n=structuredClone(p);n.plugins.sample.version='2';
  assert.equal(badgeFor(diffAgainstBaseline(snapshotForBaseline(p,'v'),snapshotForBaseline(n,'v'))).direction,'neutral');
});
test('reports from different observation modes are not compared as plugin improvements',()=>{
  const p={plugins:{},observation:{mode:'catalogue'}},n={plugins:{},observation:{mode:'runtime'}};
  const a=snapshotForBaseline(p,'v'),b=snapshotForBaseline(n,'v');
  assert.equal(diffAgainstBaseline(a,b).comparable,false);
});
test('host report uses explicit profile, actual FAILED state and honest error summary',()=>{
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-runtime-case-'));
  const f=packageFixture('export function apply(){}');
  try{
    for(const profile of ['A','B']){
      const nm=path.join(home,'profiles',profile,'node_modules');fs.mkdirSync(nm,{recursive:true});fs.cpSync(f.pkg,path.join(nm,'sample'),{recursive:true});
    }
    const hostModule=new URL('../plugin/index.js',import.meta.url).href;
    const source=`
      import {apply} from ${JSON.stringify(hostModule)};
      process.argv=['node','mock','--profile','A'];
      let tool;const loader={entries:()=>[{id:'sample',options:{name:'sample'},disabled:false,fiber:{state:3,inject:[],ctx:{get(){}},await:()=>Promise.reject(new Error('failure'))}}]};
      const ctx={loader,get:n=>n==='loader'?loader:undefined,inject:(names,cb)=>{if(names.includes('tools'))cb({tools:{register:t=>{tool=t}},agents:{}});return ()=>{}}};
      apply(ctx);const report=await globalThis.__DSH_COMPAT_CHECK__.compatReport();
      const explicit=await tool.execute({profile:'B'});
      const missing=await tool.execute({profile:'missing'});
      console.log('RESULT '+JSON.stringify({report,explicit,missing}));
    `;
    const r=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:5000,env:{...process.env,DSH_HOME:home,DSC_KERNEL:path.resolve('.'),DSC_OUT_DIR:'',DSC_SCAN_DELAYS:'999999',DSC_AUTORUN_MS:'999999'}});
    assert.equal(r.status,0,r.stderr);
    const data=JSON.parse(r.stdout.split('\n').find(l=>l.startsWith('RESULT ')).slice(7));
    assert.equal(data.report.report.plugins.sample.verdict,'broken');
    assert.ok(data.explicit.nodeModules.includes('/profiles/B/'));
    assert.equal(data.explicit.hasRuntimeSurface,false,'Current host is A; no runtime observation may be relabeled as B');
    assert.equal(data.missing.summary,'无法判定');
    assert.equal(data.missing.nodeModules,'');
  }finally{f.cleanup();fs.rmSync(home,{recursive:true,force:true});}
});
