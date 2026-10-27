import { createHistoryRuntime } from "./lib/host-history.js";
import { createReportRuntime } from "./lib/host-reports.js";
import { createReviewRuntime } from "./lib/host-reviews.js";
import { createUpgradeRuntime } from "./lib/host-upgrade.js";
import { createHttpRuntime } from "./lib/host-http.js";
// Host half of the dsh-plugin-compat-check plugin — loader self-introspection
// (docs/Plan.md §2.4: read ctx.loader.entries(), recover failure reasons,
// never throw).
//
// HARD RULE (docs/Plan.md §3 第 3 条：绝不抛、绝不拖累宿主): this plugin must never
// throw and must never keep the host from booting. A health-check plugin that
// breaks host startup becomes an instance of the very class of problem it is
// meant to detect. Every host object in here is touched behind try/catch, and
// the one call that can hang (`fiber.await()`) is raced against a timeout.
//
// Why `inject` stays empty: `ctx.loader` is a Cordis service, and the context
// proxy resolves it by walking the fiber chain — declaring it in `inject` is
// not required to read it. Declaring a service we do not strictly need is the
// exact way to park this plugin's own fiber in PENDING (docs/Plan.md §2.4 接入要点).
// `resolveLoader()` below therefore tries the inject-free lookup first, and the
// plugin additionally runs a one-shot child-fiber probe (`ctx.inject`) to
// record, empirically, whether `inject: ["loader"]` *would* have been safe —
// without risking its own activation.
//
// Output (the verifiable form required before any UI exists):
//   ${DSC_OUT_DIR}/loader-introspect.json (explicit owned private directory only)
// plus structured console lines prefixed with [dsh-plugin-compat-check].

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path, { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire as __createRequire } from "node:module";

import { requestRejection } from "./lib/local-request.js";
import { privateDiagnostic } from "./lib/host-resources.js";
import {
  failureEnvelope,
  catalogLines,
  terminalText,
} from "./lib/report-contract.js";
import { nextSteps } from "./lib/finding-guidance.js";
import { SUPPORTED_PREVIEW_VERSIONS } from "./lib/upgrade-contract.js";

export const name = "dsh-plugin-compat-check";
const createReportRuntimeInstance = createReportRuntime({
  resolveKernelDir,
  resolveNodeModules,
  resolveDshVersion,
  log,
  errText,
  attachFindingReviews: (...args) => attachFindingReviews(...args),
});
const createReviewRuntimeInstance = createReviewRuntime({
  resolveNodeModules,
  log,
  errText,
});
const createUpgradeRuntimeInstance = createUpgradeRuntime({
  resolveKernelDir,
  resolveNodeModules,
  resolveDshVersion,
  errText,
});
const createHttpRuntimeInstance = createHttpRuntime({
  serveReport: (...args) => serveReport(...args),
  serveUpgradePreview: (...args) => serveUpgradePreview(...args),
  log,
  errText,
});

const historyRuntime = createHistoryRuntime({
  resolveNodeModules,
  resolveKernelDir,
  readRequest: (...args) => readReviewRequest(...args),
  log,
  errText,
});
function registerReportRoute(...args) {
  return createHttpRuntimeInstance.registerReportRoute(...args);
}

/**
 * Deliberately empty: every service this plugin reads is read through
 * `ctx.get(...)`, which returns `undefined` instead of throwing when a service
 * is absent. See the header comment.
 *
 * Measured 2026-10-10 on DSH 0.2.0-rc.2: `inject: ["loader"]` ALSO activates
 * (the fiber ends up ACTIVE with `loader` present), so this is the safe choice
 * rather than the only workable one — declaring nothing keeps the health-check
 * plugin independent of the very service it audits.
 */
export const inject = [];

const SCHEMA_VERSION = 1;

/** Cordis FiberState (const enum in the host, so mirrored here as data). */
const FIBER_STATES = {
  0: "PENDING",
  1: "LOADING",
  2: "ACTIVE",
  3: "FAILED",
  4: "DISPOSED",
  5: "UNLOADING",
};

const OUT_DIR = process.env.DSC_OUT_DIR || null;
const OUT_JSON = OUT_DIR ? join(OUT_DIR, "loader-introspect.json") : null;

/** Defensive cap: a pathological iterable must not exhaust the host's heap. */
const MAX_ENTRIES = 20000;

/** `fiber.await()` may never settle for a fiber stuck mid-load: always race it. */
const AWAIT_TIMEOUT_MS = toPositiveInt(process.env.DSC_AWAIT_TIMEOUT_MS, 1500);
/** Extra passes catch late transitions (entries import asynchronously). */
const SCAN_DELAYS = parseDelays(process.env.DSC_SCAN_DELAYS, [4000, 9000]);

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function parseDelays(value, fallback) {
  if (typeof value !== "string" || value.trim() === "") return fallback;
  const parsed = value
    .split(",")
    .map((part) => toPositiveInt(part.trim(), 0))
    .filter((n) => n > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function log(message) {
  try {
    console.log(`[dsh-plugin-compat-check] ${message}`);
  } catch {
    /* 打日志失败也绝不能影响宿主 */
  }
}

/** Never let an unknown throw escape as itself. */
function errText(error) {
  try {
    if (error === null || error === undefined) return String(error);
    if (typeof error === "string") return error;
    if (error instanceof Error) {
      const stack = typeof error.stack === "string" ? error.stack : "";
      return stack || `${error.name}: ${error.message}`;
    }
    const text = String(error);
    return text === "[object Object]" ? safeJson(error) : text;
  } catch {
    return "<unprintable error>";
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return "<unserializable>";
  }
}

function describe(value) {
  try {
    if (value === undefined) return "undefined";
    if (value === null) return "null";
    return typeof value;
  } catch {
    return "<unreadable>";
  }
}

function writeReport(report) {
  return privateDiagnostic(OUT_JSON, report);
}

// ---------------------------------------------------------------------------
// B1: loader access
// ---------------------------------------------------------------------------

/**
 * Obtain the loader without declaring `inject: ["loader"]`.
 *
 * Cordis resolves service reads by walking the fiber chain, so
 * `ctx.get("loader")` works from a plugin fiber; `ctx.loader` is the same
 * lookup through the proxy trap. Both are tried and the route that worked is
 * recorded, so the answer is evidence rather than assumption.
 *
 * The returned object is JSON-safe: the live loader instance is never included.
 */
function resolveLoader(ctx) {
  const attempts = [];
  let loader;
  let via;

  const looksLikeLoader = (value) =>
    value !== undefined &&
    value !== null &&
    typeof value.entries === "function";

  try {
    const value = ctx.get("loader");
    attempts.push(`ctx.get('loader') -> ${describe(value)}`);
    if (looksLikeLoader(value)) {
      loader = value;
      via = "ctx.get('loader')";
    }
  } catch (error) {
    attempts.push(`ctx.get('loader') threw: ${errText(error)}`);
  }

  if (loader === undefined) {
    try {
      const value = ctx.get("loader", false);
      attempts.push(`ctx.get('loader', false) -> ${describe(value)}`);
      if (looksLikeLoader(value)) {
        loader = value;
        via = "ctx.get('loader', false)";
      }
    } catch (error) {
      attempts.push(`ctx.get('loader', false) threw: ${errText(error)}`);
    }
  }

  let direct;
  let directError = null;
  try {
    direct = ctx.loader;
    attempts.push(`ctx.loader -> ${describe(direct)}`);
    if (loader === undefined && looksLikeLoader(direct)) {
      loader = direct;
      via = "ctx.loader";
    }
  } catch (error) {
    directError = errText(error);
    attempts.push(`ctx.loader threw: ${errText(error)}`);
  }

  return {
    loader,
    via: via ?? null,
    attempts,
    directPropertyReadable: directError === null && looksLikeLoader(direct),
    directSameInstance: loader !== undefined && direct === loader,
  };
}

/** Drop the live loader instance so the access record stays JSON-safe. */
function publicLoaderAccess(resolved) {
  return {
    via: resolved.via ?? null,
    attempts: resolved.attempts ?? [],
    directPropertyReadable: resolved.directPropertyReadable === true,
    directSameInstance: resolved.directSameInstance === true,
  };
}

/**
 * One-shot, side-effect-free probe: would `inject: ["loader"]` have kept this
 * plugin PENDING? `ctx.inject` spawns a *child* fiber, so a loader that cannot
 * be resolved leaves that child PENDING while this plugin stays ACTIVE — the
 * exact question, answered without risking our own activation.
 *
 * Returns a disposer for the child fiber (or null).
 */
function startInjectProbe(ctx, record) {
  const startedAt = Date.now();
  record.startedAt = new Date(startedAt).toISOString();
  try {
    if (typeof ctx.inject !== "function") {
      record.outcome = "ctx.inject is not a function";
      return null;
    }
    record.registered = true;
    const dispose = ctx.inject(["loader"], (scoped) => {
      try {
        record.outcome = "fired (child fiber activated)";
        record.firedAfterMs = Date.now() - startedAt;
        const value = scoped?.loader ?? scoped?.get?.("loader");
        record.scopedLoader = describe(value);
        record.scopedLoaderHasEntries = typeof value?.entries === "function";
      } catch (error) {
        record.outcome = `callback threw: ${errText(error)}`;
      }
    });
    return typeof dispose === "function" ? dispose : null;
  } catch (error) {
    record.outcome = `ctx.inject threw: ${errText(error)}`;
    return null;
  }
}

// ---------------------------------------------------------------------------
// B2: failure reasons
// ---------------------------------------------------------------------------

/**
 * `await fiber.await()` without ever being able to hang the host.
 *
 * Resolves to `{ ok, reason, timedOut }`. The underlying promise gets a
 * rejection handler attached immediately so a late rejection after the timeout
 * cannot surface as an unhandled rejection (which Node would turn into a fatal
 * error — the opposite of "绝不抛").
 */
async function awaitFiber(fiber, timeoutMs) {
  let promise;
  try {
    promise = fiber.await();
  } catch (error) {
    return { ok: false, reason: errText(error), timedOut: false };
  }
  if (
    promise === undefined ||
    promise === null ||
    typeof promise.then !== "function"
  ) {
    return { ok: true, reason: null, timedOut: false };
  }

  const settled = Promise.resolve(promise).then(
    () => ({ ok: true, reason: null, timedOut: false }),
    (error) => ({ ok: false, reason: errText(error), timedOut: false }),
  );

  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, reason: null, timedOut: true }),
        timeoutMs,
      );
      if (timer && typeof timer.unref === "function") timer.unref();
    });
    return await Promise.race([settled, timeout]);
  } catch (error) {
    return { ok: false, reason: errText(error), timedOut: false };
  } finally {
    try {
      clearTimeout(timer);
    } catch {
      /* 忽略 */
    }
  }
}

