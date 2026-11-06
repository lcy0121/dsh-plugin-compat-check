# 开发计划与维护约定

本文对应**0.2.4**。版本真源为`lib/version.mjs`；[README](../README.md)讲入口，[指南](guide.md)列操作/预算，[维护指南](maintaining.md)列实现与验证，[docs/current-state.json](current-state.json)保存带日期的限定回执。

## 1. 项目定位与交付状态

检查已安装DSH插件，提供源码位置、依据和覆盖限制。**0.2.4**适配0.2.2-rc.1目录/精确语义、Cordis与工具执行作用域，复验插件管理和三槽位；声明放行、激活或无发现仍不等于业务正常。功能按本版描述，公开分发以[npm](https://www.npmjs.com/package/dsh-plugin-compat-check)和[GitHub Releases](https://github.com/lcy0121/dsh-plugin-compat-check/releases)实际记录为准，限定验收见current-state。

npm交付面板、详情/角标、`compat_check`、skill和内核，无CLI bin、不支持npx。CLI、安装检查、批量、作者CI和健康执行器从private仓库运行；源码安装须[构建完整tgz](../plugin/README.md#从源码构建安装)。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

AST按host/client/shared记录Context、服务及真实位置，入口遵循宿主解析。动态、变异、遮蔽、逃逸、异步及超限保守推断或弃权；能力守卫须控制调用，try/catch不是能力证明。不执行目标，不保存prompt或任意枚举；[语义范围](guide.md#参数与生命周期语义)与[提取规则](maintaining.md#提取器与探针维护)分别维护。

0.2.4开发已增加0.2.2-rc.1[独立审查](../rules/dsh-0.2.2-rc.1-review.json)：宿主107服务/601方法、客户端8服务/46方法；完整签名与固定官方归档/桌面字节对拍，提取器补齐泛型、带引号装饰器、生成器和可选方法。目录差分包含提取修正，不全是上游新增；新精确语义与迁移范围见[维护指南](maintaining.md#022-rc1语义与宿主验收)。

rc.5[来源审查](../rules/dsh-0.2.1-rc.5-review.json)核对完整归档388文件差分，相对rc.3无服务/方法/生成签名变化；语义仍按精确版本独立审查。推理正文Slot新增rawText，text为显示文本；静态提示只定位注册和迁移限制，不验证props用途或流式行为，不把text使用报错。目录、语义、实际宿主及业务验收分别记录。

### 2.2 结论、影响与基线

certainty与impactBasis独立；ok且无已验证调用标vacuous，保留coverage。未观测不等于缺失，provide只是候选；必需inject须同目标合格absent才推断激活障碍，启用且可靠映射的FAILED/PENDING才构成相应fatal实测发现。采样不执行getter或保存属性值，超限保留未知；精确豁免不放行非法字段。

[基线schema2](../lib/baseline.mjs)按目标及判定身份隔离，锁内比较、原子写入；失败、不完整、取消或卸载不推进。身份不相容中性显示，证据减弱不称修复，坏/旧原件保留。[锁恢复](guide.md#本地状态锁恢复)须显式确认并证明持有者退出。

### 2.3 报告结构与兼容策略

[报告schema1](../lib/contracts.mjs)：CLI kind=`plugin-compat-check/result`，HTTP kind=`plugin-compat-check/report`；tool保留summary/text及report/baseline/cache。不兼容变更升schema，普通退出码为**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**。

缓存按目标/输入/观测身份隔离，有界single-flight及worker队列；失效结果不得发布或写基线，刷新失败保留旧成功及错误。提取与计算受独立worker监督，返回后重核身份再提交；超限报工具错误，不裁证据求成功。[资源预算](guide.md#日常检查与源码交付)集中维护。

筛选/分页不裁完整导出；issue-report禁读写基线。低信任终端字段转义，JSON保留原身份；故障报告须预览后复制，常见凭据隐藏不保证完全脱敏，不自动发帖。

### 2.4 DSH接入要点

三槽位为`settings.plugins.tab`、`plugins.detail.section / .badge`；无可靠身份不作包级判断。客户端用ModuleLoader id/factory，tool required为顶层数组，skill经provider注册。界面入口见[README](../README.md#界面各板块怎么用)，UI真源/组件来源见[维护指南](maintaining.md#维护入口与语法覆盖)。

主结果→依赖→人工处置→升级预检，高级工具和辅助说明默认收起，明细每页50项。中英韩固定文案/无障碍/故障模板同步，原始证据、用户依据、命令和JSON不翻译；切换不重建草稿。三槽位共享可见性轮询，隐藏暂停/取消，迟到结果丢弃。

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

[current-state](current-state.json)按提交、归档和平台记录结果；正式发布须使用通过所选提交CI及同一tgz的新宿主macOS/Linux九项UI验收的文件，并核验公共安装。历史回执不认证新版本或重打包；固定24项业务样本仍保留12项未识别故障。Windows、用户试用和一般业务保持未验收；合成病例不替代真实试用。

## 5. 验证入口

运行`npm test`、`npm run check`和`node plugin/scripts/prepublish-check.mjs`；发布前门禁不发布。成功TAP交给update-current-state更新计数。meta-check只读核对实际GitHub/npm，取数失败不算通过；[发布核对顺序](maintaining.md#同一制品发布核对)集中维护。

## 6. 后续工作

仅列未完成事项，优先级不是漏洞评级。0.2.3的#7–#10源码修复、回归矩阵和本地交付检查见[维护指南](maintaining.md#用户issue修订与回归)；2026-11-05只读复核仍为open，待Windows现场复验。远端CI和平台验收只认对应提交与同一归档，不由本地结果推定。

1. **P0：完成0.2.4同一制品回归与交付记录。** [本地交付](current-state.json)已完成版本/副本同步、独立rc22五suite/24项回归、#7–#10专项102项、Node22/26各1321通过9跳过、check/prepublish及依赖审计；同一0.2.4候选tgz通过macOS新宿主九项UI、HTTP/tool、预检及清理，保留12项未识别业务故障和作者CI覆盖/预算限制。尚须获授权后推送所选提交，取得真实Linux同包及精确提交CI回执，再由Mac重用CI归档收口；Windows仍未验收，公开发行另循[同一制品流程](maintaining.md#同一制品发布核对)。
2. **P1：继续交互评测与小规模真实用户试用。** 复核定位、字体、展开、主题/窄容器及误读、失败、误报与操作耗时；联系、收集、公开分别授权，不默认遥测。
3. **P2：等待上游修复与发行入口更新。** [1.73.12复验](upstream-verification.md)已完成：恢复细节/新装告警缺口仍在；0.2.2-rc.1 Desktop Host两次恢复及45秒手动自救仍未通过。awesome#717已合并，1024仍缺npm映射。待#928/#1047修复或npm映射变化后重验，反馈另取授权。
4. **P2：Windows真实验收（依环境条件暂缓）。** 优先补#7–#10的Windows10 / DSH rc.5同一制品现场验证，记录版本、路径、启动方式及修复前后结果；同时验证安装、回收、权限、打包/诊断和自有资源清理。路径模拟及其它平台不替代实机结果，环境具备前保持未验收。
