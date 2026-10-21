# 开发计划与维护约定

更新于2026-10-22。**已发布版本为0.1.4**；后续源码增量尚未发布。用法见[README](../README.md)，当前计数与按日期、版本封存的验收见[docs/current-state.json](current-state.json)；本文维护现行契约、交付索引和待办，不重复归档日志。[旧提取器反例](extraction-findings.md)仅作历史参考。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，提供依据、可用源码位置及覆盖限制。声明放行、激活成功、客户端到货和无发现均不单独证明业务正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、面板/详情/角标、tool及skill；不联网、装包或启动外部命令；有预算worker，普通体检写自身基线 |
| 仓库CLI | 默认静态扫描；显式probe-boot会启动宿主并执行目标插件；升级预检独立且不执行目标代码 |
| 仓库安装检查 | 将指定包安装到私有profile再启动检查；临时profile不是OS沙箱 |
| skill | 指导agent使用同一工具或CLI，不另实现判定 |

单仓库、单版本、一个Node判定内核，版本真源为`lib/version.mjs`。根目录是private开发工作区；npm只打包`plugin/`，无CLI bin、安装shell或probe入口，不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约并暂存kernel、LICENSE及第三方依赖说明，postpack清理kernel；裸源码子目录不等于完整tgz。市场截图由`plugin/screenshots.json`声明，图片不随当前npm files打包。

0.1.4于2026-10-20发布，源提交7bb5e6a，公开npm/Release附件与验收tgz字节一致；历史0.1.3与0.1.4发布证据分别在`verification.release013 / release014`。源码中的解释修订、真实故障回归、核实步骤、面板改进、升级预检及重复身份保护、YAML工具依赖修复、目录治理、探针未来时间校验及CI依赖安全加固已完成，尚未进入npm发布版。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

Babel JS/TS AST、包内源码图、词法绑定及逐调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式，其它profile不能借用当前宿主服务。支持有界常量键、解构、同步参数/返回值、闭包/对象工厂、ESM/CommonJS别名及空handler透明Proxy；变更、遮蔽、逃逸撤回证明，动态、异步、递归及复杂控制流保守合并或弃权。调用/深度/图规模及文件、字节、目录、时间限额以`lib/source-analysis.mjs`、`lib/flow-values.mjs`、`lib/source-graph.mjs`和`lib/syntax.mjs`为准；超限或读取/解析诊断限制覆盖，不靠放大预算求干净。

服务状态为`present / absent / unobserved / unreadable`。目录缺项、省略键、未知getter不等于不存在；采样不执行getter。现代probe绑定profile、DSH版本、时间，默认24小时过期；旧报告提示未绑定，仅使用明确键。必需inject未观测只提示激活前提未确认，同宿主明确缺失才推断障碍；方法失效另判。

绑定格式的探针先核对profile/DSH及采样时间：未来偏差最多5分钟（边界包含），缺失/非法或超范围即撤回整个文件探针的服务与loader证据，保留静态发现并说明原因，不猜测或重写时间。普通CLI/宿主同时保留原24小时有效期；独立进程内loader证据不借用无效文件探针。旧未绑定格式保留仅显式键规则。quiet仍为一行但保留采样说明；probe-boot拒绝时保留原因并清理自有资源。

### 2.2 结论、影响与基线

- `certain`可由明确静态事实或合格观测支持；`suspected`表示该条证据不足。`impactBasis=measured / inferred`独立标记对应观测与推断影响；确定性不等于影响已实测。过滤、守卫和弃权另列，API位置通常为`file:line`，入口/loader/声明事实可无位置，不编造。
- `vacuous=true`为ok但无已验证调用，不表示没有服务依赖或客户端功能；必须同时转述`coverage`及客户端待验证部分。未发现、覆盖完整、获豁免和基线无变化均不等于业务认证。
- 可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group或无法映射不冒充该事实。方法规则优先、服务layer回退，不跨端套规则；provide仅为线索，未知影响保持未知，try/catch不是能力守卫。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer；旧目标用旧策略。非法字段/范围保留诊断；peer的workspace别名可按当前精确版本处理，engines不接受。声明风险为推断，不冒充实际加载失败。
- 仅普通体检只读目标profile的独立`compatibility.json`：插件名、插件精确版本、DSH精确版本全匹配才豁免范围冲突，非法字段不可豁免。无效记录忽略；不可读、非普通文件、坏JSON或超64KiB则限制覆盖，不自动授予。
- 同名重复安装（含alias及不同版本）在提取前明确拒绝，CLI/宿主/agent返回无法判定，不覆盖发现或推进基线。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离，锁内比较、原子写入；不完整扫描不推进。身份变化、schema1或损坏条目中性处理，不据此制造改善。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`为普通报告契约真源：CLI是`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP是`kind:plugin-compat-check/report`的envelope；普通tool保留summary/text及完整report/baseline/cache。字段、发现、计数、退出码和身份须自洽；面板拒绝损坏负载。新增字段兼容，不兼容变更须升schema，`stage-contract.mjs --check`防生成副本漂移。

