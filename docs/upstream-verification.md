# 上游跟进与限定核验

本文对应**0.2.3**。2026-11-06已只读复核公共状态、dshmarket **1.73.12**原始发布函数/路由和官方**0.2.2-rc.1 Desktop Host**。与本工具源码修复及兼容性验收分开记录，制品/平台证据见[current-state](current-state.json)。

| 上游 | 当前结果 | 剩余事项 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open、11评论，无新维护者回复；恢复reason仍丢失具体错误码，三次修复上限保留 | 补具体原因/用户出口；缺bundle两次真实重启及手动自救仍未通过 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed、3评论，原install遗漏反馈后无新回复；双查询失败仍无版本未核实字段/专门warn，update有 | 等install分支补齐；关闭不等于原诉求完成 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open、1评论，无维护者回复；[详情API](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)浏览器UA为HTTP200，仍仅GitHub源码子目录、unknown/not_checked、checkedAt=null | 等准确npm映射后另验完整制品新装 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | **已于2026-11-06 15:22:35北京时间合并**，英/中文主分支条目已核 | 本次入口跟进完成；收录不代表兼容性认证 |

## 1.73.12来源与原始代码复验

固定[v1.73.12](https://github.com/dsh-market/dsh-market/tree/v1.73.12)为`19641d22a69b63063bb9b67a5f67a0dcb72703a0`，与npm gitHead及当次默认分支HEAD一致。官方tgz SHA-256为`f784ce5056df2005b748effb044c57b1447bb45717c44edffea114dcc869f479`，SHA1/shasum、SHA512/integrity均已核；未执行生命周期脚本。新版本包含store诊断和drain修复，但pending-updates.js及index.js与1.73.10字节一致，不能据提交标题认定#928/#1047修复。

- 恢复6组原始函数对照：failed已写文件、缺bundle、client-only、完整组合、详细错误失败及无journal。缺组合保留记录；详细ERR_PNPM_UNEXPECTED_STORE仍退化为refused the reinstall (failed)。
- 五次受控调用仅安装3次，attempts停3，之后有abandoned及Settings提示；这是受控manager对照，不是五次实际Desktop启动。
- install/update共8组原始HTTP路由对照：latest成功查1次，失败后packument成功查2次并固定2.0.0；双429/HTML失败时install用裸包名且无专门warn/versionUnverified，update用@latest并有已装版本和warn。显式版本和minimumReleaseAge不变。包管理器边界是受控落盘，不冒称本轮真实pnpm新装或GUI。

## 当前真实宿主复验

实际运行已安装0.2.2-rc.1的Desktop Host IPC入口、PluginManager、随宿主pnpm及自有headless Chrome，使用私有desktop profile和合成registry，无账户/模型。初始合成2.0.0服务加载成功；缺bundle行并写合法journal后，两次实际重启均未恢复：bundle行0、服务null，journal保留，attempts为1、2。

第四个Host手动移除的HTTP在45秒窗口未返回；磁盘已移除包、依赖、bundle，journal已清空。未继续重装，所以自救端到端仍未通过；没有等到上游300秒deadline，不能称其永不返回或外推完整Electron GUI/Windows。本轮未测试新版fresh install。停止4个自有Host、关闭Chrome后已删除私有执行目录/浏览器缓存；保留脱敏回执与脚本在`tmp/024-phase2-20261106/`。本轮未发送上游消息。

2026-11-05的1.73.10/rc.5详细历史见`abb051a:docs/upstream-verification.md`及current-state历史回执，不能直接认证或否定新宿主。后续仅在修复、回复或npm映射变化后重验；反馈/发帖另取授权。
