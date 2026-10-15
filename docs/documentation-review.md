# 文档及公开元数据核验记录

核验日期：2026-10-15（Asia/Shanghai）。基准：本地重构提交110361d、0.1.1候选。范围包括三语README、plugin/README、docs全部文档、skill真源及包内副本、rules说明、核验脚本、GitHub简介/标签/主页、npm元数据和README。具体原始公开快照见 [public-metadata.json](public-metadata.json)。

## 纠正的矛盾

| 问题 | 当前处理 |
|---|---|
| Plan和审计留在根目录，路径分散 | 迁到docs/Plan.md与docs/GPT审计及重构方案文档.md；调整文档、检查脚本、代码注释及基准注释引用；新增文档索引 |
| 新的重构说明与旧README正文相互矛盾 | 重写三语当前用法，保留历史测量在历史文档中；不把88.3%召回、66/66到货当0.1.1结果 |
| 根GitHub安装规格被当作plugin安装方式 | 明确根目录是private工作区；已发布版走npm，候选从plugin打tgz；不能假定裸file复制会跑prepack |
| 插件客户端能力表前后冲突 | 当前报告只列客户端待验证项；独立开发工具测到货/浏览器错误，未接入面板，不证明业务功能 |
| “三档确定性”混入过滤去处，probe有就一定确定 | certain/suspected与去处分别解释；身份、时效、完整性、源码归属均影响证据，声明不单独证明方法缺失 |
| 同一内核必须所有入口结果/基线一样 | 改为相同输入/证据才同结果；静态、文件、进程内观测分模式 |
| npm README旧基线文件名与“唯一副作用” | 写明schema2路径哈希/模式、worker和显式诊断，区分默认体检与启动安装流程 |
| skill固定/tmp、probe优先级及static.json说法过时 | 使用返回的私有现场；显式probe文件优先；static.json需按需另运行提取器 |
| skill注册尚未落地、files未定、打包未测 | 替换过时待施工代码为实际provider、包内skill副本、prepack和已运行测试；历史机制实测不冒充当前真实启动 |
| rules说明仍说未来换解析器、严重度只由JSON决定 | 当前核心规则与代码默认档一起解释；旧catalog/inventory及提取产物记为历史证据，待复核条目继续保留 |
| Plan下一步“工程已清空”、发版固定263项 | 指向roadmap和成功摘要；删除过期发版数字及未经核验的认证绕过指引 |
| metadata检查把正常未发布版本报error | 本地semver领先npm为notice；远端领先本地/非法版本仍error，回归先红后绿；描述与依赖差异单独提示 |

历史审计正文针对旧代码的结论不改写，仅添加迁移与版本说明；本机安全附件路径仅作历史追溯，其他环境不保证存在。

## 对外状态

- [GitHub仓库](https://github.com/lcy0121/dsh-plugin-compat-check)：简介明确针对installed插件，安装前能力明确归给CLI。主页指向npm，许可证MIT；标签含dsh、deepseek-harness、compatibility、dsh-plugin等，符合当前定位，无需为整理文档而改动。公开默认分支main仍是4722716旧源码，本地新说明尚未推送；这与GitHub About元数据通过是两回事。
- [npm包](https://www.npmjs.com/package/dsh-plugin-compat-check)：latest=0.1.0；本地plugin/package.json=0.1.1。仓库地址、主页、许可证和Node要求一致；本地新增parser/semver依赖、description/keywords及README更新随下一版发布生效。0.1.0不含此次修复，不能用本地测试替它背书。
- [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)：确认收录；条目重点描述安装检查脚本（临时profile启动和API对比），并非npm插件的完整说明。未修改第三方清单或向维护者发消息。

本轮没有推送代码、修改已发布npm包或发布0.1.1。线上README中的旧确定性/基线表述仍属于0.1.0，未因本地纠错而自动改变。版本和README漂移按“未发布候选”记录，而非为了让检查器全绿提前发布；远端状态是带时间的快照，下次发布需重新核验。

## 本轮验证

- Node26.11.1/macOS arm64默认完整套件343/343通过；Node22.19.0完整套件同样343/343通过。25个测试文件，默认慢集成未启用。
- 文档、元数据与skill针对性测试55/55通过；新增的断链接反例与未发布版本误报反例均先见红再修复。
- 发布前检查（Node26.11.1）通过，实际独立tarball安装后的宿主工具执行包含在套件中；没有发布。
- 离线doc-check覆盖16份维护文档，全部相对文件链接有效，迁移位置、单版本、skill副本及成功TAP总数检查通过。历史审计的本机附件明确不在跨机器链接保证范围内。
- 联网meta-check取到GitHub与npm及npm README，0项error、5项notice：版本、description、运行时依赖、keywords、README均为已记录的候选差异，没有跳过的数据源。
- 格式、Node/Bash语法与重构变更的git空白检查通过；原审计正文的Markdown双空格换行保留。文件统计为210项，其中90项夹具、120项其它，见current-state.json。

真实DSH/Chrome/Windows以及远端Linux CI仍未运行，本轮没有用默认套件的通过代替这些验收。Node24的341项是先前重构验收记录，本轮没有把它写成343项；current-state将两轮验证分别保存。
