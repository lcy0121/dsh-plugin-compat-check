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
 *   仓库安装检查脚本  → `node bin/compat-check.mjs --nm <dir> --probe <json>`
 *   skill        → 教 agent 何时调用上面这一条
 *
 * ## 设计约束
 *
 * - **绝不抛**给调用方看栈：任何失败都变成一条 `error` 结论 + 非零退出码。
 *   一个体检工具自己抛栈，用户无法区分「插件坏了」还是「工具坏了」。
 * - **结论必须带确定性**。没有运行时面时（只给了目录、没有探针报告），
 *   方法级结论一律降为「疑似」—— 这是 docs/Plan.md §2.2 的三档判据，不是可选项。
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
import {baselinePath,baselineIdentity,baselineTransaction,readBaseline as readStoredBaseline,writeBaseline as writeStoredBaseline} from '../lib/state-store.mjs';
import {probeProfile} from '../lib/probe-runner.mjs';
import { TOOL_VERSION, versionLine } from '../lib/version.mjs';
import {createFailure,exitCodeForSummary} from '../lib/contracts.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `用法: node bin/compat-check.mjs --nm <node_modules 目录> [选项]

${versionLine()}

选项:
  --nm <dir>       要体检的 node_modules 目录（必需）。也接受 profile 目录，
                   会自动补 node_modules 子目录。
  --probe <json>   宿主运行时观测（探针报告）。身份/时间/完整性及源码归属满足要求时，
                   可支持确定结论；无观测则方法级目录结论降为「疑似」。
  --probe-boot     自己起一次宿主来拿运行时面（不需要已有的探针报告）。
                   会建一个临时 profile、装探针、真实启动、回收报告、删掉临时 profile。
                   默认**不开**：它要起进程、要等几十秒，而多数检查不需要它。
                   给了它就不必再给 --probe（两者同时给时以 --probe 为准）。
  --probe-timeout <秒>  --probe-boot 的启动等待上限（默认 40）
  --probe-keep-dir <dir>  把探针报告与 services.json 留一份到该目录（排查用）
  --dsh-version <v> 目标 DSH 版本（用于声明/peer范围判断；显式值优先）。
  --rules <json>   覆盖 severity 规则表（默认 rules/severity.json）
  --catalog <json> 覆盖官方 API 目录（默认 rules/dsh-api-catalog.json）
  --no-baseline    不读写本机基线（CI / 一次性检查用）
  --baseline-file <path>  指定基线文件（默认按 profile 分文件放在 $DSH_HOME 下）
  --dry-run        算出差分但不写基线
  --json           输出机器可读的完整结论，而不是给人看的表
  --quiet          只输出结论行，不输出逐条发现
  --version        显示工具版本（结论的可追溯性依赖它，见 lib/version.mjs）
  --help           显示这段文字

退出码（**1 与 2 只表示插件的结论**，3 表示这次体检本身没得出可信结论）:
  0  未发现问题（仍需检查 coverage / vacuous / 观测限制）
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
    if (a === '--version' || a === '-V') { out.version = true; continue; }
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
const baselineFileFor=(nm,profile,mode='catalogue')=>baselinePath(nm,mode,profile);
const readBaseline=readStoredBaseline;
const writeBaseline=writeStoredBaseline;

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
/* ── 内核 ──────────────────────────────────────────────────────────── */

/**
 * 跑一次体检。**不打印、不退出**，只返回结构化结果 —— 这样插件半边也能直接调它。
 *
 * @returns {{ extract: object, verdict: object|null, error: string|null, inputs: object }}
 */