普通CLI退出码：**0无冲突、1部分可用或未知、2不兼容、3无法判定**；安装检查另有gate-rejected等状态，执行错误不是插件结论。普通报告同目标single-flight，失败刷新保留旧成功报告及错误。升级预检使用§2.7的独立契约和差异退出码。

`--issue-report`从同一报告导出Markdown，不读写基线，与json/quiet互斥。宿主共享`lib/issue-report.mjs`，界面筛选不裁剪导出，只有明确复制才写剪贴板，失败提供手动复制。保留插件名、包内位置和证据边界，隐藏不安全位置/说明，不导出原始源码、日志、probe、baseline或evidence；不保证任意文本完全脱敏，分享前预览，不自动发帖。

### 2.4 DSH接入要点

UI使用`settings.plugins.tab`、`plugins.detail.section / .badge`；`plugins.item`缺可靠身份。预构建客户端通过`window.__ModuleLoader__.load({id,factory})`加载，inject为其它客户端包名，宿主不代构建。宿主空inject避免自身挂起；loader状态及包身份可靠映射后才判定，tool required用顶层数组，skill须注册provider，按实际启动参数解析profile。

普通体检对DSH≥0.2.1-rc.2选新目录，其余/未知选旧0.2.0-rc.2目录，CLI显式覆盖优先；**未来版本未认证**。普通报告新增catalog身份，独立展示目标DSH、参考版本/SHA-256、selection及目录验收范围；未知/未来、自定义或旧报告缺身份醒目提示未认证。已验收范围由`lib/contracts.mjs`的精确版本/文件摘要固定，内置目录摘要漂移明确失败，自报版本及提取不扩大范围；仅目录集成，不认证业务。升级预检仅接受已知精确版本，不采用该回退。新目录须按[治理流程](catalog-governance.md)核对本地ASAR来源、生成分端API差分、复核规则语义并完成真实宿主/UI验收后人工登记。ASAR按8+headerSize定位并核验边界、原始字节及摘要。

rc.2入口为“更多 → 设置 → 内置插件 → 兼容性”。HMR撤销route/tool/skill、计时器及诊断handle，在途任务卸载后不写基线、不返回新成功报告；worker按原预算回收，不声称立即取消。HTTP Origin须协议、主机和有效端口完全同源，本机无Origin调用仍允许。

### 2.5 有限静态批量契约

`tools/static-batch.mjs`仅属仓库工具。清单格式见[固定合成样本](../test/fixtures/static-batch.json)：`schemaVersion:1 / kind:plugin-compat-check/batch-manifest`，精确目标DSH和唯一id，包名/版本/指纹须匹配。只接受相对清单的本地第三方DSH包目录，不接受绝对路径、`.`/`..`、链接、特殊文件、官方包或无dsh元数据的输入；无下载、安装或生态自动发现。

指纹是全部普通文件按包内POSIX相对路径的UTF-16码元顺序组成`[路径,字节数,文件SHA-256]`，压缩JSON的UTF-8字节再取SHA-256；不含空目录或模式。`--hash`仅输出指纹，不改清单。扫描经过稳定读取/哈希校验的私有副本，不承诺OS原子快照或防协同篡改认证。

