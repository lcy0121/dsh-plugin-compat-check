#!/usr/bin/env node
/** Keep host/browser presentation artifacts byte-reproducible from pure sources. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient } from "./build-client.mjs";
import { SHARED_HOST, stagedContractSource } from "./shared-contracts.mjs";
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(plugin);
const outputs = [];
for (const [file, host] of Object.entries(SHARED_HOST)) {
  const source = fs.readFileSync(path.join(root, "lib", file), "utf8");
  outputs.push([
    path.join(plugin, "lib", host),
    stagedContractSource(file, source),
  ]);
}
// These views/validators are bundled directly from root sources. Shipping a
// second host copy served no import, so reject stale leftovers in check mode.
for (const name of [
  "dependency-graph",
  "finding-review",
  "functional-health-contract",
  "workflow-panels",
]) {
  const file = path.join(plugin, "lib", `${name}.js`);
  if (!fs.existsSync(file)) continue;
  if (process.argv.includes("--check"))
    throw Error("Unused generated host artifact: " + file);
  fs.rmSync(file);
}
for (const [file, value] of outputs) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === value) continue;
  if (process.argv.includes("--check"))
    throw new Error(
      "Stale generated report contract: " + path.relative(root, file),
    );
  fs.writeFileSync(file, value);
}

await buildClient({ check: process.argv.includes("--check") });
