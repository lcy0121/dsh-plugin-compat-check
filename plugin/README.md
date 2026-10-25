# dsh-plugin-compat-check

检查**已安装DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制；声明放行、激活或无发现不等于业务正常。欢迎 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)。

[简体中文](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.md) | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.ko.md)

**0.1.7**提供rc.3适配、升级预检、参数语义与边界加固。Node `^22.19.0 || >=24`，宿主声明`>=0.2.0-rc.2`；已认证精确目录仍仅**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，最低版本声明不认证未来宿主。

![历史详情页示例，不代表当前制品或业务验收](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

## 安装与使用

```sh
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

安装registry可用版本。DSH rc.3入口：**左下角账号菜单→设置→内置插件→兼容性**；选择实际profile，不默认desktop。agent调用`compat_check`，skill指导读取同一报告。

面板支持筛选、折叠、完整报告预览/显式复制及基线新增风险。依赖图仅表示潜在关系，人工记录不改判定，健康页只导入历史JSON；分享前预览，筛选不裁剪完整导出，不自动发帖。[使用指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md)说明操作和预算。

## 升级前兼容性预检

输入目标版本或调用`compat_check({"upgradeTo":"0.2.1-rc.3"})`；当前版本取宿主，返回upgradePreview、普通report为null。三个登记精确版本可任意比较，未知版本/范围退出3，不借邻近目录认证。

只静态比较同组私有字节，不安装/升级宿主或使用运行时、probe、豁免、普通缓存/基线。**0/1/2表示无/非致命/致命新增或变重风险，3表示无法预检**；0仍可有旧问题。[完整契约](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md#27-升级前静态预检契约)。

## 从源码构建安装

根是private工作区，检出main或所需版本后构建完整tgz：

```sh
npm ci --ignore-scripts
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack同步skill/契约并暂存内核、LICENSE和第三方说明，postpack清理内核。根GitHub spec、裸plugin复制或源码file安装不代替完整tgz。

npm包**没有CLI bin**，不支持`npx dsh-plugin-compat-check`。CLI、安装检查、静态批量、[作者CI](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/author-ci.md)和健康执行器从仓库运行；安装/probe-boot/健康run会执行目标，须相应授权，临时profile不是OS沙箱。

## 判定与边界

保留certainty、impactBasis、coverage和vacuous。未观测不等于缺失，描述符采样不执行getter；其它profile不借当前宿主服务。动态分析覆盖有限，源码位置须真实，客户端业务另验收。

普通体检写自身隔离基线，不完整扫描不推进；坏/旧基线保留原件，no-baseline禁读写。人工处置不授予豁免。rc.2/rc.3参数参考、弃用及生命周期提醒不证明实测失败/泄漏，不新增致命语义规则。

[Plan](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md)维护契约和待办，[维护指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/maintaining.md)说明目录认证。macOS/Linux仅有[限定证据及实际发布记录](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/current-state.json)，Windows未真实验收，历史结果不认证新制品。

## License

[MIT](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/LICENSE) · [THIRD_PARTY_NOTICES.md](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/THIRD_PARTY_NOTICES.md)，两者随npm包提供。
