import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { acquireStateLock } from "../lib/state-lock.mjs";

// Removing record persistence, stale identity checks, or input limits must break these tests.
import * as Store from "../lib/finding-review-store.mjs";
import * as Pure from "../lib/finding-review.mjs";
import * as Panel from "../lib/workflow-panels.mjs";
const fixtureReport = () => ({
  toolVersion: "0.1.4",
  dshVersion: "0.2.1-rc.2",
  inputs: { nm: "/profile/node_modules" },
  observation: { mode: "catalogue", profileId: "/profile/node_modules" },
  summary: { fatal: 1 },
  plugins: {
    demo: {
      version: "1.0.0",
      findings: [
        {
          category: "host-method-missing",
          service: "services",
          method: "missing",
          severity: "fatal",
          certainty: "certain",
          location: { file: "index.js", line: 2, start: 5, end: 12 },
          evidence: { state: "MISSING" },
          basis: "current evidence",
        },
      ],
    },
  },
});
async function fixture(t) {
  assert.equal(
    typeof Store.reviewContext,
    "function",
    "reviewContext API exists",
  );
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-reviews-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const nm = path.join(home, "profile", "node_modules");
  await fs.mkdir(nm, { recursive: true });
  const report = fixtureReport(),
    opts = {
      nodeModules: nm,
      rulesIdentity: "rules-a",
      catalogIdentity: "catalog-a",
      sourceIdentity: "source-a",
    };
  const context = await Store.reviewContext(report, opts);
  return { home, nm, report, opts, context, io: { dshHome: home } };
}
const body = (reviews, patch = {}) => ({
  contextToken: reviews.contextToken,
  findingId: reviews.items[0].findingId,
  status: "false-positive",
  note: "Checked source and host behavior.",
  ...patch,
});

test(
  "reviews and baseline locks reject an existing shared-mode directory without chmod or state writes",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = await fixture(t),
      initial = await Store.readReviews(f.context, f.io),
      dir = path.join(f.home, "dsh-plugin-compat-check");
    await fs.mkdir(dir, { mode: 0o755 });
    await fs.chmod(dir, 0o755);
    await fs.writeFile(path.join(dir, "unrelated"), "keep");
    assert.throws(
      () => acquireStateLock(path.join(dir, "baseline.json.lock")),
      /private|0700/,
    );
    const read = await Store.readReviews(f.context, f.io);
    assert.match(read.error, /private|0700/);
    await assert.rejects(
      Store.saveReview(f.context, body(initial), f.io),
      (e) => e.code === "REVIEW_STORAGE" && /private|0700/.test(e.message),
    );
    assert.equal((await fs.stat(dir)).mode & 0o777, 0o755);
    assert.deepEqual(await fs.readdir(dir), ["unrelated"]);
    assert.equal(
      await fs.readFile(path.join(dir, "unrelated"), "utf8"),
      "keep",
    );
  },
);
test(
  "new review state is private while existing parent permissions stay unchanged",
  { skip: process.platform === "win32" },
  async (t) => {
    const f = await fixture(t),
      initial = await Store.readReviews(f.context, f.io);
    await fs.chmod(f.home, 0o755);
    await Store.saveReview(f.context, body(initial), f.io);
    assert.equal((await fs.stat(f.home)).mode & 0o777, 0o755);
    assert.equal(
      (await fs.stat(path.join(f.home, "dsh-plugin-compat-check"))).mode &
        0o777,
      0o700,
    );
  },
);

test("manual false positive persists separately without changing report findings, summary or baseline", async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.report);
  const initial = await Store.readReviews(f.context, f.io);
  assert.equal(initial.items[0].status, "pending");
  const saved = await Store.saveReview(f.context, body(initial), f.io);
  assert.equal(saved.items[0].status, "false-positive");
  assert.equal(saved.items[0].note, "Checked source and host behavior.");
  assert.notEqual(saved.revision, initial.revision);
  assert.equal(
    (await Store.readReviews(f.context, f.io)).items[0].status,
    "false-positive",
  );
  assert.equal(JSON.stringify(f.report), before);
});

