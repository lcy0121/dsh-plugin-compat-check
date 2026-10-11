/**
 * 「单版本」这个承诺的守门人。
 *
 * ## 它在守什么
 *
 * Plan.md §2 第 9 题锁定的是「单仓库、**单版本**、一份 Node 内核、三个入口」。
 * 实测下来这条**从来没兑现过**：`plugin/package.json` 是 `0.0.1`，而 CLI、`.sh`、
 * 报告 JSON 里**一个版本号都没有**。
 *
 * 后果不是"不好看"，是**结论无法追溯**：用户拿着一条「`dsh-keep-awake` 部分可用」
 * 来问"凭什么"，第一句必须问"你用的是哪一版工具" —— 而那个问题当时无解。
 * 同一个插件，规则表覆盖变了、提取器修了假阳性之后结论都会变。
 *
 * ## 为什么需要这么多条断言去守一个常量
 *
 * 因为版本号**必须出现在多个地方**，而那些地方各有各的理由：
 *
 * | 位置 | 为什么必须有 | 谁能读到 |
 * |---|---|---|
 * | `lib/version.mjs` | **唯一真源** | 内核 / CLI / `.sh` |
 * | `plugin/package.json` | npm 只认字面量 | npm / DSH 装载器 |
 * | `probe/package.json` | 探针以 `file:` 装进临时 profile | pnpm |
 * | 报告 JSON 的 `toolVersion` | 结论要可追溯 | 用户 / CI |
 *
 * 「必须出现在多处」+「只能有一处真源」⇒ **只能靠测试把它们钉在一起**。
 * 少了这一层，下一次改版本时必然只改其中一处 —— 而没有人会发现。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOOL_VERSION, versionLine } from '../lib/version.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const readJSON = (rel) => JSON.parse(read(rel))

describe('单版本：一处真源，多处出现，全部钉住', () => {
  test('真源本身是一个合法的语义化版本', () => {
    assert.match(TOOL_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      `TOOL_VERSION 不是合法 semver: ${TOOL_VERSION}`)
    assert.equal(versionLine(), `dsh-plugin-compat-check ${TOOL_VERSION}`)
  })

  test('每个 package.json 的 version 都等于真源', () => {
    // 任何一处漏改，这里会直接告诉你改哪个文件的哪个字段。
    const pkgs = ['plugin/package.json', 'probe/package.json', 'tools/slot-probe/package.json']
    const bad = []
    for (const rel of pkgs) {
      const v = readJSON(rel).version
      if (v !== TOOL_VERSION) bad.push(`${rel}: ${v}（应为 ${TOOL_VERSION}）`)
    }
    assert.deepEqual(bad, [],
      `这些 package.json 的版本与 lib/version.mjs 不一致：\n  ${bad.join('\n  ')}\n`
      + `改 lib/version.mjs 时必须同时改它们 —— 否则同一次发布里两个产物报不同版本。`)
  })

  test('CLI 的 --version 报真源，且不需要 --nm（也不碰任何状态）', () => {
    const r = spawnSync(process.execPath, ['bin/compat-check.mjs', '--version'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0, `--version 应当 exit 0，实际 ${r.status}\n${r.stderr}`)
    assert.equal(r.stdout.trim(), versionLine())
  })

  test('CLI 的 --help 顶部也带版本（求助的人第一眼就该知道是哪一版）', () => {
    const r = spawnSync(process.execPath, ['bin/compat-check.mjs', '--help'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0)
    assert.ok(r.stdout.includes(versionLine()), '--help 里看不到版本行')
  })

  test('报告 JSON 的 toolVersion = 真源（成功路径与出错路径都要有）', () => {
    const run = (args) => {
      const r = spawnSync(process.execPath, ['bin/compat-check.mjs', ...args],
        { cwd: REPO, encoding: 'utf8' })
      // 退出码不是 0 也正常（micro fixture 里有不兼容的包），只要有 JSON
      return JSON.parse(r.stdout)
    }
    const ok = run(['--nm', 'test/fixtures/micro/node_modules',
      '--probe', 'test/fixtures/micro/host-surface.json', '--no-baseline', '--json'])
    assert.equal(ok.toolVersion, TOOL_VERSION, '成功路径的报告里没有正确的 toolVersion')
    // `dshVersion` 是**被体检的对象**的版本，与 toolVersion 是两件事 ——
    // 混为一谈会让"工具版本"永远查不出来。
    assert.notEqual(ok.toolVersion, ok.dshVersion, 'toolVersion 不该等于 dshVersion')

    const bad = run(['--nm', '/nonexistent-path-for-version-test', '--no-baseline', '--json'])
    assert.ok(bad.error, '这条断言需要一个出错路径，输入变了就跟着改')
    assert.equal(bad.toolVersion, TOOL_VERSION,
      '出错路径的报告里也要有 toolVersion —— 用户拿一份 error 来问的时候，'
      + '"哪一版工具没跑成"同样是他要的第一个信息')
  })

  test('编排脚本的 --version 也报同一个版本（且不需要内核在跑）', () => {
    const r = spawnSync('bash', ['dsh-plugin-compat-check.sh', '--version'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0, `--version 应当 exit 0，实际 ${r.status}\n${r.stderr}`)
    assert.ok(r.stdout.includes(TOOL_VERSION),
      `编排脚本报的版本里没有 ${TOOL_VERSION}：${JSON.stringify(r.stdout)}`)
  })

  test('没有内核时脚本说"版本未知"，而不是猜一个数', () => {
    // 一份**错的**可追溯信息比"不知道"更糟：用户会拿它去比对、
    // 会以为"我用的就是 0.1.0"，然后按那个版本的已知问题去排查一个不存在的 bug。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-ver-'))
    try {
      fs.copyFileSync(path.join(REPO, 'dsh-plugin-compat-check.sh'),
        path.join(tmp, 'dsh-plugin-compat-check.sh'))
      const r = spawnSync('bash', [path.join(tmp, 'dsh-plugin-compat-check.sh'), '--version'],
        { cwd: tmp, encoding: 'utf8' })
      assert.equal(r.status, 0, '报版本不该因为找不到内核而失败')
      assert.ok(!/\b\d+\.\d+\.\d+\b/.test(r.stdout),
        `没有内核时**不能**报出一个版本号（那会是无中生有）：${JSON.stringify(r.stdout)}`)
      assert.ok(r.stdout.includes('版本未知'), `应当明说版本未知：${JSON.stringify(r.stdout)}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('prepack 会带上 version.mjs（否则装好的包报不出自己的版本）', () => {
    const script = read('plugin/scripts/stage-kernel.mjs')
    assert.match(script, /version\.mjs/,
      'stage-kernel.mjs 的 KERNEL_LIBS 里没有 version.mjs —— '
      + '打出来的自足包装上去之后 `--version` 会失败或报错版本')
    // 也确认它真的在现成内核里
    assert.ok(fs.existsSync(path.join(REPO, 'lib/version.mjs')))
  })
})
