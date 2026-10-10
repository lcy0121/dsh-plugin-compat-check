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
    """从入口出发收集本地相对依赖图。

    seen   = 已成功解析出的文件（返回值）
    visited = 已出队检查过的**路径形态**

    这两个必须分开。原先只用 seen 去重，而「靠补扩展名才解析成功」时它把解析后的
    路径（b.js）放进 seen，队列里传的却是未解析形态（b），于是 `rel in seen` 永远
    不成立 → 每次访问都重新读文件、重新展开它的导入 → 只要有环就无界膨胀。
    实测：3 个 JS 文件（无扩展名 ESM 导入 + 成环）即可让本函数 98% CPU 空转不停；
    真实插件 @liustack/modlens 打包的 undici 就是这个写法。修法是把「检查过」与
    「解析成功」分开，不改变返回的图，只去掉重复展开。
    """
    seen, visited, queue = set(), set(), list(seeds)
    while queue:
        rel = queue.pop()
        if not rel or rel in visited:
            continue
        visited.add(rel)
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
        if rel in seen:
            continue
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
