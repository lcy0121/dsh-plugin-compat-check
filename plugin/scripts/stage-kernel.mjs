#!/usr/bin/env node
/**
 * `prepack` 钩子：把仓库内核（`../lib` + `../rules`）暂存进 `plugin/kernel/`，
 * 好让 `npm pack` / `npm publish` 产出的包**自足**。
 *
 * ## 为什么需要暂存，而不是直接把 kernel/ 提交进仓库
 *
 * 内核只有一份真源（仓库根的 `lib/` 与 `rules/`）。如果在 `plugin/kernel/` 里
 * **再放一份**并提交，那就是两份实现 —— 而"两份实现迟早漂移"正是这个项目
 * 从第一天起就在避免的事（见 Plan.md §2 第 6 题：否决双实现）。
 *
 * 所以内核**从不出现在 git 里**，只在 `npm pack` 的那几秒存在。
 * `plugin/kernel/` 已进 `.gitignore`，`postpack` 负责清掉。
 *
 * ## 为什么 `lib/` 只取三个文件
 *
 * 插件半边只 import `extract` / `verdict` / `baseline`（见 index.js 的 `resolveKernelDir` 调用点）。
 * `report.mjs` 是 CLI 的渲染层，插件半边不用它 —— 少打一个文件就少一处漂移面。
 * 但它**不影响正确性**（多打一个也无害），所以这里是"按实际 import 收窄"，
 * 而不是"少打能省空间"。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..');
const DEST = path.join(PLUGIN, 'kernel');

// 插件半边真正 import 的内核模块（改 index.js 的 import 时要同步这里）
const KERNEL_LIBS = ['extract.mjs', 'verdict.mjs', 'baseline.mjs'];

function bail(message) {
  process.stderr.write(`[stage-kernel] ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(path.join(REPO, 'lib', 'extract.mjs'))) {
  bail(`在 ${REPO}/lib 下找不到内核 —— prepack 必须在仓库检出里跑`);
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, 'lib'), { recursive: true });
fs.mkdirSync(path.join(DEST, 'rules'), { recursive: true });

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
