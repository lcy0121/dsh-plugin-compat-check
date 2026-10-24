# dsh-plugin-compat-check

检查**已安装DSH插件**与目标版本的兼容性，提供源码位置、依据及覆盖限制。声明放行、激活或无发现不等于业务正常。欢迎 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)。

[简体中文](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/README.md) | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/README.ko.md)

已发布**0.1.6**为元数据补丁，保留0.1.5功能；本说明随**0.1.7-dev源码**维护，新增修复和rc.3适配尚未发布npm版本，源码版本真源仍为0.1.6。Node `^22.19.0 || >=24`，宿主声明`>=0.2.0-rc.2`；已认证精确目录仍仅**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，最低版本声明不认证未来宿主。[Plan](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/Plan.md)记录契约与待办。

![历史详情页：源码位置、影响与依据，不代表当前源码验收](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

## 安装与使用

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

此命令安装registry版本。源码在DSH 0.2.1-rc.3的入口：**左下角账号菜单 → 设置 → 内置插件 → 兼容性**。选择实际profile，不默认desktop；agent可调用`compat_check`，skill provider指导读取同一报告。

面板提供筛选/折叠、完整报告预览与显式复制、基线新增风险和核实建议。依赖图展示潜在关系，人工记录不改判定，健康页只导入历史JSON。分享前预览敏感信息；筛选不会裁剪完整导出，不自动发帖。[使用指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/guide.md)给出操作、缓存、锁恢复与资源限额。

## 升级前兼容性预检

面板输入目标版本，或调用`compat_check({"upgradeTo":"0.2.1-rc.3"})`；当前版本取运行宿主，结果为独立`upgradePreview`，普通`report`为null。两端支持上述三个精确版本的任意比较，未知版本/范围返回`unsupported-version`及退出3，不回退目录。例如rc.2→rc.3可比较，rc.4未认证。

预检对同组私有字节静态比较，不执行插件、安装/升级宿主，不使用运行时、probe、豁免或普通缓存/基线，不写产品状态。**0/1/2只表示无/非致命/致命新增或变重风险，3表示无法预检**；0仍可能有旧问题，不证明升级后业务通过。[完整契约](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/Plan.md#27-升级前静态预检契约)。

## 从源码构建安装

仓库根是private工作区；使用0.1.7-dev能力须检出该分支，在根安装依赖再构建完整tgz：

```bash
npm ci --ignore-scripts
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack同步权威skill/契约并暂存共享kernel、LICENSE和第三方说明，postpack清理kernel。根GitHub spec、裸`plugin/`复制或源码file安装不能代替完整tgz。

npm包**没有CLI bin**，不支持`npx dsh-plugin-compat-check`。CLI、安装检查、静态批量、[作者CI](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/author-ci.md)、健康执行器及真实回归仅在[仓库](https://github.com/lcy0121/dsh-plugin-compat-check/tree/0.1.7-dev)提供。安装检查/probe-boot会执行目标，健康执行器默认review、显式run才执行；均须相应执行授权，临时profile不是OS沙箱。

## 判定与边界

- 当前profile只采样服务描述符，不执行getter；其它profile不用当前宿主服务。省略键/未观测不等于缺失，提供声明不证明实际提供。
- 有界AST/值流不执行目标源码；动态覆盖有限。保留`certainty`、`impactBasis`、`coverage`、`vacuous`；源码位置须真实存在，无发现/覆盖完整不证明业务正常。
- 普通体检默认写隔离基线，不完整扫描不推进。当前源码保留旧/损坏基线原件，不自动覆盖；恢复按指南处理。普通CLI需禁读写时用`--no-baseline`，升级预检始终隔离基线。
- 普通检查的未知/未来版本回退及自定义目录均保留未认证提示，内置目录摘要漂移失败。新目录须按[维护流程](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/maintaining.md#api目录候选审查)审查；客户端业务另验收。

macOS/Linux仅有[记录范围内的证据](https://github.com/lcy0121/dsh-plugin-compat-check/blob/0.1.7-dev/docs/current-state.json)，Windows未真实验收。历史结果不认证当前源码或未来制品。

## License

[MIT](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/LICENSE) · [THIRD_PARTY_NOTICES.md](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/THIRD_PARTY_NOTICES.md)，两者随npm包提供。
