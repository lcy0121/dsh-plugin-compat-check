# dsh-plugin-compat-check

检查**已安装的DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制。声明放行、激活或无发现不等于业务正常。[Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)

**简体中文** | [English](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.en.md) | [한국어](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/README.ko.md)

## 版本与入口

本分支版本为 **0.2.7**。单个源码文件超过 2 MiB 时，兼容性页保留其他检查结果；在对应插件的「覆盖限制」中可查看跳过的文件、大小与上限。覆盖不完整的报告不会推进基线。

已认证精确目录仍仅**0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3、0.2.1-rc.5、0.2.2-rc.1、0.2.2-rc.2、0.2.2-rc.3、0.2.2-rc.5**。Node `^22.19.0 || >=24`，宿主声明 `>=0.2.0-rc.2`；最低版本不认证未来宿主。

npm 插件提供面板、详情/角标、`compat_check` 和 skill。CLI、安装检查、批量、作者 CI 和健康执行器从仓库运行。npm 包没有 CLI bin。 详见[验收与发行回执](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/current-state.json)及[上游入口核验](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/upstream-verification.md)。

## 安装与使用

```sh
# 已发布的 npm 版本
dsh plugin --profile <profile> add dsh-plugin-compat-check@latest
# 或从已核验摘要的完整归档安装
dsh plugin --profile <profile> add file:/绝对路径/dsh-plugin-compat-check-0.2.7.tgz
```

在安装所用profile的DSH中打开：**左下角“更多”（⋯）/用户头像 → 设置 → 内置插件 → 兼容性**。不默认是desktop；agent可调用`compat_check`。源码安装须[构建完整tgz](#从源码构建安装)。

### 界面各板块怎么用

界面语言默认跟随宿主，可切换中文/English/한국어；未知语言回退英文，偏好仅存本机。切换保留筛选与草稿，原始证据、人工依据、命令及JSON不翻译。

| 板块 | 操作 |
|---|---|
| 主结果 | 核对目标、时间/缓存及目录，重新检查、搜索/筛选并展开发现。故障报告先预览再复制，保留覆盖限制和未认证提示。 |
| 依赖关系与潜在影响 | 展开服务依赖、候选提供者和路径；声明/loader状态不证明实际提供或故障传播。 |
| 发现的人工处置 | 从发现定位编辑区，填写状态和依据并显式保存；可返回对应发现。 |
| 升级前兼容性预检（静态） | 输入精确目标版本运行比较，不安装或升级宿主。 |
| 高级工具 | 按需加载处置归档、保存/对照历史报告或导入健康JSON；不自动执行、采集或上传。 |
| 页尾检查信息 | 查看工具版本、采样与对象来源。 |

辅助区默认收起，明细每页50项、窄表横滚，筛选不裁完整导出；详情/角标只显示单插件。401时重开宿主登录入口，不分享登录URL/Cookie。

### 人工处置与历史记录

核实源码及“下一步”，选择待确认/已复核/误报/已修复，填写依据并保存。源码、目标或证据变化须重审。重载前保存或复制草稿。

归档先备份。于高级工具显式保存快照并选择两份比较。容量和身份规则见[指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md#人工处置归档与本地历史报告)。

## 界面示例

0.2.6 在 DSH 0.2.2-rc.5 的中文界面，2026-11-20 摄于 GitHub Actions Linux 的自有回归 profile。数字对应本次合成样本。

![0.2.6 在 DSH 0.2.2-rc.5 的主结果与覆盖限制](https://raw.githubusercontent.com/lcy0121/dsh-plugin-compat-check/main/plugin/assets/compat-overview-0.2.6.png)

## 从源码构建安装

根目录是private工作区；检出main或所需提交，在根安装依赖后打完整包：

```sh
npm ci --ignore-scripts
cd plugin
npm pack --pack-destination <已存在的绝对输出目录>
dsh plugin --profile <临时profile> add file:<生成的tgz绝对路径>
```

prepack同步skill、契约、客户端、内核及许可证；postpack清理暂存内核。根GitHub spec、裸plugin复制或源码file安装不能替代完整tgz；重新打包不继承旧归档验收。

## 升级与仓库工具

调用`compat_check({"upgradeTo":"0.2.2-rc.5"})`，当前版本取宿主，返回upgradePreview、report为null。八个登记精确版本可任意比较，未知版本/范围退出3。只做同组私有字节的静态比较，不安装或升级宿主，也不借用probe、豁免或普通基线；预检0/1/2表示无/非致命/致命新增或变重风险，3为无法预检，0仍可有旧风险。

CLI、批量、作者CI及健康执行器从仓库运行，使用见[指南](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/guide.md)与[作者CI](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/author-ci.md)。契约/待办见[Plan](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/Plan.md)，构建及目录治理见[维护流程](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/docs/maintaining.md)。certainty与impactBasis独立；未观测不等于缺失，coverage/vacuous必须保留。Windows与一般业务未获认证。

## License

[MIT](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/LICENSE) · [第三方依赖与许可证](https://github.com/lcy0121/dsh-plugin-compat-check/blob/main/THIRD_PARTY_NOTICES.md)，均随npm包提供。
