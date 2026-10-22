import fs from "node:fs";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";
import { captureUpgradeInputOwned } from "./upgrade-input.mjs";

try {
  const { nm, limits, root } = workerData;
  const selected = path.resolve(nm);
  const installed =
    path.basename(selected) !== "node_modules" &&
    fs.existsSync(path.join(selected, "node_modules"))
      ? path.join(selected, "node_modules")
      : selected;
  parentPort.postMessage({
    ok: true,
    value: captureUpgradeInputOwned(installed, limits, root),
  });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
