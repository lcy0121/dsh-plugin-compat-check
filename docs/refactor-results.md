# 0.1.1 重构实施与验证记录

施工日期：2026-10-14 至 2026-10-15。依据 [原始审计](GPT审计及重构方案文档.md)（现位于 `docs/`） 和用户随后授权的“按照你的思路，重构一下吧”。工作在本地 `codex/compat-evidence-refactor` 分支完成；未发布 npm、未推送 GitHub、未改写正式 DSH profile。原始审计报告和历史安全扫描保留，历史发现不会因本轮修复而被追写为“当时没有问题”。

## 实施结果

| 原审计问题 | 本轮处理 | 对应验证 |
|---|---|---|
| B04–B07：正则误归属、作用域/守卫、副作用导入、强调用被吞 | `syntax` / `source-analysis` / `source-graph` 拆分，Babel JS/TS AST、逐调用 span、词法绑定、控制分支、包内源码图；显式方法重新赋值撤销守卫，延迟函数不继承外层守卫 | `extraction-regressions`、不变式、人工判据与快照 |
| B01–B03：缺项当缺失、硬/软依赖覆盖、双端混判 | 独立 observation 模型，present/absent/unobserved/unreadable；依赖按 side/kind 保留；现代采样匹配 profile/DSH/时间；未采样保留覆盖限制 | `verdict-regressions`、过期/错目标/截断测试 |
| B08–B10：宿主报告缺运行时/loader失败、声明形态、profile参数、错误0/0/0 | 当前宿主进程内采样；映射实际 FAILED/PENDING；semver 官方 peer 适配；请求 profile 作为参数，不能重标当前宿主观测；错误明确“无法判定” | `runtime-regressions`、真实模块注册/工具执行 |
| B13–B14：基线比较、缓存并发、展示丢证据 | schema 2；profile 路径/mode/tool/rules/catalog 身份；同键严重度/确定性变动、升级中性；锁内比较与原子替换；源码扫描不完整不推进基线；每目标单次并发计算，失败保留上次成功；CLI/UI/model 保留推断标签与依据 | `baseline` / `state-store` / `report-service` / CLI / 客户端结构测试 |
| B11–B12：全局清理、错误归类、JSON混杂 | shell 保留帮助/skill 安装后委托 Node；UUID profile、私有临时目录、仅关闭自己启动的进程组；安装/网络/启动失败为3，明确 peer 闸门拒绝为2；stdout 单份 JSON | `runner-safety` 假外部命令 + 私有 sentinel |
| S01：共享临时路径写入 | 默认不输出 loader 诊断；探针要求显式私有目录；拒绝符号链接；服务形状只读描述符，访问器形状不完整，异常消息不携带服务值 | `probe-safety` / `secrets` |
| S02：可冒充的 CDP 端点 | Chrome 使用继承 fd 3/4 pipe，独立 target session；有命令/帧/事件上限、仅拥有的进程清理；无 TCP 调试端口 | `debugger` 真实子进程协议测试 |
| S03：目录链接扩展 | canonical 包根边界、目录去重、文件/字节/目录/时间预算；分析 worker 超时及512 MiB旧生代内存上限 | 符号链接分支/越界/预算回归 |
| 文档及发布链 | npm 维持插件分发，仓库 CLI；锁定依赖；内核完整暂存并带 MIT LICENSE；独立 tarball 安装后调用实际宿主工具；发布前只跑一次测试并复用摘要做文档检查；Node CI | `packaging`、`version`、`docs`、发布前检查 |

## 有意变更与历史纠正