test("version, rules, catalog, tool, path, mode and evidence changes retain history but require review", async (t) => {
  const f = await fixture(t),
    initial = await Store.readReviews(f.context, f.io);
  await Store.saveReview(f.context, body(initial, { status: "fixed" }), f.io);
  for (const change of [
    "plugin",
    "rules",
    "catalog",
    "tool",
    "evidence",
    "span",
    "dsh",
  ]) {
    const report = structuredClone(f.report),
      opts = { ...f.opts };
    if (change === "plugin") report.plugins.demo.version = "1.1.0";
    if (change === "rules") opts.rulesIdentity = "rules-b";
    if (change === "catalog") opts.catalogIdentity = "catalog-b";
    if (change === "tool") report.toolVersion = "0.1.5";
    if (change === "dsh") report.dshVersion = "0.2.2";
    if (change === "evidence")
      report.plugins.demo.findings[0].evidence.state = "CHANGED";
    if (change === "span") report.plugins.demo.findings[0].location.start = 6;
    const ctx = await Store.reviewContext(report, opts),
      reviews = await Store.readReviews(ctx, f.io);
    assert.equal(reviews.items[0].status, "needs-review", change);
    assert.equal(reviews.items[0].record, null, change);
    assert.equal(reviews.items[0].history[0].status, "fixed", change);
    assert.ok(reviews.items[0].reviewReason, change);
    await assert.rejects(
      Store.saveReview(ctx, body(initial), f.io),
      /stale|context/i,
    );
  }
  const changed = structuredClone(f.report);
  changed.plugins.demo.findings.push({
    ...changed.plugins.demo.findings[0],
    category: "client-entry-missing",
  });
  const more = await Store.readReviews(
    await Store.reviewContext(changed, f.opts),
    f.io,
  );
  assert.equal(more.items[1].status, "pending");
  assert.equal(more.items.length, 2);
  const alias = path.join(f.home, "alias");
  await fs.symlink(f.nm, alias);
  const aliasReviews = await Store.readReviews(
    await Store.reviewContext(f.report, { ...f.opts, nodeModules: alias }),
    f.io,
  );
  assert.equal(aliasReviews.items[0].status, "needs-review");
  const modeReport = structuredClone(f.report);
  modeReport.observation.mode = "probe";
  assert.equal(
    (
      await Store.readReviews(
        await Store.reviewContext(modeReport, f.opts),
        f.io,
      )
    ).items[0].status,
    "needs-review",
  );
});

test("malformed, nonregular, symbolic-link and oversized storage is visible and never overwritten", async (t) => {
  const f = await fixture(t),
    first = await Store.readReviews(f.context, f.io);
  await Store.saveReview(f.context, body(first), f.io);
  const dir = path.join(f.home, "dsh-plugin-compat-check"),
    names = (await fs.readdir(dir)).filter((x) => x.endsWith(".json"));
  assert.equal(names.length, 1);
  const file = path.join(dir, names[0]);
  for (const invalid of [
    "bad json",
    JSON.stringify({ schemaVersion: 1, records: [] }),
    " ".repeat(1024 * 1024 + 1),
  ]) {
    await fs.writeFile(file, invalid);
    assert.ok((await Store.readReviews(f.context, f.io)).error);
    await assert.rejects(Store.saveReview(f.context, body(first), f.io));
    assert.equal(await fs.readFile(file, "utf8"), invalid);
  }
  await fs.rm(file);
  await fs.mkdir(file);
  assert.ok((await Store.readReviews(f.context, f.io)).error);
  await assert.rejects(Store.saveReview(f.context, body(first), f.io));
  await fs.rm(file, { recursive: true });
  const other = path.join(f.home, "other");
  await fs.writeFile(other, "protected");
  await fs.symlink(other, file);
  assert.ok((await Store.readReviews(f.context, f.io)).error);
  await assert.rejects(Store.saveReview(f.context, body(first), f.io));
  assert.equal(await fs.readFile(other, "utf8"), "protected");
});

