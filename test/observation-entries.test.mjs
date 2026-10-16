import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {packageFixture} from './fixture-utils.mjs';
import {run} from '../bin/compat-check.mjs';
for(const mismatch of ['profile','version','age'])test(`rejected ${mismatch} observation cannot contribute loader failures`,()=>{
 const fixture=packageFixture('export function apply(){}');
 try{
  const probe={observationVersion:1,profileId:fixture.nm,dshVersion:'0.2.0',probedAt:new Date().toISOString(),root:{},entries:{plugins:[{packageName:'sample',state:'FAILED',disabled:false}]}};
  if(mismatch==='profile')probe.profileId='/other/node_modules';
  if(mismatch==='version')probe.dshVersion='0.1.0';
  if(mismatch==='age')probe.probedAt='2000-01-01T00:00:00Z';
  const file=path.join(fixture.root,'observation.json');fs.writeFileSync(file,JSON.stringify(probe));
  const result=run({nm:fixture.nm,probe:file,dshVersion:'0.2.0',baseline:false});
  assert.equal(result.error,null);assert.equal(result.verdict.observation.usable,false);
  assert.ok(!result.verdict.plugins.sample.findings.some(f=>f.category==='host-entry-inactive'));
 }finally{fixture.cleanup();}
});
test('an accepted observation retains its actual loader failure',()=>{
 const fixture=packageFixture('export function apply(){}');
 try{
  const result=run({nm:fixture.nm,dshVersion:'0.2.0',baseline:false,_hostSurface:{observationVersion:1,profileId:fixture.nm,dshVersion:'0.2.0',probedAt:new Date().toISOString(),root:{},entries:{plugins:[{packageName:'sample',state:'FAILED',disabled:false}]}}});
  assert.equal(result.verdict.plugins.sample.verdict,'broken');
 }finally{fixture.cleanup();}
});
test('a failed probe envelope is a tool error, not an empty successful observation',()=>{
 const fixture=packageFixture('export function apply(){}');
 try{const result=run({nm:fixture.nm,baseline:false,_hostSurface:{error:'Cannot read requested services',root:{},observationVersion:1,profileId:fixture.nm}});
 assert.match(result.error,/Cannot read requested services/);
 }finally{fixture.cleanup();}
});