// ---------------------------------------------------------------------------
// B1/B2: per-entry introspection
// ---------------------------------------------------------------------------

function declaredInjectKeys(fiber) {
  try {
    const inject = fiber?.inject;
    if (inject === undefined || inject === null) return [];
    if (Array.isArray(inject)) return inject.map(String);
    if (typeof inject === "object") return Object.keys(inject);
    if (inject instanceof Set) return [...inject].map(String);
    return [];
  } catch (error) {
    return [`<unreadable inject: ${errText(error)}>`];
  }
}

/** 缺服务 = fiber.ctx.get(key) === undefined (docs/Plan.md §2.4). */
function missingServices(fiber, keys) {
  const missing = [];
  const present = [];
  const unreadable = [];
  for (const key of keys) {
    try {
      const value = fiber.ctx.get(key);
      if (value === undefined) missing.push(key);
      else present.push(key);
    } catch (error) {
      unreadable.push({ key, error: errText(error) });
    }
  }
  return { missing, present, unreadable };
}

function optionsOf(entry) {
  try {
    const options = entry?.options;
    return options !== undefined &&
      options !== null &&
      typeof options === "object"
      ? options
      : {};
  } catch (error) {
    return { __unreadable: errText(error) };
  }
}

async function introspectEntry(entry) {
  const options = optionsOf(entry);
  const row = {
    id: options.id,
    name: options.name,
    group: options.group === true,
    disabled: null,
    disabledError: null,
    fiberState: "NO_FIBER",
    fiberStateCode: null,
    declaredInject: [],
    declaredInjectCount: 0,
    missingServices: [],
    presentServices: [],
    unreadableServices: [],
    failureReason: null,
    awaitTimedOut: false,
    notes: [],
  };

  try {
    row.id = entry?.id;
  } catch (error) {
    row.notes.push(`entry.id unreadable: ${errText(error)}`);
  }
  if (row.id === undefined) row.id = options.id;

  // `entry.disabled` can throw for a `!!js` expression (the host wraps it too).
  try {
    row.disabled = Boolean(entry.disabled);
  } catch (error) {
    row.disabledError = errText(error);
    row.notes.push("disabled expression threw");
  }

  let fiber;
  try {
    fiber = entry?.fiber;
  } catch (error) {
    row.notes.push(`entry.fiber unreadable: ${errText(error)}`);
  }

  if (fiber === undefined || fiber === null) {
    row.fiberState = "NO_FIBER";
    row.notes.push("no fiber (loader did not import this entry)");
    if (row.group) row.notes.push("options.group is true");
    return row;
  }

  try {
    const code = fiber.state;
    row.fiberStateCode = typeof code === "number" ? code : null;
    row.fiberState = FIBER_STATES[code] ?? `UNKNOWN(${String(code)})`;
  } catch (error) {
    row.fiberState = "UNREADABLE";
    row.notes.push(`fiber.state threw: ${errText(error)}`);
  }

  try {
    row.declaredInject = declaredInjectKeys(fiber);
    row.declaredInjectCount = row.declaredInject.length;
    const { missing, present, unreadable } = missingServices(
      fiber,
      row.declaredInject,
    );
    row.missingServices = missing;
    row.presentServices = present;
    row.unreadableServices = unreadable;
  } catch (error) {
    row.notes.push(`inject/missing-service scan threw: ${errText(error)}`);
  }

  // Only a fiber that is not ACTIVE can carry an unobserved rejection.
  if (row.fiberState !== "ACTIVE" && row.fiberState !== "DISPOSED") {
    const awaited = await awaitFiber(fiber, AWAIT_TIMEOUT_MS);
    if (awaited.timedOut) {
      row.awaitTimedOut = true;
      row.notes.push(`fiber.await() exceeded ${AWAIT_TIMEOUT_MS}ms`);
    } else if (!awaited.ok) {
      row.failureReason = awaited.reason;
    } else if (row.fiberState === "PENDING") {
      row.notes.push(
        "fiber.await() resolved without error (PENDING: waiting for services)",
      );
    }
  }

  if (row.disabled === true) row.notes.push("entry is disabled");
  return row;
}

/**
 * `loader.entries()` is an iterable, not necessarily an array (measured: a
 * plain `object` whose iterator yields the entries). Accept everything that can
 * be walked, never assume a shape, and never walk an unbounded sequence — a
 * pathological iterator must not be able to exhaust the host's heap.
 *
 * @returns {{entries: any[]|null, truncated: boolean, error: string|null}}
 */
