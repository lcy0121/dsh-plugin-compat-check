---
name: dsh-plugin-compat-check
description: 0.2.4版，用于检查已安装DSH插件的兼容性、升级前静态对比，以及排查更新后不工作、界面消失、工具无响应、did not activate或engines.dsh/peerDependencies声明问题。Use when checking installed DeepSeek Harness plugins, comparing exact host versions before upgrading, or investigating activation and missing-feature failures. Covers exact rc.22 catalogues and semantics, Cordis/tool scope migration, strict JSON tools and profile diagnosis; findings do not certify business functionality.
---

# dsh-plugin-compat-check

本版**0.2.4**对**已安装DSH插件**给出兼容证据与限制。API发现引用真实`file:line`，loader/声明事实不补造行号。各入口共用内核，静态与进程内观测可有不同结论/基线；先核目标、版本、规则和采样身份。

## 选择入口

当前会话有`compat_check`时优先调用，返回普通`report`、baseline/cache、toolVersion和exitCode；升级模式返回`upgradePreview`，普通report为null。无工具时定位含`bin/compat-check.mjs`、`lib/`、`rules/`的仓库，npm插件包没有CLI bin，不支持npx。根依赖缺失时在授权范围内运行`npm ci --ignore-scripts`。

先核实际profile，不默认desktop；无参tool与设置页按宿主启动身份定位，冲突时用`compat_check({"profile":"my-profile"})`或CLI显式路径。Windows盘符/UNC有路径回归，仍须实机复验。profile位于`${DSH_HOME:-~/.dsh}/profiles/<name>`。rc.3/rc.5界面入口：左下角“更多”/用户头像→设置→内置插件→兼容性；折叠不等于激活失败。界面支持中英韩，原始证据和JSON不翻译。

```sh
node <repo>/bin/compat-check.mjs --help
node <repo>/bin/compat-check.mjs --version
node <repo>/bin/compat-check.mjs --nm <profile或node_modules> --no-baseline --json
```

引用旗标前实跑help。`--help`/`--version`不需要nm且不碰状态。

| 旗标 | 用途 |
|---|---|
| `--nm <dir>` | 必需的profile或node_modules路径 |
| `--dsh-version <v>` | 显式目标版本；独立probe文件不会自动补此值 |
| `--probe <json>` | 读取同目标运行时观测 |
| `--probe-boot` | 经授权安装探针并启动/执行目标的临时宿主，默认关闭 |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | boot等待上限（默认40）/保留探针的私有目录 |
| `--json` / `--quiet` | 完整JSON / 总结行 |
| `--no-baseline` / `--dry-run` | 禁止基线读写 / 比较但不写 |
| `--baseline-file <path>` | 自定义基线路径 |
| `--issue-report` | 生成Markdown，不读写基线，与json/quiet互斥 |
| `--rules <json>` / `--catalog <json>` | 覆盖规则 / 参考目录，不授予认证 |

普通检查不执行目标或联网，但默认写自身基线：`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`。一次性检查用no-baseline，dry-run仍读取并比较。失败/不完整不推进，旧或损坏原件不覆盖。

## 升级前静态对比

工具使用`compat_check({"upgradeTo":"0.2.1-rc.5"})`，当前版本取宿主，可按实际目标指定profile；无工具时运行：

```sh
node <repo>/bin/compat-check.mjs --nm <profile> --dsh-version 0.2.1-rc.3 --upgrade-to 0.2.1-rc.5 --json
```

当前已认证目录仅为 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`、`0.2.2-rc.1`。未知/范围返回unsupported-version及退出3，不能以邻近目录代替。预检不接受quiet、探针/启动、规则/目录覆盖、基线或issue-report参数，可带无操作的no-baseline。

读取schema1、kind=`plugin-compat-check/upgrade-preview`的currentReport、targetReport、changes、summary与limitations。只比较同组私有字节，不执行/升级宿主，不借旁置probe、豁免、普通基线或缓存，不写状态。预检退出码0/1/2为无/非致命/致命新增或变重风险，3为无法预检；0仍可有旧问题。保留coverage/vacuous及客户端未验证限制，预测不代替目标版本业务验收。

## 固定夹具示例

仓库labels合成夹具、DSH0.2.1-rc.2、no-baseline输出的前七行如下，预期退出2；仅用于解释字段，不是业务验收。完整发现及说明读取实际输出：

```text
插件数: 4    有运行时面: 否（方法级结论降为「疑似」）
目标 DSH：0.2.1-rc.2
参考目录：0.2.1-rc.2 · SHA-256：90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743
目录认证范围：0.2.1-rc.2；仅核验内置目录字节及对应精确版本的集成；不代表业务验收或运行时观测。

