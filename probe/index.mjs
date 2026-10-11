/**
 * dsh-plugin-compat-check 通用探针
 * ---------------------------------------------------------------------------
 * 为什么需要它：插件的 package.json 只声明「依赖哪些服务」（peerDependencies /
 * dsh.client.inject），无法告诉你宿主**实际**提供了什么。而这个生态里同一版本号
 * 下 API 被移除是常态（例：0.2.0 移除了 ctx.settings.register）。光看声明会误判。
 *
 * 做法：装进一个临时 profile，真实启动一次，把插件用到的每个服务连**原型链上的
 * 方法**一起 dump 出来，供编排脚本与插件源码里的实际调用点逐一比对。
 *
 * 刻意不声明 inject：保证自己一定激活，不因缺服务而卡在 PENDING。
 * 立刻写 applied 标记（失败也要留痕），延迟后写正式报告。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const name = 'dsh-plugin-compat-check-probe';

/**
 * ⚠️ 输出目录必须**自己建**，而且要和调用方约定一致。
 *
 * 这里踩过一次，症状很难查：探针之前硬编码 `/tmp/dsh-plugin-compat-check`，
 * 而 `w()` 的 `try/catch` 会把 `ENOENT`（目录不存在）**咽掉** —— 于是
 * **探针一声不响地什么都不产出**：没有 applied 标记、没有报告、没有报错。
 * 调用方只看到"等了 40 秒没等到文件"，而原因被一个 `catch {}` 藏住了。
 *
 * 所以现在两件事都做：
 *   1. **进目录前先建目录**（`mkdirSync(..., {recursive:true})`），
 *      这样"目录不存在"这个失败模式根本不会发生；
 *   2. 仍然尊重 `DSC_OUT_DIR` —— 与 `plugin/index.js` 用的是同一个覆盖点，
 *      三份产物因此可以共用一份配置，而不是各记一个常量。
 */
const WORKDIR = process.env.DSC_OUT_DIR || '/tmp/dsh-plugin-compat-check';
const SERVICES_FILE = `${WORKDIR}/services.json`;
const APPLIED = `${WORKDIR}/probe-applied.txt`;
const REPORT = `${WORKDIR}/probe-report.json`;

const MAX_METHODS = 200;

/**
 * Cordis fiber 状态的数字 → 名字。
 * ⚠️ **必须与 `plugin/index.js` 的 `FIBER_STATES` 逐字相同** ——
 * 两处不一致的话，同一个条目在插件面板与标注集里会有两个说法，
 * 而"标注对不对"正是靠这两边比对出来的。
 * 抄错一次就会让整个度量失效（我会把这条钉进测试）。
 *
 * 值取自 cordis：0=PENDING 1=LOADING 2=ACTIVE 3=FAILED 4=DISPOSED 5=UNLOADING
 */
const FIBER_STATES = { 0: 'PENDING', 1: 'LOADING', 2: 'ACTIVE', 3: 'FAILED', 4: 'DISPOSED', 5: 'UNLOADING' };

/** 只建一次（模块级），失败也不抛 —— 探针绝不能拖累宿主启动。 */
let dirReady = false;
function ensureDir() {
  if (dirReady) return true;
  try {
    mkdirSync(WORKDIR, { recursive: true });
    dirReady = true;
    return true;
  } catch {
    return false;
  }
}

function w(file, text) {
  try {
    ensureDir();
    writeFileSync(file, text);
  } catch {
    /* 尽力而为：探针自身绝不能影响宿主启动。
       注意：这里的"尽力而为"是**有代价**的（见上方注释），
       所以进目录这一步不再依赖它 —— 目录是我们自己建的。 */
  }
}

