import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
const api = await import("../tools/business-metrics.mjs").catch(() => ({}));
const identity = {
  sampleId: "sample-a",
  suiteId: "market-actions-v1",
  artifactDigest: "a".repeat(64),
  dshVersion: "0.2.1-rc.2",
  toolVersion: "0.1.3",
};
const features = [
  {
    id: "note",
    plugin: "market",
    spans: [{ file: "client.js", start: 10, end: 20 }],
  },
];
function prediction(
  flagged = false,
  casePlan = [
    { caseId: "healthy", featureId: "note", control: "none" },
    { caseId: "blocked", featureId: "note", control: "http-503" },
  ],
) {
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-predictions",
    ...identity,
    predictedAt: "2026-10-18T01:00:00Z",
    casePlan,
    rows: [
      {
        featureId: "note",
        flagged,
        coverageLimited: true,
        clientVerified: false,
      },
    ],
  };
}
function labels(rows) {
  return {
    schemaVersion: 1,
    kind: "plugin-compat-check/business-labels",
    ...identity,
    collectedAt: "2026-10-18T01:01:00Z",
    source: "browser-action+profile-state",
    rows,
  };
}
const row = (caseId, control, observed) => ({
  caseId,
  featureId: "note",
  control,
  observed,
});
const pass = { requestStatus: 200, persisted: true, uiAfterReload: true };
const fail = { requestStatus: 503, persisted: false, uiAfterReload: false };

