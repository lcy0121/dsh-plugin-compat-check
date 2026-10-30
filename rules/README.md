# 规则与固定源码参考

本文维护**0.2.0**的规则。契约见[Plan](../docs/Plan.md)，维护见[流程](../docs/maintaining.md)，限定证据/实际发布状态见[current-state](../docs/current-state.json)。

## 文件与消费者

| 文件 | 用途 |
|---|---|
| severity.json | services下的方法严重度/影响与端侧约束；apiSemantics下的精确客户端参数、弃用和生命周期参考 |
| dsh-api-catalog.json | 固定0.2.0-rc.2目录 |
| dsh-api-catalog-0.2.1-rc.2.json / dsh-api-catalog-0.2.1-rc.3.json | 两个独立精确版本目录；不能因方法名相同而互相认证 |
| dsh-0.2.1-rc.3-review.json | 固定来源、摘要、签名与语义审查 |
| dsh-api-catalog-0.2.1-rc.5.json / dsh-0.2.1-rc.5-review.json | 来源已核验的候选与语义审查；未登记、不授予宿主认证 |
| usage-inventory.json | 带日期、版本、profile和完整性标记的历史AST库存，不是当前覆盖率 |

普通检查对DSH≥0.2.1-rc.3选rc.3参考，≥0.2.1-rc.2选rc.2，其余/未知选旧目录，显式覆盖优先。登记字节与认证集合以`lib/contracts.mjs.CATALOG_REFERENCES`为准；升级预检接受三个登记精确版本，拒绝未知/范围。回退和自定义目录不认证未来宿主。

## 判定与解释

| 证据 | 处理 |
|---|---|
| 可靠映射且启用的FAILED/PENDING loader | fatal、影响measured；禁用/LOADING/无法映射不冒充同一事实 |
| 必需inject及合格同目标观测明确absent | 可推断激活障碍；仅目录缺项或未采样不证明缺失 |
| 非硬依赖明确absent或有充分方法缺失证据 | 按方法规则/默认档给feature-dead或degraded，影响通常inferred |
| 声明范围冲突或非法字段 | degraded/推断；有效精确豁免仅消除范围冲突，不放行非法字段或证明业务通过 |
| 未采样、访问器未知、不可读或源码不完整 | 保留覆盖限制，不用省略键认定不存在 |
| 固定客户端参数类型/枚举不符 | 非致命静态风险；未知值弃权，弃用/生命周期提醒仅作覆盖说明 |

方法自身layer优先、服务layer回退，客户端规则不能套宿主同名方法。提供方声明只是候选，不能掩盖明确absent；present服务上的方法缺失另判。certainty与impactBasis分别描述证据和影响，弱Context/别名保留suspected。没有语义依据的方法缺失明确“影响面未知”，不猜替代API或修复版本。

DSH≥0.2.1-rc.1优先engines.dsh，缺失回退官方peer，旧目标保留旧策略。独立compatibility.json仅按插件/DSH精确版本豁免；非法字段和无效豁免保留风险/限制。

summary/basis/evidence/knownGoneIn/needsReview是解释与维护资料。knownExtractionArtifacts只保留历史反例，不自动过滤当前真实调用。degraded方法规则须有降级/回退依据；声明与静态参数风险的degraded不冒充实测回退。

## 更新与度量

先核对调用点、端侧、目标版本及真实描述符/官方源码，再改规则并加行为回归；不能仅凭目录变化新增严重度。新版本目录、语义基线及来源验证按[维护流程](../docs/maintaining.md#api目录候选审查)分别审查，保留旧基线。

```sh
npm run check:catalogs
node tools/coverage.mjs --nm <目录> --dsh-version <精确版本> --json
node tools/coverage.mjs --nm <目录> --probe <同目标的现代probe> --write --json
# 仅审查diagnostics后才显式接受部分库存
node tools/coverage.mjs --nm <目录> --dsh-version <精确版本> --write --allow-partial --json
```

coverage按AST调用点分host/client/shared统计规则命中及默认影响；不借异profile探针。不完整扫描默认拒绝写库存，写入须合法精确DSH版本，坏版本不覆盖旧文件。文件树/AST摘要不是原子快照或包签名。

库存是2026-10-15、DSH0.2.0-rc.2的desktop历史部分样本；规则复核、旧覆盖率和方法决定可在`39d9f1a:rules/README.md`及severity.json的reviewed/evidence追溯。它们不代表当前生态准确率。真实业务标签、静态/service-only预测和驱动错误独立计分，不借业务答案调严重度；[复现](../docs/maintaining.md#真实插件回归)。