/**
 * 连原型链一起枚举，返回 `{ 方法名: 类型 }` —— 这是踩坑换来的关键修正。
 *
 * ## ⚠️ 不要在这里 dump 属性**值**（一次真实事故）
 *
 * 这里曾经还会收集一份 `data`：把所有非函数属性的**字面值**原样写进探针报告。
 * 当时的想法是"多留点现场便于排查"。后果是：
 *
 * - `credentials` 服务的 `text` 属性就是**整份凭据文件**，里面有账号密钥
 *   （`DEEPSEEK_API_KEY` 那一条）与若干 session token —— 都是可直接使用的凭据；
 * - 那份报告被提交进了仓库（`tools/parity/fixtures/host-surface-parityfix.json`）。
 *
 * 而这份 `data` **从来没有被任何消费方读过** —— `lib/verdict.mjs` 只取
 * `hostSurface.root[svc].methods`。也就是说：我为了一个没人用的字段，
 * 把用户的密钥写进了 git 历史。**纯亏，且亏得很难看。**
 *
 * 所以规则是：**探针只记录"结构"（形参与方法名），绝不记录"内容"。**
 * 结构足够回答"这个 API 在不在"，而内容除了泄漏之外帮不上任何忙。
 *
 * 这不是"少写一个字段"，而是"探针这个角色的边界"：它是一个只读的形状探测器，
 * 不是快照工具。要排查现场请用 `--keep` 看启动日志，不要把宿主的运行时数据搬出来。
 */
function dumpShape(svc) {
  const methods = {};
  let obj = svc;
  const seen = new Set();
  let guard = 0;
  while (obj && obj !== Object.prototype && guard++ < 12) {
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (key === 'constructor' || seen.has(key)) continue;
      seen.add(key);
      let t;
      try {
        t = typeof svc[key];
      } catch (e) {
        t = 'unreadable:' + (e && e.message ? e.message : e);
      }
      if (t === 'function') {
        if (Object.keys(methods).length < MAX_METHODS) methods[key] = t;
      }
      // 非函数属性**只记名字不记值**（见上方注释）。名字由 `seen` 收集，
      // 但报告里不需要它们：判定只问"有没有这个方法"。
    }
    obj = Object.getPrototypeOf(obj);
  }
  return { methods };
}

/**
 * 收集每个**插件条目**的激活状态 —— 这是「标注集」的**真值来源**。
 *
 * ## 为什么 loader 的状态可以当真值
 *
 * 本工具的三层声明里，第一层是「**宿主未激活**」。而"某个条目到底激活没有"
 * **不需要人来判断** —— 宿主自己就说了：`entry.fiber.state`。
 * 也就是说这一层可以**免费**拿到标签，而另外两层（静默降级、客户端半边）不行。
 *
 * 所以这里记录的是**真值**，不是又一个推断。用它可以双向测工具的声明：
 *
 * | 工具说 | loader 说 | 结论 |
 * |---|---|---|
 * | 该插件会停在 pending（fatal） | PENDING / FAILED | ✅ 说对了 |
 * | 该插件会停在 pending（fatal） | **ACTIVE** | ❌ **这条 fatal 是假的**（可测的假阳性） |
 * | 没有任何致命发现 | **PENDING / FAILED** | ❌ **漏报**（可测的假阴性） |
 *
 * ## ⚠️ 只记录"状态"，不记录任何值
 *
 * 与 `dumpShape` 同一条规矩：探针是**只读的形状探测器**，不是快照工具。
 * 这里记的 `id` / `state` / `disabled` / `missingServices` 全是**结构性**的
 * —— 没有路径、没有配置、没有凭据。
 *
 * ## ⚠️ 但**它是插件清单**
 *
 * 换句话说：这份报告现在能看出"这台机器装了哪些插件"。
 * 那不是凭据，但也是本机信息 —— 所以**不要随手把它提交进仓库**。
 * 仓库里那一份（`tools/parity/fixtures/host-surface-parityfix.json`）来自
 * **测试 profile**，只含回归基准那几个包，是有意留的。
 *
 * ## 实现约束（都是实测踩出来的）
 *
 * - `ctx.get('loader')` 在**空 inject** 下可用（探针刻意不声明 inject，否则会卡 PENDING）
 * - **`entries()` 不是数组**（`Array.isArray === false`，可迭代）—— 按数组写会静默拿到 0 条
 * - `fiber.state` 是**数字**，映射见下面的 FIBER_STATES
 * - 整个函数**绝不抛**：探针绝不能拖累宿主启动
 */