test("business postconditions require both durable data and visible reload result, never an ACTIVE loader label", () => {
  assert.equal(typeof api.businessOutcome, "function");
  assert.equal(api.businessOutcome(pass), "passed");
  assert.equal(api.businessOutcome(fail), "failed");
  assert.equal(
    api.businessOutcome({
      requestStatus: 200,
      persisted: false,
      uiAfterReload: false,
    }),
    "failed",
    "a 200 reply cannot hide a lost save",
  );
  assert.equal(
    api.businessOutcome({ loaderState: "ACTIVE", success: true }),
    "unobserved",
  );
  assert.equal(
    api.businessOutcome({ ...pass, harnessError: "browser died" }),
    "harness-error",
  );
});
test("feature risk never borrows a finding from an unrelated settings feature", () => {
  assert.equal(typeof api.featurePredictions, "function");
  const report = {
    toolVersion: "0.1.3",
    plugins: {
      market: {
        coverage: { status: "limited" },
        findings: [
          {
            severity: "feature-dead",
            location: { file: "settings.js", line: 12 },
            service: "settings",
            method: "register",
          },
        ],
      },
    },
  };
  assert.equal(
    api.featurePredictions(report, features, identity).rows[0].flagged,
    false,
  );
  report.plugins.market.findings.push({
    severity: "feature-dead",
    location: { file: "client.js", line: 12 },
    service: "slots",
    method: "register",
  });
  assert.equal(
    api.featurePredictions(report, features, identity).rows[0].flagged,
    true,
  );
});
test("independent outcomes score a silent business failure as FN and keep injected faults separate", () => {
  assert.equal(typeof api.scoreBusiness, "function");
  const p = prediction(false, [
    { caseId: "healthy", featureId: "note", control: "none" },
    { caseId: "blocked", featureId: "note", control: "http-503" },
    { caseId: "unknown", featureId: "note", control: "none" },
  ]);
  const before = JSON.stringify(p);
  const r = api.scoreBusiness(
    p,
    labels([
      row("healthy", "none", pass),
      row("blocked", "http-503", fail),
      row("unknown", "none", { loaderState: "FAILED" }),
    ]),
  );
  assert.equal(r.metrics.baseline.trueNegative, 1);
  assert.equal(r.metrics.baseline.unscored, 1);
  assert.equal(r.metrics.faultInjected.falseNegative, 1);
  assert.equal(r.metrics.faultInjected.scored, 1);
  assert.equal(
    JSON.stringify(p),
    before,
    "gold cannot change an already sealed prediction",
  );
  assert.equal(r.prediction.businessLabelsUsed, false);
  assert.equal(r.prediction.loaderLabelsUsed, false);
  assert.equal(api.businessExitCode(r), 1);
});
test("business risk false positives and true positives count only their own feature", () => {
  assert.equal(typeof api.scoreBusiness, "function");
  const r = api.scoreBusiness(
    prediction(true, [
      { caseId: "healthy", featureId: "note", control: "none" },
      { caseId: "broken", featureId: "note", control: "none" },
    ]),
    labels([row("healthy", "none", pass), row("broken", "none", fail)]),
  );
  assert.equal(r.metrics.baseline.falsePositive, 1);
  assert.equal(r.metrics.baseline.truePositive, 1);
  assert.equal(r.metrics.baseline.precision, 0.5);
  assert.equal(r.metrics.baseline.recall, 1);
});
test("mismatched artifact/sample/version or labels collected before predictions are rejected", () => {
  assert.equal(typeof api.scoreBusiness, "function");
  for (const edit of [
    { artifactDigest: "b".repeat(64) },
    { sampleId: "other" },
    { dshVersion: "0.2.0-rc.2" },
    { collectedAt: "2026-10-17T00:00:00Z" },
  ])
    assert.throws(
      () =>
        api.scoreBusiness(prediction(), {
          ...labels([row("healthy", "none", pass)]),
          ...edit,
        }),
      /identity|artifact|sample|version|time/i,
    );
});
test("duplicate cases, unknown features and malformed postconditions cannot silently inflate scores", () => {
  assert.equal(typeof api.scoreBusiness, "function");
  for (const rows of [
    [row("healthy", "none", pass), row("healthy", "none", pass)],
    [
      { ...row("healthy", "none", pass), featureId: "unknown" },
      row("blocked", "http-503", fail),
    ],
    [
      row("healthy", "none", { ...pass, persisted: "true" }),
      row("blocked", "http-503", fail),
    ],
  ])
    assert.throws(
      () => api.scoreBusiness(prediction(), labels(rows)),
      /case|feature|postcondition/i,
    );
  assert.throws(
    () => api.scoreBusiness(prediction(), labels([])),
    /incomplete|planned/i,
  );
});
test("business scorer CLI reports errors as code3 rather than a healthy business result", () => {
  const r = spawnSync(
    process.execPath,
    [
      "tools/business-labels.mjs",
      "--predictions",
      "/no-such-business-predictions",
      "--labels",
      "/no-such-business-labels",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 3, r.stderr);
  assert.equal(JSON.parse(r.stdout).kind, "plugin-compat-check/business-error");
});
describe(
  "real business actions in a private rc.2 host and actual Chrome",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test("notes and favorites persist; matching POST faults expose silent prediction misses", (t) => {
      const r = spawnSync(
        process.execPath,
        [
          "tools/business-labels.mjs",
          "--live",
          "--json",
          ...(process.env.DSC_BUSINESS_LIVE_DIR
            ? ["--out-dir", process.env.DSC_BUSINESS_LIVE_DIR]
            : []),
        ],
        { encoding: "utf8", timeout: 240000 },
      );
      assert.ok(r.status === 0 || r.status === 1, r.stdout + r.stderr);
      const v = JSON.parse(r.stdout);
      if (v.applicable === false) {
        t.skip(v.reason);
        return;
      }
      assert.equal(v.rows.length, 4);
      assert.deepEqual(
        v.rows.map((r) => r.outcome),
        ["passed", "failed", "passed", "failed"],
      );
      assert.equal(v.metrics.baseline.scored, 2);
      assert.equal(v.metrics.faultInjected.scored, 2);
      assert.equal(v.cleanup.privateRootRemoved, true);
      assert.equal(v.cleanup.hostStopped, true);
      assert.equal(v.prediction.businessLabelsUsed, false);
      assert.equal(v.prediction.loaderLabelsUsed, false);
    });
  },
);

test("missing one planned case or an entire feature cannot remove misses and turn a cohort green", () => {
  const p = prediction();
  p.casePlan = [
    { caseId: "healthy", featureId: "note", control: "none" },
    { caseId: "blocked", featureId: "note", control: "http-503" },
  ];
  assert.throws(
    () => api.scoreBusiness(p, labels([row("healthy", "none", pass)])),
    /incomplete|missing|planned/i,
  );
  const q = prediction();
  q.rows.push({ ...q.rows[0], featureId: "favorite" });
  q.casePlan = [
    ...p.casePlan,
    { caseId: "fav-healthy", featureId: "favorite", control: "none" },
    { caseId: "fav-blocked", featureId: "favorite", control: "http-503" },
  ];
  assert.throws(
    () =>
      api.scoreBusiness(
        q,
        labels([
          row("healthy", "none", pass),
          row("blocked", "http-503", fail),
        ]),
      ),
    /incomplete|missing|planned/i,
  );
});

