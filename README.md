# dsh-plugin-compat-check

检查**已安装的 DSH 插件**与目标 DSH 版本的兼容性，提供源码位置、依据和覆盖限制。声明放行、激活成功不等于业务功能正常。

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 版本与入口

npm `latest` 为 **0.1.4**，支持 Node `^22.19.0 || >=24`。本次补丁包含激活前提说明、Origin 有效端口校验、npm 子目录元数据及仓库工程诊断。发布、验证与后续工作见 [Plan](docs/Plan.md)。

| 入口 | 用途 |
|---|---|
| npm 插件 | 兼容性标签、插件详情发现/角标、`compat_check` 工具与 skill provider |
| 仓库 CLI | 检查已装插件，读取已有探针或显式启动临时宿主 |
| 仓库安装检查 | 在临时 profile 中安装、启动并检查一个安装规格 |
| skill | 指导 agent 使用同一工具或 CLI；[交付说明](skill/README.md) |

三种形态共享判定内核，只有相同输入和观测证据才应得到相同结果。npm 包**没有 CLI bin**，不支持 `npx dsh-plugin-compat-check`。

## 界面示例

记录的详情页截图，仅展示报告呈现，不是完整兼容认证：

![部分可用：源码位置、影响与依据](plugin/assets/compat-detail-partial.png)
![声明冲突：区分工具推断与宿主提示](plugin/assets/compat-detail-declared.png)

## 快速开始

### 插件

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.2 入口：**更多 → 设置 → 内置插件 → 兼容性**。agent 可调用 `compat_check`。请选择实际 profile，不默认使用 desktop。

