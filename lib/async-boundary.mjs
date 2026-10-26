/** Bound an asynchronous wait even when a dependency ignores cancellation. */
export function bounded(
  task,
  {
    timeoutMs,
    signal,
    label = "操作",
    setTimeout: later = globalThis.setTimeout,
    clearTimeout: cancel = globalThis.clearTimeout,
  } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
    throw new Error("Invalid asynchronous deadline");
  return new Promise((resolve, reject) => {
    const controller =
      typeof AbortController === "function" ? new AbortController() : null;
    let settled = false,
      timer;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      cancel(timer);
      signal?.removeEventListener("abort", abort);
      if (ok) resolve(value);
      else {
        let error;
        try {
          error =
            value instanceof Error
              ? value
              : new Error(`${label}失败：${String(value)}`);
        } catch {
          error = new Error(`${label}失败：错误信息不可读取`);
        }
        reject(error);
        controller?.abort(error);
      }
    };
    const abort = () =>
      finish(
        false,
        Object.assign(new Error(`${label}已取消`), { name: "AbortError" }),
      );
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    timer = later(
      () =>
        finish(
          false,
          Object.assign(new Error(`${label}超时，请重试`), {
            name: "TimeoutError",
          }),
        ),
      timeoutMs,
    );
    try {
      Promise.resolve(task(controller?.signal)).then(
        (v) => finish(true, v),
        (e) => finish(false, e),
      );
    } catch (error) {
      finish(false, error);
    }
  });
}
