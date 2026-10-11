# Plan.md — dsh-plugin-compat-check 开发计划与作业规程

> **这份文档是写给"未来的自己"看的。**
> 一次会话结束，上下文就没了：为什么当时否掉了方案 B、哪条路已经踩过坑、
> 某个结论是实测的还是猜的 —— 全部蒸发。留下的只有仓库里的文件。
>
> 所以本文件不是备份，是**把上下文变成可执行资产**。写法上有一条硬标准：
> **每一步都要带"怎么验证它做完了"的命令**，而不是只写意图。
>
> **每完成一步就回来勾选，并把新踩到的坑记进第 6 节。** 不更新的计划等于没有计划。

---

## 0. 怎么用这份文档

1. 先读第 1、2 节，确认产品定义和已锁定的决策 —— **这些不要重新讨论**，重新讨论等于把用户的十次回答作废。
2. 动手前读第 4 节（作业规程）。里面每一条都是踩过坑换来的。
3. 从第 5 节找第一个未勾选的步骤，按它的验收命令做完、勾上。
4. 遇到任何"这个结论我是猜的"，回到第 3 节确认它是否已被列为已知假设。
4b. **测试分三层，改代码时三层都要过。** 顺序是：不变式（`test/invariants.test.mjs`）
   → 判据（`test/__expectations__/`）→ 快照（`test/__snapshots__/`）。三层职责不同：
   - **不变式**回答「自恰不自恰」，对任何输入都必须成立，**永远不该重建**（它不可再生，
     所以它也无法被"重建到全绿"）；
   - **判据**回答「结论是不是我们要的那个」，写的是产品承诺，改它必须说得出理由；
   - **快照**回答「变了没有」，是唯一能看见"**停止做出某个结论**"的一层
     —— 不变式抓不到这个，因为它看到的是一个内部自恰的空集合。
   > 实证：把「fallback 永不触发」这个变异注入代码，**69 条不变式全绿，快照立刻变红**。
   > 反过来说，清空某插件的 `calls` 时**快照会红、不变式不会** —— 所以两层都必须有。

4c. **重建快照的正确姿势**：`UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs`，
   并且**重建前先读一遍差异**。基准版本变化会被单独报成 `BASELINE_DRIFT`，
   它要求**单独提交一次**版本变更、并同步改 §5 G1 —— 不要顺手重建把它盖掉。
   为什么用环境变量而不是 `--update`：`node --test x.test.mjs --update` 会把 `--update`
   当成测试文件名，旗标从未生效而退出码正常（又一类「静默空操作」）。

5. **每完成一小项，立刻回来更新三处**：§9「下一动作」改成下一个未完成项、§5 勾选 checkbox、新踩的坑记进 §6。
   > 这一条不是形式主义。文档一旦落后于代码，下一次会话就会拿过期的事实做判断——
   > 而过期事实比没有事实更危险，因为它看起来还很可信。**"文档已过期"应当被当成 bug 对待。**

---

## 1. 产品定义

**一句话**：让 DSH 使用者知道自己**已经装了的**插件跟**当前 DSH 版本**是否兼容；不兼容的，给出**位置**和**原因**。

### 1.1 三份产物，一个产品

用户原话：「它们是一个产品的不同角度而已」。**一份 Node 判定内核，三个入口。**

| 能力 | 插件（进程内） | 脚本（npx） | skill |
|---|---|---|---|
| 体检已装插件的宿主层 | 主职 | 可以（要起一次性 profile，40–80 秒） | 不实现，只教 agent 何时调用 |
| 体检客户端半边 | ✅ 独有 | ❌ 命令行永远看不到 | ❌ |
| 预检尚未安装的插件 | ❌ 被只读约束排除 | ✅ 独有 | ❌ |
| 「装不上」（闸门拒绝）类结论 | ❌ | ✅ 独有 | ❌ |
| 宿主起不来时仍能工作 | ❌ 它自己也在里面 | ✅ 独有 | ❌ |
| 身份核对（npm 包属于谁） | 默认关闭（不联网） | ✅ | ❌ |

**最后两行是重点：插件的能力严格弱于脚本，不是超集。** 产品文案里不能出现"本插件帮你做安装前检查"这种话。

### 1.2 为什么有这个工具

四类误判（README 里也写了）：

| 你可能会以为 | 实际情况 |
|---|---|
| `peerDependencies` 写了支持 → 能用 | 声明可能是错的 |
| DSH 版本闸门放行了 → 能用 | 闸门只做字符串范围比对 |
| 启动没报错 → 能用 | 插件普遍 `try/catch` 降级，**API 缺失时它"激活成功"但功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端跑在浏览器里 |

最后一行不是理论：桌面端日志目录（`~/Library/Logs/DeepSeek Harness/`，macOS）里 11 天内出现 3 份 web-boot 崩溃日志，其中一份正是 `Error: web boot: 2 entries did not activate`，两条是 `dshmarket` 与 `@michengai/dsh-archive-manager`，且是**客户端 bundle 级联失败**（"skipped after an earlier failure of this bundle"）。

---

## 2. 已锁定的决策（10 题）

**不要重新讨论。** 每条都附了当时否掉什么，因为否掉的理由往往比选中的理由更值钱。

