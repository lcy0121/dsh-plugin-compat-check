# Plan.md — dsh-plugin-compat-check 开发计划与作业规程

> **2026-10-15 状态更新：0.1.1 本地重构已实施，尚未发布。** 本文件统一记录当前契约、施工摘要和后续计划：§8为现状与已完成工作，§9为待办及验收条件；统计由 [current-state.json](current-state.json) 生成。使用方法与目录结构见 [仓库README](../README.md)。下文§0–§7、§9.1保留历史施工记录，旧正则、固定临时目录、升级视为变好、npm同时提供CLI等决定已被§8替代，历史“实测”不代表当前版本已做真实启动验证。[原始GPT审计](GPT审计及重构方案文档.md) 保留以追溯问题；代码路径相对仓库根。


> **这份文档是写给"未来的自己"看的。** 一次会话结束，上下文就没了：为什么否掉方案 B、
> 哪条路踩过坑、某个结论是实测的还是猜的 —— 全部蒸发，留下的只有仓库里的文件。
>
> 所以本文件不是备份，是**把上下文变成可执行资产**。硬标准：**每一步都要带"怎么验证它做完了"的
> 命令**，而不是只写意图。**每完成一步就回来更新，不更新的计划等于没有计划。**

**职责边界**（避免同一件事写四遍然后各自腐烂）：

| 内容 | 写在哪 |
|---|---|
| 决策、风险、作业规程、里程碑状态、环境事实 | **本文件** |
| 提取器缺陷的最小复现 | `docs/extraction-findings.md` |
| 结构树、用法、目录说明 | 三份 `README` |
| 做过什么（时间顺序） | `git log`（**本文件不抄**） |

**「文档信息」= 那 7 份文件 + 仓库的对外面孔。** 后者容易漏，所以有独立的自检：

| 自检 | 盯什么 | 命令 |
|---|---|---|
| `test/docs.test.mjs` + `tools/doc-check.mjs` | 7 份文件里的**可复算数字**与交叉引用 | 离线，进发布闸门 |
| **`tools/meta-check.mjs`** + `test/meta-check.test.mjs` | **GitHub 简介/标签/主页 · npm 的 version/keywords/README** | **联网**，不进闸门 |

> ⚠️ **这个边界是踩出来的**：GitHub 简介曾挂着「在**安装前**判断…」很久，而
> `README.md:44` 与 §1 明写禁止那句话 —— 此前几轮核查**一次都没扫到**，
> 因为范围只限定在仓库内的 7 份文件里。同一天还发现 `plugin/README.md`（= npm 页面）
> 的示例过期。**元数据与包页面也是文档，也会腐烂。**

---

## 0. 怎么用这份文档

1. 先读 §1、§2 —— **这些不要重新讨论**，重新讨论等于把用户的回答作废。
2. 动手前读 §4（作业规程），每条都是踩坑换来的。
3. 从 §9 找下一个动作，按它的验收命令做完。
4. 遇到"这个结论我是猜的"，回 §3 确认它是否已被列为已知假设。
5. **测试分三层，改代码时三层都要过**：不变式（`test/invariants.test.mjs`）
   → 判据（`test/__expectations__/`）→ 快照（`test/__snapshots__/`）。
   - **不变式**回答「自恰不自恰」，**永远不该重建**（不可再生，所以也无法被"重建到全绿"）
   - **判据**回答「结论是不是我们要的那个」，改它必须说得出理由
   - **快照**回答「变了没有」，是唯一能看见"**停止做出某个结论**"的一层
   > 实证：注入「fallback 永不触发」这个变异，**69 条不变式全绿、快照立刻变红**；
   > 反过来清空某插件的 `calls` 时快照红而不变式不红。**两层都必须有。**
6. **重建快照**：`UPDATE_SNAPSHOTS=1 node --test test/snapshot.test.mjs`，重建前先读差异。
   基准版本变化会报成 `BASELINE_DRIFT`，要求**单独提交一次**并同步改 §5 —— 不要顺手盖掉。
   为什么用环境变量而不是 `--update`：`node --test x.test.mjs --update` 会把 `--update`
   当成测试文件名，旗标从未生效而退出码正常（又一类「静默空操作」）。

---

## 1. 产品定义（历史决策，现行契约见 §8.3）

**一句话**：让 DSH 使用者知道自己**已经装了的**插件跟**当前 DSH 版本**是否兼容；
不兼容的，给出**位置**和**原因**。

### 1.1 三份产物，一个产品

用户原话：「它们是一个产品的不同角度而已」。**一份 Node 判定内核，三个入口。**

| 能力 | 插件（进程内） | 脚本（仓库内 `node bin/…`） | skill |
|---|---|---|---|
| 体检已装插件的宿主层 | 主职 | 可以：`--probe-boot` 起一次性 profile 拿运行时面，**实测 ~9 秒（parityfix）/ ~18 秒（desktop）** | 不实现，只教 agent 何时调用 |
| 体检客户端半边 | ✅ 独有 | ❌ 命令行永远看不到 | ❌ |
| 预检尚未安装的插件 | ❌ 被只读约束排除 | ✅ 独有 | ❌ |
| 「装不上」（闸门拒绝）类结论 | ❌ | ✅ 独有 | ❌ |
| 宿主起不来时仍能工作 | ❌ 它自己也在里面 | ✅ 独有 | ❌ |
| 身份核对（npm 包属于谁） | 默认关闭（不联网） | ✅ | ❌ |

**最后两行是重点：插件的能力严格弱于脚本，不是超集。** 文案里不能出现"本插件帮你做安装前检查"。

> ⚠️ **发布到 npm 的那个包只有插件半边，没有 `bin`** —— 所以 `npx dsh-plugin-compat-check` **不可用**，
> 脚本要走 git clone。原因是脚本还依赖 `probe/`（`--probe-boot` 要用）与 `rules/`，
> 而 `files` 里只打插件需要的那部分。**决策 9 说的"npm 包仅提供插件；仓库分发 CLI"到 0.1.0 只做到一半** ——
> 这是已知的、有意的缺口，不是疏漏（要做成 npx 得把内核路径与探针一起重新组织）。

### 1.2 为什么有这个工具

| 你可能会以为 | 实际情况 |
|---|---|
| `peerDependencies` 写了支持 → 能用 | 声明可能是错的 |
| DSH 版本闸门放行了 → 能用 | 闸门只做字符串范围比对 |
| 启动没报错 → 能用 | 插件普遍 `try/catch` 降级，**API 缺失时它"激活成功"但功能是死的** |
| 启动日志干净 → 客户端也没问题 | 客户端跑在浏览器里 |

最后一行不是理论：桌面端日志（`~/Library/Logs/DeepSeek Harness/`，macOS）11 天内出现 3 份
web-boot 崩溃日志，其中一份正是 `Error: web boot: 2 entries did not activate`
（`dshmarket` 与 `@michengai/dsh-archive-manager`，**客户端 bundle 级联失败**）。

---

## 2. 已锁定的决策（10 题）

**不要重新讨论。** 每条附了当时否掉什么 —— 否掉的理由往往比选中的理由更值钱。

