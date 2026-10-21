import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

describe(
  "rc.2 actual declarations, subpath metadata and UI lifecycle",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test("real private host matches declaration evidence and shows one compatibility tab after re-enable", () => {
      const r = spawnSync(process.execPath, ["tools/rc2-live.mjs"], {
        encoding: "utf8",
        timeout: 300000,
      });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      const value = JSON.parse(r.stdout);
      assert.equal(value.ok, true);
      if (value.applicable === false) return;
      assert.equal(value.declarationCases.length, 5);
      assert.ok(value.declarationCases.every((x) => x.matched));
      assert.equal(value.subpathMetadata, true);
      assert.equal(value.runtimeExportContext, true);
      assert.deepEqual(value.originFence, {
        sameOriginStatus: 200,
        crossPortStatus: 403,
      });
      assert.equal(value.cleanup.privateRootRemoved, true);
      for (const key of [
        "installedArtifact",
        "positiveNewRisk",
        "staticEvidenceOnly",
        "inputAndCatalogIdentities",
        "ordinaryStateUnchanged",
        "unknownTargetUncertified",
      ])
        assert.equal(value.upgradePreview[key], true, key);
      assert.equal(value.upgradePreview.sameOriginStatus, 200);
      assert.equal(value.upgradePreview.crossPortStatus, 403);
      assert.equal(value.upgradePreview.wrongMethodStatus, 405);
      assert.match(value.upgradePreview.artifactSha256, /^[a-f0-9]{64}$/);
      assert.notEqual(
        value.upgradePreview.catalogSha256.current,
        value.upgradePreview.catalogSha256.target,
      );
      if (value.ui.available) {
        assert.equal(
          value.explanationPresentation.certaintyAndImpactSeparated,
          true,
        );
        assert.equal(
          value.explanationPresentation.perPluginCoverageVisible,
          true,
        );
        assert.equal(
          value.explanationPresentation.noServiceUseClaimRemoved,
          true,
        );
        for (const key of [
          "realBrowser",
          "searchAndCombinedFilters",
          "expandedGuidance",
          "fullReportPreview",
          "explicitClipboardCopy",
          "absentBaselineNeutral",
          "clearFilters",
        ])
          assert.equal(value.panelExperience[key], true, key);
        assert.equal(value.ui.tabCount, 1);
        assert.equal(value.ui.reenabled, true);
        assert.equal(value.ui.httpRestored, true);
        for (const key of [
          "realBrowser",
          "positiveNewRisk",
          "sourceIdentitiesVisible",
          "staticLimitationsVisible",
          "unknownTargetUncertified",
          "ordinaryRowsAndFiltersUnchanged",
        ])
          assert.equal(value.upgradePreview.ui[key], true, key);
        assert.equal(value.upgradePreview.routeRemovedAndRestored, true);
      }
    });
  },
);
