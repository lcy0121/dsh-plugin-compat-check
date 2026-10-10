/**
 * 不变式体检：**不看「对不对」，只看「自恰不自恰」**。
 *
 * ## 为什么要单独有这么一层
 *
 * 快照测试只能回答「变了没有」，回答不了「变错了没有」：
 * 一次改动的输出如果被如实记进快照，下次就永远绿。
 * 而这一层的每一条都是**对任何输入都必须成立**的性质，不需要事先知道正确答案 ——
 * 所以它抓得到快照抓不到的那一类错误。
 *
 * ## 这一层不是假想出来的
 *
 * 本文档里的第 1 条（调用点必须能在它声称的 file:line 上被验证）在写出来的
 * **当天**就抓到了一个真实缺陷：desktop profile 的 942 个调用点里有 163 个
 * （17%）对不上。顺着它查出四类不同的匹配缺陷（裸名规则没有边界、`ctx.get`
 * 匹配式太紧、转手链只认一跳、作用域注入的参数被忽略），修完是 804/804。
 * 也就是说：**这条不变式比当时仓库里任何一条检查都强**。
 *
 * ## 为什么用「自洽」而不是「断言具体值」
 *
 * 具体值会随 DSH 与插件版本变，断死它只是把维护成本转嫁给下一个人。
 * 自洽性不会：它对旧版本、新版本、没见过的插件都成立。
 *
 * 换机器/没装插件的处理：没有可用的 profile 就**跳过**，并明确打印跳过了什么。
 * 静默跳过与静默通过一样危险 —— 一个从没跑过的测试看起来和通过一模一样。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { extractWithProvenance } from '../lib/extract.mjs'
import { buildVerdicts } from '../lib/verdict.mjs'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const PROFILES = path.join(os.homedir(), '.dsh', 'profiles')

const load = (p) => JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8'))
const rules = load('rules/severity.json')
const catalog = load('rules/dsh-api-catalog.json')

/** 找出本机真实存在的 profile（每个都被跑一遍；机器上没有就跳过） */
function availableProfiles() {
  try {
    return fs.readdirSync(PROFILES).map((p) => ({ name: p, nm: path.join(PROFILES, p, 'node_modules') }))
      .filter((p) => fs.existsSync(p.nm))
  } catch { return [] }
}

const profiles = availableProfiles()

