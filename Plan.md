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
12. **计划本身也可能错，而且证据优先于计划。** A4 就是活例：计划写着"收窄客户端种子"，实测发现那样会删掉真实运行的代码，于是**否决了计划**。发现计划与证据冲突时，改计划，不改证据。

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
- [ ] **A5. 识别 `ctx.provide("x")` 的产出**，把插件自定义服务从宿主服务里摘出去
  - 动机：`betterSidebar` / `betterLocale` / `pet` / `agentTeams` 是插件提供的服务；现在会被判成"依赖了不存在的宿主服务" —— 把插件间依赖误报成版本不兼容，方向最危险
  - 验收：desktop profile 的未覆盖服务列表里，插件自有服务不再出现
- [ ] **A6. 逐插件归属重构**：现在 `services` / `calls` 是**跨插件全局合并**的，回答不了"我装的 12 个里谁坏了"
  - 验收：对每个插件单独产出一份结论；三个回归基准的结论与现在**逐条等价**（dsh-keep-awake 仍应是"缺 settings.register / jobs.onJobsChanged"）
- [ ] **A7. 采集文件:行**（现在完全没有：`static.json` 只有 `services / calls / clientHints / fallbackPackages`）
  - 验收：随手挑一条发现，能打开它指的文件、看到那一行确实是调用
- [ ] **A8. 五元组结论 + 确定性标注 + 接入规则表**
  - 确定性按 **§2.2 的三档**实现（可信声明 / 官方目录 / 都不是）；这三档的判据已经实测校准过，不要重新发明
  - 验收：每条发现都有 类别/位置/依据/严重度/影响面 + 确定或疑似；未覆盖 API 显示"影响面未知"
  - 验收：`parser` / `ruleNames` / `topoIndex` 这类不得出现在"确定"档

#### B. 插件宿主半边

- [ ] **B1. 读 `ctx.loader.entries()`** 拿每条 fiber 状态（PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING）与缺失服务
  - 缺失服务算法：`fiber.ctx.get(key) === undefined`
- [ ] **B2. `await fiber.await()` 取失败原因**（没有任何官方服务暴露人类可读原因，必须自己重新推导）
- [ ] **B3. 启动后延迟执行 + 超时 + 全程 `try/catch`**，绝不抛
  - 验收：故意让内核抛错，宿主仍能正常启动、无 `did not activate`

#### C. 插件客户端半边（面板）

- [ ] **C1. 插件骨架**：`package.json` 要有 `dsh.client = {platform:"web"}`、`exports["./client"]`、`dsh.bundle.patch`；`lib/client.js` 必须是 `window.__ModuleLoader__.load({id:"<包名>", factory})` 包装，factory 返回 `{name, inject, apply}`
  - 注意：**宿主不构建**，`lib/client.js` 必须是预构建产物
  - 可复用样本：`tools/slot-probe/`（已验证可用的最小插件）
- [ ] **C2. 总览表落到 `settings.plugins.tab`**（**已验证可用**）
  - 验收：真实启动 + 无头 Chrome 打开设置页 → 插件页能看到标签名与正文
- [ ] **C3. 单插件详情 `plugins.detail.section` / `.badge`**（**未验证**，先确认消费者是否渲染）
- [ ] **C4. 角标**：任何变化都打，标明方向（变好/变差）

#### D. 对话工具

- [ ] **D1. 注册 `compat_check` 工具**：`ctx.tools.register(defineTool({...}))`，`inject = ["tools"]`
  - 注意：`parameters` 是 DSH 自有 DSL；`output.schema` 与 `output.render` **必需**；重名直接抛错；只有 `run_code` 是保留名
  - 注意：**工具不能返回 UI 组件**，只能给文本/Markdown/图片

#### E. skill 产物

- [ ] **E1. `ctx.skills.registerProvider()`** 注册包内 SKILL.md
  - **反例警告**：`@liustack/modlens` 发了 `skills/modlens/SKILL.md` 却没注册，本会话里根本没有这个 skill。**包里放文件不算数**
  - frontmatter 必需：`name`（kebab-case）+ `description`；旧键 `disableModelInvocation` 等会被**整条丢弃**
- [ ] **E2. 脚本产物提供 `--install-skill`**，把 SKILL.md 装到 `~/.agents/skills/`（这是只用 npx 的用户拿到 skill 的唯一途径）

#### F. 触发与基线

- [ ] **F1. 本地基线**：`{DSH 版本, 插件名@版本集合, 各插件结论}`，只写自己的状态目录，不联网不外传
- [ ] **F2. 启动后延迟自动跑**，结果缓存；角标只在变化时亮

#### G. 验收（第一批完成的标准）

- [ ] **G1.** 三个回归基准结论仍与今天一致：
  - `omdsh-dev/dsh-plugin-check` → 可用
  - `dsh-keep-awake` → 部分可用（`settings.register`、`jobs.onJobsChanged` 缺失）
  - `dsh-pet` → 可用
- [ ] **G2.** `tools/parity/fixtures/hang-cycle` 秒级通过
- [ ] **G3.** 在真实 desktop profile 上：宿主层体检结果正确、面板能显示、角标逻辑正确
- [ ] **G4.** 客户端半边：真实启动 + 无头 Chrome 确认面板元素出现（**命令行测不到这一层**）
- [ ] **G5.** 收尾干净：无残留 profile、无残留进程、无 `caffeinate`

### 第二批

- [ ] **H1. 客户端半边对账**（计划加载的 `__DSH_BOOT__.entries` vs 实际到货）
- [ ] **H2. 真解析器**（跟踪 `inject` 列表、`const { tools } = ctx` 解构、变量别名、作用域，解决 `ctx` 被 vendored 代码遮蔽）
  - 验收指标：**"疑似"的比例明显下降**
- [ ] **H3. npm 发布**
- [ ] **H4. 严重度规则表补全**（现在覆盖 18/53 个服务）

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
| **`.d.ts` 会被当成源码捞进来** | 文件名以 `.ts` 结尾，纯类型声明却会被路径遍历命中。实测客户端桶 846 个文件里 342 个是它。排除零风险（输出零变化） |
| **桌面端 web boot 对任何未激活条目直接抛错** | 而 CLI 只是 warn。所以宿主起不来时，装在同一个宿主里的插件也一起看不到界面 —— 脚本产物有不可替代的位置 |

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
├── docs/extraction-findings.md   # ★ 5 个提取缺陷的实测记录
├── probe/                        # 原 CLI 的诊断探针
├── README.md / README.en.md / LICENSE
└── Plan.md                       # 本文件
```

### 8.3 临时环境（可随时删）

- `~/.dsh/profiles/parityfix` —— 装了三个回归基准插件，供对拍用
- `/tmp/one-nm`、`/tmp/hang-nm`、`/tmp/js-*` —— 对拍产物，可删

---

## 9. 下一动作

**A5**（识别 `ctx.provide("x")` 的插件自定义服务，把它们从宿主服务里摘出去）。

它和 A4 性质不同：A4 是**不改输出**的安全改动，A5 **会改变输出**（少掉一批假缺口），
所以流程是：改 → 跑对拍 → 把差异逐条摊开给用户确认 → 再决定是否回溯到 python 版。

> **上一次更新**：2026-10-10，完成 A4b：**默认排除包内 `src/`**（零信息损失，已实测），
> 并确立 §2.2 的三档确定性判据。对拍新增预期差异清单 `tools/parity/expected-diffs.json`。
> 下一步动作就是本节顶部这一条 —— **每完成一小项都改这里。**
