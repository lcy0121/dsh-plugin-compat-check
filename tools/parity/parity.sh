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

# 严格对拍的范围：只比「文件集选择」与「服务发现」。
#   manifests / services / fallbackPackages
#
# 不再严格比 calls 与 clientHints，因为 python 版在这两项上有**已知缺陷**：
#   1) calls：它用跨插件累积的服务集合去扫当前插件的源码，别的插件的服务名会被套到
#      本插件的同名局部变量上。实测 desktop profile 的 280 个调用点里 51 个是这种污染
#      （例如 dshmarket 里 `const commands = {...probePnpm...}` 被当成 DSH 的 commands）。
#      逐插件归属后是**严格子集**（只删不增），python 不再是合格参照。
#   2) clientHints：顺序相关（拿当时已累积的服务匹配当前插件的文件）。逐插件正确计算
#      会让 4 个服务 False→True，不反向。
# 这两项改为并排打印数量供人眼核对，而不是伪装成一条总会通过的断言。
STRICT = ['manifests', 'services', 'fallbackPackages']

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

diffs = walk({k: a.get(k) for k in STRICT}, {k: b.get(k) for k in STRICT}) + walk(sa, sb)

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
    print("✓ 严格项一致：manifests / services / fallbackPackages 逐字段相同")
    print("  manifests=%d  服务=%d  退回整包=%d" % (len(a['manifests']), len(a['services']), len(a['fallbackPackages'])))
    print("· 参考值（python）调用点=%d  客户端线索=%d" % (ncalls(a), nhints(a)))
    print("· 实际值（node）  调用点=%d  客户端线索=%d" % (ncalls(b), nhints(b)))
    print("  ↑ 这两项不严格对拍：python 侧有跨插件污染与顺序相关缺陷，原因见脚本内注释")
else:
    print("✗ 存在 %d 处**非预期**差异：" % len(unexpected))
    for line in unexpected[:40]: print("   " + line)
    sys.exit(1)
PY