function toEntryArray(value) {
  const fail = (error) => ({ entries: null, truncated: false, error });
  if (value === null || value === undefined)
    return fail(`entries() returned ${describe(value)}`);
  if (Array.isArray(value))
    return { entries: value, truncated: false, error: null };

  let iterable = false;
  try {
    iterable = typeof value[Symbol.iterator] === "function";
  } catch (error) {
    return fail(`probing Symbol.iterator threw: ${errText(error)}`);
  }
  if (iterable) {
    const out = [];
    try {
      for (const item of value) {
        out.push(item);
        if (out.length >= MAX_ENTRIES)
          return { entries: out, truncated: true, error: null };
      }
      return { entries: out, truncated: false, error: null };
    } catch (error) {
      return {
        entries: out,
        truncated: false,
        error: `iterating entries threw: ${errText(error)}`,
      };
    }
  }

  try {
    if (typeof value.length === "number") {
      const length = Math.min(value.length, MAX_ENTRIES);
      return {
        entries: Array.prototype.slice.call(value, 0, length),
        truncated: value.length > length,
        error: null,
      };
    }
  } catch (error) {
    return fail(`reading array-like entries threw: ${errText(error)}`);
  }
  return fail(`entries() returned a non-iterable ${describe(value)}`);
}

async function scan(ctx, state, pass) {
  if (state.disposed) return;
  const report = {
    schemaVersion: SCHEMA_VERSION,
    plugin: name,
    pid: process.pid,
    node: process.version,
    platform: process.platform,
    scannedAt: new Date().toISOString(),
    pass,
    passCount: SCAN_DELAYS.length,
    applyAt: state.applyAt,
    loaderAccess: state.loaderAccess,
    outPath: OUT_JSON,
    awaitTimeoutMs: AWAIT_TIMEOUT_MS,
    entryCount: 0,
    stateHistogram: {},
    problems: [],
    entries: [],
    errors: [],
  };

  let loader = state.loader;
  let via = state.loaderVia;
  if (loader === undefined) {
    const resolved = resolveLoader(ctx);
    loader = resolved.loader;
    via = resolved.via;
    state.loader = loader;
    state.loaderVia = via;
    report.loaderAccess = {
      ...state.loaderAccess,
      ...publicLoaderAccess(resolved),
    };
  }

  if (loader === undefined) {
    report.errors.push("loader service not reachable from this plugin context");
    log(
      `ERROR loader not reachable (${JSON.stringify(state.loaderAccess.attempts ?? [])})`,
    );
    writeReport(report);
    return report;
  }

  let entries;
  let rawEntries;
  try {
    rawEntries = loader.entries();
    const walked = toEntryArray(rawEntries);
    report.entriesSource = {
      typeof: describe(rawEntries),
      isArray: Array.isArray(rawEntries),
      constructorName: safeJson(rawEntries?.constructor?.name ?? null),
      iterable: typeof rawEntries?.[Symbol.iterator] === "function",
      truncated: walked.truncated,
    };
    entries = walked.entries;
    if (walked.error !== null)
      report.errors.push(`loader.entries(): ${walked.error}`);
  } catch (error) {
    report.errors.push(`loader.entries() threw: ${errText(error)}`);
    log(`ERROR scan#${pass}: loader.entries() threw: ${errText(error)}`);
    writeReport(report);
    return report;
  }
  if (entries === null) {
    const detail =
      report.errors.length > 0 ? report.errors.join("; ") : "unknown reason";
    log(`ERROR scan#${pass}: could not read entries (${detail})`);
    writeReport(report);
    return report;
  }

  report.entryCount = entries.length;
  for (const entry of entries) {
    let row;
    try {
      row = await introspectEntry(entry);
    } catch (error) {
      row = {
        id: "<unreadable entry>",
        fiberState: "UNREADABLE",
        notes: [`entry introspection threw: ${errText(error)}`],
      };
      report.errors.push(`entry introspection threw: ${errText(error)}`);
    }
    report.entries.push(row);
    report.stateHistogram[row.fiberState] =
      (report.stateHistogram[row.fiberState] ?? 0) + 1;
  }

  report.problems = report.entries.filter((row) => {
    if (row.disabled === true) return false;
    if (row.fiberState === "ACTIVE") return false;
    return true;
  });

  if (state.disposed) return report;
  const written = writeReport(report);
  log(
    `scan#${pass}/${SCAN_DELAYS.length} loader-via=${via} entries=${report.entryCount} states=${safeJson(report.stateHistogram)} problems=${report.problems.length} report=${OUT_JSON}${written ? "" : " (WRITE FAILED)"}`,
  );
  for (const row of report.problems) {
    log(
      `  PROBLEM id=${safeJson(row.id)} name=${safeJson(row.name)} state=${row.fiberState}` +
        ` missing=[${row.missingServices.join(", ")}]` +
        (row.failureReason ? ` reason=${firstLine(row.failureReason)}` : "") +
        (row.awaitTimedOut ? " (await timed out)" : ""),
    );
  }
  return report;
}

function firstLine(text) {
  try {
    const line = String(text).split("\n")[0];
    return line.length > 300 ? `${line.slice(0, 300)}…` : line;
  } catch {
    return "<unprintable>";
  }
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C2: 面板数据通道（宿主半边算结论，客户端半边渲染）
// ---------------------------------------------------------------------------

/**
 * 内核的位置。插件半边**不自己实现判定** —— 它 import 内核。
 *
 * 四条候选路径，按可靠性排序：
 *   1. 环境变量 `DSC_KERNEL`（打包/发布形态下由外层指定）
 *   2. **本包自己就是自足包**（`here` 下有 `lib/` 与 `rules/`）—— npm 发布形态
 *   3. 本包在仓库里的位置（`plugin/` 的上一级）—— 开发与 GitHub 分发时的形态
 *
 * ## ⚠️ 为什么 `here` 必须排在 `here/..` 前面
 *
 * 这两种形态在**文件系统上长得一样但含义相反**：
 *
 * | 形态 | `here` | 内核在 |
 * |---|---|---|
 * | 仓库检出 | `<repo>/plugin` | `here/..` = `<repo>` |
 * | npm 装好的包 | `<...>/node_modules/dsh-plugin-compat-check` | **`here/kernel`** |
 *
 * 在 npm 形态下，`here/..` 是 `node_modules/` —— 那里当然没有 `lib/extract.mjs`，
 * 于是**内核永远找不到，插件静默变成一个只会说"找不到判定内核"的壳**。
 * 而 `here` 先试的代价是零（仓库形态下 `plugin/lib/` 不存在，直接落到下一条）。
 *
 * 找不到就返回 null，**由调用方决定怎么说**，这里不抛。
 */
function resolveKernelDir() {
  const { dirname: dir } = path;
  const here = dir(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.DSC_KERNEL,
    path.join(here, "kernel"), // npm 自足包形态（`npm pack` 时由 prepack 暂存到此）
    here, // 另一种自足布局：内核与 index.js 同级
    path.resolve(here, ".."), // 仓库形态：plugin/ → 仓库根
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (
        existsSync(path.join(c, "lib", "extract.mjs")) &&
        existsSync(path.join(c, "lib", "verdict.mjs"))
      ) {
        return c;
      }
    } catch {
      /* 下一个候选 */
    }
  }
  return null;
}

/**
 * 当前 profile 的 node_modules。
 *
 * 优先级：显式请求/覆盖 → DSH 正在跑的 profile；无法确认时返回错误，不回退 desktop。
 * 「正在跑的是哪个 profile」没有正式服务暴露，只能靠环境变量与目录推断 ——
 * 所以这里把推断的**依据**一起放进报告，让结论可追溯，而不是猜一个就不吭声。
 */
