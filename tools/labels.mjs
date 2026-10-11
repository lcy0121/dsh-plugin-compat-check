#!/usr/bin/env node
/**
 * **标注集**：用宿主自己的条目状态，量化本工具「未激活」那一层的声明对不对。
 *
 * ## 为什么这一层可以自动标注，而别的层不行
 *
 * 本工具向用户承诺三层：
 *
 * | 层 | 工具说什么 | 有没有机器真值 |
 * |---|---|---|
 * | ① **宿主未激活** | "这个条目会停在 pending / 起不来" | ✅ **有** —— loader 自己就说了 `entry.fiber.state` |
 * | ② 静默降级 | "它激活了，但某个功能是死的" | ❌ **没有** —— 要人试一次，或给每个插件写功能测试 |
 * | ③ 客户端半边 | "浏览器里那半边加载不出来" | ⚠️ 半有 —— 需要浏览器（`__DSH_BOOT__`），本脚本不做 |
 *
 * 所以这个脚本**只量化第 ① 层**，并在输出里明写这一点。
 * 一个"看起来完整、实际只测了最容易那一层"的数字，比没有数字更坏 ——
 * 它会让人以为整条链路都被验证过。
 *
 * ## 它测什么：**双向**都能测
 *
 * 这一点比"算个准确率"重要 —— 标签与工具结论是**互相独立**的两个来源：
 *
 * | 工具 | loader | 判定 |
 * |---|---|---|
 * | 报了 fatal（"会停在 pending"） | ACTIVE | ❌ **假阳性**（那条 fatal 是错的） |
 * | 没报致命 | PENDING / FAILED | ❌ **假阴性**（漏了一个真的起不来） |
 * | 报了 fatal | PENDING / FAILED | ✅ 说对了 |
 * | 没报致命 | ACTIVE | ✅ 一致（**但不等于"没问题"**，见第 ② 层） |
 *
 * ⚠️ **右下角那一格不能读成"正确"** —— `ACTIVE` 只说明条目起来了，
 * 不说明功能是活的。这一层恰恰是本工具唯一的卖点，也是这里测不到的。
 *
 * ## 用法
 *
 *     node tools/labels.mjs --nm <profile 目录> --probe-boot
 *     node tools/labels.mjs --nm <profile> --probe <探针报告.json>
 *     node tools/labels.mjs --nm <profile> --probe <报告> --json
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** loader 说「这个条目没起来」的两种状态。NO_FIBER **不算** —— 见下。 */
const NOT_RUNNING = new Set(['PENDING', 'FAILED', 'LOADING']);

