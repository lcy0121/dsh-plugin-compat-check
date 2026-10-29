# 维护指南

本文维护**0.2.0**的目录、规则、依赖与验收流程。操作/限额见[指南](guide.md)，契约及未完成事项见[Plan](Plan.md)，限定证据及实际发布状态见[current-state](current-state.json)。历史成功不认证新制品。

## 维护入口与语法覆盖

```sh
npm run check
npm test -- --test-reporter=tap > /tmp/dsc-tests.tap
```

check验证格式、文档/版本/链接、skill/契约副本、第三方说明、可执行语法矩阵及目录登记；不递归跑测试、不联网、不执行目标或改源码。矩阵仅创建/清理自有合成输入。成功TAP交给doc-check核对计数，远端状态及真实宿主另验。

宿主`plugin/index.js`编排加载/资源，`plugin/lib/host-{reports,reviews,http,upgrade,history}.js`分管各接口；`lib/review-sidecar-cache.mjs`仅缓存已校验派生上下文，不授权保存。客户端真源为`plugin/src/client.jsx`、`panels/`、`components/`和`styles.css`，纯契约/workflow共享`lib/*.mjs`。

`npm ci --ignore-scripts`后运行`npm run build:client`，`check:client`核对可复现字节。prepack调用stage-contract生成3份启动契约及客户端，打包内核以重导出共用宿主契约。不要直接改`plugin/lib/client.js`；移除模块须复验独立tgz、worker及普通/升级tool。React来自宿主，Tailwind禁preflight、样式限定`.dsc-ui`；组件改动同步[来源/MIT](../plugin/src/components/ui/PROVENANCE.md)、主题/键盘/窄容器验收。

UI词典位于`plugin/src/i18n/{zh,en,ko}.json`，用可读原文作为消息键，插值必须保持`{pN}`及重复次数；构建将各语言的重复键替换为短ID，保留中文原文供内置状态映射。`runtime.mjs`共享宿主lang观察和本地偏好，`locale.jsx`使各槽位及memo面板更新；不得按语言设置React key或重建编辑器。只对固定UI/已知内置状态调用翻译，原始发现、用户依据、命令和JSON不得按词典全局替换；故障报告仅翻译共享渲染器的模板、已知固定说明及核实建议。新增文案须补齐三词典、ARIA及覆盖测试，不能更改后端契约或结论。

真实验收/到货工具经`tools/owned-package-source.mjs`核对manifest/lock/构建依赖，复制自有闭包到私有构建目录，不向源码、用户profile或运行包注入工具链。selector-parser固定覆盖7.1.6；更新Tailwind/覆盖后须重建、复验布局/主题及开发/运行两图审计。

完整UI验收使用同一独立tgz及自有DSH 0.2.1-rc.3/Chrome：

```sh
node tools/ci-ui018.mjs <自有输出目录>
```

入口统一启用九项验收：原面板、布局/主题/键盘、分页/完整导出、超时恢复/草稿、HTTP会话、复杂度/采样、处置定位、历史管理和中英韩国际化。检查第123条发现的双向定位/筛选/焦点、12px间距、短结论不折字、历史显式操作及报告/基线不变；密集数据来自明确标记的非激活合成插件。截图中的窄列CSS夹具不冒充真实插件布局。开关依赖以入口源码为准，单跑处置定位须同时启用hardening。

输出含提交/dirty/逐文件摘要、tgz摘要、完整报告、日志、截图及SHA256SUMS，缺结果/截图或清理失败均不得通过。使用忽略的tmp或仓库外目录，避免证据进入源码身份；CI要求干净检出。Linux rc.3作业执行同一入口并上传证据，其他两宿主继续集成验收；具体平台结果须对应实际提交，不由接入CI推定。`ui018`文件名、`DSC_UI018_*`及证据字段沿用以兼容脚本，不代表产品版本。Windows、真实用户和一般业务另验。

组件回归另测三槽位、共享订阅/可见性及迟到响应。`node tools/ui018-performance.mjs`比较固定提交与当前客户端的1000插件元素树及隐藏内容；它是合成hook测量，耗时不作浏览器性能门禁。

`test/fixtures/syntax-matrix.json`与`tools/syntax-matrix.mjs`分别记录并执行supported / inferred / abstained / excluded病例。每例核验包名、精确调用对/跨度、确定性或诊断，不以解析成功代替结论。扩展语法须增加正反例，并保留动态/超限限制；矩阵与真实业务标签独立，不能调严重度求绿。

已完成的A4b排除实验、旧槽位探测和逐轮维护日志保留在`39d9f1a`的相应路径。移植阶段Python提取器/对拍及其专属样例已移除，历史见`26fdbf4:tools/parity/`；当前AST文件图/自循环/精确路径、语法矩阵及快照回归承担验证。仍使用的历史宿主观测原字节迁入`test/fixtures/host-surface-parityfix.json`。独立正则枚举仅供候选复核，不是判定真值。

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

## 真实插件回归

[rc.2清单](../tools/real-regression-manifest.json)及[rc.3清单](../tools/real-regression-manifest-rc3.json)分别锁定DSH/目录、五个npm制品、摘要及每轮24项业务期望，互不借结果。独立holdout为`dsh-pomodoro@0.5.5`与`dsh-global-todo@0.13.2`，先选无需账户/模型且可审阅的操作，再封存预测，不能据结果调规则。重复运行不增加独立样本数。

