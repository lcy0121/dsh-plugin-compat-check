/**
 * 静态提取：从插件源码里找出它「实际调用」的服务与方法。
 *
 * 这是 dsh-plugin-compat-check.sh 里那段 python（③ 静态提取）的 Node 移植版。
 * 移植的验收标准是 **与 python 版输出逐字段一致** —— 对拍脚本见 tools/parity/parity.sh，
 * 它直接从 .sh 里抽出 python 源码来跑，避免比到一个已经漂移的副本。
 *
 * 为什么必须移植：Windows 上既没有 bash 也没有 python3，而插件产物要跨平台。
 *
 * 这里刻意保留 python 版的全部行为特征，**包括它的粗糙**：
 *  - 服务集合与调用集合是**跨插件全局累积**的（python 版就是这样，逐插件归属是后续要改的）；
 *  - `svcFiles` 的填充用的是全局 services 集合，所以文件归属会跨插件混在一起；
 *  - 方法级判定是正则启发式，含已知误报（例如 `locale.startsWith` 这种字符串方法）。
 * 行为对齐优先于顺手修正：先拿到「两边一致」，再谈改。
 */

import fs from 'node:fs'
import path from 'node:path'

const { join, dirname, resolve } = path.posix

/* ── 路径助手：对齐 python 的 os.path 语义 ─────────────────────────── */

function normpath(p) {
  if (p === '') return '.'
  const abs = p.startsWith('/')
  const out = []
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push('..')
      continue
    }
    out.push(part)
  }
  let r = out.join('/')
  if (abs) r = '/' + r
  return r === '' ? (abs ? '/' : '.') : r
}

/** python 的 str.lstrip('./') 是**按字符集**剥离，不是剥离前缀字符串 */
function lstripChars(s, chars) {
  let i = 0
  while (i < s.length && chars.includes(s[i])) i++
  return s.slice(i)
}

function relpath(p, start) {
  const pp = resolve(p)
  const sp = resolve(start)
  if (pp === sp) return '.'
  const pa = pp.split('/').filter(Boolean)
  const sa = sp.split('/').filter(Boolean)
  let i = 0
  while (i < pa.length && i < sa.length && pa[i] === sa[i]) i++
  const parts = []
  for (let j = i; j < sa.length; j++) parts.push('..')
  return parts.concat(pa.slice(i)).join('/')
}

function isFile(p) {
  try { return fs.statSync(p).isFile() } catch { return false }
}

function readText(p) {
  // python 版用 encoding='utf-8', errors='ignore'；Node 会把非法字节换成 U+FFFD
  // 而不是丢弃。对「提取服务/方法名」这个用途没有实际影响，记录在此备查。
  try { return fs.readFileSync(p, 'utf8') } catch { return null }
}

/* ── 插件入口与本地依赖图 ──────────────────────────────────────── */

function pkgJson(dir) {
  try { return JSON.parse(fs.readFileSync(join(dir, 'package.json'), 'utf8')) } catch { return null }
}

/** package.json 声明的入口：exports['.'] 优先，退回 main */
function mainEntry(j) {
  const exp = j.exports
  if (exp && typeof exp === 'object' && !Array.isArray(exp)) {
    const dot = exp['.']
    if (typeof dot === 'string') return dot
    if (dot && typeof dot === 'object') {
      for (const k of ['default', 'import', 'require']) {
        if (typeof dot[k] === 'string') return dot[k]
      }
    }
  }
  return j.main || 'index.js'
}

/**
 * 从 dsh.bundle.patch → cordis.patch.yml 读出**实际被挂载**的入口。
 *
 * 这是精度关键：包里常有不会被加载的伴随模块（实测有插件带一个 lib/invariant.js，
 * 主入口并不 import 它、patch 也没挂载它）。整包扫描会把这些孤儿模块需要的服务
 * 当成真实缺口，把判定压得过低。
 */
