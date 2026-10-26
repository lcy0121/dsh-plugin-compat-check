import { test } from "node:test";
import assert from "node:assert/strict";
import {
  serviceShape,
  sampleServices,
  normalizeObservation,
} from "../lib/observation.mjs";
import { packageFixture } from "./fixture-utils.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";

test("ten thousand ordinary attributes stop at the total property budget without reading values", () => {
  const service = Object.create(null);
  let reads = 0;
  for (let i = 0; i < 10000; i++)
    Object.defineProperty(service, "field" + i, {
      get() {
        reads++;
        return "PRIVATE_VALUE";
      },
    });
  const shape = serviceShape(service, { clock: () => 0 });
  assert.equal(shape.truncated, true);
  assert.equal(shape.namesComplete, false);
  assert.equal(shape.budgetReason, "properties");
  assert(shape.unknownMethods.length <= 1000);
  assert.equal(reads, 0);
  assert(!JSON.stringify(shape).includes("PRIVATE_VALUE"));
  const data = serviceShape(
    Object.fromEntries(
      Array.from({ length: 10000 }, (_, i) => [
        "ordinary" + i,
        "PRIVATE_VALUE",
      ]),
    ),
  );
  assert.equal(data.truncated, true);
  assert(data.nonCallableMethods.length <= 1000);
  assert(!JSON.stringify(data).includes("PRIVATE_VALUE"));
});

test("UTF-8 and escaped long names respect the complete serialized output budget", () => {
  const service = Object.create(null);
  for (let i = 0; i < 50; i++)
    service['属性"\\' + i + "长".repeat(400)] = "PRIVATE_VALUE";
  const shape = serviceShape(service, { clock: () => 0, maxBytes: 1024 });
  assert.equal(shape.truncated, true);
  assert.equal(shape.budgetReason, "bytes");
  assert(Buffer.byteLength(JSON.stringify(shape), "utf8") <= 1024);
});

test("elapsed time, method count and deep prototypes stop sampling with explicit unknown coverage", () => {
  let now = 0;
  const service = { a: 1, b: 2, c() {} };
  const timed = serviceShape(service, { maxDurationMs: 1, clock: () => now++ });
  assert.equal(timed.truncated, true);
  assert.equal(timed.budgetReason, "duration");
  let chain = Object.create(null);
  for (let i = 0; i < 15; i++)
    chain = Object.create(chain, { ["m" + i]: { value() {} } });
  const deep = serviceShape(chain, { clock: () => 0 });
  assert.equal(deep.truncated, true);
  assert.equal(deep.budgetReason, "depth");
  const methods = serviceShape(
    { a() {}, b() {}, c() {} },
    { clock: () => 0, maxMethods: 2 },
  );
  assert.equal(methods.truncated, true);
  assert.equal(Object.keys(methods.methods).length, 2);
});

test("sampling truncation is explained and an unvisited method never becomes certain absence", () => {
  const f = packageFixture("export function apply(ctx){ctx.settings.last()}");
  try {
    const service = Object.fromEntries(
      Array.from({ length: 10000 }, (_, i) => ["a" + i, 1]),
    );
    service.last = () => {};
    const probe = sampleServices({ get: () => service }, ["settings"], {
      profileId: f.nm,
      dshVersion: "0.2.1-rc.3",
    });
    const normalized = normalizeObservation(probe, {
      profileId: f.nm,
      dshVersion: "0.2.1-rc.3",
    });
    assert.match(normalized.notes.join(" "), /采样.*截断/);
    assert.equal(normalized.root.settings.complete, false);
    const p = buildVerdicts({
      report: extractWithProvenance(f.nm).report,
      hostSurface: probe,
      dshVersion: "0.2.1-rc.3",
      observationTarget: { profileId: f.nm },
    }).plugins.sample;
    assert.equal(p.coverage.status, "limited");
    assert(
      !p.findings.some((f) => f.method === "last" && f.certainty === "certain"),
    );
  } finally {
    f.cleanup();
  }
});

