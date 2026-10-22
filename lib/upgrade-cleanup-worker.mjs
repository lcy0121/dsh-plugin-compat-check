import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

try {
  const { root, identity } = workerData;
  const observed = fs.lstatSync(root);
  if (
    !observed.isDirectory() ||
    observed.dev !== identity.dev ||
    observed.ino !== identity.ino
  )
    throw new Error("私有输入目录身份变化");
  // Never follow copied links. This worker only receives a parent-owned root,
  // never a path selected by the preview caller or sent back by capture.
  const writable = (dir) => {
    if (!fs.lstatSync(dir).isDirectory())
      throw new Error("私有输入目录身份变化");
    fs.chmodSync(dir, 0o700);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }))
      if (entry.isDirectory()) writable(path.join(dir, entry.name));
  };
  writable(root);
  fs.rmSync(root, { recursive: true, force: true });
  parentPort.postMessage({ ok: true, value: null });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
