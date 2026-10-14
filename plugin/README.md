# dsh-plugin-compat-check


0.1.1 is a local unpublished candidate. This npm artifact provides the DSH plugin and staged shared kernel, not the repository CLI. Runtime dependencies are pinned `@babel/parser` and `semver`; `LICENSE` is included. Source installs require the repository and `npm ci --ignore-scripts` at its root, or a prepacked artifact. The host samples services without executing getters, reports mapped loader failures, and preserves coverage/provenance and inferred impact. Full browser feature verification remains separate. Release state: repository `docs/refactor-results.md`.

告诉你**已经装好的 DSH 插件**跟**当前 DSH 版本**到底兼不兼容；不兼容的，给出**位置**
（`file:line`）和**原因**。

这是同一份判定内核的三个入口之一（DSH 插件）。另外两个是 CLI 与 skill —— 见仓库说明。

## 为什么需要它

四种"看起来没问题"其实都有问题：

| 你可能会以为 | 实际情况 |
|---|---|
| `peerDependencies` 写了支持 → 能用 | 声明可能是错的。DSH 自带的版本闸门只做**字符串范围比对** |
| DSH 版本闸门放行了 → 能用 | 同上，它不验证 API 是否存在 |
| 启动没报错 → 能用 | 插件普遍 `try/catch` 降级，**API 缺失时它"激活成功"但功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端跑在浏览器里，日志里根本没有它 |

## 安装

```bash
dsh plugin --profile <你的 profile> add dsh-plugin-compat-check
```

装好后插件会：

- 在**设置 → 内置插件**里加一个「**兼容性**」标签页，列出每个插件的结论
- 在插件详情页给一个角标（可用 / 部分可用 / 不兼容）
- 注册一个 `compat_check` 对话工具，可以直接问
- 注册一个 skill，让 agent 知道何时该用它

## 结论怎么读

```
部分可用  dsh-keep-awake@0.2.0
     功能失效 / 宿主方法缺失  settings.register  @ lib/index.js:466
       影响（推断，非实测）: 插件的设置页/设置项会消失
       依据: 运行时里没有这个方法；规则表给出影响面
     客户端半边（命令行测不到，需界面验证）: locale, slots
     已过滤（判为噪音/有兜底）: jobs.onJobsChanged
```

- **每条发现都带位置**：只说"不兼容"而不给 `file:line`，用户就无法验证我们凭什么判
- **`[疑似]`**：这一条没有运行时面支撑。转述时**必须**带上「疑似」
- **`已过滤（判为噪音/有兜底）`**：报了但判定为不构成问题（例如作者自己写了
  `typeof x.y === 'function'` 能力检测）。**过滤也是结论的一部分**，不要只报红叉
- **`客户端半边`**：列出来的服务命令行测不到，只能人工在界面上确认 —— 工具不下结论
- **「推断，非实测」**：这条影响面是**我们读代码得出的**，不是量出来的。工具量到的只有
  「那个方法不在运行时里、调用点没有能力检测」；「用户会失去什么」是我们的判断。
  实测有过反例：一个作者把能力检测写在**辅助函数**里，工具照样报了「设置页会消失」，
  而他早就兜住了。**转述时请保留这个限定。**

## 确定性是三档的

| 档 | 判据 |
|---|---|
| **确定** | 服务名出现在可信声明里（`inject` / `ctx.get` / `ctx.inject`），或有运行时面实证 |
| **疑似** | 只靠官方 API 目录推断 —— **那份目录是契约目录，不是运行时面** |
| **已过滤** | 判为噪音（vendored 代码里的同名变量）或作者有兜底 |

官方目录与运行时面**差别很大**：实测 `jobs` 在目录里 0 个方法、运行时 29 个；
`settings` 目录 6 个、运行时 10 个；`loader` 完全不收录。
所以**没有运行时面时，方法级结论一律降为「疑似」**。

## 安全边界

这个插件**严格只读**：不装包、不起子进程、不联网（默认）、只碰当前 profile。

**唯一的副作用**是它会把自己的体检记录写成本机基线
（`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.json`），
好让下次对比出「相比上次变了什么」。它不写别的地方。

如果连这个也不想让它写，用 CLI 形态加 `--no-baseline`。

## 版本

`--json` 输出的 `toolVersion`（CLI 形态下 `--version`）是**这份结论是哪一版工具给的**。
注意它和 `dshVersion` 是两件事：后者是**被体检对象**的版本。
同一个插件在不同版本的规则表/提取器下结论会变，所以报结论时请带上 `toolVersion`。

## 许可证

MIT。源码与完整说明：<https://github.com/lcy0121/dsh-plugin-compat-check>