function parseArgs(argv) {
  const out = { nm: null, probe: null, probeBoot: false, json: false, keepDir: null, synthetic: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nm') { out.nm = argv[++i]; continue; }
    if (a === '--probe') { out.probe = argv[++i]; continue; }
    if (a === '--probe-boot') { out.probeBoot = true; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--keep-dir') { out.keepDir = argv[++i]; continue; }
    if (a === '--synthetic') { out.synthetic = true; continue; }
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

/** 跑一次工具，拿它给人看的 JSON（含每个插件的结论与致命发现） */
function runTool(nm, probePath) {
  const args = ['bin/compat-check.mjs', '--nm', nm, '--dsh-version', '0.2.0-rc.2',
    '--no-baseline', '--json'];
  if (probePath) args.push('--probe', probePath);
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 600000 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw new Error(`工具的 JSON 输出读不了（exit=${r.status}）：\n${(r.stdout || '').slice(0, 400)}`);
  }
}

/**
 * **合成正例**：把「已知会坏 / 已知正常」的插件装进一个临时 profile，再对账。
 *
 * ## 为什么需要它（实测出来的空白）
 *
 * 真值基础设施建好之后，第一次跑的结果是：**这台机器上一个正例都没有**。
 *
 * | profile | 条目 | ACTIVE | NO_FIBER | PENDING | FAILED |
 * |---|---|---|---|---|---|
 * | parityfix | 190 | 161 | 29 | **0** | **0** |
 * | desktop | 218 | 188 | 30 | **0** | **0** |
 *
 * 没有正例，**召回率就无从谈起** —— 而召回率恰恰是"这个工具到底有没有用"的核心。
 * 引入真实坏插件不可控（它们是别人写的、会变），所以正例**由我们安排**：
 * `test/fixtures/labels/broken-service` 注入一个无人提供的服务，
 * 宿主条目必然停在 PENDING。
 *
 * ⚠️ **真值仍然来自宿主，不是我们说了算** —— 我们只安排"病例"，
 * 不让它自己说"我坏了"。所以这仍然是**真标注**，只是样本是合成的。
 * 这个区别很重要：如果真值来自我们的期望，那就变成了自己给自己打分。
 *
 * ## 它测两条
 *
 * - `@label/broken-service` → 真值 PENDING，工具**必须**报 fatal（召回）
 * - `@label/healthy` → 真值 ACTIVE，工具**不得**报 fatal（那会是假阳性）
 */
function buildSyntheticProfile(home, baseName = 'web') {
  const tmpName = `dsc-labels-${process.pid}-${Date.now()}`;
  const tmp = path.join(home, 'profiles', tmpName);
  const notes = [];
  const base = path.join(home, 'profiles', baseName);
  if (!fs.existsSync(base)) throw new Error(`基准 profile 不存在：${base}`);

  // ⚠️ **基准必须是干净的模板 profile（`web`）**，不能是装过社区插件的。
  //
  // 实测踩到：从 `parityfix` 复制出来的 profile **跑不动 pnpm** ——
  // 它带着一条 `dsh-plugin-compat-check-probe: file:...` 依赖，复制之后
  // 那条路径解析成了临时目录下的相对路径，pnpm 直接 ENOENT：
  //
  //   [ENOENT] scandir '/private/var/.../tmp.XXX/Documents/deepseek-harness/.../probe'
  //
  // 而报错被 wrapper 收成一行 "plugin command failed"，看不出原因。
  // `web` 模板的 dependencies 是空的，没有这个历史包袱。
  const cp = spawnSync('cp', ['-R', base, tmp], { encoding: 'utf8', timeout: 60000 });
  if (cp.status !== 0) throw new Error(`复制基准 profile 失败: ${(cp.stderr || '').trim()}`);

  for (const name of ['broken-service', 'healthy', 'real-service']) {
    const dir = path.join(REPO, 'test', 'fixtures', 'labels', name);
    const r = spawnSync('dsh', ['plugin', '--profile', tmpName, 'add', `file:${dir}`],
      { encoding: 'utf8', timeout: 300000, env: { ...process.env, DSH_HOME: home } });
    if (r.status !== 0) {
      notes.push(`装 ${name} 失败（退出码 ${r.status}）: ${(r.stderr || r.stdout || '').trim().slice(-300)}`);
    }
  }
  return { tmpName, tmp, notes };
}

function loadProbe(probePath) {
  const d = JSON.parse(fs.readFileSync(probePath, 'utf8'));
  const entries = d.entries;
  if (!entries || !Array.isArray(entries.plugins) || entries.plugins.length === 0) {
    throw new Error(
      '这份探针报告里没有条目状态（`entries` 为空或缺失）。\n'
      + '  条目状态是 probeVersion >= 4 才有的 —— 用 `--probe-boot` 重新生成一份。',
    );
  }
  return entries;
}

/**
 * 把 loader 的 `id` 与工具的包名对齐。
 *
 * loader 的 `id` 有三种形态（实测）：包名本身、`包名:后缀`、以及配置页那种
 * 非包的 id。工具那边是 **npm 包名**。所以这里按包名做**前缀匹配**，
 * 匹配不上就归入 `unmatched` **并如实报出来** —— 不猜、也不静默丢弃。
 */
function matchEntry(name, byId) {
  // loader 的 `id` 有三种形态（实测）：
  //   1. 包名本身            → `dsh-pet`
  //   2. `include:<条目名>`  → `include:dsh-pet`（社区插件走这条）
  //   3. 配置页那种非包 id    → `include:tool-plugin-manager`
  // 所以先精确、再去前缀、最后按 scoped 包名的**尾段**比。
  const norm = (x) => String(x).replace(/^include:/, '');
  const want = norm(name);
  const tail = (x) => norm(x).split('/').pop();
  for (const [id, row] of byId) {
    if (id === name || norm(id) === want) return row;
  }
  for (const [id, row] of byId) {
    const n = norm(id);
    if (n.startsWith(`${want}:`) || n.startsWith(`${want}/`)) return row;
    // `dsh-plugin-compat-check-probe`（包名）↔ `compat-check-probe`（条目名）
    if (tail(id) === tail(name)) return row;
  }
  return null;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n用法: node tools/labels.mjs --nm <profile> [--probe-boot | --probe <报告>] [--json]\n`);
    process.exit(3);
  }
  if (!opts.nm) {
    process.stderr.write('用法: node tools/labels.mjs --nm <profile 目录> [--probe-boot | --probe <探针报告>] [--json]\n');
    process.exit(3);
  }

  // ── 合成正例模式：先造一个有"病例"的 profile ──
  let bootTarget = opts.nm;
  let synProfile = null;
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  if (opts.synthetic) {
    try {
      const built = buildSyntheticProfile(home);
      synProfile = built;
      bootTarget = built.tmp;
      if (built.notes.length) {
        process.stderr.write(`合成 profile 有告警：\n  ${built.notes.join('\n  ')}\n`);
      }
    } catch (error) {
      process.stderr.write(`建合成 profile 失败：${error.message}\n`);
      process.exit(3);
    }
    opts.probeBoot = true;   // 合成模式必须真的起一次宿主才有真值
  }

  // ── 拿到探针报告（真值来源）──
  let probePath = opts.probe;
  let tmpDir = null;
  if (opts.probeBoot) {
    tmpDir = opts.keepDir || fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-labels-'));
    fs.mkdirSync(tmpDir, { recursive: true });
    const r = spawnSync(process.execPath, ['bin/compat-check.mjs', '--nm', bootTarget, '--probe-boot',
      '--probe-keep-dir', tmpDir, '--dsh-version', '0.2.0-rc.2', '--no-baseline', '--quiet'],
    { cwd: REPO, encoding: 'utf8', timeout: 600000 });
    probePath = path.join(tmpDir, 'probe-report.json');
    if (!fs.existsSync(probePath)) {
      process.stderr.write(`--probe-boot 没留下探针报告（exit=${r.status}）\n${(r.stderr || '').slice(0, 400)}\n`);
      process.exit(3);
    }
  }
  if (!probePath) {
    process.stderr.write('要么给 --probe <报告>，要么给 --probe-boot（自己起一次宿主拿真值）\n');
    process.exit(3);
  }

  const entries = loadProbe(probePath);
  const tool = runTool(bootTarget, probePath);

  // ── 逐插件比对 ──
  const byId = new Map();
  for (const e of entries.plugins) if (e.id) byId.set(e.id, e);

  const rows = [];
  const unmatched = [];
  for (const [pkg, p] of Object.entries(tool.plugins || {})) {
    const entry = matchEntry(pkg, byId);
    const state = entry ? entry.state : null;

    // 工具的声明：有没有"致命"级发现（fatal = "条目会停在 pending"）
    const fatal = (p.findings || []).filter((f) => f.severity === 'fatal');
    const claimsNotRunning = fatal.length > 0;

    // NO_FIBER 多半是 disabled 的条目（实测 30/30 是 disabled:true）——
    // 它不是缺陷，所以**不**算"该起没起"。把 disabled 当成失败会让召回率虚高。
    const isNotRunning = state !== null && NOT_RUNNING.has(state);
    const isDisabled = Boolean(entry && entry.disabled);

    let verdict;
    if (claimsNotRunning && state === 'ACTIVE') verdict = 'false-positive';   // 说会挂，其实起来了
    else if (!claimsNotRunning && isNotRunning && !isDisabled) verdict = 'false-negative'; // 该报没报
    else if (claimsNotRunning && isNotRunning) verdict = 'true-positive';
    else if (state === null) verdict = 'no-label';
    else verdict = 'agree';

    rows.push({
      plugin: pkg, labelState: state, disabled: isDisabled,
      toolVerdict: p.verdict, fatalCount: fatal.length,
      fatalApis: fatal.map((f) => (f.service ? `${f.service}${f.method ? `.${f.method}` : ''}` : f.category)),
      verdict,
    });
    if (entry === null) unmatched.push(pkg);
  }

  const tally = {};
  for (const r of rows) tally[r.verdict] = (tally[r.verdict] ?? 0) + 1;

  if (opts.json) {
    process.stdout.write(`${JSON.stringify({
      profile: opts.nm, probe: probePath,
      coveredLayer: '① 宿主未激活（loader 自己的条目状态）',
      notCovered: ['② 静默降级（功能是死的）', '③ 客户端半边'],
      loaderTotals: { total: entries.total, byState: entries.byState },
      toolPlugins: rows.length, tally, unmatched, rows,
    }, null, 2)}\n`);
  } else {
    const byState = Object.entries(entries.byState).map(([k, v]) => `${k}=${v}`).join(' ');
    process.stdout.write(`标注集对账 —— ${path.basename(opts.nm)}${opts.synthetic ? '（+ 合成正例）' : ''}\n\n`);
    process.stdout.write(`  真值来源    loader 条目状态（${entries.total} 条：${byState}）\n`);
    process.stdout.write(`  工具结论    ${rows.length} 个插件\n\n`);
    process.stdout.write(`  覆盖的层    ⚠️ **只有第 ① 层**（宿主未激活）\n`);
    process.stdout.write(`             第 ② 层「激活了但功能是死的」机器测不到 —— 而那是本工具唯一的卖点\n`);
    process.stdout.write(`             第 ③ 层「客户端半边」需要浏览器\n\n`);
    process.stdout.write(`  对账结果（双向）\n`);
    const show = (k, label) => { if (tally[k]) process.stdout.write(`    ${label.padEnd(34)} ${tally[k]}\n`); };
    show('true-positive', '✅ 说会挂、确实没起来');
    show('false-positive', '❌ 说会挂、但它起来了（假阳性）');
    show('false-negative', '❌ 该报没报（漏了一个真起不来的）');
    show('agree', '— 一致（**不等于"没问题"**）');
    show('no-label', '? loader 里没有对应条目');
    if (unmatched.length) {
      process.stdout.write(`\n  loader 与工具对不上的插件 id（${unmatched.length}）：${unmatched.join(', ')}\n`);
    }
    for (const r of rows.filter((x) => x.verdict === 'false-positive' || x.verdict === 'false-negative')) {
      process.stdout.write(`\n  ${r.verdict === 'false-positive' ? '❌ 假阳性' : '❌ 漏报'}  ${r.plugin}\n`);
      process.stdout.write(`       loader=${r.labelState}${r.disabled ? ' (disabled)' : ''}  工具=${r.toolVerdict}  致命发现=${r.fatalApis.join(', ') || '无'}\n`);
    }
    process.stdout.write('\n');
  }

  if (tmpDir && !opts.keepDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  if (synProfile && !opts.keepDir) {
    try { fs.rmSync(synProfile.tmp, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
  }
  process.exit(tally['false-positive'] || tally['false-negative'] ? 1 : 0);
}

main();