| # | 决策 | 锁定的答案 | 否掉了什么 / 为什么 |
|---|---|---|---|
| 1 | 安全边界 | 插件**严格只读**：不装包、不起子进程、不联网（需时显式开）、默认只碰当前 profile | 全放开：用户刚装进一个第三方插件，它转头去碰环境心理成本极高；且"安装前检查"工具自己要先干净 |
| 2 | 覆盖范围 | 三层全覆盖：宿主未激活 / 静默降级 / 客户端半边。**分两批**：第一批做前两层，第二批加客户端对账 | 只做宿主层：会漏掉"激活成功但功能是死的"，而那是本工具唯一的卖点 |
| 3 | 结果入口 | **面板为主**（官方插件管理页），对话工具为辅，两者消费同一份 JSON | 只做对话工具：答案天然是一张表，塞进对话既占上下文又难扫 |
| 4 | 面板落点 | `settings.plugins.tab` 总览 + `plugins.detail.section` / `.badge` 单插件详情 | 右栏常驻标签页 / 全屏浮层：用户在那个页面上本来就在看"我装了哪些插件" |
| 5 | 触发方式 | 启动后**延迟自动跑**；角标在**任何变化**时都打，并标明方向 | 纯手动：用户永远想不起来跑，而"想不起来"正是这个需求的原点 |
| 6 | 平台边界 | **内核移植到 Node**（单一实现）；三产物跨平台 | 只保 macOS/Linux：官方桌面端只有 macOS + Windows，Windows 是一等目标；双实现：两套逻辑迟早漂移 |
| 7 | 位置粒度 | 第一批：文件:行 + `服务.方法` + 形态标注。**真解析器是必须完成的最终状态** | 只到 `服务.方法`：用户无法验证我们凭什么判 |
| 8 | 原因与严重度 | 五元组（类别/位置/依据/严重度/影响面）+ 确定性标注；严重度由分层默认档 + 规则表定；**LLM 不参与判定** | 让 LLM 读代码给影响面：违背"不撒谎"这个唯一卖点 |
| 9 | 三产物关系 | 单仓库、单版本、**一份 Node 内核**、三个入口；一个 npm 包同时是插件和 CLI | 三份独立实现：三套基线 → 同一插件在不同入口给出不同结论，第 5 题的角标会互相打架 |
| 10 | 交付方式 | 第一批跑通 **GitHub 分发**（`dsh plugin add github:...`），**先不上 npm**；移植期间保留 bash 版 | 直接发 npm：npm 发布公开且近乎不可撤回，应等它先在三个回归基准上站稳 |

### 2.1 结论的数据形态（第 8 题的落地）

```
dsh-keep-awake@0.2.0 → lib/index.js:812  ctx.settings.register(...)
  类别：宿主方法缺失      确定性：确定
  依据：该调用不在 try/catch 内；宿主实际提供 configure / describe / mutate / replace
  严重度：功能失效        影响面：设置页会消失
```

**类别枚举**（插件侧；「安装闸门拒绝」已因第 1 题移出，归脚本）：
① 宿主服务缺失 ② 宿主方法缺失 ③ 启动时条目未激活 ④ 客户端注册失败 ⑤ **声明与实测不符**

第 ⑤ 类是本工具相对既有方案**唯一不可替代**的结论：生态已经在用 `engines.dsh` 和 `dsh.compatibility.dshReleases` 声明兼容性（`dshmarket` 会读后者并在安装前拒绝），**但没有任何人核对声明是否属实**。

**严重度的判定顺序**：先看运行时事实 → 再查表 → 最后落默认档。
- 条目 `FAILED`/`PENDING` → `fatal`（运行时事实，不需要静态分析）
- `inject` 声明的服务宿主没有 → `fatal`（条目会停在 pending）
- `ctx.get('x')` 取不到 → `feature-dead`
- 方法不存在且不在表中 → `feature-dead` + **影响面未知**（这一档必须显眼，它是在承认规则表没覆盖到）

规则表本体：`rules/severity.json`；覆盖依据：`rules/usage-inventory.json`。

### 2.2 确定性的三档判据（A4b 实测换来的，很值钱）

单靠正则无法区分"真服务"与"第三方代码里的同名变量"。但把**可信声明**与**官方服务目录**组合起来，
就能在不写解析器的前提下把噪音分成三档：

| 档 | 判据 | 例子 |
|---|---|---|
| **确定** | 服务名出现在 `inject: [...]` / `ctx.get("x")` / `ctx.inject(["x"])` 里 | `settings`、`sessions`、`tools` |
| **疑似** | 没有可信声明，但**在官方目录里** | `credentials`、`storageDomain`、`subprocess`（确实被松散形式访问） |
| **高概率假阳性** | 没有可信声明，且**不在官方目录里** | `parser`（被凑出 40 个假方法）、`ruleNames`、`topoIndex`、`logger` |

**实测（desktop profile，2026-10-11，80 个服务）**：有可信声明的 73 个，丢掉的 7 个是
`consume` / `get` / `or` / `prev` / `rankHint` / `root` / `tokens` —— **全部不在官方目录里**，
也就是说**这一次**硬过滤不会误杀任何真服务。

> ⚠️ 但这**不能**推出"可信声明可以当硬过滤"。早先同一条实测（53 个服务那一次）的结论是相反的：
> 丢掉的 7 个里**有 3 个是真宿主服务**。也就是说这个比例**随提取器成熟度在变**，
> 而提取器还在变。**分档依据是稳的，硬过滤是脆的。**
>
> 所以规矩不变：可信声明只用来**分档**，不用来**删东西**。三个回归基准关心的服务
> （`settings` / `jobs` / `agents` / `tools` / `sessions`）全部落在"确定"档，无一误杀。

**服务目录从哪来**：插件形态下可以在运行时直接从 `ctx` 取（不需要硬编码）；
CLI 形态下可从 `app.asar` 内 `@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js`
导出的 `SERVICE_API` 里解析（0.2.0-rc.2 有 91 个宿主服务）。注意它随 DSH 版本变化。

---

## 3. 我仍在承担的假设与风险

**做决定时如果撞上这些，先回来看一眼自己是不是在赌。**

