/** Only known producer-owned status fields are localized; arbitrary diagnostics remain verbatim. */
import { t, builtin } from "./runtime.mjs";
// Only producer-owned explanation fields use this formatter. Finding text,
// source excerpts, user notes and unknown diagnostics are never passed here.
const service = "([\\p{L}\\p{N}_.$/@:-]+)";
const explanationPatterns = [
  [
    /^结论从「(ok|partial|unknown|broken)」变为「(ok|partial|unknown|broken)」$/,
    "结论从「{p0}」变为「{p1}」",
  ],
  [/^新增 (\d+) 条发现（档位未变）$/, "新增 {p0} 条发现（档位未变）"],
  [/^少了 (\d+) 条发现（档位未变）$/, "少了 {p0} 条发现（档位未变）"],
  [new RegExp(`^${service} 客户端尚未验证$`, "u"), "{p0} 客户端尚未验证"],
  [
    new RegExp(`^${service} Context 绑定仅由语法推断$`, "u"),
    "{p0} Context 绑定仅由语法推断",
  ],
  [
    new RegExp(`^${service} 仅有提供声明，没有完整的运行时方法证据$`, "u"),
    "{p0} 仅有提供声明，没有完整的运行时方法证据",
  ],
  [
    new RegExp(
      `^${service} (采样失败|未采样|没有完整方法证据|方法采样缺失或被截断，不能判断缺方法)$`,
      "u",
    ),
    "{p0}：{p1}",
  ],
  [
    new RegExp(`^${service} 是未读取的访问器，可调用性未知$`, "u"),
    "{p0} 是未读取的访问器，可调用性未知",
  ],
  [
    /^Loader 有 (\d+) 个条目无法映射到包名$/,
    "Loader 有 {p0} 个条目无法映射到包名",
  ],
  [/^条目 (.+) 尚未稳定：([A-Z]+)$/, "条目 {p0} 尚未稳定：{p1}"],
  [
    /^运行时服务采样已截断（(服务数量|总属性条目|总输出字节|总采样耗时|输入条目|总量)预算）；未采样服务保持未知$/,
    "运行时服务采样已截断（{p0}预算）；未采样服务保持未知",
  ],
  [
    new RegExp(
      `^运行时服务 ${service} 的结构采样已截断（(属性总数|输出字节|采样耗时|方法数|原型深度|覆盖)预算）；未采样方法保持未知$`,
      "u",
    ),
    "运行时服务 {p0} 的结构采样已截断（{p1}预算）；未采样方法保持未知",
  ],
];
export function evidenceNote(value) {
  if (typeof value !== "string") return value;
  for (const [pattern, key] of explanationPatterns) {
    const match = value.match(pattern);
    if (match)
      return t(
        key,
        Object.fromEntries(match.slice(1).map((v, i) => [`p${i}`, builtin(v)])),
      );
  }
  return builtin(value);
}
export function profileSource(value) {
  if (typeof value !== "string") return value;
  const patterns = [
    [/^process\.argv 的 (--profile(?:=| ).+)$/, "来自 process.argv：{p0}"],
    [
      /^process\.argv 里的 profile 路径 (.+)$/,
      "来自 process.argv 的 profile 路径：{p0}",
    ],
    [/^请求明确指定的 profile (.+)$/, "请求明确指定的 profile：{p0}"],
    [/^指定 profile 不存在: (.+)$/, "指定 profile 不存在：{p0}"],
    [
      /^((?:DSH_PROFILE|DSH_ACTIVE_PROFILE|DSH_PROFILE_NAME)=.+)（环境变量可能来自启动 app 的那个 shell，未必是当前加载的 profile）$/,
      "{p0}（环境变量可能来自启动 app 的 shell，未必是当前加载的 profile）",
    ],
  ];
  for (const [pattern, key] of patterns) {
    const match = value.match(pattern);
    if (match) return t(key, { p0: match[1] });
  }
  return builtin(value);
}
export function catalogueLines(c) {
  if (!c) return [t("API 目录身份未提供；版本范围未认证，请重新体检。")];
  return [
    t("目标 DSH：{p0}", { p0: c.targetVersion || t("未知") }),
    t("参考目录：{p0} · SHA-256：{p1}", {
      p0: c.referenceVersion || t("未知"),
      p1: c.sha256,
    }),
    t("目录认证范围：{p0}；{p1}", {
      p0: c.certifiedVersions.join("、") || t("无"),
      p1: builtin(c.scope),
    }),
    ...(c.warning ? [builtin(c.warning)] : []),
  ];
}
export function baselineText(value) {
  if (typeof value !== "string") return value;
  const reasons = [
    "本次检查覆盖不完整",
    "当前为预览检查",
    "本次未满足保存条件",
  ];
  for (const reason of reasons) {
    if (value === `尚无可比较的历史记录。${reason}，暂不建立对比记录。`)
      return t("尚无可比较的历史记录。{p0}，暂不建立对比记录。", {
        p0: t(reason),
      });
    if (value === `${reason}，保留已有对比记录。`)
      return t("{p0}，保留已有对比记录。", { p0: t(reason) });
  }
  const schema = value.match(
    /^基线结构版本不匹配（存的 (\d+)，当前认 (\d+)）$/,
  );
  if (schema)
    return t("基线结构版本不匹配（存的 {p0}，当前认 {p1}）", {
      p0: schema[1],
      p1: schema[2],
    });
  return builtin(value);
}
export function baselineDetail(b) {
  const diff = b.diff;
  if (diff?.comparable && diff.dshVersionChanged && !b.badge?.show)
    return t("DSH 从 {p0} 变为 {p1}，但所有插件的结论都没变", {
      p0: diff.dshVersionFrom || "?",
      p1: diff.dshVersionTo || "?",
    });
  return baselineText(b.badge?.detail);
}
export function baselineBadge(b) {
  const diff = b.diff;
  if (!diff?.comparable) return b.badge?.text;
  const arrow =
    b.badge.direction === "worse"
      ? "↓"
      : b.badge.direction === "better"
        ? "↑"
        : "•";
  const parts = [
    ["worsened", "变差 {p0}"],
    ["improved", "变好 {p0}"],
    ["added", "新增 {p0}"],
    ["removed", "移除 {p0}"],
    ["updated", "更新 {p0}"],
  ];
  return (
    arrow +
    " " +
    parts
      .filter(([key]) => diff[key]?.length)
      .map(([key, label]) => t(label, { p0: diff[key].length }))
      .join(" · ")
  );
}