| # | 决策 | 锁定的答案 | 否掉了什么 / 为什么 |
|---|---|---|---|
| 1 | 安全边界 | 插件**严格只读**：不装包、不起子进程、不联网（需时显式开）、默认只碰当前 profile | 全放开：用户刚装进一个第三方插件，它转头去碰环境心理成本极高 |
| 2 | 覆盖范围 | 三层全覆盖：宿主未激活 / 静默降级 / 客户端半边。**分两批** | 只做宿主层：会漏掉"激活成功但功能是死的"，而那是唯一的卖点 |
| 3 | 结果入口 | **面板为主**（官方插件管理页），对话工具为辅，两者消费同一份 JSON | 只做对话工具：答案天然是一张表，塞进对话既占上下文又难扫 |
| 4 | 面板落点 | `settings.plugins.tab` 总览 + `plugins.detail.section` / `.badge` 单插件详情 | 右栏常驻标签页：用户在那个页面上本来就在看"我装了哪些插件" |
| 5 | 触发方式 | 启动后**延迟自动跑**；角标在**任何变化**时都打，并标明方向 | 纯手动：用户永远想不起来跑，而"想不起来"正是需求的原点 |
| 6 | 平台边界 | 内核移植到 Node（单一实现）；三产物跨平台。**验证范围**：主要服务 **macOS / Linux**；Windows **提供兼容**（纯 Node，无平台专有 API）但**不做本机验证**，交给用户 | 原先把 Windows 当"一等验证目标"，但本机没有 Windows 机器 —— 那条路只能靠代码审查，而**"审查过"与"验证过"不是一回事**。**把范围写清，比挂着做不完的缺口诚实** |
| 7 | 位置粒度 | 文件:行 + `服务.方法` + 形态标注。**真解析器是必须完成的最终状态** | 只到 `服务.方法`：用户无法验证我们凭什么判 |
| 8 | 原因与严重度 | 五元组（类别/位置/依据/严重度/影响面）+ 确定性标注；严重度由分层默认档 + 规则表定；**LLM 不参与判定** | 让 LLM 读代码给影响面：违背"不撒谎"这个唯一卖点 |
| 9 | 三产物关系 | 单仓库、单版本、**一份 Node 内核**、三个入口；npm 包仅提供插件；仓库分发 CLI（**「单版本」已落地**：`lib/version.mjs` 是唯一真源） | 三份独立实现：三套基线 → 同一插件在不同入口给出不同结论 |
| 10 | 交付方式 | **两条都通**：GitHub 分发 + **npm 已发布 `dsh-plugin-compat-check@0.1.0`（2026-10-12）** | 直接发 npm 太早：等它在三个回归基准上站稳再发。**现在站住了，所以发了** |

### 2.1 结论的数据形态（第 8 题的落地）

```
结论: 部分可用  dsh-keep-awake@0.2.0
     功能失效 / 宿主方法缺失  settings.register  @ lib/index.js:466
       影响（推断，非实测）: 插件的设置页/设置项会消失
       依据: 运行时里没有这个方法；规则表给出影响面
```

**两种可信度不同的东西**（`impactBasis` 字段）：

| | 是什么 | 谁确认的 |
|---|---|---|
| `basis`（依据） | 我们**量到**了什么 | 运行时面 + 源码行，可逐条复核 |
| `impact`（影响） | 用户会**失去**什么 | **标了「推断，非实测」的就是我们读出来的** |

- `measured` —— 有独立机器信号确认。目前只有「条目会停在 pending」这一类
  （宿主自己报 `fiber.state`，`tools/labels.mjs` 用合成正反例量过）
- `inferred` —— 其余全部

> ⚠️ 这段示例曾经是假的：它写「依据：该调用**不在** try/catch 内」，
> 而 `guardRegex` **根本没有** try/catch 感知，且真实的 `:466` **就在** try/catch 里。
> **结论对、依据是编的** —— 而依据看起来像量出来的，所以更隐蔽。

**`guardRegex` 认这四种形态**（去真实插件里 grep 出来的，不是凭印象写的）：

| # | 形态 | 例 |
|---|---|---|
| ① | 可选服务 | `svc?.method` |
| ② | 可选方法（实测最常见，最容易漏） | `svc.method?.(` |
| ③ | 显式能力检测 | `typeof svc.method === "function"` |
| ④ | 能力检测在**同文件的辅助函数**里 | `if (!canUse(svc)) return;` + 里面 `typeof svc.m === "function"` |

**try/catch 不算能力检测** —— 它是错误处理，不是"探测到没有就不调"。作者用 try/catch 兜住时
功能**确实**是死的（只是不会崩），照报是对的，但不能用"不在 try/catch 内"来论证。

**类别枚举**（插件侧；「安装闸门拒绝」已因第 1 题归脚本）：
① 宿主服务缺失 ② 宿主方法缺失 ③ 启动时条目未激活 ④ 客户端注册失败 ⑤ **声明与实测不符**

第 ⑤ 类是本工具相对既有方案**唯一不可替代**的结论：生态已在用 `engines.dsh` 和
`dsh.compatibility.dshReleases` 声明兼容性，**但没有任何人核对声明是否属实**。

**严重度的判定顺序**：先看运行时事实 → 再查表 → 最后落默认档。
- 条目 `FAILED`/`PENDING` → `fatal`（运行时事实，不需静态分析）
- `inject` 声明的服务宿主没有 → `fatal`（条目会停在 pending）
- `ctx.get('x')` 取不到 → `feature-dead`
- 方法不存在且不在表中 → `feature-dead` + **影响面未知**（这一档必须显眼，它是在承认规则表没覆盖到）

规则表：`rules/severity.json`；覆盖依据：`rules/usage-inventory.json`。

### 2.2 确定性的三档判据（A4b 实测换来的）

| 档 | 判据 | 例子 |
|---|---|---|
| **确定** | 服务名出现在 `inject: [...]` / `ctx.get("x")` / `ctx.inject(["x"])` 里 | `settings`、`sessions`、`tools` |
| **疑似** | 没有可信声明，但**在官方目录里** | `credentials`、`storageDomain` |
| **高概率假阳性** | 没有可信声明，且**不在官方目录里** | `parser`（被凑出 40 个假方法）、`logger` |

> ⚠️ 实测过两轮，结论相反：一轮"丢掉的 7 个全不在目录里"（硬过滤安全），
> 更早一轮"丢掉的 7 个里**有 3 个是真服务**"。这个比例**随提取器成熟度在变**。
> **分档依据是稳的，硬过滤是脆的** —— 所以规矩不变：可信声明只用来**分档**，不用来**删东西**。

**服务目录从哪来**：插件形态下运行时直接从 `ctx` 取；CLI 形态下从 `app.asar` 内
`@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js` 的 `SERVICE_API` 解析
（0.2.0-rc.2 有 91 个宿主服务）。**它随 DSH 版本变化。**

---

## 3. 我仍在承担的假设与风险

**做决定时撞上这些，先回来看一眼自己是不是在赌。**

| 风险 | 现状 | 处理 |
|---|---|---|
| ~~npm 发布不可撤回~~ | ✅ **已发布（2026-10-12）**：`dsh-plugin-compat-check@0.1.0`，shasum `aedbcfbc…`。从那以后**每个版本号只能前进**，发错了只能 `0.1.1` | 重新发布时按 §9 的清单做（改版本 → 跑闸门 → `npm publish`） |
| 角标的"变化疲劳" | 用户选了任何变化都打；插件升级、DSH 小版本都会改结论 | 第一版带方向标注先上，按真实频率再调 |

**已关闭的**（留档，别再当缺口）：

| 原风险 | 关闭理由 |
|---|---|
| 静默降级的检出率 | **不做，换成我们真能负责的指标**——那个分母**不属于我们**（见 §5.2 第 6 条） |
| 客户端"计划 vs 到货"对账无先例 | 到货侧用 CDP 网络域做成了（`tools/client-arrival.mjs`） |
| 没有 Windows 机器可验证 | 按第 6 题收窄验证范围 |
| Node 移植的验收标准是"输出一致" | 移植期结束，对拍降级为结构性体检（§6） |
| `plugins.detail.*` 未验证 | 它不是抽屉，是侧栏面板换 React 视图状态，已实测 |

---

## 4. 作业规程（每次动手都要遵守）

1. **对拍优先于修改。** 移植/重构内核时先拿到"两边输出一致"，再谈改。对拍脚本
   `tools/parity/parity.sh` **从 `.sh` 里现抽 python 源码**来跑 —— 不要用副本，副本会无声漂移。
2. **对拍回答"是否一致"，fixture 回答"是否都对"。** 两者都需要：参考实现自己挂着时，
   我一度以为是移植写错了。
3. **任何改变输出的改动，都要把差异摊开给用户看**，而不是直接改到"看起来更对"。
4. **确定性标注不是可选项。** 只要调用点来自正则就必须标"疑似"。把不确定的位置呈现得像
   确定一样，比不给位置更糟。