| 风险 | 现状 | 处理 |
|---|---|---|
| **静默降级的检出率未知** | 整个产品的价值都压在这一层，却始终没有召回率/误报率。**已记录 24 条实测缺陷**可以当"已知漏报"的下界，但分母（真实存在的缺口总数）仍然未知 | 这是一条**产品级**风险，不是工程任务：在没有标注集之前，对外的措辞不能承诺"全覆盖" |
| 角标的"变化疲劳" | 用户选了任何变化都打；插件升级、DSH 小版本都会改结论 | 第一版带方向标注先上，按真实频率再调 |
| **客户端"计划 vs 到货"对账无先例（= H1'）** | 官方没有任何服务干这件事，做法只能从 `__DSH_BOOT__` 的形状推断。**宿主对它要下发的客户端条目只知道声明、不知道结果** —— 所以这条路要么需要浏览器，要么需要找到宿主侧的到货记录（还没找到） | 第二批先做**可行性验证**；不成立就换判据（例如只对账"声明了 dsh.client 却没有 exports[./client]"这类静态可判的） |
| **没有 Windows 机器可以真验证** | 本机只有 macOS，而第 6 题选了跨平台 | Windows 路径只能靠代码审查；**这是真实缺口，不假装盖住了** |
| **npm 发布不可撤回** | 第 10 题选了先走 GitHub 分发。H3' 要发 npm，而 npm 发布公开且近乎不可撤回 | 发布前必须：三个回归基准稳定 + `plugin/package.json` 的 `private` 与 `files` 想清楚（**这个包不是自足的**，见 §5.3） |
| ~~Node 移植的验收标准是"输出一致"~~ | ✅ 已关：移植期结束，对拍降级为结构性体检 | —— |
| ~~`plugins.detail.*` 未验证~~ | ✅ 已关：**它不是抽屉**，是侧栏面板换 React 视图状态；三类卡片的角标与 section 都实测通过（C3） | —— |

---

## 4. 作业规程（每次动手都要遵守）

1. **对拍优先于修改。** 移植/重构内核时，先拿到"两边输出一致"，再谈改。对拍脚本是 `tools/parity/parity.sh`，它**从 `.sh` 里现抽 python 源码**来跑 —— 不要用副本，副本会无声漂移。
2. **对拍回答"是否一致"，fixture 回答"是否都对"。** 这次就吃过亏：参考实现（python 版）自己挂着，我一度以为是我的移植写错了。两者都需要。
3. **任何改变输出的改动，都要把差异摊开给用户看**，而不是直接改到"看起来更对"。
4. **确定性标注不是可选项。** 只要调用点来自正则，就必须标"疑似"。把不确定的位置呈现得像确定一样，比不给位置更糟。
5. **LLM 不参与判定。** 严重度由规则表决定；LLM 只能润色措辞。
6. **绝不抛、绝不拖累宿主。** 插件半边的所有代码必须 `try/catch` 兜底并带超时。一个让宿主启动失败的体检插件，会同时成为它要检测的那类问题。
7. **不破坏已发布的 bash 版。** 移植期间它必须保持可用；Node 版在三个回归基准上输出一致后再切默认。
8. **临时环境必须收尾。** 一次性 profile、无头 Chrome 的 user-data-dir、后台进程、`caffeinate` —— 全部清理。删任何路径前先 echo 出绝对路径核对。
9. **不 push、不发 npm、不改远端，除非用户明确要求。** 本地提交可以。
10. **提交时用仓库级身份**，避免把私人邮箱写进公开历史：
    ```
    git -c user.name="Chenyu Liu" -c user.email="233006721+lcy0121@users.noreply.github.com" commit ...
    ```
11. **每完成一小项就回来更新本文件**（§9 下一动作 + §5 checkbox + §6 新坑）。见 §0 第 5 条。
12. **并行期间提交只 stage 自己的路径。** 不要 `git add -A` —— 会把别人正在写的文件一起提交
    （**这个错误已经犯过一次**：子代理还在改 `plugin/index.js` 时，我的一次 `git add -A` 把它带进了提交）。
    并行时用 `git add <明确路径>`，提交前先看 `git status` 里每一行是不是自己的。
13. **计划本身也可能错，而且证据优先于计划。** A4 就是活例：计划写着"收窄客户端种子"，实测发现那样会删掉真实运行的代码，于是**否决了计划**。发现计划与证据冲突时，改计划，不改证据。

---
## 5. 里程碑

### 5.1 第一批（已完成）

**一个内核 + 三个入口**，全部实测过。

| 里程碑 | 产物（路径） | 验收 / 证据 |
|---|---|---|
| **A** 内核移植与重构 | `lib/extract.mjs`、`tools/parity/parity.sh`、`lib/verdict.mjs`、`rules/dsh-api-catalog.json`、`tools/catalog/extract-host-api.py` | 对拍在三个 fixture 上 `✓ 完全一致`；`hang-cycle` 秒级完成；三个回归基准精确命中 |
| **B** 插件宿主半边 | `plugin/index.js`、`plugin/cordis.patch.yml`、`plugin/package.json` | 真实启动：`HOST-HALF-ACTIVATED`、`did not activate` = 0、190 条目自省 |
| **C** 插件客户端半边 | `plugin/lib/client.js`（预构建）、`lib/baseline.mjs` | 真实界面：`table` 1 个 / `tbody` 22 行 / 角标「可用」「部分可用」/ 异常 0 |
| **D** 对话工具 | `plugin/index.js` 的 `registerTool` | 真调一次：`可用 3 / 部分可用 1 / 不兼容 0`，发现带 `file:line` 与影响面 |
| **E** skill 产物 | `skill/SKILL.md`、`skill/README.md`、`dsh-plugin-compat-check.sh` 的 `--install-skill` | 宿主日志 `SKILL registered`；`--install-skill` 在无内核时也能装 |
| **F** 触发与基线 | `plugin/index.js` 的 `serveReport`/`runAutoCheck`、`bin/compat-check.mjs` | 首启/二次/改坏基线三条路都实测；9 条缓存测试 |
| **G** 验收 | —— | 三个回归基准 + 真实 desktop + 无头 Chrome + 收尾干净 |
| **H** 测试基础设施 | `test/`（9 个文件） | `node --test test/` 全绿；慢测试另见 `test/probe-boot.test.mjs` |

**第一批里最值钱的几条实测结论**（都是"猜会猜错"的那类）：

