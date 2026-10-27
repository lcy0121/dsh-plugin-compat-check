import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import * as Review from "../lib/finding-review-store.mjs";
import * as Archives from "../lib/review-archive.mjs";
import * as History from "../lib/report-history.mjs";
import { compareReportSnapshots } from "../lib/report-history-contract.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
async function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-local-history-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const nm = path.join(home, "node_modules");
  fs.mkdirSync(nm);
  const report = toJSON(
    run({
      nm: path.resolve("test/fixtures/labels"),
      dshVersion: "0.2.1-rc.3",
      baseline: false,
      _ignoreAutoProbe: true,
    }),
  );
  report.inputs.nodeModules = nm;
  const opts = { dshHome: home, canCommit: async () => true };
  const context = await Review.reviewContext(report, {
    nodeModules: nm,
    rulesIdentity: "r",
    catalogIdentity: report.catalog.sha256,
    sourceIdentity: "source",
  });
  const identity = {
    profileId: fs.realpathSync(nm),
    originalPath: nm,
    toolVersion: report.toolVersion,
    dshVersion: report.dshVersion,
    mode: report.observation.mode,
    rulesSha256: "a".repeat(64),
    catalogSha256: report.catalog.sha256,
    sourceSha256: "b".repeat(64),
  };
  return {
    home,
    nm,
    report,
    context,
    opts,
    identity,
    targetKey: context.targetKey,
    snapshot: {
      schemaVersion: 1,
      kind: "plugin-compat-check/report-snapshot",
      identity,
      computedAt: "2026-10-27T00:00:00.000Z",
      savedAt: "2026-10-27T00:00:01.000Z",
      label: "before upgrade",
      report,
    },
  };
}
const saveReview = async (f) => {
  const reviews = await Review.readReviews(f.context, f.opts);
  return Review.saveReview(
    f.context,
    {
      contextToken: reviews.contextToken,
      findingId: reviews.items[0].findingId,
      status: "reviewed",
      note: "original evidence",
    },
    f.opts,
  );
};
test("archive explicitly backs up full bound records, frees active capacity and restores only as reference", async (t) => {
  const f = await fixture(t);
  await saveReview(f);
  const before = JSON.stringify(f.report),
    state = await Archives.reviewArchiveState(f.context, f.opts);
  assert.equal(state.capacity.records, 1);
  const archived = await Archives.archiveReviews(
    f.context,
    {
      contextToken: f.context.contextToken,
      revision: state.revision,
      mode: "all",
    },
    f.opts,
  );
  assert.equal(archived.capacity.records, 0);
  assert.equal(archived.archives.length, 1);
  const read = await Archives.readReviewArchive(
    f.context,
    archived.archives[0].id,
    f.opts,
  );
  assert.equal(read.referenceOnly, true);
  assert.equal(read.data.document.records[0].note, "original evidence");
  assert.equal(
    (await Review.readReviews(f.context, f.opts)).items[0].status,
    "pending",
  );
  await Archives.importReviewArchive(f.context, read.data, f.opts);
  assert.equal(
    (await Review.readReviews(f.context, f.opts)).items[0].status,
    "pending",
  );
  assert.equal(JSON.stringify(f.report), before);
});
test("historical-only archive preserves current reviews, stale revisions and unload cannot clear records", async (t) => {
  const f = await fixture(t);
  await saveReview(f);
  const state = await Archives.reviewArchiveState(f.context, f.opts);
  await assert.rejects(
    Archives.archiveReviews(
      f.context,
      {
        contextToken: f.context.contextToken,
        revision: "0".repeat(64),
        mode: "all",
      },
      f.opts,
    ),
    /revision|修订/,
  );
  await assert.rejects(
    Archives.archiveReviews(
      f.context,
      {
        contextToken: f.context.contextToken,
        revision: state.revision,
        mode: "all",
      },
      { ...f.opts, canCommit: async () => false },
    ),
    /Stale|过期/,
  );
  assert.equal(
    (await Review.readReviews(f.context, f.opts)).items[0].status,
    "reviewed",
  );
  await assert.rejects(
    Archives.archiveReviews(
      f.context,
      {
        contextToken: f.context.contextToken,
        revision: state.revision,
        mode: "history",
      },
      f.opts,
    ),
    /没有|empty/,
  );
});
test("archive import validates target, full identity and checksum; unsafe or corrupt files remain untouched", async (t) => {
  const f = await fixture(t);
  await saveReview(f);
  const data = await Archives.exportActiveReviews(f.context, f.opts);
  for (const patch of [
    { targetKey: "c".repeat(64) },
    {
      document: {
        ...data.document,
        records: [{ ...data.document.records[0], findingId: "f".repeat(64) }],
      },
    },
  ])
    await assert.rejects(
      Archives.importReviewArchive(f.context, { ...data, ...patch }, f.opts),
    );
  const state = await Archives.importReviewArchive(f.context, data, f.opts),
    id = state.archives[0].id;
  await assert.rejects(
    Archives.readReviewArchive(f.context, "../escape", f.opts),
  );
  const file = path.join(
    f.home,
    "dsh-plugin-compat-check",
    `review-archive.${f.targetKey}.${id}.json`,
  );
  fs.writeFileSync(file, "bad");
  await assert.rejects(Archives.readReviewArchive(f.context, id, f.opts));
  assert.equal(fs.readFileSync(file, "utf8"), "bad");
});
test("immutable opt-in snapshot round-trips, searches and isolates target without changing report", async (t) => {
  const f = await fixture(t),
    before = JSON.stringify(f.report);
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    0,
  );
  const saved = await History.saveReportSnapshot(
    f.targetKey,
    f.snapshot,
    f.opts,
  );
  assert.equal(saved.items.length, 1);
  const id = saved.items[0].id;
  assert.deepEqual(
    (await History.readReportSnapshot(f.targetKey, id, f.opts)).data,
    JSON.parse(JSON.stringify(f.snapshot)),
  );
  assert.equal(
    (await History.listReportSnapshots("f".repeat(64), f.opts)).items.length,
    0,
  );
  assert.equal(JSON.stringify(f.report), before);
  await History.deleteReportSnapshot(f.targetKey, id, f.opts);
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    0,
  );
});
test("snapshots reject wrong binding, invalid contracts, unsafe files and stale commit", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    History.saveReportSnapshot("f".repeat(64), f.snapshot, f.opts),
  );
  await assert.rejects(
    History.saveReportSnapshot(
      f.targetKey,
      { ...f.snapshot, report: { ...f.report, summary: { ok: 999 } } },
      f.opts,
    ),
  );
  await assert.rejects(
    History.saveReportSnapshot(f.targetKey, f.snapshot, {
      ...f.opts,
      canCommit: async () => false,
    }),
  );
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    0,
  );
});
test("comparison validates criteria and source versions, and weakened evidence cannot be presented as repair", async (t) => {
  const f = await fixture(t),
    old = f.snapshot,
    next = structuredClone(old);
  next.label = "after";
  next.identity.sourceSha256 = "d".repeat(64);
  assert.equal(compareReportSnapshots(old, next).comparable, true);
  for (const field of [
    "profileId",
    "originalPath",
    "toolVersion",
    "dshVersion",
    "rulesSha256",
    "catalogSha256",
    "mode",
  ]) {
    const changed = structuredClone(next);
    changed.identity[field] += "changed";
    assert.equal(compareReportSnapshots(old, changed).comparable, false, field);
  }
  const name = Object.keys(next.report.plugins)[0];
  next.report.plugins[name].coverage.verifiedCalls = 0;
  next.report.plugins[name].coverage.status = "limited";
  next.report.plugins[name].coverage.limitations = ["evidence missing"];
  const comparison = compareReportSnapshots(old, next);
  assert.equal(comparison.comparable, true);
  assert(
    !comparison.rows.some((r) => r.name === name && r.direction === "improved"),
  );
});

