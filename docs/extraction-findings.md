# 静态提取的已知缺陷（实测记录）

这份文档记录**在 Node 移植过程中实测发现**的提取缺陷。它们不是"待打磨的细节"，而是会直接污染结论可信度的问题——而结论可信是这个工具唯一值钱的东西。

调查日期 2026-10-10，DSH 0.2.0-rc.2，样本是本机 desktop profile 的 21 个社区插件。

---

## 1. `local_graph` 无界循环（已修）

**症状**：提取在某个插件上永远跑不完，98% CPU 空转，队列无界膨胀。

**证据**：在 `@liustack/modlens` 上跑到 25 秒时打印 `iters=100000 queue=325012 seen=8` —— 循环了 10 万次，队列积压 32 万条，却只解析出 8 个文件。整个 desktop profile 跑 10 分钟没有完成。

**根因**：`seen` 同时承担了两个职责。当依赖靠**补扩展名**才解析成功时，写入 `seen` 的是解析后的路径（`b.js`），而队列里传的是未解析形态（`b`）；于是 `rel in seen` 永远不成立 → 每次访问都重新读文件、重新展开它的导入 → 有环就无界膨胀。

**最小复现**：`tools/parity/fixtures/hang-cycle/` —— 3 个 JS 文件，全部用无扩展名的 ESM 相对导入，其中 `a.js` 与 `b.js` 成环。修复前它就能卡死。

**真实触发者**：`@liustack/modlens` 打包的 `undici` 就是无扩展名 ESM 写法。

**修法**：把「检查过」（`visited`）与「解析成功」（`seen`）分开。不改变返回的图。已同时修在 `lib/extract.mjs` 与 `dsh-plugin-compat-check.sh` 的 python 真源里。

**修复效果**：desktop profile 从「10 分钟未完成」变为 **1 秒**完成（21 个插件、53 个服务、280 个调用点）；三个回归基准插件的输出**逐字段不变**。

---

## 2. 副作用导入完全漏检

提取 import 的正则只认三种写法：

```
from '...'          require('...')          import('...')
```

**`import './x'` 这种纯副作用导入不匹配** —— 而它是很常见的装配写法。后果是：一个只靠副作用导入串起模块的插件，会得到「0 个服务引用」的结论，看起来干净，实际上什么都没扫到。

最小复现里我第一次就踩到了这个：3 个文件的 fixture 提取出 0 个服务，我一度以为是循环没复现。

## 3. 第三方 vendored 代码把 `ctx` 遮蔽掉

`dsh-better-sidebar` 打包了 `lib/client-mermaid.js`（12.5 万行，里面是 mermaid / chevrotain）。那段代码里有：

```js
ctx.parser.consume(index, token, operatorAssignment)
```

这里的 `ctx` 是**解析器上下文**，和 DSH 的 Cordis `ctx` 毫无关系。提取器只看名字，于是把 `parser` 当成宿主服务，还给它凑出了 **40 个方法**——在规则表的覆盖统计里它一度排第一。

同类：`ruleNames` 是个 `const ruleNames = new Set()` 局部变量，也被当成服务收了进来。

## 4. 插件自定义服务被当成宿主服务

`dsh-better-sidebar` 里有 `ctx.provide("betterSidebar", service)`。也就是说 `betterSidebar`、`betterLocale`、`pet`、`agentTeams` 这类是**插件自己提供的服务**，供其他插件消费，不是宿主 API。

当前提取器把它们与宿主服务一视同仁，于是：提供方插件不在场时，消费方会被判成「依赖了不存在的服务」。这是假缺口，而且方向很危险——它把「插件之间的依赖关系」误报成「与 DSH 版本不兼容」。

## 5. 客户端种子是整包遍历（过宽）

`collect_files` 在收集客户端代码时，会把包里**所有路径含 `client` 的 js 文件**都拉进依赖图——包括 `lib/client-mermaid.js` 这种 vendored bundle。

这是缺陷 3 的入口，也是性能问题的来源。正确做法是优先用 `exports["./client"]`（`dsh.client` 的权威入口），只在它缺席时才回退到路径遍历。

## 6. 懒加载 chunk：**不是**死代码，不要按声明入口收窄

这一条差点让我做错一次决定，所以单独记。

