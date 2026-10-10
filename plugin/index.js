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

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
