# dsh-plugin-compat-check

## 0.1.1 重构状态（本地，尚未发布）

npm 包提供 DSH 插件；CLI 和安装检查脚本从本仓库使用，npm 包没有 CLI `bin`。克隆后先运行 `npm ci --ignore-scripts`。支持 Node `^22.19.0 || >=24`。

提取器使用固定版本 Babel 解析 JS/TS AST，追踪词法绑定、每次调用的位置和包内相对导入，包括副作用 import；不执行被检查的源码。动态解析与跨函数数据流仍有限，解析、读取、资源上限失败会记录为覆盖限制。转述 `ok` 时必须保留 `coverage.status=limited`、`vacuous` 和采样来源；没有发现不能证明所有功能正常。

运行时服务区分存在、明确不存在、未采样、读取失败。探针缺项不等于缺失。现代采样需匹配 profile、DSH 版本，超过24小时失效；旧格式只使用明确记录的键并标记未绑定。宿主硬依赖与客户端需求分别判定。`certainty` 表示证据确定性，`impactBasis` 区分 loader 实际状态与功能影响推断。插件在当前宿主内采样并纳入可映射的 FAILED/PENDING 条目；明确查询其它 profile 时使用静态证据，不借用当前宿主观测。

基线 schema 2 按 canonical profile、采样模式、工具和规则/目录摘要比较；旧基线重新建立。严重度/确定性变化可见，纯版本升级为中性变化。更新使用锁和原子替换，源码扫描不完整不推进基线。文件位于 `$DSH_HOME/dsh-plugin-compat-check/`，名称包含 profile、路径哈希、采样模式。

默认静态 CLI 不启动 DSH。显式 `--probe-boot` 和安装检查会安装包、在自己的临时 profile 中执行目标插件；临时 profile 不是操作系统沙箱。流程使用唯一私有目录，只关闭自己启动的进程。安装、网络、准备和启动失败返回3；明确的 DSH peer 闸门拒绝返回2。`--json` 的 stdout 是一份 JSON。`--keep` 返回保留的 profile/私有现场路径，不再使用共享 `/tmp` 固定路径。探针要求私有 `DSC_OUT_DIR`，读取描述符而不调用 getter。客户端到货核验仍是显式开发工具；Chrome CDP 使用继承管道，无 TCP 调试端口，只核对到货与浏览器错误，不认证完整业务功能。

当前验证与自动统计见 [current-state.json](docs/current-state.json)、[重构实施记录](docs/refactor-results.md)。下文历史测量对应当时的输入；本轮真实 DSH 启动、浏览器界面和 Windows 集成尚待单独验证。

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
| DSH 的版本闸门放行了 → 能用 | 闸门按 semver 检查官方 peer 范围，它不验证 API 是否真的存在 |
| 启动没报错 → 能用 | 插件普遍用 `try/catch`、`typeof` 守卫做降级。**API 缺失时它会「激活成功」，但相应功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端代码跑在浏览器里。实测有插件宿主端完全干净、客户端抛错导致 UI 根本不注册 |

所以：**读声明不够，看日志也不够。** 必须真实读一遍已装插件的源码、拿到宿主的真实 API 面，逐条对上。

## 三份产物，一个内核

同一个 Node 内核（`lib/`），三个入口。相同输入与采样证据使用同一份判定函数；运行时/静态模式的覆盖不同，结果可能不同。

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
node bin/compat-check.mjs --nm ~/.dsh/profiles/desktop --probe /path/to/private-run/probe-report.json --dsh-version 0.2.0-rc.2

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
# 推荐：从 npm（快，且能拿到版本号）
dsh plugin --profile <你的 profile> add dsh-plugin-compat-check

# 或者直接从 GitHub（不用等 npm 同步）
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
| `/path/to/private-run/boot.log` | 宿主启动日志（含 `did not activate`） |
| `/path/to/private-run/static.json` | 从插件源码提取的服务与调用点（带 `file:line`） |
| `/path/to/private-run/probe-report.json` | 宿主真实 API 面 |

## 目录结构