- **`ctx.loader.entries()` 不是数组**（`Array.isArray === false`，可迭代）。按数组写会在真实启动时**静默得到 0 条**。
- **`fiber.await()` 只对 FAILED 有效**：PENDING 会立刻返回且不抛；import 失败的条目**连 `fiber` 都没有**。所以准确说法是"能取到原因的只有 FAILED 一类"。
- **`inject` 保持 `[]` 是可行的**，`ctx.get('loader')` 在空 `inject` 下直接可用；`ctx.loader` 与 `ctx.get('loader')` **不是同一引用**（每读一次包一层 traceable），**别用 `===` 判断**。
- **`plugins.detail.*` 不是抽屉**，是侧栏面板换 React 视图状态，导航只能靠点击（Escape 与重按侧栏都**不回退**，无 URL 路由）。
- **`plugins.item` 槽位放弃使用**：它的 props **没有任何插件身份**（宿主用配置页注册的 `entryId` 限定），加不到"社区插件包卡"上。概览由 `settings.plugins.tab` 承载。
- **对话工具的 `required` 是顶层数组**，不是每个属性上的 `required: true`。写错会被宿主拒掉，而**面板与路由照常工作** —— 只有真调一次才发现得了。
- **skill 的字段约束读自运行时源码**：`provider` 必须**等于** provider 自己的 `name`；旧 frontmatter 键（如 `disableModelInvocation`）会让**整条 frontmatter 被丢弃**。
- **`inject` 保持 `[]` 还有一个理由**：一条体检工具自己因缺服务停在 PENDING 是荒诞的。

### 5.2 第二批（进行中）

| # | 项 | 状态 |
|---|---|---|
| **H4a** | 修 `provide` 数组导致的假阳性（顺带发现"正则读注释"） | ✅ 完成 |
| **P**（新增） | **运行时面**：`--probe-boot` —— 让 CLI 也能拿到宿主 API 面 | ✅ 完成（§5.2.1） |
| **Q**（新增） | **客户端服务不再被拿宿主面判**（服务级 + 方法级） | ✅ 完成（§5.2.2） |
| **H1'** | **客户端半边对账**：计划加载的 `__DSH_BOOT__.entries` vs 实际到货 | ⬜ **待开工** —— 与 P/Q 不是同一件事 |
| **H2'** | 真解析器 | ⬜ 待开工，**验收指标已改**（§5.2.3） |
| **H3'** | npm 发布 | ⬜ 待开工 |
| **H4'** | 严重度规则表补全（现覆盖 40 个服务，官方目录有 91 个宿主服务） | ⬜ 待开工 |

> ⚠️ **P/Q 完成 ≠ H1' 完成。** 我一度把 H1' 标成"已完成"，那是标错了：
> H1' 问的是「**计划要加载的客户端条目，实际到货了几个**」——
> 只有浏览器能回答（宿主对它要下发的客户端条目，只知道声明、不知道结果）。
> P 让 CLI 拿到了**宿主**面，Q 修掉了**客户端服务被拿宿主面判**的假阳性 ——
> 两者都是 H1' 的前置/邻近工作，但没有一条能回答 H1' 的问题。

#### 5.2.1 运行时面：CLI 拿到 `--probe-boot`（H1' 的实现路径）

**瓶颈是实测出来的**：没有运行时面时，**真实 desktop profile 上 38 条发现全是「疑似」**。

| 数据集 | 有运行时面 | 确定性 |
|---|---|---|
| 合成 fixture / 三个回归基准 | 有 | 确定，疑似 **0** |
| 真实 desktop | 没有 | 确定 **0** / 疑似 **45** |

原因：**官方目录不是运行时面**。它给每个服务只声明 **1 个方法**，而运行时实测 `sessions` **14**、`agents` **24**、`llm` **29**、`attachments` **15**、`sessionProjectionCache` **18**。

**实现**：`node bin/compat-check.mjs --nm <profile> --probe-boot`
流程是**先提取、再拿面** —— 把本次涉及的**全部服务名**写进 `services.json`，交给探针照单全问；
然后复制 profile、装探针、起宿主、轮询等报告、**无论成败都清理**。

**为什么默认不开**：要复制 profile、跑 pnpm、起宿主（parityfix 约 9s、desktop 约 18s）。默认路径保持"只读静态、秒级、无副作用"。

效果（真实 desktop）：

| | 静态 | `--probe-boot` |
|---|---|---|
| 结论 | 可用 9 / 部分可用 12 / 不兼容 0 | 可用 **14** / 部分可用 **7** / 不兼容 0 |
| 确定性 | 全是「疑似」 | 全是「确定」 |

> ⚠️ **首次实现耗时 61 秒**，因为我用了 `spawnSync` 同步等一个**长驻进程** —— 它永远不会自己退出，于是必然等满超时。改成"后台起 + 轮询文件"后 9 秒。**这类"等一个不会结束的东西"是典型自伤，记在这里。**

#### 5.2.2 客户端半边被拿宿主面判 —— 已修

根因：`sessions` 这类服务**两端都有**（宿主 14 个方法，浏览器侧另有**一套**），而命令行只有宿主面。

| 假阳性 | 修法 |
|---|---|
| `modules` / `settingsScope` / `configForms` / `remote` 报「宿主服务缺失」 | 判据 c：插件自己的 `dsh.client.inject` 点了名；判据 d：在插件的**客户端文件**里被用到而宿主没有 |
| `sessions.scope` / `emit` / `subscribe`（写在 `lib/client.js`）报「宿主方法缺失」 | 方法级判定**只看宿主侧调用点**；只在客户端调用的方法归「客户端半边，需界面验证」 |

原判据 b（"出现的文件**全部**在客户端桶里"）在**共用代码**面前必然失效：同一个 `lib/index.js` 既跑在宿主也被浏览器 import，于是服务总会留下一个宿主文件。所以才有 c、d 两条补丁。

**效果：不兼容 4 → 0，可用 9 → 14。** 剩余 7 条「部分可用」逐条核过，**都是真实结论**：

```
webServer.get                     @linxin666/dsh-remote-web-ui
sessionPersistence.prepare        @michengai/dsh-archive-manager
sessionPersistence.readFrom       @michengai/dsh-archive-manager
sessions.snapshotEvents（宿主侧）  @michengai/dsh-archive-manager
agents.steer                      @nanmicoder/dsh-agent-teams
desktopProfiles（无人提供）        @nonamelego/dsh-catppuccin, dshmarket
companionQq（无人提供）            dsh-meme
```

#### 5.2.3 H2' 的验收指标要改（原指标已被实测推翻）

