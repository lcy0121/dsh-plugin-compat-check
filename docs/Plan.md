# 开发计划与维护约定

更新于2026-10-20。**0.1.4已发布至GitHub与npm，npm latest为0.1.4**；确切制品与公开安装均已核验。用法见[README](../README.md)，计数与逐次验收证据见[docs/current-state.json](current-state.json)。本文只保留现行契约、关键结论和待办，施工过程查Git历史；[旧提取器反例](extraction-findings.md)仅作历史参考。

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

- `certain / suspected`表达确定性；过滤/守卫/弃权另列。`impactBasis=measured / inferred`区分实测与推断，缺字段不能反推实测。API发现通常有`file:line`；loader/声明事实可无位置，不编造。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group及无法映射不冒充该事实。方法规则优先、服务layer回退，不跨端套规则；provide仅为线索，未知方法影响写“影响面未知”，try/catch不是能力守卫。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失时回退官方peer；旧目标保留旧规则。非法字段/范围有诊断；peer workspace:^/~/*按当前精确版本处理，engines不接受该别名。声明风险是推断，不等同实际加载失败，宿主可能跳过bundle后继续启动。
- 只读目标profile独立`compatibility.json`，插件名/插件精确版本/DSH精确版本全匹配才豁免范围冲突；无效记录整条忽略，其它有效记录仍用。非法字段不可豁免；不可读、非普通文件、JSON无效或超64KiB则豁免未观测并限制覆盖，不自动授予。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离，锁内比较、原子写入，不完整扫描不推进。身份升级中性处理，schema1或损坏条目不比较。“无变化”、获豁免和ok均不等于业务认证，`coverage.status=limited`、`vacuous`及客户端未验证须转述。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是运行时/JSDoc真源。CLI为`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP为`kind:plugin-compat-check/report`的envelope；tool保留summary/text和完整report/baseline/cache。字段、严重度、摘要、退出码、span及身份须自洽；面板拒绝损坏负载。新增字段兼容，不兼容变更须升schema，生成副本由`stage-contract.mjs --check`防漂移。

CLI退出码：**0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定**。安装检查另有gate-rejected等状态；网络/安装/启动错误不是插件结论。同目标single-flight，失败刷新保留最近成功报告及错误，缓存不冒充业务验收。

`--issue-report`从同一结果导出Markdown，不读写基线，与json/quiet互斥并保留退出码。保留版本、观测、发现、可用位置、certainty/impactBasis、覆盖及占位符命令；不导出原始日志、探针、源码片段、基线或evidence。可疑说明整项隐藏，不安全位置隐藏；仍保留插件名与包内相对文件名，须预览，不保证任意文本完全脱敏，不自动发帖。

### 2.4 DSH接入要点

- UI为`settings.plugins.tab`、`plugins.detail.section`及`.badge`；`plugins.item`缺可靠身份。客户端导出预构建`window.__ModuleLoader__.load({id,factory})`，inject声明其它插件包名，宿主不代构建。
- loader entries可迭代，entry id映射包身份；0–5为PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING，import失败可无fiber。本插件空inject避免自身挂起；工具required是顶层数组，skill须注册运行时provider，按实际启动参数解析profile。
- DSH≥0.2.1-rc.2选新目录（host98/291方法、client8/43），其余/未知选旧0.2.0-rc.2目录，CLI显式覆盖优先；未来版本未认证。ASAR起点为8+headerSize，校验边界/原始字节/摘要；不凭方法名迁移严重度，未知影响回退，未整体重写AST/worker。
- rc.2界面入口为“更多 → 设置 → 内置插件 → 兼容性”。HMR撤销route/tool/skill、计时器及诊断handle，在途任务卸载后不得写基线或返回新成功报告；worker仍按原预算回收，不声称立即取消。Origin要求协议/主机/有效端口完全同源，本机无Origin调用仍允许。

## 3. 开发与文档维护约定

1. 先复现再修改，保留未知、弃权和覆盖诊断；不以自洽测试替代目标行为，不编造实测或影响。
2. 不重建快照消除失败。版本漂移须审查`test/__baseline-versions.json`并单独提交；默认suite共享测试专用只读profile副本，提取/回读用同一字节。观测不稳或超预算明确报错，不重试或交付半份输入；不是OS原子快照。
3. 分析运行在有预算worker，只清理自有目录/PID组。安装克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径、保留远程pins；拒绝不支持格式和不安全链接，不改原profile。
4. 私有源码副本打tgz、空缓存实装并调用；文件存在或日志干净不证明业务成功。默认10秒/512+64MiB worker预算、1秒工程超时负例及总流程<5秒分别维护；Python parity仅为旧参考。
5. 本地可提交；push/合并/npm发布及对外发帖分别取得授权，当前用户已授权本轮0.1.4源码与GitHub/npm发布，不延伸到新上游发帖。仅stage本项路径。README写用法、Plan写契约/状态/待办、current-state写证据；同步skill/契约，不逐轮新增总结文件。历史日期、版本和失败不得改写为当前认证。

## 4. 已完成的关键工作

| 工作 | 结论与证据索引（current-state的verification下） |
|---|---|
| 原始审计 / P0–P2 | 2026-10-14基于4722716/npm0.1.0的B01–B14及S01–S03已整改：词法AST、未知/缺失及端别、loader/profile、原子基线、统一报告和有界值流；原审计已归档，见`auditArchive20261019`。3项medium为源码验证/partial覆盖，不是全量安全认证 |
| 安全与输入隔离 | 私有目录与安全链接、自有Chrome继承管道、路径及资源预算；可选profile只读快照已交付。临时profile仍不隔离任意恶意代码，历史凭据轮换未在旧审计内 |
| rc.2适配 / 0.1.3 | 新声明闸门、精确豁免、双目录、实际导航及卸载恢复，见`rc2TargetedAdaptation`、`release013`；10月17日标签未显示的原因未定，不用后续成功追认根因 |
| 规则质量 | 保留readImage实际路径及sessions.open旧回退；移除getSnapshot/settings.get/sessions.map无依据影响，不为sessions.refresh臆造规则；库存为partial，不等于准确率 |
| 故障诊断与回收 | Darwin全组Z/exit事件竞态现场互证；仅确认退出且完整同UID组快照均Z/消失后接受停止，活进程或不可读仍失败。多资源均尝试回收，保留主错误、清理错误及私有workDir；Chrome按握手/建页/附加/会话记录有界诊断，见`engineeringDiagnostics20261019` |
| Linux Chrome CI | 子进程D-Bus隔离、暂停负例先确认启动、CI读入确切Chrome文件/共享库后开始原协议计时，无预热启动、自动重试或增加生产超时。准备后旧/新DSH矩阵通过；原fffec7f握手失败根因仍未知，新镜像D/page等待只是现场证据，见`linuxChromeCiAcceptance20261020`、`linuxChromeInputPreparation20261020` |

独立业务预测在动作前按固定制品/API目录/手审功能区间封存，业务真值来自请求、DOM及磁盘，不读loader答案。固定队列如下；并非盲测、生态准确率或完整模型认证：

| 队列 | 结果与边界 |
|---|---|
| dshmarket1.66.37备注/收藏 | 正常/恢复TN4；503及操作前/保存后目标控件缺失FN6，驱动故障单列 |
| dsh-better-sidebar0.28.0 | HTTP与真实编辑器各TN4/FN2；验证编码/换行、保存与新文档重载，503另组 |
| 0.26.1编辑器自然失败 | 原静态FN2保留；顶层webRuntime在rc.2/web明确缺失。动作前服务观测独立队列旧版TP2、新版TN4/FP0；独立诊断宿主补该服务后两例恢复，不进入产品特判，不断言首次引入版本 |
| 0.28.0模型短回复 | 授权账户最终TN2，日志/重载DOM核验；整个历史调试加验收6条成功回复，不代表账单或模型质量认证，本轮发布不新增模型调用 |

详见`independentBusinessTruth`、`businessSampleExpansion`、`marketUiAndBusinessExpansion`及`naturalFailureBoundaries20261019`；服务观测不覆盖静态FN/退出码，不靠调严重度消除漏报。

**分发复核（2026-10-20）：**

| 渠道 | 已完成与剩余边界 |
|---|---|
| 主目录 / dsh-market | #8057双语简介已同步索引/详情，0.1.4发布后公开映射仍为npm0.1.3；1.66.43真实Chrome/rc.2空profile全球线路实装0.1.3且37文件一致。#931终端误提示已在1.66.44实际确认窗验收；#932的packument回退有效，但双端失败仍裸名安装。显示名`plugin`来自目录末级解析，[PR #948](https://github.com/dsh-market/dsh-market/pull/948)仍开放，修复不改身份/安装目标，也不要求本插件改名 |
| 1024 Store | 目录#628已合并；v2仍只有GitHub unknown/not_checked方式，无npm。[#22](https://github.com/imsai-sh/dsh-1024store/issues/22)仍开放、无维护者回复。0.1.4补repository.directory有助绑定，不证明私有D1/KV采集故障已解决；不拿裸源码回退冒充tgz验收 |
| 其它Awesome | dshworks#169已合并，bruc3van#138已关闭并收录；0xsline已收录，但简介修订[PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)仍开放 |

上游证据见`upstreamFollowup20261020`、`marketDisplayName20261020`，旧安装失败和历史线路差异仍保留。显示名PR的Node24完整2556测试/类型/构建通过；Node26失败在未改基线复现，不写成通过。收录、HTTP200、下载与star均不代表业务用户或兼容认证，不承诺未经验证的宣传转化或逐rc普查SLA。

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

## 6. 后续工作

1. **上游验收。** #948采纳发布后验卡片/安装窗产品名；#932双端失败待明确告警或安全失败后复验；1024#22出现npm方式后实装；0xsline#717待采纳。1.66.44目前仅验确认窗，全球全新实装仍是1.66.43证据；主目录当前仍映射0.1.3，待刷新后另验0.1.4市场路径；发布本身不证明商店同步。无新证据不重复发帖，新外部补充另取授权。
2. **有限批量与自动化（后置）。** 先做固定哈希样本的静态JSON聚合、限制及“待作者复核”，再评估低权限Action/增量摘要和端点隐私、缓存、维护成本。业务扩展另定制品/资源/独立真值。Perch仅可选评估：Files恢复复用已有真实Chrome正负例，须证明增量收益并核清权限、源码处理与费用，不能代替浏览器验收（`semanticRuleAssessment20261020`）。
3. **Windows真实验收。** 取得环境后实跑路径、安装器、回收和打包；依用户选择暂缓，不用POSIX或模拟充数。
