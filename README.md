# dsh-plugin-compat-check

> 体检你**已经装了的** DSH 插件与**当前 DSH 版本**是否兼容；不兼容的，给出**位置**（`file:line`）和**原因**。

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

---

## 它回答什么

DeepSeek Harness（DSH）是「万物皆插件」的 agent harness：模型、工具、沙箱、界面、甚至 agent loop 本身都是插件。生态很大，而**插件的声明不等于宿主的现实**。

它只有一个问题要答：

> **我这一版 DSH 上，我已经装的那些插件，到底还能不能用？**

能用的地方不说废话；不能用的地方，必须给出**哪一行、为什么**。

### 四类误判，都在本项目里真实遇到过

| 你可能会以为 | 实际情况 |
|---|---|
| `peerDependencies` / `dsh.compatibility` 写了支持 → 能用 | **声明可能是错的。** 有插件声明支持 `0.2.0`，实测启动即抛 `ctx.settings.register is not a function` |
| DSH 的版本闸门放行了 → 能用 | 闸门只做**字符串范围比对**，它不验证 API 是否真的存在 |
| 启动没报错 → 能用 | 插件普遍用 `try/catch`、`typeof` 守卫做降级。**API 缺失时它会「激活成功」，但相应功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端代码跑在浏览器里。实测有插件宿主端完全干净、客户端抛错导致 UI 根本不注册 |

所以：**读声明不够，看日志也不够。** 必须真实读一遍已装插件的源码、拿到宿主的真实 API 面，逐条对上。

## 三份产物，一个内核

同一个 Node 内核（`lib/`），三个入口。**它们的结论不可能不一致**——面板、命令行、对话工具消费的是同一份 `computeReport()` 结果。

| | 插件（进程内） | CLI | skill |
|---|---|---|---|
| 体检已装插件的宿主层 | ✅ 主职 | ✅ | 教 agent 何时调用 CLI |
| 体检客户端半边 | ✅ **独有** | ❌ 命令行永远看不到 | ❌ |
| 预检**尚未安装**的插件 | ❌ | ✅ **独有** | ❌ |
| 「装不上」（版本闸门拒绝） | ❌ | ✅ **独有** | ❌ |
| 宿主起不来时仍能工作 | ❌ 它自己也在里面 | ✅ **独有** | ❌ |
| 输出到终端 / CI | ❌ | ✅ | ❌ |
| 在对话里直接答 | 配合工具 ✅ | ❌ | ✅ |

> **插件的能力严格弱于 CLI，不是超集。** 所以本项目的文案里不会出现「装这个插件帮你做安装前检查」这种话——那是 CLI 的活。

## 快速开始

### 方式一：CLI（最完整，推荐先试）

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check

# 体检某个 profile 里已装的插件
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop

# 有探针报告时，方法级结论才是「确定」
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --probe /tmp/dsh-plugin-compat-check/probe-report.json --dsh-version 0.2.0-rc.2

# 仓库里自带一份可直接对照的运行时面（回归基准用）
node bin/compat-check.mjs --nm ~/.dsh/profiles/parityfix --probe tools/parity/fixtures/host-surface-parityfix.json --dsh-version 0.2.0-rc.2

