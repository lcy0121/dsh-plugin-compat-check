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

/**
 * 一条发现的**影响面**是测出来的，还是我们推断的？
 *
 * ## 这个字段存在的理由（一次实测的假阳性）
 *
 * 工具曾对 `dshmarket` 报过「功能失效 / **设置页会消失**」（`certainty: certain`），
 * 而作者**早就兜住了** —— 只是能力检测写在一个辅助函数里（`if (!canRegister(…)) return;`），
 * 正则看不见。**事实对了**（`settings.register` 确实不在运行时里），**推断错了**。
 *
 * 所以一条发现里有两种东西，可信度**不一样**：
 *
 * | | 是什么 | 能不能被独立信号确认 |
 * |---|---|---|
 * | `basis` | **事实**：我们量到了什么（方法不在运行时里、调用点没有能力检测） | ✅ 能（运行时面 + 源码行） |
 * | `impact` | **推断**：这意味着用户会失去什么 | ⚠️ **只有第 ① 层能** |
 *
 * - **`measured`** —— 有独立机器信号能确认这一条影响。
 *   目前**只有**「条目会停在 pending」这一类：宿主自己报 `fiber.state`，
 *   而 `tools/labels.mjs` 用合成正负例量过它（真阳性 1 / 假阳性 0 / 漏报 0）。
 * - **`inferred`** —— 剩下全部：我们读代码得出的结论。
 *   它**不等于错**，但它是**我们的视野**，而视野有边界（辅助函数里的兜底就是一条已知边界）。
 *
 * ⚠️ **不要因为 `inferred` 就把影响面删掉** —— 用户要的正是"这会让我失去什么"。
 * 要做的是**标明它是推断**，而不是把有用的信息藏起来。
 */
export const IMPACT_BASIS = {
  MEASURED: 'measured',   // 有独立机器信号确认
  INFERRED: 'inferred',   // 我们的推断（默认）
};

export const CATEGORY = {
  HOST_SERVICE_MISSING: 'host-service-missing',
  HOST_METHOD_MISSING: 'host-method-missing',
  UNPROVIDED_DEPENDENCY: 'unprovided-dependency',
  DECLARATION_MISMATCH: 'declaration-mismatch',
  // 客户端半边端不出来 —— 见下面 why：它不是"某个功能没了"，而是**整个界面没了**
  CLIENT_ENTRY_MISSING: 'client-entry-missing',
}

export const CERTAINTY = { CERTAIN: 'certain', SUSPECTED: 'suspected' }

/**
 * 每个服务在判定里的**去处**。这是「每一件事都有交代」的落地。
 *
 * 为什么需要它（实测，不是设想）：desktop profile 上有 **63 个服务**落进两条静默
 * `continue`（宿主有该服务时直接 continue、宿主没有且无人提供时又 continue），
 * 它们既不出现在 findings 里，也不出现在任何「已检查」名单里。后果是
 * **「确认没问题」与「根本没看」在输出里长得一模一样** —— 而对一个
 * 「告诉你插件跟 DSH 兼不兼容」的工具来说，这两件事的差别就是全部。
 *
 * 有了它，`services` 与 `checked` 的服务集合相等成为一条可断言的不变式。
 */
export const DISPOSITION = {
  FINDING: 'finding',                    // 有结论（见 findings）
  CLIENT_SIDE: 'client-side',            // 浏览器侧服务，本形态测不到
  SELF_PROVIDED: 'self-provided',        // 插件自己提供的服务，不是宿主服务
  RUNTIME_FACILITY: 'runtime-facility',  // Cordis 上下文内置成员
  FILTERED: 'filtered',                  // 判为噪音/假阳性，不进结论
  ABSTAINED: 'abstained',                // 数据不足以判定
  GUARDED: 'guarded',                    // 作者自己做了能力检测，缺失有兜底
  NO_CALLS: 'no-calls',                  // 只出现名字，没有任何调用点
  UNKNOWN: 'unknown',                    // 兜底：不该出现，出现即是判定引擎的 bug
}

