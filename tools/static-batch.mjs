#!/usr/bin/env node
/** Finite, offline, source-only queue. Same verdict kernel; separate batch envelope. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import semver from "semver";
import { TOOL_VERSION } from "../lib/version.mjs";
import { catalogPathFor } from "../lib/catalog.mjs";
import { exitCodeForSummary } from "../lib/contracts.mjs";
import { runWorkerTask } from "../lib/worker-analysis.mjs";
import { readRegular, sha256, SAMPLE_LIMITS } from "./static-sample.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKER = new URL("./static-batch-worker.mjs", import.meta.url);
const KIND = "plugin-compat-check/batch-result";
const REVIEW = "pending-author-review";
export const BATCH_LIMITS = Object.freeze({
  samples: 16,
  manifestBytes: 65536,
  previousBytes: 2 * 1024 * 1024,
  reportBytes: 96 * 1024,
  sampleTimeoutMs: 10000,
  batchTimeoutMs: 60000,
  workerOldGenerationMb: 512,
  workerYoungGenerationMb: 64,
  ...SAMPLE_LIMITS,
});
const POLICY = Object.freeze({
  version: 1,
  mode: "static-independent-package",
  executesTargetCode: false,
  runtimeObserved: false,
  baseline: false,
  cache: false,
});
const LIMITATIONS = [
  "待作者复核：固定样本静态风险提示，不是业务兼容认证或生态准确率。",
  "样本独立分析，不观测宿主、客户端业务、其它包的服务提供者或目标 profile 豁免。",
  "coverage、vacuous、弃权和扫描不完整必须连同结论阅读；无发现或无变化不证明功能可用。",
  "只输出包名、包内位置及必要分析说明；任意业务文本仍可能敏感，分享前预览。",
];
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const hash = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const exactVersion = (v) => typeof v === "string" && semver.valid(v) === v;
const sampleId = (v) =>
  typeof v === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(v);
const packageName = (v) =>
  typeof v === "string" &&
  v.length <= 214 &&
  /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(v) &&
  !v.startsWith("@deepseek-ai/");
const samplePath = (v) =>
  typeof v === "string" &&
  v.length <= 512 &&
  /^(?:[a-zA-Z0-9_@.-]+\/)*[a-zA-Z0-9_@.-]+$/.test(v) &&
  v.split("/").every((p) => p !== "." && p !== "..");
const same = isDeepStrictEqual;
const sampleIdentity = (x) => [x.name, x.version, x.sha256];
const errorRow = (sample, errorCode) => ({
  id: sample.id,
  name: sample.name,
  version: sample.version,
  sha256: sample.sha256,
  reviewStatus: REVIEW,
  status: "error",
  hashVerified: false,
  report: null,
  exitCode: 3,
  errorCode,
});
const summaryOf = (samples) => {
  const s = {
    samples: samples.length,
    analyzed: 0,
    errors: 0,
    ok: 0,
    partial: 0,
    broken: 0,
    unknown: 0,
    limited: 0,
    vacuousOk: 0,
  };
  for (const row of samples) {
    if (row.status === "error") {
      s.errors++;
      continue;
    }
    s.analyzed++;
    s[row.report.verdict]++;
    if (row.report.coverage.status === "limited") s.limited++;
    if (row.report.verdict === "ok" && row.report.vacuous) s.vacuousOk++;
  }
  return s;
};
function analysisDigest() {
  const files = fs
    .readdirSync(path.join(ROOT, "lib"))
    .filter((f) => f.endsWith(".mjs"))
    .map((f) => `lib/${f}`);
  files.push(
    "tools/static-batch.mjs",
    "tools/static-batch-worker.mjs",
    "tools/static-sample.mjs",
    "package.json",
    "package-lock.json",
  );
  return sha256(
    JSON.stringify(
      files
        .sort()
        .map((f) => [
          f,
          sha256(readRegular(path.join(ROOT, f), 2 * 1024 * 1024)),
        ]),
    ),
  );
}
function failure(errorCode) {
  return {
    schemaVersion: 1,
    kind: KIND,
    toolVersion: TOOL_VERSION,
    ok: false,
    exitCode: 3,
    errorCode,
    reviewStatus: REVIEW,
    policy: POLICY,
    limits: BATCH_LIMITS,
    limitations: LIMITATIONS,
    summary: summaryOf([]),
    samples: [],
  };
}
function readManifest(file) {
  const bytes = readRegular(file, BATCH_LIMITS.manifestBytes);
  const m = JSON.parse(bytes);
  if (
    !object(m) ||
    m.schemaVersion !== 1 ||
    m.kind !== "plugin-compat-check/batch-manifest" ||
    !exactVersion(m.dshVersion) ||
    !Array.isArray(m.samples) ||
    m.samples.length < 1 ||
    m.samples.length > BATCH_LIMITS.samples
  )
    throw new Error("invalid-manifest");
  const ids = new Set();
  for (const row of m.samples) {
    if (
      !object(row) ||
      !sampleId(row.id) ||
      ids.has(row.id) ||
      !samplePath(row.path) ||
      !packageName(row.name) ||
      !exactVersion(row.version) ||
      !hash(row.sha256)
    )
      throw new Error("invalid-manifest");
    ids.add(row.id);
  }
  return {
    manifest: m,
    manifestSha256: sha256(bytes),
    base: fs.realpathSync(path.dirname(path.resolve(file))),
  };
}

/** Untrusted local previous files must be structurally and arithmetically coherent. */
function readPrevious(file) {
  const p = JSON.parse(readRegular(file, BATCH_LIMITS.previousBytes));
  if (
    !object(p) ||
    p.schemaVersion !== 1 ||
    p.kind !== KIND ||
    !object(p.identity) ||
    !exactVersion(p.identity.toolVersion) ||
    p.toolVersion !== p.identity.toolVersion ||
    !exactVersion(p.identity.dshVersion) ||
    !exactVersion(p.identity.nodeVersion) ||
    !object(p.identity.dependencyVersions) ||
    !same(Object.keys(p.identity.dependencyVersions).sort(), [
      "@babel/parser",
      "semver",
      "yaml",
    ]) ||
    !Object.values(p.identity.dependencyVersions).every(exactVersion) ||
    !hash(p.identity.rulesSha256) ||
    !hash(p.identity.catalogSha256) ||
    !hash(p.identity.analysisSha256) ||
    !hash(p.manifestSha256) ||
    !same(p.policy, POLICY) ||
    !object(p.limits) ||
    !budget(p.limits.sampleTimeoutMs, BATCH_LIMITS.sampleTimeoutMs) ||
    !budget(p.limits.batchTimeoutMs, BATCH_LIMITS.batchTimeoutMs) ||
    !same(p.limits, {
      ...BATCH_LIMITS,
      sampleTimeoutMs: p.limits.sampleTimeoutMs,
      batchTimeoutMs: p.limits.batchTimeoutMs,
    }) ||
    p.reviewStatus !== REVIEW ||
    !Array.isArray(p.samples) ||
    p.samples.length < 1 ||
    p.samples.length > BATCH_LIMITS.samples
  )
    throw new Error("invalid-previous");
  const ids = new Set();
  for (const row of p.samples) {
    if (
      !object(row) ||
      !sampleId(row.id) ||
      ids.has(row.id) ||
      !packageName(row.name) ||
      !exactVersion(row.version) ||
      !hash(row.sha256) ||
      row.reviewStatus !== REVIEW
    )
      throw new Error("invalid-previous");
    ids.add(row.id);
    if (row.status === "error") {
      if (
        row.exitCode !== 3 ||
        row.report !== null ||
        row.hashVerified !== false ||
        typeof row.errorCode !== "string"
      )
        throw new Error("invalid-previous");
    } else {
      const r = row.report;
      if (
        row.status !== "analyzed" ||
        row.hashVerified !== true ||
        !object(r) ||
        !["ok", "partial", "broken", "unknown"].includes(r.verdict) ||
        typeof r.vacuous !== "boolean" ||
        !object(r.coverage) ||
        !["limited", "complete"].includes(r.coverage.status) ||
        !Number.isSafeInteger(r.coverage.verifiedCalls) ||
        r.coverage.verifiedCalls < 0 ||
        !Array.isArray(r.coverage.limitations) ||
        !r.coverage.limitations.every((x) => typeof x === "string") ||
        !Array.isArray(r.findings) ||
        !Array.isArray(r.dispositions) ||
        !Array.isArray(r.diagnostics) ||
        typeof r.scanComplete !== "boolean" ||
        !same(r.observation, {
          profileId: null,
          dshVersion: null,
          probedAt: null,
          notes: [],
          bound: false,
          usable: false,
          mode: "catalogue",
        })
      )
        throw new Error("invalid-previous");
      if (
        r.findings.some(
          (f) =>
            !object(f) ||
            typeof f.category !== "string" ||
            !["fatal", "feature-dead", "degraded"].includes(f.severity) ||
            !["certain", "suspected"].includes(f.certainty) ||
            f.impactBasis !== "inferred",
        )
      )
        throw new Error("invalid-previous");
      const verdict = r.findings.some((f) => f.severity === "fatal")
        ? "broken"
        : r.findings.length
          ? "partial"
          : "ok";
      const summary = {
        broken: r.verdict === "broken" ? 1 : 0,
        partial: r.verdict === "partial" ? 1 : 0,
        unknown: r.verdict === "unknown" ? 1 : 0,
      };
      if (
        (r.verdict !== "unknown" && r.verdict !== verdict) ||
        row.exitCode !== exitCodeForSummary(summary)
      )
        throw new Error("invalid-previous");
    }
  }
  const summary = summaryOf(p.samples);
  if (
    !same(p.summary, summary) ||
    p.ok !== (summary.errors === 0) ||
    p.exitCode !== (summary.errors ? 3 : exitCodeForSummary(summary))
  )
    throw new Error("invalid-previous");
  return p;
}
function compare(previous, current) {
  const old = new Map(previous.samples.map((row) => [row.id, row]));
  const comparable =
    same(previous.identity, current.identity) &&
    same(previous.policy, current.policy) &&
    same(previous.limits, current.limits);
  const rows = current.samples.map((row) => {
    const before = old.get(row.id);
    old.delete(row.id);
    const status = !before
      ? "added"
      : !comparable || !same(sampleIdentity(before), sampleIdentity(row))
        ? "incomparable"
        : same(
              [before.status, before.errorCode, before.report],
              [row.status, row.errorCode, row.report],
            )
          ? "unchanged"
          : "changed";
    return { id: row.id, status };
  });
  for (const id of old.keys()) rows.push({ id, status: "removed" });
  return {
    comparable,
    note: "仅比较固定身份报告；每次重新扫描，无变化不代表业务通过，旧文件不是可信真值或签名。",
    samples: rows,
  };
}
function budget(value, maximum) {
  return Number.isInteger(value) && value >= 1 && value <= maximum;
}

