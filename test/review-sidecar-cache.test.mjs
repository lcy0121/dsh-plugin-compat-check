import { test } from "node:test";
import assert from "node:assert/strict";
import * as Module from "../lib/review-sidecar-cache.mjs";
const turn = () => new Promise((r) => setImmediate(r));
function fixture() {
  let signature = "1",
    contexts = 0,
    reads = 0,
    probes = 0;
  const store = {
    reviewContext: async () => ({ contextToken: "ctx" + ++contexts }),
    reviewFileIdentity: async () => {
      probes++;
      return signature;
    },
    readReviews: async (context) => ({
      contextToken: context.contextToken,
      revision: String(++reads),
      error: null,
    }),
  };
  const cache = new Module.ReviewSidecarCache({ store });
  const options = {
    report: { plugins: {} },
    inputIdentity: "source",
    nodeModules: "/owned/node_modules",
    rulesIdentity: "rules",
    catalogIdentity: "catalog",
    toolVersion: "0.1.7",
  };
  return {
    cache,
    store,
    options,
    setSignature: (s) => (signature = s),
    counts: () => ({ contexts, reads, probes }),
  };
}
test("unchanged metadata reads reuse context, document validation and projection; changes still reload", async () => {
  const f = fixture();
  try {
    const first = await f.cache.get("A", f.options);
    for (let i = 0; i < 20; i++)
      assert.equal((await f.cache.get("A", f.options)).reviews, first.reviews);
    assert.equal(f.counts().contexts, 1);
    assert.equal(f.counts().reads, 1);
    f.setSignature("2");
    assert.notEqual((await f.cache.get("A", f.options)).reviews, first.reviews);
    assert.equal(f.counts().contexts, 1);
    assert.equal(f.counts().reads, 2);
    await f.cache.get("A", { ...f.options, report: { plugins: {} } });
    assert.equal(f.counts().contexts, 2);
    await f.cache.get("B", f.options);
    assert.equal(f.counts().contexts, 3);
    f.cache.drop("A");
    await f.cache.get("A", f.options);
    assert.equal(f.counts().contexts, 4);
  } finally {
    f.cache.dispose();
  }
});
test("concurrent requests share one bounded sidecar read; disposal suppresses late results", async () => {
  const f = fixture();
  let release, entered;
  const gate = new Promise((r) => (release = r)),
    start = new Promise((r) => (entered = r));
  let reads = 0;
  f.store.readReviews = async () => {
    reads++;
    entered();
    await gate;
    return { revision: "late" };
  };
  const a = f.cache.get("A", f.options),
    b = f.cache.get("A", f.options);
  await start;
  assert.equal(reads, 1);
  f.cache.dispose();
  await assert.rejects(a, /取消|回收|disposed/);
  await assert.rejects(b, /取消|回收|disposed/);
  release();
  await turn();
  assert.equal(f.cache.entries.size, 0);
});
test("a changing document is re-read and errors do not become stale successful metadata", async () => {
  const f = fixture();
  let reads = 0;
  f.store.readReviews = async () => {
    if (++reads === 1) f.setSignature("2");
    return { revision: String(reads), error: null };
  };
  try {
    assert.equal((await f.cache.get("A", f.options)).reviews.revision, "2");
    f.store.reviewFileIdentity = async () => {
      throw new Error("Review storage cannot be read");
    };
    await assert.rejects(f.cache.get("A", f.options), /cannot be read/);
    f.store.reviewFileIdentity = async () => "3";
    assert.equal((await f.cache.get("A", f.options)).reviews.revision, "3");
  } finally {
    f.cache.dispose();
  }
});

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as Store from "../lib/finding-review-store.mjs";
import { REVIEW_LIMITS } from "../lib/finding-review.mjs";
test("large real sidecar polling validates once, detects same-size replacement/corruption and recovers", async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-sidecar-cache-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const nm = path.join(home, "node_modules"),
    dir = path.join(home, "dsh-plugin-compat-check");
  await fs.mkdir(nm);
  await fs.mkdir(dir, { mode: 0o700 });
  const report = {
    toolVersion: "0.1.7",
    dshVersion: "0.2.1-rc.3",
    observation: { mode: "catalogue" },
    plugins: {
      demo: {
        version: "1.0.0",
        findings: Array.from({ length: 1500 }, (_, i) => ({
          category: "host-method-missing",
          service: "settings",
          method: "missing" + i,
          certainty: "certain",
          severity: "fatal",
          location: { file: "index.js", line: i + 1 },
        })),
      },
    },
  };
  const options = {
    report,
    inputIdentity: "actual-source",
    nodeModules: nm,
    rulesIdentity: "rules",
    catalogIdentity: "catalog",
    toolVersion: "0.1.7",
  };
  let contexts = 0,
    reads = 0;
  const store = {
    reviewContext: async (...args) => {
      contexts++;
      return Store.reviewContext(...args);
    },
    reviewFileIdentity: (c) => Store.reviewFileIdentity(c, { dshHome: home }),
    readReviews: (c) => {
      reads++;
      return Store.readReviews(c, { dshHome: home });
    },
  };
  const cache = new Module.ReviewSidecarCache({ store });
  try {
    const first = await cache.get("A", options),
      context = first.context;
    let records = context.findings.slice(0, 1000).map((entry) => ({
      findingId: entry.findingId,
      identity: entry.identity,
      lineage: entry.lineage,
      pluginName: entry.pluginName,
      pluginVersion: entry.pluginVersion,
      status: "reviewed",
      note: "evidence",
      updatedAt: "2026-10-27T00:00:00Z",
    }));
    while (
      Buffer.byteLength(
        JSON.stringify({ schemaVersion: 1, revision: "a".repeat(64), records }),
      ) > 800000
    )
      records = records.slice(0, records.length - 10);
    const base = Buffer.byteLength(
      JSON.stringify({ schemaVersion: 1, revision: "a".repeat(64), records }),
    );
    const padding = Math.floor((950000 - base) / records.length);
    records = records.map((r) => ({
      ...r,
      note: r.note + "x".repeat(padding),
    }));
    const doc = { schemaVersion: 1, revision: "a".repeat(64), records },
      bytes = JSON.stringify(doc),
      file = path.join(dir, `reviews.${context.targetKey}.json`);
    assert(
      Buffer.byteLength(bytes) > 900000 &&
        Buffer.byteLength(bytes) < REVIEW_LIMITS.fileBytes,
    );
    await fs.writeFile(file, bytes, { mode: 0o600 });
    const before = await cache.get("A", options),
      start = performance.now(),
      beforeReads = reads;
    for (let i = 0; i < 20; i++)
      assert.equal((await cache.get("A", options)).reviews, before.reviews);
    assert.equal(reads, beforeReads);
    assert.equal(contexts, 1);
    t.diagnostic(
      JSON.stringify({
        findings: 1500,
        records: records.length,
        sidecarBytes: Buffer.byteLength(bytes),
        warmPolls: 20,
        warmDocumentReads: reads - beforeReads,
        warmContextDerivations: 0,
        milliseconds: performance.now() - start,
      }),
    );
    const st = await fs.stat(file);
    doc.records[0].note = "z" + doc.records[0].note.slice(1);
    await fs.writeFile(file, JSON.stringify(doc));
    await fs.utimes(file, st.atime, st.mtime);
    assert.equal(
      (await cache.get("A", options)).reviews.items[0].note,
      doc.records[0].note,
    );
    await fs.writeFile(file, "{bad");
    assert((await cache.get("A", options)).reviews.error);
    await fs.writeFile(file, JSON.stringify(doc));
    assert.equal((await cache.get("A", options)).reviews.error, null);
    if (process.platform !== "win32") {
      await fs.chmod(dir, 0o755);
      await assert.rejects(cache.get("A", options), /private|0700/);
      await fs.chmod(dir, 0o700);
      await fs.rename(file, file + ".owned-backup");
      await fs.symlink(file + ".owned-backup", file);
      await assert.rejects(cache.get("A", options), /symbolic/);
      await fs.unlink(file);
      await fs.rename(file + ".owned-backup", file);
      assert.equal((await cache.get("A", options)).reviews.error, null);
    }
  } finally {
    cache.dispose();
  }
});

test("unchanged file identity retries transient read errors instead of pinning unavailable metadata", async () => {
  const f = fixture();
  let reads = 0;
  f.store.readReviews = async (context) =>
    ++reads === 1
      ? {
          contextToken: context.contextToken,
          error: "temporary EMFILE",
          items: [],
        }
      : {
          contextToken: context.contextToken,
          error: null,
          revision: "recovered",
        };
  try {
    assert.match((await f.cache.get("A", f.options)).reviews.error, /EMFILE/);
    assert.equal(
      (await f.cache.get("A", f.options)).reviews.revision,
      "recovered",
    );
    assert.equal(reads, 2);
    for (let i = 0; i < 5; i++) await f.cache.get("A", f.options);
    assert.equal(reads, 2);
  } finally {
    f.cache.dispose();
  }
});