/**
 * 去处之间的**强度序**：一个服务可能多条路径都命中（某些方法有结论、另一些方法
 * 被作者自己兜了底）。此时取最强的那条作为这个服务的去处 —— 因为「有结论」
 * 是用户最需要看到的信息，而较弱的那条仍然留在 `checked` 里可查。
 *
 * UNKNOWN 排最高不是为了让它赢，正相反：它是 bug 信号，必须浮到面上。
 */
const DISPOSITION_RANK = {
  [DISPOSITION.UNKNOWN]: 100,
  [DISPOSITION.FINDING]: 60,
  [DISPOSITION.GUARDED]: 50,
  [DISPOSITION.FILTERED]: 40,
  [DISPOSITION.CLIENT_SIDE]: 30,
  [DISPOSITION.SELF_PROVIDED]: 25,
  [DISPOSITION.RUNTIME_FACILITY]: 24,
  [DISPOSITION.ABSTAINED]: 20,
  [DISPOSITION.NO_CALLS]: 10,
}

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
  // ⚠️ `logger` 也在这里，而它**是实测出来的**，不是推断：
  // 用 `--probe-boot` 起了一次真实宿主，把 `logger` 放进探针的 wanted 名单，
  // 结果是 `present: false`（同一批里 `tools` 39 个方法、`agents` 24 个都在）。
  // 也就是说 `ctx.logger` 与 `ctx.loader` / `ctx.effect` 同类 —— 是 Cordis 的上下文
  // 便利成员，**不是可注入的服务**。所以插件写 `inject: ['logger']` 并不会让它停在
  // pending（实测 dsh-keep-awake / dsh-pet 都这么写，而它们在运行时是好的）。
  'loader', 'logger', 'fiber', 'effect', 'inject', 'provide', 'reflect', 'scope', 'root',
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
    if (m && m.severity) {
      // ruleRef 必须**结构化地**带出去，不能只在 basis 里写成一句散文。
      // 理由：规则表是 34 KB 手工维护的数据文件，改错一个键名会让严重度静默
      // 降级到默认档 —— 那正是最该被发现的一类错误，而散文无法被断言。
      return {
        severity: m.severity,
        impact: m.impact,
        source: 'rule',
        ruleRef: `services.${service}${method ? `.methods.${method}` : ''}`,
      }
    }
    if (svc.methods && method) {
      return {
        severity: fallback.severity,
        impact: fallback.impact,
        source: 'default',
        ruleRef: `services.${service}`,
        ruleNote: '规则表覆盖了该服务但未覆盖这个方法',
      }
    }
  }
  return { severity: fallback.severity, impact: fallback.impact, source: 'default', ruleRef: null }
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
  // 「被某个插件声明过」的服务（inject / ctx.inject / ctx.get / ctx.<svc>.<m>()）。
  // 用途见下面兜底分支：**声明了但没有任何调用点** ≠ 「只是名字出现过」。
  // 前者是真实依赖（只是插件没用它），后者只是噪音 —— 两者不能同样处理。
  const declaredAnywhere = new Set()
  for (const p of Object.values(report.perPlugin || {})) {
    for (const s of p.declaredServices || []) declaredAnywhere.add(s)
  }
  const runtimeRoot = (hostSurface && hostSurface.root) || null

  const plugins = {}
  const summary = { ok: 0, partial: 0, broken: 0, unknown: 0 }

  for (const [name, p] of Object.entries(report.perPlugin || {})) {
    const declared = new Set(p.declaredServices || [])
    const softDeclared = new Set(p.softDeclaredServices || []) // ctx.get 这类软依赖
    const selfProvided = new Set(p.providedServices || [])
    // 「插件作者自己做了能力检测」的 service.method 对（`lib/extract.mjs` 的 guardedPairs）。
    // 对这种对报「方法缺失」是**假阳性**：作者明知它可能不在并自己兜了底，
    // 用户并没有失去任何功能。实测 `dsh-pet` 的 `llm.listProviders` 就是这样
    // （`typeof llm?.listProviders === "function" ? ... : []`），
    // 不排除掉就会把「可用」错报成「部分可用」—— 而假阳性正是这个工具唯一卖点的反面。
    const guarded = new Set(p.guardedPairs || [])
    const findings = []
    const clientSide = []
    const filtered = []
    const abstained = []
    const runtimeFacilities = []
    // **每个服务的去处**。append-only：一个服务可以有多条记录（例如某些方法有结论、
    // 另一些被作者自己兜了底），最终去处取强度最高的那条 —— 见 DISPOSITION_RANK。
    // 全留着的理由：空谈「放弃了什么」没有意义，要能逐条查。
    const checked = []
    const account = (svc, disposition, extra = {}) => checked.push({ service: svc, disposition, ...extra })

    // ── H1' 的宿主侧那一半：客户端半边真的端得出来吗 ──
    //
    // 为什么放在服务循环**之前**、且单列一类：实测过这个分界（Plan.md §6）——
    // 客户端条目加载失败时**整个界面被一张错误屏替代**（`#root` 从 35397 字符剩 450）。
    // 也就是说它不属于"某个服务的某个方法没了"，而是"用户什么都用不了"。
    // 把它混进服务级发现会**低估**它。
    //
    // ⚠️ 它**不是**完整的 H1'：只回答"声明了、文件在不在、能不能解析到"。
    // 文件在但浏览器里 import 失败（语法错/依赖缺失/运行时报错）**测不到** ——
    // 那需要浏览器。不要把这条检查说成"客户端对账已完成"。
    if (p.clientHalf && p.clientHalf.declared && p.clientHalf.ok === false) {
      findings.push({
        category: CATEGORY.CLIENT_ENTRY_MISSING,
        // 条目取不到是**静态事实**（文件不在）；「整个界面被错误屏替代」是我们实测过的行为。
        impactBasis: IMPACT_BASIS.MEASURED,
        certainty: CERTAINTY.CERTAIN,
        service: null,
        method: null,
        location: null,
        severity: 'fatal',
        impact: '客户端半边加载不出来 —— 这个插件的界面部分不可用；插件条目加载失败时整个界面会被错误屏替代',
        basis: p.clientHalf.why,
        ruleSource: 'runtime',
        ruleRef: 'plugins.client.half',
      })
    }

    for (const svc of p.services) {
      if (selfProvided.has(svc)) {
        account(svc, DISPOSITION.SELF_PROVIDED, { reason: '插件自己用 ctx.provide 提供的服务，不是宿主服务' })
        continue
      }
      if (CORDIS_CONTEXT_BUILTINS.has(svc)) {
        runtimeFacilities.push({ name: svc, reason: 'Cordis 上下文内置成员，不是 DSH 服务' })
        account(svc, DISPOSITION.RUNTIME_FACILITY, { reason: 'Cordis 上下文内置成员' })
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
        account(svc, DISPOSITION.FILTERED, { reason: '无可信声明，且不在官方双端目录里' })
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
      // 判据 c：插件**自己的 `dsh.client.inject`** 里点名了它。
      //
      // 为什么需要第三条：判据 b 要求"出现的文件**全部**在客户端桶里"，而共用代码
      // （同一个 `lib/index.js` 既跑在宿主也被浏览器 import）会给服务留下一个宿主文件，
      // 于是 b 不成立。实测 `dsh-better-sidebar` 的 `modules` 就是这样：
      // 它出现在 5 个 `client-*.js` 加一个 `lib/index.js`，而插件自己的
      // `clientInject` 里赫然写着 `@deepseek-ai/dsh-client-modules` —— 也就是说
      // **作者已经声明了它属于客户端**，只是共用代码把文件判据搅浑了。
      //
      // 匹配方式：包名 `@scope/dsh-client-<x>` 的服务名就是 `<x>`（也可能整体就是服务名）。
      // 只做**后缀匹配**，不做模糊猜测 —— 名字对不上就不算，宁可多报也不误吞。
      const clientInjectNames = new Set()
      for (const spec of (p.clientInject || [])) {
        if (typeof spec !== 'string' || !spec) continue
        clientInjectNames.add(spec)
        const tail = spec.split('/').pop() || spec
        clientInjectNames.add(tail)
        const m = /(?:^|-)client-(.+)$/.exec(tail)
        if (m && m[1]) clientInjectNames.add(m[1])
      }
      const declaredClientInjected = clientInjectNames.has(svc)
      // 判据 d：它在插件的**客户端文件**里出现过，而且宿主没有它。
      //
      // 判据 b 要求"全部文件都在客户端桶里"，这在**共用代码**面前必然失效：
      // 同一个 `lib/index.js` 既跑在宿主也被浏览器 import，于是服务总会留下一个
      // 宿主文件。实测 `settingsScope` 就是 `lib/client.js` + `lib/index.js` 各一份。
      //
      // d 比 b 宽一档：**只要在客户端出现过**就算（但仍要求宿主没有它）。
      // 方向上是安全的 —— 客户端和宿主都出现的服务，如果宿主真的有，`hostHas` 已经
      // 把它拦下了；走到这里说明宿主确实没有，而它又在浏览器侧被用到，
      // 那它就是"宿主形态看不见"，不该报成插件坏了。
      //
      // 实测这一档把最后两大类假阳性清掉：`settingsScope`（共用代码）与
      // `modules`（clientInject 点名但名字对不上）。
      const inAnyClientFile = filesOfSvc.some((f) => clientFileSet.has(f))
      if (!hostHas && (inClientCat || onlyInClientFiles || declaredClientInjected || inAnyClientFile)) {
        clientSide.push({
          service: svc,
          note: '客户端服务（浏览器侧）。宿主探针看不到它，命令行形态也测不到 —— 需界面验证',
          basis: inClientCat
            ? '在官方客户端服务目录里'
            : (onlyInClientFiles
              ? '它出现的文件全部属于客户端半边（按来源分桶判定）'
              : (onlyInClientFiles
              ? '它出现的文件全部属于客户端半边（按来源分桶判定）'
              : '它在插件自己的客户端文件里被用到，而宿主没有它')),
        })
        account(svc, DISPOSITION.CLIENT_SIDE, {
          reason: inClientCat
            ? '在官方客户端服务目录里'
            : (onlyInClientFiles ? '它出现的文件全部属于客户端半边'
              : (declaredClientInjected ? '插件自己的 client.inject 点了名'
                : '它在插件自己的客户端文件里被用到，而宿主没有它')),
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
            account(svc, DISPOSITION.ABSTAINED, { reason: '宿主目录未声明任何方法，且无运行时面 —— 无法判定' })
            continue
          }
          methods = cm
          methodSource = '目录'
        }
        // 走到这里说明这个服务**确实被看过**了。先记一条兜底去处：即使下面
        // 一个方法都没报，用户也能看到「这个服务检查过了」，而不是一片空白。
        // 若下面真的报了，更强的 FINDING 会覆盖它（见 DISPOSITION_RANK）。
        //
        // ⚠️ 但**一个调用点都没有**的服务不能记成 ABSTAINED。那是本会话里真实
        // 出现过的静默回归的形状：某次改动让 `calls` 变成空对象而 `services` 一字未变，
        // 于是「每条调用都兼容」与「什么调用都没看到」在输出里长得一模一样，
        // 结论从「部分可用」翻成「可用」。所以零调用点必须留下 no-calls 痕迹 ——
        // 它明确说「没有任何证据」，而不是含糊的「暂时判不了」。
        const usedMethods = p.calls[svc] || []

        // ── 只判**宿主侧**的调用点；只在客户端调用的方法不进结论 ──
        //
        // 为什么必须分：`sessions` 这类服务**两端都有**（宿主 14 个方法，浏览器侧另有一套）。
        // 而命令行只能拿到宿主面，于是 `ctx.sessions.scope?.()` 这种**写在 lib/client.js 里**
        // 的调用，会被拿宿主方法表去对，对不上就报「宿主方法缺失」—— 实测
        // `dsh-better-sidebar` / `dsh-mnemon` / `dsh-recall-plugin` 的 `sessions.*`
        // 全是这一类，**全是假阳性**。
        //
        // 做法：把"这个方法在哪些文件被调用过"列出来，只有当**至少有一个宿主侧调用点**时
        // 才拿宿主面去判。全部调用点都在客户端文件里的方法，归入「客户端半边，需界面验证」。
        const sitesOfService = (p.callSites || []).filter((x) => x.service === svc)
        const hostSideMethods = new Set()
        const clientOnlyMethods = new Set()
        for (const site of sitesOfService) {
          if (clientFileSet.has(site.file)) clientOnlyMethods.add(site.method)
          else hostSideMethods.add(site.method)
        }
        // `p.calls` 是"这个插件调用过的方法名"的并集，没有文件维度 ——
        // 所以用调用点把只在客户端出现的那些摘出去。
        const hostSideUsed = usedMethods.filter((m) => hostSideMethods.has(m) || !clientOnlyMethods.has(m))
        for (const m of usedMethods) {
          if (clientOnlyMethods.has(m) && !hostSideMethods.has(m)) {
            account(svc, DISPOSITION.CLIENT_SIDE, {
              method: m,
              reason: '该方法只在客户端文件里被调用 —— 浏览器侧另有一套 API，宿主面看不见它',
            })
          }
        }
        account(svc, usedMethods.length === 0 ? DISPOSITION.NO_CALLS : DISPOSITION.ABSTAINED, {
          reason: usedMethods.length === 0
            ? `宿主有该服务，但插件对它没有任何调用点 —— 无证据可判（方法清单来自${methodSource}）`
            : `宿主有该服务，方法级判定来自${methodSource}（共 ${methods.length} 个方法）`,
        })
        const methodSet = new Set(methods)
        const catalogMethods = new Set(((hostCat[svc] || {}).methods) || [])
        for (const used of hostSideUsed) {
          if (methodSet.has(used)) continue
          // 作者自己检测过的调用 → 不进结论，但要记进 filtered（可审计，不是静默丢）
          if (guarded.has(`${svc}.${used}`)) {
            filtered.push({
              service: svc,
              method: used,
              reason: '插件在调用前自己做了能力检测（可选链或 typeof === "function"），缺失时它已有兜底行为 —— 报出来是假阳性',
            })
            account(svc, DISPOSITION.GUARDED, { method: used, reason: '作者自己做了能力检测，缺失有兜底' })
            continue
          }
          // 集合方法噪音：既不在宿主方法表里、又是 JS 内置方法名 → 判噪音而非缺失。
          // 必须两个条件同时成立：`sessions.get` 虽在 JS 内置名单里，但它在宿主方法表里，属真方法。
          if (JS_BUILTIN_METHODS.has(used) && !catalogMethods.has(used)) {
            filtered.push({ service: svc, method: used, reason: 'JS 内置方法名，且不在宿主方法表里（大概率是对局部集合/字符串的调用）' })
            account(svc, DISPOSITION.FILTERED, { method: used, reason: 'JS 内置方法名且不在宿主方法表里' })
            continue
          }
          const sev = lookupSeverity(rules, svc, used, { severity: 'feature-dead', impact: '影响面未知' })
          findings.push({
            category: CATEGORY.HOST_METHOD_MISSING,
        // 方法不在运行时里是**事实**；「这个功能会死」是**推断** —— 作者可能兜在别处。
        impactBasis: IMPACT_BASIS.INFERRED,
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
            // 结构化的规则来源：basis 里那句散文无法被断言，而规则表是手工维护的数据文件
            ruleSource: sev.source,
            ruleRef: sev.ruleRef ?? null,
            ...(sev.ruleNote ? { ruleNote: sev.ruleNote } : {}),
            basis: sev.source === 'rule'
              ? `${methodSource}里没有这个方法；规则表给出影响面`
              : `${methodSource}里没有这个方法；规则表未覆盖该 API，按默认档判为功能失效、影响面未知`,
          })
          account(svc, DISPOSITION.FINDING, { method: used, severity: sev.severity, ruleSource: sev.source })
        }
        continue
      }

      // ── 宿主没有：看有没有别的插件提供 ──
      if (providedAnywhere.has(svc)) {
        account(svc, DISPOSITION.SELF_PROVIDED, { reason: '由已安装的某个插件提供（见 report.providedServices）' })
        continue
      }

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
        // 硬依赖缺失会让**条目停在 pending** —— 这一条有独立机器信号（宿主自己报 fiber.state），
        // 而 `tools/labels.mjs` 用合成正负例量过它（真阳性 1 / 假阳性 0 / 漏报 0）。
        // 软取只是降级，「会不会真的缺」是推断。
        impactBasis: isSoft ? IMPACT_BASIS.INFERRED : IMPACT_BASIS.MEASURED,
        certainty: hasRuntime ? certainty : CERTAINTY.SUSPECTED,
        service: svc,
        method: null,
        location: null,
        evidence: { inHostCatalog: inHostCat, providedByAnyInstalledPlugin: false },
        severity: sev.severity,
        impact: sev.impact,
        ruleSource: sev.source,
        ruleRef: sev.ruleRef ?? null,
        basis: (isSoft
          ? '插件用 ctx.get() 软取该服务（写法上允许缺失）'
          : '插件在 inject 里把它声明为硬依赖') + '，而宿主与所有已装插件都没有提供它',
      })
      account(svc, DISPOSITION.FINDING, { severity: sev.severity, ruleSource: sev.source })
    }

    // ── 声明与实测不符 ──
    const decl = declarationOf(p, dshVersion)
    if (decl && decl.claimsCompatible === true && findings.length) {
      findings.push({
        category: CATEGORY.DECLARATION_MISMATCH,
        impactBasis: IMPACT_BASIS.INFERRED,
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

    // ── 兜底：还有服务没有去处吗？──
    // 这条**必须存在**。只要 `services` 与 `checked` 的服务集合不相等，就说明
    // 又冒出了一条静默路径。与其让它静默，不如记成 UNKNOWN 并让不变式去炸 ——
    // 「有调用点却没落到任何判定分支」是判定引擎的 bug，不是插件的问题，
    // 它必须浮到面上而不是变成一个看起来干净的结论。
    const accounted = new Set(checked.map((c) => c.service))
    for (const svc of p.services) {
      if (accounted.has(svc)) continue
      const hasCalls = has(p.calls || {}, svc)
      if (hasCalls) {
        checked.push({
          service: svc,
          disposition: DISPOSITION.UNKNOWN,
          reason: '有调用点却没有落到任何判定分支 —— 这是判定引擎的缺陷，不是插件的问题',
        })
        continue
      }
      // **声明了但没有任何调用点** —— 这是一个真实缺口，不能只记一笔「无证据可判」。
      // 实证：`dsh-mnemon-strategy-*` 一族都写 `const inject = ["mnemonMemory"]`
      // 然后把它交给 SDK，自己从不直接调用；而当前 profile 里**无人提供** mnemonMemory。
      // 只认 `inject:` 字面量时这批插件被判成「0 个服务 → 可用」—— 那是漏报：
      // 工具对真实缺口只字不提，用户却以为自己拿到了结论。
      if (declaredAnywhere.has(svc) && !selfProvided.has(svc)) {
        const other = providedAnywhere.has(svc)
        if (!other) {
          const isSoft = softDeclared.has(svc) || !runtimeRoot
          const sev = lookupSeverity(rules, svc, null, isSoft
            ? { severity: 'degraded', impact: '依赖的服务由其它插件提供，当前 profile 里没有提供方 —— 相关功能降级或不可用' }
            : { severity: 'fatal', impact: '插件条目会停在 pending（等待该服务），等同于没起来' })
          findings.push({
            category: isSoft ? CATEGORY.UNPROVIDED_DEPENDENCY : CATEGORY.HOST_SERVICE_MISSING,
        // 硬依赖缺失会让**条目停在 pending** —— 这一条有独立机器信号（宿主自己报 fiber.state），
        // 而 `tools/labels.mjs` 用合成正负例量过它（真阳性 1 / 假阳性 0 / 漏报 0）。
        // 软取只是降级，「会不会真的缺」是推断。
        impactBasis: isSoft ? IMPACT_BASIS.INFERRED : IMPACT_BASIS.MEASURED,
            certainty: runtimeRoot ? CERTAINTY.CERTAIN : CERTAINTY.SUSPECTED,
            service: svc,
            method: null,
            location: null,
            evidence: { declaredButUncalled: true, inHostCatalog: has(hostCat, svc), providedByAnyInstalledPlugin: false },
            severity: sev.severity,
            impact: sev.impact,
            ruleSource: sev.source,
            ruleRef: sev.ruleRef ?? null,
            basis: '插件把这个服务声明为依赖（inject / ctx.inject），但当前 profile 里'
              + '宿主与所有已装插件都没有提供它。声明本身就是依赖，与它有没有被直接调用无关。',
          })
          checked.push({ service: svc, disposition: DISPOSITION.FINDING, severity: sev.severity, ruleSource: sev.source })
          continue
        }
      }
      checked.push({
        service: svc,
        disposition: DISPOSITION.NO_CALLS,
        reason: '服务名出现过，但没有任何可归属的调用点 —— 无法据此构成结论',
      })
    }

    // 每个服务的**最终去处** = 强度最高的那条（一个服务可以有多条记录）。
    const resolved = {}
    for (const c of checked) {
      const prev = resolved[c.service]
      if (!prev || DISPOSITION_RANK[c.disposition] > DISPOSITION_RANK[prev.disposition]) resolved[c.service] = c
    }

    const fatal = findings.some((f) => f.severity === 'fatal')
    const verdict = fatal ? 'broken' : (findings.length ? 'partial' : 'ok')
    // 「可用」必须建立在**确实看过东西**之上。
    // 实测 desktop profile 上有 4 个插件是「空洞的 ok」：它一个服务都没有，
    // 所以没有任何东西可以被检查，结论却是「可用」。那不是结论，那是没做事。
    const examined = Object.values(resolved).filter((c) => c.disposition !== DISPOSITION.NO_CALLS
      && c.disposition !== DISPOSITION.UNKNOWN)
    const vacuous = verdict === 'ok' && examined.length === 0
    summary[verdict] += 1
    if (vacuous) summary.vacuousOk = (summary.vacuousOk || 0) + 1

    plugins[name] = {
      name,
      version: p.version,
      verdict,
      // 「可用」但没有任何东西可检查 —— 调用方必须能看到这个区别
      vacuous,
      findings,
      // append-only 的完整台账，与「最终去处」并存：
      // 前者回答「发生了什么」，后者回答「这个服务算哪种情况」
      checked,
      resolved,
      clientSide,
      filtered,
      abstained,
      runtimeFacilities,
    }
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
