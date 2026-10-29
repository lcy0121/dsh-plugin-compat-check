# 上游核验记录

## 2026-10-29：消息与制品

本轮读取GitHub原帖、通知及公共接口，未更改通知状态。新增消息为market #928三条、#1047两条；Gmail连接需重新认证，未核查邮件。通知里的两条旧CI失败已被本仓库[后续成功运行](https://github.com/lcy0121/dsh-plugin-compat-check/actions/runs/40708636873)覆盖，该成功只认证其提交，不认证本地待推提交。

锁定公开 **dshmarket 1.73.3**：npm latest实查为该版本，[v1.73.3提交](https://github.com/dsh-market/dsh-market/commit/2211d46e0feba2b56d26e3f60b95aeffb8ed4547)为`2211d46e0feba2b56d26e3f60b95aeffb8ed4547`。

- tgz SHA-256：`97fada3db48e83afc3705e522d1a5f8ba4369fa5a6297412a127510447899233`
- npm integrity：`sha512-fUkE+QoumMh4OLqT97iq1Vc75PT+EQgXYVLl0IXcw7tTpihRut1qRufEx5EAbGF+4+mqNEDehBnL+xwLQSstVw==`
- integrity及全部116个发布文件原字节已核对；运行依赖单独安装，禁用lifecycle，测试脚本未修改发布代码。宿主peer使用与官方应用一致的Schemastery3.18.5。

| 项目 | 上游状态 | 本轮判断 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open；[修复确认](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6477655938)、[1.73.3发布确认](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6480170539)、[Yur0918实机补充](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6484585791) | 不再误清journal已复验；缺bundle仍不能自愈，错误细节仍丢失 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed；[警告策略/实现](https://github.com/dsh-market/dsh-market/issues/1047#issuecomment-6475654291)随1.73.2发布 | update分支有警告，原反馈的install新装分支仍遗漏；验收未完整通过 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，无新回复 | [公共详情](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)仍只有GitHub方法，unknown/not_checked，checkedAt为null；无npm方法，未执行新装 |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | open、未合并，无新回复 | 等待维护者处理，未催帖或修改PR |

## #928：误清修复通过，自愈与诊断仍待跟进

[修复f92a89a](https://github.com/dsh-market/dsh-market/commit/f92a89a30bd3f9055c17fa40ba9298d2b266a65a)要求版本文件、依赖声明及bundle层加载声明共同成立，client-only不要求bundle行。1.73.3确实包含这些判断。

函数级对照直接调用未经修改的`repairInterruptedUpdates`，管理器返回值受控：失败后仅落文件/依赖、以及文件/依赖已在但缺bundle行，均保留journal；后者连续两次调用的attempts为1、2。client-only及完整组合可结束，无journal不调用安装。该层不冒充真实Desktop安装。

随后在macOS arm64实跑官方 **Desktop Host0.2.1-rc.3 IPC入口、PluginManager、bundled pnpm11.28.5** 和自有Chrome，使用私有DSH_HOME及合成插件/registry；没有替换这组场景中的包管理操作。初始对照确认服务2.0.0正常加载，再构造“文件及依赖2.0.0、缺bundle行、有合法journal”：

| 重启 | bundle行 | 服务 | journal | attempts |
|---|---|---|---|---|
| 第一次 | 0 | null | 保留 | 1 |
| 第二次 | 0 | null | 保留 | 2 |

这证明原误清缺陷已修复，也复核了该形状仍不能自愈。测试profile须名为desktop才进入市场的官方桌面分支；初次自定义名称的准备运行不作为恢复验收。未运行完整Electron GUI壳，未独立复现remove后SIGKILL；Yur0918的完整中断报告仅作为其声明，未并入本轮实测。

“显式移除→重装”对照尚未通过：真实卸载请求45秒未返回；隔离盘面中的包、依赖、bundle已移除，journal已清空，但未进入重装。最终停止4个自有Host及自有Chrome，不据此认定普通桌面壳必然有相同表现，也不将这条自救办法写成通用已验收步骤。

[Yur0918同帖](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6484585791)指出的错误信息丢失也已独立复现：原函数收到failed及具体`ERR_PNPM_UNEXPECTED_STORE`/message，未落盘时reason仅保留`refused the reinstall (failed)`。[发布对应源码](https://github.com/dsh-market/dsh-market/blob/2211d46e0feba2b56d26e3f60b95aeffb8ed4547/src/pending-updates.ts)未包含`result.error`详情。该对照使用合成错误，未宣称本轮真实pnpm产生了该错误。

## #1047：更新与新装必须分开验收

1.73.2纳入的[修复8781085](https://github.com/dsh-market/dsh-market/commit/87810859131a19031fef81f15ec11b9a43ee81e7)在1.73.3中仍存在，但[路由源码](https://github.com/dsh-market/dsh-market/blob/2211d46e0feba2b56d26e3f60b95aeffb8ed4547/src/routes.ts)只在update分支增加`versionUnverified`；install分支仍是裸包名回退。

使用原始查询函数、完整挂载路由、本地catalog/registry。包管理器边界受控地写入合法合成2.0.0并返回exit0，仅核验响应/日志，不是实际安装、旧版选择、pnpm等待期或原生界面验收。每次独立查询的正常路径一次请求、回退两次；profile等待策略文件保持原字节。

| 条件 | /install新装 | /update更新（CLI-runner对照） |
|---|---|---|
| latest成功 | 精确2.0.0，无额外警告 | 精确2.0.0，无额外警告 |
| latest429/HTML、packument成功 | 精确2.0.0，无额外警告 | 精确2.0.0，无额外警告 |
| 两次429/HTML | 裸包名、HTTP200/ok，**无versionUnverified及专门warn** | `@latest`、HTTP200/ok，返回installed=2.0.0并记warn |
| 两次失败、显式版本 | body.version=2.0.0保持精确目标 | compatVersion=2.0.0保持精确目标，无多余警告 |

另在桌面稳定版策略入口观察到目标无法核实时返回409，未调用包管理器；这是不同的成熟版本门禁，不为触发警告而放宽。发布客户端的更新响应分类语句在中英日受控状态对照中，未核实版本进入warned并显示2.0.0，正常结果为done；仅为原始分类代码验证，不称真实DOM/视觉验收。

因此原issue虽然已关闭，**新装路径的原诉求仍未完成**。已在原#1047补充结果，请求覆盖install的返回字段、日志和完成提示，新增明确请求install路由的回归；保留显式版本及用户策略，不重复新开issue。

## 后续动作与证据

用户逐条授权后已追加[新装警告遗漏（#1047）](https://github.com/dsh-market/dsh-market/issues/1047#issuecomment-6492914395)及[恢复/诊断限定复验（#928）](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6492917994)，均回读确认与获批草稿一致；未另开issue/PR、推送或发版。#928跟进诊断/组合恢复及自救范围，#1047补齐新装路径；1024待正确npm方法出现后再做独立新装，awesome待维护者处理。

原始查询、制品、函数/路由/受控客户端分类回执与Desktop测试记录在`tmp/upstream-20261029/`。带启动认证信息的Host日志权限0600，不分享；邮件因连接失效未核查。2026-10-28对1.73.1的完整历史、原两条已授权反馈及范围见`a489891:docs/upstream-verification.md`，不能用本轮修复追认旧制品通过。
