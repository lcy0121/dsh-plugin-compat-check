#!/usr/bin/env node
/**
 * Stage the single-source lib/rules tree into the npm plugin. Include transitive
 * AST, observation, state and worker modules; only opt-in process/browser runners
 * are excluded. Root LICENSE is copied at pack time. Kernel copies are ignored
 * and postpack removes them; independent artifact execution tests completeness.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..');
const DEST = path.join(PLUGIN, 'kernel');

// 插件半边真正 import 的内核模块（改 index.js 的 import 时要同步这里）
const KERNEL_LIBS = fs.readdirSync(path.join(REPO,'lib')).filter(f=>f.endsWith('.mjs')&&!['probe-runner.mjs','debugger.mjs'].includes(f)).sort();

function bail(message) {
  process.stderr.write(`[stage-kernel] ${message}\n`);
  process.exit(1);
}

if(!KERNEL_LIBS.includes('version.mjs'))bail('缺少必需的 lib/version.mjs');

if (!fs.existsSync(path.join(REPO, 'lib', 'extract.mjs'))) {
  bail(`在 ${REPO}/lib 下找不到内核 —— prepack 必须在仓库检出里跑`);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'lib'), { recursive: true });
fs.mkdirSync(path.join(DEST, 'rules'), { recursive: true });

fs.copyFileSync(path.join(REPO,'LICENSE'),path.join(PLUGIN,'LICENSE'));

for (const f of KERNEL_LIBS) {
  const src = path.join(REPO, 'lib', f);
  if (!fs.existsSync(src)) bail(`缺少内核模块 lib/${f}`);
  fs.copyFileSync(src, path.join(DEST, 'lib', f));
}
for (const f of fs.readdirSync(path.join(REPO, 'rules'))) {
  const src = path.join(REPO, 'rules', f);
  if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(DEST, 'rules', f));
}

// 自证：找不到就是打个不自足的包，**必须在打包前就失败**，而不是等用户装上才发现
for (const f of KERNEL_LIBS) {
  if (!fs.existsSync(path.join(DEST, 'lib', f))) bail(`暂存后仍找不到 lib/${f}`);
}
if (!fs.existsSync(path.join(DEST, 'rules', 'dsh-api-catalog.json'))) {
  bail('暂存后仍找不到 rules/dsh-api-catalog.json');
}

process.stdout.write(`[stage-kernel] 内核已暂存到 ${path.relative(REPO, DEST)}/（打包后会由 postpack 清掉）\n`);