原计划写的是「**"疑似"的比例明显下降**」。**实测发现这个指标不成立**：`疑似/确定` 由**"有没有运行时面"**决定，与解析精度无关 —— 解析再准，没探针还是全「疑似」；有了 `--probe-boot` 就全「确定」。

改用这三个**可证伪**的指标：

| 指标 | 怎么测 | 现状 |
|---|---|---|
| **假阴性数** | 人为把某个真实调用点从提取结果里抹掉，看判定是否跟着变 | 每个已验证的缺陷都能变成一个夹具 |
| **"对不上账"的调用点** | 不变式 ⑤（别名归属可解释）现在**能跑红**了，用它当回归闸门 | 0 |
| **`no-calls` / `abstained` 占比** | 这两个是"看到了但判不了／没看到"，占比高说明提取不够 | 见 §8 |

> 第三条决定了 H2' 到底值不值得开工 —— 先量再动手。

### 5.3 被证据否决过的计划（比选中的理由更值钱）

**这些都是"计划写着 A，实测证明必须做 B"**。它们全部来自实测，不是推演：

| 原计划 | 实测为什么不行 | 实际做的 |
|---|---|---|
| **A4**：客户端种子只取 `exports["./client"]`，缺席才回退遍历 | `dsh-better-sidebar` 把客户端代码切成**懒加载 chunk**，用自己宿主半边的路由按 URL 取回（`/sidebar/bundle/${name}.js`）。从声明入口做可达性分析**永远够不到** `client-mermaid.js`（提及次数 0）。收窄 = **静默删掉真代码** | **不动文件集合**，改为给每个文件标**来源桶**（`host-entry`/`client-entry`/`client-extra`/`fallback`），`client-extra` 的调用点标「疑似」 |
| **A4b 原倾向**：`src/` 与嵌套 `node_modules/` 都排 | 排 `src/`：**零信息损失**（服务 −0、调用点 −0、clientHints 零变化）。排嵌套 `node_modules/`：**丢 2 个真调用点**却只有 110 个文件的收益。而且**两刀都碰不到假阳性**（`parser` 那 40 个假方法来自 `lib/client-mermaid.js`，不在被排的两类里） | **只排 `src/`**。并记下结论：**A4b 是效率问题，不是正确性问题** —— 别把假阳性的修复寄托在文件集合收窄上 |
| **A5**：把"插件自有服务"从宿主服务里摘出去 | 查证结果相反：`betterLocale`/`pet`/`agentTeams`/`companionQq` **不是**插件自有服务，而是**被消费但无人提供**。真正的自有服务只有 2 个 | 改为**按提供方三分**：宿主提供 / 某个已装插件提供 / **无人提供**。第三类才是真缺口，且它的性质是「**插件间依赖缺失**」而非「与 DSH 版本不兼容」—— 这决定了它是 `degraded` 还是 `fatal` |
| **`patchUnparsed`**（patch 里读不到 `- name:` 就退回整包扫描）当作"`const inject = [...]` 不被识别"的修法 | 实测命中 **18/21** 个真实插件（它们的 patch 都写成 `- insert: [- id: ...]`），把 host-entry 从 118 打到 **10**、fallback 打到 **1359** 个文件 | **回退**。真正的修法是识别 `inject` 数组字面量赋值 |
| **H2' 原验收指标**：「疑似比例明显下降」 | 该比例由**有没有运行时面**决定，与解析精度无关（见 §5.2.3） | 改用三个可证伪指标 |
| **探针"不问而全知"**：读 `fiber.store` 列出所有服务 | Cordis 抛 `cannot get property "store" without inject`，而探针**刻意不声明 `inject`**（声明了会卡 PENDING）。两者直接冲突 | 保持既有设计：探针只问 `services.json` 点名的服务 —— 所以那份名单必须完整（`--probe-boot` 先提取再拿面） |
| **给 `plugin/package.json` 加 `files` 字段** | 这个包**不是自足的**：宿主半边要靠仓库根的 `lib/` 与 `rules/` 才算得出结论（`resolveKernelDir()` 找 `plugin/..`）。加 `files` 会暗示它可以独立发布 | 撤掉，并把"必须从仓库安装"写进 description |

---

## 6. 已知地雷清单

详细版见 `docs/extraction-findings.md`（24 条，含每条的最小复现）。这里只列最要命的。

