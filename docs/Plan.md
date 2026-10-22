# 开发计划与维护约定

**已发布0.1.4；后续源码增量未发布。** [README](../README.md)提供入口，[使用指南](guide.md)提供操作，[维护指南](maintaining.md)提供目录/依赖/回归流程，[docs/current-state.json](current-state.json)保存当前计数及限定验收摘要。本文只维护核心契约与待办；历史证据留在Git，不追写为当前认证。

## 1. 项目定位与交付状态

检查已安装DSH插件与目标版本的兼容性，提供证据、真实位置和覆盖限制。**声明放行、激活、客户端到货、无发现和覆盖完整均不等于业务验收**；该边界适用于所有入口及差分。

单仓库、单Node判定内核，版本真源`lib/version.mjs`。根目录是private工作区；npm仅发布`plugin/`，无CLI bin、安装shell或probe入口，不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约并暂存kernel、License和第三方说明，postpack清理kernel；裸子目录不是完整tgz。市场截图由`plugin/screenshots.json`声明，不随npm files打包。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、面板/详情/角标、tool/skill；不联网、装包或启动外部命令；普通体检仅写自身基线，显式人工保存另写sidecar |
| 仓库工具 | CLI默认静态；probe-boot、安装检查及健康执行器仅按显式请求启动自有宿主/目标插件。升级预检、静态批量和作者CI不执行目标代码 |
| skill | 指导调用同一工具/CLI，不另实现判定 |

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

JS/TS AST、包内源码图、词法绑定与调用span识别Context；host/client/shared分端，静态、文件probe、进程内观测分模式，不借其它profile服务。有界值流支持常量、解构、同步传参/返回、闭包/工厂、模块别名及空handler透明Proxy；变更、遮蔽、逃逸撤回证明，动态/异步/递归/复杂流保守合并或弃权。解析、读取和预算诊断必须限制覆盖，不放大预算求干净。

服务状态为`present / absent / unobserved / unreadable`；目录缺项、省略键或未知getter不证明缺失，采样不执行getter。必需inject未观测仅提示前提待确认，同宿主明确absent才推断障碍，方法失效另判。绑定probe核对profile、DSH、时间：有效期24小时，未来容差5分钟（含边界）；无效时撤回该文件的服务/loader证据并说明原因，静态与独立进程内证据另判。旧未绑定格式仅认显式键；quiet仍一行，boot失败说明原因并清理自有资源。

### 2.2 结论、影响与基线

- `certain / suspected`表示发现的证据充分性；`impactBasis=measured / inferred`独立表示影响依据。确定静态事实不等于影响已实测。过滤、守卫、弃权另列；源码API可给`file:line`，声明/入口/loader无位置不编造。`vacuous=true`表示ok但无已验证调用，转述仍保留coverage及客户端待验证项。
- 可靠映射且启用的FAILED/PENDING loader可形成fatal实测发现；disabled、LOADING、group及无法映射者不能。方法规则优先、服务layer回退、不跨端；provide仅是线索，try/catch不是能力守卫。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer；旧目标用旧策略。非法字段/范围保留风险，声明冲突不冒充加载失败；peer可按当前精确版本处理workspace别名，engines不可。仅普通体检读取profile `compatibility.json`，插件名/插件及DSH精确版本全匹配才豁免范围冲突，非法声明不可豁免。坏JSON、非普通文件、不可读或超64KiB限制覆盖。
- 同名安装（含alias/不同版本）明确拒绝，不静默覆盖。schema2基线按canonical目标/原路径/模式、工具/规则/目录身份隔离；锁内比较、原子写入，失败或不完整扫描不推进。身份变化、schema1及损坏记录中性处理，不制造改善。

### 2.3 报告结构与兼容策略

普通契约真源`lib/contracts.mjs`：CLI为`schemaVersion:1 / kind:plugin-compat-check/result`；HTTP为`kind:plugin-compat-check/report` envelope；tool保留summary/text及report/baseline/cache。身份、发现、计数和退出码自洽；面板拒绝坏负载。新增字段兼容，不兼容变更升schema，`stage-contract.mjs --check`核验生成副本。普通退出码：**0无冲突、1部分可用或未知、2不兼容、3无法判定**；工具错误不是插件结论。

普通缓存按目标、原probe绑定路径及内核/DSH/probe上下文隔离并single-flight；安装/loader事件合并触发身份检查，5秒有界worker巡检兜底。源码/清单、规则/目录、豁免/probe、进程内服务/loader变化后后台重算；面板2秒元数据轮询并保留筛选，5分钟TTL兜底。失败保留旧成功及错误；失效/卸载的旧任务不发布、不推进基线。不承诺防恶意元数据伪装。

`--issue-report`共用导出模块，不读写基线，与json/quiet互斥。筛选不裁剪导出，显式复制才写剪贴板；保留包名、包内位置及限制，隐藏不安全说明，不导出原始源码、日志、probe、baseline或evidence。分享前预览，不保证任意文本完全脱敏，不自动发帖。

### 2.4 DSH接入要点

