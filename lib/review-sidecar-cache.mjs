/** Per-report manual-review derivation cache. Fingerprints never authorize a save. */
import { createHash } from "node:crypto";
import { bounded } from "./async-boundary.mjs";
export class ReviewSidecarCache {
  constructor({ store, maxEntries = 16, timeoutMs = 5000 } = {}) {
    if (
      !store ||
      !Number.isSafeInteger(maxEntries) ||
      maxEntries < 1 ||
      maxEntries > 16 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 5000
    )
      throw new Error("Invalid review cache budget");
    this.store = store;
    this.maxEntries = maxEntries;
    this.timeoutMs = timeoutMs;
    this.entries = new Map();
    this.disposed = false;
  }
  drop(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.retired = true;
    entry.controller.abort();
    entry.detach?.();
    this.entries.delete(key);
    entry.report = null;
    entry.context = null;
    entry.reviews = null;
  }
  dispose() {
    this.disposed = true;
    for (const key of this.entries.keys()) this.drop(key);
  }
  get(key, options) {
    if (this.disposed)
      return Promise.reject(new Error("Review cache disposed / 已卸载"));
    let entry = this.entries.get(key);
    if (
      entry &&
      (entry.report !== options.report ||
        entry.inputIdentity !== options.inputIdentity)
    ) {
      this.drop(key);
      entry = null;
    }
    if (!entry) {
      if (this.entries.size >= this.maxEntries)
        this.drop(this.entries.keys().next().value);
      entry = {
        report: options.report,
        inputIdentity: options.inputIdentity,
        controller: new AbortController(),
        retired: false,
        context: null,
        reviews: null,
        signature: null,
        pending: null,
      };
      const abort = () => entry.controller.abort();
      options.signal?.addEventListener("abort", abort, { once: true });
      entry.detach = () => options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) entry.controller.abort();
      this.entries.set(key, entry);
    } else {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    if (entry.pending) return entry.pending;
    const current = () =>
      !this.disposed &&
      !entry.retired &&
      !entry.controller.signal.aborted &&
      this.entries.get(key) === entry;
    entry.pending = bounded(
      async (signal) => {
        if (!entry.context) {
          const context = await this.store.reviewContext(options.report, {
            nodeModules: options.nodeModules,
            rulesIdentity: options.rulesIdentity,
            catalogIdentity: options.catalogIdentity,
            toolVersion: options.toolVersion,
            sourceIdentity: createHash("sha256")
              .update(options.inputIdentity)
              .digest("hex"),
          });
          if (!current() || signal.aborted)
            throw new Error("Review cache 已回收");
          entry.context = context;
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          const signature = await this.store.reviewFileIdentity(entry.context);
          if (!current() || signal.aborted)
            throw new Error("Review cache 已回收");
          if (entry.reviews && entry.signature === signature)
            return { context: entry.context, reviews: entry.reviews };
          const reviews = await this.store.readReviews(entry.context);
          const after = await this.store.reviewFileIdentity(entry.context);
          if (!current() || signal.aborted)
            throw new Error("Review cache 已回收");
          if (signature !== after) continue;
          if (reviews.error) {
            entry.signature = null;
            entry.reviews = null;
            return { context: entry.context, reviews };
          }
          entry.signature = after;
          entry.reviews = reviews;
          return { context: entry.context, reviews };
        }
        throw new Error("人工处置记录持续变化，请稍后重试");
      },
      {
        timeoutMs: this.timeoutMs,
        signal: entry.controller.signal,
        label: "人工处置记录读取",
      },
    ).finally(() => {
      entry.pending = null;
    });
    return entry.pending;
  }
}
