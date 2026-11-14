# 开发计划与维护约定

本文对应**0.2.4**。版本真源为`lib/version.mjs`；[README](../README.md)讲入口，[指南](guide.md)列操作/预算，[维护指南](maintaining.md)列实现与验证，[docs/current-state.json](current-state.json)保存带日期的限定回执。

## 1. 项目定位与交付状态

检查已安装DSH插件，提供源码位置、依据和覆盖限制。**0.2.4**适配0.2.2-rc.1目录/精确语义、Cordis与工具执行作用域，复验插件管理和三槽位；声明放行、激活或无发现仍不等于业务正常。功能按本版描述，公开分发以[npm](https://www.npmjs.com/package/dsh-plugin-compat-check)和[GitHub Releases](https://github.com/lcy0121/dsh-plugin-compat-check/releases)实际记录为准，限定验收见current-state。

npm交付面板、详情/角标、`compat_check`、skill和内核，无CLI bin、不支持npx。CLI、安装检查、批量、作者CI和健康执行器从private仓库运行；源码安装须[构建完整tgz](../plugin/README.md#从源码构建安装)。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

AST按host/client/shared记录Context、服务及真实位置，入口遵循宿主解析。动态、变异、遮蔽、逃逸、异步及超限保守推断或弃权；能力守卫须控制调用，try/catch不是能力证明。不执行目标，不保存prompt或任意枚举；[语义范围](guide.md#参数与生命周期语义)与[提取规则](maintaining.md#提取器与探针维护)分别维护。

0.2.4内置0.2.2-rc.1[独立审查](../rules/dsh-0.2.2-rc.1-review.json)：宿主107服务/601方法、客户端8服务/46方法；完整签名与固定官方归档/桌面字节对拍，提取器补齐泛型、带引号装饰器、生成器和可选方法。目录差分包含提取修正，不全是上游新增；新精确语义与迁移范围见[维护指南](maintaining.md#022-rc1语义与宿主验收)。

rc.5[来源审查](../rules/dsh-0.2.1-rc.5-review.json)核对完整归档388文件差分，相对rc.3无服务/方法/生成签名变化；语义仍按精确版本独立审查。推理正文Slot新增rawText，text为显示文本；静态提示只定位注册和迁移限制，不验证props用途或流式行为，不把text使用报错。目录、语义、实际宿主及业务验收分别记录。

### 2.2 结论、影响与基线

certainty与impactBasis独立；ok且无已验证调用标vacuous，保留coverage。未观测不等于缺失，provide只是候选；必需inject须同目标合格absent才推断激活障碍，启用且可靠映射的FAILED/PENDING才构成相应fatal实测发现。采样不执行getter或保存属性值，超限保留未知；精确豁免不放行非法字段。

[基线schema2](../lib/baseline.mjs)按目标及判定身份隔离，锁内比较、原子写入；失败、不完整、取消或卸载不推进。身份不相容中性显示，证据减弱不称修复，坏/旧原件保留。[锁恢复](guide.md#本地状态锁恢复)须显式确认并证明持有者退出。

### 2.3 报告结构与兼容策略

[报告schema1](../lib/contracts.mjs)：CLI kind=`plugin-compat-check/result`，HTTP kind=`plugin-compat-check/report`；tool保留summary/text及report/baseline/cache。不兼容变更升schema，普通退出码为**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**。

缓存按目标/输入/观测身份隔离，有界single-flight及worker队列；失效结果不得发布或写基线，刷新失败保留旧成功及错误。提取与计算受独立worker监督，返回后重核身份再提交；超限报工具错误，不裁证据求成功。[资源预算](guide.md#日常检查与源码交付)集中维护。

筛选/分页保留完整导出。issue-report不读写基线，终端转义低信任字段；报告须预览后手动分享。

### 2.4 DSH接入要点

三槽位为`settings.plugins.tab`、`plugins.detail.section / .badge`；无可靠身份不作包级判断。客户端用ModuleLoader id/factory，tool required为顶层数组，skill经provider注册。界面入口见[README](../README.md#界面各板块怎么用)，UI真源/组件来源见[维护指南](maintaining.md#维护入口与语法覆盖)。

主结果→依赖→人工处置→升级预检；辅助内容默认收起，明细50项/页。三语只译固定模板，切换保留草稿；三槽位共享可见性轮询，隐藏取消、迟到结果丢弃。

[HTTP](guide.md#本地http边界)先核本地/完整同源和请求标记，再调用宿主connection.requestRejection；未认证401、鉴权不可用503，拒绝早于计算/写入。私有profile不是OS沙箱，只认证登记的精确版本/目录；[新目录](maintaining.md#api目录候选审查)须另审另验。

### 2.5 有限静态批量契约

[批量](guide.md#升级预检与有限批量)只扫1–16项固定版本/摘要的第三方本地包，不下载/执行，不借probe、豁免或基线。拒绝链接/特殊文件/官方包，保留全部发现与诊断；总码先3再最重0/1/2，previous须重扫且身份相容。手动Action只扫固定合成样本。

### 2.6 真实故障回归与呈现

[固定回归](maintaining.md#真实插件回归)锁定精确DSH/目录、五个制品及24项期望，先封存预测，再取独立HTTP/DOM/磁盘真值，核身份/时序/清理。静态/service-only、自然/受控、FP/FN及驱动错误分列；绿色只表示期望重现，不是全部业务通过或生态准确率。hash不是签名，不猜替代API或修复版本。

### 2.7 升级前静态预检契约

`runUpgradePreview`仅支持精确**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3、0.2.1-rc.5、0.2.2-rc.1**，其余读输入前退出3。对同组私有字节分别判定，捕获/分析/清理受监督，清理失败不成功；不安装/升级/执行宿主，不借运行时、豁免、普通缓存或基线。

[预检schema1](../lib/upgrade-contract.mjs)：**0/1/2为无/非致命/致命新增或变重风险，3为无法预检**；旧风险及coverage/vacuous保留。CLI给nm/当前版本/upgrade-to，agent当前版本取宿主；返回upgradePreview，普通report为null。输入/目标/身份变化撤销旧比较，过时响应丢弃；[参数与预算](guide.md#升级预检与有限批量)统一维护。

### 2.8 健康检查、人工处置与历史

[健康执行器](guide.md#可选功能健康检查)默认review，授权run才验真/安装制品并启动自有DSH/Chrome；只接受有预算的同源GET/只读DOM，不接作者脚本或账户/模型配置。面板仅导入历史JSON，不认证当前制品。[依赖图](guide.md#依赖关系与潜在影响)仅表示候选与潜在路径。

[人工处置](guide.md#发现的人工处置)绑定源码/目标/判定身份，不隐藏风险或改基线/豁免；保存须当前令牌，锁内重读并原子替换，陈旧草稿可复制/放弃，坏原件保留。[归档/历史](guide.md#人工处置归档与本地历史报告)须显式操作及完整备份；恢复只供参考，身份不相容中性显示，证据减弱不称修复，满额先导出再删除。

### 2.9 插件作者CI

默认矩阵包含`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`、`0.2.2-rc.1`，只读同一构建包；默认阻断发现、未知、覆盖不足及vacuous。显式策略不放行工具错误，new须已审查且身份相容的JSON。各格式保留完整证据，超限失败；策略码与内核码分开，0仅表示满足策略。参数、预算及工作流统一见[作者流程](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留正反例，不重建快照求绿；`test/__baseline-versions.json`判据变更单独审查/提交。默认测试用只读profile副本，真实执行只清自有目录/PID组，账户/模型/外部写入分别授权。§6仅列待办，完成能力归入相应文档，历史细节留Git。移除运行文件前确认职责已替代，保留许可证和有效夹具。

## 4. 验收范围

[current-state](current-state.json)按提交、归档和平台记录结果；正式发布须使用通过所选提交CI及同一tgz的新宿主macOS/Linux九项UI验收的文件，并核验公共安装。历史回执不认证新版本或重打包；固定24项业务样本仍保留12项未识别故障。0.2.4所选提交CI及新宿主macOS/Linux同包九项UI已通过，回执见current-state；Windows、用户试用和一般业务保持未验收；合成病例不替代真实试用。

## 5. 验证入口

运行`npm test`、`npm run check`和`node plugin/scripts/prepublish-check.mjs`；发布前门禁不发布。成功TAP交给update-current-state更新计数。meta-check只读核对实际GitHub/npm，取数失败不算通过；[发布核对顺序](maintaining.md#同一制品发布核对)集中维护。

## 6. 后续工作

仅列未完成事项，优先级不是漏洞评级。沿用的#7–#10修复与回归见[维护指南](maintaining.md#用户issue修订与回归)；源码修复不替代Windows现场确认。CI和平台验收以对应提交及同一归档为准。

1. **P0：0.2.5首先完成rc.2/rc.3来源与精确API审查。** 固定官方[rc.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.2)（2026-11-11、ddac967）和[rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)（2026-11-13、38a6a5c）的tag/完整commit、源码/npm/桌面归档及摘要，按rc.1→rc.2→rc.3逐段核完整签名、依赖与语义；本次GitHub比较仅返回300文件，须用完整来源补齐。分别审查后再登记两版目录、选择策略、双向预检及作者矩阵，保留旧五版；公告或指南目录名不代替精确版本认证。
2. **P0：适配Agent所有权、工具管线与Session精确语义。** 审查rc.2的调用者作用域/handle释放、具名多层SubAgent/Team及按preset关闭interrupt的准入；复验native/PTC选定执行器、condition集合、只读并行顺序、预算超限清状态和取消收敛。按[固定tag升级指南](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.2/docs/upgrade-guide/v0.2.2-rc.1)补Session.append单事件/数组重载、工具及AttachmentError错误码、动态MCP接口审查与迁移提示；分别核rc.3，未知对象流/回调/时序保持弃权，不据提示新增fatal或已验证调用。
3. **P0：复验插件加载、管理协议与鉴权边界。** 核可选客户端插件失败后的启动隔离、启用但未加载的“未运行”状态及原因，与现有Cordis状态/包映射区分。审查listBundles的updatable→update（registry/git/缺省）、unexpected-package及错误结构对探针、指导和验收夹具的影响；用自有registry复验更新、失败/取消恢复与dispose。核Zod4.6.6升级影响，两版分别跑严格JSON原始校验器、无参tool/真实profile、设置页、401/403/503及重启鉴权清理，旧五版回归保留。
4. **P0：适配新客户端定位与槽位并复验三语界面。** 核rc.2浮层定位、缩放/平移/滚动及侧栏入口收纳，另审rc.3新增sidebar.session.action、workspace.picker工厂和directoryFlow槽位；按实际依赖决定迁移，不能因rc.3公告简短认定客户端契约未变。复验本工具三槽位、注入/热卸载恢复、焦点/草稿、窄容器/主题、三语及宿主语言回退；rc.3导入插件仅用隔离合成会话核加载/持久化依赖，不读取用户会话，Windows更新修复仍须现场另验。
5. **P0：核对新发行布局、运行时与迁移指导。** 对拍两版随npm/桌面交付的源码、文档、primary-runtime和app-boot定位，核Node>=24.9及pnpm实际版本后调整私有执行器/CI pin，保留Node22静态工具。审查dsh-doc入口及搜索/账号/终端/Worktree归档配置迁移与本工具的实际交集，更新源码证据、三语指导和skill；目录缺失仍作覆盖限制，普通检查不代写宿主配置。保留受控样本、未识别故障与一般业务的区别。
6. **P0：完成0.2.5两宿主同一制品回归与交付。** 为两版建立独立固定插件清单/预期，扩展验收目标、Linux矩阵及原始JSON/schema校验器门禁；作者默认版本由五增至七时同步审查总时限、输出与资源预算。重跑#7–#10、普通检查/预检/作者CI、HTTP/tool、九项UI及清理，用同一候选tgz取得macOS/Linux两版回执；Windows仍单列未验收。实现完成时统一0.2.5版本真源、manifest/lock、各版README、指南、skill/契约副本及current-state，正式发行另按同一制品流程核验。
7. **P1：继续交互评测与小规模真实用户试用。** 复核定位、字体、展开、主题/窄容器及误读、失败、误报与操作耗时；联系、收集、公开分别授权，不默认遥测。
8. **P2：等待上游修复与发行入口更新。** [1.73.12复验](upstream-verification.md)已完成：恢复细节/新装告警缺口仍在；0.2.2-rc.1 Desktop Host两次恢复及45秒手动自救仍未通过。awesome#717已合并，1024仍缺npm映射。待#928/#1047修复或npm映射变化后重验，反馈另取授权。
9. **P2：Windows真实验收（依环境条件暂缓）。** 优先补#7–#10的Windows10 / DSH rc.5同一制品现场验证，记录版本、路径、启动方式及修复前后结果；同时验证安装、回收、权限、打包/诊断和自有资源清理。路径模拟及其它平台不替代实机结果，环境具备前保持未验收。
