# 健康检查、依赖关系与人工处置

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

## 复现入口

```bash
node --test test/functional-health.test.mjs test/dependency-graph.test.mjs test/finding-review.test.mjs test/p2-workflows-host.test.mjs test/p2-workflows-panel.test.mjs
```

定向回归使用受控输入；可用Chrome的病例会启动自有空浏览器。真实DSH/制品执行仍按上述显式授权入口进行，不以测试fixture代替真实业务证据。本轮最终计数、真实集成与平台范围以[current-state.json](current-state.json)的归档为准；历史记录不认证新源码或新制品。[Plan](Plan.md)维护合同、复现索引及后续工作。