5. **LLM 不参与判定。** 严重度由规则表决定；LLM 只能润色措辞。
6. **绝不抛、绝不拖累宿主。** 插件半边所有代码必须 `try/catch` 兜底并带超时。
   一个让宿主启动失败的体检插件，会同时成为它要检测的那类问题。
7. **不破坏已发布的 bash 版。** 移植期间它必须保持可用。
8. **临时环境必须收尾。** 一次性 profile、无头 Chrome 的 user-data-dir、后台进程 ——
   全部清理。删任何路径前先 echo 出绝对路径核对。
9. **不 push、不发 npm、不改远端，除非用户明确要求。** 本地提交可以。
10. **提交时用仓库级身份**，避免把私人邮箱写进公开历史：
    `git -c user.name="Chenyu Liu" -c user.email="233006721+lcy0121@users.noreply.github.com" commit …`
11. **每完成一小项就回来更新本文件**（§9 + §5 状态 + §6 新坑）。
12. **并行期间提交只 stage 自己的路径。** 不要 `git add -A` ——
    **这个错误已经犯过一次**：子代理还在改 `plugin/index.js` 时，一次 `git add -A` 把它带进了提交。
13. **计划本身也可能错，而且证据优先于计划。** A4 就是活例：计划写着"收窄客户端种子"，
    实测发现那样会删掉真实运行的代码，于是**否决了计划**。冲突时改计划，不改证据。

---

## 5. 里程碑

### 5.1 第一批（已完成）

| 里程碑 | 产物 | 验收 / 证据 |
|---|---|---|
| **A** 内核移植与重构 | `lib/extract.mjs`、`tools/parity/parity.sh`、`lib/verdict.mjs`、`rules/dsh-api-catalog.json` | 对拍三个 fixture `✓ 完全一致`；三个回归基准精确命中 |
| **B** 插件宿主半边 | `plugin/index.js`、`cordis.patch.yml` | 真实启动：`HOST-HALF-ACTIVATED`、`did not activate` = 0 |
| **C** 插件客户端半边 | `plugin/lib/client.js`、`lib/baseline.mjs` | 真实界面：`tbody` 22 行 / 角标「可用」「部分可用」/ 异常 0 |
| **D** 对话工具 | `plugin/index.js` 的 `registerTool` | 真调一次：`可用 3 / 部分可用 1 / 不兼容 0`，发现带 `file:line` 与影响面 |
| **E** skill 产物 | `skill/SKILL.md`、`--install-skill` | 宿主日志 `SKILL registered`；无内核时也能装 |
| **F** 触发与基线 | `serveReport`/`runAutoCheck`、`bin/compat-check.mjs` | 首启/二次/改坏基线三条路都实测 |
| **G** 验收 | —— | 三个回归基准 + 真实 desktop + 无头 Chrome + 收尾干净 |
| **H** 测试基础设施 | `test/` | `node --test test/` 全绿；慢测试另见 §7.1 |

**第一批里最值钱的实测结论**（都是"猜会猜错"的那类）：

- **`ctx.loader.entries()` 不是数组**（`Array.isArray === false`，可迭代）。
  按数组写会在真实启动时**静默得到 0 条**。
- **`fiber.await()` 只对 FAILED 有效**：PENDING 会立刻返回且不抛；import 失败的条目
  **连 `fiber` 都没有**。准确说法是"能取到原因的只有 FAILED 一类"。
- **`inject` 保持 `[]` 是可行的**，`ctx.get('loader')` 在空 `inject` 下直接可用；
  但 `ctx.loader` 与 `ctx.get('loader')` **不是同一引用**（每读一次包一层 traceable），
  **别用 `===` 判断**。保持 `[]` 还有一个理由：一条体检工具自己因缺服务停在 PENDING 是荒诞的。
- **`plugins.item` 槽位放弃使用**：它的 props **没有任何插件身份**。概览由 `settings.plugins.tab` 承载。
- **对话工具的 `required` 是顶层数组**，不是每个属性上的 `required: true`。写错会被宿主拒掉，
  而**面板与路由照常工作** —— 只有真调一次才发现得了。
- **skill 的字段约束读自运行时源码**：`provider` 必须**等于** provider 自己的 `name`；
  旧 frontmatter 键（如 `disableModelInvocation`）会让**整条 frontmatter 被丢弃**。

### 5.2 第二批（已完成）

| # | 项 | 状态 |
|---|---|---|
| **H4a** | 修 `provide` 数组假阳性（顺带发现"正则读注释"） | ✅ |
| **P** | **运行时面**：`--probe-boot`，让 CLI 也能拿到宿主 API 面 | ✅ |
| **Q** | 客户端服务不再被拿宿主面判（服务级 + 方法级） | ✅ |
| **H1'** | 客户端半边对账：计划加载 vs 实际到货 | ✅ **两半都完成**（宿主侧 + 真浏览器 CDP） |
| **H2'** | 真解析器 | ✅ **定论：不做** —— 已吃掉三整类假阴性；"跨函数追踪"**量过了，不划算** |
| **H3'** | npm 发布 | ✅ **已发布 `0.1.0`（2026-10-12）**，并从 registry 装 + 真启动验证过 |
| **H4'** | 严重度规则表补全 | ✅ 在「DSH API」范围内已完整：方法级覆盖 41%→**61%** |

> **一条教训，留在这里因为它是最典型的错法**：我一度把 H1' 标成"已完成"，而当时只做完
> **宿主侧**那一半。P（拿宿主面）与 Q（修客户端假阳性）都是它的前置/邻近工作，
> **但没有一条能回答它的问题**。
> **把"邻近工作完成"当成"这一项完成"，是我在这个项目里犯得最多的一类错。**

下面只留**结论与数字**；过程、最小复现、踩的坑分别在 `git log` 与
`docs/extraction-findings.md`（37 条）。

**① 运行时面是"确定/疑似"的唯一决定因素。** 没有它，真实 desktop 上**发现全是「疑似」**。
原因是**官方目录不是运行时面**：每个服务只声明 1 个方法，而运行时实测 `sessions` 14、
`agents` 24、`llm` 29、`attachments` 15。默认不开是因为它要复制 profile、跑 pnpm、起宿主
（~9s / ~18s），默认路径保持"只读静态、秒级、无副作用"。

> ⚠️ **首次实现耗时 61 秒** —— 因为用 `spawnSync` 同步等一个**长驻进程**，它永远不会自己退出，
> 于是必然等满超时。改成"后台起 + 轮询文件"后 9 秒。**"等一个不会结束的东西"是典型自伤。**

**② 客户端半边被拿宿主面判 → 修掉后不兼容 4 → 0、可用 9 → 14。**
根因：`sessions` 这类服务**两端都有**，而命令行只有宿主面。判据要三条并用：插件自己的
`dsh.client.inject` 点名 / 在插件的**客户端文件**里被用到而宿主没有 / 方法级只看宿主侧调用点。
（原来的"出现的文件全在客户端桶里"在**共用代码**面前必然失效。）

**③ H2' 的接受指标被实测推翻。** 原写「疑似比例明显下降」——该比例由**有没有运行时面**决定，
与解析精度无关。改用三个**可证伪**的指标：假阴性数 / "对不上账"的调用点 /
`no-calls` 占比。修掉三类假阴性（`ctx.inject` 单参数回调 27 处、`this.ctx` 32 处、别名 3 处）后，
真实 desktop 从 `可用 9 / 部分可用 12` → `10 / 11`，基准一字未变。

> ⚠️ 度量本身也会骗人：第一版判据把 `const sessions = new Map(); sessions.get(…)`
> 这种**同名局部变量**也算成漏报（38 → **21**），收紧到"提取器声称支持的形态"后是 **2**。

