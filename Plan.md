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

最后一行不是理论：本机 `~/Library/Logs/DeepSeek Harness/` 里 11 天内有 3 份 web-boot 崩溃日志，其中 `crash-2026-10-08T14-19-13-911Z-web-boot.log` 正是 `Error: web boot: 2 entries did not activate`，两条是 `dshmarket` 与 `@michengai/dsh-archive-manager`，且是**客户端 bundle 级联失败**（"skipped after an earlier failure of this bundle"）。

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

实测（desktop profile，53 个服务）：只保留可信声明会剩 46 个，丢掉的 7 个里有
**2 个是假阳性、3 个是真宿主服务** —— 所以"可信声明"**不能当硬过滤，只能当分档依据**，
否则会把 `credentials` / `subprocess` 这类真服务误杀。三个回归基准关心的服务
（`settings` / `jobs` / `agents` / `tools` / `sessions`）全部落在"确定"档，无一误杀。

**服务目录从哪来**：插件形态下可以在运行时直接从 `ctx` 取（不需要硬编码）；
CLI 形态下可从 `app.asar` 内 `@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js`
导出的 `SERVICE_API` 里解析（0.2.0-rc.2 有 91 个宿主服务）。注意它随 DSH 版本变化。

---

## 3. 我仍在承担的假设与风险

**做决定时如果撞上这些，先回来看一眼自己是不是在赌。**

| 风险 | 现状 | 处理 |
|---|---|---|
| **静默降级的检出率未知** | 整个产品的价值都压在这一层，但只在 3 个样本上验过，没有召回率/误报率 | 第一批把 3 个基准扩成一套 fixture，先量化再对外承诺 |
| 角标的"变化疲劳" | 用户选了任何变化都打；插件升级、DSH 小版本都会改结论 | 第一版带方向标注先上，按真实频率再调 |
| 客户端"计划 vs 到货"对账无先例 | 官方没有任何服务干这件事，做法是从 `__DSH_BOOT__` 形状推断的 | 第二批先做可行性验证，不成立就换判据 |
| **没有 Windows 机器可以真验证** | 本机只有 macOS，而第 6 题选了跨平台 | Windows 路径只能靠代码审查；**这是真实缺口，不假装盖住了** |
| Node 移植的验收标准是"输出一致" | shell 的进程树清理语义未必能逐字复刻 | 可能接受"语义一致" |
| `plugins.detail.*` 未验证 | 槽位已声明、注册被接受（entries=1），但没找到进入详情抽屉的入口 | 不再单独耗时间；总览 tab 用可展开行即可承载全部信息 |

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

## 5. 里程碑与步骤

### 第一批（第一个可发布版本）

#### A. 内核移植与重构

- [x] **A1. Node 版静态提取** —— `lib/extract.mjs`，行为严格对齐 python
  - 验收：`./tools/parity/parity.sh ~/.dsh/profiles/parityfix/node_modules` → `✓ 完全一致`
- [x] **A2. 对拍机制** —— `tools/parity/parity.sh`，python 真源从 `.sh` 现抽
  - 验收：脚本自检能报出 `dump(report) 次数: 1`、`误含比对段: 0`
- [x] **A3. 修 `local_graph` 无界循环**（Node + python 双份）
  - 验收：`./tools/parity/parity.sh tools/parity/fixtures/hang-cycle` 秒级完成
  - 验收：`node lib/extract.mjs ~/.dsh/profiles/desktop/node_modules /tmp/x` 约 1 秒完成，21 manifests / 53 服务 / 280 调用点
- [x] **A4. 客户端种子的来源分桶 + 排除 `.d.ts`** —— ⚠️ **原计划被证据否决，实际做的是另一件事**
  - ❌ **原计划「优先 `exports["./client"]`，缺席才回退遍历」已被否决。** 实测 `dsh-better-sidebar` 把客户端代码切成懒加载 chunk，通过**自己宿主半边的 HTTP 路由**取回：
    `const CHUNK_URL = (name) => \`/sidebar/bundle/${name}.js\``（`src/bundle-route.ts`）。
    也就是说 `client-editor.js` / `client-locale.js` / `client-mermaid.js` 是会真实运行的代码，
    而**从声明入口做静态可达性分析永远够不到它们**（`lib/client.js` 里对 `client-mermaid` 的提及次数是 0）。
    按原计划收窄 = 静默删掉真代码 = 让工具撒谎。
  - ✅ **改为不动文件集合**，给每个被扫描的文件标来源桶：`host-entry` / `client-entry` / `client-extra` / `fallback`，
    写进**单独的** `provenance.json`。这样 `static.json` 的契约不变、对拍仍然成立，
    而判定层可以据此把 `client-extra` 的调用点标成**疑似**而不是确定。
  - ✅ **附带一刀（零风险）**：排除 `*.d.ts`。纯类型声明不含可运行代码，只因为文件名以 `.ts` 结尾才被误捞。
    desktop profile 客户端桶 **829 → 487** 个文件，而 **static.json 输出零变化**（53 服务 / 280 调用点全等）。
  - 验收：`tools/parity/parity.sh` 在三个 fixture 上全部 `✓ 完全一致`
- [x] **A4b. 客户端种子取舍** —— ✅ **已采纳：默认排除包内 `src/` 源码树**（工具：`tools/parity/a4b-diff.mjs`）
  - 剩下的 487 个文件构成：包内 TS 源码 `src/` 320、嵌套 `node_modules` 110、`lib/` 构建产物 57
  - **排 `src/`：零信息损失。** 487 → 167，而服务 −0、调用点 −0、clientHints **零变化**。
    真正运行的是构建后的 `lib/*.js`；`src/` 是它的源，扫它等于把同一份逻辑扫两遍。
    （注意：源码直发、入口就指向 `src/` 的插件不受影响 —— 那些文件在 `host-entry` / `client-entry` 桶里，本开关只作用于 `client-extra`。）
  - **排嵌套 `node_modules/`：只丢 2 个调用点**（`connection.destroy`、`logger.table`），服务 −0。收益只有 110 个文件。
  - ⚠️ **关键发现：这两刀都碰不到假阳性。** `parser`（40 个假方法）、`ruleNames` 都来自
    `dsh-better-sidebar/lib/client-mermaid.js`，它在 `lib/` 里，不属于被排的两类。
    所以 **A4b 是效率问题，不是正确性问题** —— 不要把假阳性的修复寄托在文件集合收窄上。
  - **采纳的决策：只排 `src/`，不排 `node_modules`。** 前者零损失（desktop profile 上服务 −0、调用点 −0、clientHints 零变化），
    后者有真实调用点损失却没有正确性收益。（这一条修正了我原先"两者都排"的倾向。）
  - **副作用已查明并记账**：排 `src/` 会让 `clientHints` 失去一条来自 `src/client/...` 的客户端线索
    （实测只影响 `webServer`，而它在官方宿主目录里 —— 该线索只在"宿主里找不到"时才起作用，故不影响结论；两个样本上**零危险翻转**）。
    这条有意差异记在 `tools/parity/expected-diffs.json`，对拍脚本会把它列为「预期差异」而不是失败。
  - 排除是**可审计**的：跳过了哪些文件逐条记在 `provenance.json` 的 `skippedClientExtra` 里 —— 空谈"排了什么"没有意义，要能查。
