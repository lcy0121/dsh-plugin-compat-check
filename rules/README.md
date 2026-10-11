# 严重度规则表

`severity.json` 是判定「一条发现有多严重」的唯一依据。判定**不由 LLM 决定**——LLM 只能润色措辞。这样做的理由很直接：这个工具的价值全在结论可信，而"某处 API 缺失意味着设置页会消失"这种判断必须可复核、可被反驳、可被社区提 PR 修正。

## 两份文件

| 文件 | 作用 |
|---|---|
| `severity.json` | 规则本体：`服务.方法 → 严重度 + 影响面`，外加四条**分层默认档** |
| `usage-inventory.json` | 覆盖依据：从作者本机 21 个社区插件静态提取的真实调用点快照，用来说明"为什么是这些服务" |

判定引擎实际读的只有一样东西：`services[服务].methods[方法].severity` 与 `.impact`（见 `lib/verdict.mjs` 的 `lookupSeverity`）。**其余字段是给人看的、给 PR 用的**，不影响输出：

| 字段 | 含义 |
|---|---|
| `layer` | `host` = Node 宿主侧；`client` = 浏览器客户端侧；`both` = 同名服务两侧都有但语义/签名不同 |
| `summary` | 这个服务是干什么的（人话，取自官方 API 目录） |
| `basis` | 这条判定的证据等级：`catalog` / `catalog-description` / `callsite`（含义见下） |
| `evidence` | `basis: callsite` 时必须给的具体文件:行 |
| `knownGoneIn` | 已知从哪个 DSH 版本起不再提供（沿用既有写法） |

`basis` 的三档不是形式主义，它决定了这条规则**可以被怎么反驳**：

- `catalog`：官方 API 目录的 `summary`/`description` 直接支持。最硬。
- `catalog-description`：目录**没有声明任何方法**（抽象服务），但官方 `description` 里明确写了这个方法存在。`credentials.resolve`、`sessionPersistence.open/list` 属于这一档——这正是"目录 ≠ 运行时 API 面"的活例。
- `callsite`：目录里查不到，依据是真实插件在那个调用点上的代码。**这是最弱的一档**，跟着 `evidence` 给的 `文件:行` 去读一眼就能推翻它。

## 三档严重度

| 档 | 含义 | 典型来源 |
|---|---|---|
| `fatal` | 插件条目没激活，整个插件是死的 | 运行时事实（`ctx.loader.entries()` 的 fiber 状态） |
| `feature-dead` | 某个特性确定不可用 | 表里有明确语义的 API 缺失 |
| `degraded` | 仍可用但能力缩水 | 有回退路径的 API 缺失（如事件变轮询） |

**`degraded` 的硬门槛：必须能说出回退路径是什么。** 说不出回退路径的一律 `feature-dead`。本表里 `degraded` 的每一条都写了回退到哪（`jobs.onJobsChanged` → 轮询；`timer.timeout` → 原生 `setTimeout`；`sessions.using` → `sessions.binding`；`layout.selectPanel` → 侧栏入口），这不是措辞，是判据。

## 分层默认档（不查表也能判的部分）

判定顺序是：**先看运行时事实，再查表，最后落默认档**。

1. 条目 `FAILED`/`PENDING` → `fatal`，这是运行时事实，不需要静态分析。
2. 插件在 `inject` 里声明了宿主没有的服务 → `fatal`（条目会停在 pending）。
3. 用 `ctx.get('x')` 取不到服务 → `feature-dead`（不会导致未激活，但功能静默失效）。
4. 方法不存在且不在表中 → `feature-dead` + **影响面未知**。

第 4 条必须显眼：它是在承认规则表没覆盖到，而不是在假装判断过。

## 客户端服务与宿主服务不是一回事

`locale` / `slots` / `theme` / `layout` / `uiWorkspace` / `workspaces` 活在浏览器里，宿主探针必然看不到；而 `sessions`、`timer`、`jobs` **两侧都有同名服务却语义不同**：

| 服务 | 宿主侧 | 客户端侧 |
|---|---|---|
| `sessions` | `create`/`enter`/`flush`/`fork`/`get`/`list`/`announce`（内存 session store） | `binding`/`scope`/`search`/`retain`/`using`（会话引用与作用域的面） |
| `timer` | `timeout(delay): Promise<void>` | `timeout(callback, delay): () => void` |
| `jobs` | 后台任务注册表（`list`/`observe`/`kill`） | 由 dsh-better-sidebar 软取的客户端任务面（`watchRows`/`state`） |

所以方法级判定**必须按调用点所在的那一侧去比目录**。本表已给这些服务的方法逐条标 `layer`。拿宿主方法集去比客户端调用（或反过来）会造出成片假阳性——`sessions.scope`（客户端方法）被判成"宿主缺方法"就是这种错法。

