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
import {
  renderSarif,
  renderJUnit,
  renderHTML,
} from "../lib/author-ci-output.mjs";
import {
  AUTHOR_CI_LIMITS,
  ciJSON,
  checkCIOutput,
} from "../lib/author-ci-budget.mjs";
export { AUTHOR_CI_LIMITS };
const ready = (matrix) => {
  for (const format of ["json", "html", "sarif", "junit"])
    renderAuthorCI(matrix, format);
  return matrix;
};
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
          "--report",
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
    if (opts["--report"]) {
      if (
        opts["--format"] !== "html" ||
        Object.keys(opts).some((k) => !["--report", "--format"].includes(k))
      )
        throw Error(
          "--report requires --format html and cannot be combined with scan options",
        );
      const saved = JSON.parse(
        readRegular(
          path.resolve(opts["--report"]),
          AUTHOR_CI_LIMITS.previousBytes,
        ),
      );
      validateSavedReport(saved);
      return ready(saved);
    }
    if (!opts["--package"])
      throw Error("Required: --package <built-package-directory>");
    if (
      !["json", "sarif", "junit", "html"].includes(opts["--format"] || "json")
    )
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
      const candidate = JSON.parse(
        readRegular(
          path.resolve(opts["--policy"]),
          AUTHOR_CI_LIMITS.policyBytes,
        ),
      );
      validatePolicy(candidate);
      policy = candidate;
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
    return ready({
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
    });
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
// Structural validation is not authentication and does not re-run or rewrite a saved gate.
function validateSavedReport(m) {
  const record = (v) =>
    v !== null && typeof v === "object" && !Array.isArray(v);
  const need = (ok) => {
    if (!ok) throw Error("Invalid saved author CI evidence");
  };
  need(
    record(m) &&
      m.schemaVersion === 1 &&
      m.kind === "plugin-compat-check/author-ci" &&
      typeof m.toolVersion === "string",
  );
  validatePolicy(m.policy);
  need(Array.isArray(m.cells) && m.cells.length <= AUTHOR_CI_LIMITS.versions);
  need(
    record(m.gate) &&
      [0, 1, 2, 3].includes(m.gate.exitCode) &&
      m.gate.status ===
        (m.gate.exitCode === 0
          ? "pass"
          : m.gate.exitCode === 3
            ? "error"
            : "blocked"),
  );
  need(
    Array.isArray(m.gate.reasons) &&
      m.gate.reasons.every(
        (r) =>
          record(r) &&
          typeof r.code === "string" &&
          typeof r.message === "string",
      ),
  );
  need(
    record(m.gate.counts) &&
      Object.values(m.gate.counts).every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ),
  );
  need(
    Array.isArray(m.limitations) &&
      m.limitations.every((s) => typeof s === "string"),
  );
  if (!m.cells.length) {
    need(
      m.identity === null && m.gate.exitCode === 3 && m.gate.reasons.length > 0,
    );
    return;
  }
  const checked = evaluateMatrix(m.cells, { ...m.policy, mode: "all" });
  need(!checked.reasons.some((r) => r.code === "invalid-evidence"));
  const first = m.cells[0].identity;
  need(
    record(m.identity) &&
      record(first) &&
      m.identity.rulesSha256 === first.rulesSha256 &&
      ["name", "version", "sha256"].every(
        (k) => m.identity.package?.[k] === first.package?.[k],
      ),
  );
  need(
    m.cells.every((c) => {
      const i = c.identity;
      return (
        record(i) &&
        record(i.package) &&
        typeof i.package.name === "string" &&
        typeof i.package.version === "string" &&
        /^[a-f0-9]{64}$/.test(i.package.sha256 || "") &&
        /^[a-f0-9]{64}$/.test(i.rulesSha256 || "") &&
        i.toolVersion === m.toolVersion &&
        ["name", "version", "sha256"].every(
          (k) => i.package[k] === m.identity.package?.[k],
        ) &&
        i.rulesSha256 === m.identity.rulesSha256 &&
        (c.status === "analyzed" || c.kernelExitCode === 3)
      );
    }),
  );
  // Even a stored relaxed/new gate cannot claim a pass over unknown versions/tool errors.
  need(checked.exitCode !== 3 || m.gate.exitCode === 3);
}
export function renderAuthorCI(matrix, format = "json") {
  const json = ciJSON(matrix);
  return checkCIOutput(
    format === "html"
      ? renderHTML(matrix)
      : format === "sarif"
        ? JSON.stringify(renderSarif(matrix), null, 2)
        : format === "junit"
          ? renderJUnit(matrix)
          : json,
  );
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
