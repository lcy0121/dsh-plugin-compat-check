# 开发计划与维护约定

更新于2026-10-17，适用于0.1.2文档补丁；运行判定仍沿用0.1.1。本文维护现行契约、验证边界与待办；用法见[README](../README.md)，统计和分阶段证据见[docs/current-state.json](current-state.json)，详细施工过程查Git历史。[原始审计](GPT审计及重构方案文档.md)与[旧提取器反例](extraction-findings.md)保留历史身份，不作为当前缺陷清单。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，报告依据、可定位的源码位置和覆盖限制；声明放行、激活成功、客户端到货都不能单独证明业务功能正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、面板/详情角标、`compat_check`及skill provider；体检不联网、不装包、不启动外部命令，使用分析worker并写自身基线 |
| 仓库CLI / 安装检查 | 默认静态检查不执行目标源码；显式probe/安装检查会装依赖、启动宿主并执行目标插件，临时profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定逻辑 |

2026-10-17：**npm latest=0.1.2，文档补丁已发布并回下载验收**；旧发布状态文案已在新包去除，判定算法及规则数据与0.1.1一致。GitHub交付见[PR #3](https://github.com/lcy0121/dsh-plugin-compat-check/pull/3)，源码5af2550及最终记录提交各按对应CI核验；发布哈希、README/依赖/skill比对见current-state的`verification.documentationDelivery012`。0.1.1与旧现场记录保留原日期，不追写为新认证。

版本真源为`lib/version.mjs`。根目录是private开发工作区；npm只打包`plugin/`，没有CLI bin、安装shell或probe入口。`prepack`同步skill/契约并暂存内核与LICENSE，`postpack`清理暂存内核；应安装完整tgz，不能假定裸`plugin/`已带kernel。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、有界包内源码图、词法绑定和逐调用span区分真实Context与同名猜测；host/client/shared分端。静态、文件probe、进程内观测使用独立证据模式；其它profile不能借用当前宿主服务。
- 服务为`present / absent / unobserved / unreadable`；省略键、目录缺项和未知getter均不等于不存在。现代probe绑定profile/DSH版本/时间，默认24小时过期；旧报告只用明确键并提示未绑定，采样不执行getter。
- 已支持常量键/解构、同步参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名与调用、空handler的透明Proxy。变更、遮蔽、逃逸及handler变化撤回失效证明；未知键、trap、异步返回、递归、复杂控制流和default/rest参数保守合并或弃权，不猜归属。
- 上限为256次相关调用、16层调用、32层导出链、64节点闭包图、128节点逃逸图、512次常量调用和8192字符展开；扫描另有文件/字节/目录/时间预算。超限/解析/读取诊断保留并限制覆盖，不靠提高worker预算或删调用点求干净。

### 2.2 结论、影响与基线

- `certain / suspected`表达证据确定性，过滤/守卫/弃权另列；`impactBasis=measured / inferred`表达实测或推断。不得从缺少“推断”标记反推实测。API源码发现通常有`file:line`；loader/声明发现可能没有，不编造位置。
- 可可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group及无法映射项不冒充同一事实。官方peer冲突是`declared-incompatible`及推断影响，当前实现把`engines.dsh`作建议处理，这是旧0.2.0-rc.2口径；0.2.1-rc.1已优先使用该字段，本版尚有声明误报/漏报，见后续适配任务。声明不等于实测加载失败。
- 规则按方法layer优先、服务layer回退，不能跨端套用。provide声明只是提供方线索；未知方法影响用默认“影响面未知”。`try/catch`不是能力守卫；`coverage.status=limited`、vacuous及客户端未验证须转述，ok不是功能认证。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离，锁内比较、原子写入；不完整扫描不推进。升级/身份变化记中性，严重度/确定性/位置变化参与差分；schema1或损坏条目不比较。角标表示变化及方向，“没变化”不等于兼容。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是运行时校验及JSDoc真源。CLI JSON为`schemaVersion:1 / kind:plugin-compat-check/result`；HTTP为`kind:plugin-compat-check/report`的envelope；tool保留原summary/text并返回完整report/baseline/cache。各渠道保留发现、覆盖、观测、版本、错误及基线证据；面板拒绝损坏或不支持的负载。未知新增字段可保留，不兼容变更须升schema。

兼容性退出码：**0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定**。安装器的gate-rejected等状态另有包装，网络/安装/启动错误不能冒充插件结论。校验检查摘要、结论、严重度、退出码、span、身份及嵌套基线自洽。

`plugin/lib/report-contract.js`和客户端内联校验由真源生成，不手改副本；prepack与`stage-contract.mjs --check`防漂移。同目标计算single-flight，失败刷新保留最近成功报告和错误状态；缓存/后台错误的呈现体验不作为已完成的业务验收。

### 2.4 DSH接入要点

历史基准为0.2.0-rc.2；0.2.1-rc.1的新版宿主/客户端源码仍保留下列主要接入口，实测范围和声明差异另列，不能把接入可用当作判定全面适配：

- UI使用`settings.plugins.tab`、`plugins.detail.section`和`.badge`；`plugins.item`缺可靠插件身份。客户端为web，导出预构建的`window.__ModuleLoader__.load({id,factory})`，inject声明其它插件包名；宿主不代构建。2026-10-17在0.2.1-rc.2实测：`plugins.detail.section`、`plugins.detail.badge`与tool/skill正常，`settings.plugins.tab`（标签名“兼容性”）**未渲染**——插件设置页DOM中无该标签，而`window.__COMPAT_CHECK__`仍自报已注册；注册成功不等于界面出现。该结论只覆盖一次手动检查，不推翻0.2.0-rc.2的面板记录。
- loader entries是可迭代对象，entry id须映射包身份；0–5依次为PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING。import失败可能没有fiber，不能靠`fiber.await()`取得PENDING原因，也不读要求inject的fiber.store假装全知。
- 本插件空inject避免体检自身因缺服务挂起；使用有效scoped Context。工具required为顶层数组，skill须运行时注册provider，包内文件不会自动发现；profile按实际启动参数解析，不依赖过期环境变量。`ctx.settings.register`不存在不能外推其它方法。

0.2.1-rc.1升级评估：已直接调用官方导出的声明检查函数，复现“engines放行/peer拒绝”的误报及反向组合的漏报；API目录对照为host91→98（新增8、移除invariants），client仍8且方法集合未变，subagents等方法有变化。无需据此重写AST/worker/面板架构；应按目标DSH版本适配声明优先级、更新并复核目录/规则、扩展回归；子路径元数据及热重载生命周期另验收。官方依据：[新版发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.1)。

## 3. 开发与文档维护约定

1. **先复现再修改。** 判据验证目标行为，不能以测试自洽代替事实；动态/未知形态先留诊断，不编造归属、影响或实测。
2. **审查差异。** 不用重建快照消除失败；基准版本漂移需有意更新`test/__baseline-versions.json`并单独审查。默认套件先捕获一份测试专用profile副本供各进程共享，单文件测试自行捕获；提取与源码回读只用该副本。清单、字节和链接身份两次观测不一致报`PROFILE_SNAPSHOT_UNSTABLE`，超预算报`PROFILE_SNAPSHOT_BUDGET`，不重试或静默丢弃；未安装的可选profile明确跳过。两次核验不是OS原子快照。
3. **保护宿主与所有权。** 昂贵分析在有预算的worker中；只清理自有目录/PID组，不按进程名杀用户服务，不保留认证URL。profile克隆排除node_modules、重定位manifest和pnpm9单importer本地锁路径，保留远程pins；拒绝不支持格式及不安全链接，不改原profile。
4. **从产物验收。** 在私有源码副本打tgz、安装并实际调用；文件存在或前端到货不代表内核/业务成功。Python parity是旧参考，不能作为AST真值。
5. **控制提交与发布。** push/合并/npm发布分别取得授权；本地可提交，只stage本项路径，不用`git add -A`。身份为`Chenyu Liu <233006721+lcy0121@users.noreply.github.com>`。
6. **文档各司其职。** README写用法，Plan写现行契约/状态/待办，current-state写可核验事实，审计/反例保留日期和旧基准。更新真源并同步skill/契约副本；不把旧数字改成新认证，不逐轮增设总结文件。

## 4. 已完成的关键工作

0.1.1已实施原审计B01–B14/S01–S03整改、P0真实集成、P1辅助度量真值隔离/规则质量/契约稳定、semver库存写入与到货文本两小项，以及有界P2分析和资源验证。修复与独立复核详节在Git/current-state；历史安全审阅为partial，不是全量安全认证。

规则复核保留`attachments.readImage`实际读取路径及`sessions.open`客户端旧回退语义，删除`getSnapshot`、`settings.get`、`sessions.map`无依据影响；`sessions.refresh`不补无依据规则。证据见`rules/severity.json`的needsReview.reviewed/evidence；库存仍是明确partial的desktop样本，不能用历史61%或调用数增减说明准确率。

2026-10-17已完成可选profile回归输入隔离：覆盖不变式、特征快照、CLI、skill示例和文档命令；私有只读副本保留pnpm包根/包内链接语义，外部链接仅映射自有标记，不读其源码。新增9项删除/改写/链接/跨进程/预算回归通过，本机Node22.19.0/26.12.0完整默认各491/491；版本基准、预期快照和生产内核未改。证据见current-state的`verification.optionalProfileSnapshots`。

保留的维护教训：不能只扫声明客户端入口而漏懒加载chunk，不能用方法黑名单代替接收者绑定，不能把未知provide当已激活服务，也不能把干净日志/成功到货当功能正常。

交付跟踪：[本仓库PR #2](https://github.com/lcy0121/dsh-plugin-compat-check/pull/2)包含本地补强与文档；[Awesome PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)已同步提交中英文收录简介，包含已装插件面板、详情角标、tool/skill及仓库CLI，lint通过，仍待上游维护者审核合并。提交PR不等于上游页面已更新。

## 5. 验证记录与复现

### 5.1 已验证范围

| 证据 | 已覆盖与限制 |
|---|---|
| macOS真实DSH/Chrome | 私有tgz、tool/skill、面板/详情/角标/基线及正负向到货；后续联合22项中9项为真实DSH/Chrome/pnpm、13项离线。DSH0.2.0-rc.2，未发送模型对话；旧skill实测正文6548与当时源码一致，不能冒充本轮修订后的正文 |
| Linux arm64 VM | Ubuntu24.04.5、Node22.19/24.21，默认各406通过/1项外部parityfix缺失跳过，联合各18通过（4项真实DSH、1项冻结pnpm安装、13项离线）；自有QEMU磁盘、profile和SSH密钥已清理 |
| Linux x64远程CI | [PR #2源码7cae84c的Actions](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/38922904395)三个任务通过：Node22/24默认/发布前/资源、Node24联合18项（4项真实DSH、1项冻结pnpm安装、13项离线）；两版超时总流程约1.13/1.09秒，worker运行、停止及恢复均达标；后续纯交付记录提交另看PR最新CI |
| 本地超时断言补强 | Node22.19/26.12默认各481/481，六个工程场景通过；计数须增长、1秒受控超时、含停止检查及恢复提取的总流程<5秒，两种隔离负例均被拒绝；生产10秒/512+64MiB预算未改 |
| 新版DSH有限验证 | 0.2.1-rc.1/macOS arm64、工具0.1.2实际tgz共7/7：探针2、HTTP1、Chrome到货及错误对照4；不是全面业务或新一轮手动面板验收。声明两组差异及目录对照见current-state的verification.dshUpgradeAssessment |
| 当前文档与skill | 0.1.2发布前默认481/481，发布后文档/打包回归67/67；CI暴露的测试IPC退出时序竞态已补回归，当时默认482/482，生产内核未变；后续profile隔离回归见第4节。交付证据见current-state的verification.documentationDelivery012；旧documentationAudit按原日期保留，Windows与未列明版本未认证 |

辅助度量只用独立原始loader标签计分；预测只读服务观测，不读标签。四病例TP1/FP0/FN1/TN2（精确率1、召回率0.5、退出1）说明固定样本中存在真实漏报，不是生态准确率。标签须绑定身份、时间、版本并配对报告；无有效分母/输入不可信退出3，指标分母为空为null。度量退出0/1不等同兼容性CLI的0/1。

P2固定21例归属反例从TP0/FN14改为TP14/FN0、FP保持0，4例未知有诊断；这只评价该队列。desktop规则库存和后续只读样本不是同一次扫描，完整性与各自计数见current-state，不互相回填。

### 5.2 日常检查与真实集成

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

文档核验不递归跑测试；发布闸门复用一次完整默认套件摘要。实际tgz的空npm缓存安装需要registry联网，已有tarball缓存不代表可离线安装。修改真源后运行`stage-skill.mjs`/`stage-contract.mjs`并审查差异，快照只能经审查有意更新。

真实集成显式使用`DSC_SLOW=1`；运行`test/probe-boot.test.mjs`、`test/labels.test.mjs`、`test/client-arrival.test.mjs`，需要DSH/pnpm及Chrome（可用`DSC_CHROME`指定）。默认suite不代替真实UI、tool/skill或退出码矩阵。synthetic从官方web模板创建私有环境；文件度量必须成对提供`--probe`与`--labels`，度量选项见`node tools/labels.mjs --help`，安装检查帮助用shell入口`--help`。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test --test-reporter=tap test/engineering-live.test.mjs test/profile-lock.test.mjs
```

场景包括2402文件/约50MB预算弃权、受控超时、32MiB与默认512MiB提取器堆耗尽/恢复、64请求single-flight、8进程192次基线争用/原子读取；真实宿主在4000函数输入、3并发刷新期间仍能返回有效缓存报告。超时指标分列等待时间与总流程，停止后计数须不再增长；旧220ms记录与本地1秒补强分开保存。

这些是限定版本/输入的工程证据，不是全进程RSS限制、任意脱离进程组的隔离、生产性能或业务准确率认证；独立业务用例和Windows另列后续。

## 6. 后续工作与发布

按以下顺序推进，不重复已完成任务：

1. **0.2.1-rc.1定向适配。** 按目标版本区分engines.dsh优先与旧peer规则，覆盖缺失、非法范围、预发布和精确豁免；审查host API目录及受影响规则，不靠重建快照消红。保留旧版回归，并把当前官方函数对照升级为真实宿主正反例及持续集成；完成前不声称全面支持新版。
2. **下一项功能开发：独立业务真值用例。** 从真实插件挑选有限业务路径，明确预期动作和成功/失败信号，优先补客户端交互及已知动态分析盲区。功能标签须独立于预测与loader标签；同时保留正反例，不用到货数或更多调用点冒充准确率。
3. **Windows取得真实环境后验收。** 路径、安装器、进程回收和打包实跑；按用户选择暂缓，不用POSIX或路径模拟充数。

## 7. 宣传与分发提案（2026-10-17，待评估）

本节是**待评估的渠道判断**，不是已承诺的施工项：做不做、先后顺序由人决定。写入目的是把结论和前置条件摊开，避免每条渠道都要重新论证一遍。

事实底数（2026-10-17实测）：npm近30天下载243、GitHub star 0；`awesome-dsh-plugin.com/plugins.json`（5,704条，对应仓库19,110★）里**没有**本仓库，而dshmarket只读这一份表，所以当前无法在该市场搜到或安装；已被0xsline（1,196★）、Dominic789654、dshbase与dsh-xray收录或建页（后两者页面返回200），另有若干目录以自动方式收录（调研口径，未逐个复核）。

### 7.1 判断

兼容性工具只在**故障发生时**被需要：某个插件在新版DSH上坏了，作者或用户正在查为什么。榜单解决“被搜到”，不解决“被想到”，而后者才是这个产品的入口。因此优先级按“能否出现在那一刻”排，而不是按渠道体量排。

### 7.2 候选渠道

| 渠道 | 机制 | 前置条件 | 需要的产品改动 | 可观测信号 |
|---|---|---|---|---|
| A 故障现场 | 把一次体检结论变成可直接粘进issue的markdown块（宿主版本、插件名与版本、结论、每条`file:line`、`certainty`、`impactBasis`、静态推断免责、复现命令），在真实报错贴里回复 | 报告字段已齐备（`lib/contracts.mjs`），缺面向第三方的措辞与固定格式 | CLI增加`--issue-report`；不改判定 | 被引用/被致谢次数；**不能自发增长** |
| B 兼容性普查 | 取一个明确样本（如下载量前50）做静态扫描，公布“声称支持0.2.x但存在悬空调用”的计数与清单 | 样本口径与抓取方式可复现；结论须标静态推断、非实测、非安全审查 | 批量扫描编排与结果聚合（`--json`已可支撑单仓） | 数字被外部引用 |
| C 徽章 + Action | 作者仓库加一个workflow跑CLI，把徽章JSON推到自己仓库分支，README用shields endpoint引用 | 稳定的机器可读契约（已有`schemaVersion`） | 徽章JSON schema、可复用的Action | 安装该Action的仓库数、徽章在第三方README出现次数；**唯一不依赖持续人工的渠道** |
| D 发布节奏钩子 | DSH每发一个rc，24小时内出一次普查增量 | 依赖B的批量脚本 | 版本差异对比（基线差分已有雏形） | 发版后24小时的引用量 |
| E 市场详情页 | 与dsh-market协商在详情页展示第三方结论 | 需要一个只读、可缓存的结论端点；主动权在对方 | 只读结论端点 | 上线与否 |

A与B的红线：只在结论确实回答该帖问题时出现，须声明作者身份与工具来源，一次回复不夹带第二个仓库；普查只写“待作者核对”，不写某插件“坏了”，也不把静态推断写成实测。

### 7.3 明确不做

- **YELEBAI市场**（调研口径约1.1万下载/月，未独立复核）：其扫描只读仓库根`package.json`。根是private开发工作区，要过闸就得给根加`dsh.bundle`指向`plugin/cordis.patch.yml`，这会让“从根安装”变成一句假话——用不实声明换渠道位，不做。
- **bruc3van自荐位**：要求star>10，当前0。已就“只是个bash CLI”这条过时排除理由提issue（#138），等人工复核，不自行改`curated.json`/`approved.json`。
- **dshhub.co**：口令/付费分发市场；**cordis.run**：需登录并人工审核。二者不作为主线。
- **通用社交平台贴链接**：产品价值需要30秒演示才看得懂，纯链接转化接近零。
- **求star**：下载量与被引用次数是可用指标，star是结果不是手段。

### 7.4 本轮已提交的对外动作

| 对象 | 动作 | 状态 |
|---|---|---|
| awesome-dsh-plugin（dsh-market登记表） | [PR #7736](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7736)，`plugin/`子目录形态、`category: dev` | CI通过，待维护者合并 |
| deepseek1024（1024 Store） | [PR #628](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/628) | 已自动合并 |
| dshworks/awesome-dsh-plugins | [PR #167](https://github.com/dshworks/awesome-dsh-plugins/pull/167)，修正`path`（`probe`→`plugin`）、过时的“安装前”描述、缺失的npm名 | CI通过，待合并 |
| 0xsline/awesome-deepseek-harness | [PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)，描述改为现行能力 | CI通过，待合并 |
| bruc3van/awesome-dsh-plugin | [issue #138](https://github.com/bruc3van/awesome-dsh-plugin/issues/138)，排除理由已过时 | 待人工复核 |

以上对外描述统一只写0.2.1-rc.2实测到的界面：插件详情页角标、逐项发现、`compat_check`工具、skill provider；**不承诺**`settings.plugins.tab`面板，原因见§2.4。提交PR不等于上游页面已更新。

