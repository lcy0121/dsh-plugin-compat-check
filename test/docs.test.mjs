/** Current document structure, links and mechanically reproducible facts. */

import { optionalProfiles } from './support/profile-snapshot.mjs'

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8')

test('文档核验能发现迁移后断开的相对链接，忽略代码块里的演示链接', async () => {
  const mod = await import('../tools/doc-check.mjs')
  assert.equal(typeof mod.checkDocumentLinks, 'function')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-doc-links-'))
  try {
    fs.mkdirSync(path.join(root, 'docs'))
    fs.writeFileSync(path.join(root, 'docs', 'Plan.md'), '# Plan\n')
    fs.writeFileSync(path.join(root, 'README.md'), '[计划](docs/Plan.md)\n```md\n[演示](not-real.md)\n```\n')
    assert.deepEqual(mod.checkDocumentLinks(root, ['README.md']), [])
    fs.writeFileSync(path.join(root,'README.md'),'[标题](docs/Plan.md#plan)\n');
    assert.deepEqual(mod.checkDocumentLinks(root,['README.md']),[]);
    fs.writeFileSync(path.join(root,'README.md'),'[旧标题](docs/Plan.md#removed)\n');
    assert.match(mod.checkDocumentLinks(root,['README.md']).join('\n'),/missing heading/);
    fs.writeFileSync(path.join(root, 'README.md'), '[旧计划](Plan.md)\n')
    assert.match(mod.checkDocumentLinks(root, ['README.md']).join('\n'), /README.md.*Plan.md/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

/** Public entry documents and the maintained docs directory. */
const DOCS = [
  'docs/Plan.md',
  'README.md',
  'README.en.md',
  'README.ko.md',
  'skill/SKILL.md',
  'skill/README.md',
  'plugin/README.md',
  ...fs.readdirSync(path.join(REPO, 'docs')).filter(f=>f.endsWith('.md')).map(f=>`docs/${f}`),
]

function realTestFileCount() {
  return fs.readdirSync(path.join(REPO, 'test'))
    .filter((f) => f.endsWith('.test.mjs')).length
}

describe('文档信息：可复算的数字必须与仓库一致', () => {
  // ⚠️ **不要在这里 spawn 整个测试套件去数条数** —— 子进程会把本文件也再跑一遍，
  // 于是自己调自己、无限递归。实测踩到过（一跑就挂）。
  // 断言条数那一项因此放在 `tools/doc-check.mjs`：那是**独立进程**，
  // 跑一次套件、比一次文档，不在测试内部套娃。

  test('current facts are generated and linked by all maintained entry documents',()=>{
    const metrics=JSON.parse(read('docs/current-state.json'));
    assert.equal(metrics.testFiles,realTestFileCount());
    for(const rel of ['README.md','README.en.md','README.ko.md','docs/Plan.md'])assert.ok(read(rel).includes('docs/current-state.json'),rel);
  });

  test('README 的合成插件数与夹具目录实际一致', () => {
    const real = fs.readdirSync(path.join(REPO, 'test/fixtures/micro/node_modules/@fixture'))
      .filter((d) => fs.statSync(path.join(REPO, 'test/fixtures/micro/node_modules/@fixture', d)).isDirectory())
      .length
    const bad = []
    for (const rel of ['README.md', 'README.en.md', 'README.ko.md', 'docs/Plan.md']) {
      const s = read(rel)
      // ⚠️ 别把「69 个合成插件**文件**」当成「22 个合成插件」。
      // 我自己第一版就这么错了 —— 度量写错会把一条正确的文档判成错的。
      for (const m of s.matchAll(/(\d+)\s*(?:个合成插件|fixture plugins|개 합성 플러그인)(?!\s*(?:文件|files))/g)) {
        if (Number(m[1]) !== real) bad.push(`${rel}: 写了 ${m[1]}，实测 ${real}`)
      }
    }
    assert.deepEqual(bad, [], `合成插件数不符：\n  ${bad.join('\n  ')}`)
  })

  test('public documentation has a compact structure and valid current links', async () => {
    const { checkDocumentLinks } = await import('../tools/doc-check.mjs')
    assert.deepEqual(fs.readdirSync(path.join(REPO, 'docs')).sort(),
      ['Plan.md', 'author-ci.md', 'current-state.json', 'guide.md', 'maintaining.md'])
    assert.deepEqual(checkDocumentLinks(REPO, [...new Set(DOCS)]), [])
    for (const rel of ['docs/Plan.md', 'docs/guide.md', 'docs/maintaining.md']) {
      assert.match(read(rel), /current-state(?:\.json)?/, rel)
    }
    for (const rel of ['README.md', 'README.en.md', 'README.ko.md', 'plugin/README.md']) {
      for (const document of ['Plan.md', 'guide.md', 'maintaining.md']) {
        assert.ok(read(rel).includes(`docs/${document}`), `${rel}: missing ${document} entry`)
      }
      assert.doesNotMatch(read(rel), /docs\/(?:extraction-findings|catalog-governance|real-regression-samples|dependency-security|feature-workflows)\.md/)
    }
  })

  test('current facts and the docs directory stay small enough to review', () => {
    const docsRoot = path.join(REPO, 'docs')
    assert.ok(fs.statSync(path.join(docsRoot, 'current-state.json')).size < 16 * 1024,
      'current-state.json must remain a compact current summary; retain detailed history in Git')
    const bytes = fs.readdirSync(docsRoot)
      .reduce((sum, file) => sum + fs.statSync(path.join(docsRoot, file)).size, 0)
    assert.ok(bytes < 80 * 1024,
      `docs uses ${bytes} bytes; keep public guidance concise and move historical logs to Git`)
  })

  test('docs/Plan.md 里的 §N 交叉引用都能落到真实小节上', () => {
    const s = read('docs/Plan.md')
    const refs = [...new Set([...s.matchAll(/§(\d+(?:\.\d+)*)/g)].map((m) => m[1]))]
    const heads = new Set([
      ...[...s.matchAll(/^#{2,4} (\d+(?:\.\d+)*)\.?/gm)].map((m) => m[1]),
    ])
    // §N 可以指向 §N.M 的父节
    const bad = refs.filter((r) => !heads.has(r)
      && ![...heads].some((h) => h.startsWith(`${r}.`)))
    assert.deepEqual(bad, [],
      `docs/Plan.md 引用了不存在的小节：${bad.join(', ')}（引用腐烂比笔误更难发现）`)
  })

  test('skill/README.md 记的正文长度 = SKILL.md 真实正文长度', () => {
    const raw = read('skill/SKILL.md')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
    assert.ok(fm, 'SKILL.md 没有 frontmatter')
    // 与 plugin/index.js 的 readPackagedSkill() 同一算法：slice + trim
    const real = raw.slice(fm[0].length).trim().length
    const claimed = [...read('skill/README.md').matchAll(/(\d+)\s*字符/g)].map((m) => Number(m[1]))
    assert.ok(claimed.length > 0, 'skill/README.md 里没记字符数 —— 那条说明被删了？')
    const wrong = claimed.filter((n) => n !== real)
    assert.deepEqual(wrong, [],
      `skill/README.md 写着 ${[...new Set(wrong)].join('/')} 字符，实测 ${real}`
      + `（注意别用 lstrip 之类近似 —— 差 1 个字符也是错）`)
  })

  test('三份 README 的旗标清单一致（翻译不该改变事实）', () => {
    // 一版正则只认「`--flag` 后面紧跟反引号」，于是带参数的旗标
    // （`--nm <dir>` / `--probe <json>` / `--dsh-version <v>`）**一个都数不到** ——
    // 实测就这么漏了 5 个。所以这里取「表格行里出现的**全部** `--flag`」。
    const grab = (rel) => {
      const flags = new Set()
      for (const line of read(rel).split('\n')) {
        if (!line.startsWith('| `')) continue
        for (const m of line.matchAll(/`(--[a-z][a-z-]+)/g)) flags.add(m[1])
      }
      return [...flags].sort()
    }
    const zh = grab('README.md')
    assert.ok(zh.length >= 10,
      `README.md 的旗标只数到 ${zh.length} 个（${zh.join(' ')}）—— 应该有两张表（CLI + 编排脚本），`
      + `少于 10 个通常意味着表的书写格式变了、正则没跟上`)
    for (const rel of ['README.en.md', 'README.ko.md']) {
      assert.deepEqual(grab(rel), zh,
        `${rel} 的旗标清单与 README.md 不一致 —— 翻译时漏了一行/多了一行。`
        + `实测发生过：README.md 少了 \`--help\`，而另外两份有。`)
    }
  })


  test('文档推荐的入口命令真的能跑（且不假定目录已存在）', () => {
    // 这一条是**实跑换来的**：文档把 `node lib/extract.mjs <nm> <输出目录>` 当推荐用法写着，
    // 而它当时**不建输出目录** —— 第一次跑就是 ENOENT 崩掉。
    // 文档里的命令是最容易腐烂、也最伤人的一类：读者照着敲，敲完就怀疑是自己错了。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-docs-'))
    try {
      // ① 两个入口的 --help 都必须 exit 0（帮助信息本身不该"失败"）
      for (const args of [['bin/compat-check.mjs', '--help']]) {
        const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8' })
        assert.equal(r.status, 0, `${args.join(' ')} 没能 exit 0（exit=${r.status}）\n${r.stderr}`)
      }
      const sh = spawnSync('bash', ['dsh-plugin-compat-check.sh', '--help'], { cwd: REPO, encoding: 'utf8' })
      assert.equal(sh.status, 0, `dsh-plugin-compat-check.sh --help 没能 exit 0（exit=${sh.status}）`)

      // ② `lib/extract.mjs` 必须自己建输出目录 —— 文档就是这么教的
      const nm = optionalProfiles()[0]?.nm ?? path.join(REPO, 'test/fixtures/micro/node_modules')
      const out = path.join(tmp, 'a', 'b', 'c')   // **多层且不存在**
      const r = spawnSync(process.execPath, ['lib/extract.mjs', nm, out], { cwd: REPO, encoding: 'utf8' })
      assert.equal(r.status, 0, `node lib/extract.mjs 失败了（exit=${r.status}）\n${r.stderr.slice(0, 400)}`)
      assert.ok(fs.existsSync(path.join(out, 'static.json')),
        '没写出 static.json —— 输出目录还是没被建？')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('维护中的信息文档都存在', () => {
    for (const rel of DOCS) {
      assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} 不见了`)
    }
  })
})

test('version facts reject missing, future or stale author defaults without banning examples', async t => {
  const {checkDocumentVersions} = await import('../tools/doc-check.mjs');
  assert.equal(typeof checkDocumentVersions, 'function');
  assert.deepEqual(checkDocumentVersions(REPO), []);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-doc-versions-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const files = ['README.md','README.en.md','README.ko.md','plugin/README.md','docs/Plan.md','docs/guide.md','docs/author-ci.md','docs/current-state.json','skill/SKILL.md','examples/author-ci.yml'];
  for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.copyFileSync(path.join(REPO,file),path.join(root,file));}
  fs.appendFileSync(path.join(root,'docs/guide.md'),'\n未认证示例：0.3.0-rc.1\n');
  assert.deepEqual(checkDocumentVersions(root),[]);
  for(const file of files.filter(f=>!f.endsWith('.json'))){
    const original=fs.readFileSync(path.join(root,file),'utf8');
    for(const bad of ['0.2.1-rc.4','0.2.1-rc.2']){
      fs.writeFileSync(path.join(root,file),original.replaceAll('0.2.1-rc.3',bad));
      assert.ok(checkDocumentVersions(root).some(x=>x.startsWith(file+':')),file+': '+bad);
    }
    fs.writeFileSync(path.join(root,file),original);
  }
  const plan=fs.readFileSync(path.join(root,'docs/Plan.md'),'utf8');
  fs.writeFileSync(path.join(root,'docs/Plan.md'),plan.replace(/默认矩阵包含[^。]+。/,'默认上述两版。'));
  assert.ok(checkDocumentVersions(root).some(x=>/Plan.*author default/.test(x)));
  fs.writeFileSync(path.join(root,'docs/Plan.md'),plan);
  const state=JSON.parse(fs.readFileSync(path.join(root,'docs/current-state.json'),'utf8'));
  state.verification.catalogueScope.certifiedExactVersions.pop();
  fs.writeFileSync(path.join(root,'docs/current-state.json'),JSON.stringify(state));
  assert.ok(checkDocumentVersions(root).some(x=>x.startsWith('docs/current-state.json:')));
});

test('current-state generator counts all fixture forms and refuses incomplete or failed test summaries', async () => {
  const {repositoryCounts,successfulTestCount} = await import('../tools/update-current-state.mjs');
  assert.equal(typeof repositoryCounts,'function');
  assert.deepEqual(repositoryCounts(['README.md','test/fixtures/static-batch.json','test/fixtures/labels/demo/cordis.patch.yml','test/support/helper.mjs']),{total:4,fixtures:2,other:2});
  assert.equal(successfulTestCount('# tests 1121\n# fail 0\n'),1121);
  assert.equal(successfulTestCount('ℹ tests 1121\nℹ fail 0\n'),1121);
  for(const log of ['# tests 4\n# fail 1\n','# tests 4\n',''])assert.throws(()=>successfulTestCount(log),/missing or failing/);
});
