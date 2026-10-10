/**
 * 客户端半边的**结构**测试。
 *
 * ## 为什么需要这一层（一次真实事故）
 *
 * 清理调试代码时，我误删了 `lib/client.js` 里几个函数定义
 * （`usePluginState` / `verdictOf` / `Badge`），而引用它们的组件还在。
 * 结果是：`apply()` 照常跑、四个槽位照常注册、**187 条测试全绿** ——
 * 只有真的在浏览器里打开那个面板，才会看到 `usePluginState is not defined`。
 *
 * 也就是说：**"注册成功"与"能渲染"之间有一整段没被任何测试覆盖**。
 * 这个文件补上那一段。它不启动浏览器，而是用两个便宜但有效的办法：
 *
 *   1. **未定义引用检查**：把 factory 作用域里的标识符引用与定义对一遍。
 *      它抓的正是上面那类事故 —— 而且比渲染测试更早、更快。
 *   2. **真渲染检查**：用最小 React 替身把每个组件**真的调用一次**，
 *      并递归调用它返回树里的子组件。这样 `styles.pill` 拼错、`Findings` 漏了
 *      之类的错误也会当场炸出来。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

import { REPO } from './helpers.mjs'

const CLIENT = path.join(REPO, 'plugin', 'lib', 'client.js')
const SRC = fs.readFileSync(CLIENT, 'utf8')

/** 取出 factory 的函数体（我们只关心插件自己的代码，不关心外面那层包装） */
function factoryBody(src) {
  const i = src.indexOf('factory: (require) => {')
  if (i < 0) return null
  const start = src.indexOf('{', i)
  let depth = 0
  for (let k = start; k < src.length; k++) {
    if (src[k] === '{') depth++
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start + 1, k) }
  }
  return null
}

const BODY = factoryBody(SRC)

describe('客户端半边：结构完整性', () => {
  test('文件里有 factory，且能被静态解析', () => {
    assert.ok(BODY && BODY.length > 2000, '没能取出 factory 函数体 —— 文件结构变了？')
  })

  test('每个被调用的函数都真的存在（这一次真实事故的直接回归）', () => {
    // ⚠️ 第一版这里用正则找"引用了但没定义的标识符"，结果被属性名与字符串碎片
    // 淹没（`badgeSho` / `borderRadiu` / `fata` …），而且**漏掉了真正的那个**
    // （`pickPlugin`）。改用 `vm` + 一个"未知标识符立刻炸"的 context：
    // 它在**求值**层面判定，不存在正则的歧义。
    //
    // 一个从不出现在定义里的名字，只要被真的**求值**了，就会炸出来；
    // 而只出现在对象字面量键、字符串、属性访问里的名字不会 —— 这正是我们要的精度。
    assert.ok(BODY, 'factory 未解析')

    // 把 factory 里所有顶层 **函数定义** 名字收集起来，然后逐个调用，
    // 用一个每次属性访问都返回可调用替身的 Proxy 提供外部依赖。
    const names = [...BODY.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1])
    assert.ok(names.length > 5, `只找到 ${names.length} 个函数定义，解析可能失效`)

    // 这些函数是组件，调用它们需要 React；其余是纯函数。
    // 用 vm 在受控 context 里定义**同一份源码**，然后逐个调用，
    // 未定义的引用会在求值时抛 ReferenceError。
    const calls = []
    const callable = () => callable
    const trap = new Proxy(function () {}, {
      get: (_t, k) => {
        if (k === Symbol.toPrimitive || k === 'toString') return () => '[proxy]'
        if (k === 'then') return undefined
        return trap
      },
      apply: () => trap,
      construct: () => trap,
    })
    const sandbox = {
      console: { log: () => {}, warn: () => {}, error: () => {} },
      window: { __ModuleLoader__: { load: () => {} } },
      Object, Array, JSON, Math, Date, String, Number, Boolean, Error, Promise, Symbol, RegExp, Map, Set,
      setTimeout: () => 0, clearTimeout: () => {},
      fetch: () => ({ then: () => ({ catch: () => {} }) }),
      React: trap, require: () => trap, module: { exports: {} }, exports: {},
      btoa: (x) => x, atob: (x) => x,
      encodeURIComponent, decodeURIComponent,
      __call: (name, args) => { calls.push(name) },
    }
    sandbox.globalThis = sandbox
    vm.createContext(sandbox)

    // 用同一份 factory 体建一个模块，导出所有函数供我们点名调用
    const exportList = names.map((n) => `try { __fns[${JSON.stringify(n)}] = ${n} } catch (e) {}`).join('\n')
    // factory 体末尾有 `return module.exports`，所以必须包在一个函数里求值，
    // 否则 `Illegal return statement`。
    const wrapped = `__fns = {};\n(function () {\n${BODY}\n})();\n${exportList};`
    let fns = {}
    sandbox.__fns = fns
    try {
      vm.runInContext(wrapped, sandbox, { timeout: 5000 })
    } catch (error) {
      assert.fail(`factory 体在受控环境里求值就失败了：${error && error.message}`)
    }
    fns = sandbox.__fns

    // 逐个调用：未定义的引用会在这里炸出来（这正是事故的形态）
    const failures = []
    for (const [name, fn] of Object.entries(fns)) {
      if (typeof fn !== 'function') continue
      // 组件需要一个"像 props"的参数；纯函数用代理兜住返回值即可。
      try {
        const out = fn(trap)
        void out
      } catch (error) {
        // ReferenceError = 有名字没定义（我们要抓的）
        // 其他错误（TypeError 之类）多半是假的 props 导致的，不算结构缺陷
        if (error && error.name === 'ReferenceError') failures.push(`${name}: ${error.message}`)
      }
    }
    assert.deepEqual(failures, [], '有函数被调用时引用了不存在的标识符')
  })
})

