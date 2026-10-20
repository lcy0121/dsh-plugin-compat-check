/** CLI-only share view. Never serialize raw inputs, logs, evidence or baseline. */
import { TOOL_VERSION } from "../lib/version.mjs";

function safe(value) {
  const raw = String(value ?? "未提供");
  // Hide the whole field: token-by-token replacement leaks the tail of a path
  // containing spaces and can turn a multi-line log into apparently safe prose.
  if (
    /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(raw) ||
    /(?:[a-z]:[\\/]|\\\\|~[\\/]|(?:^|[\s("'`=：:，；])\/|\.\.[\\/]|\/[^\s/]+\/)/i.test(
      raw,
    ) ||
    /(?:https?|file):|Bearer\s|(?:token|password|passwd|secret|api[_-]?key|authorization)\s*[:=]|(?:sk-|ghp_|github_pat_|npm_)[a-z0-9_]+/i.test(
      raw,
    )
  )
    return "［说明包含路径、链接、凭据或控制字符，已隐藏；请在本机查看］";
  return raw
    .replace(
      /[&<>@]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "@": "&#64;" })[c],
    )
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&");
}

// Keep public package identifiers and relative source positions useful. Invalid
// metadata is omitted wholesale rather than partially echoing arbitrary input.
function identity(value) {
  return typeof value === "string" &&
    /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value)
    ? "`" + value + "`"
    : "未提供或已隐藏";
}
function version(value) {
  return typeof value === "string" &&
    /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i.test(value)
    ? "`" + value + "`"
    : "未知或已隐藏";
}
function location(value) {
  if (!value) return "源码位置未提供（声明或 loader 事实可无位置）";
  const file = value.file;
  if (
    typeof file !== "string" ||
    !/^(?:[a-z0-9_@.-]+\/)*[a-z0-9_@.-]+$/i.test(file) ||
    file.split("/").some((p) => p === ".." || p === ".") ||
    !Number.isSafeInteger(value.line) ||
    value.line < 1
  )
    return "源码位置已隐藏（非安全的包内相对路径）";
  return "`" + file + ":" + value.line + "`";
}

/** Render the canonical JSON body, without changing its verdict or exit code. */
export function renderIssueReport(body, options = {}) {
  const lines = [
    "# DSH 插件兼容性故障报告",
    "",
    "- 工具版本: " + version(body.toolVersion ?? TOOL_VERSION),
    "- DSH 目标版本: " + version(body.dshVersion),
    "- 退出码: " + (body.ok ? body.exitCode : 3),
    "",
    "绝对路径、原始参数、日志、源码片段、原始探针/evidence 与基线均不导出；保留插件名、包内相对位置及分析说明。常见凭据会隐藏，但不能保证任意业务文本无敏感信息；请预览后再分享。",
    "",
  ];
  if (!body.ok) {
    lines.push(
      "## 工具无法判定",
      "",
      "本次未产生可信插件结论。原始错误已省略，避免泄露路径、配置或日志；请在本机移除 --issue-report 排查。用法错误可先运行 --help。",
      "",
    );
  } else {
    const o = body.observation;
    lines.push(
      "- 证据模式: " + o.mode,
      "- 观测绑定: " + o.bound + "；可用: " + o.usable,
      "- 观测 DSH 版本: " + version(o.dshVersion),
      "- 扫描完整: " +
        body.extraction.scanComplete +
        "；诊断数: " +
        body.extraction.diagnostics.length,
      "- 汇总: " +
        ["ok", "partial", "broken", "unknown", "limited", "vacuousOk"]
          .map((k) => k + "=" + body.summary[k])
          .join(", "),
      "",
    );
    for (const note of o.notes) lines.push("- 观测限制: " + safe(note));
    for (const [name, p] of Object.entries(body.plugins)) {
      lines.push(
        "",
        "## 插件 " + identity(name),
        "",
        "- 插件版本: " + version(p.version),
        "- 结论: " + p.verdict + "；vacuous=" + p.vacuous,
        "- coverage=" +
          p.coverage.status +
          "；verifiedCalls=" +
          p.coverage.verifiedCalls,
      );
      for (const note of p.coverage.limitations)
        lines.push("- 覆盖限制: " + safe(note));
      if (!p.findings.length)
        lines.push("- 未报告发现；不等于业务功能通过验收。");
      for (const f of p.findings) {
        lines.push(
          "",
          "- 发现: " +
            safe(f.category) +
            "；API: " +
            identity([f.service, f.method].filter(Boolean).join(".")),
          "  - severity=" +
            f.severity +
            "；certainty=" +
            f.certainty +
            "；impactBasis=" +
            f.impactBasis,
          "  - 位置: " + location(f.location),
          "  - 影响: " + safe(f.impact),
          "  - 依据: " + safe(f.basis),
        );
      }
    }
  }
  const flags = [
    "--nm <profile-or-node_modules>",
    "--no-baseline",
    "--issue-report",
  ];
  if (options.probe || (body.inputs?.probe && !body.inputs?.probeBoot))
    flags.push("--probe <probe-report.json>");
  else if (options.probeBoot) flags.push("--probe-boot");
  if (options.dshVersion || body.dshVersion)
    flags.push("--dsh-version <dsh-version>");
  if (options.rules) flags.push("--rules <rules.json>");
  if (options.catalog) flags.push("--catalog <catalog.json>");
  lines.push(
    "",
    "## 复现（在仓库根目录，先替换占位符）",
    "",
    "```sh",
    "node bin/compat-check.mjs " + flags.join(" "),
    "```",
    "",
    "使用同一工具版本/源码提交、目标插件制品与规则/目录；自定义输入需自行保存并检查。文件探针须属于同一目标且未过期；--probe-boot 会安装依赖、启动并执行目标插件，临时 profile 不是 OS 沙箱。原有 probe 超时/留存参数未复制，必要时在本机补回。",
    "",
    "## 判读限制",
    "",
    "certain 表示当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；suspected 表示当前证据不足以确定该条发现。impactBasis=measured/inferred 分别表示影响有对应实测依据/影响由证据推断，确定发现不等于影响已实测。vacuous 表示本轮未发现冲突但没有已验证调用，仍可能存在服务依赖或客户端功能。catalogue 不是运行时观测，未观测不等于缺失；limited/vacuous 或客户端未验证均不能省略。声明放行、激活、调用核验或覆盖完整不证明业务成功。",
    "",
    "本工具0.1.3按目标版本选择已知目录：0.2.1-rc.2及以后用rc.2目录，其余/未知用旧目录；显式--catalog优先，未来版本未经认证。声明从0.2.1-rc.1起优先engines.dsh，否则回退官方peer；旧目标保留旧规则。精确豁免只表示声明获准，不证明业务成功；请以实际宿主复核。",
    "",
    "本报告只生成文本，不自动上传、创建 issue 或回复他人。",
  );
  return lines.join("\n");
}
