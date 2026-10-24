# skill交付与注册

随0.1.7-dev源码维护，版本真源仍为0.1.6；新增修复尚未发布npm版本。[Plan](../docs/Plan.md)维护契约，[current-state](../docs/current-state.json)记录限定验证。

## 真源与安装

`skill/SKILL.md`是内容真源，`plugin/skill/SKILL.md`为逐字节生成副本。修改后同步并验证：

```bash
node plugin/scripts/stage-skill.mjs
node --test test/skill.test.mjs test/docs.test.mjs
```

npm包通过`files: skill/`交付，prepack同步正文及共享内核；包不含CLI。独立安装从仓库执行`./dsh-plugin-compat-check.sh --install-skill`，写入`${DSH_AGENTS_HOME:-~/.agents}/skills/dsh-plugin-compat-check/SKILL.md`；默认不覆盖，显式`--force`才覆盖。独立安装不要求判定内核可用，实际CLI仍需仓库及根依赖。

## 宿主注册

**只把文件放入包内不算数，DSH不会因此自动发现它。** `plugin/index.js`通过`ctx.inject(['skills'], callback)`订阅服务，再用scoped Context的`skills.registerProvider()`注册，不把skills设为硬依赖。优先读取包内skill，仓库真源为备选。

provider/skill name均为dsh-plugin-compat-check，source=bundled、rank=600；提供list/get、description、invocation和正文。frontmatter保持单行name/description及kebab-case名称，不添加disableModelInvocation等旧键。

当前正文（frontmatter外，slice后trim、JavaScript UTF-16 length）为**12496 字符**，由文档测试核对。工具普通体检返回完整report、baseline、版本和exitCode；升级返回upgradePreview，report为null，不从文本反推字段。正文要求实际源码位置、certainty/impactBasis及coverage/vacuous，不把未知服务当缺失，也不把预测当业务通过。

## 验证边界

默认测试验证注册、正文、隔离安装及tgz交付，不启动真实DSH。2026-10-15曾从当时tgz在私有DSH 0.2.0-rc.2/macOS arm64中核对skills.list/get和compat_check，当时contentLength=6548、正文SHA-256匹配；仅证明当时宿主目录/工具，不代表当前正文、模型对话或其它版本已验收。历史npm正文长度、机制实验和修订场景保留在提交`08b90e4`的本文件；不以新长度改写旧证据。

当前用法以[SKILL.md](SKILL.md)为准；源码、候选及公开制品分别核对，[验收范围](../docs/Plan.md#4-验收范围)不能由历史成功扩大。
