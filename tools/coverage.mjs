#!/usr/bin/env node
/**
 * 规则表覆盖率的**可复现**度量。
 *
 * ## 为什么要有这个脚本
 *
 * `rules/README.md` 里那张覆盖率表以前是**手工算的**，于是它必然是**一次性快照**：
 * 提取器一改、desktop profile 的插件集一变，数字就悄悄过期，而表面上看不出来。
 * 实测就是这么烂掉的 —— 表里写「58 个服务 / 234 个 (服务,方法) 对」，
 * 而同一时刻真实值是 **80 / 227**（数字来自不同的两天，混在一张表里）。
 *
 * 一张会过期却没人知道的覆盖率表，比没有表更糟：它看起来像证据。
 * 所以把它变成**一条命令**，并在 README 里写明「数字由它生成」。
 *
 * ## 用法
 *
 *     node tools/coverage.mjs                    # 默认读本机 desktop profile
 *     node tools/coverage.mjs --nm <目录>
 *     node tools/coverage.mjs --json             # 机器可读
 *     node tools/coverage.mjs --write            # 顺带刷新 rules/usage-inventory.json
 *
 * ## 口径（必须写死在文档里，否则数字之间不可比）
 *
 * - **用到的服务**：`perPlugin[*].calls` 的键的并集 —— 也就是**真的有调用点**的服务。
 *   它与 `report.services` 不是一回事：后者还包含"只被声明过"和"只出现过名字"的，
 *   拿它当分母会把覆盖率算**低**（分母里有永远不会被规则的项）。
 * - **(服务,方法) 对**：同一份 `calls` 展开。这是**方法级**判定的分母。
 * - **被规则覆盖**：该服务在 `severity.json` 里；方法级还要 `methods[方法]` 存在，
 *   或该服务给了 `default`（服务级兜底档）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractWithProvenance } from '../lib/extract.mjs';
import { buildVerdicts } from '../lib/verdict.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { json: false, write: false, nm: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { out.json = true; continue; }
    if (a === '--write') { out.write = true; continue; }
    if (a === '--nm') { out.nm = argv[++i]; continue; }
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

/** 服务级是否有规则；以及方法级是否有规则（`methods[m]` 或服务级 `default`） */
function ruleFor(rules, svc, method) {
  const entry = rules.services[svc];
  if (!entry) return { service: false, method: false };
  const hasMethod = Boolean(entry.methods && entry.methods[method]);
  const hasDefault = Boolean(entry.default);
  return { service: true, method: hasMethod || hasDefault };
}