- [x] **A5. 识别插件自有服务** —— ✅ 完成，但**结论与原计划完全不同**
  - ❌ 原计划「把插件自有服务从宿主服务里摘出去」**被证据否决**。查证结果：
    `betterLocale` / `pet` / `agentTeams` / `companionQq` **不是**插件自有服务，而是
    **被消费、但当前 profile 里无人提供** —— 它们分别被
    `dsh-better-sidebar`、`dsh-remote-web-ui`、`dsh-better-sidebar`、`dsh-meme`
    用 `ctx.get(...)` 取走，而没有任何插件 `provide` 它们。
    真正的「插件自有服务」只有 2 个：`betterSidebar`（dsh-better-sidebar）、`market`（dshmarket）。
  - ✅ 正确的模型是**按提供方三分**：宿主提供 / 某个已装插件提供 / **无人提供**。
    第三类才是真缺口，而且它的性质是「**插件间依赖缺失**」，不是「与 DSH 版本不兼容」——
    这个区别直接决定了它是 `degraded` 还是 `fatal`。
  - ✅ 数据：`perPlugin[].providedServices`、`perPlugin[].softDeclaredServices`（ctx.get 软取）
  - ⚠️ 仍不完整：只匹配 `ctx.provide(` 一种形态。若将来发现别的提供机制，`providedServices` 要补
- [x] **A6. 逐插件归属重构** —— ✅ 完成，而且**顺带证明这是个正确性缺陷，不只是功能缺失**
  - 实测：原实现用**跨插件累积**的服务集合去扫当前插件源码，别的插件的服务名会被套到本插件的**同名局部变量**上。
    desktop profile 的 280 个调用点里 **51 个**是这种污染（`remote.indexOf/slice/replace` 是字符串方法；
    `dshmarket` 的 `const commands = { probePnpm, provisionPnpm, ... }` 被当成 DSH 的 `commands` 服务）。
    逐插件归属后是**严格子集**（消失 51、新增 0）—— 纯收益，方向安全。
  - 产物：`static.json` 新增 `schemaVersion: 2` 与 `perPlugin{}`（每个插件自己的 services / calls / callSites / providedServices / clientHints）
  - 验收：三个回归基准**逐条等价**（`dsh-keep-awake` 仍是"缺 settings.register / jobs.onJobsChanged"，实测通过）
- [x] **A7. 采集文件:行** —— ✅ 完成
  - 实现：扫描从"把所有文件拼成一个大字符串"改为**逐文件**（拼接会抹掉文件边界，行号就无从谈起）
  - 产物：每条调用点带 `{service, method, file, line}`，进 `perPlugin[].callSites` 与顶层 `callSites`
  - 验收：`dsh-keep-awake` 的 `settings.register` 定位到 `lib/index.js:466`，打开文件确认即那一行
- [x] **A8. 五元组结论 + 确定性标注 + 接入规则表** —— ✅ 完成，回归基准**精确命中**
  - 产物：`lib/verdict.mjs`（判定引擎，纯函数）+ `rules/dsh-api-catalog.json`（官方双端目录）
    + `tools/catalog/extract-host-api.py`（从 asar 现抽目录，可随 DSH 版本重新生成）
  - **验收结果**（三个回归基准，带运行时面）：
    `@omdsh-dev/dsh-plugin-check` → 可用；`dsh-keep-awake` → **部分可用**
    （`jobs.onJobsChanged` 降级→轮询、`settings.register` 功能失效→设置页消失，位置精确到行）；
    `dsh-pet` → 可用
  - 三档确定性按 §2.2 实现；`parser` / `ruleNames` / `topoIndex` 归入"高概率假阳性"被过滤，不进结论
  - 在 desktop profile（21 个插件）上：11 可用 / 10 部分可用 / **0 不兼容**
  - ⚠️ 注意：那次 desktop 跑的是**仅目录、无运行时面**的模式，方法级结论一律降为"疑似"。
    真正可信的结论需要运行时面（CLI 走探针启动，插件形态直接读 `ctx`）

#### B. 插件宿主半边

- [x] **B1. 读 `ctx.loader.entries()`** —— ✅ 完成，真实启动实测通过
  - **`ctx.get('loader')` 在 `inject = []` 下直接可用**；`ctx.loader` 属性直读也可，但**不是同一引用**
    （cordis 每读一次包一层 traceable）—— **不要用 `===` 判断**
  - **`entries()` 不是数组**：`typeof === 'object'`、`Array.isArray === false`、可迭代。
    必须 `for..of`。写成"条目数组"会在真实启动时静默得到 `entries=0`
  - 实测 190 个条目：ACTIVE 158、NO_FIBER 30（全是 `disabled:true`）、PENDING 1、FAILED 1
  - **反向对照**：把坏插件缺的服务名改掉后重启，自省报告与宿主自带告警**同时**跟着变 → 证明读的是活状态
- [x] **B2. 取失败原因** —— ✅ 完成，但**措辞要按实测修正**
  - `await fiber.await()` **只对 FAILED 有效**，能取回原文错误与栈
  - **PENDING 的 `await()` 会立刻返回且不抛** → PENDING 条目"没有原因"，只有缺失服务列表
  - **import 失败的条目连 `fiber` 都没有**（`entry.fiber === undefined`）→ **无任何途径**取原因
  - 所以准确说法是：*能取到原因的只有 FAILED 一类*，不是"唯一途径"
- [x] **B3. 绝不抛 + 超时** —— ✅ 完成
  - 实测：`fiber.await()` 永不 settle 的 LOADING fiber → `awaitTimedOut: true`；
    hostile Proxy ctx（每次属性访问都抛）→ 进程 exit 0、无 unhandled rejection
  - `inject` 保持 `[]`（不依赖被审计的服务本身）。另实测 `inject: ["loader"]` **也是安全的**
    （fiber ACTIVE、无 `did not activate`），只是没必要

#### C. 插件客户端半边（面板）

