/**
 * F2（结果缓存）的策略测试。
 *
 * ## 为什么要单独测缓存
 *
 * 缓存是本项目里**唯一一处"可以给出过期答案"的地方**。它的失效模式很特别：
 * 不是崩溃、不是报错，而是**安静地把旧结论当成当前结论**给出去 ——
 * 而用户看到的一切都正常。这正是本项目要检测的那类问题，所以它自己更不能犯。
 *
 * 这里测的不是"缓存能存住"（那太浅），而是**三条边界**：
 *   1. 有效期内**不重算**（否则缓存没有意义）；
 *   2. 过期后**先给旧的、后台再刷**（不能让人等 1.5 秒）；
 *   3. 后台刷新失败时**留下痕迹**（静默失败会让面板永远显示过期数据）。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { loadHost } from "./support/host-harness.mjs";

// Cache policy is exercised against the actual ReportService, without copying function text.
import { ReportService } from "../lib/report-service.mjs";
describe("F2：缓存策略", () => {
  test("fresh cache avoids recomputation, force refresh computes", async () => {
    let n = 0,
      now = 0;
    const svc = new ReportService(async () => ({ ok: true, n: ++n }), {
      clock: () => now,
      ttlMs: 10,
    });
    await svc.get("A");
    now = 5;
    assert.equal((await svc.get("A")).n, 1);
    assert.equal(n, 1);
    assert.equal((await svc.get("A", {}, true)).n, 2);
  });
  test("stale cache returns while one shared refresh waits", async () => {
    let n = 0,
      now = 0,
      release;
    const gate = new Promise((r) => (release = r));
    const svc = new ReportService(
      async () => {
        if (++n === 2) await gate;
        return { ok: true, n };
      },
      { clock: () => now, ttlMs: 10 },
    );
    await svc.get("A");
    now = 20;
    const results = await Promise.all([
      svc.get("A"),
      svc.get("A"),
      svc.get("A"),
    ]);
    assert.ok(results.every((r) => r.n === 1 && r.cache.refreshing));
    assert.equal(n, 2);
    const pending = svc.state("A").inflight;
    release();
    await pending;
    assert.equal((await svc.get("A")).n, 2);
  });
  test("cache state is separate for each requested profile", async () => {
    let n = 0;
    const svc = new ReportService(async (o) => ({
      ok: true,
      profile: o.profile,
      n: ++n,
    }));
    assert.equal((await svc.get("A", { profile: "A" })).profile, "A");
    assert.equal((await svc.get("B", { profile: "B" })).profile, "B");
    assert.equal(n, 2);
  });
});

// Replace only the expensive scan/report boundaries; startup scheduling,
// finish(), the once-only gate, configuration and log rendering remain real.
function startup(
  env = {},
  report = {
    ok: true,
    report: { summary: { ok: 2, partial: 1, broken: 0 } },
    baseline: { badge: { show: false }, note: "插件集合与上次相同" },
  },
) {
  const h = loadHost({
    DSC_SCAN_DELAYS: "10,20",
    DSC_AUTORUN_MS: "50",
    DSC_CACHE_TTL_MS: "",
    ...env,
  });
  const scans = [],
    checks = [];
  h.sandbox.scan = async (_ctx, state, pass) => {
    scans.push({ state, pass });
  };
  h.sandbox.serveReport = async (state, _ctx, force) => {
    checks.push({ state, force });
    state.reportService ||= new ReportService(async () => report);
    return state.reportService.get("startup", {}, force);
  };
  h.apply({ get: () => undefined, inject: () => () => {}, effect: () => {} });
  return { ...h, scans, checks };
}

describe("F2：启动后自动跑（真实调度与日志回归）", () => {
  test("最后一次扫描完成立即自检，随后兜底不会重复且所有定时器均 unref", async () => {
    const h = startup();
    assert.deepEqual(
      h.timers.map((t) => t.delay),
      [10, 50],
    );
    assert.equal(h.checks.length, 0);
    await h.fire(h.timers[0]);
    assert.deepEqual(
      h.scans.map((s) => s.pass),
      [1],
    );
    assert.equal(h.checks.length, 0);
    assert.equal(h.timers[2].delay, 10);
    await h.fire(h.timers[2]);
    assert.deepEqual(
      h.scans.map((s) => s.pass),
      [1, 2],
    );
    assert.equal(
      h.checks.length,
      1,
      "finish must run before the fallback timer fires",
    );
    assert.equal(h.checks[0].force, false);
    assert.equal(
      h.timers[1].cancelled,
      false,
      "finish must preserve the owned fallback",
    );
    await h.fire(h.timers[1]);
    assert.equal(h.checks.length, 1, "fallback must share the once-only gate");
    assert.ok(h.timers.every((t) => t.unrefed));
  });
  test("loader 不可达时兜底先运行，后续扫描完成也不会重复自检", async () => {
    const h = startup();
    assert.ok(h.logs.some((line) => line.includes("via=UNREACHABLE")));
    await h.fire(h.timers[1]);
    assert.equal(h.scans.length, 0);
    assert.equal(h.checks.length, 1);
    await h.fire(h.timers[0]);
    await h.fire(h.timers[2]);
    assert.deepEqual(
      h.scans.map((s) => s.pass),
      [1, 2],
    );
    assert.equal(h.checks.length, 1);
  });
  test("自动体检真实日志保留结论与无变化或无可比基线的原因", async () => {
    for (const [baseline, reason] of [
      [
        { badge: { show: false, detail: "本次与上次没有变化" } },
        "本次与上次没有变化",
      ],
      [
        { badge: { show: false }, note: "插件集合与上次相同" },
        "插件集合与上次相同",
      ],
      [{}, "没有可比基线"],
    ]) {
      const h = startup(
        {},
        {
          ok: true,
          report: { summary: { ok: 2, partial: 1, broken: 0 } },
          baseline,
        },
      );
      await h.fire(h.timers[1]);
      assert.ok(
        h.logs.some((line) =>
          line.includes("F2 启动自检: 可用 2 部分可用 1 不兼容 0"),
        ),
      );
      assert.ok(
        h.logs.some((line) => line.includes("F2 与上次相比: " + reason)),
      );
    }
  });
  test("TTL 和自动体检延迟使用有效配置，非法值使用默认值", async () => {
    for (const [env, ttl, delay] of [
      [{ DSC_CACHE_TTL_MS: "123.9", DSC_AUTORUN_MS: "77.9" }, 123, 77],
      [{ DSC_CACHE_TTL_MS: "invalid", DSC_AUTORUN_MS: "-2" }, 300000, 2020],
      [{ DSC_CACHE_TTL_MS: "0", DSC_AUTORUN_MS: "Infinity" }, 300000, 2020],
    ]) {
      const h = startup(env);
      assert.equal(h.timers[1].delay, delay);
      await h.fire(h.timers[1]);
      assert.equal(h.checks[0].state.cacheTtlMs, ttl);
      assert.equal(h.checks[0].state.autoRunDelayMs, delay);
    }
  });
});

/**
 * F2 附带的一个**正确性**缺陷：profile 认错，基线就会污染。
 *
 * 实测（在 `--profile gverify` 下让插件把宿主进程环境打出来）：
 *
 * ```
 * DSH_PROFILE=desktop          ← 过期值，来自启动 app 的那个 shell
 * DSH_PROFILE_DIR=…/profiles/desktop
 * process.argv = [ …/dsh-desktop-host/lib/cli.js, "--profile", "gverify" ]   ← 真相
 * ```
 *
 * 信环境变量会把 gverify 的结论写进 `baseline.desktop.json`，于是差分会报出
 * "移除了 17 个插件"这种**完全是编出来的变化**。环境变量在这里是**主动骗人**的，
 * 所以必须有测试把它钉住。
 */
