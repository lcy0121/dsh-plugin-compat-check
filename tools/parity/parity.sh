#!/usr/bin/env bash
# 静态提取对拍：Node 版 vs **冻结的** python 参考实现。
#
# 参考实现在 tools/parity/python-reference/extract.py，它来自 dsh-plugin-compat-check.sh
# 早先的那段内嵌 python（该段已随"判定收成一处"被删除）。冻结的理由见下面 ① 处注释：
# 参考实现本来就该是不可变的历史基线，而不是从别处现抽。
#
# 用法: tools/parity/parity.sh <node_modules 目录> [输出目录]
#       tools/parity/parity.sh tools/parity/fixtures        # 对拍每个 fixture 子目录
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NM="${1:?用法: parity.sh <node_modules 目录> [输出目录]}"
OUT="${2:-/tmp/compat-parity}"
REF_PY="$REPO/tools/parity/python-reference/extract.py"

# ── fixture 根目录的展开 ──────────────────────────────────────────
#
# ⚠️ 这里修的是一个**假通过**。README 写的跑法是
#     tools/parity/parity.sh tools/parity/fixtures
# 而那个目录本身**不是** node_modules 根（真正的包在 `<名字>/demo/` 下），
# 于是脚本对着一个空目录跑完，打印 `manifests=0 服务=0` 和 **`✓ 严格项一致`** ——
# 退出码 0、全绿、什么都没比。一个「从未真正执行过的检查」与「通过的检查」
# 在输出上没有区别，这正是最该被消除的一类假象。
#
# 所以：参数若是个 fixture 根目录（下面有 `<名字>/demo/` 或 `<名字>/node_modules/`），
# 就逐个展开对拍，而不是对着空目录打印一个 ✓。
SUBS=""
case "$NM" in
  */node_modules) : ;;   # 明确是 node_modules 根 → 单目标，不展开
  *)
    for d in "$NM"/*/; do
      [ -d "$d" ] || continue
      if [ -d "${d}demo" ]; then SUBS="$SUBS ${d}demo"
      elif [ -d "${d}node_modules" ]; then SUBS="$SUBS ${d}node_modules"
      fi
    done
    ;;
esac
if [ -n "$SUBS" ]; then
  fail=0
  for s in $SUBS; do
    echo "── 对拍 $s ──"
    "$0" "$s" "$OUT-$(basename "$(dirname "$s")")" || fail=1
  done
  exit $fail
fi

# ── 空比较守卫 ────────────────────────────────────────────────────
#
# 比对 **0 个包** 是没有意义的，但它此前会打印 `✓ 严格项一致` 并退出 0 ——
# 与「比了 21 个包且全一致」在输出上完全一样。所以这里直接拦住。
#
# 注意：拦截的判据是「提取器一个包都没找到」，而不是「目录里没有文件」。
# 一个插件目录如果结构不对（例如它本身不是 node_modules 根、包里没有 dsh 清单），
# 提取器的 manifests 就是空的 —— 那同样是一次没比到东西的假通过，应该报出来。
NM_ABS="$(cd "$NM" 2>/dev/null && pwd || echo "$NM")"
if [ ! -d "$NM" ]; then
  echo "✗ 不是目录: $NM"; exit 1
fi
_n=0
for e in "$NM"/*; do
  [ -e "$e" ] || continue
  _n=$((_n + 1))
done
if [ "$_n" -eq 0 ]; then
  echo "✗ $NM 是空目录 —— 对拍一个空目录会打印 ✓，所以这里直接失败。"
  exit 1
fi

rm -rf "$OUT"; mkdir -p "$OUT/py" "$OUT/js"

# python 真源现在是一个**冻结的参考实现**，不再从 .sh 里现抽。
#
# 为什么改：原来是从 dsh-plugin-compat-check.sh 里 awk 出一段内嵌 python。
# 但那个 .sh 的提取步骤已经换成调用 Node（判定收成一处，见 bin/compat-check.mjs），
# 内嵌 python 随之删除 —— 于是"现抽"就抽不到了。
# 抽不到时脚本会报错退出，不会静默；但把它冻结下来更好：
#   1) 参考实现本来就该是不可变的历史基线，而不是"从别处现抽"；
#   2) 现在它会随 .sh 的编排变化而消失，冻结后不受影响；
#   3) 历史仍在：文件头注明了它来自哪个提交。
cp "$REF_PY" "$OUT/extract.py"
if ! grep -q "json.dump(report" "$OUT/extract.py"; then
  echo "✗ 参考实现 $REF_PY 不完整"; exit 1
fi
echo "① 参考实现: $(wc -l < "$OUT/extract.py" | tr -d ' ') 行（已冻结，不再从 .sh 现抽）"

python3 "$OUT/extract.py" "$NM" "$OUT/py" > "$OUT/py.stdout" 2>&1 || { echo "✗ python 版失败"; tail -5 "$OUT/py.stdout"; exit 1; }
echo "② python 版输出 OK"
node "$REPO/lib/extract.mjs" "$NM" "$OUT/js" > "$OUT/js.stdout" 2>&1 || { echo "✗ node 版失败"; tail -5 "$OUT/js.stdout"; exit 1; }
echo "③ node 版输出 OK"

# 比到了**几个包**？0 个就说明这次对拍什么都没验，必须报错而不是打印 ✓。
# 之前 README 写的跑法（传 fixture 根目录）正好落进这个陷阱：
# 提取器找不到任何带 dsh 清单的包 → manifests=0 → 打印 `✓ 严格项一致` → 退出 0。
_nm=$(python3 -c "import json,sys;print(len(json.load(open(sys.argv[1],encoding='utf-8'))['manifests']))" "$OUT/py/static.json" 2>/dev/null || echo 0)
if [ "$_nm" -eq 0 ]; then
  echo "✗ 这次对拍**一个包都没比到**（manifests=0）—— 比对空集合必然一致，"
  echo "  所以这是一个假通过而不是一个通过。"
  echo "  检查：$NM 是不是 node_modules 根目录？（真正的包要在它下面一层，带 dsh 清单）"
  exit 1
fi
echo "   （比到 $_nm 个包）"

python3 - "$OUT" "$REPO/tools/parity/expected-diffs.json" <<'PY'
import json, sys, os

out, allow_path = sys.argv[1], sys.argv[2]
a = json.load(open(os.path.join(out, 'py', 'static.json'), encoding='utf-8'))
b = json.load(open(os.path.join(out, 'js', 'static.json'), encoding='utf-8'))
sa = json.load(open(os.path.join(out, 'py', 'services.json'), encoding='utf-8'))
sb = json.load(open(os.path.join(out, 'js', 'services.json'), encoding='utf-8'))

# 严格对拍的范围：只剩「文件集选择」这一项。
#   manifests / fallbackPackages
#
# ## 为什么严格范围一再收窄（这是历史，不是随意放宽）
#
# 对拍在**移植期**的作用是「证明 Node 版与原实现行为一致」。那个阶段已经结束，
# 而 python 版随后被证明在**四处**都落后于 Node 版：
#   1) calls：跨插件污染（实测 51/280 是别的插件的服务名套到了本插件的同名局部变量上）
#   2) clientHints：顺序相关（拿"当时已累积的服务"匹配"当前插件的文件"）
#   3) services：**看不见 `ctx.inject([...])` 这种作用域注入**，会漏掉真实依赖
#   4) 文件集：不排除包内 `src/` 源码树（Node 版默认排除）
# 所以现在再拿 python 当"标准答案"只会把 Node 版的正确行为报成差异。
#
# 现在对拍降级为**结构性体检**：只保证「选出来的文件集」没走样，
# 其余并排打印数量供人眼核对。**真正的验收标准是三个回归基准**
# （omdsh-dev/dsh-plugin-check→可用、dsh-keep-awake→部分可用、dsh-pet→可用），
# 而不是这个脚本。
#
# 其余差异（informational）：
#   1) calls：python 跨插件污染
#   1) calls：它用跨插件累积的服务集合去扫当前插件的源码，别的插件的服务名会被套到
#      本插件的同名局部变量上。实测 desktop profile 的 280 个调用点里 51 个是这种污染
#      （例如 dshmarket 里 `const commands = {...probePnpm...}` 被当成 DSH 的 commands）。
#      逐插件归属后是**严格子集**（只删不增），python 不再是合格参照。
#   2) clientHints：顺序相关（拿当时已累积的服务匹配当前插件的文件）。逐插件正确计算
#      会让 4 个服务 False→True，不反向。
# 这两项改为并排打印数量供人眼核对，而不是伪装成一条总会通过的断言。
STRICT = ['manifests', 'fallbackPackages']

def walk(x, y, path='$', diffs=None):
    if diffs is None: diffs = []
    if type(x) is not type(y) and not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
        diffs.append("%s: 类型不同 %s vs %s" % (path, type(x).__name__, type(y).__name__)); return diffs
    if isinstance(x, dict):
        for k in sorted(set(x) | set(y)):
            if k not in x: diffs.append("%s.%s: 只在 node 版出现" % (path, k))
            elif k not in y: diffs.append("%s.%s: 只在 python 版出现" % (path, k))
            else: walk(x[k], y[k], "%s.%s" % (path, k), diffs)
    elif isinstance(x, list):
        if len(x) != len(y): diffs.append("%s: 长度不同 %d vs %d" % (path, len(x), len(y)))
        for i, (p, q) in enumerate(zip(x, y)): walk(p, q, "%s[%d]" % (path, i), diffs)
    elif x != y:
        diffs.append("%s: %r vs %r" % (path, x, y))
    return diffs

# services.json 也不再严格比（reason 见上：python 看不见 ctx.inject）
diffs = walk({k: a.get(k) for k in STRICT}, {k: b.get(k) for k in STRICT})

allow = {}
try:
    allow = {e["path"]: e.get("reason", "") for e in json.load(open(allow_path, encoding="utf-8"))["allow"]}
except Exception:
    pass

path_of = lambda line: line.split(":", 1)[0].strip()
expected = [l for l in diffs if path_of(l) in allow]
unexpected = [l for l in diffs if path_of(l) not in allow]

ncalls = lambda d: sum(len(v) for v in d.get('calls', {}).values())
nhints = lambda d: sum(1 for v in d.get('clientHints', {}).values() if v)

print()
if expected:
    print("· 预期差异 %d 处（已记入 expected-diffs.json）：" % len(expected))
    for line in expected[:20]:
        print("   " + line); print("     原因: " + allow[path_of(line)])
if not unexpected:
    print("✓ 严格项一致：manifests / fallbackPackages 逐字段相同")
    print("  manifests=%d  服务=%d  退回整包=%d" % (len(a['manifests']), len(a['services']), len(a['fallbackPackages'])))
    print("· 参考值（python）服务=%d  调用点=%d  客户端线索=%d" % (len(a['services']), ncalls(a), nhints(a)))
    print("· 实际值（node）  服务=%d  调用点=%d  客户端线索=%d" % (len(b['services']), ncalls(b), nhints(b)))
    print("  ↑ 不严格对拍：python 版在 calls / clientHints / services(ctx.inject) / 文件集(src 排除) 四处落后，见脚本内注释")
    print("  ↑ 真正的验收是三个回归基准，不是本脚本")
else:
    print("✗ 存在 %d 处**非预期**差异：" % len(unexpected))
    for line in unexpected[:40]: print("   " + line)
    sys.exit(1)
PY
