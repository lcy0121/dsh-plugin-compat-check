#!/usr/bin/env node
/**
 * **仓库元数据检查** —— GitHub 简介/标签/主页 与 npm 上的包，是否还与产品定义一致。
 *
 * ## 为什么要有它
 *
 * 2026-10-12 发现的：GitHub 简介写着「**在安装前**判断一个 DSH 插件…是否真的可用」，
 * 而 `README.md:44` 与 `Plan.md` §1 **明写禁止**这句话 ——
 * 插件形态做不到安装前检查（被只读约束排除），只有 CLI 能。
 *
 * 它在首页挂了很久，而此前几轮文档核查**一次都没扫到**，因为检查范围一直限定在
 * 仓库内的 7 份文档里，**没往仓库的元数据看一眼**。
 * 同一天还发现 `plugin/README.md`（= npm 页面）的示例过期 —— 同一类盲区。
 *
 * 所以：**「文档信息」的边界比那 7 份文件更宽。**
 *
 * ## 设计：规则离线可测，联网只负责取数
 *
 * | 层 | 在哪 | 为什么 |
 * |---|---|---|
 * | **规则**（纯函数） | 本文件导出 `RULES` | 由 `test/meta-check.test.mjs` 用合成输入钉住 —— 不联网 |
 * | **取数**（gh / npm） | 本文件的 `fetchGithub` / `fetchNpm` | 网络不可用就**跳过并说明**，不当成失败 |
 *
 * ⚠️ **不与 `tools/doc-check.mjs` 合并**：那个要进 `prepublishOnly` 闸门，必须**离线、秒级**；
 * 这个要联网。混在一起会让发布闸门依赖网络。
 *
 * ## 用法
 *
 *     node tools/meta-check.mjs              # GitHub + npm 都查
 *     node tools/meta-check.mjs --github     # 只查 GitHub
 *     node tools/meta-check.mjs --npm        # 只查 npm
 *     node tools/meta-check.mjs --json
 *
 * 退出码：0 全过 / 1 有问题 / 3 全部数据源都不可用（不是"全过"）。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────────────────────────────────────
// 规则层：纯函数，输入是取回来的元数据，输出是问题清单
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 「产品定义」在这份文件里的三条硬事实。**每条都指向它的出处** ——
 * 与本项目其它规则一样：不许凭印象写规则。
 */
export const PRODUCT = {
  // README.md 第一句 / Plan.md §1：产品管的是**已经装了**的插件
  SUBJECT: /已装|已经装|installed/i,
  // README.md:44 与 Plan.md §1 明写：插件形态做不到安装前检查
  FORBIDDEN: /(安装前|安装之前|before\s+install|pre-?install)/i,
  // 核心识别词：别人至少能用这几个词搜到
  REQUIRED_TOPICS: ['dsh', 'deepseek-harness', 'compatibility'],
  // Plan 里的核心词，简介里应该出现（否则搜不到）
  REQUIRED_DESC_TERMS: [/DSH/i, /插件|plugin/i],
};

/**
 * ## 严重度：`error` 与 `notice` 必须分开
 *
 * ⚠️ **这是踩过一次才加的。** 第一版把所有问题都报成 ❌ 并让退出码变 1，
 * 于是在**两次发布之间的每一天**都会红 —— 而其中两条（npm 的 keywords 与 README
 * 与本地不一致）是**预期内的**：npm 上的 tarball 不可变，本地改了当然不一致。
 *
 * **一个天天红的守卫最后一定会被忽略**（同 `docs/extraction-findings.md` 里
 * 「探针的四条边界」第 ② 条）。所以：
 *
 * - **`error`** —— 真的错了，必须修（说过头、许可不一致、仓库地址不对、缺核心标签、
 *   npm 上有本地没有的 keywords）
 * - **`notice`** —— 预期的中间状态，**只提示、不失败**（本地有未发布的改动）
 *
 * 默认 `error`：加规则时**必须显式说自己是不是 notice**，不许含糊过去。
 */
const ERROR = 'error';
const NOTICE = 'notice';

