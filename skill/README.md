# skill/ —— 交付说明与「怎么让它真的被发现」

这个目录是三个产物中的 **skill 产物**。它同时回答一件容易失败的事：**`skill/SKILL.md` 写完了，怎么才能让 DSH 真的看见它。**

> **结论先行**：`SKILL.md` 放进插件包里 **不算数**。DSH 不会扫描插件包内的文件。
> 必须由**宿主半边调用 `ctx.skills.registerProvider()`** 注册，或者把文件放进
> 文件系统扫描根（`~/.agents/skills` 等）。
> 本文件给出**已实测可用**的注册代码（见下面「宿主半边要粘贴的代码」）。

---

## 1. 我实测了什么（命令与原始结果）

环境：DSH `0.2.0-rc.2`（`dsh --version` → `0.2.0-rc.2`），macOS。

做法：在 `/tmp/skill-verify/` 造**两个一次性探针插件**与一个**一次性 profile**
（`DSH_HOME=/tmp/skill-verify/dsh-home`，`DSH_AGENTS_HOME=/tmp/skill-verify/agents-home`），
不碰正式 profile、不碰 `~/.agents`：

```bash
export DSH_HOME=/tmp/skill-verify/dsh-home
export DSH_AGENTS_HOME=/tmp/skill-verify/agents-home
dsh --profile skillverify --from-default-profile web --dump-config
dsh plugin --profile skillverify add file:/tmp/skill-verify/probe-static   # 静态 inject = ['skills']
dsh plugin --profile skillverify add file:/tmp/skill-verify/probe-nested   # ctx.inject(['skills'], cb)
dsh --profile skillverify --port 0 --no-open &
```

两个探针包各自做同一件事：把**真实的 `skill/SKILL.md`**（只把 frontmatter 的
`name` 换成探针名）复制进包里，注册成 provider，然后在启动若干秒后回读
`ctx.skills`，把看到的东西写成 JSON。

### 实测结果

| 形态 | 注册 | `ctx.skills.list()` 可见 | `ctx.skills.get()` 取回正文 |
|---|---|---|---|
| 静态 `inject = ['skills']` + `ctx.skills.registerProvider()` | ✅ 返回 disposer（`function`） | ✅ | ✅ 3867 字符，与 SKILL.md 正文一致 |
| 无静态 inject，`ctx.inject(['skills'], cb)` 里注册 | ✅ | ✅ | ✅ 3867 字符 |

`report-static.json`（节选，真实输出）：

```json
{
  "form": "static-inject",
  "steps": ["registerProvider() called"],
  "errors": [],
  "registerReturn": "function",
  "descriptionHead": "体检「已经装进某个 profile 的 DSH 插件」与当前 DSH 版本是否兼",
  "catalogEntry": [
    "compat-check-probe-static|source=probe|provider=skill-discovery-probe-static",
    "dsh-plugin-compat-check|source=user-agents|provider=filesystem-probe",
    "flat-probe|source=user-agents|provider=filesystem-probe"
  ],
  "compat-check-probe-static": { "found": true, "source": "probe", "contentLength": 3867 }
}
```

### 反例（同一轮实测里被证否的三种做法）

| 做法 | 结果 |
|---|---|
| `SKILL.md` 放在**插件包内**、从不注册（`probe-static/skills/unregistered-probe-static/SKILL.md`） | ❌ `list()` 里**不存在**。这就是 `@liustack/modlens` 的情形 |
| frontmatter 里写了**旧键** `disableModelInvocation` | ❌ 整条 frontmatter 被丢弃 → 文件被忽略 |
| frontmatter 的 `name` 不是 kebab-case（`Bad_Name`） | ❌ 文件被忽略 |
| 放在扫描根下的**扁平** `<root>/<name>.md`（`flat-probe.md`） | ✅ 被发现（深度 1 层，两种形态都行） |
| 放在 `<root>/<name>/SKILL.md`（就是 `--install-skill` 的目标） | ✅ 被发现，`source=user-agents`，`get()` 能取回 3867 字符正文 |

