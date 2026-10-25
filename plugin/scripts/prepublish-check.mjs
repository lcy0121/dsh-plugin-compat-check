#!/usr/bin/env node
/** Local-only publication gate: source checkout, consistent version, successful tests and document checks. Never publishes. */

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