export async function runBatch(file, options = {}) {
  const sampleTimeoutMs =
    options.sampleTimeoutMs ?? BATCH_LIMITS.sampleTimeoutMs;
  const batchTimeoutMs = options.batchTimeoutMs ?? BATCH_LIMITS.batchTimeoutMs;
  if (
    !budget(sampleTimeoutMs, BATCH_LIMITS.sampleTimeoutMs) ||
    !budget(batchTimeoutMs, BATCH_LIMITS.batchTimeoutMs)
  )
    return failure("invalid-arguments");
  let input,
    previous,
    catalogBytes,
    rulesBytes,
    catalog,
    rules,
    analysisSha256,
    dependencyVersions;
  try {
    input = readManifest(file);
  } catch {
    return failure("invalid-manifest");
  }
  if (options.previousFile) {
    try {
      previous = readPrevious(options.previousFile);
    } catch {
      return failure("invalid-previous");
    }
  }
  try {
    catalogBytes = readRegular(
      catalogPathFor(ROOT, input.manifest.dshVersion),
      2 * 1024 * 1024,
    );
    rulesBytes = readRegular(
      path.join(ROOT, "rules/severity.json"),
      2 * 1024 * 1024,
    );
    catalog = JSON.parse(catalogBytes);
    rules = JSON.parse(rulesBytes);
    analysisSha256 = analysisDigest();
    dependencyVersions = Object.fromEntries(
      ["@babel/parser", "semver", "yaml"].map((name) => {
        const meta = JSON.parse(
          readRegular(
            path.join(ROOT, "node_modules", name, "package.json"),
            65536,
          ),
        );
        if (!exactVersion(meta.version))
          throw new Error("invalid-analysis-input");
        return [name, meta.version];
      }),
    );
  } catch {
    return failure("invalid-analysis-input");
  }
  const identity = {
    toolVersion: TOOL_VERSION,
    dshVersion: input.manifest.dshVersion,
    nodeVersion: process.versions.node,
    dependencyVersions,
    analysisSha256,
    rulesSha256: sha256(rulesBytes),
    catalogSha256: sha256(catalogBytes),
  };
  const samples = [],
    start = performance.now();
  for (const sample of input.manifest.samples) {
    let workDir, row;
    const remaining = Math.floor(batchTimeoutMs - (performance.now() - start));
    if (remaining <= 0) {
      samples.push(errorRow(sample, "batch-budget-exhausted"));
      continue;
    }
    try {
      workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-static-"));
      fs.chmodSync(workDir, 0o700);
      const result = await runWorkerTask(
        WORKER,
        {
          source: path.join(input.base, sample.path),
          workDir,
          sample,
          catalog,
          rules,
          dshVersion: input.manifest.dshVersion,
        },
        { timeoutMs: Math.min(remaining, sampleTimeoutMs) },
      );
      row = result.errorCode
        ? errorRow(sample, result.errorCode)
        : {
            id: sample.id,
            name: sample.name,
            version: sample.version,
            sha256: sample.sha256,
            reviewStatus: REVIEW,
            status: "analyzed",
            ...result,
          };
    } catch (error) {
      row = errorRow(
        sample,
        error.code === "DSC_WORKER_TIMEOUT"
          ? "sample-timeout"
          : "analysis-failed",
      );
    } finally {
      if (workDir) {
        try {
          fs.rmSync(workDir, { recursive: true, force: true });
        } catch {
          row = errorRow(sample, "cleanup-failed");
        }
      }
    }
    samples.push(row);
  }
  const summary = summaryOf(samples);
  const result = {
    schemaVersion: 1,
    kind: KIND,
    toolVersion: TOOL_VERSION,
    identity,
    manifestSha256: input.manifestSha256,
    ok: summary.errors === 0,
    exitCode: summary.errors ? 3 : exitCodeForSummary(summary),
    reviewStatus: REVIEW,
    policy: POLICY,
    limits: { ...BATCH_LIMITS, sampleTimeoutMs, batchTimeoutMs },
    limitations: LIMITATIONS,
    summary,
    samples,
  };
  if (previous) result.delta = compare(previous, result);
  return result;
}

