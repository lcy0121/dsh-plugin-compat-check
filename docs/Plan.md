# 开发计划与维护约定

源码版本仍为**0.1.7**，0.1.8的UI改进已进入开发，尚未发布。版本真源为`lib/version.mjs`；[docs/current-state.json](current-state.json)记录计数、限定验收、发布状态及历史指针。[README](../README.md)写入口，[指南](guide.md)写操作/预算，[维护指南](maintaining.md)写维护，[作者CI](author-ci.md)写接入；本计划保留契约与未完成事项。

## 1. 项目定位与交付状态

检查**已安装DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制。声明放行、激活、客户端到货、无发现或覆盖完整均不等于业务验收。

单仓库、单Node判定内核。根为private工作区；npm仅交付`plugin/`的面板、tool、skill及内核，没有CLI bin，不支持`npx dsh-plugin-compat-check`。CLI、安装检查、批量、作者CI和健康执行器从仓库运行。源码安装须[构建完整tgz](../plugin/README.md#从源码构建安装)，不能直接安装根GitHub spec或裸子目录。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

JS/TS AST、词法绑定和源码图识别Context、服务及调用span，按host/client/shared分端。变异、遮蔽、逃逸、动态、异步、递归、超限及未知挂载保守推断或弃权；能力守卫须控制对应调用，try/catch不作能力证明。位置来自实际字节，声明/loader无位置时不编造。

入口遵循宿主的ESM条件/顺序、CommonJS回退及相对patch锚定/insert/id覆盖；客户端`./client`仅认字符串或一层字符串default，不猜扩展名/index。固定rc.2/rc.3语义仅覆盖`startSession`四项、定时器弃用与引用生命周期；参数风险不单独触发声明不符，未知副作用撤回旧事实，原始prompt/任意枚举不入报告。详见[语义范围](guide.md#参数与生命周期语义)和[提取器维护](maintaining.md#提取器与探针维护)。

### 2.2 结论、影响与基线

- `certainty=certain / suspected`与`impactBasis=measured / inferred`独立；`vacuous=true`为ok但无已验证调用，须呈现coverage及客户端待验证项。
- 服务区分present/absent/unobserved/unreadable，只采样描述符、不执行getter；省略键/目录缺项不证明缺失。必需inject仅凭合格同目标absent观测推断激活障碍；provide只是候选。可靠映射且启用的FAILED/PENDING条目才可形成fatal实测发现。
- DSH≥0.2.1-rc.1优先自有`engines.dsh`，缺失回退官方peer；旧目标用旧策略。非法声明保留风险；豁免仅绑定插件及DSH精确版本，不放行非法字段。
- schema2基线按canonical目标、观察路径、模式及工具/规则/目录身份隔离，锁内比较、原子写入。不完整、失败、取消或卸载不推进，身份变化中性；重复发现稳定一对一配对，保留entryId/列号/findingKeyVersion，证据减弱不声称修复。

旧/坏/未知schema及不安全基线保留原件。锁、基线、review使用当前用户私有目录：新建0700，已有不安全目录拒绝读写、不隐式chmod。[锁恢复](guide.md#本地状态锁恢复)须显式确认并证明持有者退出，不按年龄/PID复用清锁。

### 2.3 报告结构与兼容策略

真源`lib/contracts.mjs`：schema1；CLI kind=`plugin-compat-check/result`，HTTP kind=`plugin-compat-check/report`；tool保留summary/text和report/baseline/cache。字段、计数、发现及退出码须自洽，兼容新增字段，不兼容变更升schema。普通退出码：**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**；3不是插件结论。

缓存按目标、probe及分析/观测身份隔离，结合事件/巡检、TTL、容量淘汰和single-flight；失效任务不得发布或写基线，失败保留旧成功和错误。普通分析/身份worker共享有界队列，卸载取消并回收；[预算](guide.md#日常检查与源码交付)集中维护。

故障报告共享生成；`--issue-report`禁读写基线，与json/quiet互斥。筛选不裁剪完整导出，显式复制才写剪贴板，不自动发帖。终端文本转义控制字符，JSON保留身份；不导出原始源码、日志、probe或baseline，不保证任意文本完全脱敏。

### 2.4 DSH接入要点

槽位为`settings.plugins.tab`、`plugins.detail.section / .badge`，不以缺可靠身份的`plugins.item`作包级判断。客户端用`window.__ModuleLoader__.load({id,factory})`，宿主不代构建；tool required为顶层数组，skill由provider注册，profile取实际目标。

0.1.8 UI契约：

- 主卡片先显示结论数量、目标/时间/缓存、覆盖与中性基线、筛选及结果表，再呈现辅助工具。目录按需展开，未认证警告直接可见，长摘要/路径换行；Separator分隔信息、筛选和结果。升级预检独立成卡，释义、版本及采样集中于页尾说明卡；证据语义与完整导出不变。
- 辅助大表默认收起并延迟挂载，数量、覆盖/截断和历史边界仍可见；主结果表展开。各入口用有文字和aria-expanded的“展开/收起”按钮；表单收起保留输入，历史处置受控，升级新增风险默认展开。插件/loader表前两列最小240/280px，长名称正常换行，窄容器横滚，支持键盘。
- 沿用依赖关系板块的系统字体：标题14px、正文13px、展开按钮12px，字号共享。正文、依据、表头用主文本色，时间/版本/来源/数量等注释用灰色；深色随主题适配，风险徽标保留语义色。
- 真源为`plugin/src/client.jsx`、`plugin/src/components/ui/`、`plugin/src/styles.css`；使用[经适配的shadcn/ui组件](../plugin/src/components/ui/PROVENANCE.md)。Tailwind/esbuild仅在开发期构建，生成`plugin/lib/client.js`并内嵌预编译CSS，复用宿主React，无ReactDOM/浮层运行时。样式限定`.dsc-ui`，按挂载所有者共享、最后卸载时移除；不直接改产物，组件化不等于减重。

rc.3入口：账号菜单→设置→内置插件→兼容性。导航/草稿验收须核对活动区域、目标会话和内容后置条件；富草稿持有/释放成对，不承诺已销毁输入的附件恢复。折叠/空标题不作激活失败。

普通体检按范围选旧/rc.2/rc.3目录，显式覆盖优先；`CATALOG_REFERENCES`仅认证登记精确版本与字节，漂移失败。未来/未知/自定义目录保持未认证，[新增目录](maintaining.md#api目录候选审查)另行审查及实机验收。

报告/预检仅GET，人工保存仅JSON POST；均要求本地/完整同源校验及`X-DSH-Compat-Request: 1`，标记不替代鉴权。[HTTP](guide.md#本地http边界)及[私有执行环境](guide.md#安装与probe执行环境)不承诺OS沙箱/跨用户隔离。HMR/卸载清理注册、计时器、handle及在途计算。

### 2.5 有限静态批量契约

schema1 manifest锁定1–16项第三方本地包、精确版本及树摘要；只扫稳定捕获并验hash的私有副本，拒绝链接、特殊文件、官方包及缺dsh元数据。不下载/执行，不用probe/豁免/基线，不跨样本提供服务。[命令与限额](guide.md#升级预检与有限批量)。

`plugin-compat-check/batch-result`保留发现、coverage/vacuous、诊断和待复核状态。单项错误不阻断其它项，总码先3再取最重0/1/2；previous须重扫且身份相容才比较，变化中性，坏输入失败。手动Action仅扫固定公开合成样本，不接用户URL或自动定时运行。

### 2.6 真实故障回归与呈现

固定DSH/目录、五个npm制品及24项业务期望；动作前封存预测，真值取独立HTTP/DOM/磁盘receipt。静态/service-only、自然/受控故障及驱动错误分列，回放核对身份、时序和清理，hash不作签名。[限定样本流程](maintaining.md#真实插件回归)不代表生态准确率。

`lib/finding-guidance.mjs`生成“下一步核实”，不猜替代API/修复版本、不自动改配置；呈现保留目标、时间、缓存、覆盖限制及中性基线。

### 2.7 升级前静态预检契约

`runUpgradePreview({nm,currentVersion,targetVersion})`仅支持精确**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，其余在读输入前退出3。同组私有字节联合提取后分别判定，捕获/分析/清理受worker预算监督，清理失败不返回成功。不安装/升级宿主，不借用运行时、probe、loader、豁免或普通缓存/基线。

真源`lib/upgrade-contract.mjs`：schema1，kind=`plugin-compat-check/upgrade-preview`，mode=`static-version-comparison`；状态compared/unsupported-version/error，changes含added/worsened/resolved/unchanged/improved。**0/1/2表示无/非致命/致命新增或变重风险，3表示无法预检**；旧风险及coverage/vacuous保留，ok仅表示比较完成。

CLI须nm、当前版本及upgrade-to，仅支持文本/JSON和无操作no-baseline，不混用probe/规则覆盖。agent从宿主取当前版本，返回upgradePreview、普通report为null。面板丢弃过时响应；报告正文、目标或输入变化撤销旧比较，单纯缓存/人工修订重读不撤销。

### 2.8 健康检查、依赖关系与人工处置

- 健康执行器默认review；显式run才安装已校验本地USTAR并启动自有DSH/Chrome，仅允许HTTP GET/只读DOM数量断言，不接作者脚本或账户/模型配置，验真/执行有预算。面板仅导入历史JSON，不以版本相同认证当前制品或改变静态结论。
- dependencyGraph为分端声明、必需性、候选提供者及loader的潜在关系，不擅选候选、不证明传播、不自动安装依赖。
- reviews独立保存四态及依据，绑定目标/源码/插件/DSH/规则/目录/finding身份，变化待重审；contextToken、锁内合并和原子替换防陈旧写入，不隐藏新风险、不改变结论/基线或授予豁免。

详见[健康检查](guide.md#可选功能健康检查)、[依赖关系](guide.md#依赖关系与潜在影响)、[人工处置](guide.md#发现的人工处置)。

### 2.9 插件作者CI

同一已构建包的只读快照对比认证目录，默认矩阵包含`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`。默认阻断全部发现、未知、覆盖不足和vacuous；显式风险策略可调整，未知版本/工具错误始终阻断。all查全部，new须身份相容的已审查JSON，旧风险及覆盖限制仍保留。

JSON保留完整证据，SARIF/JUnit/离线HTML保留逐版本身份、限制及真实位置；HTML可由同一JSON回放门禁。输入/输出超预算即工具错误，不截断成功证据；策略码与内核码分开，0仅表示满足策略。[作者流程](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留行为回归，不重建快照求绿；`test/__baseline-versions.json`的判据变更须单独审查/提交。默认测试仅用只读profile副本；真实执行只清自有目录/PID组，账户、模型、发布及外部发帖另取授权。

§6仅列未完成事项，完成后并入前文并重排编号。维护检查核对版本/认证集合、链接、生成副本、许可证及语法矩阵；真实宿主、公共发布状态另验，历史明细留Git。

## 4. 验收范围

以[current-state](current-state.json)的精确输入、版本、制品及平台为限，macOS/Linux记录不外推；Windows实机未验收。静态/合成/受控样本不等于完整业务认证。历史见`39d9f1a:docs/current-state.json`及前序指针；正式发布须核对同一已验收tgz、registry及release附件。

## 5. 验证入口

运行`npm test`、`npm run check`、`node plugin/scripts/prepublish-check.mjs`（不发布）；成功TAP交给`tools/update-current-state.mjs --test-summary`更新计数。`tools/meta-check.mjs --json`只读查GitHub/npm，候选高于registry为预期差异，取数失败不是通过。[真实集成与同一tgz验收](guide.md#工程与真实集成)。

## 6. 后续工作

仅列未完成事项，优先级不是漏洞评级；现行UI见§2.4。

1. **P2：0.1.8共享订阅与可见性轮询。** 将各组件独立的2秒轮询改为按报告目标共享订阅；不可见/无订阅暂停，恢复核对新鲜度，最后卸载清定时器及在途请求。验多组件单轮询链、手动刷新/失败恢复、目标隔离和过时响应丢弃。
2. **P2：0.1.8剩余按需计算与大列表开销。** 测量常驻面板、隐藏DOM、关系派生及行数组的耗时/规模，区分可延迟的只读内容与需保留的编辑状态，再用缓存、延迟构建、分页或虚拟滚动。保留错误/覆盖/历史边界及筛选、输入/焦点、处置、预检和完整导出；已有表格懒挂载不代表本项完成。
3. **P2：0.1.8剩余交付代码去重与裁剪。** 基于现有真源、预编译/tree shaking及生成校验，裁减tgz中宿主副本、浏览器模块和stage-kernel的实际重复/未用代码，不削弱校验、许可证或加载契约。以0.1.7及当前UI为基线，对比归档/解包/客户端原始与gzip字节，解决组件化后的体积增长；验独立tgz及三个槽位、面板/tool/内核一致性。
4. **P1：继续交互评测与小规模真实用户试用。** 闭环本地信息定位、字号/字色、展开按钮、主题及窄容器反馈，再面向少量真实用户记录安装→理解→定位的误读、失败、误报、分享障碍及耗时。合成样例不替代真实安装试用，保留coverage/vacuous；联系、收集、公开分别授权，不默认遥测。
5. **P2：跟进上游验收。** 按2026-10-25记录跟进[market#932](https://github.com/dsh-market/dsh-market/issues/932)（已关闭，双查询失败处理待验）、[1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22)（待npm安装方式）、[0xsline#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)（未合并）。变化后再验，反馈另取授权，不重复发帖；历史状态不认证当前安装。
6. **P2：Windows真实验收（依环境条件暂缓）。** 条件具备后验证路径、安装、回收、权限、打包/诊断及自有资源清理；此前保持未验收。