**④ H1' 宿主侧**新增 `client-entry-missing`（`fatal` / `certain` —— 文件在不在是**静态事实**），
覆盖两个分支：声明了 `dsh.client` 却没有 `exports["./client"]`；或它指向的文件不存在
（**正是 H3' 要防的那类**）。实测真实 desktop：17 个插件声明了 `dsh.client`，**17 个都能端出来**。
夹具 `@fixture/clientnoentry` / `@fixture/clientmissingfile`。
⚠️ **这不等于"客户端对账已完成"** —— 文件在但浏览器里 import 失败测不到。**它是必要条件。**

**⑤ H3'：让包自足。** 障碍是插件半边 import 内核，而内核真源在仓库根，所以
**装好的包永远找不到内核**、静默退化成只会说"找不到判定内核"的壳。做法：内核**从不进 git**，
`prepack` 时复制进 `plugin/kernel/`、`postpack` 清掉（**不用"提交一份 kernel/"** ——
那就是两份实现，正是第 6 题否决双实现的理由）；`resolveKernelDir()` 候选把包内形态排在前面；
`files` 必须显式列 `kernel/`（它在 `.gitignore` 里）；暂存器结束时逐文件复查，缺一个就 `exit 1`。
**验证不是看文件清单，而是真跑一遍**：把 tarball 装进干净空目录，在只有这个包的环境里算一次结论
→ `插件数: 21 | 结论 {ok:10, partial:11, broken:0}`，**与仓库里完全一致**。
`test/packaging.test.mjs` 钉住整条链路（已自证：去掉 `files` 里的 `kernel/` 立刻变红）。

> ⚠️ `plugin/lib/` 里已经放着**客户端半边**。照直觉把内核复制进 `plugin/lib/` 虽然不冲突，
> 但"这一个 `lib/` 到底是内核还是客户端半边"就再也没人说得清了。所以内核单独放 `plugin/kernel/`。

**⑥ 静默降级的召回率：不做，并换成我们能负责的指标。**
「所有死掉的功能里我们报出了几个」那个分母是**插件作者的知识**，要拿到它就得给**每一个**插件
写功能测试，而插件集合是**开放的**（本机 14 个社区插件 / 21 个被体检的 / 15 个有客户端半边；
换台机器换一批；作者发版还会让测试**静默失效**）。**那不是"贵"，是没有上界。**
改测它**上游**那一层：**所有会失败的调用点里我们找到了几个** —— 这一层属于我们、可以独立测量、
且给出的是**有界**队列。`tools/extractor-recall.mjs`（一条**与提取器无关**的纯正则枚举对账）：

```
独立枚举 503  提取器记下 395  对不上账 105
  ├─ 有记录的**有意弃权**  49  ← 不是漏报
  └─ **要人看的**          56
原始召回率 78.5%  →  扣掉有意弃权 **88.3%**
```

⚠️ **不要读成"准确率 88.3%"** —— 它只回答"提取器有没有看到那个调用点"，
**不回答**"它会不会真的坏"。后者没有数字，这个结论没变。

**⑦ 从召回度量里挖出的真缺陷 → 召回 87.9% → 88.3%。**
抽查 5 条有 3 条是真漏报、同一类：上下文对象**穿过了另一个对象**
（`target.ctx.storageDomain.open(…)`、`input.ctx.agents.get(…)`）。
量了一下 19 处（`this.ctx` 14 + `X.ctx` 5），**全是 DSH 的 ctx**。
**这次改了方向** —— 缺陷 26 当时拒绝放宽（担心是别人的上下文），数据说不是，而且后面还卡着
两道强过滤（第三段必须是已知服务名、第四段必须是调用）。夹具 `@fixture/propctx`。

**⑧ 剩下的两处"没有数字"的地方，都已定论**：
- **第 ② 层（静默降级）没有召回率**，且确认没有第三条路
- **Windows 不做本机验证**（第 6 题）

### 5.3 被证据否决过的计划（比选中的理由更值钱）

全部来自实测，不是推演：

| 原计划 | 实测为什么不行 | 实际做的 |
|---|---|---|
| **A4**：客户端种子只取 `exports["./client"]`，缺席才回退遍历 | `dsh-better-sidebar` 把客户端代码切成**懒加载 chunk**，用自己宿主半边的路由按 URL 取回。从声明入口做可达性分析**永远够不到**（提及次数 0）。收窄 = **静默删掉真代码** | **不动文件集合**，改为给每个文件标**来源桶**，`client-extra` 的调用点标「疑似」 |
| **A4b 原倾向**：`src/` 与嵌套 `node_modules/` 都排 | 排 `src/` 零信息损失；排嵌套 `node_modules/` **丢 2 个真调用点**却只有 110 个文件的收益。而且**两刀都碰不到假阳性** | **只排 `src/`**。并记下：**A4b 是效率问题，不是正确性问题** |
| **A5**：把"插件自有服务"摘出去 | 查证相反：`betterLocale`/`pet`/`agentTeams`/`companionQq` **不是**自有服务，而是**被消费但无人提供**。真正的自有服务只有 2 个 | 改为**按提供方三分**：宿主 / 某个已装插件 / **无人提供**。第三类才是真缺口，且性质是「**插件间依赖缺失**」而非「与 DSH 版本不兼容」 |
| **`patchUnparsed`** 当作"`const inject = [...]` 不被识别"的修法 | 命中 **18/21** 个真实插件，把 host-entry 从 118 打到 **10**、fallback 打到 **1359** 个文件 | **回退**。真正的修法是识别 `inject` 数组字面量赋值 |
| **H2' 原验收指标**：「疑似比例明显下降」 | 该比例由**有没有运行时面**决定（见 ③） | 改用三个可证伪指标 |
| **探针"不问而全知"**：读 `fiber.store` 列出所有服务 | Cordis 抛 `cannot get property "store" without inject`，而探针**刻意不声明 `inject`**。两者直接冲突 | 保持既有设计：探针只问 `services.json` 点名的服务 —— 所以那份名单**必须完整** |
| **给 `plugin/package.json` 加 `files`** | 这个包**当时不是自足的**，加 `files` 会暗示它可以独立发布 | 撤掉；后来 H3' 真的做成自足了才加回来 |

---

## 6. 已知地雷清单

详细版见 `docs/extraction-findings.md`（37 条，含每条的最小复现）。这里只列最要命的。

