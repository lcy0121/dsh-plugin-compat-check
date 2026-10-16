# 开发计划与维护约定

更新于2026-10-16，适用于`dsh-plugin-compat-check`的0.1.1候选版。P0真实集成验收、三项P1及§6两小项、有界P2分析及Linux/资源工程验证已完成，0.1.1候选源码尚未发布npm；后续工作见[§6](#6-后续工作与发布)。

本文只维护现行约束、关键决策、验证边界和下一步。用法与目录见[README](../README.md)，测试及环境事实以[docs/current-state.json](current-state.json)为准；原始问题见[历史审计](GPT审计及重构方案文档.md)，旧提取器反例见[extraction-findings](extraction-findings.md)。详细施工过程从Git历史查阅，不再逐轮累加报告。

## 1. 项目定位与交付状态

帮助DSH使用者判断**已安装插件与当前DSH版本是否兼容**，给出冲突位置、证据和影响。兼容声明、成功激活、客户端到货分别只能证明对应环节，不能代替功能验收。

| 入口 | 职责与边界 |
|---|---|
| DSH插件 | 默认检查当前profile；在官方插件管理页显示总览、详情和角标，`compat_check`提供结构化报告。默认不联网、不装包、不启动子进程，只写自身状态 |
| 仓库CLI及安装检查 | 静态检查可在宿主无法启动时使用；显式`--probe-boot`或安装检查会安装依赖、启动宿主并执行目标插件。可检查安装前闸门，但不能将其宣传为插件自身能力 |
| skill | 指导agent调用同一工具，不另实现判定逻辑 |

三者共用一份Node内核和版本真源`lib/version.mjs`。npm包只提供插件，不带CLI bin、安装检查shell或probe入口；仓库根是private工作区，候选包从`plugin/`打包。`prepack`暂存完整内核与skill，`postpack`移除临时kernel。

公开状态的最近一次联网核验为2026-10-15：GitHub main=`4722716`，npm latest=`0.1.0`，本地=`0.1.1`；简介、标签、主页和Awesome收录已核对。`meta-check`当时无error，五项notice来自未发布版本、描述、依赖、keywords和README差异。**这是历史快照，发布前须重新查询；本地修改不会自动更新公开包。**

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- 内核使用Babel JS/TS AST、词法绑定、逐调用源码span和有界包内源码图。实际入口的Context绑定与普通同名`ctx`推断分开；赋值、`delete`和遮蔽会影响别名与守卫。默认静态分析不执行目标源码。
- 服务状态区分`present / absent / unobserved / unreadable`；未采样、目录未收录、访问器未读取都不能直接推成不存在。官方目录是版本相关线索，不是完整运行时面。
- 调用保留host/client/shared归属；客户端证据不能拿宿主面判缺失。方法规则优先使用自身layer，其次服务layer。提供声明只是提供方线索，不能遮住明确的方法观测。
- 静态、文件probe、进程内观测分模式；结果一致要求目标、DSH版本、规则和采样证据一致。其它profile不能借用当前宿主服务。
- 现代probe绑定profile、DSH版本和时间，默认有效期24小时；旧格式只使用明确键并标记未绑定。采样读取描述符，不调用getter。
- 已支持常量计算属性/解构、同步函数参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名及调用、空handler的透明Proxy。跨函数扩展只使用已证明的Context/服务；猜测绑定仅保留原文件证据和诊断。未知动态键、trap/逃逸、异步返回、递归及分支歧义不猜归属。可变对象按身份保留别名；赋值按求值顺序更新，删除、未知键写入、嵌套逃逸与handler变化会撤回失效证据。Switch/Try、异步副作用及default/rest参数采用保守合并或显式弃权，不能把末次遍历结果当成事实。分析不完整、弃权和客户端未验证必须留在报告中；不能通过删文件、丢调用点或重建快照让结果变干净。

跨函数分析最多256次相关调用、16层调用、32层导出链和64节点闭包相关图；可达逃逸图最多128节点，超限撤回剩余归属证明；常量求值最多512次调用、字符串展开上限8192字符。达到上限留下诊断并标记limited，不提高worker超时来换取覆盖。普通静态扫描的文件/字节预算继续适用。

### 2.2 结论、影响与基线

每条发现保留类别、位置、依据、严重度、影响及确定性。API源码发现通常能定位`file:line`；loader或声明发现可能没有源码位置。

| 字段或证据 | 解释 |
|---|---|
| `certain / suspected` | 对该条发现的证据确定性；不能仅因有runtime就把所有发现标certain |
| `impactBasis: measured / inferred` | 实测影响与推断影响分开；loader实际FAILED/PENDING可作为实测，方法缺失的业务影响通常仍为推断 |
| 运行时FAILED/PENDING | 可映射且启用的条目形成fatal发现；停用、LOADING或无fiber不冒充故障 |
| 依赖/方法缺失 | 结合硬软依赖、调用和守卫判定；未知方法影响落默认“影响面未知”，不编造业务后果 |
| 声明 | 官方peer范围用semver核对；`engines.dsh`仅作建议。声明冲突不等于实测加载失败 |
| `coverage / vacuous` | 说明验证范围；零验证调用的ok不能显示为完整正常证明 |

严重度与影响由代码和`rules/severity.json`决定，LLM不参与判定。`try/catch`是错误处理，不是能力守卫；只有控制该调用的能力检查或可选调用等证据才能用于过滤。

基线为schema2，按profile、路径、模式及判定身份隔离，在锁内比较并原子写入；分析不完整不推进。升级或身份变化中性处理，不自动视为改善；严重度、确定性和位置变化参与差分。schema1或损坏、语义矛盾的schema2不比较。任何变化均可打角标，并标方向；“没变化”不等于“兼容”。异常遗留锁需确认没有写进程后再清理。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是浏览器可用的运行时校验及JSDoc真源，覆盖观测、发现、覆盖、报告、envelope和基线。

| 消费通道 | 结构 |
|---|---|
| CLI `--json` | `schemaVersion: 1`、`kind: plugin-compat-check/result`；含`ok/error/exitCode/toolVersion`及完整`plugins/summary/observation/baseline/extraction/inputs` |
| HTTP | `schemaVersion: 1`、`kind: plugin-compat-check/report`；`report`复用完整本体，外层保留宿主路径、缓存等元数据 |
| `compat_check` | 保留`summary/nodeModules/hasRuntimeSurface/text`，并返回完整`report/baseline`、版本、错误码和cache；`output.schema`同步声明 |
| 面板 | 渲染前校验负载；损坏、缺证据或不支持版本明确提示无法读取，而非显示成无发现 |

兼容性退出码：0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定。CLI参数/路径错误在JSON模式下也只输出一份错误JSON；安装器的gate-rejected等编排状态另有包装，HTTP传输错误也不当作插件结论。

校验要求摘要、结论、严重度、退出码、coverage、源码span及已知观测身份自洽，并检查嵌套台账和基线条目。未知新增字段保留；不兼容变更须升schema。新面板拒绝缺少新头部或必需证据的旧负载，提示刷新并对齐宿主/插件版本；旧probe的未绑定兼容策略不变。

`plugin/lib/report-contract.js`和客户端内联校验均从真源生成，不手改副本。`stage-contract.mjs --check`及文档核验拦截漂移，prepack自动同步。缓存仍复用最近成功报告、后台失败保留错误状态；缓存与后台错误展示体验未在本轮重做。

### 2.4 DSH接入要点

以下来自0.2.0-rc.2源码和既有现场验证，DSH升级后需重新核实：

- UI使用`settings.plugins.tab`、`plugins.detail.section`和`.badge`，不重造官方插件清单。`plugins.item`缺少可靠插件身份，不用于本产品总览。验证应确认组件实际渲染，不能只找页面上的同名字符串。
- `dsh.client.platform`必须为web；客户端inject声明其它插件包名。入口由`exports["./client"]`提供预构建的`window.__ModuleLoader__.load({id, factory})`模块，宿主不代构建。
- `ctx.loader.entries()`是可迭代对象，不保证是数组；条目id不是包名，必须映射完整身份。状态码0–5依次为PENDING、LOADING、ACTIVE、FAILED、DISPOSED、UNLOADING。只有FAILED通常能取失败原因；PENDING不能靠`fiber.await()`读出异常，import失败还可能没有fiber。
- 空inject用于避免体检插件自己因缺服务停在PENDING。不要读取要求inject的`fiber.store`来假装全知；探针按显式服务清单采样。Cordis scoped Context须在有效作用域内使用，不把失效Context留给定时器。
- 工具schema的`required`为顶层数组；skill provider须与注册名一致。插件包内skill不会自动扫描，需运行时注册，交付契约见[skill说明](../skill/README.md)。
- profile身份按实际启动参数解析，兼顾`--profile`与桌面位置参数；不能依赖可能过期的`DSH_PROFILE`环境变量。`ctx.settings.register`在本次版本不存在，但不能据此猜其它方法也不存在。

## 3. 开发与文档维护约定

1. **先复现再修改。** 修复须有能失败的反例；验收覆盖目标行为，不以邻近工作完成代替本项完成。代码、证据与计划冲突时修改计划，不能改证据凑结论。
2. **审查输出差异。** 不变式检查自洽，判据检查预期结论，快照检查变化；不以重建快照消除失败。基准版本漂移须有意更新`test/__baseline-versions.json`、复核判据并单独提交。
3. **保护宿主。** 昂贵分析使用有时间和内存上限的worker；失败明确报告，不能无限阻塞，也不能用空catch或空清单伪装成功。声明、提供方、缺失方法和loader事实分别保留。
4. **管理现场所有权。** 私有UUID目录和独立DSH_HOME不等于OS沙箱。显式安装/probe会执行插件；只清理自己创建的目录和进程组，不按进程名杀用户服务。保留诊断时用显式私有目录，不留运行进程或认证URL。
5. **从产物验证交付。** 在拥有的源码副本中打tgz，安装后实际调用工具；文件清单或前端到货不能证明内核可用。复制profile时排除node_modules，重定位manifest及pnpm9锁文件中的本地file/link路径，保留远程版本和完整性；不修改正式profile。未知锁版本、多importer、不安全锁文件或profile内非node_modules符号链接明确失败。
6. **控制变更与发布。** 未经明确授权不push、合并或发npm；本地提交可以，只stage本项路径，不用`git add -A`。提交身份使用`Chenyu Liu <233006721+lcy0121@users.noreply.github.com>`。
7. **保持文档单一职责。** README写用法/目录，Plan写约束/状态/待办，历史审计与提取反例保留原输入，current-state记录可核验事实。更新Plan时替换旧状态，不再追加一份重复总结；GitHub简介/标签/主页、npm README也属于文档核验范围。

Python parity仅保留旧实现的历史比较价值，不能作为AST正确性的真值；旧bash参考不随重构破坏。不要把历史正则召回率、到货数、疑似比例或`no-calls/abstained`占比当作当前产品准确率。

## 4. 已完成的关键工作

施工详节与旧方案可查Git历史；下表保留对后续维护有影响的结果。

| 阶段 | 结果及验证重点 |
|---|---|
| 0.1.0交付（2026-10-12） | 完成Node内核、插件宿主/客户端、工具、skill、自动触发和基线，发布npm0.1.0；该版本不包含后续本地修复 |
| 0.1.1审计重构（2026-10-14至15） | AST及有界源码图替代正则；分离观测、依赖、双端、声明及loader证据；基线schema2、worker/缓存、私有运行器、CDP pipe及独立tarball验证。覆盖原审计B01–B14和S01–S03；复核及版本测试记录见current-state；历史安全扫描为部分覆盖，不构成全量认证 |
| P0真实集成（2026-10-15） | 验证实际tgz安装、tool/skill、面板/详情/角标、基线、浏览器正反例及退出码矩阵；修复预创建profile、裸目录漏kernel、相对本地依赖和共享打包争用四类问题 |
| P1辅助度量真值隔离 | 原始loader标签独立采集；预测只读服务证据并关闭自动发现；修复错误类型、身份冲突及继承旧版本问题，保留真实漏报而不调判定器求满分 |
| P1规则质量 | 复核needsReview并刷新分端AST库存；删除无依据影响，修复跨端规则泄漏及继承属性冒充规则。官方web观测不借给desktop库存 |
| P1契约稳定 | CLI/HTTP/tool/UI共用报告本体与单源校验；独立复核后修复嵌套损坏、虚假基线改善、观测绑定与零证据覆盖矛盾，验证生成副本漂移和真实产物 |
| 两小项及P2（2026-10-16） | semver写入校验、到货文本一致；有界AST值流支持常量键、参数/返回值、闭包、模块别名及透明Proxy，保留精确位置、端别与确定性。快照新增两处经源码核对的llm.stream与绑定台账；原基准结论及客户端证据保留 |

规则复核的具体决定：`sessions.open`保留为client旧回退路径规则；删除`sessions.getSnapshot`、`settings.get`、`sessions.map`的无依据影响；`sessions.refresh`不新增规则；**`attachments.readImage`虽未列入目录，官方实现和运行时均存在**，保留其读取路径规则。决定、源码摘要及采样身份见`rules/severity.json`的`needsReview.reviewed/evidence`，`items`已清空；客户端运行时仍未全面验证。

desktop库存为21插件的**部分静态样本**：50服务、125分端方法对、88规则命中。源码预算与缺失CSS导致扫描不完整，诊断保留，不能与旧61%比较；AST摘要也不是整包完整性证明。写库存要求显式或观测到的合法semver版本；部分扫描需审查后加`--allow-partial`。不再使用历史误报黑名单删除真实AST调用。

仍应保留的教训：

- 不只按声明客户端入口收窄扫描：真实懒加载chunk可能由宿主路由提供，入口可达性不能穷尽它。
- 不靠同名变量或方法黑名单判API归属；同名Map、vendored ctx曾制造假方法，须依赖绑定证据。
- 不把未捕获的provide当成“自有服务”：须区分宿主提供、其它插件提供和无人提供。
- 不拿干净日志当客户端成功：缺客户端文件可阻止宿主启动；文件存在但import抛错可使浏览器显示错误屏。
- 不承诺全部静默降级召回率：其分母依赖各插件业务测试，只在有独立标签的有界样本上计分。

## 5. 验证记录与复现

### 5.1 已验证范围

2026-10-15现场环境：macOS arm64，DSH0.2.0-rc.2，宿主Node24.18.1，运行器Node26.11.1，Chrome155.0.8059.41。现场测试均使用私有环境，正式profile未改，未发送模型对话；后续Linux CI另列。

| 证据 | 覆盖范围与限制 |
|---|---|
| 实际tgz、真实宿主 | 插件激活、内核、`compat_check`当前/其它/错误profile、skills.list/get；skill正文与源码一致。安装检查实测0/1/2/3，包含peer闸门与无效安装来源 |
| Computer Use | 面板、详情角标、重新检查、FAILED/PENDING、基线变化与稳定刷新；P1另确认受控settings.get报告、HTTP/tool核心字段及正常/错误profile结构 |
| Chrome到货 | 正常例66/66且后端报告可用；缺文件阻止启动、import抛错由浏览器检出。到货与这些交互不代表全部业务功能正确 |
| 本机回归 | 默认套件最新结果见current-state；2026-10-15联合31项通过，其中24项离线、7项真实DSH/Chrome。格式、文档与发布前检查通过；手工及自动现场均按所有权清理 |
| Linux CI（2026-10-16） | [GitHub Actions](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/38787562650)在Ubuntu通过Node22.19.0/24的依赖安装、格式和发布前闸门；对应修复6a919cb。修复打包测试强制离线依赖历史缓存的问题，并补全失败日志。未启动真实DSH/Chrome；该次CI不覆盖本轮P2新增代码 |
| P2工程（2026-10-16） | 本地Ubuntu24.04.5 arm64虚拟机已通过真实DSH0.2.0-rc.2及资源验收，详见§5.3。与上行历史GitHub CI分开记录 |
| 其它环境 | 本机Node22.19.0/26.11.1默认套件通过；Linux另实跑Node24.21.0。Windows按用户选择待验收；Linux x64真实DSH及其它DSH版本未验收 |

P2分析阶段（2026-10-16）的460项在Node22.19.0/26.11.1通过；联合127项通过，其中120项离线、7项真实DSH/Chrome，私有环境按所有权清理。最终复核的10类重要问题均通过失败反例修复，P2有86项有界回归（含28项复核反例/变体）。

21例固定调用归属队列，相对1905662从TP0/FP0/FN14变为TP14/FP0/FN0，4例未知动态行为均留下对应诊断。队列含从已安装dsh-pet最小化的llm参数转发形态，数字只说明这批反例，不代表生态准确率。

只读desktop21插件样本原有554调用点/125分端对；最终为475/121，新增转发证据的同时，控制流、变更和逃逸上的保守弃权撤回了无法证明的调用，相关诊断保留。样本仍不完整，不用数量变化代表准确率；默认worker约3.65秒完成（单次本机观察，预算10秒），不是性能基准认证。规则库存文件仍保留2026-10-15原采样，不把新计数回填成旧证据。

辅助度量的四个受控病例：broken-service=PENDING且预测fatal（TP）；healthy/real-service=ACTIVE且无fatal（TN×2）；failed-apply=FAILED但无fatal预测（FN）。TP1/FP0/FN1/TN2，精确率1、召回率0.5，退出1；最后一例故意在激活时抛错，暴露任意插件逻辑故障的预测盲区，**不是生态准确率**。

独立标签文件`loader-labels.json`保留原始数值状态，与`probe-report.json`共享sampleId、profile、版本和时间；不用生产映射或manifests裁剪标签。只按完整包身份计分，任一启用PENDING/FAILED为正例，全部启用条目ACTIVE才为负例；停用、组、瞬态、无fiber和无法映射项不计分并列出。输入类型、配对、时效、版本或源码完整性失败，以及没有可计分样本，均退出3；指标分母为空时对应指标为null。度量退出0表示有样本且无FP/FN，1表示有误报或漏报，不是兼容性CLI的0/1含义。

### 5.2 日常检查与真实集成

从仓库根运行。文档及契约校验不递归运行测试；同一成功TAP用于更新和核验统计。打包回归从私有空npm缓存安装实际tgz，需要访问npm registry；npm ci有tarball缓存不代表离线安装所需元数据齐全。发布闸门失败须保留TAP及文档错误详情，不能只报“拿不到摘要”。

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs

# 修改对应真源后同步，再检查差异
node plugin/scripts/stage-skill.mjs
node plugin/scripts/stage-contract.mjs
node plugin/scripts/stage-contract.mjs --check

# 有意更新快照前，先审查差异与基准版本
UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs
```

真实集成需DSH、pnpm和Chrome，`DSC_CHROME`可指定可执行文件；默认套件不启用慢测试。脚本创建私有DSH_HOME并清理拥有的进程和目录；npm缓存不可写时将`npm_config_cache`指向可写私有目录。

```bash
DSC_SLOW=1 node --test --test-reporter=tap \
  test/contracts.test.mjs test/rule-quality.test.mjs test/labels.test.mjs \
  test/probe-boot.test.mjs test/client-arrival.test.mjs

# 辅助度量：文件模式必须同时提供配对服务报告和原始标签
node tools/labels.mjs --nm <目标> --probe-boot --json
node tools/labels.mjs --nm <目标> --probe <probe-report.json> --labels <loader-labels.json> --json
node tools/labels.mjs --nm web --synthetic --json
```

手工界面操作、真实tool/skill调用及完整退出码矩阵须另行验收，不能视为默认套件已自动覆盖。synthetic从官方web模板初始化，不要求已有正式web；`--keep-dir`只保留显式私有诊断，不保留宿主或临时profile。手工启动使用`dsh --profile <p> -- --port 0 --no-open`，先在自己的DSH_HOME初始化；宿主不会自行退出，必须按拥有的PID收尾。

### 5.3 P2工程验收

2026-10-16在macOS arm64及临时Ubuntu24.04.5 arm64（QEMU、Linux6.8.0-142、Node22.19.0/24.21.0、DSH0.2.0-rc.2、pnpm11.25.0）实跑。使用私有目录、实际tgz及受控输入，不发送模型对话；本机Node22/26默认各481项、真实集成22项通过；Linux两版默认各406项通过、1项因缺少外部parityfix跳过，真实集成18项通过。具体耗时和版本见current-state的`engineering`。Linux实测发现并修复了复制pnpm锁文件后本地路径失效的问题；结构化迁移由仓库专用yaml2.8.1完成，不增加发布插件依赖。

工程脚本覆盖2402文件/约50MB源码的预算弃权、220ms超时、32MiB受控堆与默认512MiB实际提取器堆耗尽/恢复、64请求single-flight、8进程192次基线争用及原子读取。真实宿主另验证4000函数输入下，3个并发刷新期间仍可读取有效缓存报告；成功响应必须发生在刷新尚未结束时。取消命令会等待自有子进程退出并回收管道，组长退出后仍完成同组进程的升级终止；这不构成任意派生进程的OS隔离。V8堆限制也不是全进程RSS或外部Buffer上限，单次合成耗时不是生产性能认证。

```bash
node tools/engineering-check.mjs       # JSON指标；私有输入，无需DSH
DSC_SLOW=1 node --test --test-reporter=tap test/engineering-live.test.mjs test/profile-lock.test.mjs
```

独立复核发现1项进程生命周期问题，已用3项回归修复：管道先关闭、宿主已被信号终止、组长先于忽略TERM的同组后代退出；修复后各平台套件及真实集成重新通过，临时VM与密钥已删除。保留1项低优先级改进：为超时度量增加任务已启动断言及宽松的耗时上限。

GitHub工作流已加入同一工程脚本及固定官方DSH/pnpm的Linux真实验收，并保留失败TAP/指标产物；**远程结果须核对对应提交的GitHub Actions，不能用本地验证或历史CI替代**。Windows按用户选择保留待验收；Linux本轮是arm64本地VM，尚不代表x64现场或其它DSH版本。

## 6. 后续工作与发布

两项P0、三项P1及本轮有界P2分析扩展已实施；下表保留验收口径和剩余工作。真实反例队列继续维护，Windows验收与发布仍单列；不再另设roadmap。

| 优先级 | 工作 | 完成条件 |
|---|---|---|
| 小项 已完成 | coverage写入版本语法 | 显式/观测版本均经semver校验；非法输入退出3、不覆盖原库存，预发布及build版本保留来源记录 |
| 小项 已完成 | 到货工具文本提示 | 按实际expected判定负向对照；非预期失败文字与退出码一致，普通摘要展示compatibility.error |
| P2分析能力 已完成 | 动态属性、工厂/代理、跨模块别名与调用 | 反例队列及支持边界见§2.1和§5.1；新增能力先以失败用例验证，再检查精确归属、端别、守卫与覆盖限制。未知输入继续加入队列，不宣称通用JS分析完备 |
| P2工程验证 本阶段完成 | Linux与资源边界 | Linux真实DSH、实际tgz/HTTP响应及大包/超时/堆耗尽/并发基线场景通过；持续工作流及范围见§5.3，远程CI按对应提交核验 |
| P2工程 待改进 | 加强超时度量断言 | 断言受控任务在超时前确已开始计算，并增加宽松的总耗时上限；保留主线程响应、worker停止及后续提取恢复检查，避免依赖精确计时 |
| Windows 待环境 | 路径、进程清理与安装器 | 按用户选择暂缓；取得真实Windows环境后实跑，不以POSIX或路径模拟代替 |
| 发布 | 同步GitHub与npm候选 | 获得授权后推送/合并/发布，并核验registry产物和公开文档；发布前不声称0.1.1已可公开安装 |

发布顺序：

1. 核对`lib/version.mjs`、plugin/probe/slot-probe包版本及说明；有意处理基准漂移，不用重建快照掩盖错误。
2. 按§5运行默认检查、刷新事实及发布前闸门；代码或环境变化时重跑真实集成和必要手工验收，记录输入与边界。
3. 运行`node tools/meta-check.mjs`联网核验GitHub简介/标签/主页、npm版本/README/依赖/keywords；不可联网则记录未核验，本地候选领先属于notice。
4. 经授权推送/合并，在`plugin/`执行`npm publish`并完成npm认证。发布时同步候选README措辞，不提前删除未发布说明。
5. 核验registry版本、README、依赖和tarball，更新§1公开状态与current-state。旧审计及提取反例继续保留历史身份，不改写成当前认证。
