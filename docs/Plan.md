# 开发计划与维护约定

更新于2026-10-18。仓库为0.1.3候选（未发布），已完成rc.2定向适配；npm latest仍为0.1.2（旧声明算法）。本文维护现行契约、交付边界与待办；用法见[README](../README.md)，逐次证据见[docs/current-state.json](current-state.json)。[原始审计](GPT审计及重构方案文档.md)与[旧提取器反例](extraction-findings.md)保留历史身份，施工过程查Git历史。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，呈现依据、源码位置及覆盖限制；声明放行、激活成功、客户端到货均不单独证明业务功能正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、兼容性标签、插件详情发现/角标、tool与skill。体检不联网、不装包、不启动外部命令；使用分析worker并写自身基线 |
| 仓库CLI / 安装检查 | 默认静态扫描不执行目标源码；显式probe/安装检查会装依赖、启动宿主并执行目标插件。临时profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定 |

npm0.1.2于2026-10-17回下载验收，见`verification.documentationDelivery012`；[PR #3](https://github.com/lcy0121/dsh-plugin-compat-check/pull/3)交付文档补丁，[PR #4](https://github.com/lcy0121/dsh-plugin-compat-check/pull/4)交付输入隔离。**0.1.3候选的rc.2适配、skill、截图及仓库CLI故障报告等修订均未进入公开tarball**，候选验证不等于npm包已更新。本轮用户已授权在业务扩展、文档核对及CI通过后交付0.1.3；发布事实在完成后更新，未完成前不称已上线。

版本真源为`lib/version.mjs`。仓库根是private开发工作区，npm仅打包`plugin/`，没有CLI bin、安装shell或probe入口；不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约、暂存kernel与LICENSE，postpack清理kernel；安装完整tgz，不假定裸`plugin/`含内核。市场截图声明位于`plugin/screenshots.json`，图片在`plugin/assets/`；当前npm files未收录二者，README使用GitHub图片链接。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、包内源码图、词法绑定及逐调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式。其它profile不能借用当前宿主服务。
- 服务为`present / absent / unobserved / unreadable`；省略键、目录缺项或未知getter不等于不存在。现代probe绑定profile/DSH版本/时间，默认24小时过期；旧报告提示未绑定，仅用明确键；采样不执行getter。
- 支持有界常量键/解构、同步参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名及调用、空handler透明Proxy。变更/遮蔽/逃逸会撤回证明；未知键、trap、异步、递归、复杂控制流和default/rest参数保守合并或弃权。
- 上限：256次相关调用、16层调用、32层导出链、64节点闭包图、128节点逃逸图、512次常量调用、8192字符展开，另有扫描文件/字节/目录/时间预算。超限、解析或读取诊断限制覆盖，不以加预算或删调用点求干净。

### 2.2 结论、影响与基线

- `certain / suspected`表达确定性，过滤/守卫/弃权另列；`impactBasis=measured / inferred`区分实测与推断，缺少字段不能反推实测。API发现通常有`file:line`，声明/loader事实可无源码位置，不编造。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现，disabled、LOADING、group或无法映射不冒充该事实。0.1.3候选对DSH≥0.2.1-rc.1优先自有engines.dsh，缺失时回退官方peer；旧目标保留旧规则。非法字段、空/非法范围有诊断；peer workspace:^/~/*按当前精确版本处理，engines不接受该别名。声明冲突/非法字段为declared-incompatible及推断影响，不能等同实际加载失败（宿主可能跳过bundle后继续启动）。
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

已完成原审计B01–B14/S01–S03整改、P0集成、P1标签真值隔离/规则质量/契约稳定、有界P2分析与工程验证。规则复核保留readImage实际读取路径和sessions.open旧回退，移除getSnapshot/settings.get/sessions.map无依据影响；sessions.refresh不补无依据规则。历史安全审阅为partial，库存是partial样本，不以调用数或历史覆盖率代替准确率。

独立业务队列已覆盖两个固定真实插件：dshmarket1.66.37的备注/收藏，以及dsh-better-sidebar0.28.0的保存/预览HTTP路径（UTF-8 BOM/UTF-16LE、CRLF及故障恢复）。预测按源码/静态目录和手审功能区间提前封存，不读业务/loader答案；完成请求、新文档DOM及独立磁盘字节共同确定结果。市场正常TN2、503对照FN2；侧栏正常/恢复TN4、503对照FN2，原始CLI均为1。缺病例/身份不符拒绝计分，驱动错误不算业务失败；导航按新loader加载完成，初次欢迎框明确关闭。对照未改目标字节，不代表自然版本回归、原插件缺陷、完整编辑器UI或生态准确率；见`verification.independentBusinessTruth`及`verification.businessSampleExpansion`。

可选profile输入隔离已由[PR #4](https://github.com/lcy0121/dsh-plugin-compat-check/pull/4)交付；9项隔离回归、本机Node22.19/26.12默认各491/491，合并提交ec6f06a的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39033059918)通过Node22/24及Linux真实DSH。只适用于各自输入/日期，不认证后续源码或其它宿主版本。

**分发状态（2026-10-18核验，北京时间；目录/安装沿用下列时刻，上游待办于发布前再次复查）：**

| 对象 | 已有动作与状态 |
|---|---|
| awesome-dsh-plugin / dsh-market登记表 | [PR #7736](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7736)10月18日04:34合并；默认YAML、[公开索引](https://awesome-dsh-plugin.com/plugins.json)及[详情页](https://awesome-dsh-plugin.com/p/lcy0121/dsh-plugin-compat-check--plugin/)均有本插件。12:20复查JSON已同步npm=dsh-plugin-compat-check、version=0.1.2及npm安装命令，无须提issue；本轮真实dsh-market1.66.37安装npm0.1.2已验收，见下方记录 |
| 1024 Store目录 | [PR #628](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/628)已MERGED；公开搜索/详情仍可见，但installMethods仅有unknown/not_checked的GitHub方法，无npm方法，按当前商店源码仍仅浏览。[issue #22](https://github.com/imsai-sh/dsh-1024store/issues/22)仍OPEN且无评论；其GitHub子目录安装缺内核为作者复现，本轮未重跑 |
| dshworks目录 | [PR #167](https://github.com/dshworks/awesome-dsh-plugins/pull/167)已CLOSED，维护者将内容并入10月18日11:33合并的[PR #169](https://github.com/dshworks/awesome-dsh-plugins/pull/169)；默认分支data/plugins.json及[分类列表](https://github.com/dshworks/awesome-dsh-plugins/blob/main/lists/interop-migration.md)已包含plugin子目录、修订简介与npm链接，无须再等待#167 |
| 0xsline Awesome | [简介修订PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)仍OPEN且无评论；默认README仍为旧的安装前CLI简介，尚未采纳修订 |
| bruc3van目录 | [issue #138](https://github.com/bruc3van/awesome-dsh-plugin/issues/138)仍OPEN且无评论；curated.json仍保留“standalone bash CLI”排除理由。发布日期已更正，排除理由复核仍待处理 |

10月18日真实市场验收：私有rc.2/web profile仅预装npm上的dshmarket1.66.37，通过真实Chrome搜索本插件并确认npm安装；市场显示已安装，点击刷新后生效，“已安装”页为0.1.2/启用中，兼容性标签及认证HTTP报告正常。34个随包文件与公开npm0.1.2 tgz逐字节一致，kernel完整；测试页、宿主及私有profile已清理。市场提示“终端插件、可能不适用网页版”但未阻断此链路，疑似分类问题待上游复核，未发issue。该验收只覆盖已发布0.1.2，不认证0.1.3候选、其它市场、源码子目录或完整业务；详见`verification.marketInstallation20261018`。

主目录JSON于12:20定时复查确认npm映射已同步，因此未发issue并停止监测。10月17日的CLI安装/34文件/HTTP证据保留原日期；dshworks verified仅依据manifest，不是本项目业务认证。备用GitHub子目录不是完整tgz，dsh-market的预构建Release及源码回退本轮未测。其它渠道状态沿用各自日期，见`verification.distributionUpstream20261018`。

宣传仅保留可核验事实：HTTP 200不等于收录，下载不等于用户，star不代表兼容性；“故障时被想到”是待验证的定位假设。删除“唯一自动增长渠道”“纯链接转化近零”“每个rc后24小时普查”等未经验证或尚无资源保证的断言。其它市场按其npm/子目录/制品规则评估，不给private根包添加虚假bundle声明，也不从根扫描限制推出所有合规入口都不可能。

## 5. 验证记录与复现

### 5.1 已验证范围

| 证据 | 范围与限制 |
|---|---|
| DSH0.2.0-rc.2 / macOS | 实际tgz、tool/skill、面板/详情/角标/基线、Chrome正负例；联合22项含9项真实DSH/Chrome/pnpm，未发送模型对话 |
| Linux | arm64 VM：Node22/24各406通过、1项外部profile缺失跳过，联合各18通过；x64 CI精确提交见current-state。联合18项含4项真实DSH、1项冻结pnpm安装、13项离线 |
| DSH0.2.1-rc.1 | 工具0.1.2实际tgz有限集成7/7（探针2、HTTP1、Chrome到货/错误4）；不是全面业务、rc.2或新一轮手动面板认证 |
| 0.1.3候选 / rc.2适配阶段 | Node24.19/26.12默认各515/515；rc.2联合19/19含5组真实声明病例、官方子路径元数据、tgz/HTTP、Chrome导航及禁用/启用；旧DSH0.2.0-rc.2联合19/19中rc.2专项明确不适用。两项复核P2已修，无模型/第三方业务/Windows认证；新远端CI未跑，证据见current-state |
| 独立业务队列 / 首轮 | Node24.19/26.12默认各526/526；专项12/12含真实Chrome中备注/收藏四病例及取消回收。正常组TN2、503对照组FN2；离线回放保留exit1，缺病例exit3。两项重要审阅问题已修，新远端CI未跑；见`verification.independentBusinessTruth` |
| 业务扩展 / 0.1.3发布前 | Node24.19/26.12默认各529/529；业务专项17/17（14离线、两组真实插件、1项真实Chrome边界）；最终rc.2联合36/36（含原19项）；旧DSH联合35项中33通过、2项rc.2业务明确不适用。确切0.1.3 tgz实际安装/启动exit0，覆盖仍有限。发布前闸门通过；见`verification.businessSampleExpansion`、`verification.release013` |

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
node tools/business-labels.mjs --live --suite sidebar --out-dir <空侧栏证据目录> --json
# 回放同批次封存的预测及标签；不启动宿主、不联网
node tools/business-labels.mjs --predictions <预测.json> --labels <业务标签.json> --json
DSC_SLOW=1 node --test test/business-labels.test.mjs
```

度量退出码：0=已计分且无错配，1=有FP/FN或不计分项，3=输入/驱动错误或无可计分项。当前503对照有FN，原始CLI应为1；回归suite验证它如实暴露漏报，并不要求把度量改绿。正常/故障组分开报告；market使用单条真实公开记录的本地目录；sidebar使用自有空官方会话和工作区文件，不调用模型，两者不重复认证公共市场安装。`--out-dir`成功时写预测、标签、度量和截图，失败时可能写诊断，须为空；私有profile仍会清理。验收浏览器固定zh-CN，私有profile通过官方credentialOnboarding=false关闭无凭据引导，不认证默认引导或模型能力。该live队列只认证rc.2，旧DSH明确不适用，不用旧版测试通过代替业务认证。文件回放校验同批身份、制品/预测器摘要、病例完整集与时间先后，仅重放历史事实，不提供防协同篡改的签名。CI已配置上传产物，新远端运行须待授权push。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test --test-reporter=tap test/engineering-live.test.mjs test/profile-lock.test.mjs
```

覆盖2402文件/约50MB预算弃权、受控超时、32MiB与默认提取器堆耗尽/恢复、64请求single-flight、8进程192次基线争用/原子读取；旧宿主4000函数/3并发刷新期间仍可响应。超时分别检查等待/总流程、停止后计数不增长及恢复。只证明限定版本/输入的工程行为，不是全进程RSS、任意脱离进程组隔离或生产性能保证。

## 6. 后续工作与发布

按依赖关系推进；宣传提案在此列为后续候选，不视为已实现或已授权对外发送：

1. **0.1.3候选交付与发布。** rc.2定向适配已完成，见§2.2、§2.4与本轮证据。先审查候选diff、默认套件/真实集成及新旧DSH矩阵；经授权push分支、审查CI，再决定main合并和npm发布。当前不把本地测试当作新CI通过，不把未发布候选描述为公开最新版。
2. **业务样本扩展已完成本轮范围。** 第二个真实插件的关键保存/预览路径、独立字节验证和失败后恢复已补齐，见§4、§5.2。自然版本回归、完整编辑器交互及模型路径仍未认证；后续样本按明确版本/制品和资源另选，不扩大本轮结论。
3. **分发的上游待办。** 主目录JSON/npm映射已同步、dshworks已收录；真实dsh-market安装npm0.1.2已完成，见§4。跟进市场“终端插件”的疑似误分类；源码子目录不能代替完整tgz。1024继续跟进#22，npm方法出现后验收；另等0xsline #717简介修订、bruc3van #138排除理由复核。本轮0.1.3发布已获授权；索引可见、本地npm验收和市场安装仍分别记录。
4. **有限样本与自动化（后置）。** 先以少量明确版本/制品哈希的样本验证批量静态JSON聚合，公开口径、限制和“待作者复核”，不称插件坏了或已作安全审查。再评估低权限Action、workflow摘要/徽章及逐版增量；覆盖不足与工具错误单列，不把绿色等同兼容、不默认写第三方仓库、不承诺24小时SLA。引用/实际接入与复现反馈作为信号，不把下载当用户。第三方详情页集成和公共结论端点暂缓，先确认合作、隐私、缓存失效及维护成本。
5. **Windows取得真实环境后验收。** 路径、安装器、进程回收和打包实跑；按用户选择暂缓，不用POSIX或路径模拟充数。
