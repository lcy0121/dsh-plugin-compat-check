#!/usr/bin/env node
/**
 * **调用点层的召回率** —— 用一条**独立**的枚举去对账提取器。
 *
 * ## 为什么是这一个指标，而不是「静默降级的召回率」
 *
 * 「静默降级的召回率」问的是：**所有死掉的功能里，我们报出了几个**。
 * 那个分母**不属于我们** —— 一个插件有哪些功能、哪些死了，是**插件作者**的知识。
 * 要拿到它就得给**每一个**插件写功能测试，而插件的集合是**开放**的
 * （本机 14 个社区插件、21 个被体检的、15 个有客户端半边；换台机器换一批，
 *   而且作者每次发版都可能让测试失效）。**那不是一个"贵"的任务，是一个没有上界的任务。**
 *
 * 我们能负责、也**应该**负责的是它上游的那一层：
 *
 * > **所有会失败的调用点里，我们找到了几个？**
 *
 * 这一层是**可以独立测量**的：用一条**与提取器无关**的枚举（纯正则，不带它那套
 * 守卫/遮蔽/别名规则）去扫同样的文件，再与提取器的结果对账。
 * 对不上的地方就是**候选漏报**，逐条可查。
 *
 * 这与 `tools/parity/parity.sh` 是同一个思路（另一份实现去对拍），
 * 区别是那边的参考实现是 python 版、已经落后；而这里是**从源码直接枚举**，
 * 不依赖任何第二份实现。
 *
 * ## 口径（必须固定）
 *
 * - 只扫**被提取器扫过的文件**（`provenance` 里的桶）—— 否则"漏报"里会混进
 *   "我们有意没扫的文件"（如 `client-extra` 的 vendored 代码）
 * - 只算**已知服务名**上的调用（该插件声明的 + 官方目录里的）
 * - **排除已知提取产物**（`knownExtractionArtifacts`），否则会报一堆"漏了 parser.consume"
 * - 掩码：抹注释与字符串（与调用点扫描同一口径），否则注释里的示例会被算成漏报
 *
 * ## 用法
 *
 *     node tools/extractor-recall.mjs                 # 本机 desktop profile
 *     node tools/extractor-recall.mjs --nm <目录>
 *     node tools/extractor-recall.mjs --json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { extractWithProvenance } from '../lib/extract.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function parseArgs(argv) {
  const out = { nm: null, json: false, showAll: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nm') { out.nm = argv[++i]; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--all') { out.showAll = true; continue; }
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

/**
 * 抹掉注释与字符串（等长）。
 *
 * ⚠️ **必须与提取器同口径**，否则对账没有意义：不抹的话，注释里写的示例代码
 * 会被我这边算成"漏报"，而那些**本来就不该被收**（缺陷 19）。
 * 这里刻意重写一份（而不是 import 提取器的私有函数）—— 对账要的就是
 * **两条独立的实现**，哪怕其中一段逻辑是重复的。
 */