1–16项顺序运行，清单64KiB；每项4096目录项/32层/单文件2MiB/总16MiB/报告96KiB，worker默认10秒、整批60秒、堆512+64MiB，时间参数只能降低。超时先回收worker再清理自有目录，不承诺硬实时或全进程RSS。超限/身份/执行错误逐项exit3且其它项继续；整批有工具错误即3，否则取最重0/1/2。

独立JSON为`kind:plugin-compat-check/batch-result`，含固定身份、校验、逐项发现及coverage/vacuous、弃权、诊断和`reviewStatus=pending-author-review`。无运行时、跨样本服务、probe、豁免或基线；部分扫描不升级为完整。`--previous`仍重新扫描，仅分析源码/依赖锁、Node与依赖版本、规则/目录、目标、策略和预算均相符才比较同id同制品；身份变化中性，坏旧输入明确失败。导出仍可能含业务名称/说明，分享前预览。

[手动Action](../.github/workflows/static-batch.yml)使用固定公开合成队列、Node24、只读权限及锁定Actions，无schedule、用户URL、目标脚本、模型调用或持久缓存；制品保留7天，绿色只表示工具执行符合预期。暂不部署远程端点或结果缓存；费用为手动CI及短期制品存储，不承诺免费。Perch仅为可选评估，未获调用授权，见`semanticRuleAssessment20261020`。

### 2.6 真实故障回归与呈现

`tools/real-regression.mjs`锁定`tools/real-regression-manifest.json`的DSH/API目录/三个真实npm制品和18项业务期望：sidebar0.26.1自然失败、0.28.0编辑与恢复、market1.66.37正常/503/客户端控件缺失与恢复。默认两轮、上限两轮，全新私有profile与缓存，无账户或模型调用；不随npm分发。

复用business driver，动作前封存预测，真值来自实际请求、DOM和磁盘；静态/service-only及自然/受控病例分开度量FP/FN，驱动错误单列，不锁死预测告警。绿色仅表示固定业务期望重现，不是生态准确率。回放核对身份、摘要、病例、封存、时序、截图及清理；旧driver无逐动作时间戳，哈希不提供防协同改写签名。每队列10分钟，先SIGTERM留15秒清理再强停；异常或清理未证实即失败，不盲删仍在用目录。