function mountedEntries(full, j) {
  const patch = ((j.dsh || {}).bundle || {}).patch
  const seeds = []
  if (patch) {
    const txt = readText(join(full, patch))
    if (txt !== null) {
      for (const m of txt.matchAll(/^\s*-\s*name:\s*['"]?([^\s'"]+)/gm)) {
        seeds.push(m[1].startsWith('.') ? normpath(m[1]) : mainEntry(j))
      }
    }
  }
  if (!seeds.length) seeds.push(mainEntry(j))
  return seeds.map((s) => lstripChars(s, './'))
}

/** 从入口出发收集本地相对依赖图 */
function localGraph(full, seeds) {
  // seen   = 已成功解析出的文件（返回值与原版严格一致）
  // visited = 已出队检查过的**路径形态**，用来堵住原版的无界循环：
  //
  //   原版只用 seen 做去重，而「靠补扩展名才解析成功」时它把**解析后**的路径
  //   （b.js）放进 seen，队列里传的却是**未解析**形态（b）。于是 rel in seen
  //   永远不成立 → 每次访问都重新读文件、重新展开它的导入 → 只要有环就无界膨胀。
  //   实测：3 个 JS 文件（无扩展名 ESM 导入 + 成环）即可让它 98% CPU 空转不停，
  //   真实插件里 @liustack/modlens 打包的 undici 就是这个写法。
  //
  // 修法是把「检查过」与「解析成功」分开，不改变返回的图，只去掉重复展开。
  const seen = new Set()
  const visited = new Set()
  const queue = seeds.slice()
  while (queue.length) {
    let rel = queue.pop()
    if (!rel || visited.has(rel)) continue
    visited.add(rel)
    let p = join(full, rel)
    if (!isFile(p)) {
      let hit = null
      for (const e of ['.js', '.mjs', '.cjs', '.ts', '/index.js', '/index.mjs', '/index.ts']) {
        if (isFile(p + e)) { hit = p + e; break }
      }
      if (!hit) continue
      p = hit
      rel = relpath(p, full)
    }
    if (seen.has(rel)) continue
    seen.add(rel)
    const txt = readText(p)
    if (txt === null) continue
    for (const m of txt.matchAll(
      /from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const spec = m[1] || m[2] || m[3] || ''
      if (spec.startsWith('.')) queue.push(normpath(join(dirname(rel), spec)))
    }
  }
  return seen
}

function walkFiles(root) {
  const out = []
  const stack = ['']
  while (stack.length) {
    const relDir = stack.pop()
    let entries
    try { entries = fs.readdirSync(join(root, relDir), { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const rel = relDir ? join(relDir, e.name) : e.name
      if (e.isDirectory()) stack.push(rel)
      else if (e.isFile()) out.push(rel)
    }
  }
  return out
}

/** package.json 声明的客户端入口（`exports["./client"]`），没有则 null */
function declaredClientEntry(j) {
  const exp = j.exports
  if (exp && typeof exp === 'object' && !Array.isArray(exp)) {
    const c = exp['./client']
    if (typeof c === 'string') return c
    if (c && typeof c === 'object' && typeof c.default === 'string') return c.default
  }
  return null
}

/**
 * 包里所有「长得像客户端代码」的文件。
 *
 * ⚠️ 这里有个反直觉的事实，是实测换来的，**不要按"只扫声明入口"去收窄**：
 * 插件可以把客户端代码切成懒加载 chunk，用自己宿主半边的 HTTP 路由按 URL 取回来。
 * 实例 `dsh-better-sidebar`：`exports["./client"]` 只是 `lib/client.js`，而
 * `lib/client-editor.js` / `client-locale.js` / `client-mermaid.js` 是通过
 * `CHUNK_URL = (name) => `/sidebar/bundle/${name}.js`` 懒加载的真实代码 ——
 * 从声明入口做静态可达性分析**永远够不到它们**。
 *
 * 所以：宁可多扫（假阳性，可用确定性标注降级），也不能少扫（假阴性，会让结论撒谎）。
 * 来源由 collectFiles 分桶标出，供判定层区分确定性。
 */
function walkClientSeeds(full) {
  const seeds = []
  for (const rel of walkFiles(full)) {
    if (/\.(js|mjs|cjs|ts)$/.test(rel) && rel.toLowerCase().includes('client')) seeds.push(rel)
  }
  return seeds
}

/**
 * `client-extra` 桶的**默认**排除规则：跳过包内的 TS 源码树。
 *
 * 依据（实测，见 Plan.md §5 A4b）：真正运行的是构建后的 `lib/` / `dist/` 产物；
 * `src/` 是它的源，扫它等于把同一份逻辑扫两遍。在 desktop profile 上排除它有
 * **零信息损失**：487 → 167 个文件，而服务 −0、调用点 −0、clientHints 零变化。
 *
 * 边界（重要，别记错）：
 *   - 只作用于 `client-extra` 这个「广度桶」。`host-entry` / `client-entry` 是从
 *     真实入口可达的权威代码，永不受影响 —— 所以「源码直发、入口就指向 src/」
 *     的插件完全不受本规则影响。
 *   - 只阻止该文件**被扫描**，不改变依赖图遍历。源码文件仍会被读来解析 import，
 *     所以它省的是扫描与上报面，不是全部 IO。
 */
const DEFAULT_SKIP_CLIENT_EXTRA = (rel) => rel.startsWith('src/') || rel.includes('/src/')

/**
 * 返回 [需要扫描的文件 [[相对路径, 文本]], 是否退回整包扫描, 来源分桶 Map<rel, bucket>, 被跳过的文件]。
 *
 * 来源分桶**不改变被扫描的文件集合**（默认排除规则除外），只记录每个文件是从哪条路进来的：
 *   - `host-entry`   ：从 dsh.bundle.patch / main 声明的宿主入口可达 → 确定
 *   - `client-entry` ：从 exports["./client"] 声明的客户端入口可达 → 确定
 *   - `client-extra` ：同包内其它「像客户端」的文件，可能是懒加载 chunk → 疑似
 *   - `fallback`     ：连入口都解析不出来，退回整包扫描 → 整体存疑
 */
function collectFiles(full, j, options = {}) {
  const graph = localGraph(full, mountedEntries(full, j))
  const fallback = graph.size === 0
  const files = []
  const rels = new Set()
  const buckets = new Map()
  const skipped = []

  const add = (rel, bucket) => {
    rel = normpath(rel)
    if (rels.has(rel)) return
    // `.d.ts` 是纯类型声明，不含任何可运行代码 —— 但它的文件名以 `.ts` 结尾，
    // 会被「像客户端」的路径遍历成片捞进来。实测 desktop profile 的客户端桶里
    // 846 个文件有 342 个是 .d.ts，全是噪音。排除它零风险。
    if (rel.endsWith('.d.ts')) return
    const txt = readText(join(full, rel))
    if (txt === null) return
    files.push([rel, txt])
    rels.add(rel)
    buckets.set(rel, bucket)
  }

  if (fallback) {
    for (const rel of walkFiles(full)) {
      if (/\.(js|mjs|cjs|ts)$/.test(rel)) add(rel, 'fallback')
    }
  } else {
    for (const rel of [...graph].sort()) add(rel, 'host-entry')

    const declared = declaredClientEntry(j)
    if (declared) {
      for (const rel of [...localGraph(full, [lstripChars(declared, './')])].sort()) {
        add(rel, 'client-entry')
      }
    }

    // 其余「像客户端」的文件单独成图。可达性的并集与原实现完全一致
    // （从种子并集出发的可达闭包 = 各自可达闭包的并集）。
    const walked = walkClientSeeds(full).map((s) => lstripChars(s, './')).filter(Boolean)
    // 只作用于 client-extra 这一桶：host-entry / client-entry 是从真实入口可达的
    // 权威代码，任何情况下都不该被排除。传 () => false 可关掉默认排除（对拍/分析用）。
    const skip = options.skipClientExtra === undefined ? DEFAULT_SKIP_CLIENT_EXTRA : options.skipClientExtra
    for (const rel of [...localGraph(full, walked)].sort()) {
      if (skip && skip(normpath(rel))) { skipped.push(normpath(rel)); continue }
      add(rel, 'client-extra')
    }
  }
  return [files, fallback, buckets, skipped]
}

/* ── 客户端归属启发式 ──────────────────────────────────────────── */

/**
 * 客户端提示：服务名属于已知客户端服务，或只在疑似客户端的路径里出现。
 *
 * 重要：这**只是提示，不是判据**。实测两个插件都存在同一服务被宿主与客户端
 * 同时引用的情况，所以文件路径无法可靠区分宿端/客户端。真正的判据是运行时探针
 * （插件形态下则直接查 ctx.loader 的真实 API 面）。
 */
const KNOWN_CLIENT = new Set(['slots', 'locale', 'uiRenderer', 'uiSlots', 'themeStore',
  'modules', 'clientModules', 'connection'])

function isClientFile(p) {
  return p.replace(/\\/g, '/').split('/').some((seg) => seg.toLowerCase().includes('client'))
}

function clientHint(svc, files) {
  if (KNOWN_CLIENT.has(svc)) return true
  for (const f of files) if (isClientFile(f)) return true
  return false
}

/* ── 主流程 ───────────────────────────────────────────────────── */

export function extractWithProvenance(nm, options = {}) {
  // 找出「社区插件」：package.json 里有 dsh 清单、且非 @deepseek-ai 官方
  const targets = []
  for (const entry of fs.readdirSync(nm).sort()) {
    const names = entry.startsWith('@')
      ? (() => { try { return fs.readdirSync(join(nm, entry)).sort().map((s) => join(entry, s)) } catch { return [] } })()
      : [entry]
    for (const base of names) {
      const full = join(nm, base)
      const j = pkgJson(full)
      if (!j || !('dsh' in j) || String(j.name ?? '').startsWith('@deepseek-ai/')) continue
      targets.push([base, full, j])
    }
  }

  const services = new Set()
  const calls = new Map()
  const manifests = []
  const svcFiles = new Map()
  const fallbackPkgs = []
  const provenance = {
    schemaVersion: 1,
    note: '每个被扫描文件的来源分桶。client-extra = 同包内其它「像客户端」的文件（可能是懒加载 chunk），'
      + '它们的调用点应当标为「疑似」而不是「确定」。skippedClientExtra = 被默认规则排除的文件（包内 src/ 源码树），'
      + '记下来是为了可审计：空谈"排了什么"没有意义，要能逐条查。',
    packages: {},
  }

  const addCall = (svc, method) => {
    if (!calls.has(svc)) calls.set(svc, new Set())
    calls.get(svc).add(method)
  }
  const addSvcFile = (svc, fname) => {
    if (!svcFiles.has(svc)) svcFiles.set(svc, new Set())
    svcFiles.get(svc).add(fname)
  }

  for (const [, full, j] of targets) {
    const dsh = j.dsh || {}
    const client = dsh.client || {}
    // 注意：这里必须把 undefined 归一成 null。python 的 json.dump 会把缺失值写成
    // null，而 JSON.stringify **直接省略** undefined 的键 —— 对拍一开始就是被这个
    // 抓到的（三个字段只在 python 版出现）。
    manifests.push({
      name: j.name ?? null,
      version: j.version ?? null,
      dshBundle: Boolean(dsh.bundle),
      clientPlatform: client.platform ?? null,
      clientInject: client.inject ?? null,
      peerDependencies: j.peerDependencies ?? null,
    })

    const [blob, fellBack, buckets, skipped] = collectFiles(full, j, options)
    if (fellBack) fallbackPkgs.push(j.name || full)
    const src = blob.map(([, t]) => t).join('\n')

    const byBucket = { 'host-entry': [], 'client-entry': [], 'client-extra': [], fallback: [] }
    for (const [rel, bucket] of buckets) byBucket[bucket].push(rel)
    for (const k of Object.keys(byBucket)) byBucket[k].sort()
    provenance.packages[j.name || full] = {
      declaredClientEntry: declaredClientEntry(j),
      fallback: fellBack,
      counts: Object.fromEntries(Object.entries(byBucket).map(([k, v]) => [k, v.length])),
      files: byBucket,
      // 跳过的文件必须记下来：否则以后没人说得清"到底排了什么"
      skippedClientExtra: skipped.sort(),
    }

    for (const arr of src.matchAll(/inject\s*:\s*\[([^\]]*)\]/g)) {
      for (const s of arr[1].matchAll(/["']([A-Za-z][\w.]*)["']/g)) services.add(s[1])
    }
    for (const m of src.matchAll(/ctx\.get\(\s*['"]([A-Za-z][\w.]*)['"]\s*\)/g)) services.add(m[1])

    // ctx.get('x') 赋给变量后调用的方法
    for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*ctx\.get\(\s*['"]([A-Za-z][\w.]*)['"]\s*\)/g)) {
      const [, variable, svc] = m
      services.add(svc)
      const re = new RegExp(escapeRe(variable) + String.raw`\.([A-Za-z_]\w*)\s*\(`, 'g')
      for (const c of src.matchAll(re)) addCall(svc, c[1])
    }

    // 记录每个服务名出现在哪些文件 —— 客户端服务在宿主探针里必然缺席，
    // 必须与宿主端服务分开判定，否则会报假阳性
    for (const s of services) {
      const re = new RegExp(String.raw`\b` + escapeRe(s) + String.raw`\b`)
      for (const [fname, text] of blob) if (re.test(text)) addSvcFile(s, fname)
    }

    // 直接 ctx.<svc>.<method>()
    for (const m of src.matchAll(/ctx\.([a-zA-Z]\w*)\.([A-Za-z_]\w*)\s*\(/g)) {
      services.add(m[1])
      addCall(m[1], m[2])
    }

    // svc.<method>() 直呼
    for (const svc of [...services]) {
      const re = new RegExp(String.raw`\b` + escapeRe(svc) + String.raw`\.([A-Za-z_]\w*)\s*\(`, 'g')
      for (const m of src.matchAll(re)) addCall(svc, m[1])
    }
  }

  const clientHints = {}
  for (const s of [...services].sort()) clientHints[s] = clientHint(s, svcFiles.get(s) || new Set())

  const callsOut = {}
  for (const k of [...calls.keys()].sort()) callsOut[k] = [...calls.get(k)].sort()

  return {
    report: {
      manifests,
      services: [...services].sort(),
      clientHints,
      calls: callsOut,
      fallbackPackages: fallbackPkgs,
    },
    provenance,
  }
}

/** 兼容入口：只拿 static.json 那份报告（与 python 版契约一致） */
export function extract(nm) {
  return extractWithProvenance(nm).report
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/* ── CLI：与 python 版一样写 static.json / services.json ─────────── */

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [nm, workdir] = process.argv.slice(2)
  if (!nm || !workdir) {
    console.error('用法: node lib/extract.mjs <node_modules 目录> <输出目录>')
    process.exit(2)
  }
  const { report, provenance } = extractWithProvenance(nm)
  fs.writeFileSync(join(workdir, 'static.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(join(workdir, 'services.json'), JSON.stringify({ services: report.services }, null, 2))
  // 来源分桶写到**单独文件**：static.json 的契约保持与 python 版逐字一致，
  // 对拍才有意义。分桶是给判定层用的附加信息，不是契约的一部分。
  fs.writeFileSync(join(workdir, 'provenance.json'), JSON.stringify(provenance, null, 2))
  for (const m of report.manifests) {
    console.log(`  插件: ${m.name}@${m.version}  bundle=${m.dshBundle}  client=${m.clientPlatform}`)
  }
  console.log(`  提取到 ${report.services.length} 个服务引用: ${report.services.join(', ') || '（未识别）'}`)
  const tot = Object.values(provenance.packages).reduce((a, p) => {
    for (const [k, v] of Object.entries(p.counts)) a[k] = (a[k] || 0) + v
    return a
  }, {})
  const nSkipped = Object.values(provenance.packages).reduce((a, p) => a + p.skippedClientExtra.length, 0)
  console.log(`  文件来源: ${Object.entries(tot).map(([k, v]) => `${k}=${v}`).join('  ')}  跳过(默认规则)=${nSkipped}`)
}