test("a full1000-record active file stays bounded; explicit archival permits a new save without losing the backup", async (t) => {
  const f = await fixture(t),
    context = await Review.reviewContext(
      {
        toolVersion: "0.1.7",
        dshVersion: "0.2.1-rc.3",
        observation: { mode: "catalogue" },
        plugins: {
          d: {
            version: "1",
            findings: Array.from({ length: 1001 }, (_, i) => ({
              category: "host-method-missing",
              service: "s",
              method: "m" + i,
              severity: "degraded",
              certainty: "suspected",
              location: null,
            })),
          },
        },
      },
      {
        nodeModules: f.nm,
        rulesIdentity: "r",
        catalogIdentity: "c",
        sourceIdentity: "s",
      },
    );
  const records = context.findings.slice(0, 1000).map((e) => ({
      findingId: e.findingId,
      identity: e.identity,
      lineage: e.lineage,
      pluginName: e.pluginName,
      pluginVersion: e.pluginVersion,
      status: "reviewed",
      note: "checked",
      updatedAt: "2026-10-27T00:00:00Z",
    })),
    doc = { schemaVersion: 1, revision: "a".repeat(64), records };
  const file = Review.reviewStorage(context, f.opts);
  fs.mkdirSync(path.dirname(file), { mode: 0o700 });
  const raw = JSON.stringify(doc);
  assert(Buffer.byteLength(raw) < 1048576);
  fs.writeFileSync(file, raw, { mode: 0o600 });
  const body = {
    contextToken: context.contextToken,
    findingId: context.findings[1000].findingId,
    status: "reviewed",
    note: "new evidence",
  };
  await assert.rejects(
    Review.saveReview(context, body, f.opts),
    /storage|limits/,
  );
  assert.equal(JSON.parse(fs.readFileSync(file)).records.length, 1000);
  const state = await Archives.archiveReviews(
    context,
    { contextToken: context.contextToken, revision: doc.revision, mode: "all" },
    f.opts,
  );
  assert.equal(state.capacity.records, 0);
  assert.equal(
    (await Archives.readReviewArchive(context, state.archives[0].id, f.opts))
      .data.document.records.length,
    1000,
  );
  await Review.saveReview(context, body, f.opts);
  assert.equal(
    (await Archives.reviewArchiveState(context, f.opts)).capacity.records,
    1,
  );
});
test("unload after durable archive creation retains active records and recoverable full backup", async (t) => {
  const f = await fixture(t);
  await saveReview(f);
  const state = await Archives.reviewArchiveState(f.context, f.opts);
  let calls = 0;
  await assert.rejects(
    Archives.archiveReviews(
      f.context,
      {
        contextToken: f.context.contextToken,
        revision: state.revision,
        mode: "all",
      },
      { ...f.opts, canCommit: async () => ++calls === 1 },
    ),
    /Stale|过期/,
  );
  const later = await Archives.reviewArchiveState(f.context, f.opts);
  assert.equal(later.capacity.records, 1);
  assert.equal(later.archives.length, 1);
  assert.equal(
    (await Archives.readReviewArchive(f.context, later.archives[0].id, f.opts))
      .data.document.records[0].note,
    "original evidence",
  );
});
test("snapshot count and per-file quotas never silently prune earlier objects", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 20; i++)
    await History.saveReportSnapshot(
      f.targetKey,
      { ...f.snapshot, label: "snapshot" + i },
      f.opts,
    );
  await assert.rejects(
    History.saveReportSnapshot(
      f.targetKey,
      { ...f.snapshot, label: "overflow" },
      f.opts,
    ),
    /容量/,
  );
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    20,
  );
});
test("private immutable stores reject symlinks and unsafe directory permissions while retaining original bytes", async (t) => {
  const f = await fixture(t);
  const saved = await History.saveReportSnapshot(
      f.targetKey,
      f.snapshot,
      f.opts,
    ),
    id = saved.items[0].id,
    dir = path.join(f.home, "dsh-plugin-compat-check"),
    file = path.join(dir, `report-snapshot.${f.targetKey}.${id}.json`),
    backup = file + ".bak";
  fs.renameSync(file, backup);
  fs.symlinkSync(backup, file);
  await assert.rejects(History.readReportSnapshot(f.targetKey, id, f.opts));
  assert(fs.readFileSync(backup).length > 100);
  fs.unlinkSync(file);
  fs.renameSync(backup, file);
  if (process.platform !== "win32") {
    fs.chmodSync(dir, 0o755);
    await assert.rejects(
      History.listReportSnapshots(f.targetKey, f.opts),
      /private|0700/,
    );
    assert.equal(fs.statSync(dir).mode & 0o777, 0o755);
    fs.chmodSync(dir, 0o700);
  }
});

