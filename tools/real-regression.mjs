#!/usr/bin/env node
/** Bounded, pinned real business regressions. Acceptance means known failures
 * reproduce honestly, not universal compatibility or ecosystem accuracy. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import { scoreBusiness } from "./business-metrics.mjs";
import { stopOwnedChild } from "../lib/owned-process.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repo, "tools/real-regression-manifest.json");
export const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const sha = (value) => crypto.createHash("sha256").update(value).digest("hex");
const jsonSha = (value) => sha(JSON.stringify(value));
const read = (dir, name) =>
  JSON.parse(
    boundedFile(
      path.join(dir, name),
      name === "regression-index.json"
        ? manifest.budgets.maxIndexBytes
        : manifest.budgets.maxJsonBytes,
    ).toString("utf8"),
  );
const stamp = (stat) => [
  stat.dev,
  stat.ino,
  stat.mode,
  stat.size,
  stat.mtimeMs,
  stat.ctimeMs,
];
function directory(dir) {
  const stat = fs.lstatSync(dir);
  check(
    stat.isDirectory() && !stat.isSymbolicLink(),
    "Evidence directory must be a regular directory, never a symlink",
  );
  return stat;
}
function boundedFile(file, maxBytes, expected) {
  const before = fs.lstatSync(file);
  check(
    before.isFile() && !before.isSymbolicLink(),
    "Evidence must contain regular files only, never symlinks",
  );
  check(
    before.size <= maxBytes,
    "Evidence file bytes exceed read budget: " + path.basename(file),
  );
  if (expected)
    equal(
      stamp(before),
      stamp(expected),
      "Evidence file changed after budget scan",
    );
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    equal(
      stamp(fs.fstatSync(fd)),
      stamp(before),
      "Evidence file identity changed before read",
    );
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      check(n > 0, "Evidence file truncated while reading");
      offset += n;
    }
    equal(
      stamp(fs.fstatSync(fd)),
      stamp(before),
      "Evidence file changed during read",
    );
    equal(
      stamp(fs.lstatSync(file)),
      stamp(before),
      "Evidence file path changed during read",
    );
    return bytes;
  } finally {
    fs.closeSync(fd);
  }
}
/** File/aggregate byte limits bound inputs and reads, not process RSS. Matching
 * metadata before/after detects common races; it is not an atomic FS snapshot. */
function evidenceReader(dir) {
  const before = directory(dir),
    files = new Map();
  let bytes = 0;
  const scan = fs.opendirSync(dir);
  try {
    for (let entry; (entry = scan.readSync()); ) {
      check(/^[\w.-]+$/.test(entry.name), "Invalid evidence filename");
      check(
        files.size < manifest.budgets.maxEvidenceFiles,
        "Evidence file-count budget exceeded",
      );
      const stat = fs.lstatSync(path.join(dir, entry.name));
      check(
        stat.isFile() && !stat.isSymbolicLink(),
        "Evidence must contain regular files only, never symlinks",
      );
      const maxBytes = entry.name.endsWith(".json")
        ? manifest.budgets.maxJsonBytes
        : manifest.budgets.maxFileBytes;
      check(
        stat.size <= maxBytes,
        "Evidence file bytes exceed read budget: " + entry.name,
      );
      bytes += stat.size;
      check(
        bytes <= manifest.budgets.maxCohortBytes,
        "Evidence cohort byte budget exceeded",
      );
      files.set(entry.name, stat);
    }
  } finally {
    scan.closeSync();
  }
  equal(
    stamp(directory(dir)),
    stamp(before),
    "Evidence directory changed during budget scan",
  );
  const load = (name) => {
    check(files.has(name), "Missing evidence file: " + name);
    equal(
      stamp(directory(dir)),
      stamp(before),
      "Evidence directory changed after budget scan",
    );
    return boundedFile(
      path.join(dir, name),
      name.endsWith(".json")
        ? manifest.budgets.maxJsonBytes
        : manifest.budgets.maxFileBytes,
      files.get(name),
    );
  };
  return {
    bytes: load,
    json: (name) => JSON.parse(load(name).toString("utf8")),
    inventory: () =>
      Object.fromEntries(
        [...files.keys()].sort().map((name) => [name, sha(load(name))]),
      ),
  };
}
const check = (value, message) => {
  if (!value) throw Error(message);
};
const equal = (a, b, message) => check(isDeepStrictEqual(a, b), message);
const identityKeys = [
  "sampleId",
  "suiteId",
  "artifactDigest",
  "dshVersion",
  "toolVersion",
];
function identity(a, b) {
  for (const key of identityKeys)
    check(a[key] === b[key], "Evidence identity mismatch: " + key);
}
function time(value) {
  const t = Date.parse(value);
  check(Number.isFinite(t), "Missing evidence time");
  return t;
}
function seal(prediction, saved) {
  check(
    saved?.sealedBeforeActions === true &&
      saved.businessLabelsUsed === false &&
      saved.loaderLabelsUsed === false,
    "Prediction seal prerequisites missing",
  );
  check(
    saved.sha256 === jsonSha(prediction),
    "Prediction sealed sha256 mismatch",
  );
}
/** Replay validates the saved driver contract; it cannot authenticate malicious
 * coordinated rewriting or reconstruct timestamps of each individual action. */