前两条尤其重要：**「文件在那里」与「skill 存在」是两件事**，而它们失败时都是
**静默的**（没有报错，只是目录里没有）。

---

## 2. 宿主半边要粘贴的代码（`plugin/index.js`）

> 这一段由另一位工程师落到 `plugin/index.js`。**这段代码本身已按上面第 1 节
> 的方式实测通过**（用的就是同一份 `skill/SKILL.md`、同一段注册逻辑，只把
> `name` 换成探针名）—— 也就是说：**机制已实测，粘贴位置由该文件的 owner 决定**。

放置方式：函数定义与 `SKILL_*` 常量放在文件里 `log()` / `errText()` 附近；
在 `apply(ctx)` 顶部（`log('HOST-HALF-ACTIVATED ...')` 之后）加一行 `registerSkill(ctx);`。
只需要文件已经 import 的东西（`existsSync` / `readFileSync` / `path` / `join` / `fileURLToPath`），**不新增依赖**。

```js
/* ═══ skill 半边：把 skill/SKILL.md 注册进 ctx.skills ═══════════════════════
 * 为什么必须有这一段：**包里放 SKILL.md 不算数**。DSH 不扫描插件包内的文件
 * （实测见 skill/README.md）。只有两条路能进 skill 目录：
 *   ① 文件落进文件系统扫描根（~/.agents/skills 等）—— 那是 --install-skill 的路；
 *   ② 运行时注册 —— ctx.skills.registerProvider()，就是下面这段。
 * 只做 ① 不做 ② 的现成反例：@liustack/modlens 发了 skills/modlens/SKILL.md
 * 却没注册，运行时根本没有这个 skill。
 *
 * 为什么用 ctx.inject 而不是静态 inject = ['skills']：
 * 与本文件开头同一条理由 —— 静态 inject 会让本插件 fiber 依赖 skills 服务，
 * 缺服务时整条条目停在 PENDING；而这个插件的职责正是"宿主缺了什么"，它自己
 * 更不能因为缺服务而消失。ctx.inject 起的是子 fiber：服务不在，至多让子 fiber
 * 停在 PENDING，本体照常激活。两种写法在 0.2.0-rc.2 上都实测注册成功，
 * 选后者是为了不新增一条依赖。
 *
 * 绝不抛：与本文件顶部的硬规矩一致，任何失败都只留一条日志。
 */
const SKILL_NAME = 'dsh-plugin-compat-check';
const SKILL_PROVIDER = 'dsh-plugin-compat-check';
const SKILL_RANK = 600; // = DSH 的 BUNDLED_SKILL_RANK：只与同样 bundled 的来源竞争

function readPackagedSkill() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'skill', 'SKILL.md'), // 仓库形态：<repo>/plugin/index.js → <repo>/skill/SKILL.md
    join(here, 'SKILL.md'),                // 打包形态：SKILL.md 与 index.js 同级发布
    join(here, 'assets', 'SKILL.md'),
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, 'utf8');
      const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
      if (fm === null) continue;
      // 只按**单行标量**读 name / description —— 这是 SKILL.md 的格式约束：
      // 这两个字段一旦写成多行 YAML，这里就读不到（宁可读不到，也好过猜）。
      const field = (key) => {
        const m = new RegExp(`^${key}:[ \t]*(.+)$`, 'm').exec(fm[1]);
        return m === null ? null : m[1].trim().replace(/^["']|["']$/g, '');
      };
      const name = field('name');
      const description = field('description');
      if (name === null || description === null) continue;
      return { file, name, description, content: raw.slice(fm[0].length).trim() };
    } catch {
      /* 读不到就试下一个候选路径 */
    }
  }
  return null;
}

function registerSkill(ctx) {
  try {
    if (typeof ctx.inject !== 'function') {
      log('SKILL registration skipped: ctx.inject is not a function');
      return;
    }
    ctx.inject(['skills'], (skillCtx) => {
      try {
        const skill = readPackagedSkill();
        if (skill === null) {
          log('SKILL registration skipped: 找不到随包的 skill/SKILL.md');
          return;
        }
        // 内容在注册时读进内存：包内文件运行时不会变，这样 get() 永不抛。
        const invocation = { modelInvocable: true, userInvocable: true };
        const summary = {
          name: SKILL_NAME,          // 必须 kebab-case，且与 frontmatter 的 name 一致
          description: skill.description,
          invocation,
          provider: SKILL_PROVIDER,  // 必须与 provider.name 相同，否则会被注册表校验拒掉
          source: 'bundled',
          rank: SKILL_RANK,
          locator: skill.file,
          path: skill.file,
          resourceBase: { kind: 'directory', path: path.dirname(skill.file) },
        };
        skillCtx.skills.registerProvider(() => ({
          name: SKILL_PROVIDER,
          list: () => Promise.resolve([summary]),
          get: () => Promise.resolve({
            name: SKILL_NAME,
            description: skill.description,
            invocation,
            provider: SKILL_PROVIDER,
            source: summary.source,
            path: skill.file,
            content: skill.content,
          }),
        }));
        log(`SKILL registered: ${SKILL_NAME} <- ${skill.file}`);
      } catch (error) {
        log(`SKILL registration failed: ${errText(error)}`);
      }
    });
  } catch (error) {
    log(`SKILL registration subscribe failed: ${errText(error)}`);
  }
}
```

