/**
 * 基线与角标的测试。
 *
 * 这一层的价值全部在于**它能区分"变了"和"没变"**，所以测试的重点也是这个：
 * 每一类变化（变差 / 变好 / 新增 / 移除 / 只是版本动了）都必须被认出来，
 * 而**没有变化时必须安静** —— 一个不停亮着的角标与一个永远不亮的角标一样没用。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { snapshotForBaseline, diffAgainstBaseline, badgeFor, describeDiff, BASELINE_SCHEMA } from '../lib/baseline.mjs'

/** 造一个最小 verdict：只有一个插件、一条发现 */
function verdict(plugins, dshVersion) {
  return { dshVersion, plugins }
}
const find = (key, category = 'host-method-missing', severity = 'feature-dead') => ({
  service: key.split('.')[0],
  method: key.split('.')[1] ?? null,
  category,
  severity,
  certainty: 'certain',
  location: { file: 'lib/index.js', line: 1 },
})

describe('基线：快照', () => {
  test('快照只含用于比对的部分，不含台账（否则差分会被实现细节淹没）', () => {
    const v = verdict({
      'pkg-a': {
        version: '1.0.0',
        verdict: 'partial',
        vacuous: false,
        findings: [find('tools.register')],
        // 下面这些是"台账"，不该进快照
        checked: [{ service: 'tools', disposition: 'finding' }],
        clientSide: [{ service: 'slots' }],
        filtered: [{ service: 'parser', method: 'parse' }],
        resolved: { tools: { disposition: 'finding' } },
      },
    }, '0.2.0-rc.2')
    const snap = snapshotForBaseline(v, '0.2.0-rc.2')
    const p = snap.plugins['pkg-a']
    assert.deepEqual(Object.keys(p).sort(), ['findings', 'vacuous', 'verdict', 'version'])
    assert.deepEqual(p.findings, [{
      key: 'tools.register', category: 'host-method-missing',
      severity: 'feature-dead', certainty: 'certain', location: 'lib/index.js:1',
    }])
    assert.equal(snap.schemaVersion, BASELINE_SCHEMA)
  })

  test('发现的顺序不影响快照（否则「变了没有」会随顺序抖动）', () => {
    const mk = (order) => snapshotForBaseline(verdict({
      p: { version: '1', verdict: 'partial', findings: order },
    }, 'v'), 'v')
    const a = mk([find('b.m'), find('a.m')])
    const b = mk([find('a.m'), find('b.m')])
    assert.equal(JSON.stringify(a), JSON.stringify(b))
  })
})

