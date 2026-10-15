# 后续开发与验收条件

评估基准：0.1.1本地候选及2026-10-15文档核验。重构已完成，下面是尚需开发或验收的工作，不表示已经实现，也不自动授权真实安装、远端推送或npm发布。

| 优先级 | 工作 | 完成条件 |
|---|---|---|
| P0 发版前 | 真实DSH安装、启动和宿主功能验收 | 在自己创建的私有DSH_HOME与临时profile，从实际tgz安装；记录DSH/Node/OS版本；验证compat_check、当前与其它profile、FAILED/PENDING、错误无法判定、skills.list/get、第二次基线差分；验证0/1/2/3及清理无残留 |
| P0 发版前 | 真实Chrome到货与界面验收 | 用当前CDP pipe路径运行开发工具；正常和故意破坏客户端两例都生效；人工确认面板、插件详情角标及错误状态；网络到货与业务交互分别记录 |
| P1 度量可信度 | 适配旧辅助度量工具并隔离真值 | tools/labels.mjs仍固定DSH0.2.0-rc.2，且将LOADING归为未运行，和当前verdict语义不同；使用同一probe.entries参与判定又作为标签会发生循环验证。需要将独立loader标签和预测输入分离，统一状态/版本，并添加受控反例。Python parity只留历史比较，不能要求AST与旧正则结果相等 |
| P1 规则质量 | 复核severity.needsReview与刷新历史inventory | 在明确DSH版本、profile、probe身份下逐条核对sessions.open/getSnapshot/refresh、settings.get、attachments.readImage等；区分源码归属与服务实际方法；只以证据更新规则、影响文案、夹具及回归，不把历史coverage数字当现状 |
| P1 契约稳定 | 固化报告结构与消费者一致性 | 为observation/coverage/finding/baseline建立可校验schema或类型契约，覆盖CLI JSON、HTTP、model tool和面板；旧格式兼容策略和错误码有文档及回归，避免字段增加后某个通道丢证据 |
| P2 分析能力 | 以真实误报/漏报推进AST支持 | 对动态属性、工厂/代理、跨模块别名与函数调用建立有界反例队列；每次先复现再修复，并量化精确归属/覆盖变化，不以“疑似比例降低”代替正确性 |
| P2 工程验证 | 补齐平台和资源验证 | 真跑Linux CI并记录结果；Windows仅在获得实际环境后验收进程清理/路径/安装器，验证前不宣称已兼容。增加大包、超时、内存压力及并发基线的性能基准，保持宿主响应 |
| 发布阶段 | 同步公开源码与npm候选 | 完成上述发版验收后，经授权推送/合并并发布；移除候选README中的未发布措辞，核验registry版本、README、依赖、tarball、简介与标签，再更新公开状态快照 |

建议顺序：先完成两项P0；然后处理辅助度量和规则复核，再扩展语法覆盖或新UI。当前主要缺口是实际安装后的证据链与可信度量，继续大规模拆文件的收益较低。

本轮只做文档纠错和检查器修正，没有运行这里的真实DSH/Chrome验收，也没有开始上述产品开发。已完成内容与测试记录见 [重构记录](refactor-results.md)、[本轮文档核验](documentation-review.md)。
