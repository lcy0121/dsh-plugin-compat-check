import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
const rules = JSON.parse(
  fs.readFileSync(new URL("../rules/severity.json", import.meta.url)),
);
const catalog = {
  host: {
    sessions: { methods: ["get"] },
    settings: { methods: ["describe"] },
    attachments: { methods: ["readImageRequest"] },
  },
  client: { sessions: { methods: ["binding"] } },
};
function check(source, root, custom = rules) {
  const f = packageFixture(source);
  try {
    return buildVerdicts({
      report: extractWithProvenance(f.nm, { catalog }).report,
      hostSurface: { root },
      catalog,
      rules: custom,
    }).plugins.sample;
  } finally {
    f.cleanup();
  }
}
test("a client-only method rule cannot describe a missing host method", () => {
  const p = check("export function apply(ctx){ctx.sessions.open()}", {
    sessions: { present: true, methods: { get: "function" } },
  });
  const finding = p.findings.find((f) => f.method === "open");
  assert.equal(finding.ruleSource, "default");
  assert.equal(finding.impact, "影响面未知");
});
test("obsolete collection and local-settings impacts are not assigned to real Context calls", () => {
  for (const [svc, method] of [
    ["sessions", "map"],
    ["sessions", "getSnapshot"],
    ["settings", "get"],
  ]) {
    const p = check(`export function apply(ctx){ctx.${svc}.${method}()}`, {
      [svc]: { present: true, methods: {} },
    });
    const finding = p.findings.find((f) => f.method === method);
    assert.equal(finding.ruleSource, "default", svc + "." + method);
    assert.equal(finding.impact, "影响面未知");
  }
});
test("readImage existence is decided by runtime shape, independent of catalog omission", () => {
  const present = check(
    "export function apply(ctx){ctx.attachments.readImage()}",
    { attachments: { present: true, methods: { readImage: "function" } } },
  );
  assert.equal(present.findings.length, 0);
  const absent = check(
    "export function apply(ctx){ctx.attachments.readImage()}",
    {
      attachments: { present: true, methods: { readImageRequest: "function" } },
    },
  );
  assert.equal(absent.findings[0].ruleSource, "rule");
  assert.match(absent.findings[0].impact, /readImage/);
  assert.equal(absent.findings[0].impactBasis, "inferred");
});
function coverageCase(source, check) {
  const f = packageFixture(source);
  try {
    check(f, (args = []) =>
      spawnSync(
        process.execPath,
        ["tools/coverage.mjs", "--nm", f.nm, "--json", ...args],
        { encoding: "utf8", timeout: 15000 },
      ),
    );
  } finally {
    f.cleanup();
  }
}
test("coverage retains genuine AST calls even when old regex artifacts used that name", () =>
  coverageCase("export function apply(ctx){ctx.sessions.map()}", (_f, run) => {
    const r = run();
    assert.equal(r.status, 0, r.stderr);
    const d = JSON.parse(r.stdout);
    assert.equal(d.pairs, 1);
    assert.equal(d.artifactPairsExcluded, 0);
    assert.ok(d.usedPairs.includes("host:sessions.map"));
  }));
test("coverage refuses a foreign bound probe rather than borrowing its runtime truth", () =>
  coverageCase(
    "export function apply(ctx){ctx.attachments.readImage()}",
    (f, run) => {
      const probe = path.join(f.root, "foreign.json");
      fs.writeFileSync(
        probe,
        JSON.stringify({
          observationVersion: 1,
          profileId: "/foreign/node_modules",
          dshVersion: "0.2.0-rc.2",
          probedAt: new Date().toISOString(),
          root: {},
        }),
      );
      const r = run(["--probe", probe]);
      assert.equal(r.status, 3);
      assert.equal(JSON.parse(r.stdout).error !== undefined, true);
    },
  ));
test("inventory writes record version and partial scans require explicit acceptance", () =>
  coverageCase(
    "import './missing.js';export function apply(ctx){ctx.sessions.map()}",
    (f, run) => {
      const out = path.join(f.root, "inventory.json");
      let r = run(["--write", "--out", out, "--dsh-version", "0.2.0-rc.2"]);
      assert.equal(r.status, 3);
      assert.equal(fs.existsSync(out), false);
      r = run([
        "--write",
        "--out",
        out,
        "--dsh-version",
        "0.2.0-rc.2",
        "--allow-partial",
      ]);
      assert.equal(r.status, 0, r.stderr);
      const d = JSON.parse(fs.readFileSync(out));
      assert.equal(d._dshVersion, "0.2.0-rc.2");
      assert.equal(d.scanComplete, false);
      assert.equal(d.observation.mode, "catalogue");
      assert.ok(d.sourceDigest);
      assert.equal(typeof JSON.parse(r.stdout).pairs, "number");
    },
  ));

test("coverage counts concrete rules, not Object.prototype members inherited by method maps", () =>
  coverageCase(
    "export function apply(ctx){ctx.settings.toString();ctx.settings.describe()}",
    (_f, run) => {
      const child = run();
      assert.equal(child.status, 0, child.stderr);
      const data = JSON.parse(child.stdout);
      assert.equal(data.pairs, 2);
      assert.equal(data.coveredPairs, 1);
    },
  ));
