# skill 交付与注册

当前说明适用于0.1.1本地候选；源码、版本和验证索引见 [Plan](../docs/Plan.md) 与 [自动统计](../docs/current-state.json)。

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

当前正文（frontmatter外，slice后trim、JavaScript UTF-16 length）为 **6548 字符**，由docs测试核对。不要把历史探针的contentLength手工替换成新正文长度：那会篡改历史实测。

## 历史证据与当前验收

DSH0.2.0-rc.2/macOS的历史机制实验确认：静态inject或子fiber inject均能注册provider；包内未注册文件不被自动发现；扁平markdown和name/SKILL.md两种扫描形态可被发现。旧实验不是当前候选的真实启动验收。

默认测试检查宿主apply、注册、正文、隔离安装及独立tarball工具执行。2026-10-15另从实际tgz在私有profile启动真实DSH0.2.0-rc.2（macOS arm64，宿主Node24.18.1）：skills.list包含本skill，skills.get返回provider=dsh-plugin-compat-check，正文6548字符且SHA-256与源码一致。实际调用compat_check亦成功；这验证宿主目录和工具，不表示已经发送模型对话或覆盖其它DSH版本。环境、清理与后续见 [Plan](../docs/Plan.md#51-已验证范围)。

旧说明中的“未改plugin/index.js”“files尚未决定”“打包未验证”已被实际实现与测试替代。历史注册细节在 [施工记录](../docs/Plan.md)；当前使用语义以 [SKILL.md](SKILL.md) 为准。

compat_check现除summary/text等原有字段外，还返回经校验的完整report与baseline、工具版本和exitCode；agent需要结构化证据时应读取report，不靠文本反向解析。正文使用语义未改；跨通道契约与旧格式策略见 [Plan](../docs/Plan.md#23-报告结构与兼容策略)。