核实步骤共用`lib/finding-guidance.mjs`，按结构化类别/状态区分交付、声明、FAILED/PENDING及unobserved/unreadable/absent；不从说明文本猜状态、不臆造替代API/修复版本、不自动改配置。面板支持搜索、结论/确定性/待验证组合筛选、折叠、完整预览/复制和基线新增风险视图；无可比基线中性提示，筛选不改原报告，目标/时间/缓存状态同时可见。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`对同组已装制品联合提取一次，再按两端目录及声明策略独立判定，识别名集合取目录并集。当前/目标仅支持**0.2.0-rc.2、0.2.1-rc.2**；未知或范围版本在读输入前返回unsupported-version/退出3并提示未认证，不回退或自动升级。

输入为有界私有只读副本，经两次目录/字节/链接一致性观察；同名重复安装（含alias）、特殊文件、普通并发变化或超限明确失败。保留整体/逐插件SHA-256、目录版本/文件/来源/摘要及规则摘要；两端身份须一致。捕获上限256MiB/单文件8MiB/50000目录项/32层/10秒，worker另有10秒/512+64MiB预算，终止后清理副本；不是OS原子快照、硬实时或RSS保证。

不执行目标源码、不联网，不使用运行时、probe、loader、豁免、普通缓存或基线，也不写产品状态；仅同目标在途请求可合并，完成后重扫。保留coverage/vacuous、弃权、诊断及客户端待验证，消失或无新增不证明修复/业务通过。

独立契约`lib/upgrade-contract.mjs`：`schemaVersion:1 / kind:plugin-compat-check/upgrade-preview / mode:static-version-comparison`；状态compared/unsupported-version/error。currentReport/targetReport保留各自完整结论，changes按插件与类别/API/span列added/worsened/resolved/unchanged/improved；严重度或确定性升高可判变重。顶层退出码仅计新增/变重：**0无、1非致命、2含fatal、3无法预检**，旧风险可能仍在；ok只表示比较成功。失败证据为空，baseline/cache始终null。

CLI为`--nm <profile或node_modules> --dsh-version <当前精确版本> --upgrade-to <目标精确版本>`，仅文本/JSON，可带无操作的no-baseline；拒绝probe/boot、规则/目录覆盖、基线文件、dry-run、quiet、issue-report和profile旗标。agent用`compat_check({upgradeTo,profile?})`，宿主解析当前版本，结果为upgradePreview且普通report为null。面板显式触发独立同源GET `/plugin-compat-check/upgrade-preview`；拒绝过时当前版本、不同目标并发及损坏负载，不覆盖普通报告，卸载不返回新成功。

## 3. 开发与文档维护约定

1. 先复现再修改，不编造实测；不重建快照消除失败，版本漂移审查`test/__baseline-versions.json`并单独提交。默认suite用测试专用只读profile副本，提取/回读同字节。
2. 仅清理自有目录/PID组。安装克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径，保留远程pins；拒绝不支持格式/不安全链接，不改源profile。临时profile不隔离恶意代码。
3. 私有副本打tgz、空缓存实装并调用；文件或日志不替代业务结果。默认worker预算、工程超时负例分别维护，Python parity仅为旧参考。
4. README写用法、Plan写契约/状态/待办、current-state写按日期封存的证据；完成项从§6移§4，契约归§2、复现归§5，不逐轮新增总结。历史失败、日期、版本不追写成当前认证，同步skill及契约副本；依赖变更后用`npm run notices:generate`更新第三方说明，doc-check验证末尾License、依赖清单与全仓库Markdown链接/标题锚点。
5. 本地提交可在任务范围内完成；push、合并、npm发布和外部发帖按用户当次授权执行，互不延伸。仅stage本项路径；源码推送不等于npm发布。

## 4. 已完成的关键工作

以下证据键均位于`current-state.json.verification`，对应当时输入与制品，不代表当前全量认证。

| 工作 | 交付与证据索引 |
|---|---|
| 原始审计 / P0–P2 | AST、未知/缺失与端别、loader/profile、原子基线、统一报告、有界值流；`auditArchive20261019`，原审计4722716/npm0.1.0，仅已核范围 |
| 安全、回收与Chrome工程 | 输入/链接隔离、只读profile快照、自有进程回收与有界诊断；`engineeringDiagnostics20261019`、`linuxChromeCiAcceptance20261020`、`linuxChromeInputPreparation20261020`；原握手失败根因仍未知 |
| rc.2适配 / 发布 | 声明闸门、精确豁免、双目录、导航/HMR、规则依据复核；`rc2TargetedAdaptation`、`release013 / release014` |
| 有限批量 / 手动Action | 固定输入哈希、预算/错误隔离、作者复核、身份约束增量；§2.5/§5.4、`staticBatch20261020` |
| 产品解释 | 确定性/影响/覆盖与无已验证调用统一；§2.2/§5.5、`productExplanations20261021` |
| 真实故障回归 | 固定制品、18病例/轮、分模式FP/FN与有界回放；§2.6/§5.6、`realPluginRegression20261021` |
| 核实步骤 / 面板 | 同源建议、筛选/折叠、完整预览复制、基线视图；§2.6/§5.7、`actionableFindings20261021`、`panelExperience20261021` |
| 升级预检 | 同字节双版本静态差分、CLI/tool/UI、证据隔离；§2.7/§5.8、`upgradePreview20261021` |
| 重复身份 / YAML / 目录治理 | 同名拒绝与基线保护、仓库yaml公告修复、目录身份/摘要门禁与候选审查流程；§2.2/§2.4/§5.9、`identityYamlCatalog20261022` |
| 探针时间 / CI安全 | 有限未来时钟偏差、证据撤回与消费者说明；Actions固定提交/无持久凭据、独立依赖安全门禁；§2.1/§5.10、`probeTimeAndCiSecurity20261022` |

独立业务历史包含market1.66.37备注/收藏、sidebar0.28.0 HTTP/编辑器及0.26.1自然失败；服务观测可识别部分激活前提，受控HTTP/客户端故障仍有FN，不靠改严重度消除漏报。模型历史仅授权账户的有限短回复，usage非账单认证，本轮不新增调用。见`independentBusinessTruth`、`businessSampleExpansion`、`marketUiAndBusinessExpansion`、`naturalFailureBoundaries20261019`。

分发截至2026-10-21的记录：主目录及dsh-market映射npm0.1.4，显示名#948已合并，私有空缓存公开安装有确切制品/热加载/重启证据；1024目录已收录但Store v2仍缺npm方式；其它Awesome收录与未决项见`upstreamAcceptance20261021`。这些是按日期封存的观察，不将收录当兼容认证，不追改旧安装/线路失败。

## 5. 验证记录与复现

### 5.1 已验证范围

macOS arm64有DSH0.2.0-rc.2/0.2.1-rc.2、独立tgz、tool/skill、HTTP及真实Chrome的限定证据；Linux有arm64 VM和x64 CI，Windows未验收。当前默认计数只在current-state顶层维护，各次发布/慢测/业务/CI结果留在对应verification；旧版本成功不认证新版本，CI重打包不证明确切发布tgz字节一致。

### 5.2 日常检查与真实集成

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
npm run notices:check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
npm run security:dependencies -- --output <依赖安全证据.json>
```