- [x] **C1. 插件骨架** —— ✅ **完成，且是逐项实测的**（不是"代码看起来对"）
  - `package.json`：`dsh.bundle.patch` ✅；`dsh.client.platform` = 字面量 `"web"` ✅；
    `exports["./client"]` = `{default:"./lib/client.js"}` —— **对象形态，不是字符串** ✅
  - `lib/client.js`：预构建产物；`window.__ModuleLoader__.load({id:"dsh-plugin-compat-check", factory})`；
    factory 返回 `{name, inject:["slots"], apply}` ✅
  - **实测证据**（临时 profile `c1verify` = 官方 web 模板 + 本插件，用应用自带 pnpm 装）：
    - 配置树：`dsh --profile c1verify --dump-config` → `- id: dsh-plugin-compat-check` / `name: dsh-plugin-compat-check`
    - **宿主半边真激活**：启动时插件自己打出
      `[dsh-plugin-compat-check] HOST-HALF-ACTIVATED pid=23649 node=v24.18.1` +
      `loader access: via=ctx.get('loader') attempts=[...]`，且 **`did not activate` 告警数 = 0**
      （这条是关键：宿主对未激活条目只 warn，**不 warn = 真起来了**）
    - **客户端条目真加载**：`window.__DSH_BOOT__.entries` 共 66 条，含
      `{"id":"dsh-plugin-compat-check","url":"plugins/??dsh-plugin-compat-check/client.js&rev=e65692ec156b"}`，
      且它出现在 **application 批次的 URL 列表里**（不是只被登记、没被取回）
    - **客户端半边真 apply**：控制台 `CLIENT-HALF-APPLIED` + `REGISTERED settings.plugins.tab`
    - **一次完整加载 + 交互，`Runtime.exceptionThrown` = 0**
  - 验收命令（可复现）：
    ```
    dsh plugin --profile c1verify add ./plugin
    dsh --profile c1verify -- --port 0 --no-open    # 注意 `--`：launcher 参数与 app 参数的分界
    # 无头 Chrome 连 CDP 打开 http://127.0.0.1:<port>/?token=...，然后检查
    #   window.__DSH_BOOT__.entries 里有本包
    #   window.__COMPAT_CHECK__（渲染侧标记）
    ```
- [x] **C2. 总览表落到 `settings.plugins.tab`** —— ✅ **完成：真实结论表已渲染，端到端实测**
  - **数据通路**（这是 C2 真正的技术难点）：客户端跑在浏览器里，读不了文件系统；
    而结论不能算两份。所以——
    - **宿主半边**算结论（`computeReport()` 直接 import 仓库内核 `lib/extract.mjs` +
      `lib/verdict.mjs`），挂 `GET /plugin-compat-check/report` 把它送出去；
    - **客户端半边** fetch 这个路由渲染成表。
    - 路由注册走**作用域 `ctx.inject(['webServer'], …)`**（不是往 `inject` 里加 `webServer`）：
      headless / CLI 形态下根本没有 webServer，这样本插件的 fiber **不会去等一个不存在的服务**，
      `inject` 得以保持 `[]` —— 与本文件从第一天起的设计一致（健康检查插件不能依赖被审计的东西）。
    - 路由带本机信任栅栏（只接受 loopback 的 Host/Origin）：装了哪些插件、用了哪些 API 是本机信息。
  - **端到端实测**（`c2verify` profile = desktop 的 20 个 bundle + 本插件）：
    - 宿主日志：`HOST-HALF-ACTIVATED` + `C2 route registered: GET /plugin-compat-check/report`，
      `did not activate` 告警 **0**
    - 直接打路由：`http=200`，**123 489 字节**，`ok:true`，`elapsedMs:1538`，
      `nodeModules=/Users/…/profiles/desktop/node_modules（DSH_PROFILE=desktop）`
    - 真实界面里点开 **设置 → 内置插件 → 兼容性** tab：
      - 渲染侧标记 `window.__COMPAT_CHECK__ = {"slot":"settings.plugins.tab","label":"兼容性","state":"done","renders":4}`
      - DOM 里 `table` 元素数 = 1；页面出现「不兼容 / 部分可用」等结论词
      - 表格内容是真结论，逐条带影响面，例如
        `sessions.binding @ lib/client.js:1312 [疑似] · 会话绑定关系读不到`
      - 网络记录里能看到 `200 http://127.0.0.1:61964/plugin-compat-check/report`
      - **运行时异常 0**
  - ⚠️ **落点事实（决定面板的信息层级）**：这个 slot 的宿主页是
    **设置 → 内置插件**（官方 `@deepseek-ai/dsh-client-ui-settings-plugins`），
    该页**已有「插件列表」tab**。所以本 tab 刻意回答**另一个问题**：
    插件列表答"我装了什么"，本 tab 答"**装的东西到底兼不兼容**"。
    标签名因此叫「兼容性」而不是「插件」。
  - 面板自己会区分三种"没发现"：**空洞的可用**（插件没用过任何服务）、
    **无证据可判**（只出现名字没有调用点）、**客户端半边**（命令行测不到）。
    这三件事在别处都长得像"没问题"，而它们不是。
- [x] **C3. 单插件详情 `plugins.detail.section` / `.badge`** —— ✅ **完成，端到端实测**
  - **入口查清了**（这是我此前一直没找到的东西，也是 C3 迟迟没做的原因）：
    **没有"抽屉"**。插件详情是侧栏插件面板**换了 React 视图状态**（`{kind:"list"}` →
    `{kind:"package"|"bundle"|"item"}`），导航链路：
    ```
    button[class*="panelRow"][aria-label="插件"]      → 列表（24 张卡）
      button[class*="cardOpen"][aria-label^="查看 "]  → 详情页
        button[class*="crumb"]                        → 返回列表
    ```
    Escape **不回退**；重按侧栏条目也**不回退**（`activePanelId` 始终是 `plugins`）；
    没有 URL/hash 路由，只能靠点击驱动。
  - **槽位契约（读自宿主源码 + 实测印证）**：详情页的 `subject` 按条目种类有两态 ——
    `{kind:"package", pkg:{name,version,…}}`（社区插件卡）、
    `{kind:"bundle", pkg:{…}}`（官方 bundle 卡）、`{kind:"item", id}`（面板条目）。
    `plugins.detail.badge` 还会多一个 `label`。
  - **实测结果**（真实界面，三类卡片）：
    | 卡片 | 角标 | section |
    |---|---|---|
    | `dsh-pet`（可用） | **可用** ✓ | 1 ✓ |
    | `@liustack/modlens`（部分可用） | **部分可用** ✓ | 1 ✓ |
    | 官方 bundle（我们不分析官方包） | 不渲染（正确） | 0 |
    | 我的配置页条目（不是包） | 不渲染（正确） | 0 |
  - ⚠️ **放弃了一个槽位，并且这是有据的决定**：`plugins.item`（列表卡片角标）**没做**。
    它的 props 是 `{view:"summary"}`，**没有任何插件身份** —— 宿主用
    `renderSlot("plugins.item", {view}, {only: entryId})` 限定，而那个 `entryId` 是
    **配置页注册时给的 id**，不是包名。也就是说它加不到"社区插件卡"上；
    硬撑只会得到一个永不出现的组件，或一个挂在自己配置页上的角标。
    **概览本来就有地方放**：`settings.plugins.tab`（设置 → 内置插件 → 兼容性）。
  - 两次**静默失败**的教训（都记在代码注释里）：第一版按 `props.name` 猜、第二版按
    `subject.id` 猜，两次都是"角标悄悄不出现"——页面看起来完全正常。
    这正是本项目最该防的那类失败，所以现在解析失败会把**看到的形状**记进
    `window.__COMPAT_CHECK__.detailUnmatched`，可查而不是靠猜。