test("HTTP business receipt waits for body completion and refuses a failed transport", async () => {
  const live = await import("../tools/business-live.mjs");
  assert.equal(typeof live.completedResponse, "function");
  const rows = [
    { requestId: "one", path: "/dsh-market/note", method: "POST", status: 200 },
  ];
  assert.equal(
    live.completedResponse(rows, new Set(), new Set(), "/dsh-market/note", 0),
    null,
  );
  assert.equal(
    live.completedResponse(
      rows,
      new Set(["one"]),
      new Set(),
      "/dsh-market/note",
      0,
    ).status,
    200,
  );
  assert.throws(
    () =>
      live.completedResponse(
        rows,
        new Set(),
        new Set(["one"]),
        "/dsh-market/note",
        0,
      ),
    /transport|finish/i,
  );
});

test("artifact fingerprint includes untraced files and ignores dependency installation directories", async () => {
  const { packageFingerprint } = await import("../tools/business-live.mjs");
  assert.equal(typeof packageFingerprint, "function");
  const fs = await import("node:fs"),
    os = await import("node:os"),
    path = await import("node:path");
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "dsc-business-fingerprint-"),
  );
  try {
    fs.writeFileSync(path.join(root, "a.js"), "one");
    fs.writeFileSync(path.join(root, "other.js"), "two");
    const a = packageFingerprint(root);
    assert.equal(a.files, 2);
    fs.mkdirSync(path.join(root, "node_modules"));
    fs.writeFileSync(
      path.join(root, "node_modules/cache"),
      "not part of the artifact",
    );
    assert.equal(packageFingerprint(root).digest, a.digest);
    fs.writeFileSync(path.join(root, "other.js"), "changed");
    assert.notEqual(packageFingerprint(root).digest, a.digest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "cancelling business setup stops the owned command and removes its private profile",
  { skip: process.platform === "win32", timeout: 10000 },
  async () => {
    const fs = await import("node:fs"),
      os = await import("node:os"),
      path = await import("node:path");
    const { spawn } = await import("node:child_process");
    const { once } = await import("node:events");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-business-cancel-")),
      marker = path.join(root, "owned.json");
    let child, owned;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      fs.writeFileSync(
        path.join(root, "dsh"),
        `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');fs.writeFileSync(process.env.BUSINESS_CANCEL_MARKER,JSON.stringify({pid:process.pid,root:path.dirname(process.env.DSH_HOME)}));setInterval(()=>{},1000);`,
        { mode: 0o700 },
      );
      child = spawn(
        process.execPath,
        ["tools/business-labels.mjs", "--live", "--json"],
        {
          env: {
            ...process.env,
            PATH: root + path.delimiter + process.env.PATH,
            BUSINESS_CANCEL_MARKER: marker,
          },
          stdio: "ignore",
        },
      );
      const exited = once(child, "exit");
      for (let i = 0; i < 250 && !fs.existsSync(marker); i++) await delay(20);
      assert.ok(fs.existsSync(marker), "owned command reached startup");
      owned = JSON.parse(fs.readFileSync(marker));
      child.kill("SIGTERM");
      await exited;
      assert.ok(
        !fs.existsSync(owned.root),
        "private business root is reclaimed",
      );
      assert.throws(
        () => process.kill(owned.pid, 0),
        (e) => e.code === "ESRCH",
      );
    } finally {
      if (child?.exitCode === null && child?.signalCode === null)
        child.kill("SIGKILL");
      if (owned) {
        try {
          process.kill(-owned.pid, "SIGKILL");
        } catch {}
        fs.rmSync(owned.root, { recursive: true, force: true });
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test("sidebar byte oracle catches BOM/CRLF loss even when decoded text is unchanged", async () => {
  const m = await import("../tools/business-sidebar.mjs").catch(() => ({}));
  assert.equal(typeof m.savedDocumentBytes, "function");
  assert.equal(
    m.savedDocumentBytes("A\nB\n", "utf8-bom").toString("hex"),
    "efbbbf410d0a420d0a",
  );
  assert.equal(
    m.savedDocumentBytes("A\nB\n", "utf16le").toString("hex"),
    "fffe41000d000a0042000d000a00",
  );
  assert.throws(() => m.savedDocumentBytes("A", "unknown"), /encoding/i);
});

test("live suite selection rejects unknown names before creating evidence", () => {
  const r = spawnSync(
    process.execPath,
    ["tools/business-labels.mjs", "--live", "--suite", "missing", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 3);
  assert.match(JSON.parse(r.stdout).error, /Unknown business suite/);
});

describe(
  "second real plugin: byte-preserving save and recovery",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test("sidebar editor HTTP path preserves both encodings, detects blocked saves and recovers", (t) => {
      const r = spawnSync(
        process.execPath,
        [
          "tools/business-labels.mjs",
          "--live",
          "--suite",
          "sidebar",
          "--json",
          ...(process.env.DSC_SIDEBAR_LIVE_DIR
            ? ["--out-dir", process.env.DSC_SIDEBAR_LIVE_DIR]
            : []),
        ],
        { encoding: "utf8", timeout: 240000 },
      );
      assert.ok(r.status === 0 || r.status === 1, r.stdout + r.stderr);
      const v = JSON.parse(r.stdout);
      if (v.applicable === false) {
        t.skip(v.reason);
        return;
      }
      assert.equal(v.artifacts.package, "dsh-better-sidebar");
      assert.equal(v.artifacts.version, "0.28.0");
      assert.deepEqual(
        v.rows.map((r) => r.outcome),
        ["passed", "failed", "passed", "passed", "failed", "passed"],
      );
      assert.equal(v.metrics.baseline.scored, 4);
      assert.equal(v.metrics.baseline.trueNegative, 4);
      assert.equal(v.metrics.faultInjected.falseNegative, 2);
      assert.equal(r.status, 1);
      if (process.env.DSC_SIDEBAR_LIVE_DIR) {
        const fs = process.getBuiltinModule("node:fs");
        const labels = JSON.parse(
          fs.readFileSync(process.env.DSC_SIDEBAR_LIVE_DIR + "/labels.json"),
        );
        assert.deepEqual(
          labels.rows.map((r) => r.byteEvidence.previousBytesPreserved),
          [false, true, false, false, true, false],
        );
      }
      assert.equal(v.metrics.faultInjected.scored, 2);
      assert.equal(v.cleanup.privateRootRemoved, true);
      assert.equal(v.cleanup.hostStopped, true);
      assert.equal(v.prediction.businessLabelsUsed, false);
    });
  },
);

test("navigation completion belongs to the requested new document, never the previous loaded page", async () => {
  const m = await import("../tools/business-live.mjs");
  assert.equal(typeof m.loadedNavigation, "function");
  const event = (id, name) => ({
    method: "Page.lifecycleEvent",
    params: { loaderId: id, name },
  });
  assert.equal(
    m.loadedNavigation(
      [event("old", "load"), event("new", "DOMContentLoaded")],
      "new",
    ),
    false,
  );
  assert.equal(
    m.loadedNavigation([event("old", "load"), event("new", "load")], "new"),
    true,
  );
  assert.equal(m.loadedNavigation([event("old", "load")], undefined), false);
});

describe(
  "real browser driver boundaries",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test("browser locale is explicit and a loaded preview without its heading is a business failure", async () => {
      const helpers = await import("../tools/browser-session.mjs").catch(
        () => ({}),
      );
      assert.equal(typeof helpers.configureChineseBrowser, "function");
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      const fs = await import("node:fs");
      const exe =
        process.env.DSC_CHROME ||
        [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
        ].find((p) => fs.existsSync(p));
      assert.ok(exe, "Real Chrome required");
      const browser = await launchChromePipe(exe);
      try {
        const evaluate = async (expression) =>
          (
            await browser.send("Runtime.evaluate", {
              expression,
              returnByValue: true,
              awaitPromise: true,
            })
          ).result?.value;
        const { userAgent } = await browser.send("Browser.getVersion");
        await browser.send("Network.setUserAgentOverride", {
          userAgent,
          acceptLanguage: "en-US,en",
        });
        assert.equal(await evaluate("navigator.language"), "en-US");
        await helpers.configureChineseBrowser(browser);
        assert.equal(await evaluate("navigator.language"), "zh-CN");
        await evaluate(
          'document.body.innerHTML="<p>loaded response without expected business content</p>"',
        );
        const uiAfterReload = await helpers.observeHeading(evaluate, "saved");
        assert.equal(uiAfterReload, false);
        assert.equal(
          api.businessOutcome({
            requestStatus: 200,
            persisted: true,
            uiAfterReload,
          }),
          "failed",
        );
        await evaluate('document.body.innerHTML="<h1>saved</h1>"');
        assert.equal(await helpers.observeHeading(evaluate, "saved"), true);
      } finally {
        await browser.close();
      }
    });
  },
);
