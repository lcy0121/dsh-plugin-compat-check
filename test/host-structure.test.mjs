/**
 * 宿主半边（`plugin/index.js`）的**结构**测试。
 *
 * ## 为什么需要它 —— 一次真实事故，而且同类事故第二次
 *
 * 我在清理一段临时诊断代码时，用"从 A 切到 B"的方式删除，
 * 而 B 选错了锚点 —— 结果把 **`apply()` 的整个函数体**删掉了，只留下第一行日志：
 *
 * ```js
 * export function apply(ctx) {
 *   try {
 *     log(`HOST-HALF-ACTIVATED …`);
 *   } catch (error) { … }
 * }
 * ```
 *
 * 后果非常有教育意义：**它不是一个崩溃**。
 *   - `apply()` 正常返回，宿主正常启动，`did not activate` 告警 **0**
 *   - skill 没注册、工具没注册、路由没挂、启动自检没跑 —— **全都没有任何报错**
 *   - 我是靠"日志里少了几行"才发现的
 *
 * 也就是说：**一次静默的功能全灭**，恰好是本项目要检测的那类失败，而我亲手制造了一次。
 * 同一类事故在 `lib/client.js` 上已经发生过一次（删了 `usePluginState` 等定义，
 * 187 条测试全绿）。那次之后我加了 `test/client-structure.test.mjs`，
 * **但没有把同样的守卫加到宿主半边上** —— 于是它换了个地方又发生一次。
 *
 * 这个文件补上那一半：用 `vm` 把文件求值一遍，再**真的调用 `apply`**，
 * 用假 ctx 收集它注册了什么。功能全灭会当场暴露成"什么都没注册"。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { REPO } from "./helpers.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON, render } from "../lib/report.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { nextSteps } from "../lib/finding-guidance.mjs";
import { renderIssueReport } from "../bin/issue-report.mjs";

import { loadHost } from "./support/host-harness.mjs";
const HOST = path.join(REPO, "plugin", "index.js");
const SRC = fs.readFileSync(HOST, "utf8");

test("agent文本与摘要保留无已验证调用，并分开标注静态确定性和推断影响", () => {
  const result = run({
    nm: path.join(REPO, "test/fixtures/labels"),
    dshVersion: "0.2.1-rc.2",
    baseline: false,
    _ignoreAutoProbe: true,
  });
  const body = toJSON(result),
    before = JSON.stringify(body);
  const compat = {
    ok: true,
    toolVersion: body.toolVersion,
    report: { ...body, hasRuntimeSurface: false },
    nodeModules: "fixture",
    nodeModulesWhy: "test",
  };
  const { sandbox } = loadHost();
  const text = sandbox.renderForModel(compat);
  assert.match(text, /没有已验证调用/);
  assert.doesNotMatch(text, /没有用过任何 DSH 服务|没有任何可检查的依赖/);
  assert.match(text, /\[确定\]/);
  assert.match(text, /影响（推断，非实测）/);
  assert.match(text, /静态事实/);
  assert.match(text, /疑似.*证据不足/);
  assert.doesNotMatch(text, /无人提供的依赖/);
  const output = sandbox.toolResult(compat, text);
  assert.match(output.summary, /覆盖有限/);
  assert.match(output.summary, /无已验证调用/);
  assert.equal(JSON.stringify(body), before);
});
test("CLI、agent和故障报告从同一发现呈现相同的下一步且保留原判定", () => {
  const result = run({
    nm: path.join(REPO, "test/fixtures/labels"),
    dshVersion: "0.2.1-rc.2",
    baseline: false,
    _ignoreAutoProbe: true,
  });
  result.verdict = buildVerdicts({
    report: result.extract.report,
    dshVersion: "0.2.1-rc.2",
    entryStates: [
      {
        id: "observed-entry",
        packageName: "@label/real-service",
        state: "PENDING",
        disabled: false,
        group: false,
      },
    ],
  });
  const body = toJSON(result),
    before = JSON.stringify(body),
    { sandbox } = loadHost();
  const outputs = [
    render(result, {}),
    sandbox.renderForModel({
      ok: true,
      toolVersion: body.toolVersion,
      report: { ...body, hasRuntimeSurface: false },
    }),
    renderIssueReport(body).replaceAll("\\", ""),
  ];
  for (const finding of Object.values(body.plugins).flatMap((p) => p.findings))
    for (const step of nextSteps(finding))
      for (const output of outputs) assert.ok(output.includes(step), step);
  assert.equal(JSON.stringify(body), before);
});
test("注册给agent的工具描述区分证据确定性与影响依据", () => {
  const { sandbox } = loadHost();
  let registered;
  sandbox.registerTool(
    {
      inject: (_deps, cb) =>
        cb({
          tools: {
            register: (spec) => {
              registered = spec;
            },
          },
        }),
    },
    {},
  );
  assert(registered);
  assert.match(
    registered.description,
    /certain.*static facts.*runtime observations/,
  );
  assert.match(registered.description, /suspected.*insufficient evidence/);
  assert.match(registered.description, /impactBasis.*measured.*inferred/);
  assert.match(registered.description, /vacuous.*verified calls/);
});
test("tool profile schema agrees with fail-closed unknown-profile requests", async () => {
  const { sandbox } = loadHost({
    DSC_PROFILE: "",
    DSH_PROFILE: "",
    DSH_ACTIVE_PROFILE: "",
    DSH_PROFILE_NAME: "",
    DSH_PROFILE_DIR: "",
  });
  sandbox.process.argv = [process.execPath, "/fixture/host.js"];
  let tool;
  sandbox.registerTool(
    {
      inject: (_deps, cb) =>
        cb({
          tools: {
            register: (spec) => {
              tool = spec;
            },
          },
        }),
    },
    {},
  );
  const result = await tool.execute({});
  assert.equal(result.ok, false);
  assert.match(result.error, /profile.*显式指定/);
  assert.equal(result.nodeModules, "");
  assert.doesNotMatch(
    tool.parameters.properties.profile.description,
    /or desktop/i,
  );
  assert.match(
    tool.parameters.properties.profile.description,
    /explicit.*required|must.*explicit/i,
  );
  assert.equal(
    tool.parameters.required,
    undefined,
    "known current profile remains optional",
  );
});

test("CLI和agent仅对已有影响观测显示实测，静态入口问题仍显示推断", () => {
  const result = run({
    nm: path.join(REPO, "test/fixtures/labels"),
    dshVersion: "0.2.1-rc.2",
    baseline: false,
    _ignoreAutoProbe: true,
  });
  result.verdict = buildVerdicts({
    report: result.extract.report,
    dshVersion: "0.2.1-rc.2",
    entryStates: [
      {
        id: "observed-entry",
        packageName: "@label/real-service",
        state: "FAILED",
        disabled: false,
        group: false,
      },
    ],
  });
  const body = toJSON(result);
  const measured = body.plugins["@label/real-service"].findings.find(
    (f) => f.category === "host-entry-inactive",
  );
  assert.equal(measured.certainty, "certain");
  assert.equal(measured.impactBasis, "measured");
  const { sandbox } = loadHost();
  const text = sandbox.renderForModel({
    ok: true,
    toolVersion: body.toolVersion,
    report: { ...body, hasRuntimeSurface: false },
  });
  for (const out of [text, render(result, {})]) {
    assert.match(out, /影响（实测）.*FAILED/);
    assert.match(out, /影响（推断，非实测）/);
  }
});

describe("宿主半边：结构完整性（功能全灭的回归）", () => {
  test("apply 不是空壳 —— 它至少要注册三样东西", () => {
    // 这就是那次事故的直接回归：apply 只剩一行日志时，它**不报错、不崩**，
    // 宿主照常启动，只是什么都没注册。所以必须断言"注册了什么"。
    const { apply, logs } = loadHost();
    assert.equal(typeof apply, "function", "apply 不是函数 —— 导出被破坏了");

    const registered = { tools: [], routes: [], providers: [], timers: 0 };
    const ctx = {
      get: (k) =>
        k === "loader"
          ? { entries: () => [] }
          : k === "pluginManager"
            ? { list: () => [] }
            : undefined,
      loader: { entries: () => [] },
      effect: () => {},
      inject: (deps, cb) => {
        const scope = {};
        if (deps.includes("tools"))
          scope.tools = { register: (t) => registered.tools.push(t) };
        if (deps.includes("webServer"))
          scope.webServer = { register: (r) => registered.routes.push(r) };
        if (deps.includes("skills"))
          scope.skills = {
            registerProvider: (p) => registered.providers.push(p),
          };
        cb(scope);
      },
    };
    apply(ctx);

    assert.equal(
      registered.tools.length,
      1,
      "compat_check 工具没注册（apply 可能是空壳）",
    );
    assert.deepEqual(
      registered.routes.map((r) => r.path).sort(),
      [
        "/plugin-compat-check/report",
        "/plugin-compat-check/reviews",
        "/plugin-compat-check/upgrade-preview",
      ],
      "报告、处置及预检路由必须注册",
    );
    assert.equal(registered.providers.length, 1, "E1 skill provider 没注册");
    assert.ok(
      logs.some((l) => /F2 启动自检|runAutoCheck/.test(l)) ||
        SRC.includes("state.runAutoCheck = ()"),
      "F2 启动自检的挂载点不见了",
    );
  });

  test('apply() 里那些"注册动作"真的在函数体内（不是被误删成空壳）', () => {
    // 断言源码层面的形状：这些调用必须出现在 apply 的函数体里。
    // 用 vm 调用已经能抓到空壳，这条是**更早、更明确**的定位。
    const i = SRC.indexOf("export function apply(ctx) {");
    assert.ok(i > 0, "找不到 apply");
    let depth = 0,
      j = SRC.indexOf("{", i);
    for (let k = j; k < SRC.length; k++) {
      if (SRC[k] === "{") depth++;
      else if (SRC[k] === "}") {
        depth--;
        if (depth === 0) {
          j = k + 1;
          break;
        }
      }
    }
    const body = SRC.slice(i, j);
    assert.ok(
      body.split("\n").length > 100,
      `apply 只有 ${body.split("\n").length} 行 —— 像是被误删成空壳了（事故形态）`,
    );
    for (const needle of [
      "registerSkill(ctx)",
      "registerTool(ctx, state)",
      "schedulePass(0)",
      "runAutoCheck",
    ]) {
      assert.ok(
        body.includes(needle),
        `apply 里缺少 ${needle} —— 功能会被静默关掉`,
      );
    }
  });

  test('每个顶层函数定义都还在（防止"删多了"）', () => {
    // 事故的机制是"删除时锚点选错、多删了一段"。所以把预期的顶层函数清点一遍。
    const expected = [
      "resolveKernelDir",
      "resolveNodeModules",
      "resolveActiveProfile",
      "resolveDshVersion",
      "computeReport",
      "serveReport",
      "readPackagedSkill",
      "registerSkill",
      "renderForModel",
      "registerTool",
      "scan",
      "apply",
    ];
    // 注意 `async function` —— 第一版漏了它，于是把 serveReport / computeReport
    // 误报成"不见了"。测试自己的正则会漏，这件事值得留一行注释。
    const defined = new Set(
      [
        // `async function foo` / `function foo` / `export function foo` 三种都要覆盖。
        // 第一版只写了 `function`，于是把 `async function serveReport` 误报成"不见了"；
        // 第二版漏了 `export`，又把 `apply` 误报了一次。测试自己的正则会漏 —— 记在这。
        ...SRC.matchAll(
          /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
        ),
      ].map((m) => m[1]),
    );
    const missing = expected.filter((n) => !defined.has(n));
    assert.deepEqual(missing, [], `这些顶层函数不见了：${missing.join(", ")}`);
  });
});

describe("宿主半边：DSH 版本（F1 的闭合）", () => {
  test("有 resolveDshVersion，且**拿不到时返回 null 而不是猜**", () => {
    assert.ok(
      SRC.includes("function resolveDshVersion"),
      "缺 resolveDshVersion",
    );
    // 「拿不到 → null」是刻意的：猜一个版本会**凭空造出**声明不符的结论，
    // 那比缺一条结论糟得多。判定层对 null 已有处理。
    assert.match(SRC, /拿不到 → \*\*null，不猜\*\*|return null;/);
  });

  test("四条路里被否掉的三条，理由都写在源码里（避免下次又有人踩）", () => {
    // 代码里必须留下"为什么不用 xxx"的记录，否则下一个人会把它们加回来。
    assert.match(SRC, /DSH_VERSION/, "没写清 DSH_VERSION 不存在这件事");
    assert.match(
      SRC,
      /不起子进程/,
      "没写清为什么不用 dsh --version（只读边界）",
    );
    assert.match(
      SRC,
      /Info\.plist[\s\S]{0,80}macOS|macOS[\s\S]{0,80}Info\.plist|CFBundleShortVersionString/,
      "没写清 Info.plist 是 macOS 专有",
    );
  });

  test("解析用的路径**不写死 macOS**（要跨平台）", () => {
    // Plan §5.1：Windows未现场验证；路径解析仍须同时接受 / 与 \。
    //
    // 断言方式刻意避开"在测试里再写一层反斜杠" —— 那本身就是个错误来源。
    // 改为检查源码里那个正则的**字面形态**：字符类里必须同时出现这两种分隔符。
    const i = SRC.indexOf("function resolveDshVersion");
    assert.ok(i > 0, "找不到 resolveDshVersion");
    const body = SRC.slice(i, i + 3000);
    // 取出所有正则字面量，找带 `dsh` 的那个分隔符模式
    const sepClass =
      /\[[^\]]*\\[^\]]*\/[^\]]*\]/.exec(body) ||
      /\[[^\]]*\/[^\]]*\\[^\]]*\]/.exec(body);
    assert.ok(
      sepClass,
      `resolveDshVersion 里没找到同时含 / 与 \\ 的字符类：${body.slice(0, 400)}`,
    );
  });
});

test("disposed host generation removes its handle and cannot retire a newer generation", async () => {
  const { apply, sandbox } = loadHost();
  const cleanups = [];
  const ctx = {
    get: () => undefined,
    inject: () => () => {},
    effect: (fn) => {
      const dispose = fn();
      if (typeof dispose === "function") cleanups.push(dispose);
    },
  };
  apply(ctx);
  const old = sandbox.__DSH_COMPAT_CHECK__;
  assert.ok(old);
  assert.ok(cleanups.length > 0, "host owns lifecycle cleanup");
  const first = cleanups.splice(0);
  apply(ctx);
  const next = sandbox.__DSH_COMPAT_CHECK__;
  assert.notEqual(old, next);
  for (const fn of first) fn();
  assert.equal(
    sandbox.__DSH_COMPAT_CHECK__,
    next,
    "old disposal must preserve newer owner",
  );
  const retired = await old.compatReport();
  assert.equal(retired.ok, false);
  assert.match(retired.error, /disposed|已卸载/);
  for (const fn of cleanups) fn();
  assert.equal(sandbox.__DSH_COMPAT_CHECK__, undefined);
});

test("host version is read from an npm runtime prefix even when package.json is not exported", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-runtime-meta-"));
  try {
    const pkg = path.join(root, "runtime-prefix/node_modules/@deepseek-ai/dsh"),
      entry = path.join(pkg, "lib/cli.js");
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, "");
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name: "@deepseek-ai/dsh",
        version: "0.2.1-rc.2",
        exports: { ".": "./lib/cli.js" },
      }),
    );
    const { sandbox } = loadHost({ DSH_VERSION: "" });
    sandbox.process.argv = [process.execPath, entry];
    assert.equal(sandbox.__out.resolveDshVersion(), "0.2.1-rc.2");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("host subscriptions return route/tool/provider disposers to their owner", () => {
  const { apply } = loadHost();
  const cleanup = [];
  let active = 0;
  const register = () => {
    active++;
    let live = true;
    return () => {
      if (live) {
        active--;
        live = false;
      }
    };
  };
  const ctx = {
    get: () => undefined,
    effect: (fn) => {
      const off = fn();
      if (typeof off === "function") cleanup.push(off);
    },
    inject: (_deps, cb) => {
      const off = cb({
        get: () => undefined,
        webServer: { register },
        tools: { register },
        skills: { registerProvider: register },
      });
      if (typeof off === "function") cleanup.push(off);
      return () => {};
    },
  };
  apply(ctx);
  assert.equal(active, 5);
  for (const off of cleanup) off();
  assert.equal(active, 0, "no owned registrations may survive unload");
});

test("unloading an in-flight report before a pending manager read cannot write a baseline", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-disposal-flight-"));
  try {
    const nm = path.join(root, "home/profiles/disposal/node_modules/sample");
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(
      path.join(nm, "package.json"),
      JSON.stringify({
        name: "sample",
        version: "1.0.0",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
      }),
    );
    fs.writeFileSync(path.join(nm, "index.js"), "export function apply(){}");
    fs.writeFileSync(path.join(nm, "cordis.patch.yml"), "- name: ./index.js\n");
    const script = `import {apply} from ${JSON.stringify(pathToFileURL(HOST).href)};
   const off=[];let release,entered;const ready=new Promise(r=>entered=r);let calls=0;
   const ctx={get:key=>key==='pluginManager'?{list:()=>{if(++calls>1)return [];entered();return new Promise(r=>release=r);}}:undefined,inject:()=>()=>{},effect:fn=>{const d=fn();if(typeof d==='function')off.push(d);}};
   apply(ctx);const pending=globalThis.__DSH_COMPAT_CHECK__.compatReport();await ready;
   for(const d of off)d();release([]);const result=await pending;
   if(result.ok!==false)throw Error('retired report returned success');
   if(!/disposed|已卸载/.test(result.error))throw Error('missing retirement diagnostic');
   console.log('DISPOSED_INFLIGHT_OK');`;
    const r = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          DSC_KERNEL: REPO,
          DSC_PROFILE: "disposal",
          DSH_HOME: path.join(root, "home"),
          DSC_OUT_DIR: path.join(root, "diagnostic"),
          DSC_AUTORUN_MS: "60000",
          DSH_VERSION: "0.2.1-rc.2",
        },
      },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /DISPOSED_INFLIGHT_OK/);
    assert.ok(
      !fs.existsSync(path.join(root, "home/dsh-plugin-compat-check")),
      "retired generation cannot create a baseline",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("report route enforces the complete local origin authority", () => {
  test("another loopback port or hostname cannot read a report, while same-origin and local non-browser requests still work", async () => {
    const { apply } = loadHost({
      DSC_KERNEL: "/nonexistent-owned-kernel",
      DSC_OUT_DIR: "",
    });
    let route;
    apply({
      get: () => undefined,
      inject: (deps, fn) =>
        fn(
          deps.includes("webServer")
            ? {
                webServer: {
                  register: (r) => {
                    if (r.path === "/plugin-compat-check/report") route = r;
                  },
                },
              }
            : {},
        ),
      effect: () => {},
    });
    assert.ok(route);
    const cases = [
      [{ host: "127.0.0.1:8123", origin: "http://127.0.0.1:8124" }, false],
      [{ host: "127.0.0.1:8123", origin: "http://localhost:8123" }, false],
      [{ host: "127.0.0.1:8123", origin: "https://127.0.0.1:8123" }, false],
      [{ host: "localhost:80", origin: "http://LOCALHOST" }, true],
      [{ host: "[::1]:8123", origin: "http://[::1]:8123" }, true],
      [{ host: "127.0.0.1:8123", origin: "http://127.0.0.1:8123" }, true],
      [{ host: "127.0.0.1:8123" }, true],
      [{ host: "outside.example:8123" }, false],
      [{ host: "127.0.0.1:65536" }, false],
      [{ host: "127.0.0.1:8123", origin: "null" }, false],
      [{ host: "127.0.0.1:8123", origin: "http://127.0.0.1:8123/path" }, false],
      [{ host: "127.0.0.1:65536", origin: "http://127.0.0.1:65536" }, false],
    ];
    for (const [headers, allowed] of cases) {
      let status, body;
      await route.handler(
        {
          method: "GET",
          headers: { "x-dsh-compat-request": "1", ...headers },
          url: "/plugin-compat-check/report",
          socket: { encrypted: false },
        },
        {
          writeHead: (code) => {
            status = code;
          },
          setHeader: () => {},
          end: (text) => {
            body = text;
          },
        },
      );
      assert.equal(status === 403, !allowed, JSON.stringify(headers));
      if (!allowed) assert.ok(!body.includes("nodeModules"));
    }
  });
});

test("a forged loopback Host cannot admit a remote socket", async () => {
  const { apply } = loadHost({
    DSC_KERNEL: "/nonexistent-owned-kernel",
    DSC_OUT_DIR: "",
  });
  let route;
  apply({
    get: () => undefined,
    inject: (deps, fn) =>
      fn(
        deps.includes("webServer")
          ? {
              webServer: {
                register: (r) => {
                  if (r.path === "/plugin-compat-check/report") route = r;
                },
              },
            }
          : {},
      ),
    effect: () => {},
  });
  let status;
  await route.handler(
    {
      method: "GET",
      headers: { host: "127.0.0.1:8123", "x-dsh-compat-request": "1" },
      url: "/plugin-compat-check/report?refresh=1",
      socket: { remoteAddress: "192.0.2.10" },
    },
    { writeHead: (code) => (status = code), end() {} },
  );
  assert.equal(status, 403);
});
