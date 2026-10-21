import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeObservation } from "../lib/observation.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { packageFixture, fixtureCatalog } from "./fixture-utils.mjs";

const now = Date.parse("2026-10-22T00:00:00.000Z");
const profileId = "/profile/node_modules";
const dshVersion = "0.2.1-rc.2";
const target = { profileId, dshVersion };
function surface(probedAt = "2026-10-22T00:00:00.000Z") {
  return {
    observationVersion: 1,
    profileId,
    dshVersion,
    probedAt,
    root: { settings: { present: true, methods: { known: "function" } } },
  };
}
function rejected(observation, reason) {
  assert.equal(observation.usable, false);
  assert.equal(observation.bound, true);
  assert.deepEqual(Object.keys(observation.root), []);
  assert.equal(observation.probedAt, undefined);
  assert.match(observation.notes.join(" "), reason);
}

test("a year-2100 bound probe is rejected even without a maximum age", (t) => {
  t.mock.method(Date, "now", () => now);
  const input = surface("2100-01-01T00:00:00Z");
  const before = JSON.stringify(input);
  rejected(normalizeObservation(input, target), /未来|时钟/);
  assert.equal(
    JSON.stringify(input),
    before,
    "Do not guess a replacement sampling time",
  );
});

for (const maxAgeMs of [undefined, 60000]) {
  for (const [offset, usable] of [
    [0, true],
    [299999, true],
    [300000, true],
    [300001, false],
  ]) {
    test(`future skew ${offset}ms is ${usable ? "accepted" : "rejected"} with maxAgeMs=${maxAgeMs}`, (t) => {
      t.mock.method(Date, "now", () => now);
      const input = surface(new Date(now + offset).toISOString());
      const observation = normalizeObservation(input, { ...target, maxAgeMs });
      if (!usable) rejected(observation, /未来|时钟/);
      else {
        assert.equal(observation.usable, true);
        assert.equal(observation.probedAt, input.probedAt);
        assert.equal(observation.root.settings.status, "present");
        assert.deepEqual(observation.root.settings.methods, ["known"]);
      }
    });
  }
}

for (const probedAt of [
  undefined,
  null,
  "",
  "not-a-time",
  "2026-99-99",
  2026,
  [],
]) {
  for (const maxAgeMs of [undefined, 60000]) {
    test(`bound invalid/missing time ${JSON.stringify(probedAt)} is rejected with maxAgeMs=${maxAgeMs}`, (t) => {
      t.mock.method(Date, "now", () => now);
      const input = surface();
      if (probedAt === undefined) delete input.probedAt;
      else input.probedAt = probedAt;
      rejected(
        normalizeObservation(input, { ...target, maxAgeMs }),
        /时间.*(?:缺失|非法|无效)/,
      );
    });
  }
}

test("maximum-age boundary is inclusive and old probes remain usable without a maximum age", (t) => {
  t.mock.method(Date, "now", () => now);
  const input = surface("2026-10-21T23:59:59.000Z");
  assert.equal(
    normalizeObservation(input, { ...target, maxAgeMs: 1000 }).usable,
    true,
  );
  input.probedAt = "2026-10-21T23:59:58.999Z";
  rejected(normalizeObservation(input, { ...target, maxAgeMs: 1000 }), /过期/);
  input.probedAt = "2000-01-01T00:00:00Z";
  assert.equal(normalizeObservation(input, target).usable, true);
});

for (const mismatch of [
  { profileId: "/foreign/node_modules" },
  { dshVersion: "0.2.0-rc.2" },
]) {
  test(`acceptable future skew still rejects mismatched binding ${Object.keys(mismatch)[0]}`, (t) => {
    t.mock.method(Date, "now", () => now);
    const input = { ...surface("2026-10-22T00:05:00.000Z"), ...mismatch };
    rejected(normalizeObservation(input, target), /profile\/DSH.*不匹配/);
  });
}

test("legacy probes keep explicit observations without inferring missing services or enforcing bound timestamps", (t) => {
  t.mock.method(Date, "now", () => now);
  for (const probedAt of [undefined, "not-a-time", "2100-01-01T00:00:00Z"]) {
    const input = { root: { jobs: { present: false } }, probedAt };
    const observation = normalizeObservation(input, {
      ...target,
      maxAgeMs: 1000,
    });
    assert.equal(observation.usable, true);
    assert.equal(observation.bound, false);
    assert.deepEqual(Object.keys(observation.root), ["jobs"]);
    assert.equal(observation.root.jobs.status, "absent");
    assert.equal(observation.root.settings, undefined);
    assert.match(observation.notes.join(" "), /旧格式.*仅使用显式.*不推断缺项/);
  }
});

for (const state of ["FAILED", "PENDING"]) {
  test(`rejecting a future probe withdraws certain methods, ${state} loader findings and measured impact`, (t) => {
    t.mock.method(Date, "now", () => now);
    const f = packageFixture(
      "export function apply(ctx){ctx.settings.absent();ctx.settings.known()}",
    );
    t.after(f.cleanup);
    const report = extractWithProvenance(f.nm, {
      catalog: fixtureCatalog,
    }).report;
    const input = surface("2100-01-01T00:00:00Z");
    input.profileId = f.nm;
    input.entries = {
      plugins: [{ packageName: "sample", state, disabled: false }],
    };
    const result = buildVerdicts({
      report,
      hostSurface: input,
      catalog: fixtureCatalog,
      dshVersion,
      observationTarget: { profileId: f.nm },
    });
    assert.equal(result.observation.usable, false);
    assert.equal(result.observation.mode, "catalogue");
    assert.equal(result.observation.probedAt, undefined);
    const plugin = result.plugins.sample;
    assert.equal(plugin.coverage.verifiedCalls, 0);
    assert.equal(
      plugin.findings.some(
        (finding) => finding.category === "host-entry-inactive",
      ),
      false,
    );
    assert.equal(
      plugin.findings.some(
        (finding) =>
          finding.certainty === "certain" || finding.impactBasis === "measured",
      ),
      false,
    );
    const missing = plugin.findings.find(
      (finding) => finding.method === "absent",
    );
    assert.equal(missing.certainty, "suspected");
    assert.equal(missing.evidence.methodSource, "目录");
    assert.equal(missing.impactBasis, "inferred");

    input.probedAt = "2026-10-22T00:05:00.000Z";
    const accepted = buildVerdicts({
      report,
      hostSurface: input,
      catalog: fixtureCatalog,
      dshVersion,
      observationTarget: { profileId: f.nm },
    });
    assert.equal(accepted.observation.usable, true);
    assert.equal(accepted.observation.probedAt, input.probedAt);
    assert.equal(accepted.plugins.sample.coverage.verifiedCalls, 1);
    assert.equal(
      accepted.plugins.sample.findings.find(
        (finding) => finding.method === "absent",
      ).certainty,
      "certain",
    );
    assert.ok(
      accepted.plugins.sample.findings.some(
        (finding) =>
          finding.category === "host-entry-inactive" &&
          finding.impactBasis === "measured" &&
          finding.evidence.state === state,
      ),
    );
  });
}
