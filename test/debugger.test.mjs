import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {launchChromePipe} from '../lib/debugger.mjs';
test('debugger commands use only the launched child pipe and its owned target session',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-cdp-fake-'));const executable=path.join(dir,'chrome');
  fs.writeFileSync(executable,`#!/usr/bin/env node
    const fs=require('node:fs');let buffer='';const output=fs.createWriteStream(null,{fd:4});
    fs.createReadStream(null,{fd:3}).on('data',b=>{buffer+=b;let pos;while((pos=buffer.indexOf('\\0'))>=0){const m=JSON.parse(buffer.slice(0,pos));buffer=buffer.slice(pos+1);let result={};if(m.method==='Target.createTarget')result={targetId:'owned-page'};if(m.method==='Target.attachToTarget')result={sessionId:'owned-session'};if(m.method==='Page.navigate')result={pipe:process.argv.includes('--remote-debugging-pipe'),session:m.sessionId,url:m.params.url};output.write(JSON.stringify({id:m.id,result})+'\\0');}});
  `,{mode:0o755});
  let cdp;
  try{cdp=await launchChromePipe(executable,{timeoutMs:10000});const r=await cdp.send('Page.navigate',{url:'private-marker'});assert.deepEqual(r,{pipe:true,session:'owned-session',url:'private-marker'});}
  finally{await cdp?.close();fs.rmSync(dir,{recursive:true,force:true});}
});