function collectEntryStates(ctx) {
  const out = { total: 0, byState: {}, plugins: [], note: null };
  try {
    let loader = null;
    try { loader = ctx.get('loader'); } catch { /* 下一个 */ }
    if (!loader) { try { loader = ctx.loader; } catch { /* 无 */ } }
    if (!loader || typeof loader.entries !== 'function') {
      out.note = '拿不到 loader.entries() —— 这一轮没有标注（不是"全都激活了"）';
      return out;
    }

    // ⚠️ `entries()` **不是数组**：必须 for..of。写成 Array.from 之外的数组用法会静默得 0 条。
    const entries = loader.entries();
    for (const entry of entries) {
      out.total++;
      let state = 'UNREADABLE';
      let disabled = null;
      let id = null;
      try { id = entry?.id ?? entry?.options?.id ?? null; } catch { /* 保持 null */ }
      try { disabled = Boolean(entry?.disabled); } catch { /* 保持 null */ }
      try {
        const code = entry?.fiber?.state;
        state = typeof code === 'number' ? (FIBER_STATES[code] ?? `UNKNOWN(${code})`) : 'NO_FIBER';
      } catch { state = 'UNREADABLE'; }
      out.byState[state] = (out.byState[state] ?? 0) + 1;
      out.plugins.push({ id, state, disabled });
    }
  } catch (error) {
    out.note = `收集条目状态时出错（不影响服务面）: ${String(error && error.message ? error.message : error)}`;
  }
  return out;
}

function readWanted() {
  try {
    const parsed = JSON.parse(readFileSync(SERVICES_FILE, 'utf8'));
    if (Array.isArray(parsed.services) && parsed.services.length > 0) return parsed.services;
  } catch {
    /* 缺失/损坏则用默认集合 */
  }
  return ['settings', 'agents', 'jobs', 'webServer', 'session', 'tools', 'llm', 'subprocess'];
}

export function apply(ctx) {
  ensureDir() // 先建目录：applied 标记是"探针确实起来了"的唯一证据
  w(APPLIED, 'apply() ok @ ' + new Date().toISOString() + '\n');

  setTimeout(() => {
    const report = {
      probeVersion: 4,
      probedAt: new Date().toISOString(),
      node: process.version,
      platform: process.platform,
      wanted: [],
      root: {},
      scoped: {},
      // 标注集的真值来源：每个条目激活没有（见 collectEntryStates 的注释）
      entries: { total: 0, byState: {}, plugins: [], note: '尚未收集' },
    };

    const wanted = readWanted();
    report.wanted = wanted;
    // 条目状态与"要问哪些服务"无关，所以放在服务扫描**之前** ——
    // 万一后面某一步抛了，标注这一半仍然留得下来。
    report.entries = collectEntryStates(ctx);

    for (const n of wanted) {
      try {
        const svc = ctx.get(n);
        if (svc === undefined) {
          report.root[n] = { present: false };
        } else {
          const shape = dumpShape(svc);
          report.root[n] = { present: true, methods: shape.methods };
        }
      } catch (e) {
        report.root[n] = { present: false, error: String(e && e.message ? e.message : e) };
      }
    }

    // 作用域上下文（ctx.inject 拿到的那种）是否也能看见同样的服务
    try {
      if (typeof ctx.inject === 'function') {
        ctx.inject(wanted, (sctx) => {
          for (const n of wanted) {
            try {
              const svc = sctx[n] ?? sctx.get?.(n);
              if (svc === undefined) {
                report.scoped[n] = { present: false };
              } else {
                const shape = dumpShape(svc);
                report.scoped[n] = { present: true, methods: shape.methods };
              }
            } catch (e) {
              report.scoped[n] = { present: false, error: String(e && e.message ? e.message : e) };
            }
          }
          w(REPORT, JSON.stringify(report, null, 2));
        });
      } else {
        report.scopedError = 'ctx.inject 不是函数';
        w(REPORT, JSON.stringify(report, null, 2));
      }
    } catch (e) {
      report.scopedError = String(e && e.message ? e.message : e);
      w(REPORT, JSON.stringify(report, null, 2));
    }

    // 兜底：即使 scoped 回调没触发，也要留下一份 root 报告
    setTimeout(() => {
      try {
        readFileSync(REPORT);
      } catch {
        w(REPORT, JSON.stringify(report, null, 2));
      }
    }, 4000);
  }, 4000);
}
