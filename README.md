# dsh-plugin-compat-check

如果你觉得这个项目有用或有趣，欢迎点个 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check) 支持一下！

检查**已安装的 DSH 插件**与目标 DSH 版本的兼容性，提供源码位置、依据和覆盖限制。声明放行、激活成功不等于业务功能正常。

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 版本与入口

**0.1.5** · Node `^22.19.0 || >=24`。npm 插件提供兼容性标签、插件详情发现/角标、`compat_check` 与 skill provider；仓库提供 CLI、安装检查和开发工具，共享判定内核。npm 包**没有 CLI bin**，不支持 `npx dsh-plugin-compat-check`。发布、验证及后续工作见 [Plan](docs/Plan.md)。

## 界面示例

记录的详情页仅展示报告呈现，不是完整兼容认证：

![部分可用：源码位置、影响与依据](plugin/assets/compat-detail-partial.png)
![声明冲突：区分工具推断与宿主提示](plugin/assets/compat-detail-declared.png)

## 快速开始

### 插件

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2：**更多 → 设置 → 内置插件 → 兼容性**。请选择实际 profile，不默认使用 desktop；agent 可调用 `compat_check`。

0.1.5 提供搜索/组合筛选、折叠发现、完整报告预览/复制、基线新增风险和“下一步核实”。安装/loader 事件与5秒巡检触发缓存刷新，保留筛选和旧报告，失败显示原因。普通报告显示目标、目录版本/摘要和验收范围；重复插件身份明确无法判定，不推进基线。绑定探针超过5分钟的未来时钟偏差会被拒绝，保留静态发现及原因。

依赖关系展示端侧、必需/可选/子作用域；提供声明仅为候选，路径和环不证明实际故障。人工复核记录单独保存，身份变化后待重审，不隐藏发现或改变判定、基线及豁免。健康面板**只导入历史 JSON**，不执行检查，历史通过不能证明当前制品正常。操作与限制见 [使用指南](docs/guide.md)。

### 仓库 CLI

```bash
git clone https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| 选项 | 作用 |
|---|---|
| `--nm <dir>` | 必需；profile 或 node_modules 目录 |
| `--dsh-version <v>` | 普通检查的目标版本，显式值优先 |
| `--probe <json>` / `--probe-boot` | 读已有观测 / 显式启动临时宿主；同时给时文件优先 |
| `--json` / `--quiet` | 完整 JSON / 总结行 |
| `--no-baseline` / `--dry-run` | 禁止基线读写 / 只比较不写 |
| `--baseline-file <path>` | 指定基线文件 |
| `--issue-report` | 默认脱敏 Markdown；不读写基线，与 json/quiet 互斥 |
| `--rules <json>` / `--catalog <json>` | 覆盖规则 / API 目录 |
| `--help` / `--version` | 完整帮助 / 工具版本，无需目标目录 |

分享前预览报告：脱敏后仍有插件名和包内路径，不包含原始日志/探针/基线，不自动发帖。探针预算及其它选项见 `--help`。

### 升级前兼容性预检

面板输入目标版本后运行；agent 调用 `compat_check({"upgradeTo":"0.2.1-rc.2"})`，当前版本由宿主解析。仓库 CLI 必须明确提供当前和目标精确版本：

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
```

两端仅支持 **0.2.0-rc.2、0.2.1-rc.2**；未知版本或范围返回 `status=unsupported-version`、退出3，不回退目录。对同一组插件私有字节副本静态提取，分别按两端目录/声明判定，保留制品哈希、目录来源/摘要、两端报告、差异与覆盖限制。受控 worker 有预算及清理，不是 OS 原子快照。

预检不执行插件或安装/升级宿主，不使用运行时、探针、profile 豁免、普通缓存或基线，不写产品状态。退出码 **0/1/2** 只表示无新增/变重风险、非致命新增/变重、含致命新增/变重；**3** 表示不可用。目标已有问题仍见 `targetReport`，**退出0不等于目标可用或升级后业务通过**。完整参数约束见 [预检契约](docs/Plan.md#27-升级前静态预检契约)。

### 仓库工作流

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh --install-skill
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
```

安装检查需要 Node、DSH、pnpm，支持 npm/GitHub/git/file spec、`--keep` 和 `--timeout`（默认30秒）；会联网、启动宿主并执行插件，**临时 profile 不是 OS 沙箱**。独立 skill 已存在时用 `--force` 覆盖，见 [skill](skill/README.md)。

静态批量清单锁定版本/文件树哈希，最多16项、每项10秒、整批60秒；不安装或执行目标，不读探针/基线。结果待作者复核，不是业务认证；样例预期退出2。作者 CI 提供风险/覆盖门禁、JSON/SARIF/JUnit 和版本矩阵；健康执行器默认审阅，必须显式 `--run` 及当次授权才执行目标命令，**不是 OS 沙箱**。这些工具及真实插件/浏览器/模型回归仅属仓库，不随 npm 分发。步骤与限额见 [指南](docs/guide.md)、[作者 CI](docs/author-ci.md)、[维护说明](docs/maintaining.md)。

仓库根是 private 开发工作区，不是可激活的插件包。源码安装须打完整 tgz，不能用根 GitHub spec 或裸 `plugin/` 复制代替；见 [源码打包](plugin/README.md#从源码构建安装)。

## 理解结果与边界

普通 CLI/Node 安装检查退出码：**0** 未发现问题、**1** 部分可用或未知、**2** 不兼容或 peer 闸门拒绝、**3** 输入/执行错误。升级预检采用上述差异退出码；自动化使用 Node 入口并检查 `status`。

- 保留 `certainty`、`impactBasis`、`coverage`、`vacuous`；未知、未采样或省略键不等于缺失，目录不是运行时面，客户端业务需另验收。
- 默认静态 CLI 不启动 DSH、不装目标包；宿主体检不调用外部命令或联网，分析 worker 有预算。普通检查默认写自身基线，一次性检查加 `--no-baseline`，扫描不完整不推进。
- 有界 Babel AST/包内值流不执行目标源码，动态行为覆盖有限。现代观测须匹配 profile、版本和时效，不能跨 profile 借用证据。
- 普通检查支持 DSH 声明策略及精确兼容豁免；未知/未来版本和自定义目录提示未认证。已有 macOS/Linux 限定验证，Windows 待真实验收。详见 [完整契约](docs/Plan.md#2-现行判定与集成契约)。

## 开发与文档

```bash
npm test
npm run format:check
node tools/doc-check.mjs
npm run notices:check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

默认套件不启动真实 DSH/模型；打包回归需要 npm registry。`doc-check` 不递归测试；元数据核验需要 gh/npm 和网络，取数失败不是通过。发布前检查本身不发布版本。

[Plan](docs/Plan.md) · [计数与证据](docs/current-state.json) · [规则](rules/README.md) · [使用指南](docs/guide.md) · [维护与目录治理](docs/maintaining.md)。生态收录及上游待办见 Plan，收录不等于兼容认证。

## License

[MIT](LICENSE) · 第三方依赖及许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
