# 开发计划与维护约定

更新于2026-10-20。已发布版本为0.1.3；仓库源码已补服务前提度量、Origin同源校验、npm子目录元数据及工程回收/Chrome诊断，公开npm0.1.3不包含这些修订。补丁源码已由[PR #6](https://github.com/lcy0121/dsh-plugin-compat-check/pull/6)合入main，合并提交1c7e12a的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39257051964)四项通过；暂不发布新版本，后续见§6。本文维护现行契约、交付边界与待办；用法见[README](../README.md)，逐次证据见[docs/current-state.json](current-state.json)。原始审计已归纳到§4并从当前目录删除；[旧提取器反例](extraction-findings.md)保留历史身份，施工过程查Git历史。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，呈现依据、源码位置及覆盖限制；声明放行、激活成功、客户端到货均不单独证明业务功能正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、兼容性标签、插件详情发现/角标、tool与skill。体检不联网、不装包、不启动外部命令；使用分析worker并写自身基线 |
| 仓库CLI / 安装检查 | 默认静态扫描不执行目标源码；显式probe/安装检查会装依赖、启动宿主并执行目标插件。临时profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定 |

**0.1.3于2026-10-18发布到[npm](https://www.npmjs.com/package/dsh-plugin-compat-check)，latest已更新；[GitHub Release](https://github.com/lcy0121/dsh-plugin-compat-check/releases/tag/v0.1.3)附同一tgz。** 发布源提交ada1d78，新旧DSH Linux及Node22/24的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39133915275)通过。公开tgz与验收制品37文件逐字节一致，公开npm规格实装/启动exit0，覆盖仍有限；见`verification.release013`。0.1.3发布源码及其发布后文档的历史交付入口为[PR #5](https://github.com/lcy0121/dsh-plugin-compat-check/pull/5)，最终合并状态与记录提交CI以该PR为准。0.1.1/0.1.2和PR #3/#4保留在current-state的对应历史记录，不代表当前算法。

版本真源为`lib/version.mjs`。仓库根是private开发工作区，npm仅打包`plugin/`，没有CLI bin、安装shell或probe入口；不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约、暂存kernel与LICENSE，postpack清理kernel；安装完整tgz，不假定裸`plugin/`含内核。市场截图声明位于`plugin/screenshots.json`，图片在`plugin/assets/`；当前npm files未收录二者，README使用GitHub图片链接。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、包内源码图、词法绑定及逐调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式。其它profile不能借用当前宿主服务。
- 服务为`present / absent / unobserved / unreadable`；必需inject未观测仅提示激活前提未确认，不把静态目录缺项当作缺失；同宿主明确缺失才推断激活障碍，方法缺失单独判断。省略键、目录缺项或未知getter不等于不存在。现代probe绑定profile/DSH版本/时间，默认24小时过期；旧报告提示未绑定，仅用明确键；采样不执行getter。
- 支持有界常量键/解构、同步参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名及调用、空handler透明Proxy。变更/遮蔽/逃逸会撤回证明；未知键、trap、异步、递归、复杂控制流和default/rest参数保守合并或弃权。
- 上限：256次相关调用、16层调用、32层导出链、64节点闭包图、128节点逃逸图、512次常量调用、8192字符展开，另有扫描文件/字节/目录/时间预算。超限、解析或读取诊断限制覆盖，不以加预算或删调用点求干净。

### 2.2 结论、影响与基线

- `certain / suspected`表达确定性，过滤/守卫/弃权另列；`impactBasis=measured / inferred`区分实测与推断，缺少字段不能反推实测。API发现通常有`file:line`，声明/loader事实可无源码位置，不编造。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现，disabled、LOADING、group或无法映射不冒充该事实。0.1.3对DSH≥0.2.1-rc.1优先自有engines.dsh，缺失时回退官方peer；旧目标保留旧规则。非法字段、空/非法范围有诊断；peer workspace:^/~/*按当前精确版本处理，engines不接受该别名。声明冲突/非法字段为declared-incompatible及推断影响，不能等同实际加载失败（宿主可能跳过bundle后继续启动）。
- 只读目标profile独立compatibility.json，插件名/插件精确版本/DSH精确版本全匹配才豁免范围冲突。无效记录整条忽略，其它有效记录仍用；非法字段不可被豁免。不可读、非普通文件、JSON无效或超64KiB则豁免未观测并限制覆盖，不自动授予。获豁免不证明API或业务成功。
- 方法layer优先、服务layer回退，不跨端套规则；provide仅为线索，未知方法影响写“影响面未知”。try/catch不是能力守卫；coverage.status=limited、vacuous及客户端未验证须转述，ok不等于功能认证。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离；锁内比较、原子写入，不完整扫描不推进。身份升级记中性，严重度/确定性/位置参与差分；schema1或损坏条目不比较。“无变化”不等于兼容。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是运行时/JSDoc真源；CLI为`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP为`kind:plugin-compat-check/report`的envelope，tool保留summary/text及完整report/baseline/cache。必需字段、摘要/严重度/退出码/span/身份须自洽；面板拒绝损坏负载。允许新增字段，不兼容变更须升schema。

仓库CLI新增`--issue-report`，基于同一canonical结果输出Markdown，不读写基线，与json/quiet互斥。保留版本、观测模式、发现、可用位置、certainty/impactBasis、覆盖及占位符复现命令；原始错误/日志/探针/evidence、源码片段和基线不导出。含路径、链接、常见凭据或控制字符的说明整项隐藏，非法/绝对/穿越位置隐藏，无位置如实说明；仍保留插件名与包内相对文件名，用户须预览。它不自动发帖，也不保证任意业务文本完全脱敏；原退出码保留。

退出码：**0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定**。安装器另有gate-rejected等包装状态，网络/安装/启动错误不是插件结论。生成的宿主契约和客户端内联校验由`stage-contract.mjs --check`防漂移；同目标计算single-flight，失败刷新保留最近成功报告及错误，缓存呈现体验不冒充业务验收。

### 2.4 DSH接入要点

- UI接入口为`settings.plugins.tab`、`plugins.detail.section`和`.badge`；`plugins.item`缺可靠身份。客户端导出预构建`window.__ModuleLoader__.load({id,factory})`，inject声明其它插件包名，宿主不代构建。
- loader entries可迭代，entry id映射包身份；0–5为PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING。import失败可无fiber，不能靠`fiber.await()`或受inject限制的store取得全部原因。
- 本插件空inject避免体检自身因缺服务挂起；工具required为顶层数组，skill须运行时注册provider。按实际启动参数解析profile；缺少某个settings方法不外推整个服务。

**rc.2适配：** 保留旧目录，DSH≥0.2.1-rc.2选择新目录（host98/291方法、client8/43），其余/未知用旧0.2.0-rc.2目录，CLI显式覆盖优先；未来版本未认证。ASAR偏移修为8+headerSize，头/边界/JSON/原始字节及摘要与Electron互证。新host8项、移除invariants及subagents等方法变化已审查；不按名字迁移严重度，旧规则保留原调用依据，未知影响继续回退。未整体重写AST/worker。

2026-10-18完整候选tgz在私有rc.2宿主/真实Chrome显示“更多 → 设置 → 内置插件 → 兼容性”，报告可见。59714e7记录的10月17日标签未显示本次未复现，不推定原因为入口或槽位删除。实际禁用/重启用验证路由移除/恢复及标签唯一；修复route/tool/skill disposer未归还、旧代计时器/诊断handle残留及在途报告卸载后写基线的问题。分析worker仍受原预算回收，不声称立即取消。子路径元数据经官方实现验证，不借根manifest补名称。证据见`verification.rc2TargetedAdaptation`。

## 3. 开发与文档维护约定

1. 先复现再修改，保留未知/弃权与覆盖诊断；不以测试自洽代替目标行为，不编造归属、影响或实测。
2. 不重建快照消除失败；版本漂移须审查`test/__baseline-versions.json`并单独提交。默认suite共享测试专用只读profile副本，单文件自行捕获，提取与源码回读用同一份字节。两次观测不一致报`PROFILE_SNAPSHOT_UNSTABLE`，超预算报`PROFILE_SNAPSHOT_BUDGET`；不重试、不交付半份输入，未安装profile明确跳过；这不是OS原子快照。
3. 分析使用有预算worker，只清理自有目录/PID组。安装检查克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径、保留远程pins，拒绝不支持格式及不安全链接，不改原profile。
4. 从私有源码副本打tgz、空缓存安装并调用；文件存在、日志干净或到货不证明业务成功。默认10秒/512+64MiB worker预算、1秒工程超时负例与总流程<5秒分别维护，Python parity仅为旧参考。
5. 本地可提交；push/合并/npm发布及对外发帖分别取得授权，只stage本项路径，不用`git add -A`。README写用法，Plan写契约/状态/待办，current-state写证据，历史文档保留日期；同步skill/契约副本，不逐轮新增总结文件。

## 4. 已完成的关键工作

2026-10-14原始审计以4722716、npm0.1.0为基准；其14项正确性问题（B01–B14）及3项安全问题（S01–S03）已完成对应整改和回归。核心修正为：区分未知/缺失与宿主/客户端，以词法AST和逐调用span取代正则猜测，将loader、profile、错误、原子基线与跨通道报告纳入一致契约。采用渐进重构，动态与超预算路径继续弃权，不追求全程序证明。完整原文保留在[归档提交](https://github.com/lcy0121/dsh-plugin-compat-check/blob/1c7e12ad8c549dd2d60734108ff3080c70431af7/docs/GPT审计及重构方案文档.md)，不再作为现行文档维护。

安全整改分别为私有输出目录/拒绝不安全链接（S01）、自有Chrome继承管道替代可预测CDP端口（S02）、规范包内路径及扫描/worker预算（S03）；临时profile仍不是OS沙箱。原扫描为3项medium、源码验证、覆盖partial，未执行跨用户攻击或确认远程接管；历史凭据轮换不在旧审计范围，不能把回归通过等同全量安全认证。扫描ID及归档摘要见`verification.auditArchive20261019`。

后续已完成P0集成、P1标签真值隔离/规则质量/契约稳定、有界P2分析与工程验证。规则复核保留readImage实际读取路径和sessions.open旧回退，移除getSnapshot/settings.get/sessions.map无依据影响；sessions.refresh不补无依据规则。库存仍是partial样本，不以调用数或历史覆盖率代替准确率。

独立业务预测按固定制品、静态API目录和手审功能区间提前封存；不读业务/loader答案。完成请求、目标DOM与独立磁盘数据决定真值，驱动错误与无法建立的故障对照单列。当前仓库队列：

| 固定制品 / 路径 | 真实病例与结果 |
|---|---|
| dshmarket1.66.37备注/收藏 | 正常/恢复TN4；503、操作前/保存后目标控件移除FN6。加载就绪独立于控件存在，其他卡片不能冒充目标值；自然缺控件记业务失败 |
| dsh-better-sidebar0.28.0 HTTP | UTF-8 BOM/UTF-16LE、CRLF保存/预览及恢复：TN4，503对照FN2 |
| 同版真实编辑器UI | 实际CodeMirror输入、保存和新文档重载，原始字节核验：TN4，503对照FN2；脏页仅在自有测试页显式放弃修改后重载 |
| dsh-better-sidebar0.26.1编辑器UI | 无注入，两例文件树HTTP405、无可用编辑动作且磁盘未变，功能风险FN2。另查loader等待webRuntime，0.28.0改用connection；不以loader决定业务真值，不断言故障最初引入版本 |
| 0.28.0侧边模型对话 | 经用户授权，配置账户deepseek-official/deepseek-flash、off；最终两条短回复TN2，独立v4日志及重载后assistant DOM一致。工具强制禁用，全局最多两个首步，无重试/自动标题，每步输出上限256token |

上一轮模型调试及最终验收共6条成功回复，回执合计输入10989/输出73token；最终两条为输入909/输出25token，非账单认证。

自然失败边界已查明：0.26.1顶层必需`webRuntime`在rc.2/web中明确缺失，激活前提与编辑方法失效不是同一事实。新增`--observe-services`仅用于两个live编辑器suite：动作前封存同profile、版本、时效绑定的根服务描述符，重建方法形状并剔除loader/业务字段；单独身份和摘要的服务观测队列旧版TP2、新版TN4、FP0，原静态FN2及503对照FN2不改。保持0.26.1包字节不变，仅在独立诊断宿主提供`webRuntime.trustedHosts=[]`后两例实际编辑/字节保存均恢复；该控制不进入产品特判、不冒充自然样本或通用修复。回放保留服务观测来源，未知仍不能推出缺失；见`verification.naturalFailureBoundaries20261019`。

这些固定/探索性样本不是盲测、生态准确率或完整模型质量认证；不调严重度消除漏报。合成空闭合turn仅让官方工作区显示自有会话，不提供模型回复真值。原始CLI市场/编辑器及旧版对照均exit1，模型本批exit0；保留原始错配。历史阶段见`verification.independentBusinessTruth`、`businessSampleExpansion`，编辑器/模型阶段见`marketUiAndBusinessExpansion`。


可选profile输入隔离已由[PR #4](https://github.com/lcy0121/dsh-plugin-compat-check/pull/4)交付；9项隔离回归、本机Node22.19/26.12默认各491/491，合并提交ec6f06a的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39033059918)通过Node22/24及Linux真实DSH。只适用于各自输入/日期，不认证后续源码或其它宿主版本。

**分发状态（2026-10-20复核；最新证据见`verification.upstreamFollowup20261020`，前轮见`verification.upstreamAcceptance20261020`）：**

| 对象 | 当前结果与交付 |
|---|---|
| 主目录 / dsh-market | 公开索引和详情映射npm0.1.3。10月20日真实Chrome、rc.2/web、公开dshmarket1.66.43全球线路空profile安装并运行0.1.3，认证HTTP报告及37个公开tgz文件一致；本次未捕获首次latest请求，不冒充故障注入。10月19日1.66.37中国大陆线路全新安装/升级成功、全球首轮装入0.1.2的失败仍保留 |
| 版本解析与终端提示 | 主目录[PR #8057](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/8057)的双语简介已同步公开索引和详情。[#931](https://github.com/dsh-market/dsh-market/issues/931)已关闭、修复发布于1.66.44；确切发布函数10例及真实Chrome/rc.2安装确认窗验收通过，不再误称终端插件，本轮取消安装。[#932](https://github.com/dsh-market/dsh-market/issues/932)的packument回退在1.66.44精确helper的6例受控检查仍成立；两端均失败/无有效版本仍允许裸名安装，静默风险未全消除。早前1.66.43的误提示与实装证据保留；市场把`#plugin`目录末级当成标题，导致显示为`plugin`，已提交[PR #948](https://github.com/dsh-market/dsh-market/pull/948)，改为优先映射的npm包名，待发布后验收 |
| 1024 Store | 目录[PR #628](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/628)已合并；10月20日v2仍仅GitHub unknown/not_checked方法，没有npm方式。[#22](https://github.com/imsai-sh/dsh-1024store/issues/22#issuecomment-6260932365)仍开放，暂无维护者回复。登记schema拒绝npm/path字段，须维护者核对完整id、外部D1采集及KV投影，出现npm方法后再实装，不重复登记或用源码子目录替代完整tgz |
| dshworks / bruc3van | dshworks[PR #169](https://github.com/dshworks/awesome-dsh-plugins/pull/169)已合并。bruc3van[#138](https://github.com/bruc3van/awesome-dsh-plugin/issues/138)已关闭并收录，旧排除理由已移除；readme/manifest核验不是运行时认证 |
| 0xsline Awesome | 10月20日[PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)仍开放、无评论、未合并；已有修订，不重复发帖 |

显示名修复在dsh-market临时副本完成：相关318项及Node24完整2556项通过，类型检查和构建通过，已授权提交PR；Node26的两项路由失败及166项undici错误在未修改基线复现，保留为运行环境对照，不写成通过。不需要改本插件包名、重命名`plugin/`或发布本插件新版本；公共展示仍待上游发布，证据见`verification.marketDisplayName20261020`。

公开0.1.3缺少`repository.directory`，main源码已补`plugin`，原1024绑定函数由mismatch变strict；当前公开投影不以此隐藏npm方法，不能声称此字段已解决采集故障。Origin修复要求协议/主机/有效端口完全同源，保留本机无Origin调用；确切本地tgz真实宿主验证同源200、跨端口403。这两项待下一补丁候选交付，不改变公开0.1.3的历史证据。10月18日市场0.1.2验收、定时复查及其它旧渠道快照保留在current-state；源码子目录与完整tgz不等价，备用GitHub回退仍未认证。

宣传仅保留可核验事实：HTTP 200不等于收录，下载不等于用户，star不代表兼容性；“故障时被想到”是待验证的定位假设。删除“唯一自动增长渠道”“纯链接转化近零”“每个rc后24小时普查”等未经验证或尚无资源保证的断言。其它市场按其npm/子目录/制品规则评估，不给private根包添加虚假bundle声明，也不从根扫描限制推出所有合规入口都不可能。

工程故障诊断与回收证据已补齐：Darwin真实对照复现“全组仅Z仍返回EPERM”与“内核Z先于Node exit事件”两种边界，新版联合现场也抓到后者的原栈/UID/PGID/状态。仅在有界确认实际退出后，完整快照为同UID全组Z或组已消失时接受停止；活进程拒绝/不可读仍失败。命令和probe同时保留原始/清理错误，清理失败保留私有workDir，不再未处理拒绝或宣称删除成功。Chrome先做Browser.getVersion握手，区分建页、附加、会话、EOF/退出/超时，记录有界元数据及可选私有stderr；仍用自有fd3/4，不加生产超时或重试。多个资源均尝试清理，CI已配置失败诊断留存。[Darwin信号源码](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/kern/kern_sig.c#L1548-L1624)与本机复现互证。历史Linux Target.createTarget原日志缺少Chrome/管道信息，不能追认具体Chrome根因；已用阶段负例和真实Chrome暂停对照验收诊断及回收，不以重跑代替修复。证据见`verification.engineeringDiagnostics20261019`。

源码交付由[PR #6](https://github.com/lcy0121/dsh-plugin-compat-check/pull/6)跟踪：e0b487c的[push CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39254428390)与[PR CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39254434881)共8项通过，覆盖Node22.19/24.21默认闸门及资源检查、Linux旧DSH 48通过/4不适用、新rc.2 52通过。首轮Node22因测试清场等待已unref子进程而取消，已单例复现并在夹具最终清场前ref，生产回收策略未改；首发失败保留。后续文档提交的单轮rc.2 CI另暴露旧编辑器恢复标签为div、驱动只找button的边界；已留存失败页面并做真实Chrome红/绿对照，改为优先已有可见文件标签，0.26.1实跑仍保留静态FN2/服务TP2及两例HTTP405，不改业务判据。最终788e149的push/PR共8项通过；已合入main提交1c7e12a，合并[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39257051964)四项通过，旧DSH 49通过/4不适用、新rc.2 53通过；不套用前一提交的通过。见`verification.sourceDelivery20261019`。本轮不改版本、不创建tag/Release、不发布npm。

2026-10-19文档精简提交fffec7f的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39260114242)为3/4通过：Node22/24及旧DSH通过，rc.2市场业务宿主中Chrome的Browser.getVersion握手10秒超时（收到0字节）。结构化诊断及私有stderr已留存，清理成功；D-Bus提示不足以证明根因。此为新工程失败记录，不是文档/判定算法失败，也未以重跑、加超时或弃用例冒充修复；待排查见§6。

2026-10-20 Linux Chrome补强：无响应会话D-Bus的真实单变量对照已完成，Linux自有无头Chrome仅隔离该子进程的会话总线；父环境、系统总线、sandbox、生产命令预算和重试策略不变。诊断新增有界进程/线程状态、调度计数、等待位置及父进程CPU/事件循环/计时器延迟，保留未知、读取失败和截断。本地Linux/macOS检查点见`verification.linuxChromeStartup20261020`，不追认原fffec7f的10秒超时根因。

远端精确验收：4d0ba08的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39395590460)四项通过，DSH0.2.0-rc.2/0.2.1-rc.2的Chrome预检各11/11，旧版联合49通过/4项不适用、新rc.2联合53/53，Node22/24默认闸门与六项资源指标通过。此前2秒夹具启动预算失败、c52f652阶段通过及ba82dc6在更新runner上再次10秒握手失败均保留；后者现场为`D / folio_wait_bit_common`，不能据此锁定存储根因。CI现独立读取/校验预装Chrome及链接库再执行原协议预算，无预启动或重试；341文件约495/497MB准备耗时8.04/9.89秒，随后首次协议就绪0.66/1.58秒。两种实测镜像/Chrome的暂停负例均核验`T`状态、同一进程身份及成功回收；这属于输入准备后的验收，不是冷缓存性能保证。完整环境、失败和制品摘要见`verification.linuxChromeCiAcceptance20261020`、`verification.linuxChromeInputPreparation20261020`。

## 5. 验证记录与复现

### 5.1 已验证范围

| 证据 | 范围与限制 |
|---|---|
| DSH0.2.0-rc.2 / macOS | 实际tgz、tool/skill、面板/详情/角标/基线、Chrome正负例；联合22项含9项真实DSH/Chrome/pnpm，未发送模型对话 |
| Linux | arm64 VM：Node22/24各406通过、1项外部profile缺失跳过，联合各18通过；x64 CI精确提交见current-state。联合18项含4项真实DSH、1项冻结pnpm安装、13项离线 |
| DSH0.2.1-rc.1 | 工具0.1.2实际tgz有限集成7/7（探针2、HTTP1、Chrome到货/错误4）；不是全面业务、rc.2或新一轮手动面板认证 |
| 0.1.3候选 / rc.2适配阶段 | Node24.19/26.12默认各515/515；rc.2联合19/19含5组真实声明病例、官方子路径元数据、tgz/HTTP、Chrome导航及禁用/启用；旧DSH0.2.0-rc.2联合19/19中rc.2专项明确不适用。两项复核P2已修，无模型/第三方业务/Windows认证；该阶段尚未跑新远端CI，最终发布CI另列；证据见current-state |
| 独立业务队列 / 首轮 | Node24.19/26.12默认各526/526；专项12/12含真实Chrome中备注/收藏四病例及取消回收。正常组TN2、503对照组FN2；离线回放保留exit1，缺病例exit3。两项重要审阅问题已修，该阶段尚未跑新远端CI，最终发布CI另列；见`verification.independentBusinessTruth` |
| 业务扩展 / 0.1.3发布前 | Node24.19/26.12默认各529/529；业务专项17/17（14离线、两组真实插件、1项真实Chrome边界）；最终rc.2联合36/36（含原19项）；本地旧DSH联合35项中33通过、2项rc.2业务明确不适用；最终Linux旧版矩阵新增浏览器边界项后为34通过、2跳过。确切0.1.3 tgz实际安装/启动exit0，覆盖仍有限。发布前闸门通过；见`verification.businessSampleExpansion`、`verification.release013` |
| 编辑器/模型扩展检查点 / 2026-10-19 | Node24.19/26.12默认各540/540；rc.2联合51/51；旧DSH联合51项中47通过、4项rc.2业务明确不适用；显式真实模型专项1/1（两条回复）。本地macOS arm64；新远端Linux/Node22及Windows未认证。见`verification.marketUiAndBusinessExpansion` |
| 边界/分发阶段检查点 / 2026-10-19 | Node24.19/26.12默认各550/550；rc.2联合52/52；旧DSH联合52项48通过、4项rc.2专项不适用；确切本地tgz Origin专项1/1；公开0.1.3真实市场安装/升级及37文件核验。无新模型调用，无新远端CI/Windows认证。一次新版联合probe报kill EPERM，隔离2/2与完整重跑52/52通过，原因未证实，保留首发记录；见本轮两项verification |

本轮工程诊断：Node24.19/26.12默认各561通过；rc.2联合73/73，旧版联合73项69通过、4项rc.2专项跳过；含真实Darwin僵尸组、三条CLI拒绝/目录保留及client-arrival正负例。真实Chrome12/12次启动（3并发、4批，无重试）与暂停后超时回收负例通过；发布前闸门通过。这是本地工程阶段检查点；后续远端Linux/Node22验收见上述源码交付记录，Windows仍未认证。详见`verification.engineeringDiagnostics20261019`。

辅助标签独立于预测；四个固定病例TP1/FP0/FN1/TN2（精确率1、召回率0.5）暴露漏报，不是生态准确率。P2的21例归属反例TP0/FN14→TP14/FN0、FP为0，另4例未知有诊断，只评价该队列。默认suite不代替真实集成，旧skill正文/旧CI不追写成新认证，所有阶段数字以对应记录为准。

### 5.2 日常检查与真实集成

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

文档检查不递归跑测试，发布闸门复用一次完整默认suite摘要；空缓存tgz安装需registry联网。更改真源后运行`node plugin/scripts/stage-skill.mjs`与`node plugin/scripts/stage-contract.mjs`并审查副本。真实集成显式设`DSC_SLOW=1`，运行probe-boot、labels、client-arrival测试，需要DSH/pnpm和Chrome（可设`DSC_CHROME`）。辅助文件度量同时提供`--probe`和`--labels`；帮助见`node tools/labels.mjs --help`及shell入口`--help`。

rc.2定向真实回归（会联网安装、启动自有宿主和Chrome；不调用模型）：

```bash
DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
# 仅配好相应版本的dsh/pnpm后运行；旧DSH由其它live用例覆盖，rc2专项明确不适用
DSC_SLOW=1 node --test test/probe-boot.test.mjs test/labels.test.mjs test/engineering-live.test.mjs test/profile-lock.test.mjs test/rc2-live.test.mjs
```

独立业务度量（仓库开发工具，不进入npm插件或默认面板；需DSH rc.2、pnpm和Chrome）：

```bash
node tools/business-labels.mjs --live --suite market --out-dir <空市场证据目录> --json
node tools/business-labels.mjs --live --suite sidebar --out-dir <空HTTP证据目录> --json
node tools/business-labels.mjs --live --suite sidebar-ui --out-dir <空编辑器证据目录> --json
node tools/business-labels.mjs --live --suite sidebar-ui-previous --observe-services --out-dir <空旧版证据目录> --json
# 仅明确同意使用真实账户时运行；当前限deepseek-official，来源profile不修改
node tools/business-labels.mjs --live --suite sidebar-model --model-profile <已配置profile目录> --out-dir <空模型证据目录> --json
# 回放同批次封存的预测及标签；不启动宿主、不联网
node tools/business-labels.mjs --predictions <预测.json> --labels <业务标签.json> --json
DSC_SLOW=1 node --test test/business-labels.test.mjs
```

`--observe-services`同时保留原静态预测与独立服务观测预测，额外输出`service-predictions.json / service-labels.json / service-observation.json`；分别用同一回放命令评分，服务队列不会覆盖原静态退出码。只接纳动作前的根服务形状，不读loader或业务标签；旧版服务缺失可提示激活障碍，不能据此预测任意功能、网络、数据或模型故障。

度量退出码：0=已计分且无错配，1=有FP/FN或不计分项，3=输入/驱动错误或无可计分项。回归suite验证如实暴露漏报，不要求度量改绿。市场使用单条公开记录的本地目录，不重复认证公共安装；侧栏使用自有工作区/官方会话。`--out-dir`须为空，成功写预测、标签、度量和截图，失败可能留诊断；私有profile、凭据副本与进程均清理。浏览器固定zh-CN，官方credentialOnboarding=false关闭引导，不认证默认引导。只有显式模型suite会读取来源配置并复制所选凭据；默认、慢测和CI均不调用模型。模型回执usage为截至该行的累计值，不逐行相加；request/header数量不是调用次数。

所有live业务队列仅认证rc.2，旧DSH明确不适用。文件回放检查同批身份、制品/预测器摘要、完整病例与时间先后，不提供防协同篡改签名。0.1.3发布源ada1d78的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39133915275)只认证当时源码；后续工具的远端CI以`verification.sourceDelivery20261019`及PR #6的确切提交为准，不能借历史通过代替。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test --test-reporter=tap test/engineering-live.test.mjs test/profile-lock.test.mjs
```

工程故障复现（本地夹具；DSC_SLOW额外编译C夹具核验Darwin真实僵尸组，缺编译器明确跳过）：

```bash
node --test test/owned-process.test.mjs test/debugger.test.mjs
DSC_SLOW=1 node --test test/owned-process.test.mjs test/debugger.test.mjs
DSC_EXECUTION_DIAGNOSTICS=<私有诊断目录> node bin/compat-check.mjs --nm <目标node_modules> --probe-boot --json
```

`DSC_EXECUTION_DIAGNOSTICS`只在故障时可选写入0700目录/0600 JSON，拒绝symlink目录；失败JSON保留`diagnostics`，probe在`inputs.probeBoot`下，并标注落盘失败。Linux Chrome失败还保留最多32线程、每文件4096字节的状态/调度/等待位置；计数为内核原始累积值，须核对进程起始身份及`sched_schedstats`是否启用，零计数或`wchan=0`不证明未等待。父进程计时器延迟/CPU仅是该父进程的证据，不能直接归因Chrome。普通诊断不包含argv/env或stderr正文；可选私有文件保留限长、脱敏stderr。诊断文件不是自动可分享报告，仍需预览。受控负例也会产生诊断，CI成败以对应TAP/退出码为准。真实回收失败保留workDir及PID/组归属，不能按进程名清场或盲删仍在用的目录；多个资源失败保留原始错误并尝试其余清理。

覆盖2402文件/约50MB预算弃权、受控超时、32MiB与默认提取器堆耗尽/恢复、64请求single-flight、8进程192次基线争用/原子读取；旧宿主4000函数/3并发刷新期间仍可响应。超时分别检查等待/总流程、停止后计数不增长及恢复。只证明限定版本/输入的工程行为，不是全进程RSS、任意脱离进程组隔离或生产性能保证。

## 6. 后续工作

服务前提/分发交付及本轮工程诊断已完成实现与验收，源码交付见§4；上游采纳与商店私有采集尚不受本仓库控制，以下继续保留为可验收事项：

1. **下一补丁候选（暂缓）。** 用户决定发布后，再准备候选，纳入Origin端口校验、激活前提说明、npm目录元数据及工程诊断；核对确切制品后另取npm发布授权。公开0.1.3不追写为含这些修复。
2. **上游验收（10月20日更新）。** #8057公开简介同步与#931正式1.66.44终端误提示修复已验收，移出待办。余项：市场显示名[PR #948](https://github.com/dsh-market/dsh-market/pull/948)待采纳发布，随后验卡片与安装窗显示`dsh-plugin-compat-check`，不改目录身份或安装目标；#932双端查询失败仍裸名安装，待明确告警或安全失败后验收；1024#22仍无npm方式/维护者回复，待采集投影修复后实装；0xsline#717仍待采纳。1.66.44本轮只验安装确认窗，全球全新安装0.1.3仍以先前1.66.43记录为准。无新证据不重复发帖，任何新对外补充另取授权。
3. **有限批量与自动化（后置）。** 先验证固定哈希样本的静态JSON聚合、限制及“待作者复核”，再评估低权限Action、逐版增量与摘要。工具错误/覆盖不足单列，不默认写第三方仓库、不承诺24小时SLA；公共端点先确认隐私、缓存与维护成本。固定业务队列不是盲测；扩展插件或复杂模型任务须另定制品、资源与独立真值。
   Perch语义规则仅作为可选评估：恢复文件标签行为已有真实Chrome回归，移除复用的隔离反例会失败；须先证明增量收益、核清权限/源码数据处理/费用，再决定是否试用，不能替代浏览器验收。详见`verification.semanticRuleAssessment20261020`。
4. **Windows真实验收。** 取得环境后实跑路径、安装器、回收和打包；按用户选择暂缓，不用POSIX或模拟充数。
