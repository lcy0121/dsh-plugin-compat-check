#!/usr/bin/env node
/** Explicit test discovery works on Node 22 as well as newer directory runners. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {captureProfiles} from '../test/support/profile-snapshot.mjs';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join('test',f));
const snapshot=captureProfiles();
try {
  const child=spawn(process.execPath,['--test',...process.argv.slice(2),...files],{
    cwd:root,stdio:'inherit',env:{...process.env,DSC_TEST_PROFILE_SNAPSHOT:snapshot.root},
  });
  const stop=signal=>child.kill(signal);
  const interrupt=()=>stop('SIGINT'),terminate=()=>stop('SIGTERM');
  process.once('SIGINT',interrupt);process.once('SIGTERM',terminate);
  try {
    process.exitCode=await new Promise(resolve=>{
      child.once('error',error=>{console.error(error.message);resolve(1);});
      child.once('close',(code,signal)=>resolve(code??(signal?1:0)));
    });
  } finally {
    process.off('SIGINT',interrupt);process.off('SIGTERM',terminate);
  }
} finally {snapshot.dispose();}
