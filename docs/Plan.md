# 开发计划与维护约定

当前开发分支为`0.1.7-dev`，尚未发布npm版本；版本真源`lib/version.mjs`仍为**0.1.6**。0.1.6是宿主最低版本声明与包信息的元数据补丁，保留0.1.5功能；新增源码修复不能归入已发布包。[README](../README.md)介绍入口，[指南](guide.md)给出操作与限额，[维护指南](maintaining.md)说明审查流程，[作者CI](author-ci.md)说明门禁，[docs/current-state.json](current-state.json)保存当前计数和限定验证摘要。详细历史留在Git。

## 1. 项目定位与交付状态

检查**已安装DSH插件**与目标版本的兼容性，给出证据、源码位置和覆盖限制。**声明放行、激活、客户端到货、无发现及覆盖完整均不等于业务验收。**

单仓库、单Node判定内核；根目录是private工作区，npm只发布`plugin/`，没有CLI bin，不支持`npx dsh-plugin-compat-check`。源码安装须构建完整tgz，不能直接安装根GitHub spec或复制裸子目录；[打包步骤](../plugin/README.md#从源码构建安装)说明生成副本和内核暂存。市场截图由`plugin/screenshots.json`声明，不随npm files打包。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、面板/详情/角标、tool/skill；不联网、装包或启动外部命令。普通体检写自身基线，显式人工保存另写sidecar。 |
| 仓库工具 | CLI默认静态；安装检查、probe-boot及健康执行器须显式执行授权。升级预检、静态批量、作者CI不执行目标代码。 |
| skill | 指导调用同一工具/CLI，不另实现判定。 |

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

JS/TS AST、源码图、词法绑定和调用span识别Context及有界值流，host/client/shared分端。变异、遮蔽、逃逸撤回证明，动态/异步/递归/复杂流保守推断或弃权；解析、读取和超限诊断限制覆盖，不放大预算求干净。helper仅在已证明的返回路径建立守卫，try/catch不是能力守卫。

宿主裸包按Node ESM条件解析exports；exports、ESM相对导入及相对patch精确匹配，旧main/CommonJS按各自Node规则回退，patch优先。常量模块路径须证明绑定、顺序及不可变性，未知条件/动态路径/超限须诊断；require按调用span隔离，动态import不证明异步服务身份。入口inject须证明最终导出归属，对象自有键是服务名，required/optional不是分组。[维护指南](maintaining.md#提取器与探针维护)维护完整语法边界与执行矩阵。

输入用非阻塞描述符、普通文件/身份检查及增量有界枚举，在完整收集/排序前检查预算。普通CLI分析由10秒、512+64MiB worker监督，回收后父线程处理基线；同步run须调用方监督，probe执行另计时。[读取与监督限额](guide.md#日常检查与源码交付)不承诺原子快照、硬实时或RSS。

服务为present/absent/unobserved/unreadable，采样不执行getter；目录缺项、省略键不证明缺失。必需inject未观测仅提示待确认，合格同宿主观测明确absent才推断激活障碍，方法失效另判。现代probe绑定profile/DSH/时间，24小时有效、未来容差5分钟（含边界）；无效时撤回该文件服务/loader证据并说明原因，静态及独立进程内证据另判。旧格式只认显式键，quiet仍一行，boot失败清理自有资源。

### 2.2 结论、影响与基线

- `certainty=certain / suspected`表示证据充分性，`impactBasis=measured / inferred`独立表示影响依据；静态事实确定不等于影响实测。过滤、守卫、弃权另列；API可给真实`file:line`，声明/loader无位置不编造。`vacuous=true`表示ok但无已验证调用，仍须转述coverage及客户端待验证项。
- 可靠映射且启用的FAILED/PENDING loader可形成fatal实测发现；disabled、LOADING、group及无法映射者不能。方法规则优先、服务layer回退，不跨端；provide仅是候选，不得掩盖合格观测中的明确absent。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer，旧目标保留旧策略。非法字段/范围保留风险；peer workspace别名可按当前精确版本处理，engines不可。普通体检的`compatibility.json`仅按插件名/插件及DSH精确版本豁免范围冲突，非法声明不可豁免；坏输入限制覆盖，不证明业务成功。
- 同名安装（含alias/不同版本）拒绝。schema2基线按canonical目标/原观察路径/模式及工具/规则/目录身份隔离，锁内比较、原子写入；失败、不完整、取消或卸载不推进。身份变化中性处理；旧/未知schema、损坏或不安全基线保留原件、不比较或覆盖，并提示恢复。锁目录须当前用户私有，新目录0700，不chmod已有父目录。[恢复流程](guide.md#本地状态锁恢复)只允许显式确认并证明持有者已退出的孤锁，不按年龄或复用PID清理。

### 2.3 报告结构与兼容策略

普通真源`lib/contracts.mjs`：schema1，CLI kind为`plugin-compat-check/result`、HTTP为`plugin-compat-check/report`，tool保留summary/text及report/baseline/cache。身份、计数、发现、退出码须自洽，坏负载拒绝；兼容新增字段，不兼容变更升schema。普通退出码：**0无冲突、1部分可用或未知、2不兼容、3无法判定**；3是工具错误，不是插件结论。

缓存按目标、probe路径与分析/观测身份隔离并single-flight；事件/5秒巡检触发失效，面板2秒轮询、5分钟TTL兜底。最多16目标、闲置10分钟或容量满时按最近请求淘汰，取消任务并释放引用，重访重算；失败保留旧成功及错误，过时任务不发布/写基线。同内核实例普通分析/身份最多2个worker、32项排队，可取消并独立限时；升级清理独立监督。[限额](guide.md#日常检查与源码交付)不承诺跨进程总量或防元数据伪装。

故障报告导出共用模块；`--issue-report`不读写基线且与json/quiet互斥。筛选不裁剪导出，显式复制才写剪贴板；保留包名/包内位置/限制，不导出原始源码、日志、probe、baseline或evidence。分享前预览，不保证任意文本完全脱敏，不自动发帖。

### 2.4 DSH接入要点

UI用`settings.plugins.tab`、`plugins.detail.section / .badge`；`plugins.item`缺可靠身份。预构建客户端经`window.__ModuleLoader__.load({id,factory})`注册，inject为其它客户端包名，宿主不代构建；宿主空inject、tool required为顶层数组、skill用provider。profile不默认desktop；rc.3入口：左下角账号菜单→设置→内置插件→兼容性。

普通体检对DSH≥0.2.1-rc.3选rc.3目录，≥0.2.1-rc.2选rc.2目录，其余/未知选0.2.0-rc.2目录，显式catalog优先；分开显示目标、参考版本/摘要、selection与认证范围。`CATALOG_REFERENCES`只认证登记精确版本与字节，摘要漂移失败，未知/未来/自定义目录不扩大范围；[新目录审查](maintaining.md#api目录候选审查)需来源、差分、规则与真实验收。

HMR撤销注册、计时器和诊断handle，卸载取消计算并按预算回收worker。HTTP报告/预检仅GET、人工保存仅JSON POST，均须`X-DSH-Compat-Request: 1`及本地/完整同源校验；标记不是凭据，不替代宿主鉴权。[HTTP](guide.md#本地http边界)与[执行环境](guide.md#安装与probe执行环境)边界见指南。

### 2.5 有限静态批量契约

`tools/static-batch.mjs`只扫本地第三方DSH包；[schema1 manifest](../test/fixtures/static-batch.json)固定DSH、唯一id、包名/版本/文件树hash。相对路径须安全，拒绝链接/特殊文件、官方包及缺dsh元数据；不下载、安装、执行目标或使用probe/豁免/基线，不跨样本提供服务。

只扫描稳定读取并验hash的私有副本；指纹按POSIX路径UTF-16排序，将`[路径,字节数,文件SHA-256]`列表紧凑JSON的UTF-8再取SHA-256，不含空目录/模式，非签名或原子快照。1–16项顺序执行，清单64KiB；每项4096条目/32层/单文件2MiB/总16MiB/报告96KiB，worker10秒、整批60秒、堆512+64MiB，时间只可降低。

`plugin-compat-check/batch-result`保留发现、coverage/vacuous、弃权、诊断及待作者复核状态；单项工具错误继续其它项，总码错误优先3，否则最重0/1/2。previous仍重扫，仅样本/分析环境/规则/目录/策略预算身份相容才比较，身份变化中性、坏旧输入失败。[手动Action](../.github/workflows/static-batch.yml)只扫固定公开合成样本，Node24、只读/固定Actions、无schedule/用户URL/持久缓存，制品7天，不承诺免费。

### 2.6 真实故障回归与呈现

`tools/real-regression.mjs`固定DSH/目录、五个npm制品及24项业务期望，最多两轮。新私有profile/缓存不复制账户或调用模型；动作前封存预测，真值来自请求/DOM/磁盘。静态/service-only、自然/受控、驱动错误分别计分，回放核对身份、时序、证据及清理；旧driver证据不足，hash不是签名。[真实运行](maintaining.md#真实插件回归)须当次执行授权，限定样本不是生态准确率。

核实建议共用`lib/finding-guidance.mjs`结构化状态，不猜替代API/修复版本、不自动改配置。筛选/折叠/预览/复制不改报告，无可比基线中性提示，目标/时间/缓存状态可见。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`仅支持精确**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，其它版本读输入前退出3，不回退或升级宿主。同组私有字节联合提取一次，再按两端目录/声明判定；双读目录/字节/链接，拒绝同名、特殊文件、变化或超限，保留制品/目录/规则摘要，不承诺原子快照。

捕获/冻结、分析、清理各受worker监督，卸载先终止再清理；捕获256MiB/单文件8MiB/50000项/32层/10秒，分析10秒/512+64MiB，清理独立10秒。清理失败保留主因且不返回成功。无执行目标、网络、运行时/probe/loader、豁免、普通缓存/基线或状态写入；仅合并同目标在途请求，完成重扫。

真源`lib/upgrade-contract.mjs`：schema1、kind为`plugin-compat-check/upgrade-preview`、mode为`static-version-comparison`，状态compared/unsupported-version/error；两报告对应同一输入，changes分added/worsened/resolved/unchanged/improved。顶层只计新增/变重：**0无、1非fatal、2含fatal、3无法预检**，严重度/确定性升高算变重，旧风险保留。ok仅表示比较完成，失败证据为空，baseline/cache为null，coverage/vacuous不可省略。

CLI须nm、当前dsh-version、upgrade-to，仅文本/JSON及无操作no-baseline；拒绝probe/boot、规则/目录覆盖、baseline-file、dry-run、quiet、issue-report、profile。agent当前版本取宿主，返回upgradePreview、普通report为null；面板拒绝过时版本、不同目标并发及坏负载。普通报告重算/正文/输入身份/目标变化使旧预检失效，仅缓存或人工处置修订的重读不撤销。

### 2.8 健康检查、依赖关系与人工处置

- [健康执行器](guide.md#可选功能健康检查)仅仓库提供，默认review，显式run才安装/启动已校验本地USTAR及自有DSH/Chrome；仅HTTP GET/DOM数量断言，无作者脚本、账户或模型。私有profile不是OS沙箱。面板只导入历史JSON，版本相同不证明当前制品相同，不改静态判定。
- [dependencyGraph](guide.md#依赖关系与潜在影响)保留端侧、依赖种类、候选提供者及loader，client包inject另列。声明/路径/环仅是潜在关系，多候选不擅自选定，不证明提供/激活/故障传播；截断须显示，不自动装包或改发现。
- [reviews](guide.md#发现的人工处置)独立保存四态及依据，绑定目标/观察路径/模式、源码、插件/DSH、分析和finding身份，变化后待重审。当前contextToken、锁内合并、原子替换，陈旧/卸载/坏输入不写；不隐藏新风险、改结论/基线或授予豁免。

### 2.9 插件作者CI

`tools/author-ci.mjs`对同一已构建包的只读快照比较认证精确目录，默认上述两版。未知版本、身份及工具错误始终阻断；默认阻断全部发现、未知、覆盖不足及无已验证调用，可显式选严重度/确定性和覆盖策略。all检查全部，new需身份相容的已审查JSON，旧风险保留。

JSON为完整证据源，SARIF 2.1.0/JUnit/离线HTML保留逐版本结果、身份、限制与真实位置；HTML可从同一JSON回放门禁。无效策略保留最后有效策略和原错误；cell紧凑JSON限2MiB，最终JSON、各展示输出及previous/保存输入共用8MiB预算，超限返回完整工具错误，不截断成功证据。策略码与内核码分开，0仅符合所选策略；无安装、执行目标、网络、模型、profile或基线。[用法与信任边界](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留独立行为测试，不伪造实测或重建快照消除失败；版本漂移审查`test/__baseline-versions.json`并单独提交。默认suite仅用只读profile副本；真实安装/执行使用自有资源，清理仅限自有目录/PID组，私有profile不是OS沙箱。环境变量白名单不替代文件/网络隔离；probe复制的profile配置可能含秘密。

README写入口，Plan写契约/待办，指南写操作和限额，维护指南写流程，current-state保留当前事实及有限摘要；完成项移出§6，不逐轮追加流水。`npm run check`统一格式、文档/生成副本、第三方说明、语法矩阵及目录登记核对，完整测试另跑。日志、Python旧参考或工程负例不代替行为验收。提交限任务路径；push、合并、发布和外部发帖分别按当次授权处理。

## 4. 验收范围

源码、候选与公开制品分开。macOS arm64、Linux arm64 VM/x64 CI只对记录的版本/输入有证据，Windows未真实验收；有限业务/受控样本不是生态准确率。历史成功不认证新源码、制品或未来版本，远端状态看对应提交的Actions。

## 5. 验证入口

本地运行`npm test`、`npm run check`；成功TAP可供`tools/doc-check.mjs --test-summary`核对计数。`plugin/scripts/prepublish-check.mjs`只检查、不发布；`tools/meta-check.mjs --json`联网核对GitHub/npm，取数失败不算通过。[完整操作](guide.md#日常检查与源码交付)与[当前证据](current-state.json)分别维护命令和限定结果。

## 6. 后续工作

按急迫性与价值排序，非漏洞评级；沿用证据与一次性远端授权边界。rc.3五项P0已完成，[dc16037的6项checks](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/40099723661)通过；同一tgz的macOS验收、24项真实队列及Linux rc.3执行证据见[current-state](current-state.json)的`rc3Adaptation20261024`与[来源审查](../rules/dsh-0.2.1-rc.3-review.json)。源码未发布npm版本，未合并；不认证未来宿主、任意插件业务或Windows。以下复查项除明确标记完成者外，尚待开发与验收；历史CI不代表本轮源码已通过远端检查。

1. **P1：对齐客户端入口解析（已完成）。** 三个已核验宿主均按字符串或一层字符串default解析`./client`，可交付性、源码图与入口证据共用选择逻辑；无合法入口时保留确定的静态发现并限制coverage。30项回归覆盖browser/import干扰、缺失分支、嵌套/数组、目录及扩展名边界。本轮默认1077项中1069通过、8跳过，维护检查通过。
2. **P1：补齐patch挂载解析。** 用受限结构解析替代首字段name正则，覆盖id在前、行内对象等合法YAML及真实挂载语义；设字节、节点、别名与深度预算。解析不确定须降低coverage，不能静默回退index并给出完整结论；回归漏报样例及非挂载节点。
3. **P1：小规模真实用户试用。** 观察安装→理解→定位，记录误读、失败、误报及分享障碍，衡量定位耗时；优先呈现发现、影响和下一步核实，保留完整证据及coverage/vacuous等限制。下载/star不代替效果，联系/资料收集/公开分别授权，不默认遥测。
4. **P2：修复基线身份与重复发现比较。** 保留加载入口及发现的稳定身份，以多重集匹配重复发现，避免Set去重与首项匹配吞掉新增失败；特殊包名不得被普通对象原型键吞掉。回归同包多入口、重复增删、等级/确定性变化及无变化稳定性。
5. **P2：转义终端不可信文本。** 对人类可读报告中的文件名、包名、位置及备注等统一转义ESC、C0/C1控制符与双向文本控制符，防止清屏、遮蔽和伪造显示；保留可定位路径、JSON身份及既有导出隐私边界，增加真实文件名与元数据回归。
6. **P2：收紧剩余同步输入边界。** 加固functional-health制品读取的检查后替换窗口，以文件描述符、身份核验、非阻塞/拒绝链接和实际字节预算约束读取；将验真纳入总超时监督，覆盖超限增长、FIFO替换及失败后恢复。根规则同步读取也纳入预算；验真失败不得安装，不放宽现有限制。
7. **P2：强化rc.3真实验收后置条件（已完成）。** Plugins核对活动主面板与可见列表，New Session预先解析目标并核对选中会话、布局与草稿；三处Create实点并验证各自提示、目标、引用及附件。17项受控回归覆盖空操作、错误目标/提示、丢失内容、意外发送、默认预设差异及持有失败清理。2026-10-24 macOS rc.3完整制品实跑通过（SHA-256 `ed474fa2514ab161723314cc24f5b9f65f987d41a82e1a835c5a3e5ac7f23b1a`），生产模型请求0、临时profile已清理；富草稿目标显式持有并finally释放，不认证已销毁输入的附件恢复，空标题/折叠不作为激活失败。
8. **P2：统一状态目录权限策略。** 统一锁、基线与review存储的目录检查，消除已有0755目录一处拒绝、一处隐式chmod的差异；新建私有目录0700，已有不安全目录给出诊断与显式恢复入口。回归共享目录场景，不隐式改动已有父目录或借用目录权限。
9. **P2：跟进上游验收。** 2026-10-24只读核对公开状态：dsh-market#932已关闭，先前维护者说明1.66.43增加packument回退，双查询均失败时告警/安全失败仍是独立后续；1024#22仍open，待npm安装方式可用后全新实装；0xsline#717仍open未合并。有变化再复验，不重复发帖，补充另取授权。状态核对不代表新版本源码或安装已验收，记录见[current-state](current-state.json)的`upstreamStatus20261024`。
10. **P2：Windows真实验收（依环境条件暂缓）。** 环境具备后实跑路径、安装器、回收、权限、打包/诊断及自有资源清理；完成前保留未验收边界。
11. **P3：统一文档版本事实与证据归档。** 修正本计划2.9仍称默认两版的过时表述，以生成或语义检查同步README、guide、skill和作者示例的三版本集合；区分检查器、宿主和未发布源码版本。压缩current-state近16KiB上限的历史证据并保留Git定位，不放宽文档预算。
12. **P3：扩展参数与生命周期语义覆盖。** 基于固定宿主源码、文档和真实回归，逐步补充参数、选项、弃用及生命周期提示和版本基线；区分确定性、推测与业务影响，证据不足不新增致命规则。真实宿主、Windows、账号或模型场景分别验收与授权，不自动认证未来版本。