# 机器可读 / 只要一行
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --json
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --quiet
```

`--nm` 既能给 `node_modules` 目录，也能给 profile 目录（会自动补 `node_modules`）。

| 选项 | 作用 |
|---|---|
| `--nm <dir>` | **必需**。要体检的 `node_modules` 或 profile 目录 |
| `--probe <json>` | 宿主运行时面。**给了它，方法级结论才是「确定」**；不给则退回官方目录、降为「疑似」 |
| `--probe-boot` | **自己起一次宿主拿运行时面**（不必先有探针报告）。默认**不开** —— 它要复制 profile、跑 pnpm、起宿主（约 10~20 秒）。真实 desktop 上的效果：可用 9→**14**、不兼容 0，且发现从「疑似」变「确定」 |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | `--probe-boot` 的等待上限（默认 40）/ 把探针报告留一份到该目录（排查用） |
| `--dsh-version <v>` | 当前 DSH 版本（「声明与实测不符」这类结论的前提） |
| `--rules` / `--catalog` | 覆盖 `rules/` 下的规则表与官方目录 |
| `--no-baseline` | 不读写本机基线（CI / 一次性检查用） |
| `--baseline-file <path>` / `--dry-run` | 指定基线文件 / 算差分但不写 |
| `--json` / `--quiet` | 机器可读 / 只要一行总结论 |
| `--version` | 工具版本。`--json` 里是 `toolVersion`。**报结论时该带上它** —— 同一插件在不同版本下结论会变 |

**退出码**（`1` 与 `2` 只表示**插件的结论**）：

| 码 | 含义 |
|---|---|
| `0` | 全部可用 |
| `1` | 有插件「部分可用」 |
| `2` | 有插件「不兼容」 |
| `3` | **这次体检本身没得出可信结论**（用法错误 / 目录不存在 / 工具自身出错） |

> `3` 为什么必须独立存在：把命令写错读成「这个插件不兼容」，会让用户去查**完全错误的方向**。

### 方式二：装成 DSH 插件（有面板）

```bash
dsh plugin --profile <你的 profile> add github:lcy0121/dsh-plugin-compat-check
```

装完在 **设置 → 内置插件 → 兼容性** 看到总览表；点开任一插件详情页，标题行会有它的结论角标，页面里是逐条发现。启动后几秒还会自动跑一次，并把「与上次相比变了没有」打进启动日志。

### 方式三：装 skill（让 agent 会用）

```bash
./dsh-plugin-compat-check.sh --install-skill
```

装到 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`。有了它，你问「更新之后这插件还行吗」时 agent 会自己去跑，而不是让你去翻文档。

> ⚠️ **插件包内放 `SKILL.md` 不算数**——DSH 不扫描插件包内的文件。这就是方式二装完还要单独跑这一条的原因；插件形态会通过 `ctx.skills.registerProvider()` 自己注册，而这条命令是给**只用 CLI** 的用户准备的（他们拿不到插件注册的那份）。

### 方式四：端到端脚本（装包 + 起宿主 + 拿探针报告 + 判定）

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout 秒] [--json]
```

`<spec>` 与 `dsh plugin add` 完全一致：`dsh-keep-awake`、`github:owner/repo`、`file:/path/to/plugin`。

它比 CLI 多做三件事，也因此**能回答 CLI 回答不了的问题**：查 npm 身份（防撞名）、隔离安装（捕获版本闸门拒绝）、真实启动取探针报告（让方法级结论变成「确定」）。

| 选项 | 作用 |
|---|---|
| `--keep` | 保留临时 profile 与现场，便于人工排查 |
| `--timeout N` | 启动等待秒数，默认 30 |
| `--json` | 机器可读输出 |
| `--install-skill` | 只装 skill，不体检（不需要判定内核） |
| `--force` | 配合 `--install-skill`，覆盖已存在的 skill |
| `--help` | 用法（**不查内核、直接退 0**）|

> **`--install-skill` 与体检互不干扰**：前者不需要内核；后者在内核缺失时会**直接报错退出**，不会降级成"只打印提取结果"——降级会给出一个看起来正常、**实际没有结论**的输出。

## 输出怎么读

```
插件数: 22    有运行时面: 是

结论: 可用 3    部分可用 19    不兼容 0

与上次相比:
  与上次相比没有任何变化