test("unknown findings, controls, oversized notes, and arbitrary paths cannot be saved", async (t) => {
  const f = await fixture(t),
    reviews = await Store.readReviews(f.context, f.io);
  for (const patch of [
    { findingId: "a".repeat(64) },
    { status: "needs-review" },
    { note: "\u001b[31m" },
    { note: "x".repeat(4001) },
    { file: "/tmp/not-authorized" },
  ])
    await assert.rejects(
      Store.saveReview(f.context, body(reviews, patch), f.io),
    );
  await Store.saveReview(
    f.context,
    body(reviews, {
      status: "reviewed",
      note: "Verified with 2 < 3; plain text.",
    }),
    f.io,
  );
  assert.equal(
    (await Store.readReviews(f.context, f.io)).items[0].status,
    "reviewed",
  );
});

test("concurrent saves serialize or reject busy without losing accepted records", async (t) => {
  const f = await fixture(t);
  f.report.plugins.demo.findings.push({
    ...f.report.plugins.demo.findings[0],
    method: "second",
  });
  const ctx = await Store.reviewContext(f.report, f.opts),
    reviews = await Store.readReviews(ctx, f.io);
  const results = await Promise.allSettled(
    reviews.items.map((item) =>
      Store.saveReview(
        ctx,
        body(reviews, { findingId: item.findingId, status: "reviewed" }),
        f.io,
      ),
    ),
  );
  assert.ok(results.some((x) => x.status === "fulfilled"));
  const after = await Store.readReviews(ctx, f.io);
  for (let i = 0; i < results.length; i++)
    if (results[i].status === "fulfilled")
      assert.equal(after.items[i].status, "reviewed");
  assert.equal(
    (await fs.readdir(path.join(f.home, "dsh-plugin-compat-check"))).filter(
      (x) => x.endsWith(".lock") || x.endsWith(".tmp"),
    ).length,
    0,
  );
});

test("pure validation and panel present pending and review-required states without hiding findings", async (t) => {
  const f = await fixture(t),
    reviews = await Store.readReviews(f.context, f.io);
  assert.equal(typeof Pure.combineReviews, "function");
  assert.equal(typeof Panel.createFindingReviewPanel, "function");
  // Render the real factory with a minimal hook adapter; root additionally tests actual Chrome.
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children,
    }),
    useState: (x) => [typeof x === "function" ? x() : x, () => {}],
    useEffect: () => {},
    useRef: (x) => ({ current: x }),
  };
  const Component = Panel.createFindingReviewPanel(React, Pure),
    tree = Component({
      report: f.report,
      reviews,
      onSave: async () => reviews,
    });
  const text = (x) =>
    x == null
      ? ""
      : typeof x === "object"
        ? Array.isArray(x)
          ? x.map(text).join(" ")
          : [
              typeof x.type === "function" ? text(x.type(x.props)) : null,
              ...x.children.map(text),
            ].join(" ")
        : String(x);
  assert.match(text(tree), /待确认/);
  assert.match(text(tree), /人工/);
  assert.match(text(tree), /demo/);
});

test("commit guard prevents obsolete or unloaded host saves after temporary serialization", async (t) => {
  const f = await fixture(t),
    initial = await Store.readReviews(f.context, f.io);
  await assert.rejects(
    Store.saveReview(f.context, body(initial), {
      ...f.io,
      canCommit: async () => false,
    }),
    /stale|unloaded|commit/i,
  );
  assert.equal(
    (await Store.readReviews(f.context, f.io)).items[0].status,
    "pending",
  );
  assert.equal(
    (await fs.readdir(path.join(f.home, "dsh-plugin-compat-check"))).length,
    0,
  );
});

