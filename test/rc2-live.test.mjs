import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

describe(
  "rc.2/rc.3 actual declarations, subpath metadata and UI lifecycle",
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
      if (value.applicable === false) {
        assert.notEqual(process.env.DSC_ACCEPTANCE_DSH_VERSION, "0.2.1-rc.3");
        return;
      }
      if (value.dshVersion === "0.2.1-rc.3") {
        assert.equal(value.ui.available, true);
        assert.equal(value.noCredentialDiscovery, true);
        for (const key of [
          "firstUseWait",
          "failureFallback",
          "lastGoodRetained",
          "deadline",
        ])
          assert.equal(value.modelListing[key], true, key);
        assert.equal(value.modelListing.productionRequests, 0);
        assert.equal(value.modelListing.modelCalls, 0);
        assert.equal(value.rc3Navigation.menus.length, 3);
        assert.equal(value.rc3Navigation.createDraftOnly, true);
      }
      assert.equal(value.declarationCases.length, 5);
      assert.ok(value.declarationCases.every((x) => x.matched));
      assert.equal(value.hostToolSkill, true);
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
        assert.deepEqual(
          value.upgradePreview.ui.requests.map((r) => r.targetVersion),
          ["0.2.0-rc.2", "9.9.9"],
        );
        assert.ok(
          value.upgradePreview.ui.requests.every(
            (r) => r.status === 200 && r.finished && !r.failed,
          ),
        );
        assert.equal(value.upgradePreview.routeRemovedAndRestored, true);
        for (const key of [
          "realBrowser",
          "dependencyView",
          "manualReviewPersisted",
          "ordinaryReportUnchanged",
          "baselineUnchanged",
          "healthImportAvailable",
        ])
          assert.equal(value.p2Workflows[key], true, key);
      }
    });
  },
);

import fs from "node:fs";
import { createServer } from "node:http";
import { launchChromePipe } from "../lib/debugger.mjs";
import {
  submitUpgradeTarget,
  upgradeRequestReceipts,
  reportResponseReceipts,
  refreshVisibleReport,
} from "../tools/browser-session.mjs";

test("upgrade request evidence tracks completion and failure without retaining private URLs or headers", async () => {
  const events = [
    {
      method: "Network.requestWillBeSent",
      params: {
        requestId: "1",
        request: {
          url: "http://127.0.0.1:12/plugin-compat-check/upgrade-preview?targetVersion=0.2.0-rc.2&currentVersion=0.2.1-rc.2&token=secret",
          headers: { Authorization: "secret" },
        },
      },
    },
    {
      method: "Network.responseReceived",
      params: {
        requestId: "1",
        response: { status: 503, headers: { private: "secret" } },
      },
    },
    { method: "Network.loadingFinished", params: { requestId: "1" } },
    {
      method: "Network.requestWillBeSent",
      params: {
        requestId: "2",
        request: {
          url: "http://127.0.0.1:12/plugin-compat-check/upgrade-preview?targetVersion=9.9.9",
        },
      },
    },
    {
      method: "Network.loadingFailed",
      params: { requestId: "2", errorText: "secret" },
    },
  ];
  const receipts = upgradeRequestReceipts(events);
  assert.deepEqual(receipts, [
    {
      targetVersion: "0.2.0-rc.2",
      currentVersion: "0.2.1-rc.2",
      status: 503,
      finished: true,
      failed: false,
    },
    {
      targetVersion: "9.9.9",
      currentVersion: null,
      status: null,
      finished: false,
      failed: true,
    },
  ]);
  assert.doesNotMatch(
    JSON.stringify(receipts),
    /secret|127\.0\.0\.1|Authorization/,
  );
  assert.deepEqual(upgradeRequestReceipts(events, events.length), []);
  const body = {
    computedAt: "2026-10-23T01:02:03.000Z",
    nodeModules: "/private/secret",
    report: { secret: "private source" },
    reviews: { contextToken: "secret" },
  };
  const chrome = {
    events: [
      {
        method: "Network.requestWillBeSent",
        params: {
          requestId: "report",
          request: {
            url: "http://127.0.0.1:12/plugin-compat-check/report?token=secret",
          },
        },
      },
      { method: "Network.loadingFinished", params: { requestId: "report" } },
    ],
    send: async (method, { requestId }) => {
      assert.equal(method, "Network.getResponseBody");
      assert.equal(requestId, "report");
      return { body: JSON.stringify(body) };
    },
  };
  const reports = await reportResponseReceipts(chrome);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].computedAt, body.computedAt);
  assert.match(reports[0].reportSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(
    JSON.stringify(reports),
    /secret|127\.0\.0\.1|private source/,
  );
  body.report.secret = "changed source";
  assert.notEqual(
    (await reportResponseReceipts(chrome))[0].reportSha256,
    reports[0].reportSha256,
  );
  chrome.events.push(
    ...Array.from({ length: 30 }, (_, i) => [
      {
        method: "Network.requestWillBeSent",
        params: {
          requestId: String(i),
          request: {
            url: "http://localhost/plugin-compat-check/report?metadata=1",
          },
        },
      },
      { method: "Network.loadingFinished", params: { requestId: String(i) } },
    ]).flat(),
  );
  chrome.send = async () => {
    throw Error("secret transport failure");
  };
  assert.equal((await reportResponseReceipts(chrome)).length, 24);
  assert.ok(
    (await reportResponseReceipts(chrome)).every(
      (r) => r.unavailable && r.metadata,
    ),
  );
});

