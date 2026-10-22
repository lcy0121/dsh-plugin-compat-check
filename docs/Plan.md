# 开发计划与维护约定

**已发布0.1.4，后续源码增量未发布。** 用法见[README](../README.md)；计数、制品与验收范围见[docs/current-state.json](current-state.json)。本文维护现行契约和待办；操作见[使用与验证指南](guide.md)，目录、依赖和回归维护见[维护指南](maintaining.md)。历史施工记录可从 Git 历史查阅。

## 1. 项目定位与交付状态

检查已安装DSH插件与目标版本的兼容性，提供依据、可用源码位置和覆盖限制。**声明放行、激活、客户端到货、无发现及覆盖完整均不等于业务验收。** 这一边界适用于全部入口、差分和验证记录。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、面板/详情/角标、tool及skill；不联网、装包或启动外部命令；预算worker，普通体检写自身基线，显式人工保存另写sidecar |
| 仓库CLI | 默认静态扫描；显式probe-boot启动宿主并执行目标插件；升级预检不执行目标代码 |
| 仓库安装检查 | 在私有profile安装并启动指定包；私有profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定 |

单仓库、单Node内核、单版本真源`lib/version.mjs`。根目录是private工作区，npm仅打包`plugin/`，无CLI bin、安装shell或probe入口，不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约并暂存kernel、LICENSE及第三方说明，postpack清理kernel；裸子目录不是完整tgz。市场截图由`plugin/screenshots.json`声明，不随npm files打包。

公开0.1.4与当前源码增量分开记录。发布身份、平台范围及真实验收摘要见 current-state；源码能力不能追写为公开制品已支持。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、包内源码图、词法绑定及调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式，不借用其它profile的当前宿主服务。有界值流支持常量键、解构、同步参数/返回值、闭包/工厂、模块别名和空handler透明Proxy；变更、遮蔽、逃逸撤回证明，动态/异步/递归/复杂控制流保守合并或弃权。预算以`source-analysis / flow-values / source-graph / syntax`模块为准；超限、读取及解析诊断限制覆盖，不放大预算求干净。
- 服务状态为`present / absent / unobserved / unreadable`；目录缺项、省略键和未知getter不证明缺失，采样不执行getter。必需inject未观测仅提示激活前提待确认，同宿主明确absent才推断障碍；方法失效另判。
- 绑定probe核对profile、DSH及时间；普通CLI/宿主有效期24小时，未来偏差最多5分钟（含边界）。缺失/非法/超范围时撤回该文件的服务及loader证据，保留静态发现与原因，不猜测或重写时间；独立进程内loader证据另判。旧未绑定格式仅认显式键。quiet保持一行并保留采样说明，probe-boot失败说明原因并清理自有资源。

### 2.2 结论、影响与基线

- `certain / suspected`标记该发现的证据是否充分；`impactBasis=measured / inferred`独立区分实测与推断影响。确定发现可来自静态事实，不意味着影响已实测。过滤、守卫、弃权另列；API通常有`file:line`，声明/入口/loader事实无位置时不编造。
- `vacuous=true`为ok但无已验证调用，仍可能有服务依赖或客户端功能；转述必须保留`coverage`及客户端待验证项。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group及无法映射不作此证据。方法规则优先、服务layer回退，不跨端套规则；provide仅为线索，未知影响不补造，try/catch不是能力守卫。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer；旧目标用旧策略。非法字段/范围保留风险；peer的workspace别名可按当前精确版本处理，engines不接受。声明冲突不冒充加载失败。
- 仅普通体检读取profile的`compatibility.json`；插件名、插件精确版本与DSH精确版本均匹配才豁免范围冲突，非法声明字段不可豁免。无效记录忽略；不可读、非普通文件、坏JSON或超64KiB则限制覆盖。
- 同名重复安装（含alias、不同版本）在提取前明确拒绝，CLI/宿主/agent无法判定，不静默覆盖。schema2基线按canonical profile/路径/模式、工具/规则/目录身份隔离，锁内比较、原子写入；失败或扫描不完整不推进。身份变化、schema1及损坏条目中性处理，不制造改善。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`为普通契约真源：CLI为`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP envelope为`kind:plugin-compat-check/report`；普通tool保留summary/text及report/baseline/cache。身份、发现、计数和退出码须自洽；面板拒绝坏负载。新增字段兼容，不兼容变更升schema，生成副本由`stage-contract.mjs --check`核验。

