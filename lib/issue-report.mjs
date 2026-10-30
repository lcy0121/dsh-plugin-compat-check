/** Shared CLI/panel share view. Never serialize raw inputs, logs, evidence or baseline. */
import { TOOL_VERSION } from "./version.mjs";
import { nextSteps } from "./finding-guidance.mjs";
import { terminalText } from "./contracts.mjs";

function safeValue(value, translate) {
  const raw = String(value ?? translate("未提供"));
  const credentialView = raw
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/&(?:quot|apos|#34|#39|#x22|#x27);/gi, '"');
  // Hide the whole field: token-by-token replacement leaks the tail of a path
  // containing spaces and can turn a multi-line log into apparently safe prose.
  if (
    terminalText(raw) !== raw ||
    /(?:[a-z]:[\\/]|\\\\|~[\\/]|(?:^|[\s("'`=：:，；])\/|\.\.[\\/]|\/[^\s/]+\/)/i.test(
      raw,
    ) ||
    /(?:https?|file):|Bearer\s|(?:token|password|passwd|pwd|secret|api[\s_-]*key|authorization|cookie|private[\s_-]*key|session[\s_-]*(?:id|key)?)\s*["'`\\]*\s*[:=：]|(?:sk-|ghp_|github_pat_|npm_)[a-z0-9_]+/i.test(
      credentialView,
    )
  )
    return translate(
      "［说明包含路径、链接、凭据或控制字符，已隐藏；请在本机查看］",
    );
  return raw
    .replace(
      /[&<>@]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "@": "&#64;" })[c],
    )
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&");
}

// Keep public package identifiers and relative source positions useful. Invalid
// metadata is omitted wholesale rather than partially echoing arbitrary input.
function identityValue(value, translate) {
  return typeof value === "string" &&
    /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(value)
    ? "`" + value + "`"
    : translate("未提供或已隐藏");
}
function versionValue(value, translate) {
  return typeof value === "string" &&
    /^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?(?:\+[a-z0-9.-]+)?$/i.test(value)
    ? "`" + value + "`"
    : translate("未知或已隐藏");
}
function locationValue(value, translate) {
  if (!value) return translate("源码位置未提供（声明或 loader 事实可无位置）");
  const file = value.file;
  if (
    typeof file !== "string" ||
    !/^(?:[a-z0-9_@.-]+\/)*[a-z0-9_@.-]+$/i.test(file) ||
    file.split("/").some((p) => p === ".." || p === ".") ||
    !Number.isSafeInteger(value.line) ||
    value.line < 1
  )
    return translate("源码位置已隐藏（非安全的包内相对路径）");
  return "`" + file + ":" + value.line + "`";
}

/** Render the canonical JSON body, without changing its verdict or exit code. */
export function renderIssueReport(body, options = {}) {
  const translate = options.translate || ((value) => value);
  const explain = options.explain || ((value) => value);
  const findingText = options.findingText || ((value) => value);
  const safe = (value) => safeValue(value, translate);
  const identity = (value) => identityValue(value, translate);
  const version = (value) => versionValue(value, translate);
  const location = (value) => locationValue(value, translate);
  const lines = [
    translate("# DSH 插件兼容性故障报告"),
    "",
    translate("- 工具版本: ") + version(body.toolVersion ?? TOOL_VERSION),
    translate("- DSH 目标版本: ") + version(body.dshVersion),
    translate("- 退出码: ") + (body.ok ? body.exitCode : 3),
    "",
    translate(
      "绝对路径、原始参数、日志、源码片段、原始探针/evidence 与基线均不导出；保留插件名、包内相对位置及分析说明。常见凭据会隐藏，但不能保证任意业务文本无敏感信息；请预览后再分享。",
    ),
    "",
  ];
  if (!body.ok) {
    lines.push(
      translate("## 工具无法判定"),
      "",
      translate(
        "本次未产生可信插件结论。原始错误已省略，避免泄露路径、配置或日志；请在本机移除 --issue-report 排查。用法错误可先运行 --help。",
      ),
      "",
    );
  } else {
    const o = body.observation;
    if (body.catalog) {
      const c = body.catalog;
      lines.push(
        translate("- 参考目录: ") +
          version(c.referenceVersion) +
          "；SHA-256: " +
          (/^[a-f0-9]{64}$/.test(c.sha256) ? c.sha256 : translate("未提供")),
        translate("- 目录认证范围: ") +
          (c.certifiedVersions?.map(version).join("、") || translate("无")) +
          translate("；仅内置目录与精确版本集成，不代表业务验收或运行时观测。"),
        ...(c.verified
          ? []
          : [
              translate(
                "- 目录警告: 目标版本或自定义目录未认证；当前结果不能证明目标版本已验收，请在实际宿主复核。",
              ),
            ]),
      );
    } else
      lines.push(
        translate("- API目录身份未提供，版本范围未认证；请重新体检。"),
      );
    lines.push(
      translate("- 证据模式: ") + o.mode,
      translate("- 观测绑定: ") + o.bound + translate("；可用: ") + o.usable,
      translate("- 观测 DSH 版本: ") + version(o.dshVersion),
      translate("- 扫描完整: ") +
        body.extraction.scanComplete +
        translate("；诊断数: ") +
        body.extraction.diagnostics.length,
      translate("- 汇总: ") +
        ["ok", "partial", "broken", "unknown", "limited", "vacuousOk"]
          .map((k) => k + "=" + body.summary[k])
          .join(", "),
      "",
    );
    for (const note of o.notes)
      lines.push(translate("- 观测限制: ") + safe(explain(note)));
    for (const [name, p] of Object.entries(body.plugins)) {
      lines.push(
        "",
        translate("## 插件 ") + identity(name),
        "",
        translate("- 插件版本: ") + version(p.version),
        translate("- 结论: ") + p.verdict + "；vacuous=" + p.vacuous,
        "- coverage=" +
          p.coverage.status +
          "；verifiedCalls=" +
          p.coverage.verifiedCalls,
      );
      for (const note of p.coverage.limitations)
        lines.push(translate("- 覆盖限制: ") + safe(explain(note)));
      if (!p.findings.length)
        lines.push(translate("- 未报告发现；不等于业务功能通过验收。"));
      for (const f of p.findings) {
        lines.push(
          "",
          translate("- 发现: ") +
            safe(f.category) +
            "；API: " +
            identity([f.service, f.method].filter(Boolean).join(".")),
          "  - severity=" +
            f.severity +
            "；certainty=" +
            f.certainty +
            "；impactBasis=" +
            f.impactBasis,
          translate("  - 位置: ") + location(f.location),
          translate("  - 影响: ") + safe(findingText(f.impact)),
          translate("  - 依据: ") + safe(findingText(f.basis)),
        );
        for (const step of nextSteps(f))
          lines.push(translate("  - 下一步: ") + safe(translate(step)));
      }
    }
  }
  const flags = [
    "--nm <profile-or-node_modules>",
    "--no-baseline",
    "--issue-report",
  ];
  const runtimeEvidence =
    body.observation?.usable === true ||
    body.observation?.mode === "runtime" ||
    body.hasRuntimeSurface === true ||
    body.inputs?.hasRuntimeSurface === true;
  const fileProbe =
    options.probe || (body.inputs?.probe && !body.inputs?.probeBoot);
  const explicitBoot =
    !fileProbe && (options.probeBoot || body.inputs?.probeBoot);
  const loaderFindings = Object.values(body.plugins || {}).some((plugin) =>
    (plugin.findings || []).some(
      (finding) => finding.category === "host-entry-inactive",
    ),
  );
  if (fileProbe || (runtimeEvidence && !explicitBoot))
    flags.push("--probe <probe-report.json>");
  else if (explicitBoot) flags.push("--probe-boot");
  if (options.dshVersion || body.dshVersion)
    flags.push("--dsh-version <dsh-version>");
  if (options.rules || body.inputs?.rules) flags.push("--rules <rules.json>");
  if (options.catalog || body.inputs?.catalog)
    flags.push("--catalog <catalog.json>");
  lines.push("", translate("## 复核（在仓库根目录，先替换占位符）"), "");
  if (runtimeEvidence)
    lines.push(
      translate(
        "本报告含运行时观测；仅静态扫描可能给出不同结论，不能复现这些运行时发现。",
      ),
      "",
    );
  if (loaderFindings)
    lines.push(
      translate(
        "本报告包含 loader 状态事实。FAILED/PENDING 必须回到原来的同一宿主刷新报告并核对条目身份、状态和时间；静态扫描或文件 probe 不能复现这些状态。",
      ),
      "",
    );
  if (explicitBoot)
    lines.push(
      translate(
        "原 CLI 显式请求了 --probe-boot；下面命令会安装依赖、启动并执行目标插件，临时 profile 不是 OS 沙箱。这是一次新宿主检查，不能复现原宿主的 loader 或业务事实。原有超时/留存参数未复制，必要时在本机补回；导出文本本身不启动宿主。",
      ),
      "",
    );
  else if (fileProbe || runtimeEvidence)
    lines.push(
      translate(
        "下面命令仅适用于已另行取得同一 profile、DSH 版本且采样时间有效的合格 probe 文件后；本报告未导出观测，也不会自动创建 probe 或启动宿主。文件 probe 只能补充其明确记录的服务结构，不能代替原宿主状态或业务验收。",
      ),
      "",
    );
  else
    lines.push(
      translate(
        "下面命令只用于复核文件、声明与目录；CLI 仍可能读取目标旁置的 probe-report.json，运行后须核对输出中的实际证据来源。",
      ),
      "",
    );
  lines.push(
    "```sh",
    "node bin/compat-check.mjs " + flags.join(" "),
    "```",
    "",
    translate(
      "使用相同工具版本/源码提交、目标插件制品、规则与 API 目录；规则/目录占位符须替换为本报告对应的输入，自定义输入需自行保存并核对身份。命令不保证复现原观测时刻或相同结论，也不补齐未导出的观测。",
    ),
    "",
    translate("## 判读限制"),
    "",
    translate(
      "certain 表示当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；suspected 表示当前证据不足以确定该条发现。impactBasis=measured/inferred 分别表示影响有对应实测依据/影响由证据推断，确定发现不等于影响已实测。vacuous 表示本轮未发现冲突但没有已验证调用，仍可能存在服务依赖或客户端功能。catalogue 不是运行时观测，未观测不等于缺失；limited/vacuous 或客户端未验证均不能省略。声明放行、激活、调用核验或覆盖完整不证明业务成功。",
    ),
    "",
    translate(
      "普通体检按目标版本选择已登记目录或带未认证提示的参考目录；显式--catalog优先，目录匹配不等于业务验收。声明从0.2.1-rc.1起优先engines.dsh，否则回退官方peer；旧目标保留旧规则。精确豁免只表示声明获准，不证明业务成功；请以实际宿主复核。",
    ),
    "",
    translate("下一步是核实建议；本工具不会自动安装、升级或修改配置与源码。"),
    "",
    translate("本报告只生成文本，不自动上传、创建 issue 或回复他人。"),
  );
  return lines.join("\n");
}
