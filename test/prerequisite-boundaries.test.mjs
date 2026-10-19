import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFixture } from "./fixture-utils.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { featurePredictions } from "../tools/business-metrics.mjs";
const version = "0.2.1-rc.2";
const source =
  "export const inject=['legacySurface'];export function apply(ctx){ctx.legacySurface.route()}";
function inspect(code, root, check) {
  const f = packageFixture(code, { meta: { type: "module" } });
  try {
    const surface =
      root === null
        ? null
        : {
            observationVersion: 1,
            profileId: f.nm,
            dshVersion: version,
            probedAt: new Date().toISOString(),
            root,
          };
    const r = run({
      nm: f.nm,
      dshVersion: version,
      baseline: false,
      _ignoreAutoProbe: true,
      _hostSurface: surface,
    });
    assert.equal(r.error, null);
    check(toJSON(r), f, surface);
  } finally {
    f.cleanup();
  }
}
test("an unobserved required activation prerequisite stays uncertain and is explicitly distinguished from a missing method", () =>
  inspect(source, null, (r) => {
    const finding = r.plugins.sample.findings.find(
      (f) => f.service === "legacySurface",
    );
    assert.equal(finding.severity, "degraded");
    assert.equal(finding.certainty, "suspected");
    assert.equal(finding.evidence.hardInject, true);
    assert.equal(finding.evidence.status, "unobserved");
    assert.equal(finding.method, null);
    assert.equal(r.plugins.sample.verdict, "partial");
  }));
test("explicit required-service absence predicts activation obstruction without loader or business labels", () =>
  inspect(
    source,
    { legacySurface: { status: "absent", present: false } },
    (r) => {
      const f = r.plugins.sample.findings.find(
        (f) => f.service === "legacySurface",
      );
      assert.equal(f.category, "host-service-missing");
      assert.equal(f.severity, "fatal");
      assert.equal(f.impactBasis, "inferred");
      const p = featurePredictions(
        r,
        [{ id: "editor", plugin: "sample", spans: [] }],
        {
          sampleId: "a",
          suiteId: "boundary",
          artifactDigest: "a".repeat(64),
          dshVersion: version,
          toolVersion: "0.1.3",
        },
      );
      assert.equal(p.rows[0].flagged, true);
      assert.equal(
        p.rows[0].findings.some((f) => f.category === "host-entry-inactive"),
        false,
      );
    },
  ));
test("optional and scoped-only missing services do not become global activation failures", () => {
  for (const code of [
    "export const inject={optional:['legacySurface']};export function apply(ctx){ctx.legacySurface?.route()}",
    "export function apply(ctx){ctx.inject(['legacySurface'],c=>c.legacySurface.route())}",
  ])
    inspect(
      code,
      { legacySurface: { status: "absent", present: false } },
      (r) =>
        assert.equal(
          r.plugins.sample.findings.some((f) => f.severity === "fatal"),
          false,
        ),
    );
});
test("available service and missing callable method are different from an absent activation prerequisite", () => {
  inspect(
    source,
    { legacySurface: { present: true, methods: { route: "function" } } },
    (r) =>
      assert.equal(
        r.plugins.sample.findings.some((f) => f.service === "legacySurface"),
        false,
      ),
  );
  inspect(source, { legacySurface: { present: true, methods: {} } }, (r) => {
    const f = r.plugins.sample.findings.find(
      (f) => f.service === "legacySurface",
    );
    assert.equal(f.category, "host-method-missing");
    assert.equal(f.method, "route");
    assert.notEqual(f.severity, "fatal");
  });
});
test("root-only prediction input rejects borrowed observations and strips current/future answer-bearing fields", async () => {
  const { servicePredictionInput } = await import(
    "../tools/business-observation.mjs"
  );
  inspect(source, null, (_r, f) => {
    const surface = {
      observationVersion: 1,
      profileId: f.nm,
      dshVersion: version,
      probedAt: new Date().toISOString(),
      root: {
        legacySurface: {
          present: false,
          status: "absent",
          businessAnswer: true,
        },
      },
      entries: { plugins: [{ packageName: "sample", state: "ACTIVE" }] },
      businessLabels: { answer: true },
      futureAnswer: "not permitted",
    };
    const clean = servicePredictionInput(surface, {
      nm: f.nm,
      dshVersion: version,
    });
    assert.equal(clean.entries, undefined);
    assert.equal(clean.businessLabels, undefined);
    assert.equal(clean.futureAnswer, undefined);
    assert.equal(clean.root.legacySurface.businessAnswer, undefined);
    assert.deepEqual(clean.root.legacySurface, {
      status: "absent",
      present: false,
    });
    for (const bad of [
      { ...surface, profileId: f.nm + "/other" },
      { ...surface, dshVersion: "0.2.0-rc.2" },
      { ...surface, probedAt: "2000-01-01" },
      { ...surface, probedAt: new Date(Date.now() + 120000).toISOString() },
    ])
      assert.throws(
        () => servicePredictionInput(bad, { nm: f.nm, dshVersion: version }),
        /identity|freshness|future/i,
      );
  });
});
test("missing samples and unreadable values never turn into observed absence", async () => {
  const { servicePredictionInput } = await import(
    "../tools/business-observation.mjs"
  );
  inspect(source, null, (_r, f) => {
    for (const info of [
      undefined,
      { status: "unobserved" },
      { status: "unreadable", error: "getter failed" },
    ]) {
      const raw = {
        observationVersion: 1,
        profileId: f.nm,
        dshVersion: version,
        probedAt: new Date().toISOString(),
        root: info ? { legacySurface: info } : {},
      };
      const clean = servicePredictionInput(raw, {
        nm: f.nm,
        dshVersion: version,
      });
      const r = run({
        nm: f.nm,
        dshVersion: version,
        baseline: false,
        _ignoreAutoProbe: true,
        _hostSurface: clean,
      });
      assert.equal(
        r.verdict.plugins.sample.findings.some((f) => f.severity === "fatal"),
        false,
      );
    }
  });
});

