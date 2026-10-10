#!/usr/bin/env python3
"""从 DSH 桌面端 app.asar 里抽出**官方生成的宿主 API 目录**。

为什么要它：判定「插件调用的服务/方法在不在」需要一个权威的宿主侧清单。
官方把它生成在 `@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js` 里
（0.2.0-rc.2 共 91 个宿主服务），直接读它比"起一个宿主去 dump"快得多，
也不需要动用户的环境。

用法:
  tools/catalog/extract-host-api.py [app.asar 路径] [输出 json 路径]
默认读 /Applications/DeepSeek Harness.app/Contents/Resources/app.asar，
默认写到 rules/host-api-catalog.json。
"""
import json, re, struct, sys, os, pathlib

ASAR = sys.argv[1] if len(sys.argv) > 1 else "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar"
OUT = sys.argv[2] if len(sys.argv) > 2 else "rules/dsh-api-catalog.json"
HOST_TARGET = "dsh/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js"
CLIENT_TARGET = "dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js"


def read_asar_entry(asar, logical_path):
    """asar 归档：8 字节 pickle 头 + JSON 目录 + 数据区。按逻辑路径取一个文件。"""
    with open(asar, "rb") as f:
        head = f.read(16)
        # 实测布局（Electron asar）：
        #   [0:4]  = 4（pickle 头长度）
        #   [4:8]  = headerSize（4 字节对齐后的长度）
        #   [8:12] = headerSize（未对齐）
        #   [12:16]= JSON 实际长度
        #   [16:]  = JSON，其后是数据区
        json_size = struct.unpack("<I", head[12:16])[0]
        header_size = struct.unpack("<I", head[4:8])[0]
        f.seek(16)
        header = json.loads(f.read(json_size).decode("utf-8"))
        store_offset = 16 + header_size
        node = header
        for part in logical_path.split("/"):
            node = node["files"][part]
        f.seek(store_offset + int(node["offset"]))
        return f.read(int(node["size"]))


def method_names(seg):
    """抽「服务名 → 方法名」。

    对条目的前缀要求放宽（单/双引号都认、逗号可有可无），因为宿主侧与客户端侧
    是两份不同的生成器产物，形状不完全一致。边界取下一个同级条目的起点。
    """
    marks = [(m.start(), m.group(1))
             for m in re.finditer(r"key:\s*['\"]([A-Za-z][\w.]*)['\"]", seg)]
    svcs = {}
    for idx, (pos, key) in enumerate(marks):
        end = marks[idx + 1][0] if idx + 1 < len(marks) else len(seg)
        body = seg[pos:end]
        names = []
        for sig in re.findall(r"signature:\s*['\"]([^'\"]+)['\"]", body):
            mm = re.match(r"\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(", sig)
            if mm:
                names.append(mm.group(1))
        svcs[key] = sorted(set(names))
    return svcs


def bracket_slice(text, start):
    """从 start 处的 '[' 开始做括号配平，返回整段数组文本。"""
    i = text.index('[', start)
    depth = 0
    j = i
    while j < len(text):
        if text[j] == '[':
            depth += 1
        elif text[j] == ']':
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
        j += 1
    return text[i:]


def main():
    host_src = read_asar_entry(ASAR, HOST_TARGET).decode("utf-8", errors="ignore")
    i = host_src.index("export const SERVICE_API")
    host = method_names(host_src[i:host_src.index("export const EVENT_API")])

    # 客户端目录形状不同（const SERVICE_API = [ ... ]），用括号配平取整段
    client_src = read_asar_entry(ASAR, CLIENT_TARGET).decode("utf-8", errors="ignore")
    m = re.search(r"SERVICE_API\s*[:=]\s*\[", client_src)
    client = method_names(bracket_slice(client_src, m.end() - 1)) if m else {}

    if len(host) < 50 or len(client) < 3:
        print(f"✗ 解析结果异常：宿主 {len(host)} 个、客户端 {len(client)} 个 —— 解析规则可能已随版本失效",
              file=sys.stderr)
        sys.exit(1)

    out = {
        "_note": "从 DSH 桌面端 app.asar 内**官方生成**的 API 目录解析出的服务与方法清单。"
                 "host = Node 宿主侧；client = 浏览器客户端侧。它随 DSH 版本变化 —— 换版本后必须重新生成。"
                 "⚠️ 注意：目录 ≠ 运行时 API 面。抽象服务（如 host.jobs）在目录里**一个方法都不声明**，"
                 "但运行时实现有方法；方法级判定必须优先用运行时面（探针），拿目录当运行时面会海量误报。",
        "_source": {"host": HOST_TARGET, "client": CLIENT_TARGET},
        "_asar": ASAR,
        "host": {k: {"methods": v} for k, v in sorted(host.items())},
        "client": {k: {"methods": v} for k, v in sorted(client.items())},
    }
    pathlib.Path(OUT).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"✓ 宿主 {len(host)} 个服务 / {sum(len(v) for v in host.values())} 个方法；"
          f"客户端 {len(client)} 个服务 / {sum(len(v) for v in client.values())} 个方法 → {OUT}")


main()
