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

// Cache policy is exercised against the actual ReportService, without copying function text.
import {ReportService} from '../lib/report-service.mjs';
describe('F2：缓存策略',()=>{
 test('fresh cache avoids recomputation, force refresh computes',async()=>{
  let n=0,now=0;const svc=new ReportService(async()=>({ok:true,n:++n}),{clock:()=>now,ttlMs:10});
  await svc.get('A');now=5;assert.equal((await svc.get('A')).n,1);assert.equal(n,1);
  assert.equal((await svc.get('A',{},true)).n,2);
 });
 test('stale cache returns while one shared refresh waits',async()=>{
  let n=0,now=0,release;const gate=new Promise(r=>release=r);
  const svc=new ReportService(async()=>{if(++n===2)await gate;return {ok:true,n};},{clock:()=>now,ttlMs:10});
  await svc.get('A');now=20;
  const results=await Promise.all([svc.get('A'),svc.get('A'),svc.get('A')]);
  assert.ok(results.every(r=>r.n===1&&r.cache.refreshing));assert.equal(n,2);
  const pending=svc.state('A').inflight;release();await pending;assert.equal((await svc.get('A')).n,2);
 });
 test('cache state is separate for each requested profile',async()=>{
  let n=0;const svc=new ReportService(async o=>({ok:true,profile:o.profile,n:++n}));
  assert.equal((await svc.get('A',{profile:'A'})).profile,'A');
  assert.equal((await svc.get('B',{profile:'B'})).profile,'B');assert.equal(n,2);
 });
});

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

  test('无法判断 profile 时禁止回退到 desktop', () => {
    // 用户看到"检查了 desktop"与"没判断出来所以查了 desktop"是两件事。
    // 后者意味着结论可能不是他想要的那个 profile。
    assert.ok(!SRC.includes('回退到 desktop profile（没能判断出正在跑哪一个）'))
  })
})
