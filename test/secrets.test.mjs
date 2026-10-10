/**
 * 守卫：**仓库里不许出现凭据**。
 *
 * ## 这是一次真实事故的回归
 *
 * `probe/index.mjs` 的 `dumpShape` 曾经除了枚举方法名，还会收集一份 `data`：
 * 把所有非函数属性的**字面值**原样写进探针报告。于是 `credentials` 服务的
 * `text` 属性 —— 就是**整份凭据文件**，含 `DEEPSEEK_API_KEY` 与若干 session
 * token —— 被写进了 `tools/parity/fixtures/host-surface-parityfix.json` 并提交。
 *
 * 三个让这件事特别难看的细节：
 *
 * 1. **那份 `data` 从来没被任何消费方读过**（`lib/verdict.mjs` 只取 `methods`）。
 *    也就是说，纯粹为了一个没人用的字段，把用户的密钥写进了 git 历史。
 * 2. 它**不是一次性的**：每次跑探针都会重新生成一份。也就是说只要不修根因，
 *    这事会**持续复发**。
 * 3. 它**通过了全部 200+ 条测试**。没有一条测试问过"我们提交的文件里有没有密钥"。
 *
 * 所以这个文件做两件事：**扫凭据**，以及**盯着探针不许再 dump 值**。
 *
 * ## 扫描器自己的一个陷阱
 *
 * 这个测试文件本身要出现"像密钥的串"才能描述要检测的模式。如果直接写字面量，
 * 扫描器会扫到它自己。办法是把哨兵**拼**出来，这样文件里不存在可被匹配的完整串
 * —— 下面 `fake()` 就是这个用途，别把它"简化"掉。
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { REPO } from './helpers.mjs'

/** 拼一个**假**密钥，给扫描器当夹具用（见文件头注释：不要改回字面量）。 */
const fake = (...parts) => parts.join('')

/** 这些模式命中即失败。`sk-` 那一类是最要命的（可直接使用的账号密钥）。 */
const FORBIDDEN = [
  // DeepSeek / OpenAI 风格的账号密钥。
  //
  // 这里刻意**要求 32 位以上且不含省略号** —— 第一版写成 `sk-\S{8,}` 之类，
  // 结果把文档注释里的占位写法 `sk-…` 也报了（假阳性）。
  // 守卫的假阳性不是小事：一个爱乱报警的守卫会被人学会忽略，那它就不再是守卫。
  // 反过来也不能太紧 —— 下面"扫描器本身有效"那条用一个 40 位的假密钥确认它还抓得到。
  new RegExp(fake('s', 'k-', '(?![\u2026.]{1,3}$)[A-Za-z0-9]{32,}')),
  // 凭据文件里的引用名 + 冒号/等号 + **看起来是真的值**。
  //
  // 这里要求"值"至少 16 位十六进制/连字符 —— 而不是"任意非空白字符"。
  // 原因同上：文档里写 `DEEPSEEK_API_KEY=sk-…`（描述形态）是**正确**写法，
  // 而真实的 DeepSeek key 是 `sk-` + 32 位十六进制，必然满足下面这条。
  // 用 `\S` 会把"提到这个变量名"也报成泄漏 —— 那种守卫会被忽略。
  new RegExp(fake('DEEPSEEK_API_KEY', '\\s*[:=]\\s*[A-Za-z0-9_-]{16,}')),
  // 私钥
  new RegExp(fake('BEGIN ', '[A-Z ]*', 'PRIVATE KEY')),
  // 我们这次实际发生过的：grant 里的 secret / token
  new RegExp(fake('secret', ':\\s*[A-Za-z0-9+/]{24,}')),
  new RegExp(fake('\\btoken', ':\\s*[A-Za-z0-9+/]{32,}')),
]

/** 不扫的目录：版本库内部、依赖、以及本文件（它按定义含着模式串）。 */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage', '.pnpm'])
const SELF = path.basename(new URL(import.meta.url).pathname)

function walk(dir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.isFile()) out.push(p)
  }
  return out
}

/** 返回命中的 `路径: 模式` 列表 */
function scanForCredentials(root) {
  const hits = []
  for (const file of walk(root)) {
    if (path.basename(file) === SELF) continue
    let text
    try {
      // 二进制（含 asar 片段）直接跳过：它是二进制就说明不是我们能审的文本
      const buf = fs.readFileSync(file)
      if (buf.includes(0)) continue
      text = buf.toString('utf8')
    } catch {
      continue
    }
    for (const re of FORBIDDEN) {
      if (re.test(text)) hits.push(`${path.relative(root, file)} → ${re.source}`)
    }
  }
  return hits
}