function measure(nmDir) {
  const catalog = readJSON(path.join(REPO, 'rules', 'dsh-api-catalog.json'));
  const rules = readJSON(path.join(REPO, 'rules', 'severity.json'));
  const extract = extractWithProvenance(nmDir, { catalog });

  // 口径：只算**真的有调用点**的服务/方法对
  const usedServices = new Set();
  const pairs = new Set();
  for (const p of Object.values(extract.report.perPlugin || {})) {
    for (const [svc, methods] of Object.entries(p.calls || {})) {
      usedServices.add(svc);
      for (const m of methods) pairs.add(`${svc}.${m}`);
    }
  }

  // ⚠️ **已知提取产物要排除**，但要按**方法粒度**，不能按服务粒度。
  //
  // `rules/severity.json` 的 `knownExtractionArtifacts` 逐条写了"不要为这些补规则"：
  // 它们是正则的产物（vendored 代码里的同名局部变量、集合方法名），不是 DSH API。
  // 把它们算进"缺规则"，度量出来的会是一个**不该被填的缺口**。
  //
  // 但**排除的粒度很要紧**：条目里大部分是"某服务下的某几个方法"是产物
  // （`sessions` 有 11 个、`jobs` 有 13 个是集合方法名），而 `sessions` / `jobs`
  // 本身是**真宿主服务**。按服务粒度排会把真服务一起排掉 ——
  // 实测第一版就这么干了，把 `agents` / `locale` / `sessions` / `settings` / `tools`
  // 全排除（5 个真服务），覆盖率被算高。
  //
  // 所以：`methods` 是字符串（如 "全部 40 个"）→ 整个服务是产物；
  // `methods` 是数组 → 只排列出的那些方法。
  const artifacts = rules.knownExtractionArtifacts || {};
  const artifactServices = new Set();   // 整个服务都是产物
  const artifactPairs = new Set();      // 只是某些方法是产物
  for (const it of (artifacts.items || [])) {
    if (!it || !it.service) continue;
    if (typeof it.methods === 'string') {
      artifactServices.add(it.service);
    } else if (Array.isArray(it.methods)) {
      for (const m of it.methods) artifactPairs.add(`${it.service}.${m}`);
    }
  }
  const realServices = [...usedServices].filter((x) => !artifactServices.has(x));
  const realPairs = [...pairs].filter((pr) => {
    const i = pr.lastIndexOf('.');
    return !artifactServices.has(pr.slice(0, i)) && !artifactPairs.has(pr);
  });

  let svcCovered = 0;
  let pairCovered = 0;
  const uncoveredServices = [];
  // 只把**排完产物后仍有真实调用点**的服务算进来。
  // 否则 `ruleNames` 这种"全部方法都是产物"的服务会以"缺规则"的身份留在名单里 ——
  // 而规则表明确写了不要为它补规则，于是那是一条**永远不该被关掉的待办**。
  const servicesWithRealPairs = new Set(realPairs.map((pr) => pr.slice(0, pr.lastIndexOf('.'))));
  for (const s of realServices) {
    if (!servicesWithRealPairs.has(s)) continue;
    if (ruleFor(rules, s, '').service) svcCovered++;
    else uncoveredServices.push(s);
  }
  for (const pr of realPairs) {
    const i = pr.lastIndexOf('.');
    if (ruleFor(rules, pr.slice(0, i), pr.slice(i + 1)).method) pairCovered++;
  }

  // 引擎实测：真的跑一遍判定，看有多少发现落到「影响面未知」的默认档
  const hostSurface = null; // 覆盖率和运行时面无关，故意不给 —— 数字更容易复现
  const verdict = buildVerdicts({
    report: extract.report, hostSurface, rules, catalog, dshVersion: null,
  });
  const findings = Object.values(verdict.plugins).flatMap((p) => p.findings || []);
  const unknownImpact = findings.filter((f) => f.ruleSource === 'default');

  return {
    capturedAt: new Date().toISOString().slice(0, 10),
    nodeModules: nmDir,
    manifests: extract.report.manifests.length,
    usedServices: realServices.length,
    usedServicesRaw: usedServices.size,
    pairs: realPairs.length,
    pairsRaw: pairs.size,
    artifactServicesExcluded: [...artifactServices].filter((x) => usedServices.has(x)).sort(),
    artifactPairsExcluded: [...artifactPairs].filter((x) => pairs.has(x)).length,
    servicesInTable: Object.keys(rules.services).length,
    servicesWithMethods: Object.values(rules.services)
      .filter((v) => v && v.methods && Object.keys(v.methods).length).length,
    coveredServices: svcCovered,
    coveredPairs: pairCovered,
    engineFindings: findings.length,
    engineRuleHit: findings.length - unknownImpact.length,
    engineUnknownImpact: unknownImpact.length,
    uncoveredServices: uncoveredServices.sort(),
    perPlugin: Object.fromEntries(
      Object.entries(extract.report.perPlugin).map(([n, p]) => [n, {
        version: p.version,
        usedServices: Object.keys(p.calls || {}).length,
        pairs: Object.values(p.calls || {}).reduce((a, m) => a + m.length, 0),
      }]),
    ),
  };
}

