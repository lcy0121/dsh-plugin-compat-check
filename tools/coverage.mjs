#!/usr/bin/env node
/** AST rule inventory. Historical regex artifact lists never filter current calls. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../bin/compat-check.mjs";
import { methodRule } from "../lib/verdict.mjs";
import { digest } from "../lib/state-store.mjs";
import semver from "semver";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function args(argv) {
  const out = {};
  const values = {
    "--nm": "nm",
    "--probe": "probe",
    "--dsh-version": "version",
    "--out": "out",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (values[a]) {
      const value = argv[++i];
      if (!value || value.startsWith("--"))
        throw new Error(`${a} needs a value`);
      out[values[a]] = value;
    } else if (a === "--json") out.json = true;
    else if (a === "--write") out.write = true;
    else if (a === "--allow-partial") out.allowPartial = true;
    else throw new Error("Unknown argument: " + a);
  }
  return out;
}
export function measure(nm, options = {}) {
  const surface = options.probe
    ? JSON.parse(fs.readFileSync(options.probe, "utf8"))
    : null;
  const result = run({
    nm,
    baseline: false,
    dshVersion: options.version || surface?.dshVersion || null,
    _hostSurface: surface,
    _ignoreAutoProbe: true,
  });
  if (result.error) throw new Error(result.error);
  if (
    surface &&
    (!result.verdict.observation.bound || !result.verdict.observation.usable)
  )
    throw new Error(
      "Coverage probe must be modern, bound to this profile/version and fresh",
    );
  const rules = JSON.parse(
    fs.readFileSync(path.join(REPO, "rules/severity.json"), "utf8"),
  );
  const pairs = new Map(),
    services = new Set();
  for (const p of Object.values(result.extract.report.perPlugin))
    for (const site of p.callSites || []) {
      const side = site.sides?.length === 1 ? site.sides[0] : "shared";
      const key = `${side}:${site.service}.${site.method}`;
      services.add(site.service);
      if (!pairs.has(key))
        pairs.set(key, {
          side,
          service: site.service,
          method: site.method,
          covered: !!methodRule(rules, site.service, site.method, side),
        });
    }
  const entries = [...pairs.values()],
    usedPairs = [...pairs.keys()].sort();
  const diagnostics = [
    ...(result.extract.report.diagnostics || []),
    ...Object.entries(result.extract.report.perPlugin).flatMap(([plugin, p]) =>
      (p.diagnostics || []).map((d) => ({ plugin, ...d })),
    ),
  ];
  const findings = Object.values(result.verdict.plugins).flatMap(
      (p) => p.findings || [],
    ),
    defaults = findings.filter((f) => f.ruleSource === "default");
  const profileId = result.inputs.nodeModules;
  return {
    schemaVersion: 2,
    capturedAt: new Date().toISOString(),
    _dshVersion: result.verdict.dshVersion,
    profile: {
      name: path.basename(path.dirname(profileId)),
      profileIdDigest: digest(profileId),
    },
    sourceDigest: digest({
      manifests: result.extract.report.manifests,
      callSites: result.extract.report.callSites,
      provenance: result.extract.provenance,
      diagnostics,
    }),
    sourceDigestBasis:
      "normalized AST analysis, not a hash of every package byte",
    rulesDigest: digest(rules),
    scanComplete: result.extract.report.scanComplete,
    diagnostics,
    observation: result.verdict.observation,
    manifests: result.extract.report.manifests.length,
    usedServices: services.size,
    usedServicesRaw: services.size,
    pairs: entries.length,
    pairsRaw: entries.length,
    usedPairs,
    artifactServicesExcluded: [],
    artifactPairsExcluded: 0,
    servicesInTable: Object.keys(rules.services).length,
    coveredServices: [...services].filter((s) =>
      entries.some((p) => p.service === s && p.covered),
    ).length,
    coveredPairs: entries.filter((p) => p.covered).length,
    perLayer: Object.fromEntries(
      ["host", "client", "shared"].map((side) => [
        side,
        {
          pairs: entries.filter((p) => p.side === side).length,
          covered: entries.filter((p) => p.side === side && p.covered).length,
        },
      ]),
    ),
    engineFindings: findings.length,
    engineRuleHit: findings.filter((f) => f.ruleSource === "rule").length,
    engineUnknownImpact: defaults.length,
    engineCategoryFindings: findings.filter((f) => !f.ruleSource).length,
    uncoveredServices: [...services]
      .filter((s) => !entries.some((p) => p.service === s && p.covered))
      .sort(),
    perPlugin: Object.fromEntries(
      Object.entries(result.extract.report.perPlugin).map(([name, p]) => [
        name,
        {
          version: p.version,
          usedServices: Object.keys(p.calls || {}).length,
          pairs: Object.values(p.calls || {}).reduce(
            (n, ms) => n + ms.length,
            0,
          ),
          scanComplete: !(p.diagnostics || []).length,
        },
      ]),
    ),
  };
}
function main() {
  let options;
  try {
    options = args(process.argv.slice(2));
    const nm =
      options.nm ||
      path.join(
        process.env.DSH_HOME || path.join(os.homedir(), ".dsh"),
        "profiles/desktop/node_modules",
      );
    const measured = measure(nm, options);
    if (options.write) {
      if (!measured._dshVersion || !semver.valid(measured._dshVersion))
        throw new Error(
          "Writing an inventory requires a valid explicit or observed DSH semver version",
        );
      if (!measured.scanComplete && !options.allowPartial)
        throw new Error(
          "Incomplete source scan; use --allow-partial only after reviewing diagnostics",
        );
      const output = {
        ...measured,
        _capturedAt: measured.capturedAt,
        _generatedBy: "tools/coverage.mjs",
        _note:
          "Versioned AST sample, not ecosystem accuracy. Counts include uncertain calls; partial scans are explicitly labeled. Historical regex artifact lists are not automatic filters.",
        _knownGaps: measured.scanComplete
          ? []
          : [
              "Partial source scan: inspect diagnostics; these counts are lower bounds, not complete coverage.",
            ],
      };
      fs.writeFileSync(
        options.out || path.join(REPO, "rules/usage-inventory.json"),
        JSON.stringify(output, null, 2) + "\n",
      );
    }
    if (options.json) console.log(JSON.stringify(measured, null, 2));
    else
      console.log(
        `AST规则库存 DSH=${measured._dshVersion || "未知"} ${measured.scanComplete ? "扫描完整" : "扫描不完整"}\n插件${measured.manifests}，服务${measured.usedServices}，分端方法对${measured.pairs}，有对应规则${measured.coveredPairs}\n规则命中${measured.engineRuleHit}，默认影响${measured.engineUnknownImpact}，类别发现${measured.engineCategoryFindings}\n观测${measured.observation.mode}；仅描述本次输入，不是生态准确率。`,
      );
  } catch (error) {
    if (options?.json || process.argv.includes("--json"))
      console.log(JSON.stringify({ error: error.message }));
    else console.error(error.message);
    process.exitCode = 3;
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