| 地雷 | 说明 |
|---|---|
| **目录 ≠ 运行时 API 面** | 官方生成的 API 目录是**契约**目录。实测：`jobs` 目录里 **0 个方法**、运行时 **29 个**；`settings` 目录 6、运行时 10；`loader` **完全不收录**。拿目录当运行时面会海量误报 |
| **"没看到"与"不存在"必须分开** | 这一类占了已知缺陷的一半：副作用导入漏检、`inject` 数组、`method?.(` 不收、宿主看不到客户端服务、探针没问到的服务。它们的共同形状是**输出看起来干净**，而干净与"什么都没扫到"在报告里长得一样。**假阴性比假阳性贵。** |
| **正则读注释与字符串** | 所有规则都基于文本，而正则看不见注释。实测：夹具负向对照被我**自己注释里写的示例代码**拔掉。修法是两种掩码**分开用** —— 声明解析只抹注释（要保留字符串），调用点扫描两者都抹 |
| **对拍已降级为结构性体检** | 移植期已结束：python 版在四处落后（`calls` 跨插件污染 51/280、`clientHints` 顺序相关、看不见 `ctx.inject([...])`、不排 `src/`）。对拍现在**只剩 `manifests` / `fallbackPackages` 严格比对**。**它不是质量保证 —— 别把"对拍通过"误读成"输出正确"** |
| **"尽力而为"的 `catch` 不是安全网** | 它只是把失败藏起来。实例：探针的 `w()` 把 `ENOENT` 咽掉 → **探针一声不响地不产出任何报告**；`dsh-plugin-compat-check.sh` 曾在内核缺失时"只打印提取结果" |
| **vendored 代码遮蔽 `ctx`** | `lib/client-mermaid.js` 里 `ctx.parser.consume()` 的 `ctx` 是解析器上下文，被当成宿主服务并凑出 **40 个假方法** |
| **JS 内置集合方法名会被当成 API 调用** | `const sessions = new Map()` 之后的 `sessions.set/map/sort/values` 会被当成"调用了宿主不存在的方法"。**只靠名字黑名单不安全**（`sessions.get` 是真实宿主方法），必须配合"该方法不在宿主方法表里"一起判 |
| **同名变量撞名会凭空造方法** | better-sidebar 的 `client.js` 里 `service` 同时绑给 `jobs`(1 处) 与 `betterSidebar`(6 处)，原实现每次声明都扫全文件 → 造出 13 个假方法。修法：同名多绑定时**弃权并记录**（`ambiguousAliases`），不猜 |
| **`localBindings` 的键必须是「变量名+文件」** | 按变量名聚会让**后写覆盖先写**：`session` 在一个文件里是歧义绑定、在另一个里是干净的，合并后只剩歧义那条 |
| **`unguardedPairs` 必须去重后再定论** | 同一个 `svc.method` 常被多条规则在同一行各收一次，两档的 `guarded` 判定不一定一致。没去重就下结论 → **作者的兜底永远不生效** |
| **探针输出目录必须自己建** | `try/catch` 会把 `ENOENT` 咽掉，"目录不存在"的表现是**探针什么都不产出也不报错** |
| **编辑装进 profile 的 `probe/index.mjs` 后注意硬链接** | `perl -pi` / 改名写入会**断链**：副本保留旧字节而宿主继续跑旧代码 —— 会造出一次假的"改动没生效"。`edit` 工具同样换 inode。要热更必须 truncate-in-place 或重装 |
| **`undefined` vs `null`** | `JSON.stringify` **省略** `undefined` 键，python `json.dump` 写 `null`。对拍一开始就是被这个抓到的 |
| **`manifests` 是旧兼容视图，不要往里加字段** | 给它加 `engines`/`compatibility` 当场被对拍抓住。新数据放 `perPlugin` |
| **体检插件自己的 `inject` 必须留空** | 写成 `["settings","loader"]` 会让体检插件自己的 fiber 因缺服务停在 PENDING |
| **宿主只警告，客户端才致命** | **宿主侧**：非关键条目未激活**只警告**（`dsh: warning: N entry did not activate`），宿主照常启动。**客户端侧**：客户端条目加载失败 → **整个界面被一张错误屏替代**（`#root` 从 35397 字符剩 450）。⚠️ 分界是**半边**，不是"桌面端 vs CLI" |
| **UI 驱动会假阴性** | 我的验证脚本曾把侧边栏 `aria="插件"` 按钮当成设置页导航项，得出"tab 不渲染"的**错误结论**。设置页里有**两个**「插件」（侧边栏按钮 + 文本「内置插件」的导航项），选择器必须**精确全等**。**验证工具本身也会骗人** |
| **`--port 0` 启动的宿主不会自己退出** | 任务结束后仍能存活很久，必须显式 kill，并确认端口释放 |
| **别在收尾时按模式杀进程** | 我收尾时看到 `cloudflared` 就杀了，而那是用户 desktop app 的 **remote-web-ui 隧道**（他配对的手机靠它）。**杀进程前先确认它属于谁** |

---

## 7. 环境与关键事实

### 7.1 路径与命令

| 项 | 值 |
|---|---|
| 仓库 | 本仓库根（下称 `$REPO`；文档里一律用相对路径，不写这台机器上的绝对路径） |
| 远端 | `lcy0121/dsh-plugin-compat-check`（公开，MIT）；已并入 `0xsline/awesome-deepseek-harness`（PR #688 已合并） |
| DSH 版本 | `0.2.0-rc.2` |
| `$DSH_HOME` | DSH 的状态目录，默认 `~/.dsh`（本机实测值不必记进仓库） |
| 正式 profile | `$DSH_HOME/profiles/desktop`（桌面端独占，见 §6） |
| 桌面端内置 Node | 24.18.1（`pnpm` 11.7.0） |

```bash
# 建一次性 profile（不会启动）
dsh --profile <p> --from-default-profile web --dump-config

# 装插件
dsh plugin --profile <p> add <spec>

# 真实启动（URL 与 token 打在 stdout）
dsh --profile <p> --port 0 --no-open

# 静态提取对拍
./tools/parity/parity.sh <node_modules 目录>

# 只跑提取
node lib/extract.mjs <node_modules 目录> <输出目录>

# 跑一次完整体检（内核的 CLI 形态；三个入口共用这一份结论）
node bin/compat-check.mjs --nm <node_modules 目录> [--probe <探针报告>] [--dsh-version <v>]
node bin/compat-check.mjs --nm <dir> --json     # 机器可读
node bin/compat-check.mjs --nm <dir> --quiet    # 只要一行总结论
# 退出码: 0 可用 / 1 部分可用 / 2 不兼容 / 3 无法判定（CI 可直接用）

# 端到端（装包 + 起宿主 + 拿探针报告 + 判定），需要内核在同目录
./dsh-plugin-compat-check.sh <spec>
```
### 7.2 客户端层怎么测（命令行永远测不到）

本机已具备、零新增依赖：`node`（全局 `WebSocket`、`fetch` 从 Node 22 起）+ 已安装的 Google Chrome。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run \
  --remote-debugging-port=9400 --user-data-dir=/tmp/xxx about:blank &
# 然后 node 脚本连 CDP：Page.navigate 到带 token 的 URL，
# Runtime.enable + Log.enable 收异常/console，Runtime.evaluate 查 window.__COMPAT_PROBE__ 与 DOM
```

已实测可用的证据面：
- `window.__DSH_BOOT__` = `{rev, entries: Array, batches: Array}`（计划加载的客户端条目）
- `document.title` / `#root` 的 DOM 长度（确认界面真的渲染了）
- `Runtime.exceptionThrown` / `Runtime.consoleAPICalled` / `Log.entryAdded`

**注意**：macOS 没有 `timeout` 命令，用后台进程 + 看门狗。

#### 7.2.1 三个曾经踩到的坑（都会造成"看起来跑了其实没跑"）

