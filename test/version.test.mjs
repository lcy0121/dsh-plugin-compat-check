/** Version consistency across the kernel, distributed plugin, active probe and reports. */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOOL_VERSION, versionLine } from '../lib/version.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')
const readJSON = (rel) => JSON.parse(read(rel))

describe('单版本：一处真源，多处出现，全部钉住', () => {
  test('真源本身是一个合法的语义化版本', () => {
    assert.match(TOOL_VERSION, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
      `TOOL_VERSION 不是合法 semver: ${TOOL_VERSION}`)
    assert.equal(versionLine(), `dsh-plugin-compat-check ${TOOL_VERSION}`)
  })

  test('每个 package.json 的 version 都等于真源', () => {
    // 任何一处漏改，这里会直接告诉你改哪个文件的哪个字段。
    const pkgs = ['plugin/package.json', 'probe/package.json']
    const bad = []
    for (const rel of pkgs) {
      const v = readJSON(rel).version
      if (v !== TOOL_VERSION) bad.push(`${rel}: ${v}（应为 ${TOOL_VERSION}）`)
    }
    assert.deepEqual(bad, [],
      `这些 package.json 的版本与 lib/version.mjs 不一致：\n  ${bad.join('\n  ')}\n`
      + `改 lib/version.mjs 时必须同时改它们 —— 否则同一次发布里两个产物报不同版本。`)
  })

  test('CLI 的 --version 报真源，且不需要 --nm（也不碰任何状态）', () => {
    const r = spawnSync(process.execPath, ['bin/compat-check.mjs', '--version'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0, `--version 应当 exit 0，实际 ${r.status}\n${r.stderr}`)
    assert.equal(r.stdout.trim(), versionLine())
  })

  test('CLI 的 --help 顶部也带版本（求助的人第一眼就该知道是哪一版）', () => {
    const r = spawnSync(process.execPath, ['bin/compat-check.mjs', '--help'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0)
    assert.ok(r.stdout.includes(versionLine()), '--help 里看不到版本行')
  })

  test('报告 JSON 的 toolVersion = 真源（成功路径与出错路径都要有）', () => {
    const run = (args) => {
      const r = spawnSync(process.execPath, ['bin/compat-check.mjs', ...args],
        { cwd: REPO, encoding: 'utf8' })
      // 退出码不是 0 也正常（micro fixture 里有不兼容的包），只要有 JSON
      return JSON.parse(r.stdout)
    }
    const ok = run(['--nm', 'test/fixtures/micro/node_modules',
      '--probe', 'test/fixtures/micro/host-surface.json', '--no-baseline', '--json'])
    assert.equal(ok.toolVersion, TOOL_VERSION, '成功路径的报告里没有正确的 toolVersion')
    // `dshVersion` 是**被体检的对象**的版本，与 toolVersion 是两件事 ——
    // 混为一谈会让"工具版本"永远查不出来。
    assert.notEqual(ok.toolVersion, ok.dshVersion, 'toolVersion 不该等于 dshVersion')

    const bad = run(['--nm', '/nonexistent-path-for-version-test', '--no-baseline', '--json'])
    assert.ok(bad.error, '这条断言需要一个出错路径，输入变了就跟着改')
    assert.equal(bad.toolVersion, TOOL_VERSION,
      '出错路径的报告里也要有 toolVersion —— 用户拿一份 error 来问的时候，'
      + '"哪一版工具没跑成"同样是他要的第一个信息')
  })

  test('编排脚本的 --version 也报同一个版本（且不需要内核在跑）', () => {
    const r = spawnSync('bash', ['dsh-plugin-compat-check.sh', '--version'],
      { cwd: REPO, encoding: 'utf8' })
    assert.equal(r.status, 0, `--version 应当 exit 0，实际 ${r.status}\n${r.stderr}`)
    assert.ok(r.stdout.includes(TOOL_VERSION),
      `编排脚本报的版本里没有 ${TOOL_VERSION}：${JSON.stringify(r.stdout)}`)
  })

  test('没有内核时脚本说"版本未知"，而不是猜一个数', () => {
    // 一份**错的**可追溯信息比"不知道"更糟：用户会拿它去比对、
    // 会以为"我用的就是 0.1.0"，然后按那个版本的已知问题去排查一个不存在的 bug。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-ver-'))
    try {
      fs.copyFileSync(path.join(REPO, 'dsh-plugin-compat-check.sh'),
        path.join(tmp, 'dsh-plugin-compat-check.sh'))
      const r = spawnSync('bash', [path.join(tmp, 'dsh-plugin-compat-check.sh'), '--version'],
        { cwd: tmp, encoding: 'utf8' })
      assert.equal(r.status, 0, '报版本不该因为找不到内核而失败')
      assert.ok(!/\b\d+\.\d+\.\d+\b/.test(r.stdout),
        `没有内核时**不能**报出一个版本号（那会是无中生有）：${JSON.stringify(r.stdout)}`)
      assert.ok(r.stdout.includes('版本未知'), `应当明说版本未知：${JSON.stringify(r.stdout)}`)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('prepack 会带上 version.mjs（否则装好的包报不出自己的版本）', () => {
    const script = read('plugin/scripts/stage-kernel.mjs')
    assert.match(script, /version\.mjs/,
      'stage-kernel.mjs 的 KERNEL_LIBS 里没有 version.mjs —— '
      + '打出来的自足包装上去之后 `--version` 会失败或报错版本')
    // 也确认它真的在现成内核里
    assert.ok(fs.existsSync(path.join(REPO, 'lib/version.mjs')))
  })
})

/**
 * 面板是本插件的**主要入口**（用户主要在设置页里看结论）。
 * 它的报告里也必须带版本 —— 否则"面板说部分可用"这条结论同样无法追溯，
 * 而追溯正是这个版本字段存在的全部理由。
 *
 * 不给浏览器：这里用假 ctx 驱动 `apply()`，抓住面板路由再真调一次。
 * 与 `host-structure.test.mjs` 同一手法（那一层已经证明过它抓得住真事故）。
 */
describe('面板报告也带版本', () => {
  test('面板 payload 的 toolVersion = 真源', async () => {
    const mod = await import(new URL('../plugin/index.js', import.meta.url).href)
    let route = null
    const ctx = {
      get: name => name === "connection" ? {requestRejection:()=>undefined} : undefined,
      inject: (deps, cb) => cb({
        webServer: { register: (r) => { if(r.path==='/plugin-compat-check/report')route = r } },
        tools: null, agents: null, skills: null,
      }),
      effect: () => {},
      logger: { info: () => {}, warn: () => {} },
    }
    mod.apply(ctx)
    await new Promise((r) => setTimeout(r, 600))
    assert.ok(route, '面板路由没注册 —— 这条断言要跟着改')

    let body = ''
    await route.handler(
      { method: 'GET', headers: { 'x-dsh-compat-request':'1', host: '127.0.0.1:1' }, url: '/plugin-compat-check/report' },
      { writeHead: () => {}, setHeader: () => {}, end: (s) => { body = s } },
    )
    const payload = JSON.parse(body)
    assert.equal(payload.toolVersion, TOOL_VERSION,
      '面板报告里没有正确的 toolVersion —— 用户从界面上看到的结论就无法追溯了')
  })
})
