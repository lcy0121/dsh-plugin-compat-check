# skill 交付与注册

当前说明面向0.1.4；是否公开发布及npm latest以registry和Plan记录为准。源码、版本与验证索引见 [Plan](../docs/Plan.md) 与 [自动统计](../docs/current-state.json)。

## 真源与安装

`skill/SKILL.md` 是唯一内容真源；`plugin/skill/SKILL.md` 是提交到仓库的逐字节副本。更改真源后运行：

```bash
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

`plugin/package.json` 已含 `files: skill/`，prepack同步skill并暂存内核。npm包只提供插件，不包含CLI。CLI用户从仓库运行并先安装根目录依赖。

独立安装：仓库根执行 `./dsh-plugin-compat-check.sh --install-skill`，落到 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`。已有文件默认不覆盖，显式 `--force` 才覆盖；此安装不要求判定内核可用。

## 宿主注册已经落地

**文件放进插件包里不算数**：DSH不会因此自动扫描它。当前 `plugin/index.js` 的 `registerSkill()` 使用 `ctx.inject(['skills'], callback)` 订阅服务，再调用 scoped Context 的 `skills.registerProvider()`；不把skills设成本插件的硬依赖。读取顺序优先包内 `plugin/skill/SKILL.md`，仓库根skill是备选，不再需要人工粘贴注册代码。

provider name与skill name均为dsh-plugin-compat-check，source=bundled、rank=600；提供list/get、description、invocation和正文。frontmatter保持单行name/description，name为kebab-case。不支持的旧键可能使文件系统发现失效；不要添加disableModelInvocation等旧字段。

公开0.1.4正文明确必需inject、未知服务与方法缺失的边界。当前源码进一步分开解释确定性与影响依据，并按“无已验证调用”说明vacuous；并从同一模块呈现每条发现的核实步骤，保留未知依赖“待确认”。这些源码修订尚未发布，不追改历史npm包。

当前正文（frontmatter外，slice后trim、JavaScript UTF-16 length）为 **10705 字符**，由docs测试核对。不要把历史探针的contentLength手工替换成新正文长度：那会篡改历史实测。

升级前对比优先调用已注册的`compat_check({"upgradeTo":"0.2.1-rc.2"})`，当前版本由运行宿主解析；无工具时使用仓库CLI：`node bin/compat-check.mjs --nm <profile> --dsh-version 0.2.0-rc.2 --upgrade-to 0.2.1-rc.2 --json`，当前版本必须显式提供。仅使用已认证精确版本目录，对同一安装制品静态比较，不读取探针、profile豁免或基线，不执行插件或升级宿主。此预测不等于业务验收通过，完整输入/输出边界见正文及CLI帮助。

## 历史证据与当前验收

DSH0.2.0-rc.2/macOS的历史机制实验确认：静态inject或子fiber inject均能注册provider；包内未注册文件不被自动发现；扁平markdown和name/SKILL.md两种扫描形态可被发现。旧实验只说明当时的机制，不代替后续版本的真实启动验收。

默认测试在受控上下文中检查apply、注册、正文、隔离安装及独立tarball工具执行，不启动真实DSH。2026-10-15另从实际tgz在私有profile启动真实DSH0.2.0-rc.2（macOS arm64，宿主Node24.18.1）：skills.list包含本skill，skills.get返回provider=dsh-plugin-compat-check，当时contentLength=6548且SHA-256与当时源码一致。实际调用compat_check亦成功；这验证宿主目录和工具，不表示已经发送模型对话或覆盖其它DSH版本。环境、清理与后续见 [Plan](../docs/Plan.md#51-已验证范围)。

历史npm0.1.1正文contentLength=6551，末段误留发布前的“本地0.1.1未发布”。0.1.2改为版本中立的事实源说明，并补充新版DSH声明规则未适配的限制；是否已公开安装以Plan和registry的最新记录为准，不追改旧包或旧实测。

npm0.1.2发布时正文contentLength=6669；0.1.3正文已补齐版本声明规则、精确豁免、目录选择与rc.2 UI/HMR边界。源码副本、已发布tarball与各次现场正文分别核验。

历史阶段先用旧正文做只读场景前测，暴露上述缺口；修订后的同场景与受控CLI应用结果记录于current-state，不代替模型对话或业务准确率评估。当前操作以[SKILL.md](SKILL.md)为准。

普通体检的compat_check除summary/text等字段外，还返回经校验的完整report与baseline、工具版本和exitCode；agent需要结构化证据时应读取report；升级预检改读upgradePreview，report为null，不靠文本反向解析。正文已明确源码位置和实测证据须实际存在，不能从字段缺失推断；跨通道契约与旧格式策略见 [Plan](../docs/Plan.md#23-报告结构与兼容策略)。