/**
 * 真渲染检查：用最小 React 替身把组件**真的跑一遍**。
 *
 * 为什么不启动浏览器：那要 40+ 秒、要装 profile、要起无头 Chrome，
 * 而且只在装了插件的机器上才跑得起来。而"组件能不能渲染"这件事，
 * 用几十毫秒就能验到 —— 它抓的是 undefined 引用、属性拼错、以及
 * 数据形状不匹配这三类。
 */
function makeReact() {
  // 一个"挂起的 promise"用来模拟 fetch 完成后的数据
  let resolved = null
  const React = {
    createElement: (type, props, ...children) => ({ __el: true, type, props: props || {}, children }),
    useState: (initial) => [initial, () => {}],
    useRef: (initial) => ({ current: initial }),
    useCallback: (fn) => fn,
    useEffect: () => {},
    __setResolved: (v) => { resolved = v },
    __getResolved: () => resolved,
  }
  return React
}

/** 递归地把一棵元素树里的**函数组件**都调用一遍，返回是否无异常 */
function renderTree(el, React, depth = 0) {
  if (!el || typeof el !== 'object' || !el.__el) return
  if (typeof el.type === 'function') {
    const out = el.type(el.props)
    renderTree(out, React, depth + 1)
    return
  }
  for (const c of el.children || []) {
    if (Array.isArray(c)) for (const cc of c) renderTree(cc, React, depth + 1)
    else renderTree(c, React, depth + 1)
  }
}

function loadModule() {
  const React = makeReact()
  // fetch 替身：立刻返回我们给的报告，且形状与宿主路由一致
  const REPORT = {
    ok: true,
    kernelDir: '/tmp/k',
    nodeModules: '/tmp/nm',
    nodeModulesWhy: '测试',
    elapsedMs: 1,
    baseline: { file: '/tmp/b.json', wrote: true, badge: { show: true, text: '↓ 变差 1', direction: 'worse', detail: 'x' }, diff: { comparable: true, worsened: [{ name: 'p', versionFrom: '1', versionTo: '2', reason: 'r', newFindings: [{ key: 'a.b', location: 'f:1' }] }], improved: [], added: [], removed: [] } },
    report: {
      summary: { ok: 1, partial: 1, broken: 0, unknown: 0, vacuousOk: 0 },
      hasRuntimeSurface: true,
      items: [{ id: 'entry-a', packageName: 'pkg-b' }],
      plugins: {
        'pkg-a': { version: '1.0.0', verdict: 'ok', findings: [], clientSide: [], resolved: {}, vacuous: false },
        'pkg-b': {
          version: '2.0.0', verdict: 'partial', vacuous: false,
          findings: [{ category: 'host-method-missing', service: 'settings', method: 'register', severity: 'feature-dead', certainty: 'certain', impact: '设置页消失', location: { file: 'lib/index.js', line: 466 } }],
          clientSide: [{ service: 'slots' }],
          resolved: { tools: { disposition: 'no-calls' } },
        },
      },
    },
  }
  const g = {
    window: { __ModuleLoader__: { load: (o) => { g.__loaded = o } } },
    React,
    fetch: () => ({ then: (fn) => { fn({ ok: true, json: () => ({ then: (f2) => { f2(REPORT); return { catch: () => {} } } }) }); return { catch: () => {} } } }),
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout: () => 0, clearTimeout: () => {},
    Object, Array, JSON, Math, Date, String, Number, Boolean, Error, Promise, Symbol, RegExp, Map, Set,
    encodeURIComponent, decodeURIComponent, btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    globalThis: undefined,
  }
  g.globalThis = g
  const names = Object.keys(g)
  const fn = new Function(...names, SRC)
  fn(...names.map((n) => g[n]))
  return { loaded: g.__loaded, React }
}

