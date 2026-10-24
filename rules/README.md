# 严重度规则表与维护

本文随0.1.7-dev源码维护，版本真源仍为0.1.6，新增修复尚未发布npm版本。当前契约见[Plan](../docs/Plan.md)，验证见[current-state](../docs/current-state.json)；历史库存不代表当前覆盖率或运行时真值。

## 文件与运行时消费者

| 文件 | 用途 |
|---|---|
| severity.json | 方法严重度/影响文案；引擎读取services下的方法规则，并与代码内默认档合用 |
| dsh-api-catalog.json / dsh-api-catalog-0.2.1-rc.2.json | 原0.2.0-rc.2（host91/client8）与新rc.2（host98/client8）契约快照；普通体检对DSH≥0.2.1-rc.2选新目录，其余/未知选旧目录，CLI显式覆盖优先；升级预检只接受这两个精确版本并拒绝未知版本，未来环境未认证 |
| usage-inventory.json | 带日期/版本/profile及完整性标记的AST库存快照；由coverage显式刷新，不保证与后续提取器重扫同数 |

严重度由 `lib/verdict.mjs` 的确定性逻辑、缺失证据、方法规则及默认档共同决定，不由LLM决定。方法规则的severity/impact参与判定与输出，layer控制端别：方法自身优先、服务layer回退。summary/basis/evidence/knownGoneIn/needsReview等用于解释与维护；knownExtractionArtifacts是历史反例登记，不是自动过滤黑名单。

声明按DSH目标分流：从0.2.1-rc.1起自有engines.dsh优先，缺失才回退全部官方peer；旧目标保留旧行为。非法/空范围、预发布和peer workspace别名均有回归；engines中的workspace不获放行。独立compatibility.json仅按插件/运行时精确版本豁免，非法字段不能靠豁免绕过；无效记录忽略并保留覆盖限制。

## 当前证据与严重度

| 情形 | 处理 |
|---|---|
| 可映射loader条目FAILED/PENDING | fatal，影响依据measured；禁用、LOADING、无法映射不冒充同一事实 |
| 宿主硬依赖且明确absent | 可判fatal；仅catalog缺项不冒充运行时缺失 |
| 非硬依赖服务明确absent，或有足够方法证据 | 按规则/默认档给feature-dead或degraded；用户影响通常是inferred |
| 官方声明冲突或非法字段 | declared-incompatible，degraded及推断影响；不冒充实测加载失败；有效精确豁免可消除范围冲突，但保留限制且不证明业务成功 |
| 未采样、读取失败、访问器未知、源码不完整 | 保留覆盖限制；不以省略键认定不存在 |

方法规则中的degraded应有具体降级/回退依据；peer声明冲突的degraded是引擎针对声明风险的独立默认，不代表观察到回退。方法缺失但没有语义规则时会明确“影响面未知”。声明provide只是候选提供方，不证明已激活，也不得掩盖合格观测中的明确absent；present服务上的方法缺失另按方法证据判断。

宿主、客户端及shared调用点必须分开。客户端方法不能拿宿主probe判缺失；同名服务也不保证同一语义。对源码归属不确定的Context/别名保留suspected。certainty与impactBasis分别表达证据强度和影响是否实测。

必需依赖：必需inject未观测保持degraded/suspected，仅提示激活前提未确认；同profile明确absent才推断激活障碍，optional/scoped依赖与方法缺失分别处理，不借业务答案调严重度。`--observe-services`另记服务预测身份/摘要，不覆盖静态FN，也不改变生产certainty或impactBasis。

仓库独立业务队列将手审的功能调用区间内API风险与真实市场操作、侧栏HTTP/编辑器及有限模型回复结果对照，保持业务、loader标签及预测隔离；不把整个插件的其它发现挪给本功能。正常/自然失败与HTTP503/控件缺失故障组分别计分，限定样本不能改变生产报告中的certainty或impactBasis，也不是新增严重度规则的充分证据。复现见[使用指南](../docs/guide.md#工程与真实集成)。

## 如何更新

ASAR读取器已修正数据起点为8+headerSize，并校验头长、边界、完整读取、UTF-8/JSON及归档SHA256。2026-10-18与Electron原生ASAR读取逐字节及首尾交叉校验后生成独立rc.2目录，旧目录未改。新host增加8项、移除invariants；subagents移除start/startContinuable/drainContinuableChildren/drainContinuableDescendants，增加startActivation/drainChildren/drainDescendants/waitForChildren；其它方法差异和源摘要保留在提交`10eaeba`的`docs/current-state.json`历史记录；当前认证字节见`lib/contracts.mjs`的`CATALOG_REFERENCES`，新候选按[维护流程](../docs/maintaining.md#api目录候选审查)核对。client方法集合未变。旧方法规则保留其原调用语义；不把新方法当同义重命名，也不只凭目录变化新增严重度，未知影响继续回退。

先读调用点和目标版本的真实描述符/官方源码，再修改规则，添加行为回归并审查快照差异。原needsReview已在2026-10-15逐条复核，决定与证据保留于severity.json的needsReview.reviewed/evidence及 [Plan](../docs/Plan.md)。

`tools/coverage.mjs` 从AST调用点按host/client/shared分端计数，规则命中与默认影响、类别发现分列。**knownExtractionArtifacts只保留历史反例，不过滤现在的真实调用**；纯客户端规则不用于宿主同名方法。probe须为现代格式并绑定本目标/版本/时间，不能借别的profile的面。写库存要求显式或观测到的合法semver版本，非法版本退出3且不覆盖旧文件。

```bash
node tools/coverage.mjs --nm <node_modules目录> --dsh-version <已核验版本> --json
node tools/coverage.mjs --nm <node_modules目录> --probe <同目标的现代probe> --write --json
# 默认拒绝将不完整扫描写成库存；审查diagnostics后方可显式接受部分样本
node tools/coverage.mjs --nm <node_modules目录> --dsh-version <已核验版本> --write --allow-partial --json
```

仓库保存的库存是2026-10-15的desktop21插件样本，DSH0.2.0-rc.2，静态catalogue模式，不借用规则复核的私有web探针。扫描受默认字节预算和缺失CSS入口限制，明确为partial：50个有调用服务、125个分端方法对，其中88个有对应规则（host69/79、client19/46）。这些是本次读到的部分集合，不是完整覆盖率或准确率；同名方法不同端分别计数，不能直接和下面旧口径61%比较。sourceDigest记录规范化AST分析摘要，不承诺所有包字节的完整性。历史Python参考不是AST真值。

2026-10-15规则复核：attachments.readImage由官方实现和真实描述符互证，保留仅该读取路径的影响；sessions.open保留明确的客户端旧回退语义；删除sessions.getSnapshot、settings.get及sessions.map的无依据影响条目；sessions.refresh有守卫且无足够语义证据，不新增规则。客户端运行时未采样，不宣称对应API已被删除。

## 维护原则

按端侧与调用语义审查同名API，不能把宿主settings/jobs等同于客户端服务。degraded须有具体降级/回退依据，logger诊断影响不能外推全部业务无害；影响未知时保留默认档，新疑问写入needsReview并注明来源，不凭历史“故意没填”永久排除。

## 历史记录

2026-10-11旧提取器的覆盖率表、旧命令、方法依据和反例登记保留在提交`08b90e4`的本文件，不再与现行规则并列维护。旧阶段曾按knownExtractionArtifacts排除提取产物；当前仅保留反例记录，不自动过滤真实调用。2026-10-15库存仍是有完整性限制的历史样本，不用于计算当前生态准确率。更新规则以源码、合格观测与独立行为回归为准。
