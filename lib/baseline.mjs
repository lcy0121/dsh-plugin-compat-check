/**
 * 基线：回答「**变了没有**」，以及变了多少、往哪个方向变。
 *
 * ## 为什么需要它（这不是「锦上添花」）
 *
 * 本产品的核心是"你现在装的东西跟这版 DSH 兼不兼容"。但一次体检只能回答
 * **当前状态**，而用户真正会问的是：
 *
 *   「我昨天还是好的，今天怎么就不行了？」
 *
 * 这个问题的答案**不在任何单次输出里** —— 它是一次差分。触发差分的通常是
 * 用户没做、也没注意到的事：DSH 升级了、某个插件自动更新了、pnpm 换了版本。
 * 所以基线不是缓存，是**把"和上次比"变成一件不需要用户记得的事**。
 *
 * ## 两条硬约束
 *
 * 1. **只写自己的状态目录**（Plan.md §2 第 1 题：插件严格只读之外的唯一例外）。
 *    不联网、不外传 —— 「我装了哪些插件」是本机信息。
 * 2. **绝不把「没变」当成「没问题」。** 基线只回答差分；结论仍然来自判定引擎。
 *    两者混在一份输出里，会让人以为"没有变化"等于"兼容"。
 */

/** 基线的存储版本：结构变了就要能识别出旧基线，而不是读出一个错的差分 */
export const BASELINE_SCHEMA = 1;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * 从一次判定结果里提取**用于比对的那部分**。
 *
 * 刻意**不含** `checked` / `clientSide` / `filtered` 这些台账：
 * 它们会随提取器的实现细节变化，把它们放进基线会让差分充满噪音，
 * 从而掩盖真正的变化（"新增一条降级"会被几十行台账变动淹没）。
 *
 * @param {object} verdict  buildVerdicts 的返回值
 * @param {string} dshVersion  当前 DSH 版本（它变了，方法级结论理应跟着变）
 */
export function snapshotForBaseline(verdict, dshVersion) {
  const plugins = {};
  const names = Object.keys(verdict.plugins || {}).sort();
  for (const name of names) {
    const p = verdict.plugins[name];
    plugins[name] = {
      version: p.version ?? null,
      verdict: p.verdict,
      vacuous: p.vacuous === true,
      // 发现按稳定键排序：顺序不该影响「变了没有」
      findings: (p.findings || [])
        .map((f) => ({
          key: f.service ? (f.method ? `${f.service}.${f.method}` : f.service) : '(declaration)',
          category: f.category,
          severity: f.severity,
          certainty: f.certainty,
          location: f.location ? `${f.location.file}:${f.location.line}` : null,
        }))
        .sort((a, b) => a.key.localeCompare(b.key) || a.category.localeCompare(b.category)),
    };
  }
  return { schemaVersion: BASELINE_SCHEMA, dshVersion: dshVersion ?? null, plugins };
}

/** 结论档位的"好坏"序：用于判断某个变化是变好还是变差 */
const RANK = { broken: 0, partial: 1, unknown: 2, ok: 3 };

/**
 * 比出「变了什么」，并且**给每个变化一个方向**。
 *
 * 方向不是装饰：用户看到"角标亮了"之后的下一个问题是"我该高兴还是该担心"。
 * 一个不带方向的角标只制造焦虑。
 *
 * 变化分五类，每一类都要能单独说清：
 *   - `added`      新装了插件
 *   - `removed`    卸载了插件
 *   - `worsened`   同一个插件变差（档位下降，或新增了发现）
 *   - `improved`   同一个插件变好（档位上升，或少了发现）
 *   - `dshChanged` DSH 版本变了 —— 它单独一类，因为它常常是上面几类的**原因**
 */
