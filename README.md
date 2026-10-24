# dsh-plugin-compat-check

检查**已安装的DSH插件**与目标版本的兼容性，提供源码位置、依据和覆盖限制。声明放行、激活或无发现不等于业务正常。欢迎 [Star ⭐](https://github.com/lcy0121/dsh-plugin-compat-check)。

**简体中文** | [English](README.en.md) | [한국어](README.ko.md)

## 版本与入口

已发布 **0.1.6** 为元数据补丁，保留0.1.5功能；当前 **`0.1.7-dev` 源码（含rc.3适配）尚未发布npm版本**，版本真源仍为0.1.6。Node `^22.19.0 || >=24`，宿主声明 `>=0.2.0-rc.2`；已认证精确目录仅 **0.2.0-rc.2、0.2.1-rc.2、0.2.1-rc.3**，最低版本声明不认证未来宿主。

npm插件提供兼容性页、详情/角标、`compat_check`与skill。仓库另有CLI、安装检查、静态批量、作者CI和健康执行器，共享内核。npm包无CLI bin，不支持`npx dsh-plugin-compat-check`。[Plan](docs/Plan.md)维护契约与待办，[docs/current-state.json](docs/current-state.json)记录限定验证。

## 界面示例

历史截图展示呈现方式，不代表当前源码或业务已验收：

![部分可用：源码位置、影响与依据](plugin/assets/compat-detail-partial.png)
![声明冲突：区分工具推断与宿主提示](plugin/assets/compat-detail-declared.png)

## 安装与使用

```bash
dsh plugin --profile <profile> add dsh-plugin-compat-check
```

DSH 0.2.1-rc.3：**左下角账号菜单 → 设置 → 内置插件 → 兼容性**。选择实际profile，不默认desktop；agent可调用`compat_check`。面板支持筛选、折叠、完整报告预览/复制和基线新增风险；依赖图仅表示潜在关系，人工记录不改判定，健康页只导入历史JSON。[使用指南](docs/guide.md)说明操作与限制。

## 仓库CLI

使用本分支源码能力：

```bash
git clone --branch 0.1.7-dev https://github.com/lcy0121/dsh-plugin-compat-check.git
cd dsh-plugin-compat-check
npm ci --ignore-scripts
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --no-baseline
node bin/compat-check.mjs --help
```

| 选项 | 作用 |
|---|---|
| `--nm <dir>` | 目标profile或node_modules；必需 |
| `--dsh-version <v>` | 目标DSH版本；预检中为当前版本 |
| `--probe <json>` / `--probe-boot` | 读取观测 / 经授权启动临时宿主 |
| `--json` / `--quiet` | 完整JSON / 总结行 |
| `--no-baseline` / `--dry-run` | 禁读写基线 / 比较但不写 |
| `--baseline-file <path>` | 自定义基线位置 |
| `--issue-report` | 可分享Markdown；预览后自行分享 |
| `--rules <json>` / `--catalog <json>` | 覆盖规则 / 参考目录 |
| `--help` / `--version` | 完整帮助 / 工具版本 |

默认静态分析不执行插件、不联网，普通检查默认写自身基线；一次性检查用`--no-baseline`，不完整扫描不推进。`--probe-boot`及`node bin/check-install.mjs <spec> --json`会安装/执行目标，须明确执行授权；临时profile不是OS沙箱。完整参数以`--help`为准。

## 升级预检与作者工具

面板输入目标版本，或调用`compat_check({"upgradeTo":"0.2.1-rc.3"})`；agent当前版本取宿主，结果为`upgradePreview`。CLI须提供两个精确版本：

```bash
node bin/compat-check.mjs --nm ~/.dsh/profiles/<profile> --dsh-version 0.2.1-rc.2 --upgrade-to 0.2.1-rc.3 --json
```

支持上述三个精确版本的任意比较；例如0.2.1-rc.4返回未认证/退出3。预检对同组私有字节静态比较，不执行/升级宿主，不使用运行时、probe、豁免或普通基线；**0/1/2仅表示无/非致命/致命新增或变重风险，3表示无法预检**。0仍可能保留旧问题，不证明目标可用；见[预检契约](docs/Plan.md#27-升级前静态预检契约)。

仓库的[作者CI](docs/author-ci.md)提供版本矩阵、风险/覆盖门禁及JSON/SARIF/JUnit/HTML；[指南](docs/guide.md#升级预检与有限批量)提供固定静态批量。健康执行器默认只审阅，显式`--run`须获当次执行授权。独立skill安装见[skill说明](skill/README.md)。根工作区不是插件包，源码安装须按[打包步骤](plugin/README.md#从源码构建安装)生成完整tgz。

## 结果与验证

普通CLI退出码：**0未发现冲突、1部分可用或未知、2不兼容、3工具/输入错误**；安装检查的2还可能是peer闸门拒绝。保留`certainty`、`impactBasis`、`coverage`、`vacuous`；未观测不等于缺失，静态事实不等于实测影响，客户端业务需另验收。旧/损坏基线保留原件，不自动覆盖。分享前预览，脱敏不保证任意文本无秘密，导出不自动发帖。

```bash
npm test
npm run check
node plugin/scripts/prepublish-check.mjs
node tools/meta-check.mjs --json
```

默认测试不启动真实DSH/模型，打包回归需要registry；`check`核对格式、文档/生成副本、语法与目录。发布前检查不发布；元数据核验需gh/npm和网络，取数失败不算通过。macOS/Linux仅有记录范围内证据，Windows未真实验收。

[规则](rules/README.md) · [维护与目录治理](docs/maintaining.md) · [当前证据](docs/current-state.json)。

## License

[MIT](LICENSE) · [第三方依赖与许可证](THIRD_PARTY_NOTICES.md)。
