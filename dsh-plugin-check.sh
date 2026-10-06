#!/usr/bin/env bash
# =============================================================================
# dsh-plugin-check —— 回答「这个 DSH 插件在我这版上到底能不能用」
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
用法: dsh-plugin-check <spec> [--keep] [--timeout 秒] [--json]

  spec 可为 npm 包名 / github:owner/repo / file:/本地路径 / git+https://...

示例:
  dsh-plugin-check dsh-keep-awake
  dsh-plugin-check github:bearice/dsh-keep-awake
  dsh-plugin-check file:/path/to/my-plugin
USAGE
  exit 2
fi

WORKDIR=/tmp/dsh-plugin-check
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
echo "══ dsh-plugin-check ══"
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
python3 - "$PROFILE_DIR/node_modules" "$WORKDIR" <<'PY'
import json, os, re, sys
nm, workdir = sys.argv[1], sys.argv[2]

def pkg_json(path):
    try:
        return json.load(open(os.path.join(path, 'package.json'), encoding='utf-8'))
    except Exception:
        return None


def main_entry(j):
    """package.json 声明的入口：exports['.'] 优先，退回 main。"""
    exp = j.get('exports')
    if isinstance(exp, dict):
        dot = exp.get('.')
        if isinstance(dot, str):
            return dot
        if isinstance(dot, dict):
            for k in ('default', 'import', 'require'):
                if isinstance(dot.get(k), str):
                    return dot[k]
    return j.get('main') or 'index.js'


def mounted_entries(full, j):
    """从 dsh.bundle.patch → cordis.patch.yml 读出**实际被挂载**的入口。

    这是精度关键：包里常有不会被加载的伴随模块（实测有插件带一个 lib/invariant.js，
    主入口并不 import 它、patch 也没挂载它）。整包扫描会把这些孤儿模块需要的服务
    当成真实缺口，把判定压得过低。
    """
    dsh = j.get('dsh') or {}
    patch = (dsh.get('bundle') or {}).get('patch')
    seeds = []
    if patch:
        try:
            txt = open(os.path.join(full, patch), encoding='utf-8').read()
            for m in re.findall(r'^\s*-\s*name:\s*[\'"]?([^\s\'"]+)', txt, re.M):
                seeds.append(os.path.normpath(m) if m.startswith('.') else main_entry(j))
        except Exception:
            pass
    if not seeds:
        seeds.append(main_entry(j))
    return [s.lstrip('./') for s in seeds]


def local_graph(full, seeds):
    """从入口出发收集本地相对依赖图。"""
    seen, queue = set(), list(seeds)
    while queue:
        rel = queue.pop()
        if not rel or rel in seen:
            continue
        path = os.path.join(full, rel)
        if not os.path.isfile(path):
            hit = None
            for e in ('.js', '.mjs', '.cjs', '.ts', '/index.js', '/index.mjs', '/index.ts'):
                if os.path.isfile(path + e):
                    hit = path + e
                    break
            if not hit:
                continue
            path = hit
            rel = os.path.relpath(path, full)
        seen.add(rel)
        try:
            txt = open(path, encoding='utf-8', errors='ignore').read()
        except Exception:
            continue
        for groups in re.findall(
                r'from\s*[\'"]([^\'"]+)[\'"]'
                r'|require\(\s*[\'"]([^\'"]+)[\'"]\s*\)'
                r'|import\(\s*[\'"]([^\'"]+)[\'"]\s*\)', txt):
            spec = next((g for g in groups if g), '')
            if spec.startswith('.'):
                queue.append(os.path.normpath(os.path.join(os.path.dirname(rel), spec)))
    return seen


def collect_files(full, j):
    """返回 (需要扫描的文件 [(相对路径, 文本)], 是否退回整包扫描)。

    只扫「实际挂载的入口 + 其本地依赖图」，外加客户端入口（dsh.client 单独挂载，
    不经过宿主入口图）。无法解析入口时才退回整包扫描，并把退回状态如实上报。
    """
    graph = local_graph(full, mounted_entries(full, j))
    fallback = not graph
    files, rels = [], set()

    def add(rel):
        rel = os.path.normpath(rel)
        if rel in rels:
            return
        try:
            files.append((rel, open(os.path.join(full, rel), encoding='utf-8', errors='ignore').read()))
            rels.add(rel)
        except Exception:
            pass

    if fallback:
        for root, _dirs, fs in os.walk(full):
            for f in fs:
                if f.endswith(('.js', '.mjs', '.cjs', '.ts')):
                    add(os.path.relpath(os.path.join(root, f), full))
    else:
        for rel in sorted(graph):
            add(rel)
        client_seeds = []
        exp = j.get('exports')
        if isinstance(exp, dict) and isinstance(exp.get('./client'), (str, dict)):
            c = exp['./client']
            client_seeds.append(c if isinstance(c, str) else (c.get('default') or ''))
        for root, _dirs, fs in os.walk(full):
            for f in fs:
                rel = os.path.relpath(os.path.join(root, f), full)
                if f.endswith(('.js', '.mjs', '.cjs', '.ts')) and 'client' in rel.lower():
                    client_seeds.append(rel)
        for rel in sorted(local_graph(full, [s.lstrip('./') for s in client_seeds if s])):
            add(rel)
    return files, fallback

