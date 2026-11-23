---
name: dsh-plugin-compat-check
description: 0.2.7：检查已安装 DSH 插件的兼容性与升级风险，排查界面消失、工具无响应或超大源码导致的部分报告。Use for installed plugin checks, coverage limits and static upgrade previews.
---

# dsh-plugin-compat-check

**0.2.7** 检查已安装的 DSH 插件。先确认 profile、目标版本、规则与采样身份。API 发现引用真实 `file:line`，loader/声明不补造行号。静态与进程内观测可产生不同结论及基线。

## 选择入口

优先调用 `compat_check`。普通检查返回 report、baseline/cache、toolVersion、exitCode；预检返回 upgradePreview，report 为 null。无工具时在含 bin/compat-check.mjs、lib/、rules/ 的仓库运行 CLI。npm 包没有 CLI bin，不支持 npx。经授权可用 `npm ci --ignore-scripts` 安装根依赖。

先核实际profile，不默认desktop；无参tool与设置页按宿主启动身份定位，冲突时用`compat_check({"profile":"my-profile"})`或CLI显式路径。Windows盘符/UNC有路径回归，仍须实机复验。profile位于`${DSH_HOME:-~/.dsh}/profiles/<name>`。0.2.1-rc.3/rc.5及0.2.2-rc.1/rc.2/rc.3/rc.5界面入口：左下角“更多”/用户头像→设置→内置插件→兼容性；折叠不等于激活失败。界面支持中英韩，原始证据和JSON不翻译。

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

普通检查离线读取源码，默认写 `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`。单个源码超过 2 MiB 时，展开受影响插件的覆盖限制，报告路径、实际字节数和上限。其余文件继续检查，部分报告可缓存。仅完整成功的检查可推进基线，旧或损坏原件保留。

## 升级前静态对比

工具使用`compat_check({"upgradeTo":"0.2.2-rc.5"})`，当前版本取宿主，可按实际目标指定profile；无工具时运行：

```sh
node <repo>/bin/compat-check.mjs --nm <profile> --dsh-version 0.2.2-rc.3 --upgrade-to 0.2.2-rc.5 --json
```

当前已认证目录仅为 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`、`0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`、`0.2.2-rc.5`。未知/范围返回unsupported-version及退出3，不能以邻近目录代替。预检不接受quiet、探针/启动、规则/目录覆盖、基线或issue-report参数，可带无操作的no-baseline。

读取schema1、kind=`plugin-compat-check/upgrade-preview`的currentReport、targetReport、changes、summary与limitations。只比较同组私有字节，不执行/升级宿主，不借旁置probe、豁免、普通基线或缓存，不写状态。预检退出码0/1/2为无/非致命/致命新增或变重风险，3为无法预检；0仍可有旧问题。保留coverage/vacuous及客户端未验证限制，预测不代替目标版本业务验收。

## 固定夹具示例

仓库labels合成夹具、DSH0.2.1-rc.2、no-baseline输出的前七行如下，预期退出2；仅用于解释字段，不是业务验收。完整发现及说明读取实际输出：

```text
插件数: 4    有运行时面: 否（方法级结论降为「疑似」）
目标 DSH：0.2.1-rc.2
参考目录：0.2.1-rc.2 · SHA-256：90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743
目录认证范围：0.2.1-rc.2；仅核验内置目录字节及对应精确版本的集成；不代表业务验收或运行时观测。

