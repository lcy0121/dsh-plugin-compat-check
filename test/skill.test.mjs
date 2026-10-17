/**
 * skill 产物（E1/E2）的测试。
 *
 * ## 这一层要防的是"文档漂移"
 *
 * skill 的全部作用是**教 agent 怎么用这个工具**。所以它最危险的失效模式不是写错字，
 * 而是：它让 agent 去跑一个不存在的旗标、或按一个不存在的退出码做判断。
 * 那种 skill 比没有 skill 更糟 —— 它会让 agent 自信地做错事。
 *
 * 所以这里**不检查文字**，检查的是"skill 说的每件事，工具真的做得到吗"：
 *   - 它提到的每个旗标，CLI 的 `--help` 里必须有；
 *   - 它写的每个退出码，CLI 必须真的会返回；
 *   - frontmatter 必须是**当前有效**的（旧键会让整条 frontmatter 被丢弃，
 *     而那是**静默**失效：文件在那里，skill 却不存在）。
 */

import { optionalProfiles } from './support/profile-snapshot.mjs'

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { REPO } from './helpers.mjs'

const SKILL = path.join(REPO, 'skill', 'SKILL.md')
const SKILL_README = path.join(REPO, 'skill', 'README.md')
const CLI = path.join(REPO, 'bin', 'compat-check.mjs')
const SCRIPT = path.join(REPO, 'dsh-plugin-compat-check.sh')
const MICRO = path.join(REPO, 'test/fixtures/micro/node_modules')
const MICRO_SURFACE = path.join(REPO, 'test/fixtures/micro/host-surface.json')

const readSkill = () => fs.readFileSync(SKILL, 'utf8')

