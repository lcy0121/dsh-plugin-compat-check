/**
 * H1' 到货侧的慢测试：真的起一次宿主 + 无头 Chrome，对账客户端条目到货情况。
 *
 * 默认跳过，用 `DSC_SLOW=1` 跑：
 *
 *     DSC_SLOW=1 node --test test/client-arrival.test.mjs
 *
 * ## 它补的是哪一半
 *
 * H1' = 「计划加载的 `__DSH_BOOT__.entries` vs 实际到货」。
 * - **宿主侧**（已在 `plugin/index.js` 的 `clientHalf` 里）：声明了客户端半边、
 *   那半边能不能被解析到 —— 静态可判。
 * - **到货侧（本文件）**：浏览器里真的到了吗 —— **只有浏览器能回答**。
 *
 * ## 负向对照是这条测试存在的前提
 *
 * "0 条未到货"既可能是工具对，也可能是工具瞎。一个从没见过红的检查与永远绿的检查，
 * 在证据上没有区别。所以这里正常与两种负向对照都跑：
 *
 * 1. 正向：`web` 模板 + 本插件 → 全部到货、0 异常
 * 2. 负向：再加一个**已知会坏**的客户端插件（`@label/broken-client`，
 *    声明了 `dsh.client` 但文件不存在）→ **宿主拒绝启动**
 * 3. 负向：客户端文件存在但import抛错 → **浏览器异常/错误屏**
 *
 * 第 2 条顺带量出了一件此前文档里从没分开过的事：客户端半边有两种失败的严重度
 * 完全不同 —— **文件不存在 → 宿主起不来**；**文件在但导入失败 → 界面变错误屏**。
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(new URL(".", import.meta.url).pathname, "..");
const SLOW = process.env.DSC_SLOW === "1";
let runRoot, testEnv;
const CHROME =
  process.env.DSC_CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

if (!SLOW && !process.env.DSC_QUIET_SKIP_NOTICE) {
  process.stderr.write(
    "[client-arrival] 慢测试已跳过（起宿主 + 无头 Chrome，约 40~70 秒）。" +
      "要跑：DSC_SLOW=1 node --test test/client-arrival.test.mjs\n",
  );
}

const skip = !SLOW
  ? "慢测试：设 DSC_SLOW=1 才跑（要起宿主与无头 Chrome）"
  : !fs.existsSync(CHROME)
    ? `本机没有 Chrome（${CHROME}）`
    : false;

function run(args) {
  // `client-arrival.mjs` 在"发现问题"时退 1 —— 那是**结论**，不是运行失败，
  // 所以这里拿 stdout 解析，不把退出码当异常。
  const r = execFileSync(
    process.execPath,
    ["tools/client-arrival.mjs", ...args, "--json", "--no-plugin"],
    { cwd: REPO, encoding: "utf8", timeout: 900000, env: testEnv },
  );
  return JSON.parse(r);
}

describe(
  "H1' 到货侧：计划加载的客户端条目，浏览器里真的到了吗",
  { skip },
  () => {
    before(() => {
      runRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "dsc-arrival-live-test-"),
      );
      testEnv = {
        ...process.env,
        DSH_HOME: path.join(runRoot, "home"),
        DSH_AGENTS_HOME: path.join(runRoot, "agents"),
      };
      for (const key of [
        "DSC_KERNEL",
        "DSC_PROBE_REPORT",
        "DSC_PROFILE",
        "DSC_NODE_MODULES",
        "DSC_OUT_DIR",
      ])
        delete testEnv[key];
    });
    after(() => {
      if (runRoot) fs.rmSync(runRoot, { recursive: true, force: true });
    });
    test("正向：web模板全部到货、0 异常", () => {
      const r = run([]);
      assert.ok(
        !r.hostStartupFailed,
        `宿主没起来：${(r.hostError || "").slice(0, 300)}`,
      );
      assert.ok(
        r.planned > 0,
        "一个计划条目都没有 —— __DSH_BOOT__ 的形状变了？",
      );
      assert.equal(
        r.missing,
        0,
        `有 ${r.missing} 条条目没到货：${JSON.stringify(r.missingEntries?.slice(0, 5))}`,
      );
      assert.equal(
        r.exceptions,
        0,
        '有运行时异常 —— "到了但执行失败"是客户端最致命的形态（界面会被错误屏替代）',
      );
      assert.equal(
        r.errorScreen,
        null,
        `出现了错误屏：${String(r.errorScreen).slice(0, 200)}`,
      );
      // 批次是**一个请求一条**：它挂了这一批每条都到不了 —— 所以也断言批次
      assert.equal(r.batchesArrived, r.batchesPlanned, "有批次没到货");
    });

    test("本插件自己的客户端条目确实到货（否则界面上的面板就是假的）", () => {
      const r = execFileSync(
        process.execPath,
        ["tools/client-arrival.mjs", "--json"],
        { cwd: REPO, encoding: "utf8", timeout: 900000, env: testEnv },
      );
      const d = JSON.parse(r);
      assert.equal(
        d.compatibility?.ok,
        true,
        "客户端到货不能掩盖实际报告不可用（裸plugin缺kernel）",
      );
      assert.equal(
        d.compatibility?.toolVersion,
        JSON.parse(fs.readFileSync(path.join(REPO, "plugin/package.json")))
          .version,
      );
      assert.equal(d.cleanup.tempProfileRemoved, true);
      assert.equal(d.cleanup.chromeDirRemoved, true);
      assert.equal(d.cleanup.artifactDirRemoved, true);
      assert.ok(
        d.ourPluginEntry,
        "计划里没有本插件的客户端条目 —— 它没被装进临时 profile？",
      );
      assert.equal(
        d.ourPluginEntry.arrived,
        true,
        `本插件的客户端条目没到货（status=${d.ourPluginEntry.status}）—— 那界面上的「兼容性」面板根本不会出现`,
      );
    });

    test("负向对照：客户端半边缺文件时，**宿主拒绝启动**（用户连 URL 都拿不到）", () => {
      // ⚠️ 这条断言的是**宿主的失败**，不是工具的失败 —— 所以拿 stdout 解析，
      // 且 `--break` 时工具自己退 0（它识别出这是预期结果）。
      const out = execFileSync(
        process.execPath,
        ["tools/client-arrival.mjs", "--break", "--json", "--no-plugin"],
        { cwd: REPO, encoding: "utf8", timeout: 900000, env: testEnv },
      );
      const d = JSON.parse(out);
      assert.equal(
        d.hostStartupFailed,
        true,
        "加了已知会坏的客户端插件，宿主却起来了 —— 那这条负向对照什么都没测到",
      );
      assert.match(
        d.hostError,
        /startup failed|did not activate/,
        `宿主的报错不是预期的形状：${String(d.hostError).slice(0, 300)}`,
      );
      // 宿主自己把**是哪个包**说了出来 —— 这正是用户需要的信息
      assert.match(
        d.hostError,
        /@label\/broken-client/,
        "宿主的报错里没点出是哪个包 —— 那用户无从下手",
      );
    });
    test("负向对照：文件到货但执行失败仍返回发现问题", () => {
      const r = spawnSync(
        process.execPath,
        ["tools/client-arrival.mjs", "--break-import", "--json"],
        { cwd: REPO, env: testEnv, encoding: "utf8", timeout: 180000 },
      );
      assert.equal(r.status, 1, r.stderr + "\n" + r.stdout.slice(-700));
      const data = JSON.parse(r.stdout);
      assert.ok(!data.hostStartupFailed);
      assert.ok(
        data.exceptions > 0 || data.errorScreen,
        "不能把已到货的执行失败读成正常",
      );
      assert.equal(
        data.compatibility.ok,
        true,
        "客户端错误不能掩盖宿主报告接口的独立状态",
      );
      assert.equal(data.cleanup.tempProfileRemoved, true);
    });
  },
);
