/**
 * F2（结果缓存）的策略测试。
 *
 * ## 为什么要单独测缓存
 *
 * 缓存是本项目里**唯一一处"可以给出过期答案"的地方**。它的失效模式很特别：
 * 不是崩溃、不是报错，而是**安静地把旧结论当成当前结论**给出去 ——
 * 而用户看到的一切都正常。这正是本项目要检测的那类问题，所以它自己更不能犯。
 *
 * 这里测的不是"缓存能存住"（那太浅），而是**三条边界**：
 *   1. 有效期内**不重算**（否则缓存没有意义）；
 *   2. 过期后**先给旧的、后台再刷**（不能让人等 1.5 秒）；
 *   3. 后台刷新失败时**留下痕迹**（静默失败会让面板永远显示过期数据）。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { REPO } from './helpers.mjs'

const HOST = path.join(REPO, 'plugin', 'index.js')
const SRC = fs.readFileSync(HOST, 'utf8')

/** 把 host 半边加载进受控 context，好让我们直接调它的内部函数 */
function loadHost() {
  const calls = { computeReport: 0, computeReportAt: [] }
  const logs = []
  const sandbox = {
    console: { log: (m) => logs.push(String(m)), warn: (m) => logs.push('WARN ' + m), error: () => {} },
    process: { ...process, env: { ...process.env, DSC_CACHE_TTL_MS: '1000', DSC_AUTORUN_MS: '0' } },
    setTimeout: (fn, ms) => { return 0 },
    clearTimeout: () => {},
    URL, Date, JSON, Object, Array, String, Number, Boolean, Error, Promise, Symbol, RegExp, Map, Set, Math,
    globalThis: undefined,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  // 只导出我们需要的那一个函数：serveReport
  const wrapped = `__fns = {};
    (function () {
      ${SRC.slice(SRC.indexOf('const SCHEMA_VERSION'))}
    })();
  `
  // 直接把 serveReport 的定义体抽出来单独求值更稳（避免 import/export 语法）
  const i = SRC.indexOf('async function serveReport(state, ctx, force) {')
  assert.ok(i > 0, '没找到 serveReport —— 函数名变了？')
  // 找到函数结束位置（大括号配平）
  let depth = 0, j = SRC.indexOf('{', i)
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') depth++
    else if (SRC[k] === '}') { depth--; if (depth === 0) { j = k + 1; break } }
  }
  const body = SRC.slice(i, j)
  sandbox.__computeCalls = calls
  // `serveReport` 调用的 `computeReport` 是模块级的。测试里给它一个**可编程的桩**：
  // 默认算一次记一次，可以按调用次数返回不同结果，也可以让它抛错。
  sandbox.__computeImpl = null
  const stub = `
    function log(m) { __logs.push(String(m)) }
    function errText(e) { return (e && e.message) ? e.message : String(e) }
    async function computeReport(state, ctx) {
      __computeCalls.computeReport += 1
      __computeCalls.computeReportAt.push(Date.now())
      if (__computeImpl) return __computeImpl(__computeCalls.computeReport)
      return { ok: true, n: __computeCalls.computeReport }
    }
    ${body}
    __serveReport = serveReport;
  `
  sandbox.__logs = logs
  sandbox.__computeCalls = calls
  vm.runInContext(stub, sandbox, { timeout: 5000 })
  return {
    serveReport: sandbox.__serveReport,
    logs,
    calls,
    setCompute: (fn) => { sandbox.__computeImpl = fn },
  }
}

/** 造一个假的 state + 假的 computeReport 记账 */
function makeState(computeImpl) {
  const state = { lastReport: null, lastReportAt: 0, computing: null, cacheTtlMs: 1000 }
  const ctx = {}
  const compute = async () => {
    state.__computeCount = (state.__computeCount || 0) + 1
    return computeImpl ? computeImpl(state.__computeCount) : { ok: true, n: state.__computeCount }
  }
  return { state, compute }
}