/** 解析 frontmatter。返回 null 表示**没有可用的 frontmatter** —— 而那就是"skill 不存在"。 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)
  if (m === null) return null
  const field = (key) => {
    const mm = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(m[1])
    return mm === null ? null : mm[1].trim().replace(/^["']|["']$/g, '')
  }
  return { raw: m[1], name: field('name'), description: field('description'), body: text.slice(m[0].length).trim() }
}

const runCLI = (args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 120000 })
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
}

describe('skill：frontmatter 必须真的有效（否则 skill 静默不存在）', () => {
  test('SKILL.md 存在，frontmatter 能被解析', () => {
    assert.ok(fs.existsSync(SKILL), `skill 文件不存在: ${SKILL}`)
    const fm = frontmatter(readSkill())
    assert.ok(fm !== null, '没有 frontmatter —— DSH 会把这份文件整个忽略')
    assert.ok(fm.name, '缺 name')
    assert.ok(fm.description, '缺 description')
  })

  test('name 必须是 kebab-case（实测：不合法会让整条候选作废）', () => {
    const fm = frontmatter(readSkill())
    // 这条正则是从运行时源码里读出来的（@deepseek-ai/dsh-skill 的 SKILL_NAME）。
    // 不是照抄格式偏好：不匹配时 registerProvider 会直接抛。
    assert.match(fm.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `name 不是 kebab-case: ${fm.name}`)
  })

  test('description 必须够长且描述「什么时候用」（它决定 agent 会不会加载这个 skill）', () => {
    const fm = frontmatter(readSkill())
    assert.ok(fm.description.length > 80, `description 太短（${fm.description.length}），不足以让 agent 判断何时加载`)
    // 触发词：用户实际会说的话。没有它们，agent 永远不会想到加载这个 skill。
    const triggers = [/不工作|不兼容|兼容/, /更新|升级/, /消失|不见了|没有反应|不响应/]
    const hit = triggers.filter((re) => re.test(fm.description)).length
    assert.ok(hit >= 2, `description 里的触发场景太少（命中 ${hit}/3）—— agent 不会想到用它`)
  })

  test('正文不能是空的（frontmatter 之外要有真内容）', () => {
    const fm = frontmatter(readSkill())
    assert.ok(fm.body.length > 500, `正文只有 ${fm.body.length} 字，教不会 agent 怎么用`)
  })

  test('不得使用已知会让 frontmatter 被整条丢弃的旧键', () => {
    const fm = frontmatter(readSkill())
    // 实测（skill/README.md）：写旧键 → 整条 frontmatter 被丢弃 → 文件被忽略，
    // 而且**没有报错**。所以这里必须拦住它。
    const LEGACY = ['disableModelInvocation', 'disable_model_invocation', 'enabled', 'autoInvoke']
    for (const key of LEGACY) {
      assert.ok(!new RegExp(`^${key}\\s*:`, 'm').test(fm.raw), `用了旧键 ${key} —— 会让整条 frontmatter 被丢弃`)
    }
  })

  test('name 与仓库名一致（它是 skill 的身份，也是 --install-skill 的落点）', () => {
    // 目录叫 `skill/` 是仓库的组织方式，落点由 frontmatter 的 `name` 决定 ——
    // 所以这里断言 name 与包名一致，而不是与目录名一致（早先写错过一次）。
    // 落点是否真的用了 name，由下面 E2 的实跑断言保证。
    const fm = frontmatter(readSkill())
    assert.equal(fm.name, 'dsh-plugin-compat-check')
  })
})

describe('skill：它说的每件事，工具都真的做得到', () => {
  const help = runCLI(['--help']).out

  test('skill 提到的每个 CLI 旗标都存在于 CLI 的 --help', () => {
    const fm = frontmatter(readSkill())
    const mentioned = new Set([...fm.body.matchAll(/--[a-z][a-z-]+/g)].map((m) => m[0]))
    assert.ok(mentioned.size > 0, 'skill 里一个旗标都没提 —— 那它没法教 agent 怎么跑')
    // 只检查**属于 CLI 的**旗标：`--keep` / `--timeout` 是编排脚本的旗标，
    // 在 CLI 的 help 里找不到它们是正确的，不是文档漂移。
    const SCRIPT_ONLY = new Set(['--keep', '--timeout', '--install-skill', '--force', '--ignore-scripts'])
    const cliFlags = [...mentioned].filter((f) => !SCRIPT_ONLY.has(f))
    const missing = cliFlags.filter((flag) => !help.includes(flag))
    assert.deepEqual(missing, [], `skill 提到了 CLI 不认识的旗标：${missing.join(', ')}（文档漂移）`)
  })

  test('skill 提到的退出码与 CLI 的真实行为一致', () => {
    // 退出码是 CI 与 agent 做判断的依据。文档说错一个数，就会让 agent 把
    // "工具没跑成"读成"插件不兼容"。
    const fm = frontmatter(readSkill())
    const text = fm.body
    // micro fixture 里**有**不兼容的包，所以它拿不到 0。要验 0 得用一个干净的输入。
    const cleanNm = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-clean-nm-'))
    try {
      const pkg = path.join(cleanNm, 'clean-pkg')
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({
        name: 'clean-pkg', version: '1.0.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
      }))
      fs.writeFileSync(path.join(pkg, 'cordis.patch.yml'), '- name: ./index.js\n')
      // 只调用运行时面里确实有的方法 → 应当"可用"
      fs.writeFileSync(path.join(pkg, 'index.js'),
        "export const inject = ['tools']\n"
        + "export function apply(ctx) { ctx.tools.register({ name: 'x' }) }\n")
      const surface = path.join(cleanNm, 'surface.json')
      fs.writeFileSync(surface, JSON.stringify({ root: { tools: { present: true, methods: { register: {} } } } }))

      const rOk = runCLI(['--nm', cleanNm, '--probe', surface, '--dsh-version', '0.2.0-rc.2', '--no-baseline', '--quiet'])
      const rIndeterminate = runCLI(['--nm', '/tmp/definitely-not-here-xyz', '--quiet'])
      // 只断言 skill **明确写了**的那个码，避免把它没写的东西当成承诺
      const claims = (code) => new RegExp(`(退出码|exit)[^\\n]{0,60}\\b${code}\\b`).test(text)
        || new RegExp(`\\b${code}\\b[^\\n]{0,20}(无法判定|不兼容|部分可用|可用)`).test(text)
      if (claims(3)) assert.equal(rIndeterminate.code, 3, 'skill 说无法判定是 3，但 CLI 返回了别的')
      if (claims(0)) assert.equal(rOk.code, 0, `skill 说可用是 0，但 CLI 返回了 ${rOk.code}：${rOk.out}`)
      // 无论 skill 怎么写，这两条都是 CLI 的契约
      assert.equal(rIndeterminate.code, 3, 'CLI 对不存在的目录必须返回 3（无法判定）')
      assert.equal(rOk.code, 0, 'CLI 对全部可用的输入必须返回 0')
    } finally { fs.rmSync(cleanNm, { recursive: true, force: true }) }
    void MICRO_SURFACE
  })

  test('skill 里给出的命令形态真的能跑（用免基线的只读形态）', () => {
    // 从 skill 正文里抽出一条 --nm 命令，按它的形态跑一次，断言不是用法错误。
    const r = runCLI(['--nm', MICRO, '--probe', MICRO_SURFACE, '--dsh-version', '0.2.0-rc.2', '--no-baseline', '--quiet'])
    assert.notEqual(r.code, 3, `以 --quiet 跑应当是**插件的结论**而不是"这次体检没得出结果"：${r.err}`)
    assert.match(r.out, /结论:/)
  })
})

describe('skill/README.md：E1 的机制必须有据可查', () => {
  test('README 存在，并写下了「包内 SKILL.md 不算数」这条实测结论', () => {
    assert.ok(fs.existsSync(SKILL_README), 'skill/README.md 不存在 —— 注册机制会失传')
    const t = fs.readFileSync(SKILL_README, 'utf8')
    assert.match(t, /registerProvider/, 'README 必须给出宿主半边的注册 API')
    // 这条是本项目实测的反例，必须留下：否则下一个人会以为"文件在包里就够了"
    assert.match(t, /不算数|不会扫描|不被自动发现|注册/, 'README 必须说清「包内文件不自动被发现」')
  })
})

describe('E2：--install-skill 装到临时 HOME，且拒绝静默覆盖', () => {
  const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-skill-home-'))

  const runScript = (args, home) => spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: home, DSC_KERNEL: path.join(home, 'no-such-kernel') },
  })

  test('装到 ~/.agents/skills/<name>/SKILL.md，且不需要判定内核', () => {
    const home = tmpHome()
    try {
      const r = runScript(['--install-skill'], home)
      assert.equal(r.status, 0, `--install-skill 应当成功：${r.stderr || r.stdout}`)
      const dest = path.join(home, '.agents', 'skills', 'dsh-plugin-compat-check', 'SKILL.md')
      assert.ok(fs.existsSync(dest), `没有装到 ${dest}\nstdout: ${r.stdout}`)
      assert.equal(fs.readFileSync(dest, 'utf8'), readSkill(), '装过去的字节与源文件不一致')
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  })

  test('第二次运行拒绝覆盖（不静默改写别人的 skill）', () => {
    const home = tmpHome()
    try {
      runScript(['--install-skill'], home)
      const dest = path.join(home, '.agents', 'skills', 'dsh-plugin-compat-check', 'SKILL.md')
      // 把内容改成"用户自己改过的"版本
      const mine = '---\nname: dsh-plugin-compat-check\ndescription: 我自己改过的\n---\n\n我的正文\n'
      fs.writeFileSync(dest, mine)
      const r = runScript(['--install-skill'], home)
      assert.notEqual(r.status, 0, '已有不同内容时**必须**非零退出，而不是静默覆盖')
      assert.equal(fs.readFileSync(dest, 'utf8'), mine, '没有 --force 时绝不能改写已有文件')
      assert.match(r.stdout + r.stderr, /--force|已存在|覆盖/)
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  })

  test('--force 才覆盖（显式的数据丢失，而不是默认行为）', () => {
    const home = tmpHome()
    try {
      runScript(['--install-skill'], home)
      const dest = path.join(home, '.agents', 'skills', 'dsh-plugin-compat-check', 'SKILL.md')
      fs.writeFileSync(dest, '---\nname: dsh-plugin-compat-check\ndescription: 临时\n---\n\nx\n')
      const r = runScript(['--install-skill', '--force'], home)
      assert.equal(r.status, 0, `--force 应当成功：${r.stderr || r.stdout}`)
      assert.equal(fs.readFileSync(dest, 'utf8'), readSkill(), '--force 应当把源文件装过去')
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  })

  test('它绝不去碰真实的 ~/.agents（测试必须隔离用户环境）', () => {
    // 这条是自保：上面几条全部用临时 HOME。如果哪次重构让 HOME 失效，
    // 用户的 ~/.agents 就会被测试改写 —— 那是不可接受的数据破坏。
    const real = path.join(os.homedir(), '.agents', 'skills', 'dsh-plugin-compat-check', 'SKILL.md')
    if (fs.existsSync(real)) {
      const before = fs.readFileSync(real, 'utf8')
      const home = tmpHome()
      try { runScript(['--install-skill', '--force'], home) } finally { fs.rmSync(home, { recursive: true, force: true }) }
      assert.equal(fs.readFileSync(real, 'utf8'), before, '测试改动了用户真实的 ~/.agents')
    }
  })
})

/* ═════════════════════════════════════════════════════════════════════════════
 * 以下四条由 E1/E2（skill 产物）负责人补，风格与上面一致。
 *
 * 补的理由很具体：上面覆盖了 0（可用）与 3（无法判定），但**没有覆盖 1 与 2**
 * —— 而 skill 的退出码表把四个码都教给了 agent。少一条断言，就等于放任
 * 「文档写 1、实现给别的」不被任何人看见，而那正是这个文件开头说的那类失效。
 * 另两条针对 `--install-skill` 的实现细节（本轮新增的 shell 函数）：
 * 参数顺序、以及"找不到源文件"这条失败路径。
 *
 * 这里的子进程一律把 `HOME` / `DSH_HOME` 钉进临时目录，并显式带 `--no-baseline`：
 * CLI 会往 `$DSH_HOME` 写本机基线，测试不该在用户的真实状态目录里留下东西。
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('退出码补测：1 与 2 也必须与 CLI 的真实行为一致', () => {
  const EXTRA = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-skill-extra-'))

  const runPinned = (args) => {
    const home = path.join(EXTRA, 'cli-home')
    fs.mkdirSync(home, { recursive: true })
    const r = spawnSync(process.execPath, [CLI, ...args], {
      encoding: 'utf8', timeout: 120000,
      env: { ...process.env, HOME: home, DSH_HOME: path.join(home, '.dsh') },
    })
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
  }

  /** 造一个只装一个 fixture 插件的目录（--nm 接受任意目录名） */
  const nmWith = (name, fixture) => {
    const dir = path.join(EXTRA, name)
    const pkg = path.join(dir, '@fixture', fixture)
    fs.mkdirSync(path.dirname(pkg), { recursive: true })
    fs.cpSync(path.join(MICRO, '@fixture', fixture), pkg, { recursive: true })
    return dir
  }

  test('部分可用 → 1（有方法级缺失：相关功能降级或失效）', () => {
    const r = runPinned(['--nm', nmWith('partial', 'fatalmethod'), '--probe', MICRO_SURFACE, '--quiet', '--no-baseline'])
    assert.equal(r.code, 1, `应当部分可用：\n${r.out}${r.err}`)
    assert.match(r.out, /部分可用 1/)
  })

  test('不兼容 → 2', () => {
    const r = runPinned(['--nm', nmWith('broken', 'pending'), '--probe', MICRO_SURFACE, '--quiet', '--no-baseline'])
    assert.equal(r.code, 2, `应当不兼容：\n${r.out}${r.err}`)
    assert.match(r.out, /不兼容 1/)
  })
})

