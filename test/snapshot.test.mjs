/**
 * 特征快照：**改动必须被看见**。
 *
 * ## 这一层在防什么（不是假想）
 *
 * 本次会话里，为了修调用点缺陷连改了 `lib/extract.mjs` 十几轮。其中一轮中间态
 * 让某个插件的 `calls` 变成空对象而 `services` 一字未变 —— 判定结果于是从
 * 「部分可用」**静默翻转成「可用」**，一条发现都不剩。当时仓库里没有任何检查
 * 会响：对拍只严格比 `manifests` 与 `fallbackPackages`，照旧打印「✓ 严格项一致」。
 * 是外部探针偶然撞上的。
 *
 * 也就是说：一个**空的 `calls`** 与一个**正确的 `calls`** 在所有现有检查眼里
 * 长得一模一样。本文件就是为了让这两者不再一样。
 *
 * ## 为什么不是「把输出整份提交」
 *
 * 一个真实 profile 的 `static.json` 是 370 KB。整份提交有两个后果：
 * 没人会读（等于没审查），以及真实回归会被淹没在版本漂移的噪音里。
 * 所以这里提交的是**关键字段 + 内容哈希**：哈希回答「变了没有」，
 * 关键字段回答「变了什么」，而人写的判据（`__expectations__/`）回答「变错了没有」。
 *
 * ## 与不变式的分工
 *
 *   - `invariants.test.mjs`：对**任何**输入都成立的性质（自恰性）→ 抓「错了」
 *   - 本文件：对**这份**输入的固定预期 → 抓「变了」
 *
 * 单独任何一层都不够。不变式抓不到「结果是错的但内部自恰」，
 * 快照抓不到「结果是错的但被如实记进了快照」。
 *
 * 用法（**用环境变量而不是命令行参数**）：
 *   node --test test/snapshot.test.mjs                       # 断言
 *   UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs    # 有意改动后重建快照
 *
 * 为什么不是 `--update`：`node --test` 会把测试文件后面的参数当成**测试文件名**
 * 去解析，于是 `node --test x.test.mjs --update` 得到的不是「带旗标运行」，
 * 而是一个静默的、旗标从未生效的运行 —— 测试照旧断言、快照照旧没重建，
 * 而你会以为已经重建了。这类「旗标不起作用但退出码正常」的坑，
 * 与本项目的 CLI 空操作缺陷是同一类，所以这里直接换成一个不会静默失效的开关。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { extractWithProvenance } from '../lib/extract.mjs'
import { buildVerdicts } from '../lib/verdict.mjs'
import {
  REPO, readJSON, loadRules, loadCatalog, buildSnapshot, diffValues, snapshotPaths,
} from './helpers.mjs'

// 只认环境变量。理由见文件头：`node --test` 会吞掉测试文件之后的命令行参数。
const UPDATE = process.env.UPDATE_SNAPSHOTS === '1'
const rules = loadRules()
const catalog = loadCatalog()
const PINNED = readJSON('test/__baseline-versions.json')

/**
 * 快照目标。分两类，职责不同，都要有：
 *
 *   - `micro`：仓库自带的**合成 fixture**。覆盖的是「已知的边界情形」——
 *     每个包都是为了逼出一条具体行为而写的（缺少服务、方法不存在、
 *     作者自己做了能力检测、同名变量遮蔽、断链、作用域注入、声明与实测不符……）。
 *     它随仓库走，换机器也在，是唯一能在 CI 里跑的。
 *
 *   - `parityfix`：**真实第三方插件**（本机 profile，pnpm 装出来的）。
 *     它覆盖的是「真实世界的写法」—— 压缩产物、vendored 依赖、
 *     懒加载 chunk、几千行的单文件。合成 fixture 永远造不出这些东西的复杂度。
 *     本机没有就跳过，并**明确说明跳过了什么**（静默跳过与静默通过一样危险）。
 */
const targets = [
  {
    name: 'micro',
    nm: path.join(REPO, 'test/fixtures/micro/node_modules'),
    surface: path.join(REPO, 'test/fixtures/micro/host-surface.json'),
    why: '合成 fixture：每个包逼出一条具体行为，随仓库走',
  },
  {
    name: 'parityfix',
    nm: path.join(os.homedir(), '.dsh/profiles/parityfix/node_modules'),
    surface: path.join(REPO, 'tools/parity/fixtures/host-surface-parityfix.json'),
    why: '真实插件 + 真实运行时面：三个回归基准的现场',
    optional: true,
  },
]

