# 维护指南

本文说明API目录、依赖公告、真实回归及提取器的维护边界。日常命令见[指南](guide.md)，现行分析和报告契约见[Plan](Plan.md)。[current-state](current-state.json)只保存当前事实与有限验收摘要；旧实现的缺陷清单、逐轮实验与发布证据从Git历史查阅，不作为当前验收。

## API目录候选审查

API目录是生成代码中的声明清单，不能证明运行时方法存在、插件激活或业务成功。普通体检分别展示实际DSH、参考目录身份及认证范围；未知/未来版本不能借用旧目录认证。升级预检只接受明确支持的精确版本。

1. 封存目标官方安装包或稳定本地安装副本，记录渠道/取得日期、精确版本、平台架构、包与`app.asar`路径及SHA-256。审查者核实官方来源；工具只核对本地归档与候选一致性。
2. 显式提取到私有新目录。提取器只读生成代码文本，不执行JavaScript/插件。最低服务数量检查失败时调查格式变化并补测试，不删除检查求绿。
3. 离线核验候选来源与API差分，再人工审查签名、生命周期、权限、分端及注入前提；空差分也不能省略语义审查。
4. 运行针对性正反例和默认测试，在对应DSH、平台、独立私有profile及Chrome中验收激活、双端调用、HTTP/DOM业务、故障恢复、报告身份与资源清理。未观测项保持未验收。
5. 只有语义审查和真实验收完成后，才提交独立版本目录、`lib/contracts.mjs`中的`CATALOG_REFERENCES`、选择策略及`lib/upgrade-contract.mjs`的`SUPPORTED_PREVIEW_VERSIONS`供review；同步契约副本及说明，保留旧目录与回退路径。

以下`0.3.0-rc.1`只是候选流程示例，不表示受支持：

```sh
review_dir="$(mktemp -d "${TMPDIR:-/tmp}/dsh-catalog-candidate.XXXXXX")"
asar='/绝对路径/目标版本的/app.asar'
candidate="$review_dir/dsh-api-catalog-0.3.0-rc.1.candidate.json"
shasum -a 256 "$asar" > "$review_dir/app-asar.sha256"
python3 -I tools/catalog/extract-host-api.py "$asar" "$candidate"
node tools/catalog-review.mjs \
  --before rules/dsh-api-catalog-0.2.1-rc.2.json \
  --candidate "$candidate" --asar "$asar" --json > "$review_dir/catalog-review.json"
```

候选须有`_dshVersion`、两端固定`_source`路径、原始字节`_sourceSha256`和host/client方法。旧目录可作`--before`差分基准，不重做其历史认证。核验重新提取版本、源路径/摘要及API内容；结果给出两目录SHA-256及`diff.host/client`的服务/方法增删，排序稳定。退出0只表示`sourceVerified:true`，`semanticReview / integrationAcceptance`仍为`pending`，`certification`为`not-granted`；退出3是参数、输入、来源、内容、资源或提取失败，不能当作无差分。

工具离线且不改输入、规则、pins或支持版本。JSON各2MiB、ASAR4GiB、头8MiB、三个选定源条目各8MiB；拒绝链接、FIFO、非普通文件、非packed或越界条目。Python隔离子进程10秒、输出1MiB，强制回收并清理自有临时目录。前后身份检查不承诺OS原子快照、防协同篡改签名、硬实时或RSS，必须使用稳定归档。

不因名称增删直接改severity，不跨端/profile套证据，也不用放宽规则掩盖验收失败。保存候选/来源/差分/语义结论、审查人日期、测试与实际验收证据及认证范围到稳定存档，再清理自有临时目录；分享前检查路径、包名和日志隐私。失败候选保持未认证；接受后回退须恢复旧pins/支持范围并复测提示和拒绝行为。回归见`test/catalog-governance.test.mjs`、`test/catalog-review.test.mjs`。