当前源码（尚未发布）增加：插件搜索、组合筛选、折叠发现、完整故障报告预览/复制，以及基于既有差分的“本次新增风险”视图。各发现提供“下一步核实”；报告保留确定性、影响依据和覆盖限制，复制前请预览敏感信息。源码构建安装及验收见 [Plan](docs/Plan.md#57-核实步骤与面板体验验收)。

当前源码另提供独立的“升级前兼容性预检”：在兼容性页输入“目标 DSH 版本”，点击“运行升级预检”；agent 可调用 `compat_check({"upgradeTo":"0.2.1-rc.2"})`，需要时另指定实际 `profile`。宿主版本自动作为当前版本；预检与普通体检报告分开展示，不复用普通报告的观测、缓存或基线。此源码增量尚未发布，使用前须按下述说明构建完整 tgz。

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
| `--nm <dir>` | 必需；接受 profile 或 node_modules 目录 |
| `--probe <json>` / `--probe-boot` | 读取已有观测，或显式启动临时宿主；同时给时文件优先 |
| `--dsh-version <v>` | 声明判断与目录选择的目标版本，显式值优先 |
| `--json` / `--quiet` | 完整 JSON / 仅总结行 |
| `--no-baseline` / `--dry-run` | 禁止基线读写 / 只比较不写入 |
| `--baseline-file <path>` | 指定基线文件 |
| `--issue-report` | 默认脱敏 Markdown；不读写基线，与 json/quiet 互斥 |
| `--rules <json>` / `--catalog <json>` | 覆盖规则 / API 目录 |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | 启动等待默认40秒 / 将探针证据留至显式私有目录 |
| `--help` / `--version` | 完整帮助 / 工具版本，无需目标目录 |

`--issue-report` 输出仍保留插件名与包内相对路径，分享前须预览；原始日志、探针和基线不导出，不自动发帖。私有现场和工程诊断也不能直接当作可分享报告。

### 升级前兼容性预检（当前源码）

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json
```

此模式必须显式提供当前精确版本（`--dsh-version`）和目标精确版本（`--upgrade-to`）；省略 `--json` 可读普通文本。两端目前仅支持有明确 API 目录的 **0.2.0-rc.2、0.2.1-rc.2**。未知版本或版本范围返回 `status=unsupported-version`、退出3并提示未认证，不回退到邻近目录。npm 插件包没有 CLI，CLI 仍从仓库运行。

预检对同一组已装插件的私有字节副本联合静态提取一次，再按两个版本的目录及声明策略独立判定；报告包含制品 SHA-256、两端目录文件/来源/摘要、当前与目标报告、差异及覆盖限制。它不执行插件、不安装或升级宿主，不读取旁置/环境探针、运行时面、profile 豁免、缓存或基线，也不写产品状态。捕获输入有预算并作两次一致性观察，不是 OS 原子快照。

预检退出码专指**新增/变重风险**：0=没有新增或变重，1=存在非致命新增/变重，2=含致命新增/变重，3=预检不可用。已有问题可能不变，目标完整结论另见 `targetReport`；**退出0不等于目标可用或升级后业务通过**。保留 certainty/impactBasis、coverage/vacuous、扫描不完整及客户端待验证信息。此模式拒绝探针/启动、规则/目录覆盖、基线文件、dry-run、quiet 和故障报告参数；可带无操作的 `--no-baseline`。契约与复现见 [Plan §2.7](docs/Plan.md#27-升级前静态预检契约)、[§5.8](docs/Plan.md#58-升级前预检验收与复现)。

### 固定样本静态批量检查（仓库工具）

```bash
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json > batch.json
node tools/static-batch.mjs --manifest test/fixtures/static-batch.json --previous batch.json > next.json
node tools/static-batch.mjs --hash <本地包目录>
```

清单锁定包名、精确版本及完整文件树 SHA-256；先校验私有副本，再用同一内核独立扫描。最多16项、每项10秒、整批60秒，不装包、不执行目标、不读探针或基线。退出0/1/2保留静态结论，3表示清单、哈希、预算或工具错误；自带合成队列预期退出2。所有结果标记“待作者复核”，保留覆盖有限、空洞结论和扫描不完整信息，不能当作业务认证。增量比较始终重新扫描；制品、工具源码、规则、目录、目标版本或预算变化时不比较。分享 JSON 前须预览。

清单格式、指纹算法及权限/成本取舍见 [Plan §2.5](docs/Plan.md#25-有限静态批量契约)。手动 Action [static-batch.yml](.github/workflows/static-batch.yml)仅扫描仓库内固定公开样本，仓库权限只读；当前未部署远程端点或结果缓存，也不随 npm 插件分发。

### 安装检查与独立 skill

```bash
node bin/check-install.mjs <spec> --json
./dsh-plugin-compat-check.sh <spec> --json
./dsh-plugin-compat-check.sh --install-skill
```

安装检查需要 Node、DSH、pnpm；接受 DSH 支持的 npm/GitHub/git/file 规格，支持 `--keep`、`--timeout`（默认30秒）。安装可能联网，并会启动宿主、执行目标插件，**临时 profile 不是 OS 沙箱**。独立 skill 已存在时需 `--force` 才覆盖，位置见 [skill 说明](skill/README.md)。

仓库根是 private 开发工作区，不是可激活的插件包。测试源码请先打完整 tgz，再让 DSH 安装；不要将根 GitHub spec 或裸 `plugin/` 复制等同于完整产物。[源码打包方法](plugin/README.md#从源码构建安装)。

## 理解结果与边界

普通 CLI/Node 安装检查退出码：**0** 未发现问题、**1** 部分可用或未知、**2** 不兼容或安装 peer 闸门拒绝、**3** 输入/执行错误，无法判定。升级预检采用上文的差异退出码。shell 进入 Node 前仍有用法/内核错误码；自动化使用 Node 入口并检查 `status`。

- 始终转述 `certainty`、`impactBasis`、`coverage` 和 `vacuous`；未知、未采样和省略键不等于缺失，目录不是运行时面。客户端功能须另验收。
- 默认静态 CLI 不启动 DSH、不安装目标包；宿主体检不调用外部命令或联网，使用有预算的分析 worker。默认会写自身基线，一次性检查加 `--no-baseline`。
- 方法级分析基于有界 Babel AST/包内值流，动态行为仍有限；声明与 API 风险不保证业务行为。现代观测须匹配 profile、版本和时效，不能借用另一 profile 的证据。
- 自 0.1.3 起支持新版 DSH 声明规则、精确兼容豁免及 rc.2 目录；未来 DSH 版本未经认证。已有 macOS/Linux 的限定验证，Windows 待真实验收。[完整契约与限制](docs/Plan.md#2-现行判定与集成契约)。

## 开发与文档

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

默认套件不启动真实 DSH/模型；打包回归使用私有空缓存安装，需要 npm registry。`doc-check` 不递归跑测试；元数据核验需要 gh/npm 和联网，未发布 README 差异为 notice，取数失败不是通过。发布前检查本身不发布版本。

[Plan：契约、验证与待办](docs/Plan.md) · [current-state.json：计数与证据](docs/current-state.json) · [规则](rules/README.md) · [skill](skill/README.md)。工程诊断、独立业务度量及显式模型测试的命令与权限见 [复现指南](docs/Plan.md#5-验证记录与复现)，这些开发工具不随 npm 插件分发。

项目已收录于：

- [Awesome DSH Plugin（主目录）](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
- [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)
- [dsh.works 插件目录](https://github.com/dshworks/awesome-dsh-plugins)
- [Bruce 的 Awesome DSH Plugins](https://github.com/bruc3van/awesome-dsh-plugin)
- [1024 生态目录](https://github.com/imsai-sh/awesome-deepseek-harness-plugins)（[1024 Store](https://deepseek1024.com) 展示）

收录不等于兼容性认证；1024 Store 的 npm 安装方式仍待上游修复，状态见 [Plan](docs/Plan.md)。[MIT License](LICENSE)。

固定真实插件故障回归仅用于仓库开发，默认两轮，需真实DSH/Chrome和联网安装：

```bash
node tools/real-regression.mjs --live --out-dir <空证据目录>
node tools/real-regression.mjs --replay <证据根目录>
```

绿色表示固定正常/故障/恢复重现，仍保留分模式FP/FN；范围和资源预算见 [Plan](docs/Plan.md#56-真实插件故障回归验收与复现)。