function runTarget(t) {
  if (!fs.existsSync(t.nm)) return null
  const extract = extractWithProvenance(t.nm, { catalog })
  const hostSurface = t.surface && fs.existsSync(t.surface) ? readJSON(t.surface) : null
  const verdict = buildVerdicts({ report: extract.report, hostSurface, rules, catalog, dshVersion: '0.2.0-rc.2' })
  return { extract, verdict, snapshot: buildSnapshot(extract, verdict) }
}

const results = new Map()
for (const t of targets) {
  const r = runTarget(t)
  if (r) results.set(t.name, r)
}

describe('特征快照', () => {
  for (const t of targets) {
    const r = results.get(t.name)
    if (!r) {
      test(`${t.name}（跳过：${t.nm} 不存在）`, { skip: `本机没有 ${t.nm}` }, () => {})
      continue
    }
    const { snapshot } = snapshotPaths(t.name)

    describe(`${t.name} —— ${t.why}`, () => {
      test('⓪ 基准版本没有漂移（漂移必须单独提交，不能顺手重建快照）', () => {
        // 三个回归基准是**验收标准**（Plan.md §5 G1）。验收标准悄悄变了、
        // 而测试照旧绿，那比测试失败更危险：它让你以为自己在验收，其实标准已经换了一个。
        // 所以版本对不上就报一个**独立的名字**（BASELINE_DRIFT），而不是变成
        // 「快照对不上」那只笼统的失败 —— 后者的第一反应是重建快照，然后就把它盖掉了。
        const want = PINNED[t.name] || {}
        const got = Object.fromEntries(Object.entries(r.extract.report.perPlugin).map(([k, v]) => [k, v.version]))
        const drifted = []
        for (const [pkg, ver] of Object.entries(want)) {
          if (!(pkg in got)) drifted.push(`${pkg}: 不见了（锁的是 ${ver}）`)
          else if (got[pkg] !== ver) drifted.push(`${pkg}: ${ver} → ${got[pkg]}`)
        }
        for (const pkg of Object.keys(got)) if (!(pkg in want)) drifted.push(`${pkg}: 新出现（${got[pkg]}）`)
        if (drifted.length) {
          assert.fail('BASELINE_DRIFT\n  基准插件的版本变了：\n    '
            + drifted.join('\n    ')
            + '\n  这不是「快照过期」，是**验收标准变了**。请：'
            + '\n   1) 确认这次版本变化是有意的；'
            + '\n   2) 跑一遍三个回归基准，确认结论是否跟着变；'
            + '\n   3) 变了就同时改 Plan.md §5 G1 与 test/__baseline-versions.json，**单独提交一次**；'
            + '\n   4) 然后再重建快照。'
            + '\n  不要在第 3 步之前重建快照 —— 那会把基准漂移盖掉。')
        }
      })

      test('① 快照与当前输出一致（哈希）', () => {
        if (UPDATE) {
          fs.mkdirSync(path.dirname(snapshot), { recursive: true })
          fs.writeFileSync(snapshot, JSON.stringify(r.snapshot, null, 2) + '\n')
          console.log(`  已重建快照: ${path.relative(REPO, snapshot)}`)
          return
        }
        assert.ok(fs.existsSync(snapshot),
          `快照不存在：${path.relative(REPO, snapshot)}\n  首次生成请跑：node test/snapshot.test.mjs --update`)
        const prev = readJSON(snapshot)
        const diffs = [
          ...diffValues({ hash: prev.extract.hash }, { hash: r.snapshot.extract.hash }, '提取'),
          ...diffValues({ hash: prev.verdict.hash }, { hash: r.snapshot.verdict.hash }, '判定'),
        ]
        assert.deepEqual(diffs, [],
          '输出变了。若是**有意**改动：读一遍下面的差异，确认每一行都是你想要的，'
          + '再跑 `UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs`。\n'
          + '若是**无意**改动：这就是这个测试存在的意义。')
      })

      test('② 变了的字段要逐条可读（不是只有一个摘要）', () => {
        if (UPDATE || !fs.existsSync(snapshot)) return
        const prev = readJSON(snapshot)
        const diffs = [
          ...diffValues(prev.extract, r.snapshot.extract, '提取').filter((l) => !l.startsWith('提取.hash')),
          ...diffValues(prev.verdict, r.snapshot.verdict, '判定').filter((l) => !l.startsWith('判定.hash')),
        ]
        // 哈希一致就不该有字段差异（哈希是这些字段算出来的）。反过来说：
        // 哈希不一致时，这条必须给出人能读的差异 —— 否则失败信息只有两个十六进制串。
        if (prev.extract.hash !== r.snapshot.extract.hash || prev.verdict.hash !== r.snapshot.verdict.hash) {
          assert.ok(diffs.length > 0, '哈希变了却给不出字段级差异 —— 哈希算的不是这些字段，这是个 bug')
        }
      })

      test('③ 快照里不得出现绝对路径或时间戳（否则换机器就红）', () => {
        const text = JSON.stringify(r.snapshot)
        const home = os.homedir()
        assert.ok(!text.includes(home), `快照里出现了 home 路径（${home}）`)
        assert.ok(!/\/Users\/|\/private\/|\/var\/folders\//.test(text), '快照里出现了绝对路径')
        assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text), '快照里出现了时间戳')
      })

      test('④ 快照是幂等的：连跑两次字节相同', () => {
        const extract2 = extractWithProvenance(t.nm, { catalog })
        const hostSurface = t.surface && fs.existsSync(t.surface) ? readJSON(t.surface) : null
        const verdict2 = buildVerdicts({ report: extract2.report, hostSurface, rules, catalog, dshVersion: '0.2.0-rc.2' })
        const again = buildSnapshot(extract2, verdict2)
        assert.equal(JSON.stringify(again), JSON.stringify(r.snapshot),
          '同一输入两次跑出不同字节 —— 快照测试会变成随机失败')
      })
    })
  }
})