// serveReport 里调用的是模块级的 computeReport，所以这里用一个可替换的桩：
// 我们不注入它，而是**直接把 state 预置好**来测三条边界 —— 那样更接近真实调用路径。
describe('F2：缓存策略', () => {
  test('有缓存且在有效期内 → 不重算（hit:true）', async () => {
    const { serveReport } = loadHost()
    // 这里 computeReport 不在作用域里，但我们走的是"有缓存且在期内"这一支，
    // 所以它不会被调用 —— 这本身也验证了"没有多余的重算"。
    const state = {
      lastReport: { ok: true, marker: 'cached' },
      lastReportAt: Date.now(),
      computing: null,
      cacheTtlMs: 60_000,
    }
    const out = await serveReport(state, {})
    assert.equal(out.marker, 'cached')
    assert.equal(out.cache.hit, true)
    assert.equal(out.cache.refreshing, false)
  })

  test('缓存过期 → **先给旧的**并标记正在后台刷新（不让人等）', async () => {
    const { serveReport } = loadHost()
    const state = {
      lastReport: { ok: true, marker: 'stale' },
      lastReportAt: Date.now() - 10_000, // 远超 ttl
      computing: null,
      cacheTtlMs: 1000,
    }
    // 先抓住 promise，再 await —— 因为 await 之后后台那一枪可能已经落地、
    // computing 被 finally 归零，那样就抓不到句柄了。
    const pending = serveReport(state, {})
    const inflight = state.computing
    assert.ok(inflight, '应当已经启动后台刷新')
    const out = await pending
    assert.equal(out.marker, 'stale', '过期时也应当立刻返回旧结果，而不是等待重算')
    assert.equal(out.cache.hit, true)
    assert.equal(out.cache.refreshing, true, '必须标记"正在后台刷新"，否则调用方无法知道这是旧数据')
    // 等后台那一枪落地，确认它把 lastReport 换掉了
    await inflight
    assert.notEqual(state.lastReport.marker, 'stale', '后台刷新应当替换掉旧结果')
  })

  test('并发多个请求只触发**一次**后台刷新（不会各算一遍）', async () => {
    const { serveReport, calls, setCompute } = loadHost()
    const state = {
      lastReport: { ok: true, marker: 'stale' },
      lastReportAt: Date.now() - 10_000,
      computing: null,
      cacheTtlMs: 1000,
    }
    // 让"体检"**真的慢**（挂在一个人工闸门上），否则每条请求都会在
    // 下一条发出之前就结束，去重逻辑根本没被走到 —— 那样测出来的"通过"是假的。
    let release
    const gate = new Promise((r) => { release = r })
    setCompute(async () => { await gate; return { ok: true, slow: true } })

    // 三次请求**同时**发出（不 await 中间结果）——这才叫并发
    const p1 = serveReport(state, {})
    const p2 = serveReport(state, {})
    const p3 = serveReport(state, {})
    // 此刻后台那一枪应当**只有一个**在跑
    const shared = state.computing
    assert.ok(shared, '应当已经启动后台刷新')
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    assert.equal(r1.cache.refreshing, true)
    assert.equal(r2.cache.refreshing, true)
    assert.equal(r3.cache.refreshing, true)
    assert.equal(state.computing, shared, '三条请求必须共用同一个正在进行中的刷新')
    // 闸门放开，后台那一枪落地
    release()
    await shared
    assert.equal(state.computing, null, '落地后应当归零，允许下一次刷新')
    assert.equal(state.lastReport.slow, true, '后台刷新应当把新结果写进缓存')
    // 关键断言：**只算了一次**，而不是三次各算一遍（那会白烧 1.5 秒 × 3）
    assert.equal(calls.computeReport, 1, `后台刷新跑了 ${calls.computeReport} 次，应当只跑 1 次`)
  })

  test('后台刷新失败 → 留下痕迹，而不是静默保留过期数据', async () => {
    const { serveReport, logs, setCompute } = loadHost()
    // 让后台刷新**真的失败**（不是靠未定义符号）
    setCompute(() => { throw new Error('模拟刷新失败') })
    const state = {
      lastReport: { ok: true, marker: 'stale' },
      lastReportAt: Date.now() - 10_000,
      computing: null,
      cacheTtlMs: 1000,
    }
    // 让 computeReport 抛错：它在受控环境里未定义，正好会 ReferenceError
    const out = await serveReport(state, {})
    assert.equal(out.marker, 'stale')
    await state.computing
    assert.ok(state.lastRefreshError, '刷新失败必须记下来 —— 否则面板会一直显示过期数据而没人知道')
    assert.ok(logs.some((l) => /background refresh failed/.test(l)),
      `应当有一条日志说明后台刷新失败。实际日志：${JSON.stringify(logs)}`)
  })

  test('没有缓存 → 必须**同步**算出来再返回（不能返回空、也不能只算后台）', async () => {
    const { serveReport, calls } = loadHost()
    const state = { lastReport: null, lastReportAt: 0, computing: null, cacheTtlMs: 1000 }
    const out = await serveReport(state, {})
    assert.equal(calls.computeReport, 1, '第一次访问必须真的算一次')
    assert.equal(out.ok, true)
    assert.equal(out.n, 1)
    assert.equal(state.lastReport, out, '算出来的结果必须存进缓存')
    assert.ok(state.lastReportAt > 0, '必须记下算出来的时间，否则 TTL 无从判断')
    // 第一次**不该**带 cache.hit —— 它不是缓存命中，是现算的
    assert.equal(out.cache, undefined)
  })

  test('?refresh=1 → 即使缓存新鲜也重算（用户明确要新的）', async () => {
    const { serveReport, calls } = loadHost()
    const state = {
      lastReport: { ok: true, n: 99 },
      lastReportAt: Date.now(),
      computing: null,
      cacheTtlMs: 60_000,
    }
    const out = await serveReport(state, {}, true)
    assert.equal(calls.computeReport, 1, 'refresh=1 时必须重算')
    assert.equal(out.n, 1)
    assert.notEqual(out.n, 99)
  })
})

