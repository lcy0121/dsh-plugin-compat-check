/** Single flight per target; retain the last valid report on failed refresh. */
export class ReportService {
  constructor(compute, { ttlMs = 300000, clock = Date.now } = {}) {
    this.compute = compute;
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.states = new Map();
  }
  state(key) {
    if (!this.states.has(key))
      this.states.set(key, {
        report: null,
        at: 0,
        inflight: null,
        error: null,
      });
    return this.states.get(key);
  }
  start(state, options) {
    if (state.inflight) return state.inflight;
    state.inflight = Promise.resolve()
      .then(() => this.compute(options))
      .then((out) => {
        if (out?.ok === true) {
          state.report = out;
          state.at = this.clock();
          state.error = null;
        } else state.error = out?.error || "体检未产生有效报告";
        return out;
      })
      .catch((error) => {
        state.error = error.message;
        return { ok: false, error: state.error };
      })
      .finally(() => {
        state.inflight = null;
      });
    return state.inflight;
  }
  async get(key, options = {}, force = false) {
    const state = this.state(key),
      age = this.clock() - state.at;
    if (force || !state.report) return this.start(state, options);
    if (age > this.ttlMs) this.start(state, options);
    return {
      ...state.report,
      cache: {
        hit: true,
        ageMs: age,
        refreshing: !!state.inflight,
        refreshError: state.error,
      },
    };
  }
}
