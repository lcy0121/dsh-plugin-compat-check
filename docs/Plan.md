# 开发计划与维护约定

更新于2026-10-17。当前发布版0.1.2，判定算法与0.1.1一致；规则/API目录仍以DSH0.2.0-rc.2为基准。本文只维护现行契约、交付边界与待办；用法见[README](../README.md)，逐次证据见[docs/current-state.json](current-state.json)。[原始审计](GPT审计及重构方案文档.md)与[旧提取器反例](extraction-findings.md)保留历史身份，施工过程查Git历史。

## 1. 项目定位与交付状态

检查**已安装DSH插件与目标DSH版本的兼容性**，呈现依据、源码位置及覆盖限制；声明放行、激活成功、客户端到货均不单独证明业务功能正常。

| 入口 | 职责与副作用 |
|---|---|
| npm插件 | 当前宿主观测、插件详情发现/角标、tool与skill；另声明兼容性标签，但rc.2有未显示记录。体检不联网、不装包、不启动外部命令；使用分析worker并写自身基线 |
| 仓库CLI / 安装检查 | 默认静态扫描不执行目标源码；显式probe/安装检查会装依赖、启动宿主并执行目标插件。临时profile不是OS沙箱 |
| skill | 指导agent调用同一工具或CLI，不另实现判定 |

