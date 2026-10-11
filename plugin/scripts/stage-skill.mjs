#!/usr/bin/env node
/**
 * 把**权威的** `skill/SKILL.md` 同步到 `plugin/skill/SKILL.md`。
 *
 * ## 为什么必须**提交**一份副本（而不是像 kernel/ 那样只在打包时暂存）
 *
 * `kernel/` 可以只在 `prepack` 时暂存，因为 `npm pack` **一定**会跑 `prepack`。
 * 但 `skill/` 不一样：**`dsh plugin add file:<repo>/plugin` 这条安装路径不跑 `prepack`**
 * —— pnpm 直接按 `package.json` 的 `files` 字段**复制**目录。
 *
 * 实测（这是本条修复的起因）：
 *
 * ```
 * 安装后 node_modules/dsh-plugin-compat-check/
 *   README.md  cordis.patch.yml  index.js  lib  package.json  scripts
 *                                       ↑ 没有 skill/
 * ```
 *
 * 于是 `readPackagedSkill()` 的三条候选路径全落空，宿主日志只有一句
 * `SKILL registration skipped: 找不到随包的 skill/SKILL.md` —— **静默失效**。
 * 而 skill 是本项目三类产物之一（决策 1）。
 *
 * ## 所以是「提交副本 + 守门测试」
 *
 * 副本会漂移，所以 `test/skill.test.mjs` 有一条断言：两份必须**逐字节相同**。
 * 这个模式在本仓库用过多次（`lib/version.mjs` ↔ `plugin/package.json`）：
 * **必须出现在多处 + 只能有一处真源 ⇒ 只能靠测试钉住。**
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, '..');
const REPO = path.resolve(PLUGIN, '..');
const SRC = path.join(REPO, 'skill', 'SKILL.md');
const DEST_DIR = path.join(PLUGIN, 'skill');
const DEST = path.join(DEST_DIR, 'SKILL.md');

if (!fs.existsSync(SRC)) {
  process.stderr.write(`[stage-skill] 找不到权威 skill：${SRC}\n`);
  process.exit(1);
}
const body = fs.readFileSync(SRC);

if (fs.existsSync(DEST) && Buffer.compare(fs.readFileSync(DEST), body) === 0) {
  process.stdout.write('[stage-skill] 已经是同一份，未改动\n');
  process.exit(0);
}
fs.mkdirSync(DEST_DIR, { recursive: true });
fs.writeFileSync(DEST, body);
process.stdout.write(`[stage-skill] 已同步 ${path.relative(REPO, DEST)}（${body.length} 字节）\n`);