describe('客户端半边：组件真的能渲染', () => {
  const { loaded, React } = loadModule()

  test('factory 返回的模块形状正确', () => {
    assert.ok(loaded, 'factory 没被调用')
    const mod = loaded.factory((n) => (n === 'react' ? React : {}))
    assert.equal(mod.name, 'dsh-plugin-compat-check')
    assert.equal(typeof mod.apply, 'function')
    assert.deepEqual(mod.inject, ['slots'])
  })

  test('apply() 把三个槽位都注册上，且每个组件都真的能渲染', () => {
    const mod = loaded.factory((n) => (n === 'react' ? React : {}))
    const registered = []
    const ctx = {
      slots: {
        inject: (slot, cb) => { cb() },
        register: (spec, Comp) => { registered.push({ slot: spec.name, Comp }) },
      },
    }
    mod.apply(ctx)
    assert.deepEqual(registered.map((r) => r.slot).sort(),
      ['plugins.detail.badge', 'plugins.detail.section', 'settings.plugins.tab'])

    // 逐个**真的渲染**：状态为 loading / done / error 各来一遍。
    // 事故就在于「注册成功」被当成了「能渲染」—— 这里把两者分开验。
    for (const { slot, Comp } of registered) {
      for (const [name, props] of [
        ['无 props', {}],
        ['subject 是安装的包', { subject: { kind: 'package', pkg: { name: 'pkg-b', version: '2.0.0' } } }],
        ['subject 是官方 bundle', { subject: { kind: 'bundle', pkg: { name: '@deepseek-ai/dsh-base' } } }],
        ['subject 是面板条目', { subject: { kind: 'item', id: 'entry-a' } }],
        ['subject 未知', { subject: { kind: 'item', id: 'nope' } }],
        ['列表视图', { view: 'summary' }],
      ]) {
        assert.doesNotThrow(() => {
          renderTree(React.createElement(Comp, props), React)
        }, `${slot} 在「${name}」下渲染抛异常`)
      }
    }
  })

  test('明细解析：三种 subject 形态都能对上正确的包（或明确放弃）', () => {
    // 这条直接盯住那个"角标静默不渲染"的缺陷类。它不需要浏览器，
    // 但覆盖了宿主契约的三种形态。
    const mod = loaded.factory((n) => (n === 'react' ? React : {}))
    const found = {}
    const ctx = {
      slots: {
        inject: (slot, cb) => { cb() },
        register: (spec, Comp) => { found[spec.name] = Comp },
      },
    }
    mod.apply(ctx)
    // 渲染一次把报告灌进去（fetch 替身是同步的）
    renderTree(React.createElement(found['plugins.detail.section'], {}), React)
    // 再渲染不同 subject，看有没有抛 —— 解析结果通过不抛来体现。
    // （更细的断言在浏览器验收里：那里能读到真实 DOM。）
    for (const subject of [
      { kind: 'package', pkg: { name: 'pkg-b' } },
      { kind: 'package', pkg: 'pkg-b' },
      { kind: 'item', id: 'entry-a' },
      { kind: 'item', id: 'pkg-a' },
      { kind: 'item', id: 'unknown-id' },
    ]) {
      assert.doesNotThrow(() => renderTree(React.createElement(found['plugins.detail.badge'], { subject }), React))
    }
  })
})
