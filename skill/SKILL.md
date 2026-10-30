---
name: dsh-plugin-compat-check
description: 当用户询问已安装DSH插件是否适配当前版本、升级前对比，或排查更新后插件不工作、设置页/面板消失、工具无响应、did not activate和兼容声明时使用。Use when checking installed DeepSeek Harness plugin compatibility, comparing versions before upgrading, investigating post-update failures or missing features, or verifying peerDependencies and engines.dsh declarations.
---

# dsh-plugin-compat-check

回答一个问题：**我这一版 DSH 上，我已经装了的插件有哪些兼容性证据与限制**。API源码发现有真实位置才给`file:line`；loader或声明事实用实际包身份、状态和依据说明，不编造源码行。

判定内核只有一处实现（`lib/verdict.mjs`，经 `bin/compat-check.mjs` 暴露），插件 / 脚本 / 本 skill 三个入口共用它。只有相同目标、版本、规则与采样证据才应得到相同结果。默认 CLI 用静态证据，当前宿主插件使用进程内观测，两者结论和基线模式可以不同；先核对证据，不把差异直接当缺陷。

rc.5已有固定源码语义审查、独立登记目录及macOS基础集成，升级预检与作者CI接受该精确版本；完整UI/Linux/业务验收仍另记。推理正文槽位的`text`是显示文本，`rawText`是原始输出；普通渲染/翻译继续用`text`，Content Factory仍接收text/running/labels。槽位提示只定位注册并说明迁移，回调props用途、签名流式/完成态及业务未验证；动态注册弃权，不将使用text认定为错误，不采集真实思考正文。

## 先看能不能直接调工具

如果**当前会话已经注册了 `compat_check` 工具**（插件半边提供的对话入口，跑的是同一个内核），优先用它；没有就按下面的命令跑 CLI。两者结论同源，不要为了"多一点信息"去绕别的路。

## 升级前对比

用户要比较当前与目标版本时，已注册工具优先调用 `compat_check({"upgradeTo":"0.2.1-rc.3"})`，需要时指定实际 `profile`；当前版本由运行宿主解析，读取返回的 `upgradePreview`，普通 `report`、baseline/cache为null。没有工具时使用仓库 CLI 的独立预检模式，先明确 profile、当前精确版本和目标精确版本，再运行：

```bash
node <repo>/bin/compat-check.mjs --nm <profile或node_modules目录> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
```

此模式的 `--dsh-version` 是**当前精确版本**，`--upgrade-to` 是目标精确版本；当前已认证目录仅为 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`。未知版本或版本范围返回 `status=unsupported-version`、退出3并标明未认证，不能用邻近目录替代。普通文本输出省略 `--json`；此模式不接受 `--quiet`、探针/启动参数、规则/目录覆盖、基线参数或故障报告，可带无操作的 `--no-baseline`。

JSON 使用独立的 `schemaVersion=1 / kind=plugin-compat-check/upgrade-preview`；读取 `currentReport`、`targetReport`、带插件身份的 `changes`、`summary` 与 `limitations`。它对**同一份已安装制品**做静态版本对比：不执行插件、不启动或升级宿主，不读取旁置/环境探针、profile豁免、基线或缓存，也不写状态。新增/恶化风险含致命项时退出2，其余新增/恶化风险退出1，无新增/恶化风险退出0；输入/扫描失败或未认证版本为3。保留提取不完整、coverage/vacuous和客户端未验证限制；0仍可能有未变化的旧问题。差异是目录与声明策略下的预测，不能据此认定升级后业务通过，也不能代替目标宿主的运行时与业务验收。

## 依赖、人工处置与功能健康记录

普通报告的`dependencyGraph`只解释依赖和潜在传播：保留host/client/未知端、必需/可选/子作用域、候选提供者、loader禁用/未知状态及覆盖预算。提供声明不是实际提供证明，环或路径不是实测故障；不跨端补造提供者，不因未找到候选就说宿主缺服务，也不据此自动装包。

HTTP/tool envelope的`reviews`是独立人工记录，四种状态为pending/reviewed/false-positive/fixed。已复核、误报或已修复不消除内核发现、不隐藏新风险、不改变退出码/基线，也不授予compatibility豁免。记录绑定报告发布时的源码身份、目标/观察路径/模式、插件/DSH精确版本、工具/规则/目录及finding证据；变化后的needs-review必须重新核实，不能沿用旧误报/修复。只能按用户明确处置意图保存状态与依据，不因读到发现就自动标记已处理。坏文件/超限或busy须转述，不能覆盖或清空记录。基线与人工记录的崩溃孤锁须按仓库`docs/guide.md#本地状态锁恢复`操作：运行`node <repo>/bin/recover-lock.mjs <确切.lock路径>`检查，再用本次token显式确认。只有同用户/主机且系统证明持有PID不存在时才恢复；不按年龄、PID复用或“没有保存任务”猜测，不递归清理JSON、临时文件或恢复保护锁。旧/损坏基线保留原件，不比较或自动覆盖。