describe('--install-skill 补测：参数顺序与「找不到源文件」', () => {
  const tmpHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-skill-x-'))

  const runScript = (args, home, extra = {}) => {
    const env = { ...process.env, HOME: home, DSH_HOME: path.join(home, '.dsh'), ...extra }
    // 安全措施：脚本按 DSH_AGENTS_HOME ?? $HOME/.agents 解析目标。测试环境里若恰好
    // 设了它，文件会被写到**真实**的 skill 目录 —— 测试绝不能碰用户的 ~/.agents。
    if (!Object.hasOwn(extra, 'DSH_AGENTS_HOME')) delete env.DSH_AGENTS_HOME
    const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env, timeout: 60000 })
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
  }

  test('--force 放在 --install-skill 前面也一样生效（argv[1] 会被 SPEC 吞掉）', () => {
    // 脚本第 19 行 `SPEC="${1:-}"` 会无条件吃掉第一个参数。不在别处补判一次，
    // 用户敲了 --force 却得到「已存在，未做改动」，而他以为已经覆盖了。
    const home = tmpHome()
    try {
      runScript(['--install-skill'], home)
      const dest = path.join(home, '.agents/skills/dsh-plugin-compat-check/SKILL.md')
      fs.writeFileSync(dest, 'placeholder\n')
      const r = runScript(['--force', '--install-skill'], home)
      assert.equal(r.code, 0, `参数顺序不该改变语义：\n${r.out}${r.err}`)
      assert.equal(fs.readFileSync(dest, 'utf8'), readSkill(), '--force 在前时没有覆盖')
    } finally { fs.rmSync(home, { recursive: true, force: true }) }
  })

  test('找不到随包的 SKILL.md 时报错，而不是静默成功', () => {
    // 一个「装完了但什么都没装」的 flag，与脚本里踩过的死参数是同一类失败：
    // 用户以为完成了，实际没有任何效果。
    const lonely = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-skill-lonely-'))
    const home = tmpHome()
    try {
      fs.copyFileSync(SCRIPT, path.join(lonely, 'dsh-plugin-compat-check.sh'))
      const env = { ...process.env, HOME: home, DSH_HOME: path.join(home, '.dsh'), DSC_SKILL: '' }
      delete env.DSH_AGENTS_HOME
      const r = spawnSync('bash', [path.join(lonely, 'dsh-plugin-compat-check.sh'), '--install-skill'],
        { encoding: 'utf8', env, timeout: 60000 })
      assert.notEqual(r.status, 0, '找不到 SKILL.md 时必须非 0 退出')
      assert.match(r.stderr || '', /找不到要安装的 SKILL\.md/)
      assert.ok(!fs.existsSync(path.join(home, '.agents', 'skills')), '失败时不该建出目录')
    } finally {
      fs.rmSync(home, { recursive: true, force: true })
      fs.rmSync(lonely, { recursive: true, force: true })
    }
  })
})

