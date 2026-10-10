// Host half of the dsh-plugin-compat-check plugin — loader self-introspection
// (Plan.md §5 B1/B2/B3: read ctx.loader.entries(), recover failure reasons,
// never throw).
//
// HARD RULE (Plan.md §4 第 6 条：绝不抛、绝不拖累宿主): this plugin must never
// throw and must never keep the host from booting. A health-check plugin that
// breaks host startup becomes an instance of the very class of problem it is
// meant to detect. Every host object in here is touched behind try/catch, and
// the one call that can hang (`fiber.await()`) is raced against a timeout.
//
// Why `inject` stays empty: `ctx.loader` is a Cordis service, and the context
// proxy resolves it by walking the fiber chain — declaring it in `inject` is
// not required to read it. Declaring a service we do not strictly need is the
// exact way to park this plugin's own fiber in PENDING (Plan.md §6 地雷清单).
// `resolveLoader()` below therefore tries the inject-free lookup first, and the
// plugin additionally runs a one-shot child-fiber probe (`ctx.inject`) to
// record, empirically, whether `inject: ["loader"]` *would* have been safe —
// without risking its own activation.
//
// Output (the verifiable form required before any UI exists):
//   ${DSC_OUT_DIR:-$TMPDIR/dsh-plugin-compat-check}/loader-introspect.json
// plus structured console lines prefixed with [dsh-plugin-compat-check].

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path, { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const name = 'dsh-plugin-compat-check';

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
  0: 'PENDING',
  1: 'LOADING',
  2: 'ACTIVE',
  3: 'FAILED',
  4: 'DISPOSED',
  5: 'UNLOADING',
};

const OUT_DIR = process.env.DSC_OUT_DIR || join(tmpdir(), 'dsh-plugin-compat-check');
const OUT_JSON = join(OUT_DIR, 'loader-introspect.json');

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
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  const parsed = value
    .split(',')
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
    if (typeof error === 'string') return error;
    if (error instanceof Error) {
      const stack = typeof error.stack === 'string' ? error.stack : '';
      return stack || `${error.name}: ${error.message}`;
    }
    const text = String(error);
    return text === '[object Object]' ? safeJson(error) : text;
  } catch {
    return '<unprintable error>';
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '<unserializable>';
  }
}

function describe(value) {
  try {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    return typeof value;
  } catch {
    return '<unreadable>';
  }
}

function writeReport(report) {
  try {
    mkdirSync(OUT_DIR, { recursive: true });
  } catch {
    /* 目录已存在或不可写 */
  }
  let written = false;
  try {
    writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
    written = true;
  } catch (error) {
    log(`WARN could not write ${OUT_JSON}: ${errText(error)}`);
  }
  return written;
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

  const looksLikeLoader = (value) => value !== undefined && value !== null && typeof value.entries === 'function';

  try {
    const value = ctx.get('loader');
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
      const value = ctx.get('loader', false);
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
      via = 'ctx.loader';
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
    if (typeof ctx.inject !== 'function') {
      record.outcome = 'ctx.inject is not a function';
      return null;
    }
    record.registered = true;
    const dispose = ctx.inject(['loader'], (scoped) => {
      try {
        record.outcome = 'fired (child fiber activated)';
        record.firedAfterMs = Date.now() - startedAt;
        const value = scoped?.loader ?? scoped?.get?.('loader');
        record.scopedLoader = describe(value);
        record.scopedLoaderHasEntries = typeof value?.entries === 'function';
      } catch (error) {
        record.outcome = `callback threw: ${errText(error)}`;
      }
    });
    return typeof dispose === 'function' ? dispose : null;
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
  if (promise === undefined || promise === null || typeof promise.then !== 'function') {
    return { ok: true, reason: null, timedOut: false };
  }

  const settled = Promise.resolve(promise).then(
    () => ({ ok: true, reason: null, timedOut: false }),
    (error) => ({ ok: false, reason: errText(error), timedOut: false }),
  );

  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ ok: false, reason: null, timedOut: true }), timeoutMs);
      if (timer && typeof timer.unref === 'function') timer.unref();
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
    if (typeof inject === 'object') return Object.keys(inject);
    if (inject instanceof Set) return [...inject].map(String);
    return [];
  } catch (error) {
    return [`<unreadable inject: ${errText(error)}>`];
  }
}

