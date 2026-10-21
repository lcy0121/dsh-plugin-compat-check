import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
const api = await import("../tools/real-regression.mjs").catch(() => ({}));
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const write = (dir, file, value) =>
  fs.writeFileSync(path.join(dir, file), JSON.stringify(value, null, 2) + "\n");
// Artificial audit inputs exercise rejection only. They are never live acceptance evidence.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-regression-test-"));
  const artifact = {
    suite: "sidebar-ui-previous",
    package: "dsh-better-sidebar",
    version: "0.26.1",
    packageFingerprint: {
      files: 460,
      digest:
        "a262b6ef39c7bed72e6ebb47ac2d1c0f0f82544eb36966bb69494f2d1f059562",
    },
    publishedTarballSha256:
      "cd2d3d85d3d4a2d54c36b8bf86a24f2ec099f85a2936a72ef83edf7612c7402a",
    publishedIntegrity:
      "sha512-0/BXLEAqFJnd3SI/aryQVFHayrjE+RHcFgWIy57GrCYUeppEFTujfQOkO4U9V4QRd3qTVHFE7DZzNzUyU+kscw==",
    catalogueHash:
      "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
    predictorSources: { "bin/compat-check.mjs": "a".repeat(64) },
    harnessSources: { "tools/business-live.mjs": "b".repeat(64) },
  };
  const identity = {
    sampleId: "artificial-audit-only",
    suiteId: "dsh-better-sidebar-0.26.1-editor-actions-v1",
    artifactDigest: hash(JSON.stringify(artifact)),
    dshVersion: "0.2.1-rc.2",
    toolVersion: "test",
  };
  const features = ["sidebar.editor.utf8-bom", "sidebar.editor.utf16le"];
  const predictions = {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-predictions",
    ...identity,
    predictedAt: "2026-10-19T01:00:00Z",
    rows: features.map((featureId) => ({
      featureId,
      flagged: false,
      coverageLimited: true,
      clientVerified: false,
    })),
    casePlan: features.map((featureId) => ({
      caseId: featureId + ".healthy",
      featureId,
      control: "none",
    })),
  };
  const labels = {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-labels",
    ...identity,
    source: "browser-action+profile-state",
    collectedAt: "2026-10-19T01:02:00Z",
    rows: features.map((featureId) => ({
      caseId: featureId + ".healthy",
      featureId,
      control: "none",
      observed: {
        actionAvailable: false,
        persisted: false,
        uiAfterReload: false,
      },
      outcome: "failed",
      preconditionEvidence: {
        method: "POST",
        path: "/sidebar/api/fs.trees",
        status: 405,
      },
      byteEvidence: {
        encoding: featureId.endsWith("utf16le") ? "utf16le" : "utf8-bom",
        exactRequestedBytes: false,
        previousBytesPreserved: true,
      },
    })),
  };
  const observation = {
    observationVersion: 1,
    dshVersion: identity.dshVersion,
    profileId: "/owned/profile/node_modules",
    probedAt: "2026-10-19T01:00:30Z",
    root: { webRuntime: { status: "absent", present: false } },
  };
  const serviceArtifact = {
    staticArtifactDigest: identity.artifactDigest,
    rootServiceInputSha256: hash(JSON.stringify(observation)),
  };
  const serviceIdentity = {
    ...identity,
    sampleId: identity.sampleId + "-services",
    suiteId: identity.suiteId + "-service-observed-v1",
    artifactDigest: hash(JSON.stringify(serviceArtifact)),
  };
  const servicePredictions = {
    ...predictions,
    ...serviceIdentity,
    predictedAt: "2026-10-19T01:01:00Z",
    rows: predictions.rows.map((row) => ({ ...row, flagged: true })),
    predictionContext: {
      mode: "feature-scoped-service-observed-api-risk",
      rootOnly: true,
      observationSha256: serviceArtifact.rootServiceInputSha256,
    },
  };
  const measurement = {
    ...identity,
    artifacts: artifact,
    cleanup: { privateRootRemoved: true, hostStopped: true },
    prediction: {
      mode: "feature-scoped-static-api-risk",
      sealedBeforeActions: true,
      businessLabelsUsed: false,
      loaderLabelsUsed: false,
      autoProbeDiscovery: false,
      sha256: hash(JSON.stringify(predictions)),
    },
    metrics: { fabricated: true },
    serviceObserved: {
      ...serviceIdentity,
      artifacts: serviceArtifact,
      prediction: {
        mode: "feature-scoped-service-observed-api-risk",
        sealedBeforeActions: true,
        businessLabelsUsed: false,
        loaderLabelsUsed: false,
        rootOnly: true,
        observationSha256: serviceArtifact.rootServiceInputSha256,
        sha256: hash(JSON.stringify(servicePredictions)),
      },
    },
  };
  const files = {
    "predictions.json": predictions,
    "labels.json": labels,
    "measurement.json": measurement,
    "service-predictions.json": servicePredictions,
    "service-labels.json": { ...labels, ...serviceIdentity },
    "service-observation.json": observation,
  };
  const save = () => {
    for (const [file, value] of Object.entries(files)) write(dir, file, value);
  };
  save();
  for (const row of labels.rows)
    fs.writeFileSync(
      path.join(dir, row.caseId + ".png"),
      Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex"),
    );
  return {
    dir,
    files,
    save,
    remove: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
test("recomputes actual static and service metrics rather than trusting saved measurements", () => {
  assert.equal(typeof api.validateCohort, "function");
  const f = fixture();
  try {
    const r = api.validateCohort(f.dir, "sidebar-ui-previous");
    assert.equal(r.status, "passed");
    assert.equal(r.modes.static.metrics.baseline.falseNegative, 2);
    assert.equal(r.modes.serviceObserved.metrics.baseline.truePositive, 2);
    assert.equal(r.validationScope, "historical-evidence-validation");
  } finally {
    f.remove();
  }
});
test("prediction improvements may turn historical false negatives into true positives", () => {
  const f = fixture();
  try {
    f.files["predictions.json"].rows.forEach((r) => (r.flagged = true));
    f.files["measurement.json"].prediction.sha256 = hash(
      JSON.stringify(f.files["predictions.json"]),
    );
    f.save();
    const r = api.validateCohort(f.dir, "sidebar-ui-previous");
    assert.equal(r.status, "passed");
    assert.equal(r.modes.static.metrics.baseline.truePositive, 2);
  } finally {
    f.remove();
  }
});
for (const [name, mutate, pattern] of [
  [
    "missing cases",
    (f) => {
      f.files["labels.json"].rows.pop();
    },
    /cases|complete/i,
  ],
  [
    "changed prediction after sealing",
    (f) => {
      f.files["predictions.json"].rows[0].flagged = true;
    },
    /seal|sha/i,
  ],
  [
    "wrong installed artifact tree",
    (f) => {
      f.files["measurement.json"].artifacts.packageFingerprint.digest =
        "0".repeat(64);
    },
    /artifact|fingerprint/i,
  ],
  [
    "business labels that contradict independently fixed outcomes",
    (f) => {
      f.files["labels.json"].rows[0].observed = {
        actionAvailable: true,
        requestStatus: 200,
        persisted: true,
        uiAfterReload: true,
      };
      f.files["labels.json"].rows[0].outcome = "passed";
    },
    /expected|known|outcome/i,
  ],
  [
    "cross sample identity",
    (f) => {
      f.files["service-labels.json"].sampleId = "other";
    },
    /identity/i,
  ],
  [
    "service prediction preceding observation",
    (f) => {
      f.files["service-predictions.json"].predictedAt = "2026-10-19T00:59:00Z";
      f.files["measurement.json"].serviceObserved.prediction.sha256 = hash(
        JSON.stringify(f.files["service-predictions.json"]),
      );
    },
    /time|preced|order/i,
  ],
  [
    "absent independent request evidence",
    (f) => {
      delete f.files["labels.json"].rows[0].preconditionEvidence;
    },
    /precondition|request|evidence/i,
  ],
  [
    "unconfirmed cleanup",
    (f) => {
      f.files["measurement.json"].cleanup.hostStopped = false;
    },
    /cleanup/i,
  ],
])
  test("rejects " + name, () => {
    const f = fixture();
    try {
      mutate(f);
      f.save();
      assert.throws(
        () => api.validateCohort(f.dir, "sidebar-ui-previous"),
        pattern,
      );
    } finally {
      f.remove();
    }
  });
test("rejects a missing screenshot rather than scoring a complete-looking JSON pair", () => {
  const f = fixture();
  try {
    fs.unlinkSync(path.join(f.dir, "sidebar.editor.utf8-bom.healthy.png"));
    assert.throws(
      () => api.validateCohort(f.dir, "sidebar-ui-previous"),
      /screenshot|png|ENOENT/i,
    );
  } finally {
    f.remove();
  }
});

test("keeps a driver-side failure separate from plugin business failures", () => {
  const f = fixture();
  try {
    f.files["labels.json"].rows[0].observed = {
      harnessError: "target was not ready",
    };
    f.files["labels.json"].rows[0].outcome = "harness-error";
    f.save();
    assert.throws(
      () => api.validateCohort(f.dir, "sidebar-ui-previous"),
      (error) => error.code === "REGRESSION_DRIVER_ERROR",
    );
  } finally {
    f.remove();
  }
});

test("CLI historical replay summarizes service-only detection without claiming current runtime certification", async () => {
  const { spawnSync } = await import("node:child_process");
  const f = fixture();
  try {
    const result = spawnSync(
      process.execPath,
      [
        "tools/real-regression.mjs",
        "--replay",
        f.dir,
        "--suite",
        "sidebar-ui-previous",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "historical-evidence-validation");
    assert.equal(report.summary.staticIdentifiedFailures, 0);
    assert.equal(report.summary.serviceOnlyIdentifiedFailures, 2);
    assert.equal(report.summary.unflaggedNaturalFailures, 2);
  } finally {
    f.remove();
  }
});

function indexedFixture() {
  const f = fixture(),
    root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-regression-index-"));
  const entries = [];
  for (let repeat = 1; repeat <= 2; repeat++) {
    const relative = "run-" + repeat + "/sidebar-ui-previous",
      dir = path.join(root, relative);
    fs.mkdirSync(dir, { recursive: true });
    const files = {};
    for (const name of fs.readdirSync(f.dir)) {
      const bytes = fs.readFileSync(path.join(f.dir, name));
      fs.writeFileSync(path.join(dir, name), bytes);
      files[name] = hash(bytes);
    }
    entries.push({
      relative,
      suite: "sidebar-ui-previous",
      repeat,
      startedAt: "2026-10-19T00:59:00Z",
      completedAt: "2026-10-19T01:03:00Z",
      durationMs: 240000,
      files,
    });
    for (const suite of ["sidebar-ui", "market"])
      entries.push({
        relative: "run-" + repeat + "/" + suite,
        suite,
        repeat,
        driverError: "artificial driver failure for negative audit input",
      });
  }
  write(root, "regression-index.json", {
    schemaVersion: 1,
    repeats: 2,
    manifestSha256: hash(
      fs.readFileSync("tools/real-regression-manifest.json"),
    ),
    entries,
  });
  return {
    root,
    entries,
    remove: () => {
      f.remove();
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
test("independent repeats cannot reuse the same sample identity", () => {
  const f = indexedFixture();
  try {
    const report = api.replayRegression(f.root);
    const second = report.entries.find(
      (e) => e.repeat === 2 && e.suite === "sidebar-ui-previous",
    );
    assert.equal(second.status, "failed");
    assert.match(second.error, /duplicate|repeat|identity/i);
  } finally {
    f.remove();
  }
});
test("replay refuses evidence collected outside its recorded live run window", () => {
  const f = indexedFixture();
  try {
    f.entries[0].startedAt = "2026-10-19T01:01:00Z";
    f.entries[0].durationMs = 120000;
    write(f.root, "regression-index.json", {
      schemaVersion: 1,
      repeats: 2,
      manifestSha256: hash(
        fs.readFileSync("tools/real-regression-manifest.json"),
      ),
      entries: f.entries,
    });
    const report = api.replayRegression(f.root);
    assert.equal(report.entries[0].status, "failed");
    assert.match(report.entries[0].error, /time|window/i);
  } finally {
    f.remove();
  }
});

test("CLI evidence mismatch exits 1 while driver observation errors exit 3", async () => {
  const { spawnSync } = await import("node:child_process");
  const f = fixture();
  try {
    f.files["predictions.json"].rows[0].flagged = true;
    f.save();
    const bad = spawnSync(
      process.execPath,
      [
        "tools/real-regression.mjs",
        "--replay",
        f.dir,
        "--suite",
        "sidebar-ui-previous",
      ],
      { encoding: "utf8" },
    );
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).status, "failed");
    f.files["predictions.json"].rows[0].flagged = false;
    f.files["labels.json"].rows[0].observed = {
      harnessError: "artificial driver audit failure",
    };
    f.files["labels.json"].rows[0].outcome = "harness-error";
    f.save();
    const driver = spawnSync(
      process.execPath,
      [
        "tools/real-regression.mjs",
        "--replay",
        f.dir,
        "--suite",
        "sidebar-ui-previous",
      ],
      { encoding: "utf8" },
    );
    assert.equal(driver.status, 3);
    const report = JSON.parse(driver.stdout);
    assert.equal(report.status, "driver-error");
    assert.equal(report.summary.driverErrors, 1);
  } finally {
    f.remove();
  }
});

for (const filename of [
  "predictions.json",
  "sidebar.editor.utf8-bom.healthy.png",
])
  test(
    "rejects oversized " + filename + " before reading evidence bytes",
    () => {
      const f = fixture();
      try {
        fs.truncateSync(path.join(f.dir, filename), 8 * 1024 * 1024 + 1);
        assert.throws(
          () => api.validateCohort(f.dir, "sidebar-ui-previous"),
          /budget|size|bytes|limit/i,
        );
      } finally {
        f.remove();
      }
    },
  );
test("rejects too many evidence files even when extra files are empty", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 80; i++)
      fs.writeFileSync(path.join(f.dir, "extra-" + i), "");
    assert.throws(
      () => api.validateCohort(f.dir, "sidebar-ui-previous"),
      /budget|files|limit/i,
    );
  } finally {
    f.remove();
  }
});
test("rejects aggregate cohort bytes before loading individually permitted files", () => {
  const f = fixture();
  try {
    for (let i = 0; i < 5; i++) {
      const file = path.join(f.dir, "extra-" + i);
      fs.writeFileSync(file, "");
      fs.truncateSync(file, 7 * 1024 * 1024);
    }
    assert.throws(
      () => api.validateCohort(f.dir, "sidebar-ui-previous"),
      /budget|cohort|bytes|limit/i,
    );
  } finally {
    f.remove();
  }
});
test("never follows a symlink in an otherwise valid single-cohort evidence directory", () => {
  const f = fixture(),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-evidence-link-"));
  try {
    const file = path.join(f.dir, "predictions.json"),
      target = path.join(outside, "predictions.json");
    fs.renameSync(file, target);
    fs.symlinkSync(target, file);
    assert.throws(
      () => api.validateCohort(f.dir, "sidebar-ui-previous"),
      /regular|symlink|link/i,
    );
  } finally {
    f.remove();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
test("rejects symlink cohort directories rather than following them", () => {
  const f = fixture(),
    outside = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-evidence-link-"));
  try {
    const link = path.join(outside, "cohort");
    fs.symlinkSync(f.dir, link);
    assert.throws(
      () => api.validateCohort(link, "sidebar-ui-previous"),
      /directory|symlink|link/i,
    );
  } finally {
    f.remove();
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
test("rejects oversized run index before JSON parsing", () => {
  const f = indexedFixture();
  try {
    fs.appendFileSync(
      path.join(f.root, "regression-index.json"),
      " ".repeat(256 * 1024),
    );
    assert.throws(
      () => api.replayRegression(f.root),
      /budget|index|bytes|limit/i,
    );
  } finally {
    f.remove();
  }
});