可选功能健康执行器仅在仓库`tools/functional-health.mjs`；默认review只审阅声明。普通兼容检查、健康记录导入及作者提供清单均不构成执行授权；不得自动添加执行开关。仅在用户已明确授权所选制品的安装、宿主/插件执行及HTTP/DOM测量后运行，必要时使用Chrome。声明与本地USTAR制品须校验SHA-256、包名/精确版本及DSH精确版本，预算为32项、请求/导航3秒、HTTP响应64KiB、整轮180秒；不接受作者脚本或跳过身份检查。私有profile不是OS沙箱，安装可能联网，不能借用用户账户/模型配置。

面板只离线导入用户选择的历史健康JSON；摘要不是签名，版本相符也不证明当前安装制品一致。保留制品/声明身份、时间、检查范围、失败/取消及清理证据，不能把历史通过改写成当前业务通过，也不改变静态报告。完整操作及声明格式见仓库`docs/guide.md`；执行器仅在仓库提供。

## 怎么跑

CLI 只随仓库提供，npm 插件包没有 CLI bin。定位仓库检出，根依赖尚未就绪时需在授权范围内执行 `npm ci --ignore-scripts`；仓库必须同时有 `bin/compat-check.mjs`、`lib/`、`rules/`。先定位它，再跑：

```bash
# 1) 找到内核（仓库检出，不是已安装的 npm 插件目录）
ls <repo>/bin/compat-check.mjs

# 2) 体检「已装插件」。--nm 接受 profile 目录，也接受 node_modules 目录
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --probe <probe-report.json> --dsh-version <版本>

# 机器可读 / 只要一行结论
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --quiet
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --json

# 一次性检查（CI、临时排查）：别在用户的 DSH_HOME 里留下基线文件
node <repo>/bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
```

完整的参数表以 `node bin/compat-check.mjs --help` 为准（**跑一遍再引用**，别凭记忆写旗标）。
`--help` 与 `--version` 都不需要 `--nm`，也不碰任何状态：

| 旗标 | 作用 |
|---|---|
| `--nm <dir>` | 必需。要体检的 `node_modules` 目录，或一个 profile 目录（会自动补 `node_modules`） |
| `--probe <json>` | 宿主运行时观测；身份、时间、完整性和调用点归属满足要求时，才可支持 certain 方法结论 |
| `--probe-boot` | **自己起一次宿主拿运行时面**（不必先有报告）。默认不开，会安装并执行目标插件；只在用户授权启动检查时使用，不保证每条结论都是 certain |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | `--probe-boot` 的等待上限（默认 40）/ 留一份探针报告到该目录（排查用） |
| `--dsh-version <v>` | 目标DSH版本，用于声明/peer范围判断；显式值优先 |
| `--json` / `--quiet` | 机器可读 / 只输出结论行 |
| `--issue-report` | 默认脱敏Markdown；不读写基线，与json/quiet互斥；输出后由用户预览分享 |
| `--no-baseline` | 不读写本机基线。**一次性检查用这个**，见下面的「副作用」 |
| `--rules` / `--catalog` | 覆盖规则表与官方 API 目录（默认在 `rules/`） |
| `--version` | 工具版本。**报结论时要带上它** —— 同一个插件在不同版本的规则表/提取器下结论会变，不带版本无法追溯 |

`--nm` 指哪里：`$DSH_HOME/profiles/<name>`（默认 `~/.dsh/profiles/<name>`）。用户说「我的插件」时，先弄清楚是哪个 profile，别默认 `desktop`。

运行时证据来源：

1. 优先复用当前 `compat_check` 的进程内观测，或用户已有的 `--probe <json>` 文件；现代文件需匹配 profile/DSH版本，默认超过24小时失效，未来容差5分钟（含边界），旧文件明确标为未绑定。
2. 用户授权真实启动检查时，可显式使用 `--probe-boot`。它复制 profile、安装探针、启动自己的宿主并清理自己的现场；与 `--probe` 同时给时，文件优先。
3. 没有探针则按目录提供疑似线索；省略的服务是未采样，不能推断为不存在。CLI 也会尝试读取目标 node_modules 旁的 probe-report.json，转述前检查输出中的采样来源。

