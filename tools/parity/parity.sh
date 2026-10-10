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

python3 - "$OUT" <<'PY'
import json, sys, os
out = sys.argv[1]
a = json.load(open(os.path.join(out, 'py', 'static.json'), encoding='utf-8'))
b = json.load(open(os.path.join(out, 'js', 'static.json'), encoding='utf-8'))
sa = json.load(open(os.path.join(out, 'py', 'services.json'), encoding='utf-8'))
sb = json.load(open(os.path.join(out, 'js', 'services.json'), encoding='utf-8'))

def walk(x, y, path='$', diffs=None):
    if diffs is None: diffs = []
    if type(x) is not type(y) and not (isinstance(x, (int, float)) and isinstance(y, (int, float))):
        diffs.append(f"{path}: 类型不同 {type(x).__name__} vs {type(y).__name__}"); return diffs
    if isinstance(x, dict):
        for k in sorted(set(x) | set(y)):
            if k not in x: diffs.append(f"{path}.{k}: 只在 node 版出现")
            elif k not in y: diffs.append(f"{path}.{k}: 只在 python 版出现")
            else: walk(x[k], y[k], f"{path}.{k}", diffs)
    elif isinstance(x, list):
        if len(x) != len(y): diffs.append(f"{path}: 长度不同 {len(x)} vs {len(y)}")
        for i, (p, q) in enumerate(zip(x, y)): walk(p, q, f"{path}[{i}]", diffs)
    elif x != y:
        diffs.append(f"{path}: {x!r} vs {y!r}")
    return diffs

d1 = walk(a, b)
d2 = walk(sa, sb)
print()
if not d1 and not d2:
    print(f"✓ 完全一致：static.json 与 services.json 逐字段相同")
    print(f"  manifests={len(a['manifests'])}  服务={len(a['services'])}  调用点={sum(len(v) for v in a['calls'].values())}  退回整包={len(a['fallbackPackages'])}")
else:
    print(f"✗ 存在 {len(d1)+len(d2)} 处差异：")
    for line in (d1 + d2)[:40]: print("   " + line)
    sys.exit(1)
PY
