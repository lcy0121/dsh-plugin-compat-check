# skill交付与注册

本文对应**0.2.0**。[Plan](../docs/Plan.md)维护契约，[current-state](../docs/current-state.json)记录限定验收及实际发布状态。

## 真源与安装

`skill/SKILL.md`是权威正文，`plugin/skill/SKILL.md`是逐字节生成副本：

```sh
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

npm通过files:skill交付，prepack同步正文和内核；不含CLI。独立安装使用`./dsh-plugin-compat-check.sh --install-skill`，写到`${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`，默认不覆盖，显式force才覆盖。实际CLI仍需仓库及根依赖。

## 注册与契约

文件随包不等于自动发现：宿主通过scoped Context的skills.registerProvider注册，skills是软订阅依赖。provider/skill name均为dsh-plugin-compat-check，source=bundled、rank=600；支持list/get、description、invocation与正文，优先读取包内副本。frontmatter保持单行name/description和kebab-case，不加旧disableModelInvocation键。

正文长度由文档检查核对（frontmatter外slice后trim、JavaScript UTF-16 length）：**11281 字符**。普通tool返回report/baseline/版本/exitCode，升级返回upgradePreview、report为null；保留真实位置、certainty/impactBasis及coverage/vacuous，不从文本猜字段或把未知/预测改称业务通过。

默认测试验证注册、隔离安装及tgz交付，不运行模型对话。实机结果只适用于对应宿主/制品，历史正文长度及实验见`39d9f1a:skill/README.md`；当前使用以[SKILL.md](SKILL.md)为准。
