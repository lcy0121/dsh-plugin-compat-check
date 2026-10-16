import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {writeBaseline,baselinePath} from '../lib/state-store.mjs';
test('atomic baseline replace never writes through a preexisting file symlink',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-store-'));
  try{const sentinel=path.join(dir,'sentinel'),file=path.join(dir,'baseline.json');fs.writeFileSync(sentinel,'unchanged');fs.symlinkSync(sentinel,file);assert.equal(writeBaseline(file,{ok:true}),null);assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{ok:true});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('different profile paths and observation modes do not share a baseline file',()=>{
  assert.notEqual(baselinePath('/one/profiles/same/node_modules'),baselinePath('/two/profiles/same/node_modules'));
  assert.notEqual(baselinePath('/one/node_modules','runtime'),baselinePath('/one/node_modules','catalogue'));
});