## 依赖公告与CI供应链

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run security:dependencies -- --output dependency-security.json
node --test test/dependency-security.test.mjs
```

[检查程序](../tools/dependency-security.mjs)独立审计两张图：`workspace-lock`读取根冻结lock（含dev/optional/peer），`plugin-runtime`读取plugin自身pins。plugin无lock时仅复制runtime依赖字段，在专属临时目录以`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`解析公共registry；以后有plugin lock则审计其冻结图（含dev）。不以根同名依赖替代plugin依赖，不携带lifecycle脚本、不写回源码或自动修复。

先核对manifest声明与lock根记录，陈旧lock是工具错误；证据记录实际manifest/lock摘要及图来源。执行`npm audit --package-lock-only --ignore-scripts --json --include=dev --include=optional --include=peer --audit-level=info`，固定公共npm，任何级别公告（包括未知级别）都阻断，无豁免。退出0表示本次公告数据未发现漏洞，1表示有公告，2表示网络/npm/超时/schema/lock或证据错误；网络失败不转绿。逐一审阅公告URL与依赖路径，显式选择兼容版本更新manifest/lock，再测试和review。

每npm进程默认/最多120秒（`--timeout-ms`可降低），网络45秒无自动重试，stdout/stderr缓冲各4MiB；成功失败都清理自有临时目录。证据仅存白名单字段，去除控制字符和URL查询/凭据，不存原始响应或stderr；每图最多1000项、每字段256字符，截断不改变阻断，分享前仍须预览。测试替换联网npm子进程并验证实际wrapper、证据与清理，不能代替远端Actions或未来registry状态。

[Test](../.github/workflows/test.yml)和[静态批量](../.github/workflows/static-batch.yml)固定Actions的完整40位commit，checkout关闭`persist-credentials`，最小权限、job超时、制品7天；审计在独立Node24 job执行一次，不重复到Node矩阵。静态批量保持手动触发。更新Action pin时核对官方release、commit和该commit的`action.yml`运行时及实际inputs；Action运行时与被测Node版本分开。当前使用GitHub托管Ubuntu；其它runner另验收，不能靠版本注释认证。npm语义见[官方audit文档](https://docs.npmjs.com/cli/v11/commands/npm-audit/)。

## 真实插件回归

[固定manifest](../tools/real-regression-manifest.json)锁定DSH/API目录、五个真实npm制品、摘要及每轮24项业务期望。独立holdout为[causebefore/dsh-pomodoro](https://github.com/causebefore/dsh-pomodoro)的`dsh-pomodoro@0.5.5`和[LUgABeEEE/dsh-global-todo](https://github.com/LUgABeEEE/dsh-global-todo)的`dsh-global-todo@0.13.2`；选自公开市场中可审阅、无需账户/模型且声明形态不同的有界操作，在查看预测前确定，不据其结果调规则或严重度。tarball对照registry integrity，安装树指纹及所审源码字节另外固定；二次重复不增加独立样本数。

Pomodoro覆盖必需connection/client注入和schema配置，真值是实际Start后localStorage revision/deadline及新文档恢复；GET config仅说明配置就绪，driver不种植存储。受控故障删除实际主操作按钮，重载恢复。Todo覆盖可选服务/webServer及原始JSON Schema，真值是完成POST/create、私有JSON精确标题及重载DOM成员；故障只对该POST返回503，磁盘和DOM必须均无标题，恢复另建标题。两者均有正常→受控失败→恢复，不调用通知/模型/外部采集功能。

静态预测在启动前封存，service-only从独立root观测生成并在Chrome/动作前封存；记录动作起止及取标签时间，回放从HTTP/DOM/磁盘receipt重算后置条件，不信任保存的布尔值。自然与受控、静态与service-only分别保留FP/FN、覆盖限制及`clientVerified:false`。浏览器/selector/启动异常是driver错误，不能当插件业务失败。绿色只证明固定结果重现，受控故障仍可为诚实FN，不是生态准确率或未来兼容认证。

```sh
node tools/real-regression.mjs --live --out-dir <新空目录> --repeat 2
node tools/real-regression.mjs --replay <证据根或单队列目录>
node tools/business-labels.mjs --live --suite holdout-pomodoro --observe-services --out-dir <新空目录> --json
node tools/business-labels.mjs --live --suite holdout-todo --observe-services --out-dir <另一新空目录> --json
node tools/business-labels.mjs --predictions <预测.json> --labels <标签.json> --json
```

可另选`market / sidebar / sidebar-ui / sidebar-ui-previous`；回放单队列可加`--suite`。固定回归退出0期望重现、1业务/证据不符、3驱动错误；业务度量退出0无错配、1有FP/FN或不计分项、3输入/驱动错误。旧三suite索引只验证原队列，当前索引须含全部五suite；旧driver缺逐动作时间戳，摘要不等于签名。

真实运行需当次授权的下载、DSH/Chrome执行环境；全新私有profile/缓存不复制账户或用户工作文件。每队列10分钟、清理宽限15秒、最多两轮和64证据文件，终止后确认自有宿主/Chrome停止再清目录，未确认清理即失败。`sidebar-model`另需当次账户/模型授权，工具关闭、两次首步、无重试/标题、每步256token，不属默认测试/CI。回归见`test/business-holdout.test.mjs`及真实回归相关测试。

## 提取器与探针维护

- AST与词法绑定区分真实Context、同名普通对象、注释/字符串及遮蔽；源码图保留副作用导入和懒加载来源，不用入口不可达证明死代码。动态、异步、递归或预算不足应弃权并限制覆盖。
- 调用位置必须能由相应源码字节/span验证；包、端侧、作用域和别名是身份的一部分，不能按裸变量名合并。提供方声明只是线索，不证明消费者此刻已获得服务。
- 未看到与不存在不同。探针只采样点名服务，省略键为`unobserved`，仅明确`absent`才是缺失证据；不执行getter、不复制属性值/凭据/用户内容，保留profile/DSH/时间及完整性边界。
- 诊断只写运行器自有私有目录（`DSC_OUT_DIR`），拒绝不安全既有路径/链接；输出或启动失败明确报告，不用catch、空结果或旧探针掩盖。
- 每项修复补针对性正反例：同时拦误报与新增漏报；清理断言只检查本次调用拥有的资源。敏感值守卫需同时验证真实形态命中、占位说明不命中，持续噪音会损害守卫有效性。

现行边界见[Plan §2](Plan.md#2-现行判定与集成契约)；回归包括`test/extraction-regressions.test.mjs`、`test/p2-flow.test.mjs`、`test/probe-safety.test.mjs`、`test/observation-time.test.mjs`和`test/secrets.test.mjs`。旧正则缺陷编号及过时性能数字保留于Git历史，维护当前契约不依赖历史编号连续。