/**
 * 脚本的命令行**契约**：`--help` 与 `--install-skill` 都不需要判定内核。
 *
 * 这是一次真实缺陷的回归：`--help` 此前**根本没被处理**，它会掉进「找内核」检查
 * 并以 1 退出 —— 也就是"想看用法"被当成"内核缺失"报了个错。
 * 把"想了解用法"当失败，是很糟的第一印象。
 */
describe('脚本：不需要内核的那些入口', () => {
  const runScript = (args, env) => spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, DSC_KERNEL: '/tmp/definitely-no-kernel-here', ...(env || {}) },
  })

  test('--help 在没有内核时也成功（退出码 0），并打印用法', () => {
    for (const flag of ['--help', '-h']) {
      const r = runScript([flag])
      assert.equal(r.status, 0, `${flag} 应当以 0 退出，实际 ${r.status}\n${r.stderr}`)
      assert.match(r.stderr + r.stdout, /用法:/, `${flag} 没打印用法`)
    }
  })

  test('没给参数才算用法错误（退出码 2），且不查找内核', () => {
    const r = runScript([])
    assert.equal(r.status, 2, `没给参数应当是用法错误，实际 ${r.status}`)
    assert.match(r.stderr + r.stdout, /用法:/)
    assert.ok(!/找不到判定内核/.test(r.stderr), '没给参数时不该报"找不到内核"')
  })

  test('--help 的输出里提到了不需要内核的入口（否则用户不知道它们存在）', () => {
    const r = runScript(['--help'])
    const out = r.stderr + r.stdout
    assert.match(out, /--install-skill/, '用法里没提 --install-skill')
    assert.match(out, /--help/, '用法里没提 --help')
    assert.match(out, /bin\/compat-check\.mjs/, '用法里没提体检的直接用法')
  })

  test('真去体检但缺内核时才报错，且**明确拒绝降级**', () => {
    const r = runScript(['some-plugin', '--timeout', '3'])
    assert.notEqual(r.status, 0, '缺内核时不该成功')
    assert.match(r.stderr, /找不到判定内核/)
    assert.match(r.stderr, /不接受降级|降级/, '没写清为什么宁可报错也不降级')
  })
})