| 地雷 | 说明 |
|---|---|
| **目录 ≠ 运行时 API 面** | 官方目录是**契约**目录。实测：`jobs` 目录 **0 个方法**、运行时 **29 个**；`loader` **完全不收录**。拿目录当运行时面会海量误报 |
| **"没看到"与"不存在"必须分开** | 这一类占了已知缺陷的一半。共同形状是**输出看起来干净**，而干净与"什么都没扫到"长得一样。**假阴性比假阳性贵。** |
| **正则读注释与字符串** | 两种掩码**必须分开用**：声明解析只抹注释（要保留字符串），调用点扫描两者都抹。实测教训：夹具负向对照被我**自己注释里写的示例代码**拔掉 |
| **对拍已降级为结构性体检** | python 版在四处落后（`calls` 跨插件污染、`clientHints` 顺序相关、看不见 `ctx.inject([...])`、不排 `src/`）。现在只剩 `manifests`/`fallbackPackages` 严格比对。**别把"对拍通过"误读成"输出正确"** |
| **"尽力而为"的 `catch` 不是安全网** | 它只是把失败藏起来。实例：探针的 `w()` 咽掉 `ENOENT` → **一声不响地不产出任何报告** |
| **vendored 代码遮蔽 `ctx`** | `lib/client-mermaid.js` 里 `ctx.parser.consume()` 的 `ctx` 是解析器上下文，被凑出 **40 个假方法** |
| **JS 内置集合方法名会被当成 API 调用** | `const sessions = new Map()` 之后的 `sessions.set/map/sort` 会被当成"调用了宿主不存在的方法"。**只靠名字黑名单不安全**（`sessions.get` 是真实宿主方法），必须配合"该方法不在宿主方法表里"一起判 |
| **同名变量撞名会凭空造方法** | 同一个 `service` 名同时绑给两个服务时，原实现每次声明都扫全文件 → 造出 13 个假方法。修法：**弃权并记录**（`ambiguousAliases`），不猜 |
| **`localBindings` 的键必须是「变量名+文件」** | 按变量名聚会让**后写覆盖先写** |
| **`unguardedPairs` 必须去重后再定论** | 同一 `svc.method` 常被多条规则在同一行各收一次，两档判定不一定一致。没去重 → **作者的兜底永远不生效** |
| **探针输出目录必须自己建** | `try/catch` 会咽掉 `ENOENT`，"目录不存在"的表现是**什么都不产出也不报错** |
| **编辑装进 profile 的 `probe/index.mjs` 后注意硬链接** | `perl -pi` / 改名写入会**断链**：副本保留旧字节而宿主继续跑旧代码。`edit` 工具同样换 inode。要热更必须 truncate-in-place 或重装 |
| **`undefined` vs `null`** | `JSON.stringify` **省略** `undefined` 键，python `json.dump` 写 `null`。对拍一开始就是被这个抓到的 |
| **`manifests` 是旧兼容视图** | 不要往里加字段，新数据放 `perPlugin` |
| **宿主只警告，客户端才致命** | **宿主侧**非关键条目未激活**只警告**，宿主照常启动。**客户端侧**：条目文件不存在 → **宿主拒绝启动**（用户连 URL 都拿不到）；文件在但导入失败 → **整个界面被错误屏替代**。⚠️ 分界是**半边**，不是"桌面端 vs CLI" |
| **UI 驱动会假阴性** | 我的验证脚本曾把侧边栏按钮当成设置页导航项，得出"tab 不渲染"的**错误结论**。设置页里有**两个**「插件」。**验证工具本身也会骗人** |
| **`--port 0` 启动的宿主不会自己退出** | 必须显式 kill，并确认端口释放 |
| **临时 profile 里的 `file:` 依赖是定时炸弹** | 从装过社区插件的 profile 复制出来的临时 profile，其 `file:<绝对路径>` 依赖复制后可能解析成相对路径 → pnpm ENOENT，而报错被收成一行。**合成/测试 profile 要从干净的模板（`web`）建**。另：`cp -R` 会把已装插件一并带过去，pnpm 认为 `file:` 已满足就**不刷新** —— 实测跑过一份旧探针而毫无迹象 |
| **别在收尾时按模式杀进程** | 我收尾时看到 `cloudflared` 就杀了，而那是用户 desktop app 的 **remote-web-ui 隧道**（他配对的手机靠它）。**杀进程前先确认它属于谁** |

---

## 7. 环境与关键事实

### 7.1 路径与命令

| 项 | 值 |
|---|---|
| 仓库 | 本仓库根（下称 `$REPO`；文档里一律用相对路径，不写这台机器的绝对路径） |
| 远端 | `lcy0121/dsh-plugin-compat-check`（公开，MIT）；已并入 `0xsline/awesome-deepseek-harness`（PR #688 已合并） |
| DSH 版本 | `0.2.0-rc.2` |
| `$DSH_HOME` | DSH 的状态目录，默认 `~/.dsh` |
| 正式 profile | `$DSH_HOME/profiles/desktop`（桌面端独占） |
| 桌面端内置 Node | 24.18.1（`pnpm` 11.7.0） |

```bash
# 建一次性 profile（不会启动）
dsh --profile <p> --from-default-profile web --dump-config
dsh plugin --profile <p> add <spec>          # 装插件
dsh --profile <p> -- --port 0 --no-open      # 真实启动（URL 与 token 打在 stdout）

# 内核
./tools/parity/parity.sh <node_modules 目录>  # 静态提取对拍
node lib/extract.mjs <node_modules 目录> <输出目录>

# 完整体检（三个入口共用这一份结论）
node bin/compat-check.mjs --nm <dir> [--probe <探针报告>] [--dsh-version <v>]
node bin/compat-check.mjs --nm <dir> --json     # 机器可读
node bin/compat-check.mjs --nm <dir> --quiet    # 只要一行总结论
# 退出码: 0 可用 / 1 部分可用 / 2 不兼容 / 3 无法判定（CI 可直接用）

# 度量与端到端
node tools/extractor-recall.mjs               # 调用点层召回（有界、可逐条查）
node tools/client-arrival.mjs                 # 客户端到货（要浏览器）
node tools/labels.mjs --nm web --synthetic    # 独立初始化私有web模板；可能诚实返回漏报（exit1）
DSC_SLOW=1 node --test test/probe-boot.test.mjs test/labels.test.mjs test/client-arrival.test.mjs
./dsh-plugin-compat-check.sh <spec>           # 端到端（装包+起宿主+拿报告+判定）
```

### 7.2 客户端层怎么测（命令行永远测不到）

本机已具备、零新增依赖：`node`（全局 `WebSocket`、`fetch`）+ 已安装的 Google Chrome。

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-first-run \
  --remote-debugging-port=9400 --user-data-dir=/tmp/xxx about:blank &
# 然后 node 脚本连 CDP：Page.navigate 到带 token 的 URL，
# Runtime.enable + Network.enable + Log.enable，Runtime.evaluate 查 window.__DSH_BOOT__ 与 DOM
```

已实测可用的证据面：`window.__DSH_BOOT__`（`{rev, entries, batches}`）/ `document.title` /
`#root` 的 DOM 长度 / `Runtime.exceptionThrown` / `Network.responseReceived`。

**注意**：macOS 没有 `timeout` 命令，用后台进程 + 看门狗。

**三个曾经踩到的坑（都会造成"看起来跑了其实没跑"）**：

1. **`dsh --profile <p> web` 会报 `too many arguments`。** `web` 是 launcher 层的**应用名**，
   不是 app 参数。必须用 `--` 分界：`dsh --profile <p> -- --port 0 --no-open` ✅
2. **`dsh rescue --profile X --from-default-profile web` 会报 `select a profile only once`。**
   `rescue` 自己会选 profile。
3. **客户端渲染要验到"是我们的组件渲染的"。** 页面上出现某个字符串**不能证明**归属。
   做法是在组件函数体里设一个只属于我们的标记（`window.__COMPAT_CHECK__ = {…, renders}`），
   把"页面里有这几个字"升级成"这一刻由我们的组件产出"。

### 7.3 已实测的 DSH 契约（不要再重新调查）

**客户端 UI 只有 `ctx.slots` 一条通道**，90 个槽位（`tools/slot-probe/` 实测，0.2.0-rc.2）。

```js
ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register(
  { name: "settings.plugins.tab", id: "...", order: 1, label: "..." }, Component));
```

| 槽位 | 声明 | 注册 | 界面渲染 |
|---|---|---|---|
| `settings.plugins.tab` | ✓ | ✓ | **✓ 已验证**（标签名 + 正文） |
| `settings.section` | ✓（5 条占用） | ✓ | **✓ 已验证**（导航项 + 正文） |
| `plugins.detail.section` / `.badge` | ✓（0 条占用） | ✓ | — |
| `sidebar.right.pane.tab`(+`.title`) | ✓（7/5 条） | 未测 | — |
| `shell.overlay` | ✓（7 条） | 未测 | — |

**其它关键契约**：

