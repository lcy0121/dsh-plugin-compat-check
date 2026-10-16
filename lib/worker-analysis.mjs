import { Worker } from "node:worker_threads";

/** Supervise trusted jobs; settle only after reclaiming their worker thread. */
export function runWorkerTask(
  url,
  data,
  { timeoutMs = 10000, resourceLimits = {} } = {},
) {
  return new Promise((resolve, reject) => {
    const limits = {
      maxOldGenerationSizeMb: 512,
      maxYoungGenerationSizeMb: 64,
      ...resourceLimits,
    };
    if (
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

export function extractInWorker(nm, options = {}, timeoutMs = 10000) {
  return runWorkerTask(
    new URL("./extract-worker.mjs", import.meta.url),
    { nm, options },
    { timeoutMs },
  );
}
