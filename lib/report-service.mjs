import { bounded } from "./async-boundary.mjs";
/** Single flight per canonical target; keep valid reports while inputs refresh. */
export class ReportService {
  constructor(
    compute,
    {
      ttlMs = 300000,
      clock = Date.now,
      identity = null,
      watchMs = 5000,
      maxTargets = 16,
      idleMs = 600000,
      onEvict = null,
      timeoutMs = 45000,
      identityTimeoutMs = 12000,
    } = {},
  ) {
    if (
      !Number.isSafeInteger(maxTargets) ||
      maxTargets < 1 ||
      maxTargets > 16 ||
      !Number.isSafeInteger(idleMs) ||
      idleMs < 1 ||
      idleMs > 600000
    )
      throw new Error("Invalid cache budget");
    for (const [budget, cap] of [
      [timeoutMs, 45000],
      [identityTimeoutMs, 12000],
    ])
      if (!Number.isSafeInteger(budget) || budget < 1 || budget > cap)
        throw new Error("Invalid report deadline");
    this.timeoutMs = timeoutMs;
    this.identityTimeoutMs = identityTimeoutMs;
    this.maxTargets = maxTargets;
    this.idleMs = idleMs;
    this.onEvict = onEvict;
    this.compute = compute;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.identity = identity;
    this.watchMs = watchMs;
    this.states = new Map();
    this.requestOrder = 0;
    this.disposed = false;
  }
  alive(state) {
    return !this.disposed && !state.retired;
  }
  evict(key) {
    const state = this.states.get(key);
    if (!state) return;
    state.retired = true;
    state.generation++;
    clearTimeout(state.timer);
    state.timer = null;
    state.controller.abort();
    this.states.delete(key);
    state.report = null;
    state.options = {};
    state.identity = undefined;
    state.publishedIdentity = undefined;
    this.onEvict?.(key);
  }
  prune() {
    for (const [key, state] of this.states)
      if (this.clock() - state.lastUsed >= this.idleMs) this.evict(key);
  }
  state(key) {
    if (this.disposed) return undefined;
    if (!this.states.has(key)) {
      this.prune();
      if (this.states.size >= this.maxTargets) {
        const oldest = [...this.states].sort(
          (a, b) => a[1].lastRequest - b[1].lastRequest,
        )[0][0];
        this.evict(oldest);
      }
      this.states.set(key, {
        key,
        lastUsed: this.clock(),
        lastRequest: ++this.requestOrder,
        retired: false,
        controller: new AbortController(),
        report: null,
        at: 0,
        inflight: null,
        error: null,
        generation: 0,
        stale: false,
        identity: undefined,
        checking: null,
        options: {},
        timer: null,
      });
    }
    return this.states.get(key);
  }
  invalidate(key, reason = "报告输入已变化，等待刷新") {
    if (this.disposed) return;
    const state = this.states.get(key);
    if (!state) return;
    state.generation++;
    state.stale = true;
    state.reason = reason;
    state.error = null;
    if (!state.inflight) void this.start(state, state.options);
  }
  notify() {
    if (this.disposed || this.notifying) return;
    this.notifying = Promise.resolve()
      .then(async () => {
        for (const state of [...this.states.values()]) {
          try {
            await this.observe(state);
            if (this.alive(state) && state.stale)
              void this.start(state, state.options);
          } catch {
            /* Keep the valid report and let the watchdog retry. */
          }
        }
      })
      .finally(() => {
        this.notifying = null;
      });
  }
  async observe(state) {
    if (!this.identity || !this.alive(state)) return;
    if (state.checking) return state.checking;
    state.checking = bounded(
      (signal) => this.identity(state.options, { signal }),
      {
        timeoutMs: this.identityTimeoutMs,
        signal: state.controller.signal,
        label: "报告输入检查",
      },
    )
      .then((identity) => {
        if (!this.alive(state)) return;
        if (state.identity !== undefined && state.identity !== identity) {
          state.generation++;
          state.stale = true;
          state.reason = "报告输入已变化，等待刷新";
          state.error = null;
        }
        state.identity = identity;
      })
      .catch((error) => {
        if (this.alive(state)) {
          state.generation++;
          state.stale = true;
          state.error = error.message;
        }
        throw error;
      })
      .finally(() => {
        state.checking = null;
      });
    return state.checking;
  }
  watch(state) {
    if (state.watching || !this.alive(state)) return;
    state.watching = true;
    const schedule = () => {
      if (!this.alive(state)) return;
      state.timer = setTimeout(
        async () => {
          state.timer = null;
          if (this.clock() - state.lastUsed >= this.idleMs) {
            this.evict(state.key);
            return;
          }
          try {
            await this.observe(state);
            if (
              this.alive(state) &&
              (state.stale || this.clock() - state.at > this.ttlMs)
            )
              void this.start(state, state.options);
          } catch {
            /* Expose observation errors and retry at the next bounded tick. */
          }
          schedule();
        },
        Math.min(this.watchMs, this.idleMs),
      );
      state.timer.unref?.();
    };
    schedule();
  }
  start(state, options) {
    if (!this.alive(state))
      return Promise.resolve({
        ok: false,
        error: "Plugin generation disposed / 已卸载",
      });
    if (state.inflight) return state.inflight;
    state.options = options;
    let generation;
    state.inflight = Promise.resolve()
      .then(() =>
        bounded(
          async (signal) => {
            if (!this.alive(state))
              return { ok: false, error: "缓存目标已回收" };
            if (this.identity) await this.observe(state);
            if (!this.alive(state))
              return { ok: false, error: "缓存目标已回收" };
            if (signal?.aborted) return { ok: false, error: "报告计算已取消" };
            generation = state.generation;
            let commit;
            const guard = {
              signal,
              commit: (fn) => {
                commit = fn;
              },
              isCurrent: async () => {
                if (
                  signal?.aborted ||
                  !this.alive(state) ||
                  generation !== state.generation
                )
                  return false;
                // A watchdog observation may have sampled before computation
                // finished. Drain it, then start a fresh check for this commit.
                if (state.checking) await state.checking;
                if (
                  signal?.aborted ||
                  !this.alive(state) ||
                  generation !== state.generation
                )
                  return false;
                await this.observe(state);
                return (
                  !signal?.aborted &&
                  this.alive(state) &&
                  generation === state.generation
                );
              },
            };
            const out = await this.compute(options, guard);
            if (
              !(await guard.isCurrent()) ||
              signal?.aborted ||
              !this.alive(state) ||
              generation !== state.generation
            )
              return {
                ok: false,
                invalidated: true,
                error: "报告输入已变化，正在重新检查",
              };
            if (out?.ok === true) {
              commit?.();
              state.report = out;
              state.publishedIdentity = state.identity;
              state.at = this.clock();
              state.error = null;
              state.stale = false;
              state.reason = null;
            } else {
              state.error = out?.error || "体检未产生有效报告";
              state.stale = true;
            }
            return out;
          },
          {
            timeoutMs: this.timeoutMs,
            signal: state.controller.signal,
            label: "兼容性报告计算",
          },
        ),
      )
      .catch((error) => {
        if (this.alive(state)) {
          state.error = error.message;
          state.stale = true;
        }
        return { ok: false, error: error.message };
      })
      .finally(() => {
        state.inflight = null;
        if (
          this.alive(state) &&
          generation !== undefined &&
          generation !== state.generation &&
          !state.error
        )
          void this.start(state, state.options);
      });
    return state.inflight;
  }
  async get(key, options = {}, force = false) {
    if (this.disposed)
      return { ok: false, error: "Plugin generation disposed / 已卸载" };
    this.prune();
    const state = this.state(key);
    state.lastUsed = this.clock();
    state.lastRequest = ++this.requestOrder;
    state.options = options;
    this.watch(state);
    const age = this.clock() - state.at;
    if (force || !state.report) {
      // A force request can join a background flight which was superseded
      // while extracting. Wait for the replacement generation, with a bound
      // for continuously changing inputs rather than publishing old success.
      let out;
      for (let attempt = 0; attempt < 3; attempt++) {
        out = await this.start(state, options);
        if (!out?.invalidated || !this.alive(state)) return out;
      }
      return { ok: false, error: "报告输入持续变化，请稍后重试" };
    }
    if ((state.stale && !state.error) || age > this.ttlMs)
      void this.start(state, options);
    return {
      ...state.report,
      cache: {
        hit: true,
        ageMs: age,
        refreshing: !!state.inflight,
        stale: state.stale,
        refreshError: state.error,
        reason: state.reason || null,
      },
    };
  }
  ownsReport(report) {
    return (
      !this.disposed &&
      !!report &&
      [...this.states.values()].some((state) => state.report?.report === report)
    );
  }
  /** The immutable identity observed for this published report, including retained stale reports. */
  identityForReport(key, report) {
    const state = this.states.get(key);
    return state?.report?.report === report
      ? state.publishedIdentity
      : undefined;
  }
  /** Validate a sidecar edit against the published report without recomputing or advancing its baseline. */
  async isCurrent(key, report) {
    const state = this.states.get(key);
    const matches = () =>
      state &&
      this.alive(state) &&
      !state.stale &&
      !state.error &&
      state.report?.report === report;
    if (!matches()) return false;
    const generation = state.generation;
    if (state.checking) await state.checking;
    if (!matches() || generation !== state.generation) return false;
    await this.observe(state);
    return matches() && generation === state.generation;
  }
  dispose() {
    this.disposed = true;
    for (const key of this.states.keys()) this.evict(key);
  }
}
