# 严重度规则表与维护

适用于0.1.3；公开版本以registry和Plan发布记录为准。当前契约见 [Plan](../docs/Plan.md)，验证见 [自动统计](../docs/current-state.json)。后半保留2026-10-11旧提取器的依据，历史表不是当前覆盖率或运行时真值。

## 文件与运行时消费者

| 文件 | 用途 |
|---|---|
| severity.json | 方法严重度/影响文案；引擎读取services下的方法规则，并与代码内默认档合用 |
| dsh-api-catalog.json / dsh-api-catalog-0.2.1-rc.2.json | 原0.2.0-rc.2（host91/client8）与新rc.2（host98/client8）契约快照；DSH≥0.2.1-rc.2选新目录，其余/未知选旧目录，CLI显式覆盖优先；未来版本未认证 |
| usage-inventory.json | 带日期/版本/profile及完整性标记的AST库存快照；由coverage显式刷新，不保证与后续提取器重扫同数 |

严重度由 `lib/verdict.mjs` 的确定性逻辑、缺失证据、方法规则及默认档共同决定，不由LLM决定。方法规则的severity/impact参与判定与输出，layer控制端别：方法自身优先、服务layer回退。summary/basis/evidence/knownGoneIn/needsReview等用于解释与维护；knownExtractionArtifacts是历史反例登记，不是自动过滤黑名单。

0.1.3按DSH目标分流声明：从0.2.1-rc.1起自有engines.dsh优先，缺失才回退全部官方peer；旧目标保留旧行为。非法/空范围、预发布和peer workspace别名均有回归；engines中的workspace不获放行。独立compatibility.json仅按插件/运行时精确版本豁免，非法字段不能靠豁免绕过；无效记录忽略并保留覆盖限制。

## 当前证据与严重度

| 情形 | 处理 |
|---|---|
| 可映射loader条目FAILED/PENDING | fatal，影响依据measured；禁用、LOADING、无法映射不冒充同一事实 |
| 宿主硬依赖且明确absent | 可判fatal；仅catalog缺项不冒充运行时缺失 |
| 非硬依赖服务明确absent，或有足够方法证据 | 按规则/默认档给feature-dead或degraded；用户影响通常是inferred |
| 官方声明冲突或非法字段 | declared-incompatible，degraded及推断影响；不冒充实测加载失败；有效精确豁免可消除范围冲突，但保留限制且不证明业务成功 |
| 未采样、读取失败、访问器未知、源码不完整 | 保留覆盖限制；不以省略键认定不存在 |

方法规则中的degraded应有具体降级/回退依据；peer声明冲突的degraded是引擎针对声明风险的独立默认，不代表观察到回退。方法缺失但没有语义规则时会明确“影响面未知”。声明provide只是候选提供方，不证明已激活，不能遮住完整的present方法观测。

宿主、客户端及shared调用点必须分开。客户端方法不能拿宿主probe判缺失；同名服务也不保证同一语义。对源码归属不确定的Context/别名保留suspected。certainty与impactBasis分别表达证据强度和影响是否实测。