部分可用  dsh-keep-awake@0.2.0
     降级 / 宿主方法缺失  jobs.onJobsChanged  @ lib/index.js:591
       影响: 任务状态不再实时推送，插件退化为轮询（约 5 秒延迟）
       依据: 运行时里没有这个方法；规则表给出影响面
     功能失效 / 宿主方法缺失  settings.register  @ lib/index.js:466
       影响: 插件的设置页/设置项会消失
     客户端半边（命令行测不到，需界面验证）: locale, slots
     无证据可判（只出现名字，没有调用点）: timer
```

每个插件落进**恰好一类**去处，`services` 与去处集合必须相等（有不变式盯着）：

| 去处 | 含义 |
|---|---|
| `finding` | 有结论，见上面的逐条发现 |
| `client-side` | 浏览器侧服务。**命令行测不到**，需要界面验证 |
| `self-provided` | 插件自己提供的服务，不是宿主服务 |
| `runtime-facility` | Cordis 上下文内置成员（`loader` / `effect` …），不是 DSH 服务 |
| `filtered` | 判为噪音/假阳性（JS 内置方法名、无来源变量…），不进结论 |
| `guarded` | **作者自己做了能力检测**，缺失时它有兜底 —— 报出来是假阳性 |
| `abstained` | 数据不足以判定（例如宿主目录对某服务没声明任何方法） |
| `no-calls` | 只出现过名字，没有任何调用点 —— **无证据可判，不是"没问题"** |

后两类是刻意区分出来的。`no-calls` 与 `abstained` 在别处都长得像"没问题"，而它们不是。

## 三档确定性（这是本工具的诚实机制）

| 档 | 什么时候 | 呈现 |
|---|---|---|
| **确定** | 有**运行时面**，或插件**自己声明过**这个依赖 | 不带标注 |
| **疑似** | 只有官方目录（**契约**目录，不是运行时面） | 标 `[疑似]` |
| 不进结论 | 既没声明、也不在目录里 | 记进 `filtered`，可查 |

> **官方目录 ≠ 运行时面。** 它对抽象服务（`jobs`）一个方法都不声明、对 `loader` 完全不收录、对 `settings` 声明的方法数也少于运行时实有。拿它断言「方法不存在」不够格叫确定，所以降级为「疑似」。
>
> 这不是缺陷，是**判不准时降级标注，而不是升格成确定**。

## 不做的事（与不撒谎同样重要）

- **不装包、不起子进程、不联网**（插件形态）。为拿一个版本号去破这条边界不值。
- **不猜**。拿不到 DSH 版本时 `dshVersion` 是 `null`，于是「声明与实测不符」这类结论**自动不成立**——而不是猜一个版本、凭空造出一条结论。
- **不把「不可比」说成「没问题」**。没有基线时会明说「还没比过」，损坏时会明说「读不出来，这次不比较」。
- **不用 LLM 判定**。严重度由分层默认档 + `rules/severity.json` 决定。

## 两条必须知道的边界

**1. 客户端这一层，命令行永远测不到。** 客户端代码在浏览器中执行。要确认它，只能看**界面上有没有出现该插件自己的 UI 元素**。本工具会**列出**客户端服务，但**不判定**它们——这是刻意的诚实，不是遗漏。（插件形态的面板也测不到这一层：它自己跑在宿主里。）

**2. 方法级判定建立在静态提取之上，有已知的误报来源。** 每一次真实缺陷都记在 [`docs/extraction-findings.md`](docs/extraction-findings.md)，包括已修的 18 项。拿不准时加 `--keep` 保留现场：

| 路径 | 内容 |
|---|---|
| `/tmp/dsh-plugin-compat-check/boot.log` | 宿主启动日志（含 `did not activate`） |
| `/tmp/dsh-plugin-compat-check/static.json` | 从插件源码提取的服务与调用点（带 `file:line`） |
| `/tmp/dsh-plugin-compat-check/probe-report.json` | 宿主真实 API 面 |

## 目录结构

（受版本控制共 **147** 个文件：63 个是代码 / 文档 / 规则表，84 个是夹具数据
（`test/fixtures/micro/node_modules/` 69 个合成插件文件、`tools/parity/fixtures/hang-cycle/node_modules/` 5 个，
以及 1 个合成宿主运行时面）。下面把 63 个人工维护的条目**列全**，夹具内部按样例说明。）

```
dsh-plugin-compat-check/
├── README.md                   # 中文说明（本文件）
├── README.en.md                # 英文说明
├── README.ko.md                # 韩文说明
├── Plan.md                     # **开发计划与作业规程**：已锁定决策、里程碑、地雷清单、已实测的 DSH 契约
├── LICENSE                     # MIT
├── .gitignore
├── dsh-plugin-compat-check.sh  # 端到端编排：身份核对 → 隔离安装 → 提取 → 真实启动 → 判定
│
├── lib/                        # 内核：四个纯模块，三份产物共用同一份实现
│   ├── extract.mjs             #   静态提取：谁调用了什么（带 file:line 与证据形态）
│   ├── version.mjs             #   版本号的**唯一真源**（三个入口 + 报告都读它）
│   ├── verdict.mjs             #   判定：结论、三档确定性、每个服务的去处
│   ├── baseline.mjs            #   差分：与上次比变了没有、往哪个方向变（含徽标文案）
│   └── report.mjs              #   渲染：给人看的表（CLI 与对话工具同一口径）
│
├── bin/
│   └── compat-check.mjs        # CLI 入口：参数解析 / 退出码 / 表格与 JSON 两种渲染
│
├── plugin/                     # DSH 插件产物
│   ├── package.json            #   dsh.bundle.patch + dsh.client（platform 必须是字面量 "web"）
│   ├── cordis.patch.yml        #   插件装载清单
│   ├── index.js                #   宿主半边：自省 + 面板数据通道 + 对话工具 + skill 注册
│   ├── scripts/                #   prepack 把内核暂存进 kernel/，postpack 清掉
│   │   ├── stage-kernel.mjs    #     内核**从不进 git**（真源只有仓库根的 lib/ 与 rules/）
│   │   └── unstage-kernel.mjs
│   └── lib/
│       └── client.js           #   客户端半边：**预构建**（宿主不构建），跑在浏览器里
│
├── skill/                      # skill 产物
│   ├── SKILL.md                #   正文（frontmatter 只有 name / description）
│   └── README.md               #   注册机制说明：实测证据、扫描根、rank、frontmatter 规则
│
├── probe/                      # 诊断探针（以 file: 方式装进一次性 profile）
│   ├── package.json
│   ├── cordis.patch.yml
│   └── index.mjs               #   原型链枚举 + 作用域上下文探测；**只记结构，不记值**
│
├── rules/                      # 数据，不是逻辑
│   ├── README.md               #   规则表怎么改、覆盖与新鲜度不变式怎么看
│   ├── severity.json           #   严重度分层表（40 个服务）+ 影响面文案
│   ├── dsh-api-catalog.json    #   官方双端目录（91 宿主 / 8 客户端服务）
│   └── usage-inventory.json    #   规则表覆盖依据（"这个服务确实有人用"）
│
├── docs/
│   └── extraction-findings.md  # 已实测的提取缺陷清单（编号）+ 探针的两条边界
│
├── test/                       # 256 条断言 / 13 个测试文件（见下节）
│   ├── helpers.mjs             #   共用夹具：加载规则表/目录、快照摘要、哈希
│   ├── invariants.test.mjs     #   结果自恰性（对任何输入都必须成立）
│   ├── snapshot.test.mjs       #   输出变了没有（关键字段 + 内容哈希）
│   ├── cli.test.mjs            #   参数真的起作用吗、失败会不会被静默吞掉
│   ├── baseline.test.mjs       #   差分每一类都对吗、没有变化时安静吗
│   ├── cache.test.mjs          #   缓存策略 + 自动体检时机 + profile 判断
│   ├── skill.test.mjs          #   文档漂移：skill 说的每件事工具都做得到吗
│   ├── secrets.test.mjs        #   **仓库里不许出现凭据** + 探针不许记值
│   ├── client-structure.test.mjs  # 客户端组件会不会"注册成功但什么都没做"
│   ├── host-structure.test.mjs    # 宿主半边同上（真的调用 apply，看它注册了什么）
│   ├── packaging.test.mjs      #   npm 包自足吗（真打包，看它离开仓库还算不算得出结论）
│   ├── probe-boot.test.mjs     #   --probe-boot 端到端（**默认跳过**，DSC_SLOW=1 才跑）
│   ├── docs.test.mjs           #   文档信息里的数字还对吗（编号、交叉引用、三语一致）
│   ├── version.test.mjs        #   三个入口 + 报告 JSON 报的是不是同一个版本
│   ├── __expectations__/
│   │   └── micro.json          #   人写的产品承诺：这些结论**必须**是这个
│   ├── __snapshots__/
│   │   ├── micro.json          #   合成夹具的完整输出快照
│   │   └── parityfix.json      #   真实插件集的输出快照
│   ├── __baseline-versions.json #  基准版本锁（漂移会以 BASELINE_DRIFT 报出）
│   └── fixtures/
│       ├── micro/host-surface.json          # 合成宿主运行时面
│       └── micro/node_modules/@fixture/*    # 25 个合成插件，每个专测一种判定路径
│
└── tools/                      # 开发工具（不参与运行时）
    ├── catalog/extract-host-api.py     # 从宿主里抽官方 API 目录（rules/ 的数据来源）
    ├── parity/                         # 与 python 参考实现对拍
    │   ├── parity.sh
    │   ├── a4b-diff.mjs
    │   ├── expected-diffs.json         #   有意的差异，逐条写明理由
    │   ├── python-reference/extract.py #   冻结的 python 参考实现
    │   └── fixtures/
    │       ├── host-surface-parityfix.json   # 真实插件集的运行时面（回归基准）
    │       └── hang-cycle/                   # 曾让提取挂死的循环依赖夹具
    └── slot-probe/                     # 槽位可用性探针（实测 ctx.slots 的 props 契约）
        ├── package.json
        ├── cordis.patch.yml
        ├── index.js
        ├── lib/client.js
        └── cdp-diag.mjs                #   用 CDP 驱动无头 Chrome 看真实渲染
```

## 测试

```bash
node --test test/
```

默认 **256 条断言**（13 个测试文件），秒级。其中 `probe-boot.test.mjs` 默认跳过：

```bash
# 真的起一次宿主，验证 --probe-boot 端到端可跑（约 10~20 秒）
DSC_SLOW=1 node --test test/probe-boot.test.mjs
```

还有一件事**测试层做不到**：验证文档里写的断言条数是不是真的。
在测试里跑套件会自己调自己（无限递归，实测踩过），所以它是**独立脚本**：

```bash
node tools/doc-check.mjs     # 文档数字 vs 实测，不一致就 exit 1
```

> 慢测试默认不跑，是因为它要复制 profile、跑 pnpm、起宿主、等报告 —— 十几秒。
> 混进每次测试等于让人学会跳过测试。但它**不能删**：参数对不对是秒级能验的，
> **流程跑不跑得通只有真跑一次才知道**（复制 profile、探针进 bundles、
> 报告写得出来、**跑完不留垃圾**）。默认跳过时它会打一行提示说明怎么跑，
> 免得变成"静默消失的测试"。

**256 条断言，分布在 13 个测试文件里。**

「分层」要说清两件**不同**的事 —— 它们以前被混在一起，于是同一份文档里同时写着
「三层」（`Plan.md` §0）和「七层」（本节）：

* **3 个认识论分层**（`invariants` / `__expectations__` / `__snapshots__`）—— 这三层各自在
  **原理上**看不见对方那一类错误，缺一不可；
* **13 个测试文件** —— 另外 8 个文件各自盯一个具体问题（参数、缓存、差分、文档漂移、凭据、
  结构、打包…）。它们**不属于**那三层，但同样会失败。

各文件回答什么：

| 文件 | 回答什么 | 抓不到什么 |
|---|---|---|
| `invariants.test.mjs` | 结果**自恰**吗（对任何输入都必须成立） | 错误但内部自恰的结果 |
| `snapshot.test.mjs` | 输出**变了**吗（关键字段 + 内容哈希） | 变了但被如实记进快照 |
| `__expectations__/` | 结论是不是**产品承诺**的那个（人写） | 自己没想到的情形 |
| `cli.test.mjs` | 参数真的起了作用吗、失败会不会被静默吞掉 | 界面行为 |
| `client-structure` / `host-structure` | 组件/宿主会不会**注册成功但什么都没做** | 真实渲染效果 |
| `cache.test.mjs` | 缓存策略对吗、**并发只刷一次**吗、自动体检的时机对不对 | 真实启动时序 |
| `version.test.mjs` | 三个入口 + 报告 JSON 报的是不是**同一个**版本（「单版本」承诺的守门人） | 真实发布流程 |
| `docs.test.mjs` | **文档信息**里的数字还对吗（编号连续、交叉引用有效、三语文档一致） | 断言条数（那要跑套件，见 `tools/doc-check.mjs`） |
| `secrets.test.mjs` | 仓库里有没有凭据、**探针会不会把值抄下来** | 不在这两个形态里的凭据 |
| `baseline.test.mjs` | 差分每一类都对吗、**没有变化时安静吗** | 真实插件 |
| `skill.test.mjs` | skill 说的每件事工具都做得到吗（文档漂移） | —— |
| `probe-boot.test.mjs`（**默认跳过**，`DSC_SLOW=1`） | `--probe-boot` 真的能起一次宿主并拿到面吗 | 慢（10~20 秒），所以默认不跑 |
| `packaging.test.mjs` | npm 包**自足**吗 —— 真打包，看它离开仓库还能不能算出结论 | 慢一点（约 1~2 秒，跑一次 `npm pack`） |

**三层缺一不可**，这是实测出来的：往代码里注入「fallback 永不触发」这个变异，**69 条不变式全绿，快照立刻变红**；反过来清空某插件的调用点时**快照会红、不变式不会**。它们各自在原理上看不见对方那一类。

> 三层里只有**快照**可以被重建。不变式与判据**永远不该被"重建到全绿"**——那是它们存在的意义。
>
> 重建方式：`UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs`（用环境变量而不是 `--update`：`node --test` 会把测试文件之后的参数当成测试文件名，旗标从未生效而退出码正常——**又一类静默空操作**）。

## 维护

| 想干什么 | 怎么做 |
|---|---|
| 跟进 DSH 版本 | `python3 tools/catalog/extract-host-api.py` 重新抽官方目录 |
| 改严重度/影响面文案 | `rules/severity.json`，然后跑测试（有覆盖与新鲜度不变式盯着） |
| 与 python 参考实现对拍 | `./tools/parity/parity.sh <node_modules 目录>` |
| 改这个仓库 | **先读 [`Plan.md`](Plan.md)**：10 项已锁定决策、里程碑、作业规程、地雷清单、已实测的 DSH 契约都在里面 |

## 已知限制

- 输出文案为中文（`README.en.md` 是英文说明，但工具输出本身未做 i18n）
- 方法级判定是启发式的，存在误报可能；每一次已知误报都记在 `docs/extraction-findings.md`
- **客户端半边无法自动验证**，只能列出、需人工看界面
- 端到端脚本需要联网（查 npm registry、装插件）与 `python3`
- 未在 Windows 原生环境验证（内核是纯 Node，理论上可移植；脚本部分需要 POSIX shell）

## License

[MIT](LICENSE)