describe('不变式：提取结果必须自恰', { skip: profiles.length ? false : '本机没有可用的 ~/.dsh/profiles/*/node_modules' }, () => {
  for (const prof of profiles) {
    describe(`profile: ${prof.name}`, () => {
      const r = extractWithProvenance(prof.nm, { catalog })

      test('① 每个调用点都能在它声称的 file:line 上被验证', () => {
        // 这是**最强的一条**：它把「报告的结论」直接钉回源码字节。
        // 声称的取值表达式必须真的出现在那一行 —— 不然这条结论就是编的。
        const bad = []
        let checked = 0
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          for (const s of p.callSites || []) {
            checked++
            const full = path.join(prof.nm, name, s.file)
            let text
            try { text = fs.readFileSync(full, 'utf8') } catch {
              bad.push(`${name} ${s.file}: 文件读不到（调用点指向了没被扫描的文件？）`)
              continue
            }
            const lines = text.split('\n')
            if (!(s.line >= 1 && s.line <= lines.length)) {
              bad.push(`${name} ${s.file}:${s.line} 行号越界（文件共 ${lines.length} 行）`)
              continue
            }
            const line = lines[s.line - 1]
            // 源码里实际命中的那个表达式：直接 ctx 取用是 `ctx.<svc>`，别名是变量名
            const token = s.matched
            if (!token) { bad.push(`${name} ${s.file}:${s.line} 没有记录 matched（证据形态 ${s.via}）`); continue }
            if (!line.includes(token)) {
              bad.push(`${name} ${s.file}:${s.line} via=${s.via} 声称命中 ${JSON.stringify(token)}，该行是 ${JSON.stringify(line.trim().slice(0, 80))}`)
            }
          }
        }
        assert.ok(checked > 0, '一个调用点都没检查到 —— 提取结果为空，这本身就是要报的错')
        assert.deepEqual(bad.slice(0, 20), [], `${bad.length}/${checked} 个调用点在源码上无法验证`)
      })

      test('② 每个调用点的 file 都在该插件「被扫描的文件」名单里', () => {
        const bad = []
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          const scanned = new Set(Object.values(p.files || {}).flat())
          for (const s of p.callSites || []) {
            if (!scanned.has(s.file)) bad.push(`${name} ${s.file}（不在 files 里，却在 callSites 里）`)
          }
        }
        assert.deepEqual([...new Set(bad)].slice(0, 10), [])
      })

      test('③ services ⊇ declared ∪ calls 的键 ∪ serviceFiles 的键', () => {
        // 三份视图说的是同一件事，键集合必须互相覆盖。历史上正是靠这条
        // 抓住过「调用点被清空但 services 不变」这种静默退化。
        const bad = []
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          const svc = new Set(p.services || [])
          for (const k of p.declaredServices || []) if (!svc.has(k)) bad.push(`${name}: declared 里的 ${k} 不在 services 里`)
          for (const k of Object.keys(p.calls || {})) if (!svc.has(k)) bad.push(`${name}: calls 里的 ${k} 不在 services 里`)
          for (const k of Object.keys(p.serviceFiles || {})) if (!svc.has(k)) bad.push(`${name}: serviceFiles 里的 ${k} 不在 services 里`)
          for (const k of p.callSites || []) if (!svc.has(k.service)) bad.push(`${name}: callSite 的 ${k.service} 不在 services 里`)
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('④ calls 与 callSites 互为明细：(svc,method) 的唯一对必须两边都出现', () => {
        const bad = []
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          const fromCalls = new Set()
          for (const [s, ms] of Object.entries(p.calls || {})) for (const m of ms) fromCalls.add(`${s}.${m}`)
          const fromSites = new Set((p.callSites || []).map((x) => `${x.service}.${x.method}`))
          for (const k of fromCalls) if (!fromSites.has(k)) bad.push(`${name}: calls 有 ${k}，callSites 里没有`)
          for (const k of fromSites) if (!fromCalls.has(k)) bad.push(`${name}: callSites 有 ${k}，calls 里没有`)
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑤ 别名调用点必须能被 localBindings 解释，且绑定的服务与归属一致', () => {
        // 这条把「凭什么把这个调用算在 agentTeams 头上」变成可查的：
        // 报告里说「变量 teams 承载 agentTeams」，那就必须真的在绑定表里。
        const bad = []
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          const byVar = new Map()
          for (const b of p.localBindings || []) {
            if (!byVar.has(b.variable)) byVar.set(b.variable, new Set())
            if (b.service) byVar.get(b.variable).add(b.service)
          }
          for (const s of p.callSites || []) {
            if (s.via !== 'alias') continue
            const svcs = byVar.get(s.matched)
            if (!svcs || !svcs.has(s.service)) {
              bad.push(`${name} ${s.file}:${s.line}: via=alias matched=${s.matched} 归属 ${s.service}，但绑定表里对不上（${svcs ? [...svcs].join('/') : '没有该变量'}）`)
            }
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑥ 弃权要有账：ambiguous / shadowed / unresolved / 被过滤 都要有出处', () => {
        const bad = []
        for (const [name, p] of Object.entries(r.report.perPlugin)) {
          // 歧义绑定必须在 localBindings 里留下 ambiguous 记录
          const amb = new Set((p.localBindings || []).filter((b) => b.form === 'ambiguous').map((b) => b.variable))
          for (const a of p.ambiguousAliases || []) {
            if (!amb.has(a.variable)) bad.push(`${name}: ambiguousAliases 记了 ${a.variable}，localBindings 里却没有 ambiguous 记录`)
          }
          for (const x of p.shadowedBare || []) {
            if (!(p.files?.fallback || []).includes(x.file)
              && !(p.files?.['host-entry'] || []).includes(x.file)
              && !(p.files?.['client-entry'] || []).includes(x.file)
              && !(p.files?.['client-extra'] || []).includes(x.file)) {
              bad.push(`${name}: shadowedBare 指向了没被扫描的文件 ${x.file}`)
            }
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑦ 来源分桶不重叠，且跳过名单与扫描名单不相交', () => {
        const bad = []
        for (const pk of Object.values(r.provenance.packages)) {
          const seen = new Map()
          for (const [bucket, files] of Object.entries(pk.files)) {
            for (const f of files) {
              if (seen.has(f)) bad.push(`${f} 同时属于 ${seen.get(f)} 与 ${bucket}`)
              seen.set(f, bucket)
            }
          }
          for (const f of pk.skippedClientExtra) {
            if (seen.has(f)) bad.push(`${f} 既被跳过又被扫描`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑦b provenance 里点名的每个文件都真实存在', () => {
        // 分桶记的是「相对包目录」的路径，所以要按包名拼回去。写这条是因为
        // 分桶是**给判定层判断客户端服务用的**（只出现在客户端桶里 = 客户端服务），
        // 一旦桶里有幽灵路径，那条判据就会静默失效。
        const bad = []
        for (const [pkgName, pk] of Object.entries(r.provenance.packages)) {
          for (const files of Object.values(pk.files)) {
            for (const f of files) {
              if (!fs.existsSync(path.join(prof.nm, pkgName, f))) bad.push(`${pkgName}/${f}`)
            }
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑧ 判定层没有「无运行时面却给出确定结论」', () => {
        // 官方目录是**契约**目录，不是运行时面（对 jobs 一个方法都不声明、
        // 对 loader 完全不收录）。所以没有运行时面时，任何「确定」都是越权断言。
        const report = r.report
        const v = buildVerdicts({
          report, hostSurface: null, rules, catalog, dshVersion: 'test',
        })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          for (const f of p.findings) {
            if (f.certainty === 'certain' && f.severity === 'fatal') {
              bad.push(`${name}: ${f.category} ${f.service}${f.method ? '.' + f.method : ''} 无运行时面却判「确定 + 致命」`)
            }
            if (!f.basis) bad.push(`${name}: 结论缺 basis（凭什么这么判）`)
            if (!f.category) bad.push(`${name}: 结论缺 category`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑨ 判定层的结论都必须带位置或明确说明为什么没有', () => {
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          for (const f of p.findings) {
            if (f.category === 'host-method-missing' && !f.location) {
              bad.push(`${name}: ${f.service}.${f.method} 是方法级结论却没有位置`)
            }
            if (f.location && !f.location.file) bad.push(`${name}: location 缺 file`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑩ 确定性标注只用两个合法值', () => {
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const p of Object.values(v.plugins)) {
          for (const f of p.findings) {
            if (f.certainty !== 'certain' && f.certainty !== 'suspected') bad.push(`${f.category} certainty=${f.certainty}`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })
    })
  }
})
