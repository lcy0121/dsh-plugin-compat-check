# 上游跟进与限定核验

本文对应**0.2.3**。2026-11-05只读复核：dshmarket npm latest为**1.73.10**；下表GitHub状态和末次回复未变。1024详情恢复HTTP200，但仍未列出npm方法。功能结果仅来自2026-10-30的1.73.5受控实验，未复验1.73.10、Desktop或真实pnpm。项目制品证据见[current-state](current-state.json)。

| 上游 | 当前观察 | 下一步 |
|---|---|---|
| [market#928](https://github.com/dsh-market/dsh-market/issues/928) | open；[末次回复](https://github.com/dsh-market/dsh-market/issues/928#issuecomment-6512186435)指出reason与用户出口缺口 | 用1.73.10复验详细原因、组合恢复及桌面自救 |
| [market#1047](https://github.com/dsh-market/dsh-market/issues/1047) | closed；[新装遗漏反馈](https://github.com/dsh-market/dsh-market/issues/1047#issuecomment-6492914395)后无新回复 | 复验install双元数据失败的警告/实际版本；关闭不等于诉求完成 |
| [1024#22](https://github.com/imsai-sh/dsh-1024store/issues/22) | open，无维护者回复；[详情](https://deepseek1024.com/api/v2/plugins/lcy0121/dsh-plugin-compat-check/plugin)仍仅GitHub源码方法，verification=unknown、code=not_checked、checkedAt=null | 等npm映射出现后另验新装；源码子目录不等价完整tgz |
| [awesome#717](https://github.com/0xsline/awesome-deepseek-harness/pull/717) | open、未合并 | 等维护者处理 |

## 1.73.5受控复核

固定[v1.73.5](https://github.com/dsh-market/dsh-market/tree/v1.73.5)为`d797f38834c53a97a5827651f60ab35a461b44d3`，官方tgz SHA-256为`b6fc317d4bc4d982aeeaab7d9f1647cece36c50f25ce796150074c8ccd75ccec`，integrity/shasum已核。未经修改的发布文件使用自有profile、journal、合成包及loopback；未使用真实账户或包管理器。

- **#928六组对照：** failed或缺bundle保留journal；client-only无需bundle，完整组合可结束，无journal不调用manager。具体错误仍退化成refused the reinstall (failed)，启动出口仅打印恢复/待处理总数，无每包reason。这是函数/源码核对。
- **#1047八组对照：** latest成功或失败后packument成功均固定2.0.0；两次失败时install裸包名且无专门警告，update使用@latest并记录warn；显式版本保留。请求数、等待策略不变。真值来自受控边界，不证明真实安装、pnpm等待期或GUI结果。

2026-10-29的1.73.3 Desktop两次重启未自愈，移除→重装的卸载HTTP45秒未返回；这些仅为历史。完整实验见`10213c0:docs/upstream-verification.md`，原始回执在`tmp/rc5-review-20261030/`。本次只读取公开状态；反馈、新issue/PR及账户/模型操作另取授权。
