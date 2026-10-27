/** Only known producer-owned status fields are localized; arbitrary diagnostics remain verbatim. */
import { t, builtin } from "./runtime.mjs";
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