test("visible report readiness waits for refresh completion and the matching rendered report", async () => {
  const events = [],
    order = [];
  const data = { ok: true, computedAt: "2026-10-23T06:00:00.000Z" };
  const chrome = {
    events,
    send: async () => {
      order.push("body");
      return { body: JSON.stringify(data) };
    },
  };
  const evaluate = async (expression) => {
    if (expression.endsWith(".click()")) {
      order.push("click");
      events.push({
        method: "Network.requestWillBeSent",
        params: {
          requestId: "refresh",
          request: {
            url: "http://localhost/plugin-compat-check/report?refresh=1",
          },
        },
      });
      return;
    }
    assert.ok(expression.includes(data.computedAt));
    order.push("rendered");
    return true;
  };
  const poll = async (fn) => {
    if (!(await fn())) {
      assert.deepEqual(order, ["click"]);
      order.push("finished");
      events.push({
        method: "Network.loadingFinished",
        params: { requestId: "refresh" },
      });
      assert.equal(await fn(), true);
    }
  };
  assert.deepEqual(await refreshVisibleReport(chrome, evaluate, poll), data);
  assert.deepEqual(order, ["click", "finished", "body", "rendered"]);
  events.length = 0;
  order.length = 0;
  chrome.send = async () => ({
    body: JSON.stringify({ ...data, cache: { stale: true } }),
  });
  await assert.rejects(
    refreshVisibleReport(chrome, evaluate, poll),
    /current successful evidence/,
  );
});

test(
  "real Chrome delayed form commit reproduces the ignored old click and starts exactly one synchronized request",
  {
    skip: process.env.DSC_SLOW !== "1",
    timeout: 30000,
  },
  async () => {
    const executable =
      process.env.DSC_CHROME ||
      [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
      ].find((p) => fs.existsSync(p));
    assert.ok(
      executable,
      "Real Chrome is required for controlled upgrade submission acceptance",
    );
    let browser,
      requestCount = 0;
    const server = createServer((req, res) => {
      if (req.url.startsWith("/plugin-compat-check/upgrade-preview")) {
        requestCount++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<div data-upgrade-preview><input aria-label="目标 DSH 版本"><button disabled>运行升级预检</button></div>
      <script>
      const input = document.querySelector('input'), button = document.querySelector('button');
      let pending = '', committed = '';
      input.oninput = () => { pending = input.value; button.disabled = true; };
      window.commit = () => { committed = pending; button.disabled = !committed; };
      button.onclick = () => fetch('/plugin-compat-check/upgrade-preview?targetVersion=' + committed + '&currentVersion=0.2.1-rc.2');
      </script>`);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      browser = await launchChromePipe(executable);
      await browser.send("Network.enable");
      await browser.send("Page.navigate", {
        url: `http://127.0.0.1:${server.address().port}`,
      });
      const evaluate = async (expression) =>
        (
          await browser.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          })
        ).result?.value;
      const poll = async (fn, message, timeout = 5000) => {
        const end = Date.now() + timeout;
        do {
          if (await fn()) return;
          await new Promise((resolve) => setTimeout(resolve, 10));
        } while (Date.now() < end);
        throw Error(message);
      };
      await poll(
        () => evaluate("Boolean(window.commit)"),
        "Control page did not load",
      );
      await evaluate("document.querySelector('input').focus()");
      await browser.send("Input.insertText", { text: "0.2.0-rc.2" });
      assert.equal(
        await evaluate("document.querySelector('button').disabled"),
        true,
      );
      // RED control: the old immediate click returns successfully but cannot submit.
      await evaluate("document.querySelector('button').click()");
      assert.equal(requestCount, 0);
      assert.deepEqual(upgradeRequestReceipts(browser.events), []);
      let readinessPolls = 0;
      const delayedCommitPoll = (fn, message, timeout) =>
        poll(
          async () => {
            const ready = await fn();
            if (message.includes("form did not commit")) {
              readinessPolls++;
              if (readinessPolls === 3) await evaluate("window.commit()");
            }
            return ready;
          },
          message,
          timeout,
        );
      await submitUpgradeTarget(
        browser,
        evaluate,
        delayedCommitPoll,
        "0.2.0-rc.2",
      );
      assert.ok(
        readinessPolls >= 4,
        "Must wait for the delayed controlled state commit",
      );
      await poll(
        () => upgradeRequestReceipts(browser.events).some((r) => r.finished),
        "Request did not finish",
      );
      assert.equal(requestCount, 1);
      assert.equal(upgradeRequestReceipts(browser.events)[0].status, 200);
    } finally {
      await browser?.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
