import test from "node:test";
import assert from "node:assert/strict";
import { validateAuthAcceptance } from "../tools/auth025-acceptance.mjs";
const sha = "a".repeat(64);
function receipt(version = "0.2.2-rc.2") {
  const snapshot = {
    counters: { gets: 1, starts: 1, workers: 3, writes: 2 },
    writeProbeConfirmed: true,
    files: [["baseline.json", "b".repeat(64)]],
  };
  return {
    hostVersion: version,
    artifactSha256: sha,
    ok: true,
    hostStopped: true,
    cleaned: true,
    elapsedMs: 100,
    carrier: { kind: "npm", version, node: "26.13.1" },
    initial: {
      status: 200,
      ok: true,
      dshVersion: version,
      toolVersion: "0.2.5",
      computedAt: "2026-11-15T00:00:00Z",
    },
    unavailable: {
      before: structuredClone(snapshot),
      after: structuredClone(snapshot),
      responses: ["refresh", "metadata", "upgrade", "reviews"].map((id) => ({
        id,
        status: 503,
        noStore: true,
        noReport: true,
      })),
    },
    recovered: { status: 200, ok: true, computedAt: "2026-11-15T00:00:00Z" },
    restart: {
      sameAuthority: true,
      oldCookieStatus: 200,
      oldLaunchTokenStatus: 401,
      oldLaunchNoSetCookie: true,
      newCookieStatus: 200,
      policy: "persistent-signing-secret-and-authority",
    },
    newAuthority: {
      differentPort: true,
      oldCookieStatus: 401,
      newCookieStatus: 200,
    },
    restartsStopped: true,
  };
}
for (const v of ["0.2.2-rc.2", "0.2.2-rc.3"])
  test(
    "auth receipt requires exact host/candidate and persistent-cookie authority policy " +
      v,
    () => assert.equal(validateAuthAcceptance(receipt(v), v, sha).ok, true),
  );
test("auth cannot borrow another artifact or infer no work from unchanged response bodies", () => {
  for (const mutate of [
    (r) => (r.artifactSha256 = "c".repeat(64)),
    (r) => (r.carrier.kind = "desktop"),
    (r) => (r.carrier.node = "24.8.0"),
    (r) => (r.initial.toolVersion = "0.2.4"),
    (r) => (r.unavailable.responses[0].status = 200),
    (r) => r.unavailable.responses.pop(),
    (r) => (r.unavailable.responses[1].noReport = false),
    (r) => r.unavailable.after.counters.gets++,
    (r) => r.unavailable.after.counters.starts++,
    (r) => r.unavailable.after.counters.workers++,
    (r) => r.unavailable.after.counters.writes++,
    (r) => (r.unavailable.after.files[0][1] = "changed"),
    (r) => {
      r.unavailable.before.counters.workers = 0;
      r.unavailable.after.counters.workers = 0;
    },
    (r) => (r.recovered.computedAt = "changed"),
    (r) => (r.restart.oldCookieStatus = 401),
    (r) => (r.restart.oldLaunchTokenStatus = 303),
    (r) => (r.restart.oldLaunchNoSetCookie = false),
    (r) => {
      delete r.initial.computedAt;
      delete r.recovered.computedAt;
    },
    (r) => {
      r.recovered.ok = false;
    },
    (r) => {
      r.unavailable.before.writeProbeConfirmed = false;
      r.unavailable.after.writeProbeConfirmed = false;
    },
    (r) => {
      r.unavailable.before.counters.writes = 0;
      r.unavailable.after.counters.writes = 0;
    },
    (r) => (r.newAuthority.oldCookieStatus = 200),
    (r) => (r.newAuthority.differentPort = false),
    (r) => (r.restartsStopped = false),
    (r) => (r.hostStopped = false),
    (r) => (r.cleaned = false),
    (r) => (r.cleanupError = "failure"),
  ]) {
    const r = receipt();
    mutate(r);
    assert.throws(() => validateAuthAcceptance(r, "0.2.2-rc.2", sha));
  }
});

test("auth runtime admission uses the shared exact host minimum", () => {
  for (const node of ["24.9.0", "v24.9.0", "100.0.0"]) {
    const r = receipt();
    r.carrier.node = node;
    assert.equal(validateAuthAcceptance(r, "0.2.2-rc.2", sha).ok, true);
  }
  const r = receipt();
  r.carrier.node = "24.8.0";
  assert.throws(() => validateAuthAcceptance(r, "0.2.2-rc.2", sha));
});