export function validateCohort(dir, suite) {
  const evidence = evidenceReader(dir),
    read = (_dir, name) => evidence.json(name);
  const pin = manifest.suites.find((row) => row.suite === suite);
  check(pin, "Unknown fixed regression suite");
  const predictions = read(dir, "predictions.json"),
    labels = read(dir, "labels.json"),
    measurement = read(dir, "measurement.json");
  const artifact = measurement.artifacts;
  check(
    artifact?.suite === suite &&
      artifact.package === pin.package &&
      artifact.version === pin.version,
    "Pinned artifact identity mismatch",
  );
  equal(
    artifact.packageFingerprint,
    { files: pin.files, digest: pin.digest },
    "Pinned artifact fingerprint mismatch",
  );
  for (const key of ["publishedTarballSha256", "publishedIntegrity"])
    check(artifact[key] === pin[key], "Pinned artifact " + key + " mismatch");
  check(
    artifact.catalogueHash === manifest.catalogueHash,
    "Pinned API catalogue mismatch",
  );
  for (const key of ["predictorSources", "harnessSources"])
    check(
      artifact[key] &&
        Object.keys(artifact[key]).length &&
        Object.values(artifact[key]).every((v) => /^[a-f0-9]{64}$/.test(v)),
      "Missing artifact source hashes: " + key,
    );
  check(
    predictions.artifactDigest === jsonSha(artifact),
    "Artifact identity digest mismatch",
  );
  check(
    predictions.dshVersion === manifest.dshVersion &&
      predictions.suiteId === pin.suiteId,
    "Pinned target/suite identity mismatch",
  );
  identity(predictions, measurement);
  check(
    measurement.cleanup?.privateRootRemoved === true &&
      measurement.cleanup.hostStopped === true,
    "Private profile/host cleanup unconfirmed",
  );
  seal(predictions, measurement.prediction);
  equal(
    predictions.casePlan,
    pin.cases.map(({ caseId, featureId, control }) => ({
      caseId,
      featureId,
      control,
    })),
    "Incomplete or changed fixed cases plan",
  );
  const scored = scoreBusiness(predictions, labels);
  const byCase = new Map(labels.rows.map((r) => [r.caseId, r]));
  for (const expected of pin.cases) {
    const row = byCase.get(expected.caseId);
    check(row, "Missing known case: " + expected.caseId);
    if (
      row.observed?.harnessError !== undefined ||
      row.outcome === "unobserved"
    )
      throw Object.assign(
        new Error(
          "Driver observation failed: " +
            expected.caseId +
            ": " +
            (row.observed?.harnessError || "unobserved"),
        ),
        { code: "REGRESSION_DRIVER_ERROR" },
      );
    check(
      row.outcome === expected.outcome,
      "Known outcome differs: " + expected.caseId,
    );
    for (const [key, value] of Object.entries(expected.observed))
      check(
        row.observed[key] === value,
        "Known expected postcondition differs: " + expected.caseId + "/" + key,
      );
    if (expected.observed.requestStatus === undefined)
      check(
        row.observed.requestStatus === undefined,
        "Unexpected request evidence: " + expected.caseId,
      );
    if (suite.startsWith("sidebar")) {
      const encoding = expected.featureId.slice("sidebar.editor.".length);
      check(
        row.byteEvidence?.encoding === encoding &&
          row.byteEvidence.exactRequestedBytes ===
            expected.observed.persisted &&
          row.byteEvidence.previousBytesPreserved ===
            !expected.observed.persisted,
        "Independent byte evidence differs: " + expected.caseId,
      );
      if (suite === "sidebar-ui-previous")
        equal(
          row.preconditionEvidence,
          { path: "/sidebar/api/fs.trees", status: 405, method: "POST" },
          "Natural failure precondition request evidence differs",
        );
    }
    const shot = evidence.bytes(expected.caseId + ".png");
    check(
      shot.length > 16 &&
        shot.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
      "Missing or invalid screenshot PNG: " + expected.caseId,
    );
  }
  const modes = { static: scored };
  if (pin.observeServices) {
    const sp = read(dir, "service-predictions.json"),
      sl = read(dir, "service-labels.json"),
      obs = read(dir, "service-observation.json"),
      sm = measurement.serviceObserved;
    identity(sp, sm || {});
    const serviceArtifact = {
      staticArtifactDigest: predictions.artifactDigest,
      rootServiceInputSha256: jsonSha(obs),
    };
    equal(
      sm.artifacts,
      serviceArtifact,
      "Service observation/artifact identity mismatch",
    );
    check(
      sp.artifactDigest === jsonSha(serviceArtifact) &&
        sp.sampleId === predictions.sampleId + "-services" &&
        sp.suiteId === predictions.suiteId + "-service-observed-v1",
      "Service evidence identity mismatch",
    );
    check(
      sp.dshVersion === predictions.dshVersion &&
        sp.toolVersion === predictions.toolVersion &&
        obs.dshVersion === manifest.dshVersion,
      "Service target identity mismatch",
    );
    check(
      obs.observationVersion === 1 &&
        typeof obs.profileId === "string" &&
        obs.profileId &&
        obs.root,
      "Missing root service evidence",
    );
    check(
      time(predictions.predictedAt) <= time(obs.probedAt) &&
        time(obs.probedAt) <= time(sp.predictedAt) &&
        time(sp.predictedAt) <= time(labels.collectedAt),
      "Service observation/prediction time order differs",
    );
    seal(sp, sm.prediction);
    check(
      sp.predictionContext?.mode ===
        "feature-scoped-service-observed-api-risk" &&
        sp.predictionContext.rootOnly === true &&
        sp.predictionContext.observationSha256 === jsonSha(obs),
      "Service-only prediction context differs",
    );
    equal(sp.casePlan, predictions.casePlan, "Service cases differ");
    equal(sl.rows, labels.rows, "Service business truth differs");
    check(sl.collectedAt === labels.collectedAt, "Service label time differs");
    if (suite === "sidebar-ui-previous")
      check(
        obs.root.webRuntime?.status === "absent",
        "Natural failure required webRuntime absence evidence missing",
      );
    modes.serviceObserved = scoreBusiness(sp, sl);
  } else check(!measurement.serviceObserved, "Unexpected service mode");
  return {
    suite,
    status: "passed",
    validationScope: "historical-evidence-validation",
    knownOutcomes: pin.cases.length,
    modes,
    boundaries: pin.cases.map((c) => ({
      caseId: c.caseId,
      boundary: c.boundary,
      outcome: c.outcome,
      staticClassification: scored.rows.find((r) => r.caseId === c.caseId)
        .classification,
      ...(modes.serviceObserved
        ? {
            serviceClassification: modes.serviceObserved.rows.find(
              (r) => r.caseId === c.caseId,
            ).classification,
          }
        : {}),
    })),
    limitations: [
      "Evidence limits bound file counts and input/read bytes, not process RSS; matching metadata before/after reads does not create an atomic snapshot.",
      "Saved prediction seal and timestamp partial order are verified; individual action timestamps are not recorded by the existing driver.",
      "Hashes detect inconsistent bytes, not coordinated malicious rewriting. Offline replay is historical validation, not current runtime certification.",
      "Installed package tree excludes nested node_modules, matching the existing live driver; published tarball hashes identify the pinned release, while installed tree verification is performed by that driver.",
    ],
  };
}
function inventory(dir) {
  return evidenceReader(dir).inventory();
}
function report(entries, mode) {
  const boundaries = entries.flatMap((entry) => entry.boundaries || []);
  const summary = {
    knownOutcomeCases: boundaries.length,
    staticIdentifiedFailures: boundaries.filter(
      (row) => row.staticClassification === "truePositive",
    ).length,
    serviceOnlyIdentifiedFailures: boundaries.filter(
      (row) =>
        row.staticClassification === "falseNegative" &&
        row.serviceClassification === "truePositive",
    ).length,
    unflaggedNaturalFailures: boundaries.filter(
      (row) =>
        row.boundary === "natural-service-dependency" &&
        row.staticClassification === "falseNegative",
    ).length,
    unflaggedBusinessOrClientFailures: boundaries.filter(
      (row) =>
        row.boundary.startsWith("controlled-") &&
        row.staticClassification === "falseNegative",
    ).length,
    driverErrors: entries.filter((entry) => entry.driverError).length,
    validationErrors: entries.filter((entry) => entry.status === "failed")
      .length,
  };
  return {
    summary,
    schemaVersion: 1,
    kind: "plugin-compat-check/real-regression",
    mode,
    status: entries.some((e) => e.driverError)
      ? "driver-error"
      : entries.some((e) => e.status !== "passed")
        ? "failed"
        : "passed",
    manifestSha256: sha(fs.readFileSync(manifestPath)),
    targetDshVersion: manifest.dshVersion,
    modelCalls: 0,
    accountCalls: 0,
    entries,
    scope:
      "Green means fixed normal/failure/recovery outcomes were reproduced, with FP/FN retained by mode. This is not compatibility for all plugins or ecosystem accuracy. Historical replay is not current certification.",
  };
}
function validateRecordedCohort(dir, item, samples) {
  const result = validateCohort(dir, item.suite);
  const prediction = result.modes.static;
  check(
    time(read(dir, "predictions.json").predictedAt) >= time(item.startedAt) &&
      time(read(dir, "labels.json").collectedAt) <= time(item.completedAt),
    "Evidence time lies outside recorded live window",
  );
  check(
    !samples.has(prediction.sampleId),
    "Duplicate sample identity across independent repeats",
  );
  samples.add(prediction.sampleId);
  return result;
}
export function replayRegression(root) {
  directory(root);
  const index = read(root, "regression-index.json");
  check(
    index.schemaVersion === 1 &&
      index.manifestSha256 === sha(fs.readFileSync(manifestPath)),
    "Regression manifest/index mismatch",
  );
  check(
    Number.isInteger(index.repeats) &&
      index.repeats >= 1 &&
      index.repeats <= manifest.budgets.maxRepeats &&
      index.entries?.length === index.repeats * manifest.suites.length,
    "Incomplete regression run index",
  );
  const entries = [],
    samples = new Set();
  for (let repeat = 1; repeat <= index.repeats; repeat++)
    for (const pin of manifest.suites) {
      const relative = "run-" + repeat + "/" + pin.suite;
      const item = index.entries.find((e) => e.relative === relative);
      check(item, "Missing indexed regression cohort");
      try {
        if (item.driverError) {
          entries.push({ ...item, status: "driver-error" });
          continue;
        }
        check(
          time(item.completedAt) >= time(item.startedAt) &&
            item.durationMs >= 0 &&
            item.durationMs <=
              manifest.budgets.suiteWallMs +
                manifest.budgets.cleanupGraceMs +
                3000,
          "Run time/resource budget differs",
        );
        directory(path.join(root, "run-" + repeat));
        const dir = path.join(root, relative);
        equal(
          inventory(dir),
          item.files,
          "Evidence file inventory/hash mismatch: " + relative,
        );
        entries.push({
          repeat,
          relative,
          ...validateRecordedCohort(dir, item, samples),
        });
      } catch (error) {
        entries.push({
          repeat,
          relative,
          suite: pin.suite,
          status:
            error.code === "REGRESSION_DRIVER_ERROR"
              ? "driver-error"
              : "failed",
          ...(error.code === "REGRESSION_DRIVER_ERROR"
            ? { driverError: error.message }
            : { error: error.message }),
        });
      }
    }
  return report(entries, "historical-evidence-validation");
}
/** A grace window lets the existing live driver close its separately owned
 * host/browser groups before the outer CLI process can be forcibly stopped. */