/**
 * GitHub 侧的规则。
 *
 * ⚠️ 规则写成数据而不是 if：这样 `test/meta-check.test.mjs` 能拿合成输入逐条验，
 * 而且加规则时**必须写 `why`**（指向文档出处），否则看不出它凭什么成立。
 */
export const GITHUB_RULES = [
  {
    id: 'gh.no-preinstall-claim',
    why: 'README.md:44 / Plan.md §1 明写禁止：插件形态做不到安装前检查（被只读约束排除），只有 CLI 能。「说过头」是本项目最在意的错误',
    check: (gh) => {
      const m = PRODUCT.FORBIDDEN.exec(gh.description || '');
      if (!m) return null;
      // 只有**归给 CLI** 时才允许出现 —— 那是真能力（脚本会把包装进一次性 profile 验证）
      if (/CLI/i.test(gh.description)) return null;
      return `GitHub 简介出现了「${m[0]}」，但没有把这件事归给 CLI。实际做不到的是**插件形态**`;
    },
  },
  {
    id: 'gh.mentions-installed',
    why: 'README.md 第一句 / Plan.md §1：产品管的是**已经装了**的插件。简介不提这个就等于说错了对象',
    check: (gh) => (PRODUCT.SUBJECT.test(gh.description || '')
      ? null : 'GitHub 简介里没有「已装 / installed」—— 它应该先讲清楚管的是已经装了的那批'),
  },
  {
    id: 'gh.has-topic',
    why: 'GitHub 标签上限 20 个，是白捡的曝光。缺核心识别词就等于别人搜不到',
    check: (gh) => {
      const have = new Set((gh.topics || []).map((t) => t.toLowerCase()));
      const miss = PRODUCT.REQUIRED_TOPICS.filter((t) => !have.has(t));
      return miss.length ? `GitHub 标签缺核心识别词：${miss.join(' / ')}` : null;
    },
  },
  {
    id: 'gh.no-redundant-topics',
    why: '标签位是有限的资源。`plugin` 与 `dsh-plugin` 重复，占位不如换成能带来新曝光的词',
    check: (gh) => {
      const have = new Set((gh.topics || []).map((t) => t.toLowerCase()));
      if (have.has('plugin') && have.has('dsh-plugin')) {
        return 'GitHub 标签里 `plugin` 与 `dsh-plugin` 重复 —— 腾出位置换别的';
      }
      return null;
    },
  },
  {
    id: 'gh.homepage-set',
    why: '主页为空时，仓库首页少一个"下一步去哪"的入口',
    check: (gh) => (gh.homepage ? null : 'GitHub 仓库主页是空的 —— 建议指向 npm 包页面或 README'),
  },
  {
    id: 'gh.license-matches',
    why: '两个公开面上的许可必须一致，否则用户不知道该信哪个',
    check: (gh, local) => {
      const a = (gh.license || '').toUpperCase();
      const b = (local.license || '').toUpperCase();
      if (!a) return 'GitHub 上没识别出许可证';
      return a.includes(b) ? null : `GitHub 许可（${a}）与 package.json（${b}）不一致`;
    },
  },
];

