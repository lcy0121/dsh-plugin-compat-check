#!/usr/bin/env node
/**
 * `prepublishOnly` 钩子 —— 发布前把两类**不可挽回**的错误挡在门外。
 *
 * ## 为什么必须有它
 *
 * npm 发布是**公开且近乎不可撤回**的。而有两类错误一旦发出去就只能靠发新版弥补：
 *
 * ① **版本号与内核不一致**。版本的真源是 `lib/version.mjs`，但 `package.json`
 *    只能写字面量（npm 只认字面量）。改了一处忘了另一处，发布出去的就是
 *    「包的版本是 A、它自己 `--version` 报 B」—— 而这恰恰是这次发布的**主题**
 *    （见 docs/Plan.md §1、§6：「单版本」）。
 *
 * ② **测试没过就发**。`npm publish` 默认**不跑测试**。测试没过的包发出去，
 *    用户拿到的是我们已知有问题的版本，而他还以为那是"刚发布的最新版"。
 *
 * ## 为什么不用 `npm test` 那种写法
 *
 * 这个包发布时人在**仓库里**（`plugin/` 的上一级就是仓库根），
 * 所以能直接跑仓库的测试套件。但 `files` 字段里不含 `test/` ——
 * 也就是说这个脚本**不能**假设测试文件在包内，必须从仓库根跑。
 * 这正是"发布时必须从仓库检出里发"这条约束的技术原因。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..');

async function fail(lines) {
  // CI captures stderr through a pipe. Wait for the complete diagnostic to drain
  // before exiting, including failures near the end of a large TAP transcript.
  await new Promise((resolve, reject) => process.stderr.write(
    `\n✗ 发布前检查未通过，已中止：\n\n${lines.join('\n')}\n\n发布是不可撤回的。修好再发。\n`,
    error => error ? reject(error) : resolve(),
  ));
  process.exit(1);
}

// ── ① 仓库在不在旁边 ──
if (!fs.existsSync(path.join(REPO, 'lib', 'version.mjs'))) {
  await fail([
    `在 ${REPO} 下找不到 lib/version.mjs。`,
    '这个包必须在**仓库检出里**发布（它需要内核来核对版本、跑测试）。',
  ]);
}

// ── ② 版本一致 ──
const kernel = await import(pathToFileURL(path.join(REPO,'lib','version.mjs')).href);
const pkg = JSON.parse(fs.readFileSync(path.join(PLUGIN, 'package.json'), 'utf8'));
if (pkg.version !== kernel.TOOL_VERSION) {
  await fail([
    `版本不一致：`,
    `  plugin/package.json  version = ${pkg.version}`,
    `  lib/version.mjs      TOOL_VERSION = ${kernel.TOOL_VERSION}`,
    '',
    `  真源是 lib/version.mjs。改它的时候必须同时把 plugin/package.json 改成同一个值 ——`,
    '  否则发出去的包会「自己的版本是 A、--version 报 B」。',
  ]);
}

// ── ③ 私有标记必须已经去掉（否则 npm 会拒绝，报错还绕） ──
if (pkg.private === true) {
  await fail([
    'plugin/package.json 里还写着 `"private": true`，npm 会拒绝发布。',
    '  要去掉它 —— 但**先确认版本号已经定下来**（见 docs/Plan.md §1、§6）。',
  ]);
}

// ── ④ 测试必须全过 ──
const summaryDir=fs.mkdtempSync(path.join(os.tmpdir(),'dsc-release-'));
const file=process.env.DSC_TEST_TAP ? path.resolve(process.env.DSC_TEST_TAP) : path.join(summaryDir,'tests.tap');
const stderrFile=`${file}.stderr`;
let stage='tests';
try {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const stdout=fs.openSync(file,'w'),stderr=fs.openSync(stderrFile,'w');
  try {
    // Write directly to files so a failing suite survives both pipe truncation
    // and execFileSync's output buffer limit. Keep the transcript for artifacts.
    execFileSync(process.execPath, ['tools/run-tests.mjs','--test-reporter=tap'], {
      cwd: REPO, stdio: ['ignore', stdout, stderr], timeout: 600000,env:{...process.env,DSH_HOME:path.join(summaryDir,'state')},
    });
  } finally {fs.closeSync(stdout);fs.closeSync(stderr);}
  stage='docs';
  execFileSync(process.execPath,['tools/doc-check.mjs','--test-summary',file],{cwd:REPO,stdio:'pipe'});
} catch (error) {
  const out = stage==='tests'
    ? [file,stderrFile].filter(p=>fs.existsSync(p)).map(p=>fs.readFileSync(p,'utf8')).join('')
    : `${error.stdout ?? ''}${error.stderr ?? ''}`;
  await fail(['仓库的测试或文档检查没有全过：', '', out.trim() || error.message || String(error), '',
    `  完整测试输出：${file}`,`  测试标准错误：${stderrFile}`,
    '  跑 `npm test` 看全部输出。']);
}

fs.rmSync(summaryDir,{recursive:true,force:true});
process.stdout.write(
  `✓ 发布前检查通过：version=${pkg.version}，测试全过\n`,
);
