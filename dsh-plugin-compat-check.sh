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
# 不从脚本里再写一个字面量 —— 那份「单版本」承诺（Plan.md §2 第 9 题）只有
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
    node -e "import('file://$kernel/lib/version.mjs').then(m=>process.stdout.write(m.versionLine()))" 2>/dev/null && return 0
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

WORKDIR=/tmp/dsh-plugin-compat-check
PROFILE=plugincheck
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME_DIR/profiles/$PROFILE"
LOG="$WORKDIR/boot.log"

command -v dsh >/dev/null 2>&1 || { echo "找不到 dsh 命令" >&2; exit 1; }

# ---------- 清理：递归杀进程树 + 兜底扫辅助进程 ----------
kill_tree() {
  local pid="$1" child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill_tree "$SERVER_PID"
    sleep 2
    kill -9 "$SERVER_PID" 2>/dev/null
  fi
  pkill -f "profile $PROFILE" 2>/dev/null
  # 兜底：插件可能拉起防休眠/守护类辅助进程，绝不能留下（否则机器无法睡眠）
  pkill -f "caffeinate -i" 2>/dev/null
  if [ "$KEEP" -eq 0 ] && [ -d "$PROFILE_DIR" ] \
     && [ "$PROFILE_DIR" = "$DSH_HOME_DIR/profiles/$PROFILE" ]; then
    rm -rf "$PROFILE_DIR"
  fi
}
trap cleanup EXIT

rm -rf "$WORKDIR"; mkdir -p "$WORKDIR"

DSH_VER="$(dsh --version 2>/dev/null | tail -1)"
echo "══ dsh-plugin-compat-check ══"
echo "目标插件 : $SPEC"
echo "本机 DSH : $DSH_VER"
echo

