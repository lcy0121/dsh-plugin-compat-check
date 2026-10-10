/**
 * A4b 决策分析：客户端 `client-extra` 桶里那 487 个文件，排与不排差在哪。
 *
 * 这个工具不改变任何默认行为，只是把 `extractWithProvenance` 的
 * `options.skipClientExtra` 开关跑几遍，把差异摊开：
 *
 *   base  = 全扫（当前默认）
 *   src   = 排除包内 `src/`（真正运行的是构建后的 lib/dist）
 *   nm    = 排除嵌套 `node_modules/`（第三方依赖）
 *   both  = 两者都排
 *
 * 关键不是"消失了多少"，而是**消失的是不是真东西**。所以它会把每个消失的服务
 * 拿去和官方生成的 API 目录比对，分成三类：
 *   宿主服务 / 客户端服务 / 都不是（那多半就是 `ctx.parser` 那类假阳性）
 *
 * 用法:
 *   node tools/parity/a4b-diff.mjs <node_modules 目录> [宿主服务目录.json] [客户端服务目录.json]
 */

import fs from 'node:fs'
import { extractWithProvenance } from '../../lib/extract.mjs'

const [nm, hostCatalogPath, clientCatalogPath] = process.argv.slice(2)
if (!nm) {
  console.error('用法: node tools/parity/a4b-diff.mjs <node_modules 目录> [宿主服务目录.json] [客户端服务目录.json]')
  process.exit(2)
}

const readList = (p) => {
  if (!p) return null
  try { return new Set(JSON.parse(fs.readFileSync(p, 'utf8'))) } catch { return null }
}
const HOST = readList(hostCatalogPath)
const CLIENT = readList(clientCatalogPath)

const VARIANTS = {
  // 默认已经排除 src/ 了，所以「全扫」必须显式关掉默认规则
  full: { skipClientExtra: () => false },
  default: {},
  base: {},
  src: { skipClientExtra: (rel) => rel.startsWith('src/') || rel.includes('/src/') },
  nm: { skipClientExtra: (rel) => rel.includes('node_modules/') },
  both: { skipClientExtra: (rel) => rel.startsWith('src/') || rel.includes('/src/') || rel.includes('node_modules/') },
}

const runs = {}
for (const [name, options] of Object.entries(VARIANTS)) {
  const { report, provenance } = extractWithProvenance(nm, options)
  const counts = {}
  for (const p of Object.values(provenance.packages)) {
    for (const [k, v] of Object.entries(p.counts)) counts[k] = (counts[k] || 0) + v
  }
  runs[name] = { report, provenance, counts }
}

const base = runs.base.report
const baseSvc = new Set(base.services)
const baseCalls = new Map(Object.entries(base.calls).map(([k, v]) => [k, new Set(v)]))
const nBaseCalls = [...baseCalls.values()].reduce((a, s) => a + s.size, 0)

console.log(`样本: ${nm}`)
console.log(`基准（全扫）: ${base.manifests.length} 个插件、${baseSvc.size} 个服务、${nBaseCalls} 个调用点\n`)

console.log('变体            扫到的文件                                    消失的服务  消失的调用点')
console.log('─'.repeat(96))
for (const name of ['full', 'default', 'src', 'nm', 'both']) {
  const { report, counts } = runs[name]
  const svc = new Set(report.services)
  const lost = [...baseSvc].filter((s) => !svc.has(s))
  const calls = new Map(Object.entries(report.calls).map(([k, v]) => [k, new Set(v)]))
  let lostCalls = 0
  for (const [k, ms] of baseCalls) {
    for (const m of ms) if (!(calls.get(k) || new Set()).has(m)) lostCalls++
  }
  const fileDesc = `h=${counts['host-entry'] || 0} c=${counts['client-entry'] || 0} x=${counts['client-extra'] || 0} f=${counts.fallback || 0}`
  console.log(`${name.padEnd(15)} ${fileDesc.padEnd(44)} ${String(lost.length).padStart(10)} ${String(lostCalls).padStart(12)}`)
}

// ── 只对「两者都排」这一档做逐条归因，因为它是差异最大的 ──
const lostAll = [...baseSvc].filter((s) => !new Set(runs.both.report.services).has(s))
if (!lostAll.length) {
  console.log('\n两个变体都没有服务消失。')
  process.exit(0)
}

const classify = (svc) => {
  if (HOST && HOST.has(svc)) return '宿主服务'
  if (CLIENT && CLIENT.has(svc)) return '客户端服务'
  if (!HOST && !CLIENT) return '未知（无目录可比）'
  return '都不是 ← 疑似假阳性'
}

// 从基准的 client-extra 文件里找谁提到了这个服务，作为归因证据
const extraFiles = new Map() // rel -> package
for (const [pkg, p] of Object.entries(runs.base.provenance.packages)) {
  for (const rel of p.files['client-extra']) extraFiles.set(`${pkg}|${rel}`, { pkg, rel })
}
const droppedBoth = (pkg, rel) =>
  rel.startsWith('src/') || rel.includes('/src/') || rel.includes('node_modules/')

const evidence = new Map()
for (const [, { pkg, rel }] of extraFiles) {
  if (!droppedBoth(pkg, rel)) continue
  let txt = ''
  try { txt = fs.readFileSync(`${nm}/${pkg}/${rel}`, 'utf8') } catch { continue }
  for (const svc of lostAll) {
    if (evidence.has(svc)) continue
    if (new RegExp(`\\b${svc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(txt)) {
      evidence.set(svc, `${pkg}/${rel}`)
    }
  }
}

console.log(`\n排除「两者都排」时消失的 ${lostAll.length} 个服务，逐条归因：\n`)
console.log('服务'.padEnd(26) + '分类'.padEnd(20) + '来源证据')
console.log('─'.repeat(110))
for (const svc of lostAll.sort()) {
  const cls = classify(svc)
  const ev = evidence.get(svc) || '（未在排除的文件里定位到）'
  console.log(svc.padEnd(26) + cls.padEnd(20) + ev.slice(0, 62))
}
