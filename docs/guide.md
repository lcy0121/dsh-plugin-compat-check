# 使用与验证指南

本指南随当前仓库源码维护；0.1.7-dev尚未发布，版本真源仍为0.1.6，新增源码修复不代表npm 0.1.6已有交付。面板能力可安装npm插件使用，CLI、健康执行器与作者CI从仓库运行；本地构建见[源码打包说明](../plugin/README.md#从源码构建安装)。各入口均须保留自身输入身份与证据边界，不能把声明放行、激活或无发现改称业务验收通过。

rc.3在左下角账号菜单进入“设置 → 内置插件 → 兼容性”；三处“更多”分别属于全局面板、会话视图和右侧工具。“浏览更多插件”打开主插件列表；“创建你的插件”只向Cordis空白会话追加草稿，不发送。入口折叠不能用来判断激活失败。`startSession`可复用同工作区未归档空白会话，指定preset跳过其它preset的空白；`whenDraftExists`（默认keep，另有replace/append）优先于`clearPreviousDraft`，已有草稿需明确策略。

## 可选功能健康检查

面板的“功能健康检查”只离线读取用户显式选择的JSON，校验声明摘要并展示历史实测及清理结果；它不运行检查、不安装插件、不联系服务或上传文件。版本相符只说明版本匹配，当前安装制品尚未核验；SHA-256不是作者签名，也不能证明检查声明本身可靠。导入不改变静态发现、基线、人工处置或兼容性豁免。

执行器仅随仓库提供，默认审阅声明，不执行目标代码、安装、启动DSH或联网：

```bash
node tools/functional-health.mjs --manifest <检查清单.json> --artifact <本地插件.tgz>
```

清单使用真实制品名称、精确版本、tgz字节SHA-256及本机DSH精确版本。下例中的身份和路径须按实际插件填写；示例控件不是已验收目标：

```json
{
  "schemaVersion": 1,
  "artifact": {
    "name": "example-plugin",
    "version": "1.0.0",
    "sha256": "<本地tgz字节的64位SHA-256>"
  },
  "dshVersion": "0.2.1-rc.2",
  "checks": [
    { "id": "page", "type": "http", "path": "/", "status": 200 },
    { "id": "control", "type": "dom", "path": "/", "selector": "#example-control", "minCount": 1, "maxCount": 1 }
  ]
}
```

HTTP仅支持同一自有loopback origin的GET及可选JSON pointer/标量断言，拒绝重定向；DOM仅声明路径、选择器与数量范围，不接受作者脚本。1–32项检查，清单64KiB、HTTP响应64KiB、每项请求/导航3秒、整轮180秒；预算不承诺硬实时或RSS。制品限本地普通`.tgz`（压缩32MiB、解压64MiB），只支持普通USTAR文件/目录；校验SHA-256及包名/精确版本，拒绝PAX/GNU扩展、链接、特殊文件、不安全/重复路径与拼接归档。不是任意npm tgz兼容器；不支持的归档须重新审查、生成兼容制品并更新摘要，不可跳过校验。

只有用户明确授权安装、启动和测量所选制品后，才运行：

```bash
node tools/functional-health.mjs --manifest <检查清单.json> --artifact <本地插件.tgz> --run --out <尚不存在的结果.json>
```

需要本机精确版本DSH，DOM检查还需要Chrome（可用`--chrome <可执行文件>`）。执行器创建自有DSH_HOME/profile、缓存及按需Chrome数据目录，安装所选已校验字节，启动自有宿主；安装可能联网，插件代码会执行。私有profile不是OS沙箱，不提供用户账户/模型配置，也不能约束插件自身的一切系统或网络行为。只清理自有进程与目录；取消、超时、启动或清理失败保留错误，未确认停止时保留资源位置，不能把失败写成通过。

`tested-pass`仅表示所选检查通过，`tested-failed`表示完成测量但期望未满足，`error`表示无法完成或清理失败；CLI分别退出0、1、3。将结果JSON在兼容性页显式导入，保留声明、制品/DSH身份、时间与清理限制。正常/503、缺控件/恢复的限定病例不证明其它功能或未来版本正常。

## 依赖关系与潜在影响

普通报告的`dependencyGraph`与面板“依赖关系与潜在影响”展示消费者、服务、候选提供者及来源位置，分别保留host/client/未知端、必需inject、可选/软读取和子作用域依赖；client包级inject单列。Context名称只是线索，不补造成子作用域证明。

提供声明只是候选：多个候选并列，禁用/未知loader条目明确显示，未找到候选不等于宿主服务缺失；loader状态也不等于服务状态。同端声明路径可展示潜在间接影响及环，未知端不跨端推导，连线或环不证明挂起、实际提供者或实测故障。视图不改变内核finding、严重度或基线，不自动安装提供者。

节点1000、关系4000、输入条目及传播/路径遍历各20000的预算约束来自`lib/dependency-graph.mjs`；达到预算显示有限/截断及原因，受影响列表不再代表全量。即使覆盖本次提取输入，也不意味着运行时依赖完整。结合原发现、合格服务观测和实际业务复现核实影响。

## 发现的人工处置

在兼容性页逐条选择待确认（`pending`）、已复核（`reviewed`）、误报（`false-positive`）或已修复（`fixed`），填写依据并点击“保存人工处置”。这是显式记录动作，不自动把状态改为已复核；失败原因可见，坏可选数据只使本区域不可用。依据按纯文本处理，分享前检查敏感信息，不自动发送或发帖。

记录仅放在HTTP/tool envelope的`reviews`及自身命名空间：

```text
$DSH_HOME/dsh-plugin-compat-check/reviews.<canonical-node_modules路径SHA256>.json
```

未设置DSH_HOME时使用`~/.dsh`。记录绑定canonical目标、原观察路径和模式、报告发布时的源码/分析输入身份、插件与DSH精确版本、工具/规则/目录身份及finding类别/API/span/证据。即使版本和finding文本不变，源码身份变化也需要重新核实。变化后的旧记录留作历史，当前项显示待重审（`needs-review`）；新风险不继承旧误报/修复状态。

保存只接受当前contextToken、findingId、status和note，不接受HTTP指定文件路径。文件1MiB、记录1000条、单项依据4000字符；身份/当前发现不明、陈旧或跨目标请求、卸载中的任务、控制字符、超限及坏数据均不能保存。锁内重读合并、临时文件同步后原子替换；损坏、非普通文件、symlink或超限文件报错并保留，不用刷新覆盖。已处理记录不能隐藏finding或新风险、改变总结论/退出码/基线，也不构成`compatibility.json`豁免。

基线与人工处置进程崩溃后的锁，按[本地恢复流程](#本地状态锁恢复)处理；刷新不自动清锁。基线坏JSON/坏结构、旧或未知schema、链接、非普通文件、超限或不可读均保留原件，不比较或自动覆盖，也不显示为首次体检；需人工核实或恢复可信备份。确认需要重建时，先将原件移至独立备份路径，再运行完整检查；这不构成风险改善。人工处置损坏也须保留并核实，不能靠清空文件伪装成首次待确认。

## 本地状态锁恢复

基线与人工处置使用`<原JSON文件>.lock`，记录工具类型/确切锁路径、PID、用户/主机、进程起始估计及实例随机标识、创建时间和每锁随机标识。起始估计不是OS进程出生时间证明；不按年龄或PID复用推断孤立状态。正常释放只移除自己持有的同一inode/内容，恢复与写入相互排斥。

锁目录须为当前用户所有的私有0700目录。工具仅按0700创建新目录，不自动修改已有父目录权限；自定义`--baseline-file`指向共享目录时会拒绝写入并保留权限。应为状态建立独立私有目录，不以修改现有共享目录权限作为默认修复。恢复也要求同样的安全目录条件。

恢复CLI仅随仓库提供；仅安装npm插件的用户需要对应版本的源码检出，在仓库运行以下命令。它可处理默认文件及显式指定的自定义基线路径。先检查一个确切路径；仅当记录的工具类型/锁路径相符、同主机、同用户、完整元数据且系统返回持有PID不存在（`ESRCH`）时，输出孤锁状态和确认token：

```sh
node bin/recover-lock.mjs /绝对路径/baseline.example.json.lock
node bin/recover-lock.mjs /绝对路径/baseline.example.json.lock --confirm <刚检查得到的token>
```

人工处置的`reviews.<64位目标hash>.json.lock`使用同一命令。第二步重新检查存活状态、inode与内容，token陈旧、活动或复用PID、权限错误、异主机/用户、旧空锁、损坏/非普通/链接锁均拒绝。恢复只删除该孤锁，不推进基线、不修改人工记录/判定、不清理任何JSON、临时文件或其它任务资源；需要后续正常检查/保存才产生新状态。

恢复期间使用`.lock.recovery-lock`互斥保护；若恢复进程被杀死而遗留保护锁，工具保守拒绝并要求人工诊断。不要递归强清、按通配符删目录或仅凭时间/PID复用清锁。无法证明安全的旧锁/保护锁应保留，停用相关写入者并人工核实持有者及文件身份后再处理；Windows真实恢复尚未验收。

## 功能回归

```bash
node --test test/functional-health.test.mjs test/dependency-graph.test.mjs test/finding-review.test.mjs test/p2-workflows-host.test.mjs test/p2-workflows-panel.test.mjs
```

定向回归使用受控输入；真实Chrome病例仅在`DSC_SLOW=1`的显式浏览器套件启动自有空浏览器；该模式缺少浏览器会失败，不静默略过。真实DSH/制品执行仍按上述显式授权入口进行，不以测试fixture代替真实业务证据。当前计数、真实集成与平台范围以[current-state.json](current-state.json)为准；历史记录不认证新源码或新制品。[Plan](Plan.md)维护合同、复现索引及后续工作。

## 安装与probe执行环境

只有显式请求安装检查或`--probe-boot`才安装/启动目标。它们与健康执行器的DSH子进程仅继承`PATH / SystemRoot / COMSPEC / PATHEXT / LANG / LC_ALL / TMPDIR / TEMP / TMP`；使用自有0700 HOME、USERPROFILE、XDG配置/缓存、DSH_HOME、DSH_AGENTS_HOME、npm缓存与pnpm store，以及独立空白0600 npm用户/全局配置文件。设置`npm_config_ignore_scripts=true`限制包管理器lifecycle脚本；DSH及插件启动代码仍会执行。

不继承父环境API key、Node预加载/模块路径、动态库注入、代理、证书及npm配置，也不自动转发私有registry凭据；需要这些条件的安装可能明确失败。只保留本次生成的probe路径、目标身份及实测DSH版本。probe按原逻辑复制所选profile配置并重定位本地依赖，配置可能含秘密；profile内npm配置、插件文件访问或网络行为不由环境白名单隔离。PATH仍选择可信可执行文件；这不是OS沙箱，也不能阻止插件读取用户可访问的其它文件。通用命令工具接受调用方显式环境，不属于这个默认隔离承诺。

## 本地HTTP边界

面板和本地HTTP工具请求报告、升级预检、人工处置时均携带`X-DSH-Compat-Request: 1`。缺少/错误标记、非本地Host/对端、不同Origin/Referer（协议、主机和有效端口均须一致）或跨来源Fetch Metadata均返回403；仅接受同源fetch的mode/destination，拒绝图片、导航等子资源入口。报告/预检只支持GET，人工保存只支持JSON POST；OPTIONS预检不会执行检查。标记是防浏览器简单请求的入口约束，不是密码；受信本机无Origin工具调用也须显式携带。

2026-10-24在自有两端口与空Chrome复现：跨端口图片GET没有Origin，旧入口会计算并创建基线；修复后403且无基线，同源fetch仍成功。只读核对本机DSH 0.2.1-rc.2 ASAR：`dsh-host-webserver`按配置具体IP监听，exact路由直接调用handler；`dsh-client-connection`的cookie/连接认证属于其自身入口，不能假设自动覆盖本插件路由。本地原生进程可自行携带请求头；保留宿主监听/访问控制，不承诺跨用户鉴权、反向代理部署或其它DSH版本已验收。该复现不是任意公网可利用性证明。

## 日常检查与源码交付

普通CLI的分析阶段由worker监督，默认10秒、512MiB老生代及64MiB新生代；退出前回收worker，再由父线程比较/提交基线。超时、取消或计算错误不写基线，不完整提取不推进；`--no-baseline`仍禁读写。`runAsync`提供同样监督，同步库`run`须由调用方监督；显式probe安装/启动及其前后分析分开计时，不是整个探测流程只有10秒。

清单单文件64KiB、整体清单50000目录项/32MiB/5秒；每包源码2000文件、10000目录及目录项、单文件2MiB/总32MiB/5秒，patch共用文件/字节预算，另限每文件64KiB、全包64文件/10000 YAML节点/32层，别名展开预算0；表达式和未建立的挂载语义保留覆盖限制。目录逐项枚举并检查预算，文件用非阻塞描述符检查普通类型、大小及读取前后身份；拒绝清单叶子链接，包根pnpm链接仍可解析，patch/源码链接须留在包内。超限、不可读或变化保留诊断；清单枚举无法完成则报工具错误。直接compatReport也使用相同的规则/probe文件检查；probe失败说明在改用独立进程内采样时仍保留。规则、目录、probe及已有基线JSON最多8MiB，拒绝非普通文件和叶子链接；损坏基线保留中性说明。预算只可降低，不承诺硬实时、RSS、文件系统原子快照或OS沙箱。

普通报告缓存最多保留16个目标；10分钟未请求或容量已满时淘汰最近未访问目标，停止其巡检并取消在途/排队计算，释放输入、报告及人工处置绑定。重访会重新计算；保留中的目标刷新失败仍显示旧报告及错误。缓存身份扫描限50000条目/10000目录、50000元数据项、普通文件读取合计32MiB/5秒，不执行目标代码。

同一进程中共享该内核实例的普通报告分析/身份任务最多同时运行2个worker，最多32项等待；满载返回工具错误，排队可取消且按任务时限独立超时，获准后再计算原执行预算。升级捕获/分析/清理保留独立的原有监督及预检在途合并，不借普通报告队列做清理准入；该限制不约束其它流程、进程或任意目标代码的线程，不承诺硬实时/RSS。作者快照和升级捕获在目录收集/排序前检查条目与时间，验证及冻结也不先收集无界列表。

仓库CLI快速开始见[README](../README.md)，完整参数运行`node bin/compat-check.mjs --help`；维护统一入口及可执行语法边界见[维护指南](maintaining.md#维护入口与语法覆盖)；npm插件的完整tgz构建见[plugin README](../plugin/README.md#从源码构建安装)。安装依赖时使用冻结lock且禁用lifecycle脚本：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --test-reporter=tap > /tmp/dsc-tests.tap
npm run check
node tools/update-current-state.mjs --test-summary /tmp/dsc-tests.tap
node tools/doc-check.mjs --test-summary /tmp/dsc-tests.tap
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

只有测试成功的TAP才用于更新统计；不要用重建快照消除失败。`prepublish-check`只检查，不发布。skill和契约副本分别用`node plugin/scripts/stage-skill.mjs`、`node plugin/scripts/stage-contract.mjs`同步，依赖变化后同步第三方说明。默认suite不启动真实DSH或模型，独立安装测试需要registry。源码推送、npm发布和外部发帖分别按当次授权执行。

## 升级预检与有限批量

```sh
node bin/compat-check.mjs --nm <profile或node_modules> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json
```

预检仅比较同组制品的两个精确支持版本，退出0/1/2只描述新增/变重风险，已有问题可能仍在；3表示无法预检。回归见`test/upgrade-{preview,cli,host,panel,capture-worker}.test.mjs`。固定合成批量清单预期exit2；`--hash <本地包目录>`计算指纹。批量无网络、执行目标、probe或基线，退出3表示至少一项工具错误。完整身份、预算与覆盖边界见[Plan](Plan.md#2-现行判定与集成契约)，作者门禁与标准报告见[作者CI](author-ci.md)。

## 面板与报告核实

发现的“下一步核实”由结构化类别/状态生成，不猜测替代API或修复版本。搜索、组合筛选和折叠不改变原报告或完整导出；无可比基线时中性提示。后台报告按输入身份变化重算，失败保留旧成功报告及错误；卸载后的旧任务不得发布或推进基线。回归见`test/cache-invalidation.test.mjs`及host/client结构测试。

复制故障报告前预览敏感信息；它保留包内位置与证据边界，不含原始源码、日志、probe或baseline，但任意文本不保证完全脱敏。导出不自动发帖。

## 工程与真实集成

```sh
node tools/engineering-check.mjs
DSC_SLOW=1 node --test test/engineering-live.test.mjs test/profile-lock.test.mjs test/owned-process.test.mjs test/debugger.test.mjs
DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
```

真实集成需要DSH/pnpm、Chrome（可设`DSC_CHROME`）及网络，会执行所选私有宿主/插件；先确认当次执行授权。仅清理自有目录/PID组，不能按进程名清场。私有profile不是OS沙箱。Darwin受控负例缺编译器时跳过，跳过不算验收。显式boot诊断可设`DSC_EXECUTION_DIAGNOSTICS=<私有目录>`，不导出argv/env或stderr正文，诊断分享前仍须预览。预算不承诺硬实时、RSS或任意脱离进程组隔离。

真实业务队列及模型测试的独立授权边界见[回归维护](maintaining.md#真实插件回归)；已验证版本与平台见[current-state](current-state.json)。
