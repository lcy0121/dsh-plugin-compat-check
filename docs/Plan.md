# 开发计划与维护约定

当前版本为**0.2.7**，以 `lib/version.mjs` 为准。本文维护产品契约与待办。操作见[指南](guide.md)，验收流程见[维护指南](maintaining.md)，带日期的证据见[docs/current-state.json](current-state.json)。

## 1. 项目定位与交付状态

检查已安装DSH插件，提供源码位置、依据和覆盖限制。已发布功能包括 0.2.2-rc.5 精确目录、内容拒答与搜索路由迁移提示、八版作者矩阵。声明放行、激活或无发现不等于业务正常。公开分发见[npm](https://www.npmjs.com/package/dsh-plugin-compat-check)和[GitHub Releases](https://github.com/lcy0121/dsh-plugin-compat-check/releases)。

npm交付面板、详情/角标、`compat_check`、skill和内核，无CLI bin、不支持npx。CLI、安装检查、批量、作者CI和健康执行器从仓库工作区运行；源码安装须[构建完整tgz](../plugin/README.md#从源码构建安装)。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

AST 按 host/client/shared 保留真实位置，按宿主规则解析入口。动态、变异、遮蔽、逃逸、异步或超限时保守推断或弃权。能力守卫须控制实际调用。静态分析不执行目标、保存 prompt 或遍历任意服务。详见[语义](guide.md#参数与生命周期语义)及[提取](maintaining.md#提取器与探针维护)。

本版登记[0.2.2-rc.5](../rules/dsh-0.2.2-rc.5-review.json)，宿主109服务/640方法、客户端8/46，保留旧目录。0.2.2-rc.4用于独立来源差分。语义边界和实机回执见[维护指南](maintaining.md#026rc5适配)。

历史目录修正及推理槽位 `rawText`、`text` 的使用见[来源记录](../rules/dsh-0.2.1-rc.5-review.json)和[语义指南](guide.md#参数与生命周期语义)。

### 2.2 结论、影响与基线

certainty与impactBasis独立；ok且无已验证调用标vacuous，保留coverage。未观测不等于缺失，provide只是候选；必需inject须同目标合格absent才推断激活障碍，启用且可靠映射的FAILED/PENDING才构成相应fatal实测发现。采样不执行getter或保存属性值，超限保留未知；精确豁免不放行非法字段。

[基线schema2](../lib/baseline.mjs)按目标及判定身份隔离，锁内比较、原子写入；失败、不完整、取消或卸载不推进。身份不相容中性显示，证据减弱不称修复，坏/旧原件保留。[锁恢复](guide.md#本地状态锁恢复)须显式确认并证明持有者退出。

### 2.3 报告结构与兼容策略

[报告schema1](../lib/contracts.mjs)：CLI kind=`plugin-compat-check/result`，HTTP kind=`plugin-compat-check/report`；tool保留summary/text及report/baseline/cache。不兼容变更升schema，普通退出码为**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**。

缓存按目标/输入/观测身份隔离，有界single-flight及worker队列；失效结果不得发布或写基线，刷新失败保留旧成功及错误。提取与计算受独立worker监督，返回后重核身份再提交；超限报工具错误，不裁证据求成功。[资源预算](guide.md#日常检查与源码交付)集中维护。

筛选/分页保留完整导出。issue-report不读写基线，终端转义低信任字段；报告须预览后手动分享。

### 2.4 DSH接入要点

三槽位为`settings.plugins.tab`、`plugins.detail.section / .badge`；无可靠身份不作包级判断。客户端用ModuleLoader id/factory，tool required为顶层数组，skill经provider注册。界面入口见[README](../README.md#界面各板块怎么用)，UI真源/组件来源见[维护指南](maintaining.md#维护入口与语法覆盖)。

主结果按依赖、处置、预检展开，辅助区默认收起，明细每页50项。三语只译固定模板。共享可见性轮询取消隐藏任务并丢弃迟到结果。

[HTTP](guide.md#本地http边界)先核本地/完整同源和请求标记，再调用宿主connection.requestRejection；未认证401、鉴权不可用503，拒绝早于计算/写入。私有profile不是OS沙箱，只认证登记的精确版本/目录；[新目录](maintaining.md#api目录候选审查)须另审另验。

### 2.5 有限静态批量契约

[批量](guide.md#升级预检与有限批量)只扫1–16项固定版本/摘要的第三方本地包，不下载/执行，不借probe、豁免或基线。拒绝链接/特殊文件/官方包，保留全部发现与诊断；总码先3再最重0/1/2，previous须重扫且身份相容。手动Action只扫固定合成样本。

### 2.6 真实故障回归与呈现

[固定回归](maintaining.md#真实插件回归)锁定精确DSH/目录、五个制品及24项期望，先封存预测，再取独立HTTP/DOM/磁盘真值，核身份/时序/清理。静态/service-only、自然/受控、FP/FN及驱动错误分列；绿色只表示期望重现，不是全部业务通过或生态准确率。hash不是签名，不猜替代API或修复版本。

### 2.7 升级前静态预检契约

`runUpgradePreview`仅支持精确**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3、0.2.1-rc.5、0.2.2-rc.1、0.2.2-rc.2、0.2.2-rc.3、0.2.2-rc.5**，其余读输入前退出3。对同组私有字节分别判定，捕获/分析/清理受监督，清理失败不成功；不安装/升级/执行宿主，不借运行时、豁免、普通缓存或基线。

[预检schema1](../lib/upgrade-contract.mjs)：**0/1/2为无/非致命/致命新增或变重风险，3为无法预检**；旧风险及coverage/vacuous保留。CLI给nm/当前版本/upgrade-to，agent当前版本取宿主；返回upgradePreview，普通report为null。输入/目标/身份变化撤销旧比较，过时响应丢弃；[参数与预算](guide.md#升级预检与有限批量)统一维护。

### 2.8 健康检查、人工处置与历史

[健康执行器](guide.md#可选功能健康检查)默认review，授权run才验真/安装制品并启动自有DSH/Chrome；只接受有预算的同源GET/只读DOM，不接作者脚本或账户/模型配置。面板仅导入历史JSON，不认证当前制品。[依赖图](guide.md#依赖关系与潜在影响)仅表示候选与潜在路径。

[人工处置](guide.md#发现的人工处置)绑定源码/目标/判定身份，不隐藏风险或改基线/豁免；保存须当前令牌，锁内重读并原子替换，陈旧草稿可复制/放弃，坏原件保留。[归档/历史](guide.md#人工处置归档与本地历史报告)须显式操作及完整备份；恢复只供参考，身份不相容中性显示，证据减弱不称修复，满额先导出再删除。

### 2.9 插件作者CI

默认矩阵包含`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`、`0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`、`0.2.2-rc.5`，只读同一构建包；默认阻断发现、未知、覆盖不足及vacuous。显式策略不放行工具错误，new须已审查且身份相容的JSON。各格式保留完整证据，超限失败；策略码与内核码分开，0仅表示满足策略。参数、预算及工作流统一见[作者流程](author-ci.md)。

## 3. 开发与文档维护约定

先复现再修，保留正反例，不重建快照求绿；`test/__baseline-versions.json`判据变更单独审查/提交。默认测试用只读profile副本，真实执行只清自有目录/PID组，账户/模型/外部写入分别授权。§6仅列待办，完成能力归入相应文档，历史细节留Git。移除运行文件前确认职责已替代，保留许可证和有效夹具。

## 4. 验收范围

0.2.7 的宿主报告回归覆盖超限文件与正常插件共存、部分结果缓存、基线保护，以及文件缩小后的自动恢复。单个文件的覆盖说明见[指南](guide.md#日常检查与源码交付)。

0.2.6 已发布至 [npm](https://www.npmjs.com/package/dsh-plugin-compat-check/v/0.2.6) 和 [GitHub](https://github.com/lcy0121/dsh-plugin-compat-check/releases/tag/v0.2.6)，标签固定到 `f921287`。开发分支、main 和标签各 12 项 CI 全过。相同归档通过 macOS/Linux 宿主验收，公开下载及固定版本安装已核验。详情见[current-state](current-state.json)。新提交和归档按[交付流程](maintaining.md#同一制品发布核对)另验，Windows、用户现场和一般业务各以对应证据为准。

## 5. 验证入口

运行`npm test`、`npm run check`和`node plugin/scripts/prepublish-check.mjs`；发布前门禁不发布。成功TAP交给update-current-state更新计数。meta-check只读核对实际GitHub/npm，取数失败不算通过；[发布核对顺序](maintaining.md#同一制品发布核对)集中维护。

## 6. 后续工作

仅列未完成事项，优先级不是漏洞评级。已完成的0.2.6适配见[维护指南](maintaining.md#026rc5适配)，本仓库issue #7–#10的修复见[问题回归](maintaining.md#用户issue修订与回归)。CI和平台验收以对应提交及同一归档为准。

1. **P1：继续交互评测与小规模真实用户试用。** 复核定位、字体、展开、主题/窄容器及误读、失败、误报与操作耗时；联系、收集、公开分别授权，不默认遥测。
2. **P2：等待上游修复与发行入口更新。** 2026-11-20[复查](upstream-verification.md#2026-11-20复查)确认 dshmarket 1.73.25 恢复日志已保留错误码；真实重启/自救、新装告警和1024 npm映射仍待复验，awesome收录已核。反馈另取授权。
3. **P2：Windows真实验收（依环境条件暂缓）。** 优先补本仓库issue #7–#10的Windows10 / DSH rc.5同一制品现场验证，记录版本、路径、启动方式及修复前后结果；同时验证安装、回收、权限、打包/诊断和自有资源清理。路径模拟及其它平台不替代实机结果，环境具备前保持未验收。