const USAGE = `用法：node tools/static-batch.mjs --manifest <固定哈希清单.json> [--previous <上次聚合.json>]
      node tools/static-batch.mjs --hash <本地包目录>
只读静态分析，不安装或执行目标；所有结论待作者复核。JSON写stdout，分享前预览。
队列最多16项；每项10秒、整批60秒、512+64MiB worker堆、4096目录项/32层/16MiB输入。
--sample-timeout-ms / --batch-timeout-ms 可降低对应上限。退出0/1/2为静态结论，3为输入/工具错误。
--hash仅提供待人工封存的文件树指纹，不自动更新清单；不得为消除失败盲目重锁。`;
async function main(argv) {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) {
    console.log(USAGE);
    return;
  }
  const values = {},
    keys = new Set([
      "--manifest",
      "--hash",
      "--previous",
      "--sample-timeout-ms",
      "--batch-timeout-ms",
    ]);
  let result;
  try {
    for (let i = 0; i < argv.length; i++) {
      const key = argv[i],
        value = argv[++i];
      if (
        !keys.has(key) ||
        Object.hasOwn(values, key) ||
        !value ||
        value.startsWith("--")
      )
        throw new Error();
      values[key] = value;
    }
    if (
      !values["--manifest"] === !values["--hash"] ||
      (values["--hash"] && Object.keys(values).length !== 1)
    )
      throw new Error();
    if (values["--hash"]) {
      let workDir;
      try {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-static-"));
        const source = path.resolve(values["--hash"]);
        const fingerprint = await runWorkerTask(
          WORKER,
          { source, workDir },
          { timeoutMs: BATCH_LIMITS.sampleTimeoutMs },
        );
        result = fingerprint.errorCode
          ? failure(fingerprint.errorCode)
          : {
              schemaVersion: 1,
              kind: "plugin-compat-check/sample-fingerprint",
              ...fingerprint,
              exitCode: 0,
            };
      } finally {
        if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
      }
    } else
      result = await runBatch(values["--manifest"], {
        previousFile: values["--previous"],
        ...(values["--sample-timeout-ms"]
          ? { sampleTimeoutMs: Number(values["--sample-timeout-ms"]) }
          : {}),
        ...(values["--batch-timeout-ms"]
          ? { batchTimeoutMs: Number(values["--batch-timeout-ms"]) }
          : {}),
      });
  } catch {
    result = failure("invalid-arguments");
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exitCode = result.exitCode;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main(process.argv.slice(2));
