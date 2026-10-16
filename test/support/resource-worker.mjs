// Trusted stress jobs only; inspected plugin source is never executed.
import { parentPort, workerData, threadId } from "node:worker_threads";
const counter = workerData.counter ? new Int32Array(workerData.counter) : null;
if (workerData.action === "exit") process.exit(0);
if (workerData.action === "error") throw new Error("controlled worker failure");
if (workerData.action === "memory") {
  const retained = [];
  for (;;)
    retained.push(
      Array.from({ length: 20000 }, (_, i) => ({
        i,
        text: "bounded-pressure-" + i,
      })),
    );
}
if (workerData.action === "result")
  parentPort.postMessage({ ok: true, value: { threadId, answer: 42 } });
if (workerData.action === "malformed")
  parentPort.postMessage({ ok: "yes", value: 42 });
for (;;) if (counter) Atomics.add(counter, 0, 1);