普通CLI退出码：**0无冲突、1部分可用或未知、2不兼容、3无法判定**。安装检查另有gate-rejected等状态；工具错误不是插件结论。普通报告按canonical目标、原始探针绑定路径及内核/DSH/probe上下文隔离并single-flight；已核实的安装/loader事件合并触发身份检查，5秒有界worker元数据巡检兜底。插件源码/清单、规则/目录、豁免/探针及进程内服务/loader身份变化后后台重算；面板2秒轻量轮询并保留筛选。失败保留旧成功报告及错误，失效/卸载中的旧任务不发布或推进基线；5分钟TTL保留为兜底，不承诺防恶意元数据伪装。升级预检使用§2.7的独立契约。

`--issue-report`共用`lib/issue-report.mjs`导出Markdown，不读写基线，与json/quiet互斥。筛选不裁剪导出，显式复制才写剪贴板，失败可手动复制。保留插件名、包内位置及证据边界；隐藏不安全位置/说明，不导出原始源码、日志、probe、baseline或evidence。任意文本不保证完全脱敏，分享前预览，不自动发帖。

### 2.4 DSH接入要点

UI槽位为`settings.plugins.tab`、`plugins.detail.section / .badge`；`plugins.item`缺可靠身份。预构建客户端用`window.__ModuleLoader__.load({id,factory})`，inject为其它客户端包名，宿主不代构建；宿主空inject，tool required为顶层数组，skill注册provider，profile按实际启动参数解析。rc.2导航：更多 → 设置 → 内置插件 → 兼容性。

