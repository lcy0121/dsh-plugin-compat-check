/**
 * 结论的**渲染**：给人看的表 + 给机器看的 JSON。
 *
 * ## 为什么单独一个文件
 *
 * 到 D1 为止，「一份结论」已经有三个消费方：CLI、对话工具、面板。
 * 它们各自的**呈现**不同（终端表 / 文本 / DOM），但**取值口径**必须完全一致 ——
 * 标签文案、排序、哪一类发现要标「疑似」、哪些"没发现"要额外解释。
 * 把这些放在一处，是为了让"面板说可用、工具说部分可用"这类分叉**在结构上不可能发生**。
 *
 * 它不做判定。判定在 `lib/verdict.mjs`；这里只把判定结果翻译成人话。
 */

import { TOOL_VERSION } from "./version.mjs";
import path from "node:path";
import { sealReportBody, createFailure, catalogLines } from "./contracts.mjs";
import { DISPOSITION } from "./verdict.mjs";
import { describeDiff } from "./baseline.mjs";
import { nextSteps } from "./finding-guidance.mjs";

const VERDICT_LABEL = {
  ok: "可用",
  partial: "部分可用",
  broken: "不兼容",
  unknown: "未知",
};
const SEVERITY_LABEL = {
  fatal: "致命",
  "feature-dead": "功能失效",
  degraded: "降级",
};
const CATEGORY_LABEL = {
  "host-service-missing": "宿主服务缺失",
  "host-method-missing": "宿主方法缺失",
  "unprovided-dependency": "依赖服务待确认",
  "declaration-mismatch": "声明与实测不符",
  "declared-incompatible": "版本声明不支持",
  "host-entry-inactive": "宿主条目未激活",
  "client-entry-missing": "客户端入口不可交付",
};

/** 在终端里对齐中英文混排用的显示宽度（东亚字符按 2 列算） */
const pad = (s, n) => {
  const w = [...String(s)].reduce(
    (a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1),
    0,
  );
  return String(s) + " ".repeat(Math.max(0, n - w));
};

export function render(result, opts) {
  const L = [];
  const { verdict, extract } = result;

  if (result.error) {
    L.push(`结论: 无法判定 —— ${result.error}`);
    return L.join("\n");
  }

  const meta = extract.report.manifests;
  // `--quiet` 只输出那一条总结论。真实 profile 上有 21 个插件、每个几行，
  // 而这个开关的用途是「脚本里只要一个信号」—— 它必须真的安静，而不是「安静一点」。
  // （本会话里已经踩过一次死参数：.sh 的 --json 被解析却从没被用过。）
  if (opts.quiet) {
    const q = verdict.summary;
    L.push(
      `结论: ${VERDICT_LABEL.ok} ${q.ok}    ${VERDICT_LABEL.partial} ${q.partial}    ${VERDICT_LABEL.broken} ${q.broken}` +
        (q.limited ? `    覆盖有限 ${q.limited}` : "") +
        (q.vacuousOk ? `    其中 ${q.vacuousOk} 个无已验证调用` : "") +
        "；" +
        catalogLines(result.catalog).join("；") +
        (verdict.observation?.notes?.length
          ? "；采样说明：" +
            verdict.observation.notes.join("；").replace(/\s+/g, " ")
          : ""),
    );
    return L.join("\n");
  }

  L.push(
    `插件数: ${meta.length}    有运行时面: ${result.inputs.hasRuntimeSurface ? "是" : "否（方法级结论降为「疑似」）"}`,
  );
  L.push(...catalogLines(result.catalog));
  L.push("");
  for (const note of verdict.observation?.notes || [])
    L.push(`采样说明: ${note}`);
  L.push(
    `工具版本: ${TOOL_VERSION}${verdict.summary.limited ? `    证据覆盖有限: ${verdict.summary.limited} 个插件` : ""}`,
  );

  const s = verdict.summary;
  L.push(
    `结论: ${VERDICT_LABEL.ok} ${s.ok}    ${VERDICT_LABEL.partial} ${s.partial}    ${VERDICT_LABEL.broken} ${s.broken}` +
      (s.vacuousOk
        ? `    （其中 ${s.vacuousOk} 个「可用」没有已验证调用，不等于业务通过）`
        : ""),
  );
  L.push("");

  // ── 与上次比 ──
  // 放在结论之后、逐插件之前：用户先要知道"整体变了没有"，再决定看细节。
  // 而且**「没有变化」也要说出来** —— 沉默会让人以为没检查，或者以为坏消息被藏起来了。
  if (result.baseline) {
    const b = result.baseline;
    L.push("与上次相比:");
    // ⚠️ `note` 优先于 `badge.detail`。当基线**读不出来**时，diff 会退化成
    // 「还没有基线（这是第一次体检）」—— 两种完全不同的事得到同一句话：
    // 一种是"你没跑过"，另一种是"你的基线坏了"。后者必须说出来，
    // 否则用户会以为没有变化，继续用着已经变坏的环境。
    if (b.note) {
      L.push(`  ${b.note}`);
    } else if (b.badge && b.badge.show) {
      L.push(`${b.badge.text}`);
      for (const line of describeDiff(b.diff).split("\n").slice(1))
        L.push(line);
    } else {
      L.push(`  ${(b.badge && b.badge.detail) || "没有可比基线"}`);
    }
    if (b.writeError) L.push(`  ⚠️ ${b.writeError}`);
    L.push(`  基线: ${b.file}${b.wrote ? "" : "（本次未写入）"}`);
    L.push("");
  }

  const names = Object.keys(verdict.plugins).sort((a, b) => {
    const rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
    return (
      rank[verdict.plugins[a].verdict] - rank[verdict.plugins[b].verdict] ||
      a.localeCompare(b)
    );
  });

  for (const name of names) {
    const p = verdict.plugins[name];
    L.push(
      `${VERDICT_LABEL[p.verdict]}  ${name}@${p.version}${p.vacuous ? "   [无已验证调用]" : ""}`,
    );
    if (opts.quiet) continue;
    if (p.coverage) {
      L.push(
        `     证据覆盖: ${p.coverage.status === "complete" ? "完整" : "有限"}；已验证调用 ${p.coverage.verifiedCalls}`,
      );
      for (const note of p.coverage.limitations)
        L.push(`       覆盖限制: ${note}`);
    }
    for (const f of p.findings) {
      const api = f.service
        ? f.method
          ? `${f.service}.${f.method}`
          : f.service
        : "(声明)";
      const loc = f.location ? `${f.location.file}:${f.location.line}` : "-";
      const cert = f.certainty === "certain" ? " [确定]" : " [疑似]";
      L.push(
        `     ${SEVERITY_LABEL[f.severity] ?? f.severity} / ${CATEGORY_LABEL[f.category] ?? f.category}${cert}  ${api}  @ ${loc}`,
      );
      // ⚠️ 「事实」和「推断」必须**看得出来不一样** —— 一次实测的假阳性
      // （`dshmarket` 的"设置页会消失"，而作者把能力检测写在了辅助函数里）说明：
      // `basis` 那条链是量出来的，而 `impact` 是我们读出来的，两者可信度不同。
      // 标出来，用户才知道哪一句可以去核实。
      if (f.impact) {
        L.push(
          `       影响${f.impactBasis === "measured" ? "（实测）" : f.impactBasis === "inferred" ? "（推断，非实测）" : "（依据未提供）"}: ${f.impact}`,
        );
      }
      if (f.basis) L.push(`       依据: ${f.basis}`);
      for (const step of nextSteps(f)) L.push(`       下一步: ${step}`);
    }
    // 「没报」和「报了」一样要能审：过滤与弃权是结论的一部分。
    const cs = p.clientSide || [];
    if (cs.length)
      L.push(
        `     客户端半边（命令行测不到，需界面验证）: ${cs.map((c) => c.service).join(", ")}`,
      );
    const filtered = p.filtered || [];
    if (filtered.length)
      L.push(
        `     已过滤（判为噪音/有兜底）: ${filtered.map((x) => `${x.service}${x.method ? "." + x.method : ""}`).join(", ")}`,
      );
    const noCalls = Object.values(p.resolved || {}).filter(
      (c) => c.disposition === DISPOSITION.NO_CALLS,
    );
    if (noCalls.length)
      L.push(
        `     无证据可判（只出现名字，没有调用点）: ${noCalls.map((c) => c.service).join(", ")}`,
      );
  }

  L.push("");
  L.push(
    "说明: 确定（certain）表示当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；疑似（suspected）表示当前证据不足以确定该条发现。",
  );
  L.push(
    "      impactBasis=measured/inferred 分别表示影响有对应实测依据/影响由证据推断；确定发现不等于影响已实测。官方目录不是运行时面，未观测不等于缺失。",
  );
  L.push(
    "      没有已验证调用仍可能存在服务依赖或客户端功能；调用核验、无发现和覆盖完整均不等于业务验收通过。",
  );
  L.push("      下一步是核实建议；本工具不会自动安装、升级或修改配置与源码。");
  return L.join("\n");
}

