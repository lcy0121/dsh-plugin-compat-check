#!/usr/bin/env bash
# =============================================================================
# dsh-plugin-compat-check —— 回答「这个 DSH 插件在我这版上到底能不能用」
#
# 为什么需要：插件声明（peerDependencies / dsh.client.inject）不等于宿主实际提供的
# API。这个生态里同一大版本内 API 被移除是常态（实测：0.2.0 移除了
# ctx.settings.register），所以必须真实启动 + 实际比对 API 面。
#
# 做四件事：
#   ① 身份核对   —— npm 包到底属于哪个仓库（防撞名，本机真踩过：aegis / dsh-effort-slider）
#   ② 隔离安装   —— 装进一次性 profile，捕获 DSH 自带的版本兼容闸门拒绝
#   ③ 真实启动   —— 看有无「did not activate」；顺带 dump 宿主真实 API 面
#   ④ API 比对   —— 插件源码里实际调用的服务/方法 vs 宿主提供的，逐条判定
#
# 全程不碰你的正式 profile；结束会杀掉测试服务及其子进程（包括插件拉起的辅助进程）。
# =============================================================================
set -uo pipefail

SPEC="${1:-}"
shift 2>/dev/null || true

KEEP=0
TIMEOUT=30
JSON=0
# [E2] --install-skill 的开关。见下方「[E2] --install-skill」区块。
INSTALL_SKILL=0
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --timeout) TIMEOUT="${2:-30}"; shift ;;
    --json) JSON=1 ;;
    --install-skill) INSTALL_SKILL=1 ;;
    --force) FORCE=1 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
  shift
done

# =============================================================================
# [E2] --install-skill：把随包的 skill/SKILL.md 装进 ~/.agents/skills/<name>/
#
# 为什么这个区块放在「内核检查」之前、并且**不需要内核**：
# 只用 npx / 只拷了这一个 .sh 的用户，是拿不到 skill 的唯一人群，
# 而装 skill 这件事根本不需要判定内核（内核要 Node + lib/ + rules/）。
# 把安装卡在"先找到内核"上，等于让这部分用户永远拿不到 skill。
#
# 为什么必须整块独立：脚本的其余部分依赖 SPEC（第一个参数），而本区块
# 不接受 spec。放在 SPEC 检查之前，`./dsh-plugin-compat-check.sh --install-skill`
# 才是一条合法的命令行。
# =============================================================================

# SCRIPT_DIR 要到下面「找到判定内核」那一段才赋值，而本区块必须能在**没有内核**
# 的机器上单独跑，所以这里先按同一方式解析一次（下方那处会得到同一个值，不冲突）。
SCRIPT_DIR="${SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

# 目标根目录。与宿主端的解析顺序保持一致（实测见 skill/README.md §3）：
#   宿主是 config.agentsHome ?? DSH_AGENTS_HOME ?? ~/.agents
# 这里没有 profile 配置可读，所以只跟环境变量与 $HOME。
AGENTS_HOME="${DSH_AGENTS_HOME:-$HOME/.agents}"
SKILL_NAME="dsh-plugin-compat-check"

# 找随包的 SKILL.md。候选顺序 = 从最可能的打包形态到最宽松的形态。
# 找不到就**明确报错**，不静默成功 —— 一个"装完了但什么都没装"的 flag，
# 与这个脚本里踩过的死参数（--json / --update）是同一类失败。
find_skill_source() {
  local cand
  for cand in "${DSC_SKILL:-}" "$SCRIPT_DIR/skill/SKILL.md" "$SCRIPT_DIR/SKILL.md"; do
    [ -n "$cand" ] && [ -f "$cand" ] && { printf '%s' "$cand"; return 0; }
  done
  return 1
}

