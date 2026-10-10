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

function clientSeedsOf(full, j) {
  const seeds = []
  const exp = j.exports
  if (exp && typeof exp === 'object' && !Array.isArray(exp)) {
    const c = exp['./client']
    if (typeof c === 'string') seeds.push(c)
    else if (c && typeof c === 'object' && typeof c.default === 'string') seeds.push(c.default)
  }
  for (const rel of walkFiles(full)) {
    if (/\.(js|mjs|cjs|ts)$/.test(rel) && rel.toLowerCase().includes('client')) seeds.push(rel)
  }
  return seeds
}

/**
 * 返回 [需要扫描的文件 [[相对路径, 文本]], 是否退回整包扫描]。
 *
 * 只扫「实际挂载的入口 + 其本地依赖图」，外加客户端入口（dsh.client 单独挂载，
 * 不经过宿主入口图）。无法解析入口时才退回整包扫描，并把退回状态如实上报。
 */
function collectFiles(full, j) {
  const graph = localGraph(full, mountedEntries(full, j))
  const fallback = graph.size === 0
  const files = []
  const rels = new Set()

  const add = (rel) => {
    rel = normpath(rel)
    if (rels.has(rel)) return
    const txt = readText(join(full, rel))
    if (txt === null) return
    files.push([rel, txt])
    rels.add(rel)
  }

  if (fallback) {
    for (const rel of walkFiles(full)) {
      if (/\.(js|mjs|cjs|ts)$/.test(rel)) add(rel)
    }
  } else {
    for (const rel of [...graph].sort()) add(rel)
    const seeds = clientSeedsOf(full, j).map((s) => lstripChars(s, './')).filter(Boolean)
    for (const rel of [...localGraph(full, seeds)].sort()) add(rel)
  }
  return [files, fallback]
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

export function extract(nm) {
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

    const [blob, fellBack] = collectFiles(full, j)
    if (fellBack) fallbackPkgs.push(j.name || full)
    const src = blob.map(([, t]) => t).join('\n')

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
    manifests,
    services: [...services].sort(),
    clientHints,
    calls: callsOut,
    fallbackPackages: fallbackPkgs,
  }
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
  const report = extract(nm)
  fs.writeFileSync(join(workdir, 'static.json'), JSON.stringify(report, null, 2))
  fs.writeFileSync(join(workdir, 'services.json'), JSON.stringify({ services: report.services }, null, 2))
  for (const m of report.manifests) {
    console.log(`  插件: ${m.name}@${m.version}  bundle=${m.dshBundle}  client=${m.clientPlatform}`)
  }
  console.log(`  提取到 ${report.services.length} 个服务引用: ${report.services.join(', ') || '（未识别）'}`)
}