## 覆盖率

> ⚠️ **这张表由 `node tools/coverage.mjs` 生成，是一台机器的一个 profile 的快照，不是生态普查。**
> 它以前是**手工算的**，于是必然过期。**一张会过期却没人知道的覆盖率表比没有表更糟：它看起来像证据。**

```bash
node tools/coverage.mjs                                   # 给人看（**不给面，数字偏大**，见下）
node tools/coverage.mjs --probe <探针报告>                 # 接近真实用法，推荐
node tools/coverage.mjs --probe <报告> --write             # 顺带刷新 rules/usage-inventory.json
```

**口径**（必须固定，否则数字之间不可比）：

- **"有调用点的服务"**：`perPlugin[*].calls` 的键的并集 —— **真的被调用过**的服务。
  它**不是** `report.services`（后者含只被声明过的项，拿它当分母会把覆盖率算低）。
- **排除已知提取产物**，且**按方法粒度**：`knownExtractionArtifacts` 里逐条写了"不要为这些补规则"。
  按服务粒度排会把 `sessions`/`jobs` 这些**真服务**一起排掉。
- **`--probe` 很要紧**：不给运行时面时，方法级结论一律降为「疑似」而**不进 findings**，
  于是"落到默认档"这个数字既不是真实的缺口、也不是用户会看到的东西。
  实测差别：同一个 profile，不给面 7、给面 **3**。

### 当前值（2026-10-11，desktop profile，DSH 0.2.0-rc.2，**带运行时面**）

| 口径 | 值 |
|---|---|
| 插件 | 21 |
| 有调用点的服务 | **49**（原始 50，排掉 1 个纯产物服务） |
| 表中覆盖的服务 | **36 / 49 = 73%** |
| (服务,方法) 对 | **161**（排掉 4 个产物对） |
| 表中有方法级规则的对 | **99 / 161 = 61%** |
| 表中服务总数 / 其中有方法级子表 | 42 / 37 |
| **引擎实测：发现总数 / 规则表命中 / 落到默认档** | **4 / 1 / 3** |

**最后一行才是唯一真正有意义的口径** —— 前几行都只是它的分解。

### 「落到默认档」的那 3 条**不该补规则**

它们全是 `unprovided-dependency`（**插件间依赖**，`method` 为 null），而且
`evidence.inHostCatalog === false` —— 也就是说**它们根本不是 DSH API**。
类别级判定已经给出了准确的影响面（"依赖的服务由其它插件提供，当前 profile 里没有提供方"）。
给它们补"服务级规则"等于把"插件之间的依赖关系"伪装成"与 DSH 版本不兼容"。

### 「未覆盖的 (服务,方法) 对」里剩下的都是什么

按服务是否在**官方宿主目录**里分开看（这是"归不归规则表管"的分界）：

| 类别 | 条数 | 该不该补规则 |
|---|---|---|
| 服务在官方宿主目录里 | **1**（`sessions.has`） | **不该** —— 实测它是 `ws.sessions`（别人的 Map 字段）造的产物，已进 `knownExtractionArtifacts` |
| 服务**不在**目录里 | 74 | **不该** —— 它们是**插件自有服务**（`betterSidebar`/`betterLocale`/`configForms`/`sidebarRightTabs`…）或已知产物（`parser.*`/`ruleNames.*`/集合方法名） |

**所以规则表在"DSH API"这个范围内是完整的**：凡是真实存在、且被真实调用的宿主 API，
要么有规则，要么已确证是提取产物。**剩下没规则的，都不是 DSH 的 API。**

## 新增条目的证据分列

### 一、有官方 API 目录直接依据（27 条）

**方法在目录里声明，且描述写明了它干什么（`basis: catalog`，24 条）**

| 服务 | 方法 |
|---|---|
| `skills` | `registerProvider` |
| `subagents` | `list`、`getProvider`、`startContinuable`、`interrupt`、`listDescendants`、`drainContinuableChildren` |
| `sessionQuery` | `listSessions`、`readSession`、`observeSession` |
| `sessionTitle` | `rename` |
| `typert` | `register` |
| `agentPresets` | `resolve`、`mount` |
| `agentTeams` | `tryMembership` |
| `sessions`（客户端侧） | `scope`、`search` |
| `locale` | `getLocale`、`addLanguage` |
| `theme` | `register` |
| `layout` | `selectPanel` |
| `uiWorkspace` | `openSession` |
| `workspaces` | `create`、`delete` |

**目录不声明方法，但官方 description 写明了该方法（`basis: catalog-description`，3 条）**

