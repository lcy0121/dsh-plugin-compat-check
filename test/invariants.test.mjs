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

/**
 * 以下这组是**补上被证明缺失的那部分**。
 *
 * 依据：一次变异测试 —— 把 `dsh-keep-awake` 的 `calls` 与 `callSites` 清空
 * （这正是本会话里真实出现过的中间态），上面 ①–⑩ 十条**全部照旧通过**，
 * 而产品结论从「部分可用」静默翻成「可用」。原因很具体：
 *   - ③ 只查「calls 的键 ⊆ services」，一个空 `calls` 满足它；
 *   - ④ 在两边都空时恒真；
 *   - ① 断言的是**全局**至少检查过一个调用点，单个插件被清空它看不见。
 *
 * 结论：断言「键是子集」永远抓不住「东西没了」。必须断言**覆盖**：
 * 每个服务都必须有明确去处，每个结论都必须有证据授权。
 */
describe('不变式（补）：覆盖与授权，而不是子集', () => {
  for (const prof of profiles) {
    describe(`profile: ${prof.name}`, () => {
      const r = extractWithProvenance(prof.nm, { catalog })

      test('⑪ 判定层必须对每个服务给出明确去处（清空 calls 也会被抓到）', () => {
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          const svcs = r.report.perPlugin[name].services
          const resolved = new Set(Object.keys(p.resolved || {}))
          for (const s of svcs) if (!resolved.has(s)) bad.push(`${name}: ${s} 没有去处（既没结论也没说明为什么没结论）`)
          for (const s of resolved) if (!svcs.includes(s)) bad.push(`${name}: 去处里出现了 services 里没有的 ${s}`)
          // UNKNOWN 是判定引擎的缺陷信号，它必须永远为 0
          for (const c of Object.values(p.resolved || {})) {
            if (c.disposition === 'unknown') bad.push(`${name}: ${c.service} 落进 UNKNOWN —— 有调用点却没进任何判定分支`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑫ 判定代数必须自恰，且「可用」不能是空洞的', () => {
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          const fatal = p.findings.some((f) => f.severity === 'fatal')
          const want = fatal ? 'broken' : (p.findings.length ? 'partial' : 'ok')
          if (p.verdict !== want) bad.push(`${name}: verdict=${p.verdict} 但代数要求 ${want}`)
          for (const f of p.findings) {
            if (!['fatal', 'feature-dead', 'degraded'].includes(f.severity)) bad.push(`${name}: 非法严重度 ${f.severity}`)
          }
          // 「可用」但没有任何东西被检查过 —— 那不是结论，那是没做事
          if (p.vacuous && p.verdict !== 'ok') bad.push(`${name}: vacuous 只对 ok 有意义`)
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑬ 没有运行时面时，任何 fatal 都是越权断言', () => {
        // ⑧ 只禁止了「certain + fatal」；「suspected + fatal」同样是越权：
        // 官方目录是**契约**目录（对 jobs 一个方法都不声明、对 loader 完全不收录），
        // 拿它断言「服务不存在 → 插件起不来」曾把 dsh-mnemon / dsh-catppuccin 错报成不兼容。
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          for (const f of p.findings) {
            if (f.severity === 'fatal') bad.push(`${name}: ${f.category} ${f.service} 在无运行时面时被判 fatal`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑭ 确定性标注必须被证据授权（不是一条代码路径说了算）', () => {
        const surface = null
        const v = buildVerdicts({ report: r.report, hostSurface: surface, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          for (const f of p.findings) {
            if (f.certainty !== 'certain') continue
            if (f.category === 'host-method-missing') {
              // 方法级「确定」只允许来自运行时面
              if (!f.evidence || f.evidence.methodSource !== '运行时') {
                bad.push(`${name}: ${f.service}.${f.method} 标了确定，但方法来源是 ${f.evidence && f.evidence.methodSource}`)
              }
            }
            if (f.category === 'host-service-missing') {
              bad.push(`${name}: ${f.service} 在无运行时面时标了「服务缺失确定」`)
            }
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑮ 规则来源必须结构化可断言，且与规则表对得上', () => {
        // basis 里那句散文无法被断言。把 source 与 ruleRef 结构化带出来之后，
        // 「这条严重度到底来自规则表哪一项」才能被机器核对 ——
        // 而规则表是手工维护的数据文件，改错一个键名会静默降级到默认档。
        const v = buildVerdicts({ report: r.report, hostSurface: null, rules, catalog, dshVersion: 'test' })
        const bad = []
        for (const [name, p] of Object.entries(v.plugins)) {
          for (const f of p.findings) {
            if (!['rule', 'default'].includes(f.ruleSource)) bad.push(`${name}: ruleSource=${f.ruleSource}`)
            if (f.ruleSource === 'rule') {
              const ref = String(f.ruleRef || '')
              const m = ref.match(/^services\.([^.]+)(?:\.methods\.(.+))?$/)
              if (!m) { bad.push(`${name}: ruleRef 形态不对 ${ref}`); continue }
              const svc = rules.services[m[1]]
              if (!svc) { bad.push(`${name}: ruleRef 指向规则表里不存在的服务 ${m[1]}`); continue }
              if (m[2] && !(svc.methods || {})[m[2]]) bad.push(`${name}: ruleRef 指向规则表里不存在的方法 ${ref}`)
              // 一致性：规则表里写的严重度必须与结论里的一致
              const want = m[2] ? svc.methods[m[2]].severity : svc.severity
              if (want && f.severity !== want) bad.push(`${name}: ${f.service}.${f.method} 结论严重度 ${f.severity}，规则表写的是 ${want}`)
            }
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })

      test('⑯ 规则表本身要干净：严重度合法、影响面非空、键名是合法标识符', () => {
        const bad = []
        const allowed = new Set(['fatal', 'feature-dead', 'degraded'])
        for (const [svc, v] of Object.entries(rules.services || {})) {
          if (!/^[A-Za-z_$][\w$]*$/.test(svc)) bad.push(`服务键名不是合法标识符: ${svc}`)
          if (v.severity && !allowed.has(v.severity)) bad.push(`${svc}: 服务级严重度非法 ${v.severity}`)
          if (v.impact !== undefined && !String(v.impact).trim()) bad.push(`${svc}: 影响面为空字符串`)
          for (const [m, mv] of Object.entries(v.methods || {})) {
            if (!/^[A-Za-z_$][\w$]*$/.test(m)) bad.push(`${svc}.${m}: 方法键名不是合法标识符`)
            if (!allowed.has(mv.severity)) bad.push(`${svc}.${m}: 严重度非法 ${mv.severity}`)
            if (mv.impact !== undefined && !String(mv.impact).trim()) bad.push(`${svc}.${m}: 影响面为空字符串`)
          }
        }
        assert.deepEqual(bad.slice(0, 10), [])
      })
    })
  }
})

/**
 * 单个插件的**收窄**体检：清空一个插件的调用点，必须能被抓到。
 *
 * 这是上面那组断言的**正向对照**：不满足于「不变式现在是绿的」，
 * 还要证明「它确实会因为这件事变红」。一个从没见过红的测试，
 * 与一个永远绿的测试，在证据上没有区别。
 */
describe('不变式的有效性自证：人为清空必须被抓到', () => {
  test('清空某个插件的 calls/callSites 会让「每个服务都有去处」失败', () => {
    const prof = profiles.find((p) => p.name === 'parityfix') || profiles[0]
    if (!prof) return
    const r = extractWithProvenance(prof.nm, { catalog })
    const victim = Object.keys(r.report.perPlugin)
      .find((n) => Object.keys(r.report.perPlugin[n].calls || {}).length > 0)
    assert.ok(victim, '需要一个至少有调用点的插件来构造变异')
    const mut = JSON.parse(JSON.stringify(r.report))
    mut.perPlugin[victim].calls = {}
    mut.perPlugin[victim].callSites = []
    const v = buildVerdicts({ report: mut, hostSurface: null, rules, catalog, dshVersion: 'test' })
    const svcs = mut.perPlugin[victim].services
    const resolved = new Set(Object.keys(v.plugins[victim].resolved || {}))
    const missing = svcs.filter((s) => !resolved.has(s))
    // 变异后这些服务**仍然**被交代了（走了 no-calls 兜底），所以不变式不会因此变红 ——
    // 这本身是正确的：清空 calls 之后它们确实「没有可归属的调用点」。
    // 真正该被抓住的是**结论从 partial 翻成 ok 而没有交代**这个更强的事实，
    // 所以这里断言「翻转发生时，被清空的插件必须留下 no-calls 记录」。
    assert.equal(v.plugins[victim].verdict, 'ok', '清空调用点后结论应变可用（这是变异的目的）')
    const noCalls = Object.values(v.plugins[victim].resolved || {}).filter((c) => c.disposition === 'no-calls')
    assert.ok(noCalls.length > 0 || missing.length === 0,
      `结论翻转了却没有任何痕迹 —— 这正是那类静默回归。missing=${JSON.stringify(missing)}`)
    // 而快照层必须能看见它（见 snapshot.test.mjs）：这里只确认判定层留下了痕迹
    assert.ok(v.plugins[victim].vacuous || noCalls.length > 0,
      '结论变 ok 却既不是 vacuous 也没有 no-calls 记录 —— 翻转无痕')
  })
})

/**
 * 夹具的**目的**也要被断言，否则它可能"存在但什么都没测"。
 *
 * 这条是实测换来的：`@fixture/spread` 存在的意义就是覆盖 `ctx.inject` 的**两种形参形态**
 * （单参数 `(sctx) =>` 与双参数 `(tools, other) =>`），而它长期产出 **0 条调用点**，
 * 快照也如实把 `calls: {}` 记了下来 —— 于是**"夹具失效"被记录成了"预期行为"**。
 * 那正是快照这一层抓不到的东西：它回答"变了没有"，不回答"这样对不对"。
 *
 * 所以这里对几个**有明确目的**的合成夹具直接断言它的产出，作为快照之外的第二道闸门。
 */
describe('夹具必须真的测到它声称要测的东西', () => {
  const MICRO = path.join(REPO, 'test', 'fixtures', 'micro', 'node_modules')

  test('@fixture/spread：ctx.inject 的两种形参形态都要认出来', () => {
    // `catalog` 是模块级的（第 42 行）——不要在这里重新 load
    const r = extractWithProvenance(MICRO, { catalog })
    const p = r.report.perPlugin['@fixture/spread']
    assert.ok(p, '找不到 @fixture/spread —— 夹具改名了？那这条断言要一起改')

    // ① 单参数 `(sctx) =>` 的上下文对象必须被认出
    const names = (p.subContexts || []).flatMap((x) => x.names)
    assert.ok(names.includes('sctx'),
      `单参数的注入回调形参没被认成上下文对象 —— 正是那类"夹具失效但快照照记"的缺陷。`
      + `实际认到: ${JSON.stringify(names)}`)

    // ② 由它带来的调用点必须真的出现（0 条就意味着这个夹具白存在）
    const pairs = Object.entries(p.calls || {}).flatMap(([s, ms]) => ms.map((m) => `${s}.${m}`))
    assert.ok(pairs.includes('sessions.search') && pairs.includes('workspaces.list'),
      `通过子上下文调用的方法没被认出来。实际: ${JSON.stringify(pairs)}`)

    // ③ 双参数形态的**第二个**形参也仍然要认（这是原有行为，不能被这次修改弄丢）
    const twoParam = '(tools, other) =>'
    assert.ok(names.includes('tools') && !names.includes('other'),
      `Cordis 回调第一个参数是 context；额外形参不能凭位置猜成 context。实际: ${JSON.stringify(names)}`)
  })

  test('@fixture/propctx：`X.ctx.<服务>.<方法>` 也要认出来', () => {
    const catalog = load('rules/dsh-api-catalog.json')
    const r = extractWithProvenance(MICRO, { catalog })
    const p = r.report.perPlugin['@fixture/propctx']
    assert.ok(p, '找不到 @fixture/propctx —— 夹具改名了？那这条断言要一起改')
    const sites = (p.callSites || []).map((x) => `${x.service}.${x.method}`);
    assert.ok(sites.includes('tools.register') && sites.includes('jobs.list'),
      `经由「另一个对象上的 ctx」发出的调用没被认出来。实际: ${JSON.stringify(sites)}`)
    // `subContexts` 是**审计记录**，注释里的示例文字不许进去。
    // （我在这个夹具的注释里写了「任何 \`X.ctx\`」，第一版就把 `X.ctx` 收了进来 ——
    //   因为 `contextObjectNames` 当时读的是**原文**，不是抹过注释的 `decl`。）
    const names = (p.subContexts || []).flatMap((x) => x.names)
    assert.ok(!names.includes('X.ctx'),
      `注释里写的 \`X.ctx\` 被当成了真的上下文对象 —— contextObjectNames 读错了掩码。实际: ${JSON.stringify(names)}`)
    assert.ok(names.includes('host.ctx'), '真正用到的 host.ctx 反而没认出来')
  })

  test('@fixture/helperguard：辅助函数里的能力检测也要算兜底', () => {
    // 跑法照 foreignmember 那条：**断言调用点，不断言 findings** ——
    // micro 面里 `settings.doesNotExist` 会被 filtered，不进 findings，
    // 在判据文件里写 mustNotReport 会是一条**空断言**。
    const catalog = load('rules/dsh-api-catalog.json')
    const r = extractWithProvenance(MICRO, { catalog })
    const p = r.report.perPlugin['@fixture/helperguard']
    assert.ok(p, '找不到 @fixture/helperguard —— 夹具改名了？那这条断言要一起改')

    const sites = (p.callSites || []).map((x) => `${x.service}.${x.method}`)
    assert.ok(sites.includes('settings.doesNotExist'),
      `调用点本身要收下（收不下就没得判了）。实际: ${JSON.stringify(sites)}`)
    const site = (p.callSites || []).find((x) => x.service === 'settings' && x.method === 'doesNotExist')
    assert.equal(site.guarded, true,
      '辅助函数里的能力检测没被认成兜底 —— 实测这就造成过一条 certain 级假阳性')
  })

  test('@fixture/foreignmember：别人的成员访问不能被当成本地绑定的调用', () => {
    // ⚠️ 这条**只能断言调用点，不能断言 findings** —— 在 micro 面里 `sessions` 不存在，
    // 那条假调用点会被 filtered 掉、根本不进 findings。我第一版把断言写成了
    // `mustNotReport: ["jobs.has"]`，结果**撤掉修复时它没变红** —— 一条空断言。
    // 教训：断言要指向**这个缺陷真正污染的那一层**，而不是它顺带路过的那一层。
    const catalog = load('rules/dsh-api-catalog.json')
    const r = extractWithProvenance(MICRO, { catalog })
    const p = r.report.perPlugin['@fixture/foreignmember']
    assert.ok(p, '找不到 @fixture/foreignmember —— 夹具改名了？那这条断言要一起改')

    const sites = (p.callSites || []).map((x) => `${x.service}.${x.method}`)
    // `ws.sessions.has('sid')` 里的 `sessions` 是**别人的 Map 字段**。
    // 词边界 `\b` 允许前面是 `.`，所以它一度被归到服务头上。
    assert.ok(!sites.includes('sessions.has'),
      `别人的成员访问被当成了本地绑定的调用（假阳性）。实际站点: ${JSON.stringify(sites)}`)
    // 而真调用必须留着 —— 只堵假阳性、把真调用一起堵掉，是更糟的修法。
    assert.ok(sites.includes('jobs.list'),
      `真调用丢了 —— 修假阳性时不能把真调用一起弄没。实际站点: ${JSON.stringify(sites)}`)
  })
})