/** 缺服务 = fiber.ctx.get(key) === undefined (Plan.md §5 B1). */
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
    return options !== undefined && options !== null && typeof options === 'object' ? options : {};
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
    fiberState: 'NO_FIBER',
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
    row.notes.push('disabled expression threw');
  }

  let fiber;
  try {
    fiber = entry?.fiber;
  } catch (error) {
    row.notes.push(`entry.fiber unreadable: ${errText(error)}`);
  }

  if (fiber === undefined || fiber === null) {
    row.fiberState = 'NO_FIBER';
    row.notes.push('no fiber (loader did not import this entry)');
    if (row.group) row.notes.push('options.group is true');
    return row;
  }

  try {
    const code = fiber.state;
    row.fiberStateCode = typeof code === 'number' ? code : null;
    row.fiberState = FIBER_STATES[code] ?? `UNKNOWN(${String(code)})`;
  } catch (error) {
    row.fiberState = 'UNREADABLE';
    row.notes.push(`fiber.state threw: ${errText(error)}`);
  }

  try {
    row.declaredInject = declaredInjectKeys(fiber);
    row.declaredInjectCount = row.declaredInject.length;
    const { missing, present, unreadable } = missingServices(fiber, row.declaredInject);
    row.missingServices = missing;
    row.presentServices = present;
    row.unreadableServices = unreadable;
  } catch (error) {
    row.notes.push(`inject/missing-service scan threw: ${errText(error)}`);
  }

  // Only a fiber that is not ACTIVE can carry an unobserved rejection.
  if (row.fiberState !== 'ACTIVE' && row.fiberState !== 'DISPOSED') {
    const awaited = await awaitFiber(fiber, AWAIT_TIMEOUT_MS);
    if (awaited.timedOut) {
      row.awaitTimedOut = true;
      row.notes.push(`fiber.await() exceeded ${AWAIT_TIMEOUT_MS}ms`);
    } else if (!awaited.ok) {
      row.failureReason = awaited.reason;
    } else if (row.fiberState === 'PENDING') {
      row.notes.push('fiber.await() resolved without error (PENDING: waiting for services)');
    }
  }

  if (row.disabled === true) row.notes.push('entry is disabled');
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
  if (value === null || value === undefined) return fail(`entries() returned ${describe(value)}`);
  if (Array.isArray(value)) return { entries: value, truncated: false, error: null };

  let iterable = false;
  try {
    iterable = typeof value[Symbol.iterator] === 'function';
  } catch (error) {
    return fail(`probing Symbol.iterator threw: ${errText(error)}`);
  }
  if (iterable) {
    const out = [];
    try {
      for (const item of value) {
        out.push(item);
        if (out.length >= MAX_ENTRIES) return { entries: out, truncated: true, error: null };
      }
      return { entries: out, truncated: false, error: null };
    } catch (error) {
      return { entries: out, truncated: false, error: `iterating entries threw: ${errText(error)}` };
    }
  }

  try {
    if (typeof value.length === 'number') {
      const length = Math.min(value.length, MAX_ENTRIES);
      return { entries: Array.prototype.slice.call(value, 0, length), truncated: value.length > length, error: null };
    }
  } catch (error) {
    return fail(`reading array-like entries threw: ${errText(error)}`);
  }
  return fail(`entries() returned a non-iterable ${describe(value)}`);
}

