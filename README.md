# dsh-plugin-compat-check

体检**已安装的 DSH 插件**与目标 DSH 版本的兼容性，给出源码位置、依据和证据限制。声明放行、激活成功都不能单独证明功能可用。

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 当前版本与交付

本地源码为 **0.1.1 未发布候选版**；2026-10-15联网核验，npm `latest` 为 **0.1.0**。`npm install` 或 `dsh plugin add` 不会取得本地尚未发布的修复。公开状态和差异见 [Plan中的核验记录](docs/Plan.md#1-项目定位与交付状态)，测试与文件统计见 [current-state.json](docs/current-state.json)。支持 Node `^22.19.0 || >=24`。

插件、CLI、skill三种形态共享判定内核；安装检查脚本是CLI编排入口。只有**相同输入与采样证据**才应得出相同结果。

| 入口 | 提供什么 |
|---|---|
| npm 插件 | 当前宿主采样、兼容性面板、`compat_check` 对话工具、skill provider；不能做安装前检查 |
| 仓库 CLI | 静态体检已装插件，可读已有探针；显式 `--probe-boot` 才启动临时宿主 |
| 仓库安装检查脚本 | 将安装规格装进临时 profile，检查安装、启动和兼容性 |
| skill | 教 agent 调用工具或仓库 CLI，不是另一套判定实现 |

npm 包**没有 CLI `bin`**，不支持 `npx dsh-plugin-compat-check`。默认报告列出客户端待验证项；客户端到货开发工具没有接入兼容性面板，且不认证业务功能。

## 使用

### 仓库 CLI

以下命令针对已经取得的0.1.1候选源码检出。普通克隆公开main当前仍得到旧版源码，不含新的根工作区；本地候选尚无已推送的公开ref。

```bash
cd /path/to/dsh-plugin-compat-check
npm ci --ignore-scripts

node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --probe /path/to/probe-report.json --dsh-version <version> --no-baseline --json
node bin/compat-check.mjs --help
```

`--nm` 接受 profile 或 node_modules 目录。请确认目标，不能默认所有用户都使用 desktop。没有探针时，方法级目录推断为 suspected；提供探针也不保证每条发现都是 certain，仍取决于身份、时间、完整性和源码归属。

| 选项 | 作用 |
|---|---|
| `--nm <dir>` | 要检查的目录，必需 |
| `--probe <json>` | 已有运行时观测；同时给 `--probe-boot` 时优先使用此文件 |
| `--probe-boot` | 显式复制 profile、安装探针、启动临时宿主；会执行目标插件 |
| `--probe-timeout <秒>` / `--probe-keep-dir <dir>` | 启动等待上限，默认40秒；将现场留到显式私有目录 |
| `--dsh-version <v>` | 声明判断的目标版本；显式值优先于启动采集值 |
| `--rules <json>` / `--catalog <json>` | 覆盖规则和 API 目录 |
| `--no-baseline` | 不读写基线，适合一次性检查 |
| `--baseline-file <path>` / `--dry-run` | 指定基线；只比较、不写入 |
| `--json` / `--quiet` | 一份机器可读 JSON；或仅总结行 |
| `--version` / `--help` | 版本或完整帮助，不需要目标目录 |

### 安装插件与 skill

```bash
# 安装 npm 已发布版（当前为0.1.0）
dsh plugin --profile <profile> add dsh-plugin-compat-check

# 只使用 CLI 时，安装独立 skill
./dsh-plugin-compat-check.sh --install-skill
```

插件注册兼容性面板、插件详情角标、`compat_check` 与 skill provider；2026-10-15已从实际tgz安装，在DSH0.2.0-rc.2/macOS arm64中验证工具和skill，并通过真实Chrome操作确认面板、角标及基线差分。独立 skill 安装至 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`，已有文件需 `--force` 才覆盖。

源码仓库根是私有开发工作区，**不是可直接激活的 DSH 插件包**。根目录 GitHub spec 不等同于安装 `plugin/`。测试本地候选时，在仓库根运行 `npm ci --ignore-scripts`，再在 `plugin/` 中执行 `npm pack --pack-destination <已存在的绝对输出目录>`，最后让 DSH 安装生成的 `.tgz`。打包会暂存内核和 LICENSE；不要直接复制裸 `plugin/` 并假定内核已在包内。细节见 [插件说明](plugin/README.md)。

### 安装检查

```bash
./dsh-plugin-compat-check.sh <spec> [--keep] [--timeout 秒] [--json]
# 同一 Node 安装检查入口（跨平台流程仍需验收）
node bin/check-install.mjs <spec> --json
```

需要 Node、DSH、pnpm；npm 身份查询和安装可能联网。`spec` 接受 npm、GitHub、git、file 等 DSH 支持的安装规格。流程使用唯一临时 profile 和私有现场，只清理自己启动的进程；**临时 profile 不是操作系统沙箱**。

| 选项 | 作用 |
|---|---|
| `--keep` | 保留本次 profile 与现场，读取返回路径 |
| `--timeout N` | 启动等待秒数，默认30 |
| `--json` | stdout 一份 JSON，安装进度不混入其中 |
| `--install-skill` / `--force` | shell 的独立 skill 安装与显式覆盖 |
| `--help` / `--version` | shell 的帮助和版本 |

CLI 和 Node 安装检查的结果码：

| 码 | 含义 |
|---|---|
| `0` | 没有报告问题；仍须检查 coverage、vacuous 和采样限制 |
| `1` | 至少一个插件部分可用 |
| `2` | 至少一个插件不兼容，或安装阶段明确 peer 闸门拒绝 |
| `3` | 输入、安装、网络、准备或启动出错，本次无法判定 |

shell 在进入 Node 前保留旧的用法/内核缺失错误码；调用自动化时使用上面的 Node 入口并检查结果 `status`，不能把包装层错误当插件结论。

## 如何理解证据

- 服务区分 `present`、`absent`、`unobserved`、`unreadable`；省略键是未采集，不能判成不存在。现代探针需匹配 profile、DSH版本，默认超过24小时失效；旧报告只使用明确记录的键并提示未绑定。
- `certainty` 是 `certain` 或 `suspected`，与“过滤/弃权”这种去处不同。声明能确定依赖关系，不能单独确定方法缺失。`impactBasis=inferred` 的用户影响要保留“推断，非实测”；可靠映射的 loader FAILED/PENDING 可提供实际未激活证据。
- 官方 peer 范围冲突单列 `declared-incompatible`，影响为推断；`engines.dsh` 是建议声明，不冒充宿主安装闸门。未采集精确版本豁免时不据此写 fatal。
- `coverage.status=limited`、`vacuous`、解析/读取/预算诊断、无法映射的 loader 状态都必须转述。“可用”不等于完整功能验收通过。
- 宿主、客户端、共享调用点分开处理。声明 provide 只是提供方线索，不能证明服务已激活；已确认存在服务的完整方法观测仍参与判断。

静态提取使用固定版本 Babel JS/TS AST，追踪词法绑定、逐调用位置、能力守卫及包内相对导入（含副作用导入），不执行被分析源码。支持常量计算属性、直接函数参数/返回值、包内ESM/CommonJS别名与调用、空handler的透明Proxy；只对已证明的Context/服务扩展跨函数流。未知动态键、trap、异步返回、歧义及超预算仍会限制分析，详见[Plan](docs/Plan.md#21-证据与分析边界)。扫描有文件/字节/目录/时间预算；宿主分析放在有超时和内存上限的 worker 中。

默认静态 CLI 不启动 DSH、不安装目标包；宿主插件不为体检启动外部命令或联网，但会使用分析 worker，并默认写自己的基线。schema2 基线按 canonical profile、路径哈希、模式和工具/规则/目录身份比较，位于 `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json`；锁内比较、原子替换，不完整源码扫描不推进。静态、文件探针与进程内观测分模式保存，不能强求面板与 CLI 共用一次观测。

探针通过描述符采样，不调用 getter；未知访问器保留为未知。默认不写共享诊断路径，只有显式私有 `DSC_OUT_DIR` 才输出诊断。其它 profile 查询只用静态证据，不能借用当前宿主观测。`--keep` 的现场可能有本机信息，提交前须人工检查。

## 目录结构

```text
dsh-plugin-compat-check/
├── README.md / README.en.md / README.ko.md
├── package.json / package-lock.json   # private development workspace
├── bin/                              # compat-check.mjs, check-install.mjs
├── lib/                              # shared analysis, evidence, state and runner modules
├── plugin/                           # npm plugin, client, packaging scripts and skill copy
├── probe/                            # opt-in runtime probe, staged by the owned runner
├── skill/                            # authoritative SKILL.md and delivery notes
├── rules/                            # severity rules, API catalogue and historical inventory
├── docs/                             # current contracts, verification and history
│   ├── Plan.md
│   ├── GPT审计及重构方案文档.md
│   ├── current-state.json
│   └── extraction-findings.md
├── test/                             # behavior, invariants, snapshots and artifact tests
└── tools/                            # documentation, metadata and diagnostic utilities
```

## 验证与维护

```bash
npm test
npm run format:check
node tools/doc-check.mjs
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json   # 联网，需要 gh/npm
```

`doc-check` 离线检查文档链接、版本、入口与 skill 副本；**不会自己运行测试**。记录新结果时先保存 TAP 摘要，再执行 `node tools/update-current-state.mjs --test-summary <log>` 和 `node tools/doc-check.mjs --test-summary <log>`。发布前检查只运行一次完整默认套件并复用摘要，含独立 tarball 安装后的实际宿主工具调用；该打包回归使用私有空npm缓存，需要访问npm registry，不依赖本机历史缓存。GitHub/npm 元数据检查为联网步骤；未发布候选的版本和 README 差异是 notice，取数失败不能称“全部一致”。

默认套件不启用 `DSC_SLOW=1` 集成。2026-10-15另行通过6项真实DSH/Chrome集成测试，包含正常到货、缺失客户端文件、导入抛错及运行时负向对照；环境与复现命令见 [Plan](docs/Plan.md#5-验证记录与复现)。2026-10-16已在Ubuntu24.04.5 arm64虚拟机实跑DSH0.2.0-rc.2、tgz/HTTP响应与工程资源场景；Windows按约定待验收。新增Linux CI任务尚待推送触发，旧CI结果单独保留。工程复现见[Plan](docs/Plan.md#53-p2工程验收)。历史88.3%召回和本次66/66到货均不是0.1.1功能准确率。Python parity 工具也是旧正则参考，不能把它当作 AST 实现的真值。

辅助度量使用 [Plan辅助度量记录](docs/Plan.md#51-已验证范围) 的独立loader标签；预测不读取标签。`node tools/labels.mjs --nm web --synthetic --json` 初始化私有环境并可能诚实返回漏报（exit1）；现有目标可用`--probe-boot`，文件模式须同时给`--probe`和`--labels`。数字仅覆盖第一层，不能代表生态准确率。

报告契约以 [lib/contracts.mjs](lib/contracts.mjs) 为单一真源，CLI JSON、HTTP、工具与面板保留完整证据；新字段可扩展，缺少必需字段或不支持的版本明确报工具错误。规则已按0.2.0-rc.2官方实现/运行时复核，库存为明确标记不完整的AST样本，详见 [Plan规则与契约记录](docs/Plan.md#2-现行判定与集成契约)。

[施工记录与后续计划](docs/Plan.md) · [历史审计](docs/GPT审计及重构方案文档.md) · [规则说明](rules/README.md) · [skill交付](skill/README.md)。项目已收录于 [Awesome DeepSeek Harness](https://github.com/0xsline/awesome-deepseek-harness)。

## License

[MIT](LICENSE)。