test("a truncated unrelated service does not reduce another plugin's complete runtime coverage", () => {
  const f = packageFixture(
    "export const inject=['missingRequired'];export function apply(){}",
  );
  try {
    const root = { missingRequired: { present: false } };
    const probe = {
      observationVersion: 1,
      profileId: f.nm,
      dshVersion: "0.2.1-rc.3",
      probedAt: new Date().toISOString(),
      root,
    };
    const input = {
      report: extractWithProvenance(f.nm).report,
      hostSurface: probe,
      dshVersion: "0.2.1-rc.3",
      observationTarget: { profileId: f.nm },
    };
    const before = buildVerdicts(input).plugins.sample;
    assert.equal(before.coverage.status, "complete");
    root.unrelated = {
      present: true,
      methods: {},
      truncated: true,
      budgetReason: "properties",
    };
    const after = buildVerdicts(input);
    assert.equal(after.plugins.sample.coverage.status, "complete");
    assert.match(after.observation.notes.join(" "), /unrelated.*截断/);
  } finally {
    f.cleanup();
  }
});

test("all sampled services share one retained-byte and service-count budget", () => {
  const service = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => ["field" + i + "x".repeat(1000), 0]),
  );
  const names = Array.from(
    { length: 300 },
    (_, i) => "service" + String(i).padStart(3, "0"),
  );
  const result = sampleServices({ get: () => service }, names, {
    clock: () => 0,
  });
  assert(Buffer.byteLength(JSON.stringify(result)) <= 1024 * 1024);
  assert.equal(result.sampling?.truncated, true);
  assert.equal(result.sampling.reason, "bytes");
  assert(Object.keys(result.root).length < names.length);
  const limited = sampleServices({ get: () => undefined }, ["a", "b", "c"], {
    maxServices: 2,
    clock: () => 0,
  });
  assert.equal(Object.keys(limited.root).length, 2);
  assert.equal(limited.sampling.reason, "services");
});

test("aggregate sampling deadline is explicit and skipped services remain unknown without penalizing captured evidence", () => {
  let clock = 0,
    calls = 0;
  const timed = sampleServices(
    {
      get() {
        calls++;
        return {};
      },
    },
    Array.from({ length: 50 }, (_, i) => "s" + i),
    { maxDurationMs: 1, clock: () => clock++ },
  );
  assert.equal(timed.sampling?.truncated, true);
  assert.equal(timed.sampling.reason, "duration");
  assert(calls < 50);
  for (const required of ["aKnown", "zOmitted"]) {
    const f = packageFixture(
      `export const inject=[${JSON.stringify(required)}];export function apply(){}`,
    );
    try {
      const probe = sampleServices(
        { get: () => undefined },
        ["aKnown", "zOmitted"],
        {
          profileId: f.nm,
          dshVersion: "0.2.1-rc.3",
          maxServices: 1,
          clock: () => 0,
        },
      );
      const result = buildVerdicts({
        report: extractWithProvenance(f.nm).report,
        hostSurface: probe,
        dshVersion: "0.2.1-rc.3",
        observationTarget: { profileId: f.nm },
      });
      assert.match(result.observation.notes.join(" "), /采样.*截断/);
      if (required === "aKnown")
        assert.equal(result.plugins.sample.coverage.status, "complete");
      else {
        assert.equal(result.plugins.sample.coverage.status, "limited");
        assert(
          !result.plugins.sample.findings.some(
            (f) => f.certainty === "certain",
          ),
        );
      }
    } finally {
      f.cleanup();
    }
  }
});

test("aggregate property visits are bounded even when null values retain no names", () => {
  const service = Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => ["field" + i, null]),
  );
  let calls = 0;
  const result = sampleServices(
    {
      get() {
        calls++;
        return service;
      },
    },
    Array.from({ length: 100 }, (_, i) => "s" + i),
    { clock: () => 0 },
  );
  assert.equal(result.sampling.reason, "properties");
  assert(result.sampling.sampledProperties <= 10000);
  assert(calls <= 10);
});

test("time spent obtaining a service is charged before starting its reflection", () => {
  let now = 0,
    enumerations = 0;
  const service = new Proxy(
    {},
    {
      ownKeys() {
        enumerations++;
        return [];
      },
    },
  );
  const result = sampleServices(
    {
      get() {
        now = 10;
        return service;
      },
    },
    ["slow"],
    { maxDurationMs: 5, clock: () => now },
  );
  assert.equal(enumerations, 0);
  assert.equal(result.sampling.reason, "duration");
  assert.equal(result.root.slow, undefined);
});
