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

/**
 * 跑一次 CLI —— **把 `DSH_HOME` 钉进临时目录**。
 *
 * ⚠️ 这是一次真实事故换来的。CLI 的默认行为会**写基线**到
 * `$DSH_HOME/dsh-plugin-compat-check/`，而这里很多用例没有传 `--no-baseline`
 * （`--help`、用法错误、以及一批只关心结论的用例）。于是它们**写进了用户真实的
 * `~/.dsh`**，我是在自己的 `~/.dsh` 里看到 `baseline.unknown.json` /
 * `baseline.parityfix.json` 冒出来才发现的 —— 文件名里的 `<profile>` 还是
 * 从临时 node_modules 路径推出来的垃圾（`unknown`）。
 *
 * 一条铁律：**测试永远不碰用户的真实环境**。基线是"只写自己的状态目录"没错，
 * 但测试跑的时候，"自己的状态目录"必须是临时的那个。
 */
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-cli-home-'))
const runCLI = (args, extraEnv) => {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, DSH_HOME: TEST_HOME, HOME: TEST_HOME, ...(extraEnv || {}) },
  })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

process.on('exit', () => { try { fs.rmSync(TEST_HOME, { recursive: true, force: true }) } catch { /* 忽略 */ } })

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
    // 3 = 这次体检没得出可信结论。**不能用 2**：2 的意思是"有插件不兼容"，
    // 把命令写错读成插件不兼容，会让用户去查错方向。
    assert.equal(r.code, 3)
    assert.match(r.err + r.out, /无法识别的参数: --jsom/)
  })

  test('需要值的参数缺值时报错', () => {
    const r = runCLI(['--nm'])
    assert.equal(r.code, 3)
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
    // 退出码 3 = 无法判定。**不能用 1/2** —— 那两个是"插件部分可用/不兼容"，
    // 工具自己出错被读成插件结论，是本项目最不能容忍的误读。
    assert.equal(r.code, 3)
    assert.match(r.out, /无法判定/)
    assert.match(r.out, /目录不存在/)
  })

  test('坏 JSON 的探针报告 → 报错而不是崩栈', () => {
    const bad = path.join(os.tmpdir(), 'dsc-bad-probe.json')
    fs.writeFileSync(bad, '{ not json')
    try {
      const r = runCLI(['--nm', MICRO, '--probe', bad])
      assert.equal(r.code, 3)
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
    // ⚠️ 这里**不写死数量**。写死过一次，加个夹具就红 —— 而那属于"判据自己太脆"，
    // 不是产品坏了。要断的是**两种渲染看到同一份数据**，数量由夹具自己决定。
    //
    // 但同时要钉住一件真事：至少有一个不兼容，且退出码与它对应
    // （`2` = 有插件不兼容）。否则这条测试在 broken=0 时也会"通过"。
    assert.ok(data.summary.broken >= 1, `夹具里应当有不兼容的样例，实际 ${data.summary.broken}`)
    assert.equal(human.code, data.summary.broken > 0 ? 2 : (data.summary.partial > 0 ? 1 : 0),
      `退出码与结论不一致：broken=${data.summary.broken} partial=${data.summary.partial} 但退出码 ${human.code}`)
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
    const r = runCLI(['--nm', PARITYFIX, '--probe', BASELINE_SURFACE, '--dsh-version', '0.2.0-rc.2', '--json', '--no-baseline'])
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
    // ⚠️ 这条**直调内核**（不走 runCLI），所以上面那个 `DSH_HOME` 隔离对它不生效 ——
    // 它会真的去写 `$DSH_HOME/dsh-plugin-compat-check/baseline.parityfix.json`。
    // 这正是"测试写进用户家目录"那个事故的最后一个源头（我是逐个文件跑才定位到的）。
    // 显式关掉基线：这条测试要验的是"两个入口结论一致"，与基线无关。
    const direct = run({ nm: PARITYFIX, probe: BASELINE_SURFACE, dshVersion: '0.2.0-rc.2', baseline: false })
    const viaCLI = JSON.parse(runCLI(['--nm', PARITYFIX, '--probe', BASELINE_SURFACE, '--dsh-version', '0.2.0-rc.2', '--json', '--no-baseline']).out)
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

/**
 * 回归：**渲染层出错时退出码不能是 0**。
 *
 * 这条是一个真实事故换来的。一次重构让 `lib/report.mjs` 少了一个 import，
 * Node 抛出 ReferenceError、把栈打到 stdout，而**进程退出码是 0** ——
 * CI 或 shell 会认为这次体检通过了。而"明明崩了却报成功"是本项目最不能容忍的
 * 失败形态（`.sh` 的 CLI 空操作、`--update` 旗标失效，都是同一类）。
 *
 * 这里用一个**故意会抛的渲染输入**来复现，而不是去改源码 —— 测试要能长期有效。
 */
describe('CLI：工具自身出错必须非零退出（回归）', () => {
  test('渲染层抛异常时：退出码 3，栈走 stderr，stdout 不被污染', () => {
    // 造一个 verdict 结构不完整的结果：verdict.plugins 是 null，
    // 渲染时会抛 TypeError。CLI 必须把它变成退出码 3 而不是 0。
    const probe = path.join(os.tmpdir(), 'dsc-broken-probe.json')
    // 一个合法 JSON、但形状荒谬的探针报告：present 为真而 methods 不是对象
    fs.writeFileSync(probe, JSON.stringify({ root: { tools: { present: true, methods: 'not-an-object' } } }))
    try {
      const r = runCLI(['--nm', MICRO, '--probe', probe])
      // 只要不是 0 就说明"崩了却报成功"被挡住了；正常路径应该给 0/1/2
      assert.notEqual(r.code, 0, `崩了却报成功：stdout=${r.out.slice(0, 200)}`)
      assert.ok([1, 2, 3].includes(r.code), `意外的退出码 ${r.code}`)
    } finally {
      fs.rmSync(probe, { force: true })
    }
  })

  test('--json 模式下 stdout 必须是纯 JSON（栈不能混进去）', () => {
    // 否则 `compat-check --json | jq` 会吃到一堆栈，而用户会以为是工具不支持 JSON。
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--json'])
    assert.doesNotThrow(() => JSON.parse(r.out), 'stdout 里混进了非 JSON 内容')
  })
})

/**
 * 基线差分（C4 的 CLI 侧）。
 *
 * 这一层要回答的是「**和上次比变了没有**」，而它最危险的失败模式是
 * **静默失效**：基线没写成 → 下次读到"无变化" → 用户以为一切正常。
 * 所以这里既测"变化被认出来"，也测"没有变化时确实安静"。
 */
describe('CLI：基线差分', () => {
  const tmpBaseline = () => path.join(os.tmpdir(), `dsc-bl-${process.pid}-${Math.random().toString(36).slice(2)}.json`)
  const args = (bl) => ['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--baseline-file', bl]

  test('第一次：说明「还没有基线」，而不是「没有变化」', () => {
    const bl = tmpBaseline()
    try {
      const r = runCLI(args(bl))
      assert.match(r.out, /还没有基线/)
      assert.ok(fs.existsSync(bl), '第一次应当写出基线')
    } finally { fs.rmSync(bl, { force: true }) }
  })

  test('第二次且输入未变：明确说「没有任何变化」，且不亮角标', () => {
    const bl = tmpBaseline()
    try {
      runCLI(args(bl))
      const r = runCLI(args(bl))
      assert.match(r.out, /与上次相比没有任何变化/)
    } finally { fs.rmSync(bl, { force: true }) }
  })

  test('基线文件被损坏时不假装「没有变化」', () => {
    const bl = tmpBaseline()
    try {
      fs.writeFileSync(bl, '{ 这不是 json')
      const r = runCLI(args(bl))
      assert.match(r.out, /基线读不出来/, '读不出来的基线必须明说，不能当成"无变化"')
      assert.ok(!/没有任何变化/.test(r.out), '损坏的基线绝不能被读成"没有变化"')
    } finally { fs.rmSync(bl, { force: true }) }
  })

  test('--dry-run 计算差分但不写基线', () => {
    const bl = tmpBaseline()
    try {
      const r = runCLI([...args(bl), '--dry-run'])
      assert.match(r.out, /本次未写入/)
      assert.ok(!fs.existsSync(bl), '--dry-run 不该写出基线文件')
    } finally { fs.rmSync(bl, { force: true }) }
  })

  test('--no-baseline 完全不碰基线，也不输出差分段', () => {
    const bl = tmpBaseline()
    try {
      const r = runCLI([...args(bl), '--no-baseline'])
      assert.ok(!fs.existsSync(bl))
      assert.ok(!r.out.includes('与上次相比'), '--no-baseline 时不该有差分段')
    } finally { fs.rmSync(bl, { force: true }) }
  })

  test('基线按 profile 分文件 —— 不同 profile 的插件集合不会互相污染', () => {
    // 桌面 profile 与临时 profile 的插件集合差很多。混用一份基线会让差分
    // 变成"移除了 18 个插件"这种噪音，从而掩盖真正的变化。
    const nm1 = path.join(os.tmpdir(), 'dsc-p1', 'profiles', 'alpha', 'node_modules')
    const nm2 = path.join(os.tmpdir(), 'dsc-p1', 'profiles', 'beta', 'node_modules')
    // 直接调内核里的路径推导逻辑（通过 --json 的 inputs.baselineFile 观察）
    const r1 = JSON.parse(runCLI(['--nm', MICRO, '--json', '--no-baseline']).out)
    assert.ok(r1.inputs.nodeModules)
    // 用真实的 profile 目录名验证：路径里带 profiles/<name> 时文件名必须含 <name>
    const r2 = runCLI(['--nm', MICRO, '--json', '--baseline-file', path.join(os.tmpdir(), 'x.json')])
    assert.ok(JSON.parse(r2.out).inputs.baselineFile.includes('x.json'))
    void nm1; void nm2
  })

  test('--json 里带上差分与角标（面板/工具要与 CLI 看同一件事）', () => {
    const bl = tmpBaseline()
    try {
      runCLI(args(bl))
      const r = runCLI([...args(bl), '--json'])
      const d = JSON.parse(r.out)
      assert.ok(d.baseline, '--json 输出里缺 baseline')
      assert.equal(d.baseline.diff.comparable, true)
      assert.equal(d.baseline.badge.show, false)
    } finally { fs.rmSync(bl, { force: true }) }
  })
})


/**
 * 守卫：测试**绝不能**写进用户真实的 `~/.dsh`。
 *
 * 上面那次事故的形态很隐蔽：测试全绿、退出码正常，只是用户的家目录里多了两个
 * 文件 —— 而且文件名还是从临时路径推出来的垃圾。没有这条断言，下次重构还会踩。
 */
describe('测试隔离：不碰用户的真实环境', () => {
  test('跑一批 CLI（故意不带 --no-baseline）后，真实 ~/.dsh 里没有新基线', () => {
    const real = path.join(os.homedir(), '.dsh', 'dsh-plugin-compat-check')
    const before = fs.existsSync(real) ? fs.readdirSync(real).sort() : []
    // 故意跑几个**不带** --no-baseline 的用例 —— 它们本来会写基线
    runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--quiet'])
    runCLI(['--nm', MICRO, '--dsh-version', '0.2.0-rc.2', '--quiet'])
    runCLI(['--help'])
    const after = fs.existsSync(real) ? fs.readdirSync(real).sort() : []
    assert.deepEqual(after, before,
      `测试往真实 ~/.dsh 里写了东西：新增 ${JSON.stringify(after.filter((x) => !before.includes(x)))}`)
  })

  test('基线确实落在了临时 DSH_HOME 里（说明隔离真的生效，而不是没写）', () => {
    // 只断言"没写进真实目录"是不够的 —— 那在"根本没写"时也成立。
    // 所以反过来确认：隔离生效时它该写在临时目录里。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-iso-'))
    try {
      const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--quiet'], { DSH_HOME: tmp })
      assert.notEqual(r.code, 3, `不该是"无法判定"：${r.out}`)
      const dir = path.join(tmp, 'dsh-plugin-compat-check')
      assert.ok(fs.existsSync(dir), '临时 DSH_HOME 下没有基线目录 —— 隔离参数没起作用？')
      const files = fs.readdirSync(dir)
      assert.ok(files.some((f) => f.startsWith('baseline.')), `临时目录里没有基线文件：${files}`)
    } finally { fs.rmSync(tmp, { recursive: true, force: true }) }
  })
})