| 服务 | 方法 | 依据原文（节选） |
|---|---|---|
| `credentials` | `resolve` | "an empty stored value is absent everywhere — `resolve` skips it" |
| `sessionPersistence` | `open`、`list` | "a created session is observable through `stat`/`list`/`open`" |

### 二、从真实调用点推断（`basis: callsite`，7 条）

这 7 条都给了 `文件:行`，请按 `evidence` 去读一眼再采信。

| 服务.方法 | 依据 |
|---|---|
| `llm.listProviders` | `@liustack/modlens/dsh/index.js:397`（`typeof` 探测不成立就整体跳过提供方名解析 → 退回显示上游 id） |
| `settings.installSection` | `@nonamelego/dsh-catppuccin/lib/index.js:734`，且其注释写明该通道对应 DSH ≤ 0.1.6-alpha.2，0.1.7-alpha.1 起移除 |
| `storageDomain.open` | `@michengai/dsh-archive-manager/lib/projcache.js:102`。**注意**：目录声明的是 `closeAll`/`get`，没有 `open`，但 description 写的是 "Opens declared domains over routed backends"。方法名与目录对不上，所以只给 `callsite` |
| `sessions.liveEntryFor` | `@michengai/dsh-archive-manager/lib/workspace.js:932` |
| `sessions.detachEntered` | 同上一行 `:933`；与官方 `enter()` description 里"返回 detach disposer"那一半互为印证 |
| `sessions.using` | `@michengai/dsh-archive-manager/lib/client.js`（`using` 不可用即退回 `binding`） |
| `timer.timeout` | `dsh-recall-plugin/lib/client.js:1430`（不可用即用原生 `setTimeout`） |

## 故意没填的服务与原因

未进入本表的 18 个实际被用到的服务。**这一节和填了的那些一样重要**——乱填一个影响面，等于毁掉本工具唯一的资产。

### A. 第三方插件自己的服务，不是 DSH API（8 个）

`betterLocale`、`companionQq`、`pet`、`remote`、`sidebarRight`、`sidebarRightTabs`、`pluginNavigation`、`webUiSettings`

判定依据是**取得方式**：它们全部由客户端 `ctx.get("x")` / `ctx.inject(["x"], …)` 软取，而提供方是另一个插件：

- `companionQq` —— dsh-meme 的源码注释直接写明"消费 dsh-companion 提供的 `companionQq` 服务(sendImage/isOnline)"。
- `webUiSettings` —— remote-web-ui 的注释写明"由 dsh-web-settings 这个包在 `apply()` 期间发布"。
- `pluginNavigation` —— dsh-mnemon 在自己的客户端 `inner.effect(() => seats.configuration.provide(...))` 里挂上去。
- `sidebarRight` / `sidebarRightTabs` —— dsh-better-sidebar 客户端软取/inject 的同族服务。

对这类服务，正确的结论就是引擎现在给的那句默认话术：「该服务由另一个插件提供，当前 profile 里没有提供方」。**写进本表反而会说谎**——本表的语义是"DSH 的某个 API 没了"，而这些名字根本不在 DSH 的 API 面上。

### B. 由社区启动器提供，官方 shell 上没有（1 个）

`desktopProfiles` —— @nonamelego/dsh-catppuccin 的类型注释写得很清楚："`desktopProfiles.current.name` when the community launcher exposes that service; **undefined on the official shell**"。它不是官方 API。

### C. 版本相关的旧/新客户端 seam，0.2.0-rc.2 都不在目录里（2 个）

`settingsScope`、`configForms` —— catppuccin 的注释把版本线说得很明白：`settingsScope` 属于 DSH ≤ 0.1.6-alpha.2 的旧 seam，`configForms` 是 ≥ 0.1.7-alpha.1 的新 seam，而 0.2.0-rc.2 的客户端目录里两个都没有。缺它属于"版本演进"，不属于"插件用了不存在的 API"，而且插件都做了 `typeof` 探测回退。**记录在案，不填。**

### D. 提取误报，不是 API（3 个）

`parser`（40 个"方法"）、`ruleNames`、`topoIndex` —— 来自 `dsh-better-sidebar/lib/client-mermaid.js` 里 vendored 的 markdown 解析器上下文。已在 `severity.json` 的 `knownExtractionArtifacts` 里逐条登记。

### E. 判不准，所以不填（3 个）