test("corrupt stored binding and unsafe namespace directory cannot be silently repaired", async (t) => {
  const f = await fixture(t),
    reviews = await Store.readReviews(f.context, f.io);
  await Store.saveReview(f.context, body(reviews), f.io);
  const dir = path.join(f.home, "dsh-plugin-compat-check"),
    file = path.join(
      dir,
      (await fs.readdir(dir)).find((x) => x.endsWith(".json")),
    );
  const doc = JSON.parse(await fs.readFile(file, "utf8"));
  doc.records[0].identity = "{}";
  const { createHash } = await import("node:crypto");
  doc.records[0].findingId = createHash("sha256").update("{}").digest("hex");
  await fs.writeFile(file, JSON.stringify(doc));
  assert.ok(
    (await Store.readReviews(f.context, f.io)).error,
    "identity binding must be structurally valid",
  );
  await assert.rejects(Store.saveReview(f.context, body(reviews), f.io));
  await fs.rm(dir, { recursive: true });
  const elsewhere = path.join(f.home, "elsewhere");
  await fs.mkdir(elsewhere);
  await fs.symlink(elsewhere, dir);
  assert.ok((await Store.readReviews(f.context, f.io)).error);
  await assert.rejects(Store.saveReview(f.context, body(reviews), f.io));
  assert.deepEqual(await fs.readdir(elsewhere), []);
});

test("source fragments in review notes persist as inert text and are never interpreted as markup", async (t) => {
  const f = await fixture(t),
    initial = await Store.readReviews(f.context, f.io);
  const note =
    "<script>window.reviewExecuted=true</script> onClick=run javascript:example";
  const saved = await Store.saveReview(
    f.context,
    body(initial, { note }),
    f.io,
  );
  assert.equal(saved.items[0].note, note);
  assert.equal((await Store.readReviews(f.context, f.io)).items[0].note, note);
});

function mountPanel(props) {
  const stores = new Map(),
    effects = [];
  let frame, tree;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children,
    }),
    useState(initial) {
      const store = frame.store,
        i = frame.i++;
      if (!(i in store))
        store[i] = typeof initial === "function" ? initial() : initial;
      return [
        store[i],
        (v) => {
          store[i] = typeof v === "function" ? v(store[i]) : v;
        },
      ];
    },
    useRef(initial) {
      const store = frame.store,
        i = frame.i++;
      return store[i] || (store[i] = { current: initial });
    },
    useEffect(fn, deps) {
      const store = frame.store,
        i = frame.i++;
      if (!store[i] || deps.some((d, k) => d !== store[i][k])) {
        store[i] = deps;
        effects.push(fn);
      }
    },
  };
  const Component = Panel.createFindingReviewPanel(React, Pure);
  function walk(el, key = "root") {
    if (el == null || typeof el !== "object") return el;
    if (Array.isArray(el))
      return el.map((x, i) => walk(x, `${key}.${x?.props?.key || i}`));
    if (typeof el.type === "function") {
      const saved = frame;
      frame = { store: stores.get(key) || [], i: 0 };
      stores.set(key, frame.store);
      const out = el.type(el.props);
      frame = saved;
      return walk(out, key + ".component");
    }
    return {
      ...el,
      children: el.children.map((x, i) =>
        walk(x, `${key}.${x?.props?.key || i}`),
      ),
    };
  }
  function render(next = props) {
    props = next;
    tree = walk(React.createElement(Component, props));
    for (const fn of effects.splice(0)) fn();
    return tree;
  }
  const nodes = (el = tree) =>
    el == null || typeof el !== "object"
      ? []
      : Array.isArray(el)
        ? el.flatMap((x) => nodes(x))
        : [el, ...el.children.flatMap((x) => nodes(x))];
  const text = (el = tree) =>
    el == null
      ? ""
      : typeof el === "object"
        ? Array.isArray(el)
          ? el.map((x) => text(x)).join(" ")
          : el.children.map((x) => text(x)).join(" ")
        : String(el);
  render();
  render();
  return { render, nodes, text };
}