async function scan(ctx, state, pass) {
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
    report.loaderAccess = { ...state.loaderAccess, ...publicLoaderAccess(resolved) };
  }

  if (loader === undefined) {
    report.errors.push('loader service not reachable from this plugin context');
    log(`ERROR loader not reachable (${JSON.stringify(state.loaderAccess.attempts ?? [])})`);
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
      iterable: typeof rawEntries?.[Symbol.iterator] === 'function',
      truncated: walked.truncated,
    };
    entries = walked.entries;
    if (walked.error !== null) report.errors.push(`loader.entries(): ${walked.error}`);
  } catch (error) {
    report.errors.push(`loader.entries() threw: ${errText(error)}`);
    log(`ERROR scan#${pass}: loader.entries() threw: ${errText(error)}`);
    writeReport(report);
    return report;
  }
  if (entries === null) {
    const detail = report.errors.length > 0 ? report.errors.join('; ') : 'unknown reason';
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
        id: '<unreadable entry>',
        fiberState: 'UNREADABLE',
        notes: [`entry introspection threw: ${errText(error)}`],
      };
      report.errors.push(`entry introspection threw: ${errText(error)}`);
    }
    report.entries.push(row);
    report.stateHistogram[row.fiberState] = (report.stateHistogram[row.fiberState] ?? 0) + 1;
  }

  report.problems = report.entries.filter((row) => {
    if (row.disabled === true) return false;
    if (row.fiberState === 'ACTIVE') return false;
    return true;
  });

  const written = writeReport(report);
  log(
    `scan#${pass}/${SCAN_DELAYS.length} loader-via=${via} entries=${report.entryCount} states=${safeJson(report.stateHistogram)} problems=${report.problems.length} report=${OUT_JSON}${written ? '' : ' (WRITE FAILED)'}`,
  );
  for (const row of report.problems) {
    log(
      `  PROBLEM id=${safeJson(row.id)} name=${safeJson(row.name)} state=${row.fiberState}` +
        ` missing=[${row.missingServices.join(', ')}]` +
        (row.failureReason ? ` reason=${firstLine(row.failureReason)}` : '') +
        (row.awaitTimedOut ? ' (await timed out)' : ''),
    );
  }
  return report;
}

function firstLine(text) {
  try {
    const line = String(text).split('\n')[0];
    return line.length > 300 ? `${line.slice(0, 300)}…` : line;
  } catch {
    return '<unprintable>';
  }
}

// ---------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C2: 面板数据通道（宿主半边算结论，客户端半边渲染）
// ---------------------------------------------------------------------------

/**
 * 内核的位置。插件半边**不自己实现判定** —— 它 import 仓库里的内核。
 *
 * 三条候选路径，按可靠性排序：
 *   1. 环境变量 `DSC_KERNEL`（打包/发布形态下由外层指定）
 *   2. 本包在仓库里的位置（`plugin/` 的上一级）—— 开发与 GitHub 分发时的形态
 * 找不到就返回 null，**由调用方决定怎么说**，这里不抛。
 */
function resolveKernelDir() {
  const { dirname: dir } = path;
  const here = dir(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.DSC_KERNEL,
    path.resolve(here, '..'), // plugin/ → 仓库根
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (existsSync(path.join(c, 'lib', 'extract.mjs')) && existsSync(path.join(c, 'lib', 'verdict.mjs'))) {
        return c;
      }
    } catch { /* 下一个候选 */ }
  }
  return null;
}

/**
 * 当前 profile 的 node_modules。
 *
 * 优先级：显式覆盖 → DSH 正在跑的 profile → `desktop`。
 * 「正在跑的是哪个 profile」没有正式服务暴露，只能靠环境变量与目录推断 ——
 * 所以这里把推断的**依据**一起放进报告，让结论可追溯，而不是猜一个就不吭声。
 */
function resolveNodeModules() {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  const explicit = process.env.DSC_PROFILE;
  const candidates = [];
  if (explicit) candidates.push({ dir: join(dshHome, 'profiles', explicit, 'node_modules'), why: `DSC_PROFILE=${explicit}` });

  for (const key of ['DSH_PROFILE', 'DSH_ACTIVE_PROFILE', 'DSH_PROFILE_NAME']) {
    const v = process.env[key];
    if (v) candidates.push({ dir: join(dshHome, 'profiles', v, 'node_modules'), why: `${key}=${v}` });
  }
  candidates.push({ dir: join(dshHome, 'profiles', 'desktop', 'node_modules'), why: '回退到 desktop profile' });

  for (const c of candidates) {
    try {
      if (existsSync(c.dir)) return { dir: c.dir, why: c.why };
    } catch { /* 下一个 */ }
  }
  return { dir: null, why: '没有任何候选目录存在' };
}

/**
 * 基线文件的位置。**必须与 CLI 的 `bin/compat-check.mjs` 推导出同一个路径** ——
 * 两份基线会立刻分叉，而用户在面板和命令行看到的"变化"就会是两件事。
 * 按 profile 分文件：不同 profile 的插件集合不同，混在一起会让差分变成噪音。
 */
function baselineFileFor(nmDir) {
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  let key = 'unknown';
  try {
    const parts = String(nmDir).split(path.sep);
    const i = parts.lastIndexOf('profiles');
    if (i >= 0 && parts[i + 1]) key = parts[i + 1];
  } catch { /* 保持 unknown */ }
  return join(dshHome, 'dsh-plugin-compat-check', `baseline.${key.replace(/[^\w.-]/g, '_')}.json`);
}

