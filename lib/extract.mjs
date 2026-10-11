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
      if (e.isDirectory()) { stack.push(rel); continue }
      if (e.isFile()) { out.push(rel); continue }
      // ⚠️ readdirSync 的 Dirent 对符号链接**两个判题都是 false**（探针实测：
      // isFile=false / isDirectory=false / isSymbolicLink=true）。而 pnpm 的价值
      // 恰恰在于把包目录做成符号链接。只认 isFile/isDirectory 会让「连到别处的包」
      // 与「包内指向别处的文件」整片消失 —— 而且是**静默**消失。
      // 用 statSync（跟随链接）补一次判定；断链就跳过，不抛。
      if (e.isSymbolicLink()) {
        try {
          const st = fs.statSync(join(root, rel))
          if (st.isDirectory()) stack.push(rel)
          else if (st.isFile()) out.push(rel)
        } catch { /* 断链：跳过，不抛 */ }
      }
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
 * 客户端半边**能不能真的端出来** —— 这是 H1'（客户端对账）在**宿主侧**能落地的那一半。
 *
 * ## 为什么这个检查值得单独做
 *
 * 实测过一次分界（见 Plan.md §6「宿主只警告，客户端才致命」）：
 * 客户端条目加载失败时，**整个界面会被一张错误屏替代**（`#root` 从 35397 字符剩 450）。
 * 也就是说：插件声明了 `dsh.client` 却拿不出 `exports["./client"]`，
 * 后果**不是某个功能消失，而是用户什么都用不了**。
 *
 * ## 它**不是**完整的 H1'
 *
 * H1' 的原定义是「**计划加载**的 `__DSH_BOOT__.entries` vs **实际到货**」。
 * 下面这个检查回答的是**前半个问题的静态版本**：
 * "声明了客户端半边，但那半边真的存在、真的能被解析到吗？"
 *
 * - ✅ 它能抓到：声明了却缺文件、`exports["./client"]` 写错、文件被 `.npmignore` 之类排掉
 * - ❌ 它**抓不到**：文件在、但浏览器里 import 失败（语法错、依赖缺失、运行时报错）
 *
 * 后者只有浏览器能回答（`window.__DSH_BOOT__.entries` 是浏览器全局）。
 * **不要把这条检查说成"客户端对账已完成"** —— 它是必要条件，不是充分条件。
 */