普通体检对DSH≥0.2.1-rc.2选rc.2目录，其余/未知选旧0.2.0-rc.2目录，CLI覆盖优先。`catalog`分别展示目标版本、参考版本/SHA-256、selection和验收范围；未知/未来、自定义或缺身份均提示未认证。`CATALOG_REFERENCES`固定已验收精确版本/目录字节，摘要漂移明确失败；提取或自报版本不扩大范围。新目录须经[来源核验、API差分、规则复核与真实验收](maintaining.md#api目录候选审查)后人工登记；升级预检不采用普通回退。ASAR按8+headerSize定位并核验边界、字节及摘要。

HMR撤销route/tool/skill、计时器及诊断handle；卸载后在途任务不写基线、不返回新成功，worker仍按预算回收。HTTP Origin须协议、主机和有效端口完全同源；允许本机无Origin请求。

### 2.5 有限静态批量契约

`tools/static-batch.mjs`仅属仓库工具。[固定清单](../test/fixtures/static-batch.json)使用`schemaVersion:1 / kind:plugin-compat-check/batch-manifest`、精确DSH及唯一id，包名/版本/指纹匹配。仅接收相对清单的本地第三方DSH包；拒绝绝对路径、`.`/`..`、链接、特殊文件、官方包及无dsh元数据的输入，无下载、安装或生态自动发现。

指纹：普通文件按包内POSIX路径的UTF-16顺序生成`[路径,字节数,文件SHA-256]`，紧凑JSON的UTF-8字节再取SHA-256；不含空目录/模式。`--hash`只读。扫描经稳定读取与哈希校验的私有副本，不承诺OS原子快照或防协同篡改认证。

1–16项顺序执行，清单64KiB；单项4096目录项/32层/单文件2MiB/总16MiB/报告96KiB；worker默认10秒、整批60秒、堆512+64MiB，时间参数只能降低。超时先回收再清理，不承诺硬实时/RSS。逐项工具错误exit3且继续其它项；整批有错误即3，否则取最重0/1/2。

结果为`kind:plugin-compat-check/batch-result`，保留身份、发现、coverage/vacuous、弃权、诊断及`reviewStatus=pending-author-review`。无运行时、跨样本服务、probe、豁免或基线；部分扫描不升级完整。`--previous`仍重扫，仅制品及分析源码/依赖锁、Node/依赖、规则/目录、目标、策略、预算均相符才比较同id；身份变化中性，坏旧输入明确失败。

[手动Action](../.github/workflows/static-batch.yml)仅扫固定公开合成样本；Node24、只读权限、固定Actions、无schedule/用户URL/目标脚本/模型/持久缓存，制品7天。未部署远程端点或结果缓存，成本为手动CI及短期存储，不承诺免费。

### 2.6 真实故障回归与呈现

`tools/real-regression.mjs`用固定manifest锁定DSH/API目录、五个真实npm制品及每轮24项业务期望：原sidebar/market三制品18项，另加未参与规则调优的pomodoro0.5.5与global-todo0.13.2两独立family各3项正常/故障/恢复。来源、声明形态及限制见[样本说明](maintaining.md#真实插件回归)。默认及最多两轮，全新私有profile与缓存，不复制账户、不调用模型，不随npm分发。

动作前封存预测，真值来自请求/DOM/磁盘；静态与service-only、自然与受控病例分开记录FP/FN，驱动错误另列，不锁死旧告警。回放核对身份、摘要、病例、时序、截图和清理；旧driver缺逐动作时间戳，哈希不是防篡改签名。每队列10分钟，SIGTERM后留15秒清理再强停；清理未证实即失败，不盲删在用目录。

核实步骤共用`lib/finding-guidance.mjs`，依据结构化类别/状态，不从文本猜状态、替代API或修复版本，不自动改配置。面板支持搜索、结论/确定性/待验证组合筛选、折叠、完整预览/复制和基线新增风险；无可比基线中性提示，筛选不改原报告，目标/时间/缓存同时可见。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`对同组私有制品副本联合提取一次，识别名取目录并集，再按两端目录及声明策略独立判定。仅支持精确**0.2.0-rc.2、0.2.1-rc.2**；未知/范围版本在读输入前返回unsupported-version/退出3，不回退或自动升级。

双次观察目录/字节/链接，拒绝重复身份、特殊文件、变化或超限，保留整体/逐插件SHA-256、目录文件/来源/摘要和规则摘要。捕获、双读、哈希、冻结及清理均在受控worker；父进程异步分配自有目录，卸载取消在途捕获/分析，终止后独立清理。捕获256MiB/单文件8MiB/50000目录项/32层/10秒，分析另有10秒/512+64MiB，清理独立10秒；清理失败保留主因并明确未完成，不返回成功。不承诺OS原子快照、硬实时或RSS。

无目标代码执行、网络、运行时/probe/loader、豁免、普通缓存/基线或状态写入；仅合并同目标在途请求，完成后重扫。保留coverage/vacuous、弃权、诊断及客户端待验证信息。

独立真源`lib/upgrade-contract.mjs`：`schemaVersion:1 / kind:plugin-compat-check/upgrade-preview / mode:static-version-comparison`；状态compared/unsupported-version/error。currentReport/targetReport对应同一输入身份，changes按插件/类别/API/span列added/worsened/resolved/unchanged/improved。顶层退出码仅计新增/变重：**0无、1非致命、2含fatal、3无法预检**；严重度或确定性升高视为变重，旧风险可能仍在。ok仅表示比较成功；失败证据为空，baseline/cache始终null。

CLI用`--nm <profile或node_modules> --dsh-version <当前精确版本> --upgrade-to <目标精确版本>`，仅文本/JSON，可带无操作no-baseline；拒绝probe/boot、规则/目录覆盖、基线文件、dry-run、quiet、issue-report、profile。agent用`compat_check({upgradeTo,profile?})`，当前版本来自宿主，结果为upgradePreview、普通report为null。面板显式请求同源GET `/plugin-compat-check/upgrade-preview`；拒绝过时当前版本、不同目标并发和坏负载，不覆盖普通报告，卸载不返回新成功。

### 2.8 健康检查、依赖关系与人工处置

仓库`tools/functional-health.mjs`默认只审阅声明；仅显式`--run`在自有隔离DSH profile及按需Chrome中安装、启动所选本地制品，执行声明式HTTP GET/DOM数量检查。清单32项、单项请求3秒、HTTP响应64KiB、整轮180秒；普通USTAR制品须核对SHA-256、包名/精确版本及DSH精确版本，拒绝扩展头、链接和不安全/重复路径。私有profile不是OS沙箱，不提供账户/模型配置。面板只离线导入历史实测，不执行检查，摘要不是签名，版本相符也不证明当前安装制品相同；实测不改变静态判定。

`dependencyGraph`展示同端服务依赖、候选提供者、loader条目和潜在传播路径/环，区分host/client、必需/可选/子作用域/未知；client包级inject另列。提供声明不证明实际提供或激活，loader状态不等于服务状态，多提供者不擅自选定。节点/关系/遍历及嵌套输入有预算，超限明确有限/截断，不能视为完整受影响集合或实测故障，不自动装包或改变发现。

人工记录位于HTTP/tool envelope的`reviews`，以独立sidecar保存待确认/已复核/误报/已修复及依据；不进入canonical report判定。绑定canonical目标、原观察路径/模式、分析输入源码身份、插件/DSH精确版本、工具/规则/目录及发现类别/API/span/证据；变化后旧记录保留并标记待重审，新风险不继承误报或修复。显式保存核对当前contextToken，锁内合并、原子替换并拒绝陈旧/卸载任务；损坏、超限、链接或非普通数据报错且不覆盖。记录不得隐藏finding、改变总结论/退出码/基线或授予compatibility豁免。路径、限额及崩溃后孤立锁/临时文件的人工恢复见[工作流](guide.md)。

### 2.9 插件作者CI

仓库`tools/author-ci.mjs`对同一已构建插件目录取只读快照，用现有内核比较已认证精确版本矩阵；默认`0.2.0-rc.2 / 0.2.1-rc.2`，未知版本阻断、不回退。默认策略阻断所有发现、未知、覆盖不足和无已验证调用；可显式声明严重度/确定性及覆盖策略，`all`检查全部，`new`须提供身份相容的已审查JSON，旧风险仍保留。工具/身份错误始终阻断，不因策略或旧结果变绿。

JSON为完整证据源，SARIF 2.1.0与JUnit XML保留逐版本门禁及身份/限制；真实包内位置与内核一致，无位置不编造。策略退出码0/1/2/3与每cell的内核退出码分别保留；0只表示符合策略，不证明启动或业务通过。无依赖安装、目标执行、宿主启动、网络、模型或profile状态；用法、预算、基线信任边界及复现见[作者CI](author-ci.md)。当前仅为未发布源码能力。

## 3. 开发与文档维护约定

1. 先复现再修改，不编造实测或重建快照消除失败；版本漂移审查`test/__baseline-versions.json`并单独提交。默认suite用只读profile副本，提取/回读同字节。
2. 仅清理自有目录/PID组。克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径并保留远程pins，拒绝不支持格式/不安全链接，不改源profile。
3. 私有副本打tgz、空缓存实装并调用；日志不替代行为验收，默认预算与受控工程负例分开，Python parity仅作旧参考。
4. README写入口用法，Plan写契约/待办，guide写操作，maintaining写维护流程，current-state保存当前事实与有限验收摘要。完成项移出§6，不逐轮追加总结或改写历史认证。同步skill/契约副本；依赖变化后生成第三方说明，由doc-check校验元数据、末尾License及Markdown链接/锚点。
5. 本地提交限任务路径；push、合并、npm发布及外部发帖分别按当次授权执行，源码推送不等于npm发布。

## 4. 验收范围

源码与公开制品分开记录；macOS arm64、Linux arm64 VM/x64 CI仅在已记录版本和输入上有证据，Windows未真实验收。真实业务、受控故障和静态预测分别计分，有限样本不代表生态准确率。历史成功不认证新源码、制品或未来版本；远端状态以对应提交的Actions记录为准。

## 5. 验证入口

日常检查、升级预检、健康检查、依赖视图、人工处置和工程诊断见[指南](guide.md)。目录候选、依赖公告、真实样本与提取器维护见[维护指南](maintaining.md)。作者CI的策略、SARIF/JUnit与版本矩阵见[作者CI](author-ci.md)，交付状态以§6和实际验证记录为准。

## 6. 后续工作

按紧迫性、结论可信度、宿主可用性和交付价值排序；优先级不是漏洞评级。已完成项移出本节。所有待办沿用§1的证据边界及§3的授权约定，不能以调整严重度、旧证据或模拟结果替代验收。

1. **P1：修复关键问题后交付下一版。** 完成确认缺陷及本版阻断检查后，整理变更、迁移/限制、确切tgz和公开安装验收；不以可选功能全做完为前提。源码、候选、公开版本分开记录，npm/Release发布另获授权。
2. **P1：小规模真实用户试用。** 观察作者/普通用户完成安装→理解→定位，记录误读、定位失败、误报和分享障碍；下载/star不代替效果。联系、收集和公开现场资料分别获授权，不默认增加遥测。
3. **P2：跟进上游验收。** 依据[current-state历史摘要](current-state.json)的`upstreamAcceptance20261021`跟进：2026-10-21记录中，dsh-market#932已关闭，但双端查询失败且无显式版本时仍可能裸名安装，待告警/安全失败后复验；1024#22待回复及v2 npm方式后全新实装；0xsline#717待采纳。这些是历史检查状态，本轮未刷新上游。有外部变化才复验，不重复发帖，补充另取授权。
4. **P2：Windows真实验收（依环境条件暂缓）。** 环境具备后实跑路径、安装器、回收、打包、诊断及自有资源清理。按用户选择暂缓，完成前保留未验收边界。
