/**
 * 判定引擎（A8）：把「静态提取结果 + 宿主真实 API 面」变成逐插件的五元组结论。
 *
 * 五元组 = 类别 / 位置 / 依据 / 严重度 / 影响面，外加**确定性**标注。
 *
 * 四条不可动的原则（Plan.md §2.1、§2.2、§4）：
 *   1. **LLM 不参与判定**。严重度由分层默认档 + `rules/severity.json` 决定。
 *   2. **宁可标疑似**。判不准时降级标注，而不是升格成确定。
 *   3. **目录 ≠ 运行时 API 面**。官方目录里抽象服务（`host.jobs`）**一个方法都不声明**，
 *      而运行时实现有 29 个方法。拿目录当运行时面会把所有 `jobs.list` 误报成"方法缺失"。
 *      所以方法级判定**优先用运行时面**；只有目录声明了方法时才退回目录。
 *   4. **客户端服务不能用宿主面判**。`locale` / `slots` 活在浏览器里，宿主探针必然
 *      看不到（`present=false`）。拿它去判会得出"服务缺失 → 致命"，把 `dsh-keep-awake`
 *      这种"部分可用"误判成"不兼容"。官方有对称的**客户端服务目录**，用它区分。
 */

export const CATEGORY = {
  HOST_SERVICE_MISSING: 'host-service-missing',
  HOST_METHOD_MISSING: 'host-method-missing',
  UNPROVIDED_DEPENDENCY: 'unprovided-dependency',
  DECLARATION_MISMATCH: 'declaration-mismatch',
}

export const CERTAINTY = { CERTAIN: 'certain', SUSPECTED: 'suspected' }

const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k)

/**
 * Cordis 上下文（ctx）的**内置成员** —— 它们不是 DSH 服务，而是插件运行时框架本身提供的。
 *
 * 实测教训：`loader` / `effect` / `fiber` 这些名字会出现在插件源码里，但**不在官方
 * DSH 服务目录里**。若不排除，判定引擎会得出「宿主服务缺失 → 致命 → 插件不兼容」，
 * 而实际上这些设施在任何 Cordis 上下文里都存在。实测 desktop profile 上，
 * `loader` 一个名字就把 `dshmarket` 误判成了"不兼容"。
 */
const CORDIS_CONTEXT_BUILTINS = new Set([
  'loader', 'fiber', 'effect', 'inject', 'provide', 'reflect', 'scope', 'root',
  'get', 'set', 'on', 'off', 'once', 'emit', 'parallel', 'waterfall', 'bail',
  'start', 'stop', 'dispose', 'isActive', 'extend', 'isolate', 'intercept', 'plugin',
])

/**
 * JavaScript 语言内置的集合/字符串方法名。
 *
 * 实测教训：插件里 `const sessions = new Map()` 之后的 `sessions.set(...)`、
 * `sessions.map(...)` 会被当成"调用了宿主 not-exist 的方法"。只靠名字黑名单**不安全**
 * （`sessions.get` 是真实存在的宿主方法），所以配合"该方法不在宿主方法表里"一起用。
 */
const JS_BUILTIN_METHODS = new Set([
  'map', 'set', 'sort', 'values', 'has', 'reduce', 'forEach', 'filter', 'find', 'findIndex',
  'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'indexOf', 'lastIndexOf', 'includes',
  'replace', 'replaceAll', 'split', 'join', 'concat', 'keys', 'delete', 'clear', 'add',
  'toString', 'valueOf', 'then', 'catch', 'finally', 'bind', 'call', 'apply',
  'test', 'exec', 'trim', 'toLowerCase', 'toUpperCase', 'startsWith', 'endsWith',
  'padStart', 'padEnd', 'repeat', 'match', 'search', 'charAt', 'substring', 'substr',
  'flat', 'flatMap', 'some', 'every', 'fill', 'copyWithin', 'reverse', 'at',
  'assign', 'freeze', 'isArray', 'from', 'entries',
])

/** 先查 服务.方法，再查 服务，最后落分层默认档 */
function lookupSeverity(rules, service, method, fallback) {
  const svc = (rules.services || {})[service]
  if (svc) {
    const m = method ? (svc.methods || {})[method] : null
    if (m && m.severity) return { severity: m.severity, impact: m.impact, source: 'rule' }
  }
  return { severity: fallback.severity, impact: fallback.impact, source: 'default' }
}

/**
 * @param {object}   o.report        lib/extract.mjs 的 static.json
 * @param {object?}  o.hostSurface   运行时宿主 API 面（探针产物）；缺失则退回目录
 * @param {object}   o.rules         rules/severity.json
 * @param {object}   o.catalog       rules/dsh-api-catalog.json（{host, client}）
 * @param {string?}  o.dshVersion
 */
