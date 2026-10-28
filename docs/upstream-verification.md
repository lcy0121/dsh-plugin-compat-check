# 上游核验记录（2026-10-28）

本轮锁定公开的 **dshmarket 1.73.1**，使用自有临时目录、合成包及本地 registry。未修改用户 profile、未使用账户或模型凭据，未向上游发帖。

- tgz SHA-256：`69c34d25dee1d9c4a86fe2d4ce8e0a6946bc7913beeb49406934e69ed37241bf`
- npm integrity：`sha512-mnDEDq743YH2xuLU2qgmssnSiuet5VxS8Bsbggnyez2OfzSnOtIhmnufpe+fA/m+UQr7qI6PkHGCnzW/550tfQ==`
- 本机：macOS arm64，官方应用携带的 Desktop Host **0.2.1-rc.3**、PluginManager 及 bundled pnpm **11.28.5**。
- 实跑使用官方 Electron Node-mode Desktop Host 的原始 IPC 入口、真实插件管理器和自有 Chrome 页面。没有启动 Electron GUI 壳，也没有以普通 CLI/headless profile 冒充桌面完整验收。

## market #928：恢复验收未通过

[原讨论及维护者回复](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6459488744)说明 journal 自1.66.47起纳入。此前已核实[#969](https://github.com/dsh-market/dsh-market/pull/969)与相邻标签归属；本轮增加实际执行证据。

### 完整中断路径的范围

通过当前市场的真实更新路由触发合成包从1.0.0到2.0.0更新，观察到 journal 先写入，随后真实管理器开始移除 bundle 声明。但管理器在 live reload 阶段持续等待，45秒内未到 pnpm remove：依赖和磁盘包仍在。因此**没有把这次尝试称为 remove完成/add未开始的完整中断复现**，也没有据此确定真实用户中断的唯一根因。

### 独立重启恢复验证

为单独核实恢复逻辑，先用真实 bundled pnpm 正规安装并启动可用的合成 profile，再构造明确标记的半卸载状态及合法 journal，重启原始 Desktop Host。最终复核不改写管理器方法，市场入口仅由测试包重新导出原始模块；包管理操作没有替身。

| 输入状态 | 实际重启结果 | 验收 |
|---|---|---|
| 目标包、依赖及bundle声明均缺失，有journal | 自动装回2.0.0、依赖恢复；bundle条目仍为0、实际服务未激活；journal却已清空 | 未通过 |
| 包文件仍在，依赖及bundle声明缺失，有journal | 依赖恢复；bundle条目仍为0、服务未激活；journal已清空 | 未通过 |
| journal指向本地registry不存在的9.0.0 | 无成功恢复，记录保留，attempts增至1 | 边界对照通过 |
| 包和声明缺失，没有journal | 等待自动修复周期后仍不重装 | 边界对照通过 |

前两例日志声称：`the interrupted update had already written 2.0.0; recorded as finished`；汇总为1项reinstalled、0项pending。实际磁盘状态均为：依赖`2.0.0`、包版本`2.0.0`、bundle条目0、pending记录0，运行时服务为null。**文件落盘不能在这里代表已恢复可加载状态。**

另外直接调用未经修改的发布版`repairInterruptedUpdates`，注入受控管理器返回值，得到独立于Desktop/HMR的对照：

| 管理器结果 | 文件及声明 | 当前函数行为 |
|---|---|---|
| failed | 目标版本文件和依赖已写，bundle缺失 | 清journal并记reinstalled |
| failed | 无目标文件 | 保留journal并记failed |
| applied | 文件、依赖及bundle均完整 | 清journal并记reinstalled |

对应[恢复后置条件](https://github.com/dsh-market/dsh-market/blob/258f9d8334ce541515f159f81ba36eabbc2befac/src/pending-updates.ts#L323-L345)：失败分支仅核实磁盘版本后就结束journal。建议在**原#928**补充这个残余场景，要求对原先启用的插件保留并验证加载声明；后置条件不足时保留待处理记录和明确提示。不要把一次文件版本检查扩大为业务验收。

尚未证明完整Electron壳下的普通用户更新必然出现相同HMR表现；不应单独将本次live reload等待定性成新的宿主漏洞。

## market #932：双查询失败仍退回裸包名

使用未经修改的发布版`fetchNpmLatest`及完整挂载的`/dsh-market/install`路由，本地catalog只含合成包。仅包管理器执行边界被受控替身记录argv并停止，未真实安装目标。

| 元数据响应 | latest结果 | 路由传入的add目标 |
|---|---|---|
| latest成功 | 2.0.0，仅请求一次 | `dsc-upstream-fixture@2.0.0` |
| latest返回429/HTML，packument成功 | 2.0.0，按需请求两次 | `dsc-upstream-fixture@2.0.0` |
| 两次均返回429/HTML | null | `dsc-upstream-fixture` |
| 两次失败，但调用方显式给version=2.0.0 | 不依赖latest锁定 | `dsc-upstream-fixture@2.0.0` |

双失败分支未记录版本查询失败或退回未锁定目标的专门警告。所有安装请求的502/exit77均来自测试的`OWNED_STOP_BEFORE_INSTALL`，**不是上游真实安装失败的证据**；本轮也没有宣称pnpm实际装了旧版本或验证了GUI提示。

[维护者原回复](https://github.com/dsh-market/dsh-market/issues/932#issuecomment-6272556239)已将双失败提示列为独立变更。当前[查询函数](https://github.com/dsh-market/dsh-market/blob/main/src/updates.ts#L548-L567)和[安装目标选择](https://github.com/dsh-market/dsh-market/blob/main/src/routes.ts#L6757-L6768)与实跑一致。

建议另开范围明确的改进issue：**无法锁定版本时，明确提示并记录将使用未锁定目标**，或由维护者确定是否安全失败；保留显式版本安装，尊重profile的release-age策略。现有单失败回退已通过，勿重开原问题或宣称整个修复无效。

## 后续动作

1. 在#928原帖补充恢复后置条件的实跑及函数级对照，等待上游处理后按同一条件重验。
2. 为#932双失败场景准备独立改进issue，先确认交互/失败策略，再决定修复PR。
3. 未发帖、未创建PR；其他上游跟进见[计划第六节](Plan.md#6-后续工作)。

本地详细回执和核验脚本保存在仓库忽略的`tmp/upstream-20261028/`，不随源码发布；脚本依赖本轮临时制品与环境，不承诺独立可运行。归档回执已替换自有绝对路径，未复制带启动凭据的原始宿主日志。记录的16个自有Host PID均已退出，Chrome由自有进程清理器回收。
