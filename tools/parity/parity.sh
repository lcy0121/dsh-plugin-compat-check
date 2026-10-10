#!/usr/bin/env bash
# 静态提取对拍：Node 移植版 vs .sh 里那段 python 真源。
#
# python 源码是**从 dsh-plugin-compat-check.sh 里现抽的**，不是副本 ——
# 否则比到的可能是一个已经漂移的拷贝，对拍就失去意义。
#
# 用法: tools/parity/parity.sh <node_modules 目录> [输出目录]
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NM="${1:?用法: parity.sh <node_modules 目录> [输出目录]}"
OUT="${2:-/tmp/compat-parity}"
PY_SRC="$REPO/dsh-plugin-compat-check.sh"

rm -rf "$OUT"; mkdir -p "$OUT/py" "$OUT/js"

# 只取**第一个** python 块；脚本里有多个 heredoc，抽多了会连比对段一起跑
awk "/<<'PY'/{if(!f){f=1;next}} f&&/^PY$/{exit} f" "$PY_SRC" > "$OUT/extract.py"
if ! grep -q "json.dump(report" "$OUT/extract.py" || grep -q "探针未产出报告" "$OUT/extract.py"; then
  echo "✗ 没能从 $PY_SRC 抽出 python 块"; exit 1
fi
echo "① 已从 .sh 抽出 python 真源: $(wc -l < "$OUT/extract.py" | tr -d ' ') 行"

python3 "$OUT/extract.py" "$NM" "$OUT/py" > "$OUT/py.stdout" 2>&1 || { echo "✗ python 版失败"; tail -5 "$OUT/py.stdout"; exit 1; }
echo "② python 版输出 OK"
node "$REPO/lib/extract.mjs" "$NM" "$OUT/js" > "$OUT/js.stdout" 2>&1 || { echo "✗ node 版失败"; tail -5 "$OUT/js.stdout"; exit 1; }
echo "③ node 版输出 OK"

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