| 服务 | 为什么判不准 |
|---|---|
| `conversation` | 只出现在客户端代码（dsh-meme / better-sidebar / git-graph / recall）里，宿主与客户端两个官方目录都没有。既可能是尚未公开的客户端服务，也可能是误报——分不出来 |
| `webStartup` | remote-web-ui 软取它读 `host`/`port`；两个目录都没有。可能是启动器/宿主不公开的面，无法判断缺失意味着什么 |
| `styles` | dsh-recall-plugin 用 `ctx.get("styles")` 并**自带 `document` 注入兜底**（回退路径明确），但同名标识符也出现在 `dsh-better-sidebar/lib/client-mermaid.js` 的 vendored 代码里——无法确认是哪一边 |

### F. 提取器已正确处理，无需规则（1 个）

`betterSidebar` —— 它是插件自己 `ctx.provide()` 出来的服务，**提取器已正确记入 `providedServices`**（同类的还有 dshmarket 的 `market`），因此不会产生假缺口。`pet` / `agentTeams` / `companionQq` / `betterLocale` 这些**没有**被 `ctx.provide()` 捕获的（见 `Plan.md` §5 A5），就落进了上面 A 组。

## 已知提取误报：不要为它们补规则

`severity.json` 里有一个 `knownExtractionArtifacts` 段，逐条登记了"看起来是 API 缺口、其实是正则产物"的 `服务.方法`，并给出证据。**这一节存在的意义是防止后来者（包括未来的我）出于好心把假阳性升格成"有影响面的确定结论"。**

最值得记住的两个（都是本轮新查出来的，不只是继承 `usage-inventory.json` 的已知缺陷）：

1. **alias 正则漏了词边界**：`lib/extract.mjs` 里 `ctx.get("x")` 的别名规则构造的正则是 `别名\.方法(`，**没有 `\b`**。于是源码里的 `subagents.listDescendants(` 会同时命中 `agents.listDescendants`——因为 `subagents` 里含子串 `agents.`。desktop profile 上正好 2 处。改前它一直以"影响面未知"的形式出现在结论里。
2. **同文件内别名撞名**：dsh-better-sidebar 的 `lib/client.js` 里同时有 `const service = ctx.get("jobs")`（1 处）和 `const service = ctx.get("betterSidebar")`（6 处）。别名规则对文件内**每一次**匹配都按每个别名目标各记一次，于是文件里所有 `service.X()`——**包括 JSDoc 注释里的**——都被算到 `jobs` 头上。`jobs.getTabs`/`closeTab`/`registerTab` 等 13 个"方法"就是这么来的（`lib/client.js:977` 那处原文是注释里的一句 `service.getTabs()`）。

其余登记项：`settings.isTrusted`/`reportNonstrict`/`useStrictBehavior`（KaTeX 的 `parser.settings`）、`settings.settingsGet`/`externalDisable`（better-sidebar 自有的 `SidebarSettingsFace`）、`locale.startsWith`（字符串方法）、`tools.filter/join/push` 与 `sessions.map/filter/slice/...`（数组方法）。

## 待复核的既有条目（本轮**没有改**）

改这些条目会改变输出，按 `Plan.md` §4 第 3 条应先摊开差异再决定，所以只登记证据，列在 `severity.json` 的 `needsReview` 段：

- `sessions.open` / `sessions.getSnapshot`：两个目录里都没有；客户端真正的跳转入口是 `uiWorkspace.openSession`。
- `sessions.refresh`：两个目录里都没有（客户端目录里的是 `refreshProjections`）。
- `settings.get`：0.2.0-rc.2 的宿主目录里 `settings` 没有 `get`，可能和 `settingsGet` 一样来自插件自有的设置面。
- `attachments.readImage`：目录里是 `readImageRequest`，方法名对不上，需要一次运行时探针定音。

## 已知的提取缺陷（会影响本表的解读）

`usage-inventory.json` 用的是与内核同源的正则启发式，里面有肉眼可见的误报。这带来两个后果，都已经写进设计：

- 每条发现必须带**确定性标注**（确定/疑似），提取不可靠时降级标注，而不是升格成确定；
- 换真解析器（跟踪 `inject` 列表、`const { tools } = ctx` 解构、变量别名、作用域）是**必须完成的最终状态**，不是可选项。验收指标之一就是"疑似"比例明显下降。

## 怎么改

直接改 `severity.json` 并说明依据。特别注意三类容易判错的：

- **同名不同义**：`settings.register` 在客户端设置页和宿主设置文档里不是一回事；`sessions`/`jobs`/`timer` 两侧同名但 API 不同。别混。
- **降级 ≠ 无害**：`logger` 缺失判 `degraded` 是因为功能不受影响；但 `jobs.onJobsChanged` 判 `degraded` 是因为它**有明确的轮询回退**，而不是因为它不重要。
- **判不准就不要填**：落到默认档 + 明确的"影响面未知"，比编一个看起来合理的影响面好得多。犹豫的写进上一节"故意没填"，那是有价值的产出，不是欠账。