**① `dsh --profile <p> web` 会报 `too many arguments. Expected 0 arguments but got 1: web`。**
`web` 是 launcher 层面的**应用名**，不是 app 参数。正确写法是用 `--` 分界：

```bash
dsh --profile <p> -- --port 0 --no-open        # ✅
dsh --profile <p> web --port 0 --no-open       # ❌ too many arguments
```

**② `dsh rescue --profile X --from-default-profile web` 会报 `select a profile only once`。** `rescue` 自己会选 profile。

**③ 客户端渲染要验到"是我们的组件渲染的"。** 页面上出现某个字符串**不能证明**归属 —— 任何同名文案都会命中。做法是在组件函数体里设一个只属于我们的标记：

```js
window.__COMPAT_CHECK__ = { slot, label, body, renders: (…||0)+1, at: Date.now() }
```

**标记出现 = 我们的代码真的执行了渲染**，这把"页面里有这几个字"升级成"这一刻由我们的组件产出"。

### 7.3 已实测的 DSH 契约（不要再重新调查）

**客户端 UI 只有 `ctx.slots` 一条通道**，90 个槽位，每个带 `replaceRisk`。注册写法：

```js
ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register(
  { name: "settings.plugins.tab", id: "...", order: 1, label: "..." }, Component));
```

已实测的槽位状态（2026-10-10，0.2.0-rc.2）：

| 槽位 | 声明 | 注册 | 界面渲染 |
|---|---|---|---|
| `settings.plugins.tab` | ✓ | ✓ | **✓ 已验证**（标签名 + 正文都出现） |
| `settings.section` | ✓（5 条占用） | ✓ | **✓ 已验证**（导航项 + 正文） |
| `plugins.detail.section` / `.badge` | ✓（0 条占用） | ✓ | ✗ 未验证（没找到进入详情抽屉的入口） |
| `sidebar.right.pane.tab`(+`.title`) | ✓（7/5 条） | 未测 | — |
| `shell.overlay` | ✓（7 条） | 未测 | — |

**其它关键契约**：
- `dsh.client` = `{platform:"web"}`（**必须** web，解析器会跳过其它值）；`inject` 是**其它客户端插件包名**，不是服务名
- 入口必须 `exports["./client"]`，内容必须是 `window.__ModuleLoader__.load({id, factory})` 包装
- **宿主不构建**，缺 `lib/client.js` 会报 `run pnpm build before launch` 并让条目激活失败
- 静态基线模块（import 无需声明 external）：`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`
- `ctx.loader.entries()` → `.id` / `.options.*` / `.disabled` / `.fiber.state` / `.fiber.inject`；缺服务 = `fiber.ctx.get(k) === undefined`
- 官方已有 `pluginInventory` 服务 + 设置页的 plugin-inventory 分类 —— **不要重造插件清单 UI，只加判定层**
- **`ctx.settings.register` 在 0.2.0-rc.2 不存在**（实际提供 `configure/describe/mutate/replace/schema` 等）
- skill 扫描根（rank 升序优先）：`<project>/.dsh/skills`(100) → `<project>/.agents/skills`(200) → 运行时注册(250) → `customSkillDirs`(300) → `$DSH_HOME/skills`(400) → `~/.agents/skills`(500) → bundled(600)。**profile 目录与插件包内都不会被自动扫描**，深度只有 1 层

---
---

## 8. 现状快照

> 提交历史见 `git log`（本文件不再逐条抄录 —— 那是 `git log` 的职责，抄一遍只会腐烂）。
> 下面只记**当前状态**：结构、规模、临时环境。

### 8.1 规模与状态（2026-10-11）

| 项 | 值 |
|---|---|
| 受版本控制文件 | **119**（53 个人工维护 + 66 个夹具数据） |
| 测试 | **221 条**（9 个测试文件）+ 2 条慢测试（`DSC_SLOW=1`） |
| 默认 `node --test test/` | 全绿，约 **7 秒** |
| 提取缺陷记录 | 24 条，全部已修（`docs/extraction-findings.md`） |
| 三个回归基准 | `@omdsh-dev/dsh-plugin-check` 可用 / `dsh-keep-awake` 部分可用 / `dsh-pet` 可用 |
| 真实 desktop（静态） | 可用 9 / 部分可用 12 / 不兼容 0 |
| 真实 desktop（`--probe-boot`） | 可用 14 / 部分可用 7 / 不兼容 0 |

### 8.2 仓库结构现状

（受版本控制共 **119** 个文件 = 53 个人工维护的条目 + 66 个夹具数据文件。
**与三份 README 的「目录结构」一节保持同一份事实** —— 两边都要在结构变化时一起改，
否则又是一处会漂移的文档。计数与下树均由 `git ls-files` 实测，不凭记忆。）

