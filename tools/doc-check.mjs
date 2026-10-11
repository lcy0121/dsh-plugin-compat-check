#!/usr/bin/env node
/**
 * 「文档信息」的**全量**校验器 —— 包含测试层做不到的那一项。
 *
 * ## 为什么不能放在测试里
 *
 * 要验「文档写的断言条数 = 实测」，就得跑一遍测试套件。而**在测试文件里跑套件会自己调自己**：
 * 子进程会把 `test/docs.test.mjs` 也再跑一遍 → 无限递归。实测踩到过（一跑就挂）。
 *
 * 所以拆成两半：
 *
 * | 在哪 | 验什么 |
 * |---|---|
 * | `test/docs.test.mjs` | **便宜且不递归**的：文件数、编号连续性、交叉引用、跨文档一致性、旗标清单 |
 * | 本脚本（独立进程） | 需要**跑一次套件**才能拿到的：断言条数 |
 *
 * ## 用法
 *
 *     node tools/doc-check.mjs          # 校验，不一致就 exit 1
 *     node tools/doc-check.mjs --quiet  # 只报结论
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const quiet = process.argv.includes('--quiet');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/** 用户定义的「文档信息」 */
const COUNT_DOCS = ['README.md', 'README.en.md', 'README.ko.md', 'Plan.md'];

function realAssertionCount() {
  const out = execFileSync(process.execPath, ['--test', 'test/'], {
    cwd: REPO, encoding: 'utf8', timeout: 600000,
  });
  // ⚠️ 别用 `^ℹ tests (\d+)$` 配 `\b`：韩语/符号边界的坑见 doc 里那次教训。
  // 这里直接找 `tests N` 这个形态。
  const m = /ℹ tests (\d+)/.exec(out);
  if (m === null) throw new Error('拿不到测试条数 —— `node --test` 的输出格式变了？');
  return Number(m[1]);
}

function main() {
  const assertions = realAssertionCount();
  const problems = [];

  for (const rel of COUNT_DOCS) {
    const s = read(rel);
    // 抓所有「N 条断言 / N assertions / N개 단언」形态
    const nums = [...s.matchAll(/(\d+)\s*(?:条断言|assertions|개 단언)/g)].map((m) => Number(m[1]));
    const wrong = [...new Set(nums.filter((n) => n !== assertions))];
    if (wrong.length) {
      problems.push(`${rel}: 写了 ${wrong.join(' / ')}，实测 ${assertions}`);
    }
  }

  if (!quiet) {
    process.stdout.write(`实测断言条数: ${assertions}\n`);
    process.stdout.write(`校验文档: ${COUNT_DOCS.join(', ')}\n`);
  }

  if (problems.length) {
    process.stderr.write(`\n❌ 文档里的断言条数与实测不符：\n`);
    for (const p of problems) process.stderr.write(`   ${p}\n`);
    process.stderr.write(
      `\n文档里的数字**不会自己更新**。实测就是这么烂的：同一次改动只改了其中一处，`
      + `于是同一份 README 里 250 行写 230、297 行写 221。\n`
      + `修法：把这 4 份里的数字统一改成 ${assertions}。\n`,
    );
    process.exit(1);
  }

  process.stdout.write(`✅ 四份文档的断言条数一致（${assertions}）\n`);
}

main();