describe('基线：差分', () => {
  const base = (plugins) => snapshotForBaseline(verdict(plugins, '0.2.0-rc.2'), '0.2.0-rc.2')

  test('没有基线 → 不可比，且说明原因是「第一次」而不是「没问题」', () => {
    const d = diffAgainstBaseline(null, base({}))
    assert.equal(d.comparable, false)
    assert.match(d.reason, /第一次体检/)
    // 关键：不可比**不是**「没有变化」
    assert.equal(badgeFor(d).show, false)
  })

  test('基线结构版本不匹配 → 不可比（读旧基线不能给一个错的差分）', () => {
    const d = diffAgainstBaseline({ schemaVersion: 999, plugins: {} }, base({}))
    assert.equal(d.comparable, false)
    assert.match(d.reason, /结构版本不匹配/)
  })

  test('完全没变 → comparable 但角标不打', () => {
    const prev = base({ 'pkg-a': { version: '1.0.0', verdict: 'ok', findings: [] } })
    const next = snapshotForBaseline(verdict({
      'pkg-a': { version: '1.0.0', verdict: 'ok', findings: [] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.comparable, true)
    assert.deepEqual([d.worsened.length, d.improved.length, d.added.length, d.removed.length], [0, 0, 0, 0])
    const badge = badgeFor(d)
    assert.equal(badge.show, false, '没有变化就不该打角标')
    assert.equal(badge.detail, '与上次相比没有任何变化')
  })

  test('变差：新增发现 → worsened，方向 worse', () => {
    const prev = base({ p: { version: '1', verdict: 'ok', findings: [] } })
    const next = snapshotForBaseline(verdict({
      p: { version: '1', verdict: 'partial', findings: [find('settings.register')] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.worsened.length, 1)
    assert.equal(d.worsened[0].name, 'p')
    assert.match(d.worsened[0].reason, /结论从「ok」变为「partial」/)
    const badge = badgeFor(d)
    assert.equal(badge.show, true)
    assert.equal(badge.direction, 'worse')
    assert.match(badge.text, /^↓/)
  })

  test('变差：档位不变但多了发现 —— 也要报（这是最容易漏的一类）', () => {
    const prev = base({ p: { version: '1', verdict: 'partial', findings: [find('a.m')] } })
    const next = snapshotForBaseline(verdict({
      p: { version: '1', verdict: 'partial', findings: [find('a.m'), find('b.m')] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.worsened.length, 1, '档位没变但有新发现，必须算变差')
    assert.match(d.worsened[0].reason, /新增 1 条发现（档位未变）/)
    assert.equal(d.worsened[0].newFindings[0].key, 'b.m')
  })

  test('变好：发现消失 → improved，方向 better（角标也要打）', () => {
    const prev = base({ p: { version: '1', verdict: 'partial', findings: [find('a.m')] } })
    const next = snapshotForBaseline(verdict({
      p: { version: '1', verdict: 'ok', findings: [] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.improved.length, 1)
    assert.equal(d.worsened.length, 0)
    const badge = badgeFor(d)
    assert.equal(badge.show, true, '「修好了」同样要打角标 —— 只有变差才亮会漏掉好消息')
    assert.equal(badge.direction, 'better')
    assert.match(badge.text, /^↑/)
  })

  test('新增与卸载插件各归一类', () => {
    const prev = base({ old: { version: '1', verdict: 'ok', findings: [] } })
    const next = snapshotForBaseline(verdict({
      fresh: { version: '2', verdict: 'ok', findings: [] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.deepEqual(d.added.map((x) => x.name), ['fresh'])
    assert.deepEqual(d.removed.map((x) => x.name), ['old'])
  })

  test('只是插件版本变了、结论没变 —— 也要说，不能装成什么都没发生', () => {
    const prev = base({ p: { version: '1.0.0', verdict: 'ok', findings: [] } })
    const next = snapshotForBaseline(verdict({
      p: { version: '1.0.1', verdict: 'ok', findings: [] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.improved.length, 0)
    assert.equal(d.updated.length,1)
    assert.match(d.updated[0].reason, /版本变了，但结论未变/)
  })

  test('DSH 版本变化被单独记下 —— 它常常是上面那些变化的原因', () => {
    const prev = snapshotForBaseline(verdict({ p: { version: '1', verdict: 'ok', findings: [] } }), '0.2.0-rc.1')
    const next = snapshotForBaseline(verdict({ p: { version: '1', verdict: 'ok', findings: [] } }), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.dshVersionChanged, true)
    assert.equal(d.dshVersionFrom, '0.2.0-rc.1')
    assert.equal(d.dshVersionTo, '0.2.0-rc.2')
  })

  test('有变差也有变好 → direction mixed，且**变差排在最前**', () => {
    const prev = base({
      bad: { version: '1', verdict: 'ok', findings: [] },
      good: { version: '1', verdict: 'partial', findings: [find('a.m')] },
    })
    const next = snapshotForBaseline(verdict({
      bad: { version: '1', verdict: 'broken', findings: [find('a.m', 'host-service-missing', 'fatal')] },
      good: { version: '1', verdict: 'ok', findings: [] },
    }, '0.2.0-rc.2'), '0.2.0-rc.2')
    const d = diffAgainstBaseline(prev, next)
    assert.equal(d.worsened.length, 1)
    assert.equal(d.improved.length, 1)
    const badge = badgeFor(d)
    assert.equal(badge.direction, 'mixed')
    // 一句话总结里"变差"必须在前 —— 坏消息被好消息稀释掉就等于没说
    const text = describeDiff(d)
    const lines = text.split('\n')
    const iWorse = lines.findIndex((l) => l.includes('bad'))
    const iBetter = lines.findIndex((l) => l.includes('good'))
    assert.ok(iWorse >= 0 && iBetter >= 0)
    assert.ok(iWorse < iBetter, `变差应排在变好之前：\n${text}`)
  })

  test('describeDiff 在不可比时给出原因，而不是空字符串', () => {
    assert.match(describeDiff(null), /没有基线/)
    assert.match(describeDiff({ comparable: false, reason: 'xyz' }), /xyz/)
  })
})
