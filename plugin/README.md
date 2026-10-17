# dsh-plugin-compat-check

检查**已经安装的 DSH 插件**与当前 DSH 版本的兼容性，提供源码位置、运行时证据与覆盖限制。包含兼容性面板、插件详情角标、`compat_check` 对话工具和 skill provider。

本文件适用于 **0.1.1**。安装指定版本：

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check@0.1.1
```

## 从源码构建安装

本仓库根为私有开发工作区，不声明DSH bundle。不要把根目录GitHub安装规格当成plugin子目录的安装方式。在仓库根运行 `npm ci --ignore-scripts`，然后：

```bash
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack复制权威skill、同步单源报告契约的宿主/客户端产物，并暂存共享kernel和MIT LICENSE，postpack清理kernel。固定运行时依赖为 `@babel/parser@7.29.9` 与 `semver@7.7.3`，支持 Node `^22.19.0 || >=24`。源码裸复制或file安装不保证prepack运行，应使用完整仓库开发布局或预打包tarball。

npm产物**不带CLI bin、安装检查shell或probe入口**。CLI和安装检查从仓库使用；本插件不能做安装前检查。仓库使用说明：[README](https://github.com/lcy0121/dsh-plugin-compat-check#readme)。0.1.1说明与发布状态请查看[开发计划与验收记录](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md)，本地路径为docs/Plan.md。

## 判定与边界

当前profile在宿主进程内采样服务描述符，不执行getter；未知访问器保留未知，并纳入能可靠映射的loader FAILED/PENDING。查询其它profile只用静态证据，不借用当前宿主服务。Babel AST扫描不执行目标源码，分析运行在有时间和内存上限的worker中；动态调用和跨函数数据流仍有限。

`certainty`为certain或suspected；过滤、守卫、弃权是独立去处。省略的probe键表示未采样，不表示服务缺失。现代观测匹配profile/DSH版本且默认24小时过期；旧报告标记未绑定。声明不能代替API实测，官方peer冲突以推断影响呈现，engines.dsh仅作建议声明。

转述时保留 `impactBasis=inferred`（影响为推断，非实测）、coverage限制和vacuous结果。API发现通常有file:line，loader/元数据发现可能没有源码位置。客户端服务列为待界面核验项；独立浏览器开发工具不属于本面板，且不验证业务交互。

插件体检不安装包、不调用外部命令或联网；会启动分析worker，并默认写自己的schema2基线：`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`。模式分离、锁内比较、原子替换；源码扫描不完整不推进基线。默认不输出共享loader诊断；诊断需显式私有DSC_OUT_DIR。若需完全禁止基线读写，请使用仓库CLI的 `--no-baseline`。

0.1.1的分阶段证据包括默认回归、独立tarball执行及2026-10-15的真实DSH0.2.0-rc.2/macOS arm64验收：工具、skill、面板、详情角标、基线及Chrome正负向对照。2026-10-16另在Ubuntu24.04.5 arm64 VM通过Node22.19.0/24.21.0、真实DSH/tgz/HTTP及资源边界验收。同日提交38fa4a0的[GitHub Actions](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/38892527900)在Ubuntu x64通过Node22/24资源检查及联合18项检查（4项真实DSH、1项冻结pnpm安装、13项离线）。后续main提交49403d7的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/38923778251)再次通过Node22/24发布前与资源检查、Linux真实集成。Windows按约定待验收；skill正文修订后的仓库验证不冒充旧现场正文验收。具体测试数量与证据见仓库docs/current-state.json、docs/Plan.md；不把历史测试数字作为当前版本的完整功能认证。

报告结构由仓库lib/contracts.mjs校验：HTTP envelope.report与compat_check.report均保留完整发现、覆盖、观测和基线；工具原summary/text字段保留。新面板拒绝损坏或不支持版本的负载，提示刷新和对齐版本。旧probe保持未绑定警告，旧schema1基线中性重建；内核现支持有界常量属性、函数参数/返回值、包内模块别名及透明Proxy；未知动态行为与超预算继续显示覆盖限制。具体字段与错误码见 [Plan契约记录](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md#23-报告结构与兼容策略)。

## License

MIT。源码、问题反馈与仓库文档：[GitHub](https://github.com/lcy0121/dsh-plugin-compat-check)。