export { VERDICT_LABEL, SEVERITY_LABEL, CATEGORY_LABEL };

/** 机器可读形态：保留完整结论，但把 extract 换成一个摘要（原始输出可能几 MB） */
export function toJSON(result) {
  // ⚠️ 报错路径也要带版本：用户拿一份 `{error: ...}` 来问的时候，
  // "哪一版工具没跑成"同样是他要的第一个信息。
  if (result.error)
    return createFailure(result.error, {
      toolVersion: TOOL_VERSION,
      inputs: result.inputs,
    });
  const report = result.extract.report;
  return sealReportBody({
    schemaVersion: 1,
    // 「这份结论是哪一版工具给的」。`dshVersion` 是**被体检的对象**的版本，
    // 与这一条是两件事 —— 少了它就等于结论无法追溯（见 lib/version.mjs 的注释）。
    toolVersion: TOOL_VERSION,
    inputs: result.inputs,
    // 差分与角标也带上：面板/对话工具/CLI 必须看同一件事，
    // 否则「面板说没变、CLI 说变差了」这种分叉就会发生。
    baseline: result.baseline
      ? {
          ...result.baseline,
          file: result.baseline.file,
          wrote: result.baseline.wrote,
          note: result.baseline.note,
          writeError: result.baseline.writeError ?? null,
          diff: result.baseline.diff,
          badge: result.baseline.badge,
        }
      : null,
    dshVersion: result.verdict.dshVersion,
    ...(result.catalog ? { catalog: result.catalog } : {}),
    summary: result.verdict.summary,
    observation: {
      ...result.verdict.observation,
      profileId: result.verdict.observation.profileId
        ? path.resolve(result.verdict.observation.profileId)
        : null,
    },
    plugins: result.verdict.plugins,
    extraction: {
      scanComplete: report.scanComplete,
      diagnostics: report.diagnostics,
      manifests: report.manifests,
      services: report.services,
      fallbackPackages: report.fallbackPackages,
      siteTotal: (report.callSites || []).length,
      provenanceCounts: Object.fromEntries(
        Object.entries(result.extract.provenance.packages).map(([k, v]) => [
          k,
          v.counts,
        ]),
      ),
    },
  });
}