install_skill() {
  local src dest_dir dest
  if ! src="$(find_skill_source)"; then
    cat >&2 <<EOF
✗ 找不到要安装的 SKILL.md

  已找过：${DSC_SKILL:-（未设置）}、$SCRIPT_DIR/skill/SKILL.md、$SCRIPT_DIR/SKILL.md
  这个 flag 装的是**随包携带**的 skill/SKILL.md，网络下载不在它的职责内。
  若你只拷了脚本，请连 skill/ 目录一起拿，或用 DSC_SKILL 指过去。
EOF
    return 1
  fi

  dest_dir="$AGENTS_HOME/skills/$SKILL_NAME"
  dest="$dest_dir/SKILL.md"

  # 绝不静默覆盖：已有的可能不是我们的（撞名），也可能是用户改过的。
  # 覆盖别人的 skill 是数据丢失，而这个工具的全部卖点就是"不撒谎"。
  if [ -f "$dest" ]; then
    if [ "$FORCE" -ne 1 ]; then
      echo "已存在，未做改动: $dest"
      if cmp -s "$src" "$dest"; then
        echo "  （内容与本次要装的一致）"
      else
        echo "  （内容与本次要装的不同 —— 可能是你改过的，也可能是别的 skill）"
      fi
      echo "  already installed, use --force 覆盖"
      return 1
    fi
    # 覆盖是数据丢失，所以即使用户要求了，也要把"覆盖了什么"打在屏幕上。
    echo "已存在，按 --force 覆盖: $dest"
    cmp -s "$src" "$dest" && echo "  （原有内容与本次一致）" || echo "  （原有内容将被覆盖，且没有备份）"
  fi

  mkdir -p "$dest_dir" || { echo "✗ 建不了目录: $dest_dir" >&2; return 1; }
  cp "$src" "$dest" || { echo "✗ 拷不进: $dest" >&2; return 1; }
  echo "源文件  : $src"
  echo "已安装  : $dest"
  # 提示下一次会遇到什么：再次运行会拒绝，这是刻意的。
  echo "  （再次运行会拒绝覆盖，需要时加 --force）"
  return 0
}

# SPEC 里可能吞掉了 argv[1]（脚本第 19 行 `SPEC="${1:-}"`）。
# 所以 `--force --install-skill` 这种顺序要在这里补一次判定。
case "$SPEC" in
  --install-skill) INSTALL_SKILL=1 ;;
  --force) FORCE=1 ;;
esac

if [ "$INSTALL_SKILL" -eq 1 ]; then
  install_skill
  exit $?
fi
# ===================== [E2] 区块结束 ========================================

# ── 帮助与"没给参数" ──
#
# ⚠️ `--help` 此前**根本没被处理**：它会掉进下面的「找内核」检查并以 1 退出 ——
# 也就是"想看用法"被当成"内核缺失"报了个错。`-h`/`--help`/`help` 现在都认，且
# **不需要内核**（看用法当然不需要能跑）。
#
# 用法文本抽成函数，因为它现在有两个调用点（显式求助 / 没给参数），
# 两份副本迟早会漂移。
usage() {
  # 版本号实时问真源（`lib/version.mjs`），而不是在这里写一个字面量 ——
  # 写了就是第二个真源，迟早与内核报的不是同一个数。
  # heredoc 因此不能加引号（要展开），里面的 `$` 与反引号都已转义。
  local tool_version
  tool_version="$(detect_tool_version)"
  cat >&2 <<USAGE
用法: dsh-plugin-compat-check <spec> [--keep] [--timeout 秒] [--json]
       dsh-plugin-compat-check --install-skill [--force]
       dsh-plugin-compat-check --version
       dsh-plugin-compat-check --help

$tool_version

  spec 可为 npm 包名 / github:owner/repo / file:/本地路径 / git+https://...

  体检已装的插件（不需要联网、不碰正式 profile）:
    node bin/compat-check.mjs --nm <profile 目录> [--probe <探针报告>] [--json] [--quiet]

选项:
  --keep            保留临时 profile 与现场，便于人工排查
  --timeout N       启动等待秒数，默认 30
  --json            机器可读输出
  --install-skill   把随包的 skill/SKILL.md 装进 ~/.agents/skills/<name>/
                    （不需要判定内核；已有文件不会静默覆盖，要覆盖加 --force）
  --version         显示工具版本（不需要判定内核）
  --help            显示这段文字（不需要判定内核）

示例:
  dsh-plugin-compat-check dsh-keep-awake
  dsh-plugin-compat-check github:owner/repo
  dsh-plugin-compat-check file:/path/to/my-plugin
  dsh-plugin-compat-check --install-skill
USAGE
}