# 找出"社区插件"：package.json 里有 dsh 清单、且非 @deepseek-ai 官方
targets = []
for entry in sorted(os.listdir(nm)):
    for base in ([entry] if not entry.startswith('@') else
                 [os.path.join(entry, s) for s in sorted(os.listdir(os.path.join(nm, entry)))]):
        full = os.path.join(nm, base)
        j = pkg_json(full)
        if not j or 'dsh' not in j or str(j.get('name', '')).startswith('@deepseek-ai/'):
            continue
        targets.append((base, full, j))

services, calls, manifests, svc_files = set(), {}, [], {}
fallback_pkgs = []
for name, full, j in targets:
    manifests.append({
        'name': j.get('name'), 'version': j.get('version'),
        'dshBundle': bool(j.get('dsh', {}).get('bundle')),
        'clientPlatform': (j.get('dsh', {}).get('client') or {}).get('platform'),
        'clientInject': (j.get('dsh', {}).get('client') or {}).get('inject'),
        'peerDependencies': j.get('peerDependencies'),
    })
    # 收集源码文本：只取「实际挂载的入口 + 本地依赖图」（+ 客户端入口）
    blob, fell_back = collect_files(full, j)
    if fell_back:
        fallback_pkgs.append(j.get('name') or full)
    src = '\n'.join(t for _f, t in blob)
    for arr in re.findall(r'inject\s*:\s*\[([^\]]*)\]', src):
        for s in re.findall(r'["\']([A-Za-z][\w.]*)["\']', arr):
            services.add(s)
    for s in re.findall(r"ctx\.get\(\s*['\"]([A-Za-z][\w.]*)['\"]\s*\)", src):
        services.add(s)
    # ctx.get('x') 赋给变量后调用的方法
    for var, svc in re.findall(r"(?:const|let|var)\s+(\w+)\s*=\s*ctx\.get\(\s*['\"]([A-Za-z][\w.]*)['\"]\s*\)", src):
        services.add(svc)
        for m in re.findall(re.escape(var) + r'\.([A-Za-z_]\w*)\s*\(', src):
            calls.setdefault(svc, set()).add(m)
    # 记录每个服务名出现在哪些文件 —— 客户端服务（slots/locale 等）在宿主探针里必然缺席，
    # 必须与宿主端服务分开判定，否则会报假阳性
    for s in services:
        for fname, text in blob:
            if re.search(r'\b' + re.escape(s) + r'\b', text):
                svc_files.setdefault(s, set()).add(fname)
    # 直接 ctx.<svc>.<method>()
    for svc, m in re.findall(r'ctx\.([a-zA-Z]\w*)\.([A-Za-z_]\w*)\s*\(', src):
        services.add(svc)
        calls.setdefault(svc, set()).add(m)
    # svc.<method>() 直呼
    for svc in list(services):
        for m in re.findall(r'\b' + re.escape(svc) + r'\.([A-Za-z_]\w*)\s*\(', src):
            calls.setdefault(svc, set()).add(m)

# 客户端服务：只在路径含 "client" 的文件（任一目录段或文件名）里被引用 ——
# 它们活在浏览器侧，宿主探针必然看不到，不能据此判定「缺失」。
# 注意必须看完整相对路径：客户端代码常在 lib/sprite.js 这类不含 client 的文件名里。
def is_client_file(path):
    return any('client' in seg.lower() for seg in path.replace('\\', '/').split('/'))

# 客户端提示：服务名属于已知客户端服务，或只在疑似客户端的路径里出现。
#
# 重要：这**只是提示，不是判据**。实测两个插件都存在同一服务被宿主与客户端
# 同时引用的情况（客户端设置页要显示运行中 agent 数、读 locale；共用代码
# src/shared/ 也会同时提到），所以文件路径无法可靠区分宿端/客户端。
# 真正的判据是探针：宿主里存在 → 宿主服务；不存在 + 有客户端提示 → 归客户端。
KNOWN_CLIENT = {'slots', 'locale', 'uiRenderer', 'uiSlots', 'themeStore', 'modules',
                'clientModules', 'connection'}


def client_hint(svc, files):
    if svc in KNOWN_CLIENT:
        return True
    return any(is_client_file(f) for f in files)


client_hints = {s: client_hint(s, svc_files.get(s, set())) for s in sorted(services)}

report = {
    'manifests': manifests,
    'services': sorted(services),
    'clientHints': client_hints,
    'calls': {k: sorted(v) for k, v in calls.items()},
    'fallbackPackages': fallback_pkgs,
}
json.dump(report, open(os.path.join(workdir, 'static.json'), 'w'), ensure_ascii=False, indent=2)
# 探针探测**全部**发现的服务 —— 让宿主自己回答"存在与否"，这才是可靠判据
json.dump({'services': sorted(services)}, open(os.path.join(workdir, 'services.json'), 'w'), ensure_ascii=False, indent=2)