Pomodoro真值来自Start后的localStorage revision/deadline及新文档恢复，受控故障删主按钮；GET config只说明配置就绪。Todo真值来自POST/create、私有JSON精确标题及重载DOM；故障只对该POST返回503，磁盘/DOM均须无标题，恢复另建标题。正常→故障→恢复分组，不调用通知/模型/外部采集。

静态预测在启动前封存，service-only等待官方appReady后采样原始root，在Chrome/动作前封存；不要求所有被测服务存在。receipt记录动作时间、请求/DOM/磁盘后置条件及清理；回放重算标签，不信任保存的布尔值或把hash当签名。静态/service-only、自然/受控、FP/FN和驱动错误分列，clientVerified:false保留。旧sidebar的动态禁用patch不能证明顶层挂载，其两项HTTP405失败保留为limited/FN，不能要求service-only零漏报。绿色只证明固定结果重现，不代表生态准确率。

```sh
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.3 node tools/real-regression.mjs --live --repeat 1 --out-dir <新空目录>
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.3 node tools/real-regression.mjs --replay <证据根或单队列>
node tools/business-labels.mjs --live --suite holdout-pomodoro --observe-services --out-dir <新空目录> --json
node tools/business-labels.mjs --live --suite holdout-todo --observe-services --out-dir <另一新空目录> --json
```

另有market/sidebar/sidebar-ui/sidebar-ui-previous队列；旧三suite索引不证明五suite已跑，旧driver缺时序时不得冒充完整证据。固定回归退出0期望重现、1业务/证据不符、3驱动错误；业务度量退出0无错配、1含FP/FN或不计分项、3输入/驱动错误。

真实运行需当次下载/执行授权，不复制账户或用户文件；每队列10分钟、清理宽限15秒、最多两轮/64证据文件。确认自有宿主/Chrome停止后再清目录，清理未确认即失败。sidebar-model另需账户/模型授权：工具关闭、两次首步、无重试/标题、每步256token，不属默认CI。

浏览器驱动必须等待独立就绪条件：市场重载等本次GET installed响应及渲染，不以卡片或健康业务值代替；升级面板等loader扫描/F2完成及设置页显式重检；语义提示分别展开覆盖限制和发现区再检查可见文本。失败不放宽后置条件，不保留鉴权或私有报告正文。

rc.3固定来源/签名/语义见[审查记录](../rules/dsh-0.2.1-rc.3-review.json)。三处更多、插件主列表、空白复用及preset/草稿策略有实际驱动；模型列表用私有环境、只请求受控loopback列表，不继承密钥，失败/超时不等于模型不可用。0.2.0-rc.2保留其它真实门禁，rc.2/rc.3执行完整面板；显式宿主不符为错误，不以缺浏览器跳过求绿。

## 同一制品发布核对

文档以0.2.0功能描述为准；只有日期、版本、提交与哈希明确的回执可证明执行过。发布时依次完成：

1. 本地运行`npm run check`和`node plugin/scripts/prepublish-check.mjs`（只验证，不发布）；成功TAP通过`tools/update-current-state.mjs --test-summary <日志>`更新计数。核对生成副本及许可证，不改快照掩盖失败。
2. 经授权推送后等待**所选发布提交**全部Actions成功；历史CI不认证新提交。明确Windows、用户试用及业务样本的未验范围。
3. 从该源码构建一次独立tgz，记录SHA-256，并将同一文件安装到自有profile验收。`tools/ci-ui018.mjs`会产出自己的归档及证据，不可用后来重打的包替代。

```sh
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.3 DSC_REQUIRE_RC2_UI=1 DSC_RC2_ARTIFACT=<确切tgz绝对路径> node tools/rc2-live.mjs
```

4. 取得正式发布授权后才发布验收过的**同一tgz**、Git tag及Release附件；npm直接发布该归档，不从源码重新打包；Release同时附SHA256SUMS及限定验收回执。核对npm版本/integrity/shasum、附件SHA-256和tag提交，再从公共registry实际安装核验。`node tools/meta-check.mjs --json`只读检查公开信息；本地领先属于提示，取数失败不是发布成功。
5. 将实际时间、提交、制品及公共安装结果写入[current-state](current-state.json)。历史回执移至Git指针；不得预写published状态、发布时间、未执行CI或未经验证的摘要。

GitHub简介/topics可独立于Git提交更新；npm简介/搜索关键词分别取`plugin/package.json`的description/keywords，正式发布新版本后再核对公开值。两者共用产品主旨，但不是同一组平台字段；npm dist-tags是版本渠道，不能拿它替代搜索关键词。发布前本地与registry的版本、正文及元数据差异须记录，不能宣称已上线。字段含义见[npm package.json文档](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#description)。

## 参数语义基线维护

`rules/severity.json.apiSemantics`只登记0.2.1-rc.2/rc.3客户端语义，不改变三版API目录认证。修改前锁定官方tag/归档，逐文件核对哈希、公开契约、实现及真实行为；归档只读，不执行目标。参数事实、弃用标记和所有权前提分别审查；clearPreviousDraft是兼容选项，新字段出现不表示它弃用。

check:catalogs验证schema、登记版本及来源引用结构，不能代替语义审查。补类型/枚举、别名/改写、闭包副作用及跨版本正反例，验收同一tgz的HTTP/面板。静态验收夹具只放自有profile，保持未激活；提醒不证明泄漏/移除或业务失败。同步指导副本，保留旧语义基线，不自动认证未来、宿主同名、Windows或模型场景。

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