/**
 * 跑一次体检。**同步、纯计算、不抛**。
 *
 * 为什么宿主半边要算而不是把原始数据丢给客户端：
 *   - 客户端跑在浏览器里，读不了文件系统；
 *   - 结论（五元组 + 确定性）是内核的产物，算出唯一一份才不会两边漂移。
 */
async function computeReport(state, ctx) {
  const started = Date.now();
  const out = {
    schemaVersion: 1,
    kind: 'plugin-compat-check/report',
    computedAt: new Date().toISOString(),
    ok: false,
    error: null,
    kernelDir: null,
    nodeModules: null,
    nodeModulesWhy: null,
    // C4：与上次体检的差分包（没有基线时为 null，并带 note 说明为什么）
    baseline: null,
    report: null,
  };
  try {
    const kernel = resolveKernelDir();
    out.kernelDir = kernel;
    if (!kernel) {
      out.error = '找不到判定内核（lib/extract.mjs + lib/verdict.mjs）。'
        + '插件形态下它们是同仓库的相邻目录；发布形态请设 DSC_KERNEL。';
      return out;
    }
    const nm = resolveNodeModules();
    out.nodeModules = nm.dir;
    out.nodeModulesWhy = nm.why;
    if (!nm.dir) {
      out.error = `找不到要体检的 node_modules：${nm.why}`;
      return out;
    }

    const { extractWithProvenance } = await import(pathToFileURL(join(kernel, 'lib', 'extract.mjs')).href);
    const { buildVerdicts } = await import(pathToFileURL(join(kernel, 'lib', 'verdict.mjs')).href);

    const catalogPath = join(kernel, 'rules', 'dsh-api-catalog.json');
    const rulesPath = join(kernel, 'rules', 'severity.json');
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));

    // 运行时面：宿主半边**自己就在进程里**，所以它能拿到比探针更准的东西。
    // 第一版先读探针报告（如果外层给了路径），没有就退回目录 —— 并如实标注。
    let hostSurface = null;
    let surfaceWhy = '没有运行时面：结论中的方法级判定降为「疑似」';
    const probePath = process.env.DSC_PROBE_REPORT;
    if (probePath && existsSync(probePath)) {
      try {
        hostSurface = JSON.parse(readFileSync(probePath, 'utf8'));
        surfaceWhy = `运行时面来自探针报告 ${probePath}`;
      } catch (error) {
        surfaceWhy = `探针报告读不动（${errText(error)}），退回目录`;
      }
    }
    out.surfaceWhy = surfaceWhy;

    const extracted = extractWithProvenance(nm.dir, { catalog });
    const verdict = buildVerdicts({
      report: extracted.report,
      hostSurface,
      rules,
      catalog,
      dshVersion: process.env.DSH_VERSION || null,
    });

    // ── C4：基线差分 ──
    // 用**与 CLI 完全相同**的 lib/baseline.mjs。面板说"变差了"而命令行说"没变"
    // 这种分叉在结构上就不可能发生。
    let baseline = null;
    try {
      const { snapshotForBaseline, diffAgainstBaseline, badgeFor } =
        await import(pathToFileURL(join(kernel, 'lib', 'baseline.mjs')).href);
      const snap = snapshotForBaseline(verdict, process.env.DSH_VERSION || null);
      const bfile = baselineFileFor(nm.dir);
      let prev = null;
      let readNote = null;
      try {
        if (existsSync(bfile)) prev = JSON.parse(readFileSync(bfile, 'utf8'));
        else readNote = '还没有基线（这是第一次体检）';
      } catch (error) {
        // 读不出来**不是**"没有变化"。必须区分"你没跑过"与"你的基线坏了" ——
        // 后者会让用户以为一切照旧，继续用着已经变坏的环境。
        readNote = `基线读不出来（${errText(error)}）—— 这次不做比较`;
      }
      const diff = diffAgainstBaseline(prev, snap);
      baseline = { file: bfile, note: readNote, diff, badge: badgeFor(diff), wrote: false };
      // 只有这一次真的算出了结论才写基线：一次失败的体检写下的基线，
      // 会把"读不到"记成"这些插件都没了"，下次比较全是假变化。
      try {
        mkdirSync(path.dirname(bfile), { recursive: true });
        writeFileSync(bfile, `${JSON.stringify(snap, null, 2)}\n`);
        baseline.wrote = true;
      } catch (error) {
        baseline.writeError = `基线写不进去（${errText(error)}）`;
      }
    } catch (error) {
      baseline = { error: errText(error), note: '基线差分没算成（不影响本次结论）' };
    }

    // 只把面板要用的部分送过去：完整 report 在 desktop profile 上是 ~1 MB，
    // 而面板要的只是每个插件的结论与去处。
    // ── 面板条目台账：id → 包名 ──
    // `plugins.detail.*` 只收到 `{subject:{kind,id}}`，**没有包名**，而 id 常常
    // 不等于包名（插件面板自己那个条目的 id 就叫 `plugins`）。所以从面板管理器
    // 自己的只读服务里取这张表，让客户端能解析出"这是哪个插件"。
    // 取不到不算失败：客户端会退回到"id 就是包名"的判断，并如实不渲染角标。
    try {
      const pm = typeof ctx.get === 'function' ? ctx.get('pluginManager', false) : undefined;
      const listing = pm && typeof pm.list === 'function' ? await pm.list() : null;
      if (listing) {
        const arr = Array.isArray(listing) ? listing : (listing.items || listing.plugins || []);
        out.items = arr
          .map((it) => {
            if (!it || typeof it !== 'object') return null;
            const id = it.id ?? it.entryId ?? it.slotId ?? null;
            const pkg = it.packageName ?? it.package ?? it.name ?? null;
            return (id && pkg) ? { id, packageName: String(pkg), label: it.label ?? null } : null;
          })
          .filter(Boolean);
      }
    } catch (error) {
      out.itemsError = errText(error);
    }

    out.baseline = baseline;
    out.report = {
      summary: verdict.summary,
      dshVersion: verdict.dshVersion,
      hasRuntimeSurface: Boolean(hostSurface),
      surfaceWhy,
      plugins: verdict.plugins,
      // 逐条发现的证据形态：面板要能回答「凭什么这么判」
      // 条目台账（id → 包名），客户端解析角标归属时用
      items: out.items || [],
      itemsError: out.itemsError || null,
      manifests: extracted.report.manifests,
      serviceCount: extracted.report.services.length,
      siteTotal: (extracted.report.callSites || []).length,
    };
    out.ok = true;
    out.elapsedMs = Date.now() - started;
  } catch (error) {
    out.error = errText(error);
  }
  return out;
}