# ---------- ① 身份核对（npm 规格才做） ----------
echo "── ① 身份核对 ──"
case "$SPEC" in
  *:*|/*|.*) echo "  （非 npm 规格，跳过 registry 核对）" ;;
  *)
    IDENT="$(curl -s --max-time 20 "https://registry.npmjs.org/$(printf '%s' "$SPEC" | sed 's|/|%2F|')" 2>/dev/null \
      | python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception: print("FETCH_FAIL"); raise SystemExit
if "error" in d: print("NOT_ON_NPM"); raise SystemExit
v=d["versions"][d["dist-tags"]["latest"]]
repo=(v.get("repository") or {})
print("VERSION\t"+str(v.get("version")))
print("REPO\t"+str(repo.get("url") if isinstance(repo,dict) else repo))
print("DESC\t"+str(v.get("description"))[:110])
' 2>/dev/null)"
    if [ "$IDENT" = "NOT_ON_NPM" ]; then
      echo "  npm 上不存在该包 —— 若你按仓库名给的，请改用 github:owner/repo"; exit 1
    elif [ "$IDENT" = "FETCH_FAIL" ] || [ -z "$IDENT" ]; then
      echo "  registry 查询失败（网络？），继续尝试安装"
    else
      echo "$IDENT" | sed 's/^/  /'
      REPO_LINE="$(echo "$IDENT" | awk -F'\t' '$1=="REPO"{print $2}')"
      case "$REPO_LINE" in
        *None*|"") echo "  ⚠️  npm 元数据未声明 repository —— 有撞名风险，务必确认它是不是你要的插件" ;;
      esac
    fi
    ;;
esac
echo

# ---------- ② 隔离安装 ----------
echo "── ② 隔离安装到一次性 profile [$PROFILE] ──"
dsh --profile "$PROFILE" --from-default-profile web --dump-config >/dev/null 2>&1
INSTALL_LOG="$WORKDIR/install.log"
dsh plugin --profile "$PROFILE" add "$SPEC" >"$INSTALL_LOG" 2>&1
INSTALL_RC=$?
if [ $INSTALL_RC -ne 0 ]; then
  echo "  ❌ 安装失败（exit=$INSTALL_RC）——通常是 DSH 自带的版本兼容闸门拒绝了它："
  grep -E "incompatible|rejected|to accept the risk|incompatible with" "$INSTALL_LOG" | head -4 | sed 's/^/     /'
  echo
  echo "结论: 不兼容（连安装都过不去）。"
  echo "详情: $INSTALL_LOG"
  exit 0
fi
PKG_DIR="$(python3 -c '
import json,os
p=os.path.join("'"$PROFILE_DIR"'","package.json")
d=json.load(open(p));deps=d.get("dependencies",{})
# 取"新装的那个"：非 profile 预置的最后一个
print(sorted(deps)[-1] if deps else "")')"
echo "  安装成功，已装: $(python3 -c "
import json;d=json.load(open('$PROFILE_DIR/package.json'));print(json.dumps(d.get('dependencies'),ensure_ascii=False))")"
echo

# ---------- ③ 静态提取：插件声明的与调用的 API ----------
echo "── ③ 静态提取插件实际使用的服务 ──"
# ⚠️ 这一步曾经是**另一份** python 提取实现（内嵌在这个 .sh 里）。
# 现在改为调用 Node 内核 —— 理由是「同一个判定不能有两份实现」：
# 两份必然漂移，而本产品的全部卖点就是结论可信。
# 那个 python 实现没有丢，它被冻结成对拍用的参考基线：
#   tools/parity/python-reference/extract.py
node "$KERNEL_DIR/lib/extract.mjs" "$PROFILE_DIR/node_modules" "$WORKDIR" \
  || { echo "  ❌ 静态提取失败"; exit 1; }
# services.json 由内核一并写好了；这里只报告规模
python3 - "$WORKDIR/static.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
print(f"  识别到 {len(d['manifests'])} 个社区插件，{len(d['services'])} 个服务引用")
print(f"  调用点 {len(d.get('callSites', []))} 个（逐插件归属，带 file:line 与证据形态）")
PY
echo

# ---------- 装探针并真实启动 ----------
echo "── ④ 真实启动 + 宿主 API 面 dump ──"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
dsh plugin --profile "$PROFILE" add "file:$SCRIPT_DIR/probe" >/dev/null 2>&1 \
  || echo "  ⚠️ 探针安装失败，将只能给出启动告警层面的结论"

dsh --profile "$PROFILE" --port 0 --no-open >"$LOG" 2>&1 &
SERVER_PID=$!
ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  sleep 2; ELAPSED=$((ELAPSED+2))
  if [ -f "$WORKDIR/probe-report.json" ]; then break; fi
done
sleep 2

echo "  启动告警:"
if grep -q "did not activate" "$LOG"; then
  grep -A3 "did not activate" "$LOG" | head -12 | sed 's/^/     /'
  ACTIVATED=no
else
  echo "     无（未出现 did not activate）"
  ACTIVATED=yes
fi
echo

# ---------- ⑤ API 比对与结论 ----------
echo "── ⑤ API 比对 ──"
# 判定**只有一处实现**：lib/verdict.mjs，经 bin/compat-check.mjs 暴露。
# 这个 .sh 只负责编排（装包、起宿主、拿探针报告），不再自己拼结论。
#
# 注意这里把两个输入都交给内核：
#   --nm      ：重新按 Node 内核提取（它需要逐插件归属与调用点证据，
#               而这些是 python 参考实现没有的）
#   --probe   ：宿主真实运行时面。**给了它，方法级结论才是「确定」**；
#               不给就只能退回官方目录，结论降为「疑似」。
# `--json` 此前是个**死参数**：被解析、被写进用法说明，然后从没被用过。
# 那比不支持更糟 —— 用户以为拿到了机器可读输出，其实是一张表。
JSON_FLAG=""
[ "$JSON" -eq 1 ] && JSON_FLAG="--json"
node "$KERNEL_DIR/bin/compat-check.mjs" \
  --nm "$PROFILE_DIR/node_modules" \
  --probe "$WORKDIR/probe-report.json" \
  --dsh-version "$DSH_VER" $JSON_FLAG
VERDICT_RC=$?
# 退出码是有含义的（0 可用 / 1 部分可用 / 2 不兼容 / 3 无法判定），
# 但对这个脚本的语义来说"检查成功"就够了 —— 结论好坏已经打印出来。
if [ "$VERDICT_RC" -ge 3 ]; then
  echo "  ⚠️ 判定过程本身出了问题（退出码 $VERDICT_RC）—— 这不算插件的结论，别当成不兼容。"
fi

if [ "$ACTIVATED" = "no" ]; then
  echo
  echo "  另有：启动时出现了 did not activate，说明有插件条目没激活（见上面的启动告警）。"
fi

echo
echo "── 收尾 ──"
echo "  日志: $LOG"
echo "  静态提取: $WORKDIR/static.json   探针报告: $WORKDIR/probe-report.json"
if [ "$KEEP" -eq 1 ]; then
  echo "  --keep 已指定：保留 $PROFILE_DIR 供人工排查"
else
  echo "  临时 profile 将随脚本退出被删除"
fi
