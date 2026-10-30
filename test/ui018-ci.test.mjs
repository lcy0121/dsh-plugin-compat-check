import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { validateUi018Evidence } from "../tools/ci-ui018.mjs";
function complete() {
  return {
    ok: true,
    applicable: true,
    dshVersion: "0.2.1-rc.3",
    artifactSha256: "a".repeat(64),
    uiI18n: {
      realBrowser: true,
      hostLanguage: true,
      threeLanguages: true,
      draftPreserved: true,
      identityPreserved: true,
      narrowAndTheme: true,
      canonicalReportUnchanged: true,
    },
    localHistory: {
      realBrowser: true,
      explicitSnapshotSave: true,
      archiveCapacityFreed: true,
      referenceImportOnly: true,
      fullExportPreview: true,
      comparison: true,
      criteriaMismatchNeutral: true,
      explicitDelete: true,
      originalReportAndBaselineUnchanged: true,
    },
    ui: { available: true, reenabled: true, httpRestored: true },
    cleanup: { privateRootRemoved: true },
    networkGuard: { productionRequests: 0 },
    ui018: {
      initial: { order: true, collapsed: true, styles: 1 },
      layout: { first: 240, second: 280 },
      keyboard: true,
      stylesRemovedAndRecovered: true,
      colors: { light: "white", dark: "black" },
    },
    httpAuth: {
      realHost: true,
      missingAndForgedDenied: true,
      launchBearerAndQueryNotBypasses: true,
      officialSignedCookieExpiry: true,
      sameOriginCookieRecovery: true,
    },
    ui018Recovery: {
      realBrowser: true,
      draftPreserved: true,
      editorIdentityAndFocusPreserved: true,
      staleSaveDisabled: true,
      copyAndDiscard: true,
    },
    ui018P2: {
      realBrowser: true,
      mainPageSize: 50,
      loaderPageSize: 50,
      allFixturePagesVisited: true,
      filteringResetsPage: true,
      fullExport: true,
    },
    ui018Hardening: {
      realBrowser: true,
      findingPageSize: 50,
      completeExport: true,
      actualSamplingTruncation: true,
      propertyValuesAbsent: true,
    },
    reviewNavigation: {
      realBrowser: true,
      bidirectional: true,
      identityBound: true,
      filters: true,
      keyboardFocus: true,
      originalReportUnchanged: true,
    },
  };
}
test("UI CI evidence gate rejects unavailable, incomplete, wrong-host and wrong-artifact acceptance", () => {
  const good = complete();
  assert.equal(validateUi018Evidence(good, "a".repeat(64)), true);
  for (const patch of [
    { ok: false },
    { applicable: false },
    { dshVersion: "0.2.1-rc.2" },
    { artifactSha256: "b".repeat(64) },
    { ui: { available: false } },
    { ui018P2: undefined },
    { reviewNavigation: undefined },
    { uiI18n: undefined },
    { networkGuard: { productionRequests: 1 } },
  ])
    assert.throws(() =>
      validateUi018Evidence({ ...good, ...patch }, "a".repeat(64)),
    );
  for (const key of [
    "ui018",
    "httpAuth",
    "ui018Recovery",
    "ui018P2",
    "ui018Hardening",
    "reviewNavigation",
    "localHistory",
    "uiI18n",
    "cleanup",
  ]) {
    const value = structuredClone(good);
    value[key] = {};
    assert.throws(() => validateUi018Evidence(value, "a".repeat(64)), key);
  }
});
test("rc.3 Linux workflow runs all UI acceptance through a single-artifact evidence gate and archives failures", () => {
  const workflow = YAML.parse(
      fs.readFileSync(
        new URL("../.github/workflows/test.yml", import.meta.url),
        "utf8",
      ),
    ),
    job = workflow.jobs["linux-live"];
  const step = job.steps.find((step) =>
    step.run?.includes("tools/ci-ui018.mjs"),
  );
  assert(step);
  assert.match(step.if, /0\.2\.1-rc\.3/);
  assert.match(step.run, /linux-ui018/);
  assert(
    job.steps.indexOf(step) <
      job.steps.findIndex((s) => s.run?.includes("linux-chrome-startup.tap")),
  );
  const preparation = job.steps.find((s) =>
    s.name?.startsWith("Prepare preinstalled"),
  );
  assert.match(preparation.run, /RUNNER_TEMP\/linux-chrome-preparation/);
  const upload = job.steps.find((step) =>
    step.uses?.startsWith("actions/upload-artifact"),
  );
  assert.equal(upload.if, "always()");
  assert.match(upload.with.path, /linux-ui018\//);
});

test("npm pack metadata survives lifecycle hook stdout without accepting ambiguous artifacts", async () => {
  const { packedFilename } = await import("../tools/ci-ui018.mjs");
  const metadata = JSON.stringify(
    [{ filename: "dsh-plugin-compat-check-0.1.7.tgz" }],
    null,
    2,
  );
  assert.equal(
    packedFilename(
      "[stage-skill] unchanged\n[unstage-kernel] removed\n" + metadata,
    ),
    "dsh-plugin-compat-check-0.1.7.tgz",
  );
  for (const value of [
    "not-json",
    "[]",
    JSON.stringify([{ filename: "../escape.tgz" }]),
    JSON.stringify([{ filename: "one.tgz" }, { filename: "two.tgz" }]),
  ])
    assert.throws(() => packedFilename(value));
});

test("rc.5 UI gate binds the requested host and requires separate protocol and model evidence", () => {
  const good = {
    ...complete(),
    dshVersion: "0.2.1-rc.5",
    noCredentialDiscovery: true,
    rc3Navigation: {
      blankReuse: true,
      presetIsolation: true,
      defaultKeep: true,
      append: true,
      legacyReplace: true,
      explicitPolicyPrecedence: true,
      detailAndBadge: true,
      createDraftOnly: true,
      menus: [0, 1, 2].map(() => ({
        browseMainList: true,
        createDraftOnly: true,
      })),
    },
    apiSemantics: {
      exactVersion: "0.2.1-rc.5",
      realBrowser: true,
      installedArtifact: true,
    },
    rc5Protocol: {
      actualAcp: true,
      catalogDiagnosticsStderr: true,
      mcpResources: true,
      stdoutJsonRpc: true,
      cleaned: true,
    },
    modelListing: {
      firstUseWait: true,
      failureFallback: true,
      lastGoodRetained: true,
      deadline: true,
      productionRequests: 0,
      modelCalls: 0,
    },
  };
  assert.equal(validateUi018Evidence(good, "a".repeat(64), "0.2.1-rc.5"), true);
  for (const patch of [
    { dshVersion: "0.2.1-rc.3" },
    { rc5Protocol: undefined },
    { modelListing: undefined },
    { apiSemantics: undefined },
    { rc3Navigation: undefined },
    { noCredentialDiscovery: false },
    { cleanup: { privateRootRemoved: false } },
  ])
    assert.throws(() =>
      validateUi018Evidence(
        { ...good, ...patch },
        "a".repeat(64),
        "0.2.1-rc.5",
      ),
    );
  assert.throws(() => validateUi018Evidence(good, "a".repeat(64), "latest"));
});

test("rc.5 evidence cannot omit extended navigation and exact-version semantic checks", () => {
  const good = {
    ...complete(),
    dshVersion: "0.2.1-rc.5",
    rc5Protocol: {
      actualAcp: true,
      catalogDiagnosticsStderr: true,
      mcpResources: true,
      stdoutJsonRpc: true,
      cleaned: true,
    },
    modelListing: {
      firstUseWait: true,
      failureFallback: true,
      lastGoodRetained: true,
      deadline: true,
      productionRequests: 0,
      modelCalls: 0,
    },
  };
  assert.throws(() =>
    validateUi018Evidence(good, "a".repeat(64), "0.2.1-rc.5"),
  );
});

test("candidate receipt admission binds identical archive bytes to the selected source and commit", async () => {
  const { validateCandidateReceipt } = await import("../tools/ci-ui018.mjs");
  const source = {
    sha256: "a".repeat(64),
    commit: "b".repeat(40),
    dirty: false,
  };
  const receipt = {
    ok: true,
    buildOnly: true,
    sourceSha256: source.sha256,
    sourceCommit: source.commit,
    sourceDirty: false,
    artifact: { sha256: "c".repeat(64), filename: "candidate.tgz" },
  };
  assert.equal(validateCandidateReceipt(receipt, source, "c".repeat(64)), true);
  for (const patch of [
    { ok: false },
    { sourceSha256: "d".repeat(64) },
    { sourceCommit: "e".repeat(40) },
    { sourceDirty: true },
    { artifact: { sha256: "f".repeat(64) } },
  ])
    assert.throws(() =>
      validateCandidateReceipt(
        { ...receipt, ...patch },
        source,
        "c".repeat(64),
      ),
    );
});

test("rc.5 Linux plan preserves old targets and consumes one candidate built by its prerequisite job", () => {
  const w = YAML.parse(
    fs.readFileSync(
      new URL("../.github/workflows/test.yml", import.meta.url),
      "utf8",
    ),
  );
  const job = w.jobs["linux-live"];
  assert.deepEqual(job.strategy.matrix.dsh, [
    "0.2.0-rc.2",
    "0.2.1-rc.2",
    "0.2.1-rc.3",
    "0.2.1-rc.5",
  ]);
  assert(job.needs.includes("candidate"));
  const download = job.steps.find((s) =>
    s.uses?.startsWith("actions/download-artifact@"),
  );
  assert.equal(download.with.name, "candidate-package");
  assert.equal(download.with["digest-mismatch"], "error");
  const ui = job.steps.find((s) => s.run?.includes("tools/ci-ui018.mjs"));
  assert.match(ui.if, /rc\.5/);
  assert.equal(ui.env.DSC_ACCEPTANCE_DSH_VERSION, "${{ matrix.dsh }}");
  assert(job.steps.indexOf(download) < job.steps.indexOf(ui));
  const build = w.jobs.candidate.steps.find((s) =>
    s.run?.includes("--build-only"),
  );
  assert(build);
  assert(
    job.steps.some(
      (s) => s.name?.startsWith("Install CJK") && s.if.includes("rc.5"),
    ),
  );
});
