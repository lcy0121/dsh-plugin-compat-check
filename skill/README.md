# skill交付与注册

**0.2.6** 随包交付的 skill 包含 rc.5 精确目录、内容拒答和搜索路由提示。验收范围与归档摘要见[current-state](../docs/current-state.json)。

编辑[SKILL.md](SKILL.md)后同步包内逐字节副本 `plugin/skill/SKILL.md`。prepack 也会同步并通过 `files:skill` 交付。

```sh
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

宿主用 scoped Context 的 `skills.registerProvider` 软订阅 list/get。同名 provider 与 skill 为 dsh-plugin-compat-check，source=bundled、rank=600。frontmatter 只用单行 name/description，name 为 kebab-case。

正文经宿主 slice + trim 为**6585 字符**（JavaScript UTF-16）。默认回归覆盖注册、独立安装与 tgz。

独立安装用 `./dsh-plugin-compat-check.sh --install-skill`，写入 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`，仅显式 force 可覆盖。CLI 另需完整仓库和根依赖。
