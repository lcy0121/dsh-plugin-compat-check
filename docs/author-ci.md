# 插件作者 CI

本节随0.1.7-dev源码维护，版本真源仍为0.1.6；新增能力尚未发布npm版本。这是仓库作者工具，不作为npm插件CLI分发。它对**同一已构建插件目录**建立只读快照，使用现有内核逐个比较已认证精确版本的 API 目录；不安装依赖、执行插件、启动 DSH、联网、调用模型或读取用户 profile 的探针、豁免、基线。请先在自己的构建流程生成实际要交付的代码。目录的`package.json`需有第三方npm包名、精确版本及对象形式的`dsh`声明；不要把已安装的`node_modules`打入选定目录，符号链接会被拒绝。

```bash
node tools/author-ci.mjs --package ./dist-plugin > compatibility.json
node tools/author-ci.mjs --package ./dist-plugin --versions 0.2.0-rc.2,0.2.1-rc.2 --format sarif > compatibility.sarif
node tools/author-ci.mjs --package ./dist-plugin --format junit > compatibility.xml
# 使用同一 JSON 快照生成便于离线查看的 HTML，不再扫描目标目录
node tools/author-ci.mjs --report compatibility.json --format html > compatibility.html
```

默认矩阵包含已认证的 `0.2.0-rc.2` 和 `0.2.1-rc.2`。未知版本显示 unsupported 并以工具错误阻断，不回退目录或扩大支持范围；矩阵表示静态目录比较，不能改称实际启动过这些版本或通过业务验收。每个 cell 保留 canonical report、内核退出码、DSH/工具/规则/目录和源码快照身份。

## 门禁策略

默认阻断所有严重度与确定性的发现、未知结论、覆盖不足以及无已验证调用；输入/工具错误也阻断。策略必须通过校验后才替换默认策略；无效策略产生的错误JSON保留最后有效策略和原始错误理由，可同样转为HTML，退出码仍为3。可用 `--policy policy.json` 显式声明作者愿意接受的范围：

```json
{
  "schemaVersion": 1,
  "mode": "all",
  "severities": ["fatal", "feature-dead", "degraded"],
  "certainties": ["certain", "suspected"],
  "requireCompleteCoverage": true,
  "allowVacuous": false
}
```

严重度与确定性取交集。放宽覆盖或 vacuous 门禁只是作者接受限制，不会把报告改成覆盖完整或业务正常。未知判定、未知版本、坏输入和工具错误始终不能通过。默认静态扫描可能覆盖有限；应修正问题或在审查证据后显式设置策略，不要直接忽略非零退出码。

`mode: "new"` 需同时传 `--previous <已审查的compatibility.json>`。比较要求插件名、工具/规则/目录身份和精确版本集合一致，允许插件版本与源码摘要变化。新增或严重度/确定性改变的发现仍门禁；相同旧发现保留在报告里。未知、错误和当前覆盖限制不因旧记录而消失。旧报告缺失、损坏、身份不符或格式不支持时是工具错误，不能当空基线。结果文件是受信任的 CI 输入，不是签名；须审核、限制修改权限，不能直接采用不可信 PR 提供的基线或宽松策略。

## 输出和退出码

stdout 只写所选格式（JSON、SARIF、JUnit XML 或 HTML）；默认 JSON `kind=plugin-compat-check/author-ci`、`schemaVersion=1`。JSON 的 `gate` 是作者策略结果，`cells[].kernelExitCode` 保留原判定信号，两者可能不同。门禁退出码：0=符合所选策略，1=非fatal风险/未知或覆盖限制阻断，2=fatal发现阻断，3=输入、身份、版本或分析工具错误；工具错误优先。不要把0解释为完整兼容。

SARIF 2.1.0 提供规则、逐版本发现及真实包内位置；没有源码位置的事实不伪造行号，额外属性保留确定性、影响依据与身份。JUnit XML 按矩阵版本和策略结果呈现失败/错误，包含身份及限制；不能把被策略接受的旧风险从原报告中删除。JSON 是完整证据源，建议与标准输出一起归档。包内相对位置以插件根为基准，若构建目录不对应仓库路径，需要在消费工具中正确映射后再上传。

