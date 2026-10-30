# skill交付与注册

对应**0.2.2**；产品/待办见[Plan](../docs/Plan.md)，限定验收与实际发布见[current-state](../docs/current-state.json)。

权威正文为[SKILL.md](SKILL.md)，plugin/skill/SKILL.md为逐字节副本，prepack同步且通过files:skill交付，不含CLI。修改后执行：

```sh
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

包内文件不会自动发现：宿主以scoped Context的skills.registerProvider注册软订阅provider，支持list/get；provider/skill名为dsh-plugin-compat-check，source=bundled、rank=600，优先读包内副本。frontmatter仅单行name/description，name为kebab-case，不使用旧disableModelInvocation键。

正文按宿主slice+trim后的JavaScript UTF-16 length为**6028 字符**。工具注册、独立安装及tgz交付均有默认回归；不运行模型对话。

独立安装用`./dsh-plugin-compat-check.sh --install-skill`，落点为`${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`；默认不覆盖，仅显式force覆盖。CLI仍需完整仓库/根依赖。报告保留真实位置、certainty/impactBasis及coverage/vacuous；历史通过不认证当前制品。