安装检查脚本 `--keep` 会返回本次唯一私有目录；CLI `--probe-keep-dir` 需显式给私有目录。报告与 boot.log 不再使用固定共享临时路径。`static.json` 来自 `node lib/extract.mjs <nm> <输出目录>`，不是每次安装检查都会自动产生的文件。

分享故障（仓库源码功能，npm无CLI）：

```bash
node <repo>/bin/compat-check.mjs --nm <目标目录> --issue-report > issue-report.md
report_status=$?
```

保留退出码0/1/2/3，后续命令不可覆盖原结论。报告省略绝对路径、原始日志/探针、源码片段与基线；含路径、链接、常见凭据或控制字符的说明整项隐藏。仍保留插件名和包内相对位置，任意业务文本不保证无敏感信息，须预览；缺位置如实说明，保留coverage/vacuous和certainty/impactBasis。复现命令须替换占位符。默认仍可能读取旁置探针，不能保证纯静态证据。只生成报告不授权上传/发帖；不为生成文本额外启动宿主。

## 输出怎么读

下面是当前仓库源码对固定合成夹具的可复现输出，运行命令为 `node bin/compat-check.mjs --nm test/fixtures/labels --dsh-version 0.2.1-rc.2 --no-baseline`，预期退出2。它用于解释报告字段，不代表真实插件业务验收；工具版本为0.2.0，实际发布与验收状态见仓库docs/current-state.json。

```text
插件数: 4    有运行时面: 否（方法级结论降为「疑似」）
目标 DSH：0.2.1-rc.2
参考目录：0.2.1-rc.2 · SHA-256：90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743
目录认证范围：0.2.1-rc.2；仅核验内置目录字节及对应精确版本的集成；不代表业务验收或运行时观测。

工具版本: 0.2.0    证据覆盖有限: 4 个插件
结论: 可用 2    部分可用 1    不兼容 1    （其中 2 个「可用」没有已验证调用，不等于业务通过）

不兼容  @label/broken-client@1.0.0
     证据覆盖: 有限；已验证调用 0
       覆盖限制: source-unresolved: ./lib/does-not-exist.js
     致命 / 客户端入口不可交付 [确定]  (声明)  @ -
       影响（推断，非实测）: 声明的客户端入口不可交付，宿主可能拒绝加载客户端
       依据: 客户端入口 ./lib/does-not-exist.js 不存在或不可读
       下一步: 检查该插件 package.json 的 dsh.client 与 exports["./client"] 客户端入口声明，并在实际安装制品中核对入口文件是否存在、可读且已随包交付。
       下一步: 把已装插件的精确版本与制品文件清单对照；如需作者处理，提供缺失入口的包内相对位置，不猜测修复版本。
       下一步: 补充同一目标的浏览器加载结果，并实际操作客户端功能、核验实际功能结果；静态入口发现不等于业务失败已实测。
部分可用  @label/broken-service@1.0.0
     证据覆盖: 有限；已验证调用 0
       覆盖限制: noSuchServiceAnywhere 未采样
     降级 / 依赖服务待确认 [疑似]  noSuchServiceAnywhere  @ index.js:12
       影响（推断，非实测）: 插件必需inject的激活前提尚未确认；需同profile服务观测，不能推断已缺失或已挂起
       依据: 未采样不等于不存在；仅列出待核实依赖
       下一步: 该依赖仍待确认：补充同一 profile、DSH 版本与有效采样时间的服务观测；省略键或未采样不能确认服务缺失，也不能确认插件挂起。
       下一步: 在报告给出的源码位置检查顶层必需 inject 与激活前提，再对照实际 loader 状态；依赖声明本身不能证明已经挂起。
       下一步: 核对服务提供者的包声明与实际运行状态；提供声明只是线索，不自动安装依赖或认定某包能提供该服务。
可用  @label/healthy@1.0.0   [无已验证调用]
     证据覆盖: 有限；已验证调用 0
可用  @label/real-service@1.0.0   [无已验证调用]
     证据覆盖: 有限；已验证调用 0
       覆盖限制: settings 未采样
     无证据可判（只出现名字，没有调用点）: settings

依赖关系: 服务依赖 2；潜在声明环 0
  @label/broken-service → noSuchServiceAnywhere [host/必需]；候选提供者：未定位（不等于宿主缺失）
  @label/real-service → settings [host/必需]；候选提供者：未定位（不等于宿主缺失）
  提供声明仅为候选；同端路径及环只表示潜在影响，不证明实际挂起或失败；client 包 inject 不当作 host 服务。
  关系覆盖限制: 静态提取覆盖不完整或未声明，关系可能缺失
  关系覆盖限制: 部分插件未提供可映射 loader 条目，状态为未知
  关系覆盖限制: 部分源码存在提取诊断，关系可能缺失

说明: 确定（certain）表示当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；疑似（suspected）表示当前证据不足以确定该条发现。
      impactBasis=measured/inferred 分别表示影响有对应实测依据/影响由证据推断；确定发现不等于影响已实测。官方目录不是运行时面，未观测不等于缺失。
      没有已验证调用仍可能存在服务依赖或客户端功能；调用核验、无发现和覆盖完整均不等于业务验收通过。
      下一步是核实建议；本工具不会自动安装、升级或修改配置与源码。
```

