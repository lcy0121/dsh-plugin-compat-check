# dsh-plugin-check

> 在安装之前，几分钟内判断一个 DSH 社区插件在你这一版 DeepSeek Harness 上到底能不能用。

**简体中文** | [English](README.en.md)

---

## 它解决什么问题

DeepSeek Harness（DSH）是「万物皆插件」的 agent harness：模型、工具、沙箱、界面甚至 agent loop 本身都是插件。社区生态很大，但**插件的声明不等于宿主的现实**。以下四类误判在本项目中都真实遇到过：

| 你可能会以为 | 实际情况 |
|---|---|
| `peerDependencies` 写了支持某版本 → 能用 | 声明可能是错的。有插件声明支持 `0.2.0`，实测启动即抛 `ctx.settings.register is not a function` |
| DSH 的版本闸门放行了 → 能用 | 闸门只做**字符串范围比对**，它不验证 API 是否真的存在 |
| 启动没报错 → 能用 | 插件普遍用 `try/catch`、`typeof` 守卫做降级。**API 缺失时它会「激活成功」，但相应功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端代码跑在浏览器里。实测有插件宿主端完全干净、客户端抛错导致 UI 根本不注册 |

结论：靠读声明和看日志都不够，必须**真实启动一次，再把宿主实际的 API 面与插件实际的调用点逐条比对**。这就是本工具做的事。

## 前置要求

- **DSH CLI**：`dsh` 在 `PATH` 中（桌面端可在菜单栏 → 「管理 dsh 命令…」安装）
- **POSIX shell 环境**：macOS 或 Linux。Windows 请在 WSL 或 Git Bash 中运行
- `bash`、`python3`、`curl`、`pgrep`/`pkill`

## 快速开始

```bash
git clone https://github.com/<你的用户名>/dsh-plugin-check.git
cd dsh-plugin-check
chmod +x dsh-plugin-check.sh
```

```bash
./dsh-plugin-check.sh <spec> [--keep] [--timeout 秒]
```

`<spec>` 与 `dsh plugin add` 完全一致：

```bash
# npm 包名
./dsh-plugin-check.sh dsh-keep-awake

# GitHub 仓库（生态里大量插件未发布到 npm）
./dsh-plugin-check.sh github:owner/repo

# 本地开发中的插件
./dsh-plugin-check.sh file:/path/to/my-plugin
```

| 选项 | 作用 |
|---|---|
| `--keep` | 保留临时 profile 与现场，便于人工排查（默认退出时删除） |
| `--timeout N` | 启动等待秒数，默认 30。插件越重越需要给足 |

## 输出怎么读

```
✓  agents: list 均存在                      ← 这一项确实能用
⚠️  settings: 调用了不存在的方法 ['register']
      宿主实际提供: configure, describe, mutate, replace …
❌ 服务缺失: xxx                             ← 相关功能确定失效
◻︎ 客户端服务: locale, slots                 ← 本工具测不到，需界面验证
```

| 结论 | 含义 |
|---|---|
| **API 面完整，启动干净** | 宿主端与比对层面可用；客户端部分仍需界面确认 |
| **部分可用** | 存在 API 缺失 → 相关功能失效或静默降级，其余可用 |
| **不兼容** | 连安装都过不了 DSH 的版本闸门 |

## 它做四件事

### ① 身份核对

查 npm registry 上同名包**到底属于哪个仓库**。

这不是多虑——生态里真实存在撞名。例如 `dsh-effort-slider` 这个 npm 名属于一个仓库，而你想装的可能是另一个同名仓库的插件；`aegis` 在 npm 上是个与插件本体无关的包（插件只存在于 GitHub）。**装错包比装不上更糟**——它会静默地做别的事。

若 npm 元数据未声明 `repository`，脚本会明确警告。

### ② 隔离安装

从 `web` 模板创建一个一次性 profile `plugincheck`，把目标插件装进去。

失败通常意味着 DSH 自带的版本兼容闸门拒绝了它——这类插件连装都装不上。

> **全程不碰你的 `desktop` 等正式 profile。**

### ③ 静态提取插件的实际调用点

从插件源码里找出它**真正调用**的服务与方法，而不只是看它声明了什么。

会区分**宿主端服务**与**客户端服务**——后者活在浏览器里，宿主探针天然看不到，不能据此判「缺失」。

### ④ 真实启动 + API 面比对

启动宿主，用随附探针 dump 出宿主的**真实 API 面**，与 ③ 的调用点逐条比对。

> 探针会把**原型链上的方法**一起枚举出来。这条是踩坑换来的：只枚举自有属性会漏掉原型方法，曾导致「某版本取消了某项能力」的错误结论，而实际只是方法改名了。

## 两条必须知道的边界

**1. 客户端这一层，命令行永远测不到。**
插件的客户端代码在浏览器中执行。要确认它，只能看**界面上有没有出现该插件自己的 UI 元素**（按钮 / 标签页 / 设置卡片）。本工具会列出客户端服务，但**不会**判定它们——这是刻意的诚实，不是遗漏。

**2. 方法级判定是正则启发式。**
静态扫描可能把非调用点误认成调用。拿不准时加 `--keep`，保留现场查看原始数据：

| 路径 | 内容 |
|---|---|
| `/tmp/dsh-plugin-check/boot.log` | 宿主启动日志（含 `did not activate`） |
| `/tmp/dsh-plugin-check/static.json` | 从插件源码提取的服务与调用点 |
| `/tmp/dsh-plugin-check/probe-report.json` | 宿主真实 API 面 |

## 产物与清理

脚本退出时通过 `trap EXIT` 自动收尾：

1. 递归杀掉测试服务进程树
2. 兜底清理 `caffeinate` 等防休眠辅助进程
   > 这一步是安全底线：防休眠类插件若留下辅助进程，会让机器再也无法睡眠
3. 删除临时 profile（`--keep` 时保留）

## 目录结构

```
dsh-plugin-check/
├── dsh-plugin-check.sh   # 编排：身份核对 → 安装 → 提取 → 启动 → 比对
├── probe/                # 诊断探针（以 file: 方式装进临时 profile）
│   ├── package.json
│   ├── cordis.patch.yml
│   └── index.mjs         # 原型链枚举 + 作用域上下文探测
├── README.md
├── README.en.md
└── LICENSE
```

## 实现要点（改这个工具前值得先读）

- **探针不声明 `inject`**：声明了就会因缺服务而卡在 `PENDING`，探测能力反而下降。它靠延迟 + `try/catch` 自行兜底。
- **探针先写 `probe-applied.txt` 标记再探测**：否则「没有报告」无法区分「插件没加载」和「探测中途抛错」。
- **判断客户端服务用 `any` 而非 `all`**：插件常有 `src/shared/` 这类两端共用代码。严判（要求所有引用文件都在客户端目录）会把共享文件里的客户端服务误报成缺失——实测中确有插件因此被误判。
- **编辑 `probe/index.mjs` 后注意硬链接**：插件装进 profile 后是硬链接/副本，若用会替换 inode 的方式写入（部分编辑器如此），`node_modules` 里的副本不会同步，会出现「改了代码但行为没变」。

## 已知限制

- 输出文案目前为中文
- 仅覆盖宿主端 API 面；客户端需人工在界面上确认
- 方法级判定为启发式，存在误报可能
- 需要能联网（查 npm registry、安装插件）
- 未在 Windows 原生环境验证

## License

[MIT](LICENSE)
