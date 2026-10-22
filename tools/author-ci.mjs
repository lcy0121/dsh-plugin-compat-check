#!/usr/bin/env node
/** Repository-only finite offline author CI. stdout is exactly one chosen format. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runWorkerTask } from "../lib/worker-analysis.mjs";
import { CATALOG_REFERENCES } from "../lib/contracts.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";
import { readRegular } from "./static-sample.mjs";
import {
  DEFAULT_POLICY,
  validatePolicy,
  evaluateMatrix,
} from "../lib/author-ci-policy.mjs";
import { renderSarif, renderJUnit } from "../lib/author-ci-output.mjs";
export const AUTHOR_CI_LIMITS = Object.freeze({
  versions: 4,
  timeoutMs: 30000,
  previousBytes: 8 * 1024 * 1024,
  policyBytes: 65536,
});
export async function authorCI(args) {
  let policy = DEFAULT_POLICY,
    workDir;
  try {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      const k = args[i];
      if (
        ![
          "--package",
          "--versions",
          "--policy",
          "--previous",
          "--format",
        ].includes(k) ||
        opts[k] !== undefined ||
        !args[i + 1] ||
        args[i + 1].startsWith("--")
      )
        throw Error("Unknown, missing or duplicate option: " + k);
      opts[k] = args[++i];
    }
    if (!opts["--package"])
      throw Error("Required: --package <built-package-directory>");
    if (!["json", "sarif", "junit"].includes(opts["--format"] || "json"))
      throw Error("Unknown output format");
    const versions = opts["--versions"]
      ? opts["--versions"].split(",")
      : CATALOG_REFERENCES.map((c) => c.version);
    if (
      !versions.length ||
      versions.length > AUTHOR_CI_LIMITS.versions ||
      new Set(versions).size !== versions.length ||
      versions.some(
        (v) =>
          typeof v !== "string" ||
          v.length > 80 ||
          !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(v),
      )
    )
      throw Error("Expected 1..4 distinct exact DSH versions");
    if (opts["--policy"]) {
      policy = JSON.parse(
        readRegular(
          path.resolve(opts["--policy"]),
          AUTHOR_CI_LIMITS.policyBytes,
        ),
      );
      validatePolicy(policy);
    }
    const previous = opts["--previous"]
      ? JSON.parse(
          readRegular(
            path.resolve(opts["--previous"]),
            AUTHOR_CI_LIMITS.previousBytes,
          ),
        )
      : null;
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-author-ci-"));
    fs.chmodSync(workDir, 0o700);
    const value = await runWorkerTask(
      new URL("./author-ci-worker.mjs", import.meta.url),
      {
        source: (() => {
          const source = path.resolve(opts["--package"]);
          if (!fs.lstatSync(source).isDirectory())
            throw Error("Selected source must be a regular directory");
          return fs.realpathSync(source);
        })(),
        workDir,
        versions,
      },
      { timeoutMs: AUTHOR_CI_LIMITS.timeoutMs },
    );
    const gate = evaluateMatrix(value.cells, policy, previous);
    return {
      schemaVersion: 1,
      kind: "plugin-compat-check/author-ci",
      toolVersion: TOOL_VERSION,
      identity: value.identity,
      policy,
      cells: value.cells,
      gate,
      limitations: [
        "Offline static evidence for one selected built package; no install, network, plugin execution, runtime probe, profile grant or baseline writes.",
        "Certified exact catalogue comparisons only; matrix pass means selected CI policy satisfied, not business compatibility.",
        "Package SHA-256 identifies the bounded source-tree snapshot, not an npm tarball. Review output before publishing.",
      ],
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      kind: "plugin-compat-check/author-ci",
      toolVersion: TOOL_VERSION,
      identity: null,
      policy,
      cells: [],
      gate: {
        status: "error",
        exitCode: 3,
        counts: {},
        reasons: [
          {
            code: "tool-error",
            message: String(error.message)
              .replace(/(?:\/[A-Za-z0-9._-]+){2,}/g, "[local-path]")
              .slice(0, 512),
          },
        ],
      },
      limitations: [
        "No successful compatibility result; tool/input/identity errors never pass the CI gate.",
      ],
    };
  } finally {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  }
}
export function renderAuthorCI(matrix, format = "json") {
  return format === "sarif"
    ? JSON.stringify(renderSarif(matrix), null, 2)
    : format === "junit"
      ? renderJUnit(matrix)
      : JSON.stringify(matrix, null, 2);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    index = args.indexOf("--format"),
    format = index >= 0 ? args[index + 1] : "json";
  const result = await authorCI(args);
  process.stdout.write(renderAuthorCI(result, format) + "\n");
  process.exitCode = result.gate.exitCode;
}