/** npm 侧的规则。 */
export const NPM_RULES = [
  {
    id: 'npm.version-matches',
    why: 'npm 上的版本必须等于本地 package.json —— 不等要么是"本地有未发布的改动"，要么是"发布错了包"',
    check: (npm, local) => (npm.version === local.version
      ? null : `npm 上是 ${npm.version}，本地 package.json 是 ${local.version}`),
  },
  {
    id: 'npm.no-preinstall-claim',
    why: '同 gh.no-preinstall-claim —— npm 是另一张脸，同样不许说过头',
    check: (npm) => {
      const m = PRODUCT.FORBIDDEN.exec(npm.description || '');
      if (!m) return null;
      if (/CLI/i.test(npm.description)) return null;
      return `npm 描述里出现了「${m[0]}」，但没有归给 CLI`;
    },
  },
  {
    id: 'npm.keywords-synced',
    why: 'keywords 决定 npm 站内搜索能不能搜到。与 GitHub 标签脱节就等于少一批入口',
    check: (npm, local) => {
      const a = new Set(npm.keywords || []);
      const b = new Set(local.keywords || []);
      const onlyLocal = [...b].filter((k) => !a.has(k));
      const onlyNpm = [...a].filter((k) => !b.has(k));
      if (!onlyLocal.length && !onlyNpm.length) return null;
      // 两个方向**严重度不同**，必须分开：
      //   · 本地多出来 → npm 的 tarball 不可变，这是**预期**的（下一版生效）
      //   · npm 上有而本地没有 → **真的错了**：线上有一批关键词在仓库里找不到出处
      if (onlyNpm.length) {
        return { severity: ERROR,
          message: `npm 上有本地没有的 keywords：${onlyNpm.join(', ')} —— 仓库里没有出处，要么补进 package.json，要么它不该在线上` };
      }
      return { severity: NOTICE,
        message: `本地新增了 keywords：${onlyLocal.join(', ')} —— **下一版发布才生效**（npm 上的 tarball 不可变）` };
    },
  },
  {
    id: 'npm.repository-points-here',
    why: 'npm 页面的"仓库"链接必须指回这里，否则用户从 npm 找不到源码、issue 无处提',
    check: (npm, local) => {
      const a = String(npm.repository?.url ?? npm.repository ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
      const b = String(local.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
      if (!a) return 'npm 上没写仓库地址';
      // 允许 https 与 git@ 两种形态的写法差异，只比"是不是同一个仓库"
      const norm = (x) => x.replace(/^git@([^:]+):/, 'https://$1/').toLowerCase();
      return norm(a) === norm(b) ? null : `npm 上的仓库（${a}）与 package.json（${b}）不一致`;
    },
  },
  {
    id: 'npm.readme-is-current',
    why: 'npm 页面的正文就是**发布那一刻的** README。它与本地不一致说明本地有改了但没发的文档 —— '
      + '这不是错误，但要知道它**只会出现在下一个版本上**（已发布的 tarball 不可变）',
    check: (npm, local, extra) => {
      if (!extra?.npmReadme) return null;              // 没取到就不判
      const strip = (s) => s.replace(/\s+/g, ' ').trim();
      if (strip(extra.npmReadme) === strip(local.readme)) return null;
      return { severity: NOTICE,
        message: 'npm 页面上的 README 与本地 `plugin/README.md` 不一致 —— '
          + '本地的改动**下一版发布才生效**（发出去的就是那一刻的正文）' };
    },
  },
];

/** 跑一组规则，返回问题清单。导出给测试用。 */
export function runRules(rules, ...args) {
  const out = [];
  for (const r of rules) {
    const v = r.check(...args);
    if (!v) continue;
    // 规则可以返回字符串（= error）或 {severity, message} —— 后者用来区分"预期内的漂移"
    if (typeof v === 'string') out.push({ id: r.id, severity: ERROR, message: v, why: r.why });
    else out.push({ id: r.id, severity: v.severity ?? ERROR, message: v.message, why: r.why });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 取数层：联网，失败就跳过（不当成失败）
// ─────────────────────────────────────────────────────────────────────────────

function tryRun(cmd, args, timeout = 30000) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    // 把 stderr 带回来，好让"为什么跳过"是可诊断的
    return { error: `${cmd} 失败: ${String(e.stderr || e.message).split('\n')[0].slice(0, 160)}` };
  }
}

/** 从 package.json 解析仓库 slug，**不硬编码** —— fork 出去也能用。 */
export function repoSlug(pkg) {
  const url = String(pkg.repository?.url ?? '');
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/.exec(url);
  return m ? `${m[1]}/${m[2]}` : null;
}

function readLocal() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'plugin', 'package.json'), 'utf8'));
  let readme = '';
  try { readme = fs.readFileSync(path.join(REPO, 'plugin', 'README.md'), 'utf8'); } catch { /* 没有就算了 */ }
  return { pkg, readme };
}

function fetchGithub(slug) {
  const raw = tryRun('gh', ['repo', 'view', slug, '--json',
    'description,repositoryTopics,homepageUrl,licenseInfo']);
  if (raw.error) return raw;
  const d = JSON.parse(raw);
  return {
    description: d.description ?? '',
    topics: (d.repositoryTopics ?? []).map((t) => t.name),
    homepage: d.homepageUrl ?? '',
    license: d.licenseInfo?.spdxId ?? d.licenseInfo?.name ?? '',
  };
}