曾经的计划（A4）是「客户端种子只取 `exports["./client"]`，缺席才回退路径遍历」，动机是排除 vendored bundle、减少假阳性。

实测否决了它。`dsh-better-sidebar` 把客户端代码切成多个 chunk，通过**自己宿主半边的 HTTP 路由**取回：

```js
/** Chunk script endpoint served by the plugin host half (src/bundle-route.ts). */
const CHUNK_URL = (name) => `/sidebar/bundle/${name}.js`;
```

于是 `lib/client-editor.js`（2.0 MB）、`lib/client-locale.js`（732 KB）、`lib/client-mermaid.js`（6.9 MB）
都是**会真实运行的代码**，而从 `lib/client.js` 出发做静态可达性分析**永远够不到它们**
（`client.js` 里对 `client-mermaid` 的提及次数是 0；对 `client-editor` / `client-locale` 各 1 次，还只出现在一句注释里）。

按原计划收窄 = 静默删掉真代码。**这个方向的错误（假阴性）比多扫（假阳性）严重得多**，
因为假阳性可以用确定性标注降级，假阴性会让用户以为"没问题"。

**改后的做法**：文件集合不动，给每个文件标来源桶（`host-entry` / `client-entry` / `client-extra` / `fallback`），
写进单独的 `provenance.json`；`client-extra` 的调用点标**疑似**。

## 7. `.d.ts` 会被当成源码捞进来（已修）

`.d.ts` 文件名以 `.ts` 结尾，所以会被「路径含 client 且扩展名是 `.ts`」的遍历命中，尽管它不含任何可运行代码。

实测 desktop profile 的客户端两个桶共 846 个文件，其中 **342 个是 `.d.ts`**。

排除它**零风险**：客户端桶从 829 降到 487，而 `static.json` 输出**零变化**
（53 个服务、280 个调用点、clientHints 全等），三个 fixture 的对拍也仍然完全一致。

---

## 这些缺陷各自该由哪一批解决

| 缺陷 | 处理方式 | 批次 |
|---|---|---|
| 1 无界循环 | 已修（Node + python 双份） | ✅ 已完成 |
| 7 `.d.ts` 噪音 | 排除（输出零变化） | ✅ 已完成 |
| 6 懒加载 chunk | **不改文件集合**，改为来源分桶 + 把 `client-extra` 标疑似 | ✅ 已完成（分桶）／取舍待拍板 |
| 3 `ctx` 遮蔽 | 真解析器做绑定分析，识别 `ctx` 被局部定义遮蔽的情况；在此之前靠确定性标注降级 | 第二批（C） |
| 2 副作用导入 | 同上，真解析器顺带解决 | 第二批（C） |
| 4 插件自定义服务 | 识别 `ctx.provide("x")` 的产出，把它们从「宿主服务」里摘出去 | 第一批（A5） |

**待用户拍板的取舍**：`client-extra` 里剩下的 487 个文件构成为
「包内 TS 源码 `src/` 320 个 + 嵌套 `node_modules` 110 个 + `lib/` 构建产物 57 个」。

- 真正运行的是构建后的 `lib/*.js`；`src/*.ts` 是它的源，扫它等于把同一份逻辑扫两遍
- 嵌套 `node_modules` 是第三方依赖，**正是 `ctx.parser` 那类假阳性的来源**
- 但两者也都是「会真实运行」的代码

这是精度 vs 召回的取舍，不是纯技术问题。

在第 2、3、4 条解决之前，**确定性标注不是可选项**：凡是从正则得到的调用点，都必须标「疑似」，而不是呈现得像确定的一样。

---

## 9–14. 一条不变式抓出来的一批（2026-10-11）

下面这批不是设计时想到的，而是**一条不变式**在写出来的当天抓出来的：
「每个调用点都必须能在它声称的 `file:line` 上被源码字节验证」。
desktop profile 上 942 个调用点里有 **163 个（17%）对不上**。顺着它查出四类缺陷（9–12）；
之后一次针对 `lib/extract.mjs` 的盲测探针又交出两类（13–14）。

