# dsh-plugin-compat-check

检查**已安装DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制；声明放行、激活或无发现不等于业务正常。欢迎 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)。

[简体中文](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.md) | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.ko.md)

**0.1.7**提供rc.3适配、升级预检、参数语义与边界加固。Node `^22.19.0 || >=24`，宿主声明`>=0.2.0-rc.2`；已认证精确目录仍仅**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，最低版本声明不认证未来宿主。

![历史详情页示例，不代表当前制品或业务验收](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

## 安装与使用

```sh
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

安装registry可用版本。安装后，在使用该profile的DSH主界面中打开：

**左下角“更多”（⋯）或用户头像（账号菜单） → 设置 → 内置插件 → 兼容性**。

“更多”指左下角的账号入口；进入“内置插件”后选择“兼容性”页签。请确认正在使用安装本插件的profile，不默认是desktop。agent也可调用`compat_check`。

### 界面各板块怎么用

以下按仓库中**尚未发布的0.1.8开发界面**说明；已发布0.1.7的布局和按钮可能不同。

| 板块 | 用途与操作 |
|---|---|
| **兼容性检查（主结果）** | 先看结论数量、检查对象/目标DSH、报告时间和缓存状态；点“重新检查”更新报告。用搜索、结论/确定性/验证状态筛选定位插件，再展开该行的“发现与未验证项”和“覆盖限制”阅读位置、依据及下一步核实。主表每页50行，可用“上一页/下一页”翻页。 |
| **故障报告** | 点“预览故障报告”查看本次完整文本，核对敏感信息后点“复制报告”，再自行分享。筛选和分页不会删减导出内容，也不会自动发帖。 |
| **升级前兼容性预检（静态）** | 点“展开”，输入目标DSH精确版本，再点“运行升级预检”；查看新增/变重风险、旧问题及覆盖限制。只做静态预测，不会安装或升级DSH，预测无新增风险也不代表业务通过。 |
| **依赖关系与潜在影响** | 按需展开“插件及 loader 条目”、服务依赖、候选提供者和影响路径等表格；大表每页50行。用于排查关联线索，候选声明、loader状态和路径不等于实际服务可用或故障传播。 |
| **发现的人工处置** | 给已核实的发现选择人工状态、填写“核实依据”，再点“保存人工处置”。适合分批排查、记录误报原因或修复验证；具体步骤见下文。 |
| **功能健康检查（独立实测记录）** | 用仓库中的健康执行器生成JSON后，通过“导入功能健康检查记录”选择文件，查看历史实测结果及制品身份。没有记录可跳过；面板只读取文件，不启动检查、安装插件或上传记录。 |
| **报告说明与检查信息** | 阅读确定性、实测/推断和覆盖边界；展开“查看采样与检查信息”核对观测与对象来源。主结果中的“查看已认证目录与来源”可核对目录身份；未认证时直接显示警告。 |

辅助大表默认收起，点带文字的“展开/收起”按钮切换；内容滚入视区时按需加载，窄容器内的大表可横向滚动。插件详情中的结论/角标用于查看单个插件，完整列表和筛选位于上述“兼容性”页。

“本次新增风险”依赖可比较的历史记录；首次检查或覆盖不完整时可能尚无记录，这不表示没有风险。“可用”且“无已验证调用”也不等于业务已验收。

### 人工处置的填写示例

1. 在主结果中展开一条发现，按其位置和“下一步核实”检查实际情况。
2. 滚动到“发现的人工处置”，找到同一插件；“发现1、2……”对应主结果中该插件发现的排列顺序。选择**待确认 / 已复核 / 误报 / 已修复**，填写“核实依据”。例如，确认误报后写明测试步骤、实际表现和原因；修复后写明改动与复测结果。“已复核”只表示人工检查过，不自动表示通过。
3. 点**“保存人工处置”**，看到“人工处置已保存”才表示记录成功。条目较多时点“显示更多处置”；需要回溯时展开旧处置摘要或“历史处置完整依据”。

记录保存在本机，供后续排查参考；源码、版本或证据变化后可能显示“待重审”，旧依据保留为历史。**标记误报或已修复不会隐藏发现、修改兼容性结论/退出码/基线，也不授予豁免**；更新代码或配置后应重新检查。只想看本次结果时，可以跳过人工处置。

[使用指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md)提供详细操作、证据边界和预算。

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
