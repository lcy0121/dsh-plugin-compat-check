# dsh-plugin-compat-check

检查**已经安装的 DSH 插件**与当前 DSH 版本的兼容性，提供源码位置、运行时证据与覆盖限制。包含兼容性标签、插件详情发现/角标、`compat_check` 对话工具和 skill provider。

![插件详情页：部分可用，含 file:line、影响与依据](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

本说明对应 **0.1.4**，支持 Node `^22.19.0 || >=24`。公开版本及 latest 以 [npm](https://www.npmjs.com/package/dsh-plugin-compat-check) 为准，发布和验收记录见 [Plan](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md)。

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2 入口：**更多 → 设置 → 内置插件 → 兼容性**。agent 可调用 `compat_check`；请选择实际 profile，不默认使用 desktop。

0.1.4 补充必需 inject 未观测时的激活前提说明，修正 Origin 校验以比较协议、主机和有效端口（保留本机无 Origin 调用），并提供 `repository.directory=plugin`。仓库另增强了进程回收、Chrome 启动诊断及 Linux CI；浏览器开发工具不随 npm 插件交付。市场显示名与 1024 Store 采集问题须由相应上游修复，不因本包升级自动解决。

## 从源码构建安装

仓库根是 private 开发工作区，不是可激活的插件包。先在根运行 `npm ci --ignore-scripts`，然后：

```bash
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack 同步权威 skill/报告契约，暂存共享 kernel 和 MIT LICENSE，postpack 清理 kernel。运行时依赖固定为 `@babel/parser@7.29.9`、`semver@7.7.3`。不要将根 GitHub spec、裸 `plugin/` 复制或源码 file 安装等同完整 tgz。

npm 产物**没有 CLI bin、安装检查 shell 或 probe 入口**，不支持 `npx dsh-plugin-compat-check`，本面板不做安装前检查。这些入口及 `--issue-report` 默认脱敏 Markdown 导出从[仓库](https://github.com/lcy0121/dsh-plugin-compat-check#readme)使用。显式安装检查会联网、启动宿主并执行目标插件；临时 profile 不是 OS 沙箱。

## 判定与边界

- 当前 profile 在宿主进程内采样服务描述符，不执行 getter，纳入可靠映射且启用的 loader FAILED/PENDING。其它 profile 仅用静态证据，不借用当前宿主服务；未知、未采样或省略键不等于缺失。
- Babel AST 扫描不执行目标源码，分析运行在有时间/内存上限的 worker 中；有界包内值流支持部分别名、参数/返回值和透明 Proxy，动态行为仍有限。必需 inject 的激活障碍与方法失效分别判断。
- 转述保留 `certainty`、`impactBasis`、`coverage` 和 `vacuous`。API 发现通常有 `file:line`，loader/声明事实可能无位置；声明放行、激活成功、条目到货和 ok 均不证明业务正常，客户端功能须另验收。
- 从 DSH 0.2.1-rc.1 起优先自有 `engines.dsh`，缺失才回退官方 peer，旧目标保留旧规则。声明冲突/非法字段是推断风险，不冒充实际加载失败。只读独立 `compatibility.json`，按插件名、插件精确版本、DSH 精确版本匹配豁免；无效/不可读/超64KiB保留限制，不自动授予，非法字段不可豁免。
- DSH≥0.2.1-rc.2 用新目录（host98/client8），其余/未知用旧0.2.0-rc.2目录（host91/client8）；未来 DSH 未认证。rc.2 的真实 Chrome 验收覆盖导航、报告渲染、禁用后路由移除及重启用后恢复/标签唯一；不认证所有插件业务。
- 体检不装包、不调用外部命令或联网；默认写自身 schema2 基线：`$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`。模式隔离、锁内比较、原子替换，不完整扫描不推进。完全禁基线读写须用仓库 CLI 的 `--no-baseline`。
- HTTP envelope.report 和 `compat_check.report` 保留完整发现、覆盖、观测和基线，原 summary/text 保留；新面板拒绝损坏或不支持版本的负载。旧 probe 提示未绑定，旧 schema1 基线中性重建，不兼容报告变更须升 schema。

限定 macOS/Linux、真实 DSH/Chrome、独立 tgz 和工程验收的逐次版本及证据见 [current-state.json](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/current-state.json)。Windows 待真实验收。独立业务/模型度量属于仓库开发工具，不随 npm 分发、不进入产品判定，默认测试/CI不调用模型；固定样本不是生态准确率或完整模型质量认证。

[完整契约与复现](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md#2-现行判定与集成契约) · [源码及问题反馈](https://github.com/lcy0121/dsh-plugin-compat-check) · [MIT License](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/LICENSE)
