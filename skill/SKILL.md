---
name: dsh-plugin-compat-check
description: 体检「已经装进某个 profile 的 DSH 插件」与当前 DSH 版本是否兼容，并给出每条不兼容的 file:line 与原因。当用户说「更新 DSH 之后插件不工作了」「这个插件在我这版上还行吗」「设置页/标签页/面板不见了」「工具点了没反应」「启动日志里有 did not activate」「装上了也没报错但功能是死的」，或者想核对插件声明的 peerDependencies、engines.dsh 兼容范围是否属实时，使用本 skill。Check whether the DSH plugins already installed in a profile work on the current DSH version, with file:line and reason; use when a plugin stopped working after a DSH update, when a settings page or feature silently disappeared, or when a plugin activates without error but its functionality is dead.
---

# dsh-plugin-compat-check

回答一个问题：**我这一版 DSH 上，我已经装了的插件到底能不能用**；不能用的，给位置（`file:line`）和原因。

判定内核只有一处实现（`lib/verdict.mjs`，经 `bin/compat-check.mjs` 暴露），插件 / 脚本 / 本 skill 三个入口共用它。所以你调 CLI 得到的结论，与插件面板里看到的**必须**是同一份——如果对不上，那是缺陷，要报出来，不要替某一方圆场。

## 先看能不能直接调工具

如果**当前会话已经注册了 `compat_check` 工具**（插件半边提供的对话入口，跑的是同一个内核），优先用它；没有就按下面的命令跑 CLI。两者结论同源，不要为了"多一点信息"去绕别的路。

## 怎么跑

内核在一个 `dsh-plugin-compat-check` 检出/包目录里，必须同时有 `bin/compat-check.mjs`、`lib/`、`rules/`。先定位它，再跑：

```bash
# 1) 找到内核（仓库检出，或 profile 里装好的包目录）
ls <repo>/bin/compat-check.mjs

# 2) 体检「已装插件」。--nm 接受 profile 目录，也接受 node_modules 目录
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --probe <probe-report.json> --dsh-version <版本>

# 机器可读 / 只要一行结论
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --quiet
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --json

# 一次性检查（CI、临时排查）：别在用户的 DSH_HOME 里留下基线文件
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
```

完整的参数表以 `node bin/compat-check.mjs --help` 为准（**跑一遍再引用**，别凭记忆写旗标）：

| 旗标 | 作用 |
|---|---|
| `--nm <dir>` | 必需。要体检的 `node_modules` 目录，或一个 profile 目录（会自动补 `node_modules`） |
| `--probe <json>` | 宿主的**真实运行时面**（探针报告）。给了它，方法级结论才是「确定」 |
| `--probe-boot` | **自己起一次宿主拿运行时面**（不必先有报告）。默认不开，约 10~20 秒。**关键是它把「疑似」变成「确定」** —— 用户要一个可信结论时用它 |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | `--probe-boot` 的等待上限（默认 40）/ 留一份探针报告到该目录（排查用） |
| `--dsh-version <v>` | 当前 DSH 版本，用于「声明与实测不符」那类结论 |
| `--json` / `--quiet` | 机器可读 / 只输出结论行 |
| `--no-baseline` | 不读写本机基线。**一次性检查用这个**，见下面的「副作用」 |
| `--rules` / `--catalog` | 覆盖规则表与官方 API 目录（默认在 `rules/`） |

`--nm` 指哪里：`$DSH_HOME/profiles/<name>`（默认 `~/.dsh/profiles/<name>`）。用户说「我的插件」时，先弄清楚是哪个 profile，别默认 `desktop`。

探针报告从哪来，三条路（**优先级从高到低**）：

1. **`--probe-boot`**：让 CLI 自己起一次宿主去拿（推荐 —— 不需要任何前置准备）。
   它只在你显式要求时才跑（约 10~20 秒），默认路径是只读静态的。
2. `--probe <json>`：你手上已经有一份探针报告。`./dsh-plugin-compat-check.sh` 跑完会落在
   `/tmp/dsh-plugin-compat-check/probe-report.json`；放在 `node_modules` 旁边时 CLI 也会自动找到。
3. 都没有 → 方法级结论一律降为「疑似」。**这时不要假装有**。

> 为什么值得主动提 `--probe-boot`：实测在真实 desktop profile 上，**没有运行时面时
> 38 条发现全是「疑似」**，而跑一次之后可用数从 9 升到 14、不兼容从 4 降到 0
> —— 换句话说，**不给面就只能给出"判不准"，给面才能给出结论**。

## 输出怎么读

```
插件数: 4    有运行时面: 是

结论: 可用 3    部分可用 1    不兼容 0    （其中 1 个「可用」是空洞的：它没有任何可检查的依赖）

部分可用  dsh-keep-awake@0.2.0
     功能失效 / 宿主方法缺失  settings.register  @ lib/index.js:466
       影响: 插件的设置页/设置项会消失
       依据: 运行时里没有这个方法；规则表给出影响面
     客户端半边（命令行测不到，需界面验证）: locale, slots
     已过滤（判为噪音/有兜底）: jobs.onJobsChanged
     无证据可判（只出现名字，没有调用点）: timer
可用  @omdsh-dev/dsh-plugin-check@0.1.0
可用  dsh-pet@0.3.6
     客户端半边（命令行测不到，需界面验证）: commandUi, locale, remote, remote.commands, slots
     已过滤（判为噪音/有兜底）: llm.listConfigurableProviders, llm.listProviders
可用  dsh-plugin-compat-check-probe@0.0.1   [空洞的结论：无可检查对象]
```

