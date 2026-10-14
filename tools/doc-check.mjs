#!/usr/bin/env node
/** Validate generated current facts without recursively running the suite. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOOL_VERSION} from '../lib/version.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const current=JSON.parse(fs.readFileSync(path.join(root,'docs/current-state.json'),'utf8'));
const count=fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).length;
const problems=[];
if(current.testFiles!==count)problems.push(`testFiles: ${current.testFiles} != ${count}`);
if(current.toolVersion!==TOOL_VERSION)problems.push('toolVersion differs from kernel');
for(const file of ['README.md','README.en.md','README.ko.md','Plan.md'])if(!fs.readFileSync(path.join(root,file),'utf8').includes('docs/current-state.json'))problems.push(`${file} has no current-state link`);
const i=process.argv.indexOf('--test-summary');
if(i>=0){
 const log=fs.readFileSync(process.argv[i+1],'utf8');
 const tests=Number(/^(?:#|ℹ) tests (\d+)/m.exec(log)?.[1]);
 const failed=Number(/^(?:#|ℹ) fail (\d+)/m.exec(log)?.[1]);
 if(!Number.isFinite(tests)||failed!==0)problems.push('Missing or failing test summary');
 else {
  const profiles=current.verification?.optionalProfiles||{};
  const sameInputs=Object.entries(profiles).every(([name,present])=>fs.existsSync(path.join(os.homedir(),'.dsh/profiles',name,'node_modules'))===present);
  if(sameInputs&&tests!==current.tests)problems.push(`tests: ${current.tests} != ${tests}`);
  console.log(`Verified successful test summary: ${tests} tests${sameInputs?'':' (different optional profile inputs)'}`);
 }
}
if(problems.length){console.error(problems.join('\n'));process.exitCode=1;}
else console.log(`Documentation facts checked: ${TOOL_VERSION}, ${count} test files${i>=0?`, ${current.tests} tests`:''}`);
