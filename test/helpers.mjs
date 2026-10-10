/**
 * 测试助手：特征快照 + 判据。
 *
 * 这一层解决的是一件事：**改动必须被看见**。
 * 提取结果是几百 KB 的 JSON，逐字提交进仓库既读不动、也压不住审查
 * （没人会在 PR 里逐行看 37 万个字符）。所以这里分两份东西：
 *
 *   1. **快照**（`__snapshots__/*.json`）：每个插件的关键字段 + 一个内容哈希。
 *      哈希抓「变了没有」，而**关键字段是并排写进文件里的**，所以失败时能直接
 *      看出变了什么，不是只有一个摘要。哈希用 SHA-256，排序稳定、无时间戳、
 *      无绝对路径 —— 换机器同样成立。
 *
 *   2. **判据**（`__expectations__/*.json`）：人写的、可审查的期望值。
 *      「这个插件必须报这条、必须不报那条」。这是**唯一允许断言具体值的地方**，
 *      因为它写的是业务结论，不是实现细节。
 *
 * 为什么两者都要：快照只回答「变了没有」，回答不了「变错了没有」——
 * 一次错误的改动如果被如实记进快照，下次就永远绿。判据反过来，
 * 但它只能覆盖人想到的情形。两者互补，缺一不可。
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const REPO = path.resolve(new URL('.', import.meta.url).pathname, '..')

export function readJSON(p) {
  return JSON.parse(fs.readFileSync(path.isAbsolute(p) ? p : path.join(REPO, p), 'utf8'))
}

export const loadRules = () => readJSON('rules/severity.json')
export const loadCatalog = () => readJSON('rules/dsh-api-catalog.json')

/** 稳定序列化：键排序，保证同样内容永远得到同样的字节 */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value === undefined ? null : value)
}

export const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex')

/**
 * 从提取结果里挑出**关键字段**。
 *
 * 选择标准是「判定层会不会用它」以及「它出错时人要不要立刻看见」，
 * 而不是「有什么就记什么」—— 后者等于把 37 万字符换个地方放。
 */
export function summarizeExtract(report, provenance) {
  const plugins = {}
  for (const [name, p] of Object.entries(report.perPlugin)) {
    plugins[name] = {
      version: p.version,
      // 文件集选择是整个提取的地基：它错了，下面全错
      files: p.files,
      fallback: p.fallback,
      services: p.services,
      declaredServices: p.declaredServices,
      calls: p.calls,
      // 证据形态分布：一眼看出结论有多少来自最强证据、多少来自兜底
      via: countBy(p.callSites || [], (s) => s.via),
      // 每个服务各自的调用点数，比总数更能反映结构
      siteCounts: countBy(p.callSites || [], (s) => s.service),
      localBindings: (p.localBindings || []).map((b) => `${b.variable}->${b.service ?? '(歧义)'}/${b.form}`),
      providedServices: p.providedServices,
      guardedPairs: p.guardedPairs,
      // 弃权台账必须进快照：空谈「放弃了什么」没有意义，它一变就要看见
      shadowedBare: (p.shadowedBare || []).map((x) => `${x.file}:${x.service}`),
      unresolvedBindings: (p.unresolvedBindings || []).map((x) => `${x.file}:${x.variable}->${x.service}`),
      ambiguousAliases: (p.ambiguousAliases || []).map((x) => `${x.file}:${x.variable}=${x.services.join('|')}`),
      subContexts: (p.subContexts || []).filter((x) => x.names.length).map((x) => `${x.file}:${x.names.join(',')}`),
    }
  }
  const buckets = {}
  for (const [pkg, pk] of Object.entries(provenance.packages)) buckets[pkg] = pk.counts
  return {
    manifests: report.manifests,
    services: report.services,
    fallbackPackages: report.fallbackPackages,
    providedServices: report.providedServices,
    siteTotal: (report.callSites || []).length,
    buckets,
    plugins,
  }
}

function countBy(list, key) {
  const out = {}
  for (const x of list) {
    const k = key(x)
    out[k] = (out[k] || 0) + 1
  }
  return Object.fromEntries(Object.entries(out).sort())
}

/** 从判定结果里挑出关键字段：结论、确定性、位置、以及**为什么没报** */
export function summarizeVerdict(verdict) {
  const plugins = {}
  for (const [name, p] of Object.entries(verdict.plugins)) {
    plugins[name] = {
      verdict: p.verdict,
      findings: p.findings.map((f) => ({
        category: f.category,
        certainty: f.certainty,
        severity: f.severity,
        api: f.service ? (f.method ? `${f.service}.${f.method}` : f.service) : null,
        location: f.location ? `${f.location.file}:${f.location.line}` : null,
        impact: f.impact,
      })),
      clientSide: (p.clientSide || []).map((c) => c.service),
      // 「没报」和「报了」一样要能审：过滤与弃权是结论的一部分
      filtered: (p.filtered || []).map((x) => `${x.service}${x.method ? '.' + x.method : ''}`),
      abstained: (p.abstained || []).map((x) => x.service),
      runtimeFacilities: (p.runtimeFacilities || []).map((x) => x.name),
    }
  }
  return { summary: verdict.summary, plugins }
}

/**
 * 计算快照。**不含任何绝对路径、时间戳或环境相关值** —— 否则它就不是快照，
 * 而是「本机今天的输出」。
 */
export function buildSnapshot(extract, verdict) {
  const e = summarizeExtract(extract.report, extract.provenance)
  const v = summarizeVerdict(verdict)
  return {
    schemaVersion: 1,
    _note: '由 `node test/snapshot.test.mjs --update` 生成。哈希只在这里出现一次，'
      + '因为「变了没有」由它回答；「变错了没有」由 __expectations__/ 里人写的判据回答。',
    extract: { hash: sha256(stable(e)), ...e },
    verdict: { hash: sha256(stable(v)), ...v },
  }
}

/** 逐字段比较，返回人类可读的差异行（最多 limit 行） */
export function diffValues(a, b, pathStr = '$', out = [], limit = 40) {
  if (out.length >= limit) return out
  if (a === undefined || b === undefined) {
    out.push(`${pathStr}: ${a === undefined ? '新增' : '消失'} → ${JSON.stringify(a === undefined ? b : a).slice(0, 120)}`)
    return out
  }
  if (typeof a !== typeof b) { out.push(`${pathStr}: 类型变了 ${typeof a} → ${typeof b}`); return out }
  if (Array.isArray(a) || Array.isArray(b)) {
    const xa = a || [], xb = b || []
    if (xa.length !== xb.length) out.push(`${pathStr}: 长度 ${xa.length} → ${xb.length}`)
    for (let i = 0; i < Math.max(xa.length, xb.length); i++) diffValues(xa[i], xb[i], `${pathStr}[${i}]`, out, limit)
    return out
  }
  if (a && b && typeof a === 'object') {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      diffValues(a[k], b[k], `${pathStr}.${k}`, out, limit)
    }
    return out
  }
  if (a !== b) out.push(`${pathStr}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
  return out
}

export function snapshotPaths(name) {
  return {
    snapshot: path.join(REPO, 'test', '__snapshots__', `${name}.json`),
    expectations: path.join(REPO, 'test', '__expectations__', `${name}.json`),
  }
}
