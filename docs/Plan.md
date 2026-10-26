# 开发计划与维护约定

本计划维护**0.1.7**的交付契约及0.1.8开发中的UI改进；源码版本号尚未调整，开发验证不代表新版本发布。版本真源是`lib/version.mjs`；[README](../README.md)、[指南](guide.md)、[维护指南](maintaining.md)和[作者CI](author-ci.md)分别承担入口、操作、维护和作者接入说明。[docs/current-state.json](current-state.json)记录可复算计数、限定验收及实际发布状态；历史明细按其中Git提交/路径追溯。

## 1. 项目定位与交付状态

检查**已安装DSH插件**与目标版本的兼容性，提供依据、真实包内位置及覆盖限制。声明放行、激活、客户端到货、无发现或覆盖完整均不等于业务验收。

单仓库、单Node判定内核。根是private工作区；npm只交付`plugin/`，包含面板、tool、skill及共享内核，没有CLI bin，不支持`npx dsh-plugin-compat-check`。CLI、安装检查、静态批量、作者CI及健康执行器从仓库运行。源码安装须[构建完整tgz](../plugin/README.md#从源码构建安装)，不能直接安装根GitHub spec或复制裸子目录。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

JS/TS AST、词法绑定及源码图识别Context、服务和调用span，按host/client/shared分端。变异、遮蔽、逃逸、动态、异步、递归和超限保守推断或弃权；能力守卫须控制对应调用，try/catch不作能力证明。源码位置须来自实际字节，声明/loader无位置时不编造。

入口按相应宿主规则解析：ESM exports/条件、CommonJS旧式回退、相对patch锚定与顺序insert/id覆盖分别处理；客户端`./client`只认字符串或一层字符串default。未知表达式、别名展开、条件、跨包挂载及非JS/TS模块限制覆盖，不靠扩展名/index猜入口。语法和资源边界见[指南](guide.md#日常检查与源码交付)与[维护指南](maintaining.md#提取器与探针维护)。

固定0.2.1-rc.2/rc.3客户端语义仅覆盖`startSession`四个选项、定时器弃用及引用生命周期提示。参数类型/枚举不符是非致命静态风险，不单独触发声明不符；未知副作用等撤回旧参数事实。原始prompt与任意枚举内容不进入报告；提醒不证明方法已移除、发生泄漏或业务失败。[范围](guide.md#参数与生命周期语义)。

### 2.2 结论、影响与基线

- `certainty=certain / suspected`表达证据强度，`impactBasis=measured / inferred`独立表达影响依据。`vacuous=true`表示ok但无已验证调用，必须转述coverage和客户端待验证项。
- 服务区分present/absent/unobserved/unreadable。只采样描述符、不执行getter；省略键/目录缺项不证明缺失。必需inject仅在合格同目标观测明确absent时推断激活障碍；provide只是候选，不能掩盖缺失。可靠映射且启用的FAILED/PENDING条目才可形成fatal实测发现。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer；旧目标保留旧策略。非法声明保留风险；独立豁免仅按插件及DSH精确版本匹配，不放行非法字段，不证明业务正常。
- schema2基线按canonical目标、观察路径、模式及工具/规则/目录身份隔离；锁内比较、原子写入。不完整、失败、取消或卸载不推进，身份变化中性。重复发现稳定一对一配对，保留entryId/列号及findingKeyVersion；证据减弱不声称修复。

旧/坏/未知schema或不安全基线保留原件，不比较或覆盖。锁、基线、review共用当前用户私有目录策略：新建0700，已有不安全目录拒绝读写、不隐式chmod。[恢复](guide.md#本地状态锁恢复)须显式确认及证明持有者已退出，不按年龄/PID复用清锁。

### 2.3 报告结构与兼容策略

普通真源`lib/contracts.mjs`：schema1；CLI kind=`plugin-compat-check/result`，HTTP kind=`plugin-compat-check/report`；tool保留summary/text和report/baseline/cache。字段、计数、发现及退出码须自洽；兼容新增字段，不兼容变更升schema。普通退出码：**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**，3不是插件结论。

缓存按目标、probe及分析/观测身份隔离，事件/巡检、TTL、容量淘汰和single-flight共同控制；失效任务不得发布或写基线，失败保留旧成功和错误。普通分析/身份worker共享并发及等待上限，卸载取消并回收；具体预算集中在[指南](guide.md#日常检查与源码交付)。

故障报告由共享模块生成，`--issue-report`禁读写基线，与json/quiet互斥。筛选不裁剪完整导出，显式复制才写剪贴板；分享前预览，不自动发帖。可读终端文本转义控制字符，JSON保留身份；导出不含原始源码、日志、probe或baseline，不保证任意文本完全脱敏。

### 2.4 DSH接入要点

UI使用`settings.plugins.tab`、`plugins.detail.section / .badge`，不以缺可靠身份的`plugins.item`作包级判断。客户端经`window.__ModuleLoader__.load({id,factory})`注册，宿主不代构建；tool required为顶层数组，skill通过provider注册。profile选择实际目标，不默认desktop。

0.1.8 UI主结果已前置：总览先显示结论数量、目标/时间/缓存、覆盖与中性基线提示、筛选及逐插件结果，再显示故障报告、升级预检、依赖关系、人工处置和健康记录。目录来源按需展开，未认证警告仍直接可见；目录摘要/路径在卡片内换行，报告信息、筛选与结果表用Separator分隔。升级预检使用独立卡片，证据释义、工具版本与采样来源集中于页尾“报告说明与检查信息”卡片；certainty/impactBasis、coverage/vacuous及完整导出保持原契约。

依赖关系各表和已导入的健康检查结果提供带数量的展开/收起按钮，默认收起，关闭时不挂载表格DOM；各展开入口统一为有文字及aria-expanded的“展开/收起”按钮，表单收起保留输入，历史处置保持受控状态，升级新增风险保留默认展开。各板块沿用依赖关系板块的系统字体，标题14px、正文13px、展开按钮12px，由共享主题字号控制。正文、证据依据及表头用主文本色，时间、版本、来源和数量等注释用灰色；深色主题使用对应的可读前景色，风险徽标保留语义色；覆盖、截断及历史记录边界仍在折叠外。主结果表保持展开。插件/loader辅助表前两列最小240/280px，长scope名称不逐字挤压，窄容器在表内横向滚动，原生按钮支持键盘及aria-expanded状态。

UI真源为`plugin/src/client.jsx`、`plugin/src/components/ui/`及`plugin/src/styles.css`，采用经适配的shadcn/ui组件与统一主题；折叠由Card/Button组合，来源和MIT说明见[组件记录](../plugin/src/components/ui/PROVENANCE.md)。Tailwind/esbuild只在开发期运行，产物仍为`plugin/lib/client.js`的ModuleLoader入口，内嵌预编译CSS，复用宿主React，不引入ReactDOM/浮层运行时。样式及变量限定于`.dsc-ui`，跟随宿主深浅色，按挂载所有者共享并在最后卸载时移除；不能直接编辑生成产物。限定实机、DOM与体积证据见current-state，组件迁移不等于已经减重。

rc.3入口为左下角账号菜单→设置→内置插件→兼容性。导航/草稿验收核对活动区域、目标会话及内容后置条件；富草稿持有与释放须成对，不承诺已销毁输入的附件恢复。折叠或空标题不作为激活失败。

普通体检按DSH范围选择旧/rc.2/rc.3参考目录，显式覆盖优先；`CATALOG_REFERENCES`只认证登记精确版本和字节，漂移失败。未来/未知/自定义目录保留未认证提示；[新增目录](maintaining.md#api目录候选审查)须单独审查与真实验收。

HTTP报告/预检仅GET、人工保存仅JSON POST；均要求本地/完整同源校验及`X-DSH-Compat-Request: 1`。标记不是凭据、不替代宿主鉴权。[HTTP](guide.md#本地http边界)及[执行环境](guide.md#安装与probe执行环境)不承诺OS沙箱或跨用户隔离。HMR/卸载撤销注册、计时器、handle及在途计算。

### 2.5 有限静态批量契约

固定schema1 manifest锁定1–16项第三方本地包、精确版本及文件树摘要。只分析稳定捕获并验hash的私有副本，不下载、执行、使用probe/豁免/基线或跨样本提供服务；拒绝链接、特殊文件、官方包及缺dsh元数据。[命令与限额](guide.md#升级预检与有限批量)。

`plugin-compat-check/batch-result`保留发现、coverage/vacuous、诊断及待作者复核状态。单项错误继续其它项，总码错误优先3，否则最重0/1/2。previous须重扫且身份相容才比较，变化中性、坏旧输入失败。手动Action仅扫固定公开合成样本，不接受用户URL或自动定时运行。

### 2.6 真实故障回归与呈现

固定DSH/目录、五个npm制品及24项业务期望。动作前封存预测，真值来自独立HTTP/DOM/磁盘receipt；静态/service-only、自然/受控故障、驱动错误分别计分。回放核对身份、时序和清理，不把布尔值或hash当签名。[流程](maintaining.md#真实插件回归)仅对限定样本负责，不代表生态准确率。

“下一步核实”由`lib/finding-guidance.mjs`生成，不猜替代API/修复版本，不自动改配置。界面必须保留目标、时间、缓存、覆盖限制和中性基线说明。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`仅支持精确**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，其它版本读输入前退出3。捕获同组私有字节、联合提取一次，再分别判定；捕获、分析（含有界根规则读取）和清理各受worker监督。清理失败不返回成功。不安装/升级宿主，不使用运行时、probe、loader、豁免、普通缓存或基线。

真源`lib/upgrade-contract.mjs`：schema1，kind=`plugin-compat-check/upgrade-preview`，mode=`static-version-comparison`。状态compared/unsupported-version/error；changes含added/worsened/resolved/unchanged/improved。**0/1/2只表示无/非致命/致命新增或变重风险，3表示无法预检**；旧问题和coverage/vacuous仍保留，ok仅表示比较完成。

CLI须nm、当前版本及upgrade-to，只支持文本/JSON和无操作no-baseline，拒绝probe/规则覆盖等混用。agent当前版本取宿主，返回upgradePreview、普通report为null。面板拒绝过时结果；报告正文、目标或输入变化撤销旧比较，单纯缓存/人工修订的重读不撤销。

### 2.8 健康检查、依赖关系与人工处置

- 健康执行器默认review，显式run才安装已校验的本地USTAR并启动自有DSH/Chrome。只接受HTTP GET/只读DOM数量断言，不接受作者脚本或账户/模型配置；验真及执行受预算约束。面板仅导入历史JSON，不据版本相同认证当前制品，不改静态判定。
- dependencyGraph只表示端侧、依赖类别、候选提供者及loader的潜在关系；多候选不擅自选择，不证明故障传播或自动安装依赖。
- reviews独立保存四态及依据，绑定目标、源码、插件/DSH、规则/目录及finding身份，变化后待重审。contextToken、锁内合并和原子替换防陈旧写入；人工记录不隐藏新风险、不改变结论/基线或授予豁免。

操作、身份及预算见[健康检查](guide.md#可选功能健康检查)、[依赖关系](guide.md#依赖关系与潜在影响)和[人工处置](guide.md#发现的人工处置)。

### 2.9 插件作者CI

同一已构建包的只读快照比较认证目录，默认矩阵包含`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`。默认阻断全部发现、未知、覆盖不足及vacuous；可显式设置风险策略，未知版本/工具错误始终阻断。all检查全部，new需身份相容的已审查JSON，旧风险和当前覆盖限制仍保留。

JSON为完整证据，SARIF/JUnit/离线HTML保留逐版本身份、限制和真实位置；HTML可从同一JSON回放门禁。输出/输入预算统一，超限返回工具错误，不截断成功证据。策略码与内核码分开，0仅表示满足所选策略。[作者流程](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留行为回归；不重建快照消除失败。`test/__baseline-versions.json`变更须审查判据并单独提交。默认测试只用只读profile副本；真实执行只清理自有目录/PID组，账户、模型、发布与外部发帖另取授权。

README写入口，Plan写契约/待办，guide写操作/预算，maintaining写维护，current-state写计数和限定证据。§6只保留未完成事项；完成后的契约/验证并入前文，删除原项并重排编号。版本/认证集合、链接、生成副本、许可证和语法矩阵由维护检查核对；真实宿主和公共发布状态单独验证。

## 4. 验收范围

当前验证摘要见[current-state](current-state.json)。macOS/Linux仅对已记录的精确输入、版本及制品有证据；Windows真实验收未完成，静态/合成/受控样本不等于完整业务认证。历史明细归档于`39d9f1a:docs/current-state.json`及其前序指针。源码版本号不证明已发布；正式发布须核对同一已验收tgz、registry和release附件。

## 5. 验证入口

运行`npm test`、`npm run check`及`node plugin/scripts/prepublish-check.mjs`；后者只检查、不发布。成功TAP用于`tools/update-current-state.mjs --test-summary`更新计数。`tools/meta-check.mjs --json`只读核对实际GitHub/npm元数据，候选高于registry是预期差异，取数失败不是通过。真实运行和同一tgz验收见[指南](guide.md#工程与真实集成)。

## 6. 后续工作

仅列未完成事项；优先级不是漏洞评级。现行布局、折叠与统一样式见§2.4；0.1.8后续重点为共享轮询、剩余计算/渲染开销和交付体积，并继续交互评测。

1. **P2：0.1.8共享订阅与可见性轮询。** 当前`useCompatibility`随组件挂载各自启动2秒轮询，详情section与badge分别订阅；改为按报告目标隔离的共享数据源，使总览、详情与角标复用请求和结果。页面不可见或无活跃订阅时暂停轮询，恢复可见时核对新鲜度，最后一个订阅卸载时清理定时器及在途请求；验证多组件只保留一条轮询链、手动刷新与失败恢复正常，目标变化和卸载后不发布过时结果。
2. **P2：0.1.8剩余按需计算与大列表开销。** 针对仍常驻的辅助面板、折叠时保留挂载的说明/表单内容，以及尚未延迟的关系派生和行数组计算，区分可安全延迟构建的只读内容与需保留的编辑状态。测量多插件场景的耗时、渲染次数、可见/隐藏DOM及派生计算成本，再选择缓存、延迟构建、分页或虚拟滚动；紧凑空态不得隐藏错误、覆盖不足或历史边界。验证筛选、输入/焦点、人工处置、升级预检与完整导出保持正常，不把已有表格延迟挂载或单纯隐藏内容当作本项完成。
3. **P2：0.1.8剩余交付代码去重与裁剪。** 在现有客户端真源、预编译构建、tree shaking和可复现生成检查基础上，核对仍随tgz重复出现的宿主副本、浏览器编译模块与stage-kernel暂存模块，按实际依赖减少重复和未用代码。保留单一真源，不为减重削弱报告/输入校验、许可证或宿主加载契约。以0.1.7及当前UI产物为基线，对比归档、解包、客户端原始/gzip字节和新增组件依赖；当前组件化后的体积增长仍需处理，并以独立tgz安装和三个槽位/面板/tool/内核一致性验收。
4. **P1：继续交互评测与小规模真实用户试用。** 在已开始的本地交互评测中继续核对信息定位、统一字号/字色、文字展开按钮、深浅色及窄容器可读性，跟踪反馈直至闭环；再面向少量真实用户试用，记录安装→理解→定位的误读、失败、误报、分享障碍及定位耗时。本地合成样例评测不替代真实安装试用，保留证据及coverage/vacuous限制，不以下载/star代替效果。联系、资料收集和公开分别授权，不默认遥测。
5. **P2：跟进上游验收。** 按2026-10-25核对状态跟进[market#932](https://github.com/dsh-market/dsh-market/issues/932)（已关闭，双查询失败处理仍需验收）、[1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22)（待npm安装方式）及[0xsline#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)（未合并）；变化后再验证，不重复发帖，补充反馈另取授权。状态见current-state，不代表当前安装已验收。
6. **P2：Windows真实验收（依环境条件暂缓）。** 环境具备后验证路径、安装、回收、权限、打包/诊断和自有资源清理；完成前保留未验收边界。