```
dsh-plugin-compat-check/
├── README.md / README.en.md / README.ko.md   # 中 / 英 / 韩 三版说明（互链）
├── Plan.md                                   # 本文件
├── LICENSE                                   # MIT
├── .gitignore
├── dsh-plugin-compat-check.sh                # 端到端编排（bash + python3）
│
├── lib/                                      # ★ 内核：四个纯模块，三产物共用同一份实现
│   ├── extract.mjs                           #   静态提取（file:line + 证据形态）
│   ├── verdict.mjs                           #   判定（结论 / 三档确定性 / 每个服务的去处）
│   ├── baseline.mjs                          #   差分（变了没有、往哪个方向变）
│   └── report.mjs                            #   渲染（CLI 与对话工具同一口径）
│
├── bin/compat-check.mjs                      # ★ CLI 入口（参数 / 退出码 / 两种渲染）
│
├── plugin/                                   # ★ DSH 插件产物
│   ├── package.json                          #   dsh.bundle.patch + dsh.client={platform:"web"}
│   ├── cordis.patch.yml
│   ├── index.js                              #   宿主半边（inject 故意留空）
│   └── lib/client.js                         #   预构建客户端半边
│
├── skill/                                    # ★ skill 产物
│   ├── SKILL.md                              #   正文（frontmatter 只有 name / description）
│   └── README.md                             #   注册机制说明（实测证据）
│
├── probe/                                    # 诊断探针（一次性 profile 里 file: 装载）
│   ├── package.json / cordis.patch.yml
│   └── index.mjs                             #   原型链枚举；**只记结构，不记值**
│
├── rules/                                    # 数据，不是逻辑
│   ├── README.md                             #   怎么改表、覆盖/新鲜度不变式
│   ├── severity.json                         #   严重度分层（40 个服务）
│   ├── dsh-api-catalog.json                  #   官方双端目录（91 宿主 / 8 客户端）
│   └── usage-inventory.json                  #   覆盖依据
│
├── docs/extraction-findings.md               # 实测提取缺陷清单 + 探针的两条边界
│
├── test/                                     # 221 条断言 / 9 个测试文件 / 七层
│   ├── helpers.mjs
│   ├── invariants.test.mjs                   #   自恰性（69 条）
│   ├── snapshot.test.mjs                     #   输出变了没有
│   ├── cli.test.mjs                          #   参数真的起作用吗、失败会不会被吞
│   ├── baseline.test.mjs                     #   差分各类 + 无变化时要安静
│   ├── cache.test.mjs                        #   缓存策略 / 自动体检时机 / profile 判断
│   ├── skill.test.mjs                        #   文档漂移
│   ├── secrets.test.mjs                      #   ★ 仓库里不许出现凭据
│   ├── client-structure.test.mjs             #   组件会不会"注册成功但什么都没做"
│   ├── host-structure.test.mjs               #   宿主半边同上（真的调用 apply）
│   ├── __expectations__/micro.json           #   人写的产品承诺
│   ├── __snapshots__/{micro,parityfix}.json  #   内容哈希快照
│   ├── __baseline-versions.json              #   基准版本锁
│   └── fixtures/micro/                       #   15 个合成插件 + 合成宿主运行时面
│
└── tools/                                    # 开发工具（不参与运行时）
    ├── catalog/extract-host-api.py           #   抽官方 API 目录（rules/ 的数据来源）
    ├── parity/{parity.sh,a4b-diff.mjs,expected-diffs.json,python-reference/}
    │   └── fixtures/{host-surface-parityfix.json,hang-cycle/}
    └── slot-probe/                           #   槽位可用性探针（含 CDP 诊断脚本）
```

> 上面这棵树是**从 `git ls-files` 实测出来的**，不是凭记忆写的。
> 上一版（A 阶段写的）严重过时：漏了 `bin/`、`lib/baseline.mjs`、`lib/report.mjs`、
> 整个 `skill/`、9 个测试文件里的 8 个、两个规则表，以及两份 README。
> **"结构节"是最容易腐烂的文档**，所以它必须能被一条命令复核。

### 8.3 临时环境（可随时删）

- `$DSH_HOME/profiles/parityfix` —— 装了三个回归基准插件，供对拍用（**唯一需要长期保留的临时 profile**）
- `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.json` —— 基线；可随时删，删了就是"第一次体检"
- `/tmp/dsh-plugin-compat-check/` —— 探针现场（boot.log / static.json / probe-report.json）
- `/tmp/one-nm`、`/tmp/hang-nm`、`/tmp/js-*` —— 对拍产物，可删

> 收尾规矩（G5）：**不留下**除 `parityfix` 之外的临时 profile、**不留下**任何进程、
> `pgrep caffeinate` 必须为空。

---
---

## 9. 下一动作

**先量，再开工。** 顺序：

1. **量 `no-calls` / `abstained` 的占比**（在真实 desktop profile 上）。这两个去处是"看到了但判不了／没看到"，占比高说明**提取**不够（H2' 值得做），占比低则说明瓶颈在别处。
2. 按量出来的结果决定 **H2'（真解析器）** 还是 **H3'（npm 发布）** 优先。
3. H2' 若开工，用 §5.2.3 的三个指标验收 —— **不要用"疑似比例"**（已被推翻）。

### 9.1 开发日志（倒序，一行一件事）

只记**做过什么、结论是什么**。踩到的坑进 §6 或 `docs/extraction-findings.md`。

| 日期 | 事件 |
|---|---|
| 2026-10-11 | `--probe-boot` 落地 + 客户端半边判定修好（不兼容 4→0、可用 9→14） |
| 2026-10-11 | 加慢测试 `test/probe-boot.test.mjs`（默认跳过，让它"被跳过"这件事可见） |
| 2026-10-11 | 修 `provide` 数组假阳性（7 个 `dsh-mnemon-*`）+ 发现"正则读注释" |
| 2026-10-11 | 修兜底识别三种形态；**更正一条被写进验收标准的假阳性**（`jobs.onJobsChanged`） |
| 2026-10-11 | 修不变式 ⑤（`localBindings` 按变量名聚合）；`logger` 归入 Cordis 内置 |
| 2026-10-11 | 探针自建输出目录（原先 `ENOENT` 被 catch 咽掉 → 静默不产出） |
| 2026-10-11 | 两版 README 按实际形态重写；查出 `--help` 从未被处理 |
| 2026-10-11 | F1/F2/G3–G5 完成，第一批收尾 |
| 2026-10-11 | C3/C4/D1/E1/E2 完成；C2 真实结论表 |
| 2026-10-10 | A 内核移植 + B/C1 插件骨架；H 测试基础设施 |
| 2026-10-10 | 加入本文件（开发计划与作业规程） |

### 9.2 已被实测推翻、不要再试的方向

- **按声明入口收窄客户端种子** —— 会静默删掉懒加载 chunk（§5.3）
- **读 Cordis 的 `fiber.store` 来"全知"** —— 需要 `inject`，与探针设计冲突（§5.3）
- **用"疑似比例"当解析器的验收指标** —— 该比例由有无运行时面决定（§5.2.3）
- **把假阳性修复寄托在文件集合收窄上** —— 排 `src/` 与排嵌套 `node_modules/` 都碰不到假阳性（§5.3）
- **靠环境变量推断当前 profile** —— `DSH_PROFILE` 可能是启动 app 的那个 shell 的**过期值**；要按 `process.argv` 判断，且 CLI 的 `--profile <名>` 与桌面端的**位置参数**两种形态都要认
