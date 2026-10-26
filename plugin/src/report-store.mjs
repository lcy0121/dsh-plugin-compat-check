/** Shared, lifecycle-bound client reports. No React or DOM mutation required. */
export function createReportStore({
  fetch = globalThis.fetch,
  validate,
  document = globalThis.document,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
} = {}) {
  const entries = new Map();
  let disposed = false,
    listening = false;
  const visible = () => !document || document.visibilityState !== "hidden";
  const visibility = () => {
    for (const entry of entries.values()) entry.visibilityChanged();
  };
  const attach = () => {
    if (!listening && document?.addEventListener) {
      document.addEventListener("visibilitychange", visibility);
      listening = true;
    }
  };
  const detach = () => {
    if (listening) document.removeEventListener("visibilitychange", visibility);
    listening = false;
  };
  function target(route = "/plugin-compat-check/report") {
    if (disposed) throw Error("Report subscription disposed");
    if (entries.has(route)) return entries.get(route);
    const subscriptions = new Set();
    let state = { phase: "loading", data: null, error: null },
      latest = null;
    let reportBytes = null,
      timer = null,
      pending = null,
      generation = 0;
    let closed = false,
      queuedForce = false,
      resumeForce = false;
    const active = () =>
      !closed &&
      !disposed &&
      visible() &&
      [...subscriptions].some((s) => s.visible);
    const notify = () => {
      if (active())
        for (const s of [...subscriptions]) if (s.visible) s.listener(state);
    };
    const pause = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      generation++;
      resumeForce ||= queuedForce || Boolean(pending?.force);
      if (pending) {
        pending.controller?.abort();
        pending = null;
      }
      queuedForce = false;
    };
    const schedule = () => {
      if (!active() || pending || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        return load(false, true);
      }, 2000);
    };
    const urlFor = (force, background) =>
      route +
      (route.includes("?") ? "&" : "?") +
      (force ? "refresh=1" : background ? "metadata=1" : "");
    const read = async (url, signal) => {
      const response = await fetch(url, {
        headers: { accept: "application/json", "X-DSH-Compat-Request": "1" },
        credentials: "same-origin",
        ...(signal ? { signal } : {}),
      });
      if (!response.ok) throw Error("HTTP " + response.status);
      return response.json();
    };
    const metadataMatches = (data) => {
      const cache = data?.cache;
      const cacheValid =
        cache === null ||
        (cache &&
          typeof cache === "object" &&
          !Array.isArray(cache) &&
          (cache.hit === undefined || typeof cache.hit === "boolean") &&
          (cache.ageMs === undefined ||
            (Number.isFinite(cache.ageMs) && cache.ageMs >= 0)) &&
          ["stale", "refreshing"].every(
            (k) => cache[k] === undefined || typeof cache[k] === "boolean",
          ) &&
          (cache.refreshError === undefined ||
            cache.refreshError === null ||
            typeof cache.refreshError === "string"));
      return (
        data?.kind === "plugin-compat-check/report-metadata" &&
        data.ok === true &&
        latest &&
        cacheValid &&
        data.computedAt === latest.computedAt &&
        data.nodeModules === latest.nodeModules &&
        data.dshVersion === latest.report.dshVersion &&
        (data.reviewsRevision || null) === (latest.reviews?.revision || null) &&
        (data.reviewsError || null) === (latest.reviews?.error || null) &&
        (data.reviewsContextToken || null) ===
          (latest.reviews?.contextToken || null)
      );
    };
    function load(force = false, background = false) {
      if (!active()) {
        if (force && !closed && !disposed) resumeForce = true;
        return Promise.resolve(state);
      }
      if (pending) {
        if (force) queuedForce = true;
        return pending.promise;
      }
      if (timer !== null) clearTimeout(timer);
      timer = null;
      const run = {
        generation,
        force,
        controller:
          typeof AbortController === "function" ? new AbortController() : null,
        promise: null,
      };
      const current = () =>
        pending === run && generation === run.generation && active();
      run.promise = Promise.resolve()
        .then(async () => {
          if (!current()) return;
          let value = await read(
            force || background ? urlFor(force, background) : route,
            run.controller?.signal,
          );
          if (!current()) return;
          let accepted;
          if (background && metadataMatches(value))
            accepted = { ...latest, cache: value.cache };
          else {
            if (background) value = await read(route, run.controller?.signal);
            if (!current()) return;
            accepted = validate(value);
            if (!accepted.ok && latest?.ok)
              throw Error(accepted.error || "后台刷新失败");
            const bytes = JSON.stringify(accepted.report);
            if (latest && reportBytes === bytes)
              accepted = {
                ...accepted,
                report: latest.report,
                baseline: latest.report.baseline ?? accepted.baseline,
              };
            reportBytes = bytes;
          }
          if (!current()) return;
          latest = accepted;
          state = { phase: "done", data: accepted, error: null };
          notify();
        })
        .catch((error) => {
          if (!current()) return;
          const message = String(error?.message || error);
          state = latest?.ok
            ? {
                phase: "done",
                data: {
                  ...latest,
                  cache: {
                    ...latest.cache,
                    hit: true,
                    stale: true,
                    refreshing: false,
                    refreshError: message,
                  },
                },
                error: message,
              }
            : { phase: "error", data: null, error: message };
          notify();
        })
        .then(() => {
          if (pending !== run) return state;
          pending = null;
          if (queuedForce && active()) {
            queuedForce = false;
            return load(true, false);
          }
          schedule();
          return state;
        });
      pending = run;
      return run.promise;
    }
    const activate = () => {
      if (!active()) {
        pause();
        return;
      }
      if (!pending && timer === null) {
        const force = resumeForce;
        resumeForce = false;
        void load(force, !force && Boolean(latest));
      }
    };
    const entry = {
      snapshot: () => state,
      refresh: (force = true) => load(force, false),
      subscribe(listener, { visible: enabled = true } = {}) {
        if (closed || disposed) throw Error("Report subscription disposed");
        const sub = { listener, visible: enabled };
        subscriptions.add(sub);
        attach();
        if (enabled) listener(state);
        activate();
        return {
          setVisible(next) {
            if (!subscriptions.has(sub) || sub.visible === next) return;
            sub.visible = next;
            if (next) listener(state);
            activate();
          },
          unsubscribe() {
            if (!subscriptions.delete(sub)) return;
            if (!subscriptions.size) {
              closed = true;
              pause();
              entries.delete(route);
              if (!entries.size) detach();
            } else activate();
          },
        };
      },
      visibilityChanged: activate,
      dispose() {
        closed = true;
        pause();
        subscriptions.clear();
      },
    };
    entries.set(route, entry);
    return entry;
  }
  return {
    target,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) entry.dispose();
      entries.clear();
      detach();
    },
  };
}