- 每插件总结论为可用/部分可用/不兼容/未知。API发现须引用真实`file:line`；loader/声明事实可能无源码行，不补造位置。保留严重度、类别、API、影响、依据及下一步。
- `certain`表示证据足以支持该发现，可来自静态事实或合格观测；`suspected`必须保留疑似限定。`impactBasis`独立：只有`measured`且有对应观测才称实测；`certain + inferred`仍未实测业务影响。缺字段或未写“推断”不等于实测，坏报告应报工具错误。
- `vacuous=true`表示本轮未发现冲突且verifiedCalls=0，不表示没有依赖或客户端功能。逐项转述coverage限制；调用核验、完整覆盖及无发现均不认证业务。
- 客户端源码/入口可静态检查，业务须实际操作并核验UI、请求或持久化结果，元素出现不等于成功。过滤、守卫与弃权也是结论；只出现名字而无调用点是“无证据可判”，不是清白。
- 下一步优先转述原报告及真实位置，不猜替代API/修复版本/命令，也不当已执行修复。未知依赖先补同profile/DSH/时间的观测；明确absent仍须区分顶层必需与可选/子作用域。入口核安装制品，声明核package.json/目标，FAILED读失败原因，PENDING核提供者；不自动安装或改源码/配置。
- 转述时带`toolVersion`（CLI `--version`），以及目标、目录、采样身份；不同规则/证据下的结论不能直接互认。

## 普通体检退出码

| 码 | 含义 |
|---|---|
| `0` | 可用（未发现问题，仍需检查 coverage / vacuous） |
| `1` | 部分可用或未知；保留具体发现与证据限制 |
| `2` | 不兼容（存在致命发现，保留具体类别与影响依据） |
| `3` | **无法判定**——工具/输入出了问题，**这不是插件的结论** |

`3` 必须与插件结论严格分开：`--nm` 指了不存在的目录、探针报告不是合法 JSON、渲染层抛异常，都退 `3`。看到 `3` 就说「这次没查成」，**绝不能说成"不兼容"或"部分可用"**（用的 flag 也对不上，这类混码见过）。

CI 里可以直接用：`0` 过，`1`/`2` 按你的策略处理，`3` 是**工具故障**，应该让流水线报错而不是静默放行。

## 判据：这个工具的三条硬规矩

1. **确定性、影响与去处分开。** certainty只有certain/suspected；过滤/守卫/弃权另记，impactBasis另解释。静态入口缺失可为certain+inferred，明确loader状态可为certain+measured；目录不是运行时面，不将所有静态事实降为疑似，也不借某项观测认证全部调用。
2. **兼顾误报与漏报。** 不确定时保守推断/弃权，不冒充确定；先看运行时面、插件数及退出码，区分查过和没查成。插件数0且退出0也不能称全部正常，应先核目标路径。沉默不是通过证明。
3. **激活不等于业务可用。** 仅目录缺项时必需inject仍待确认；同目标有效观测明确absent才推断激活障碍。optional/子作用域不自动阻断整插件，方法缺失另判。不得用loader/业务答案倒填服务观测；try/catch、能力守卫、日志干净或版本声明均不证明实际业务成功/失败。

## 边界（不要越界承诺）

- **默认报告不验证客户端功能；可选开发工具能验证条目到货与浏览器错误。** 插件在浏览器里跑的部分（面板、标签页、设置卡片）需要人工在界面上确认；普通兼容性报告保留客户端待验证限制，可选业务执行器的结论须按其实际范围另行解释。
- **方法级判定使用 AST，但动态绑定与跨函数数据流仍有限**，可能有误报。拿不准时建议用户用脚本 `--keep` 保留探针与启动日志，并按需另运行源码提取输出 static.json。
- **默认静态检查的写入要主动说清**：默认会把这次结论写成本机基线
  （`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`），好让下次对比出「相比上次变了什么」。
  一次性检查（CI、替别人看一眼）加 `--no-baseline`；`--dry-run` 是只算差分不写。除此之外它不装包、
  不改用户的 profile、不联网（显式 `--probe-boot` 和安装检查会安装并执行目标插件）。不要用它去"顺便修一下"。