function clientHalfDeliverable(pkgDir, j) {
  const client = (j.dsh && j.dsh.client) || null;
  if (!client) return { declared: false, ok: null, why: null };
  const platform = client.platform ?? null;
  if (platform !== 'web') {
    // 解析器会跳过非 web 的 platform —— 那不是缺陷，是它不被加载
    return { declared: true, platform, ok: null, why: `platform=${platform}（只加载 web）` };
  }
  const declaredPath = declaredClientEntry(j);
  if (declaredPath === null) {
    return {
      declared: true, platform, ok: false, declaredEntry: null,
      why: '声明了 dsh.client（platform=web）却没有 exports["./client"] —— 客户端半边无处可取',
    };
  }
  try {
    const abs = path.join(pkgDir, declaredPath);
    if (fs.existsSync(abs)) return { declared: true, platform, ok: true, declaredEntry: declaredPath, why: null };
    return {
      declared: true, platform, ok: false, declaredEntry: declaredPath,
      why: `exports["./client"] 指向 ${declaredPath}，而那个文件不存在`,
    };
  } catch (error) {
    return { declared: true, platform, ok: null, declaredEntry: declaredPath, why: `检查失败: ${error.message}` };
  }
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
  // 退回整包扫描的条件：**入口图是空的**（连入口都解析不出来）。
  //
  // ⚠️ 这里曾经被误改成「patch 文件读不到挂载点也退回整包」，那是个错误的修法：
  // 实测 desktop profile 上 18/21 个插件的 patch 都写成 `- insert: [- id: ...]`
  // 而不含 `- name:`，于是**全 profile 都退回整包扫描**，host-entry 从 118 掉到 10、
  // fallback 涨到 1359 个文件。那不是修 bug，那是把污染面放大一个数量级。
  // 真正的原因是另一处的假阴性（`const inject = [...]` 不被识别），已在该处修掉。
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
    // 必须排序。walkFiles 是栈式遍历，顺序取决于 readdir 的返回顺序 ——
    // 探针实测：把 readdirSync 反转后，fallback 包的 perPlugin[*].callSites
    // **顺序会变**（结论相同但字节不同）。快照测试最不能容忍的就是这个。
    for (const rel of walkFiles(full).sort()) {
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

/* ── 逐文件扫描 + 行号 + 逐插件归属 ────────────────────────────── */

function lineStarts(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1)
  return starts
}

/** 由字符下标反查 1-based 行号（二分） */
function lineOf(starts, idx) {
  if (!Number.isFinite(idx)) return null
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= idx) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

/**
 * 局部绑定：把源码里的**变量名**映射到它承载的服务名。
 *
 * ## 为什么需要它（这一节的每一句都有实测依据）
 *
 * 「服务被取出来赋给变量、再用变量调用方法」是这个生态里最常见的写法，而原实现
 * 只用一条正则去抓它，同时踩了三个坑。三个坑都在 `dsh-better-sidebar` 上实测到：
 *
 * 1. **正则太紧**：原式是 `ctx\.get\(`，而真实代码写的是 `ctx.get ("x")` 或
 *    （压缩后）`typeof ctx.get === "function" ? ctx.get("x") : void 0`。
 *    一条都匹配不到 → 该服务的绑定变量成了「无法解释的变量」，
 *    而下面那条「裸名直呼」规则又会用它去匹配一切，凭空造出方法。
 *
 * 2. **只认一层**：真实代码会转手：
 *    `const store = ctx.get("betterLocale")` → `const store2 = store`。
 *    原实现只认第一跳，于是 `store2.foo()` 找不到归属，`store.foo()` 却因为
 *    「变量名恰好是 store」而被记到**另一个**服务头上。
 *
 * 3. **作用域注入的参数名**：`ctx.inject(["jobs"], (jobs) => { jobs.list() })` ——
 *    这里 `jobs` 是**参数**，不是 `ctx.get` 的产物，原实现完全看不见。
 *
 * 关键洞察：**方法调用的匹配式里必须用 `\b`。** 否则源码里的
 * `subagents.listDescendants(` 会因为子串 `agents.` 被别名 `agents` 命中
 * （实测 dsh-better-sidebar 里正好 2 处）。
 */

/** ① `const v = ctx.get ("x")` —— `ctx` 与 `get` 之间允许空白；`get` 允许带第二参数 */
const BIND_CTX_GET = /(?:const|let|var)\s+(\w+)\s*=\s*([^;=]{0,40}?)ctx\s*\.\s*get\s*\(\s*['"]([A-Za-z][\w.]*)['"]\s*(,\s*(?:false|0))?\s*\)/g

/** 同上，但专门找**带第二参数**的软取：`ctx.get("x", false)`（false = 缺失不报错） */
const CTX_GET_ANY = /ctx\s*\.\s*get\s*\(\s*['"]([A-Za-z][\w.]*)['"]\s*(?:,\s*(false|0|true|1))?\s*\)/g

/** ② 解构：`const { register, bind } = ctx.get("locale")`；成员是服务名的**同名**方法 */
const BIND_DESTRUCT_GET = /(?:const|let|var)\s*\{([^{}]*)\}\s*=\s*[^;=]{0,40}?ctx\s*\.\s*get\s*\(\s*['"]([A-Za-z][\w.]*)['"]/g

/** ③ 转手：`const store2 = store` / `const store2 = other.store` / `store2 = store` */
const BIND_ALIAS = /(?:const|let|var\s+)?(\w+)\s*=\s*(?:[\w$]+\.)?(\w+)\s*(?=[;,)\n}])/g

/** ⑥ `const svc = ctx.pet` 这类成员取用（成员名本身就是服务名） */
const BIND_CTX_MEMBER = /(?:const|let|var)\s+(\w+)\s*=\s*ctx\s*\.\s*([a-zA-Z]\w*)\b(?!\s*\()/g

/**
 * 别名/裸名规则**只对它成立**的名字集合。
 *
 * 这是本轮修掉的核心缺陷（数据：desktop profile 上 163/942 个调用点无法在源码行上验证）。
 * 原因不是「归属算错了」，而是**匹配本身没有边界**：
 * 一个名字只要在某个文件的字符串里出现过（文档、包名、配置键），
 * 它就会去匹配该文件里**任何** `名字.方法()` —— 于是 `store`、`scale`、`index`、`root`
 * 这些压缩代码里的局部变量全被卷进来，凭空造出几千个调用点。
 *
 * 边界怎么定：一个服务名值得用「裸名/别名」去匹配，**必须有一个可信声明**：
 *   - 出现在 `inject: [...]` / `ctx.inject([...])` / `ctx.get("x")` 里（插件自己说的），或
 *   - 出现在官方双端 API 目录里（DSH 自己说的）。
 * 两个都没有的名字，只有「字符串里出现过」这一条证据 —— 那不够。
 */
function makeKnownService(catalogNames) {
  return (name) => catalogNames.has(name)
}

/** 该变量名是否像压缩产物的临时名（单/双字母、`$x`、`_$x`） */
function looksTemporary(name) {
  return /^[A-Za-z$_][A-Za-z$_0-9]?$/.test(name)
}

/**
 * 这个标识符在某段源码里是否**被当成局部变量用过**（即被遮蔽）。
 *
 * 为什么这是必需的：`slots` / `tools` / `sessions` 这些词在压缩后的前端代码里
 * 大量作为局部变量出现（`const slots = []`、`function f(slots, i)`）。
 * 一旦一个服务名被遮蔽，同一个文件里所有 `slots.xxx()` 都成了**别的对象**的方法 ——
 * 实测 `dsh-mnemon` 的 `lib/client.js` 因此把
 * `addEventListener` / `querySelector` / `getBoundingClientRect` / `animate` / `focus`
 * 这一整套 **DOM 元素方法**记到了 `slots` 服务头上（DOM 元素变量恰好也叫 slots）。
 *
 * 这是**保守**检查，只覆盖显式声明的绑定形态。漏掉一条影子绑定只会多几个假阳性，
 * 不会少报真实调用 —— 方向是安全的。
 */
function isShadowedIdent(text, name) {
  const n = escapeRe(name)
  return new RegExp(
    `\\b(?:const|let|var)\\s+${n}\\b`            // const slots = ...
    + `|\\bfunction\\s+${n}\\s*\\(`               // function slots(...)
    + `|\\bclass\\s+${n}\\b`                      // class slots ...
    + `|\\(\\s*[^()]{0,120}?\\b${n}\\b[^()]{0,120}?\\)\\s*=>`, // (slots, i) => 
  ).test(text)
}

/**
 * 把**注释**与**字符串字面量的内容**抹成空格，逐字节等长，换行一个不动。
 *
 * ## 为什么需要它（一次真实缺陷）
 *
 * 这个提取器的所有规则都是**基于文本**的正则，而正则看不见注释 —— 于是
 * **写在注释里的示例代码会被当成真的调用**。
 *
 * 实测怎么发现的：我给夹具写负向对照时，注释里为了说明"我故意**不**调用
 * `ctx.provide('internalOnlyService', ...)`"，把那个调用原样写了出来。
 * 结果提取器把那个服务当真了 —— **负向对照当场失效**（它本该是 broken，
 * 却因为"有人提供"变成了 ok）。也就是说：我用来挡假阴性的钉子，
 * 是被我自己的一行注释拔掉的。
 *
 * 真实插件里这个形态是存在的（`dsh-better-sidebar` 有两个文件在注释里写了
 * `ctx.provide(...)`）。后果分两个方向：
 *   - 假阴性：注释里的 `ctx.get("x")` 会让一个**并不存在的依赖**被当成声明过；
 *   - 假阳性：注释里的 `ctx.provide("x")` 会让一个**没人提供的服务**看起来有人提供。
 *
 * ## 为什么要等长、不删行
 *
 * 调用点要报 `file:line`，而 line 是靠**字符偏移**换算出来的（`lineStarts`）。
 * 删掉注释会让后面所有行号整体前移 —— 那就是拿"注释里写不写示例"去改变
 * 真实调用的行号。抹成空格、保留换行，偏移与行号就都原样不动。
 *
 * ## 为什么保留引号本身
 *
 * 规则要匹配 `ctx.get('svc')` 这种**带引号**的形状。抹掉引号会让所有
 * 字符串参数规则一起失效；只抹内容、留引号，形状就还在，而内容不再能被
 * 当成"标识符"误读。
 */
function maskCommentsAndStrings(text, { maskStrings = true } = {}) {
  const out = []
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text[i]
    const d = text[i + 1]
    // 行注释
    if (c === '/' && d === '/') {
      while (i < n && text[i] !== '\n') { out.push(' '); i++ }
      continue
    }
    // 块注释
    if (c === '/' && d === '*') {
      out.push(' ', ' ')
      i += 2
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        out.push(text[i] === '\n' ? '\n' : ' ')
        i++
      }
      if (i < n) { out.push(' ', ' '); i += 2 }
      continue
    }
    // 字符串 / 模板串
    //
    // `maskStrings` 的分工很重要，写错就会一边修一边坏：
    //   - **要抹**（调用点扫描）：注释里的 `ctx.get("x")` 会让不存在的依赖被当成
    //     声明过（假阴性）；注释里的 `ctx.provide("x")` 会让没人提供的服务看起来
    //     有人提供（假阳性）。
    //   - **不要抹**（声明解析）：`inject = ["vaultService"]` 这类规则**必须**读到
    //     字符串内容 —— 抹掉就等于把这些声明全删了。实测：抹掉之后两个服务都被报成
    //     `host-service-missing`，一次修出两个新 bug。
    if (c === '"' || c === "'" || c === '`') {
      if (!maskStrings) { out.push(c); i++; continue }   // 只抹注释，字符串原样留
      out.push(c)
      i++
      while (i < n) {
        const ch = text[i]
        if (ch === '\\') {           // 转义：连同下一个字符一起抹
          const nx = text[i + 1]
          out.push(' ', nx === '\n' ? '\n' : ' ')
          i += 2
          continue
        }
        if (ch === c) { out.push(ch); i++; break }
        out.push(ch === '\n' ? '\n' : ' ')
        i++
      }
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

/**
 * 解析出 `localBindings[variable] = {service, form, from?}`。
 *
 * `form` 是**可审计的证据形态**，它直接决定调用点的可信度：
 *   - `ctx-get`       ：`ctx.get("svc")`，软取，缺失可降级
 *   - `ctx-get-soft`  ：`ctx.get("svc", false)`，显式声明「缺失也不报错」
 *   - `ctx-get-destructure`：解构出来的是服务的同名方法
 *   - `inject-param`  ：作用域注入的参数，硬依赖
 *   - `inject-destructure`：注入参数解构出来的同名方法
 *   - `ctx-member`    ：`ctx.svc` 成员取用
 *   - `alias`        ：转手绑定，`from` 是上一跳的变量名
 *
 * ⚠️ **只接受「服务名在可信来源里成立」的绑定**。原实现只认 `ctx.get` 的**直接**
 * 产物，导致 `const store = ctx.get("betterLocale")` 之后 `const store2 = store`
 * 就断了链，而压缩产物里这种转手极多 —— 断链后 `store2.foo()` 找不到归属。
 * 但反过来，如果**任何** `x = y` 都允许作为转手，压缩代码会把几千个临时变量
 * 串成链（实测调用点从 942 暴涨到 7477）。所以两个闸门：目标变量名必须不像
 * 临时名，且源变量的服务名必须有可信来源。
 */
function resolveLocalBindings(text) {
  const byVar = new Map() // var -> {service, form, from?}
  const put = (v, rec) => {
    if (!v || byVar.has(v)) return
    byVar.set(v, rec)
  }

  for (const m of text.matchAll(BIND_CTX_GET)) {
    put(m[1], { service: m[3], form: m[4] ? 'ctx-get-soft' : 'ctx-get' })
  }
  for (const m of text.matchAll(BIND_CTX_MEMBER)) put(m[1], { service: m[2], form: 'ctx-member' })
  for (const m of text.matchAll(BIND_DESTRUCT_GET)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':').pop().trim().split(/\s|=/)[0].trim()
      if (/^\w+$/.test(name)) put(name, { service: m[2], form: 'ctx-get-destructure' })
    }
  }

  // 转手链收敛：`a = ctx.get("x")` → `b = a` → `c = b`。
  // 上限 4 跳：真实代码里超过 4 跳的转手几乎没有，而放开上限的代价是指数级的匹配量。
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (const m of text.matchAll(BIND_ALIAS)) {
      const [, target, source] = m
      if (target === source || byVar.has(target) || looksTemporary(target)) continue
      const src = byVar.get(source)
      if (!src) continue
      byVar.set(target, { service: src.service, form: 'alias', from: source })
      changed = true
    }
    if (!changed) break
  }
  return byVar
}

/**
 * 作用域注入：`ctx.inject(["a","b"], cb)` 里，回调的形参**就是**被注入的服务。
 *
 * `ctx.inject(["jobs"], (jobs) => jobs.list())` 的 `jobs` 既没有 `ctx.get`，
 * 也没有 `inject:` 字段 —— 原实现完全看不见它，于是这类真实调用点会整体消失。
 *
 * ⚠️ **形参是按位置绑定的，不是按名字。** 实测 `@linxin666/dsh-client-ui-graph`
 * 写的是 `inject(["subprocess", "jobs"], (subprocess, jobs) => ...)` —— 名字恰好
 * 相等，所以「按名字匹配」也能中。但那只在作者愿意同名时成立；一旦写成
 * `(sp, j) => sp.spawn(...)`，按名字匹配就全丢。所以这里按**位置**绑定。
 *
 * 解构形态 `({ list }) => ...` 只在注入列表有**恰好一个**服务时才敢断言它属于谁：
 * 多个服务时谁的方法叫什么名字无从判断，猜就是在造假结论。
 */
function injectParamBindings(text) {
  const out = []
  const re = /ctx\s*\.\s*inject\s*\(\s*\[([^\]]*)\]([\s\S]{0,200})/g
  for (const m of text.matchAll(re)) {
    const names = [...m[1].matchAll(/['"]([A-Za-z][\w.]*)['"]/g)].map((x) => x[1])
    if (!names.length) continue
    const rest = m[2]

    const record = (params) => {
      params.forEach((part, i) => {
        const raw = part.trim()
        if (!raw) return
        if (/^\{[\s\S]*\}$/.test(raw)) {
          if (names.length !== 1) return // 归不到具体服务就不猜
          for (const p of raw.slice(1, -1).split(',')) {
            const n = p.split(':')[0].trim().split(/\s|=/)[0].trim()
            if (/^\w+$/.test(n)) out.push({ name: n, form: 'inject-destructure', svc: names[0], names })
          }
          return
        }
        const n = raw.split(':')[0].trim().split(/\s|=/)[0].trim()
        if (/^\w+$/.test(n) && names[i]) out.push({ name: n, form: 'inject-param', svc: names[i], names })
      })
    }

    const paren = rest.match(/^\s*\(\s*([^)]*)\)\s*=>/)
    if (paren) { record(splitTopLevel(paren[1])); continue }
    const single = rest.match(/^\s*(\w+)\s*=>/)
    if (single && names[0]) out.push({ name: single[1], form: 'inject-param', svc: names[0], names })
  }
  return out
}

/** 按顶层逗号切分参数表（`({ a, b }, c)` → `['({ a, b }', 'c']`） */
function splitTopLevel(s) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '{' || ch === '(' || ch === '[') depth++
    else if (ch === '}' || ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/**
 * 认出**上下文对象**的名字。
 *
 * 判据两条，都很窄：
 *   1. 字面量 `ctx`；
 *   2. `ctx.inject([...], cb)` 回调的形参。
 *
 * **不靠「参数名恰好是服务名」来认** —— 位置是契约，名字不是。
 * 实测 `@michengai/dsh-archive-manager` 压缩后回调参数叫 `N`，而它确实是子上下文。
 *
 * ## ⚠️ 单参数形态曾经完全认不出来（一次实测出来的假阴性）
 *
 * 早先这里要求 `parts.length >= 2`，把**第二个**形参当上下文 ——
 * 理由是"第一个是被注入的服务"。**这个前提在真实插件上几乎不成立**：
 *
 * | 回调形参个数 | 实测次数（desktop profile） |
 * |---|---|
 * | 0 个 | 1 |
 * | **1 个** | **27** |
 * | 2 个 | **0** |
 *
 * 也就是说**27 处全被漏掉**，而它们都是 `<head>.<svc>.<method>()` 这种最常见的写法。
 * 后果是**假阴性**（最贵的那类）：实测 desktop 上 38 处 `no-calls` 里有 **21 处**
 * 其实是真实存在的调用。例：
 *
 * ```js
 * ctx.inject(["tools"], (toolsCtx) => {
 *   toolsCtx.effect(function* () {
 *     yield toolsCtx.tools.register(createRenderUiTool());   // ← 原来是看不见的
 *   });
 * });
 * ```
 *
 * 修法：单参数时那个参数**就是**上下文对象；多参数时保留原来的"取第二个"约定。
 *
 * 为什么加这一条是**安全**的：它只让 `<head>.<svc>.<method>()`（**两个点**）变得可判，
 * 而两个点要求作者确实写了"上下文对象的成员再取服务再调方法"。
 * 若某插件把参数直接当服务用（`(tools) => tools.register(...)`，一个点），
 * 这个改动不会多认 —— 那条通路归 `injectParamBindings` 按位置管。
 */
function contextObjectNames(text) {
  // ⚠️ `this.ctx` 只在**文件里真的出现**时才加进名单。
  // 无条件加会让每一份 `subContexts` 都多出一条 `this.ctx` —— 而 `subContexts` 是
  // **审计记录**（"这个文件里认出了哪些上下文对象"），往里塞一个文件里根本没有的名字
  // 就等于让它撒谎。实测：无条件加会让两个快照的**每一个插件**都发生变化。
  const names = new Set(['ctx'])
  for (const head of EXTRA_CONTEXT_HEADS) {
    if (text.includes(head)) names.add(head)
  }
  const re = /ctx\s*\.\s*inject\s*\(\s*\[[^\]]*\]\s*,\s*\(\s*([^()]*)\)\s*=>/g
  for (const m of text.matchAll(re)) {
    const parts = splitTopLevel(m[1])
    // 单参数 → 它自己就是上下文；多参数 → 取第二个（第一个通常是被注入的服务或事件参数）
    const pick = parts.length === 1 ? parts[0] : (parts.length >= 2 ? parts[1] : null)
    if (pick === null) continue
    const n = pick.trim().split(':')[0].trim().split(/\s|=/)[0].trim()
    if (/^\w+$/.test(n)) names.add(n)
  }
  return names
}

/**
 * 类式插件的惯用上下文取值：`this.ctx.<svc>.<method>()`。
 *
 * ## 为什么单独列出来（实测，不是设想）
 *
 * 主规则 `ctx.<svc>.<method>()` 有一条 `(?<![\w$.])` 的 lookbehind ——
 * 挡住 `myctx.` 这类前缀是对的，但它**顺带也挡住了 `this.ctx.`**（`ctx` 前面是 `.`）。
 * 而 class 式插件（这个生态里很常见）到处写 `this.ctx.agents.get(...)`。
 *
 * 实测 desktop profile：`this.ctx.<svc>.<method>(` 出现 **32 次**，涉及
 * `agents` / `logger` / `sessionPersistence` / `storageDomain` 四个服务 ——
 * 全部不可见。其中 `dsh-mnemon` 的 `this.ctx.agents.get(...)` 甚至让它被判成
 * 「`agents` 没有任何调用点」，也就是把一个**真调用**报成了"没用到"。
 *
 * ## 为什么用「加一个名字」而不是「放宽 lookbehind」
 *
 * 放宽成 `(?<![\w$])` 会让 `foo.ctx.<svc>.<m>()` 也命中 —— 而那个 `ctx`
 * 可能是别人的上下文（React context、请求上下文……）。加名字是**精确**的：
 * 只认字面量 `this.ctx`，其余前缀一概不认。要支持别的写法时，
 * 同样按"先去真实插件里量出现次数"再来加。
 */
const EXTRA_CONTEXT_HEADS = ['this.ctx']

/**
 * 调用点附近是否有能力检测。只看匹配起点**往前 400 字符**：再远就说不清是不是在判
 * 这个方法本身，而把远处的检测算成这里的安全网会掩盖真实失效。
 */
function isGuardedNear(text, index, service, method) {
  const from = Math.max(0, index - 400)
  // ⚠️ `?.` 在方法名**之后**：`ctx.llm.listProviders?.()`
  //                                   ^^^^^ 兜底标记在匹配点右边
  // 只看前面的话这个标记永远在窗口外 —— 结果就是"收下了调用点却认不出兜底"，
  // 报出一条假阳性。所以窗口改成"前 400 / 后 80"。
  const to = Math.min(text.length, index + 80)
  return guardRegex(service, method).test(text.slice(from, to))
}

/**
 * 这个调用点是否**被作者自己做了能力检测**。
 *
 * 为什么必须认这件事：`dsh-pet` 写的是
 *     typeof llm?.listProviders === "function" ? llm.listProviders() : []
 * —— 它**明知**这个方法可能不在，并自己处理了。把它报成「功能失效」是**假阳性**：
 * 用户实际没有失去任何东西。而假阳性正是这个工具唯一卖点的反面。
 *
 * 认两种形态，都是「不会因为方法不存在而抛错」的写法：
 *   1. `x?.method(`      —— 可选链
 *   2. `typeof x.method === "function"` 附近的同类判定
 *
 * 判定范围刻意只看调用点**前面两行**：再远就说不清是不是在判这个方法。
 * 代价：守在很远处的检测认不出来（仍会报），这是**偏保守**的方向 ——
 * 宁可多报一条，也不要因为误认成「有防护」而漏掉真实的失效。
 */
function guardRegex(service, method) {
  const s = escapeRe(service)
  const m = escapeRe(method)
  // 形态清单**是从真实插件里 grep 出来的**，不是凭印象写的 —— 上一版就是凭印象，
  // 漏掉了最常见的 ②（`?.()`），于是 `dsh-better-sidebar` 的
  // `ctx.sessions.binding?.(newId)` 被判成"宿主方法缺失"，而作者明明写了兜底。
  return new RegExp(
    // ① 可选服务：`svc?.method`（前缀允许 `ctx.` / `this.ctx.` 这类链）
    `[\\w$]*\\b${s}\\s*\\?\\s*\\.\\s*${m}`
    // ② 可选方法：`svc.method?.(` —— 实测最常见，也最容易被漏
    + `|[\\w$]*\\b${s}\\s*\\.\\s*${m}\\s*\\?\\s*\\.\\s*\\(`
    // ③ 显式能力检测：`typeof svc.method === "function"`（`?.` 可有可无）
    + `|typeof\\s+(?:[\\w$]*\\s*\\.\\s*)*${s}\\s*\\.\\s*${m}\\s*(?:===|!==|==|!=)\\s*["\']function["\']`,
  )
}

/**
 * 码元序比较 —— **不要用 `localeCompare`**。
 *
 * `localeCompare` 的结果取决于 ICU 数据与进程语言环境（`LANG`），也就是说
 * 同一份输入在两台机器上可能排出不同顺序。对一个要拿输出算快照哈希的工具有两重危害：
 *   1. 快照会在换机器/换语言环境时无故变红；
 *   2. 更糟的是，它可能**掩盖**真实差异 —— 顺序变了但哈希恰好没变是运气，反之亦然。
 * 实测在当前名字集合上两种比较结果恰好一致，所以这是一个**潜伏**问题而不是现行故障；
 * 这类问题必须在它变成故障之前修掉。
 */
function cmp(a, b) {
  const x = String(a)
  const y = String(b)
  return x < y ? -1 : (x > y ? 1 : 0)
}

function sortCalls(calls) {
  const out = {}
  for (const k of [...calls.keys()].sort()) out[k] = [...calls.get(k)].sort()
  return out
}

/**
 * 扫描**一个插件**的全部已选文件，产出归属该插件的结果。
 *
 * 与原实现的关键区别：原实现把「服务集合」做成了跨插件累积的全局量，并用它去扫
 * 当前插件的源码。后果是别的插件发现的服务名，会被套到本插件的**同名局部变量**上。
 * 实测 desktop profile 的 280 个调用点里有 **51 个**是这种污染，例如
 * `dshmarket` 里的 `const commands = { probePnpm, provisionPnpm, ... }` 被当成
 * DSH 的 `commands` 服务。逐插件归属后是**严格子集**（只删不增），所以这是纯收益。
 */
/**
 * 模块是否把这个绑定**导出**了（含 `export { a, b }` 与 `export { x as y }` 两种形态）。
 *
 * 为什么需要它：`const provide = [...]` 只有**导出**时才是插件契约。
 * 包内 vendored 代码、内部辅助模块里也可能出现同名字面量，把那些也算进来
 * 会让"这个服务有人提供"变成假象 —— 那是**假阴性**方向，比假阳性更难发现。
 */
function exportsBinding(text, name) {
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/).map((x) => x.trim())
      // `as` 左边的才是模块内的绑定名
      if (bits[0] === name) return true
    }
  }
  return false
}

function scanPlugin(blob, catalogNames, pkgName) {
  const isKnownService = makeKnownService(catalogNames)
  const services = new Set()
  // 「可信声明」的服务名：出现在 inject: [...] / ctx.inject([...]) / ctx.get("x") 里。
  // 这是三档确定性判据的第一档来源（见 Plan.md §2.2）—— 有可信声明的算「确定」，
  // 只靠松散形式 ctx.<svc>.<method>() 命中的算「疑似」。
  const declared = new Set()
  // 其中「软取」的那部分：ctx.get("x") 在写法上允许缺失，与 inject 的硬依赖不同。
  // 判定引擎要分开对待（硬依赖缺失 = 条目停在 pending = 致命；软取缺失 = 降级）。
  const softDeclared = new Set()
  // 「可以被点号调用的服务名」。**比 `services` 窄**：`services` 还包含
  // 「只在某个文件的字符串里出现过」的名字（那可能是文档、是别的包名、是配置键），
  // 由这个名单去驱动匹配，会让那些名字开始匹配同文件里的**任何** `名字.方法()`。
  // 实测这是 163/942 个调用点无法在源码行上验证的原因（见 docs/extraction-findings.md）。
  const addressable = new Set()
  const calls = new Map()
  const sites = []
  const provided = new Set()
  const serviceFiles = new Map()
  // 变量名 → 它承载的服务。既用于归属，也用于**验证归属**（调用点的 via/matched 必须能被它解释）
  const localBindings = new Map()
  // `(变量名|文件) → 服务集合` —— 与上面那张表**并存的、文件维度的**视图。
  //
  // 为什么需要它：`localBindings` 只按变量名聚，于是**同名变量在不同文件里绑到不同服务**
  // 时只能整体记成「歧义」，并把 valid 的那条覆盖掉。实测后果：
  // `dsh-better-sidebar` 的 `session` 在 `lib/client-registry.js` 里同时承载
  // `remote` 与 `sessions`（歧义），在 `lib/index.js` 里却是干净的一个 ——
  // 合并之后 `localBindings` 只剩歧义那条，`lib/index.js` 的别名调用点就
  // "在绑定表里查不到自己"，不变式 ⑤ 因此报红。
  //
  // 消歧策略**不变**（仍然是"同名变量绑到多个服务就整体弃权"），
  // 这张表只是把**每个文件各自的绑定**如实留下来，供对账与排查用。
  const bindingsByFile = new Map()

  const addCall = (svc, method, rel, line, via, matched, guarded = false) => {
    if (!calls.has(svc)) calls.set(svc, new Set())
    calls.get(svc).add(method)
    sites.push({ service: svc, method, plugin: pkgName, file: rel, line, via, matched, guarded })
    // ⚠️ 这里**不要**直接累积 `unguardedPairs`（下面按去重后的站点统一算）。
    // 踩过的坑：同一个 `svc.method` 常常被**多条规则**在同一行各收一次
    // （`ctx.settings.register('x')` 会同时被 ctx-member 档和裸名档收下），
    // 而两档的 `guarded` 判定不一定一致。在 `addCall` 里累积 = **没去重就下结论**，
    // 于是"输掉去重的那一条"会把结果污染：明明每个站点都有兜底，`unguardedPairs`
    // 里却多出一条，判定层照报 —— **兜底永远不生效**。
  }

  const ambiguousAliases = []
  // 因「服务名被同名局部变量遮蔽」而放弃的裸名匹配（可审计，不是静默丢）
  const shadowedBare = []
  // 因「绑定来源不可信」而放弃的别名归属（同上，弃权也要有据可查）
  const unresolvedBindings = []
  // 每个文件里被认出来的子上下文变量名（可审计：它决定了哪些 `<x>.<svc>.<m>()` 被收下）
  const subContexts = []
  // 注：`guardedPairs` / `unguardedPairs` 都在**去重之后**统一派生（见文件末尾），
  // 不在这里提前声明 —— 提前声明会让 `addCall` 顺手往里塞，而那正是上面那个 bug。
  const perFile = []
  for (const [rel, text] of blob) {
    const starts = lineStarts(text)
    // ⚠️ 所有**声明/调用**规则都跑在这个 `code` 上，而不是 `text` 上。
    // 它是 `text` 把注释与字符串内容抹成空格后的版本（等长、行号不动）。
    // 理由见 `maskCommentsAndStrings` 的注释：注释里的示例代码会被正则当真，
    // 实测已经发生过一次（我的夹具负向对照被自己的一行注释拔掉）。
    //
    // 注意：`text` 仍然用于「导入/文件类型」这类与注释无关的判断，
    // 以及所有需要**真实字符**的场景（例如报 `file:line` 时的行内容）。
    // 声明解析：**只抹注释、保留字符串** —— `inject = ["svc"]` 这类规则要靠字符串内容
    const decl = maskCommentsAndStrings(text, { maskStrings: false })
    // 调用点扫描：注释和字符串都抹 —— 这里的误读会直接造出假阳性/假阴性
    const code = maskCommentsAndStrings(text)
    for (const m of decl.matchAll(/inject\s*:\s*\[([^\]]*)\]/g)) {
      for (const s of m[1].matchAll(/["']([A-Za-z][\w.]*)["']/g)) {
        services.add(s[1]); declared.add(s[1])
      }
    }
    // ⚠️ `inject` 也可能是**先声明后引用**，而不是字面量字段：
    //     const inject = ["mnemonMemory"]
    //     return { name, inject, ... }
    // 实测 `dsh-mnemon-strategy-*` 一族就是这个写法，而且那个服务
    // （mnemonMemory）**当前 profile 里无人提供**。只认 `inject:` 字面量会让这整类
    // 依赖不可见 —— 插件被判成「0 个服务」进而得到「可用」，那是**假阴性**：
    // 工具对真实缺口只字不提，而用户以为自己拿到了结论。
    // 这里顺带覆盖 `injectDeps` / `scopeInject` 这类同类命名。
    for (const m of decl.matchAll(/\binject(?:Deps|Scope|s)?\s*[:=]\s*\[([^\]]*)\]/g)) {
      for (const s of m[1].matchAll(/["']([A-Za-z][\w.]*)["']/g)) {
        services.add(s[1]); declared.add(s[1])
      }
    }
    // `ctx.get("x")` 与 `ctx.get("x", false)` 都算可信声明。第二参数为假值表示
    // 「缺失也不抛」的显式软取 —— 它改变的是**严重度**（降级 vs 致命），不改变
    // 「作者声明了这个依赖」这个事实。早先只认单参数形态，于是 dsh-pet 的
    // deepseekAccount 整条依赖被判成不可信，反而丢掉了真实结论。
    for (const m of decl.matchAll(/ctx\.get\(\s*['"]([A-Za-z][\w.]*)['"]\s*(?:,\s*(?:false|0))?\s*\)/g)) {
      services.add(m[1]); declared.add(m[1]); softDeclared.add(m[1])
    }
    // 作用域注入：`ctx.inject(["a","b"], cb)` —— 同样是可信声明。
    // ⚠️ 注意 `ctx.inject` 这个写法本身就意味着 `ctx` 是**服务容器**，
    // 所以下面还要把函数形参上的 `ctx` 绑定补上（`(ctx) => ctx.jobs.list()`）。
    for (const m of decl.matchAll(/ctx\.inject\(\s*\[([^\]]*)\]/g)) {
      for (const s of m[1].matchAll(/["']([A-Za-z][\w.]*)["']/g)) {
        services.add(s[1]); declared.add(s[1])
      }
    }
    // 插件自己提供的服务 —— 它们**不是**宿主服务，不该被判成"无人提供"。
    //
    // ⚠️ `provide` 也有**数组声明再导出**的写法，而且它与 `inject` 是**对偶**的：
    //     const provide = ["mnemonMemory"]
    //     export { apply, inject, name, provide }
    // 实测 `dsh-mnemon` 正是这个形态（`lib/core.js` / `lib/index.js` / `lib/starter.js`），
    // 而它提供的 `mnemonMemory` 被**一整个插件族**声明依赖。只认 `ctx.provide(...)`
    // 的后果不是漏一条，而是**反过来**：7 个 `dsh-mnemon-*` 被判成「部分可用 ——
    // 依赖的服务由其它插件提供，当前 profile 里没有提供方」，而提供方**就在同一目录里**。
    // 也就是说：工具把"装好了"报成了"缺依赖"。这是假阳性里最刺眼的一种。
    //
    // 只认 `ctx.provide("x")` 是不够的，还要认**导出的**数组声明。为什么必须要求
    // "导出"：包内 vendored 代码里也可能出现同名字面量，而只有导出的才是插件契约
    // （与 `export { inject }` 对称）。这一条把 `dsh-mnemon` 收进来、把噪音挡在外面。
    for (const m of decl.matchAll(/ctx\.provide\(\s*['"]([A-Za-z][\w.]*)['"]/g)) provided.add(m[1])
    // ⚠️ 这条用 `decl`（保留字符串）——数组里装的就是**服务名字符串**，
    // 用 `code` 会把它们抹成空格，于是 `provide` 一个都认不出来。
    // 实测踩过：改成 `code` 之后 `dsh-mnemon` 提供的 `mnemonMemory` 消失，
    // 7 个消费者的假阳性**全部复活**。变量的**名字**在两者里都还在，
    // 所以只抹字符串这条规则会"看起来匹配到了"（varName=provide），却一个服务都收不到。
    for (const m of decl.matchAll(/(?:^|\n)\s*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]*)\]/g)) {
      const [, inlineExport, varName, body] = m
      if (!/^provide/.test(varName)) continue
      const exported = Boolean(inlineExport) || exportsBinding(decl, varName)
      if (!exported) continue
      for (const q of body.matchAll(/["']([A-Za-z][\w.]*)["']/g)) provided.add(q[1])
    }

    // ── 局部绑定：把变量名映射到服务名 ──
    const byVar = resolveLocalBindings(text)
    for (const params of injectParamBindings(text)) {
      services.add(params.svc); declared.add(params.svc)
      if (!byVar.has(params.name)) byVar.set(params.name, { service: params.svc, form: params.form })
    }
    for (const [v, rec] of byVar) {
      services.add(rec.service)
      // 文件维度的视图：**每次出现都记**，不覆盖。
      const fk = `${v}|${rel}`
      if (!bindingsByFile.has(fk)) bindingsByFile.set(fk, new Set())
      if (rec.service) bindingsByFile.get(fk).add(rec.service)
      const prev = localBindings.get(v)
      if (!prev) localBindings.set(v, { ...rec, file: rel })
      else if (prev.service !== rec.service) {
        // 同名变量在不同文件/位置绑到了不同服务 —— 是歧义，不能猜。
        // 用一个哨兵表示，下面的别名规则遇到它就弃权并记账。
        localBindings.set(v, {
          service: null, form: 'ambiguous',
          targets: [...new Set([...(prev.targets || [prev.service]), rec.service])].filter(Boolean).sort(),
          file: rel,
        })
      }
    }

    // 用绑定变量调用方法：`store.getPrefs()` 归给 `store` 所承载的服务
    const aliasTargets = new Map()
    for (const [v, rec] of byVar) {
      if (!aliasTargets.has(v)) aliasTargets.set(v, new Set())
      aliasTargets.get(v).add(rec.service)
    }
    for (const [variable, targets] of aliasTargets) {
      if (targets.size > 1) {
        ambiguousAliases.push({ file: rel, variable, services: [...targets].sort() })
        continue
      }
      const svc = [...targets][0]
      // 转手链的源头如果是「未知服务」，说明它一路来自某个 `ctx.get` 但名字
      // 不在任何可信来源里 —— 这种归属不够格，弃权并记账。
      if (!declared.has(svc) && !isKnownService(svc)) {
        unresolvedBindings.push({ file: rel, variable, service: svc, reason: '绑定来源的服务名既不在插件声明里，也不在官方目录里' })
        continue
      }
      // `(?:\?\.)?`：**可选调用也要收**。`x.method?.(...)` 是"没有就跳过"的标准写法，
      // 不认它这条调用点就**整条不可见**（假阴性），而不是"保守"。
      const re = new RegExp(String.raw`\b` + escapeRe(variable) + String.raw`\.([A-Za-z_]\w*)(?:\?\.)?\s*\(`, 'g')
      // ⚠️ 扫 `code`（抹过注释与字符串）而不是 `text` —— 注释里写的示例代码
      // 会被正则当成真调用（缺陷 19）。掩码等长，所以 `c.index` 换算行号仍然正确。
      for (const c of code.matchAll(re)) {
        addCall(svc, c[1], rel, lineOf(starts, c.index), 'alias', variable,
          isGuardedNear(text, c.index, svc, c[1]))
      }
    }

    // `<ctx对象>.<svc>.<method>()` —— **最强证据**（服务名与调用点同处一个表达式）。
    // 上下文对象有多个：字面量 `ctx`，以及注入回调的第二个形参（子上下文）。
    // 从「第二个形参」这个位置认上下文对象，而不是从名字猜 —— 见 contextObjectNames。
    const ctxObjs = contextObjectNames(text)
    subContexts.push({ file: rel, names: [...ctxObjs].sort() })
    for (const head of ctxObjs) {
      const re = new RegExp(
        String.raw`(?<![\w$.])` + escapeRe(head) + String.raw`\.([A-Za-z_]\w*)\.([A-Za-z_]\w*)(?:\?\.)?\s*\(`, 'g')
      for (const m of code.matchAll(re)) {
        services.add(m[1])
        addressable.add(m[1])
        // `ctx.<svc>.<method>()` 里服务名与调用点**同处一个表达式** —— 这本身就是
        // 插件对「我依赖这个服务」的声明，强度不低于 `ctx.get("svc")`。
        // 不认它会出事：官方目录不是运行时面（实测它不收录 `logger`），
        // 于是 `ctx.logger.info()` 会被判成「无可信声明」而**静默丢掉** ——
        // 那不是保守，那是漏报。探针 fixture `@fixture/clean` 就是这个形状。
        declared.add(m[1])
        addCall(m[1], m[2], rel, lineOf(starts, m.index), 'ctx-member', `${head}.${m[1]}`,
          isGuardedNear(text, m.index, m[1], m[2]))
      }
    }
    // `perFile` 里要**同时**留两份文本，用途不同（混用会出错，见下）：
    //   - `text: code`  —— 抹掉注释**与字符串**。给"裸名调用扫描"用：
    //     这里匹配的是 `svc.method(` 这种**代码**形状，字符串里的同名文字不算调用。
    //   - `mention: decl` —— 只抹注释、**保留字符串**。给"服务名出现在哪些文件"用：
    //     `ctx.get("remote.commands")` 里的名字就在**字符串**里，
    //     抹掉它会让这个服务"哪儿都没出现过"，于是从「客户端半边」掉进「宿主服务缺失」——
    //     实测就是这么把 `dsh-pet` 从「可用」打成「不兼容」的。
    // 两份都是等长的，行号与索引不受影响。
    perFile.push({ rel, text: code, mention: decl, starts })
  }

  // 服务名出现在哪些文件 —— 客户端服务在宿主探针里必然缺席，必须分开判定
  for (const s of services) {
    const re = new RegExp(String.raw`\b` + escapeRe(s) + String.raw`\b`)
    // ⚠️ 用 `mention`（保留字符串）—— 判据是"这个服务名在这个文件里**被提到过**"，
    // 而 `ctx.get("svc")` 这种提到方式恰恰在字符串里。用抹掉字符串的 `code` 会让
    // 一批服务"神秘消失"，进而被判成"宿主服务缺失"（实测把 dsh-pet 打成不兼容）。
    for (const { rel, mention: text } of perFile) {
      if (re.test(text)) {
        if (!serviceFiles.has(s)) serviceFiles.set(s, new Set())
        serviceFiles.get(s).add(rel)
      }
    }
  }

  // 裸名直呼：`svc.<method>()`。
  //
  // **这不再是主要证据来源**，而是 ②③④⑤ 都覆盖不到的兜底。顺序很重要：
  // 它跑在绑定规则之后，因为绑定规则知道「这个变量到底是什么」，
  // 而这里只能靠「名字恰好等于服务名」—— 这是**最弱的一档证据**，
  // 所以它的调用点标记为 via='bare'（判定层据此可以降级标注）。
  //
  // 只对 `addressable` 匹配，不对 `services` 匹配 —— 这是本轮修掉的关键缺陷：
  // `services` 里有「只在字符串/注释里出现过的名字」，用它们匹配会命中
  // 同文件里毫不相干的局部变量（实测 163/942 个调用点在源码行上验证不出来）。
  for (const { rel, text, starts } of perFile) {
    for (const svc of addressable) {
      if (localBindings.has(svc)) continue // 该名字被本地绑定占了，裸名含义不明
      // 可信来源有两个：插件自己声明过（inject / ctx.inject / ctx.get），或官方目录里有。
      // 两个都没有的名字只有「字符串里出现过」这一条证据 —— 不够。
      if (!declared.has(svc) && !isKnownService(svc)) continue
      // 该标识符在这个文件里被当作局部变量用过 → 裸名含义不明，弃权。
      // 这是本轮的第二个闸门，实测把 DOM 元素方法（addEventListener/querySelector/…）
      // 从 `slots` 服务名下清掉。弃权记录进 shadowedBare，可审计。
      if (isShadowedIdent(text, svc)) { shadowedBare.push({ file: rel, service: svc }); continue }
      const re = new RegExp(String.raw`\b` + escapeRe(svc) + String.raw`\.([A-Za-z_]\w*)(?:\?\.)?\s*\(`, 'g')
      for (const m of text.matchAll(re)) {
        addCall(svc, m[1], rel, lineOf(starts, m.index), 'bare', svc,
          isGuardedNear(text, m.index, svc, m[1]))
      }
    }
  }

  // 同一 service.method 在同一行可能被多条规则同时命中，去重。
  // 保留**证据最强**的那条：ctx-member > alias > bare。
  const RANK = { 'ctx-member': 0, alias: 1, bare: 2 }
  // 只有「每一处都做过能力检测」的 service.method 对才进这个名单。
  // 去重之后才算，否则被去重掉的那一处会影响结论。
  const guardedPairs = new Set()
  const seen = new Map()
  for (const s of sites) {
    const k = `${s.service}|${s.method}|${s.file}|${s.line}`
    const prev = seen.get(k)
    if (!prev || RANK[s.via] < RANK[prev.via]) seen.set(k, s)
  }
  const uniqueSites = [...seen.values()]
  // 两个集合都**从去重后的站点派生** —— 同一条规则的两面，必须用同一个口径。
  // 只要**有一处**没做能力检测，这个对就必须照实报告（偏保守）。
  const unguardedPairs = new Set(
    uniqueSites.filter((x) => !x.guarded).map((x) => x.service + '.' + x.method),
  )
  for (const x of uniqueSites) {
    const k = x.service + '.' + x.method
    if (x.guarded && !unguardedPairs.has(k)) guardedPairs.add(k)
  }

  // 现场绑定 → 可审计的形态：只留**服务名**是字符串字面量的那部分键，
  // 否则 `byVar` 会把源码里所有 `x = y` 的转手都记下来（噪音）。
  // 每个绑定一条记录，**带 `files[]`**：一个变量可能在多个文件里各自干净地绑定。
  // 不变式 ⑤ 用 `(变量名, 文件)` 对账；`bindingsByFile` 就是那份账。
  const bindingRecords = []
  for (const [k, svcs] of [...bindingsByFile.entries()].sort()) {
    const idx = k.lastIndexOf('|')
    const variable = k.slice(0, idx)
    const file = k.slice(idx + 1)
    const entry = localBindings.get(variable) || {}
    bindingRecords.push({
      variable,
      file,
      service: svcs.size === 1 ? [...svcs][0] : null,
      ...(svcs.size > 1 ? { form: 'ambiguous', targets: [...svcs].sort() } : { form: entry.form ?? 'unknown' }),
      ...(entry.from ? { from: entry.from } : {}),
    })
  }
  const bindings = bindingRecords
    .filter((rec) => rec.service || rec.form === 'ambiguous')
    .map((rec) => ({
      variable: rec.variable,
      service: rec.service,
      form: rec.form,
      // 转手链的上一跳：`const b = a` 里的 `a`。有它才说得清"这个归属是怎么来的"。
      ...(rec.from ? { from: rec.from } : {}),
      ...(rec.targets ? { targets: rec.targets } : {}),
      file: rec.file,
    }))
    .sort((a, b) => cmp(a.variable, b.variable) || cmp(a.service, b.service))

  return {
    services, declared, softDeclared, addressable, calls, serviceFiles,
    sites: uniqueSites, provided, ambiguousAliases, bindings, shadowedBare, unresolvedBindings, subContexts,
    guardedPairs: [...guardedPairs].sort(), unguardedPairs: [...unguardedPairs].sort(),
  }
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
  // 官方双端 API 目录里出现过的服务名。用途**只有一个**：给「裸名/别名」这两条
  // 证据较弱的匹配规则划定边界（见 makeKnownService）。它**不参与**「服务存不存在」
  // 的判定 —— 那份判断需要运行时面或目录正文，不是一份名字清单能替代的。
  const catalogNames = new Set([
    ...Object.keys(options.catalog?.host || {}),
    ...Object.keys(options.catalog?.client || {}),
  ])
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
  // ── v2 新增的累积量 ──
  const perPlugin = {}          // 权威视图：逐插件归属
  const providedAll = new Set() // 所有插件自己 provide 出来的服务名
  const allSites = []           // 全局调用点（带 file:line）
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
      // ⚠️ `manifests` 是对拍严格比对的**旧兼容视图**，不要往里加新字段 ——
      // engines / compatibility 放在 perPlugin 里（对拍只严格比 manifests/services/fallbackPackages，
      // 加了新键会让对拍报"只在 node 版出现"）。这条是踩过的：加完当场被对拍抓住。
    })

    const [blob, fellBack, buckets, skipped] = collectFiles(full, j, options)
    if (fellBack) fallbackPkgs.push(j.name || full)

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

    // ── 逐插件归属（A6）+ 行号（A7）+ 插件自有服务（A5 的数据基础）──
    const scanned = scanPlugin(blob, catalogNames, j.name || full)
    for (const s of scanned.services) services.add(s)
    for (const [s, files] of scanned.serviceFiles) {
      if (!svcFiles.has(s)) svcFiles.set(s, new Set())
      for (const f of files) svcFiles.get(s).add(f)
    }
    for (const [s, ms] of scanned.calls) for (const m of ms) addCall(s, m)
    for (const s of scanned.provided) providedAll.add(s)
    for (const s of scanned.sites) allSites.push(s)

    const pkgName = j.name || full
    perPlugin[pkgName] = {
      name: j.name ?? null,
      version: j.version ?? null,
      dshBundle: Boolean(dsh.bundle),
      clientPlatform: client.platform ?? null,
      // H1' 的宿主侧那一半：声明了客户端半边，那半边真的端得出来吗。
      // ⚠️ 只放 perPlugin —— `manifests` 是对拍严格比对的旧兼容视图，
      // 往里加新键会当场被对拍抓住（这条踩过，见上面的注释）。
      clientHalf: clientHalfDeliverable(full, j),
      clientInject: client.inject ?? null,
      peerDependencies: j.peerDependencies ?? null,
      // 声明的兼容性口径（第 8 题：「声明与实测不符」这一类结论的输入）
      engines: j.engines ?? null,
      compatibility: (dsh.compatibility ?? null),
      declaredClientEntry: declaredClientEntry(j),
      fallback: fellBack,
      files: byBucket,
      services: [...scanned.services].sort(),
      // 哪些服务来自可信声明（inject / ctx.inject / ctx.get）—— 确定性分档用
      declaredServices: [...scanned.declared].sort(),
      // 其中通过 ctx.get() 软取的（允许缺失的那一类）
      softDeclaredServices: [...scanned.softDeclared].sort(),
      // 「可被点号调用」的服务名 —— 与 services 的差集就是「仅出现过名字但没有可验证调用」的服务。
      // 记下来是因为 `services` 与 `calls` 的键集合不相等时会被误读成 bug，而它其实是设计。
      addressableServices: [...scanned.addressable].sort(),
      calls: sortCalls(scanned.calls),
      callSites: scanned.sites,
      providedServices: [...scanned.provided].sort(),
      // 变量名 → 服务名 的绑定表。调用点上的 via='alias' 必须能在这里找到解释；
      // 这也是「为什么这个调用点算在它头上」的可审计证据。
      localBindings: scanned.bindings,
      // 因「服务名被同名局部变量遮蔽」而弃权的裸名匹配。空谈"放弃了什么"没有意义，要能逐条查。
      shadowedBare: scanned.shadowedBare,
      unresolvedBindings: scanned.unresolvedBindings,
      subContexts: scanned.subContexts,
      // 「作者自己做了能力检测」的 service.method 对 —— 判定层据此**不报**，
      // 因为报出来就是假阳性（用户并没失去任何东西）。见 guardRegex。
      guardedPairs: scanned.guardedPairs,
      unguardedPairs: scanned.unguardedPairs,
      // 因为「同名变量绑定了多个服务」而被弃权的别名调用点。
      // 记下来是为了可审计：弃权也要有据可查，而不是静默丢掉。
      ambiguousAliases: scanned.ambiguousAliases,
      // 服务名 → 出现在哪些文件。判定层据此判断某个服务是宿主侧还是客户端侧
      // （只看客户端桶的文件 = 客户端服务），比按名字猜可靠得多。
      serviceFiles: Object.fromEntries(
        [...scanned.serviceFiles.entries()].sort().map(([k, v]) => [k, [...v].sort()]),
      ),
      clientHints: Object.fromEntries(
        [...scanned.services].sort().map((s) => [s, clientHint(s, scanned.serviceFiles.get(s) || new Set())]),
      ),
    }
  }

  const clientHints = {}
  for (const s of [...services].sort()) clientHints[s] = clientHint(s, svcFiles.get(s) || new Set())

  return {
    report: {
      schemaVersion: 2,
      manifests,
      services: [...services].sort(),
      clientHints,
      calls: sortCalls(calls),
      fallbackPackages: fallbackPkgs,
      // ── v2 新增 ──
      // perPlugin 是权威视图：谁用了什么、在哪一行、哪些是它自己提供的
      perPlugin,
      // 全局调用点（带 file:line 与来源桶），供面板与工具直接消费
      // 排序必须带 plugin：探针实测两个包都有 lib/index.js 时，两条调用点都是
      // {file:"lib/index.js",line:1} —— **按 file+line 定位会取到错插件的源码**。
      // 「位置」正是本工具的核心产物之一，所以 plugin 必须进排序键。
      callSites: allSites.sort((a, b) =>
        cmp(a.plugin, b.plugin) || cmp(a.file, b.file)
        || (a.line ?? 0) - (b.line ?? 0)
        || cmp(a.service, b.service) || cmp(a.method, b.method)),
      // 全部插件自己 provide 出来的服务名 —— 它们不该被当成宿主服务来判缺失
      providedServices: [...providedAll].sort(),
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

const REPO_ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')

/**
 * CLI 用的目录加载：**读不到就不给边界**。
 *
 * 目录文件是 `rules/dsh-api-catalog.json`（由 tools/catalog 从 asar 现抽生成），
 * 相对本文件定位。读不到时返回 null，裸名/别名规则的边界退化为「插件自己声明过的
 * 名字」—— 行为仍然正确，只是更保守，而不是崩掉或放宽。
 */
function loadCatalog() {
  try {
    return JSON.parse(fs.readFileSync(resolve(join(REPO_ROOT, 'rules/dsh-api-catalog.json')), 'utf8'))
  } catch { return null }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const [nm, workdir] = process.argv.slice(2)
  if (!nm || !workdir) {
    console.error('用法: node lib/extract.mjs <node_modules 目录> <输出目录>')
    process.exit(2)
  }
  const { report, provenance } = extractWithProvenance(nm, { catalog: loadCatalog() })
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