> ⚠️ 上面这段是**从真实运行里抄的**，不是编的。它曾经是编的 —— 里面写着
> `jobs.onJobsChanged @ lib/index.js:591` 是"降级"，而查源码 :590 是
> `if (jobs !== undefined && typeof jobs.onJobsChanged === 'function')`，
> **作者明明写了能力检测**，那是一条**假阳性**（已修）。
> 教训：**示例输出也必须从运行里抄**，否则 skill 会教 agent 去期待一个不存在的结论。

- **总结论**每插件一个：`可用` / `部分可用` / `不兼容` / `未知`。
- **每条发现**四件事：严重度（`致命` / `功能失效` / `降级`）、类别（`宿主服务缺失` / `宿主方法缺失` / `无人提供的依赖` / `声明与实测不符`）、`服务.方法`、`@ 文件:行`。
- `影响` 与 `依据` 是给人验证用的：告诉用户**凭什么**这么判，而不是只给一个红叉。
- `[疑似]`：这一条没有运行时面支撑。转述时**必须**带上「疑似」，不能抹平成确定。
- `[空洞的结论：无可检查对象]`：这个插件没有任何可检查的依赖，"可用"是空的。别把它当成通过。
- `客户端半边（命令行测不到，需界面验证）`：列出来的服务**命令行永远测不到**，只能让用户去看界面上有没有该插件的元素。**不要替它下结论**。
- `已过滤（判为噪音/有兜底）`：报了但被判定为不构成问题（例如插件自己写了 `typeof x?.y === 'function'` 能力检测）。过滤与弃权**也是结论的一部分**，要如实转述，不要只报红叉。
- `无证据可判`：只出现名字、没有调用点。这是弃权，不是清白。

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 可用（全体无问题） |
| `1` | 部分可用（有 API 缺失，相关功能降级或失效） |
| `2` | 不兼容（有插件连基本依赖都不满足） |
| `3` | **无法判定**——工具/输入出了问题，**这不是插件的结论** |

`3` 必须与插件结论严格分开：`--nm` 指了不存在的目录、探针报告不是合法 JSON、渲染层抛异常，都退 `3`。看到 `3` 就说「这次没查成」，**绝不能说成"不兼容"或"部分可用"**（用的 flag 也对不上，这类混码见过）。

CI 里可以直接用：`0` 过，`1`/`2` 按你的策略处理，`3` 是**工具故障**，应该让流水线报错而不是静默放行。

## 判据：这个工具的三条硬规矩

**1. 确定性是三档的，不是二值。**
`确定`（服务名出现在可信声明里，或有运行时面实证）/ `疑似`（只靠官方目录推断——**那份目录是契约目录，不是运行时面**）/ `高概率假阳性`（已过滤）。没有运行时面时方法级结论一律降为「疑似」。**「疑似」是诚实，不是缺陷**——把不确定的位置呈现得像确定一样，比不给位置更糟。

**2. 假阳性比假阴性更被容忍，但假阴性的表现形式是「沉默」。**
判不准时一律**降级**，不升格成确定：假阳性会让用户去做不必要的处置（改配置、换版本），成本高且磨损信任。但反过来也要盯住——**假阴性不产出红字，它产出沉默**，而用户会把沉默当成「一切正常」。所以：
- 「没报」不等于「没问题」。要区分**查过了、没问题**和**没查成**。
- 先看 `有运行时面: 是/否`、`插件数: N`、退出码，再谈结论。
- `插件数: 0` + 退出码 `0` 是**最危险**的输出：它意味着一个插件都没检到，不是"全都好"。看到这个先回头确认 `--nm` 指对了没有。

**3. 「激活成功」不等于「功能可用」。**
这个生态的插件普遍用 `try/catch`、`typeof` 守卫做降级：API 没了它照样激活成功，只是相应功能是**死的**。所以「启动没报错」「日志干净」都不能当结论；同理，插件的 `peerDependencies` / `engines.dsh` 声明也不等于事实——DSH 自带的版本闸门只做**字符串范围比对**，不验证 API 是否存在。

## 边界（不要越界承诺）

- **客户端半边命令行测不到。** 插件在浏览器里跑的部分（面板、标签页、设置卡片）需要人工在界面上确认；本工具只列出待确认项，不判定。
- **方法级判定是正则启发式**，可能有误报。拿不准时建议用户加 `--keep`（脚本形态）查看现场：`static.json`（提取到的调用点）、`probe-report.json`（宿主真实 API 面）、`boot.log`（启动日志）。
- **副作用只有一个，要主动说清**：默认会把这次结论写成本机基线
  （`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.json`），好让下次对比出「相比上次变了什么」。
  一次性检查（CI、替别人看一眼）加 `--no-baseline`；`--dry-run` 是只算差分不写。除此之外它不装包、
  不改用户的 profile、不联网（除脚本形态的 npm 身份核对）。不要用它去"顺便修一下"。
- 报结论时**带上位置和依据**。只说「不兼容」而不给 `file:line`，等于让用户无法验证我们凭什么判——那正是这个工具存在的理由。