/** 本地信任栅栏：只有本机的 DSH 界面该读到这份数据。 */
function isTrustedRequest(req) {
  try {
    const host = String((req.headers && (req.headers.host || req.headers.Host)) || '');
    const origin = String((req.headers && (req.headers.origin || req.headers.Origin)) || '');
    const hostOk = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(host);
    if (!origin) return hostOk;
    return hostOk && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i.test(origin);
  } catch {
    return false;
  }
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
      return `体检没跑成（这是工具的问题，不是插件的结论）：${(compat && compat.error) || '未知原因'}`;
    }
    const r = compat.report;
    const L = [];
    const s = r.summary || {};
    L.push(`结论：可用 ${s.ok || 0}　部分可用 ${s.partial || 0}　不兼容 ${s.broken || 0}`
      + (s.vacuousOk ? `（其中 ${s.vacuousOk} 个「可用」是空洞的：该插件没有用过任何 DSH 服务，因此没有可检查的东西）` : ''));
    L.push(`体检对象：${compat.nodeModules}（${compat.nodeModulesWhy}）`);
    L.push(r.hasRuntimeSurface
      ? '方法级判定依据：宿主运行时面 —— 这类结论是确定的。'
      : '方法级判定依据：官方 API 目录（**契约目录，不是运行时面**）—— 因此方法级结论一律标「疑似」。'
        + '「疑似」不是缺陷，是诚实：判不准时降级标注，而不是升格成确定。');
    L.push('');

    const rank = { broken: 0, partial: 1, unknown: 2, ok: 3 };
    const names = Object.keys(r.plugins).sort((a, b) =>
      (rank[r.plugins[a].verdict] - rank[r.plugins[b].verdict]) || a.localeCompare(b));

    for (const name of names) {
      const p = r.plugins[name];
      const label = { broken: '不兼容', partial: '部分可用', unknown: '未知', ok: '可用' }[p.verdict] || p.verdict;
      L.push(`${label}  ${name}@${p.version || '?'}${p.vacuous ? '　[空洞的结论：无可检查对象]' : ''}`);
      for (const f of p.findings || []) {
        const api = f.service ? (f.method ? `${f.service}.${f.method}` : f.service) : '(包声明)';
        const loc = f.location ? `${f.location.file}:${f.location.line}` : '—';
        const cat = {
          'host-service-missing': '服务缺失', 'host-method-missing': '方法缺失',
          'unprovided-dependency': '无人提供的依赖', 'declaration-mismatch': '声明与实测不符',
        }[f.category] || f.category;
        const sev = { fatal: '致命', 'feature-dead': '功能失效', degraded: '降级' }[f.severity] || f.severity;
        L.push(`    ${sev} / ${cat}${f.certainty === 'certain' ? '' : ' [疑似]'}  ${api}  @ ${loc}`);
        if (f.impact) L.push(`      影响：${f.impact}`);
      }
      const cs = p.clientSide || [];
      if (cs.length) L.push(`    客户端半边（命令行测不到，需界面验证）：${cs.map((c) => c.service).join('、')}`);
      const noCalls = Object.values(p.resolved || {})
        .filter((c) => c.disposition === 'no-calls').map((c) => c.service);
      if (noCalls.length) L.push(`    无证据可判（只出现名字，没有调用点）：${noCalls.join('、')}`);
    }

    L.push('');
    L.push('读这个结果时注意两点：');
    L.push('  1) 「可用」不等于"功能验证过"。它只说明**用到的 DSH 服务与 API 都在**。'
      + '插件仍然可能因为自身逻辑、配置或第三方依赖而出问题。');
    L.push('  2) 「客户端半边」的那些服务命令行永远测不到 —— 它们活在浏览器里，'
      + '只能靠"界面上有没有出现该插件的 UI"来验证。别把"没报错"当成"没问题"。');
    return L.join('\n');
  } catch (error) {
    return `渲染结论时出错（工具的问题）：${errText(error)}`;
  }
}