（文件清单由 `docs/current-state.json` 生成；下面展示主要结构。）

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
├── test/                       # 自动统计的测试用例 / 测试文件（见下节）
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
│   ├── meta-check.test.mjs     #   仓库对外面孔（GitHub/npm 元数据）的规则
│   ├── meta-check.test.mjs     #   仓库对外面孔（GitHub/npm 元数据）的规则
│   ├── version.test.mjs        #   三个入口 + 报告 JSON 报的是不是同一个版本
│   ├── __expectations__/
│   │   └── micro.json          #   人写的产品承诺：这些结论**必须**是这个
│   ├── __snapshots__/
│   │   ├── micro.json          #   合成夹具的完整输出快照
│   │   └── parityfix.json      #   真实插件集的输出快照
│   ├── __baseline-versions.json #  基准版本锁（漂移会以 BASELINE_DRIFT 报出）
│   └── fixtures/
│       ├── micro/host-surface.json          # 合成宿主运行时面
│       └── micro/node_modules/@fixture/*    # 27 个合成插件，每个专测一种判定路径
│
└── tools/                      # 开发工具（不参与运行时）
    ├── doc-check.mjs                  # 文档数字自检（断言条数要比实测；**离线**，进发布闸门）
    ├── meta-check.mjs                 # 仓库对外面孔自检（GitHub 简介/标签 · npm 包；**联网**）
    ├── client-arrival.mjs             # 客户端条目「到货」对账（H1'，需要浏览器）
    ├── extractor-recall.mjs            # 调用点层召回（独立枚举对账，不依赖提取器）
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
npm test
```

默认运行整套测试；数量见 `docs/current-state.json`。其中 `probe-boot.test.mjs` 默认跳过：

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

**当前测试数量见 `docs/current-state.json`。** 要说清两件**不同**的事（它们以前被混成过"七层"）：

* **3 个认识论分层**（`invariants` / `__expectations__` / `__snapshots__`）—— 各自在
  **原理上**看不见对方那一类错误。其中 `__expectations__` 是**判据数据**不是测试文件，
  由 `invariants` 与 `snapshot` 消费；
* **测试文件**包括 `invariants` / `snapshot` 及下面列出的入口与行为测试；新增回归见实施记录，
  各自盯一个具体问题（参数、缓存、差分、文档漂移、凭据、结构、打包…）。

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
| `meta-check.test.mjs` | **仓库的对外面孔**（GitHub 简介/标签、npm 的 version/keywords/README）与产品定义一致吗 | 联网那部分（取数用 `tools/meta-check.mjs`，需 gh/npm） |
| `secrets.test.mjs` | 仓库里有没有凭据、**探针会不会把值抄下来** | 不在这两个形态里的凭据 |
| `baseline.test.mjs` | 差分每一类都对吗、**没有变化时安静吗** | 真实插件 |
| `skill.test.mjs` | skill 说的每件事工具都做得到吗（文档漂移） | —— |
| `probe-boot.test.mjs`（**默认跳过**，`DSC_SLOW=1`） | `--probe-boot` 真的能起一次宿主并拿到面吗 | 慢（10~20 秒），所以默认不跑 |
| `packaging.test.mjs` | npm 包**自足**吗 —— 真打包，看它离开仓库还能不能算出结论 | 慢一点（约 1~2 秒，跑一次 `npm pack`） |

**三层缺一不可**，这是实测出来的：往代码里注入「fallback 永不触发」这个变异，**69 条不变式全绿，快照立刻变红**；反过来清空某插件的调用点时**快照会红、不变式不会**。它们各自在原理上看不见对方那一类。

> 三层里只有**快照**可以被重建。不变式与判据**永远不该被"重建到全绿"**——那是它们存在的意义。
>
> 重建方式：`UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs`（用环境变量而不是 `--update`：`node --test` 会把测试文件之后的参数当成测试文件名，旗标从未生效而退出码正常——**又一类静默空操作**）。

## 度量与审计：工具说的到底对不对？

结论能不能被核对，是**可度量**的。三个指标都有对应的命令，都**可复算**：

| 指标 | 怎么测 | 当前值 |
|---|---|---|
| **调用点层召回** | 用一条**与提取器无关**的纯正则枚举扫同样的文件，再对账 | **88.3%**（扣掉有记录的"有意弃权"后；56 条待查） |
| 第 ① 层（宿主未激活） | 宿主自己报的 `fiber.state` 当真值，用合成正反例双向对账 | 真阳性 1 / 假阳性 0 / 漏报 0 |
| 客户端条目**到货** | CDP 的网络域，看每个批次真的取到了没有 | 66/66 条目、3/3 批次 |

```bash
node tools/extractor-recall.mjs              # 调用点层召回（有界、可逐条查的队列）
node tools/labels.mjs --nm web --synthetic   # 第 ① 层的双向对账
node tools/client-arrival.mjs                # 客户端到货（要浏览器）
```

**每一层覆盖到哪，必须说清**：

| 层 | 工具承诺什么 | 真值从哪来 |
|---|---|---|
| ① 宿主未激活 | "这个条目会停在 pending" | ✅ 宿主自己报的 `fiber.state` |
| ② **静默降级** | "它激活了，但某个功能是死的" | ❌ **没有机器真值** |
| ③ 客户端半边 | "浏览器里那半边加载不出来" | ⚠️ 到货可测（CDP），**渲染/运行**要人看界面 |

> ⚠️ **没有"静默降级的召回率"这个数字，而且我们不打算去追它。**
> 它问的是「所有死掉的功能里我们报出了几个」—— 而那个分母是**插件作者的知识**。
> 要拿到它就得给**每一个**插件写功能测试，而插件集合是**开放**的（本机 14 个社区插件，
> 换台机器换一批，作者发版还会让测试静默失效）。**那不是"贵"，是没有上界。**
> 我们改测它**上游**那一层：**所有会失败的调用点里我们找到了几个** ——
> 这一层属于我们、可以独立测量、且给出的是**有界**队列。
>
> 正例也不能只靠等待：本机真实 profile 上 **0 个 PENDING / 0 个 FAILED**，所以病例由
> 合成夹具**安排**（注入一个无人提供的服务 → 必然 PENDING）。但**真值仍然来自宿主** ——
> 我们只安排病例，不让它自己说"我坏了"。

**审计记录**：结论分两种可信度，输出里看得出来（`impactBasis`）：

| | 是什么 | 谁确认的 |
|---|---|---|
| **事实**（`依据`） | 我们量到了什么 —— 方法不在运行时里、调用点没有能力检测 | 运行时面 + 源码行，可逐条复核 |
| **影响** | 这意味着用户会失去什么 | **标了「推断，非实测」的，是我们读代码得出的** |

审计本机所有 profile 上用户实际会看到的 `method` 级发现：

| 模式 | 发现数 | 确定性 | 结果 |
|---|---|---|---|
| 默认（无运行时面） | **7** | 全部 `[疑似]` | 都是**线索**：带面后 6 条被证实方法其实存在，1 条在 try/catch 里 |
| 带运行时面 | 2 → **1** | `certain` | **其中 1 条是假阳性，已修** |

那条假阳性（作者把能力检测写在**辅助函数**里，正则看不见）改变了设计：现在也识别
「同文件辅助函数里的能力检测」，并把「事实」与「推断」在输出里分开。

> ⚠️ 样本很小（`certain` 级声明：修前 2 条、修后 1 条）。**不要读成"精确率 50%"或"100%"**
> —— 它是一条**发现假阳性并修掉**的记录，不是一个比率。逐条细节见
> [`docs/extraction-findings.md`](docs/extraction-findings.md)。

## 维护

| 想干什么 | 怎么做 |
|---|---|
| 跟进 DSH 版本 | `python3 tools/catalog/extract-host-api.py` 重新抽官方目录 |
| 改严重度/影响面文案 | `rules/severity.json`，然后跑测试（有覆盖与新鲜度不变式盯着） |
| 与 python 参考实现对拍 | `./tools/parity/parity.sh <node_modules 目录>` |
| 改对外说明（简介/标签/README） | `node tools/meta-check.mjs` 核对 GitHub 与 npm 上的面孔 |
| 改这个仓库 | **先读 [`Plan.md`](Plan.md)**：10 项已锁定决策、里程碑、作业规程、地雷清单、已实测的 DSH 契约都在里面 |

## 已知限制

- 输出文案为中文（`README.en.md` 是英文说明，但工具输出本身未做 i18n）
- 方法级判定是启发式的，存在误报可能；每一次已知误报都记在 `docs/extraction-findings.md`
- **客户端半边无法自动验证**，只能列出、需人工看界面
- 端到端脚本需要联网（查 npm registry、装插件）与 `python3`
- **Windows 不做本机验证 —— 这是决定，不是缺口。** 我们主要服务 macOS / Linux；Windows **提供兼容**（纯 Node，无平台专有 API）但验证交给用户。内核里没有任何平台专有调用；编排脚本需要 POSIX shell

## License

[MIT](LICENSE)

