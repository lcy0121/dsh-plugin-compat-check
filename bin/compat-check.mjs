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
  const takesValue = new Set(['--nm', '--probe', '--dsh-version', '--rules', '--catalog', '--baseline-file', '--profile']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
    if (a === '--no-baseline') { out.baseline = false; continue; }
    if (a === '--dry-run') { out.dryRun = true; continue; }
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

    const probePath = options.probe || findProbeReport(nm);
    let hostSurface = null;
    if (probePath) {
      hostSurface = readJSON(probePath, '探针报告');
      result.inputs.probe = probePath;
    }
    result.inputs.hasRuntimeSurface = Boolean(hostSurface);

    const extracted = extractWithProvenance(nm, { catalog });
    result.extract = extracted;

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
