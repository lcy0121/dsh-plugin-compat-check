# 维护指南

本文维护**0.2.4**的目录、规则、依赖与验收流程。操作/限额见[指南](guide.md)，契约及未完成事项见[Plan](Plan.md)，限定证据及实际发布状态见[current-state](current-state.json)。历史成功不认证新制品。

## 维护入口与语法覆盖

```sh
npm run check
npm test -- --test-reporter=tap > /tmp/dsc-tests.tap
npm run test:issues -- /tmp/dsc-issues
```

check离线核格式、文档/版本/链接、生成副本、许可证、语法矩阵及目录登记，不运行完整套件。test:issues必跑#7–#10回归及原始官方JSON/schema校验器，固定rc.5来源URL/SHA256；缺归档时有界下载，坏来源或跳过均失败。DSC_HOST_SOURCE_ARCHIVE可指定已有归档，CI在Node22/24均执行并保留TAP/摘要；成功TAP交给doc-check，宿主另验。

宿主`plugin/index.js`编排加载/资源，`plugin/lib/host-{reports,reviews,http,upgrade,history}.js`分管各接口；`lib/review-sidecar-cache.mjs`仅缓存已校验派生上下文，不授权保存。客户端真源为`plugin/src/client.jsx`、`panels/`、`components/`和`styles.css`，纯契约/workflow共享`lib/*.mjs`。

`npm ci --ignore-scripts`后运行`npm run build:client`，`check:client`核对可复现字节。prepack调用stage-contract生成3份启动契约及客户端，打包内核以重导出共用宿主契约。不要直接改`plugin/lib/client.js`；移除模块须复验独立tgz、worker及普通/升级tool。React来自宿主，Tailwind禁preflight、样式限定`.dsc-ui`；组件改动同步[来源/MIT](../plugin/src/components/ui/PROVENANCE.md)、主题/键盘/窄容器验收。

UI词典位于`plugin/src/i18n/{zh,en,ko}.json`，用可读原文作为消息键，插值必须保持`{pN}`及重复次数；构建将各语言的重复键替换为短ID，保留中文原文供内置状态映射。`runtime.mjs`共享宿主lang观察和本地偏好，`locale.jsx`使各槽位及memo面板更新；不得按语言设置React key或重建编辑器。只对固定UI/已知内置状态调用翻译，原始发现、用户依据、命令和JSON不得按词典全局替换；故障报告仅翻译共享渲染器的模板、已知固定说明及核实建议。新增文案须补齐三词典、ARIA及覆盖测试，不能更改后端契约或结论。

打包回归与真实验收/到货工具经`tools/owned-package-source.mjs`核对manifest/lock/构建依赖，复制自有闭包到私有构建目录，不向源码、用户profile或运行包注入工具链。打包回归核源码客户端mtime不变，避免prepack重写与并行面板读取竞争。selector-parser固定覆盖7.1.6；更新Tailwind/覆盖后须重建、复验布局/主题及开发/运行两图审计。

完整UI验收使用同一独立tgz及自有DSH/Chrome；默认rc.3，当前rc.5须显式选择：

```sh
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.5 node tools/ci-ui018.mjs <自有输出目录>
```

入口统一启用九项验收：原面板、布局/主题/键盘、分页/完整导出、超时恢复/草稿、HTTP会话、复杂度/采样、处置定位、历史管理和中英韩国际化。检查第123条发现的双向定位/筛选/焦点、12px间距、短结论不折字、历史显式操作及报告/基线不变；密集数据来自明确标记的非激活合成插件。截图中的窄列CSS夹具不冒充真实插件布局。开关依赖以入口源码为准，单跑处置定位须同时启用hardening。

输出含提交/dirty/逐文件摘要、tgz摘要、完整报告、日志、截图及SHA256SUMS，缺结果/截图或清理失败均不得通过。使用忽略的tmp或仓库外目录，避免证据进入源码身份；CI要求干净检出。Linux rc.3/rc.5跑完整入口，另两宿主保留集成门禁；平台结果绑定实际提交和归档，不由接入CI推定。`ui018`文件名、`DSC_UI018_*`及证据字段沿用以兼容脚本，不代表产品版本。Windows、真实用户和一般业务另验。