UI使用`settings.plugins.tab`、`plugins.detail.section / .badge`；`plugins.item`缺可靠身份。客户端预构建后经`window.__ModuleLoader__.load({id,factory})`注册，inject为其它客户端包名，宿主不代构建；宿主空inject，tool required为顶层数组，skill用provider，profile从启动参数解析。rc.2路径：更多→设置→内置插件→兼容性。

普通体检对DSH≥0.2.1-rc.2选rc.2目录，其余/未知选旧0.2.0-rc.2目录，显式catalog覆盖优先；目标、参考版本/摘要、selection、认证范围分别展示。固定`CATALOG_REFERENCES`只认证已登记精确版本与字节，摘要漂移失败；未知/未来/自定义目录不扩大范围。新目录须经[来源、API差分、规则和真实验收](maintaining.md#api目录候选审查)后登记；ASAR按8+headerSize定位并核验边界和摘要。

HMR撤销route/tool/skill、计时器及诊断handle，卸载取消在途任务并按预算回收worker；不写新基线或返回新成功。HTTP Origin须协议、主机、有效端口完全同源，允许本机无Origin请求。

### 2.5 有限静态批量契约

`tools/static-batch.mjs`只接本地第三方DSH包；[manifest](../test/fixtures/static-batch.json)为schema1、`kind:plugin-compat-check/batch-manifest`，精确DSH、唯一id和匹配的包名/版本/指纹。路径相对清单，拒绝绝对路径、`.`/`..`、链接、特殊文件、官方包及缺dsh元数据，无下载/安装/生态发现。

指纹为普通文件按包内POSIX路径UTF-16排序的`[路径,字节数,文件SHA-256]`列表，紧凑JSON的UTF-8再取SHA-256；不含空目录/模式，`--hash`只读。仅扫稳定读取、验hash的私有副本，不承诺OS原子快照或防篡改认证。预算：1–16项顺序执行，清单64KiB；每项4096目录项/32层/单文件2MiB/总16MiB/报告96KiB；worker10秒、整批60秒、堆512+64MiB，时间只可降低，终止后再清理，不承诺硬实时/RSS。

结果`kind:plugin-compat-check/batch-result`保留发现、coverage/vacuous、弃权、诊断和待作者复核状态；无运行时、跨样本服务、probe、豁免或基线。逐项工具错误继续其它项；总退出码错误优先3，否则取最重0/1/2。previous仍重扫，仅同id及制品、分析源码/依赖锁、Node/依赖、规则/目录、目标、策略/预算一致才比较；身份变化中性，坏旧输入失败。[手动Action](../.github/workflows/static-batch.yml)只扫固定公开合成样本：Node24、只读权限、固定Actions、无schedule/用户URL/持久缓存，制品7天；无远程服务/缓存，不承诺免费。

### 2.6 真实故障回归与呈现

`tools/real-regression.mjs`固定DSH/目录、五个npm制品和24项业务期望（sidebar/market三制品18项，独立pomodoro/global-todo两family各3项正常/故障/恢复），默认及最多两轮。每轮新私有profile/缓存，不复制账户或调用模型，不随npm分发；[样本/限制](maintaining.md#真实插件回归)。动作前封存预测，真值来自请求/DOM/磁盘；静态/service-only、自然/受控病例、驱动错误分开计分，不锁死旧告警。回放核对身份/摘要、时序、截图及清理；旧driver时间戳不足，hash非签名。队列10分钟，SIGTERM后15秒清理再强停；未确认清理即失败，不删在用资源。

核实建议共用`lib/finding-guidance.mjs`并依据结构化状态，不猜替代API/修复版本、不自动改配置。面板组合筛选、折叠、完整预览/复制和新增风险不改原报告；不可比基线中性提示，目标/时间/缓存状态可见。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`只支持精确**0.2.0-rc.2、0.2.1-rc.2**，其它版本在读输入前退出3；无回退/自动升级。对同组私有制品联合提取一次，目录并集识别名称，再按两端目录和声明策略独立判定。双读目录/字节/链接，拒绝同名、特殊文件、变化和超限，保留整体/逐包、目录及规则摘要；不承诺OS原子快照。

捕获/哈希/冻结、分析及清理均用受控worker，卸载先终止再独立清理；捕获256MiB/单文件8MiB/50000项/32层/10秒，分析10秒/512+64MiB，清理独立10秒，清理失败保留主因且不返回成功。无目标执行、网络、运行时/probe/loader、豁免、普通缓存/基线或状态写入；只合并同目标在途请求，完成后重扫。

独立真源`lib/upgrade-contract.mjs`：schema1、`kind:plugin-compat-check/upgrade-preview / mode:static-version-comparison`，状态compared/unsupported-version/error；两份report对应同一输入身份，changes按插件/类别/API/span分added/worsened/resolved/unchanged/improved。顶层退出码只计新增/变重：**0无、1非fatal、2含fatal、3无法预检**；严重度/确定性升高视为变重，旧风险仍保留。ok仅表示比较完成，失败证据为空，baseline/cache为null；coverage/vacuous等限制不可省略。

CLI显式给nm、当前dsh-version、upgrade-to，仅文本/JSON及无操作no-baseline；拒绝probe/boot、规则/目录覆盖、baseline-file、dry-run、quiet、issue-report、profile。agent当前版本取宿主，返回upgradePreview而普通report为null；面板显式同源GET预检，拒绝过时当前版本、不同目标并发及坏负载，不替换普通报告。

### 2.8 健康检查、依赖关系与人工处置

- 健康执行器仅仓库提供：默认review，显式run才安装/启动选定本地USTAR制品及自有DSH/Chrome，核对制品hash、包名/精确版本及DSH版本；32项HTTP GET/DOM数量检查、请求3秒/响应64KiB/整轮180秒。无作者脚本，拒绝扩展头、链接及危险/重复路径；不借用账户/模型。私有profile不是OS沙箱。面板仅离线导入历史记录，版本相同不证明当前安装字节相同，不改静态判定。
- `dependencyGraph`保留端侧、必需/可选/子作用域/未知、候选提供者和loader状态；client包inject另列。提供声明和路径/环只表示潜在关系，不证明实际提供、激活或故障传播；多候选不擅自选定。节点/关系/遍历/输入有界，截断明确显示，不自动装包或改变发现。
- 人工处置为独立`reviews` sidecar，保存待确认/已复核/误报/已修复及依据；绑定目标/原观察路径/模式、源码、插件/DSH、工具/规则/目录及finding证据身份，变化后旧记录待重审。只接受当前contextToken，锁内合并、原子替换，陈旧/卸载、损坏/超限/链接等不写；不得隐藏新风险、改变结论/基线或授予豁免。路径、限额及孤立锁恢复见[指南](guide.md)。

### 2.9 插件作者CI

`tools/author-ci.mjs`对同一已构建包的只读快照，用现有内核比较已认证精确目录（默认上述两版本）；未知版本/身份或工具错误始终阻断。默认阻断所有发现、未知、覆盖不足及无已验证调用；可显式按严重度/确定性与覆盖策略选择，all检查全部，new需身份相容的已审查JSON，旧风险仍保留。

JSON为完整证据源，SARIF 2.1.0/JUnit保留逐版本结果、身份/限制与真实位置。策略退出码和每cell内核退出码分别保留，0仅符合所选策略；不证明宿主启动或业务通过。无安装、目标执行、网络、模型、profile或基线；[用法/预算/基线信任边界](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留独立行为测试，不伪造实测或重建快照消除失败；版本漂移审查`test/__baseline-versions.json`并单独提交。默认suite仅用只读profile副本；真实安装/执行仅在自有副本，私有profile不是OS沙箱，仅清理自有目录/PID组。克隆排除node_modules，安全重定位manifest和支持的pnpm9单importer锁路径，保留远程pins，不改源profile。

交付核对同一tgz及行为，日志不代替验收；默认预算与受控工程负例分开，Python parity仅为旧参考。README写入口，Plan写契约/待办，指南写操作，维护指南写流程，current-state留当前事实及有限摘要；完成项移出§6，不逐轮追加流水。同步skill/契约和第三方说明，由doc-check核对元数据、末尾License、链接/锚点。本地提交限任务路径；push、合并、发布与外部发帖按授权分别处理。

## 4. 验收范围

源码、候选及公开制品分开。macOS arm64、Linux arm64 VM/x64 CI只在记录的版本/输入上有证据，Windows未真实验收；有限业务/受控样本不代表生态准确率。历史成功不认证新源码、制品或未来版本；远端状态看对应提交的Actions。

## 5. 验证入口

[使用指南](guide.md)：日常检查、升级/批量、健康/依赖/人工处置及工程诊断。[维护指南](maintaining.md)：目录候选、依赖公告、真实回归和提取边界。[作者CI](author-ci.md)：门禁、矩阵和标准输出。当前计数及限定验收摘要见current-state；具体预算常量、测试与脚本是可执行事实源。

## 6. 后续工作

按急迫性与价值排序，非漏洞评级；均沿用上述证据和授权边界：

1. **P1：修复关键问题后交付下一版。** 完成对应提交的CI与真实安装阻断检查，整理变更/迁移/限制、确切tgz及公开安装验收；不等待全部可选功能。源码推送不等于npm发布，发布另获授权。
2. **P1：小规模真实用户试用。** 观察安装→理解→定位，记录误读、失败、误报及分享障碍；下载/star不代替效果，联系/资料收集/公开分别授权，不默认遥测。
3. **P2：跟进上游验收。** 据[current-state](current-state.json)的历史摘要`upstreamAcceptance20261021`：dsh-market#932当时虽关闭，双查询失败且无显式版本仍可能裸名安装，待告警/安全失败后复验；1024#22待回复/v2 npm方式后全新实装；0xsline#717待采纳。有变化再复验，不重复发帖，补充另取授权；本轮未刷新这些上游状态。
4. **P2：Windows真实验收（依环境条件暂缓）。** 环境具备后实跑路径、安装器、回收、打包/诊断及自有资源清理；完成前保留未验收边界。
