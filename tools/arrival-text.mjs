/** Ordinary text must expose the same backend failure as JSON and exit codes. */
export function compatibilityText(value) {
  if (!value) return "";
  return value.ok
    ? `  兼容性报告  可读取（工具版本 ${value.toolVersion || "未知"}）\n`
    : `  兼容性报告  无法读取：${value.error || "报告未成功，未返回错误详情"}\n`;
}
