#!/usr/bin/env node
/** Keep host/browser presentation artifacts byte-reproducible from pure sources. */
import fs from "node:fs";
import { format, resolveConfig } from "prettier";
import path from "node:path";
import { fileURLToPath } from "node:url";
const plugin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  root = path.dirname(plugin);
const client = path.join(plugin, "lib/client.js");
let next = fs.readFileSync(client, "utf8");
const outputs = [];
for (const item of [
  {
    source: "dependency-graph",
    host: "dependency-graph",
    label: "DEPENDENCY GRAPH",
    global: "DependencyGraphContract",
    exports:
      "buildDependencyGraph:buildDependencyGraph, validateDependencyGraph:validateDependencyGraph",
  },
  {
    source: "finding-review",
    host: "finding-review",
    label: "FINDING REVIEW",
    global: "FindingReviewContract",
    exports:
      "REVIEW_STATUS_LABELS:REVIEW_STATUS_LABELS, REVIEW_LIMITS:REVIEW_LIMITS, validateReviewInput:validateReviewInput, validateReviewEnvelope:validateReviewEnvelope",
  },
  {
    source: "functional-health-contract",
    host: "functional-health-contract",
    label: "FUNCTIONAL HEALTH CONTRACT",
    global: "FunctionalHealthContract",
    exports:
      "validateFunctionalHealthResult:validateFunctionalHealthResult, canonicalFunctionalManifest:canonicalFunctionalManifest",
  },
  {
    source: "workflow-panels",
    host: "workflow-panels",
    label: "WORKFLOW PANELS",
    global: "WorkflowPanelFactory",
    exports:
      "createDependencyPanel:createDependencyPanel, createFindingReviewPanel:createFindingReviewPanel, createFunctionalHealthPanel:createFunctionalHealthPanel",
  },
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
  const start = `    // BEGIN GENERATED ${item.label}`;
  const end = `    // END GENERATED ${item.label}`;
  const block =
    start +
    `\n    var ${item.global} = (function () {\n` +
    source.replace(/^export /gm, "") +
    `\nreturn { ${item.exports} };\n    })();\n` +
    end;
  const a = next.indexOf(start),
    b = next.indexOf(end);
  if (a >= 0 && b > a)
    next = next.slice(0, a) + block + next.slice(b + end.length);
  else {
    const marker = '    var React = require("react");';
    if (!next.includes(marker))
      throw new Error("Missing client injection marker");
    next = next.replace(marker, block + "\n\n" + marker);
  }
  outputs.push([
    path.join(plugin, `lib/${item.host}.js`),
    `// Generated from ${sourcePath}; run node plugin/scripts/stage-contract.mjs\n` +
      source,
  ]);
}
// Format the complete generated artifact at its canonical generation boundary.
// A formatted client must remain byte-identical on every subsequent check.
next = await format(next, {
  ...(await resolveConfig(client)),
  filepath: client,
});
outputs.unshift([client, next]);
for (const [file, value] of outputs) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === value) continue;
  if (process.argv.includes("--check"))
    throw new Error(
      "Stale generated report contract: " + path.relative(root, file),
    );
  fs.writeFileSync(file, value);
}