async function liveChild(suite, dir, signal) {
  const pin = manifest.suites.find((row) => row.suite === suite);
  const args = [
    path.join(repo, "tools/business-labels.mjs"),
    "--live",
    "--suite",
    suite,
    "--out-dir",
    dir,
    "--json",
    ...(pin.observeServices ? ["--observe-services"] : []),
  ];
  const child = spawn(process.execPath, args, {
    cwd: repo,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bytes = 0,
    output = "",
    failure,
    forceTimer;
  const cancel = (reason) => {
    if (failure) return;
    failure = reason;
    child.kill("SIGTERM");
    forceTimer = setTimeout(
      () => void stopOwnedChild(child).catch(() => {}),
      manifest.budgets.cleanupGraceMs,
    );
  };
  const abort = () => cancel("Regression interrupted");
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => cancel("Suite wall-time budget exceeded"),
    manifest.budgets.suiteWallMs,
  );
  const append = (chunk) => {
    bytes += chunk.length;
    if (bytes > manifest.budgets.commandOutputBytes)
      cancel("Driver output budget exceeded");
    else output += chunk;
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  try {
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (failure) throw Error(failure);
    check(
      code === 0 || code === 1,
      "Live driver error (exit " + code + "): " + output.slice(-1200),
    );
    check(
      fs.existsSync(path.join(dir, "measurement.json")),
      "Live driver produced no complete measurement",
    );
  } finally {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    signal.removeEventListener("abort", abort);
  }
}
export async function runRealRegression({
  outDir,
  repeat = manifest.budgets.defaultRepeats,
} = {}) {
  check(outDir, "Live regression requires an output directory");
  check(
    Number.isInteger(repeat) &&
      repeat >= 1 &&
      repeat <= manifest.budgets.maxRepeats,
    "Repeat must be 1 or 2",
  );
  outDir = path.resolve(outDir);
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  check(
    !fs.readdirSync(outDir).length,
    "Regression output directory must be empty",
  );
  check(
    sha(fs.readFileSync(path.join(repo, manifest.catalogueFile))) ===
      manifest.catalogueHash,
    "Current API catalogue differs from fixed manifest",
  );
  const controller = new AbortController(),
    abort = () => controller.abort();
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const entries = [],
    samples = new Set(),
    index = {
      schemaVersion: 1,
      manifestSha256: sha(fs.readFileSync(manifestPath)),
      repeats: repeat,
      runnerSources: {
        "tools/real-regression.mjs": sha(
          fs.readFileSync(fileURLToPath(import.meta.url)),
        ),
      },
      entries: [],
    };
  try {
    for (let round = 1; round <= repeat; round++)
      for (const pin of manifest.suites) {
        check(!controller.signal.aborted, "Regression interrupted");
        const relative = "run-" + round + "/" + pin.suite,
          dir = path.join(outDir, relative),
          start = Date.now(),
          item = {
            repeat: round,
            suite: pin.suite,
            relative,
            startedAt: new Date(start).toISOString(),
          };
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        process.stderr.write("Real regression " + relative + "\n");
        try {
          await liveChild(pin.suite, dir, controller.signal);
        } catch (error) {
          item.driverError = error.message;
        }
        item.completedAt = new Date().toISOString();
        item.durationMs = Date.now() - start;
        item.files = inventory(dir);
        index.entries.push(item);
        fs.writeFileSync(
          path.join(outDir, "regression-index.json"),
          JSON.stringify(index, null, 2) + "\n",
        );
        if (item.driverError) entries.push({ ...item, status: "driver-error" });
        else {
          try {
            entries.push({
              repeat: round,
              relative,
              ...validateRecordedCohort(dir, item, samples),
            });
          } catch (error) {
            entries.push({
              repeat: round,
              relative,
              suite: pin.suite,
              status:
                error.code === "REGRESSION_DRIVER_ERROR"
                  ? "driver-error"
                  : "failed",
              ...(error.code === "REGRESSION_DRIVER_ERROR"
                ? { driverError: error.message }
                : { error: error.message }),
            });
          }
        }
      }
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
  const result = report(entries, "current-private-live");
  fs.writeFileSync(
    path.join(outDir, "regression-report.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  return result;
}
export const regressionExitCode = (result) =>
  result.status === "passed" ? 0 : result.status === "driver-error" ? 3 : 1;
async function main() {
  const opts = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--live") opts.live = true;
    else if (["--out-dir", "--replay", "--repeat", "--suite"].includes(arg)) {
      const value = process.argv[++i];
      check(value && !value.startsWith("--"), "Missing argument: " + arg);
      opts[arg.slice(2)] = value;
    } else if (arg === "--help") {
      console.log(
        "node tools/real-regression.mjs --live --out-dir <empty-dir> [--repeat 1|2]\nnode tools/real-regression.mjs --replay <run-root>\nnode tools/real-regression.mjs --replay <historical-cohort-dir> --suite <fixed-suite>",
      );
      return;
    } else throw Error("Unknown argument: " + arg);
  }
  check(
    Boolean(opts.live) !== Boolean(opts.replay),
    "Choose --live or --replay",
  );
  check(
    !opts.live || (opts["out-dir"] && !opts.suite),
    "Live mode requires --out-dir, without --suite",
  );
  check(
    !opts.replay || (!opts["out-dir"] && !opts.repeat),
    "Replay does not accept output/repeat",
  );
  let result;
  if (opts.live)
    result = await runRealRegression({
      outDir: opts["out-dir"],
      repeat: opts.repeat === undefined ? undefined : Number(opts.repeat),
    });
  else {
    try {
      result = opts.suite
        ? report(
            [validateCohort(path.resolve(opts.replay), opts.suite)],
            "historical-evidence-validation",
          )
        : replayRegression(path.resolve(opts.replay));
    } catch (error) {
      result = report(
        [
          {
            suite: opts.suite || null,
            status:
              error.code === "REGRESSION_DRIVER_ERROR"
                ? "driver-error"
                : "failed",
            ...(error.code === "REGRESSION_DRIVER_ERROR"
              ? { driverError: error.message }
              : { error: error.message }),
          },
        ],
        "historical-evidence-validation",
      );
    }
  }
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = regressionExitCode(result);
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.log(
      JSON.stringify({
        schemaVersion: 1,
        kind: "plugin-compat-check/real-regression-error",
        status: "driver-error",
        error: error.message,
      }),
    );
    process.exitCode = 3;
  });
