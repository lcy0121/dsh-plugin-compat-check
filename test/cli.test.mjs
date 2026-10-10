/**
 * CLI 形态的测试（`bin/compat-check.mjs`）。
 *
 * ## 为什么 CLI 需要自己的测试
 *
 * 三个入口（插件 / CLI / skill）共用一份内核，而**只有 CLI 是独立进程**：
 * 它有参数解析、有退出码、有两条输出通道（表 / JSON），还要能当别人脚本里的一步。
 * 这几样东西内核测试覆盖不到。而且本会话里已经踩过两次同类的坑：
 *   - `.sh` 的 `--json` 是个**死参数**（被解析、被写进用法、从没被用过）；
 *   - `node --test x.test.mjs --update` 的旗标**从未生效**而退出码正常。
 * 两者都是「命令接受了一个参数然后什么也没做」——
 * 所以这里重点测的正是**参数真的起了作用**、**失败不会被静默吞掉**。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { REPO } from './helpers.mjs'

const CLI = path.join(REPO, 'bin', 'compat-check.mjs')
const MICRO = path.join(REPO, 'test/fixtures/micro/node_modules')
const MICRO_SURFACE = path.join(REPO, 'test/fixtures/micro/host-surface.json')
const BASELINE_SURFACE = path.join(REPO, 'tools/parity/fixtures/host-surface-parityfix.json')
const PARITYFIX = path.join(os.homedir(), '.dsh/profiles/parityfix/node_modules')

const runCLI = (args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

describe('CLI：参数解析', () => {
  test('--help 打印用法并以 0 退出', () => {
    const r = runCLI(['--help'])
    assert.equal(r.code, 0)
    assert.match(r.out, /用法: node bin\/compat-check\.mjs/)
    assert.match(r.out, /--nm/)
    assert.match(r.out, /--probe/)
  })

  test('不给 --nm 时以非 0 退出并打印用法', () => {
    const r = runCLI([])
    assert.notEqual(r.code, 0)
    assert.match(r.out + r.err, /用法/)
  })

  test('未知参数**必须报错**，不能被忽略', () => {
    // 静默忽略会让 `--jsom` 这类拼写错误变成「跑完了但没有 JSON 输出」，
    // 而用户会以为工具不支持 JSON —— 一个静默空操作的典型形态。
    const r = runCLI(['--nm', MICRO, '--jsom'])
    assert.equal(r.code, 2)
    assert.match(r.err + r.out, /无法识别的参数: --jsom/)
  })

  test('需要值的参数缺值时报错', () => {
    const r = runCLI(['--nm'])
    assert.equal(r.code, 2)
    assert.match(r.err + r.out, /需要一个值/)
  })
})

describe('CLI：结论与退出码', () => {
  test('合成 fixture：结论与判据层一致，且退出码反映最坏结论', () => {
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2'])
    // fixture 里有 broken（@fixture/pending 缺硬依赖、@fixture/missingservice）→ 退出码 2
    assert.equal(r.code, 2, `退出码应为 2（有不兼容）。输出：\n${r.out}`)
    assert.match(r.out, /不兼容/)
    assert.match(r.out, /dsh-plugin-compat-check 的说明|说明:/)
  })

  test('没有运行时面时，方法级结论必须标「疑似」', () => {
    // 这是三档确定性判据的核心：官方目录是**契约**目录，不是运行时面。
    // 拿它断言「方法不存在」不够格叫确定 —— 不标就是撒谎。
    const r = runCLI(['--nm', MICRO, '--dsh-version', '0.2.0-rc.2'])
    assert.match(r.out, /有运行时面: 否/)
    assert.match(r.out, /\[疑似\]/)
  })

  test('给了运行时面时，方法级结论是确定的（不再标疑似）', () => {
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2'])
    assert.match(r.out, /有运行时面: 是/)
    // @fixture/fatalmethod 的 installSection 在运行时面里不存在 → 确定
    const line = r.out.split('\n').find((l) => l.includes('settings.installSection'))
    assert.ok(line, '应当报出 settings.installSection')
    assert.ok(!line.includes('[疑似]'), `有运行时面时不该标疑似：${line}`)
  })

  test('不存在的目录 → 无法判定，退出码 1，且说明原因', () => {
    const r = runCLI(['--nm', '/tmp/definitely-not-here-xyz'])
    assert.equal(r.code, 1)
    assert.match(r.out, /无法判定/)
    assert.match(r.out, /目录不存在/)
  })

  test('坏 JSON 的探针报告 → 报错而不是崩栈', () => {
    const bad = path.join(os.tmpdir(), 'dsc-bad-probe.json')
    fs.writeFileSync(bad, '{ not json')
    try {
      const r = runCLI(['--nm', MICRO, '--probe', bad])
      assert.equal(r.code, 1)
      assert.match(r.out, /无法判定/)
      assert.match(r.out, /探针报告/)
      // 关键：不能是未捕获异常的栈
      assert.ok(!/at Object\.|at Module\.|<anonymous>/.test(r.out), '不该把栈打给用户')
    } finally {
      fs.rmSync(bad, { force: true })
    }
  })
})

describe('CLI：--json 真的产出 JSON（不是被静默忽略）', () => {
  test('--json 输出可解析的 JSON，且含 summary / plugins / 位置', () => {
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--json'])
    let data
    assert.doesNotThrow(() => { data = JSON.parse(r.out) }, `--json 的输出不是合法 JSON：\n${r.out.slice(0, 300)}`)
    assert.ok(data.summary, '缺 summary')
    assert.ok(data.plugins, '缺 plugins')
    assert.ok(data.extraction, '缺 extraction 摘要')
    assert.equal(data.dshVersion, '0.2.0-rc.2')
  })

  test('--json 的结论与给人看的表一致（同一份数据两种渲染）', () => {
    const args = ['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2']
    const human = runCLI(args)
    const json = runCLI([...args, '--json'])
    const data = JSON.parse(json.out)
    // 退出码必须一致 —— 否则 CI 用 --json 时会得到与本地不同的信号
    assert.equal(json.code, human.code, '--json 与表格形式的退出码必须一致')
    assert.equal(data.summary.broken, 2, `期望 2 个不兼容，实际 ${data.summary.broken}`)
  })

  test('--quiet 只输出结论行，不含逐条发现', () => {
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--quiet'])
    assert.match(r.out, /结论:/)
    assert.ok(!r.out.includes('影响:'), '--quiet 不该输出逐条影响')
    assert.ok(!r.out.includes('依据:'), '--quiet 不该输出依据')
  })
})

describe('CLI：真实插件（三个回归基准）', { skip: fs.existsSync(PARITYFIX) ? false : '本机没有 parityfix profile' }, () => {
  test('三个回归基准的结论与 Plan.md §5 G1 一致', () => {
    const r = runCLI(['--nm', PARITYFIX, '--probe', BASELINE_SURFACE, '--dsh-version', '0.2.0-rc.2', '--json'])
    const data = JSON.parse(r.out)
    assert.equal(data.plugins['@omdsh-dev/dsh-plugin-check'].verdict, 'ok')
    assert.equal(data.plugins['dsh-pet'].verdict, 'ok')
    const ka = data.plugins['dsh-keep-awake']
    assert.equal(ka.verdict, 'partial')
    const found = ka.findings.map((f) => `${f.service}.${f.method}@${f.location.file}:${f.location.line}`).sort()
    assert.deepEqual(found, [
      'jobs.onJobsChanged@lib/index.js:591',
      'settings.register@lib/index.js:466',
    ])
  })

  test('CLI 的结论与内核直接调用逐字段一致（不可能有两份答案）', async () => {
    const { run } = await import('../bin/compat-check.mjs')
    const direct = run({ nm: PARITYFIX, probe: BASELINE_SURFACE, dshVersion: '0.2.0-rc.2' })
    const viaCLI = JSON.parse(runCLI(['--nm', PARITYFIX, '--probe', BASELINE_SURFACE, '--dsh-version', '0.2.0-rc.2', '--json']).out)
    assert.deepEqual(
      Object.keys(viaCLI.plugins).sort(),
      Object.keys(direct.verdict.plugins).sort(),
      'CLI 与 import 的插件集合不同 —— 两个入口出现了分叉',
    )
    for (const [name, p] of Object.entries(direct.verdict.plugins)) {
      assert.equal(viaCLI.plugins[name].verdict, p.verdict, `${name} 的结论在 CLI 与 import 之间不一致`)
      assert.equal(viaCLI.plugins[name].findings.length, p.findings.length, `${name} 的发现数不一致`)
    }
  })
})
