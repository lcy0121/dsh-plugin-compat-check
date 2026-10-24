import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("a loaded market card missing its action is a business failure without inventing an HTTP receipt", () => {
  const observed = {
    actionAvailable: false,
    persisted: false,
    uiAfterReload: false,
  };
  assert.equal(api.businessOutcome(observed), "failed");
  const p = prediction(false, [
    { caseId: "missing", featureId: "note", control: "dom-control-missing" },
  ]);
  const result = api.scoreBusiness(
    p,
    labels([row("missing", "dom-control-missing", observed)]),
  );
  assert.equal(result.metrics.faultInjected.falseNegative, 1);
  assert.equal(api.businessExitCode(result), 1);
  assert.throws(
    () => api.businessOutcome({ ...pass, actionAvailable: false }),
    /receipt|contradict/i,
  );
  assert.throws(
    () => api.businessOutcome({ actionAvailable: "false" }),
    /postcondition/i,
  );
});

test("naturally absent market actions retain baseline failures and exclude unestablished controls", async () => {
  const { marketCases } = await import("../tools/business-market.mjs");
  const rows = await marketCases(
    {
      evalx: async () => false,
      openMarket: async () => {},
      disk: () => ({}),
      entry: { url: "target" },
      screenshot: async () => {},
      armFault: async () => {
        throw Error("No available action");
      },
    },
    [{ id: "market.favorite" }],
  );
  assert.equal(rows.length, 5);
  assert.deepEqual(
    rows.map((r) => r.outcome),
    ["failed", "harness-error", "harness-error", "harness-error", "failed"],
  );
  assert.ok(rows.every((r) => r.observed.requestStatus === undefined));
});

test("interrupted or unsuccessful model turns cannot satisfy a completed response", async () => {
  const { assistantReceipt } = await import("../tools/business-model.mjs");
  const start = { type: "turn/start", data: { turn: 2 } };
  const message = {
    type: "assistant/message",
    data: { message: { content: [{ type: "text", text: "ACK" }] } },
  };
  const end = (kind) => ({
    type: "turn/end",
    data: { turn: 2, reason: { kind } },
  });
  assert.equal(
    assistantReceipt([start, message, end("completed")], "ACK").matches,
    true,
  );
  assert.equal(
    assistantReceipt(
      [
        start,
        { ...message, data: { ...message.data, interrupted: true } },
        end("completed"),
      ],
      "ACK",
    ).matches,
    false,
  );
  for (const kind of ["aborted", "error", "blocked", "max-tokens"])
    assert.equal(
      assistantReceipt([start, message, end(kind)], "ACK").matches,
      false,
    );
  assert.equal(
    assistantReceipt(
      [message, end("completed"), start, end("completed")],
      "ACK",
    ).matches,
    false,
  );
});

test("owned model policy denies tools and admits at most two first steps", async () => {
  const { installModelBudget } = await import("../tools/business-sidebar.mjs");
  const handlers = new Map();
  let guard,
    count = 0;
  installModelBudget(
    {
      on: (name, fn) => handlers.set(name, fn),
      tools: {
        guard: (fn) => {
          guard = fn;
        },
      },
    },
    () => {
      count++;
    },
  );
  assert.equal(typeof guard({}), "string");
  const assembly = await handlers.get("system-prompt/assemble")(
    {},
    {},
    async () => ({ tools: [{ name: "bash" }], variables: { model: "chosen" } }),
  );
  assert.deepEqual(assembly.tools, []);
  assert.equal(assembly.variables.model, "chosen");
  const admit = handlers.get("agent/pre-step");
  const agent = { session: { header: { parentSession: "business-sidebar" } } };
  const next = async () => ({ kind: "enter", messages: [{}] });
  assert.equal((await admit({ agent, step: 1 }, next)).kind, "enter");
  assert.equal((await admit({ agent, step: 2 }, next)).kind, "reject");
  assert.equal(
    (await admit({ agent: { session: { header: {} } }, step: 1 }, next)).kind,
    "reject",
  );
  assert.equal((await admit({ agent, step: 1 }, next)).kind, "enter");
  assert.equal((await admit({ agent, step: 1 }, next)).kind, "reject");
  assert.equal(count, 2);
});