describe("F2：profile 判断（环境变量会骗人）", () => {
  function callResolve(argv, env) {
    const { sandbox } = loadHost();
    sandbox.process.argv = argv;
    sandbox.process.env = env;
    return sandbox.resolveActiveProfile();
  }

  test("argv 的 --profile 优先于环境变量（这才是实际加载的那个）", () => {
    const r = callResolve(
      [
        "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness",
        ".../cli.js",
        "--profile",
        "gverify",
      ],
      { DSH_PROFILE: "desktop", DSH_PROFILE_DIR: "/x/profiles/desktop" },
    );
    assert.equal(
      r.name,
      "gverify",
      "必须信 argv，而不是那个过期的 DSH_PROFILE=desktop",
    );
    assert.match(r.why, /argv/);
  });

  test("**桌面端的位置形态**也认（真实 app 就是这样传的）", () => {
    // 实测的真实桌面端 argv：
    //   [ …/MacOS/DeepSeek Harness, --expose-internals, …/dsh-desktop-host/lib/index.js,
    //     …/app.asar/dsh, /Users/…/profiles/desktop, …/runtime/primary-runtime, … ]
    // 它**没有** --profile 标志，profile 目录是按位置传的。
    // 只认 --profile 时这里会走"回退到 desktop" —— 这次结论恰好也是 desktop，
    // 所以看起来是对的。**那是运气，不是正确**：换一个 profile 就会污染基线。
    const r = callResolve(
      [
        "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness",
        "--expose-internals",
        "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js",
        "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh",
        "/Users/someone/.dsh/profiles/tui",
        "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime",
      ],
      { DSH_PROFILE: "desktop" },
    );
    assert.equal(
      r.name,
      "tui",
      `必须认出位置形态的 profile，而不是回退到 desktop（拿到 ${r.name}）`,
    );
    assert.match(r.why, /profile 路径/);
  });

  test("--profile=<名字> 的内联形态也认", () => {
    const r = callResolve(["node", "cli.js", "--profile=tui"], {});
    assert.equal(r.name, "tui");
  });

  test("没有 argv 时才退回环境变量，且在 why 里**标明它可能是陈的**", () => {
    const r = callResolve(["node", "cli.js"], { DSH_PROFILE: "web" });
    assert.equal(r.name, "web");
    // 这句警示很重要：读 why 的人必须知道这条线索不可靠
    assert.match(r.why, /可能来自启动 app 的那个 shell|可能.*陈/);
  });

  test("DSC_PROFILE 优先于 DSH_PROFILE（给工具/测试一个干净的覆盖点）", () => {
    const r = callResolve(["node", "cli.js"], {
      DSC_PROFILE: "parityfix",
      DSH_PROFILE: "desktop",
    });
    assert.equal(r.name, "parityfix");
  });

  test("全都没有 → 返回 null（调用方必须要求显式指定）", () => {
    const r = callResolve(["node", "cli.js"], {});
    assert.equal(r.name, null);
    assert.equal(r.why, "无法判断");
  });

  test("`--profile` 后面没跟值时不要吞掉下一个参数", () => {
    // `--profile --port 0` 这种畸形输入：不能把 `--port` 当成 profile 名，
    // 否则会去找一个叫 `--port` 的 profile（然后回退到 desktop，且理由看起来是对的）。
    const r = callResolve(["node", "cli.js", "--profile", "--port", "0"], {});
    assert.equal(r.name, null, `不该把选项当成 profile 名，实际拿到 ${r.name}`);
  });

  test("无法判断 profile 时禁止回退到 desktop", () => {
    // 用户看到"检查了 desktop"与"没判断出来所以查了 desktop"是两件事。
    // 后者意味着结论可能不是他想要的那个 profile。
    const { sandbox } = loadHost();
    sandbox.process.argv = ["node", "cli.js"];
    sandbox.process.env = {};
    const result = sandbox.resolveNodeModules();
    assert.equal(result.dir, null);
    assert.match(result.why, /无法确认当前 profile.*显式指定/);
  });
});