test("history-only archival never expands a compact near-limit active file beyond1MiB", async (t) => {
  const f = await fixture(t),
    report = {
      toolVersion: "0.1.7",
      dshVersion: "0.2.1-rc.3",
      observation: { mode: "catalogue" },
      plugins: {
        d: {
          version: "1",
          findings: Array.from({ length: 1000 }, (_, i) => ({
            category: "host-method-missing",
            service: "s",
            method: "m" + i,
            severity: "degraded",
            certainty: "suspected",
            location: null,
          })),
        },
      },
    },
    scope = {
      nodeModules: f.nm,
      rulesIdentity: "r",
      catalogIdentity: "c",
      sourceIdentity: "s",
    },
    old = await Review.reviewContext(report, scope);
  const records = old.findings.map((e) => ({
      findingId: e.findingId,
      identity: e.identity,
      lineage: e.lineage,
      pluginName: e.pluginName,
      pluginVersion: e.pluginVersion,
      status: "reviewed",
      note: "checked",
      updatedAt: "2026-10-27T00:00:00Z",
    })),
    doc = { schemaVersion: 1, revision: "a".repeat(64), records };
  const extra = Math.floor(
    (1048576 - 1024 - Buffer.byteLength(JSON.stringify(doc))) / 1000,
  );
  assert(extra > 0);
  for (const r of records) r.note += "x".repeat(extra);
  assert(Buffer.byteLength(JSON.stringify(doc)) < 1048576);
  assert(Buffer.byteLength(JSON.stringify(doc, null, 2)) > 1048576);
  const file = Review.reviewStorage(old, f.opts);
  fs.mkdirSync(path.dirname(file), { mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(doc), { mode: 0o600 });
  report.plugins.d.findings.pop();
  const current = await Review.reviewContext(report, scope);
  const state = await Archives.archiveReviews(
    current,
    {
      contextToken: current.contextToken,
      revision: doc.revision,
      mode: "history",
    },
    f.opts,
  );
  assert.equal(state.capacity.records, 999);
  assert(state.capacity.bytes <= 1048576);
  assert.equal(
    (await Archives.readReviewArchive(current, state.archives[0].id, f.opts))
      .data.document.records.length,
    1,
  );
});
test("lost binding or weaker certainty/measurement is neutral, while added risk still has priority", async (t) => {
  const f = await fixture(t),
    old = structuredClone(f.snapshot);
  old.identity.mode = "runtime";
  old.report.observation = {
    mode: "runtime",
    usable: true,
    bound: true,
    notes: [],
    profileId: f.nm,
    dshVersion: old.identity.dshVersion,
    probedAt: "2026-10-27T00:00:00Z",
  };
  const lost = structuredClone(old);
  lost.report.observation.bound = false;
  assert.equal(
    compareReportSnapshots(old, lost).rows.find(
      (r) => r.name === "@label/broken-client",
    ).direction,
    "evidence-weaker",
  );
  const weaker = structuredClone(old),
    plugin = weaker.report.plugins["@label/broken-client"];
  plugin.findings[0].certainty = "suspected";
  plugin.findings[0].impactBasis = "inferred";
  plugin.findings[0].severity = "degraded";
  plugin.verdict = "partial";
  weaker.report.summary.broken--;
  weaker.report.summary.partial++;
  weaker.report.exitCode = 1;
  assert.equal(
    compareReportSnapshots(old, weaker).rows.find(
      (r) => r.name === "@label/broken-client",
    ).direction,
    "evidence-weaker",
  );
  const risk = structuredClone(old);
  risk.report.plugins["@label/broken-client"].findings[0].certainty =
    "suspected";
  risk.report.plugins["@label/broken-client"].findings.push({
    ...structuredClone(old.report.plugins["@label/broken-client"].findings[0]),
    category: "host-method-missing",
    service: "newRiskService",
    method: "missing",
  });
  assert.equal(
    compareReportSnapshots(old, risk).rows.find(
      (r) => r.name === "@label/broken-client",
    ).direction,
    "worsened",
  );
});

test("client disconnection cancels a late history import before any snapshot commit", async (t) => {
  const f = await fixture(t);
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = f.home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  });
  const { EventEmitter } = await import("node:events"),
    { createHistoryRuntime } = await import("../plugin/lib/host-history.js");
  let route, release;
  const gate = new Promise((r) => (release = r)),
    state = {},
    runtime = createHistoryRuntime({
      resolveNodeModules: () => ({ dir: f.nm }),
      resolveKernelDir: () => path.resolve("."),
      readRequest: async () => {
        await gate;
        return {
          action: "snapshot-import",
          computedAt: "2026-10-27T00:00:00Z",
          contextToken: null,
          data: f.snapshot,
        };
      },
      log() {},
      errText: (e) => e.message,
    });
  runtime.registerHistoryRoute(
    {
      get: () => ({ requestRejection: () => undefined }),
      inject: (_, fn) => fn({ webServer: { register: (r) => (route = r) } }),
    },
    state,
  );
  const req = new EventEmitter();
  Object.assign(req, {
    method: "POST",
    headers: {
      host: "127.0.0.1:1234",
      "x-dsh-compat-request": "1",
      "content-type": "application/json",
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const res = new EventEmitter();
  let status, response;
  Object.assign(res, {
    writeHead: (s) => (status = s),
    end(text) {
      response = text;
    },
  });
  const pending = route.handler(req, res);
  res.destroyed = true;
  res.emit("close");
  release();
  await pending;
  assert.notEqual(status, 400, response);
  assert.notEqual(status, 403, response);
  assert.notEqual(status, 200, response);
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    0,
  );
});

test("whole history deadline bounds an ignored body reader and rejects its late import", async (t) => {
  const f = await fixture(t),
    { EventEmitter } = await import("node:events"),
    { createHistoryRuntime } = await import("../plugin/lib/host-history.js");
  const previousHome = process.env.DSH_HOME;
  process.env.DSH_HOME = f.home;
  t.after(() => {
    if (previousHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousHome;
  });
  let route, release;
  const gate = new Promise((r) => (release = r)),
    state = {};
  createHistoryRuntime({
    timeoutMs: 50,
    resolveNodeModules: () => ({ dir: f.nm }),
    resolveKernelDir: () => path.resolve("."),
    readRequest: async () => {
      await gate;
      return {
        action: "snapshot-import",
        computedAt: "2026-10-27T00:00:00Z",
        contextToken: null,
        data: f.snapshot,
      };
    },
    log() {},
    errText: (e) => e.message,
  }).registerHistoryRoute(
    {
      get: () => ({ requestRejection: () => undefined }),
      inject: (_, fn) => fn({ webServer: { register: (r) => (route = r) } }),
    },
    state,
  );
  const req = new EventEmitter(),
    res = new EventEmitter();
  Object.assign(req, {
    method: "POST",
    headers: {
      host: "127.0.0.1:1234",
      "x-dsh-compat-request": "1",
      "content-type": "application/json",
    },
    socket: { remoteAddress: "127.0.0.1" },
  });
  const statuses = [];
  Object.assign(res, { writeHead: (s) => statuses.push(s), end() {} });
  await route.handler(req, res);
  assert.deepEqual(statuses, [409]);
  assert.equal(state.historyRequests.size, 0);
  release();
  await new Promise(setImmediate);
  await new Promise(setImmediate);
  assert.deepEqual(statuses, [409]);
  assert.equal(
    (await History.listReportSnapshots(f.targetKey, f.opts)).items.length,
    0,
  );
});