export function run(options = {}) {
  const result = { extract: null, verdict: null, error: null, inputs: {} };
  try {
    if(options.probeBoot&&!options.probe)throw new Error('--probe-boot requires the asynchronous runAsync() API');
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

    const probePath = options.probe || (!options._ignoreAutoProbe ? findProbeReport(nm) : null);
    let hostSurface = options._hostSurface || null;
    if(probePath && !hostSurface){hostSurface=readJSON(probePath,'探针报告');result.inputs.probe=probePath;}
    if(options._probeBootInfo){result.inputs.probeBoot=options._probeBootInfo;result.inputs.probe='(--probe-boot 实时采集)';}
    result.inputs.hasRuntimeSurface = Boolean(hostSurface);

    result.verdict = buildVerdicts({
      report: extracted.report,
      hostSurface,
      rules,
      catalog,
      dshVersion: options.dshVersion || null,
      observationTarget:{profileId:nm,maxAgeMs:24*60*60*1000},
    });

    result.inputs.hasRuntimeSurface=result.verdict.observation.usable;
    // ── 基线差分 ──
    // `--no-baseline` 关掉它（CI 里跑一次性检查时不该读写本机状态）。
    result.baseline = null;
    if (options.baseline !== false) {
      const file = options.baselineFile || baselineFileFor(nm, options.profile,result.verdict.observation.mode);
      result.inputs.baselineFile = file;
      const snap=snapshotForBaseline(result.verdict,options.dshVersion||null,baselineIdentity(nm,result.verdict.observation.mode,rules,catalog));
      result.baseline=baselineTransaction(file,snap,{advance:!options.dryRun&&extracted.report.scanComplete});
    }
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  }
  return result;
}

export async function runAsync(options={}) {
  if(!options.probeBoot || options.probe)return run(options);
  const before=run({...options,probeBoot:false,baseline:false,_ignoreAutoProbe:true});
  if(before.error)return before;
  const boot=await probeProfile(before.inputs.nodeModules,{timeoutSec:options.probeTimeout||40,keepDir:options.probeKeepDir,services:before.extract.report.services,manifests:before.extract.report.manifests});
  const info={notes:boot.notes,error:boot.error,tempProfile:boot.tempProfile,tempProfileRemoved:boot.tempProfileRemoved};
  if(boot.error)return {...before,error:boot.error,inputs:{...before.inputs,probeBoot:info}};
  return run({...options,dshVersion:options.dshVersion||boot.surface?.dshVersion||null,probeBoot:false,_hostSurface:boot.surface,_ignoreAutoProbe:true,_probeBootInfo:info});
}

/* ── 给人看的渲染 ──────────────────────────────────────────────────── */

/* ── CLI ───────────────────────────────────────────────────────────── */

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    if(process.argv.includes('--json'))process.stdout.write(JSON.stringify(createFailure(error.message,{toolVersion:TOOL_VERSION}))+'\n');else process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(3);
  }
  // `--version` 先于一切：它不该需要 --nm，也不该碰任何状态。
  // 结论的可追溯性靠它 —— 用户拿着一条结论来问，第一句就得知道是哪一版给的。
  if (opts.version) {
    process.stdout.write(`${versionLine()}\n`);
    process.exit(0);
  }
  if (opts.help || !opts.nm) {
    if(!opts.help && opts.json)process.stdout.write(JSON.stringify(createFailure('需要 --nm',{toolVersion:TOOL_VERSION}))+'\n');else process.stdout.write(USAGE);
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
    const result = await runAsync(opts);
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(toJSON(result), null, 2)}\n`);
    } else {
      process.stdout.write(`${render(result, opts)}\n`);
    }

    if (result.error) process.exit(3);
    // 退出码：不兼容给 2，部分可用给 1，可用给 0 —— 让 CI 能直接用。
    const s = result.verdict.summary;
    process.exit(exitCodeForSummary(s));
  } catch (error) {
    if(opts.json)process.stdout.write(JSON.stringify(createFailure(error.message,{toolVersion:TOOL_VERSION}))+'\n');else process.stderr.write(`✗ 体检工具自身出错（不是插件的问题）：${error && error.stack ? error.stack : error}\n`);
    process.exit(3);
  }
}

// 只有被当作主脚本时才跑 CLI；被 import 时什么都不做。
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