export function diffAgainstBaseline(prev, next) {
  const out = {
    comparable: false,
    reason: null,
    dshVersionChanged: false,
    dshVersionFrom: null,
    dshVersionTo: null,
    added: [],
    removed: [],
    worsened: [],
    improved: [],
  };

  if (!prev || prev.schemaVersion !== BASELINE_SCHEMA) {
    out.reason = prev
      ? `基线结构版本不匹配（存的 ${prev.schemaVersion}，当前认 ${BASELINE_SCHEMA}）`
      : '还没有基线（这是第一次体检）';
    return out;
  }
  out.comparable = true;
  out.dshVersionFrom = prev.dshVersion ?? null;
  out.dshVersionTo = next.dshVersion ?? null;
  out.dshVersionChanged = (prev.dshVersion ?? null) !== (next.dshVersion ?? null);

  const a = prev.plugins || {};
  const b = next.plugins || {};

  for (const name of Object.keys(a)) if (!has(b, name)) out.removed.push({ name, version: a[name].version });
  for (const name of Object.keys(b)) if (!has(a, name)) out.added.push({ name, version: b[name].version });

  for (const name of Object.keys(a)) {
    if (!has(b, name)) continue;
    const x = a[name];
    const y = b[name];
    // 版本变了但结论没变 —— 也要记，否则用户会以为"什么都没发生"
    const versionChanged = x.version !== y.version;

    const verdictRank = { from: x.verdict, to: y.verdict };
    const worseVerdict = RANK[y.verdict] < RANK[x.verdict];
    const betterVerdict = RANK[y.verdict] > RANK[x.verdict];

    const xk = new Set(x.findings.map((f) => `${f.key}|${f.category}`));
    const yk = new Set(y.findings.map((f) => `${f.key}|${f.category}`));
    const newFindings = y.findings.filter((f) => !xk.has(`${f.key}|${f.category}`));
    const goneFindings = x.findings.filter((f) => !yk.has(`${f.key}|${f.category}`));

    const entry = {
      name,
      versionFrom: x.version,
      versionTo: y.version,
      versionChanged,
      verdictFrom: x.verdict,
      verdictTo: y.verdict,
      newFindings,
      goneFindings,
    };

    // 变差：档位下降，或**新增了发现**（档位可能没动，例如两条降级变三条）。
    // 注意 `newFindings.length` 优先于档位判断 —— 档位相同但多了发现也是变差。
    if (worseVerdict || newFindings.length > 0) {
      entry.reason = worseVerdict
        ? `结论从「${x.verdict}」变为「${y.verdict}」`
        : `新增 ${newFindings.length} 条发现（档位未变）`
      out.worsened.push(entry);
      continue;
    }
    if (betterVerdict || goneFindings.length > 0) {
      entry.reason = betterVerdict
        ? `结论从「${x.verdict}」变为「${y.verdict}」`
        : `少了 ${goneFindings.length} 条发现（档位未变）`
      out.improved.push(entry);
      continue;
    }
    // 什么都没变，但版本动了 —— 这也是一条要说的事
    if (versionChanged) {
      entry.reason = '版本变了，但结论与发现都没变'
      out.improved.push(entry);
    }
  }

  // 稳定排序：角标与列表的顺序不该随对象键顺序变化
  for (const k of ['added', 'removed', 'worsened', 'improved']) {
    out[k].sort((p, q) => p.name.localeCompare(q.name));
  }
  return out;
}

/**
 * 角标该显示什么。
 *
 * 规则：**任何变化都打**，并标明方向（Plan.md §2 第 5 题）。
 * 只有"变差"才亮会漏掉"变好" —— 而"某个插件被修好了、你可以放心留着了"
 * 同样是用户需要知道的事。
 *
 * @returns {{show: boolean, text: string|null, direction: 'worse'|'better'|'mixed'|'neutral'|null, detail: string}}
 */
export function badgeFor(diff) {
  if (!diff || !diff.comparable) {
    // 没有基线不是"没变化" —— 它意味着**还比不了**。角标不打，但要说清为什么。
    return { show: false, text: null, direction: null, detail: diff ? diff.reason : '没有基线' };
  }
  const w = diff.worsened.length;
  const b = diff.improved.length;
  const add = diff.added.length;
  const rm = diff.removed.length;

  if (w === 0 && b === 0 && add === 0 && rm === 0) {
    return {
      show: false, text: null, direction: 'neutral',
      detail: diff.dshVersionChanged
        ? `DSH 从 ${diff.dshVersionFrom ?? '?'} 变为 ${diff.dshVersionTo ?? '?'}，但所有插件的结论都没变`
        : '与上次相比没有任何变化',
    };
  }

  const bits = [];
  if (w) bits.push(`变差 ${w}`);
  if (b) bits.push(`变好 ${b}`);
  if (add) bits.push(`新增 ${add}`);
  if (rm) bits.push(`移除 ${rm}`);
  const direction = w > 0 && b > 0 ? 'mixed' : (w > 0 ? 'worse' : (b > 0 ? 'better' : 'neutral'));
  const arrow = direction === 'worse' ? '↓' : (direction === 'better' ? '↑' : '•');

  return {
    show: true,
    text: `${arrow} ${bits.join(' · ')}`,
    direction,
    detail: diff.dshVersionChanged
      ? `DSH 版本也从 ${diff.dshVersionFrom ?? '?'} 变成了 ${diff.dshVersionTo ?? '?'} —— 这常常是上面这些变化的原因`
      : 'DSH 版本没变',
  };
}

/**
 * 一句话总结这次差分 —— 给对话工具与面板用。
 *
 * 刻意把「变差」放在最前面：用户最需要先知道的是坏消息，
 * 而坏消息被"另外还发现两个插件变好了"稀释掉，就等于没说。
 */
export function describeDiff(diff) {
  if (!diff || !diff.comparable) return diff ? diff.reason : '没有基线';
  const badge = badgeFor(diff);
  if (!badge.show) return badge.detail;
  const L = [badge.text];
  for (const e of diff.worsened) {
    L.push(`  ↓ ${e.name}@${e.versionFrom}→${e.versionTo}：${e.reason}`);
    for (const f of e.newFindings) L.push(`      新增：${f.key} @ ${f.location || '—'}`);
  }
  for (const e of diff.improved) {
    L.push(`  ↑ ${e.name}：${e.reason}`);
    for (const f of e.goneFindings) L.push(`      不再报：${f.key}`);
  }
  for (const e of diff.added) L.push(`  + ${e.name}@${e.version}`);
  for (const e of diff.removed) L.push(`  − ${e.name}@${e.version}`);
  return L.join('\n');
}
