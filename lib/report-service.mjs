/** Single flight per canonical target; keep valid reports while inputs refresh. */
export class ReportService {
  constructor(
    compute,
    { ttlMs = 300000, clock = Date.now, identity = null, watchMs = 5000 } = {},
  ) {
    this.compute = compute;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.identity = identity;
    this.watchMs = watchMs;
    this.states = new Map();
    this.disposed = false;
  }
  state(key) {
    if (!this.states.has(key))
      this.states.set(key, {
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
    return this.states.get(key);
  }
  invalidate(key, reason = "报告输入已变化，等待刷新") {
    if (this.disposed) return;
    const state = this.state(key);
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
        for (const state of this.states.values()) {
          try {
            await this.observe(state);
            if (!this.disposed && state.stale)
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
    if (!this.identity || this.disposed) return;
    if (state.checking) return state.checking;
    state.checking = Promise.resolve()
      .then(() => this.identity(state.options))
      .then((identity) => {
        if (this.disposed) return;
        if (state.identity !== undefined && state.identity !== identity) {
          state.generation++;
          state.stale = true;
          state.reason = "报告输入已变化，等待刷新";
          state.error = null;
        }
        state.identity = identity;
      })
      .catch((error) => {
        if (!this.disposed) {
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
    if (!this.identity || state.watching || this.disposed) return;
    state.watching = true;
    const schedule = () => {
      if (this.disposed) return;
      state.timer = setTimeout(async () => {
        state.timer = null;
        try {
          await this.observe(state);
          if (
            !this.disposed &&
            (state.stale || this.clock() - state.at > this.ttlMs)
          )
            void this.start(state, state.options);
        } catch {
          /* Expose observation errors and retry at the next bounded tick. */
        }
        schedule();
      }, this.watchMs);
      state.timer.unref?.();
    };
    schedule();
  }
  start(state, options) {
    if (this.disposed)
      return Promise.resolve({
        ok: false,
        error: "Plugin generation disposed / 已卸载",
      });
    if (state.inflight) return state.inflight;
    state.options = options;
    let generation;
    state.inflight = Promise.resolve()
      .then(async () => {
        if (this.identity) await this.observe(state);
        generation = state.generation;
        let commit;
        const guard = {
          commit: (fn) => {
            commit = fn;
          },
          isCurrent: async () => {
            if (this.disposed || generation !== state.generation) return false;
            // A watchdog observation may have sampled before computation
            // finished. Drain it, then start a fresh check for this commit.
            if (state.checking) await state.checking;
            if (this.disposed || generation !== state.generation) return false;
            await this.observe(state);
            return !this.disposed && generation === state.generation;
          },
        };
        const out = await this.compute(options, guard);
        if (!(await guard.isCurrent()))
          return {
            ok: false,
            invalidated: true,
            error: "报告输入已变化，正在重新检查",
          };
        if (out?.ok === true) {
          commit?.();
          state.report = out;
          state.at = this.clock();
          state.error = null;
          state.stale = false;
          state.reason = null;
        } else {
          state.error = out?.error || "体检未产生有效报告";
          state.stale = true;
        }
        return out;
      })
      .catch((error) => {
        if (!this.disposed) {
          state.error = error.message;
          state.stale = true;
        }
        return { ok: false, error: error.message };
      })
      .finally(() => {
        state.inflight = null;
        if (
          !this.disposed &&
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
    const state = this.state(key);
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
        if (!out?.invalidated || this.disposed) return out;
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
  dispose() {
    this.disposed = true;
    for (const state of this.states.values()) {
      clearTimeout(state.timer);
      state.timer = null;
      state.generation++;
    }
  }
}
