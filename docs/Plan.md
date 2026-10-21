# 开发计划与维护约定

更新于2026-10-21。**0.1.4已发布至GitHub与npm，npm latest为0.1.4**；确切制品与公开安装均已核验。后续源码修订尚未发布，不追改历史制品证据。用法见[README](../README.md)，计数与逐次验收证据见[docs/current-state.json](current-state.json)。本文只保留现行契约、关键结论和待办，施工过程查Git历史；[旧提取器反例](extraction-findings.md)仅作历史参考。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，提供依据、源码位置和覆盖限制。声明放行、激活成功、客户端到货均不单独证明业务正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、兼容性面板、详情发现/角标、tool和skill；不联网、装包或启动外部命令，使用分析worker并写自身基线 |
| 仓库CLI / 安装检查 | 默认静态扫描不执行目标源码；显式probe/安装检查会装依赖、启动宿主并执行插件，临时profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定 |

单仓库、单版本、一份Node判定内核；版本真源为`lib/version.mjs`。根目录是private开发工作区，npm仅打包`plugin/`，没有CLI bin、安装shell或probe入口，不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约、暂存kernel与LICENSE，postpack清理kernel；裸源码子目录不等同完整tgz。市场截图声明与图片在`plugin/screenshots.json`、`plugin/assets/`，不随当前npm files打包；npm README引用GitHub图片。