for m in manifests:
    print(f"  插件: {m['name']}@{m['version']}  bundle={m['dshBundle']}  client={m['clientPlatform']}")
    peers = m.get('peerDependencies') or {}
    dsh_peers = {k: v for k, v in peers.items() if 'dsh' in k or 'cordis' in k}
    if dsh_peers:
        print(f"    声明的 DSH 依赖: {json.dumps(dsh_peers, ensure_ascii=False)}")
    else:
        print("    声明的 DSH 依赖: 无（闸门不会拦，但也没有兼容保证）")
print(f"  提取到 {len(report['services'])} 个服务引用: {', '.join(report['services']) or '（未识别）'}")
print("  （只扫实际挂载的入口及其依赖图；宿主端 / 客户端归属由下一步真实探针判定）")
if fallback_pkgs:
    print(f"  ⚠️ 无法解析入口、已退回整包扫描: {', '.join(fallback_pkgs)}")
    print("     这种情况下可能把未被加载的伴随模块算进来，判定会偏严，请结合 --keep 核对")
for s, ms in report['calls'].items():
    if ms:
        print(f"    {s} → {', '.join(ms)}")
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
python3 - "$WORKDIR" "$ACTIVATED" <<'PY'
import json, os, sys
workdir, activated = sys.argv[1], sys.argv[2]

static = json.load(open(os.path.join(workdir, 'static.json'), encoding='utf-8'))
try:
    probe = json.load(open(os.path.join(workdir, 'probe-report.json'), encoding='utf-8'))
except Exception:
    probe = None

if not probe:
    print("  探针未产出报告（宿主可能启动失败，或插件把启动打断了）")
    print(f"  启动是否干净: {activated}")
    print("结论: 无法判定 —— 请用 --keep 保留现场后人工查看 boot.log")
    raise SystemExit

root = probe.get('root', {})
scoped = probe.get('scoped', {})
print(f"  探针已运行 (node {probe.get('node')}, {probe.get('platform')})")
print()

missing_services, missing_methods, ok, client_services = [], [], [], []
hints = static.get('clientHints', {})
for svc in static['services']:
    info = root.get(svc)
    if not info or not info.get('present'):
        # 宿主里没有：若路径/名称提示它属客户端，则归为"需界面验证"而非硬判缺失。
        # 否则就是真的缺 —— 这个区分靠探针做裁判，不靠路径猜测。
        if hints.get(svc):
            client_services.append(svc)
        else:
            missing_services.append(svc)
            print(f"  ❌ 服务缺失: {svc}")
        continue
    methods = info.get('methods', {})
    used = static['calls'].get(svc, [])
    # 只判定"看起来像方法调用"的名字，且排除本来就不是方法的内建属性
    gone = [m for m in used if m not in methods]
    if gone:
        missing_methods.append((svc, gone))
        have = ', '.join(sorted(methods)[:8]) or '（无方法）'
        print(f"  ⚠️  {svc}: 调用了不存在的方法 {gone}")
        print(f"        宿主实际提供: {have}{' …' if len(methods) > 8 else ''}")
    else:
        ok.append(svc)
        if used:
            print(f"  ✓  {svc}: {', '.join(used)} 均存在")

if client_services:
    print(f"  ◻︎ 客户端服务: {', '.join(client_services)}")
    print("        这些活在浏览器侧，宿主探针看不到 —— 只能靠「界面上有没有出现该插件的 UI 元素」来验证。")
    print("        实测过的坑：有插件客户端抛错、而宿主端启动日志完全干净。命令行永远测不到这一层。")

print()
print("  ── 结论 ──")
if missing_services or missing_methods:
    print("  部分可用：依赖的 API 有缺失，相关功能会失效或静默降级。")
    if missing_services:
        print(f"    缺失服务: {missing_services}")
    for svc, gone in missing_methods:
        print(f"    {svc} 缺失方法: {gone}")
    print("  注意：缺失的方法若被 try/catch 或 typeof 守卫包住，插件仍会「激活成功」，")
    print("        但那部分功能是死的 —— 只看 did not activate 会误判成可用。")
else:
    print("  API 面完整，启动干净 —— 判定可用。")
if activated == 'no':
    print("  另有：启动时出现了 did not activate，说明有插件条目没激活。")
print("  注：方法级判定是静态正则启发式，可能存在误报；拿不准时加 --keep 保留现场人工核对。")
PY
echo
echo "── 收尾 ──"
echo "  日志: $LOG"
echo "  静态提取: $WORKDIR/static.json   探针报告: $WORKDIR/probe-report.json"
if [ "$KEEP" -eq 1 ]; then
  echo "  --keep 已指定：保留 $PROFILE_DIR 供人工排查"
else
  echo "  临时 profile 将随脚本退出被删除"
fi