test("service-observed artifacts retain their distinct prediction provenance during offline replay", async () => {
  const { scoreBusiness } = await import("../tools/business-metrics.mjs");
  const identity = {
    sampleId: "service-boundary",
    suiteId: "service-observed",
    artifactDigest: "a".repeat(64),
    dshVersion: version,
    toolVersion: "0.1.3",
  };
  const pred = {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-predictions",
    ...identity,
    predictedAt: "2026-10-19T01:00:00Z",
    predictionContext: {
      mode: "feature-scoped-service-observed-api-risk",
      rootOnly: true,
      observationSha256: "b".repeat(64),
    },
    rows: [{ featureId: "editor", flagged: true }],
    casePlan: [{ caseId: "open", featureId: "editor", control: "none" }],
  };
  const labels = {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-labels",
    ...identity,
    collectedAt: "2026-10-19T01:01:00Z",
    source: "browser-action+profile-state",
    rows: [
      {
        caseId: "open",
        featureId: "editor",
        control: "none",
        observed: { actionAvailable: false },
      },
    ],
  };
  const scored = scoreBusiness(pred, labels);
  assert.equal(scored.metrics.baseline.truePositive, 1);
  assert.equal(
    scored.prediction.mode,
    "feature-scoped-service-observed-api-risk",
  );
  assert.equal(scored.prediction.rootOnly, true);
  assert.equal(scored.prediction.observationSha256, "b".repeat(64));
  for (const context of [
    { mode: "guess" },
    { ...pred.predictionContext, rootOnly: false },
    { ...pred.predictionContext, observationSha256: "invalid" },
    { ...pred.predictionContext, observationSha256: ["b".repeat(64)] },
  ])
    assert.throws(
      () => scoreBusiness({ ...pred, predictionContext: context }, labels),
      /prediction context/i,
    );
  const legacy = { ...pred };
  delete legacy.predictionContext;
  assert.equal(
    scoreBusiness(legacy, labels).prediction.mode,
    "feature-scoped-static-api-risk",
  );
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { spawnSync } = await import("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-context-replay-"));
  try {
    const predictionFile = path.join(dir, "predictions.json");
    const labelFile = path.join(dir, "labels.json");
    fs.writeFileSync(labelFile, JSON.stringify(labels));
    for (const input of [pred, legacy]) {
      fs.writeFileSync(predictionFile, JSON.stringify(input));
      const replay = spawnSync(
        process.execPath,
        [
          "tools/business-labels.mjs",
          "--predictions",
          predictionFile,
          "--labels",
          labelFile,
          "--json",
        ],
        { encoding: "utf8", timeout: 10000 },
      );
      assert.equal(replay.status, 0, replay.stderr);
      assert.deepEqual(
        JSON.parse(replay.stdout).prediction,
        scoreBusiness(input, labels).prediction,
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("service-only serialization reconstructs method shapes without copying nested bodies", async () => {
  const { servicePredictionInput } = await import(
    "../tools/business-observation.mjs"
  );
  inspect(source, null, (_r, f) => {
    const raw = {
      observationVersion: 1,
      profileId: f.nm,
      dshVersion: version,
      probedAt: new Date().toISOString(),
      root: {
        legacySurface: {
          present: true,
          methods: { route: { businessLabels: { answer: true } } },
          unknownMethods: ["getter", { businessLabels: true }],
          nonCallableMethods: ["field", { secret: "value" }],
        },
      },
    };
    const clean = servicePredictionInput(raw, {
      nm: f.nm,
      dshVersion: version,
    });
    assert.deepEqual(clean.root.legacySurface.methods, { route: "function" });
    assert.deepEqual(clean.root.legacySurface.unknownMethods, ["getter"]);
    assert.deepEqual(clean.root.legacySurface.nonCallableMethods, ["field"]);
    assert.equal(JSON.stringify(clean).includes("businessLabels"), false);
    assert.equal(JSON.stringify(clean).includes("secret"), false);
  });
});