组件回归覆盖三槽位、共享订阅/可见性及迟到响应；`tools/ui018-performance.mjs`仅测1000插件合成hook树，不是浏览器性能门禁。语法矩阵由`test/fixtures/syntax-matrix.json`和`tools/syntax-matrix.mjs`记录/执行supported、inferred、abstained、excluded，核包名、调用对/跨度、确定性与诊断，不以解析成功代替结论或据业务答案调严重度。

旧实验见`10213c0:docs/maintaining.md`；Python对拍已由AST图/矩阵/快照替代，历史观测`test/fixtures/host-surface-parityfix.json`仍用于回归。独立正则不是判定真值。

## API目录候选审查

仅`lib/contracts.mjs.CATALOG_REFERENCES`登记的精确版本/字节获目录认证；声明最低版本、相邻版本、目录文件名或空API差分均不认证新宿主。普通检查可回退参考目录但保留未认证提示，升级预检拒绝未登记版本。

1. 使用稳定官方源码/安装归档，记录渠道、日期、精确版本、平台架构、包及app.asar摘要；审查者核实官方来源，工具只核对本地候选与归档一致性。
2. 显式提取到私有新目录，只读代码文本、不执行JS/插件。最低服务数量或格式检查失败时调查并补回归，不删检查求绿。
3. 离线验证来源与API差分，再人工审查签名、生命周期、权限、分端和注入前提；无命名差异也须做语义审查。
4. 按对应DSH/平台、独立profile/Chrome验收激活、双端调用、HTTP/DOM、故障恢复、身份及清理；未观测项保持未验收。
5. 审查/验收完成后独立提交目录、CATALOG_REFERENCES、选择策略与SUPPORTED_PREVIEW_VERSIONS，同步契约/文档，保留旧目录及回退路径。

`0.3.0-rc.1`仅为未认证候选示例：

```sh
review_dir="$(mktemp -d "${TMPDIR:-/tmp}/dsh-catalog-candidate.XXXXXX")"
asar='/绝对路径/目标版本/app.asar'
candidate="$review_dir/dsh-api-catalog-0.3.0-rc.1.candidate.json"
shasum -a 256 "$asar" > "$review_dir/app-asar.sha256"
python3 -I tools/catalog/extract-host-api.py "$asar" "$candidate"
node tools/catalog-review.mjs --before rules/dsh-api-catalog-0.2.1-rc.3.json --candidate "$candidate" --asar "$asar" --json > "$review_dir/catalog-review.json"
```

候选须有_dshVersion、固定双端_source路径、原始字节_sourceSha256及方法列表。检查重新提取版本、路径、摘要与API内容，给出两目录SHA-256和稳定排序的双端增删。退出0只表示sourceVerified，semanticReview/integrationAcceptance仍pending、certification为not-granted；退出3是参数/输入/来源/内容/资源或提取错误，不能当无差分。

工具不改输入或支持范围：JSON各2MiB、ASAR4GiB/头8MiB、三个选定packed条目各8MiB；拒绝链接、FIFO、特殊文件及越界。Python隔离子进程10秒、输出1MiB，回收后清自有临时目录。前后身份不是原子快照、签名、防协同篡改、硬实时或RSS保证；使用稳定归档。

保存来源/差分/语义结论、审查人/日期及验收范围，分享前检查隐私。`npm run check:catalogs`核对登记字节、选择策略、预检集合及语义结构，不自动认证候选；回退恢复旧pins/范围并重测提示/拒绝行为。