function mask(text) {
  const out = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') { out.push(' '); i++; } continue; }
    if (c === '/' && d === '*') {
      out.push(' ', ' '); i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) { out.push(text[i] === '\n' ? '\n' : ' '); i++; }
      if (i < n) { out.push(' ', ' '); i += 2; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      out.push(c); i++;
      while (i < n) {
        const ch = text[i];
        if (ch === '\\') { out.push(' ', text[i + 1] === '\n' ? '\n' : ' '); i += 2; continue; }
        if (ch === c) { out.push(ch); i++; break; }
        out.push(ch === '\n' ? '\n' : ' '); i++;
      }
      continue;
    }
    out.push(c); i++;
  }
  return out.join('');
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function measure(nmDir) {
  const catalog = readJSON(path.join(REPO, 'rules', 'dsh-api-catalog.json'));
  const rules = readJSON(path.join(REPO, 'rules', 'severity.json'));
  const extract = extractWithProvenance(nmDir, { catalog });
  const provenance = extract.provenance?.packages ?? {};

  const known = new Set([...Object.keys(catalog.host ?? {}), ...Object.keys(catalog.client ?? {})]);
  const artifacts = rules.knownExtractionArtifacts ?? {};
  const artSvc = new Set();
  const artPairs = new Set();
  for (const it of (artifacts.items ?? [])) {
    if (typeof it.methods === 'string') artSvc.add(it.service);
    else if (Array.isArray(it.methods)) for (const m of it.methods) artPairs.add(`${it.service}.${m}`);
  }

  const perPlugin = [];
  let enumerated = 0;
  let matched = 0;
  const candidates = [];

  for (const [pkg, p] of Object.entries(extract.report.perPlugin ?? {})) {
    // 只扫**提取器扫过的文件**（桶里那些）—— 否则"漏报"会混进"我们有意没扫的"
    const prov = provenance[pkg] ?? {};
    const files = Object.values(prov.files ?? {}).flat();
    const svcs = new Set([...(p.services ?? []), ...(p.declaredServices ?? [])]);
    // 提取器记下的站点，按 file:line:svc.method 索引
    const seen = new Set((p.callSites ?? []).map((s) => `${s.file}:${s.line}:${s.service}.${s.method}`));

    // 提取器**自己记下的弃权**。候选里凡是能对上弃权记录的，就不是"漏报"——
    // 那是它在按设计保守（`shadowedBare` = 同名局部变量遮蔽、`ambiguousAliases` = 同名多绑定）。
    // 不做这一步的话，"召回率"里会混进大量**有意弃权**，数字低得没有意义。
    const shadowed = new Set((p.shadowedBare ?? []).map((x) => x.service));
    // 另一条同样有记录的弃权：**该服务名被本地绑定了**（`const sessions = ctx.get("sessions")`），
    // 于是裸名档整条不适用（`if (localBindings.has(svc)) continue`）。
    // 那些裸名出现的地方拿到的是**局部对象**（比如 `const sessions = new Map()`），
    // 不提它们是**对的**。实测这条能解释掉一大批候选。
    const locallyBound = new Set((p.localBindings ?? []).map((x) => x.service));
    const pkgDir = path.join(nmDir, pkg);
    for (const rel of files) {
      let raw;
      try { raw = fs.readFileSync(path.join(pkgDir, rel), 'utf8'); } catch { continue; }
      const code = mask(raw);
      for (const svc of svcs) {
        if (!known.has(svc) || artSvc.has(svc)) continue;
        // 独立枚举：**任何** `<任意前缀>.<svc>.<method>(` —— 不带提取器那套
        // 守卫/遮蔽/别名规则。它更宽，所以对不上时是**候选**漏报，要人看。
        const re = new RegExp(String.raw`(?:[\w$]+\s*\.\s*)?\b` + svc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          + String.raw`\s*\.\s*([A-Za-z_]\w*)\s*(?:\?\.)?\s*\(`, 'g');
        for (const m of code.matchAll(re)) {
          const pair = `${svc}.${m[1]}`;
          if (artPairs.has(pair)) continue;
          enumerated++;
          const key = `${rel}:${lineOf(code, m.index)}:${pair}`;
          if (seen.has(key)) { matched++; continue; }
          // 同一行同一对可能被算两次（前缀不同）—— 去重交给最后
          const why = shadowed.has(svc)
            ? 'shadowed-bare（该名字在本文件里被当作局部变量用过 → 裸名含义不明 → 弃权）'
            : (locallyBound.has(svc)
              ? 'locally-bound（该服务名被本地绑定了 → 裸名档整条不适用；那些裸名拿到的是局部对象）'
              : null);
          candidates.push({ plugin: pkg, file: rel, line: lineOf(code, m.index), pair, why });
        }
      }
    }
  }

  // 去掉重复（同一 file:line:pair）
  const uniq = new Map();
  for (const c of candidates) uniq.set(`${c.plugin}:${c.file}:${c.line}:${c.pair}`, c);
  const list = [...uniq.values()];
  const explained = list.filter((c) => c.why !== null);
  const unexplained = list.filter((c) => c.why === null);

  return {
    nodeModules: nmDir,
    plugins: Object.keys(extract.report.perPlugin ?? {}).length,
    enumerated,
    matched,
    candidates: list.length,
    candidatesExplained: explained.length,
    candidatesUnexplained: unexplained.length,
    recall: enumerated === 0 ? null : Number((matched / enumerated).toFixed(4)),
    recallAfterExplained: enumerated === 0 ? null
      : Number(((matched + explained.length) / enumerated).toFixed(4)),
    examples: unexplained.slice(0, 25),
  };
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n用法: node tools/extractor-recall.mjs [--nm <目录>] [--json]\n`);
    process.exit(3);
  }
  const nm = opts.nm
    || path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'desktop', 'node_modules');
  if (!fs.existsSync(nm)) { process.stderr.write(`目录不存在: ${nm}\n`); process.exit(3); }

  const r = measure(nm);
  if (opts.json) { process.stdout.write(`${JSON.stringify(r, null, 2)}\n`); process.exit(0); }

  const pct = r.recall === null ? '—' : `${(r.recall * 100).toFixed(1)}%`;
  process.stdout.write(`提取器的调用点层召回 —— ${path.basename(path.dirname(nm))}\n\n`);
  process.stdout.write(`  独立枚举（纯正则，不带提取器的规则）  ${r.enumerated} 个站点\n`);
  process.stdout.write(`  提取器也记下了的                      ${r.matched} 个\n`);
  process.stdout.write(`  对不上账                          ${r.candidates} 个\n`);
  process.stdout.write(`    ├─ 其中**有意弃权**（有记录）      ${r.candidatesExplained} 个  ← 不是漏报\n`);
  process.stdout.write(`    └─ **要人看的**                    ${r.candidatesUnexplained} 个\n`);
  process.stdout.write(`\n  原始召回率                  ${r.matched} / ${r.enumerated} = **${pct}**\n`);
  const pct2 = r.recallAfterExplained === null ? '—' : `${(r.recallAfterExplained * 100).toFixed(1)}%`;
  process.stdout.write(`  扣掉有意弃权之后            = **${pct2}**   ← 这个才是"我们还欠多少"\n\n`);
  process.stdout.write('  ⚠️ 独立枚举**故意更宽**（它不管守卫、遮蔽、别名），所以"要人看的"仍然\n');
  process.stdout.write('     可能包含少量有意弃权 —— 但它是一个**有界、可逐条查**的队列。\n');
  if (r.examples.length) {
    process.stdout.write('\n  对不上账的样例：\n');
    for (const e of r.examples) {
      process.stdout.write(`    ${e.pair.padEnd(34)} ${e.plugin.split('/').pop().slice(0, 22).padEnd(24)} ${e.file}:${e.line}\n`);
    }
  }
}

main();
