#!/usr/bin/env node
/** Explicit test discovery works on Node 22 as well as newer directory runners. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join('test',f));
const child=spawn(process.execPath,['--test',...process.argv.slice(2),...files],{cwd:root,stdio:'inherit'});
child.once('error',error=>{console.error(error.message);process.exitCode=1;});
child.once('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
