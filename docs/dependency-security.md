# CI供应链与依赖公告检查

两个工作流统一使用下列40位commit；注释用于审阅，执行依据为commit。2026-10-22逐一核对官方仓库commit、发布页及固定commit的`action.yml`：

| Action          | 固定commit                                 | 官方来源                                                                                                                                                                           |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout        | `3d3c42e5aac5ba805825da76410c181273ba90b1` | [v7.0.1发布](https://github.com/actions/checkout/releases/tag/v7.0.1)、[commit](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1)               |
| setup-node      | `949feb2413d6458794dcd2491c4babbbce0c15c1` | [v7.1.0发布](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[commit](https://github.com/actions/setup-node/commit/949feb2413d6458794dcd2491c4babbbce0c15c1)           |
| upload-artifact | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | [v7.0.2发布](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)、[commit](https://github.com/actions/upload-artifact/commit/cf430e030ddbb5b0abf93d22962f4752f3646cd9) |

工作流仅申请`contents: read`；所有checkout关闭`persist-credentials`，每个job设置timeout，所有制品保留7天。安装仓库依赖统一使用`npm ci --ignore-scripts --no-audit --no-fund`。依赖公告检查在独立的Node24 job执行一次，不复制到Node测试矩阵。静态批量工作流仍由作者手动触发。

## 本地复现与覆盖边界

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run security:dependencies
node --test test/dependency-security.test.mjs
```

[检查程序](../tools/dependency-security.mjs)分别处理两张依赖图：

- `workspace-lock`：根目录冻结的`package-lock.json`，包括开发、可选与peer依赖，不读取已安装的`node_modules`。
- `plugin-runtime`：当前plugin没有独立lock；只复制其runtime manifest字段到专属临时目录，以`npm install --package-lock-only --ignore-scripts --no-audit --no-fund`生成lock，审计当前公共registry解析出的依赖图。它独立读取plugin pins，不用根目录的同名依赖代替。若以后添加plugin自己的lock，则复制并审计该冻结图（包括其中dev依赖）。

两者均先检查manifest的dependencies/devDependencies/optionalDependencies/peerDependencies声明与lock根记录一致，陈旧lock返回工具错误。证据记录实际被审计manifest及lock的SHA-256；临时解析manifest只保留依赖字段，不携带lifecycle脚本。检查完成或失败后清理专属临时目录，不写回源码manifest、lock或安装包。

审计实际执行`npm audit --package-lock-only --ignore-scripts --json --include=dev --include=optional --include=peer --audit-level=info`，registry固定为公共npm。所有严重级别公告都阻断；未知级别也不能通过。不会执行`audit fix`或使用公告豁免。每次npm子进程默认最多120秒，网络请求最多45秒、不自动重试，stdout/stderr各受4MiB进程缓冲预算约束。`--timeout-ms`可缩短单次期限，最大120000。

退出0表示这两张图在本次registry公告数据中未发现漏洞；退出1表示有公告；退出2表示网络、npm异常、超时、JSON/schema、manifest/lock不一致或证据写入失败。网络失败不会转为绿色。修复时先阅读公告URL和受影响依赖路径，选择兼容版本，显式更新manifest/lock，再执行测试与复审；本流程不自动处置公告。

默认输出`dependency-security.json`（可用`--output`改路径），保存目标、图来源、摘要、状态、依赖名、公告source、lock内路径、实际版本、severity、影响range及公共GitHub公告URL。只保留白名单字段、去除控制字符和URL查询/凭据，不存原始npm响应或stderr；每个目标最多1000条明细，单字段最多256字符，截断标记不会改变阻断结果。已脱敏的制品仍应在对外分享前审阅。

## CI兼容与结果解释

[GitHub已于2026-09-23移除Action的Node20运行时](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/)。原有v4 pins虽然来源属实，但其`action.yml`声明Node20；本次统一更新到上表官方稳定发布。固定commit的`action.yml`均声明Node24，并保留当前所用inputs（[checkout](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)、[setup-node](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/action.yml)、[upload-artifact](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml)）。这是Action运行时，与测试矩阵Node22.19/24及审计Node24不同。

当前使用GitHub托管`ubuntu-latest`。自托管runner至少需支持Node24（checkout文档要求runner 2.327.1以上；从Docker容器调用认证git命令另需2.329.0以上，本流程不使用该路径）。checkout v7对`pull_request_target`和`workflow_run`的fork保护不影响当前push/pull_request/workflow_dispatch触发器。setup-node v7迁移到ESM；当前只设置node-version和既有的显式npm cache，不设置registry-url/认证token。独立审计与静态批量显式设置`package-manager-cache: false`，维持其无持久缓存约定。upload-artifact v7的archive默认true，继续生成既有ZIP制品，支持name/path/if-no-files-found/retention-days输入；不扩大权限、不启用隐藏文件。上述兼容依据分别见[checkout说明](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1)、[setup-node说明](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/README.md)、[upload-artifact说明](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/README.md)。

本地子进程测试覆盖干净结果、独立plugin pin、各级别公告、未知级别、陈旧root/plugin lock、JSON/schema错误、registry错误、异常退出和受控超时。测试只替换npm联网子进程，真实执行wrapper、证据生成和临时目录清理。本地成功不能代替改动后远端Actions执行，也不证明未来registry状态或其他操作系统已验收。

相关npm语义见[官方audit说明](https://docs.npmjs.com/cli/v11/commands/npm-audit/)：lock-only使用锁文件，include优先于omit，audit-level控制退出阈值而不筛掉报告内容。