### 为什么字段是这几个（都是 0.2.0-rc.2 的实测/源码约束，不是照抄）

读自运行时（`app.asar` 内 `@deepseek-ai/dsh-skill/lib/index.js` 的 `validateCandidate`）：

- `name` 必须匹配 `^[a-z0-9]+(?:-[a-z0-9]+)*$`（kebab-case），否则抛。
- `description` 必须是非空字符串。
- `invocation` 若是对象，`modelInvocable` / `userInvocable` 必须是 boolean。
- `provider` 必须**等于** provider 自己的 `name`，否则抛
  `returned skill "x" for provider "y"`。
- `rank` 必须是有限数。`600` 是 `BUNDLED_SKILL_RANK`（`@deepseek-ai/dsh-skill` 导出），
  官方 bundled skill 用的就是它。
- `list()` 可以直接返回数组（被 `normalizeProviderObservation` 接受）；
  `get()` 返回的定义里 `name` 必须与候选项一致，否则该条目会被作废。

### 打包上的一个缺口（需要 owner 决定）

`plugin/package.json` 没有 `files` 字段，而 `skill/` 在仓库根、不在 `plugin/` 里。
**如果将来单独发布 `plugin/` 目录**，`skill/SKILL.md` 不会随之发布，
`readPackagedSkill()` 的三个候选路径都会落空（那时它只会打一条日志、不会抛）。
届时要选一个：把 `skill/` 一起发布 / 把 SKILL.md 复制进 `plugin/assets/` /
在构建时生成。**本轮不处理**（打包方案还没定，Plan.md §5 第二批才谈 npm）。

---

## 3. `--install-skill` 的目标路径（E2）

**目标路径：`~/.agents/skills/<name>/SKILL.md`。已实测。**

- 实测（正向）：把真实的 `skill/SKILL.md` 放到
  `$DSH_AGENTS_HOME/skills/dsh-plugin-compat-check/SKILL.md`，重启后
  `ctx.skills.get('dsh-plugin-compat-check', {cwd})` 返回 `found: true`、
  `source: user-agents`、`contentLength: 3867`。
- 实测（生产）：本机 `~/.agents/skills/` 下有 267 个 skill 目录，
  其中 `adaptyv`、`aeon`、`biopython`、`c-drive-cleaner`、`kz-design` 等
  **只存在于这个目录**（`~/.dsh/skills` 不存在），而它们确实出现在真实
  desktop 会话的 skill catalog 里 —— 这条路径在生产配置下确实被扫描。