# ── 版本号：**与内核同一个真源** ──
#
# 不从脚本里再写一个字面量 —— 那份「单版本」承诺（docs/Plan.md §2 第 9 题）只有
# 一处真源才算数。所以直接问内核：`lib/version.mjs` 导出 `versionLine()`。
#
# 拿不到就退回一个明确的占位符，而不是猜一个版本号：猜出来的版本会让
# 用户拿着一份**错的**可追溯信息去排查，比"不知道"更糟。
# 注意这一步**不需要**跑体检，也不该因为内核缺失而让 `--version` 失败 ——
# 所以它自己算候选路径，而**不依赖**下面那段（那段找不到内核就 exit 1）。
detect_tool_version() {
  # 与下面「找内核」用的是同一组候选：DSC_KERNEL → 脚本同目录
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local kernel="${DSC_KERNEL:-$here}"
  if [ -f "$kernel/lib/version.mjs" ] && command -v node >/dev/null 2>&1; then
    node -e 'import(require("node:url").pathToFileURL(process.argv[1]).href).then(m=>process.stdout.write(m.versionLine()))' "$kernel/lib/version.mjs" 2>/dev/null && return 0
  fi
  # ⚠️ **兜底里不写版本号。** 写了就是第二个真源，而且它会在内核升级后
  # 继续报一个旧数 —— 一份**错的**可追溯信息比"不知道"更糟。
  printf 'dsh-plugin-compat-check (版本未知：找不到内核 lib/version.mjs)'
}

case "$SPEC" in
  --version|-V|version)
    # 与 --help 同理：报版本是**成功**（退出码 0），不需要判定内核。
    detect_tool_version
    printf '\n'
    exit 0
    ;;
esac

case "$SPEC" in
  --help|-h|help)
    # 求助是**成功**，退出码 0。返回 1 会让 `cmd --help || echo failed` 这类
    # 常见写法报错 —— 把"想了解用法"当成失败是很糟的第一印象。
    usage
    exit 0
    ;;
esac

if [ -z "$SPEC" ]; then
  # 没给参数才算用法错误（退出码 2）
  usage
  exit 2
fi

# ── 找到判定内核所在的位置 ────────────────────────────────────────
#
# 这个 .sh 只做编排（装包 / 起宿主 / 拿探针报告），判定本身在 Node 内核里。
# 所以它**需要内核在旁边**：同目录下的 lib/ + rules/（仓库形态），
# 或一个已发布的包（`DSC_KERNEL` 指过去）。找不到就**直接报错**，不降级 ——
# 降级成"跳过判定只打印提取结果"会给出一个看起来正常、实际没有结论的输出。
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KERNEL_DIR="${DSC_KERNEL:-$SCRIPT_DIR}"
if [ ! -f "$KERNEL_DIR/lib/extract.mjs" ] || [ ! -f "$KERNEL_DIR/lib/verdict.mjs" ]; then
  cat >&2 <<EOF
✗ 找不到判定内核（$KERNEL_DIR/lib/{extract,verdict}.mjs）

  这个脚本不自带判定实现 —— 判定只有一处实现（lib/verdict.mjs），
  而它需要 Node 环境（DSH 自带 Node ≥22）。

  两条路：
    1) 在仓库里跑（推荐）：git clone 后直接执行本脚本（内核就在旁边）
    2) 只拷了脚本：用 DSC_KERNEL 指向内核目录，例如
         DSC_KERNEL=/path/to/dsh-plugin-compat-check ./dsh-plugin-compat-check.sh <spec>

  **不接受降级**：找不到内核就退出，而不是"只打印提取结果"。
  降级会给出一个看起来正常、实际没有结论的输出 —— 那比报错糟得多。

  也不需要内核的两件事（与体检分开）：
    --help            看用法
    --install-skill   只装 skill
EOF
  exit 1
fi

# Runtime orchestration lives in Node: one private workdir/profile and owned PIDs.
ARGS=("$SPEC" "--timeout" "$TIMEOUT")
[ "$KEEP" -eq 1 ] && ARGS+=("--keep")
[ "$JSON" -eq 1 ] && ARGS+=("--json")
exec node "$KERNEL_DIR/bin/check-install.mjs" "${ARGS[@]}"
