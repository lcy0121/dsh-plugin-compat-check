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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractWithProvenance } from '../lib/extract.mjs';
import { buildVerdicts, DISPOSITION } from '../lib/verdict.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const VERDICT_LABEL = { ok: '可用', partial: '部分可用', broken: '不兼容', unknown: '未知' };
const SEVERITY_LABEL = { fatal: '致命', 'feature-dead': '功能失效', degraded: '降级' };
const CATEGORY_LABEL = {
  'host-service-missing': '宿主服务缺失',
  'host-method-missing': '宿主方法缺失',
  'unprovided-dependency': '无人提供的依赖',
  'declaration-mismatch': '声明与实测不符',
};

const USAGE = `用法: node bin/compat-check.mjs --nm <node_modules 目录> [选项]

选项:
  --nm <dir>       要体检的 node_modules 目录（必需）。也接受 profile 目录，
                   会自动补 node_modules 子目录。
  --probe <json>   宿主运行时面（探针报告）。给了它，方法级结论才是「确定」；
                   不给则退回官方目录，结论降为「疑似」。
  --dsh-version <v> 当前 DSH 版本（用于「声明与实测不符」这一类结论）。
  --rules <json>   覆盖 severity 规则表（默认 rules/severity.json）
  --catalog <json> 覆盖官方 API 目录（默认 rules/dsh-api-catalog.json）
  --json           输出机器可读的完整结论，而不是给人看的表
  --quiet          只输出结论行，不输出逐条发现
  --help           显示这段文字
`;

/* ── 参数解析：手写，零依赖；未知参数一律报错而不是忽略 ────────────── */

function parseArgs(argv) {
  const out = { json: false, quiet: false };
  const takesValue = new Set(['--nm', '--probe', '--dsh-version', '--rules', '--catalog']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
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
  } catch (error) {
    result.error = error && error.message ? error.message : String(error);
  }
  return result;
}

/* ── 给人看的渲染 ──────────────────────────────────────────────────── */

const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};

function render(result, opts) {
  const L = [];
  const { verdict, extract } = result;

  if (result.error) {
    L.push(`结论: 无法判定 —— ${result.error}`);
    return L.join('\n');
  }

  const meta = extract.report.manifests;
  // `--quiet` 只输出那一条总结论。真实 profile 上有 21 个插件、每个几行，
  // 而这个开关的用途是「脚本里只要一个信号」—— 它必须真的安静，而不是「安静一点」。
  // （本会话里已经踩过一次死参数：.sh 的 --json 被解析却从没被用过。）
  if (opts.quiet) {
    const q = verdict.summary;
    L.push(`结论: ${VERDICT_LABEL.ok} ${q.ok}    ${VERDICT_LABEL.partial} ${q.partial}    ${VERDICT_LABEL.broken} ${q.broken}`);
    return L.join('\n');
  }

  L.push(`插件数: ${meta.length}    有运行时面: ${result.inputs.hasRuntimeSurface ? '是' : '否（方法级结论降为「疑似」）'}`);
  L.push('');

  const s = verdict.summary;
  L.push(`结论: ${VERDICT_LABEL.ok} ${s.ok}    ${VERDICT_LABEL.partial} ${s.partial}    ${VERDICT_LABEL.broken} ${s.broken}`
    + (s.vacuousOk ? `    （其中 ${s.vacuousOk} 个「可用」是空洞的：它没有任何可检查的依赖）` : ''));
  L.push('');

  const names = Object.keys(verdict.plugins).sort((a, b) => {
    const rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
    return rank[verdict.plugins[a].verdict] - rank[verdict.plugins[b].verdict] || a.localeCompare(b);
  });

  for (const name of names) {
    const p = verdict.plugins[name];
    L.push(`${VERDICT_LABEL[p.verdict]}  ${name}@${p.version}${p.vacuous ? '   [空洞的结论：无可检查对象]' : ''}`);
    if (opts.quiet) continue;
    for (const f of p.findings) {
      const api = f.service ? (f.method ? `${f.service}.${f.method}` : f.service) : '(声明)';
      const loc = f.location ? `${f.location.file}:${f.location.line}` : '-';
      const cert = f.certainty === 'certain' ? '' : ' [疑似]';
      L.push(`     ${SEVERITY_LABEL[f.severity] ?? f.severity} / ${CATEGORY_LABEL[f.category] ?? f.category}${cert}  ${api}  @ ${loc}`);
      if (f.impact) L.push(`       影响: ${f.impact}`);
      if (f.basis) L.push(`       依据: ${f.basis}`);
    }
    // 「没报」和「报了」一样要能审：过滤与弃权是结论的一部分。
    const cs = p.clientSide || [];
    if (cs.length) L.push(`     客户端半边（命令行测不到，需界面验证）: ${cs.map((c) => c.service).join(', ')}`);
    const filtered = p.filtered || [];
    if (filtered.length) L.push(`     已过滤（判为噪音/有兜底）: ${filtered.map((x) => `${x.service}${x.method ? '.' + x.method : ''}`).join(', ')}`);
    const noCalls = Object.values(p.resolved || {}).filter((c) => c.disposition === DISPOSITION.NO_CALLS);
    if (noCalls.length) L.push(`     无证据可判（只出现名字，没有调用点）: ${noCalls.map((c) => c.service).join(', ')}`);
  }

  L.push('');
  L.push('说明: 「疑似」= 没有运行时面、只能靠官方目录推断（那份目录是契约目录，不是运行时面）。');
  L.push('      假阳性会让用户去做不必要的处置，所以判不准时一律降级，而不是升格成确定。');
  return L.join('\n');
}

/** 机器可读形态：保留完整结论，但把 extract 换成一个摘要（原始输出可能几 MB） */
function toJSON(result) {
  if (result.error) return { error: result.error, inputs: result.inputs };
  const report = result.extract.report;
  return {
    schemaVersion: 1,
    inputs: result.inputs,
    dshVersion: result.verdict.dshVersion,
    summary: result.verdict.summary,
    plugins: result.verdict.plugins,
    extraction: {
      manifests: report.manifests,
      services: report.services,
      fallbackPackages: report.fallbackPackages,
      siteTotal: (report.callSites || []).length,
      provenanceCounts: Object.fromEntries(
        Object.entries(result.extract.provenance.packages).map(([k, v]) => [k, v.counts]),
      ),
    },
  };
}

/* ── CLI ───────────────────────────────────────────────────────────── */

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help || !opts.nm) {
    process.stdout.write(USAGE);
    process.exit(opts.help ? 0 : 2);
  }

  const result = run(opts);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(toJSON(result), null, 2)}\n`);
  } else {
    process.stdout.write(`${render(result, opts)}\n`);
  }

  if (result.error) process.exit(1);
  // 退出码：不兼容给 2，部分可用给 1，可用给 0 —— 让 CI 能直接用。
  const s = result.verdict.summary;
  process.exit(s.broken > 0 ? 2 : (s.partial > 0 ? 1 : 0));
}

// 只有被当作主脚本时才跑 CLI；被 import 时什么都不做。
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main();
}