test("review editors page large finding sets while preserving all rows in the sidecar", async (t) => {
  const f = await fixture(t),
    base = f.report.plugins.demo.findings[0];
  f.report.plugins.demo.findings = Array.from({ length: 45 }, (_, i) => ({
    ...base,
    method: `method${i}`,
  }));
  const ctx = await Store.reviewContext(f.report, f.opts),
    reviews = await Store.readReviews(ctx, f.io),
    props = { report: f.report, reviews, onSave: async () => reviews };
  const ui = mountPanel(props);
  assert.equal(reviews.items.length, 45);
  assert.equal(
    ui
      .nodes()
      .filter(
        (n) => n.type === "select" && n.props["aria-label"] !== "筛选人工状态",
      ).length,
    20,
  );
  const more = ui
    .nodes()
    .find((n) => n.type === "button" && ui.text(n).includes("显示更多"));
  assert.ok(more);
  more.props.onClick();
  ui.render();
  assert.equal(
    ui
      .nodes()
      .filter(
        (n) => n.type === "select" && n.props["aria-label"] !== "筛选人工状态",
      ).length,
    40,
  );
});

test("real panel event handlers save explicit changes, show failures, and reset stale review input", async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.report),
    reviews = await Store.readReviews(f.context, f.io);
  let fail = true,
    calls = 0;
  const props = {
    report: f.report,
    reviews,
    onSave: async (input) => {
      calls++;
      if (fail) throw new Error("disk unavailable");
      return Store.saveReview(f.context, input, f.io);
    },
  };
  const ui = mountPanel(props),
    note = "<script>window.reviewExecuted=true</script> onClick=run";
  ui.nodes()
    .find(
      (n) => n.type === "select" && n.props["aria-label"] !== "筛选人工状态",
    )
    .props.onChange({ target: { value: "reviewed" } });
  ui.nodes()
    .find((n) => n.type === "textarea")
    .props.onChange({ target: { value: note } });
  ui.render();
  await ui
    .nodes()
    .find((n) => n.type === "button" && ui.text(n) === "保存人工处置")
    .props.onClick();
  ui.render();
  assert.match(ui.text(), /disk unavailable/);
  assert.equal(ui.nodes().find((n) => n.type === "textarea").props.value, note);
  fail = false;
  await ui
    .nodes()
    .find((n) => n.type === "button" && ui.text(n) === "保存人工处置")
    .props.onClick();
  ui.render();
  ui.render();
  assert.match(ui.text(), /已复核/);
  assert.match(ui.text(), /window.reviewExecuted/);
  assert.equal(
    ui
      .nodes()
      .filter((n) => n.type === "script" || n.props.dangerouslySetInnerHTML)
      .length,
    0,
  );
  assert.equal(JSON.stringify(f.report), before);
  assert.equal(calls, 2);
  const report = structuredClone(f.report);
  report.plugins.demo.version = "2.0.0";
  const changed = await Store.readReviews(
    await Store.reviewContext(report, f.opts),
    f.io,
  );
  ui.render({ ...props, report, reviews: changed });
  ui.render({ ...props, report, reviews: changed });
  assert.match(ui.text(), /待重审/);
  assert.equal(
    ui
      .nodes()
      .find(
        (n) => n.type === "select" && n.props["aria-label"] !== "筛选人工状态",
      ).props.value,
    "pending",
  );
  assert.equal(ui.nodes().find((n) => n.type === "textarea").props.value, "");
  assert.equal(calls, 2);
});

test("record quota refuses the next manual disposition while retaining all existing records", async (t) => {
  const f = await fixture(t),
    base = f.report.plugins.demo.findings[0];
  f.report.plugins.demo.findings = Array.from({ length: 1001 }, (_, i) => ({
    category: base.category,
    severity: "fatal",
    certainty: "certain",
    impactBasis: "inferred",
    impact: "API missing",
    basis: "Static call",
    location: null,
    method: `q${i}`,
  }));
  const ctx = await Store.reviewContext(f.report, f.opts),
    initial = await Store.readReviews(ctx, f.io);
  const records = ctx.findings
    .slice(0, 1000)
    .map(({ findingId, identity, lineage, pluginName, pluginVersion }) => ({
      findingId,
      identity,
      lineage,
      pluginName,
      pluginVersion,
      status: "pending",
      note: "",
      updatedAt: "2026-10-22T00:00:00.000Z",
    }));
  const doc = { schemaVersion: 1, revision: "1".repeat(64), records };
  Pure.validateReviewDocument(doc);
  const dir = path.join(f.home, "dsh-plugin-compat-check");
  await fs.mkdir(dir, { mode: 0o700 });
  const file = path.join(dir, `reviews.${ctx.targetKey}.json`),
    bytes = JSON.stringify(doc);
  assert.ok(Buffer.byteLength(bytes) < 1024 * 1024);
  await fs.writeFile(file, bytes);
  await assert.rejects(
    Store.saveReview(
      ctx,
      body(initial, { findingId: ctx.findings[1000].findingId }),
      f.io,
    ),
    (error) =>
      error.code === "REVIEW_INVALID" &&
      error.message === "Invalid review storage",
  );
  assert.equal(await fs.readFile(file, "utf8"), bytes);
  assert.equal((await Store.readReviews(ctx, f.io)).error, null);
});

