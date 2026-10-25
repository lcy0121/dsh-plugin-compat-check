#!/usr/bin/env node
/** Owned browser transport acceptance for planned client entries. Network/page failures do not prove business correctness. */

import {
  failureDiagnostic,
  cleanupOwned,
  combineFailure,
  stopOwnedChild,
} from "../lib/owned-process.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";
import { command } from "../lib/probe-runner.mjs";
import { compatibilityText } from "./arrival-text.mjs";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { prepareOwnedPackageSource } from "./owned-package-source.mjs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
const CHROME =
  process.env.DSC_CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function parseArgs(argv) {
  const out = {
    profile: "web",
    json: false,
    keep: false,
    timeoutMs: 60000,
    withPlugin: true,
    breakClient: false,
    breakImport: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--profile") {
      out.profile = argv[++i];
      continue;
    }
    if (a === "--json") {
      out.json = true;
      continue;
    }
    if (a === "--keep") {
      out.keep = true;
      continue;
    }
    if (a === "--timeout") {
      out.timeoutMs = Number(argv[++i]);
      continue;
    }
    if (a === "--no-plugin") {
      out.withPlugin = false;
      continue;
    }
    if (a === "--break") {
      out.breakClient = true;
      continue;
    }
    if (a === "--break-import") {
      out.breakImport = true;
      continue;
    }
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

/** cdp 的最小封装：够用就好，零依赖 */
function log(msg, quiet) {
  if (!quiet) process.stderr.write(`${msg}\n`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!/^[\w.-]+$/.test(opts.profile) || [".", ".."].includes(opts.profile))
    throw new Error("Invalid profile name");
  const base = path.join(HOME, "profiles", opts.profile);
  if (!fs.existsSync(base) && opts.profile !== "web") {
    process.stderr.write(`基准 profile 不存在：${base}\n`);
    process.exit(3);
  }
  if (!fs.existsSync(CHROME)) {
    process.stderr.write(
      `找不到 Chrome：${CHROME}\n  用 DSC_CHROME 指定路径\n`,
    );
    process.exit(3);
  }

  const tmpName = `dsc-arrival-${randomUUID()}`;
  const tmpProfile = path.join(HOME, "profiles", tmpName);
  fs.mkdirSync(path.dirname(tmpProfile), { recursive: true, mode: 0o700 });
  if (fs.existsSync(base)) fs.mkdirSync(tmpProfile, { mode: 0o700 });
  const chromeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dsc-arrival-chrome-"),
  );
  const artifactDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "dsc-arrival-artifact-"),
  );
  let cleaned = null;
  let host = null;
  let chrome = null;
  const cleanup = async () => {
    if (cleaned) return cleaned;
    await cleanupOwned([() => stopOwnedChild(host), () => chrome?.close()]);
    if (!opts.keep) {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
      fs.rmSync(chromeDir, { recursive: true, force: true });
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
    cleaned = {
      tempProfile: tmpProfile,
      tempProfileRemoved: !fs.existsSync(tmpProfile),
      chromeDirRemoved: !fs.existsSync(chromeDir),
      artifactDirRemoved: !fs.existsSync(artifactDir),
      hostPid: host?.pid || null,
    };
    return cleaned;
  };

  try {
    // ── 1. 造一个临时 profile（**必须从干净的模板复制** —— 装过社区插件的 profile
    //      带着 `file:` 依赖，复制后 pnpm 会 ENOENT，报错还被收成一行）──
    if (fs.existsSync(base)) fs.cpSync(base, tmpProfile, { recursive: true });
    else {
      const init = await command(
        "dsh",
        [
          "--profile",
          tmpName,
          "--from-default-profile",
          "web",
          "--dump-config",
        ],
        { env: { ...process.env, DSH_HOME: HOME } },
      );
      if (init.code !== 0)
        throw new Error(
          "创建测试profile失败: " + (init.error || init.output).slice(0, 1800),
        );
      fs.chmodSync(tmpProfile, 0o700);
    }
    // `--break`：装一个**已知会坏**的客户端插件做负向对照。
    // 没有它的话，"0 条未到货"既可能是工具对，也可能是工具瞎 ——
    // 一个从没见过红的检查与永远绿的检查，在证据上没有区别。
    if (opts.breakClient) {
      const b = spawnSync(
        "dsh",
        [
          "plugin",
          "--profile",
          tmpName,
          "add",
          `file:${path.join(REPO, "test", "fixtures", "labels", "broken-client")}`,
        ],
        {
          encoding: "utf8",
          timeout: 300000,
          env: { ...process.env, DSH_HOME: HOME },
        },
      );
      if (b.status !== 0)
        throw new Error(
          `装负向对照失败: ${(b.stderr || b.stdout || "").slice(-400)}`,
        );
    }
    if (opts.breakImport) {
      const fixture = path.join(artifactDir, "broken-import");
      fs.mkdirSync(fixture);
      fs.writeFileSync(
        path.join(fixture, "package.json"),
        JSON.stringify({
          name: "@label/broken-client-import",
          version: "1.0.0",
          type: "module",
          main: "index.js",
          exports: {
            ".": "./index.js",
            "./client": { default: "./client.js" },
          },
          dsh: {
            bundle: { patch: "cordis.patch.yml" },
            client: { platform: "web" },
          },
        }),
      );
      fs.writeFileSync(
        path.join(fixture, "index.js"),
        "export function apply() {}",
      );
      fs.writeFileSync(
        path.join(fixture, "client.js"),
        "throw new Error('controlled client import failure');",
      );
      fs.writeFileSync(
        path.join(fixture, "cordis.patch.yml"),
        '- insert:\n    - id: "@label/broken-client-import"\n      name: "@label/broken-client-import"\n',
      );
      const b = await command(
        "dsh",
        ["plugin", "--profile", tmpName, "add", `file:${fixture}`],
        { env: { ...process.env, DSH_HOME: HOME } },
      );
      if (b.code !== 0)
        throw new Error(
          "装客户端导入负向对照失败: " + (b.error || b.output).slice(-400),
        );
    }
    if (opts.withPlugin) {
      // A bare file:plugin copy has no staged kernel. Exercise the real artifact.
      // Pack hooks stage/unstage files; give them owned inputs so concurrent
      // packaging cannot mutate this checkout or remove another run's kernel.
      const packRoot = path.join(artifactDir, "source");
      prepareOwnedPackageSource(REPO, packRoot);
      const packed = await command(
        "npm",
        [
          "pack",
          path.join(packRoot, "plugin"),
          "--silent",
          "--pack-destination",
          artifactDir,
        ],
        { env: process.env, timeoutMs: 120000 },
      );

      if (packed.code !== 0)
        throw new Error(
          "打包本插件失败: " + (packed.error || packed.output).slice(-500),
        );
      const tarballs = fs
        .readdirSync(artifactDir)
        .filter((n) => n.endsWith(".tgz"));
      if (tarballs.length !== 1) throw new Error("打包未产生唯一tgz");
      const add = await command(
        "dsh",
        [
          "plugin",
          "--profile",
          tmpName,
          "add",
          `file:${path.join(artifactDir, tarballs[0])}`,
        ],
        { env: { ...process.env, DSH_HOME: HOME } },
      );
      if (add.code !== 0)
        throw new Error(
          `装本插件失败: ${(add.error || add.output).slice(-500)}`,
        );
    }

    // ── 2. 起宿主，从 stdout 抓 URL+token ──
    host = spawn(
      "dsh",
      ["--profile", tmpName, "--", "--port", "0", "--no-open"],
      {
        detached: process.platform !== "win32",
        env: { ...process.env, DSH_HOME: HOME },
      },
    );
    // ⚠️ **stderr 也要收。** `startup failed: …` 是打在 stderr 上的 ——
    // 只收 stdout 的话，"宿主拒绝启动"的原因会退化成一句没用的
    // "没给出 URL"（我第一版就是这样，差点把最重要的证据丢了）。
    let out = "";
    const url = await new Promise((res) => {
      const t = setTimeout(() => res(null), opts.timeoutMs);
      host.stdout.on("data", (b) => {
        out += b;
        const m = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(out);
        if (m) {
          clearTimeout(t);
          res(m[1]);
        }
      });
      host.stderr.on("data", (b) => {
        out += b;
      });
      host.on("exit", () => {
        clearTimeout(t);
        res(null);
      });
    });
    if (!url) {
      // ⚠️ 宿主**根本起不来**是一种**预期内的结果**，不是工具的失败。
      //
      // 实测（负向对照 `@label/broken-client`，声明了客户端半边但文件不存在）：
      //
      //   dsh: startup failed: 1 required plugin did not activate
      //     modules (required)
      //       AggregateError: client-modules: 1 client package failed to compose:
      //         client bundles not found; run `pnpm run build` before launch:
      //           - package: @label/broken-client
      //             path: …/node_modules/@label/broken-client/lib/does-not-exist.js
      //
      // 也就是说**客户端半边缺文件时宿主直接拒绝启动**，用户连 URL 都拿不到 ——
      // 这比"界面变成错误屏"更严重，而在此之前文档里从没把这两件事分开过。
      //
      // 所以这里把宿主自己的话原样带出来，而不是当成工具出错。
      const failMatch = /startup failed:([\s\S]{0,1200})/.exec(out);
      const payload = {
        profile: opts.profile,
        hostStartupFailed: true,
        hostError: failMatch
          ? failMatch[0].trim()
          : `宿主没给出 URL。stdout 末尾：\n${out.slice(-600)}`,
        expected:
          opts.breakClient &&
          /@label\/broken-client/.test(out) &&
          /startup failed|did not activate/.test(out),
        cleanup: await cleanup(),
      };
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stdout.write(
          `客户端到货对账 —— ${opts.profile}${opts.breakClient ? " + 已知会坏的客户端插件" : ""}\n\n`,
        );
        process.stdout.write(
          `  宿主没有启动（${payload.expected ? "预期负向对照" : "非预期失败"}）\n\n`,
        );
        for (const line of payload.hostError.split("\n"))
          process.stdout.write(`    ${line}\n`);
        process.stdout.write("\n");
        if (payload.expected) {
          process.stdout.write(
            "  ✅ 这正是负向对照期望的结果：客户端半边缺文件 → **宿主拒绝启动**，\n",
          );
          process.stdout.write(
            '     用户连 URL 都拿不到。比"界面变成错误屏"更严重。\n',
          );
        } else {
          process.stdout.write(
            "  ❌ 非预期的启动失败 —— 检查这个 profile 的客户端条目。\n",
          );
        }
      }
      await cleanup();
      process.exit(payload.expected ? 0 : 1);
    }
    log(`宿主就绪 ${url.replace(/token=.*/, "token=…")}`, opts.json);

    // ── 3. 无头 Chrome + CDP ──
    chrome = await launchChromePipe(CHROME, {
      timeoutMs: opts.timeoutMs,
      userDataDir: chromeDir,
    });
    const cdp = chrome;

    // ⚠️ `Network.enable` **必须在 navigate 之前** —— 否则早期请求收不到，
    // 而"遗漏的请求"看起来与"没到货"一模一样（实测会少记一批）。
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");
    await cdp.send("Page.navigate", { url });
    // 等界面稳定：客户端条目是分批拉的，太快读到的是半成品
    await new Promise((r) => setTimeout(r, 20000));

    const evalx = async (expr) =>
      (
        await cdp.send("Runtime.evaluate", {
          expression: expr,
          returnByValue: true,
          awaitPromise: true,
        })
      )?.result?.value;

    const bootRaw = await evalx(
      "window.__DSH_BOOT__ ? JSON.stringify({entries: window.__DSH_BOOT__.entries, batches: window.__DSH_BOOT__.batches}) : null",
    );
    const rootLen = await evalx(
      '(document.querySelector("#root")||{}).textContent ? document.querySelector("#root").textContent.length : 0',
    );
    // ⚠️ **不要用长度阈值判"界面是不是坏了"。** 第一版写 `< 2000` 就误报了：
    // `web` 模板本来就没内容（76 字符），而桌面 app 是 35397。同一个数字在两种
    // profile 下含义完全不同。改成认**错误屏自己的文案** —— 那是宿主写的，不是我猜的。
    const errorScreen = await evalx(`(() => {
      const t = document.body ? document.body.textContent : '';
      const hit = /Failed to load plugins|did not activate|import failed/i.test(t);
      const m = /(Failed to load plugins[\s\S]{0,200})/.exec(t);
      return hit ? (m ? m[1] : '(命中错误屏文案)') : null;
    })()`);
    const title = await evalx("document.title");

    // ── 4. 从网络事件里对账 ──
    //
    // ⚠️ **条目是「打包」取的，不是一条一个请求。** 实测：66 条条目 → **3 个请求**，
    // 每个请求的 path 是几十个 `<id>/client.js` 用逗号拼起来的：
    //
    //   plugins/??<id1>/client.js,<id2>/client.js,…&rev=<该批次的 rev>
    //
    // 而 `__DSH_BOOT__.batches` **已经把这层分组写好了**
    // （`{phase, url, rev, entries:[…]}`）—— 所以直接用 `batches`，
    // 不要去拼字符串：拼错了的表现是"一堆条目显示未到货"，而界面明明是好的
    // （我第一版就这么错了）。
    //
    // 这也解释了客户端为什么"一坏就是整个界面"：**一个批次是一个请求**，
    // 它挂了，这一批的每一条条目都到不了。
    const arrivedUrls = new Set();
    const failedUrls = new Map();
    const byReq = new Map();
    for (const e of cdp.events) {
      if (e.method === "Network.requestWillBeSent")
        byReq.set(e.params.requestId, e.params.request.url);
    }
    for (const e of cdp.events) {
      if (e.method === "Network.responseReceived") {
        const st = e.params.response.status;
        if (st >= 200 && st < 300) arrivedUrls.add(e.params.response.url);
      }
      if (e.method === "Network.loadingFailed") {
        failedUrls.set(
          byReq.get(e.params.requestId) ?? e.params.requestId,
          e.params.errorText,
        );
      }
    }
    const exceptions = cdp.events.filter(
      (e) => e.method === "Runtime.exceptionThrown",
    );

    if (!bootRaw)
      throw new Error("浏览器没有返回启动条目清单，不能将空清单当成全部到货");
    const boot = JSON.parse(bootRaw);
    const batches = (boot.batches ?? []).map((b) => {
      const needle = String(b.url).split("&")[0];
      let status = null;
      for (const u of arrivedUrls)
        if (u.includes(needle)) {
          status = 200;
          break;
        }
      let err = null;
      for (const [u, t] of failedUrls)
        if (String(u).includes(needle)) {
          err = t;
          break;
        }
      return {
        phase: b.phase ?? null,
        rev: b.rev ?? null,
        entries: (b.entries ?? []).length,
        arrived: status !== null && err === null,
        status,
        error: err,
        entryIds: b.entries ?? [],
      };
    });

    const rows = batches.flatMap((b) =>
      b.entryIds.map((id) => ({
        id,
        phase: b.phase,
        batchRev: b.rev,
        arrived: b.arrived,
        status: b.status,
        error: b.error,
      })),
    );

    const got = rows.filter((r) => r.arrived).length;
    const missing = rows.filter((r) => !r.arrived);
    const ourEntry = rows.find((r) => r.id === "dsh-plugin-compat-check");

    let compatibility = null;
    if (opts.withPlugin) {
      const target = new URL("/plugin-compat-check/report?refresh=1", url);
      const token = new URL(url).searchParams.get("token");
      const response = await fetch(target, {
        headers: { Authorization: `Bearer ${token}`, "X-DSH-Compat-Request": "1" },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("兼容性报告接口HTTP " + response.status);
      const report = await response.json();
      compatibility = {
        ok: report.ok === true,
        toolVersion: report.toolVersion,
        hasRuntimeSurface: report.report?.hasRuntimeSurface === true,
        error: report.error || null,
      };
    }
    const result = {
      profile: opts.profile,
      planned: rows.length,
      arrived: got,
      missing: missing.length,
      batchesPlanned: batches.length,
      batchesArrived: batches.filter((b) => b.arrived).length,
      exceptions: exceptions.length,
      rootTextLength: rootLen,
      errorScreen,
      title,
      ourPluginEntry: ourEntry
        ? { arrived: ourEntry.arrived, status: ourEntry.status }
        : null,
      compatibility,
      cleanup: await cleanup(),
      batches,
      missingEntries: missing.map((r) => ({
        id: r.id,
        phase: r.phase,
        batchRev: r.batchRev,
        error: r.error,
      })),
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `客户端到货对账 —— ${opts.profile}${opts.withPlugin ? " + 本插件" : ""}${opts.breakClient ? " + 已知会坏的客户端插件" : ""}\n\n`,
      );
      process.stdout.write(
        `  计划加载    ${rows.length} 条条目 / ${batches.length} 个批次（__DSH_BOOT__）\n`,
      );
      process.stdout.write(
        `  实际到货    ${got} 条条目 / ${batches.filter((b) => b.arrived).length} 个批次\n`,
      );
      process.stdout.write(`  未到货      ${missing.length} 条\n`);
      process.stdout.write(
        `  运行时异常  ${exceptions.length}${exceptions.length ? "   ← 到了但执行失败（客户端最致命的形态）" : ""}\n`,
      );
      process.stdout.write(
        `  #root 文本  ${rootLen} 字符（仅供参考 —— 不同 profile 的正常值差很多）\n`,
      );
      if (errorScreen !== null)
        process.stdout.write(
          `  ❌ 错误屏    ${String(errorScreen).replace(/\s+/g, " ").slice(0, 120)}\n`,
        );
      if (ourEntry)
        process.stdout.write(
          `  本插件条目  ${ourEntry.arrived ? "✅ 到货" : "❌ 未到货"}（批次 ${ourEntry.batchRev}）\n`,
        );
      process.stdout.write(compatibilityText(compatibility));
      process.stdout.write(
        "\n  批次明细（**一个批次 = 一个请求** —— 它挂了，这一批每条都到不了）\n",
      );
      for (const b of batches) {
        process.stdout.write(
          `    ${b.arrived ? "✅" : "❌"} ${String(b.phase).padEnd(12)} ${String(b.entries).padStart(3)} 条  rev=${String(b.rev).slice(0, 12)}${b.error ? `  error=${b.error}` : ""}\n`,
        );
      }
      for (const m of missing.slice(0, 10)) {
        process.stdout.write(
          `\n  ❌ ${m.id}\n       phase=${m.phase} error=${m.error ?? "-"}\n`,
        );
      }
    }

    // 退出码：有未到货或有异常就是**发现问题**
    const bad =
      missing.length > 0 ||
      exceptions.length > 0 ||
      errorScreen !== null ||
      (opts.withPlugin && compatibility?.ok !== true);
    await cleanup();
    process.exit(bad ? 1 : 0);
  } catch (error) {
    try {
      await cleanup();
    } catch (failure) {
      error = combineFailure(error, failure);
    }
    process.stderr.write(
      JSON.stringify({
        error: error.message,
        diagnostics: failureDiagnostic(error),
      }) + "\n",
    );
    process.exit(3);
  }
}

main();