0.1.3于2026-10-18发布至[npm](https://www.npmjs.com/package/dsh-plugin-compat-check)和[GitHub](https://github.com/lcy0121/dsh-plugin-compat-check/releases/tag/v0.1.3)，发布源ada1d78及37文件制品证据见`verification.release013`。0.1.4于2026-10-20发布至[npm](https://www.npmjs.com/package/dsh-plugin-compat-check/v/0.1.4)和[GitHub](https://github.com/lcy0121/dsh-plugin-compat-check/releases/tag/v0.1.4)：纳入Origin有效端口校验、激活前提说明、npm子目录元数据及仓库工程回收/Chrome诊断。源提交7bb5e6a的[CI四项通过](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39439507425)，公开npm与Release附件均与验收tgz字节一致（38文件），公开规格实装/启动exit0，覆盖仍有限；见`verification.release014`。这些修订不追写到公开0.1.3中。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、包内源码图、词法绑定及逐调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式，其它profile不能借用当前宿主服务。
- 服务为`present / absent / unobserved / unreadable`。必需inject未观测仅提示激活前提未确认；同宿主明确缺失才推断激活障碍，方法缺失另判。目录缺项、省略键、未知getter不等于不存在；采样不执行getter。现代probe绑定profile/DSH版本/时间，默认24小时过期；旧报告提示未绑定，仅使用明确键。
- 支持有界常量键/解构、同步参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名与空handler透明Proxy；变更/遮蔽/逃逸撤回证明。未知键、trap、异步、递归、复杂控制流、default/rest参数保守合并或弃权。
- 上限为256次相关调用、16层调用、32层导出链、64节点闭包图、128节点逃逸图、512次常量调用、8192字符展开，另有文件/字节/目录/时间预算。超限、解析与读取诊断限制覆盖，不靠放大预算或删调用点求干净。

### 2.2 结论、影响与基线

- `certain`可由明确静态文件/声明事实或合格运行时观测支持；`suspected`表示证据不足以确定该条发现，即使其它服务已有运行时观测。过滤/守卫/弃权另列。`impactBasis=measured / inferred`独立区分有对应观测的实测影响与推断影响，确定发现不等于影响已实测，缺字段不能反推实测。API发现通常有`file:line`；入口/loader/声明事实可无位置，不编造。
- `vacuous=true`表示结论为ok但没有已验证调用，不表示没有服务依赖或客户端功能；按实际`coverage`展示限制。未观测不等于缺失，调用核验、无发现及覆盖完整均不等于业务验收通过。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group及无法映射不冒充该事实。方法规则优先、服务layer回退，不跨端套规则；provide仅为线索，未知方法影响写“影响面未知”，try/catch不是能力守卫。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失时回退官方peer；旧目标保留旧规则。非法字段/范围有诊断；peer workspace:^/~/*按当前精确版本处理，engines不接受该别名。声明风险是推断，不等同实际加载失败，宿主可能跳过bundle后继续启动。
- 只读目标profile独立`compatibility.json`，插件名/插件精确版本/DSH精确版本全匹配才豁免范围冲突；无效记录整条忽略，其它有效记录仍用。非法字段不可豁免；不可读、非普通文件、JSON无效或超64KiB则豁免未观测并限制覆盖，不自动授予。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离，锁内比较、原子写入，不完整扫描不推进。身份升级中性处理，schema1或损坏条目不比较。“无变化”、获豁免和ok均不等于业务认证，`coverage.status=limited`、`vacuous`及客户端未验证须转述。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是运行时/JSDoc真源。CLI为`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP为`kind:plugin-compat-check/report`的envelope；tool保留summary/text和完整report/baseline/cache。字段、严重度、摘要、退出码、span及身份须自洽；面板拒绝损坏负载。新增字段兼容，不兼容变更须升schema，生成副本由`stage-contract.mjs --check`防漂移。

CLI退出码：**0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定**。安装检查另有gate-rejected等状态；网络/安装/启动错误不是插件结论。同目标single-flight，失败刷新保留最近成功报告及错误，缓存不冒充业务验收。

`--issue-report`从同一结果导出Markdown，不读写基线，与json/quiet互斥并保留退出码。共享渲染器为`lib/issue-report.mjs`，原bin入口保留；宿主从同一canonical报告生成可选`issueReport`文本，界面筛选不删减导出内容，只在用户明确复制时写剪贴板，失败保留可选中文本。保留版本、观测、发现、可用位置、certainty/impactBasis、覆盖及占位符命令；不导出原始日志、探针、源码片段、基线或evidence。可疑说明整项隐藏，不安全位置隐藏；仍保留插件名与包内相对文件名，须预览，不保证任意文本完全脱敏，不自动发帖。

### 2.4 DSH接入要点

- UI为`settings.plugins.tab`、`plugins.detail.section`及`.badge`；`plugins.item`缺可靠身份。客户端导出预构建`window.__ModuleLoader__.load({id,factory})`，inject声明其它插件包名，宿主不代构建。
- loader entries可迭代，entry id映射包身份；0–5为PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING，import失败可无fiber。本插件空inject避免自身挂起；工具required是顶层数组，skill须注册运行时provider，按实际启动参数解析profile。
- DSH≥0.2.1-rc.2选新目录（host98/291方法、client8/43），其余/未知选旧0.2.0-rc.2目录，CLI显式覆盖优先；未来版本未认证。ASAR起点为8+headerSize，校验边界/原始字节/摘要；不凭方法名迁移严重度，未知影响回退，未整体重写AST/worker。
- rc.2界面入口为“更多 → 设置 → 内置插件 → 兼容性”。HMR撤销route/tool/skill、计时器及诊断handle，在途任务卸载后不得写基线或返回新成功报告；worker仍按原预算回收，不声称立即取消。Origin要求协议/主机/有效端口完全同源，本机无Origin调用仍允许。

### 2.5 有限静态批量契约

`tools/static-batch.mjs`是仓库开发工具，不进入npm包。仅本地包目录，清单格式为`schemaVersion:1 / kind:plugin-compat-check/batch-manifest / dshVersion:精确版本 / samples:[{id,path,name,version,sha256}]`，例见[test/fixtures/static-batch.json](../test/fixtures/static-batch.json)。`path`相对清单目录，不接受绝对路径、`.`/`..`或链接；id唯一，包名/版本须与副本元数据一致。禁止官方包和无dsh元数据的输入，避免空扫描假成功。未提供下载、解压、安装或全生态自动发现能力。

`--hash <包目录>`只输出待人工封存的指纹，不重锁清单。指纹为全部普通文件按包内POSIX相对路径的UTF-16码元升序排列的`[路径,字节数,文件SHA-256]`数组，压缩JSON的UTF-8字节再取SHA-256；不含空目录和文件模式，不过滤文件。复制时拒绝链接/特殊文件并检查读入稳定性，扫描的就是哈希校验通过的私有副本；不是OS原子快照或防协同篡改认证，修改清单和制品可一起改变结果，不为消除失败盲目换哈希。

队列1–16项顺序运行；清单64KiB，每项4096目录项/32层/单文件2MiB/总16MiB，报告每项96KiB；已有AST/源码图预算继续生效。每项worker默认10秒、整批60秒、堆512+64MiB；`--sample-timeout-ms / --batch-timeout-ms`只能降低时间上限，超时后先回收worker再删除自有目录。预算限制任务调度与worker时间，不承诺硬实时清理或全进程RSS。超限、哈希/身份错误及未调度项逐项exit3，不伪装为插件不兼容；其它项继续，任一工具错误使整批exit3，否则取0/1/2最重静态结论。单项扫描不完整仍保留其发现和覆盖限制，不升级为完整扫描。

JSON为独立的`schemaVersion:1 / kind:plugin-compat-check/batch-result`，逐项含`reviewStatus=pending-author-review`（待作者复核）、固定身份、哈希校验、退出码、结论、certainty/impactBasis、包内位置、coverage/vacuous、弃权/处理状态及扫描诊断。无目标源码执行、宿主观测、跨样本服务提供者、profile豁免、探针或基线读写。聚合不产生准确率或业务真值。导出省略原始inputs、源码、日志、evidence及基线，但包名/文件名和必要分析说明仍可能含业务文本，不能保证任意输入完全脱敏，分享前预览。

`--previous <上次JSON>`有界校验结构及结论/计数/退出码，始终重新扫描；工具版本及仓库分析源码/依赖锁哈希、Node与已装依赖版本、规则/目录哈希、目标DSH、策略和预算一致才比较同id同制品。摘要区分added/removed/changed/unchanged/incomparable；身份变化中性处理，无变化不表示业务通过，旧报告不是可信签名。坏旧输入使整批无法判定，不默默丢弃。

自动化采用[手动Action](../.github/workflows/static-batch.yml)：固定公开合成队列、Node24、contents:read、checkout不保留凭据，官方Actions锁定已核验提交；无schedule、写权限、用户URL/安装规格、目标生命周期脚本或模型调用。JSON作为7天制品，步骤摘要仅固定文案和计数；合成队列预期exit2，workflow只把工具错误视为失败，不能从绿色工作流推断兼容。此处权限和固定SHA选择依据[GitHub安全指引](https://docs.github.com/en/actions/reference/security/secure-use)，验收及复现见§5.4。

端点评估结论：暂不部署，避免源码上传、账户配置、滥用配额及持续托管责任。结果缓存暂不增加，增量摘要只读本地旧报告，避免跨身份复用和缓存失效成本；Action也不开持久缓存。费用仅手动CI时长/7天制品存储，受账户配额影响，不承诺零费用或固定耗时；维护集中在人工样本/哈希更新、固定Actions提交更新和结论复核。业务扩展仍须独立制品、资源预算及业务真值。Perch仅保留可选评估结论，当前无调用、费用或权限授权；若Files恢复且另行立项，须复用已有真实Chrome正负例证明增量收益，并核清权限、源码处理与费用，不替代Chrome验收（`semanticRuleAssessment20261020`）。

### 2.6 真实故障回归与呈现

`tools/real-regression.mjs`仅为仓库开发工具，不进入npm。固定清单`tools/real-regression-manifest.json`锁定DSH0.2.1-rc.2、API目录摘要、三个真实npm制品的版本/发布摘要/安装全树指纹及18个独立业务期望：sidebar0.26.1自然失败2例，0.28.0编辑/503/恢复6例，market1.66.37正常/503/客户端控件缺失/恢复10例。默认两轮、最多两轮，顺序使用全新私有profile与缓存；不调用模型或账户，不把合成测试当真实样本。

复用既有business driver，在动作前封存静态/根服务观测预测，真值来自完成的请求、实际DOM及持久化字节。清单固定业务结果，不固定预测告警；静态、service-only及baseline/受控故障分别重算FP/FN，驱动错误单列。绿色只表示既定正常/失败/恢复被忠实重现，不表示所有插件兼容。离线回放核验病例全集、身份/摘要、封存、时间偏序、截图及清理记录；历史回放不认证当前环境，JSON哈希不提供防协同改写签名，既有driver未记录逐动作时间戳。

每队列墙钟预算10分钟，先SIGTERM给driver留15秒清理窗口再强制停止；异常、观测未完成或清理未证实均不通过。文件/队列读取限额见固定清单，不承诺全进程RSS或OS原子快照；保留超时与失败，不盲删仍在用目录。默认suite只验校验器，真实live须显式运行，验收见§5.6。

发现的“下一步核实”由纯模块`lib/finding-guidance.mjs`提供，CLI、agent、界面与分享报告共用。按结构化类别/状态区分入口交付、声明冲突、FAILED/PENDING及依赖unobserved/unreadable/absent；不从说明文本猜状态，不臆造替代API/修复版本，不自动安装或修改配置。建议不改判定或原始发现字段。

面板提供名称搜索、结论/确定性/待验证状态组合筛选、发现及覆盖限制折叠、完整报告预览复制；待验证指覆盖有限、无已验证调用或客户端尚待验证。“本次新增风险”复用可比基线中的worsened及含发现的added，无可比基线明确中性提示；筛选只改变呈现。报告时间、目标和缓存状态同时可见，完整覆盖仍不等于业务通过。

## 3. 开发与文档维护约定

1. 先复现再修改，保留未知、弃权和覆盖诊断；不以自洽测试替代目标行为，不编造实测或影响。
2. 不重建快照消除失败。版本漂移须审查`test/__baseline-versions.json`并单独提交；默认suite共享测试专用只读profile副本，提取/回读用同一字节。观测不稳或超预算明确报错，不重试或交付半份输入；不是OS原子快照。
3. 分析运行在有预算worker，只清理自有目录/PID组。安装克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径、保留远程pins；拒绝不支持格式和不安全链接，不改原profile。
4. 私有源码副本打tgz、空缓存实装并调用；文件存在或日志干净不证明业务成功。默认10秒/512+64MiB worker预算、1秒工程超时负例及总流程<5秒分别维护；Python parity仅为旧参考。
5. 本地可提交；push/合并/npm发布及对外发帖分别取得授权。0.1.4发布及本轮有限批量源码推送/Action验收已授权，不延伸到下一版本发布或新上游发帖。仅stage本项路径。README写用法、Plan写契约/状态/待办、current-state写证据；交付后将事项从§6移至§4，契约归§2、验收与复现归§5，不在待办中保留“已完成”项。同步skill/契约，不逐轮新增总结文件。历史日期、版本和失败不得改写为当前认证。

## 4. 已完成的关键工作

| 工作 | 结论与证据索引（current-state的verification下） |
|---|---|
| 原始审计 / P0–P2 | 2026-10-14基于4722716/npm0.1.0的B01–B14及S01–S03已整改：词法AST、未知/缺失及端别、loader/profile、原子基线、统一报告和有界值流；原审计已归档，见`auditArchive20261019`。3项medium为源码验证/partial覆盖，不是全量安全认证 |
| 安全与输入隔离 | 私有目录与安全链接、自有Chrome继承管道、路径及资源预算；可选profile只读快照已交付。临时profile仍不隔离任意恶意代码，历史凭据轮换未在旧审计内 |
| rc.2适配 / 0.1.3 | 新声明闸门、精确豁免、双目录、实际导航及卸载恢复，见`rc2TargetedAdaptation`、`release013`；10月17日标签未显示的原因未定，不用后续成功追认根因 |
| 规则质量 | 保留readImage实际路径及sessions.open旧回退；移除getSnapshot/settings.get/sessions.map无依据影响，不为sessions.refresh臆造规则；库存为partial，不等于准确率 |
| 故障诊断与回收 | Darwin全组Z/exit事件竞态现场互证；仅确认退出且完整同UID组快照均Z/消失后接受停止，活进程或不可读仍失败。多资源均尝试回收，保留主错误、清理错误及私有workDir；Chrome按握手/建页/附加/会话记录有界诊断，见`engineeringDiagnostics20261019` |
| Linux Chrome CI | 子进程D-Bus隔离、暂停负例先确认启动、CI读入确切Chrome文件/共享库后开始原协议计时，无预热启动、自动重试或增加生产超时。准备后旧/新DSH矩阵通过；原fffec7f握手失败根因仍未知，新镜像D/page等待只是现场证据，见`linuxChromeCiAcceptance20261020`、`linuxChromeInputPreparation20261020` |
| 有限批量 / 手动Action | 固定文件树哈希、本地静态聚合、预算及错误隔离、待作者复核、身份约束增量摘要已交付；契约见§2.5，验收与复现见§5.4，证据见`staticBatch20261020`。四个公开合成样本不构成业务或生态认证 |
| 产品解释口径 | 界面总览/详情、CLI/quiet/故障报告、agent工具与skill统一解释确定性、影响依据、无已验证调用及覆盖限制；保留原判定与报告字段。源码已完成，尚未发布；契约见§2.2，验收见§5.5及`productExplanations20261021` |
| 真实插件故障回归集 | 固定真实制品、18病例与两轮独立运行、分模式度量和有界回放已完成；保留自然/受控FN，契约见§2.6，验收见§5.6及`realPluginRegression20261021` |
| 发现的下一步核实 | 全入口共用结构化核实步骤，未知依赖保持待确认；分享报告与CLI同源，契约见§2.6及`actionableFindings20261021`；源码尚未发布 |
| 面板体验 | 搜索/组合筛选、详情折叠、完整报告预览与显式复制、基线新增风险视图、目标/时间/缓存信息已完成；见§2.6、§5.7及`panelExperience20261021`；源码尚未发布 |

独立业务预测在动作前按固定制品/API目录/手审功能区间封存，业务真值来自请求、DOM及磁盘，不读loader答案。固定队列如下；并非盲测、生态准确率或完整模型认证：

| 队列 | 结果与边界 |
|---|---|
| dshmarket1.66.37备注/收藏 | 正常/恢复TN4；503及操作前/保存后目标控件缺失FN6，驱动故障单列 |
| dsh-better-sidebar0.28.0 | HTTP与真实编辑器各TN4/FN2；验证编码/换行、保存与新文档重载，503另组 |
| 0.26.1编辑器自然失败 | 原静态FN2保留；顶层webRuntime在rc.2/web明确缺失。动作前服务观测独立队列旧版TP2、新版TN4/FP0；独立诊断宿主补该服务后两例恢复，不进入产品特判，不断言首次引入版本 |
| 0.28.0模型短回复 | 授权账户最终TN2，日志/重载DOM核验；整个历史调试加验收6条成功回复，不代表账单或模型质量认证，本轮发布不新增模型调用 |

详见`independentBusinessTruth`、`businessSampleExpansion`、`marketUiAndBusinessExpansion`及`naturalFailureBoundaries20261019`；服务观测不覆盖静态FN/退出码，不靠调严重度消除漏报。

**分发复核（2026-10-21）：**

| 渠道 | 已完成与剩余边界 |
|---|---|
| 主目录 / dsh-market | #8057简介已同步，目录现映射npm0.1.4；显示名[PR #948](https://github.com/dsh-market/dsh-market/pull/948)已合并并进入1.66.45。真实Chrome卡片/确认标题正确，无终端误警告；新私有profile空缓存通过全球线路安装0.1.4，市场186文件、产品38文件均与公开registry tgz一致，热加载/重启报告有效。#932双端查询失败且未显式请求版本时仍无提示裸名安装；显式有效body.version可保持pin，受控完整handler验证不冒充真实断网安装 |
| 1024 Store | 目录#628已合并；v2仍只有GitHub unknown/not_checked方式，无npm。[#22](https://github.com/imsai-sh/dsh-1024store/issues/22)仍开放、无维护者回复。0.1.4补repository.directory有助绑定，当前v2仍无npm方式，不证明私有D1/KV采集故障已解决；不拿裸源码回退冒充tgz验收 |
| 其它Awesome | dshworks#169已合并，bruc3van#138已关闭并收录；0xsline已收录，但简介修订[PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)仍开放 |

本轮证据见`upstreamAcceptance20261021`，旧安装失败、首屏定位超时及历史线路差异仍保留；本轮通过实际公开搜索定位目标，没有换成本地目录。未新增上游发帖。历史显示名PR的Node24/26结果见`marketDisplayName20261020`，不将局部验收升级为完整业务认证。

## 5. 验证记录与复现

### 5.1 已验证范围

每次结果仅对应其版本、制品和输入。macOS arm64已有DSH0.2.0-rc.2/0.2.1-rc.2、tgz、tool/skill、HTTP和真实Chrome的限定证据；Linux有arm64 VM及x64 CI，Windows未验收。旧rc.1的0.1.2有限集成不代表rc.2或当前认证。当前默认计数见current-state顶层，各次默认/慢测/业务/发布数字保留在对应verification，不在本文重复抄录。

0.1.4源提交7bb5e6a的Node22/24及Linux新旧DSH[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39439507425)四项通过。Linux真实Chrome各11/11，新版联合53/53，旧版联合49通过/4项rc.2不适用；本地Node24/26默认各564通过/3项Linux不适用。确切发布tgz另做本地空缓存、HTTP/UI及公开安装验收，不能从CI重打包的gzip哈希推定制品字节一致。未来冷缓存性能与底层存储原因未获保证，原始失败不能追写成已定位。

### 5.2 日常检查与真实集成

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

默认suite不启动真实DSH或模型；打包回归使用私有空缓存，需要registry。doc-check不递归跑测试，prepublish检查本身不发布。更改真源后同步`stage-skill.mjs`、`stage-contract.mjs`；CLI完整选项见`--help`。

真实集成须配置对应版本DSH/pnpm和Chrome（可设DSC_CHROME），会联网安装并执行自有宿主/插件：

```bash
DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
DSC_SLOW=1 node --test test/probe-boot.test.mjs test/labels.test.mjs test/engineering-live.test.mjs test/profile-lock.test.mjs test/rc2-live.test.mjs test/business-labels.test.mjs
```

rc.2专项及业务在旧DSH明确不适用，其它live测试覆盖旧版；CI另跑debugger真实Linux启动正负例，并保留输入准备清单。

独立业务度量仅为仓库开发工具；`--out-dir`须为空，预测/标签/度量与截图不进入产品判定：

```bash
node tools/business-labels.mjs --live --suite market --out-dir <空目录> --json
# 另有sidebar、sidebar-ui、sidebar-ui-previous；两个编辑器suite可加--observe-services
node tools/business-labels.mjs --predictions <预测.json> --labels <标签.json> --json
# 仅另获真实账户调用授权后运行，不属于默认测试或CI
node tools/business-labels.mjs --live --suite sidebar-model --model-profile <来源profile> --out-dir <空目录> --json
```

服务观测另写service-predictions/labels/observation，只读动作前根服务形状；同批回放核验身份/摘要/病例/时序，不提供防协同篡改签名。度量退出0=无错配，1=FP/FN或不计分项，3=输入/驱动错误或无可计分项；回归要求如实暴露漏报。模型仅显式suite读取并复制所选凭据，强制禁工具、最多两个首步、无重试/自动标题，每步256token；usage累计值不能逐行相加。浏览器zh-CN且credentialOnboarding=false，不认证默认引导；私有profile/凭据副本/自有进程须清理，证据分享前预览。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test test/engineering-live.test.mjs test/profile-lock.test.mjs
DSC_SLOW=1 node --test test/owned-process.test.mjs test/debugger.test.mjs
DSC_EXECUTION_DIAGNOSTICS=<私有目录> node bin/compat-check.mjs --nm <目标node_modules> --probe-boot --json
```

工程证据包括扫描预算/堆耗尽弃权及恢复、受控超时、single-flight、基线争用与原子读取；不承诺全进程RSS、任意脱离进程组隔离或生产性能。Darwin真实负例需编译器，缺失明确跳过。普通诊断不含argv/env或stderr正文；私有可选stderr限长脱敏，仍不保证可直接分享。Linux保留有界进程/线程状态、等待与调度计数，零计数不证明未等待，父进程计时不直接归因Chrome。清理失败保留workDir及进程身份，不按进程名清场、不盲删仍在用目录。

### 5.4 有限静态批量验收与复现

2026-10-20源码ded1132的[远端手动Action](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39448417209)及[完整CI四项](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39448400101)全部通过。Action环境为Ubuntu24.04/Node24.22.0，有效token权限仅contents:read及metadata:read；下载ZIP摘要与GitHub一致，JSON的清单/制品/分析源码/规则/目录身份、四项结论和覆盖限制均已核验。本地默认套件578通过/3项平台跳过，新增14项测试在Node24/26均通过。逐项摘要和确切哈希见`verification.staticBatch20261020`，不代表业务功能验收。

```bash
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json > next.json
node tools/static-batch.mjs --hash <本地包目录>
```

自带合成队列预期exit2：2项无发现、1项部分可用、1项不兼容，全部覆盖有限且待作者复核。增量比较重新扫描，不复用旧结论；制品、分析身份或预算变化时中性处理，分享JSON前须预览。

### 5.5 产品解释口径验收与复现

2026-10-21新增9项报告驱动回归，先复现错误文案再修正；覆盖“依赖服务但没有已验证调用”、静态确定客户端入口缺失、已有运行时观测但个别依赖仍未观测，以及实测loader失败与推断影响的区分。总览、详情、CLI、工具均保留实际覆盖限制，展示不修改原报告；skill示例改用仓库固定夹具的完整真实输出，不依赖个人profile。

默认套件587通过/3项平台跳过（共590项）；最终源码tgz在私有空缓存中实装，真实DSH0.2.1-rc.2/Chrome面板、禁用/恢复及自有目录清理通过。真实面板核验说明和覆盖展示，固定故障案例的总览/详情由组件测试核验，均不替代业务验收。skill修订前后各3个受控场景均被正确解释，不宣称模型能力提升。独立复查发现的两处残留已修正；确切制品摘要与证据范围见`productExplanations20261021`。

```bash
node bin/compat-check.mjs --nm test/fixtures/labels --dsh-version 0.2.1-rc.2 --no-baseline
node --test test/cli.test.mjs test/client-structure.test.mjs test/host-structure.test.mjs test/skill.test.mjs
DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
```

固定夹具命令预期exit2；静态入口缺失为certain且影响为inferred。当前源码和打包skill已同步，公开npm仍为原0.1.4制品，本项没有发布或推送。

### 5.6 真实插件故障回归验收与复现

固定三个队列每轮18病例，默认两轮共36病例；正常/自然失败/恢复与受控客户端故障分别记录。当前固定样本仍有静态自然FN4、受控故障FN16；根服务观测额外识别自然失败4例，受控HTTP故障仍有盲区。绿色回归只要求业务期望忠实重现，预测改进可由FN变TP，不锁死旧预测。逐队列指标、封存/制品摘要、重复运行和篡改负例见`realPluginRegression20261021`。

```bash
node tools/real-regression.mjs --live --out-dir <空证据目录>
node tools/real-regression.mjs --replay <证据根目录>
node tools/real-regression.mjs --replay <单队列证据目录> --suite sidebar-ui-previous
```

live使用现有DSH/pnpm及真实Chrome，联网安装固定插件，业务动作只操作私有工作文件；不复制账户或调用模型。完整回放核对根索引与逐文件摘要，单队列回放核对该队列封存与身份。退出0=固定回归重现，1=业务期望/证据校验不符，3=驱动或观测错误；与产品兼容性CLI退出码含义不同。

### 5.7 核实步骤与面板体验验收

报告驱动的组件交互测试覆盖搜索/多条件筛选、不改原报告、可比与不可比基线、完整预览、显式复制及剪贴板失败后的手动复制。下一步核实覆盖入口/版本声明、FAILED/PENDING、必需/可选依赖与未观测/不可读/明确absent，保留各自certainty、impactBasis和覆盖边界。

最终候选tgz另在空缓存私有profile中安装，真实DSH0.2.1-rc.2/Chrome验证筛选、展开步骤、完整报告预览及实际复制、无基线中性提示、清除筛选和禁用/恢复。界面固定用例来自四个只扫描、不激活的公开合成包；真实业务故障验收独立使用§5.6的已发布插件，不把界面夹具充作真实插件真值。分享报告的运行时/loader复核提示必须保留，静态命令不声称复现同宿主状态。验收证据见`actionableFindings20261021`、`panelExperience20261021`。

完整默认套件628通过、3项平台跳过（共631项），发布前检查、文档/格式与生成副本检查通过。源码已完成，本轮没有push或npm发布，公开0.1.4的历史制品与既有验收记录不变。

## 6. 后续工作

1. **P1：小规模真实用户试用。** 邀请几位插件作者和普通用户，观察其完成“安装→理解报告→定位问题”的过程，记录误读、定位失败、误报反馈和报告分享障碍，据此调整后续优先级。验收产出可复核的反馈、问题分类及对应改进项，不以下载/star代替使用效果；联系他人、收集或公开现场资料分别取得授权，不默认增加遥测。
2. **P2：升级前兼容性预检。** 面向已有API目录支持的目标DSH版本，比较同一组已安装插件在当前版本与目标版本下可能新增的静态风险，复用现有版本选择和判定内核，并隔离当前宿主运行时证据、缓存与基线身份。验收须有固定制品的前后对照、版本/目录来源及预测限制；未知目标版本明确提示未认证，不借用当前运行时面证明未来环境，也不自动升级或将静态预检表述为业务通过。
3. **上游验收。** #932在版本查询双端失败且未显式请求版本时仍无提示裸名安装，待明确告警或安全失败后复验；1024#22仍无维护者回复，v2出现npm方式后另做全新实装；0xsline#717待采纳。无新证据不重复发帖，新外部补充另取授权。
4. **Windows真实验收。** 取得环境后实跑路径、安装器、回收和打包；依用户选择暂缓，不用POSIX或模拟充数。
