#!/usr/bin/env node
/**
 * dsh-plugin-compat-check —— 命令行入口（内核的唯一 CLI 形态）。
 *
 * ## 为什么要有它（而不是让 .sh 自己拼）
 *
 * 在它出现之前，同一个判定被写了两遍：Node 版在 `lib/verdict.mjs`，
 * 另一份在 `dsh-plugin-compat-check.sh` 第 ⑤ 步里的一段 python。两份实现
 * 在「同一插件给出不同结论」这个问题上必然漂移 —— 而本产品的全部卖点就是
 * 结论可信。所以这里把判定收成**一处**，脚本只负责编排（装包、起宿主、拿探针报告）。
 *
 * ## 三个入口共用一个内核
 *
 *   插件（进程内）→ 直接 import 这个文件里的 run()
 *   脚本（npx）  → `node bin/compat-check.mjs --nm <dir> --probe <json>`
 *   skill        → 教 agent 何时调用上面这一条
 *
 * ## 设计约束
 *
 * - **绝不抛**给调用方看栈：任何失败都变成一条 `error` 结论 + 非零退出码。
 *   一个体检工具自己抛栈，用户无法区分「插件坏了」还是「工具坏了」。
 * - **结论必须带确定性**。没有运行时面时（只给了目录、没有探针报告），
 *   方法级结论一律降为「疑似」—— 这是 Plan.md §2.2 的三档判据，不是可选项。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { extractWithProvenance } from '../lib/extract.mjs';
import { buildVerdicts } from '../lib/verdict.mjs';
import { render, toJSON } from '../lib/report.mjs';
import { snapshotForBaseline, diffAgainstBaseline, badgeFor, BASELINE_SCHEMA } from '../lib/baseline.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `用法: node bin/compat-check.mjs --nm <node_modules 目录> [选项]

选项:
  --nm <dir>       要体检的 node_modules 目录（必需）。也接受 profile 目录，
                   会自动补 node_modules 子目录。
  --probe <json>   宿主运行时面（探针报告）。给了它，方法级结论才是「确定」；
                   不给则退回官方目录，结论降为「疑似」。
  --probe-boot     自己起一次宿主来拿运行时面（不需要已有的探针报告）。
                   会建一个临时 profile、装探针、真实启动、回收报告、删掉临时 profile。
                   默认**不开**：它要起进程、要等几十秒，而多数检查不需要它。
                   给了它就不必再给 --probe（两者同时给时以 --probe 为准）。
  --probe-timeout <秒>  --probe-boot 的启动等待上限（默认 40）
  --probe-keep-dir <dir>  把探针报告与 services.json 留一份到该目录（排查用）
  --dsh-version <v> 当前 DSH 版本（用于「声明与实测不符」这一类结论）。
  --rules <json>   覆盖 severity 规则表（默认 rules/severity.json）
  --catalog <json> 覆盖官方 API 目录（默认 rules/dsh-api-catalog.json）
  --no-baseline    不读写本机基线（CI / 一次性检查用）
  --baseline-file <path>  指定基线文件（默认按 profile 分文件放在 $DSH_HOME 下）
  --dry-run        算出差分但不写基线
  --json           输出机器可读的完整结论，而不是给人看的表
  --quiet          只输出结论行，不输出逐条发现
  --help           显示这段文字

退出码（**1 与 2 只表示插件的结论**，3 表示这次体检本身没得出可信结论）:
  0  全部可用
  1  有插件"部分可用"
  2  有插件"不兼容"
  3  无法判定（用法错误 / 目录不存在 / 工具自身出错 —— 都不是插件的结论）
`;

/* ── 参数解析：手写，零依赖；未知参数一律报错而不是忽略 ────────────── */

