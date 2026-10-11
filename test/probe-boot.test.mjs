/**
 * `--probe-boot` 的**慢测试**：真的起一次宿主。
 *
 * ## 为什么单独一个文件、而且默认跳过
 *
 * 它要复制 profile、跑一次 pnpm、起一个宿主进程、轮询等报告 —— 实测
 * parityfix 约 9 秒、desktop 约 18 秒。把这种测试混进 `node --test test/`，
 * 等于让**每次**跑测试都多等十几秒，而绝大多数改动跟"能不能起宿主"无关。
 * 于是它会被人学会跳过 —— 那和没有这条测试是一样的。
 *
 * 所以：**默认 `skip`，要跑就显式开**。
 *
 *     DSC_SLOW=1 node --test test/probe-boot.test.mjs
 *
 * 需要本机存在 `parityfix` profile（它装了三个回归基准插件）。
 *
 * ## 它守的是"参数契约测试守不到"的那一半
 *
 * `test/cli.test.mjs` 里那 5 条钉的是参数与用法（秒级、任何机器都能跑）。
 * 这一条钉的是**真的起得来吗** —— 参数对了但流程跑不通，只有真跑一次才知道：
 * 复制 profile、装探针进 bundles、services.json 被探针读到、报告写得出来、
 * **临时 profile 被清掉**。最后一条尤其重要：一个会往用户 `~/.dsh/profiles`
 * 里留垃圾的工具，用户是不会再跑第二次的。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { REPO } from './helpers.mjs'

const CLI = path.join(REPO, 'bin', 'compat-check.mjs')
const REAL_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const PARITYFIX = path.join(REAL_HOME, 'profiles', 'parityfix', 'node_modules')
const SLOW = process.env.DSC_SLOW === '1'

const skip = !SLOW
  ? '慢测试：设 DSC_SLOW=1 才跑（默认跑一次要十几秒）'
  : (!fs.existsSync(PARITYFIX) ? `本机没有 parityfix profile（${PARITYFIX}）` : false)

// ⚠️ 让"这里有一条被跳过的慢测试"**可见**。
// `describe(..., {skip})` 的后果是 `node --test` 报 `tests 0` —— 文件像不存在一样，
// 读输出的人根本不知道有这条测试、也不知道怎么跑它。那是**静默消失的测试**，
// 与"没有这条测试"几乎等价。所以默认情况下单独打一行提示。
if (!SLOW && !process.env.DSC_QUIET_SKIP_NOTICE) {
  process.stderr.write(
    '[probe-boot] 慢测试已跳过（真的起一次宿主，约 10~20 秒）。'
    + '要跑：DSC_SLOW=1 node --test test/probe-boot.test.mjs\n',
  )
}

describe('--probe-boot 慢测试：真的起一次宿主', { skip }, () => {
  // 一次 boot 十几秒，给足余量；测试框架默认可能不够
  /**
   * ⚠️ 返回 `{ code, out, err }` —— **不要**直接把 `spawnSync` 的结果往外抛。
   * 我自己就踩了：`spawnSync` 的字段叫 `stdout`/`stderr`，而
   * `cli.test.mjs` 里的包装器叫 `out`/`err`。混着写的结果是断言里
   * `r.out` 恒为 `undefined`，测试报"stdout 不是 JSON"——**看起来像产品坏了，
   * 其实是测试自己读错了字段**。
   */
  const run = (args) => {
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 180000,
      // ⚠️ 这条测试必须用**真实的 DSH_HOME** —— `--probe-boot` 要复制一个真实 profile。
      // （`cli.test.mjs` 里的 runCLI 会把 DSH_HOME 钉进临时目录，那会让 boot 找不到
      //   任何 profile。两个文件的隔离策略不同，是因为它们要验的东西不同。）
      env: { ...process.env, DSH_HOME: REAL_HOME },
    })
    return { code: r.status, out: r.stdout || '', err: r.stderr || '', error: r.error }
  }

  test('真的能拿到运行时面，而且发现全部是「确定」', () => {

    const r = run([
      '--nm', PARITYFIX,
      '--probe-boot',
      '--probe-timeout', '40',
      '--dsh-version', '0.2.0-rc.2',
      '--no-baseline',
      '--json',
    ])

    // 起不来时 `run()` 不会抛，而是把原因写进 inputs —— 这正是要断言的地方
    assert.ok(r.out.trim().startsWith('{'),
      `stdout 不是 JSON（status=${r.code}${r.error ? `, spawn error=${r.error.message}` : ''}）：`
      + `${r.out.slice(0, 200)}${r.err ? ` | stderr: ${r.err.slice(0, 300)}` : ''}`)
    const data = JSON.parse(r.out)

    assert.equal(data.inputs.hasRuntimeSurface, true,
      `没拿到运行时面：${data.inputs.probeBootWarn || data.inputs.probeBoot?.error || '(无原因)'}`)
    assert.equal(data.inputs.probe, '(--probe-boot 实时采集)')

    // 拿到了面，方法级结论就不该再有「疑似」—— 这正是 --probe-boot 的全部意义
    const findings = Object.values(data.plugins).flatMap((p) => p.findings || [])
    assert.ok(findings.length > 0, '这个 profile 上应当有发现（否则这条测试没验到东西）')
    const suspected = findings.filter((f) => f.certainty !== 'certain')
    assert.deepEqual(suspected.map((f) => `${f.service}.${f.method}`), [],
      '拿到运行时面后不该还有「疑似」')

    // 探针确实被问到东西了（问 0 个服务会"成功"但毫无意义）
    const notes = (data.inputs.probeBoot && data.inputs.probeBoot.notes) || []
    assert.ok(notes.some((n) => /问了 \d+ 个服务/.test(n)),
      `notes 里没写问了多少服务：${JSON.stringify(notes)}`)
    const m = /问了 (\d+) 个服务/.exec(notes.join(' '))
    assert.ok(Number(m[1]) > 0, '问了 0 个服务 —— 探针等于什么都没探')

    // ── 跑完不许留垃圾 ──
    // 一个往用户 ~/.dsh/profiles 里留临时 profile 的工具，用户不会跑第二次。
    //
    // ⚠️ **断言「我这一次清干净了」，不要去扫全局命名空间。**
    // 第一版写的是 `assert.deepEqual(bootProfiles(), before)` —— 那是**全局**的
    // `dsc-probe-boot-*` 列表，于是**并发跑别的慢测试时必然误报**：
    // `labels.test.mjs` 自己也在跑 `--probe-boot`，它**正在用**的那个临时 profile
    // 会被这里当成"残留"（实测：三个慢测试一起跑时，这条红了而单独跑是绿的）。
    const pb = data.inputs.probeBoot || {}
    assert.ok(pb.tempProfile, '--probe-boot 没报出自己用的临时 profile —— 那这条断言只能退回去扫全局')
    assert.equal(pb.tempProfileRemoved, true, `临时 profile 没被清掉：${pb.tempProfile}`)
    assert.ok(!fs.existsSync(pb.tempProfile), `临时 profile 还在磁盘上：${pb.tempProfile}`)
  })

  test('拿到面之后结论与静态不同（否则这个开关是白加的）', () => {
    const args = ['--nm', PARITYFIX, '--dsh-version', '0.2.0-rc.2', '--no-baseline', '--json']
    const staticRun = JSON.parse(run(args).out)
    const booted = JSON.parse(run([...args, '--probe-boot', '--probe-timeout', '40']).out)

    assert.equal(staticRun.inputs.hasRuntimeSurface, false, '静态路径不该有运行时面')
    assert.equal(booted.inputs.hasRuntimeSurface, true, 'boot 路径应当有运行时面')

    // 静态路径的方法级发现必须标「疑似」（三档确定性的核心约束）
    const staticFindings = Object.values(staticRun.plugins).flatMap((p) => p.findings || [])
    const staticSuspect = staticFindings.filter((f) => f.certainty === 'suspected')
    assert.ok(staticSuspect.length > 0,
      '静态路径应当有「疑似」（如果一条都没有，说明这条断言失效了，不是说明它更好）')

    // 同一份输入，确定性必须不同 —— 这就是 --probe-boot 的可见效果
    assert.notEqual(staticFindings.length, undefined)
    const bootFindings = Object.values(booted.plugins).flatMap((p) => p.findings || [])
    assert.equal(bootFindings.filter((f) => f.certainty !== 'certain').length, 0)
  })
})
