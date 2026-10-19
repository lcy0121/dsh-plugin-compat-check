#!/usr/bin/env node
import fs from "node:fs";
import { scoreBusiness, businessExitCode } from "./business-metrics.mjs";
const usage =
  "用法: node tools/business-labels.mjs [--live | --predictions <预测.json> --labels <业务标签.json>] [--suite market|sidebar|sidebar-ui|sidebar-ui-previous|sidebar-model] [--model-profile <显式来源profile>] [--out-dir <空证据目录>] [--json]";
try {
  const opts = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (["--live", "--json", "--help"].includes(a)) opts[a.slice(2)] = true;
    else if (
      [
        "--predictions",
        "--labels",
        "--out-dir",
        "--suite",
        "--model-profile",
      ].includes(a)
    ) {
      const v = process.argv[++i];
      if (!v || v.startsWith("--")) throw Error("Missing argument: " + a);
      opts[a.slice(2)] = v;
    } else throw Error("Unknown argument: " + a);
  }
  if (opts.help) console.log(usage);
  else {
    if (
      (opts.live && (opts.predictions || opts.labels)) ||
      (!opts.live && (!opts.predictions || !opts.labels)) ||
      (!opts.live && (opts["out-dir"] || opts.suite || opts["model-profile"]))
    )
      throw Error(usage);
    if (
      opts.suite &&
      ![
        "market",
        "sidebar",
        "sidebar-ui",
        "sidebar-ui-previous",
        "sidebar-model",
      ].includes(opts.suite)
    )
      throw Error("Unknown business suite: " + opts.suite);
    if (Boolean(opts["model-profile"]) !== (opts.suite === "sidebar-model"))
      throw Error("--model-profile is required only for sidebar-model");
    const result = opts.live
      ? await (
          await import("./business-live.mjs")
        ).runBusiness({
          outDir: opts["out-dir"],
          suite: opts.suite,
          modelProfile: opts["model-profile"],
        })
      : scoreBusiness(
          JSON.parse(fs.readFileSync(opts.predictions, "utf8")),
          JSON.parse(fs.readFileSync(opts.labels, "utf8")),
        );
    console.log(
      opts.json
        ? JSON.stringify(result, null, 2)
        : JSON.stringify(
            {
              metrics: result.metrics,
              scope: result.scope,
              reason: result.reason,
            },
            null,
            2,
          ),
    );
    process.exitCode =
      result.applicable === false ? 0 : businessExitCode(result);
  }
} catch (error) {
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      kind: "plugin-compat-check/business-error",
      error: error.message,
    }),
  );
  process.exitCode = 3;
}