/**
 * 当前 DSH 的版本。
 *
 * ## 为什么必须拿到它
 *
 * `dshVersion` 是基线差分的输入（docs/Plan.md §2.2），也是「**声明与实测不符**」
 * 这类结论的**前提** —— 没有它就没法把插件的 `dsh.compatibility` 声明与实际版本对上，
 * 于是那一类发现（本工具相对既有方案唯一不可替代的结论）在插件形态下根本不成立。
 *
 * ## 实测过的四条路（按可靠性排序）
 *
 * 在真实桌面端里把宿主进程打出来（`--profile vprobe`，VERPROBE 那一次）：
 *
 *   process.env.DSH_VERSION          → null          （不存在）
 *   process.versions.electron        → "44.0.0"      （说明宿主跑在 Electron 里）
 *   argv 里指向 `…/dsh/node_modules/…` 的路径，从中反推 dsh 根
 *   createRequire(dshRoot).resolve('@deepseek-ai/dsh-desktop-host/package.json')
 *     → @deepseek-ai/dsh-desktop-host@0.2.0-rc.2     ✅ 与 `dsh --version` 一致
 *   createRequire(dshRoot).resolve('@deepseek-ai/dsh/package.json')
 *     → @deepseek-ai/dsh@0.2.0-rc.2                  ✅ 两个都行
 *
 * ### 被否掉的方案，以及为什么
 *
 * - **`process.env.DSH_VERSION`**：不存在（就是这次要解决的缺口本身）。
 * - **`dsh --version` 起子进程**：不行，而且**不是**能力问题 —— docs/Plan.md §1 锁定了
 *   「插件严格只读：不装包、不起子进程、不联网」。为拿一个版本号破这条边界不值。
 * - **`Info.plist`**：macOS 专有（`CFBundleShortVersionString` = 0.2.0-rc.2，能读到）。
 *   本产品要跨平台（§5.1 的验证边界），不能把它当主路。
 *
 * ## 拿不到时返回 null，而不是猜
 *
 * `dshVersion: null` 会让「声明与实测不符」这类结论自动不成立（判定层已经这样处理）。
 * 猜一个版本字符进去，会**凭空造出**声明不符的结论 —— 那比缺一条结论糟得多。
 */