- `dsh.client` = `{platform:"web"}`（**必须** web）；`inject` 是**其它客户端插件包名**，不是服务名
- 入口必须 `exports["./client"]`，内容必须是 `window.__ModuleLoader__.load({id, factory})` 包装
- **宿主不构建**，缺 `lib/client.js` 会报 `run pnpm build before launch` 并让条目激活失败
- 静态基线模块（import 无需声明 external）：`react`、`react/jsx-runtime`、`react-dom`、
  `@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、
  `@deepseek-ai/dsh-client-ui-primitives`
- `ctx.loader.entries()` → `.id` / `.options.*` / `.disabled` / `.fiber.state` / `.fiber.inject`；
  缺服务 = `fiber.ctx.get(k) === undefined`
- **`loader` 的 entry id 是 `include:<entryName>`，不是包名**；`fiber.state`
  0=PENDING 1=LOADING 2=ACTIVE 3=FAILED 4=DISPOSED 5=UNLOADING。
  **`NO_FIBER`（≈`disabled:true`）不是缺陷。**
- `--probe-boot` 当前实现：创建私有工作目录及其内的DSH_HOME，复制目标profile（排除node_modules），将相对file/link依赖按原目录转为绝对路径，再安装依赖与暂存探针；启动自己的宿主、轮询报告，finally只清理拥有的进程组与目录。此路径已在§8.6真实验证；不再往正式DSH_HOME中创建探针profile。
- 官方已有 `pluginInventory` 服务 + 设置页的 plugin-inventory 分类 ——
  **不要重造插件清单 UI，只加判定层**
- **`ctx.settings.register` 在 0.2.0-rc.2 不存在**（实际提供 `configure/describe/mutate/replace/schema`）
- skill 扫描根（rank 升序优先）：`<project>/.dsh/skills`(100) → `<project>/.agents/skills`(200)
  → 运行时注册(250) → `customSkillDirs`(300) → `$DSH_HOME/skills`(400) → `~/.agents/skills`(500)
  → bundled(600)。**profile 目录与插件包内都不会被自动扫描**，深度只有 1 层
- 微夹具（`test/fixtures/micro/`）用**简化**的 patch 形态（给提取器看）；
  标注集夹具（`test/fixtures/labels/`）必须用**真实**的 `- insert:` 形态（给宿主看）

---

## 8. 现状快照

> 提交历史见 `git log`（本文件不抄）。下面只记**当前状态**。

### 8.1 规模与状态

| 项 | 值 |
|---|---|
| 文件与测试统计 | 见 `docs/current-state.json`，不再手工抄计数 |
| 当前内核 | Babel AST + 有界包内源码图；单份内核由 npm prepack 暂存 |
| 当前版本 | `0.1.1` 本地候选；npm 公开版本仍为历史 `0.1.0` |
| 基线 | schema 2；profile/path/mode 分离；锁内比较与原子写入 |
| 探针 | 显式私有目录；描述符形状；采样身份与时间；旧格式标为未绑定 |
| 浏览器 | 显式开发工具；CDP pipe；已完成§8.6所列真实Chrome正负向测试及界面操作 |
| 回归版本 | 第三方三个基准版本不变；本仓库探针有意同步至 0.1.1 |

**结构树见三份 README 的「目录结构」一节** —— 本文件不再抄一份。抄一份就是多一处会腐烂的地方
（上一版就是：漏了 `bin/`、`lib/baseline.mjs`、整个 `skill/`、绝大多数测试文件与两个规则表）。
它由 `git ls-files` 实测，能被一条命令复核。

### 8.2 临时环境（可随时删）

- `$DSH_HOME/profiles/parityfix` —— 装了三个回归基准插件，供对拍用（**唯一需要长期保留的**）
- `$DSH_HOME/dsh-plugin-compat-check/baseline.<profile>.<path-hash>.<mode>.json` —— 基线；删了就是"第一次体检"
- `本次返回的私有临时目录/` —— 探针现场
- `/tmp/one-nm`、`/tmp/hang-nm`、`/tmp/js-*` —— 对拍产物

> 收尾规矩：**不留下**除 `parityfix` 之外的临时 profile、**不留下**任何进程。

### 8.3 当前契约与边界

- 插件、CLI、skill共用判定内核；相同目标、版本、规则与采样证据才要求结果一致。npm只提供插件，不含CLI bin；根目录是private工作区，候选安装使用plugin子目录打出的tgz。
- present/absent/unobserved/unreadable分开；省略键不能冒充缺失。声明不等于激活，catalog不等于运行时面，激活不等于功能验收。certain/suspected为确定性，过滤/守卫/弃权为去处，保留impactBasis、coverage及vacuous。
- 静态、文件probe、进程内观测分模式；其它profile不能借用当前宿主服务。现代观测绑定profile、DSH版本和时间，默认24小时过期；旧格式只使用明确键并标记未绑定。
- 默认静态检查不执行目标源码；宿主使用有时限/内存上限的worker，默认写自己的schema2基线。分析不完整不推进基线，锁内比较、原子替换；异常退出可能留下锁，确认没有写进程后再清理。
- 显式probe启动和安装检查会安装并执行目标插件，临时profile不是OS沙箱。描述符采样不调用getter，诊断只写显式私有目录，运行器只清理自己拥有的进程和目录。
- API源码发现通常有file:line，loader/声明发现可能没有源码位置。动态属性、工厂/代理、跨函数与模块数据流仍有限；provide是提供方线索，不能遮住完整方法观测。客户端到货工具独立于面板，不能认证业务功能。
- 真实DSH/Chrome已在§8.6的精确环境验收；Windows未测，Linux CI配置不等于远端已通过。历史Codex Security扫描为部分覆盖，本轮修复及复核不等于重新取得全量安全认证。

### 8.4 0.1.1施工摘要（已完成）

依据原始GPT审计，2026-10-14至15在本地分支codex/compat-evidence-refactor完成；重构提交110361d，文档整理提交30f8ce4。没有推送、发布或写入正式DSH profile。已执行的实施计划不再单列文件。

| 原审计问题 | 已完成处理与验证 |
|---|---|
| B04–B07：提取、作用域、守卫、导入 | Babel JS/TS AST、词法绑定、逐调用span及有界源码图；实际入口apply/inject首参证明Context，普通ctx保留推断；赋值/delete撤销守卫；精确导出角色；extraction回归、不变式、判据、快照 |
| B01–B03：缺项、依赖和双端证据 | 独立observation，身份/版本/时效校验，硬软及host/client/shared保留；访问器未知不遮住其它明确缺失；verdict回归 |
| B08–B10：运行时、声明及profile | 当前宿主采样及可映射FAILED/PENDING；其它profile静态检查；错误明确无法判定；官方peer semver适配，engines.dsh仅建议，peer冲突为推断degraded；runtime回归 |
| B13–B14：基线、缓存和展示 | schema2身份及严重度/确定性变化，升级中性；单次并发计算、失败保留上次成功；CLI/UI/model不丢证据；state-store/report-service回归 |
| B11–B12、S01–S03：运行器及安全 | UUID私有现场和拥有的进程组；安装/启动失败3、明确peer闸门2、单份JSON；拒绝诊断链接；CDP继承管道；canonical包边界、资源预算及worker上限；runner/probe/debugger受控子进程测试 |
| 发布链与信息文档 | 固定parser/semver，暂存完整内核及LICENSE；独立tarball安装后实际调用宿主工具；一次完整测试复用摘要；Node CI；三语README、npm说明、skill、规则说明与核验脚本修正 |

历史纠正：Cordis inject回调第一参数为Context、第二参数为config；旧夹具及别名误归属已改。旧“副作用import已修”“npm同时提供CLI”“打包测试真执行产物”不适用于0.1.0。本轮未用重建快照代替行为审查；旧schema1基线重新建立。scoped包清单EACCES必须报错，不能空清单成功；probe-boot采用采集到的DSH版本（显式值优先）。

独立复核发现并修复六项Important：外部probe条目绕过身份校验、provide掩盖方法证据、普通ctx/var误认、未调用函数污染外层别名、runner漏传manifests、错误probe envelope被当成功；先反例重现再修复。原针对性42项及6个变体通过，最终范围46项通过，未发现剩余阻塞；复核不代替真实集成。

验证记录按批次保留：重构时Node22.19/24.21/26.11默认341项通过；文档整理时Node22.19/26.11默认343项通过，文档/skill/元数据55项通过，发布前闸门通过。测试数量会随代码和可选本机输入变化，最新结果见current-state.json，不把这些旧批次计数当跨环境常量。旧脚本回归测试初次隔离曾漏掉全局清理命令和固定路径，已补假pkill/pgrep及私有路径后重验，初次运行不作为安全流程证明。

### 8.5 信息文档与公开状态

2026-10-15已将Plan和原审计迁入docs，修正三语README、npm README、skill及包内副本、规则说明；纠正固定/tmp、过时基线名、无条件确定性、客户端能力、根GitHub安装规格等说明。roadmap及重构/文档报告已合入本文件，不再为同一状态另建索引或快照。原审计正文仍针对旧代码，提取历史保留编号及当时输入。

同日联网核验快照：GitHub main=4722716，About简介/标签/主页与产品定位一致；npm latest=0.1.0，本地=0.1.1。meta-check取到两个数据源及npm README，0项error、5项notice，分别为版本、描述、依赖、keywords、README的未发布差异。Awesome DeepSeek Harness确认收录。此为带日期的历史核验，发布前必须重新查询；线上旧README与包不会因本地编辑自动更新。

文档分工：三语README负责用法和结构，Plan负责现状/施工/后续，GPT审计负责原问题证据，extraction-findings负责提取反例，current-state.json供核验脚本记录统计；skill和rules各保留本目录说明。更详细的旧报告可从Git历史读取，无须全部留在当前目录。

维护时运行npm test、format:check、doc-check与prepublish-check；元数据检查另需联网。doc-check只检查本地链接/版本/skill副本，不递归跑测试；用成功TAP运行update-current-state后，再向doc-check传入同一摘要。原审计的本机安全附件不承诺跨机器可访问。

本次合并后docs仅保留Plan、GPT审计、extraction-findings及current-state.json。Node26.11默认343项测试通过，发布前闸门通过，离线链接/版本/skill核验覆盖11份维护文档；实际文件数由current-state.json记录。

### 8.6 真实集成验收（2026-10-15）

本轮执行§9的两项P0，未启动P1、推送或发布。使用实际tgz、独立DSH_HOME和受控测试插件；正式用户profile未改。环境：macOS arm64，DSH **0.2.0-rc.2**，其Electron宿主Node **24.18.1**，测试运行器Node **26.11.1**，Google Chrome **155.0.8059.41**。以下结论只覆盖该环境。

| 验收项 | 实测结果 |
|---|---|
| 安装与启动 | 从本地0.1.1 tgz安装、真实宿主激活；工具、skill及HTTP报告成功注册，包内内核可用 |
| compat_check | 直接调用真实scoped tools服务中的工具execute；当前profile使用运行时面，其它profile退回静态证据，错误profile明确“无法判定”；未发送模型对话 |
| 受控运行时反例 | FAILED和PENDING得到实测loader发现；缺失方法标certain，但影响仍标inferred。当前受控集合：可用2、部分可用1、不兼容2（其中包含测试观察插件），不是生态总体统计 |
| skill目录 | 实际skills.list/get可见本skill；provider正确；正文6548字符，SHA-256为d824226d8ad8704a07d4c964d261918eb1b4a4aaf383efee0b1245081ce4b0eb，与真源一致 |
| Computer Use界面 | 真实Chrome操作确认设置兼容性面板、插件详情与角标、重新检查、FAILED/PENDING及影响依据；添加反例时显示新增4，再次检查显示“与上次相比没有任何变化” |
| 浏览器到货 | 正常例计划66、到货66、3/3批次、异常0，且报告内核确实可用；缺失client文件阻止宿主启动，存在但import抛错由真实Chrome异常/错误屏检出并退出1。到货不等于全部业务功能认证 |
| 安装检查退出码 | 正常0、缺失方法1、PENDING致命2、官方peer版本闸门2、无效安装来源3；均实测并清理各自临时profile |
| 回归与收尾 | 新增两条安全回归，默认套件345项；另行6项真实集成通过。自动测试断言拥有的profile、Chrome目录及打包目录被移除；手工环境按拥有PID收尾，截图及脱敏证据留本机临时目录，不添加公开报告文件 |

本轮发现并修复四处实际问题：

1. 安装检查提前创建目标profile，而DSH要求目标目录不存在。改为仅创建私有DSH_HOME及profiles父目录，由DSH初始化目标；受控回归先失败后通过，真实tgz安装检查由3恢复为0。
2. 旧到货工具安装裸file:plugin，缺少prepack内核；即使66/66到货也会漏掉“找不到判定内核”。改装实际tgz，并要求后端报告ok；新版正向测试同时验证条目到货与报告可用。
3. probe迁往私有DSH_HOME后，相对file/link依赖会指错位置。仅在复制的package.json内按原profile目录重定位dependencies/devDependencies/optionalDependencies，不改源文件；受控回归先红后绿，真实probe测试包含相对file依赖。
4. npm pack的stage/unstage会改共享源码目录，可能与并行测试争用kernel。到货工具现在复制lib/rules/plugin/skill/LICENSE至自己的私有目录后打包；回归确认实际pack输入和所有暂存材料均在拥有的目录内。

同时替换过时的probe慢测试：不再依赖用户parityfix、旧notes措辞或“有runtime就全部certain”的错误契约；采用独立profile和逐条证据断言。新增客户端import抛错对照，缺文件测试也只接受对应受控错误，避免把任意启动失败当作测试成功。统计生成器保留已记录的独立真实验收，不再每次重置为未验证；默认测试计数与真实集成记录分开。

复现本轮集成（需要已安装DSH、pnpm和Chrome；DSC_CHROME可指定Chrome可执行文件）：

```bash
DSC_SLOW=1 node --test --test-reporter=tap test/probe-boot.test.mjs test/client-arrival.test.mjs
npm test -- --test-reporter=tap
npm run format:check
node tools/doc-check.mjs --test-summary <成功的默认套件TAP文件>
node plugin/scripts/prepublish-check.mjs
```

若运行环境限制默认npm缓存写入，设置npm_config_cache到可写的私有临时目录。慢测试自行创建和清理profile；默认npm test不会运行这6项集成。手工界面操作、真实tool/skill调用及0/1/2/3矩阵是本轮另行验收，不能把它们当作默认套件自动覆盖。

最终独立复核的两项Important（相对依赖、共享打包）均按反例先红后绿修复。两项Minor延后：到货工具文本模式在非预期启动失败时仍可能称“预期失败”；文本摘要未展开compatibility.error。JSON和退出码正确，排错时使用--json；后续统一文本提示。

### 8.7 P1辅助度量真值隔离（2026-10-15）

旧labels脚本固定DSH0.2.0-rc.2、将LOADING当未运行，并把同一probe.entries既交给判定器又拿来当标签；历史“零漏报”不能证明独立预测能力。本轮只修复这项度量链，不把旧Python正则对拍升级为AST真值。

- **独立标签来源**：探针额外写loader-labels.json，直接遍历宿主loader的原始条目，保存完整身份和数值状态；不调用生产loaderObservations映射、不使用提取器manifests来裁剪标签。与服务观测共享sampleId、profile、DSH版本、采样时间，先落标签再发布probe就绪文件。
- **预测输入隔离**：labels调用同一CLI内核，显式仅传root服务形状和身份/时效字段，不传任何loader条目；同时关闭相邻probe报告自动发现。标签文件不被判定器消费；修改标签只能改变计分，不能改变预测。
- **身份与状态**：只按完整包名唯一匹配，不猜scoped包尾段或前缀；先检查显式packageName/name冲突，再与扫描集合匹配，冲突或指向其它包的条目不会借弱身份计分；一包多条目有任一启用PENDING/FAILED即为正例，所有启用条目均ACTIVE才为负例。LOADING、DISPOSED、UNLOADING、无fiber/不可读、停用、组、无法映射条目均不充当成功或失败；输出不计分及未映射项。
- **有效性**：从本次采样取DSH版本，显式版本必须一致；配对sampleId、profile、版本、时间校验失败或标签不完整、源码分析不完整时退出3。标签身份字段可省略或为string/null，disabled/group可省略（视为false）或为boolean；错误类型拒绝而不作排除项。运行器清除继承的DSC_DSH_VERSION，查询失败、空值或非semver版本均退出3，不能伪装成本次观测。无正例/无预测正例时对应召回率/精确率为null；全无可计分样本也退出3。
- **现场所有权**：synthetic从官方web模板初始化自己的DSH_HOME，不再复制正式web；任一安装失败中止，finally清理合成目录，probe运行器清理拥有的宿主与profile。keep-dir仅保留私有诊断报告，不保留进程和临时profile。

新工具文件模式需要两份配对产物；旧只有entries的报告不再作为独立度量输入，需重新采样。此变更限开发度量工具；普通兼容性报告仍可使用验证过身份的loader实测发现。

```bash
# 直接采样现有目标；预测不读取采样中的loader答案
node tools/labels.mjs --nm <profile或node_modules> --probe-boot --json
# 同时留出服务报告和独立标签（诊断目录须私有且由本人拥有）
node tools/labels.mjs --nm <profile或node_modules> --probe-boot --keep-dir <私有目录> --json
node tools/labels.mjs --nm <原目标> --probe <私有目录>/probe-report.json --labels <私有目录>/loader-labels.json --json
# 合成病例；初始化私有web模板，无须本机已有web profile
node tools/labels.mjs --nm web --synthetic --json
DSC_SLOW=1 node --test --test-reporter=tap test/labels.test.mjs
```

度量退出码：0=有计分样本且无FP/FN；1=有误报或漏报；3=用法/采样/身份/分析错误或没有可计分样本。0仍不代表静默降级和客户端功能通过，也不等于所有loader条目均纳入分母。

真实DSH0.2.0-rc.2、macOS arm64、宿主Node24.18.1中，四个受控病例实测：broken-service=PENDING且预测fatal（TP）；healthy/real-service=ACTIVE且无fatal（TN×2）；failed-apply=FAILED而源码/服务检查无fatal（FN）。结果TP1、FP0、FN1、TN2，精确率1、召回率0.5，CLI退出1；测试应通过，因为它要求如实暴露漏报。failed-apply故意在激活时抛错，属于判定器未承诺静态预测的任意插件逻辑故障，是防止答案泄漏的挑战例，**不能将这四例的50%读作产品或生态准确率**。不为得到满分扩展分析范围。

回归覆盖标签篡改而预测不变、相邻答案文件、LOADING/停用/未知/同尾包名/多条目、身份版本过期及错配、空分母、源码不完整、真实原始采集独立于生产映射。最终独立复核发现三项Important：标签错误类型可隐藏漏报、过滤扫描集合前未检查包身份冲突、版本查询失败可能继承旧值。均先用完整CLI或运行器反例验证失败再修复，针对性15项通过；没有Minor遗留。默认套件354项通过；独立标签8项离线回归与1项真实合成测试，连同P0探针/Chrome共15项通过（其中7项真实集成）；另行健康夹具安装检查实测退出0、版本正确并清理。文档、格式与发布前检查通过，事实记录见current-state.json；P0的界面/网络到货范围声明继续有效。

---

## 9. 下一动作

下表统一记录后续工作与已完成的发版前门槛，不再另维护roadmap；已完成项的精确环境和证据见§8.6。

| 优先级 | 工作 | 完成条件 |
|---|---|---|
| P0 已完成 | 真实DSH安装、启动和宿主功能验收 | 2026-10-15在§8.6环境从实际tgz安装；compat_check、profile隔离、FAILED/PENDING、错误、skills.list/get、基线及0/1/2/3均通过；发布或环境变化时重跑 |
| P0 已完成 | 真实Chrome到货与界面验收 | CDP pipe正向、缺文件及import抛错反例通过；Computer Use确认面板、详情角标、受控错误和重新检查；限于§8.6环境和已操作交互 |
| P1 已完成 | 适配旧辅助度量工具并隔离真值 | §8.7：独立原始loader标签、仅服务观测预测、关闭自动读取、状态/包身份/版本对齐；受控反例和真实DSH测试暴露真实FN；Python parity保留历史比较 |
| P1 规则质量 | 复核severity.needsReview与刷新历史inventory | 在明确DSH版本、profile、probe身份下逐条核对sessions.open/getSnapshot/refresh、settings.get、attachments.readImage等；区分源码归属与服务实际方法；只以证据更新规则、影响文案、夹具及回归，不把历史coverage数字当现状 |
| P1 契约稳定 | 固化报告结构与消费者一致性 | 为observation/coverage/finding/baseline建立可校验schema或类型契约，覆盖CLI JSON、HTTP、model tool和面板；旧格式兼容策略和错误码有文档及回归，避免字段增加后某个通道丢证据 |
| P2 分析能力 | 以真实误报/漏报推进AST支持 | 对动态属性、工厂/代理、跨模块别名与函数调用建立有界反例队列；每次先复现再修复，并量化精确归属/覆盖变化，不以“疑似比例降低”代替正确性 |
| P2 工程验证 | 补齐平台和资源验证 | 真跑Linux CI并记录结果；Windows仅在获得实际环境后验收进程清理/路径/安装器，验证前不宣称已兼容。增加大包、超时、内存压力及并发基线的性能基准，保持宿主响应 |
| 发布阶段 | 同步公开源码与npm候选 | 完成上述发版验收后，经授权推送/合并并发布；移除候选README中的未发布措辞，核验registry版本、README、依赖、tarball、简介与标签，再更新本文件的公开状态记录 |

下一步建议做P1规则复核，再固化报告结构契约。P1辅助度量隔离及两项P0已完成本机验收；跨平台、跨DSH版本及全业务功能仍不在已验证范围内，继续大规模拆文件的收益较低。


日常修改后运行 `npm test`、`node tools/doc-check.mjs` 与 `node plugin/scripts/prepublish-check.mjs`。改动 skill 后先运行 `node plugin/scripts/stage-skill.mjs`。更新公开说明时再运行 `node tools/meta-check.mjs`；网络不可用必须记录为未核验，本地版本高于 npm 已发布版本是 notice。

### 9.0 下次发版怎么做

本地候选为0.1.1；公开发布状态以§8.5记录的核验时间为准，不能用历史测试数量作为发版凭证。

1. 核对 `lib/version.mjs`、`plugin/package.json`、`probe/package.json`、`tools/slot-probe/package.json` 与说明文档。
2. 先审查行为和基准版本变化，再有意更新快照；不以重建快照代替修复失败。
3. 用成功 TAP 摘要运行 `node tools/update-current-state.mjs --test-summary <log>`，再运行 `node tools/doc-check.mjs --test-summary <log>`。
4. 运行 `node plugin/scripts/prepublish-check.mjs`，按§8.6重跑两项P0发版前集成验收（当前已有本机通过记录）。
5. 取得发布授权后，在 `plugin/` 执行 `npm publish`，按 npm 实际提示完成认证；`prepack` 暂存 kernel 与 skill，`postpack` 清理 kernel。
6. 重新核验 registry 版本、tarball、README 与依赖，并更新公开状态记录。发布0.1.1时将 npm README 中“本地候选”文字改为相应发布状态；不能提前声称已发布。

### 9.1 已被实测推翻、不要再试的方向

- **按声明入口收窄客户端种子** —— 会静默删掉懒加载 chunk（§5.3）
- **读 Cordis 的 `fiber.store` 来"全知"** —— 需要 `inject`，与探针设计冲突（§5.3）
- **用"疑似比例"当解析器的验收指标** —— 该比例由有无运行时面决定（§5.2 ③）
- **用 `no-calls`/`abstained` 的占比判断解析器质量** —— `abstained` 大多是「查过了没问题」；
  要数**「本该抓到却没抓到」的绝对数**（§5.2 ③）
- **把假阳性修复寄托在文件集合收窄上** —— 排 `src/` 与排嵌套 `node_modules/` 都碰不到假阳性（§5.3）
- **给每个插件写功能测试来量"静默降级召回率"** —— 分母不属于我们，且没有上界（§5.2 ⑥）
- **靠环境变量推断当前 profile** —— `DSH_PROFILE` 可能是启动 app 的那个 shell 的**过期值**；
  要按 `process.argv` 判断，且 CLI 的 `--profile <名>` 与桌面端的**位置参数**两种形态都要认