- 读自运行时代码（`@deepseek-ai/dsh-skill-filesystem/lib/index.js`）：

  | 扫描根 | rank |
  |---|---|
  | `<project>/.dsh/skills` | 100 |
  | `<project>/.agents/skills` | 200 |
  | 运行时注册（`registerProvider`） | 250 |
  | `customSkillDirs` | 300 |
  | `$DSH_HOME/skills` | 400 |
  | `~/.agents/skills` | 500 |
  | bundled | 600 |

  **rank 小的优先**。目录扫描**只有 1 层**：`<root>/<name>/SKILL.md` 或
  `<root>/<name>.md`，不会往更深处找。**profile 目录与插件包内不会被扫描。**
- `agentsHome` 的解析顺序（源码）：
  `config.agentsHome ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), '.agents')`。
  所以脚本里用 `${DSH_AGENTS_HOME:-$HOME/.agents}` 与宿主的解析保持一致。

## 4. frontmatter 规则（会**整条丢弃**的键）

`@deepseek-ai/dsh-skill-filesystem` 的 `parseSkillFile` → `parseInvocationPolicy`：

- 必须有 `name` + `description`，否则整条被忽略（只打一条日志）。
- `name` 必须 kebab-case。
- 以下**旧键会让整条 frontmatter 作废**（抛错 → 整个文件被忽略）：
  - `disableModelInvocation` → 改用 `disable-model-invocation`
  - `modelInvocable` → 改用 `disable-model-invocation`
  - `userInvocable` → 改用 `user-invocable`
- 其余合法键：`whenToUse`、`metadata`。

本 skill 的 frontmatter **只有 `name` + `description`** —— 不确定的键一律不加。
（注意 `ctx.skills.registerProvider()` 那条路**不解析 frontmatter**：描述由
provider 的 `description` 字段提供，所以宿主半边的代码从 SKILL.md 里读出
description，保证两处只有一份事实来源。）

---

## 5. 怎么复验

```bash
# 1) 一次性环境（不碰正式 profile / 不碰 ~/.agents）
export DSH_HOME=/tmp/skill-verify/dsh-home
export DSH_AGENTS_HOME=/tmp/skill-verify/agents-home
# 2) 探针包与 agents-home 造好后（见本文件第 1 节的做法）
dsh --profile skillverify --port 0 --no-open &
sleep 20
python3 - <<'PY'
import json; d=json.load(open('/tmp/skill-verify/report-static.json'))
print(d['catalogEntry']); print({k: d[k] for k in ('compat-check-probe-static','dsh-plugin-compat-check','legacy-key-probe')})
PY
```

收尾（这一步别忘，`caffeinate` 与残留 profile 都要清）：

```bash
pkill -f "profile skillverify"
rm -rf /tmp/skill-verify/dsh-home            # 绝对路径核对后再删
```

## 6. 我没有验证的部分（诚实清单）

- **没有改 `plugin/index.js`**：上面那段代码是**机制实测 + 位置由 owner 决定**，
  不是"已经在 `plugin/index.js` 里跑通"。实际落地后应该跑一次真实宿主启动，
  用 `ctx.skills.list()`（或会话里的 skill catalog）确认它真的出现。
- **客户端半边**（`settings.plugins.tab`）与本 skill 无关，未测。
- **打包形态**（`plugin/` 单独发布时 `skill/SKILL.md` 在哪）未定，见第 2 节末。
- `@liustack/modlens` 的"没注册"是从它的 `lib/index.js` 里没有
  `registerProvider` 调用、且本会话 catalog 里没有 `modlens` 推出来的；
  我没有为它单独起一个 profile 复现（不必要：同一轮里我已经用**自己的**
  未注册反例复现了同一个现象）。
