import { Worker } from "node:worker_threads";
export function extractInWorker(nm, options = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./extract-worker.mjs", import.meta.url),
      {
        workerData: { nm, options },
        execArgv: [],
        resourceLimits: {
          maxOldGenerationSizeMb: 512,
          maxYoungGenerationSizeMb: 64,
        },
      },
    );
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(
      () => finish(new Error("静态分析超过时间预算，已终止工作线程")),
      timeoutMs,
    );
    worker.once("message", (m) =>
      finish(m.ok ? null : new Error(m.error), m.value),
    );
    worker.once("error", (error) => finish(error));
    worker.once("exit", (code) => {
      if (!settled) finish(new Error(`分析线程未返回结果（exit ${code}）`));
    });
  });
}
