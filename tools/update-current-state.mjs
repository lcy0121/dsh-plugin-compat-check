#!/usr/bin/env node
/** Regenerate current facts. Keep current counts and concise acceptance summaries; detailed history stays in Git. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {TOOL_VERSION} from '../lib/version.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const i=process.argv.indexOf('--test-summary');
if(i<0)throw new Error('Supply --test-summary <successful TAP log>');
const log=fs.readFileSync(process.argv[i+1],'utf8');
const tests=Number(/^# tests (\d+)/m.exec(log)?.[1]),failed=Number(/^# fail (\d+)/m.exec(log)?.[1]);
if(!Number.isFinite(tests)||failed!==0)throw new Error('Refusing to record a missing or failing test result');
const files=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(f=>f && fs.existsSync(path.join(root,f))))];
const fixtures=files.filter(f=>f.includes('node_modules/')||f==='test/fixtures/micro/host-surface.json');
const previous=JSON.parse(fs.readFileSync(path.join(root,'docs/current-state.json'),'utf8'));
const state={toolVersion:TOOL_VERSION,recordedAt:new Date().toISOString(),testFiles:fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).length,tests,
 repositoryFiles:{total:files.length,fixtures:fixtures.length,other:files.length-fixtures.length},
 verification:{...previous.verification,platform:process.platform,arch:process.arch,optionalProfiles:{parityfix:fs.existsSync(path.join(os.homedir(),'.dsh/profiles/parityfix/node_modules')),desktop:fs.existsSync(path.join(os.homedir(),'.dsh/profiles/desktop/node_modules'))}},
 scope:'Default-suite counts from the supplied TAP log; optional profiles depend on local inputs. Concise dated local acceptance is preserved, not rerun by this script; detailed history stays in Git.'};
fs.writeFileSync(path.join(root,'docs/current-state.json'),JSON.stringify(state,null,2)+'\n');
console.log(`Recorded ${tests} tests / ${state.testFiles} test files / ${files.length} repository files`);