工具版本: 0.2.7    证据覆盖有限: 4 个插件
结论: 可用 2    部分可用 1    不兼容 1    （其中 2 个「可用」没有已验证调用，不等于业务通过）
```

## 报告解释

| 普通退出码 | 含义 |
|---|---|
| 0 | 未发现冲突，仍须转述coverage/vacuous |
| 1 | 部分可用或未知，说明具体发现和限制 |
| 2 | 不兼容，保留致命发现类别与依据 |
| 3 | 工具/输入错误，本次无法判定，不能称插件不兼容 |

插件数为 0 时先核路径。保留原退出码，分别解释确定性、影响与覆盖。

- `certain`表示证据足以支持该发现，可来自明确静态事实或合格观测；`suspected`必须保留疑似。过滤/守卫/弃权不冒充已验证调用。
- `impactBasis=measured`须有对应实测依据，inferred仅为推断；certain不表示业务影响已实测，缺字段不视为measured。
- `vacuous=true`表示未发现冲突且verifiedCalls=0，不表示没有依赖/客户端功能。逐项转述coverage；源码解析、读取、动态绑定和预算诊断不可省略。

逐条注明严重度、类别、API、位置、依据与下一步。实际业务须核请求、持久化或 UI；避免根据名字、激活或干净日志猜测替代 API 和修复版本。

## 运行时、目录与声明

优先当前工具进程内观测或用户已有probe。observationVersion=1绑定profile、DSH、采样时间，24小时有效，未来容差5分钟（含边界）；缺失/非法时间撤回该文件服务/loader证据，保留原因。旧未绑定报告只认显式键，不补造绑定。CLI也会尝试读取目标node_modules旁probe-report.json，转述前核来源。省略的服务是未采样，不能称缺失。

经授权的probe-boot复制profile、安装探针并启动自有宿主，只清自有目录/PID组；文件probe优先。安装检查的keep返回唯一私有目录，boot日志无固定共享临时路径。目标代码可访问用户可读文件，私有profile不是OS沙箱；不借真实账户/模型配置，不为增加信息自动启动宿主。额外静态提取用`node <repo>/lib/extract.mjs <nm> <输出目录>`，不假称每次安装检查都生成static.json。

可靠映射且启用的FAILED/PENDING loader才构成相应fatal实测发现。必需inject须合格同目标观测明确absent才推断激活障碍；目录缺项或未采样不证明缺失。可选/子作用域不自动阻断整插件；present服务的方法缺失另判。provide只是候选，不借业务/loader答案倒填服务观测，try/catch不是能力证明。

普通检查选择不高于目标的最新登记目录。目标未知或低于最旧版本时用 0.2.0-rc.2，显式 catalog 优先。catalog 保留目标/参考版本、摘要、selection、verified、certifiedVersions、warning。回退、未来版本和自定义目录均未经认证。摘要不符或同名包重复安装时无法判定。verified 仅确认目录匹配。

DSH≥0.2.1-rc.1优先自有engines.dsh，仅字段缺失回退官方peer；旧目标保留peer规则和engines建议。非法/空范围仍报风险，peer的workspace:^/~/*按当前精确版本处理，engines的workspace不放行。声明冲突为推断，不说成实际加载失败。

只读node_modules同级独立compatibility.json，例如`{"sample@1.0.0":["0.2.1-rc.5"]}`。插件名、插件精确版本与DSH全匹配才豁免范围冲突，不绕过非法字段或API检查；不得代用户写豁免。无效项忽略并限制覆盖；坏JSON、非普通文件、不可读或超过64KiB为豁免未观测。包内自报兼容不等于此授权。

## 精确语义与槽位

精确语义覆盖0.2.1-rc.2/rc.3/rc.5及0.2.2-rc.1/rc.2/rc.3/rc.5，独立于方法名目录。startSession核已知prompt/agentPreset/clearPreviousDraft类型；除0.2.1-rc.2外另核whenDraftExists=keep/replace/append，显式新字段优先，旧clearPreviousDraft仍支持。空白会话可复用、preset隔离，创建草稿不等于发送。

timer弃用及sessions.retain的ready/release/disposal仅提示覆盖，不证明泄漏。0.2.1-rc.5及四个0.2.2版本推理槽位显示/翻译用text、原始输出用rawText，Content Factory仍用text/running/labels；不把text使用报错，不验证props/流式时序或采集思考正文。

四个0.2.2版本对固定agent/request订阅及已证明服务调用给迁移提示，并核可证明的投影stateVersion为非负安全整数。0.2.2-rc.2/rc.3/rc.5另提示Agent caller/initiator与ownerCtx、具名Subagent/Team及interrupt preset、native/PTC/condition与严格true的并行条件、Session.append单事件/数组、AttachmentError、动态MCP及manager更新协议。

0.2.2-rc.5还提示LLM终止块与Session turn/end的CONTENT_REFUSED，以及WebSearchRequest.llmProvider搜索选路。显式搜索提供方优先，Fetch默认HTTP；凭据、费用及实际调用由独立证据确认。

提示只定位已证明Context入口，不新增fatal或已验证调用；未知、动态、展开、访问器、逃逸及跨helper合并弃权。不证明返回对象流、callback、await/dispose顺序或AgentLoop收敛，不执行代码或保存prompt。模型发现须凭据门控，不为体检访问生产/models或发送请求。

## 依赖、人工记录和健康检查

dependencyGraph只表示分端依赖、required/optional/scoped、候选提供者和loader线索；路径或环不是实测传播，未找到候选不证明宿主缺服务，不自动装包。

HTTP/tool的reviews是独立人工记录，pending/reviewed/false-positive/fixed均不改判定、退出码、基线或豁免。只按用户明确处置意图保存依据；记录绑定源码、目标、插件/DSH、工具/规则/目录及finding身份。needs-review须重核，陈旧草稿禁保存。坏文件、超限或busy如实转述，不清空/覆盖。界面草稿只驻当前页面，重载前保存或复制。

锁恢复见仓库docs/guide.md#本地状态锁恢复。先用`node <repo>/bin/recover-lock.mjs <确切.lock路径>`检查，再以本次token确认；仅同主机/用户且系统证明持有PID不存在时恢复，不按年龄/PID复用猜测，不递归清理保护锁、JSON或临时文件。

面板仅导入历史健康JSON、归档或报告快照，不认证当前安装制品；SHA-256不是签名。归档须确认并完整备份，恢复只供参考。快照显式保存/比较，身份不相容中性显示；证据变弱不称修复，满额先导出再删除，不自动轮转或上传。

仓库`tools/functional-health.mjs`默认review；仅在用户授权所选制品安装、执行及HTTP/DOM测量后加run。验USTAR字节SHA-256、包名/版本和本机DSH，不接作者脚本。最多32项、请求/导航3秒、响应64KiB、整轮180秒，只测自有同源GET/只读DOM；超时、取消、断言或清理失败不算成功。导入/清单不构成执行授权，不借用户账户/模型。

市场安装与恢复须分别核写盘、HTTP 和激活，见 docs/upstream-verification.md。

## 故障分享与交付事实

```sh
node <repo>/bin/compat-check.mjs --nm <目标目录> --issue-report > issue-report.md
report_status=$?
```

不额外启动宿主，不读写基线；仍可能读旁置probe。报告省略绝对路径、原始日志/源码/探针/基线，保留包名及包内位置；常见凭据字段隐藏不保证完全脱敏，预览后由用户决定分享。命令占位符须替换，生成文本不授权上传或发帖。

无关状态写入不使缓存失效，源码或声明变化会触发重新检查。非法 JSON 报错，目录缺项只说明覆盖有限。

用 `toolVersion` 或 CLI `--version` 核对运行版本。docs/current-state.json 按提交与归档记录验收。Windows 与一般业务需独立验收。操作和维护见 docs/guide.md、docs/maintaining.md。