test("reappearing market controls invalidate DOM fault establishment", async () => {
  const { marketCases } = await import("../tools/business-market.mjs");
  const rows = await marketCases(
    {
      evalx: async () => true,
      openMarket: async () => {},
      disk: () => ({}),
      entry: { url: "target" },
      armFault: async () => 0,
      finishRequest: async () => ({ status: 200 }),
      screenshot: async () => {},
    },
    [{ id: "market.favorite" }],
  );
  assert.equal(rows[2].outcome, "harness-error");
  assert.equal(rows[3].outcome, "harness-error");
});

test("a sidebar file-tree precondition failure preserves all cases without claiming an injected save fault", async () => {
  const { editorCases } = await import("../tools/business-sidebar-ui.mjs");
  const fs = await import("node:fs"),
    os = await import("node:os");
  const workspace = fs.mkdtempSync(
    join(os.tmpdir(), "dsc-editor-unavailable-"),
  );
  try {
    fs.writeFileSync(
      join(workspace, "fixture.json"),
      JSON.stringify({ stage: "ready" }),
    );
    const rows = await editorCases({
      workspace,
      suite: "sidebar-ui",
      url: "http://owned.invalid",
      navigate: async () => {},
      click: async () => {},
      screenshot: async () => {},
      resetResponseWindow: () => {},
      responseRows: () => [
        {
          completed: true,
          method: "POST",
          path: "/sidebar/api/fs.trees",
          status: 405,
        },
      ],
      poll: async (fn) => {
        const value = await fn();
        assert.ok(value);
        return value;
      },
      evalx: async (source) =>
        source.includes("explorerError")
          ? ["HTTP 405"]
          : source.includes("data-row-key") ||
            source.includes("data-dsh-bottom-toggle") ||
            source.includes("data-dsh-bottom-panel"),
    });
    assert.deepEqual(
      rows.map((r) => r.control),
      ["none", "http-503", "none", "none", "http-503", "none"],
    );
    assert.deepEqual(
      rows.map((r) => r.outcome),
      [
        "failed",
        "harness-error",
        "failed",
        "failed",
        "harness-error",
        "failed",
      ],
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("model acceptance copies only the selected credential into an owned private home and never returns it", async () => {
  const m = await import("../tools/business-model.mjs").catch(() => ({}));
  assert.equal(typeof m.prepareModelProfile, "function");
  const fs = await import("node:fs"),
    os = await import("node:os"),
    path = await import("node:path");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-model-scope-"));
  try {
    const source = path.join(root, "source/profiles/desktop"),
      home = path.join(root, "owned"),
      profile = path.join(home, "profiles/business");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(
      path.join(source, "cordis.patch.yml"),
      "- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: deepseek-flash\n",
    );
    const sentinel = ["test", "only", "selected", "key"].join("-");
    const unrelated = ["test", "only", "private", "key"].join("-");
    const original = `version: 1\nrefs:\n  DEEPSEEK_API_KEY: ${sentinel}\n  UNRELATED_KEY: ${unrelated}\n`;
    const credentials = path.join(root, "source/.credentials.yaml");
    fs.writeFileSync(credentials, original, { mode: 0o600 });
    const info = m.prepareModelProfile(source, home, profile);
    assert.equal(info.model, "deepseek-flash");
    assert.ok(!JSON.stringify(info).includes("test-only"));
    const copied = fs.readFileSync(
      path.join(home, ".credentials.yaml"),
      "utf8",
    );
    assert.ok(copied.includes(sentinel));
    assert.ok(!copied.includes(unrelated));
    assert.equal(
      fs.statSync(path.join(home, ".credentials.yaml")).mode & 0o777,
      0o600,
    );
    assert.equal(fs.readFileSync(credentials, "utf8"), original);
    assert.match(
      fs.readFileSync(path.join(profile, "cordis.patch.yml"), "utf8"),
      /session-title-llm/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("model gold ignores prompt echoes and reasoning, requiring a durable assistant text response", async () => {
  const m = await import("../tools/business-model.mjs");
  assert.equal(typeof m.assistantReceipt, "function");
  const prompt = {
    type: "user/message",
    data: { content: [{ type: "text", text: "ACK42" }] },
  };
  assert.equal(m.assistantReceipt([prompt], "ACK42").matches, false);
  const response = {
    type: "assistant/message",
    data: {
      message: {
        content: [
          { type: "reasoning", text: "ACK42" },
          { type: "text", text: "wrong" },
        ],
      },
      usage: { inputTokens: 9, outputTokens: 2 },
    },
  };
  assert.equal(m.assistantReceipt([prompt, response], "ACK42").matches, false);
  response.data.message.content[1].text = "ACK42";
  assert.equal(
    m.assistantReceipt(
      [
        { type: "turn/start", data: { turn: 1 } },
        prompt,
        { type: "request/header", data: {} },
        response,
        { type: "turn/end", data: { reason: { kind: "completed" } } },
      ],
      "ACK42",
    ).matches,
    true,
  );
  assert.deepEqual(
    m.assistantReceipt(
      [{ type: "request/header", data: {} }, response],
      "ACK42",
    ).usage,
    { inputTokens: 9, outputTokens: 2 },
  );
  const two = m.assistantReceipt(
    [{ type: "request/header", data: {} }, response, response],
    "ACK42",
  );
  assert.equal(two.requestHeaders, 1);
  assert.equal(two.assistantMessages, 2);
  assert.equal(m.assistantReceipt([], "ACK42").usage, null);
});

test("a child without the configured provider/model is a fixture error before any billable prompt", async () => {
  const m = await import("../tools/business-model.mjs");
  assert.equal(typeof m.requireModelSelection, "function");
  const selected = {
    provider: "deepseek-official",
    model: "deepseek-flash",
    reasoningEffort: "off",
  };
  assert.throws(() => m.requireModelSelection({}, selected), /selection/i);
  assert.throws(
    () => m.requireModelSelection({ ...selected, model: "other" }, selected),
    /selection/i,
  );
  assert.doesNotThrow(() => m.requireModelSelection(selected, selected));
});

test("editor precondition failure needs both a loaded UI error and a completed matching filesystem response", async () => {
  const m = await import("../tools/business-sidebar-ui.mjs");
  assert.equal(typeof m.editorLoadFailure, "function");
  const response = {
    path: "/sidebar/api/fs.treeBatch",
    method: "POST",
    status: 405,
    completed: true,
  };
  assert.deepEqual(m.editorLoadFailure(["HTTP 405"], [response]), {
    path: "/sidebar/api/fs.treeBatch",
    status: 405,
    method: "POST",
  });
  assert.equal(m.editorLoadFailure([], [response]), null);
  assert.equal(
    m.editorLoadFailure(["HTTP 405"], [{ ...response, completed: false }]),
    null,
  );
  assert.equal(
    m.editorLoadFailure(["HTTP 405"], [{ ...response, path: "/unrelated" }]),
    null,
  );
  assert.equal(m.editorLoadFailure(["HTTP 500"], [response]), null);
});

test("model live suite requires an explicit source profile before touching credentials or starting a host", () => {
  const r = spawnSync(
    process.execPath,
    [
      "tools/business-labels.mjs",
      "--live",
      "--suite",
      "sidebar-model",
      "--json",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 3);
  assert.match(JSON.parse(r.stdout).error, /model-profile/i);
});

describe(
  "explicit real model business acceptance",
  { skip: process.env.DSC_MODEL_LIVE !== "1" },
  () => {
    test("side chat sends two bounded prompts and persists actual assistant replies across reload", () => {
      assert.ok(
        process.env.DSC_MODEL_PROFILE,
        "Explicit model source profile required",
      );
      const r = spawnSync(
        process.execPath,
        [
          "tools/business-labels.mjs",
          "--live",
          "--suite",
          "sidebar-model",
          "--model-profile",
          process.env.DSC_MODEL_PROFILE,
          "--json",
          ...(process.env.DSC_MODEL_LIVE_DIR
            ? ["--out-dir", process.env.DSC_MODEL_LIVE_DIR]
            : []),
        ],
        { encoding: "utf8", timeout: 360000 },
      );
      assert.ok(r.status === 0 || r.status === 1, r.stdout + r.stderr);
      const v = JSON.parse(r.stdout);
      assert.equal(v.rows.length, 2);
      assert.equal(v.metrics.baseline.scored, 2);
      assert.equal(v.cleanup.privateRootRemoved, true);
      assert.deepEqual(
        v.rows.map((r) => r.outcome),
        ["passed", "passed"],
      );
      assert.equal(v.controls.model.providerStepLimit, 2);
      assert.equal(v.controls.model.toolsAllowed, false);
      if (process.env.DSC_MODEL_LIVE_DIR) {
        const evidence = JSON.parse(
          readFileSync(
            join(process.env.DSC_MODEL_LIVE_DIR, "labels.json"),
            "utf8",
          ),
        );
        assert.equal(evidence.rows.at(-1).modelEvidence.budget.admitted, 2);
        assert.equal(evidence.rows.at(-1).modelEvidence.interruptedAttempts, 0);
      }
      assert.equal(v.prediction.businessLabelsUsed, false);
    });
  },
);

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
      assert.equal(v.rows.length, 10);
      assert.deepEqual(
        v.rows.map((r) => r.outcome),
        [
          "passed",
          "failed",
          "failed",
          "failed",
          "passed",
          "passed",
          "failed",
          "failed",
          "failed",
          "passed",
        ],
      );
      assert.equal(v.metrics.baseline.scored, 4);
      assert.equal(v.metrics.faultInjected.scored, 6);
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
        `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const marker=${JSON.stringify(marker)};fs.writeFileSync(marker+'.tmp',JSON.stringify({pid:process.pid,root:path.dirname(process.env.DSH_HOME)}));fs.renameSync(marker+'.tmp',marker);setInterval(()=>{},1000);`,
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

test("service-only predictions are explicit and cannot silently change non-editor or replay modes", () => {
  for (const args of [
    ["--live", "--suite", "sidebar", "--observe-services"],
    [
      "--predictions",
      "absent.json",
      "--labels",
      "absent.json",
      "--observe-services",
    ],
  ]) {
    const r = spawnSync(
      process.execPath,
      ["tools/business-labels.mjs", ...args, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 3);
    assert.match(JSON.parse(r.stdout).error, /editor|live/i);
  }
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

describe(
  "real sidebar editor widgets across published versions",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    for (const suite of ["sidebar-ui", "sidebar-ui-previous"])
      test(
        suite + " edits and saves through CodeMirror and reloads durable bytes",
        (t) => {
          const r = spawnSync(
            process.execPath,
            [
              "tools/business-labels.mjs",
              "--live",
              "--suite",
              suite,
              "--json",
              "--observe-services",
              ...(process.env.DSC_EDITOR_LIVE_ROOT
                ? ["--out-dir", process.env.DSC_EDITOR_LIVE_ROOT + "/" + suite]
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
          const previous = suite === "sidebar-ui-previous";
          assert.equal(v.rows.length, previous ? 2 : 6);
          assert.equal(v.metrics.baseline.scored, previous ? 2 : 4);
          assert.equal(v.metrics.faultInjected.scored, previous ? 0 : 2);
          assert.deepEqual(
            v.rows.map((r) => r.outcome),
            previous
              ? ["failed", "failed"]
              : ["passed", "failed", "passed", "passed", "failed", "passed"],
          );
          assert.equal(v.serviceObserved.prediction.loaderLabelsUsed, false);
          assert.equal(v.serviceObserved.prediction.sealedBeforeActions, true);
          assert.equal(
            v.serviceObserved.metrics.baseline.truePositive,
            previous ? 2 : 0,
          );
          assert.equal(
            v.serviceObserved.metrics.baseline.trueNegative,
            previous ? 0 : 4,
          );
          assert.equal(v.serviceObserved.metrics.baseline.falseNegative, 0);
          assert.equal(v.serviceObserved.metrics.baseline.falsePositive, 0);
          assert.notEqual(v.serviceObserved.artifactDigest, v.artifactDigest);
          assert.equal(v.cleanup.privateRootRemoved, true);
          assert.equal(v.prediction.sealedBeforeActions, true);
        },
      );
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
    test("editor navigation reuses a restored Files tab and ignores hidden entry buttons", async () => {
      const { openEditorFile } = await import(
        "../tools/business-sidebar-ui.mjs"
      );
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      const fs = await import("node:fs");
      const browser = await launchChromePipe(
        process.env.DSC_CHROME ||
          [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
          ].find((p) => fs.existsSync(p)),
      );
      const evalx = async (expression) => {
        const r = await browser.send("Runtime.evaluate", {
          expression,
          returnByValue: true,
        });
        assert.equal(r.exceptionDetails, undefined);
        return r.result?.value;
      };
      const poll = async (fn, message) => {
        const end = Date.now() + 1000;
        do {
          const v = await fn();
          if (v) return v;
          await new Promise((r) => setTimeout(r, 20));
        } while (Date.now() < end);
        throw Error(message);
      };
      const file = "/owned/utf16le.txt";
      try {
        for (const entry of [
          '<div data-dsh-bottom-panel><div title="文件" draggable="true" onclick="openFile()">文件</div></div>',
          '<button style="display:none">文件</button><button onclick="openFile()">文件</button>',
        ]) {
          await evalx(`document.body.innerHTML=${JSON.stringify(entry)};
            window.openFile=()=>{document.body.dataset.opened=String(Number(document.body.dataset.opened||0)+1);document.body.insertAdjacentHTML('beforeend',${JSON.stringify('<input title="/owned/utf16le.txt"><div class="cm-content" contenteditable="true">editable</div>')})};delete document.body.dataset.opened;`);
          const opened = await openEditorFile(
            {
              evalx,
              poll,
              chrome: browser,
              click: () =>
                poll(
                  () =>
                    evalx(
                      `(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='文件');if(!b||!b.getClientRects().length)return false;b.click();return true;})()`,
                    ),
                  "Missing business control: 文件",
                ),
              responseRows: () => [],
            },
            file,
          );
          assert.deepEqual(opened, { available: true });
          assert.equal(await evalx("document.body.dataset.opened"), "1");
        }
      } finally {
        await browser.close();
      }
    });
    test("explicit editor reload confirms a real dirty-document beforeunload dialog", async () => {
      const helpers = await import("../tools/browser-session.mjs");
      assert.equal(typeof helpers.navigateOwnedDocument, "function");
      const http = await import("node:http"),
        fs = await import("node:fs");
      const server = http.createServer((req, res) =>
        res.end(
          '<button style="width:100px;height:100px">activate</button><script>onbeforeunload=()=>"unsaved"</script>',
        ),
      );
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      const browser = await launchChromePipe(
        process.env.DSC_CHROME ||
          [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
          ].find((p) => fs.existsSync(p)),
      );
      const poll = async (fn, message) => {
        const end = Date.now() + 10000;
        do {
          const v = await fn();
          if (v) return v;
          await new Promise((r) => setTimeout(r, 20));
        } while (Date.now() < end);
        throw Error(message);
      };
      try {
        await browser.send("Page.enable");
        await browser.send("Page.setLifecycleEventsEnabled", { enabled: true });
        const url = "http://127.0.0.1:" + server.address().port;
        await helpers.navigateOwnedDocument(browser, url, poll);
        await browser.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x: 20,
          y: 20,
          button: "left",
          clickCount: 1,
        });
        await browser.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: 20,
          y: 20,
          button: "left",
          clickCount: 1,
        });
        const n = await helpers.navigateOwnedDocument(
          browser,
          url + "?fresh",
          poll,
          { discardChanges: true },
        );
        assert.equal(n.discardedBeforeUnload, 1);
        assert.equal(
          (
            await browser.send("Runtime.evaluate", {
              expression: "location.search",
              returnByValue: true,
            })
          ).result.value,
          "?fresh",
        );
      } finally {
        await browser.close();
        await new Promise((r) => server.close(r));
      }
    });
    test("market navigation waits for the new installed-state response without requiring a healthy business value", async () => {
      const m = await import("../tools/business-market.mjs");
      const helpers = await import("../tools/browser-session.mjs");
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      const { createServer } = await import("node:http");
      const fs = await import("node:fs");
      let pending;
      const server = createServer((req, res) => {
        if (req.url === "/dsh-market/installed") {
          pending = res;
          return;
        }
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(`<div data-dsh-market-root data-dsh-market-tab="discover"><div class="x_card"><a title="dsh-plugin-compat-check">target</a><button aria-label="加入收藏">favorite</button></div></div><script>
          fetch('/dsh-market/installed').then(r=>r.json()).then(v=>requestAnimationFrame(()=>{
            const button=document.querySelector('button');
            if(v.mode==='saved') button.setAttribute('aria-label','取消收藏');
            if(v.mode==='missing-control') button.remove();
          }));
        </script>`);
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const browser = await launchChromePipe(
        process.env.DSC_CHROME ||
          [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
          ].find((p) => fs.existsSync(p)),
      );
      try {
        await browser.send("Page.enable");
        await browser.send("Page.setLifecycleEventsEnabled", { enabled: true });
        await browser.send("Network.enable");
        const evalx = async (expression) => {
          const r = await browser.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          assert.equal(r.exceptionDetails, undefined);
          return r.result?.value;
        };
        const poll = async (fn, message) => {
          const until = Date.now() + 5000;
          do {
            if (await fn()) return true;
            await new Promise((resolve) => setTimeout(resolve, 20));
          } while (Date.now() < until);
          throw Error(message);
        };
        assert.equal(typeof m.openMarketDocument, "function");
        for (const mode of [
          "saved",
          "missing-value",
          "missing-control",
          "request-failed",
        ]) {
          pending = null;
          let settled = false;
          const opening = m.openMarketDocument(
            {
              chrome: browser,
              evalx,
              poll,
              navigate: (url) =>
                helpers.navigateOwnedDocument(browser, url, poll),
            },
            `http://127.0.0.1:${server.address().port}/${mode}`,
            "discover",
          );
          opening.then(
            () => {
              settled = true;
            },
            () => {
              settled = true;
            },
          );
          await poll(
            async () =>
              pending &&
              (await evalx(`(${m.marketNavigationStep})('discover')`)),
            "Card/state request did not start",
          );
          assert.equal(
            await evalx(`(${m.marketControl})('market.favorite','value',true)`),
            false,
          );
          assert.equal(
            settled,
            false,
            "Card presence must not admit an unfinished state read or an old document's receipt",
          );
          pending.writeHead(mode === "request-failed" ? 503 : 200, {
            "content-type": "application/json",
          });
          pending.end(JSON.stringify({ mode }));
          if (mode === "request-failed")
            await assert.rejects(opening, /installed-state.*503/i);
          else {
            await opening;
            assert.equal(
              await evalx(
                `(${m.marketControl})('market.favorite','value',true)`,
              ),
              mode === "saved",
            );
          }
        }
      } finally {
        pending?.end();
        await browser.close();
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });
    test("market navigation accepts a loaded target card without controls and never borrows another card's action", async () => {
      const m = await import("../tools/business-market.mjs").catch(() => ({}));
      assert.equal(typeof m.marketNavigationStep, "function");
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      const fs = await import("node:fs");
      const browser = await launchChromePipe(
        process.env.DSC_CHROME ||
          [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium",
          ].find((p) => fs.existsSync(p)),
      );
      try {
        const evaluate = async (expression) => {
          const r = await browser.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          });
          assert.equal(r.exceptionDetails, undefined);
          return r.result?.value;
        };
        await evaluate(
          `document.body.innerHTML=${JSON.stringify('<div data-dsh-market-root data-dsh-market-tab="installed"><div class="x_irow"><a title="unrelated">unrelated</a><button>添加备注</button></div><div class="x_irow"><a title="dsh-plugin-compat-check">target</a></div></div>')}`,
        );
        assert.equal(
          await evaluate(`(${m.marketNavigationStep})('installed')`),
          true,
        );
        assert.equal(
          await evaluate(`(${m.marketControl})('market.note','observe')`),
          false,
        );
        const missing = { actionAvailable: false };
        assert.equal(api.businessOutcome(missing), "failed");
        await evaluate(
          `document.querySelector('a[title="dsh-plugin-compat-check"]').parentElement.insertAdjacentHTML('beforeend','<button>编辑备注</button>')`,
        );
        assert.equal(
          await evaluate(`(${m.marketControl})('market.note','observe')`),
          true,
        );
        assert.equal(
          await evaluate(`(${m.marketControl})('market.note','remove')`),
          true,
        );
        assert.equal(
          await evaluate(`(${m.marketNavigationStep})('installed')`),
          true,
        );
        assert.equal(
          await evaluate(`(${m.marketControl})('market.note','observe')`),
          false,
        );
        assert.equal(
          await evaluate("document.querySelector('button').innerText"),
          "添加备注",
        );
        await evaluate(
          `document.body.innerHTML=${JSON.stringify('<div data-dsh-market-root><div class="x_card"><a title="unrelated">desired-note</a><button aria-label="取消收藏">添加备注</button></div><div class="x_card"><a title="dsh-plugin-compat-check">target</a><button aria-label="加入收藏">添加备注</button></div></div>')}`,
        );
        assert.equal(
          await evaluate(
            `(${m.marketControl})('market.favorite','value',true)`,
          ),
          false,
        );
        assert.equal(
          await evaluate(
            `(${m.marketControl})('market.note','value','desired-note')`,
          ),
          false,
        );
        await evaluate(
          `document.querySelector('a[title="dsh-plugin-compat-check"]').parentElement.querySelector('button').setAttribute('aria-label','取消收藏')`,
        );
        assert.equal(
          await evaluate(
            `(${m.marketControl})('market.favorite','value',true)`,
          ),
          true,
        );
        assert.equal(
          api.businessOutcome({ ...pass, uiAfterReload: false }),
          "failed",
        );
      } finally {
        await browser.close();
      }
    });
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