describe('F2：启动后自动跑（静态检查 + 一次真实事故的回归）', () => {
  test('自动体检由**最后一次 loader 扫描完成**触发，而不是一个独立的定时器', () => {
    // 这是一次真实事故的直接回归：早先用独立定时器（`state.autoRunTimer`），
    // 而 `finish()` 里有一段 `clearTimeout(state.autoRunTimer)` ——
    // 两者时间**相邻**（默认时机就落在最后一次扫描之后 2 秒），于是最后一次扫描
    // 一结束就把启动自检取消了：**它从未运行、也没有任何报错**。
    //
    // 现在的设计：`finish()` 调用幂等的 `state.runAutoCheck()`，
    // 兜底定时器叫 `fallbackTimer` —— 名字不同，正是为了让"谁拥有谁"一目了然。
    assert.match(SRC, /state\.runAutoCheck = \(\) => \{/, '缺少 runAutoCheck')
    assert.match(SRC, /if \(state\.autoCheckStarted\) return;/, 'runAutoCheck 不是幂等的（finish 与兜底会各跑一次）')
    assert.match(SRC, /if \(typeof state\.runAutoCheck === 'function'\) state\.runAutoCheck\(\)/,
      'finish() 没有触发启动自检')
    // 关键回归：finish() 里**不得**再清理 F2 的东西
    const finishIdx = SRC.indexOf('const finish = () => {')
    const finishEnd = SRC.indexOf('schedulePass(0)', finishIdx)
    const finishBody = SRC.slice(finishIdx, finishEnd)
    assert.ok(!/clearTimeout\(state\.autoRunTimer\)/.test(finishBody),
      'finish() 又在清理 F2 的定时器了 —— 这正是那次"启动自检从未运行"的原因')
    // 兜底定时器仍然要 unref
    assert.match(SRC, /state\.fallbackTimer = timer/, '缺兜底定时器')
    assert.match(SRC, /typeof timer\.unref === 'function'/, '定时器没有 unref')
  })

  test('兜底路径存在（loader 完全不可达时，启动自检也得跑）', () => {
    // `scan()` 在 loader 不可达时会提前 return，那条路上 finish() 不会被调用 ——
    // 所以必须还有一个定时器兜底。两条路都调 runAutoCheck，由幂等性去重。
    assert.match(SRC, /state\.runAutoCheck\(\); \} catch/, '缺少兜底调用')
    assert.match(SRC, /state\.autoRunDelayMs/, '缺少自动体检时机配置')
  })

  test('自动体检会把「变了没有」打进日志（用户想不起来看面板，但日志会看）', () => {
    assert.match(SRC, /F2 启动自检:/, '缺少启动自检的结论日志')
    assert.match(SRC, /F2 与上次相比:/, '缺少与上次比较的日志')
    // 「没有变化」也必须打出来 —— 沉默会被读成"没检查"或"坏消息被藏起来了"
    assert.match(SRC, /badge\.detail \|\| b\.note \|\| '没有可比基线'/, '没有变化时应当说明原因')
  })

  test('缓存 TTL 与自动体检时机都可配置（并各有一个默认值）', () => {
    assert.match(SRC, /DSC_CACHE_TTL_MS/, '缺少 TTL 配置项')
    assert.match(SRC, /DSC_AUTORUN_MS/, '缺少自动体检时机的配置项')
    assert.match(SRC, /toPositiveInt\(process\.env\.DSC_CACHE_TTL_MS/, 'TTL 没有走 toPositiveInt（非法值会变成 NaN）')
  })
})

/**
 * F2 附带的一个**正确性**缺陷：profile 认错，基线就会污染。
 *
 * 实测（在 `--profile gverify` 下让插件把宿主进程环境打出来）：
 *
 * ```
 * DSH_PROFILE=desktop          ← 过期值，来自启动 app 的那个 shell
 * DSH_PROFILE_DIR=…/profiles/desktop
 * process.argv = [ …/dsh-desktop-host/lib/cli.js, "--profile", "gverify" ]   ← 真相
 * ```
 *
 * 信环境变量会把 gverify 的结论写进 `baseline.desktop.json`，于是差分会报出
 * "移除了 17 个插件"这种**完全是编出来的变化**。环境变量在这里是**主动骗人**的，
 * 所以必须有测试把它钉住。
 */
describe('F2：profile 判断（环境变量会骗人）', () => {
  const HOST = path.join(REPO, 'plugin', 'index.js')
  const SRC = fs.readFileSync(HOST, 'utf8')

  /** 把 resolveActiveProfile 抽出来在受控 argv/env 下求值 */
  function callResolve(argv, env) {
    const i = SRC.indexOf('function resolveActiveProfile() {')
    assert.ok(i > 0, '没找到 resolveActiveProfile')
    let depth = 0, j = SRC.indexOf('{', i)
    for (let k = j; k < SRC.length; k++) {
      if (SRC[k] === '{') depth++
      else if (SRC[k] === '}') { depth--; if (depth === 0) { j = k + 1; break } }
    }
    const body = SRC.slice(i, j)
    const sandbox = { process: { argv, env } }
    sandbox.globalThis = sandbox
    vm.createContext(sandbox)
    vm.runInContext(`${body}\n__r = resolveActiveProfile;`, sandbox, { timeout: 3000 })
    return sandbox.__r()
  }

  test('argv 的 --profile 优先于环境变量（这才是实际加载的那个）', () => {
    const r = callResolve(
      ['/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness', '.../cli.js', '--profile', 'gverify'],
      { DSH_PROFILE: 'desktop', DSH_PROFILE_DIR: '/x/profiles/desktop' },
    )
    assert.equal(r.name, 'gverify', '必须信 argv，而不是那个过期的 DSH_PROFILE=desktop')
    assert.match(r.why, /argv/)
  })

  test('**桌面端的位置形态**也认（真实 app 就是这样传的）', () => {
    // 实测的真实桌面端 argv：
    //   [ …/MacOS/DeepSeek Harness, --expose-internals, …/dsh-desktop-host/lib/index.js,
    //     …/app.asar/dsh, /Users/…/profiles/desktop, …/runtime/primary-runtime, … ]
    // 它**没有** --profile 标志，profile 目录是按位置传的。
    // 只认 --profile 时这里会走"回退到 desktop" —— 这次结论恰好也是 desktop，
    // 所以看起来是对的。**那是运气，不是正确**：换一个 profile 就会污染基线。
    const r = callResolve([
      '/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness',
      '--expose-internals',
      '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js',
      '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh',
      '/Users/someone/.dsh/profiles/tui',
      '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime',
    ], { DSH_PROFILE: 'desktop' })
    assert.equal(r.name, 'tui', `必须认出位置形态的 profile，而不是回退到 desktop（拿到 ${r.name}）`)
    assert.match(r.why, /profile 路径/)
  })

  test('--profile=<名字> 的内联形态也认', () => {
    const r = callResolve(['node', 'cli.js', '--profile=tui'], {})
    assert.equal(r.name, 'tui')
  })

  test('没有 argv 时才退回环境变量，且在 why 里**标明它可能是陈的**', () => {
    const r = callResolve(['node', 'cli.js'], { DSH_PROFILE: 'web' })
    assert.equal(r.name, 'web')
    // 这句警示很重要：读 why 的人必须知道这条线索不可靠
    assert.match(r.why, /可能来自启动 app 的那个 shell|可能.*陈/)
  })

  test('DSC_PROFILE 优先于 DSH_PROFILE（给工具/测试一个干净的覆盖点）', () => {
    const r = callResolve(['node', 'cli.js'], { DSC_PROFILE: 'parityfix', DSH_PROFILE: 'desktop' })
    assert.equal(r.name, 'parityfix')
  })

  test('全都没有 → 返回 null（交给调用方回退并写明是回退）', () => {
    const r = callResolve(['node', 'cli.js'], {})
    assert.equal(r.name, null)
    assert.equal(r.why, '无法判断')
  })

  test('`--profile` 后面没跟值时不要吞掉下一个参数', () => {
    // `--profile --port 0` 这种畸形输入：不能把 `--port` 当成 profile 名，
    // 否则会去找一个叫 `--port` 的 profile（然后回退到 desktop，且理由看起来是对的）。
    const r = callResolve(['node', 'cli.js', '--profile', '--port', '0'], {})
    assert.equal(r.name, null, `不该把选项当成 profile 名，实际拿到 ${r.name}`)
  })

  test('回退到 desktop 时，why 必须写明这是回退', () => {
    // 用户看到"检查了 desktop"与"没判断出来所以查了 desktop"是两件事。
    // 后者意味着结论可能不是他想要的那个 profile。
    assert.match(SRC, /回退到 desktop profile（没能判断出正在跑哪一个）/)
  })
})