/**
 * 示例输出必须**从真实运行里抄**，而不是手写。
 *
 * ## 为什么值得一条测试
 *
 * 这段示例是 skill 里信息密度最高的部分：agent 读完它就知道"该期待看到什么"。
 * 而它**是产品输出的一份渲染** —— 输出的格式一改（哪怕只是多一行
 * `无证据可判: connection`），示例就变成了**在教 agent 期待一个不存在的形状**。
 *
 * 这是**已经真实发生过**的：示例里曾经写着
 * `jobs.onJobsChanged @ lib/index.js:591`「降级」，而那是后来被证伪的**假阳性**。
 * 也就是说 skill 一度在教 agent 去报一条不存在的问题。
 *
 * 手写示例必然会腐烂，所以这里把它变成**可校验的**：抽出示例块，
 * 与同一输入的真实输出逐行比对。改输出就必须改示例，反之亦然。
 *
 * 示例**故意省略**了尾部那段「说明: ...」（那是给终端读者的排版，不是结论），
 * 所以比对时按前缀匹配，而不是要求全文相等。
 */
describe('skill 的示例输出必须与真实输出一致', () => {
  test('示例块 = 真实运行的前缀（逐行）', (t) => {
    const body = frontmatter(readSkill()).body
    const m = /```\n(插件数: \d[\s\S]*?)\n```/.exec(body)
    assert.ok(m, '找不到示例输出块 —— 它被删了还是改了开头？这条测试要跟着改')

    const PARITYFIX = optionalProfiles().find(p => p.name === 'parityfix')?.nm
    if (!PARITYFIX) {
      // 与别的 skill 测试一致：本机没有这个 profile 就跳过并说明，不静默通过
      t.skip('本机没有 parityfix profile')
      return
    }
    const r = runCLI(['--nm', PARITYFIX,
      '--probe', path.join(REPO, 'tools/parity/fixtures/host-surface-parityfix.json'),
      '--dsh-version', '0.2.0-rc.2', '--no-baseline'])
    const example = m[1].split('\n').map((l) => l.trimEnd())
    const real = (r.out || '').split('\n').map((l) => l.trimEnd())

    for (let i = 0; i < example.length; i++) {
      if (example[i] === '') continue
      assert.equal(example[i], real[i],
        `skill 的示例输出与真实输出第 ${i + 1} 行不一致 —— `
        + `示例是手写的就必然会腐烂。把真实输出抄回 SKILL.md（或改这条测试）。`)
    }
  })
})

