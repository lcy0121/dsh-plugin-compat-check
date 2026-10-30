# 使用与验证指南

本指南对应**0.2.0**。面板、tool和skill随npm插件交付；CLI、健康执行器与作者CI从仓库运行，源码构建见[打包说明](../plugin/README.md#从源码构建安装)。声明放行、激活或无发现不等于业务验收。实际发布及限定证据见[current-state](current-state.json)。

已认证精确目录为`0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`。最低宿主声明不认证未来版本。rc.3入口：左下角账号菜单→设置→内置插件→兼容性；选择实际profile，不默认desktop。折叠/空标题不代表激活失败。

## 参数与生命周期语义

0.2.1-rc.2/rc.3/rc.5的客户端语义参考在`rules/severity.json.apiSemantics`，记录固定tag、源码归档及所审查文件的SHA-256；独立于方法名目录。旧版、未来/未知版或坏语义记录显示“语义未审查”，不借邻近版本认证。

- `uiWorkspace.startSession`检查`prompt / agentPreset / clearPreviousDraft`已知原始类型及rc.3/rc.5的`whenDraftExists=keep / replace / append`；rc.2未使用该新选项。类型/枚举不符是非致命静态风险，影响仍为推断。方法存在或可选调用守卫不验证参数；弱Context只给疑似结论，本项不单独触发声明不符。
- rc.3/rc.5显式`whenDraftExists`优先，省略时通常保留已有草稿，`clearPreviousDraft:true`选择replace。后者仍受支持，不是弃用接口。`startSession`可复用同工作区未归档空白会话，指定preset跳过其它preset的空白；选项不证明新建或发送成功。
- 三版`ctx.timer.setTimeout / setInterval`有官方弃用标记但仍保留，提示审阅`ctx.timeout / interval`契约后迁移。`sessions.retain`提示引用所有权、按需等待ready及作用域结束时release/disposal；不证明释放路径已验证或发生泄漏。两类提醒只进入覆盖说明，不单独改变等级。

rc.5的`conversation.chat.reasoning.body`提供原始输出`rawText`及显示文本`text`；普通渲染、翻译和未翻译视图继续读`text`，确需原始输出才读`rawText`。Content Factory仍只需`text/running/labels`，不重复剥离签名。静态分析仅定位`slots.register`目标并提示迁移；回调props用途、渲染/翻译与流式时序均未验证。动态、展开、访问器、逃逸及多实参合并弃权；不复制自定义槽位名/思考正文，不新增发现或提高已验证调用数。rc.5目录仍未认证，普通检查回退rc.3，预检仍拒绝rc.5；已审查语义不改变这个边界。

只收集四个字段的类型/有限枚举标签，不执行代码、不保存prompt或任意枚举文本。常量别名与直接可知改写可分析；未知调用/闭包副作用撤回旧事实。动态、展开、访问器、逃逸及不同helper实参合并保留未核实。未覆盖完整签名、参数数量、深层对象、异步时序、宿主同名接口或所有权证明，不增加已验证调用数。JSON、CLI、面板、预检及作者CI共用判定。

## 可选功能健康检查

面板只离线导入用户选定的历史JSON，验证声明摘要并显示实测/清理结果；不安装、执行、联网或上传。版本匹配不证明当前制品相同，SHA-256不是作者签名；导入不改变静态发现、基线、人工记录或豁免。

仓库执行器默认review：

```sh
node tools/functional-health.mjs --manifest <清单.json> --artifact <本地插件.tgz>
```

最小清单示例，身份、版本和控件必须替换为实际目标：

```json
{
  "schemaVersion": 1,
  "artifact": { "name": "example-plugin", "version": "1.0.0", "sha256": "<tgz字节的64位SHA-256>" },
  "dshVersion": "0.2.1-rc.3",
  "checks": [{ "id": "page", "type": "http", "path": "/", "status": 200 }]
}
```

HTTP仅同一自有loopback origin的GET，可加JSON pointer/标量断言，拒绝重定向。DOM以`type:dom`、path、selector、minCount/maxCount声明只读数量断言，不接受作者脚本。清单身份绑定包名、精确版本、tgz摘要及本机DSH精确版本。

| 资源 | 上限 |
|---|---|
| 清单 / 检查数 | 64KiB / 1–32项 |
| 制品 | 压缩32MiB、解压64MiB；仅普通USTAR，拒绝链接、扩展头、重复/危险路径及身份不符 |
| 验真 | 非阻塞描述符、前后身份/实际字节核验；worker10秒，纳入总180秒 |
| HTTP响应 / 每项请求或导航 | 64KiB / 3秒 |

通过后仅安装已校验字节的私有副本，不重开原件；失败不安装。同步验真API须调用方监督。显式执行需当次授权：

```sh
node tools/functional-health.mjs --manifest <清单.json> --artifact <插件.tgz> --run --out <新JSON路径>
```

run会安装并执行所选插件，私有profile不是OS沙箱。只使用自有profile/Chrome，不供应账户或模型配置；目标版本/制品不符、超时、取消、断言或清理失败均不得标成功。只清理自有资源，清理未确认时保留诊断/文件；历史结果不能认证当前业务。

## 依赖关系与潜在影响

面板按端侧、required/optional/scoped/client包inject列出潜在提供者及loader状态。声明provide只是候选，多提供者不擅自选定；路径、环和连接不证明实际提供、激活、故障传播或业务影响。截断必须可见，不自动安装或修改判定。

## 发现的人工处置

界面步骤见[README](../README.md#人工处置与历史记录)。主结果与处置按context/finding双向定位，显示类别/API/源码及依据摘要；插件/状态筛选不隐藏草稿或原风险。状态为pending/reviewed/false-positive/fixed，必须填写依据并显式保存，不改判定/基线或授予豁免。草稿只驻留当前页面会话：同报告修订不重置输入/焦点，身份变化或处置不可用则保留旧编辑区、标过期、禁保存，可复制后重核或放弃；重载/离开前先保存或复制。坏可选记录仅使本区域不可用，分享前核对敏感信息。

位置为`$DSH_HOME/dsh-plugin-compat-check/reviews.<canonical-node_modules路径SHA256>.json`；未设DSH_HOME时使用`~/.dsh`。记录绑定目标/原观察路径、模式、源码、插件/DSH、工具/规则/目录及finding身份；即使版本/发现文字未变，源码变化仍需重审。旧记录保留为历史，当前显示needs-review。

后端按报告/输入身份缓存处置上下文与已校验文档；每次轮询仍核对私有目录和文件元数据，修订/替换/权限变化、坏文件恢复或卸载会失效，不用旧成功掩盖读取失败。

保存要求当前contextToken、findingId、status和note，不接受HTTP指定路径。单文件1MiB、1000条、每条依据4000字符。陈旧/跨目标/卸载、控制字符及超限输入拒绝；锁内重读合并、临时文件同步后原子替换。坏JSON/结构、链接、特殊或超限文件保留原件，不以刷新覆盖；需核实可信备份。确认重建时先独立备份原件，重建不是风险改善。

## 人工处置归档与本地历史报告

两个管理区默认收起、不后台读取；操作见[README](../README.md#人工处置与历史记录)，实现见[维护指南](maintaining.md#本地历史管理维护)。未设DSH_HOME时使用`~/.dsh`，以下文件均在`$DSH_HOME/dsh-plugin-compat-check/`。

| 记录 | 路径及容量 |
|---|---|
| 处置归档 | `review-archive.<目标SHA256>.<内容SHA256>.json`；每目标100份，每份1 MiB+8 KiB、合计101 MiB；封装空间不扩大活动处置1 MiB/1000条上限 |
| 报告快照 | `report-snapshot.<目标SHA256>.<内容SHA256>.json`；每目标20份、单份8 MiB、合计64 MiB；含完整报告、目标/工具/规则/目录/源码身份、检查及保存时间 |

“加载处置容量与归档”读取实际容量；归档历史处置保留当前状态，归档全部也移走当前已保存状态。二次确认后锁内核修订，先同步完整身份/依据备份，再原子替换活动文件；中断可能留重复备份，失败不清空原件。坏文件、共享目录或陈旧输入拒绝操作。恢复/导入只进历史参考库，不授予当前已复核；复制依据、核实当前发现后另存。

历史快照仅在显式保存时创建；加载后按备注/时间/版本/目标/插件检索。选择起点/终点，仅同目标及原路径、DSH、工具、采样方式、规则和目录才判方向，插件/源码变化单列；证据变弱不称修复，新增风险优先。不可比时中性提示，两份完整报告仍可查看。导入须匹配当前规范目标路径，不认证当前制品。

历史读取/导出/差分不受主表筛选影响，明细每页50项；不改普通报告、退出码或基线。导出先预览再下载紧凑JSON，注意路径/依据隐私；满额先导出再显式移除，不自动轮转、上传或遥测。摘要只检损坏，不是签名/当前业务认证，Windows仍待实机验收。

`POST /plugin-compat-check/history`沿用宿主会话、完整同源及请求标记；请求体8 MiB+16 KiB、读取5秒、整次20秒、每代最多2个并行。HTTP不接受状态路径；管理复用已发布报告，不重跑体检。卸载/取消/目标变化不得提交迟到写入。

## 本地状态锁恢复

锁、基线与review共用当前用户所有且无组/其它权限的目录，新建0700；已有不安全目录拒绝读写、不隐式chmod。遇到private/0700诊断，先停写并核对路径、所有者和用途；共享/借用目录改用独立状态目录（review可隔离DSH_HOME，基线可用baseline-file）。只有本人确认独占的叶目录才手动`chmod 700 <确切目录>`；不递归、不改已有父目录。

`<原JSON>.lock`记录类型/确切路径、PID、用户/主机、起始估计、时间及随机标识。起始估计不是OS出生时间证明，不按年龄或PID复用清锁。恢复CLI仅在仓库提供：

```sh
node bin/recover-lock.mjs /绝对路径/baseline.example.json.lock
node bin/recover-lock.mjs /绝对路径/baseline.example.json.lock --confirm <刚检查得到的token>
```

review锁使用相同入口。只有同主机/用户、完整匹配元数据且系统确认持有PID不存在（ESRCH）时才给孤锁token；确认时重查存活、inode及内容。活跃、旧空锁或无法证明安全的锁拒绝自动恢复。

正常释放只移除本次持有的同一锁；恢复使用`.lock.recovery-lock`排斥写入。若保护锁遗留，须停用写入者后人工诊断，不递归强清、通配删除或凭时间猜孤锁。恢复不修复目录权限，也不修改JSON；Windows真实恢复未验收。

## 功能回归

```sh
node --test test/functional-health.test.mjs test/dependency-graph.test.mjs test/finding-review.test.mjs test/p2-workflows-host.test.mjs test/p2-workflows-panel.test.mjs
```

默认病例是受控输入；`DSC_SLOW=1`浏览器病例只启动自有空Chrome，缺浏览器失败而非略过。真实DSH/制品执行仍按显式授权入口进行，fixture不代替业务证据。[Plan](Plan.md)维护契约及未完成工作。

## 安装与probe执行环境

仅显式安装检查、probe-boot或健康run才执行目标。其DSH子进程只继承PATH、SystemRoot、COMSPEC、PATHEXT、LANG、LC_ALL、TMPDIR、TEMP、TMP，使用自有0700 HOME/USERPROFILE/XDG/DSH_HOME/DSH_AGENTS_HOME、npm缓存/pnpm store及空0600 npm配置，设置ignore_scripts限制lifecycle。

不默认继承密钥、Node预加载/模块路径、动态库注入、代理、证书及npm凭据；依赖这些条件的安装会明确失败。PATH仍选择可信程序；白名单不是文件/网络沙箱。probe按原逻辑复制目标profile配置并重定位本地依赖，配置可能含秘密，目标代码仍可访问用户可读文件。通用command调用方显式传入的环境不属于默认隔离承诺。

## 本地HTTP边界

报告（含元数据）/预检仅GET、人工处置和历史管理仅JSON POST，均须`X-DSH-Compat-Request: 1`。缺标记、非本地Host/对端、异源Origin/Referer或跨来源Fetch Metadata返回403；同源含协议、主机及有效端口。只接受同源fetch的mode/destination，不接收图片、导航等子资源入口，OPTIONS不执行检查。

标记不是密码。通过同源检查后，所有读取/保存入口（含元数据与历史管理）均调用宿主`connection.requestRejection(req)`，沿用宿主签名Cookie、过期及会话策略，不自行解析密钥或另造令牌；未认证/伪造/过期返回401，鉴权服务缺失、异常或不符合同步接口返回503，且不开始计算/读取请求体/写入。无Origin的本机工具也需要标记及有效宿主会话；登录URL令牌先交给宿主根登录入口换取Cookie，不能只附在本插件URL上。界面使用既有同源Cookie；401时重新打开宿主提供的登录入口，不把登录URL/Cookie贴进报告。静态CLI及进程内agent tool不经过HTTP。

这不隔离同一已登录宿主中的可信插件、操作系统用户文件权限或反向代理部署；仍只承诺已登记宿主/本地边界，不外推公网可利用性或未来宿主认证。跨端口图片/同源恢复与未认证拒绝见HTTP回归，真实签名过期使用自有fixture内同步临时推进31天后立即还原时钟核验。

## 日常检查与源码交付

CLI分析和runAsync由worker监督，10秒、512+64MiB代际预算，回收后父线程比较/提交基线；失败/取消/不完整不推进，no-baseline禁读写。宿主将提取与纯判定、关系图、报告渲染及基线快照分为两个各10秒的受监督worker，回传后才核身份及受控提交；同步run须调用方监督；probe安装/启动及前后分析分开计时。

| 输入/状态 | 上限或策略 |
|---|---|
| 清单 | 单文件64KiB；整体50000项/32MiB/5秒 |
| 每包源码 | 2000文件、10000目录及条目，单文件2MiB/总32MiB/5秒 |
| patch | 共用源码文件/字节预算；单文件64KiB、64文件、10000 YAML节点/32层，别名展开0 |
| 规则/目录/probe/已有基线JSON | 各8MiB；拒绝非普通文件和叶子链接 |
| 缓存 | 最多16目标，闲置10分钟或满容量按最近访问淘汰，取消任务并释放绑定 |
| HTTP报告截止 | 宿主列表1.5秒；身份检查12秒；单轮计算45秒（输入连续变化最多重试3轮）；处置读取5秒；客户端整次读取/解码50秒 |
| 整轮服务采样 | 最多1000服务、10000属性访问、1MiB完整JSON与100ms协作截止；输入枚举最多50000项；服务名/身份/截断元数据计入字节，未采样服务保持未知，预算只可降低 |
| 单服务结构采样 | 最多1000个属性条目、200个方法、12层原型、64KiB保留JSON及25ms协作截止；只可降低。名称含UTF-8/JSON转义计费，不保留属性值、不执行getter；超限保留截断原因，未采样方法未知 |
| 缓存身份扫描 | 50000条目/10000目录、50000元数据项，读取合计32MiB/5秒 |
| 分析语义/回传 | 最多2000插件、20000服务引用（全局服务数与逐插件服务数之和取大者）、50000依赖及50000调用点；提取结果、计算结果（含报告/快照/分享文本）各8MiB；服务索引避免全数组重扫，超限报工具错误、不返回截断成功或推进基线 |
| 普通分析/身份worker | 同内核实例并发2、等待32；等待可取消/独立超时，准入后另计执行预算 |

服务反射的单次原生枚举不可中断，不承诺硬实时或中间分配的RSS上限；时间/属性/字节预算限制继续遍历与保留结果。单服务及整轮截断在全局说明可见，只降低实际消费截断/未采样服务的插件覆盖，不连带已取得完整证据的无关插件。

目录逐项核验后再排序，文件以非阻塞描述符核对类型、大小及前后身份。包根pnpm链接可解析，源码/patch链接须留在包内；超限、变化或不可读保留诊断，清单枚举不完整报工具错误。compatReport使用相同规则/probe检查；采用独立进程内观测也保留坏probe原因。辅助终端输出（labels、直接提取、规则库存、到货）对名称/版本/错误等低信任字段复用terminalText；布局换行与JSON原始身份保留。缓存失效任务不得发布或写基线，刷新失败保留旧成功及错误。

升级捕获/分析/清理独立监督，不借普通队列做清理准入。以上预算只可降低，不承诺跨进程总量、硬实时、RSS、原子快照或OS隔离。入口与语法矩阵见[维护指南](maintaining.md#维护入口与语法覆盖)。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --test-reporter=tap > /tmp/dsc-tests.tap
npm run check
node tools/update-current-state.mjs --test-summary /tmp/dsc-tests.tap
node tools/doc-check.mjs --test-summary /tmp/dsc-tests.tap
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

仅成功TAP可更新计数；不重建快照求绿。skill/契约修改后同步stage-skill/stage-contract，依赖变化同步第三方说明。默认套件不启动真实DSH/模型，打包测试需要registry；正式发布按[同一制品核对流程](maintaining.md#同一制品发布核对)，推送/发布/外部发帖分别授权。

## 升级预检与有限批量

```sh
node bin/compat-check.mjs --nm <profile或node_modules> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json
```

预检只比较同组制品，0/1/2表示无/非致命/致命新增或变重风险，3表示无法预检。不接受quiet、probe/启动、规则/目录覆盖、基线或issue-report参数；可带无操作的no-baseline。捕获256MiB/单文件8MiB/50000项/32层/10秒，分析10秒/512+64MiB（含根规则8MiB读取/解析），清理独立10秒；清理失败不能成功。

固定批量只扫本地包，无执行/网络/probe/基线，manifest64KiB、1–16项；每项4096条目/32层/单文件2MiB/总16MiB/报告96KiB，worker10秒、整批60秒、512+64MiB。指纹对有序POSIX路径、字节数和文件摘要的紧凑JSON取SHA-256，不含空目录/模式，不是签名。`--hash <目录>`计算指纹；合成清单预期exit2，总码3表示至少一项工具错误。previous须重扫同一manifest且工具/规则/目录身份相容；作者门禁见[作者CI](author-ci.md)。

## 面板与报告核实

“下一步”由结构化类别/状态生成，不猜替代API/修复版本。搜索、组合筛选、折叠不改报告或完整导出；无可比基线中性提示。目标、时间、缓存状态及覆盖限制须可见。复制前预览；导出保留包内位置而省略原始源码/日志/probe/baseline，不保证完全脱敏，不自动发帖。

## 工程与真实集成

```sh
node tools/engineering-check.mjs
DSC_SLOW=1 node --test test/engineering-live.test.mjs test/profile-lock.test.mjs test/owned-process.test.mjs test/debugger.test.mjs
DSC_ACCEPTANCE_DSH_VERSION=0.2.1-rc.3 DSC_REQUIRE_RC2_UI=1 node tools/rc2-live.mjs
```

真实集成需可信DSH/pnpm、Chrome（DSC_CHROME可指定）及相应网络/执行授权；账户/模型另取授权。只清理自有目录/PID组，不按进程名清场；Darwin负例缺编译器时跳过不算验收。`DSC_EXECUTION_DIAGNOSTICS=<私有目录>`可保留有界启动诊断，不导出argv/env或stderr正文，分享前仍需预览。

发布前设置`DSC_RC2_ARTIFACT=<确切tgz绝对路径>`验收选定归档，并在正式发布时使用**同一文件**；不设置时会重新打包源码。真实插件队列见[维护指南](maintaining.md#真实插件回归)；版本/平台及原始证据身份见[current-state](current-state.json)。
