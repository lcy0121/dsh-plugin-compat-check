# 上游跟进与限定核验

当前工具版本为**0.2.7**。本页记录上游市场与发行入口。宿主和制品验收见[current-state](current-state.json)。

## 2026-11-23入口复查

dshmarket [GitHub 发行](https://github.com/dsh-market/dsh-market/releases/tag/v1.80.0)和 [npm](https://www.npmjs.com/package/dshmarket/v/1.80.0)均为 1.80.0，标签与 npm gitHead 均指向 `8747e07367df7f16d6186e1c9047daecee3e8174`。[#928](https://github.com/dsh-market/dsh-market/issues/928)仍 open，[#1047](https://github.com/dsh-market/dsh-market/issues/1047)仍 closed。此版本的重启恢复、自救与新装告警尚待实测。

[1024 #22](https://github.com/imsai-sh/dsh-1024store/issues/22)仍 open。[详情 API](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)只列 GitHub 子目录，状态为 `unknown/not_checked`，无核验时间或 npm 映射。

## 2026-11-20复查

[GitHub发行与标签](https://github.com/dsh-market/dsh-market/releases/tag/v1.73.25)和[当日 npm 版本](https://www.npmjs.com/package/dshmarket/v/1.73.25)均为 dshmarket **1.73.25**，tag 与 npm gitHead 同为 `d0967c75e59ef3d3d3d16ba4e41f169755508d7e`。归档 SHA-256 为 `4e6de3db01d32096551028921806e56233ad6741c4fe15ca2576e9d2247f8f3e`，shasum/integrity 均已核对。

| 上游 | 本次观察与剩余事项 |
|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open，11条评论，数量与更新时间未变。6组原始恢复函数对照中，失败原因已保留管理器错误码，错误正文仍省略。缺bundle行仍保留恢复记录；5次受控触发最多安装3次，随后有abandoned及Settings提示。仍待两个真实重启与用户自救端到端复验。 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed，3条评论，数量与更新时间未变。8组原始路由对照复现：双查询失败时新装仍用裸包名且缺专门告警和版本未核实字段，更新仍用@latest并返回该字段。显式版本及minimumReleaseAge保留。 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，1条评论，数量与更新时间未变。[详情API](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)返回HTTP 200，安装来源仍仅GitHub子目录，unknown/not_checked、checkedAt=null。待npm映射后复验新装。 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | 合并状态及当前主分支中英文条目均已确认。 |

函数/路由复查使用私有profile、合成registry和模拟包管理器，范围限于恢复决定、HTTP返回及日志。真实Desktop恢复和自救沿用下方历史结果。

## 历史行为验收

- 11 月 15 日在 1.73.19 实测六组恢复函数和八组 HTTP 路由。五次触发最多安装三次，恢复日志丢失错误码，新装缺双查询失败告警。[完整记录](https://github.com/lcy0121/dsh-plugin-compat-check/blob/61e9e71b3c5f0aab8a5dbaf3310e1ee67749aa5e/docs/upstream-verification.md)
- 11 月 6 日以 DSH Desktop 0.2.2-rc.1、自有 profile 和合成 registry 实测。删除 bundle 行后两次真实重启都没有恢复服务，journal 的 attempts 分别为 1、2。手动移除已写盘并清空 journal，HTTP 在 45 秒内未返回，未完成重装。结论限当时版本和观测窗口。[完整记录](https://github.com/lcy0121/dsh-plugin-compat-check/blob/cdbed0ee32196a1189b852c2d7b59c867d3ab243/docs/upstream-verification.md)