describe('安全：仓库里不许出现凭据', () => {
  test('工作区里没有任何凭据形态的串', () => {
    const hits = scanForCredentials(REPO)
    assert.deepEqual(hits, [],
      `发现疑似凭据：\n  ${hits.join('\n  ')}\n`
      + '如果这是测试夹具，请改成"拼"出哨兵（见本文件头的 fake()）。')
  })

  test('占位写法（sk-… / sk-xxx）不该被报 —— 守卫的假阳性会让人学会忽略它', () => {
    // 这是实测踩到的：文档注释里写 `sk-…` 是**正确**的写法（描述形态而不复现凭据），
    // 但第一版扫描器把它当密钥报了。一个爱乱报警的守卫最后一定会被忽略。
    const dir = fs.mkdtempSync(path.join('/tmp', 'dsc-placeholder-'))
    try {
      for (const [name, body] of [
        ['ellipsis.md', '形如 ' + fake('s', 'k-') + '\u2026 的就是账号密钥'],
        ['dot.md', '形如 ' + fake('s', 'k-') + '... 的就是账号密钥'],
        ['short.md', fake('DEEPSEEK_API_KEY') + ' 那一条（不写出值）'],
      ]) fs.writeFileSync(path.join(dir, name), body)
      assert.deepEqual(scanForCredentials(dir), [],
        '占位/描述性写法被误报成凭据了')
    } finally { fs.rmSync(dir, { recursive: true, force: true }) }
  })

  test('扫描器本身有效（否则上面那条是空过）', () => {
    // 「没扫到」在"扫描器根本不工作"时也成立。所以造一个真命中，确认它抓得到。
    const dir = fs.mkdtempSync(path.join('/tmp', 'dsc-secret-probe-'))
    try {
      fs.writeFileSync(path.join(dir, 'leak.json'),
        JSON.stringify({ text: fake('DEEPSEEK_API_KEY', ': ', 'sk-', 'a'.repeat(40)) }))
      const hits = scanForCredentials(dir)
      assert.ok(hits.length >= 1, '扫描器漏掉了一个明显的密钥 —— 它与没扫没有区别')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
    // 反过来：干净目录不该有命中（避免"永远报警"那种假守卫）
    const clean = fs.mkdtempSync(path.join('/tmp', 'dsc-clean-probe-'))
    try {
      fs.writeFileSync(path.join(clean, 'ok.json'), JSON.stringify({ methods: { a: 'function' } }))
      assert.deepEqual(scanForCredentials(clean), [])
    } finally {
      fs.rmSync(clean, { recursive: true, force: true })
    }
  })

  test('探针只记录结构，**绝不记录属性值**', () => {
    // 根因守卫。上面那条"仓库里没有密钥"是结果；这条盯的是**产生泄漏的那个机制**。
    const src = fs.readFileSync(path.join(REPO, 'probe', 'index.mjs'), 'utf8')
    // 取 dumpShape 的函数体
    const i = src.indexOf('function dumpShape(')
    assert.ok(i > 0, '找不到 dumpShape')
    let depth = 0, j = src.indexOf('{', i)
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') depth++
      else if (src[k] === '}') { depth--; if (depth === 0) { j = k + 1; break } }
    }
    const body = src.slice(i, j)
    // 不许出现任何"把值存进结果"的写法
    for (const bad of ['data[key]', 'data[']) {
      assert.ok(!body.includes(bad),
        `dumpShape 里又出现 ${bad} —— 这会把服务内部状态（可能是凭据）搬进报告`)
    }
    assert.ok(!/\bdata\b\s*[:=]\s*\{\}/.test(body), 'dumpShape 里又建了 data 容器')
    // 而且必须真的还在工作（不能靠"什么都不做"通过）
    assert.match(body, /methods\[key\]\s*=/, 'dumpShape 不再记录方法名了 —— 那是它的正职')
  })

  test('提交进来的探针报告里不带 data 字段', () => {
    const p = path.join(REPO, 'tools', 'parity', 'fixtures', 'host-surface-parityfix.json')
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    const offenders = Object.entries(d.root || {})
      .filter(([, v]) => v && typeof v === 'object' && 'data' in v)
      .map(([k]) => k)
    assert.deepEqual(offenders, [], `这些服务仍带 data 字段：${offenders.join(', ')}`)
    // methods 必须还在 —— 判定全靠它
    assert.ok(Object.keys(d.root || {}).length > 0, '报告里没有服务了')
    assert.ok(Object.values(d.root).some((v) => v.methods && Object.keys(v.methods).length),
      '没有任何方法名 —— 这个报告已经没用了')
  })
})
