# 插件作者CI

**0.2.7** 的作者 CLI 对同一已构建目录取只读快照，再按版本比较 API。目标须含第三方 npm 包名、精确版本、对象形式的 `dsh` 和交付代码。拒绝 `node_modules`、链接及特殊文件。扫描离线运行，无须安装目标依赖、启动宿主或读取用户 profile。

```sh
node tools/author-ci.mjs --package ./dist-plugin > compatibility.json
node tools/author-ci.mjs --package ./dist-plugin --format sarif > compatibility.sarif
node tools/author-ci.mjs --package ./dist-plugin --format junit > compatibility.xml
node tools/author-ci.mjs --report compatibility.json --format html > compatibility.html
```

默认矩阵包含已认证的 `0.2.0-rc.2`、`0.2.1-rc.2`、`0.2.1-rc.3`、`0.2.1-rc.5`、`0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`、`0.2.2-rc.5`。用 `--versions` 传逗号分隔的子集。未知版本退出 3。各 cell 保留内核报告、退出码及身份，目录缺项记录为覆盖限制。

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

HTML 独立离线，包名、位置和消息以文本转义。`--report ... --format html` 校验原 JSON 并返回保存的 gate 码，坏输入返回 3 和错误页。回放参数与 package/versions/policy/previous 互斥。后续 `new` 门禁仍用完整 JSON。

## 资源与身份

源码树SHA-256对有序包内路径、长度及内容摘要计算，**不是tgz摘要**，也不是原子快照。发现并发变化则拒绝。

| 资源 | 上限 |
|---|---|
| 源码快照 | 4096项、32层、单文件2MiB/总16MiB；内层枚举/读取10秒 |
| 矩阵 | 最多8个不同精确版本；worker30秒、512+64MiB代际预算 |
| 策略 / cell紧凑JSON | 64KiB / 2MiB |
| 最终JSON及各展示输出、previous/保存报告输入 | 各8MiB，UTF-8字节计数，含末尾换行 |

各格式发布前检查预算，超限退出 3。JSON 可回放成 HTML 并保留门禁结果。八版密集样本及旧七版回放见[验收回执](current-state.json)。

## CI接入

复制[示例](../examples/author-ci.yml)到作者仓库的`.github/workflows/author-ci.yml`：

1. 手动传入已公开、已审查且包含所需能力的完整40位`tool_ref` SHA，不接受分支/tag。
2. 调整构建步骤与`SELECTED_PACKAGE`（默认dist-plugin），扫描本次构建且准备交付的同一目录。作者构建会执行自身脚本，检查器不执行目标。
3. 扫描一次归档JSON、stderr及退出码，再从同一JSON生成HTML。渲染码不一致按工具错误3阻断；失败也上传，保留7天。不得扫描后重新构建并冒用旧证据。

示例仅workflow_dispatch、contents:read，checkout不保存凭据，Actions固定完整commit；工具依赖按冻结lock安装且禁用lifecycle。没有pull_request_target、写token或自动基线。其它触发器需先审查构建代码、策略和基线来源；分享前检查报告中包名、位置及业务说明。

本地运行也须比对扫描和 HTML 的退出码。分享前预览证据和业务说明。

项目验收范围见[current-state](current-state.json)，市场安装及恢复见[上游记录](upstream-verification.md)。
