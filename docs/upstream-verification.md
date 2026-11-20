# 上游跟进与限定核验

当前版本为**0.2.6**。本页按日期记录上游公共状态、归档及受控验证。宿主适配见[current-state](current-state.json)。

## 2026-11-20复查

[GitHub发行与标签](https://github.com/dsh-market/dsh-market/releases/tag/v1.73.25)和[npm latest](https://www.npmjs.com/package/dshmarket/v/1.73.25)均为 dshmarket **1.73.25**，tag 与 npm gitHead 同为 `d0967c75e59ef3d3d3d16ba4e41f169755508d7e`。归档 SHA-256 为 `4e6de3db01d32096551028921806e56233ad6741c4fe15ca2576e9d2247f8f3e`，shasum/integrity 均已核对。

| 上游 | 本次观察与剩余事项 |
|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open，11条评论，数量与更新时间未变。6组原始恢复函数对照中，失败原因已保留管理器错误码，错误正文仍省略。缺bundle行仍保留恢复记录；5次受控触发最多安装3次，随后有abandoned及Settings提示。仍待两个真实重启与用户自救端到端复验。 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed，3条评论，数量与更新时间未变。8组原始路由对照复现：双查询失败时新装仍用裸包名且缺专门告警和版本未核实字段，更新仍用@latest并返回该字段。显式版本及minimumReleaseAge保留。 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，1条评论，数量与更新时间未变。[详情API](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)返回HTTP 200，安装来源仍仅GitHub子目录，unknown/not_checked、checkedAt=null。待npm映射后复验新装。 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | 合并状态及当前主分支中英文条目均已确认。 |

函数/路由复查使用私有profile、合成registry和模拟包管理器，范围限于恢复决定、HTTP返回及日志。真实Desktop恢复和自救沿用下方历史结果。

## 2026-11-15市场与入口记录

11月15日快照保留在 `61e9e71:docs/upstream-verification.md`。当时 #928、#1047、#22 分别为 11、3、1 条评论；awesome #717 已于 11 月 6 日 15:22:35（北京时间）合并。

## 1.73.19来源与原始代码复验

固定[v1.73.19](https://github.com/dsh-market/dsh-market/releases/tag/v1.73.19)（11月12日发布）：tag/npm gitHead=`da774820fd49f4915461ff2031eedbef9b48dfe7`，tgz SHA-256=`b7bb48acaa3ee0b1e172a007e533f57dd8ac1fc877c023bfa409c39f39e81ebd`，shasum/integrity均已核，无生命周期执行。pending-updates.js与1.73.12相同，index/routes/updates有变化，原始函数/路由已重跑；issue关闭或发版标题不是修复证据。

- 恢复6组原始函数对照：failed已写文件、缺bundle、client-only、完整组合、详细错误失败及无journal。缺组合保留记录；详细ERR_PNPM_UNEXPECTED_STORE仍退化为refused the reinstall (failed)。
- 五次受控调用仅安装3次，attempts停3，之后有abandoned及Settings提示；这是受控manager对照，不是五次实际Desktop启动。
- install/update共8组原始HTTP路由对照：latest成功查1次，失败后packument成功查2次并固定2.0.0；双429/HTML失败时install用裸包名且无专门warn/versionUnverified，update用@latest并有已装版本和warn。显式版本和minimumReleaseAge不变。包管理器边界是受控落盘，不冒称本轮真实pnpm新装或GUI。

## 2026-11-06真实宿主复验

实际运行已安装0.2.2-rc.1的Desktop Host IPC入口、PluginManager、随宿主pnpm及自有headless Chrome，使用私有desktop profile和合成registry，无账户/模型。初始合成2.0.0服务加载成功；缺bundle行并写合法journal后，两次实际重启均未恢复：bundle行0、服务null，journal保留，attempts为1、2。

第四个Host手动移除的HTTP在45秒窗口未返回；磁盘已移除包、依赖、bundle，journal已清空。未继续重装，所以自救端到端仍未通过；没有等到上游300秒deadline，不能称其永不返回或外推完整Electron GUI/Windows。本轮未测试新版fresh install。停止4个自有Host、关闭Chrome后已删除私有执行目录/浏览器缓存；保留脱敏回执与脚本在`tmp/024-phase2-20261106/`。该次未发送上游消息。

更早的1.73.10/rc.5记录见`abb051a:docs/upstream-verification.md`，不认证或否定新宿主。11月15日证据在`tmp/025-development-20261115/upstream/`：route harness用rc.3生产schemastery3.19.0，只模拟包管理器写盘，未重跑市场Desktop恢复、未发送消息。修复、回复或npm映射变化后重验，反馈/发帖另取授权。
