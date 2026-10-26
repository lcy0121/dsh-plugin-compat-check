import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readBaseline,writeBaseline,baselinePath,baselineTransaction} from '../lib/state-store.mjs';
import {snapshotForBaseline} from '../lib/baseline.mjs';
test('atomic baseline replace never writes through a preexisting file symlink',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-store-'));
  try{const sentinel=path.join(dir,'sentinel'),file=path.join(dir,'baseline.json');fs.writeFileSync(sentinel,'unchanged');fs.symlinkSync(sentinel,file);assert.equal(writeBaseline(file,{ok:true}),null);assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{ok:true});}
  finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('different profile paths and observation modes do not share a baseline file',()=>{
  assert.notEqual(baselinePath('/one/profiles/same/node_modules'),baselinePath('/two/profiles/same/node_modules'));
  assert.notEqual(baselinePath('/one/node_modules','runtime'),baselinePath('/one/node_modules','catalogue'));
});

const snapshot=()=>snapshotForBaseline({plugins:{},observation:{mode:'catalogue'}},'0.2.1-rc.2');
function storeFixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-baseline-preserve-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return{dir,file:path.join(dir,'custom.json')};}
test('custom baseline never changes permissions of an existing shared parent', {skip:process.platform==='win32'}, t=>{
 const {dir,file}=storeFixture(t);fs.chmodSync(dir,0o755);
 const out=baselineTransaction(file,snapshot());
 assert.equal(fs.statSync(dir).mode&0o777,0o755);
 assert.equal(out.wrote,false);assert.ok(out.writeError);assert.equal(fs.existsSync(file),false);
 assert.equal(fs.existsSync(file+'.lock'),false);
});
for(const [name,bytes]of [
 ['bad JSON','{broken'],
 ['null JSON','null'],
 ['bad schema2 structure',JSON.stringify({schemaVersion:2,dshVersion:null,identity:{mode:'catalogue'},plugins:{demo:{version:'1.0.0',verdict:'ok',findings:'invalid'}}})],
 ['unknown schema',JSON.stringify({schemaVersion:99,plugins:{}})],
 ['legacy schema1',JSON.stringify({schemaVersion:1,plugins:{}})],
])test(`a complete scan preserves ${name} baseline bytes`,t=>{
 const {file}=storeFixture(t);fs.writeFileSync(file,bytes);const before=fs.statSync(file);
 const out=baselineTransaction(file,snapshot());
 assert.equal(out.wrote,false);assert.ok(out.writeError);assert.equal(out.diff?.comparable,false);
 assert.doesNotMatch(out.diff?.reason||'',/第一次/);
 assert.doesNotMatch(out.badge.detail,/第一次/);assert.equal(out.badge.detail,out.diff.reason);
 assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.equal(fs.statSync(file).ino,before.ino);
 assert.equal(fs.existsSync(file+'.lock'),false);
});
test('incomplete scans also preserve corrupt baseline evidence',t=>{
 const {file}=storeFixture(t);fs.writeFileSync(file,'broken');
 const out=baselineTransaction(file,snapshot(),{advance:false});
 assert.equal(out.wrote,false);assert.ok(out.note);assert.equal(fs.readFileSync(file,'utf8'),'broken');
});
test('oversized and nonregular baseline inputs remain untouched',t=>{
 const {dir,file}=storeFixture(t);fs.writeFileSync(file,'x'.repeat(8*1024*1024+1));
 const before=fs.statSync(file);assert.equal(baselineTransaction(file,snapshot()).wrote,false);
 assert.equal(fs.statSync(file).size,before.size);assert.equal(fs.statSync(file).ino,before.ino);
 fs.unlinkSync(file);fs.mkdirSync(file);fs.writeFileSync(path.join(file,'sentinel'),'keep');
 assert.equal(baselineTransaction(file,snapshot()).wrote,false);assert.equal(fs.readFileSync(path.join(file,'sentinel'),'utf8'),'keep');
 assert.deepEqual(fs.readdirSync(dir),['custom.json']);
});
test('baseline transactions preserve both valid and dangling symlinks',t=>{
 const {dir,file}=storeFixture(t),target=path.join(dir,'target');
 for(const exists of [false,true]){
  if(exists)fs.writeFileSync(target,JSON.stringify(snapshot()));
  fs.symlinkSync(target,file);
  assert.equal(baselineTransaction(file,snapshot()).wrote,false);
  assert.equal(fs.lstatSync(file).isSymbolicLink(),true);assert.equal(fs.readlinkSync(file),target);
  if(exists)assert.equal(fs.readFileSync(target,'utf8'),JSON.stringify(snapshot()));
  fs.unlinkSync(file);
 }
});
test('missing and valid baselines still advance while preview preserves stored bytes',t=>{
 const {file}=storeFixture(t),first=snapshot();
 assert.equal(baselineTransaction(file,first,{advance:false}).wrote,false);assert.equal(fs.existsSync(file),false);
 assert.equal(baselineTransaction(file,first).wrote,true);
 const next={...first,dshVersion:'0.2.0-rc.2'},bytes=fs.readFileSync(file);
 const preview=baselineTransaction(file,next,{advance:false});assert.equal(preview.wrote,false);assert.equal(preview.diff.comparable,true);assert.deepEqual(fs.readFileSync(file),bytes);
 const committed=baselineTransaction(file,next);assert.equal(committed.wrote,true);assert.equal(committed.diff.dshVersionChanged,true);assert.equal(JSON.parse(fs.readFileSync(file)).dshVersion,'0.2.0-rc.2');
});
test('a new private state directory can be created without changing its existing ancestor', {skip:process.platform==='win32'}, t=>{
 const {dir}=storeFixture(t);fs.chmodSync(dir,0o755);const file=path.join(dir,'private','state.json');
 assert.equal(baselineTransaction(file,snapshot()).wrote,true);
 assert.equal(fs.statSync(dir).mode&0o777,0o755);assert.equal(fs.statSync(path.dirname(file)).mode&0o777,0o700);
});
test('invalid new snapshot cannot replace valid stored baseline',t=>{
 const {file}=storeFixture(t),bytes=JSON.stringify(snapshot());fs.writeFileSync(file,bytes);
 const out=baselineTransaction(file,{plugins:{}});assert.equal(out.wrote,false);assert.ok(out.writeError);assert.equal(fs.readFileSync(file,'utf8'),bytes);
});