## 依赖公告与CI供应链

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run security:dependencies -- --output dependency-security.json
node --test test/dependency-security.test.mjs
```

审计独立检查workspace-lock（含dev/optional/peer）与plugin-runtime。plugin无lock时只复制runtime字段，在专属临时目录用公共npm解析lock，禁用lifecycle、不携带脚本、不写回源码；不能以根同名依赖代替插件图。先核对manifest/lock根记录，陈旧lock是工具错误。证据记录实际manifest/lock摘要与图来源。

npm audit固定公共registry，任何公告级别（含未知）均阻断，无豁免；退出0本次未发现公告、1有公告、2网络/npm/超时/schema/lock或证据错误。网络失败不转绿，不自动修复。每npm进程最多120秒（可降低），网络45秒无重试，stdout/stderr缓冲各4MiB；结束只清自有目录。

证据仅白名单字段，去控制字符及URL凭据/查询，不保留原响应/stderr；每图1000项、字段256字符，截断不改变阻断。分享前预览；离线子进程回归不能代替实际registry或未来CI状态。

[测试](../.github/workflows/test.yml)和[静态批量](../.github/workflows/static-batch.yml)固定Actions完整commit，checkout不保存凭据、最小权限、job限时、制品7天，不恢复npm缓存。公告审计在独立Node24 job跑一次；静态批量手动触发。Node矩阵独立报告；prepublish通过DSC_TEST_TAP保留完整TAP/stderr，失败看末尾真实错误。更新Action pin须核对官方commit/action.yml运行时及inputs，Action运行时与被测Node分开。其它runner另验收。

上游市场的恢复/安装复验见[独立记录](upstream-verification.md)，来源、受控边界、真实pnpm和Desktop Host结果分列，不借本工具CI替上游认证。

## 真实插件回归

[rc.2](../tools/real-regression-manifest.json)、[rc.3](../tools/real-regression-manifest-rc3.json)及[rc.5清单](../tools/real-regression-manifest-rc5.json)分别锁定DSH/目录、五个npm制品、摘要及每轮24项业务期望，互不借结果。独立holdout为`dsh-pomodoro@0.5.5`与`dsh-global-todo@0.13.2`，先选无需账户/模型且可审阅的操作，再封存预测，不能据结果调规则。重复运行不增加独立样本数。

业务真值来自实际动作及独立后置条件：Pomodoro核localStorage revision/deadline与新文档恢复；Todo核POST/create、私有JSON及重载DOM。受控故障分别删主按钮或仅令该POST返回503，恢复另验；GET配置或元素出现不代替功能通过，无通知/模型/外部采集。

启动前封存静态预测；appReady后、Chrome/动作前封存原始service-only root。回放重算标签及动作时序，不信任保存的布尔值，不据业务/loader答案倒填服务观测。静态/service-only、自然/受控、FP/FN与驱动错误分列，clientVerified:false保留。旧sidebar两项HTTP405与动态patch挂载限制仍为limited/FN；绿色仅表示固定期望重现，不是生态准确率。

```sh
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.5 node tools/real-regression.mjs --live --repeat 1 --out-dir <新空目录>
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.5 node tools/real-regression.mjs --replay <证据根或单队列>
node tools/business-labels.mjs --live --suite holdout-pomodoro --observe-services --out-dir <新空目录> --json
node tools/business-labels.mjs --live --suite holdout-todo --observe-services --out-dir <另一新空目录> --json
```

另有market/sidebar/sidebar-ui/sidebar-ui-previous队列；旧三suite索引不证明五suite已跑，旧driver缺时序时不得冒充完整证据。固定回归退出0期望重现、1业务/证据不符、3驱动错误；业务度量退出0无错配、1含FP/FN或不计分项、3输入/驱动错误。

真实运行需当次下载/执行授权，不复制账户或用户文件；每队列10分钟、清理宽限15秒、最多两轮/64证据文件。确认自有宿主/Chrome停止后再清目录，清理未确认即失败。sidebar-model另需账户/模型授权：工具关闭、两次首步、无重试/标题、每步256token，不属默认CI。

浏览器驱动必须等待独立就绪条件：市场重载等本次GET installed响应及渲染，不以卡片或健康业务值代替；升级面板等loader扫描/F2完成及设置页显式重检；语义提示分别展开覆盖限制和发现区再检查可见文本。失败不放宽后置条件，不保留鉴权或私有报告正文。

rc.3固定来源/签名/语义见[审查记录](../rules/dsh-0.2.1-rc.3-review.json)。三处更多、插件主列表、空白复用及preset/草稿策略有实际驱动；模型列表用私有环境、只请求受控loopback列表，不继承密钥，失败/超时不等于模型不可用。0.2.0-rc.2保留其它真实门禁，rc.2/rc.3/rc.5执行面板；显式宿主不符为错误，不以缺浏览器跳过求绿。

## 同一制品发布核对

本版**0.2.4**以能力描述固定文档；带日期的公开状态和验收单列current-state，不预写发布成功、时间或摘要。发布顺序：

1. 先统一版本真源、manifest/lock、各版README、skill及示例；冻结到tag的文档不得保留“本版未发布”等即时状态。运行check与prepublish-check（不发布），用成功TAP更新current-state计数，核生成副本、许可证和公开元数据。
2. 授权推送后等待所选提交全部Actions通过。CI candidate job只构建一次；rc.5及0.2.2-rc.1 job下载同一归档/回执，运行完整UI并上传证据。
3. 下载CI归档，核来源、提交、dirty及SHA-256；Mac使用该文件和构建回执重跑。若平台归档不同，即使内部文件相同也不能借旧文件验收。构建及重用命令见下方。
4. 另取正式发布授权后，npm发布同一tgz，Git tag/Release附该文件、SHA256SUMS及限定验收回执；不从源码重打包。
5. 核npm版本/integrity/shasum、附件SHA-256、tag提交，再实际公共安装。将真实结果记入current-state，不预写published或未经验证的时间/摘要。

Windows、真实用户及一般业务单列未验范围；取数失败不算通过，本地版本/README领先registry仅为发布差异提示。

GitHub简介/topics可独立于Git提交更新；npm简介/搜索关键词分别取`plugin/package.json`的description/keywords，正式发布新版本后再核对公开值。两者共用产品主旨，但不是同一组平台字段；npm dist-tags是版本渠道，不能拿它替代搜索关键词。发布前本地与registry的版本、正文及元数据差异须记录，不能宣称已上线。字段含义见[npm package.json文档](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#description)。

## 参数语义基线维护

`rules/severity.json.apiSemantics`登记0.2.1-rc.2/rc.3/rc.5及0.2.2-rc.1精确语义，与五版API目录认证独立。修改前锁定官方tag/归档，逐文件核对哈希、公开契约、实现及真实行为；归档只读，不执行目标。参数事实、弃用标记和所有权前提分别审查；clearPreviousDraft是兼容选项，新字段出现不表示它弃用。

`lib/api-semantics.mjs.SEMANTIC_VERSIONS`单独限制语义版本，不能从目录登记或规则自报版本扩大。rc.5固定目录/完整来源审查见`rules/dsh-0.2.1-rc.5-review.json`；已进入CATALOG_REFERENCES，仍不认证一般业务。check:catalogs验证schema、登记版本及来源引用结构，不能代替语义审查。补类型/枚举、别名/改写、闭包副作用及跨版本正反例，验收同一tgz的HTTP/面板。静态验收夹具只放自有profile，保持未激活；提醒不证明泄漏/移除或业务失败。同步指导副本，保留旧语义基线，不自动认证未来、宿主同名、Windows或模型场景。

## 提取器与探针维护

- 宿主裸包按Node ESM条件/对象顺序解析exports，types/browser/require不作宿主import条件；128节点/32层。exports/ESM/相对patch精确匹配，不加扩展名/index猜测；无exports旧main及CommonJS按各自回退，嵌套清单64KiB且共用源码预算。
- patch路径锚定各patch目录，按insert/id顺序及已知分组组合，name只校验锚定身份；业务config不引入挂载。表达式、别名或未知跨包/子树限制覆盖，不能以入口不可达证明代码永不执行。
- 模块路径仅证明无插值模板，或声明早于引用且无写入/遮蔽的词法const原始值/别名、拼接、常量模板。每文件200000 AST节点/4096相对引用，每次求值128节点/32层/8192字符串单元；共用时间检查。动态/对象成员/参数/eval/超限保守弃权。
- require链接按调用span隔离；闭包写入隐式require或直接eval撤回原生require证明。具名类、静态块var及TS参数属性/枚举/namespace遮蔽须区分，不代表完整支持对应TS值流。路径证明不提升弱Context或异步服务身份，复杂namespace保留诊断。
- inject只提升已证明的最终导出；数组元素或对象自有键是服务名，required/optional不是分组。调用位置须匹配源码span；包、端侧、作用域及别名均属身份，不能按裸变量名合并。provide不证明实际提供。
- 探针仅采样点名服务，不执行getter、不复制属性值/凭据/用户内容。现代文件绑定profile/DSH/时间，24小时有效、未来容差5分钟（含边界）；无效时撤回该文件服务/loader证据，独立进程内证据另判。旧格式仅认显式键；boot失败清自有资源。
- 输入、缓存身份、作者快照、升级捕获/验证共用有界枚举与非阻塞文件核验；缓存淘汰/卸载取消在途任务，共享worker队列检验并发、排队超时/取消及恢复。诊断只写自有私有目录，输出/启动失败明确报告，不用空结果掩盖。

修改补行为正反例，清理仅核自有资源；敏感值守卫同时测真实命中与占位说明。历史性能数字/缺陷编号/Python参考不构成当前准确率或性能承诺。

## 本地历史管理维护

归档在`lib/review-archive.mjs`，复用活动review路径/锁/有界读取；不可将归档记录直接合并成当前已复核。快照契约与中性比较为`lib/report-history-contract.mjs`，落盘为`lib/report-history.mjs`，共用`lib/local-history-store.mjs`的私有目录、不可覆盖内容对象和限额。新HTTP入口为`plugin/lib/host-history.js`，UI为`plugin/src/panels/history.jsx`；沿用Card/Fold/Pager及原报告/草稿状态。不得为历史功能提高活动sidecar上限或改变基线/判定标准。

历史对象摘要仅用于损坏检测，不是签名；导入报告的自报身份不能当真实采样证明。历史/三语真实界面验收统一由上方九项入口执行，保持编辑器、原始草稿、报告及基线身份，保留三语及窄容器/深色截图。

## rc.5验收入口

acceptance-target按精确版本选择能力；rc.3/rc.5复用已核导航/草稿/模型列表契约，rc.2保留原路径。显式目标与实际可执行文件不符即失败，rc.3/rc.5缺浏览器不能skip求绿。

```sh
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.5 DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
node tools/ci-ui018.mjs --build-only <自有候选目录>
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.5 DSC_RC2_ARTIFACT=<候选tgz绝对路径> DSC_RC2_ARTIFACT_RECEIPT=<候选目录/summary.json> node tools/ci-ui018.mjs <另一自有验收目录>
```

基础入口验HTTP/tool、声明、预检、精确语义、三槽位及导航恢复；完整UI入口要求九项结果、截图、来源、归档摘要与清理。build-only只证明构建，不算宿主通过；供应归档必须附来源回执，核当前源码/commit/dirty/摘要及包名/版本后复制，不重打包。缺回执、源码变化或坏包在启动前失败。

rc.5额外要求独立ACP stdout JSON-RPC、stderr目录诊断、MCP能力、受控模型列表及导航语义回执。rc5-acp-stdout只用私有DSH_HOME、合成凭据、loopback列表/两轮模型响应和tools-only MCP；无resources能力不请求资源。失败/超时/清理不确认均失败，只保存计数与断言，不保存对话正文。模型列表另验首次等待、失败/超时回退及无凭据不请求；没有生产账户/模型调用。

历史制品回执见current-state，新包须另核来源/摘要/平台。固定五suite/24项仅证明期望重现；rules/dsh-0.2.1-rc.5-review.json的integrationAcceptance是目录登记时快照，不追写历史。

## 用户issue修订与回归

0.2.3修复本仓库[#7](https://github.com/lcy0121/dsh-plugin-compat-check/issues/7)、[#9](https://github.com/lcy0121/dsh-plugin-compat-check/issues/9)、[#10](https://github.com/lcy0121/dsh-plugin-compat-check/issues/10)、[#8](https://github.com/lcy0121/dsh-plugin-compat-check/issues/8)。同一最小输入对照原始`b188c79`与修复源码，四项均复现旧问题并通过新行为；不执行用户插件，不推断已安装旧包已修复。

| issue / 最小复现 | 修复与反例 | 回归入口 |
|---|---|---|
| #7：touch目录、原子替换state JSON | 无关状态写入不失效；源码、清单、patch及实际解析候选仍失效，保留提交前复核/预算/基线守卫，不按state目录名排除 | `identity-runtime-state`、`cache`、`input-lifecycle` |
| #9：缺省字段/非法JSON证据 | 可为空字段显式null，普通/缓存/失败/升级回包通过严格schema；特殊值、循环、访问器、稀疏数组及额外数组属性明确失败，不静默丢证据或增加未声明键 | `tool-json`、`tool-host-validator`、`upgrade-host` |
| #10：Windows盘符/UNC位置参数 | 显式请求优先；绝对启动路径保持实际根，环境须安装位置印证，冲突/未知关闭推断；不猜desktop或借共享安装冒充身份 | `profile-target`、`cache`、`input-lifecycle` |
| #8：abstract/@Remote签名被漏过 | 同一固定来源核126/126新增名称，宿主方法291→417；目录缺项改为带方法/位置的覆盖限制，可靠完整运行时证据仍可证明真正缺失 | `catalog-signature-omissions`、`verdict-regressions`、`catalog-governance`、`probe-boot` |

表中名称对应`test/<名称>.test.mjs`。身份观察复用有界源码图，任意后缀解析候选的存在性/类型/真实路径也纳入；读取、枚举和时间共享预算。官方校验器测试只执行经摘要校验的原始TypeScript，不复制第三方实现。

`ci-ui018`的rc.5门禁还要求`issues023`回执：独立tgz装入自有profile，每25ms原子写状态期间联合调用无参tool、刷新真实设置页、核目标一致及缓存命中；停写后核显式失败及升级回包。调用经过宿主tools.execute的严格JSON/schema管线；测试桥接路由/定时器仅驻临时profile，随宿主清理，不进入npm产品。预检复制全部输入字节，因此持续写入时拒绝不稳定快照是正确行为，不放宽该守卫。

Node22/24、九项UI及问题联合验收按精确提交/归档核对；CI状态见对应Actions运行，同一tgz须有macOS/Linux回执。Windows实机和用户现场确认单列。源码修复、现场复验及公开发行分开记录，issue沟通/关闭按当次授权与证据决定。

## 0.2.4开发：0.2.2-rc.1来源、Cordis与工具迁移

[0.2.2-rc.1审查](../rules/dsh-0.2.2-rc.1-review.json)锁定官方tag/commit、源码/npm/app.asar摘要和完整文件差分。双端完整签名与原始归档及桌面字节一致；独立AST核方法名，四项压平后缺少类型分隔符的签名另行人工核对。提取器补齐泛型、转义引号装饰器、生成器和可选方法；旧登记字节保持，目录新增不全是上游API新增。新精确目录已接普通报告、双向预检和作者默认五版矩阵；参数语义与迁移范围见下节。

Cordis4.1保留递归entries及0–5状态；未知类型不当FAILED/PENDING，树内id不能作包身份，显式冲突保持未映射，独立标签评分遵守同一边界。探针按已检查条目计预算，跳过坏形状不绕过上限。ctx.inject返回Fiber，清理保留dispose接收者，同时兼容旧函数disposer；此遗漏在旧宿主也存在。Include1.1的commit/journal/flush与patch克隆已核，静态扫描不写宿主配置，不模拟运行时持久化或热更新回滚。

`tools/owned-tool-invocation.mjs`仅供自有验收fixture：rc.5保留单调用；新宿主通过真实Agent选择执行器，resolve捕获modelSelection/步骤准入，executable和execute使用同一集合并finally释放。PTC经run_code调用能力，不直接绕过执行器；当前桥接限定TypeScript默认函数体模式，不外推Python/VM Script/REPL。`installIssue023Fixture(profile,{hostVersion,agentPreset})`显式选择新宿主及preset，返回executorSchemas作为独立证据；preset须在Agent setup中实际挂载，meta声明本身不证明执行器选择。

`test/owned-tool-host-probe.test.mjs`默认跳过，显式DSC_RC22_HOST_PROBE=1才执行；可通过DSC_HOST_ASAR及DSC_HOST_ELECTRON选择安装归档，核摘要后运行实际ToolsService/native/PTC、条件准入、作用域、提示词、严格JSON与取消；探针的PTC runtime seam是受控夹具，不能代替真实后端。实际私有宿主/Chrome和独立tgz基础回执见current-state；完整九项UI、平台矩阵、现场试用和新语义规则仍待§6，历史rc.5回执不认证新宿主。

## 0.2.2-rc.1语义与宿主验收

[独立语义审查](../rules/dsh-0.2.2-rc.1-semantics-review.json)锁定官方归档及所审源码摘要。沿用已核startSession/草稿、timer、retain和reasoning约定；对可证明的投影stateVersion只校验非负安全整数。固定agent/request订阅及已证明端侧/服务调用提供agent.model、步骤准入、Session events/state/control、异步投影注册与changes帧迁移提示；不分析回调改路由、返回Agent/Session对象流、await顺序或业务结果。动态/逃逸/访问器保持弃权，提示不增加已验证调用或自动升级为fatal。semanticSites只保存固定事件身份，共用50000调用点及原8MiB回传预算；三语固定提示同步。

新版实际PluginManager通过私有registry验证成功更新、启用失败/下载失败/实际取消后恢复旧版，分别核HTTP结果、依赖版本和apply/dispose记录；磁盘写入不替代激活。九项UI继续要求三槽位、身份、卸载路由/样式撤销后恢复、草稿/焦点、窄屏/主题及完整导出。新增ja/es/fr/de/ru/pt宿主语言均须auto回退英文且保留编辑器；不扩增产品翻译。迟到响应/worker回收由受控生命周期回归补证，不冒称实机精确指令时序验收。

新宿主真实运行要求Node>=24.9；工具纯静态入口和旧宿主继续保留Node22.19覆盖，不提升产品engines。acceptance-target、rc2-live及ci-ui018精确接入0.2.2-rc.1；Linux矩阵保留旧四版，并为新版使用同一CI candidate及完整UI，安装前核运行时。Node22/24.9门禁均执行固定rc.5及rc.22原始JSON/schema校验器，新增DSC_RC22_SOURCE_ARCHIVE控制已核来源，坏摘要/缺源/跳过不转绿。ModelListingCache新版settings/changed回调、自动刷新及异步dispose单独记录，宿主Node由实际carrier查询、控制器版本另列；rc.5协议证据不借给新版。源码/归档变化仍阻断验收，CI配置就绪不表示远端CI已运行，Windows仍未验收。

0.2.4交付使用`tools/real-regression-manifest-rc22.json`独立锁定新宿主目录及五suite/24项发布插件预期，先固定预期再运行`DSC_ACCEPTANCE_DSH_VERSION=0.2.2-rc.1 node tools/real-regression.mjs --live --out-dir <空目录>`；偏差记失败，不从输出反写预期。完整UI用上方供应归档入口，目标改为0.2.2-rc.1。可用空自有HOME运行npm test/prepublish排除用户profile，回执必须明确此范围，不能声称验证用户现场。
