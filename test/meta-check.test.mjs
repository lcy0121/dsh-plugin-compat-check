/** Offline metadata rule regressions, including historical false product claims. */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { GITHUB_RULES, NPM_RULES, runRules, repoSlug } from '../tools/meta-check.mjs'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'plugin', 'package.json'), 'utf8'))
const local = { ...pkg, readme: fs.readFileSync(path.join(REPO, 'plugin', 'README.md'), 'utf8') }

/** 一个"全对"的 GitHub 元数据，逐条测试时只改需要改的那个字段 */
const goodGh = {
  description: '体检你已装的 DSH 插件与当前 DSH 版本是否兼容 / Check your installed DSH plugins',
  topics: ['dsh', 'deepseek-harness', 'compatibility', 'dsh-plugin'],
  homepage: 'https://www.npmjs.com/package/dsh-plugin-compat-check',
  license: 'MIT',
}

const ids = (problems) => problems.map((p) => p.id)

describe('规则会把真出过的那类错抓出来', () => {
  test('⚠️ 当时挂在首页上的那份简介（「在安装前」）必须被抓到', () => {
    // 这是**真实历史文本**（2026-10-12 之前的 GitHub 简介）。它当时挂了很久，
    // 而此前几轮文档核查一次都没扫到 —— 因为检查范围只在仓库内的 7 份文件里。
    const realBad = {
      ...goodGh,
      description: '在安装前判断一个 DSH 插件在你这一版 DeepSeek Harness 上是否真的可用 / '
        + 'Check whether a DeepSeek Harness plugin actually works on your version, before installing it',
    }
    const problems = runRules(GITHUB_RULES, realBad, local)
    assert.ok(ids(problems).includes('gh.no-preinstall-claim'),
      `这份简介必须被拦住。实际报出：${JSON.stringify(ids(problems))}`)
  })

  test('但**归给 CLI** 时允许出现「预检」—— 那是真能力', () => {
    // 脚本确实能对未安装的插件做预检（装进一次性 profile 验，不碰用户的 profile）。
    // 规则不能把真能力一起禁掉，否则就是在逼文案撒谎。
    const ok = { ...goodGh, description: '体检你已装的插件；CLI 形态也可预检尚未安装的插件（pre-install check）' }
    assert.ok(!ids(runRules(GITHUB_RULES, ok, local)).includes('gh.no-preinstall-claim'))
  })

  test('简介不提「已装」也要报 —— 那是说错了对象', () => {
    const bad = { ...goodGh, description: '检查 DSH 插件的兼容性 / Check DSH plugin compatibility' }
    assert.ok(ids(runRules(GITHUB_RULES, bad, local)).includes('gh.mentions-installed'))
  })
})

describe('GitHub 规则逐条', () => {
  const cases = [
    ['gh.has-topic', { topics: ['dsh', 'plugin'] }, '缺 deepseek-harness 与 compatibility'],
    ['gh.no-redundant-topics', { topics: [...goodGh.topics, 'plugin'] }, 'plugin 与 dsh-plugin 重复'],
    ['gh.homepage-set', { homepage: '' }, '主页为空'],
    ['gh.license-matches', { license: 'Apache-2.0' }, '许可与 package.json 不一致'],
    ['gh.license-matches', { license: '' }, 'GitHub 上没识别出许可证'],
  ]
  for (const [id, patch, what] of cases) {
    test(`${id} —— ${what}`, () => {
      const problems = runRules(GITHUB_RULES, { ...goodGh, ...patch }, local)
      assert.ok(ids(problems).includes(id), `应报 ${id}，实际 ${JSON.stringify(ids(problems))}`)
    })
  }

  test('全对的数据必须一条都不报（否则规则是噪音源）', () => {
    assert.deepEqual(runRules(GITHUB_RULES, goodGh, local), [])
  })
})

