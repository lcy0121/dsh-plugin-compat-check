# dsh-plugin-compat-check

如果你觉得这个项目有用或有趣，欢迎点个 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check) 支持一下！

检查**已安装的 DSH 插件**与目标 DSH 版本的兼容性，提供源码位置、依据及覆盖限制。声明放行、激活成功不等于业务功能正常。

[简体中文](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.md) | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.ko.md)

**0.1.5** · Node `^22.19.0 || >=24`。提供兼容性标签、插件详情发现/角标、`compat_check` 对话工具和 skill provider。发布与验收记录见 [Plan](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md)。

![插件详情：部分可用、源码位置、影响与依据](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

## 安装与使用

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2：**更多 → 设置 → 内置插件 → 兼容性**。请选择实际 profile，不默认使用 desktop；agent 可调用 `compat_check`。

0.1.5 提供搜索/组合筛选、折叠发现、完整报告预览/显式复制、基线新增风险及“下一步核实”。安装/loader 事件和5秒巡检触发后台刷新，保留筛选与旧报告，失败显示原因。报告显示目标、参考目录版本/摘要和验收范围；重复插件身份无法判定且不推进基线。绑定探针超过5分钟的未来时钟偏差会被拒绝，保留静态发现及原因。分享前须预览敏感信息，筛选不会删减完整报告。

依赖关系区分host/client、必需/可选/子作用域；提供声明仅为候选，路径/环不证明实际故障。人工复核记录单独保存，身份变化后待重审，不隐藏发现或覆盖判定、基线及豁免。健康面板**只导入历史 JSON**，不运行检查，历史通过不证明当前制品正常。步骤见 [使用指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md)。

## 升级前兼容性预检

在面板输入目标 DSH 版本后运行，或调用 `compat_check({"upgradeTo":"0.2.1-rc.2"})`，需要时指定实际 `profile`；当前版本取自运行中的宿主。结果放在独立 `upgradePreview`，不覆盖普通 `report`。

当前/目标两端仅支持精确 **0.2.0-rc.2、0.2.1-rc.2**。未知版本或范围返回 `status=unsupported-version`、退出3，不回退到邻近目录。对同一组插件私有字节副本静态提取，再按两端目录/声明独立判定，保留制品哈希、目录来源/摘要、当前/目标报告、差异和覆盖限制。worker有预算、卸载取消与清理，失败明确报错；不是 OS 原子快照。

预检不执行插件或安装/升级宿主，不读运行时、探针、profile豁免、普通缓存/基线，不写产品状态。结果码 **0/1/2** 仅表示无新增/变重风险、非致命新增/变重、含致命新增/变重；**3** 为不可用。目标已有问题仍见 `targetReport`；**0不代表目标可用或升级后业务通过**，客户端功能需另验收。[契约及复现](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md#27-升级前静态预检契约)。

## 从源码构建安装

仓库根是 private 开发工作区，不是可激活的插件包。在根安装依赖，再打完整 tgz：

```bash
npm ci --ignore-scripts
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack 同步权威 skill/报告契约，暂存共享 kernel、LICENSE 和第三方说明，postpack 清理 kernel。根 GitHub spec、裸 `plugin/` 复制和源码 file 安装不能代替完整 tgz。

npm 包**没有 CLI bin、安装检查 shell 或 probe 入口**，不支持 `npx dsh-plugin-compat-check`。CLI、安装检查、静态批量、作者CI、健康执行器及真实插件/浏览器/模型回归仅在[仓库](https://github.com/lcy0121/dsh-plugin-compat-check#readme)使用，不随 npm 分发。

安装检查会联网、启动宿主并执行目标；临时 profile 不是 OS 沙箱。健康执行器默认审阅，须显式 `--run` 及当次授权才执行目标命令，也不是 OS 沙箱。风险/覆盖门禁、JSON/SARIF/JUnit和版本矩阵见[作者CI](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/author-ci.md)。

## 判定与边界

- 当前 profile 只采样服务描述符，不执行 getter，结合可靠映射且启用的 loader FAILED/PENDING。其它 profile 仅用静态证据，不借用当前宿主服务；未知、未采样或省略键不等于缺失。
- Babel AST/包内值流在有时间/内存限额的 worker 中分析，不执行目标源码，动态覆盖仍有限。必需 inject 激活障碍与方法失效分别判断。
- 保留 `certainty`、`impactBasis`、`coverage`、`vacuous`。API 发现通常有 `file:line`，声明/loader事实可能无位置；无发现不证明业务正常。
- 声明规则与精确版本豁免依据目标 DSH 判定；非法字段不可豁免。普通检查的未知/未来版本回退及自定义目录保持未认证提示，内置目录摘要不符则无法判定。升级预检严格限定上述两个版本。[目录治理](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/maintaining.md#api目录候选审查)须经来源核验、差分、规则复核及真实验收。
- 宿主体检不装包、不调用外部命令或联网，默认写自身隔离基线；不完整扫描不推进。普通检查需禁基线读写时使用仓库 CLI 的 `--no-baseline`；升级预检始终隔离基线。
- 报告保留完整发现、覆盖、观测与基线；面板拒绝损坏/不支持版本的负载。旧 probe 提示未绑定，旧基线中性重建。

已有 macOS/Linux 限定验证，Windows 待真实验收；固定样本不是生态准确率或完整业务/模型质量认证。[计数与证据](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/current-state.json) · [完整契约](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md#2-现行判定与集成契约) · [源码及问题反馈](https://github.com/lcy0121/dsh-plugin-compat-check)。

## License

[MIT](LICENSE) · 第三方依赖及许可证见包内 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