export function buildVerdicts({ report, hostSurface = null, rules, catalog, dshVersion = null }) {
  const hostCat = (catalog && catalog.host) || {}
  const clientCat = (catalog && catalog.client) || {}
  const providedAnywhere = new Set(report.providedServices || [])
  const runtimeRoot = (hostSurface && hostSurface.root) || null

  const plugins = {}
  const summary = { ok: 0, partial: 0, broken: 0, unknown: 0 }

  for (const [name, p] of Object.entries(report.perPlugin || {})) {
    const declared = new Set(p.declaredServices || [])
    const softDeclared = new Set(p.softDeclaredServices || []) // ctx.get 这类软依赖
    const selfProvided = new Set(p.providedServices || [])
    const findings = []
    const clientSide = []
    const filtered = []
    const abstained = []
    const runtimeFacilities = []

    for (const svc of p.services) {
      if (selfProvided.has(svc)) continue
      if (CORDIS_CONTEXT_BUILTINS.has(svc)) {
        runtimeFacilities.push({ name: svc, reason: 'Cordis 上下文内置成员，不是 DSH 服务' })
        continue
      }

      const inHostCat = has(hostCat, svc)
      const inClientCat = has(clientCat, svc)
      const runtimeInfo = runtimeRoot ? runtimeRoot[svc] : null
      const runtimePresent = runtimeInfo ? Boolean(runtimeInfo.present) : null
      const runtimeMethods = runtimeInfo && runtimeInfo.methods ? Object.keys(runtimeInfo.methods) : null

      // 判定「宿主有没有」：运行时说有就是有；运行时没探到才退回目录
      const hostHas = runtimePresent === true || (runtimePresent === null && inHostCat)

      // ── 三档确定性（Plan.md §2.2）──
      const certainty = declared.has(svc)
        ? CERTAINTY.CERTAIN
        : ((inHostCat || inClientCat) ? CERTAINTY.SUSPECTED : null)
      if (certainty === null) {
        filtered.push({ service: svc, reason: '无可信声明，且不在宿主/客户端官方目录里（多半是 vendored 代码里的同名变量）' })
        continue
      }

      // ── 客户端服务：本形态测不到，不得判为不兼容 ──
      //
      // 两个判据合起来用：
      //   a) 在官方客户端目录里（权威，但那份目录只有 8 个条目，远不完整）；
      //   b) 它出现的文件**全部**落在客户端桶里（`client-entry` / `client-extra`）。
      // 判据 b 是从我们自己的来源分桶推出来的，能覆盖目录没收录的客户端服务
      // （实测 `sidebarRight` / `configForms` / `settingsScope` / `pluginNavigation`
      // 都是这一类 —— 只靠目录会把他们误判成"宿主服务缺失 → 致命"，把
      // `dsh-agent-teams` 这种插件错报成"不兼容"）。
      const clientFileSet = new Set([...(p.files?.['client-entry'] || []), ...(p.files?.['client-extra'] || [])])
      const filesOfSvc = (p.serviceFiles || {})[svc] || []
      const onlyInClientFiles = filesOfSvc.length > 0 && filesOfSvc.every((f) => clientFileSet.has(f))
      if (!hostHas && (inClientCat || onlyInClientFiles)) {
        clientSide.push({
          service: svc,
          note: '客户端服务（浏览器侧）。宿主探针看不到它，命令行形态也测不到 —— 需界面验证',
          basis: inClientCat ? '在官方客户端服务目录里' : '它出现的文件全部属于客户端半边（按来源分桶判定）',
        })
        continue
      }

      if (hostHas) {
        let methods = runtimeMethods
        let methodSource = '运行时'
        if (!methods) {
          const cm = (hostCat[svc] || {}).methods || []
          if (cm.length === 0) {
            abstained.push({
              service: svc,
              basis: `宿主目录对 ${svc} 未声明任何方法（抽象服务或客户端服务），本次也没有运行时面可用 —— 无法判定方法级兼容性`,
            })
            continue
          }
          methods = cm
          methodSource = '目录'
        }
        const methodSet = new Set(methods)
        const catalogMethods = new Set(((hostCat[svc] || {}).methods) || [])
        for (const used of (p.calls[svc] || [])) {
          if (methodSet.has(used)) continue
          // 集合方法噪音：既不在宿主方法表里、又是 JS 内置方法名 → 判噪音而非缺失。
          // 必须两个条件同时成立：`sessions.get` 虽在 JS 内置名单里，但它在宿主方法表里，属真方法。
          if (JS_BUILTIN_METHODS.has(used) && !catalogMethods.has(used)) {
            filtered.push({ service: svc, method: used, reason: 'JS 内置方法名，且不在宿主方法表里（大概率是对局部集合/字符串的调用）' })
            continue
          }
          const sev = lookupSeverity(rules, svc, used, { severity: 'feature-dead', impact: '影响面未知' })
          findings.push({
            category: CATEGORY.HOST_METHOD_MISSING,
            // 只有官方目录、没有运行时面时，方法级结论降级为「疑似」：
            // 目录对抽象服务（jobs）一个方法都不声明，对另一些服务（settings）也少于运行时实有。
            // 拿一份已知不完整的清单去断言"方法不存在"，不够格叫确定。
            certainty: methodSource === '运行时' ? certainty : CERTAINTY.SUSPECTED,
            service: svc,
            method: used,
            location: firstSite(p, svc, used),
            evidence: { methodSource, hostMethodCount: methods.length },
            severity: sev.severity,
            impact: sev.impact,
            basis: sev.source === 'rule'
              ? `${methodSource}里没有这个方法；规则表给出影响面`
              : `${methodSource}里没有这个方法；规则表未覆盖该 API，按默认档判为功能失效、影响面未知`,
          })
        }
        continue
      }

      // ── 宿主没有：看有没有别的插件提供 ──
      if (providedAnywhere.has(svc)) continue

      // **只有目录、没有运行时面时，不能断言"宿主没有这个服务"。**
      // 官方目录是**契约**目录：它对 `loader` 完全不收录、对 `jobs` 一个方法都不声明、
      // 对 `settings` 声明的方法数也少于运行时实有。拿它当"宿主服务清单"会得出
      // 「服务缺失 → 致命 → 插件不兼容」的错误结论（实测把 `dsh-mnemon`、`dsh-catppuccin`
      // 错报成"不兼容"）。所以此时降级为「疑似 + 降级」，而不是「确定 + 致命」。
      const hasRuntime = runtimeRoot !== null
      const isSoft = softDeclared.has(svc) || !hasRuntime
      const sev = lookupSeverity(rules, svc, null, isSoft
        ? { severity: 'degraded', impact: '依赖的服务由其它插件提供，当前 profile 里没有提供方 —— 相关功能降级或不可用' }
        : { severity: 'fatal', impact: '插件条目会停在 pending（等待该服务），等同于没起来' })
      findings.push({
        category: isSoft ? CATEGORY.UNPROVIDED_DEPENDENCY : CATEGORY.HOST_SERVICE_MISSING,
        certainty: hasRuntime ? certainty : CERTAINTY.SUSPECTED,
        service: svc,
        method: null,
        location: null,
        evidence: { inHostCatalog: inHostCat, providedByAnyInstalledPlugin: false },
        severity: sev.severity,
        impact: sev.impact,
        basis: (isSoft
          ? '插件用 ctx.get() 软取该服务（写法上允许缺失）'
          : '插件在 inject 里把它声明为硬依赖') + '，而宿主与所有已装插件都没有提供它',
      })
    }

    // ── 声明与实测不符 ──
    const decl = declarationOf(p, dshVersion)
    if (decl && decl.claimsCompatible === true && findings.length) {
      findings.push({
        category: CATEGORY.DECLARATION_MISMATCH,
        certainty: CERTAINTY.CERTAIN,
        service: null,
        method: null,
        location: null,
        evidence: { declared: decl.raw, measuredFindings: findings.length },
        severity: 'feature-dead',
        impact: `声明自己与 DSH ${dshVersion} 兼容，但实测有 ${findings.length} 处失效`,
        basis: '「声明不等于现实」的直接证据 —— 这是本工具相对既有方案唯一不可替代的结论',
      })
    }

    const fatal = findings.some((f) => f.severity === 'fatal')
    const verdict = fatal ? 'broken' : (findings.length ? 'partial' : 'ok')
    summary[verdict] += 1

    plugins[name] = { name, version: p.version, verdict, findings, clientSide, filtered, abstained, runtimeFacilities }
  }

  return { dshVersion, plugins, summary, categories: CATEGORY, certaintyLevels: CERTAINTY }
}

function firstSite(p, svc, method) {
  const site = (p.callSites || []).find((s) => s.service === svc && s.method === method)
  return site ? { file: site.file, line: site.line } : null
}

/** 只做最保守的一档：读不到声明就返回 null（不猜） */
function declarationOf(p, dshVersion) {
  const compat = p.compatibility || null
  if (!compat) return null
  const v = dshVersion ? compat[dshVersion] : null
  return {
    raw: { compatibility: compat, engines: p.engines ?? null },
    claimsCompatible: v === 'compatible' ? true : (v === 'incompatible' ? false : null),
  }
}
