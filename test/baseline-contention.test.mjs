import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { baselineIdentity, baselineTransaction } from "../lib/state-store.mjs";
import { snapshotForBaseline } from "../lib/baseline.mjs";
import { validateBaseline } from "../lib/contracts.mjs";
const script = new URL("./support/baseline-writer.mjs", import.meta.url);
const deadline = async (promise) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Owned writer deadline exceeded")),
          10000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
const nextMessage = (child) =>
  deadline(
    new Promise((resolve, reject) => {
      const cleanup = () => {
        child.off("message", message);
        child.off("error", error);
        child.off("exit", exit);
      };
      const message = (value) => {
        cleanup();
        resolve(value);
      };
      const error = (value) => {
        cleanup();
        reject(value);
      };
      const exit = (code) =>
        error(new Error("Writer exited before its response: " + code));
      child.once("message", message);
      child.once("error", error);
      child.once("exit", exit);
    }),
  );
const record = (name, metrics) => {
  if (process.env.DSC_ENGINEERING_LOG)
    fs.appendFileSync(
      process.env.DSC_ENGINEERING_LOG,
      JSON.stringify({ name, ...metrics }) + "\n",
    );
};

test(
  "independent processes contend without partial JSON, orphan locks or lost ownership",
  { timeout: 30000 },
  async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-contention-")),
      file = path.join(dir, "baseline.json"),
      children = [];
    const snapshot = (marker) => ({
      ...snapshotForBaseline(
        { plugins: {} },
        "0.2.0",
        baselineIdentity(dir, "catalogue", {}, {}),
      ),
      marker,
      payload: String(marker).repeat(65536),
    });
    baselineTransaction(file, snapshot(0));
    const observed = [];
    let reads = 0;
    const reader = setInterval(() => {
      try {
        const s = JSON.parse(fs.readFileSync(file, "utf8"));
        assert.deepEqual(validateBaseline(s), []);
        assert.equal(s.payload, String(s.marker).repeat(65536));
        reads++;
      } catch (e) {
        observed.push(e.message);
      }
    }, 2);
    const start = performance.now();
    try {
      const ready = [];
      for (let i = 0; i < 8; i++) {
        const child = fork(script, [], {
          execArgv: [],
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        });
        children.push(child);
        ready.push(nextMessage(child));
      }
      await Promise.all(ready);
      const outcomes = children.map((child) =>
        nextMessage(child).then((m) => m.outcomes),
      );
      children.forEach((child, i) =>
        child.send({ file, snapshot: snapshot(i + 1), count: 24 }),
      );
      const results = (await Promise.all(outcomes)).flat();
      await deadline(
        Promise.all(
          children.map((c) =>
            c.exitCode === null ? once(c, "exit") : Promise.resolve(),
          ),
        ),
      );
      assert.equal(results.length, 192);
      assert.ok(results.some((r) => r.wrote));
      assert.ok(
        results.every((r) => r.wrote || /另一个进程/.test(r.writeError)),
      );
      assert.deepEqual(observed, []);
      assert.ok(reads > 0);
      assert.equal(fs.existsSync(file + ".lock"), false);
      assert.equal(
        fs.readdirSync(dir).some((n) => n.endsWith(".tmp")),
        false,
      );
      const final = JSON.parse(fs.readFileSync(file));
      assert.ok(final.marker >= 1 && final.marker <= 8);
      assert.deepEqual(validateBaseline(final), []);
      record("baseline-contention", {
        processes: 8,
        attempts: 192,
        writes: results.filter((r) => r.wrote).length,
        busy: results.filter((r) => !r.wrote).length,
        atomicReads: reads,
        milliseconds: performance.now() - start,
        orphanLocks: 0,
      });
    } finally {
      clearInterval(reader);
      for (const child of children) {
        if (child.exitCode === null) {
          child.kill("SIGKILL");
          await deadline(once(child, "exit"));
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
