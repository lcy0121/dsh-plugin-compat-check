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
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1 ;;
    --timeout) TIMEOUT="${2:-30}"; shift ;;
    --json) JSON=1 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ -z "$SPEC" ]; then
  cat >&2 <<'USAGE'
用法: dsh-plugin-compat-check <spec> [--keep] [--timeout 秒] [--json]

  spec 可为 npm 包名 / github:owner/repo / file:/本地路径 / git+https://...

示例:
  dsh-plugin-compat-check dsh-keep-awake
  dsh-plugin-compat-check github:bearice/dsh-keep-awake
  dsh-plugin-compat-check file:/path/to/my-plugin
USAGE
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

  两种用法：
    1) 在仓库里跑（推荐）：git clone 后直接执行本脚本
    2) 只想要脚本：用 DSC_KERNEL 指向内核目录，例如
         DSC_KERNEL=/path/to/dsh-plugin-compat-check ./dsh-plugin-compat-check.sh <spec>
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