test('direct baseline storage rejects shared directories and recovers only after explicit permission repair', {skip:process.platform==='win32'}, t=>{
 const {dir,file}=storeFixture(t), original=JSON.stringify(snapshot());fs.writeFileSync(file,original);fs.chmodSync(dir,0o755);
 assert.equal(readBaseline(file).status,'unavailable');
 assert.match(writeBaseline(file,snapshot()),/private|0700/);
 assert.equal(fs.statSync(dir).mode&0o777,0o755);assert.equal(fs.readFileSync(file,'utf8'),original);
 assert.deepEqual(fs.readdirSync(dir),['custom.json']);
 fs.chmodSync(dir,0o700);
 assert.equal(readBaseline(file).status,'valid');assert.equal(baselineTransaction(file,snapshot()).wrote,true);
});

test('baseline copy distinguishes absent history, incomplete checks, preview and a saved first record', t=>{
 const {file}=storeFixture(t),first=snapshot();
 const incomplete=baselineTransaction(file,first,{advance:false,skipReason:'incomplete'});
 assert.match(incomplete.note,/尚无可比较的历史记录/);
 assert.match(incomplete.note,/覆盖不完整/);
 assert.doesNotMatch(incomplete.note,/第一次|保留上次|保留已有/);
 assert.equal(fs.existsSync(file),false);
 const repeated=baselineTransaction(file,first,{advance:false,skipReason:'preview'});
 assert.match(repeated.note,/预览/);assert.doesNotMatch(repeated.note,/第一次|保留上次|保留已有/);
 const saved=baselineTransaction(file,first);
 assert.equal(saved.wrote,true);assert.match(saved.note,/已保存本次/);
 const bytes=fs.readFileSync(file);
 const retained=baselineTransaction(file,first,{advance:false,skipReason:'incomplete'});
 assert.match(retained.note,/保留已有对比记录/);assert.doesNotMatch(retained.note,/尚无|第一次|预览/);
 assert.deepEqual(fs.readFileSync(file),bytes);
});