describe('npm 规则逐条 —— 重点是**两个方向严重度不同**', () => {
  const goodNpm = {
    version: pkg.version,
    description: pkg.description,
    keywords: pkg.keywords,
    repository: pkg.repository,
  }

  test('全对的数据一条不报', () => {
    assert.deepEqual(runRules(NPM_RULES, goodNpm, local, {}), [])
  })

  test('npm 版本高于本地检出 → error', () => {
    const p = runRules(NPM_RULES, { ...goodNpm, version: '99.0.0' }, local, {})
    const hit = p.find((x) => x.id === 'npm.version-matches')
    assert.ok(hit, '该报版本不一致')
    assert.equal(hit.severity, 'error')
  })

  test('本地候选版本高于 npm 已发布版本 → notice，不要求为消除漂移而发布', () => {
    const p = runRules(NPM_RULES, { ...goodNpm, version: '0.1.0' }, { ...local, version: '0.1.1' }, {})
    assert.equal(p.find(x => x.id === 'npm.version-matches')?.severity, 'notice')
    const ahead = runRules(NPM_RULES, { ...goodNpm, version: '0.2.0' }, { ...local, version: '0.1.1' }, {})
    assert.equal(ahead.find(x => x.id === 'npm.version-matches')?.severity, 'error')
  })

  test('⚠️ 本地多出来的 keywords = **notice**（npm 的 tarball 不可变，这是预期的）', () => {
    const p = runRules(NPM_RULES, { ...goodNpm, keywords: ['dsh'] }, local, {})
    const hit = p.find((x) => x.id === 'npm.keywords-synced')
    assert.ok(hit, '该报 keywords 未同步')
    assert.equal(hit.severity, 'notice',
      '本地新增是预期内的 —— 报成 error 会让这个守卫在两次发布之间天天红，然后被忽略')
  })

  test('⚠️ npm 上有而本地没有的 keywords = **error**（线上有仓库里找不到出处的东西）', () => {
    const p = runRules(NPM_RULES, { ...goodNpm, keywords: [...pkg.keywords, 'ghost-keyword'] }, local, {})
    const hit = p.find((x) => x.id === 'npm.keywords-synced')
    assert.ok(hit, '该报 keywords 不一致')
    assert.equal(hit.severity, 'error', '这个方向是真的错：仓库里没有那个关键词的出处')
  })

  test('仓库地址指向别处 → error；写法差异（git+ / .git / git@）不算不一致', () => {
    assert.ok(ids(runRules(NPM_RULES, { ...goodNpm, repository: { url: 'git+https://github.com/other/repo.git' } }, local, {}))
      .includes('npm.repository-points-here'))
    const sshForm = { ...goodNpm, repository: { url: 'git@github.com:lcy0121/dsh-plugin-compat-check.git' } }
    assert.ok(!ids(runRules(NPM_RULES, sshForm, local, {})).includes('npm.repository-points-here'),
      'git@ 与 https 是同一个仓库，不该报')
  })

  test('npm 页面 README 与本地不一致 = **notice**（改了没发是常态）', () => {
    const p = runRules(NPM_RULES, goodNpm, local, { npmReadme: '# 完全不同的正文' })
    const hit = p.find((x) => x.id === 'npm.readme-is-current')
    assert.ok(hit)
    assert.equal(hit.severity, 'notice')
  })

  test('取不到 npm 的 README 时不判（不许把"没取到"当成"不一致"）', () => {
    assert.ok(!ids(runRules(NPM_RULES, goodNpm, local, { npmReadme: null }))
      .includes('npm.readme-is-current'))
  })
})

describe('仓库 slug 从 package.json 解析，不硬编码', () => {
  test('https / git+https / git@ 三种写法都认得', () => {
    const cases = [
      ['git+https://github.com/lcy0121/dsh-plugin-compat-check.git', 'lcy0121/dsh-plugin-compat-check'],
      ['https://github.com/a/b', 'a/b'],
      ['git@github.com:a/b.git', 'a/b'],
    ]
    for (const [url, want] of cases) {
      assert.equal(repoSlug({ repository: { url } }), want, url)
    }
  })

  test('不是 GitHub 就返回 null（工具会跳过 GitHub 侧而不是乱报）', () => {
    assert.equal(repoSlug({ repository: { url: 'https://gitlab.com/a/b' } }), null)
  })
})

describe('规则表自身的约束', () => {
  test('每条规则都必须写 id / why / check —— why 是"凭什么"的出处', () => {
    for (const r of [...GITHUB_RULES, ...NPM_RULES]) {
      assert.ok(r.id, '规则缺 id')
      assert.ok(r.why && r.why.length > 20, `${r.id} 的 why 太短 —— 它必须指向文档出处`)
      assert.equal(typeof r.check, 'function', `${r.id} 缺 check`)
    }
  })
})
