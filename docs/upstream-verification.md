# 上游跟进与限定核验

本文记录2026-10-30只读跟进及受控复核；0.2.0发布/平台回执见[current-state](current-state.json)。2026-10-29对1.73.3的完整Desktop Host实验及已授权两条反馈保留于`91b4b2d:docs/upstream-verification.md`，不由本轮追认端到端通过。

| 上游 | 当前状态 | 本轮成果与未完成项 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open；[10月30日新回复](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6512186435)指出reason内容及用户出口两层缺口 | 发布版1.73.5函数对照仍保留缺bundle的journal；诊断具体code/message仍丢失。启动调用点只打印恢复/待处理数量，未输出每包reason。自愈、真实桌面自救流程仍未验收 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed；[我们的新装遗漏反馈](https://github.com/dsh-market/dsh-market/issues/1047#issuecomment-6492914395)后无新回复 | 1.73.5受控路由复核仍是update有警告、install遗漏。关闭状态不等于原诉求已完成 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，无新回复 | [公共详情](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)仍只有GitHub方法，unknown/not_checked、checkedAt=null；无npm方法，未运行新装 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | open、未合并，无讨论回复 | 等待维护者处理；未修改或催帖 |

## dshmarket 1.73.5来源与验证边界

公共npm latest为1.73.5，tag [v1.73.5](https://github.com/dsh-market/dsh-market/tree/v1.73.5)指向`d797f38834c53a97a5827651f60ab35a461b44d3`。官方tgz SHA-256为`b6fc317d4bc4d982aeeaab7d9f1647cece36c50f25ce796150074c8ccd75ccec`，npm integrity/shasum均校验通过。测试调用原始发布文件；依赖复用先前隔离运行时，不改发布文件。所有profile、journal、合成包及loopback服务在本轮自有目录，不读取真实账户，不调用真实包管理器。

### #928：误清修复保持，诊断及出口缺口仍在

对未经修改的`repairInterruptedUpdates`注入明确标记的受控manager结果，六组对照通过：

- failed但已写文件/依赖，以及文件/依赖存在但缺bundle行，都保留journal；后者连续两次调用attempts为1、2。
- client-only不要求bundle行；完整组合可结束；无journal不调用manager。
- failed且带`ERR_PNPM_UNEXPECTED_STORE`和具体message，reason仍仅为`refused the reinstall (failed)`，不含具体错误。

发布产物`lib/pending-updates.js`仍未用`failureDetail`；`lib/index.js`的修复定时器只打印汇总计数，未输出`report.failed`的包名/reason；`official-desktop.js`只转交报告。新回复所述两层缺口得到源码与函数级独立复核；这不是实际启动日志/界面验收。

先前1.73.3真实Desktop Host两次重启已证明缺bundle形状不能自愈；当时“移除→重装”卸载HTTP45秒未返回，未进入重装。本轮没有重跑Desktop、SIGKILL或真实pnpm，不将这些历史边界升级为1.73.5已验证结论。

### #1047：原新装路径仍遗漏

原始`fetchNpmLatest`和完整挂载路由使用自有loopback registry；包管理器边界仅写合法合成2.0.0并返回exit0。install/update分别核对四种条件：

| 元数据条件 | install新装 | update更新（CLI-runner对照） |
|---|---|---|
| latest成功 | 精确2.0.0，无多余警告 | 同左 |
| latest429/HTML、packument成功 | 精确2.0.0，无多余警告 | 同左 |
| 两次429/HTML | 裸包名、200/ok，仍无versionUnverified及专门warn | `@latest`、200/ok，返回installed=2.0.0并记warn |
| 两次失败但显式版本 | body.version保留精确2.0.0 | compatVersion保留精确2.0.0 |

八组路由对照及请求次数、传参、profile等待策略文件不变的断言均通过，证明缺口仍在；没有实际安装旧版本、pnpm等待期或GUI验收。没有放宽桌面成熟版本门禁来触发警告。

## 下一步与证据

继续跟进#928的详细reason与用户出口、组合恢复及自救范围；#1047等待明确覆盖install的新装修复后重跑。1024须出现正确npm方法后另做新装，awesome等待维护者。后续发帖、邮件、PR或推送分别取当次授权；本轮未发送消息或修改远端，也未检查邮件。

原始元数据、发布包、六组repair/八组路由结果及脚本在`tmp/rc5-review-20261030/`；完整来源审查另见[rc.5记录](../rules/dsh-0.2.1-rc.5-review.json)。本轮结果只认证所述函数/受控路由，不认证实际Desktop或一般业务。