npm latest=0.1.2，2026-10-17已回下载验收，发布事实见`verification.documentationDelivery012`；[PR #3](https://github.com/lcy0121/dsh-plugin-compat-check/pull/3)交付文档补丁，[PR #4](https://github.com/lcy0121/dsh-plugin-compat-check/pull/4)交付回归输入隔离。**本轮rc.2说明、skill及截图等源码文档修订尚未进入已发布tarball**，不能把本地修改当作npm页面或安装包已更新。

版本真源为`lib/version.mjs`。仓库根是private开发工作区，npm仅打包`plugin/`，没有CLI bin、安装shell或probe入口；不支持`npx dsh-plugin-compat-check`。prepack同步skill/契约、暂存kernel与LICENSE，postpack清理kernel；安装完整tgz，不假定裸`plugin/`含内核。市场截图声明位于`plugin/screenshots.json`，图片在`plugin/assets/`；当前npm files未收录二者，README使用GitHub图片链接。

## 2. 现行判定与集成契约

### 2.1 证据与分析边界

- Babel JS/TS AST、包内源码图、词法绑定及逐调用span区分Context与同名猜测；host/client/shared分端，静态、文件probe、进程内观测分模式。其它profile不能借用当前宿主服务。
- 服务为`present / absent / unobserved / unreadable`；省略键、目录缺项或未知getter不等于不存在。现代probe绑定profile/DSH版本/时间，默认24小时过期；旧报告提示未绑定，仅用明确键；采样不执行getter。
- 支持有界常量键/解构、同步参数与返回值、闭包/对象工厂、包内ESM/CommonJS别名及调用、空handler透明Proxy。变更/遮蔽/逃逸会撤回证明；未知键、trap、异步、递归、复杂控制流和default/rest参数保守合并或弃权。
- 上限：256次相关调用、16层调用、32层导出链、64节点闭包图、128节点逃逸图、512次常量调用、8192字符展开，另有扫描文件/字节/目录/时间预算。超限、解析或读取诊断限制覆盖，不以加预算或删调用点求干净。

### 2.2 结论、影响与基线

- `certain / suspected`表达确定性，过滤/守卫/弃权另列；`impactBasis=measured / inferred`区分实测与推断，缺少字段不能反推实测。API发现通常有`file:line`，声明/loader事实可无源码位置，不编造。
- 可可靠映射且启用的loader FAILED/PENDING可形成fatal实测发现；disabled、LOADING、group或无法映射项不冒充该事实。当前官方peer冲突为`declared-incompatible`及推断影响，engines.dsh仍按旧版作建议处理；rc.1/rc.2已优先使用该字段，现有声明判定存在误报/漏报，不能等同实际加载结果。
- 方法layer优先、服务layer回退，不跨端套规则；provide仅为提供方线索，未知方法影响写“影响面未知”。`try/catch`不是能力守卫；`coverage.status=limited`、vacuous及客户端未验证须转述，ok不等于功能认证。
- schema2基线按canonical profile/路径/模式及工具、规则、目录身份隔离；锁内比较、原子写入，不完整扫描不推进。身份升级记中性，严重度/确定性/位置参与差分；schema1或损坏条目不比较。“无变化”不等于兼容。

### 2.3 报告结构与兼容策略

`lib/contracts.mjs`是运行时/JSDoc真源；CLI为`schemaVersion:1 / kind:plugin-compat-check/result`，HTTP为`kind:plugin-compat-check/report`的envelope，tool保留summary/text及完整report/baseline/cache。必需字段、摘要/严重度/退出码/span/身份须自洽；面板拒绝损坏负载。允许新增字段，不兼容变更须升schema。

退出码：**0=未发现冲突，1=部分可用或未知，2=不兼容，3=工具无法判定**。安装器另有gate-rejected等包装状态，网络/安装/启动错误不是插件结论。生成的宿主契约和客户端内联校验由`stage-contract.mjs --check`防漂移；同目标计算single-flight，失败刷新保留最近成功报告及错误，缓存呈现体验不冒充业务验收。

### 2.4 DSH接入要点

- UI接入口为`settings.plugins.tab`、`plugins.detail.section`和`.badge`；`plugins.item`缺可靠身份。客户端导出预构建`window.__ModuleLoader__.load({id,factory})`，inject声明其它插件包名，宿主不代构建。
- loader entries可迭代，entry id映射包身份；0–5为PENDING/LOADING/ACTIVE/FAILED/DISPOSED/UNLOADING。import失败可无fiber，不能靠`fiber.await()`或受inject限制的store取得全部原因。
- 本插件空inject避免体检自身因缺服务挂起；工具required为顶层数组，skill须运行时注册provider。按实际启动参数解析profile；缺少某个settings方法不外推整个服务。

**rc.2评估：** 本机桌面与CLI均为0.2.1-rc.2；[官方说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.2)新增模型及Search/Fetch支持，不能据此推定全部API不变。直接调用其官方声明函数并对照当前提取/判定，仍复现engines放行/peer拒绝的误报及反向漏报。生成目录相对旧基准host91→98（新增8、移除invariants，subagents等方法变化），client仍8且方法集合相同；本轮未覆盖提交的规则/目录。

仓库提交59714e7记录一次rc.2手动检查：详情发现/角标及tool/skill正常，兼容性标签未显示，而自报标记显示已注册。**本轮未重跑该UI检查**；rc.2源码仍声明并消费该槽位，应复核导航入口、加载与注册时序，不能判为槽位删除。rc.1的7/7有限集成仍只认证rc.1。不需要据现有证据整体重写AST/worker架构；先完成第6节定向适配。评估及源码摘要见`verification.dshRc2DocumentationAudit`。

## 3. 开发与文档维护约定

1. 先复现再修改，保留未知/弃权与覆盖诊断；不以测试自洽代替目标行为，不编造归属、影响或实测。
2. 不重建快照消除失败；版本漂移须审查`test/__baseline-versions.json`并单独提交。默认suite共享测试专用只读profile副本，单文件自行捕获，提取与源码回读用同一份字节。两次观测不一致报`PROFILE_SNAPSHOT_UNSTABLE`，超预算报`PROFILE_SNAPSHOT_BUDGET`；不重试、不交付半份输入，未安装profile明确跳过；这不是OS原子快照。
3. 分析使用有预算worker，只清理自有目录/PID组。安装检查克隆排除node_modules，重定位manifest/pnpm9单importer本地锁路径、保留远程pins，拒绝不支持格式及不安全链接，不改原profile。
4. 从私有源码副本打tgz、空缓存安装并调用；文件存在、日志干净或到货不证明业务成功。默认10秒/512+64MiB worker预算、1秒工程超时负例与总流程<5秒分别维护，Python parity仅为旧参考。
5. 本地可提交；push/合并/npm发布及对外发帖分别取得授权，只stage本项路径，不用`git add -A`。README写用法，Plan写契约/状态/待办，current-state写证据，历史文档保留日期；同步skill/契约副本，不逐轮新增总结文件。

## 4. 已完成的关键工作

已完成原审计B01–B14/S01–S03整改、P0集成、P1标签真值隔离/规则质量/契约稳定、有界P2分析与工程验证。规则复核保留readImage实际读取路径和sessions.open旧回退，移除getSnapshot/settings.get/sessions.map无依据影响；sessions.refresh不补无依据规则。历史安全审阅为partial，库存是partial样本，不以调用数或历史覆盖率代替准确率。

可选profile输入隔离已由[PR #4](https://github.com/lcy0121/dsh-plugin-compat-check/pull/4)交付；9项隔离回归、本机Node22.19/26.12默认各491/491，合并提交ec6f06a的[CI](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/39033059918)通过Node22/24及Linux真实DSH。只适用于各自输入/日期，不认证后续源码或其它宿主版本。

**分发状态（2026-10-17核验）：**

| 对象 | 已有动作与状态 |
|---|---|
| awesome-dsh-plugin / dsh-market登记表 | [PR #7736](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7736)，plugin子目录、dev分类；CI通过，OPEN，当前登记表未见本仓库 |
| 1024 Store目录 | [PR #628](https://github.com/imsai-sh/awesome-deepseek-harness-plugins/pull/628)已MERGED；目录合并不等于下游安装验收 |
| dshworks目录 | [PR #167](https://github.com/dshworks/awesome-dsh-plugins/pull/167)修正子目录、简介和npm名；CI通过，OPEN |
| 0xsline Awesome | 已有收录；[简介修订PR #717](https://github.com/0xsline/awesome-deepseek-harness/pull/717)仍OPEN，提交不等于页面已更新 |
| bruc3van目录 | [issue #138](https://github.com/bruc3van/awesome-dsh-plugin/issues/138)请求复核过时排除理由，OPEN；其0.1.2发布日期误写为10月13日，应为10月17日，尚待更正 |

宣传仅保留可核验事实：HTTP 200不等于收录，下载不等于用户，star不代表兼容性；“故障时被想到”是待验证的定位假设。删除“唯一自动增长渠道”“纯链接转化近零”“每个rc后24小时普查”等未经验证或尚无资源保证的断言。其它市场按其npm/子目录/制品规则评估，不给private根包添加虚假bundle声明，也不从根扫描限制推出所有合规入口都不可能。

## 5. 验证记录与复现

### 5.1 已验证范围

| 证据 | 范围与限制 |
|---|---|
| DSH0.2.0-rc.2 / macOS | 实际tgz、tool/skill、面板/详情/角标/基线、Chrome正负例；联合22项含9项真实DSH/Chrome/pnpm，未发送模型对话 |
| Linux | arm64 VM：Node22/24各406通过、1项外部profile缺失跳过，联合各18通过；x64 CI精确提交见current-state。联合18项含4项真实DSH、1项冻结pnpm安装、13项离线 |
| DSH0.2.1-rc.1 | 工具0.1.2实际tgz有限集成7/7（探针2、HTTP1、Chrome到货/错误4）；不是全面业务、rc.2或新一轮手动面板认证 |
| DSH0.2.1-rc.2 / 本轮文档 | 两组官方函数与当前内核对照、目录/槽位源码审阅；已有单次UI记录另列§2.4。本轮未做完整UI/业务或Windows验收，文档与公开元数据核验见current-state |

辅助标签独立于预测；四个固定病例TP1/FP0/FN1/TN2（精确率1、召回率0.5）暴露漏报，不是生态准确率。P2的21例归属反例TP0/FN14→TP14/FN0、FP为0，另4例未知有诊断，只评价该队列。默认suite不代替真实集成，旧skill正文/旧CI不追写成新认证，所有阶段数字以对应记录为准。

### 5.2 日常检查与真实集成

```bash
npm test -- --test-reporter=tap > <默认套件TAP文件>
npm run format:check
node tools/update-current-state.mjs --test-summary <默认套件TAP文件>
node tools/doc-check.mjs --test-summary <默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

文档检查不递归跑测试，发布闸门复用一次完整默认suite摘要；空缓存tgz安装需registry联网。更改真源后运行`node plugin/scripts/stage-skill.mjs`与`node plugin/scripts/stage-contract.mjs`并审查副本。真实集成显式设`DSC_SLOW=1`，运行probe-boot、labels、client-arrival测试，需要DSH/pnpm和Chrome（可设`DSC_CHROME`）。辅助文件度量同时提供`--probe`和`--labels`；帮助见`node tools/labels.mjs --help`及shell入口`--help`。

### 5.3 P2工程验收

```bash
node tools/engineering-check.mjs
DSC_SLOW=1 node --test --test-reporter=tap test/engineering-live.test.mjs test/profile-lock.test.mjs
```

覆盖2402文件/约50MB预算弃权、受控超时、32MiB与默认提取器堆耗尽/恢复、64请求single-flight、8进程192次基线争用/原子读取；旧宿主4000函数/3并发刷新期间仍可响应。超时分别检查等待/总流程、停止后计数不增长及恢复。只证明限定版本/输入的工程行为，不是全进程RSS、任意脱离进程组隔离或生产性能保证。

## 6. 后续工作与发布

按依赖关系推进；宣传提案在此列为后续候选，不视为已实现或已授权对外发送：

1. **0.2.1-rc.2定向适配。** 先复现标签未显示，核对settings入口、slot注册/加载时序并加真实UI回归；按目标版本适配engines优先、旧peer规则、非法/空范围、预发布、workspace及精确豁免，补真实宿主正反例/CI。修复目录读取器ASAR数据偏移多8字节的问题，先做文件首尾/JSON/字节校验，再审查新目录与规则；保留旧版回归，另验子路径元数据及HMR生命周期。不以改版本号、换目录或重建快照代替验收，现有证据不要求整体重写架构。
2. **独立业务真值用例。** 从真实插件选择有限业务路径，定义预期动作及成功/失败信号，优先客户端交互和动态分析盲区；功能标签独立于预测与loader标签，同时保留正反例。
3. **可分享的故障报告。** 设计CLI Markdown导出候选（尚无`--issue-report`）：含工具/DSH/插件版本、证据模式、发现、可用位置、certainty/impactBasis、覆盖、复现命令与声明限制；缺失位置如实说明，默认脱敏路径和日志，由用户预览后分享。只在确实回答问题且获授权时回复真实issue，不自动批量发帖。
4. **分发交付补全。** 更正issue #138发布日期，跟进三个OPEN收录修订；采纳/索引刷新后验收可见性及实际完整制品安装。适配稳定后另经授权发布文档/skill更新，明确源码与旧npm包差异；其它渠道先核验npm、子目录或Release制品支持，不以页面200或CI绿灯宣称成功收录/安装。
5. **有限样本与自动化（后置）。** 先以少量明确版本/制品哈希的样本验证批量静态JSON聚合，公开口径、限制和“待作者复核”，不称插件坏了或已作安全审查。再评估低权限Action、workflow摘要/徽章及逐版增量；覆盖不足与工具错误单列，不把绿色等同兼容、不默认写第三方仓库、不承诺24小时SLA。引用/实际接入与复现反馈作为信号，不把下载当用户。第三方详情页集成和公共结论端点暂缓，先确认合作、隐私、缓存失效及维护成本。
6. **Windows取得真实环境后验收。** 路径、安装器、进程回收和打包实跑；按用户选择暂缓，不用POSIX或路径模拟充数。
