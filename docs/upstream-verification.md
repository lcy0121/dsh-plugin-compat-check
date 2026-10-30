# 上游跟进与限定核验

2026-10-30再次只读核对GitHub、npm和1024公共详情：dshmarket latest仍为1.73.5，以下事项状态未变。功能结果来自同日已完成的受控实验，本次文档整理没有重跑Desktop或真实pnpm。项目版本/制品回执见[current-state](current-state.json)。

| 上游 | 已核状态 | 剩余事项 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open；[最新回复](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6512186435)指出详细reason和用户出口缺口 | 缺bundle时保留journal已复核；具体错误码/消息仍丢失，调用方只打印数量。组合自愈、用户可见诊断及真实桌面自救待验 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed；[新装遗漏反馈](https://github.com/dsh-market/dsh-market/issues/1047#issuecomment-6492914395)后无新回复 | 1.73.5仍是update有警告、install遗漏；关闭不等于原诉求完成 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，无新回复；[详情](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)仅GitHub安装方法，unknown/not_checked、checkedAt=null | 等正确npm方法后另做新装；本次未运行安装 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | open、未合并，无讨论回复 | 等维护者处理，未催帖 |

## 1.73.5受控复核

固定tag[v1.73.5](https://github.com/dsh-market/dsh-market/tree/v1.73.5)指向`d797f38834c53a97a5827651f60ab35a461b44d3`。官方tgz SHA-256为`b6fc317d4bc4d982aeeaab7d9f1647cece36c50f25ce796150074c8ccd75ccec`，integrity/shasum通过。调用未经修改的发布文件，复用隔离依赖；profile、journal、合成包和loopback均为自有，不使用真实账户或包管理器。

- **#928六组函数对照：** failed但已写文件/依赖、以及缺bundle行均保留journal，后者两次attempts为1、2；client-only无需bundle、完整组合可结束，无journal不调用manager。具体ERR_PNPM_UNEXPECTED_STORE/message仍退化成refused the reinstall (failed)。pending-updates未用failureDetail，index只打印恢复/待处理总数，不输出每包reason。这是函数/源码核对，不是启动日志或界面验收。
- **#1047八组路由对照：** install/update分别测试latest成功、latest失败但packument成功、两次失败、失败但显式版本。前两组精确2.0.0无多余警告；两次失败时install裸包名且无versionUnverified/warn，update使用@latest并记录warn；显式版本均保留。请求次数、传参和profile等待策略不变。真值来自loopback及写合成2.0.0的受控边界，不代表实际旧版安装、等待期或GUI验收。

2026-10-29的1.73.3真实Desktop两次重启未自愈，“移除→重装”在卸载HTTP45秒未返回；这些不能升级为1.73.5结论。完整实验、来源及当时反馈见`10213c0:docs/upstream-verification.md`，原始证据在`tmp/rc5-review-20261030/`。

继续等#928详细原因/出口及组合恢复、#1047覆盖新装后，再按实际范围复验；1024和awesome另跟进。上游消息/新issue/PR须另取授权，本次未发送；未检查邮件。状态关闭、源码修复和端到端验收分别记录。