function fetchNpm(name) {
  const raw = tryRun('npm', ['view', name, '--json']);
  if (raw.error) return raw;
  const d = JSON.parse(raw);
  // `npm view x --json` 对单版本返回对象、多版本返回数组 —— 取 latest
  const v = Array.isArray(d) ? d[d.length - 1] : d;
  return {
    version: v.version,
    description: v.description ?? '',
    keywords: v.keywords ?? [],
    repository: v.repository ?? null,
  };
}

/** npm 页面的正文 —— `npm view` 不给，要从 registry 的文档接口取。 */
function fetchNpmReadme(name) {
  const raw = tryRun('npm', ['view', name, 'readme']);
  if (raw.error) return null;
  return raw;
}

// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { github: false, npm: false, json: false };
  for (const a of argv) {
    if (a === '--github') out.github = true;
    else if (a === '--npm') out.npm = true;
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') { out.help = true; }
    else throw new Error(`无法识别的参数: ${a}`);
  }
  if (!out.github && !out.npm) { out.github = true; out.npm = true; }
  return out;
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n用法: node tools/meta-check.mjs [--github] [--npm] [--json]\n`);
    process.exit(3);
  }
  if (opts.help) {
    process.stdout.write('用法: node tools/meta-check.mjs [--github] [--npm] [--json]\n');
    process.exit(0);
  }

  const { pkg, readme } = readLocal();
  const slug = repoSlug(pkg);
  const local = { ...pkg, readme };

  const results = [];
  const skipped = [];

  if (opts.github) {
    if (!slug) skipped.push('GitHub：package.json 里解析不出仓库地址');
    else {
      const gh = fetchGithub(slug);
      if (gh.error) skipped.push(`GitHub：${gh.error}`);
      else results.push(...runRules(GITHUB_RULES, gh, local).map((r) => ({ ...r, side: 'GitHub' })));
    }
  }

  if (opts.npm) {
    const npm = fetchNpm(pkg.name);
    if (npm.error) skipped.push(`npm：${npm.error}`);
    else {
      results.push(...runRules(NPM_RULES, npm, local, { npmReadme: fetchNpmReadme(pkg.name) })
        .map((r) => ({ ...r, side: 'npm' })));
    }
  }

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ local: { name: pkg.name, version: pkg.version },
      slug, problems: results, skipped }, null, 2)}\n`);
  } else {
    process.stdout.write('仓库元数据检查（GitHub 简介/标签/主页 · npm 包）\n\n');
    for (const s of skipped) process.stdout.write(`  ⏭  ${s}\n`);
    if (skipped.length) process.stdout.write('\n');
    const errors = results.filter((r) => r.severity === ERROR);
    const notices = results.filter((r) => r.severity !== ERROR);
    if (!results.length) {
      process.stdout.write('  ✅ 全部一致\n');
    } else {
      for (const r of errors) {
        process.stdout.write(`  ❌ [${r.side}] ${r.message}\n`);
        process.stdout.write(`       凭什么：${r.why}\n`);
      }
      for (const r of notices) {
        process.stdout.write(`  ⏳ [${r.side}] ${r.message}\n`);
      }
    }
    if (notices.length && !errors.length) {
      process.stdout.write('\n  ✅ 没有错误 —— 上面的是**预期内的漂移**（本地有还没发布的改动）。\n');
    }
    process.stdout.write('\n');
    process.stdout.write('  ⚠️ 这些是**仓库的对外面孔**，不在「文档信息」那 7 份文件里，\n');
    process.stdout.write('     所以没有任何自检盯着它们 —— 这个工具就是那个自检。\n');
  }

  // 全部数据源都不可用 → 3（不是"全过"）
  const sources = (opts.github ? 1 : 0) + (opts.npm ? 1 : 0);
  if (skipped.length >= sources) process.exit(3);
  // ⚠️ 只有 error 才让退出码变 1 —— notice 天天都有，让它红就等于把守卫变成噪音
  process.exit(results.some((r) => r.severity === ERROR) ? 1 : 0);
}

// 只在直接运行时才跑 main —— 这样测试能 import 规则而不触发网络
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
