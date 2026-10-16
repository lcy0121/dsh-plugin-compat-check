import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReportService} from '../lib/report-service.mjs';
test('cold and forced concurrent requests share one real compute',async()=>{
  let count=0,release;const gate=new Promise(r=>release=r);
  const service=new ReportService(async()=>{count++;await gate;return {ok:true,value:count};});
  const a=service.get('A',{},true),b=service.get('A',{},true);
  await Promise.resolve();assert.equal(count,1);release();assert.deepEqual(await a,await b);
});
test('failed background computation preserves valid report and exposes error',async()=>{
  let now=0,count=0;const service=new ReportService(async()=>++count===1?{ok:true,value:'valid'}:{ok:false,error:'broken'},{ttlMs:1,clock:()=>now});
  await service.get('A');now=2;const cached=await service.get('A');assert.equal(cached.value,'valid');
  await service.state('A').inflight;const after=await service.get('A');assert.equal(after.value,'valid');assert.equal(after.cache.refreshError,'broken');
});