| # | 缺陷 | 实测证据 | 处理 |
|---|---|---|---|
| 9 | **裸名规则没有边界**：拿「名字在任何文件的字符串里出现过」去匹配，命中同文件里毫不相干的局部变量 | 中间态调用点从 942 爆到 7477；`store`/`scale`/`root`/`tokens`/`consume` 全被当成服务 | 只对「插件自己声明过（inject / ctx.inject / ctx.get / ctx.&lt;svc&gt;.&lt;m&gt;()）或官方双端目录里有」的名字用这条规则 |
| 10 | **`ctx.get` 匹配式太紧**：`ctx.get("x", false)`（带第二参数）与 `ctx.get ("x")`（带空白）都匹配不到，真实调用整条丢失 | `dsh-pet` 的 `deepseekAccount` 依赖不可见 | 放宽并识别第二参数（显式软取） |
| 11 | **转手链只认一跳**：`const store = ctx.get("x")` 之后 `const store2 = store` 就断链 | 断链后 `store2.foo()` 找不到归属，而 `store.foo()` 被记到**另一个**服务头上 | 迭代收敛的绑定图（上限 4 跳），并拒绝像压缩产物的临时变量名 |
| 12 | **作用域注入的参数被完全忽略**：`ctx.inject(["a","b"], cb)` 的回调形参按**位置**绑定到服务 | 这是该生态最常见的写法之一，原实现一条都看不见 | 按位置绑定；解构形态仅在注入列表恰好一个服务时才断言 |
| 13 | **CLI 空操作**：脚本路径带符号链接祖先时静默什么都不做 | macOS 上 `/tmp` → `/private/tmp`：argv[1] 是 realpath、import.meta.url 是给定路径，词法比较 false → exit 0、无输出、三个文件一个都不写 | 两边都取 realpath 再比 |
| 14 | **空白漏报**：服务名与点号之间有空白时调用被整条漏掉 | `ctx.alpha .register(1)`、`ctx.beta\n.register(1)` 一个都没进 services | 统一加 `\s*` |
| 15 | **fallback 扫描依赖 readdir 顺序** | 把 readdirSync 反转后 fallback 包的 `perPlugin[*].callSites` 顺序会变 | `.sort()` |
| 16 | **`walkFiles` 看不见符号链接** | readdirSync 的 Dirent 对符号链接 `isFile` 与 `isDirectory` **都是 false**；pnpm 恰恰把包目录做成符号链接 | 用 statSync 补判定，断链跳过不抛 |
| 17 | **`const inject = [...]`（声明后引用）不被识别** | `dsh-mnemon-strategy-*` 一族被判成「0 个服务 → 可用」，而它们依赖的 `mnemonMemory` 当前 profile 里**无人提供** | 识别 `inject`/`injectDeps` 的数组字面量赋值 |
| 18 | **顶层 `callSites` 丢插件名** | 两个包都有 `lib/index.js` 时都是 `{file:"lib/index.js",line:1}` —— 按 file:line 定位会取到**错插件的源码** | 调用点新增 `plugin` 字段并进排序键 |

**第 17 条最值得警惕**：它不产生错误结论，它产生**沉默**。工具对一个真实缺口只字不提，
用户却以为自己拿到了结论。假阳性让人多查一次，假阴性让人以为已经查过 —— 后者更贵。

**判据的自我修正**：第 17 条修好之后，我先给 `@fixture/pending`（声明了
`noSuchServiceAnywhere` 但从不调用它）写了判据「ok」，因为「代码没调用它」。
它当场就红了 —— **代码没调用它不是理由，声明本身就是依赖**。判据改为 `broken`。
这条记下来是因为它说明：判据写错时会被自己的 fixture 抓住（判据层在起作用）。

### 边界与已知残留

- `patchUnparsed`（patch 里读不到 `- name:` 就退回整包扫描）**曾被误当成第 17 条的修法**。
  实测它会命中 18/21 个真实插件（它们的 patch 都写成 `- insert: [- id: ...]`），
  把 host-entry 从 118 打到 10、fallback 打到 1359 个文件 —— 那不是修 bug，
  是把污染面放大一个数量级。已回退，真正的修法是第 17 条。
- 符号链接**包**仍然会被静默跳过（断链）—— 这是有意的（不抛），但未记账。
- 两个 `node_modules` 条目同名（pnpm 别名/重复 store 链接）时，
  `perPlugin` / `provenance` 以包名为键，**先出现的会被静默覆盖**。
