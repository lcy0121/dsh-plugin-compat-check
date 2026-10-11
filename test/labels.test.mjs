/**
 * 标注集对账的**慢测试**：真的起一次宿主，用 loader 的真值核对工具的致命声明。
 *
 * 默认跳过（要起宿主，约 30~60 秒），用 `DSC_SLOW=1` 跑：
 *
 *     DSC_SLOW=1 node --test test/labels.test.mjs
 *
 * ## 这一层守的是什么
 *
 * 本工具向用户承诺三层，而**只有第一层有机器真值**：
 *
 * | 层 | 真值 |
 * |---|---|
 * | ① 宿主未激活 | ✅ `entry.fiber.state` —— 宿主自己说的 |
 * | ② 静默降级 | ❌ 没有 —— 要人试一次 |
 * | ③ 客户端半边 | ⚠️ 需要浏览器 |
 *
 * 本文件测的**只是第 ① 层**。**不要把它读成"准确性已验证"** ——
 * 第 ② 层才是这个工具唯一的卖点，而它在这里完全没被覆盖。
 * 这条范围声明写在断言里，也写在 `tools/labels.mjs` 的输出里。
 *
 * ## 为什么用合成正例
 *
 * 实测本机两个真实 profile：**0 个 PENDING、0 个 FAILED** —— 一个正例都没有，
 * 召回率无从谈起。所以"病例"由我们安排（`test/fixtures/labels/`），
 * 而**真值仍然来自宿主**。这个区别很要紧：真值若来自我们的期望，
 * 就变成了自己给自己打分。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const SLOW = process.env.DSC_SLOW === '1'
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const WEB = path.join(HOME, 'profiles', 'web')

/** 见 `test/probe-boot.test.mjs` 的同款说明：默认跳过也要**说出来**，不能静默消失。 */
if (!SLOW && !process.env.DSC_QUIET_SKIP_NOTICE) {
  process.stderr.write(
    '[labels] 慢测试已跳过（真的起一次宿主对账 label，约 30~60 秒）。'
    + '要跑：DSC_SLOW=1 node --test test/labels.test.mjs\n',
  )
}

describe('标注集：用 loader 的真值核对「未激活」那一层的声明', {
  skip: !SLOW
    ? '慢测试：设 DSC_SLOW=1 才跑（要起一次宿主）'
    : (!fs.existsSync(WEB) ? `本机没有 web 模板 profile（${WEB}）—— 合成 profile 需要它` : false),
}, () => {
  test('合成正负例的双向对账：该报 fatal 的要报、不该报的不能报', () => {
    const out = execFileSync(process.execPath,
      ['tools/labels.mjs', '--nm', 'web', '--synthetic', '--json'],
      { cwd: REPO, encoding: 'utf8', timeout: 600000, env: process.env })
    const r = JSON.parse(out)

    // 范围自证：这份报告必须**明说自己没覆盖哪两层** ——
    // 一个不写范围的"准确率"会被读成全链路的准确率。
    assert.equal(r.coveredLayer, '① 宿主未激活（loader 自己的条目状态）')
    assert.ok(r.notCovered.some((x) => x.includes('静默降级')),
      '范围声明里少了"静默降级没覆盖" —— 那正是最容易被人默认已经验过的一层')

    // 真值确实来自宿主：条目状态里必须有正例，否则这个度量什么都没测
    const byState = r.loaderTotals.byState
    assert.ok((byState.PENDING ?? 0) + (byState.FAILED ?? 0) > 0,
      `loader 里一个正例都没有（byState=${JSON.stringify(byState)}）—— `
      + `这时"0 个漏报"是空话：没有正例可漏。合成夹具没装上？`)

    // 双向都要干净。任一方向出问题都说明工具的核心声明错了。
    assert.equal(r.tally['false-negative'] ?? 0, 0,
      `漏报：有一些条目标签是 PENDING/FAILED，而工具没报致命。\n`
      + JSON.stringify(r.rows.filter((x) => x.verdict === 'false-negative'), null, 1))
    assert.equal(r.tally['false-positive'] ?? 0, 0,
      `假阳性：工具说"会停在 pending"，而 loader 说它 ACTIVE。\n`
      + JSON.stringify(r.rows.filter((x) => x.verdict === 'false-positive'), null, 1))

    // 至少得有一个真阳性 —— 否则说明夹具没造出正例，上面两条 assert 就都是空的
    assert.ok((r.tally['true-positive'] ?? 0) > 0,
      `一个真阳性都没有：合成正例没被工具认出来，或者它根本没起不来。\n`
      + JSON.stringify(r.rows, null, 1))
  })
})
