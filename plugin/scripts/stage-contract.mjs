#!/usr/bin/env node
/** Keep host/browser contract artifacts byte-reproducible from one pure module. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(plugin);
const source = fs.readFileSync(path.join(root, "lib/contracts.mjs"), "utf8");
if (/^import\s/m.test(source))
  throw new Error("Browser contract source must not import Node dependencies");
const start = "    // BEGIN GENERATED REPORT CONTRACT",
  end = "    // END GENERATED REPORT CONTRACT";
const client = path.join(plugin, "lib/client.js"),
  old = fs.readFileSync(client, "utf8");
const block =
  start +
  "\n    var ReportContract = (function () {\n" +
  source.replace(/^export /gm, "") +
  "\nreturn { assertEnvelope: assertEnvelope };\n    })();\n" +
  end;
const a = old.indexOf(start),
  b = old.indexOf(end);
let next;
if (a >= 0 && b > a) next = old.slice(0, a) + block + old.slice(b + end.length);
else {
  const marker = '    var React = require("react");';
  if (!old.includes(marker)) throw new Error("Missing client injection marker");
  next = old.replace(marker, block + "\n\n" + marker);
}
const host = path.join(plugin, "lib/report-contract.js"),
  header =
    "// Generated from lib/contracts.mjs; run node plugin/scripts/stage-contract.mjs\n";
for (const [file, value] of [
  [client, next],
  [host, header + source],
]) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === value) continue;
  if (process.argv.includes("--check"))
    throw new Error(
      "Stale generated report contract: " + path.relative(root, file),
    );
  fs.writeFileSync(file, value);
}
