# 上游跟进与限定核验

本文对应**0.2.3**。2026-11-05已复验dshmarket **1.73.10**的原始发布函数、HTTP路由、真实pnpm新装与官方rc.5 Desktop Host；结果如下。它们是上游安装/恢复问题，与本工具#7–#10的源码修复分开记录。制品证据见[current-state](current-state.json)。

| 上游 | 本轮结果 | 剩余事项 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open、末次回复未变；journal保留，但恢复详细错误码仍丢失。新增三次自动修复上限及放弃后重装提示 | 等上游补原因/出口；真实宿主恢复与手动自救仍未通过 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed、反馈后无新回复；真实pnpm新装成功但仍无版本未核实字段/警告，update对照有警告 | 等上游补install分支；关闭不等于原诉求完成 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，无维护者回复；[详情](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)为HTTP200，仍仅GitHub源码方法、unknown/not_checked、checkedAt=null | 等npm映射后另验新装；源码子目录不等价完整tgz |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | open、未合并 | 等维护者处理 |

## 1.73.10复验来源与结果

固定[v1.73.10](https://github.com/dsh-market/dsh-market/tree/v1.73.10)为`5e80c1cc0b6a29de3b87f410445f12a1bb478219`，与npm gitHead一致。官方tgz SHA-256为`1dbcd14bbf29e503d6881270522dd49a79c8140ac7696ad60e2839cd7b253a9e`，integrity/shasum已核；源码归档SHA-256为`4e41652f48752d87108b2ff7e089e133059cb09e3dcba92adfb860916791fece`。10个两侧共有发布文件逐字节一致；生成lib不在源码归档中，不冒称全部构建字节对拍。

- **恢复6组对照：** failed后已写文件、缺bundle、client-only、已完整组合、详细错误失败、无journal。缺组合时保留记录，client-only/完整组合可结束，无journal不调用manager。具体ERR_PNPM_UNEXPECTED_STORE仍退化为refused the reinstall (failed)。另以受控manager连续调用五次：实际安装调用3次、attempts停在3，之后abandoned含包名及Settings重装提示；这是函数对照，不是五次真机启动。
- **install/update共8组对照：** latest成功只查1次；latest失败后packument成功查2次，两者固定2.0.0。双失败时install裸包名且无专门警告，update使用@latest并返回实际版本及warn；显式版本保留，minimumReleaseAge配置不变。
- **真实pnpm新装：** 原install路由调用真实dsh CLI/pnpm，在私有profile安装合成2.0.0并写入bundle。仅对市场查询客户端返回两次429，pnpm仍可从同一自有registry读取元数据/tgz；结果无versionUnverified和专门warn。未模拟整个生产registry不可用，也未绕过release-age策略。
- **真实Desktop Host：** 使用官方rc.5 IPC入口、PluginManager、随宿主pnpm及自有Chrome，共启动/停止5个宿主。缺bundle的两次重启均未恢复组合，journal attempts为1、2。手动移除与另一轮全新安装均在45秒观察期内未完成HTTP；磁盘分别已移除目标、已写2.0.0及bundle。写盘不等于激活或用户操作完成，不能认证桌面自救；也未等满上游300秒deadline，不能声称永不返回。

全部profile、registry、包和Chrome均为自有，未供应账户/模型；确认宿主停止后已清私有执行目录。没有运行原生Electron GUI外壳或Windows，也未重现真实更新中SIGKILL。原始回执、脚本及摘要在`tmp/upstream-20261105/`，本轮未向上游发帖。

## 历史结果

1.73.5函数/路由对照及1.73.3 Desktop负例仅为历史，见`77c5914:docs/upstream-verification.md`。旧证据不认证新版；后续在上游修复、npm映射或PR状态变化后重新验收，消息/新issue/PR另取授权。
