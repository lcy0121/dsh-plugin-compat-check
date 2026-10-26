#!/usr/bin/env node
/** Keep host/browser presentation artifacts byte-reproducible from pure sources. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildClient } from "./build-client.mjs";
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(plugin);
const outputs = [];
for (const item of [
  {
    source: "contracts",
    host: "report-contract",
    label: "REPORT CONTRACT",
    global: "ReportContract",
    exports: "assertEnvelope: assertEnvelope, catalogLines: catalogLines",
  },
  {
    source: "upgrade-contract",
    host: "upgrade-contract",
    label: "UPGRADE CONTRACT",
    global: "UpgradeContract",
    exports:
      "assertUpgradePreview: assertUpgradePreview, SUPPORTED_PREVIEW_VERSIONS: SUPPORTED_PREVIEW_VERSIONS",
  },
  {
    source: "finding-guidance",
    host: "finding-guidance",
    label: "FINDING GUIDANCE",
    global: "FindingGuidance",
    exports: "nextSteps: nextSteps",
  },
]) {
  const sourcePath = `lib/${item.source}.mjs`;
  const source = fs.readFileSync(path.join(root, sourcePath), "utf8");
  if (/^import\s/m.test(source))
    throw new Error(
      "Browser presentation source must not import dependencies: " + sourcePath,
    );
  outputs.push([
    path.join(plugin, `lib/${item.host}.js`),
    `// Generated from ${sourcePath}; run node plugin/scripts/stage-contract.mjs\n` +
      source,
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