test("another process cannot save while a real atomic transaction owns the namespace lock", async (t) => {
  const f = await fixture(t),
    initial = await Store.readReviews(f.context, f.io),
    { spawn } = await import("node:child_process");
  let result;
  await Store.saveReview(f.context, body(initial), {
    ...f.io,
    canCommit: async () => {
      const script = `import {saveReview} from ${JSON.stringify(new URL("../lib/finding-review-store.mjs", import.meta.url).href)};try{await saveReview(${JSON.stringify(f.context)},${JSON.stringify(body(initial, { status: "fixed" }))},${JSON.stringify(f.io)});process.stdout.write('unexpected write');process.exitCode=1;}catch(error){process.stdout.write(error.code||error.message);}`;
      result = await new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--input-type=module", "-e", script],
          { stdio: ["ignore", "pipe", "pipe"] },
        );
        let stdout = "",
          stderr = "";
        child.stdout.on("data", (x) => (stdout += x));
        child.stderr.on("data", (x) => (stderr += x));
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
      });
      return true;
    },
  });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, "REVIEW_BUSY");
  assert.equal(
    (await Store.readReviews(f.context, f.io)).items[0].status,
    "false-positive",
  );
});

test("invalid request values expose a client validation code rather than an unclassified failure", async (t) => {
  const f = await fixture(t),
    reviews = await Store.readReviews(f.context, f.io);
  await assert.rejects(
    Store.saveReview(f.context, body(reviews, { note: "\u0000" }), f.io),
    (error) => error.code === "REVIEW_INVALID",
  );
});

test("bounded context supports a large complete finding set without serializing an unbounded combined identity", async (t) => {
  const f = await fixture(t),
    base = f.report.plugins.demo.findings[0];
  f.report.plugins.demo.findings = Array.from({ length: 5000 }, (_, i) => ({
    ...base,
    method: `large${i}`,
  }));
  const context = await Store.reviewContext(f.report, f.opts);
  const reviews = await Store.readReviews(context, f.io);
  assert.equal(reviews.error, null);
  assert.equal(reviews.items.length, 5000);
  assert.equal(reviews.items[4999].status, "pending");
});

test("review envelope contract rejects malformed optional payloads and accepts explicit unavailable errors", async (t) => {
  const f = await fixture(t),
    valid = await Store.readReviews(f.context, f.io);
  assert.equal(typeof Pure.validateReviewEnvelope, "function");
  assert.equal(Pure.validateReviewEnvelope(valid, f.report), true);
  const unavailable = {
    schemaVersion: 1,
    contextToken: null,
    revision: null,
    error: "Review storage unavailable",
    items: [],
    history: [],
  };
  assert.equal(Pure.validateReviewEnvelope(unavailable, f.report), true);
  const changes = [
    { kind: "upgrade-preview" },
    { schemaVersion: 2 },
    { contextToken: "invalid" },
    { revision: "invalid" },
    { items: {} },
    { history: {} },
    { items: Array(5001).fill(valid.items[0]) },
    { history: Array(1001).fill({}) },
    { error: {} },
    { items: [{ ...valid.items[0], status: "unknown" }] },
    { items: [{ ...valid.items[0], note: "x".repeat(4001) }] },
    { items: [{ ...valid.items[0], findingIndex: 10 }] },
    { items: [{ ...valid.items[0], findingIndex: -1 }] },
    { items: [{ ...valid.items[0], record: {} }] },
    { items: [{ ...valid.items[0], history: {} }] },
    { items: [{ ...valid.items[0], historyCount: 1001 }] },
    { items: [{ ...valid.items[0], note: "\u0000" }] },
  ];
  for (const patch of changes)
    assert.equal(
      Pure.validateReviewEnvelope({ ...valid, ...patch }, f.report),
      false,
      JSON.stringify(patch).slice(0, 150),
    );
  const saved = await Store.saveReview(f.context, body(valid), f.io);
  assert.equal(Pure.validateReviewEnvelope(saved, f.report), true);
  const report = structuredClone(f.report);
  report.plugins.demo.version = "2.0.0";
  const stale = await Store.readReviews(
    await Store.reviewContext(report, f.opts),
    f.io,
  );
  assert.equal(Pure.validateReviewEnvelope(stale, report), true);
});