function parseArgs(argv) {
  const out = { json: false, quiet: false };
  const takesValue = new Set(['--nm', '--probe', '--dsh-version', '--rules', '--catalog', '--baseline-file', '--profile', '--probe-timeout', '--probe-keep-dir']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
    if (a === '--no-baseline') { out.baseline = false; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
    if (a === '--probe-boot') { out.probeBoot = true; continue; }
    if (a === '--quiet') { out.quiet = true; continue; }
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (takesValue.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} 需要一个值`);
      out[a.replace(/^--/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
      continue;
    }
    // 未知参数**必须**报错。静默忽略会让 `--jsom` 这类拼写错误变成
    // 「跑完了但没有 JSON 输出」，而用户会以为工具不支持 JSON。
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

function readJSON(file, what) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`读不到${what} ${file}: ${error.message}`);
  }
}

/** profile 目录 → node_modules；node_modules 目录 → 原样 */
function resolveNodeModules(p) {
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) throw new Error(`目录不存在: ${abs}`);
  if (path.basename(abs) === 'node_modules') return abs;
  const nm = path.join(abs, 'node_modules');
  return fs.existsSync(nm) ? nm : abs;
}

/** 在 node_modules 旁边找探针报告 —— 脚本形态下它就在 workdir 里 */
function findProbeReport(nm) {
  const candidates = [
    path.join(path.dirname(nm), 'probe-report.json'),
    path.join(nm, '..', 'probe-report.json'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/* ── 基线（C4 的持久层） ─────────────────────────────────────────────── */

/**
 * 基线文件的位置。
 *
 * 放在插件自己的状态目录（`$DSH_HOME/dsh-plugin-compat-check/`），与插件半边共用
 * 同一份 —— 用户在面板里看到的"变化"和命令行看到的必须是同一件事，
 * 两份基线会立刻分叉。
 *
 * **按 profile 分文件**：桌面 profile 与临时 profile 的插件集合不同，
 * 混在一起会让差分变成噪音（"移除了 18 个插件"）。这正是要避免的。
 */
function baselineFileFor(nm, profile) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  // profile 名从路径里取：…/profiles/<name>/node_modules
  const inferred = (() => {
    try {
      const parts = path.resolve(nm).split(path.sep);
      const i = parts.lastIndexOf('profiles');
      if (i >= 0 && parts[i + 1]) return parts[i + 1];
    } catch { /* 忽略 */ }
    return 'unknown';
  })();
  const key = (profile || inferred || 'unknown').replace(/[^\w.-]/g, '_');
  return path.join(home, 'dsh-plugin-compat-check', `baseline.${key}.json`);
}

function readBaseline(file) {
  try {
    if (!fs.existsSync(file)) return { prev: null, note: '还没有基线（这是第一次体检）' };
    return { prev: JSON.parse(fs.readFileSync(file, 'utf8')), note: null };
  } catch (error) {
    // 读不出来**不是**"没有变化"。基线坏了就说不确定，不能假装一切正常。
    return { prev: null, note: `基线读不出来（${error.message}）—— 这次不做比较` };
  }
}

function writeBaseline(file, snapshot) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
    return null;
  } catch (error) {
    return `基线写不进去（${error.message}）`;
  }
}

/* ── 拿到运行时面：自己起一次宿主（--probe-boot） ───────────────────── */

/**
 * 自己起一次宿主，把**运行时面**拿回来。
 *
 * ## 为什么值得做这件事
 *
 * 没有运行时面时，方法级结论一律只能标「确定不了」—— 实测真实 desktop profile 上
 * **38 条发现没有一条是确定的**。因为**官方目录不是运行时面**：它给每个服务只声明
 * **1 个方法**，而运行时实测 `sessions` 有 14 个、`agents` 24 个、`llm` 29 个。
 * 于是「`sessions.get` 缺失」的真实含义只是"目录没写它"。
 *
 * 拿到面之后，同一批发现会立刻分成两类：**确实存在的（假阳性，消失）** 与
 * **确实不存在的（坐实为确定）**。
 *
 * ## 为什么默认不开
 *
 * 它要复制 profile、跑一次 pnpm、起一个宿主进程、等几十秒。默认路径（只读静态提取）
 * 是秒级且无副作用的，不该因为一个可选能力把它拖慢。
 *
 * ## 做法（每一步都是实测过的）
 *
 *  1. 复制目标 profile 到 `$DSH_HOME/profiles/dsc-probe-boot-<pid>`（`cp -R`）
 *  2. 把探针加进它的 dependencies 与 bundles（`file:<repo>/probe`）
 *  3. `dsh plugin --profile <tmp> install` —— 把探针装进 node_modules
 *  4. `services.json` 写**本次提取到的全部服务名**（探针照单全问）
 *  5. `DSC_OUT_DIR=<临时目录> dsh --profile <tmp> -- --port 0 --no-open`，轮询等报告
 *  6. 无论成败都删掉临时 profile 与临时目录
 *
 * ⚠️ 第 4 步是要点：探针**只会问 `services.json` 里点名的那几个**。
 * 不定制它就只能拿到一份固定的十来个服务，而真正关心的服务大概率不在里面
 * （实测 `logger` 就是因为从不被问，才会在报告里和"不存在"长得一模一样）。
 */
function probeBoot(nm, opts = {}) {
  const timeoutSec = Number(opts.probeTimeout) > 0 ? Number(opts.probeTimeout) : 40;
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const profilesDir = path.join(home, 'profiles');
  // `nm` 是 …/profiles/<name>/node_modules，profile 目录就是它的上一级
  const srcProfile = path.dirname(nm);
  const notes = [];

  if (!fs.existsSync(path.join(srcProfile, 'package.json'))) {
    return { surface: null, error: `拿不到 profile 目录（${srcProfile} 里没有 package.json）—— --probe-boot 需要 profile 形态的 --nm` };
  }
  const probeSrc = path.join(REPO, 'probe');
  if (!fs.existsSync(path.join(probeSrc, 'index.mjs'))) {
    return { surface: null, error: `找不到探针源码 ${probeSrc} —— --probe-boot 需要完整的仓库` };
  }

  const stamp = `${process.pid}-${Date.now().toString(36)}`;
  const tmpName = `dsc-probe-boot-${stamp}`;
  const tmpProfile = path.join(profilesDir, tmpName);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-boot-'));

  const cleanup = () => {
    try { spawnSync('pkill', ['-f', tmpName], { stdio: 'ignore' }); } catch { /* 尽力而为 */ }
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
  };

  try {
    // ── 1. 复制 profile ──
    const cp = spawnSync('cp', ['-R', srcProfile, tmpProfile], { encoding: 'utf8', timeout: 60000 });
    if (cp.status !== 0) return { surface: null, error: `复制 profile 失败: ${(cp.stderr || '').trim()}` };

    // ── 2. 加探针依赖（dependencies + bundles 都要）──
    const pkgFile = path.join(tmpProfile, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.name = `dsh-profile-${tmpName}`;
    pkg.dependencies = pkg.dependencies || {};
    pkg.dependencies['dsh-plugin-compat-check-probe'] = `file:${probeSrc}`;
    const bundles = pkg?.dsh?.profile?.bundles;
    if (Array.isArray(bundles) && !bundles.includes('dsh-plugin-compat-check-probe')) {
      bundles.push('dsh-plugin-compat-check-probe');
    } else if (!Array.isArray(bundles)) {
      notes.push('目标 profile 里找不到 dsh.profile.bundles —— 探针可能不会加载');
    }
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);

    // ── 3. 装探针 ──
    const inst = spawnSync('dsh', ['plugin', '--profile', tmpName, 'install'],
      { encoding: 'utf8', timeout: 180000, env: { ...process.env, DSH_HOME: home } });
    if (inst.status !== 0) {
      return { surface: null, error: `装探针失败（dsh plugin install 退出码 ${inst.status}）: ${(inst.stderr || '').trim().slice(0, 300)}` };
    }

    // ── 4. services.json：**本次提取到的全部服务**（探针照单全问）──
    //
    // 用刚算出来的 `services`，而不是探针里那份硬编码的默认集合 ——
    // 后者会让"没被问到"和"不存在"在报告里长得一样。
    const wanted = [...(opts.services || [])].filter((x) => typeof x === 'string' && x).sort();
    fs.writeFileSync(path.join(workDir, 'services.json'),
      JSON.stringify({ services: wanted }, null, 2));
    notes.push(`问了 ${wanted.length} 个服务`);

    // ── 5. 起宿主，**轮询**等报告 ──
    //
    // ⚠️ 这里**不能**用 `spawnSync` 同步等：宿主是长驻进程，永远不会自己退出，
    // 于是 `spawnSync` 必然一直等到超时才返回 —— 实测每次都白等满 60 秒，
    // 而报告其实 3~5 秒就写好了。改成"后台起 + 轮询文件"。
    const reportFile = path.join(workDir, 'probe-report.json');
    const child = spawn('dsh', ['--profile', tmpName, '--', '--port', '0', '--no-open'], {
      stdio: 'ignore',
      env: { ...process.env, DSH_HOME: home, DSC_OUT_DIR: workDir },
    });
    let bootPatience = 0;
    while (bootPatience < timeoutSec * 1000) {
      if (fs.existsSync(reportFile)) break;
      if (child.exitCode !== null) break; // 自己退了（起不来），不必等满
      try {
        spawnSync('sleep', ['0.25']);
      } catch { /* 尽力而为 */ }
      bootPatience += 250;
    }
    try { child.kill('SIGTERM'); } catch { /* 尽力而为 */ }
    if (!fs.existsSync(reportFile)) {
      return {
        surface: null,
        notes,
        error: `宿主起了 ${Math.round(bootPatience / 1000)} 秒也没写出探针报告。`
          + '常见原因：探针没被加载（bundles 里没有它）、或该 profile 起不来。',
      };
    }

    const surface = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    const present = Object.values(surface.root || {}).filter((v) => v && v.present).length;
    notes.push(`运行时面拿到 ${present}/${(surface.wanted || []).length} 个服务`);

    // ⚠️ 把报告留一份到临时目录，好让人能 `--probe-boot --probe-keep-dir <dir>` 排查。
    // 默认不留（免得散落文件），但**在失败排查时它是唯一的现场**。
    if (opts.keepDir) {
      try {
        fs.mkdirSync(opts.keepDir, { recursive: true });
        fs.copyFileSync(reportFile, path.join(opts.keepDir, 'probe-report.json'));
        fs.copyFileSync(path.join(workDir, 'services.json'), path.join(opts.keepDir, 'services.json'));
        notes.push(`报告已留一份到 ${opts.keepDir}`);
      } catch { /* 尽力而为 */ }
    }
    return { surface, notes, error: null };
  } catch (error) {
    return { surface: null, notes, error: `--probe-boot 失败: ${error.message}` };
  } finally {
    cleanup();
  }
}

/* ── 内核 ──────────────────────────────────────────────────────────── */

/**
 * 跑一次体检。**不打印、不退出**，只返回结构化结果 —— 这样插件半边也能直接调它。
 *
 * @returns {{ extract: object, verdict: object|null, error: string|null, inputs: object }}
 */
export function run(options = {}) {
  const result = { extract: null, verdict: null, error: null, inputs: {} };
  try {
    const nm = resolveNodeModules(options.nm);
    result.inputs.nodeModules = nm;

    const catalogPath = options.catalog || path.join(REPO, 'rules', 'dsh-api-catalog.json');
    const rulesPath = options.rules || path.join(REPO, 'rules', 'severity.json');
    const catalog = readJSON(catalogPath, '官方 API 目录');
    const rules = readJSON(rulesPath, 'severity 规则表');
    result.inputs.catalog = catalogPath;
    result.inputs.rules = rulesPath;

    // ⚠️ **先提取，再拿运行时面**。顺序不能反：`--probe-boot` 要把"这次到底涉及
    // 哪些服务"交给探针去问，而那份名单只有提取之后才知道。
    // 反过来（先起宿主）就只能拿一份固定的服务清单，关心的服务大概率不在里面。
    const extracted = extractWithProvenance(nm, { catalog });
    result.extract = extracted;

    const probePath = options.probe || findProbeReport(nm);
    let hostSurface = null;
    if (probePath) {
      hostSurface = readJSON(probePath, '探针报告');
      result.inputs.probe = probePath;
    } else if (options.probeBoot) {
      // 没给报告、也没在旁边找到，而用户要求自己起一次 —— 那就起。
      const boot = probeBoot(nm, {
        probeTimeout: options.probeTimeout,
        services: (extracted.report && extracted.report.services) || [],
        keepDir: options.probeKeepDir,
      });
      result.inputs.probeBoot = { notes: boot.notes || [], error: boot.error || null };
      if (boot.surface) {
        hostSurface = boot.surface;
        result.inputs.probe = '(--probe-boot 实时采集)';
      } else if (boot.error) {
        // 起不动**不算体检失败**：没有运行时面只是让结论降级为「疑似」，
        // 那是这个工具的常规工作模式，不是错误。但要把原因如实带出去 ——
        // 静默降级会让用户以为"我已经看到确定结论了"。
        result.inputs.probeBootWarn = boot.error;
      }
    }
    result.inputs.hasRuntimeSurface = Boolean(hostSurface);

    result.verdict = buildVerdicts({
      report: extracted.report,
      hostSurface,
      rules,
      catalog,
      dshVersion: options.dshVersion || null,
    });

    // ── 基线差分 ──
    // `--no-baseline` 关掉它（CI 里跑一次性检查时不该读写本机状态）。
    result.baseline = null;
    if (options.baseline !== false) {
      const file = options.baselineFile || baselineFileFor(nm, options.profile);
      result.inputs.baselineFile = file;
      const { prev, note } = readBaseline(file);
      const snap = snapshotForBaseline(result.verdict, options.dshVersion || null);
      const diff = diffAgainstBaseline(prev, snap);
      result.baseline = { file, note, diff, badge: badgeFor(diff), wrote: false };
      // 只有**这次拿得到完整结论**时才写基线：一次失败的体检写出的基线，
      // 会把"读不到"记成"这些插件都没了"，下次比较就全是假变化。
      if (!options.dryRun) {
        const err = writeBaseline(file, snap)
        if (err) result.baseline.writeError = err
        else result.baseline.wrote = true
      }
    }
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  }
  return result;
}

/* ── 给人看的渲染 ──────────────────────────────────────────────────── */

/* ── CLI ───────────────────────────────────────────────────────────── */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(3);
  }
  if (opts.help || !opts.nm) {
    process.stdout.write(USAGE);
    process.exit(opts.help ? 0 : 3);
  }

  // **整个主体都在 try 里**，这是被实测逼出来的。
  //
  // 一次重构让 `render()` 里少了一个 import，Node 抛出 ReferenceError 并把栈打到
  // stdout，而进程**退出码是 0** —— 一个 CI 或 shell 脚本会认为这次体检通过了。
  // 「明明崩了却报成功」是本项目最不能容忍的失败形态（.sh 的 CLI 空操作、
  // `--update` 旗标失效，都是同一类）。所以：
  //   1) 任何未预料的抛出都必须变成非零退出码；
  //   2) 错误信息走 stderr，stdout 只留结论（否则 `--json | jq` 会吃到一堆栈）；
  //   3) 用退出码 3（= 无法判定），而不是 1/2 —— 那是**插件**的结论码，
  //      工具自己出错不能被误读成"这个插件部分可用"。
  try {
    const result = run(opts);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(toJSON(result), null, 2)}\n`);
    } else {
      process.stdout.write(`${render(result, opts)}\n`);
    }

    if (result.error) process.exit(3);
    // 退出码：不兼容给 2，部分可用给 1，可用给 0 —— 让 CI 能直接用。
    const s = result.verdict.summary;
    process.exit(s.broken > 0 ? 2 : (s.partial > 0 ? 1 : 0));
  } catch (error) {
    process.stderr.write(`✗ 体检工具自身出错（不是插件的问题）：${error && error.stack ? error.stack : error}\n`);
    process.exit(3);
  }
}

// 只有被当作主脚本时才跑 CLI；被 import 时什么都不做。
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
