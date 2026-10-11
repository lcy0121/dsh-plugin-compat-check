#!/usr/bin/env node
/**
 * `postpack` 钩子：清掉 `prepack` 暂存的内核副本。
 *
 * 为什么必须清：`plugin/kernel/` 是一份**会腐烂的重复实现**。
 * 留在工作区里，下次有人 `grep` 或 `read` 的时候就会读到一份
 * 与仓库根 `lib/` 可能已经不一致的内核 —— 那比没有更糟。
 * 它已进 `.gitignore`，但那只能防误提交，防不了误读。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.resolve(HERE, '..', 'kernel');

if (fs.existsSync(DEST)) {
  fs.rmSync(DEST, { recursive: true, force: true });
  process.stdout.write('[unstage-kernel] 已清掉暂存的内核副本\n');
}