/**
 * 判据层：**人写的、可审查的期望值**。这是唯一允许断言具体结论的地方。
 *
 * 不写进快照的原因：快照是「当前输出的抄本」，判据是「我们要求它必须怎样」。
 * 前者跟着代码走，后者跟着**产品承诺**走。混在一起，就没有东西能阻挡
 * 「改坏了 → 重建快照 → 全绿」这条路径。
 */
describe('判据：结论必须是我们要的那个', () => {
  for (const t of targets) {
    const r = results.get(t.name)
    if (!r) continue
    const { expectations } = snapshotPaths(t.name)
    if (!fs.existsSync(expectations)) continue

    const exp = readJSON(expectations)
    describe(`${t.name}`, () => {
      for (const [pkg, want] of Object.entries(exp.plugins || {})) {
        // `targets` 限定这条判据只对哪些快照目标成立。真实基准插件（本机 profile）
        // 与合成 fixture 各自有判据，但都放在同一个文件里好读 —— 所以显式声明适用范围，
        // 而不是靠「找不到就跳过」。靠跳过会让拼错的包名静默变成一条不生效的判据。
        if (want.targets && !want.targets.includes(t.name)) continue
        test(`${pkg} → ${want.verdict}`, () => {
          const got = r.verdict.plugins[pkg]
          assert.ok(got, `${pkg} 根本不在判定结果里`)
          assert.equal(got.verdict, want.verdict,
            `判定档位不对。实际发现：${JSON.stringify(got.findings.map((f) => `${f.severity} ${f.service ?? ''}${f.method ? '.' + f.method : ''}`))}`)
        })

        if (want.mustReport) {
          for (const m of want.mustReport) {
            test(`${pkg} 必须报 ${m.category} ${m.api}`, () => {
              const got = r.verdict.plugins[pkg]
              const hit = got.findings.filter((f) => f.category === m.category
                && (m.api === null || (f.service ? (f.method ? `${f.service}.${f.method}` : f.service) : null) === m.api))
              assert.ok(hit.length, `没有报 ${m.category} ${m.api}。实际：${JSON.stringify(got.findings.map((f) => `${f.category}/${f.service}.${f.method}`))}`)
              if (m.location) {
                const loc = hit[0].location && `${hit[0].location.file}:${hit[0].location.line}`
                assert.equal(loc, m.location, `位置不对：${JSON.stringify(hit[0].location)}`)
              }
              if (m.certainty) assert.equal(hit[0].certainty, m.certainty)
              if (m.severity) assert.equal(hit[0].severity, m.severity)
            })
          }
        }

        if (want.mustNotReport) {
          for (const m of want.mustNotReport) {
            test(`${pkg} 不得报 ${m}`, () => {
              const got = r.verdict.plugins[pkg]
              const hit = got.findings.filter((f) => `${f.category}/${f.service}.${f.method}` === m || `${f.service}.${f.method}` === m)
              assert.deepEqual(hit, [], `报了不该报的：${JSON.stringify(hit)}`)
            })
          }
        }

        if (want.mustBeClientSide) {
          for (const svc of want.mustBeClientSide) {
            test(`${pkg} 的 ${svc} 必须归客户端半边`, () => {
              const got = r.verdict.plugins[pkg]
              assert.ok(got.clientSide.some((c) => c.service === svc),
                `${svc} 没被归入客户端半边。实际：${JSON.stringify(got.clientSide.map((c) => c.service))}`)
            })
          }
        }
      }
    })
  }
})
