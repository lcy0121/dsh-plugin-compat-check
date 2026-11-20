/** Loader access and bounded observation of Cordis entry lifecycles. */
/** Cordis FiberState (const enum in the host, so mirrored here as data). */
const FIBER_STATES = {
  0: "PENDING",
  1: "LOADING",
  2: "ACTIVE",
  3: "FAILED",
  4: "DISPOSED",
  5: "UNLOADING",
};

/** Defensive cap: a pathological iterable must not exhaust the host's heap. */
const MAX_ENTRIES = 20000;

export function createLoaderObservation({ describe, errText, awaitTimeoutMs }) {
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
      if (typeof dispose === "function") return dispose;
      // Core 4.1 returns the child Fiber. Keep its receiver when disposing it.
      if (typeof dispose?.dispose === "function")
        return dispose.dispose.bind(dispose);
      return null;
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
      if (inject instanceof Set) return [...inject].map(String);
      if (typeof inject === "object") return Object.keys(inject);
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
      row.fiberStateCode = Number.isInteger(code) ? code : null;
      row.fiberState =
        (Number.isInteger(code) ? FIBER_STATES[code] : null) ??
        `UNKNOWN(${String(code)})`;
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
    if (
      ["PENDING", "LOADING", "FAILED", "UNLOADING"].includes(row.fiberState)
    ) {
      const awaited = await awaitFiber(fiber, awaitTimeoutMs);
      if (awaited.timedOut) {
        row.awaitTimedOut = true;
        row.notes.push(`fiber.await() exceeded ${awaitTimeoutMs}ms`);
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

  return {
    resolveLoader,
    publicLoaderAccess,
    startInjectProbe,
    introspectEntry,
    toEntryArray,
  };
}
