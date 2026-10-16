#!/usr/bin/env node
import { exitCodeForSummary } from "../lib/contracts.mjs";
import { installAndProbe } from "../lib/probe-runner.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { run } from "./compat-check.mjs";
import { toJSON, render } from "../lib/report.mjs";

const args = process.argv.slice(2);
const spec = args.shift();
let json = false,
  keep = false,
  timeoutSec = 30;
try {
  if (!spec || spec.startsWith("-")) throw new Error("需要一个安装规格");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--json") json = true;
    else if (args[i] === "--keep") keep = true;
    else if (args[i] === "--timeout") {
      timeoutSec = Number(args[++i]);
      if (!Number.isFinite(timeoutSec) || timeoutSec <= 0)
        throw new Error("--timeout 需要正数");
    } else throw new Error("未知参数: " + args[i]);
  }
  const servicesFor = (nm) => extractWithProvenance(nm).report;
  servicesFor.finish = (observed) =>
    run({
      nm: observed.nm,
      baseline: false,
      _hostSurface: observed.surface,
      dshVersion: observed.dshVersion,
      _ignoreAutoProbe: true,
    });
  const result = await installAndProbe(spec, { timeoutSec, keep, servicesFor });
  if (result.status === "observed") {
    const output = result.report;
    if (json)
      process.stdout.write(
        JSON.stringify({
          ...toJSON(output),
          status: output.error ? "tool-error" : "checked",
          cleanup: result.cleanup,
        }) + "\n",
      );
    else process.stdout.write(render(output, {}) + "\n");
    const s = output.verdict?.summary;
    process.exitCode = output.error ? 3 : exitCodeForSummary(s);
  } else {
    if (json) process.stdout.write(JSON.stringify(result) + "\n");
    else process.stderr.write(result.status + ": " + result.error + "\n");
    process.exitCode = result.exitCode;
  }
} catch (error) {
  process.stdout.write(
    JSON.stringify({ status: "tool-error", error: error.message }) + "\n",
  );
  process.exitCode = 3;
}
