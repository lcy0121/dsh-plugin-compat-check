# 插件作者 CI

这是未发布源码中的仓库工具。它对**同一已构建插件目录**建立只读快照，使用现有内核逐个比较已认证精确版本的 API 目录；不安装依赖、执行插件、启动 DSH、联网、调用模型或读取用户 profile 的探针、豁免、基线。请先在自己的构建流程生成实际要交付的代码。目录的`package.json`需有第三方npm包名、精确版本及对象形式的`dsh`声明；不要把已安装的`node_modules`打入选定目录，符号链接会被拒绝。

```bash
node tools/author-ci.mjs --package ./dist-plugin > compatibility.json
node tools/author-ci.mjs --package ./dist-plugin --versions 0.2.0-rc.2,0.2.1-rc.2 --format sarif > compatibility.sarif
node tools/author-ci.mjs --package ./dist-plugin --format junit > compatibility.xml
```

默认矩阵包含已认证的 `0.2.0-rc.2` 和 `0.2.1-rc.2`。未知版本显示 unsupported 并以工具错误阻断，不回退目录或扩大支持范围；矩阵表示静态目录比较，不能改称实际启动过这些版本或通过业务验收。每个 cell 保留 canonical report、内核退出码、DSH/工具/规则/目录和源码快照身份。

## 门禁策略

默认阻断所有严重度与确定性的发现、未知结论、覆盖不足以及无已验证调用；输入/工具错误也阻断。可用 `--policy policy.json` 显式声明作者愿意接受的范围：

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

stdout 只写所选格式；默认 JSON `kind=plugin-compat-check/author-ci`、`schemaVersion=1`。JSON 的 `gate` 是作者策略结果，`cells[].kernelExitCode` 保留原判定信号，两者可能不同。门禁退出码：0=符合所选策略，1=非fatal风险/未知或覆盖限制阻断，2=fatal发现阻断，3=输入、身份、版本或分析工具错误；工具错误优先。不要把0解释为完整兼容。

SARIF 2.1.0 提供规则、逐版本发现及真实包内位置；没有源码位置的事实不伪造行号，额外属性保留确定性、影响依据与身份。JUnit XML 按矩阵版本和策略结果呈现失败/错误，包含身份及限制；不能把被策略接受的旧风险从原报告中删除。JSON 是完整证据源，建议与标准输出一起归档。包内相对位置以插件根为基准，若构建目录不对应仓库路径，需要在消费工具中正确映射后再上传。

源码树 SHA-256 对有序的包内文件路径、长度与内容摘要计算，**不是 npm tgz 摘要**。快照拒绝 symlink/特殊文件及读取时观测到的并发变化；输入预算4096条目、深度32、单文件2MiB、合计16MiB。矩阵最多4个不同精确版本，工作线程30秒、512/64MiB代际预算；结果每cell最多2MiB，策略64KiB、previous8MiB。超限是工具错误。快照及临时目录只在自有位置创建并在结束时清理。

## CI 接入

在已有 CI 的依赖准备和插件构建之后运行工具，并保留退出码。以下 shell 不依赖额外 GitHub token，也不自动上传源码或报告：

```bash
code=0
node tools/author-ci.mjs --package ./dist-plugin --policy ./policy.json > compatibility.json || code=$?
# 此处由CI按需要归档compatibility.json；分享前检查包名、位置和业务说明。
exit "$code"
```

工具目前随本仓库提供，不能假定公开 npm 0.1.4 包含它。使用固定仓库提交及已审查锁文件，`npm ci --ignore-scripts`，遵守项目Node版本要求；不要在拉取请求中使用高权限工作流或运行来自不可信报告的命令。参照仓库[固定样本工作流](../.github/workflows/static-batch.yml)的只读权限、固定Actions提交和有限制品保留时间。静态样本工作流不是作者业务验收。