/**
 * 「随包的 SKILL.md 到底在哪」—— 一条**安装形态**的回归。
 *
 * ## 它守的是一次真实的静默失效
 *
 * `plugin/index.js` 的 `readPackagedSkill()` 原来只找 `join(here, '..', 'skill', 'SKILL.md')`
 * （仓库形态）。而**装进 profile 之后**它是
 * `<profile>/node_modules/dsh-plugin-compat-check`，上一层是 `node_modules/`
 * —— 那里当然没有 `skill/`。
 *
 * 根因：pnpm 按 `package.json` 的 `files` 字段**复制**目录（不是符号链接），
 * 而当时 `files` 里没有 `skill/`。后果是宿主日志只有一句
 * `SKILL registration skipped` —— **skill 是本项目三类产物之一，而它在正常安装路径下是死的。**
 *
 * E1 当年报"跑通"，是因为那次**在仓库里**跑的 —— 而 `plugin/` 的上一层正好是仓库根。
 */
describe('随包 skill：安装形态下必须能找到、且与权威副本逐字节相同', () => {
  test('plugin/skill/SKILL.md 与 skill/SKILL.md 逐字节相同', () => {
    // 副本必须存在（`file:` 安装不跑 prepack，只能提交副本），
    // 而副本会漂移 —— 所以钉住它。同款模式：lib/version.mjs ↔ plugin/package.json。
    const canonical = fs.readFileSync(path.join(REPO, 'skill', 'SKILL.md'))
    const shipped = fs.readFileSync(path.join(REPO, 'plugin', 'skill', 'SKILL.md'))
    assert.ok(Buffer.compare(canonical, shipped) === 0,
      'plugin/skill/SKILL.md 与 skill/SKILL.md 不一致 —— 跑 `node plugin/scripts/stage-skill.mjs` 同步。'
      + '两份不一致时，装进 profile 的插件会注册一份**过期**的 skill 正文，而且没有任何提示。')
  })

  test('files 里有 skill/（否则 pnpm 复制时不会带它）', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'plugin', 'package.json'), 'utf8'))
    assert.ok(pkg.files.includes('skill/'),
      `plugin/package.json 的 files 里没有 skill/ —— pnpm 按它复制目录，`
      + `于是装进 profile 后 skill/ 根本不在，readPackagedSkill() 三条候选路径全落空。`)
  })

  test('「安装形态」的布局下真的能注册出 skill（端到端，不是看一个函数）', async () => {
    // 造一个**最小安装形态**：一个目录，里面有 index.js / lib/client.js / skill/SKILL.md，
    // 而**上一级没有 skill/**（模拟 `<profile>/node_modules/`）。
    //
    // 然后**真的 import 那个副本、真的驱动 apply()**，看 skill 注册出来没有。
    // 一开始我写的是"从源码里正则抽出 readPackagedSkill 再求值" —— 太聪明、
    // 而且它验的是"那个函数"，不是"用户拿到的东西"。端到端才是有意义的断言。
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-installed-'))
    const dest = path.join(tmp, 'dsh-plugin-compat-check')
    try {
      fs.cpSync(path.join(REPO, 'plugin'), dest, { recursive: true })
      // 必须先确认这个布局确实是"安装形态"：上一级没有 skill/
      assert.ok(!fs.existsSync(path.join(tmp, 'skill')), '测试布局造错了：上一级不该有 skill/')

      const mod = await import(path.join(dest, 'index.js'))
      let provider = null
      const ctx = {
        get: () => undefined,
        inject: (deps, cb) => cb({ skills: { registerProvider: (p) => { provider = p } } }),
        effect: () => {},
        logger: { info: () => {}, warn: () => {} },
      }
      mod.apply(ctx)
      await new Promise((r) => setTimeout(r, 300))

      assert.ok(provider !== null,
        '安装形态下**没有注册 skill** —— 这正是那次静默失效的形状：'
        + '宿主日志只有一句 `SKILL registration skipped`，而 skill 是三类产物之一。'
        + '排查顺序：plugin/package.json 的 files 里有没有 skill/、'
        + 'readPackagedSkill() 的候选里有没有 `<here>/skill/SKILL.md`。')
      const listed = await provider().get('dsh-plugin-compat-check')
      assert.ok(listed && listed.content && listed.content.length > 500,
        `注册出来的 skill 正文不对：${JSON.stringify(listed).slice(0, 200)}`)
      // 正文必须与权威那份一致 —— 否则装上去的是一份**过期**的说法
      const canonical = frontmatter(fs.readFileSync(path.join(REPO, 'skill', 'SKILL.md'), 'utf8')).body
      assert.equal(listed.content.trim(), canonical.trim(),
        '随包注册的正文与 skill/SKILL.md 不一致 —— 跑 node plugin/scripts/stage-skill.mjs')
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
