# 插件作者CI

本文对应**0.2.1**的仓库工具，npm插件包不提供此CLI。它对**同一已构建插件目录**建立只读快照并比较API目录；不安装依赖、执行目标、启动DSH、联网或读取用户profile。目标须含第三方npm包名、精确版本、对象形式的`dsh`及实际交付代码，拒绝夹带`node_modules`、链接和特殊文件。

```sh
node tools/author-ci.mjs --package ./dist-plugin > compatibility.json
node tools/author-ci.mjs --package ./dist-plugin --versions 0.2.0-rc.2,0.2.1-rc.2,0.2.1-rc.3,0.2.1-rc.5 --format sarif > compatibility.sarif
node tools/author-ci.mjs --package ./dist-plugin --format junit > compatibility.xml
node tools/author-ci.mjs --report compatibility.json --format html > compatibility.html
```

默认矩阵包含已认证的 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3` 和 `0.2.1-rc.5`。未知版本以工具错误阻断，不回退目录。矩阵只做静态比较，不表示实际启动过这些版本或完成业务验收；每cell保留canonical report、内核退出码及工具/规则/目录/源码身份。

## 门禁策略

默认阻断所有严重度/确定性的发现、未知、覆盖不足及无已验证调用；工具错误始终阻断。显式策略须先校验，无效策略的错误JSON保留最后有效策略及原错误，也可转HTML。示例：

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

通过`--policy policy.json`使用。严重度与确定性取交集；放宽策略只表示作者接受限制，不把报告改成覆盖完整或业务通过。`mode:new`另须`--previous <已审查JSON>`，要求包名、工具/规则/目录身份及精确版本集合一致，允许插件版本/源码变化。新增或严重度/确定性变化仍门禁，旧风险、未知和当前覆盖限制不消失；坏旧输入是工具错误，不当空基线。

策略及previous是受信任的CI输入，不是签名。限制其修改权限，不直接采用不可信PR提供的宽松策略或基线，不运行报告中提取的命令。

## 输出和退出码

stdout只写所选格式；JSON `kind=plugin-compat-check/author-ci`、schema1，是完整证据源。`gate`为策略结果，`cells[].kernelExitCode`为内核判定，两者可不同。退出码：**0满足策略、1非fatal风险/未知或覆盖限制、2 fatal发现、3输入/身份/版本/工具错误**，工具错误优先。

SARIF 2.1.0保留逐版本规则、真实包内位置及身份；JUnit按版本与策略结果显示失败/错误。无位置不造行号，策略接受的旧风险仍在原报告。构建目录若不对应仓库路径，上传前须正确映射。

HTML独立、无脚本/网络资源或动态链接，包名、位置和消息均转义为文本。`--report ... --format html`只校验并渲染原JSON，不重扫或改写gate；不能与package/版本/policy/previous参数混用。渲染仍返回保存的gate码，坏输入返回3及错误页。结构校验不是签名或重新评价new基线，HTML不能代替JSON门禁输入。

## 资源与身份

源码树SHA-256对有序包内路径、长度及内容摘要计算，**不是tgz摘要**，也不是原子快照。发现并发变化则拒绝。

| 资源 | 上限 |
|---|---|
| 源码快照 | 4096项、32层、单文件2MiB/总16MiB；内层枚举/读取10秒 |
| 矩阵 | 最多4个不同精确版本；worker30秒、512+64MiB代际预算 |
| 策略 / cell紧凑JSON | 64KiB / 2MiB |
| 最终JSON及各展示输出、previous/保存报告输入 | 各8MiB，UTF-8字节计数，含末尾换行 |

验证、冻结和目录排序前均检查预算。所有格式在发布输出前核验；超限返回完整有界工具错误，不截断成功证据或放宽读取上限。自产JSON须能在同一工具回放为HTML并保留gate；只清理自有快照/临时目录。

## CI接入

复制[示例](../examples/author-ci.yml)到作者仓库的`.github/workflows/author-ci.yml`：

1. 手动传入已公开、已审查且包含所需能力的完整40位`tool_ref` SHA，不接受分支/tag。
2. 调整构建步骤与`SELECTED_PACKAGE`（默认dist-plugin），扫描本次构建且准备交付的同一目录。作者构建会执行自身脚本，检查器不执行目标。
3. 扫描一次归档JSON、stderr及退出码，再从同一JSON生成HTML。渲染码不一致按工具错误3阻断；失败也上传，保留7天。不得扫描后重新构建并冒用旧证据。

示例仅workflow_dispatch、contents:read，checkout不保存凭据，Actions固定完整commit；工具依赖按冻结lock安装且禁用lifecycle。没有pull_request_target、写token或自动基线。其它触发器需先审查构建代码、策略和基线来源；分享前检查报告中包名、位置及业务说明。

无Actions时运行同样的扫描/HTML命令，分别保存退出码；渲染码须等于JSON gate码，否则按工具错误3阻断。完整JSON是后续new策略输入，不能用HTML或截断输出替代。

本仓库未启用作者示例工作流；本地受控接入回归不能代替作者远端CI或业务验收。项目当前验收及实际发布状态见[current-state](current-state.json)。