function render(m) {
  const pct = (a, b) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);
  return [
    `规则表覆盖率（${m.capturedAt}，样本 ${path.basename(path.dirname(m.nodeModules))}）`,
    '',
    `  插件            ${m.manifests}`,
    `  有调用点的服务   ${m.usedServices}      表中覆盖 ${m.coveredServices} / ${m.usedServices}（${pct(m.coveredServices, m.usedServices)}）`,
    `                  （原始 ${m.usedServicesRaw} 个；已排除 ${m.artifactServicesExcluded.length} 个纯产物的服务`
      + `${m.artifactPairsExcluded ? ` 与 ${m.artifactPairsExcluded} 个 (服务,方法) 对` : ''}）`,
    `  (服务,方法) 对   ${m.pairs}     表中覆盖 ${m.coveredPairs} / ${m.pairs}（${pct(m.coveredPairs, m.pairs)}）`,
    `  表中服务总数     ${m.servicesInTable}   其中有方法级子表 ${m.servicesWithMethods}`,
    '',
    `  引擎实测发现     ${m.engineFindings}`,
    `    规则表命中     ${m.engineRuleHit}`,
    `    落到默认档     ${m.engineUnknownImpact}   ← 这一项才是真正有意义的指标`,
    '',
    m.uncoveredServices.length
      ? `  没有规则的服务（${m.uncoveredServices.length}）：${m.uncoveredServices.join(', ')}`
      : '  没有规则的服务：无',
  ].join('\n');
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n用法: node tools/coverage.mjs [--nm <目录>] [--json] [--write]\n`);
    process.exit(3);
  }
  const nm = opts.nm
    || path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'profiles', 'desktop', 'node_modules');
  if (!fs.existsSync(nm)) {
    process.stderr.write(`目录不存在: ${nm}\n  用 --nm 指定一个 node_modules 目录\n`);
    process.exit(3);
  }
  let m;
  try {
    m = measure(nm);
  } catch (error) {
    process.stderr.write(`度量失败: ${error.message}\n`);
    process.exit(3);
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(m, null, 2)}\n`);
  else process.stdout.write(`${render(m)}\n`);

  if (opts.write) {
    // `usage-inventory.json` 的契约见 rules/README.md：它是"覆盖依据"的快照，
    // 不是规范。字段名保持与历史一致（services / manifests / pairs），
    // 但把口径写进 `_note`，免得下一个人以为是 `report.services`。
    const out = {
      _note: '由 `node tools/coverage.mjs --write` 生成的真实输出，用作严重度规则表的覆盖依据。'
        + '**不是规范。** 口径：`usedServices` 与 `pairs` 只算**真的有调用点**的'
        + '（`perPlugin[*].calls` 的并集），不是 `report.services` —— 后者含只被声明过的项，'
        + '拿它当分母会把覆盖率算低。',
      _capturedAt: m.capturedAt,
      _dshVersion: null,
      _generatedBy: 'tools/coverage.mjs',
      _knownGaps: [
        '这是**一台机器的一个 profile** 的快照，不是生态普查。',
        '`engineUnknownImpact` 是唯一真正有意义的口径，前几行都只是它的分解。',
      ],
      manifests: m.manifests,
      services: m.usedServices,
      pairs: m.pairs,
      pairsRaw: m.pairsRaw,
      artifactServicesExcluded: m.artifactServicesExcluded,
      artifactPairsExcluded: m.artifactPairsExcluded,
      coveredServices: m.coveredServices,
      coveredPairs: m.coveredPairs,
      engineFindings: m.engineFindings,
      engineRuleHit: m.engineRuleHit,
      engineUnknownImpact: m.engineUnknownImpact,
      uncoveredServices: m.uncoveredServices,
      perPlugin: m.perPlugin,
    };
    fs.writeFileSync(
      path.join(REPO, 'rules', 'usage-inventory.json'),
      `${JSON.stringify(out, null, 2)}\n`,
    );
    process.stdout.write(`\n已刷新 rules/usage-inventory.json\n`);
  }
}

main();