function resolveDshVersion() {
  // ① 显式覆盖（CLI 形态与测试用）
  if (process.env.DSH_VERSION) return process.env.DSH_VERSION;

  // ② 从 argv 反推 dsh 根，再用 Node 自己的解析器问它
  //
  //    真实桌面端的 argv（实测）：
  //      [ …/MacOS/DeepSeek Harness, --expose-internals,
  //        …/app.asar/dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js,
  //        …/app.asar/dsh,                                            ← dsh 根
  //        /Users/…/.dsh/profiles/vprobe, … ]
  //
  //    注意 **不写死 macOS 路径**：任何 `<…>/dsh/node_modules/<…>` 都能反推出根，
  //    Windows 的 `\dsh\node_modules\` 形态也一并处理。
  try {
    const argv = (process.argv || []).map(String);
    const sep = argv.find((a) => /[\\/]dsh[\\/]node_modules[\\/]/.test(a));
    if (sep) {
      const m = /^(.*[\\/]dsh)[\\/]node_modules[\\/]/.exec(sep);
      if (m && m[1]) {
        const dshRoot = m[1];
        const req = __createRequire(join(dshRoot, "probe.js"));
        // 两个包实测都能解析；都试一遍是为了不依赖某一个包的存在
        for (const spec of [
          "@deepseek-ai/dsh-desktop-host/package.json",
          "@deepseek-ai/dsh/package.json",
        ]) {
          try {
            const meta = req(req.resolve(spec));
            if (meta && typeof meta.version === "string" && meta.version) {
              return meta.version;
            }
          } catch {
            /* 试下一个 */
          }
        }
      }
    }
  } catch {
    /* 继续 */
  }

  // npm prefixes need not end in /dsh/. Read only an official runtime's own
  // manifest above the real entry; package.json need not be an exported subpath.
  try {
    let dir = path.dirname(path.resolve(realpathSync(process.argv[1])));
    for (let depth = 0; depth < 32; depth++) {
      try {
        const meta = JSON.parse(
          readFileSync(join(dir, "package.json"), "utf8"),
        );
        if (
          [
            "@deepseek-ai/dsh",
            "@deepseek-ai/dsh-desktop-host",
            "@deepseek-ai/dsh-app-boot",
          ].includes(meta.name) &&
          typeof meta.version === "string" &&
          meta.version
        )
          return meta.version;
      } catch {}
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {}
  // ③ 都没有 → **null，不猜**（判定层会据此不产出声明不符的结论）
  return null;
}

/**
 * 当前正在跑的是哪个 profile。
 *
 * ## 为什么这里必须小心：环境变量会**主动骗人**
 *
 * 实测（在 `--profile gverify` 下启动宿主，让插件把进程环境打出来）：
 *
 * ```
 * DSH_PROFILE=desktop          ← 过期值！
 * DSH_PROFILE_DIR=…/profiles/desktop
 * process.argv = [ …/dsh-desktop-host/lib/cli.js, "--profile", "gverify" ]
 * ```
 *
 * 那两个 `DSH_PROFILE*` 是从**启动这个 app 的那个 shell** 继承来的，与实际加载的
 * profile 无关。信它们会把 gverify 的结论写进 `baseline.desktop.json`，
 * 于是差分会报出"移除了 17 个插件"这种**完全是编出来的变化**。
 *
 * 所以顺序是：argv（宿主自己声明的）> 显式覆盖 > 环境变量（可能是陈的）。
 * 无法确认时要求显式指定，不猜测 profile。
 */
function resolveActiveProfile() {
  // ① 宿主自己的启动参数 —— 最权威。**两种形态都要认**：
  //
  //    CLI：     … dsh-desktop-host/lib/cli.js --profile gverify
  //    桌面 app：… dsh-desktop-host/lib/index.js <dsh 根> /Users/…/profiles/desktop <runtime> …
  //
  //    桌面端把 **profile 目录路径按位置传**，没有 `--profile` 标志。
  //    只认 `--profile` 时，真实 app 里会走"回退到 desktop" —— 幸亏这次的结论恰好
  //    就是 desktop，否则会把别的 profile 的结论写进 desktop 的基线。**那次是运气，不是正确。**
  try {
    const argv = (process.argv || []).map(String);
    for (let i = argv.length - 1; i >= 0; i--) {
      const inline = /^--profile=(.+)$/.exec(argv[i]);
      if (inline)
        return {
          name: inline[1],
          why: `process.argv 的 --profile=${inline[1]}`,
        };
      if (
        argv[i] === "--profile" &&
        argv[i + 1] &&
        !argv[i + 1].startsWith("-")
      ) {
        return {
          name: argv[i + 1],
          why: `process.argv 的 --profile ${argv[i + 1]}`,
        };
      }
    }
    // 位置形态：任何指向 `<…>/profiles/<名字>`（或它下面的 node_modules）的绝对路径
    for (const a of argv) {
      if (!a.startsWith("/")) continue;
      const m = /\/profiles\/([^/]+)(?:\/|$)/.exec(a);
      if (m && m[1])
        return { name: m[1], why: `process.argv 里的 profile 路径 ${a}` };
    }
  } catch {
    /* 继续 */
  }
  // ② 显式覆盖（工具/测试用）
  if (process.env.DSC_PROFILE)
    return {
      name: process.env.DSC_PROFILE,
      why: `DSC_PROFILE=${process.env.DSC_PROFILE}`,
    };
  // ③ 环境变量 —— **可能是陈的**，所以带上警示写进 why
  for (const key of ["DSH_PROFILE", "DSH_ACTIVE_PROFILE", "DSH_PROFILE_NAME"]) {
    const v = process.env[key];
    if (v)
      return {
        name: v,
        why: `${key}=${v}（环境变量可能来自启动 app 的那个 shell，未必是当前加载的 profile）`,
      };
  }
  return { name: null, why: "无法判断" };
}

function resolveNodeModules(requestedProfile = null) {
  const dshHome = process.env.DSH_HOME || join(homedir(), ".dsh");
  const inferred = resolveActiveProfile();
  const selected = requestedProfile || inferred.name;
  if (selected) {
    if (!/^[\w.-]+$/.test(selected) || selected === "." || selected === "..")
      return { dir: null, why: "profile 名称非法" };
    const dir = join(dshHome, "profiles", selected, "node_modules");
    return existsSync(dir)
      ? {
          dir,
          why: requestedProfile
            ? "请求明确指定的 profile " + selected
            : inferred.why,
        }
      : { dir: null, why: "指定 profile 不存在: " + selected };
  }
  if (process.env.DSH_PROFILE_DIR) {
    const dir = join(process.env.DSH_PROFILE_DIR, "node_modules");
    return existsSync(dir)
      ? { dir, why: "显式 DSH_PROFILE_DIR" }
      : { dir: null, why: "DSH_PROFILE_DIR 不存在" };
  }
  return { dir: null, why: "无法确认当前 profile；请显式指定" };
}

/**
 * Ordinary report cache is scoped to the canonical profile and DSH context.
 * Verified loader/manager events trigger coalesced identity checks; a bounded
 * worker watchdog also notices same-path source and judgment-input changes.
 * Valid reports remain visible while a replacement generation runs. Cold and
 * forced requests await a current generation; failed refreshes retain the
 * previous report with explicit stale/error metadata. The TTL still refreshes
 * time-dependent observations even when the sampled identity is unchanged.
 */
/** Host calls get their own bound; cancellation must never become an empty success. */
function hostPluginListing(...args) {
  return createReportRuntimeInstance.hostPluginListing(...args);
}

function serveReport(...args) {
  return createReportRuntimeInstance.serveReport(...args);
}

/**
 * 跑一次有界体检；异步分析、可写自身基线，错误由报告返回。
 *
 * 为什么宿主半边要算而不是把原始数据丢给客户端：
 *   - 客户端跑在浏览器里，读不了文件系统；
 *   - 结论（五元组 + 确定性）是内核的产物，算出唯一一份才不会两边漂移。
 */
function computeReport(...args) {
  return createReportRuntimeInstance.computeReport(...args);
}

// ---------------------------------------------------------------------------
// D1: 对话工具 —— 让 agent 能直接答「我这插件兼容吗」
// ---------------------------------------------------------------------------

/**
 * 把结论渲染成一段**给模型读**的文本。
 *
 * 与 CLI 的 `lib/report.mjs` 是同一口径：本函数只负责把已经算好的结论翻译成
 * 文本，不做任何判定。这样"面板说可用、工具说部分可用"在结构上不可能发生。
 *
 * 为什么工具**必须**能给出结论而不是只丢一个文件名：
 * 用户问的是"兼不兼容"，一个"报告写好了，你自己去看"的回答等于没答。
 */
function renderForModel(compat) {
  try {
    if (!compat || compat.ok !== true) {
      return `体检没跑成（这是工具的问题，不是插件的结论）：${terminalText((compat && compat.error) || "未知原因")}`;
    }
    const r = compat.report;
    const L = [];
    const s = r.summary || {};
    L.push(
      `结论：可用 ${s.ok || 0}　部分可用 ${s.partial || 0}　不兼容 ${s.broken || 0}` +
        (s.vacuousOk
          ? `（其中 ${s.vacuousOk} 个「可用」没有已验证调用，不等于业务通过）`
          : ""),
    );
    L.push(`工具版本：${compat.toolVersion || "未知"}`);
    L.push(...catalogLines(r.catalog));
    for (const note of r.observation?.notes || []) L.push(`采样说明：${note}`);
    if (s.limited) L.push(`证据覆盖有限：${s.limited} 个插件尚有未验证部分`);
    L.push(`体检对象：${compat.nodeModules}（${compat.nodeModulesWhy}）`);
    L.push(
      r.hasRuntimeSurface
        ? "方法级判定依据：宿主运行时面；具体确定性仍以每条发现和覆盖限制为准。"
        : "方法级判定依据：官方 API 目录（**契约目录，不是运行时面**）—— 因此方法级结论一律标「疑似」。" +
            "「疑似」不是缺陷，是诚实：判不准时降级标注，而不是升格成确定。",
    );
    L.push("");

    const rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
    const names = Object.keys(r.plugins).sort(
      (a, b) =>
        rank[r.plugins[a].verdict] - rank[r.plugins[b].verdict] ||
        a.localeCompare(b),
    );

    for (const name of names) {
      const p = r.plugins[name];
      const label =
        { broken: "不兼容", partial: "部分可用", unknown: "未知", ok: "可用" }[
          p.verdict
        ] || p.verdict;
      L.push(
        `${label}  ${name}@${p.version || "?"}${p.vacuous ? "　[无已验证调用]" : ""}`,
      );
      if (p.coverage) {
        L.push(
          `    证据覆盖：${p.coverage.status === "complete" ? "完整" : "有限"}；已验证调用 ${p.coverage.verifiedCalls}`,
        );
        for (const note of p.coverage.limitations)
          L.push(`      覆盖限制：${note}`);
      }
      for (const f of p.findings || []) {
        const api = f.service
          ? f.method
            ? `${f.service}.${f.method}`
            : f.service
          : "(包声明)";
        const loc = f.location ? `${f.location.file}:${f.location.line}` : "—";
        const cat =
          {
            "host-service-missing": "服务缺失",
            "host-method-missing": "方法缺失",
            "unprovided-dependency": "依赖服务待确认",
            "declaration-mismatch": "声明与实测不符",
            "client-entry-missing": "客户端入口不可交付",
            "host-entry-inactive": "宿主条目未激活",
            "declared-incompatible": "版本声明不支持",
          }[f.category] || f.category;
        const sev =
          { fatal: "致命", "feature-dead": "功能失效", degraded: "降级" }[
            f.severity
          ] || f.severity;
        L.push(
          `    ${sev} / ${cat}${f.certainty === "certain" ? " [确定]" : " [疑似]"}  ${api}  @ ${loc}`,
        );
        if (f.impact)
          L.push(
            `      影响${f.impactBasis === "measured" ? "（实测）" : f.impactBasis === "inferred" ? "（推断，非实测）" : "（依据未提供）"}：${f.impact}`,
          );
        if (f.basis) L.push(`      依据：${f.basis}`);
        for (const step of nextSteps(f)) L.push(`      下一步：${step}`);
      }
      const cs = p.clientSide || [];
      if (cs.length)
        L.push(
          `    客户端半边（命令行测不到，需界面验证）：${cs.map((c) => c.service).join("、")}`,
        );
      const noCalls = Object.values(p.resolved || {})
        .filter((c) => c.disposition === "no-calls")
        .map((c) => c.service);
      if (noCalls.length)
        L.push(
          `    无证据可判（只出现名字，没有调用点）：${noCalls.join("、")}`,
        );
    }

    L.push("");
    L.push(
      "确定（certain）表示当前证据足以支持该条发现，可来自明确静态事实或合格运行时观测；疑似（suspected）表示当前证据不足以确定该条发现。",
    );
    L.push(
      "impactBasis=measured/inferred 分别表示影响有对应实测依据/影响由证据推断；确定发现不等于影响已实测。未观测不等于缺失。",
    );
    L.push(
      "没有已验证调用仍可能存在服务依赖或客户端功能；调用核验和覆盖完整均不等于业务验收通过。",
    );
    L.push("下一步是核实建议；本工具不会自动安装、升级或修改配置与源码。");
    L.push("读这个结果时注意：");
    L.push(
      '  1) 「可用」不等于"功能验证过"。它只说明本轮未发现冲突；请同时看证据覆盖与未验证项。' +
        "插件仍然可能因为自身逻辑、配置或第三方依赖而出问题。",
    );
    L.push(
      "  2) 客户端功能需在浏览器实际操作并核验结果；元素出现和没有报错均不等于业务成功。",
    );
    return L.map(terminalText).join("\n");
  } catch (error) {
    return `渲染结论时出错（工具的问题）：${terminalText(errText(error))}`;
  }
}

/** 工具的服务集合：`tools`；`agents` 用来把相对路径解析到会话工作目录。 */
/** Static version comparisons never enter the ordinary report cache or baseline path. */
function unavailableUpgrade(...args) {
  return createUpgradeRuntimeInstance.unavailableUpgrade(...args);
}

function serveUpgradePreview(...args) {
  return createUpgradeRuntimeInstance.serveUpgradePreview(...args);
}

function upgradeToolResult(...args) {
  return createUpgradeRuntimeInstance.upgradeToolResult(...args);
}

function registerUpgradeRoute(...args) {
  return createHttpRuntimeInstance.registerUpgradeRoute(...args);
}

/** Human review is an independently loaded sidecar, never a verdict override. */
function attachFindingReviews(...args) {
  return createReviewRuntimeInstance.attachFindingReviews(...args);
}

function readReviewRequest(...args) {
  return createReviewRuntimeInstance.readReviewRequest(...args);
}
function registerFindingReviewRoute(...args) {
  return createReviewRuntimeInstance.registerFindingReviewRoute(...args);
}

const TOOL_SERVICES = ["tools", "agents"];

function toolResult(compat, text) {
  const s = compat.report?.summary || {};
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/tool-result",
    ok: compat.ok,
    error: compat.error,
    toolVersion: compat.toolVersion,
    exitCode: compat.exitCode,
    report: compat.report,
    baseline: compat.baseline,
    cache: compat.cache || null,
    reviews: compat.reviews || null,
    summary: compat.ok
      ? `可用 ${s.ok || 0} / 部分可用 ${s.partial || 0} / 不兼容 ${s.broken || 0}；覆盖有限 ${s.limited || 0}；无已验证调用 ${s.vacuousOk || 0}`
      : "无法判定",
    nodeModules: compat.nodeModules || "",
    hasRuntimeSurface: !!compat.report?.hasRuntimeSurface,
    text,
  };
}

function registerTool(ctx, state) {
  // 与 C2 路由同一个理由：走作用域 ctx.inject，headless/CLI 形态下 `tools` 不在场时
  // 这段根本不注册，本插件的 fiber 也就不会去等一个不存在的服务（`inject` 保持 []）。
  if (typeof ctx.inject !== "function") return;
  ctx.inject(TOOL_SERVICES, (scope) => {
    try {
      if (!scope.tools || typeof scope.tools.register !== "function") {
        log("D1 tool skipped: scoped ctx has no tools.register");
        return;
      }
      const dispose = scope.tools.register({
        name: "compat_check",
        description:
          "Assess compatibility risks for the DSH plugins installed in this profile against the " +
          "current DSH version, reporting evidence, coverage limits and file:line locations where available. " +
          "Use it when the user asks whether a plugin still works, why a feature disappeared after " +
          "updating DSH, or what compatibility evidence is available for an installed plugin. It reads the installed " +
          "profile; it does not install anything or check a plugin that is not yet installed. " +
          "Certainty is separate from impact evidence: certain means supported by explicit static facts or qualified runtime observations; " +
          "suspected means insufficient evidence to establish that finding, even when some runtime observations exist. " +
          "impactBasis=measured requires corresponding impact/state observations; inferred means an inferred impact, not a measured business outcome. " +
          "vacuous means no verified calls in an otherwise ok result; service dependencies or unverified client features may still exist. " +
          "Preserve coverage limits: unobserved does not mean absent, and no findings or verified calls do not certify business behavior. " +
          "The official API catalogue is a contract catalogue, not a runtime observation. " +
          "Provide upgradeTo for a separate static pre-upgrade comparison against an exact supported DSH version. It reuses no live observations, cache or baseline, performs no upgrade and does not certify future business behavior.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            upgradeTo: {
              type: "string",
              description:
                "Optional exact target DSH version for static upgrade preflight; known catalogues: 0.2.0-rc.2 and 0.2.1-rc.2. Unknown versions are uncertified.",
            },
            profile: {
              type: "string",
              description:
                'Optional profile name to inspect (e.g. "desktop"). Defaults to the profile this ' +
                "DSH instance is running when it can be determined. An explicit profile is required otherwise; no profile is guessed.",
            },
          },
        },
        output: {
          // ⚠️ **工具 DSL 不是 JSON Schema**：`required` 是**顶层数组**，
          // 不是每个属性上的 `required: true`。写成后者会被宿主直接拒掉，
          // 报 `schema.properties.X.required is not supported on type "string"`。
          // 实测踩过：注册失败、工具不存在，而**面板与路由照常工作** ——
          // 所以只有真的去调一次工具才发现得了。
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              schemaVersion: { type: "integer", enum: [1] },
              kind: { type: "string" },
              ok: { type: "boolean" },
              error: { oneOf: [{ type: "string" }, { type: "null" }] },
              exitCode: { type: "integer", enum: [0, 1, 2, 3] },
              toolVersion: { oneOf: [{ type: "string" }, { type: "null" }] },
              report: {
                oneOf: [
                  { type: "object", additionalProperties: true },
                  { type: "null" },
                ],
              },
              upgradePreview: { type: "object", additionalProperties: true },
              baseline: {
                oneOf: [
                  { type: "object", additionalProperties: true },
                  { type: "null" },
                ],
              },
              cache: {
                oneOf: [
                  { type: "object", additionalProperties: true },
                  { type: "null" },
                ],
              },
              reviews: {
                oneOf: [
                  { type: "object", additionalProperties: true },
                  { type: "null" },
                ],
              },
              summary: { type: "string" },
              nodeModules: { type: "string" },
              hasRuntimeSurface: { type: "boolean" },
              text: { type: "string" },
            },
            required: [
              "schemaVersion",
              "kind",
              "ok",
              "error",
              "exitCode",
              "toolVersion",
              "report",
              "baseline",
              "summary",
              "nodeModules",
              "hasRuntimeSurface",
              "text",
            ],
          },
          render: (_args, value) => [
            {
              type: "text",
              text: value && typeof value.text === "string" ? value.text : "",
            },
          ],
        },
        isConcurrencySafe: () => false,
        presentCall: (args) => ({
          card: "generic",
          title: "compat_check",
          kind: "read",
          rawInput: args || {},
        }),
        async execute(args) {
          try {
            const wanted =
              args &&
              typeof args.profile === "string" &&
              args.profile.trim() !== ""
                ? args.profile.trim()
                : null;
            if (
              args &&
              Object.prototype.hasOwnProperty.call(args, "upgradeTo")
            ) {
              return await upgradeToolResult(state, {
                profile: wanted,
                targetVersion: args.upgradeTo,
                invalidRequest:
                  typeof args.upgradeTo !== "string"
                    ? "upgradeTo 必须为确切 DSH 版本"
                    : null,
              });
            }
            const compat = await serveReport(
              state,
              ctx,
              false,
              wanted ? { profile: wanted } : {},
            );
            const text = renderForModel(compat);
            return toolResult(compat, text);
          } catch (error) {
            // 工具的 execute 抛错会把整轮对话变成错误 —— 而"体检失败"不是用户的错，
            // 也不该让他重来一遍。所以这里**不抛**，把失败也变成一段可读的文本。
            return toolResult(
              failureEnvelope(errText(error)),
              `体检没跑成（这是工具的问题，不是插件的结论）：${errText(error)}`,
            );
          }
        },
      });
      log("D1 tool registered: compat_check");
      return dispose;
    } catch (error) {
      log(`WARN D1 tool registration failed: ${errText(error)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// E1: skill 半边 —— 把 skill/SKILL.md 注册进 ctx.skills
// ---------------------------------------------------------------------------
//
// **放在包里不算数。** DSH 不扫描插件包内的文件（实测见 skill/README.md）：
// `@liustack/modlens` 发了 `skills/modlens/SKILL.md` 却没注册，运行时根本没有这个 skill。
// 两条路能进 skill 目录：① 文件落进文件系统扫描根（那是脚本 --install-skill 的路）；
// ② 运行时注册 —— 就是下面这段。
//
// 为什么用 `ctx.inject` 而不是静态 `inject = ['skills']`：与本文件开头同一条理由 ——
// 静态 inject 会让本插件的 fiber 依赖 skills 服务，缺服务时整条条目停在 PENDING；
// 而这个插件的职责正是"宿主缺了什么"，它自己更不能因为缺服务而消失。
//
// 字段约束读自运行时源码（`@deepseek-ai/dsh-skill` 的 validateCandidate），不是照抄：
//   name 必须 kebab-case；description 必须非空；
//   provider 必须**等于** provider 自己的 name（否则报 returned skill "x" for provider "y"）；
//   rank 必须是有限数，600 是官方 bundled skill 用的 BUNDLED_SKILL_RANK。

const SKILL_NAME = "dsh-plugin-compat-check";
const SKILL_PROVIDER = "dsh-plugin-compat-check";
const SKILL_RANK = 600;

/**
 * 随包的 SKILL.md 在哪。
 *
 * ## ⚠️ 候选顺序是**实测换来的**，不要随手调
 *
 * 原来只有 `join(here, '..', 'skill', 'SKILL.md')`（仓库形态）。
 * 而**装进 profile 之后**它是 `<profile>/node_modules/dsh-plugin-compat-check`，
 * 上一层是 `node_modules/` —— 那里当然没有 `skill/`。
 *
 * 实测的后果是**静默失效**：宿主日志只有一句
 * `SKILL registration skipped: 找不到随包的 skill/SKILL.md`，
 * 而 skill 是本项目三类产物之一。E1 当年报"跑通"是因为那次**在仓库里**跑的。
 *
 * 根因是 pnpm 按 `package.json` 的 `files` 字段**复制**目录（不是符号链接），
 * 而当时 `files` 里没有 `skill/`。所以现在两件事一起做：
 *   1. `files` 加了 `skill/`，且 `plugin/skill/SKILL.md` 是**提交的副本**
 *      （`file:` 安装路径**不跑 `prepack`**，所以不能像 kernel/ 那样只在打包时暂存）；
 *   2. 候选顺序把**包内**的放第一位 —— 那才是安装后的真实位置。
 *
 * 副本会漂移，所以 `test/skill.test.mjs` 有一条断言：两份必须逐字节相同。
 */
function readPackagedSkill() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "skill", "SKILL.md"), // **安装形态**：包内自带（files 里有 skill/）
    join(here, "..", "skill", "SKILL.md"), // 仓库形态：<repo>/plugin/index.js → <repo>/skill/SKILL.md
    join(here, "SKILL.md"),
    join(here, "assets", "SKILL.md"),
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, "utf8");
      const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
      if (fm === null) continue;
      // 只按**单行标量**读这两个字段。写成多行 YAML 时这里读不到 ——
      // 宁可读不到（打一条日志），也好过猜一个错的 description。
      const field = (key) => {
        const m = new RegExp(`^${key}:[ \t]*(.+)$`, "m").exec(fm[1]);
        return m === null ? null : m[1].trim().replace(/^["']|["']$/g, "");
      };
      const skillName = field("name");
      const description = field("description");
      if (skillName === null || description === null) continue;
      return {
        file,
        name: skillName,
        description,
        content: raw.slice(fm[0].length).trim(),
      };
    } catch {
      /* 读不到就试下一个候选 */
    }
  }
  return null;
}

function registerSkill(ctx) {
  try {
    if (typeof ctx.inject !== "function") {
      log("SKILL registration skipped: ctx.inject is not a function");
      return;
    }
    ctx.inject(["skills"], (skillCtx) => {
      try {
        if (
          !skillCtx.skills ||
          typeof skillCtx.skills.registerProvider !== "function"
        ) {
          log(
            "SKILL registration skipped: scoped ctx has no skills.registerProvider",
          );
          return;
        }
        const skill = readPackagedSkill();
        if (skill === null) {
          log("SKILL registration skipped: 找不到随包的 skill/SKILL.md");
          return;
        }
        // 正文在注册时读进内存：包内文件运行时不会变，这样 get() 永不抛。
        const invocation = { modelInvocable: true, userInvocable: true };
        const summary = {
          name: SKILL_NAME,
          description: skill.description,
          invocation,
          provider: SKILL_PROVIDER,
          source: "bundled",
          rank: SKILL_RANK,
          locator: skill.file,
          path: skill.file,
          resourceBase: { kind: "directory", path: path.dirname(skill.file) },
        };
        const dispose = skillCtx.skills.registerProvider(() => ({
          name: SKILL_PROVIDER,
          list: () => Promise.resolve([summary]),
          get: () =>
            Promise.resolve({
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
        return dispose;
      } catch (error) {
        log(`SKILL registration failed: ${errText(error)}`);
      }
    });
  } catch (error) {
    log(`SKILL registration subscribe failed: ${errText(error)}`);
  }
}

export function apply(ctx) {
  // Nothing below may throw: a throw here fails this plugin's own fiber.
  try {
    log(`HOST-HALF-ACTIVATED pid=${process.pid} node=${process.version}`);

    const state = {
      disposed: false,
      scanTimers: new Set(),
      applyAt: new Date().toISOString(),
      loader: undefined,
      loaderVia: null,
      loaderAccess: {
        attempts: [],
        injectProbe: { registered: false, outcome: "not run" },
      },
      disposeInjectProbe: null,
      // ── F2：结果缓存 ──
      // 面板打开时可能连着拉几次，而一次体检是几百毫秒到 1.5 秒的活。
      // 更重要的是**启动时就先跑一次**（见下面的预热），这样用户点开面板是即时的。
      lastReport: null,
      lastReportAt: 0,
      /** 缓存有效期。到点不清空，而是**先返回旧的、后台再刷新** —— 见下面的 stale-while-revalidate。 */
      cacheTtlMs: toPositiveInt(process.env.DSC_CACHE_TTL_MS, 5 * 60 * 1000),
      // A caller may shorten the observation interval; never enlarge its default.
      cacheWatchMs: Math.min(
        5000,
        toPositiveInt(process.env.DSC_CACHE_WATCH_MS, 5000),
      ),
      /** 启动后多久自动跑第一次（默认落在最后一次 loader 扫描之后） */
      autoRunDelayMs: toPositiveInt(
        process.env.DSC_AUTORUN_MS,
        (SCAN_DELAYS[SCAN_DELAYS.length - 1] || 4000) + 2000,
      ),
      autoRunTimer: null,
    };

    // Resolve the loader immediately: it is a plain service read and must not
    // depend on the entry tree having settled.
    try {
      const resolved = resolveLoader(ctx);
      state.loader = resolved.loader;
      state.loaderVia = resolved.via;
      state.loaderAccess = {
        ...state.loaderAccess,
        ...publicLoaderAccess(resolved),
      };
      log(
        `loader access: via=${resolved.via ?? "UNREACHABLE"} attempts=${JSON.stringify(resolved.attempts)}`,
      );
    } catch (error) {
      state.loaderAccess.attempts.push(
        `resolveLoader threw: ${errText(error)}`,
      );
      log(`ERROR resolving loader: ${errText(error)}`);
    }

    // The `inject: ["loader"]` safety experiment (see startInjectProbe).
    try {
      state.disposeInjectProbe = startInjectProbe(
        ctx,
        state.loaderAccess.injectProbe,
      );
    } catch (error) {
      state.loaderAccess.injectProbe.outcome = `probe setup threw: ${errText(error)}`;
    }

    // ── C2 数据通道 ──
    //
    // 路由挂在**作用域 ctx** 上，而不是本插件自己的 ctx 上：这样
    // webServer 缺席时（headless / CLI 形态）这一段根本不注册，
    // 本插件的 fiber 也不会去等一个不存在的服务 —— `inject` 保持 []，
    // 与本文件的整体设计一致（见文件头）。
    registerReportRoute(ctx, state);

    // E1：注册随包的 skill。**失败只留日志，绝不抛** —— 见文件顶部硬规矩。
    try {
      registerFindingReviewRoute(ctx, state);
      historyRuntime.registerHistoryRoute(ctx, state);
      registerUpgradeRoute(ctx, state);
      registerSkill(ctx);
    } catch (error) {
      log(`WARN SKILL registration threw: ${errText(error)}`);
    }

    // D1：对话工具（同一个 computeReport，所以工具与面板不可能给出不同答案）
    try {
      registerTool(ctx, state);
    } catch (error) {
      log(`WARN D1 tool setup threw: ${errText(error)}`);
    }

    const finish = () => {
      const probe = state.loaderAccess.injectProbe;
      if (
        probe.registered &&
        probe.firedAfterMs === undefined &&
        probe.outcome === "not run"
      ) {
        probe.outcome =
          "did not fire before the final scan (would have stayed PENDING)";
      }
      log(
        `inject-probe: registered=${probe.registered} outcome=${probe.outcome}${
          probe.firedAfterMs !== undefined
            ? ` firedAfterMs=${probe.firedAfterMs}`
            : ""
        }`,
      );
      // ⚠️ 这里**不要**动 `state.autoRunTimer`。它是 F2 的启动自检，与 loader 扫描
      // 是两件事 —— 但它们**时间上相邻**：默认时机就落在最后一次扫描之后 2 秒。
      // 早先写成了 `finish()` 里 clearTimeout(autoRunTimer)，于是最后一次扫描一结束
      // 就把启动自检取消了：**它从来没跑过，也没有任何报错**（性能测量看不见的静默失效）。
      // 教训：清理定时器必须由创建它的那一方负责。
      // F2：最后一次扫描之后跑启动自检 —— 这时候条目状态才是稳的。
      try {
        if (typeof state.runAutoCheck === "function") state.runAutoCheck();
      } catch (error) {
        log(`WARN F2 启动自检触发失败: ${errText(error)}`);
      }
      try {
        if (typeof state.disposeInjectProbe === "function") {
          state.disposeInjectProbe();
          state.disposeInjectProbe = null;
        }
      } catch (error) {
        log(`WARN disposing inject probe failed: ${errText(error)}`);
      }
    };

    // Passes are serialized: each scan is time-bounded internally, so the next
    // one can safely wait for it and the report file is never written twice
    // concurrently.
    const schedulePass = (index) => {
      if (state.disposed) return;
      const previous = index === 0 ? 0 : SCAN_DELAYS[index - 1];
      const delay = Math.max(0, SCAN_DELAYS[index] - previous);
      const timer = setTimeout(() => {
        state.scanTimers.delete(timer);
        if (state.disposed) return;
        const pass = index + 1;
        try {
          scan(ctx, state, pass)
            .catch((error) =>
              log(`ERROR scan#${pass} failed: ${errText(error)}`),
            )
            .finally(() => {
              if (state.disposed) return;
              if (pass < SCAN_DELAYS.length) schedulePass(index + 1);
              else finish();
            });
        } catch (error) {
          log(`ERROR scan#${pass} threw synchronously: ${errText(error)}`);
        }
      }, delay);
      // unref: a scan timer must never keep the host process alive.
      if (timer && typeof timer.unref === "function") timer.unref();
      state.scanTimers.add(timer);
    };
    schedulePass(0);

    // ── F2：启动后自动跑一次，并把「变了没有」直接打进启动日志 ──
    //
    // 为什么值得单独做：本产品最大的风险不是"算错"，而是**用户想不起来看**。
    // 角标只在他点开面板时才存在；而"上次是好的、这次不行了"这件事，
    // 最该被知道的时间点就是**启动时**。
    //
    // 时机：**由最后一次 loader 扫描完成来触发**，而不是另起一个定时器。
    // 两个理由：
    //   1. 插件条目的状态在启动后几秒内还会变（异步 import），太早跑会把
    //      "还在加载"误记成"没起来"；
    //   2. 早先用独立定时器，结果它和 `finish()` 的时间**相邻**，被 `finish()`
    //      的清理顺手取消掉了 —— 启动自检从未运行、且**没有任何报错**。
    //      一个"看起来做了其实没做"的定时器，比没有更糟。
    state.runAutoCheck = () => {
      if (state.disposed) return;
      if (state.autoCheckStarted) return; // 幂等：只跑一次
      state.autoCheckStarted = true;
      try {
        serveReport(state, ctx, false)
          .then((out) => {
            if (state.disposed) return;
            if (out && out.ok) {
              if (!state.reportService?.ownsReport(out.report)) return;
              state.lastReport = out;
              state.lastReportAt = Date.now();
              const sum = out.report.summary || {};
              const b = out.baseline || {};
              const badge = b.badge || {};
              log(
                `F2 启动自检: 可用 ${sum.ok || 0} 部分可用 ${sum.partial || 0} 不兼容 ${sum.broken || 0}` +
                  (sum.vacuousOk ? ` (${sum.vacuousOk} 个为空洞的可用)` : ""),
              );
              // 有变化就打成一条显眼的日志；没变化也要有一条。
              // 「没有变化」必须说出来 —— 沉默会被读成"没检查"或"坏消息被藏起来了"。
              if (badge.show)
                log(`F2 与上次相比: ${badge.text} —— ${badge.detail || ""}`);
              else
                log(
                  `F2 与上次相比: ${badge.detail || b.note || "没有可比基线"}`,
                );
            } else if (out) {
              log(`WARN F2 启动自检没跑成: ${out.error || "未知原因"}`);
            }
          })
          .catch((error) => log(`WARN F2 启动自检失败: ${errText(error)}`));
      } catch (error) {
        log(`WARN F2 启动自检同步失败: ${errText(error)}`);
      }
    };

    // 兜底：万一 loader 扫描那条路没走到（例如 loader 完全不可达，
    // `scan` 会提前 return），启动自检也必须跑。两条路都调 `runAutoCheck`，
    // 由它自己保证幂等 —— 谁先到都算数。
    {
      const timer = setTimeout(() => {
        try {
          state.runAutoCheck();
        } catch {
          /* 忽略 */
        }
      }, state.autoRunDelayMs);
      if (timer && typeof timer.unref === "function") timer.unref();
      state.fallbackTimer = timer;
    }

    // Manual re-scan handle for tooling/experiments (no host service needed).
    try {
      const handle = {
        rescan: () => scan(ctx, state, 0),
        reportPath: OUT_JSON,
        // 面板用的那份结论（同一个函数，所以界面与工具不可能给出不同答案）
        compatReport: (c) => computeReport(state, c || ctx),
      };
      globalThis.__DSH_COMPAT_CHECK__ = handle;
      if (typeof ctx.effect === "function")
        ctx.effect(
          () => () => {
            state.disposed = true;
            for (const request of state.reviewRequests || []) request.abort();
            for (const request of state.historyRequests || []) request.abort();
            state.reviewTargets?.clear();
            state.reviewSidecars?.dispose();
            state.reportService?.dispose();
            state.lastReport = null;
            state.lastReportAt = 0;
            for (const off of state.cacheEventDisposers || []) {
              try {
                off();
              } catch {}
            }
            state.cacheEventDisposers = [];
            state.upgradeFlight?.controller?.abort();
            for (const timer of state.scanTimers) clearTimeout(timer);
            state.scanTimers.clear();
            clearTimeout(state.fallbackTimer);
            state.disposeInjectProbe?.();
            state.disposeInjectProbe = null;
            if (globalThis.__DSH_COMPAT_CHECK__ === handle)
              delete globalThis.__DSH_COMPAT_CHECK__;
          },
          "compat-check: generation cleanup",
        );
    } catch {
      /* 忽略 */
    }
  } catch (error) {
    try {
      log(`FATAL-SWALLOWED apply() failed: ${errText(error)}`);
    } catch {
      /* 连打日志都失败就只能咽下去 */
    }
  }
}
