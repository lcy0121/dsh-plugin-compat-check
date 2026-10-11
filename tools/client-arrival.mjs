#!/usr/bin/env node
/**
 * H1' 的**到货侧**：计划加载的客户端条目，在真实浏览器里到底到了几个。
 *
 * ## 这个工具补的是哪一半
 *
 * H1' 的原定义是「**计划加载**的 `__DSH_BOOT__.entries` vs **实际到货**」。
 * 它分成两半，而两半的数据来源**完全不同**：
 *
 * | 半边 | 问什么 | 从哪拿 |
 * |---|---|---|
 * | 宿主侧 | 声明了客户端半边，那半边真的能被解析到吗 | 静态可判（`plugin/index.js` 的 `clientHalf`） |
 * | **到货侧（本文件）** | 计划要加载的条目，浏览器里真的到了吗 | **只有浏览器**：CDP 的 `Network` 域 |
 *
 * ## 为什么必须看网络，而不是看某个"注册表"
 *
 * 实测过浏览器里暴露了什么（`web` profile + 本插件，无头 Chrome）：
 *
 * ```
 * __DSH_BOOT__     = { rev, entries: [66 条], batches: [3 批] }   ← 这是**计划**
 * __ModuleLoader__ = { mode, pendingQueue, load, create }         ← **没有**已加载的注册表
 * ```
 *
 * 也就是说"到货了没有"**没有任何现成的 API 可读**。所以从**网络层**判：
 * 每条条目的 URL（`plugins/??<id>/client.js&rev=<rev>`）在 `Network.responseReceived`
 * 里出现了吗、状态码是多少、有没有 `loadingFailed`。
 *
 * 这比"看某个标记存不存在"强：它是浏览器**自己**给出的传输结果，不是插件自报的。
 *
 * ## 判据（三个都要）
 *
 * 一条条目算「到货」，当且仅当：
 *   1. 它的 URL 有 `Network.responseReceived` 且状态码 2xx；
 *   2. 没有对应的 `Network.loadingFailed`；
 *   3. 整轮里没有 `Runtime.exceptionThrown`（有异常就说明"到了但执行失败"，
 *      而那正是客户端条目最致命的形态 —— 界面会被一张错误屏替代）。
 *
 * 第 3 条是**整轮**的，不是逐条目的：浏览器不会告诉你"这个异常属于哪个条目"。
 * 所以它只能回答"这一轮干不干净"，不能回答"是哪一条坏了" —— 这个限制写在输出里。
 *
 * ## 用法
 *
 *     node tools/client-arrival.mjs                    # 用 web 模板 + 本插件（确定性最好）
 *     node tools/client-arrival.mjs --profile desktop  # 换一个 profile（会复制它）
 *     node tools/client-arrival.mjs --json
 *     node tools/client-arrival.mjs --keep             # 留下临时 profile 与 Chrome 数据目录
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const CHROME = process.env.DSC_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

function parseArgs(argv) {
  const out = { profile: 'web', json: false, keep: false, timeoutMs: 60000, withPlugin: true, breakClient: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--profile') { out.profile = argv[++i]; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--keep') { out.keep = true; continue; }
    if (a === '--timeout') { out.timeoutMs = Number(argv[++i]); continue; }
    if (a === '--no-plugin') { out.withPlugin = false; continue; }
    if (a === '--break') { out.breakClient = true; continue; }
    throw new Error(`无法识别的参数: ${a}`);
  }
  return out;
}

/** cdp 的最小封装：够用就好，零依赖 */
function makeCdp(ws) {
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method) events.push(m);
  });
  const send = (method, params = {}) => new Promise((res) => {
    const i = ++id;
    pending.set(i, (r) => res(r.result ?? r.error));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  return { send, events };
}

function log(msg, quiet) { if (!quiet) process.stderr.write(`${msg}\n`); }

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const base = path.join(HOME, 'profiles', opts.profile);
  if (!fs.existsSync(base)) {
    process.stderr.write(`基准 profile 不存在：${base}\n`);
    process.exit(3);
  }
  if (!fs.existsSync(CHROME)) {
    process.stderr.write(`找不到 Chrome：${CHROME}\n  用 DSC_CHROME 指定路径\n`);
    process.exit(3);
  }

  const tmpName = `dsc-arrival-${process.pid}-${Date.now()}`;
  const tmpProfile = path.join(HOME, 'profiles', tmpName);
  const chromeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsc-arrival-chrome-'));
  let host = null;
  let chrome = null;
  const cleanup = () => {
    try { if (host) host.kill('SIGTERM'); } catch { /* 尽力而为 */ }
    try { if (chrome) chrome.kill('SIGTERM'); } catch { /* 尽力而为 */ }
    // 兜底：确认端口进程真的没了（`--port 0` 起的宿主不会自己退）
    try { spawnSync('pkill', ['-f', tmpName], { stdio: 'ignore' }); } catch { /* 尽力而为 */ }
    if (!opts.keep) {
      try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
      try { fs.rmSync(chromeDir, { recursive: true, force: true }); } catch { /* 尽力而为 */ }
    }
  };

  try {
    // ── 1. 造一个临时 profile（**必须从干净的模板复制** —— 装过社区插件的 profile
    //      带着 `file:` 依赖，复制后 pnpm 会 ENOENT，报错还被收成一行）──
    const cp = spawnSync('cp', ['-R', base, tmpProfile], { encoding: 'utf8', timeout: 60000 });
    if (cp.status !== 0) throw new Error(`复制 profile 失败: ${(cp.stderr || '').trim()}`);
    // `--break`：装一个**已知会坏**的客户端插件做负向对照。
    // 没有它的话，"0 条未到货"既可能是工具对，也可能是工具瞎 ——
    // 一个从没见过红的检查与永远绿的检查，在证据上没有区别。
    if (opts.breakClient) {
      const b = spawnSync('dsh', ['plugin', '--profile', tmpName, 'add',
        `file:${path.join(REPO, 'test', 'fixtures', 'labels', 'broken-client')}`],
      { encoding: 'utf8', timeout: 300000, env: { ...process.env, DSH_HOME: HOME } });
      if (b.status !== 0) log(`装负向对照失败（继续）: ${(b.stderr || '').slice(-200)}`, opts.json);
    }
    if (opts.withPlugin) {
      const add = spawnSync('dsh', ['plugin', '--profile', tmpName, 'add', `file:${path.join(REPO, 'plugin')}`],
        { encoding: 'utf8', timeout: 300000, env: { ...process.env, DSH_HOME: HOME } });
      if (add.status !== 0) {
        throw new Error(`装本插件失败（退出码 ${add.status}）: ${(add.stderr || add.stdout || '').slice(-300)}`);
      }
    }

    // ── 2. 起宿主，从 stdout 抓 URL+token ──
    host = spawn('dsh', ['--profile', tmpName, '--', '--port', '0', '--no-open'],
      { env: { ...process.env, DSH_HOME: HOME } });
    // ⚠️ **stderr 也要收。** `startup failed: …` 是打在 stderr 上的 ——
    // 只收 stdout 的话，"宿主拒绝启动"的原因会退化成一句没用的
    // "没给出 URL"（我第一版就是这样，差点把最重要的证据丢了）。
    let out = '';
    const url = await new Promise((res) => {
      const t = setTimeout(() => res(null), opts.timeoutMs);
      host.stdout.on('data', (b) => {
        out += b;
        const m = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(out);
        if (m) { clearTimeout(t); res(m[1]); }
      });
      host.stderr.on('data', (b) => { out += b; });
      host.on('exit', () => { clearTimeout(t); res(null); });
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
        hostError: failMatch ? failMatch[0].trim() : `宿主没给出 URL。stdout 末尾：\n${out.slice(-600)}`,
        expected: opts.breakClient,
      };
      if (opts.json) {
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
      } else {
        process.stdout.write(`客户端到货对账 —— ${opts.profile}${opts.breakClient ? ' + 已知会坏的客户端插件' : ''}\n\n`);
        process.stdout.write(`  ⚠️ **宿主没有启动**（不是工具出错）\n\n`);
        for (const line of payload.hostError.split('\n')) process.stdout.write(`    ${line}\n`);
        process.stdout.write('\n');
        if (opts.breakClient) {
          process.stdout.write('  ✅ 这正是负向对照期望的结果：客户端半边缺文件 → **宿主拒绝启动**，\n');
          process.stdout.write('     用户连 URL 都拿不到。比"界面变成错误屏"更严重。\n');
        } else {
          process.stdout.write('  ❌ 非预期的启动失败 —— 检查这个 profile 的客户端条目。\n');
        }
      }
      cleanup();
      process.exit(opts.breakClient ? 0 : 1);
    }
    log(`宿主就绪 ${url.replace(/token=.*/, 'token=…')}`, opts.json);

    // ── 3. 无头 Chrome + CDP ──
    const port = 9445 + (process.pid % 500);
    chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run',
      `--remote-debugging-port=${port}`, `--user-data-dir=${chromeDir}`, 'about:blank'],
    { stdio: 'ignore' });
    let list = null;
    for (let i = 0; i < 30 && list === null; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch { /* 再等 */ }
    }
    if (list === null) throw new Error('连不上 Chrome 的调试端口');
    const page = list.find((t) => t.type === 'page');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    const cdp = makeCdp(ws);

    // ⚠️ `Network.enable` **必须在 navigate 之前** —— 否则早期请求收不到，
    // 而"遗漏的请求"看起来与"没到货"一模一样（实测会少记一批）。
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Page.navigate', { url });
    // 等界面稳定：客户端条目是分批拉的，太快读到的是半成品
    await new Promise((r) => setTimeout(r, 20000));

    const evalx = async (expr) => (await cdp.send('Runtime.evaluate',
      { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;

    const bootRaw = await evalx('window.__DSH_BOOT__ ? JSON.stringify({entries: window.__DSH_BOOT__.entries, batches: window.__DSH_BOOT__.batches}) : null');
    const rootLen = await evalx('(document.querySelector("#root")||{}).textContent ? document.querySelector("#root").textContent.length : 0');
    // ⚠️ **不要用长度阈值判"界面是不是坏了"。** 第一版写 `< 2000` 就误报了：
    // `web` 模板本来就没内容（76 字符），而桌面 app 是 35397。同一个数字在两种
    // profile 下含义完全不同。改成认**错误屏自己的文案** —— 那是宿主写的，不是我猜的。
    const errorScreen = await evalx(`(() => {
      const t = document.body ? document.body.textContent : '';
      const hit = /Failed to load plugins|did not activate|import failed/i.test(t);
      const m = /(Failed to load plugins[\s\S]{0,200})/.exec(t);
      return hit ? (m ? m[1] : '(命中错误屏文案)') : null;
    })()`);
    const title = await evalx('document.title');

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
      if (e.method === 'Network.requestWillBeSent') byReq.set(e.params.requestId, e.params.request.url);
    }
    for (const e of cdp.events) {
      if (e.method === 'Network.responseReceived') {
        const st = e.params.response.status;
        if (st >= 200 && st < 300) arrivedUrls.add(e.params.response.url);
      }
      if (e.method === 'Network.loadingFailed') {
        failedUrls.set(byReq.get(e.params.requestId) ?? e.params.requestId, e.params.errorText);
      }
    }
    const exceptions = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown');

    const boot = bootRaw === null ? { entries: [], batches: [] } : JSON.parse(bootRaw);
    const batches = (boot.batches ?? []).map((b) => {
      const needle = String(b.url).split('&')[0];
      let status = null;
      for (const u of arrivedUrls) if (u.includes(needle)) { status = 200; break; }
      let err = null;
      for (const [u, t] of failedUrls) if (String(u).includes(needle)) { err = t; break; }
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

    const rows = batches.flatMap((b) => b.entryIds.map((id) => ({
      id, phase: b.phase, batchRev: b.rev, arrived: b.arrived, status: b.status, error: b.error,
    })));

    const got = rows.filter((r) => r.arrived).length;
    const missing = rows.filter((r) => !r.arrived);
    const ourEntry = rows.find((r) => r.id === 'dsh-plugin-compat-check');

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
      ourPluginEntry: ourEntry ? { arrived: ourEntry.arrived, status: ourEntry.status } : null,
      batches,
      missingEntries: missing.map((r) => ({ id: r.id, phase: r.phase, batchRev: r.batchRev, error: r.error })),
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(`客户端到货对账 —— ${opts.profile}${opts.withPlugin ? ' + 本插件' : ''}${opts.breakClient ? ' + 已知会坏的客户端插件' : ''}\n\n`);
      process.stdout.write(`  计划加载    ${rows.length} 条条目 / ${batches.length} 个批次（__DSH_BOOT__）\n`);
      process.stdout.write(`  实际到货    ${got} 条条目 / ${batches.filter((b) => b.arrived).length} 个批次\n`);
      process.stdout.write(`  未到货      ${missing.length} 条\n`);
      process.stdout.write(`  运行时异常  ${exceptions.length}${exceptions.length ? '   ← 到了但执行失败（客户端最致命的形态）' : ''}\n`);
      process.stdout.write(`  #root 文本  ${rootLen} 字符（仅供参考 —— 不同 profile 的正常值差很多）\n`);
      if (errorScreen !== null) process.stdout.write(`  ❌ 错误屏    ${String(errorScreen).replace(/\s+/g, ' ').slice(0, 120)}\n`);
      if (ourEntry) process.stdout.write(`  本插件条目  ${ourEntry.arrived ? '✅ 到货' : '❌ 未到货'}（批次 ${ourEntry.batchRev}）\n`);
      process.stdout.write('\n  批次明细（**一个批次 = 一个请求** —— 它挂了，这一批每条都到不了）\n');
      for (const b of batches) {
        process.stdout.write(`    ${b.arrived ? '✅' : '❌'} ${String(b.phase).padEnd(12)} ${String(b.entries).padStart(3)} 条  rev=${String(b.rev).slice(0, 12)}${b.error ? `  error=${b.error}` : ''}\n`);
      }
      for (const m of missing.slice(0, 10)) {
        process.stdout.write(`\n  ❌ ${m.id}\n       phase=${m.phase} error=${m.error ?? '-'}\n`);
      }
    }

    // 退出码：有未到货或有异常就是**发现问题**
    const bad = missing.length > 0 || exceptions.length > 0 || errorScreen !== null;
    cleanup();
    process.exit(bad ? 1 : 0);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    cleanup();
    process.exit(3);
  }
}

main();
