// Shared by all ordinary analysis/identity jobs imported by this kernel instance.
const MAX_WORKERS = 2,
  MAX_PENDING = 32;
let activeWorkers = 0;
const pendingWorkers = [];
const workerError = (code, message) =>
  Object.assign(new Error(message), { code });
export function runReportWorkerTask(url, data, options = {}) {
  const { signal, timeoutMs = 10000 } = options;
  if (
    signal &&
    (typeof signal.aborted !== "boolean" ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function")
  )
    return Promise.reject(new Error("Invalid worker signal"));
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    return Promise.reject(new Error("Invalid worker resource budget / 预算"));
  if (signal?.aborted)
    return Promise.reject(workerError("DSC_WORKER_ABORTED", "静态分析已取消"));
  if (activeWorkers >= MAX_WORKERS && pendingWorkers.length >= MAX_PENDING)
    return Promise.reject(
      workerError("DSC_WORKER_CAPACITY", "工作线程排队容量已满，请稍后重试"),
    );
  return new Promise((resolve, reject) => {
    let queued = false,
      timer;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
    };
    const remove = () => {
      if (!queued) return false;
      queued = false;
      pendingWorkers.splice(pendingWorkers.indexOf(start), 1);
      cleanup();
      return true;
    };
    const cancel = () => {
      if (remove())
        reject(workerError("DSC_WORKER_ABORTED", "静态分析排队已取消"));
    };
    const start = () => {
      queued = false;
      cleanup();
      activeWorkers++;
      runWorkerTask(url, data, options)
        .then(resolve, reject)
        .finally(() => {
          activeWorkers--;
          pendingWorkers.shift()?.();
        });
    };
    if (activeWorkers < MAX_WORKERS) start();
    else {
      queued = true;
      pendingWorkers.push(start);
      signal?.addEventListener("abort", cancel, { once: true });
      timer = setTimeout(() => {
        if (remove())
          reject(workerError("DSC_WORKER_TIMEOUT", "静态分析排队超过时间预算"));
      }, timeoutMs);
      if (signal?.aborted) cancel();
    }
  });
}
import { Worker } from "node:worker_threads";

/** Supervise trusted jobs; settle only after reclaiming their worker thread. */
export function runWorkerTask(
  url,
  data,
  { timeoutMs = 10000, resourceLimits = {}, signal } = {},
) {
  return new Promise((resolve, reject) => {
    const limits = {
      maxOldGenerationSizeMb: 512,
      maxYoungGenerationSizeMb: 64,
      ...resourceLimits,
    };
    if (
      (signal !== undefined &&
        (!signal ||
          typeof signal.aborted !== "boolean" ||
          typeof signal.addEventListener !== "function" ||
          typeof signal.removeEventListener !== "function")) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs <= 0 ||
      timeoutMs > 2147483647 ||
      Object.entries(limits).some(
        ([key, value]) =>
          !["maxOldGenerationSizeMb", "maxYoungGenerationSizeMb"].includes(
            key,
          ) ||
          !Number.isInteger(value) ||
          value < 4 ||
          value > (key === "maxOldGenerationSizeMb" ? 512 : 64),
      )
    )
      return reject(new Error("Invalid worker resource budget / 预算"));
    const aborted = () => {
      const error = new Error("静态分析已取消，已终止工作线程");
      error.code = "DSC_WORKER_ABORTED";
      return error;
    };
    if (signal?.aborted) return reject(aborted());
    let worker;
    try {
      worker = new Worker(url, {
        workerData: data,
        execArgv: [],
        resourceLimits: limits,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let finishing = false;
    const finish = async (error, value) => {
      if (finishing) return;
      finishing = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      try {
        await worker.terminate();
      } catch (cleanupError) {
        error ||= cleanupError;
      }
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      const error = new Error("静态分析超过时间预算，已终止工作线程");
      error.code = "DSC_WORKER_TIMEOUT";
      void finish(error);
    }, timeoutMs);
    const onAbort = () => void finish(aborted());
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    worker.once("message", (message) => {
      if (
        !message ||
        typeof message.ok !== "boolean" ||
        (message.ok && !Object.hasOwn(message, "value")) ||
        (!message.ok && typeof message.error !== "string")
      )
        return void finish(new Error("Worker protocol / 协议无效"));
      void finish(message.ok ? null : new Error(message.error), message.value);
    });
    worker.once("error", (error) => void finish(error));
    worker.once("exit", (code) => {
      if (!finishing)
        void finish(new Error(`分析线程未返回结果（exit ${code}）`));
    });
  });
}

export function extractInWorker(
  nm,
  options = {},
  timeoutMs = 10000,
  { signal } = {},
) {
  return runReportWorkerTask(
    new URL("./extract-worker.mjs", import.meta.url),
    { nm, options },
    { timeoutMs, signal },
  );
}

export function computeHostReportInWorker(
  data,
  { signal, timeoutMs = 10000, limits } = {},
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
    return Promise.reject(
      new Error("Invalid host analysis resource budget / 预算"),
    );
  return runReportWorkerTask(
    new URL("./host-report-worker.mjs", import.meta.url),
    { ...data, limits },
    { signal, timeoutMs },
  );
}