仓库独立业务队列将手审的功能调用区间内API风险与真实市场操作、侧栏HTTP/编辑器及有限模型回复结果对照，保持业务、loader标签及预测隔离；不把整个插件的其它发现挪给本功能。正常/自然失败与HTTP503/控件缺失故障组分别计分，限定样本不能改变生产报告中的certainty或impactBasis，也不是新增严重度规则的充分证据。复现见[Plan](../docs/Plan.md#52-日常检查与真实集成)。

## 如何更新

ASAR读取器已修正数据起点为8+headerSize，并校验头长、边界、完整读取、UTF-8/JSON及归档SHA256。2026-10-18与Electron原生ASAR读取逐字节及首尾交叉校验后生成独立rc.2目录，旧目录未改。新host增加8项、移除invariants；subagents移除start/startContinuable/drainContinuableChildren/drainContinuableDescendants，增加startActivation/drainChildren/drainDescendants/waitForChildren；其它方法差异和源摘要见current-state。client方法集合未变。旧方法规则保留其原调用语义；不把新方法当同义重命名，也不只凭目录变化新增严重度，未知影响继续回退。

先读调用点和目标版本的真实描述符/官方源码，再修改规则，添加行为回归并审查快照差异。原needsReview已在2026-10-15逐条复核，决定与证据保留于severity.json的needsReview.reviewed/evidence及 [Plan](../docs/Plan.md)。

`tools/coverage.mjs` 从AST调用点按host/client/shared分端计数，规则命中与默认影响、类别发现分列。**knownExtractionArtifacts只保留历史反例，不过滤现在的真实调用**；纯客户端规则不用于宿主同名方法。probe须为现代格式并绑定本目标/版本/时间，不能借别的profile的面。写库存要求显式或观测到的合法semver版本，非法版本退出3且不覆盖旧文件。

```bash
node tools/coverage.mjs --nm <node_modules目录> --dsh-version <已核验版本> --json
node tools/coverage.mjs --nm <node_modules目录> --probe <同目标的现代probe> --write --json
# 默认拒绝将不完整扫描写成库存；审查diagnostics后方可显式接受部分样本
node tools/coverage.mjs --nm <node_modules目录> --dsh-version <已核验版本> --write --allow-partial --json
```

仓库保存的库存是2026-10-15的desktop21插件样本，DSH0.2.0-rc.2，静态catalogue模式，不借用规则复核的私有web探针。扫描受默认字节预算和缺失CSS入口限制，明确为partial：50个有调用服务、125个分端方法对，其中88个有对应规则（host69/79、client19/46）。这些是本次读到的部分集合，不是完整覆盖率或准确率；同名方法不同端分别计数，不能直接和下面旧口径61%比较。sourceDigest记录规范化AST分析摘要，不承诺所有包字节的完整性。历史Python参考不是AST真值。

2026-10-15规则复核：attachments.readImage由官方实现和真实描述符互证，保留仅该读取路径的影响；sessions.open保留明确的客户端旧回退语义；删除sessions.getSnapshot、settings.get及sessions.map的无依据影响条目；sessions.refresh有守卫且无足够语义证据，不新增规则。客户端运行时未采样，不宣称对应API已被删除。

## 历史依据：覆盖率、方法与反例（2026-10-11，旧提取器）

> 以下表格、旧命令、完整性判断和“故意没填”均是2026-10-11旧阶段记录，不是现行操作规程；当前证据与更新命令以上方为准。

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

### 当时值（2026-10-11，desktop profile，DSH 0.2.0-rc.2，**带运行时面**）

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

## 历史补充：新增条目的证据分列

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

## 历史补充：故意没填的服务与原因

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

`betterSidebar` —— 它是插件自己 `ctx.provide()` 出来的服务，**提取器已正确记入 `providedServices`**（同类的还有 dshmarket 的 `market`），因此不会产生假缺口。`pet` / `agentTeams` / `companionQq` / `betterLocale` 这些**没有**被 `ctx.provide()` 捕获的（见 `docs/Plan.md` §2.1 的提供方证据约束），就落进了上面 A 组。

## 历史补充：已知提取误报

`severity.json` 里有一个 `knownExtractionArtifacts` 段，逐条登记了"看起来是 API 缺口、其实是正则产物"的 `服务.方法`，并给出证据。**这一节存在的意义是防止后来者（包括未来的我）出于好心把假阳性升格成"有影响面的确定结论"。**

最值得记住的两个（当时新查出来的，不只是继承 `usage-inventory.json` 的已知缺陷）：

1. **alias 正则漏了词边界**：`lib/extract.mjs` 里 `ctx.get("x")` 的别名规则构造的正则是 `别名\.方法(`，**没有 `\b`**。于是源码里的 `subagents.listDescendants(` 会同时命中 `agents.listDescendants`——因为 `subagents` 里含子串 `agents.`。desktop profile 上正好 2 处。改前它一直以"影响面未知"的形式出现在结论里。
2. **同文件内别名撞名**：dsh-better-sidebar 的 `lib/client.js` 里同时有 `const service = ctx.get("jobs")`（1 处）和 `const service = ctx.get("betterSidebar")`（6 处）。别名规则对文件内**每一次**匹配都按每个别名目标各记一次，于是文件里所有 `service.X()`——**包括 JSDoc 注释里的**——都被算到 `jobs` 头上。`jobs.getTabs`/`closeTab`/`registerTab` 等 13 个"方法"就是这么来的（`lib/client.js:977` 那处原文是注释里的一句 `service.getTabs()`）。

其余登记项：`settings.isTrusted`/`reportNonstrict`/`useStrictBehavior`（KaTeX 的 `parser.settings`）、`settings.settingsGet`/`externalDisable`（better-sidebar 自有的 `SidebarSettingsFace`）、`locale.startsWith`（字符串方法）、`tools.filter/join/push` 与 `sessions.map/filter/slice/...`（数组方法）。

## 历史待复核登记（2026-10-11；现已按上文处理）

改这些条目会改变输出，按 `docs/Plan.md` §3 第 2 条应先摊开差异再决定，当时仅登记证据。以下保留当时的疑问；当前处理决定在needsReview.reviewed中：

- `sessions.open` / `sessions.getSnapshot`：两个目录里都没有；客户端真正的跳转入口是 `uiWorkspace.openSession`。
- `sessions.refresh`：两个目录里都没有（客户端目录里的是 `refreshProjections`）。
- `settings.get`：0.2.0-rc.2 的宿主目录里 `settings` 没有 `get`，可能和 `settingsGet` 一样来自插件自有的设置面。
- `attachments.readImage`：目录里是 `readImageRequest`，方法名对不上，需要一次运行时探针定音。

## 当前提取边界

旧inventory来源于正则提取器；当前JSON已由有版本和完整性标记的AST样本替换，旧数值只保留在本页历史表。knownExtractionArtifacts也保留历史反例用途，并非当前引擎的黑名单。新的规则刷新必须记录DSH版本、目标profile、probe身份与时间，并逐条复核源码归属。

真解析器已经落地；“疑似比例明显下降”不作为验收指标，因为该比例还受运行时采样覆盖影响。当前已支持有界跨函数/包内模块值流，未知动态行为仍有诊断；不声称完整分析，边界见 [现行契约](../docs/Plan.md)。

## 当前维护原则

直接改 `severity.json` 并说明依据。特别注意三类容易判错的：

- **同名不同义**：`settings.register` 在客户端设置页和宿主设置文档里不是一回事；`sessions`/`jobs`/`timer` 两侧同名但 API 不同。别混。
- **降级 ≠ 无害**：`logger`相关规则按日志/诊断影响描述，不外推全部业务功能均不受影响；但 `jobs.onJobsChanged` 判 `degraded` 是因为它**有明确的轮询回退**，而不是因为它不重要。
- **判不准就不要填**：落到默认档 + 明确的"影响面未知"，比编一个看起来合理的影响面好得多。新疑问写入needsReview并保留来源和待核验范围，不把历史“故意没填”当永久结论。
