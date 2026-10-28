# dsh-plugin-compat-check

检查**已安装DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制；声明放行、激活或无发现不等于业务正常。欢迎 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)。

[简体中文](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.md) | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.ko.md)

**0.2.0**整合统一界面、中英韩国际化、轻量化、人工处置归档及历史对照，保留rc.3适配、升级预检、参数语义与边界加固。Node `^22.19.0 || >=24`，宿主声明`>=0.2.0-rc.2`；已认证精确目录仍仅**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，最低版本声明不认证未来宿主。

![历史详情页示例，不代表当前制品或业务验收](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-detail-partial.png)

## 安装与使用

```sh
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

安装registry可用版本。安装后，在使用该profile的DSH主界面中打开：

**左下角“更多”（⋯）或用户头像（账号菜单） → 设置 → 内置插件 → 兼容性**。

“更多”指左下角的账号入口；进入“内置插件”后选择“兼容性”页签。请确认正在使用安装本插件的profile，不默认是desktop。agent也可调用`compat_check`。

### 界面各板块怎么用

界面支持**中文、English、한국어**，默认跟随宿主；在主结果的“界面语言”中切换或恢复“跟随宿主”，偏好仅存本机，未知语言回退英文。固定文案、已知内置说明及故障报告模板/核实建议同步翻译，复制与预览一致；原始证据、人工依据、命令和JSON保留原文，切换不重置筛选或草稿。

| 板块（从上到下） | 用途与操作 |
|---|---|
| **兼容性检查（主结果）** | 核对对象/目标DSH、时间、缓存及结论，点“重新检查”更新；搜索/组合筛选后展开发现、覆盖限制和下一步。“预览故障报告”供检查敏感信息后复制分享；“报告与证据说明”解释确定性及实测/推断。未认证警告直接显示。 |
| **依赖关系与潜在影响** | 按需展开插件/loader、服务依赖、候选提供者及路径；声明、loader状态、环/路径仅供排查，不证明服务可用或故障传播。 |
| **发现的人工处置** | 从发现旁“核实与人工处置”定位编辑区，填写状态与依据并保存；“返回主结果”跳回对应发现。只看本次结果时可跳过。 |
| **升级前兼容性预检（静态）** | 展开，输入目标DSH精确版本，再点“运行升级预检”；不安装或升级DSH，无新增风险不代表业务通过。 |
| **高级工具（默认收起）** | “人工处置记录管理”加载容量/归档；“本地历史报告与趋势”保存、检索及对照快照；“功能健康检查”导入外部JSON。均须显式操作，不自动采集、执行、安装或上传。 |
| **报告说明与检查信息（页尾折叠）** | 查看工具版本、采样和对象来源；目录身份在主结果中核对。 |

辅助表默认收起，使用带文字的“展开/收起”；主表、关系表、发现及预检明细每页50项，窄容器横滚，筛选/分页不裁剪完整导出。详情/角标显示单插件，完整列表在兼容性页。身份校验失败时重开宿主提供的登录入口，勿分享登录URL/Cookie。“本次新增风险”须有可比基线；首次/不完整检查无基线不等于无风险，vacuous也不等于业务通过。

### 人工处置与历史记录

1. 展开发现，按源码位置及“下一步核实”调查，再点“核实与人工处置”。可按插件/人工状态筛选；关联按报告/发现身份，不依赖排序或页码。
2. 选择**待确认 / 已复核 / 误报 / 已修复**，写清步骤、实际结果和依据，点“保存人工处置”并等待成功提示。已复核仅表示人工检查过。条目较多时点“显示更多处置”，旧依据可展开查看。
3. 修改代码/配置后重新检查。人工状态不隐藏风险、不改结论/退出码/基线，也不授予豁免；身份变化后的旧记录需要重审。

未保存草稿仅保留当前页面会话，筛选/同报告轮询不清空输入；身份变化标为过期并禁止保存，可复制后重核或放弃。刷新网页/离开/卸载前先保存或复制，草稿不落盘。

高级工具按需加载：活动处置限1 MiB/1000条，归档需确认且先完整备份；归档全部也移走当前已保存状态。每目标最多100份，导入/恢复只供参考，核实当前发现后另存。历史快照在更新前后显式保存、选择两份对照；目标/原路径、DSH、工具、采样、规则及目录一致才判方向，证据减弱不称修复。每目标20份、单份8 MiB、总64 MiB；满额先导出再显式删除，无自动轮转。导出先预览，路径/依据可能敏感，摘要不是签名，历史不认证当前业务。

[使用指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md)集中列出存储路径、操作边界和预算。

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