源码树 SHA-256 对有序的包内文件路径、长度与内容摘要计算，**不是 npm tgz 摘要**。快照拒绝 symlink/特殊文件及读取时观测到的并发变化；输入预算4096条目、深度32、单文件2MiB、合计16MiB，快照内层枚举/文件读取另限10秒；目录在完整列表分配/排序前逐项检查条目和时间，验证也有界。矩阵最多4个不同精确版本，工作线程30秒、512/64MiB代际预算；结果每cell紧凑JSON仍限2MiB，策略64KiB。最终格式化JSON（含全部cell、gate理由和末尾换行）、HTML/SARIF/JUnit各输出、previous及保存报告输入共用8MiB预算，按UTF-8字节计数；程序接口的previous对象也受限。发布输出前检查全部格式，保证自产JSON在相同工具下可回放为完整HTML并保留gate。任一格式超限则返回有界、可回放的工具错误，不返回截断的成功报告，也不放大读取预算。快照及临时目录只在自有位置创建并在结束时清理。

## 离线报告查看

`--format html` 输出独立静态 HTML，无脚本、网络资源或动态链接；用浏览器打开 `compatibility.html`，可读到每个精确版本的内核退出码、覆盖范围、vacuous、发现、策略理由及完整 JSON 证据。所有包名、消息和位置都按文本转义。策略 pass 不等于业务验收；被策略接受的风险仍保留。

`--report compatibility.json --format html` 只读取已有报告（普通文件、最多8MiB），校验 schema、策略、cell 内核报告和身份结构后生成视图；不需要原插件目录，不重扫、不改写保存的 gate，也不能与 `--package`、版本、策略或 previous 参数混用。渲染命令仍返回保存的门禁退出码；损坏/超限输入返回3并生成可读错误页。结构校验不是签名认证，也不是重新评价 `mode:new` 的基线；必须审查来源，HTML 不应代替原 JSON 作为门禁输入。

## CI 接入

可复制的 [GitHub Actions 作者接入示例](../examples/author-ci.yml) 仅存于 `examples/`，未启用本仓库远端任务。把它复制到**作者仓库**的 `.github/workflows/author-ci.yml` 后：

1. 审查示例和工具提交，通过手动运行必填的 `tool_ref` 提供**已推送到公开仓库、已审查且包含本节 HTML/--report 能力的完整40位提交 SHA**。输入只接受40位十六进制，不接受分支或 tag。先在公开仓库核对该提交可取用；npm 0.1.6对应的旧源码没有HTML/--report，不能用旧SHA冒充新版能力。推送源码不等于发布npm包。
2. 按作者项目调整 `npm run build` 和 `SELECTED_PACKAGE`（默认 `dist-plugin`），使它指向**本次构建且准备交付的同一个完整插件目录**，含 `package.json`、实际入口和声明，不含 `node_modules` 或符号链接。构建步骤显式执行作者自己的构建脚本；检查器本身不执行目标插件。
3. 默认门禁运行一次生成 `compatibility.json`（即扫描 stdout），保留原始退出码，再从该 JSON 生成 HTML。扫描/渲染 stderr 和门禁退出码文本一起归档；渲染返回同一 gate 码，若不一致按工具错误3阻断。失败也上传制品，保留7天；下载后离线打开 HTML，JSON 是完整原始证据。不要在扫描后重新构建目录并把其他产物的结果当作本次交付证据。

示例仅 `workflow_dispatch`，`contents: read`，checkout 不保存凭据，Actions 固定完整提交，工具依赖用已审查锁文件及 `npm ci --ignore-scripts`，不使用 `pull_request_target`、写 token、自动基线或 PR 提供的宽松策略。若要接入其他触发器，先审查构建代码、策略和基线的信任来源；不要运行从不可信报告中提取的命令。上传前检查报告中的包名、位置、消息和业务说明是否适合分享。

不使用 GitHub Actions 时，可在既有构建后执行同样的本地 shell；`code` 保留扫描结果，渲染不会把失败覆盖为成功：

```bash
code=0
node tools/author-ci.mjs --package ./dist-plugin > compatibility.json 2> scan.stderr.log || code=$?
render_code=0
node tools/author-ci.mjs --report compatibility.json --format html > compatibility.html 2> render.stderr.log || render_code=$?
# 此处按需要归档 JSON、HTML 和日志。
if [ "$render_code" -ne "$code" ]; then exit 3; fi
exit "$code"
```

工具仅随本仓库提供，npm插件包不提供此CLI。示例工作流的本地受控构建目录检查已覆盖策略门禁及输入工具错误后的归档文件生成、同一JSON/HTML证据与退出码保留；未实际运行作者远端工作流，不构成业务验收。