test("real factory isolates malformed optional sidecar payloads from the compatibility page", async (t) => {
  const f = await fixture(t),
    valid = await Store.readReviews(f.context, f.io);
  for (const reviews of [
    { ...valid, items: {} },
    { ...valid, history: {} },
    { ...valid, items: [null] },
    { ...valid, items: [{ ...valid.items[0], record: { status: {} } }] },
    { ...valid, contextToken: "wrong" },
    42,
  ]) {
    let ui;
    assert.doesNotThrow(() => {
      ui = mountPanel({ report: f.report, reviews, onSave: async () => valid });
    });
    assert.match(ui.text(), /不可用|无效/);
    assert.equal(
      ui.nodes().filter((n) => n.type === "select" || n.type === "textarea")
        .length,
      0,
    );
  }
  const ui = mountPanel({
    report: f.report,
    reviews: {
      schemaVersion: 1,
      contextToken: null,
      revision: null,
      error: "Review storage unavailable",
      items: [],
      history: [],
    },
    onSave: async () => valid,
  });
  assert.match(ui.text(), /Review storage unavailable/);
  assert.equal(ui.nodes().filter((n) => n.type === "button").length, 0);
});

test("real factory rejects malformed save responses before replacing valid local review state", async (t) => {
  const f = await fixture(t),
    reviews = await Store.readReviews(f.context, f.io);
  for (const patch of [
    { items: {} },
    { history: {} },
    { schemaVersion: 3 },
    { items: [{ ...reviews.items[0], findingIndex: 99 }] },
  ]) {
    const ui = mountPanel({
      report: f.report,
      reviews,
      onSave: async () => ({ ...reviews, ...patch }),
    });
    await ui
      .nodes()
      .find((n) => n.type === "button" && ui.text(n) === "保存人工处置")
      .props.onClick();
    assert.doesNotThrow(() => ui.render());
    assert.match(ui.text(), /响应无效|不可用/);
    assert.match(ui.text(), /待确认/);
    assert.doesNotMatch(ui.text(), /人工处置已保存/);
  }
});

test("same-version source changes require fresh review even when the emitted finding is unchanged", async (t) => {
  const f = await fixture(t),
    initial = await Store.readReviews(f.context, f.io);
  await Store.saveReview(f.context, body(initial, { status: "fixed" }), f.io);
  const changed = await Store.reviewContext(f.report, {
      ...f.opts,
      sourceIdentity: "source-b",
    }),
    reviews = await Store.readReviews(changed, f.io);
  assert.notEqual(reviews.contextToken, initial.contextToken);
  assert.equal(reviews.items[0].status, "needs-review");
  assert.equal(reviews.items[0].record, null);
  assert.equal(reviews.items[0].history[0].status, "fixed");
  await assert.rejects(
    Store.saveReview(changed, body(initial), f.io),
    (error) => error.code === "REVIEW_STALE",
  );
  const { sourceIdentity, ...missing } = f.opts;
  await assert.rejects(
    Store.reviewContext(f.report, missing),
    /source|identity/i,
  );
});