工具版本: 0.2.4    证据覆盖有限: 4 个插件
结论: 可用 2    部分可用 1    不兼容 1    （其中 2 个「可用」没有已验证调用，不等于业务通过）
```

## 报告解释

| 普通退出码 | 含义 |
|---|---|
| 0 | 未发现冲突，仍须转述coverage/vacuous |
| 1 | 部分可用或未知，说明具体发现和限制 |
| 2 | 不兼容，保留致命发现类别与依据 |
| 3 | 工具/输入错误，本次无法判定，不能称插件不兼容 |

插件数0也不等于全部正常，先核路径；保留原退出码，后续命令不可覆盖。报告有确定性、影响和覆盖三个独立维度：

- `certain`表示证据足以支持该发现，可来自明确静态事实或合格观测；`suspected`必须保留疑似。过滤/守卫/弃权不冒充已验证调用。
- `impactBasis=measured`须有对应实测依据，inferred仅为推断；certain不表示业务影响已实测，缺字段不视为measured。
- `vacuous=true`表示未发现冲突且verifiedCalls=0，不表示没有依赖/客户端功能。逐项转述coverage；源码解析、读取、动态绑定和预算诊断不可省略。

发现保留严重度、类别、API、真实位置、依据与下一步，不猜替代API或修复版本。名字无调用点不算证据；业务须实际操作并核请求/持久化/UI，元素出现、激活或日志干净不算通过。

## 运行时、目录与声明

优先当前工具进程内观测或用户已有probe。observationVersion=1绑定profile、DSH、采样时间，24小时有效，未来容差5分钟（含边界）；缺失/非法时间撤回该文件服务/loader证据，保留原因。旧未绑定报告只认显式键，不补造绑定。CLI也会尝试读取目标node_modules旁probe-report.json，转述前核来源。省略的服务是未采样，不能称缺失。

经授权的probe-boot复制profile、安装探针并启动自有宿主，只清自有目录/PID组；文件probe优先。安装检查的keep返回唯一私有目录，boot日志无固定共享临时路径。目标代码可访问用户可读文件，私有profile不是OS沙箱；不借真实账户/模型配置，不为增加信息自动启动宿主。额外静态提取用`node <repo>/lib/extract.mjs <nm> <输出目录>`，不假称每次安装检查都生成static.json。

可靠映射且启用的FAILED/PENDING loader才构成相应fatal实测发现。必需inject须合格同目标观测明确absent才推断激活障碍；目录缺项或未采样不证明缺失。可选/子作用域不自动阻断整插件；present服务的方法缺失另判。provide只是候选，不借业务/loader答案倒填服务观测，try/catch不是能力证明。

普通检查按目标选择参考目录：≥0.2.2-rc.1取该版；否则≥rc.5取rc.5，≥rc.3取rc.3，≥rc.2取rc.2，其余/未知取0.2.0-rc.2（均指0.2.1的对应rc）；显式catalog优先。报告catalog保留目标/参考版本、摘要、selection、verified、certifiedVersions及warning。未来/回退/覆盖目录未经认证；摘要不符或同名包重复安装明确无法判定。verified只证明登记目录匹配，不是业务认证。

DSH≥0.2.1-rc.1优先自有engines.dsh，仅字段缺失回退官方peer；旧目标保留peer规则和engines建议。非法/空范围仍报风险，peer的workspace:^/~/*按当前精确版本处理，engines的workspace不放行。声明冲突为推断，不说成实际加载失败。

只读node_modules同级独立compatibility.json，例如`{"sample@1.0.0":["0.2.1-rc.5"]}`。插件名、插件精确版本与DSH全匹配才豁免范围冲突，不绕过非法字段或API检查；不得代用户写豁免。无效项忽略并限制覆盖；坏JSON、非普通文件、不可读或超过64KiB为豁免未观测。包内自报兼容不等于此授权。

## rc.5语义与槽位

精确语义独立于方法名目录：startSession仅核已知prompt/agentPreset/clearPreviousDraft类型及rc.3/rc.5的whenDraftExists=keep/replace/append。新字段优先，旧clearPreviousDraft仍支持；空白会话可复用，preset隔离，创建草稿不等于发送。三处“更多”浏览进主列表、创建只追加草稿。

timer.setTimeout/setInterval弃用及sessions.retain的ready/release/disposal提醒仅说明覆盖，不证明泄漏。动态、展开、访问器、逃逸和跨helper合并弃权，不执行代码或保存prompt。

rc.5推理槽位显示/翻译用text，原始输出用rawText；Content Factory仍用text/running/labels。仅定位slots.register及迁移限制，不验证props、流式/完成态或业务，不把text使用报错，不采集思考正文。模型发现须凭据门控，不为体检访问生产/models或发送模型请求。

## 依赖、人工记录和健康检查

dependencyGraph只表示分端依赖、required/optional/scoped、候选提供者和loader线索；路径或环不是实测传播，未找到候选不证明宿主缺服务，不自动装包。

HTTP/tool的reviews是独立人工记录，pending/reviewed/false-positive/fixed均不改判定、退出码、基线或豁免。只按用户明确处置意图保存依据；记录绑定源码、目标、插件/DSH、工具/规则/目录及finding身份。needs-review须重核，陈旧草稿禁保存。坏文件、超限或busy如实转述，不清空/覆盖。界面草稿只驻当前页面，重载前保存或复制。

锁恢复见仓库docs/guide.md#本地状态锁恢复。先用`node <repo>/bin/recover-lock.mjs <确切.lock路径>`检查，再以本次token确认；仅同主机/用户且系统证明持有PID不存在时恢复，不按年龄/PID复用猜测，不递归清理保护锁、JSON或临时文件。

面板仅导入历史健康JSON、归档或报告快照，不认证当前安装制品；SHA-256不是签名。归档须确认并完整备份，恢复只供参考。快照显式保存/比较，身份不相容中性显示；证据变弱不称修复，满额先导出再删除，不自动轮转或上传。

仓库`tools/functional-health.mjs`默认review；仅在用户授权所选制品安装、执行及HTTP/DOM测量后加run。验USTAR字节SHA-256、包名/版本和本机DSH，不接作者脚本。最多32项、请求/导航3秒、响应64KiB、整轮180秒，只测自有同源GET/只读DOM；超时、取消、断言或清理失败不算成功。导入/清单不构成执行授权，不借用户账户/模型。

市场安装/恢复故障另见docs/upstream-verification.md；本工具结论不能证明市场操作完成，须分别核写盘、HTTP及激活。

## 故障分享与交付事实

```sh
node <repo>/bin/compat-check.mjs --nm <目标目录> --issue-report > issue-report.md
report_status=$?
```

不额外启动宿主，不读写基线；仍可能读旁置probe。报告省略绝对路径、原始日志/源码/探针/基线，保留包名及包内位置；常见凭据字段隐藏不保证完全脱敏，预览后由用户决定分享。命令占位符须替换，生成文本不授权上传或发帖。

0.2.4修复缓存抖动、JSON回包、profile定位和rc.5目录漏项。无关运行状态写入不使报告失效，源码/声明变化仍会；非法JSON证据明确报错，不静默丢弃。目录未收录只表示覆盖不足，不能据此称方法缺失。

实际运行版本取toolVersion/CLI version；分发以registry/GitHub Releases为准，docs/current-state.json按提交/归档/平台记录验收，不认证重打包、Windows或一般业务。docs/Plan.md列待办，操作/预算和目录治理见docs/guide.md、docs/maintaining.md。YAML是运行依赖，根dev依赖不随npm提供功能。
