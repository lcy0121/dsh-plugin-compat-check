# 文档索引与现行契约

更新：2026-10-15。当前源码0.1.1是本地候选，未推送、未发布；npm0.1.0的公开状态是本次联网快照，不代表将来一直如此。

## 阅读顺序与事实来源

| 文件 | 用途与时效 |
|---|---|
| [中文使用说明](../README.md)、[English](../README.en.md)、[한국어](../README.ko.md) | 当前候选的安装、入口、选项和边界，三语保持同一事实 |
| [current-state.json](current-state.json) | 自动记录的工具版本、默认测试项数、文件数、环境与验证范围；不是完整功能认证 |
| [重构实施记录](refactor-results.md) | 重构提交110361d的实现、341项验收和独立复核；后续测试不回填成当时结果 |
| [文档及公开元数据核验](documentation-review.md) | 本轮纠错、迁移、GitHub/npm快照、当前核验结果与线上差异 |
| [后续开发](roadmap.md) | 按优先级列出尚未验收的工作及完成条件 |
| [Plan](Plan.md) | 历史施工、规程和教训；§8–§9提供当前状态与下一步入口，旧决定不覆盖现行契约 |
| [GPT审计](GPT审计及重构方案文档.md) | 2026-10-14、代码4722716及npm0.1.0的审计快照，正文行号按当时布局解释 |
| [重构实施计划](refactor-implementation.md) | 已执行的重构范围与任务分解，不是剩余待办 |
| [提取缺陷历史](extraction-findings.md) | 旧提取器的反例和历史测量；“已修”须结合审计及新回归理解 |
| [规则说明](../rules/README.md) | 当前判定口径、规则编辑和历史目录依据；catalog不是运行时真值 |
| [skill交付](../skill/README.md)、[SKILL](../skill/SKILL.md) | 当前注册机制及agent操作规范；包内副本由脚本同步 |
| [npm候选README](../plugin/README.md) | 将随下一次发布进入npm的包说明，不是当前线上README |

优先级：代码与可复现实验决定行为；`lib/version.mjs` 是版本真源，`plugin/package.json` 是npm产物清单；本索引与当前README描述产品契约。历史审计、旧测试数字、固定profile的实验不能覆盖当前契约。出现冲突应修正文档或实现，不能仅凭“历史已验证”放行。

## 当前核心契约

- npm插件、仓库CLI与agent skill共用内核。npm不提供CLI bin；仓库根是私有工作区，安装候选使用plugin子目录打出的tgz。
- 相同输入与证据才要求结果一致。默认静态CLI、文件probe、当前进程内采样分模式，基线身份分离；其它profile不能借用当前宿主观测。
- 缺失、未采样、读取失败分开；声明不等于激活，catalog不等于运行时面，激活不等于功能验收。保留certainty、impactBasis、coverage和vacuous。
- API源码发现通常提供file:line；loader和声明发现可能没有源码位置，不能编造行号。certain/suspected是确定性，过滤/守卫/弃权是去处。
- 默认静态检查不执行目标源码，默认写自己的基线。宿主使用分析worker；显式probe启动或安装检查才执行目标插件，临时profile不隔离操作系统权限。
- 描述符采样不调用getter；诊断只写显式私有目录；运行器清理自己拥有的进程、profile和现场，不按全局命令模式清理。
- 真实DSH/Chrome/Windows集成未在本轮重构及文档整理中执行；Linux CI配置不等于远端已通过。

## 文档维护与核验

所有命令从仓库根执行，代码路径相对仓库根；Markdown链接相对各自文档。Plan与原始审计均在docs，不保留根目录副本。

```bash
node plugin/scripts/stage-skill.mjs
npm test
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

`doc-check`离线检查维护文档的相对链接（跳过代码块、外网URL与历史审计的本机附件）、目录迁移、单版本与skill副本，不递归运行测试。传入 `--test-summary <成功TAP日志>` 才核对测试总数。`update-current-state.mjs`负责从成功摘要生成最新统计，不能从文案猜计数。元数据检查联网，error需处理，notice记录预期的发布差异，数据源不可用必须明确标记。