默认suite不启动真实DSH或模型，打包回归的私有空缓存需registry；prepublish只检查不发布。更改真源后同步`stage-skill.mjs / stage-contract.mjs`。真实集成需DSH/pnpm及Chrome（可设DSC_CHROME），会联网安装并执行私有宿主/插件：

```bash
DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
DSC_SLOW=1 node --test test/probe-boot.test.mjs test/labels.test.mjs test/engineering-live.test.mjs test/profile-lock.test.mjs test/rc2-live.test.mjs test/business-labels.test.mjs
node tools/business-labels.mjs --live --suite market --out-dir <空目录> --json
node tools/business-labels.mjs --predictions <预测.json> --labels <标签.json> --json
```

业务suite另有sidebar/sidebar-ui/sidebar-ui-previous，编辑器可加observe-services；动作前预测与真值分离，普通业务不复制账户。sidebar-model须另获当次凭据/模型调用授权；限工具关闭、两次首步、无重试/标题、每步256token，不属默认测试/CI。所有私有profile、凭据副本、自有进程须清理；证据分享前预览。业务度量退出0无错配、1有FP/FN或不计分项、3驱动/输入错误，不同于产品退出码。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test test/engineering-live.test.mjs test/profile-lock.test.mjs test/owned-process.test.mjs test/debugger.test.mjs
DSC_EXECUTION_DIAGNOSTICS=<私有目录> node bin/compat-check.mjs --nm <目标node_modules> --probe-boot --json
```

覆盖预算/堆耗尽、受控超时与恢复、single-flight、基线争用和原子读取。Darwin负例需编译器，缺失跳过。普通诊断不含argv/env或stderr正文；私有限长脱敏诊断仍须预览。保留主错误和清理失败、workDir/PID身份，不按进程名清场；不承诺生产性能、任意脱离进程组隔离或全进程RSS。

### 5.4 有限静态批量验收与复现

2026-10-20源码ded1132的[手动Action](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39448417209)与[完整CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39448400101)通过；权限、ZIP/JSON身份及计数封存于`staticBatch20261020`。自带四项合成队列预期exit2，全部覆盖有限且待作者复核，不是业务或生态认证。

```bash
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json > next.json
node tools/static-batch.mjs --hash <本地包目录>
```

### 5.5 产品解释口径验收与复现

`productExplanations20261021`记录依赖但无已验证调用、静态入口缺失、部分未观测和实测loader/推断影响的区别，以及受控skill修订前后场景。独立tgz真实DSH/Chrome验收与组件故障案例分开，不宣称模型提升或完整业务通过。

```bash
node bin/compat-check.mjs --nm test/fixtures/labels --dsh-version 0.2.1-rc.2 --no-baseline
node --test test/cli.test.mjs test/client-structure.test.mjs test/host-structure.test.mjs test/skill.test.mjs
```

固定夹具预期exit2，入口缺失certain而影响inferred；不追改已发布0.1.4。

### 5.6 真实插件故障回归验收与复现

```bash
node tools/real-regression.mjs --live --out-dir <空证据目录>
node tools/real-regression.mjs --replay <证据根目录>
node tools/real-regression.mjs --replay <单队列证据目录> --suite sidebar-ui-previous
```

两轮固定业务/恢复、静态与service-only预测、残留自然/受控FN及篡改负例见`realPluginRegression20261021`。live需要DSH/pnpm、真实Chrome及registry，只操作私有工作文件，不复制账户或调用模型。退出0固定期望重现、1业务/证据不符、3驱动/观测错误；预测改进可由FN变TP，不锁死旧预测。

### 5.7 核实步骤与面板体验验收

`actionableFindings20261021 / panelExperience20261021`记录多条件筛选、可比/不可比基线、完整预览/显式复制与剪贴板失败，以及各类建议的证据边界。候选tgz的真实DSH0.2.1-rc.2/Chrome验收使用只扫描不激活的合成包，真实业务另见§5.6；分享报告不将静态命令当同宿主运行时复现。

### 5.8 升级前预检验收与复现

`upgradePreview20261021`封存同字节/目录变化、delta退出码、未知版本、证据隔离、竞态/超时清理及同名alias明确失败的回归；另含独立包工具执行、最终tgz的真实DSH/Chrome HTTP/DOM、普通报告/筛选保持和卸载恢复。真实新增风险用合成声明样本，前向目录变化另有核心测试，不认证未来环境业务。确切制品摘要与历史计数只查该证据键。

```bash
node bin/compat-check.mjs --nm <profile或node_modules> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
node --test test/upgrade-preview.test.mjs test/upgrade-cli.test.mjs test/upgrade-host.test.mjs test/upgrade-panel.test.mjs
```

第一条依输入返回0/1/2/3，无新增风险仍可能有原有风险；真实界面复现使用§5.2的rc2-live，不预设用户环境通过。

### 5.9 重复身份、YAML与目录治理验收

`identityYamlCatalog20261022`记录同名同/不同版本、安装顺序及健康/故障组合的明确失败，CLI/worker/宿主/agent与基线保护；yaml升级至2.9.1修复[GHSA-48c2-rrv3-qjmp](https://github.com/eemeli/yaml/security/advisories/GHSA-48c2-rrv3-qjmp)，深嵌套/畸形/别名输入受控拒绝、锁重定位与清理，第三方说明同步。公告影响仓库工具，不是npm插件运行时依赖。目录覆盖精确/回退/自定义身份、摘要篡改、未知/未来版本、各端呈现及候选ASAR来源/API差分；来源核对通过仍待规则语义复核和真实验收，不自动授予认证。具体测试、audit及候选tgz/真实DSH/Chrome结果见证据键。

```bash
node --test test/duplicate-identity.test.mjs test/profile-lock.test.mjs test/catalog-governance.test.mjs test/catalog-review.test.mjs
node tools/catalog-review.mjs --before rules/dsh-api-catalog.json --candidate <候选目录.json> --asar <对应app.asar> --json
npm audit --package-lock-only
```

### 5.10 探针时钟与CI依赖安全验收

`probeTimeAndCiSecurity20261022`封存固定时钟边界、未来/过期/非法时间及身份绑定回归；CLI JSON/文本/quiet/分享报告、probe-boot清理、宿主HTTP/agent/客户端与独立候选真实DSH/Chrome拒绝和恢复证据。只撤回该文件探针证据，不将异常时钟认作插件不兼容，也不补造真实采样时间。

[Test工作流](../.github/workflows/test.yml)与静态批量工作流统一使用经官方仓库核对的完整Actions提交，checkout不持久化凭据，contents只读、任务有时限、证据保留7天。独立依赖安全任务分别审计包含开发依赖的冻结根锁及插件runtime依赖图；任意级别公告均阻断，registry/解析/工具失败单独阻断，不自动audit fix或忽略公告。范围、来源和处置方法见[依赖安全说明](dependency-security.md)。本地语法、命令及故障回归与远端运行分开记录；本次未推送，不冒充远端CI已验收。

```bash
node --test test/observation-time.test.mjs test/observation-time-integration.test.mjs test/dependency-security.test.mjs
npm run security:dependencies -- --output <依赖安全证据.json>
```

## 6. 后续工作

按紧迫性、结论可信度、宿主可用性及交付价值排序：P1优先处理，P2随后扩展或等待外部条件。已完成项已归档§4/§5，以下保留尚未完成的问题、优化、功能及外部待办；优先级不是安全漏洞评级。列入计划不等于已授权发布、联系他人、执行用户插件或调用账户/模型。

1. **P1：将升级预检输入捕获移出宿主主线程。** 捕获、双次读取、哈希和清理目前包含同步IO，发生在分析worker之前。纳入受控worker或等效可中断任务，保留同字节、身份、预算及自有目录清理保证。用大包、慢输入、超时、卸载与并发案例核验宿主响应、任务回收及后续恢复，不通过放大预算消除失败。
2. **P1：修复关键问题后交付下一版。** 源码的解释、核实步骤、面板及升级预检尚未进入npm。先完成已确认缺陷修复与本版阻断检查，再整理准确变更说明、迁移/限制提示、确切tgz及公开安装验收；不把可选功能全部完成作为修复版前提。源码、候选与公开版本分开记录，npm/Release发布另获授权。
3. **P1：扩大独立真实插件回归样本。** 在现有固定队列之外加入未参与规则调优的插件、版本及不同源码/声明形态；重复运行不计作新增独立样本。先封存预测再取得请求/DOM/磁盘真值，分模式记录FP/FN、驱动错误和覆盖限制，不以调严重度或锁死旧预测消除漏报，不宣称生态准确率。
4. **P1：小规模真实用户试用。** 观察插件作者及普通用户完成“安装→理解报告→定位问题”，记录误读、定位失败、误报及分享障碍，形成可复核反馈和改进项；不以下载/star替代使用效果。可基于已验证候选开展，但联系、收集、公开现场资料分别取得授权，不默认增加遥测。
5. **P2：插件变化后主动失效普通报告缓存。** 结合安装、更新、启停事件或轻量身份指纹刷新，后台完成后更新界面并保留筛选，明确旧结果与刷新失败。验收插件/DSH/规则/观测身份变化、事件风暴及并发，避免跨目标复用；不把普通缓存引入静态升级预检。
6. **P2：增加可选的功能健康检查。** 针对静态分析难以识别的HTTP/DOM等业务故障，评估作者提供的声明式检查步骤，在明确授权的独立环境中执行，静态风险与功能实测分栏。先以现有正常/503/控件缺失/恢复病例验证增量收益；作者声明不自动获得信任，不默认执行用户插件、访问网络或调用账户/模型，私有profile不冒充OS沙箱。
7. **P2：增加依赖关系与故障传播视图。** 展示插件所需服务、候选提供者、条目状态和受影响插件，帮助定位成串PENDING。区分必需、可选、子作用域及host/client，提供者声明只作线索；验收依赖环、多个提供者、禁用及未知状态，不凭图连线判定缺失、可用或自动安装依赖。
8. **P2：增加发现的人工处置记录。** 支持待确认、已复核、误报、已修复及依据，绑定适用插件/规则版本；身份变化后提示重新复核。与原始内核结论、schema2基线和compatibility豁免分开，不能因标记已处理就隐藏新风险；验收跨版本失效、记录损坏及报告呈现。
9. **P2：提供作者CI策略、标准输出与兼容矩阵。** 在现有JSON/退出码之上支持按新增风险、确定性及覆盖条件设门禁，评估SARIF/JUnit导出和多个已知DSH版本的矩阵。验收源码位置、身份及退出码与内核一致，未知/工具错误/覆盖不足不伪装成通过；矩阵只使用已支持目录，不将退出0视为业务认证。
10. **P2：跟进上游验收。** 按`upstreamAcceptance20261021`及后续状态复核：dsh-market#932已关闭（1.66.43增加packument回退），但双端查询失败且无显式版本仍无提示裸名安装，待明确告警或安全失败后复验；1024#22待维护者回复及v2 npm方式后全新实装；0xsline#717待采纳。外部条件有变化才更新验收，不重复发帖，外部补充另取授权。
11. **P2：Windows真实验收（依环境条件暂缓）。** 取得环境后实跑路径、安装器、回收及打包，核查平台特有差异、失败诊断与自有资源清理。依用户选择暂缓，不用POSIX结果或模拟充数；未完成前继续保留Windows未验收边界。
