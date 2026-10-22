# 使用与验证指南

以下为当前未发布源码的工作流；公开0.1.4不因此获得这些能力。先按[源码打包说明](../plugin/README.md#从源码构建安装)构建完整tgz。三项能力共用普通报告的身份与证据边界，均不能把声明放行、激活或无发现改称业务验收通过。

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

进程崩溃可能遗留`reviews.<hash>.json.lock`或`.reviews-<uuid>.tmp`；刷新不会自动回收，保存可能持续提示忙。先确认没有任何进程正在向该目录保存人工记录，备份并保留对应JSON，再只清理已确认孤立的lock/tmp。不要按通配符清空目录，不删除JSON、baseline或其它进程资源；仍有保存任务时不得清锁。损坏JSON需保留原件并人工核实或恢复可信备份，不能靠清空文件把状态伪装成首次待确认。

## 功能回归

```bash
node --test test/functional-health.test.mjs test/dependency-graph.test.mjs test/finding-review.test.mjs test/p2-workflows-host.test.mjs test/p2-workflows-panel.test.mjs
```

定向回归使用受控输入；真实Chrome病例仅在`DSC_SLOW=1`的显式浏览器套件启动自有空浏览器；该模式缺少浏览器会失败，不静默略过。真实DSH/制品执行仍按上述显式授权入口进行，不以测试fixture代替真实业务证据。当前计数、真实集成与平台范围以[current-state.json](current-state.json)为准；历史记录不认证新源码或新制品。[Plan](Plan.md)维护合同、复现索引及后续工作。

## 日常检查与源码交付

仓库CLI的快速开始及参数见[README](../README.md)，npm插件的完整tgz构建见[plugin README](../plugin/README.md#从源码构建安装)。安装依赖时使用冻结lock且禁用lifecycle脚本：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test -- --test-reporter=tap > /tmp/dsc-tests.tap
npm run format:check
node tools/update-current-state.mjs --test-summary /tmp/dsc-tests.tap
node tools/doc-check.mjs --test-summary /tmp/dsc-tests.tap
npm run notices:check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

只有测试成功的TAP才用于更新统计；不要用重建快照消除失败。`prepublish-check`只检查，不发布。skill和契约副本分别用`node plugin/scripts/stage-skill.mjs`、`node plugin/scripts/stage-contract.mjs`同步，依赖变化后同步第三方说明。默认suite不启动真实DSH或模型，独立安装测试需要registry。源码推送、npm发布和外部发帖分别按当次授权执行。

## 升级预检与有限批量

```sh
node bin/compat-check.mjs --nm <profile或node_modules> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
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