- 使用固定版本 `@babel/parser@7.29.9`、`semver@7.7.3`，根目录工作区含 lockfile。AST 方案依据 [Babel 官方 parser 文档](https://babeljs.io/docs/babel-parser)。仓库检出使用前执行 `npm ci --ignore-scripts`；npm 插件包声明同样的运行时依赖，不包含 CLI `bin`。
- npm 三个回归基准的第三方版本未变。本仓库私有探针版本同步为0.1.1，快照锁明确更新；它通过本机 file 链接可被只读扫描看到。合成观测显式补 absent 服务及 intended-present 方法，省略字段不再冒充缺失事实。
- 依据已安装 DSH 0.2.0-rc.2 的 Cordis `inject()` 实现，回调第一参数为 Context，第二参数为 config。旧夹具“第二参数也是 context”和 `sessions=ctx.jobs` 却归为 sessions 的断言已纠正。保留人工判据，未以重建哈希替代行为审查。
- semver 官方 peer 的行为依据已安装 DSH app-boot 源码：官方 `@deepseek-ai/dsh*` peers、预发布版本、workspace 绑定；`engines.dsh` 仅作为建议声明，未知 compatibility 对象不猜。
- 原施工历史中的“副作用 import 已修”“npm 包同时提供 CLI”“打包测试真执行产物”在0.1.0并不成立，本轮分别新增回归、修正文案和实际产物执行测试。旧基线 schema 1 不参与新结果比较，首次建立 schema 2。
- 原计划建议随机 CDP 端口，本轮采用更直接的继承管道。协议来源：[Chromium remote debugging 实现](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/devtools/remote_debugging_server.cc)。

## 验证范围

具体结果由 `current-state.json` 与最终测试摘要记录。默认测试包含源码/判定/基线/缓存/宿主与客户端注册、私有文件及 runner/CDP 受控子进程、独立 tarball 安装执行。正式 profile 只用于只读的静态提取和固定第三方回归输入；测试基线、安装、缓存均隔离到私有临时目录。

本轮未执行真实 DSH 启动、真实 Chrome 界面、Windows 集成。默认套件中的这些慢测试仍需显式启用，不把跳过算为集成成功；Linux CI 仅新增配置，未声称已在远端运行。Node 支持与本地验证版本见自动统计。原 Codex Security 扫描为历史审计的部分覆盖，本轮是修复回归与独立复核，未声称重新获得全量安全认证。

## 剩余边界与运维

- AST 不等于完整程序分析。动态计算属性、跨函数/模块的数据流、运行时工厂/代理对象、任意辅助函数仍可能漏报；语法失败、解析不到的源码、超预算和推断 Context 都应限制覆盖。`ok` + `limited` / `vacuous` 不能转述为“所有功能验证成功”。客户端到货测试只证明请求与执行错误状态，不证明业务交互。
- 第三方 `provide` 声明只能作为提供方线索；缺乏实际激活/服务可见证据时会弃权，不把声明当成功运行证明。旧探针仅使用明确记录的键并提示未绑定，无法补出旧报告从未采集的身份和时间。
- 真实 loader 条目必须能可靠映射包名。无法映射、禁用、LOADING 等状态明确保留限制，不能凭包名猜测成功/失败。状态序列属于当次采样，不承诺后续没有变化。
- 不完整源码扫描保留旧基线；锁竞争保留旧状态并报告错误。进程在持锁期间异常退出可能留下 `.lock`；确认该 profile 没有体检进程后才清理对应锁文件。基线不是事务数据库，不提供长期多主协调。
- 显式 `--probe-boot` / 安装检查 / 客户端开发工具会真实安装和执行目标插件。临时 profile 隔离配置与清理责任，不隔离恶意插件的操作系统权限。`--keep` 的现场可能含本机信息，勿直接提交；取返回的私有路径，不依赖固定 `/tmp`。
- 此次旧脚本回归测试的初始隔离曾漏掉全局清理命令和固定临时路径，已补假 `pkill/pgrep` 与私有脚本路径后重新验证；未将初次运行当成安全流程的证明。

发布仍需单独授权。可以在本地运行 `node plugin/scripts/prepublish-check.mjs` 做测试/文档闸门，但本轮不会运行 `npm publish`。


## 独立复核与修正

独立 reviewer 只读复核了完整变更，确认六类 Important 问题：外部 probe 的 loader 状态绕过身份校验；provide 遮住完整运行时方法证据；普通 ctx 参数/var 误归属；未调用函数改写外层别名；runner 漏传 manifests；probe 错误 envelope 被当成功。均先以新反例重现，再修复并跑回归。补充了 delete/接收者替换撤销能力守卫；明确保留普通/自由 ctx 与 this.ctx 的推断身份。独立检查没有确认 Critical 漏洞；复核不替代真实启动集成。

旧测试命令 `node --test test/` 在 Node 22.19.0 上不可用。统一改为 `npm test`（`tools/run-tests.mjs` 明确枚举 `.test.mjs`），发布前检查使用同一入口。文档摘要生成器为 `node tools/update-current-state.mjs --test-summary <通过的 TAP 文件>`；自动检查在相同可选 profile 输入下核对总数，在 CI 无本机 profile 时检查实际摘要成功状态，避免把历史现场数量当跨环境常量。


独立复核修正后重新验证：原始针对性测试42/42、额外变体6/6通过，六项原始阻塞均已消除。最后补充范围再次独立复核，针对性测试46/46通过，未发现新增阻塞项。Node22.19.0、24.21.0本地默认完整套件分别341/341通过；真实慢测试未启用。Node22运行时从官方 nodejs.org 下载到临时目录，并核对官方 SHASUMS256。默认测试计数包含本机可用的只读第三方夹具；CI 输入不同，计数可以不同。


最终本地发布前检查（Node26.11.1）通过：同一套默认测试341项全部通过，复用该摘要的文档闸门通过；没有执行发布。源码格式检查、Node/Bash语法检查、`git diff --check`通过。保留 npm 仅插件交付与本地分支的决定；不自动合并主分支。所有原始审计、施工历史、独立复核发现及本轮限制都有文档记录。

最后补充：scoped node_modules 清单读取失败必须中止体检，不能吞掉 EACCES 后返回“空清单成功”；新增回归先失败后通过。`--probe-boot` 使用自己采集到的 DSH 版本（显式参数仍优先）做声明判断与版本基线，避免有观测却把版本记为 null。

最终边界修正还包括：描述符采样不执行 getter，单个未知访问器不遮住其他已确认缺失的方法；继承方法与基本类型装箱参与方法形状判断，null 服务不冒充明确缺失。只有实际入口导出的 apply 首参及已证明的 inject 回调首参具有确定 Context 身份，普通工具模块 apply 保留推断；inject/provide 导出按精确名称识别，别名导出保留角色，injectScope 不冒充硬依赖。可选调用不能掩盖已采样的非函数属性，显式 typeof 能力守卫仍有效。官方 peer 范围冲突单列为 declared-incompatible，并明确影响为推断、严重度为 degraded；未采集宿主的精确版本豁免时不能写成运行失败或 fatal。

提交检查保留原始审计文档的四处 Markdown 双空格换行标记；其余暂存变更通过 `git diff --cached --check -- . ':!docs/GPT审计及重构方案文档.md'`。原审计正文未改写。

2026-10-15文档整理：Plan与原始审计迁入docs；当前使用方法、公开版本核验和后续工作以 [文档索引](README.md)、[文档核验记录](documentation-review.md) 为准。上面的341项是重构提交110361d的验收记录；本次整理后结果单独记录，不回写历史测试结果。