/** 工具的服务集合：`tools`；`agents` 用来把相对路径解析到会话工作目录。 */
const TOOL_SERVICES = ['tools', 'agents'];

function registerTool(ctx, state) {
  // 与 C2 路由同一个理由：走作用域 ctx.inject，headless/CLI 形态下 `tools` 不在场时
  // 这段根本不注册，本插件的 fiber 也就不会去等一个不存在的服务（`inject` 保持 []）。
  if (typeof ctx.inject !== 'function') return;
  ctx.inject(TOOL_SERVICES, (scope) => {
    try {
      if (!scope.tools || typeof scope.tools.register !== 'function') {
        log('D1 tool skipped: scoped ctx has no tools.register');
        return;
      }
      scope.tools.register({
        name: 'compat_check',
        description:
          'Check whether the DSH plugins installed in this profile are actually compatible with the '
          + 'current DSH version, and report the exact file:line and reason for anything that is not. '
          + 'Use it when the user asks whether a plugin still works, why a feature disappeared after '
          + 'updating DSH, or whether something they installed is safe to keep. It reads the installed '
          + 'profile; it does not install anything or check a plugin that is not yet installed. '
          + 'Findings are labelled "certain" (backed by the live runtime surface) or "suspected" '
          + '(inferred from the official API catalogue, which is a contract catalogue and not the '
          + 'runtime surface) — report that distinction to the user instead of flattening it.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            profile: {
              type: 'string',
              description:
                'Optional profile name to inspect (e.g. "desktop"). Defaults to the profile this '
                + 'DSH instance is running, or desktop if it cannot be determined.',
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
            type: 'object',
            additionalProperties: false,
            properties: {
              summary: { type: 'string' },
              nodeModules: { type: 'string' },
              hasRuntimeSurface: { type: 'boolean' },
              text: { type: 'string' },
            },
            required: ['summary', 'nodeModules', 'hasRuntimeSurface', 'text'],
          },
          render: (_args, value) => [{ type: 'text', text: value && typeof value.text === 'string' ? value.text : '' }],
        },
        isConcurrencySafe: () => false,
        presentCall: (args) => ({
          card: 'generic',
          title: 'compat_check',
          kind: 'read',
          rawInput: args || {},
        }),
        async execute(args) {
          try {
            const wanted = args && typeof args.profile === 'string' && args.profile.trim() !== ''
              ? args.profile.trim()
              : null;
            const prev = process.env.DSC_PROFILE;
            if (wanted) process.env.DSC_PROFILE = wanted;
            let compat;
            try {
              compat = await computeReport(state, ctx);
            } finally {
              if (wanted) {
                if (prev === undefined) delete process.env.DSC_PROFILE;
                else process.env.DSC_PROFILE = prev;
              }
            }
            const text = renderForModel(compat);
            const s = (compat.report && compat.report.summary) || {};
            return {
              summary: `可用 ${s.ok || 0} / 部分可用 ${s.partial || 0} / 不兼容 ${s.broken || 0}`,
              nodeModules: compat.nodeModules || '',
              hasRuntimeSurface: Boolean(compat.report && compat.report.hasRuntimeSurface),
              text,
            };
          } catch (error) {
            // 工具的 execute 抛错会把整轮对话变成错误 —— 而"体检失败"不是用户的错，
            // 也不该让他重来一遍。所以这里**不抛**，把失败也变成一段可读的文本。
            return {
              summary: '无法判定',
              nodeModules: '',
              hasRuntimeSurface: false,
              text: `体检没跑成（这是工具的问题，不是插件的结论）：${errText(error)}\n`
                + '请不要据此判断兼容性。',
            };
          }
        },
      });
      log('D1 tool registered: compat_check');
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

const SKILL_NAME = 'dsh-plugin-compat-check';
const SKILL_PROVIDER = 'dsh-plugin-compat-check';
const SKILL_RANK = 600;

/** 仓库形态下 SKILL.md 在 plugin/ 的上一级；打包形态允许与 index.js 同级。 */
function readPackagedSkill() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, '..', 'skill', 'SKILL.md'), // <repo>/plugin/index.js → <repo>/skill/SKILL.md
    join(here, 'SKILL.md'),
    join(here, 'assets', 'SKILL.md'),
  ];
  for (const file of candidates) {
    try {
      if (!existsSync(file)) continue;
      const raw = readFileSync(file, 'utf8');
      const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw);
      if (fm === null) continue;
      // 只按**单行标量**读这两个字段。写成多行 YAML 时这里读不到 ——
      // 宁可读不到（打一条日志），也好过猜一个错的 description。
      const field = (key) => {
        const m = new RegExp(`^${key}:[ \t]*(.+)$`, 'm').exec(fm[1]);
        return m === null ? null : m[1].trim().replace(/^["']|["']$/g, '');
      };
      const skillName = field('name');
      const description = field('description');
      if (skillName === null || description === null) continue;
      return { file, name: skillName, description, content: raw.slice(fm[0].length).trim() };
    } catch {
      /* 读不到就试下一个候选 */
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
        if (!skillCtx.skills || typeof skillCtx.skills.registerProvider !== 'function') {
          log('SKILL registration skipped: scoped ctx has no skills.registerProvider');
          return;
        }
        const skill = readPackagedSkill();
        if (skill === null) {
          log('SKILL registration skipped: 找不到随包的 skill/SKILL.md');
          return;
        }
        // 正文在注册时读进内存：包内文件运行时不会变，这样 get() 永不抛。
        const invocation = { modelInvocable: true, userInvocable: true };
        const summary = {
          name: SKILL_NAME,
          description: skill.description,
          invocation,
          provider: SKILL_PROVIDER,
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

export function apply(ctx) {
  // Nothing below may throw: a throw here fails this plugin's own fiber.
  try {
    log(`HOST-HALF-ACTIVATED pid=${process.pid} node=${process.version}`);

    const state = {
      applyAt: new Date().toISOString(),
      loader: undefined,
      loaderVia: null,
      loaderAccess: {
        attempts: [],
        injectProbe: { registered: false, outcome: 'not run' },
      },
      disposeInjectProbe: null,
      lastReport: null,
    };

    // Resolve the loader immediately: it is a plain service read and must not
    // depend on the entry tree having settled.
    try {
      const resolved = resolveLoader(ctx);
      state.loader = resolved.loader;
      state.loaderVia = resolved.via;
      state.loaderAccess = { ...state.loaderAccess, ...publicLoaderAccess(resolved) };
      log(
        `loader access: via=${resolved.via ?? 'UNREACHABLE'} attempts=${JSON.stringify(resolved.attempts)}`,
      );
    } catch (error) {
      state.loaderAccess.attempts.push(`resolveLoader threw: ${errText(error)}`);
      log(`ERROR resolving loader: ${errText(error)}`);
    }

    // The `inject: ["loader"]` safety experiment (see startInjectProbe).
    try {
      state.disposeInjectProbe = startInjectProbe(ctx, state.loaderAccess.injectProbe);
    } catch (error) {
      state.loaderAccess.injectProbe.outcome = `probe setup threw: ${errText(error)}`;
    }

    // ── C2 数据通道 ──
    //
    // 路由挂在**作用域 ctx** 上，而不是本插件自己的 ctx 上：这样
    // webServer 缺席时（headless / CLI 形态）这一段根本不注册，
    // 本插件的 fiber 也不会去等一个不存在的服务 —— `inject` 保持 []，
    // 与本文件的整体设计一致（见文件头）。
    try {
      if (typeof ctx.inject === 'function') {
        ctx.inject(['webServer'], (scope) => {
          try {
            scope.webServer.register({
              name: 'dsh-plugin-compat-check',
              kind: 'exact',
              path: '/plugin-compat-check/report',
              handler: async (req, res) => {
                // 体检结论是本机信息（装了哪些插件、用了哪些 API），
                // 不该被这台机器上的任意页面读到。
                if (!isTrustedRequest(req)) {
                  res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ error: 'refused: untrusted request' }));
                  return;
                }
                try {
                  // `?refresh=1` 强制重算；否则用缓存（体检是几百毫秒级的活，
                  // 而面板打开时可能连着拉几次）。
                  const url = new URL(req.url || '/', 'http://127.0.0.1');
                  if (url.searchParams.get('refresh') === '1' || !state.lastReport) {
                    state.lastReport = await computeReport(state, ctx);
                  }
                  res.writeHead(200, {
                    'content-type': 'application/json; charset=utf-8',
                    'cache-control': 'no-store',
                  });
                  res.end(JSON.stringify(state.lastReport));
                } catch (error) {
                  // 连处理器里都不抛：把错误变成一条可读的 JSON，而不是 500 空响应。
                  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                  res.end(JSON.stringify({ ok: false, error: errText(error) }));
                }
              },
            });
            log('C2 route registered: GET /plugin-compat-check/report');
          } catch (error) {
            log(`WARN C2 route registration failed: ${errText(error)}`);
          }
        });
      } else {
        log('C2 route skipped: ctx.inject is not a function');
      }
    } catch (error) {
      log(`WARN C2 route setup threw: ${errText(error)}`);
    }

    // E1：注册随包的 skill。**失败只留日志，绝不抛** —— 见文件顶部硬规矩。
    try {
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
      if (probe.registered && probe.firedAfterMs === undefined && probe.outcome === 'not run') {
        probe.outcome = 'did not fire before the final scan (would have stayed PENDING)';
      }
      log(
        `inject-probe: registered=${probe.registered} outcome=${probe.outcome}${
          probe.firedAfterMs !== undefined ? ` firedAfterMs=${probe.firedAfterMs}` : ''
        }`,
      );
      try {
        if (typeof state.disposeInjectProbe === 'function') {
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
      const previous = index === 0 ? 0 : SCAN_DELAYS[index - 1];
      const delay = Math.max(0, SCAN_DELAYS[index] - previous);
      const timer = setTimeout(() => {
        const pass = index + 1;
        try {
          scan(ctx, state, pass)
            .catch((error) => log(`ERROR scan#${pass} failed: ${errText(error)}`))
            .finally(() => {
              if (pass < SCAN_DELAYS.length) schedulePass(index + 1);
              else finish();
            });
        } catch (error) {
          log(`ERROR scan#${pass} threw synchronously: ${errText(error)}`);
        }
      }, delay);
      // unref: a scan timer must never keep the host process alive.
      if (timer && typeof timer.unref === 'function') timer.unref();
    };
    schedulePass(0);

    // Manual re-scan handle for tooling/experiments (no host service needed).
    try {
      globalThis.__DSH_COMPAT_CHECK__ = {
        rescan: () => scan(ctx, state, 0),
        reportPath: OUT_JSON,
        // 面板用的那份结论（同一个函数，所以界面与工具不可能给出不同答案）
        compatReport: (c) => computeReport(state, c || ctx),
      };
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
