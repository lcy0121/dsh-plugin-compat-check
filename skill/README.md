# skill交付与注册

**0.2.7** 随包提供已安装插件检查、升级预检与超限源码的报告解读。[验收记录](../docs/current-state.json)

修改[SKILL.md](SKILL.md)后同步 `plugin/skill/SKILL.md`，prepack 也会同步副本。

```sh
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

宿主用 scoped Context 的 `skills.registerProvider` 软订阅 list/get。同名 provider 与 skill 为 dsh-plugin-compat-check，source=bundled、rank=600。frontmatter 只用单行 name/description，name 为 kebab-case。

正文经宿主 slice + trim 为**6419 字符**（JavaScript UTF-16）。默认回归覆盖注册、独立安装与 tgz。

独立安装用 `./dsh-plugin-compat-check.sh --install-skill`，写入 `${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`，仅显式 force 可覆盖。CLI 另需完整仓库和根依赖。