- 报结论时**给出可核对的依据**。API源码发现引用真实`file:line`；没有源码位置的loader/声明事实说明包身份及观测或声明来源，不补造行号。


`root` 缺项是未采样，不能称为不存在；`coverage.status=limited` 与 `vacuous` 必须转述。现代探针绑定 profile/DSH/采样时间；旧报告明确标为未绑定。解析、读取、资源上限等诊断会限制覆盖，完整性不足不更新基线。当前统计及精确制品验收见仓库 `docs/current-state.json`。

声明按目标DSH分流：从0.2.1-rc.1起优先自有`engines.dsh`，仅缺失该字段时回退官方peer；更旧目标保留旧peer规则与engines建议。非法字段、空/非法范围会报告风险；peer的workspace:^/~/*按当前DSH精确版本处理，engines的workspace不获放行。声明冲突为declared-incompatible及推断影响，不能写成实际加载失败；宿主也可能跳过不兼容bundle后继续启动。判断实际行为先核对安装包版本，公开制品身份以registry及docs/current-state.json的带日期回执为准。

DSH 0.2.1-rc.3的UI入口为“左下角账号菜单 → 设置 → 内置插件 → 兼容性”。HMR撤销自有注册、计时器及诊断handle，卸载后不得发布新成功或写基线；worker按预算回收，不承诺立即停止。历史现场证据与当前源码分别核验，见仓库docs/current-state.json。

只读目标node_modules同级的独立`compatibility.json`，形如`{"sample@1.0.0":["0.2.1-rc.2"]}`。只有插件名、插件精确版本与DSH精确版本全匹配才豁免范围冲突；不使用包内兼容声明代替授权。无效记录整条忽略（其它有效记录仍用）并限制覆盖；缺文件为空豁免，可读性/JSON错误、非普通文件或超过64KiB则豁免未观测。不得代用户写豁免，豁免不绕过非法字段，也不证明API或业务成功。

普通体检中，CLI的`--dsh-version`及probe-boot采集值、宿主自己的DSH版本用于目录选择：DSH≥0.2.1-rc.5使用独立rc.5目录，≥0.2.1-rc.3使用独立rc.3目录，≥0.2.1-rc.2使用rc.2目录，其余/未知使用旧0.2.0-rc.2目录，显式`--catalog`优先。未知版本不猜声明，未来DSH未经认证。单独文件probe不自动补目标版本，需给`--dsh-version`。目录不等于运行时面。当前契约/验收/后续见仓库docs/Plan.md，统计见docs/current-state.json；公开安装以npm registry为准。

普通报告另有 `catalog`：目标版本、参考目录版本、SHA-256、selection、verified、certifiedVersions及warning。转述时同时给出目标与目录身份；fallback/override、未知身份和未认证提示不得省略，verified仅表示内置目录与已验收精确版本匹配，不是业务认证。内置目录摘要不符、同名插件重复安装（含alias及不同版本）会明确无法判定，不允许转述为无冲突；普通报告失败不推进基线。YAML解析器是npm插件运行依赖；依赖图以plugin/package.json为准，不能把根工作区开发依赖等同于运行依赖。新目录治理流程见仓库 `docs/maintaining.md#api目录候选审查`。

对observationVersion=1探针始终校验采样时间：未来偏差最多5分钟（含边界），缺失/非法或超限时撤回该文件的服务及loader证据，不推断FAILED/PENDING或确定方法缺失；普通体检另保留24小时有效期及profile/DSH绑定。转述observation.notes中的原因，保留静态发现和待验证项，不修正原采样时间、不把时钟异常当插件不兼容；修复时钟/重采样后再显式刷新。旧未绑定报告仍只使用显式键，不能补造绑定。仓库CI依赖安全工具不属于npm运行时功能。

rc.3三处“更多”按全局面板/会话视图/右侧工具区分；浏览进入主插件列表，创建仅追加Cordis草稿，不发送。`startSession`复用空白会话；指定preset隔离，`whenDraftExists`默认keep并优先于旧clearPreviousDraft。入口折叠不等于未激活；名称目录没有变化也不证明行为相同。rc.3模型列表发现使用凭据门控，首次可等待/失败回退；不要为体检访问生产/models或发送模型请求。