- [x] **C4. 角标** —— ✅ **完成**（`lib/baseline.mjs` + 主机基线持久化 + 面板角标）
  - **任何变化都打，并标明方向**（§2 第 5 题的落地）：
    - `worsened`：档位下降**或新增发现**（档位不变但有新发现也算变差 —— 最容易漏的一类）
    - `improved`：档位上升、发现消失、**或只是插件版本变了**（"版本动了但结论没变"也要说）
    - `added` / `removed`：新装 / 卸载
    - `dshVersionChanged` **单独一类** —— 它常常是上面几类的**原因**
  - 角标文案带方向箭头（`↓ 变差 1` / `↑ 变好 1` / `• …`），`mixed` 时**变差排在最前**
    （坏消息被好消息稀释掉等于没说）。
  - **没有基线时不打角标，但要说清是「还没比过」而不是「没问题」**；
    基线**读不出来**时也明说（早先这两种情况会给出同一句话，已修）。
  - 基线按 profile 分文件（`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.json`），
    插件半边与 CLI 共用同一份、同一个 `lib/baseline.mjs` —— 面板与命令行不可能给出不同答案。
  - 13 条单测覆盖每一类变化**以及"没有变化时必须安静"**（一个不停亮的角标与一个
    永远不亮的角标一样没用）。

#### D. 对话工具

- [x] **D1. 注册 `compat_check` 工具** —— ✅ **完成，实测能执行**
  - 注册走**作用域 `ctx.inject(['tools','agents'], …)`**（与 C2 路由同一个理由）：
    `inject` 保持 `[]`，headless 形态下不注册也不会让本插件停 PENDING。
  - **实测执行结果**（用假 ctx 驱动 `apply`，抓住注册的工具再真调一次）：
    `summary: 可用 3 / 部分可用 1 / 不兼容 0`，`hasRuntimeSurface: true`，
    正文里 `dsh-keep-awake` 的两条发现带 `lib/index.js:591` / `:466` 与影响面。
  - ⚠️ **踩到一个真坑**：`required` 是**顶层数组**，不是每个属性上的 `required: true`。
    写成后者会被宿主拒掉：`schema.properties.X.required is not supported on type "string"`。
    后果很有教育意义 —— **注册失败、工具不存在，而面板与路由照常工作**，
    所以只有真的去调一次工具才发现得了。错误被 try/catch 记成一条日志（不抛）。
  - 工具**不抛**：`execute` 里的失败也变成一段可读文本（"体检没跑成（这是工具的问题，
    不是插件的结论）"）。工具的 execute 抛错会把整轮对话变成错误，而"体检失败"不是用户的错。
  - `renderForModel()` 与 CLI 的 `lib/report.mjs` **同一口径**；两者都读
    `computeReport()` 的同一份结果，所以面板/工具/CLI 不可能给出不同答案。

#### E. skill 产物

- [x] **E1. `ctx.skills.registerProvider()`** —— ✅ **完成，机制先被实测再落地**
  - 落地前先做了**对照实验**（`/tmp` 里两个一次性探针插件 + 一次性 profile，
    `DSH_HOME`/`DSH_AGENTS_HOME` 全指 /tmp，没碰正式环境）：
    | 做法 | 结果 |
    |---|---|
    | 静态 `inject=['skills']` + `registerProvider()` | ✅ 可见，`get()` 取回正文 3867 字符 |
    | `ctx.inject(['skills'], cb)` 里注册（**采用这个**） | ✅ 同上，且不新增依赖 |
    | 包内放 SKILL.md 但不注册（`@liustack/modlens` 的情形） | ❌ **目录里不存在** |
    | frontmatter 含旧键 `disableModelInvocation` | ❌ 整条 frontmatter 被丢弃 |
    | `name: Bad_Name`（非 kebab-case） | ❌ 文件被忽略 |
  - 字段约束**读自运行时源码**（`@deepseek-ai/dsh-skill` 的 `validateCandidate`）并已核对：
    `name` 匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`；`description` 非空；
    `provider` 必须**等于** provider 自己的 `name`（否则报 `returned skill "x" for provider "y"`）；
    `rank` 有限，600 = `BUNDLED_SKILL_RANK`。
  - **真插件里已跑通**：宿主启动日志 `SKILL registered: dsh-plugin-compat-check <- …/skill/SKILL.md`。
  - 测试守的是**文档漂移**而不是文字：SKILL.md 提到的每个 CLI 旗标必须在 `--help` 里存在；
    它写的退出码必须与 CLI 真实行为一致；frontmatter 不得含已知旧键。
    （skill 让 agent 去跑一个不存在的旗标，比没有 skill 更糟 —— 它会自信地做错事。）
- [x] **E2. 脚本产物提供 `--install-skill`** —— ✅ **完成**
  - 装到 `${DSH_AGENTS_HOME:-$HOME/.agents}/skills/dsh-plugin-compat-check/SKILL.md`
    （落点与扫描根都从运行时代码读出并记录在 `skill/README.md`）。
  - **不静默覆盖**：已有不同内容时拒绝并非零退出，要 `--force` 才覆盖。
    静默改写别人的 skill 是数据丢失。
  - **不需要判定内核**（`DSC_KERNEL` 指向不存在的路径也能装成功）—— skill 安装与检查是两件事。
  - 测试一律把 `HOME`/`DSH_HOME` 钉进临时目录，并有一条断言**绝不去碰真实的 `~/.agents`**。

#### F. 触发与基线

- [x] **F1. 本地基线** —— ✅ **完成**（字段与要求在 C4 里就已落地，只是我没记账）
  - 实际写出的 `baseline.<profile>.json`：
    ```json
    { "schemaVersion": 1,
      "dshVersion": "0.2.0-rc.2",
      "plugins": { "<包名>": { "version": "…", "verdict": "partial",
                               "findings": [ { "key": "settings.register", "severity": "feature-dead",
                                               "certainty": "certain", "location": "lib/index.js:466" } ] } } }
    ```
    三个字段逐一对应：**DSH 版本** ✓、**插件名@版本集合** ✓、**各插件结论** ✓。
  - 落点：`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.json` —— **只写自己的状态目录**，
    **不联网、不外传**（这是「插件严格只读」的唯一例外，写的是它自己的体检记录）。
  - ⚠️ **一个差点造成污染的正确性缺陷**：profile 名一度靠环境变量推断，而实测
    `DSH_PROFILE=desktop` 是**从启动 app 的那个 shell 继承来的过期值**，与实际加载的 profile 无关。
    信它会把 gverify 的结论写进 `baseline.desktop.json`，于是差分会报出"移除了 17 个插件"
    这种**完全编出来的变化**。现在按 argv 判断，且**两种形态都认**：
    CLI 的 `--profile <名>`、桌面端的**位置参数** `<…>/profiles/<名>`。
    前两版都只认了其中一种 —— 而两次都"看起来是对的"，因为当时的结论恰好就是 desktop。
    **那是运气，不是正确。**
- [x] **F2. 启动后延迟自动跑，结果缓存；角标只在变化时亮** —— ✅ **完成**
  - **自动跑**：由**最后一次 loader 扫描完成**触发（不是独立定时器）。时机很关键 ——
    插件条目在启动后几秒内还会变（异步 import），太早跑会把"还在加载"误记成"没起来"。
    实测日志（真实 desktop profile）：
    ```
    F2 启动自检: 可用 3 部分可用 19 不兼容 0
    F2 与上次相比: 还没有基线（这是第一次体检）
    ```
    第二次启动 → `与上次相比没有任何变化`；人为把基线改坏 → `↑ 变好 1`。三条路都实测过。
  - ⚠️ **一次真实事故**：早先用独立定时器 + 在 `finish()` 里 `clearTimeout(state.autoRunTimer)`，
    而两者时间**相邻**（默认时机就落在最后一次扫描之后 2 秒）—— 最后一次扫描一结束就把
    启动自检**取消了**：它从未运行、**也没有任何报错**。清理定时器必须由创建它的那一方负责。
    现在 `finish()` 调幂等的 `runAutoCheck()`，兜底定时器叫 `fallbackTimer`（名字不同就是为了
    让"谁拥有谁"一眼可见），并有静态测试钉住"finish() 不得再清理 F2 的东西"。
  - **缓存**：stale-while-revalidate。一次体检 0.5–1.5 秒，让面板的请求**等**它看到的是转圈，
    而结论晚 1.5 秒到完全无所谓。所以过期时**先给旧的、后台再刷**，并发请求共用同一个刷新
    （`state.computing`）—— 否则十个请求会各算一遍。TTL 可配（`DSC_CACHE_TTL_MS`，默认 5 分钟）。
    后台刷新失败会**留下痕迹**（`lastRefreshError` + 日志）：静默失败会让面板一直显示过期数据而没人知道。
    9 条测试覆盖这条策略，包括"有效期内不重算"与"并发只刷一次"。
  - **角标只在变化时亮**：这就是 C4 的 `badgeFor` —— 有变化才 `show:true`，
    没有基线时**不打但说明原因**（"还没比过" ≠ "没问题"）。

#### H. 测试基础设施（**新增，已落地**）

> 这一节是**补上缺口**，不是锦上添花。理由见下面 G0：在本会话里真实出现过一次
> 「结论从部分可用静默翻成可用」的中间态，而当时仓库里**没有任何检查会响**。

- [x] **H0. 覆盖与授权不变式** —— `test/invariants.test.mjs`（16 条 × 5 个 profile = 69 断言）
  - 最强的一条：**每个调用点都必须能在它声称的 `file:line` 上被源码字节验证**。
    写下它的当天就抓到 163/942 个调用点无法验证，顺藤查出四类匹配缺陷。
  - 补上来的那批（⑪–⑯）针对一次**变异测试**的发现：把某插件的 `calls` 清空
    （真实出现过的中间态），原来那 10 条**全部照旧通过**。原因很具体 ——
    「键是子集」这类断言永远抓不住「东西没了」。所以改为断言**覆盖**：
    每个服务必须有明确去处（`resolved`）、每个结论必须被证据授权、
    「可用」不能是空洞的（`vacuous`）。
  - 末条是**有效性自证**：人为清空必须被抓到。一个从没见过红的测试与永远绿的测试，
    在证据上没有区别。
- [x] **H1. 特征快照** —— `test/snapshot.test.mjs` + `test/__snapshots__/`
  - 两个目标：`micro`（合成 fixture，随仓库走、**不依赖本机 profile**）与
    `parityfix`（真实插件 + 真实运行时面）。
  - 快照 = 关键字段 + 内容哈希，**不是**整份输出：完整 `static.json` 在 desktop 上
    是 **982 KB / 3 万行**，整份提交等于没人审查；快照两个目标合计 **36 KB**。
  - 哈希回答「变了没有」，关键字段回答「变了什么」，人写的判据
    （`test/__expectations__/`）回答「**变错了没有**」。三层缺一不可：
    快照抓不到「错了但被如实记进快照」，判据抓不到自己没想到的情形。
- [x] **H2. 基准版本锁** —— `test/__baseline-versions.json`
  - 版本漂移报一个**独立的名字**（`BASELINE_DRIFT`）并要求**单独提交一次**，
    而不是混进「快照对不上」里 —— 后者的第一反应是重建快照，然后就把漂移盖掉了。
- [x] **H3. 更新入口不可静默失效** —— `UPDATE_SNAPSHOTS=1`（环境变量，不是 `--update`）
  - `node --test x.test.mjs --update` 会把 `--update` 当成**测试文件名**解析，
    于是旗标从未生效而退出码正常 —— 与它要防的那类失败是同一类。
- [x] **H4. 对拍的两个自相矛盾已修**
  - `expected-diffs.json` 声称严格比 `services`，而 `STRICT` 里从来没有它 ——
    文件与代码互相矛盾，读到哪一句全看运气。已按代码更正。
  - hang-cycle 的 README 跑法是**假通过**：包直接放在 `demo/` 下，而脚本期待
    `node_modules` 根，于是比对空集合、打印 `manifests=0` + `✓`、退出 0。
    已把 fixture 改成 `node_modules/demo/`，并给脚本加了「比到 0 个包就失败」的守卫。

#### G. 验收（第一批完成的标准）

- [x] **G1.** 三个回归基准结论仍与今天一致（**已自动化为 H1 的判据，每次 `node --test` 都跑**）：
  - `omdsh-dev/dsh-plugin-check` → 可用
  - `dsh-keep-awake` → 部分可用（`settings.register@lib/index.js:466`、`jobs.onJobsChanged@lib/index.js:591`）
  - `dsh-pet` → 可用（**曾经误报为「部分可用」**：它写 `typeof llm?.listProviders === "function"`，
    自己做了能力检测，报出来就是假阳性）
- [x] **G2.** `tools/parity/fixtures/hang-cycle` 秒级通过（实测 0.12 秒，且确实比到 1 个包）
- [x] **G3.** 真实 desktop profile —— ✅ **完成**，而且比预期更彻底
  - 实测发现：`dsh --profile desktop` 会被拒绝 ——
    `error: profile "desktop" is managed exclusively by the Electron application`。
    也就是说**正在运行的那个桌面 app 本身就是 desktop profile**。把插件装进去之后，
    **运行中的 app 当场加载了它**（无需重启）：
    - `baseline.desktop.json` 被那个 app 写出（时间戳对得上）
    - 打它自己的路由：`http=200`，**126 282 字节**，`ok:true`，
      `nodeModules=/Users/…/profiles/desktop/node_modules`，`summary: 可用 3 部分可用 19`（22 个插件）
    - **最硬的证据**：本次会话的运行时里出现了 `compat_check` 工具
      （我在 agent 侧的工具表里看到了它），以及 `dsh-plugin-compat-check` 这个 skill
      （会话的 skill 目录里出现了它）。**这是它在这台机器上真的在跑的证明** ——
      不是"我测过"，是"它正在用"。
  - 顺带查到：`DSH_VERSION` 环境变量不存在，所以那条基线的 `dshVersion` 是 `null`。
    后果是「声明与实测不符」这一类结论在插件形态下不成立（CLI 形态有 `--dsh-version`）。
    **已记录为已知缺口**，见下面「仍未闭合」。
- [x] **G4.** 客户端半边 —— ✅ **完成**（无头 Chrome + CDP，**浏览器级**证据）
  - C2 总览：渲染标记 `{registered:[settings.plugins.tab, plugins.detail.section,
    plugins.detail.badge], state:"done"}`，`table` **1 个**、`tbody` **22 行**、结论标签齐全、
    差分区出现、**无错误态**
  - C3 详情：`dsh-pet` → 角标「可用」+ section；`@liustack/modlens` → 「部分可用」+ section；
    官方 bundle 与我的配置页条目 → **正确不渲染**
  - 运行时异常 **0**
- [x] **G5.** 收尾干净 —— ✅ **完成**
  - 临时 profile：`gverify` / `finalverify` / `slotprobe` 已删，`~/.dsh/profiles` 只剩
    `desktop / headless / kawake-headless / kawake-test / parityfix / web`（与开工前一致）
  - **真实 desktop profile 已恢复原状**：从 bundles 与 dependencies 移除本插件，
    与备份**语义完全相同**（`pnpm install` 只改了键序，值全等），lock 里也不再有它
  - 无头 Chrome、后台进程全部清理；`pgrep caffeinate` → 空
  - 基线目录只留 `baseline.desktop.json`（运行中的 app 写的真数据，是本工具的正常产物）——
    另外两份是我在临时 profile 上跑出来的，已删

### 曾经记下的缺口（已闭合）

- [x] **插件形态拿不到 DSH 版本** —— ✅ **已闭合**
  - 症状：`process.env.DSH_VERSION` 不存在 → 基线的 `dshVersion` 是 `null`，
    「声明与实测不符」这类结论（本工具相对既有方案唯一不可替代的那类）在插件形态下不成立。
  - **解法：从 argv 反推 dsh 根，再用 Node 自己的解析器问它。**
    实测（真实桌面端，VERPROBE 那一次）：
    ```
    process.env.DSH_VERSION   → null          （不存在）
    process.versions.electron → "44.0.0"      （宿主跑在 Electron 里）
    argv 里有 …/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js
      → 反推出 dsh 根，createRequire(根).resolve('@deepseek-ai/dsh-desktop-host/package.json')
      → @deepseek-ai/dsh-desktop-host@0.2.0-rc.2      ✅ 与 `dsh --version` 一致
      → 另一个包 @deepseek-ai/dsh@0.2.0-rc.2 也能解析（两个都试，不依赖某一个存在）
    ```
    实测结果：基线里的 `dshVersion` 从 `null` 变成 `'0.2.0-rc.2'`。
  - **被否掉的三条路，理由写进源码了**（否则下一个人会加回来）：
    - `process.env.DSH_VERSION` —— 不存在，就是缺口本身
    - `dsh --version` 起子进程 —— **不是能力问题**：§2 第 1 题锁定了「插件严格只读：
      不装包、不起子进程、不联网」。为一个版本号破这条边界不值
    - `Info.plist` —— macOS 专有（`CFBundleShortVersionString` = 0.2.0-rc.2 能读到），
      而 §2 第 6 题要求跨平台，不能当主路
  - 拿不到时**返回 null 而不是猜**：猜一个版本会**凭空造出**"声明不符"的结论，
    比缺一条结论糟得多。路径反推的正则同时接受 `/` 与 `\`（Windows 是一等目标）。

### 第二批

- [ ] **H1'（原 H1）. 客户端半边对账**（计划加载的 `__DSH_BOOT__.entries` vs 实际到货）
- [ ] **H2'. 真解析器**（跟踪 `inject` 列表、`const { tools } = ctx` 解构、变量别名、作用域，解决 `ctx` 被 vendored 代码遮蔽）
  - 验收指标：**"疑似"的比例明显下降**
- [ ] **H3'. npm 发布**
- [ ] **H4'. 严重度规则表补全**（覆盖 40 个服务；`rules/README.md` 有覆盖依据）

---

## 6. 已知地雷清单

详细版见 `docs/extraction-findings.md`。这里只列最要命的。

| 地雷 | 说明 |
|---|---|
| **`local_graph` 无界循环** | 已修。原版在依赖靠补扩展名解析成功时把解析后路径写进 `seen`，队列传的却是未解析形态 → `rel in seen` 永不成立 → 有环即无界膨胀。最小复现只要 3 个 JS 文件 |
| **副作用导入漏检** | 正则只认 `from '...'` / `require(...)` / `import(...)`；`import './x'` 不匹配。纯靠副作用装配的插件会被扫成"0 个服务"——**看起来干净，实际什么都没扫** |
| **vendored 代码遮蔽 `ctx`** | `dsh-better-sidebar` 的 `lib/client-mermaid.js` 里 `ctx.parser.consume()` 的 `ctx` 是解析器上下文，被当成宿主服务并凑出 40 个"方法" |
| **插件自定义服务被当成宿主服务** | `ctx.provide("betterSidebar")` 类；会造成"插件间依赖 → 误报为版本不兼容" |
| **`undefined` vs `null`** | `JSON.stringify` **省略** `undefined` 键，python `json.dump` 写 `null`。对拍一开始就是被这个抓到的 |
| **编辑 `probe/index.mjs` 后注意硬链接** | 插件装进 profile 后可能是硬链接/副本；用会替换 inode 的方式写入，`node_modules` 里的副本不会同步，会出现"改了代码但行为没变"。装完务必确认副本内容 |
| **UI 驱动会假阴性** | 我自己的验证脚本曾把侧边栏 `aria="插件"` 按钮当成设置页导航项，得出"tab 不渲染"的**错误**结论。验证工具本身也会骗人 |
| **懒加载 chunk 不是死代码** | 插件可以把客户端代码切成 chunk，用自己宿主半边的路由按 URL 取回（`dsh-better-sidebar`：`/sidebar/bundle/${name}.js`）。**从声明入口做可达性分析永远够不到它们。不要按"只扫声明入口"去收窄客户端种子** —— 那会静默删掉真代码 |
| **目录 ≠ 运行时 API 面** | 官方生成的 API 目录是**契约**目录，不是运行时清单。实测：`jobs` 在目录里 **0 个方法**、运行时 **29 个**；`settings` 目录 6 个、运行时 10 个；`loader` 目录**完全不收录**。拿目录当运行时面会海量误报 —— 方法级判定必须优先用探针/`ctx` 取到的运行时面 |
| **Cordis 上下文内置成员不是 DSH 服务** | `loader` / `effect` / `fiber` / `scope` 这些是框架自带的，不在 DSH 服务目录里。不排除的话会得出"宿主服务缺失 → 致命 → 插件不兼容"，实测一个 `loader` 就把 `dshmarket` 误判成"不兼容" |
| **JS 内置集合方法名会被当成 API 调用** | 插件里 `const sessions = new Map()` 之后的 `sessions.set/map/sort/values` 会被当成"调用了宿主不存在的方法"。**只靠名字黑名单不安全**（`sessions.get` 是真实宿主方法），必须配合"该方法不在宿主方法表里"一起判 |
| **客户端服务不能用宿主面判** | `locale` / `slots` / `configForms` / `sidebarRight` / `settingsScope` 活在浏览器里，宿主探针必然 `present=false`。判据两条并用：①在官方客户端目录里 ②它出现的文件**全部**落在客户端桶里。只靠①不够（那份目录只有 8 个条目） |
| **没有运行时面时不得断言"服务缺失"** | 仅凭目录缺失就判 `fatal` 会把 `dsh-mnemon` / `dsh-catppuccin` 错报成"不兼容"。没有运行时面时必须降级为"疑似 + 降级" |
| **`entries()` 不是数组** | 它是可迭代对象（`Array.isArray === false`）。按数组写会在真实启动时静默得到 0 条，而合成测试里可能看不出来 |
| **`ctx.loader` 与 `ctx.get('loader')` 不是同一引用** | cordis 每读一次包一层 traceable，**别用 `===` 判断** |
| **硬链接坑的新形态** | `perl -pi` / 改名写入会**断链**：profile 里的 `node_modules` 副本保留旧字节（实测 inode 分叉），宿主继续跑旧代码 —— 会造出一次假的"改动没生效"。`edit` 工具同样换 inode。要热更必须 truncate-in-place 或重装 |
| **别名正则必须带 `\b`** | `const v = ctx.get("x")` 的别名规则构造「变量.方法(」时漏了词边界，于是 `subagents.listDescendants(` 会因子串 `agents.` 被别名 `agents` 命中（实测 better-sidebar 里 2 处）。**已修** |
| **同文件别名撞名会凭空造方法** | better-sidebar 的 `client.js` 里 `service` 同时绑给 `jobs`(1 处) 与 `betterSidebar`(6 处)，原实现每次声明都扫全文件 → 文件里所有 `service.X()`（**含 JSDoc 注释里的**）被同时记到两个服务头上，造出 13 个假方法（`jobs.getTabs/closeTab/registerTab`）。修法：同名多绑定时**弃权并记录**到 `ambiguousAliases`，不猜 |
| **`manifests` 是旧兼容视图，不要往里加字段** | 给 `manifests` 加 `engines`/`compatibility` 当场被对拍抓住（"只在 node 版出现"）。新数据放 `perPlugin` |
| **对拍的严格范围已收窄两次** | **移植期已结束**：python 版在四处落后于 Node 版（`calls` 跨插件污染 51/280、`clientHints` 顺序相关、看不见 `ctx.inject([...])`、不排除 `src/`）。对拍现在**只剩 `manifests` / `fallbackPackages` 严格比对**，其余并排打印数量。**它不是质量保证，只是结构性体检；真正的验收标准是三个回归基准。别把"对拍通过"误读成"输出正确"** |
| **体检插件自己的 `inject` 必须留空** | 写成 `["settings","loader"]` 会让体检插件自己的 fiber 因缺服务停在 PENDING —— 一个体检工具自己变成"未激活"就荒诞了。用到再加 |
| **设置页有两个「插件」** | 侧边栏有 `aria-label="插件"` 的按钮，设置页里有文本为「内置插件」的导航项。选择器必须**精确全等**，松散的 `includes('插件')` 会点到错的那个 —— 我本人已经因此得出过一次**错误结论** |
| **`--port 0` 启动的宿主不会自己退出** | 任务结束后仍能存活很久，必须显式 kill，且要顺手确认端口释放 |
| **`.d.ts` 会被当成源码捞进来** | 文件名以 `.ts` 结尾，纯类型声明却会被路径遍历命中。实测客户端桶 846 个文件里 342 个是它。排除零风险（输出零变化） |
| **宿主只警告，客户端才致命**（实测，曾被记成一条含混的地雷） | **宿主侧（Node/CLI）**：非关键条目未激活 → **只警告**（`dsh: warning: N entry did not activate`），宿主照常启动、URL 照常给出。只有 bootstrap include 与 `{agent-loop, webserver, modules, connection, headless-runner, acp, sdk-jsonrpc-server}` 未激活才 throw。<br>**客户端侧（renderer）**：客户端条目加载失败 → **整个界面被一张错误屏替代**（`Failed to load plugins` + `web boot: N entries did not activate` + 逐条 `import failed`），界面完全不可用。实测：健康的 `#root` 有 35397 字符，坏掉后只剩 450 字符<br>⚠️ 两者的分界是**半边**，不是"桌面端 vs CLI"。别再把它们记成一条 |

---

## 7. 环境与关键事实

### 7.1 路径与命令

| 项 | 值 |
|---|---|
| 仓库 | `/Users/liuchenyu/Documents/deepseek-harness/default-workspace/dsh-plugin-compat-check` |
| 远端 | `lcy0121/dsh-plugin-compat-check`（公开，MIT）；已并入 `0xsline/awesome-deepseek-harness`（PR #688 已合并） |
| DSH 版本 | `0.2.0-rc.2` |
| `$DSH_HOME` | `/Users/liuchenyu/.dsh` |
| 正式 profile | `/Users/liuchenyu/.dsh/profiles/desktop` |
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

#### 7.2.1 两个曾经踩到的坑（都会造成"看起来跑了其实没跑"）

**① `dsh --profile <p> web` 会报 `too many arguments. Expected 0 arguments but got 1: web`。**
`web` 是 launcher 层面的**应用名**，不是 app 参数。正确写法是让 launcher 与 app 参数用 `--` 分界：

```bash
dsh --profile <p> -- --port 0 --no-open        # ✅
dsh --profile <p> web --port 0 --no-open       # ❌ too many arguments
```

**② `dsh rescue --profile X --from-default-profile web` 会报
`select a profile only once`。** `rescue` 自己会选 profile，不要再传 `--profile`。

绕开两者、按需造一个**完整** profile 的做法（已在 C1/C2 复验里用过）：

```bash
cd ~/.dsh/profiles && rm -rf <p> && mkdir <p> \
  && cp web/cordis.yml web/cordis.patch.yml web/pnpm-workspace.yaml <p>/ \
  && cat > <p>/package.json <<'JSON'
{ "name": "dsh-profile-<p>", "private": true, "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }
JSON
dsh plugin --profile <p> add ./plugin        # dsh 自己会调它自带的 pnpm
```

**③ 客户端渲染要验到"是我们的组件渲染的"。** 页面上出现某个字符串**不能证明**归属 ——
任何同名文案都会命中。做法是在组件函数体里设一个只属于我们的标记：

```js
window.__COMPAT_CHECK__ = { slot, label, body, renders: (…||0)+1, at: Date.now() }
```

然后 CDP 里查 `window.__COMPAT_CHECK__`。**标记出现 = 我们的代码真的执行了渲染**，
这把"页面里有这几个字"升级成"这一刻由我们的组件产出"。C2 的验收就是这么过的。

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

## 8. 现状快照（2026-10-10）

### 8.1 提交记录

| commit | 内容 |
|---|---|
| `f895531` | 静态提取移植到 Node + 修无界循环 + 对拍机制 + 缺陷盘点 |
| `9f5eb5a` | 严重度规则表初稿 + 槽位可用性探针 |
| `0f60d8d` | 更名 `dsh-plugin-check` → `dsh-plugin-compat-check` |

**全部只在本地，没有 push。**

### 8.2 仓库结构现状

```
dsh-plugin-compat-check/
├── dsh-plugin-compat-check.sh    # 现有 CLI（bash + python，仍可用，是移植参考）
├── lib/extract.mjs               # ★ Node 版静态提取（新增）
├── rules/
│   ├── severity.json             # 严重度规则表
│   ├── usage-inventory.json      # 覆盖依据（内核真实输出）
│   └── README.md
├── tools/
│   ├── parity/parity.sh          # ★ 对拍脚本
│   ├── parity/fixtures/hang-cycle/   # ★ 无界循环回归 fixture
│   └── slot-probe/               # ★ 槽位可用性最小插件 + CDP 诊断脚本
├── plugin/                       # ★ DSH 插件产物（宿主半边 + 预构建客户端半边）
│   ├── package.json              #   dsh.bundle.patch + dsh.client={platform:"web"}
│   ├── cordis.patch.yml
│   ├── index.js                  #   宿主半边（inject 故意留空）
│   └── lib/client.js             #   预构建；注册进 settings.plugins.tab
├── docs/extraction-findings.md   # ★ 提取缺陷的实测记录
├── probe/                        # 原 CLI 的诊断探针
├── README.md / README.en.md / LICENSE
└── Plan.md                       # 本文件
```

### 8.3 临时环境（可随时删）

- `~/.dsh/profiles/parityfix` —— 装了三个回归基准插件，供对拍用
- `/tmp/one-nm`、`/tmp/hang-nm`、`/tmp/js-*` —— 对拍产物，可删

---

## 9. 下一动作

**第一批已全部完成（A–H 与 F1/F2/G1–G5）。** 下一步进入 **第二批**，从 H1' 开始：

- **H1' 客户端半边对账**：计划加载的 `__DSH_BOOT__.entries` vs 实际到货
  —— 这是唯一能抓到「客户端条目没到货」的机制，而宿主侧对此**只 warn**
- H2' 真解析器（验收指标：「疑似」比例明显下降）
- H3' npm 发布
- H4' 规则表补全

> ### 本轮（2026-10-11 收尾）：F1 + F2 + G3–G5，以及两次自伤
>
> **第一批到这里全部完结。** 这一轮补上了 F1（字段其实早就有，只是没记账）、
> F2（真正的缓存 + 启动自检），并跑完 G3–G5。中间出了两次**我自己造成的事故**：
>
> 1. **profile 认错会污染基线**：环境变量 `DSH_PROFILE=desktop` 是**从启动 app 的
>    shell 继承来的过期值**。信它会把别的 profile 的结论写进 `baseline.desktop.json`，
>    差分会报出"移除了 17 个插件"这种**完全编出来的变化**。现在按 argv 判断，
>    且**两种形态都认**（CLI 的 `--profile X`、桌面端的位置参数 `…/profiles/X`）。
>    前两版各只认了一种，两次都"看起来是对的" —— 因为结论恰好就是 desktop。**那是运气。**
> 2. **我把 `apply()` 的函数体整个删掉了**：删除一段临时诊断代码时锚点选错，
>    结果 `apply` 只剩一行日志。后果**不是崩溃** —— 宿主正常启动、`did not activate` 告警 0，
>    而 skill / 工具 / 路由 / 启动自检**全都没注册，且没有任何报错**。
>    我是靠"日志里少了几行"发现的。
>
> 第 2 条与 `lib/client.js` 上早先那次（删了 `usePluginState` 等定义、187 条测试全绿）
> **是同一类事故，而且我在第一次之后只给客户端半边加了守卫，没给宿主半边加** ——
> 于是它换了个地方又来一次。现在两边都有了（`test/client-structure.test.mjs` +
> `test/host-structure.test.mjs`），且两条都做了**有效性自证**（人为削成空壳，测试确实变红）。
>
> `node --test test/` → **209 条全过**。
>
> ### ⚠️ 一次安全缺陷（不属于提取逻辑，但必须记）
>
> 探针的 `dumpShape` 曾经把服务属性的**字面值**也写进报告（一份没人读的 `data`），
> 于是 `credentials.text` —— **整份凭据文件** —— 被提交进
> `tools/parity/fixtures/host-surface-parityfix.json`。
>
> - 泄漏的 `data` **从未被任何消费方读过**：为没人用的字段把密钥写进了 git 历史
> - 它**会持续复发**（每次跑探针都重生成，不是手滑一次）
> - 它**通过了当时全部 200+ 条测试**：没有一条问过"提交的文件里有没有密钥"
>
> 已修根因（探针只记结构、不记内容）+ 全仓扫凭据的守卫测试（含有效性自证：拿历史
> 泄漏版本喂给它，四种模式全部命中）+ 已提交 fixture 移除 `data`。
> 泄漏 blobs 从全部历史重写掉 —— 当时**尚未 push**，故未外泄到远程。
> 详见 `docs/extraction-findings.md` 末尾一节。
>
> **README 两版按实际形态重写**（此前描述的其实是"安装前检查"那个旧工具）：
> 现在讲清三份产物各自的能力与**边界**（插件严格弱于 CLI，不是超集）、四条用法、
> 退出码语义、三档确定性、以及它**刻意不做**的事。写 README 时还查出并修掉一个真缺陷：
> **`--help` 此前根本没被处理**，会掉进"找内核"检查并以 1 退出 —— 想看用法被报成内核缺失。

> ### 本轮（2026-10-11）：C3 + C4 + D1 + E1 + E2 五项并行完成
>
> **五个里程碑一起做完，全部有实测证据。** 关键结论：
>
> 1. **C3 的入口一直没找到，是因为它不存在** —— 插件详情不是"抽屉"，是侧栏面板
>    换了 React 视图状态。查清后三类卡片的角标与 section 都验过了。
> 2. **两次静默失败**（角标悄悄不出现）教了一件事：槽位 props 的契约**不能猜**。
>    现在解析失败会把看到的形状记进 `window.__COMPAT_CHECK__.detailUnmatched`。
> 3. **一次真实事故催生了一个测试层**：清理调试代码时误删了 `lib/client.js` 里
>    几个函数定义（`usePluginState` / `verdictOf` / `pickPlugin` / `Badge`），
>    **187 条测试全绿**，只有真的在浏览器里打开面板才看得到 `is not defined`。
>    新增 `test/client-structure.test.mjs`：用 `vm` 在受控环境里**逐个调用**每个函数，
>    ReferenceError 当场炸出来。已做**有效性自证**（重新删掉定义，测试确实变红）。
> 4. **D1 的 `required` 是顶层数组**，写成每个属性上的 `required: true` 会被静默拒掉：
>    工具不存在，而面板与路由照常工作 —— 只有真调一次才发现。
> 5. **E1 的机制先被实测再落地**：包内放 SKILL.md **不算数**（`@liustack/modlens` 是现成反例），
>    必须 `ctx.skills.registerProvider()`。
>
> 退出码语义也修正了：**1 与 2 只表示插件的结论**，3 表示这次体检没得出可信结论
> （含用法错误）——把命令写错读成"插件不兼容"会让用户查错方向。
>
> `node --test test/` → **192 条全过**。三个回归基准仍精确命中（466 / 591 两行）。
