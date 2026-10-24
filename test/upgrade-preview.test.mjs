import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { writePackageFixture } from "./fixture-utils.mjs";
import os from "node:os";
import path from "node:path";
import {
  runUpgradePreview,
  renderUpgradePreview,
} from "../lib/upgrade-preview.mjs";
import { assertUpgradePreview } from "../lib/upgrade-contract.mjs";
import { validateReportBody } from "../lib/contracts.mjs";
import { compareUpgradeFindings } from "../lib/upgrade-contract.mjs";
import * as PureUpgrade from "../lib/upgrade-contract.mjs";
import { captureUpgradeInput } from "../lib/upgrade-input.mjs";
import { spawn } from "node:child_process";
import { once } from "node:events";

const currentVersion = "0.2.0-rc.2",
  targetVersion = "0.2.1-rc.2";
function fixture(
  t,
  {
    code = "export default ctx => ctx.agentPresets.inspectCompositions();",
    range = "0.2.0-rc.2",
    name = "preview-fixture",
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-upgrade-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, "node_modules"),
    pkg = path.join(nm, name);
  writePackageFixture(
    pkg,
    {
      name,
      version: "1.0.0",
      main: "index.js",
      dsh: {},
      engines: { dsh: range },
    },
    code,
  );
  return { root, nm, pkg };
}
test("known versions compare one frozen artifact with canonical static evidence, without executing plugin code", async (t) => {
  const f = fixture(t);
  const marker = path.join(f.root, "EXECUTED");
  fs.appendFileSync(
    path.join(f.pkg, "index.js"),
    `\nimport fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'executed');`,
  );
  fs.writeFileSync(
    path.join(f.root, ".dsh-host-surface.json"),
    "invalid probe canary",
  );
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  assert.equal(result.status, "compared", result.error);
  assert.equal(result.ok, true);
  assertUpgradePreview(result);
  assert.deepEqual(validateReportBody(result.currentReport), []);
  assert.deepEqual(validateReportBody(result.targetReport), []);
  assert.equal(result.currentReport.observation.mode, "catalogue");
  assert.equal(result.targetReport.observation.usable, false);
  assert.equal(result.baseline, null);
  assert.equal(result.cache, null);
  assert.equal(fs.existsSync(marker), false);
  assert.equal(result.artifact.packages[0].name, "preview-fixture");
  assert.match(result.artifact.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(
    result.catalogs.current.sha256,
    result.catalogs.target.sha256,
  );
  assert.ok(
    result.changes.added.some(
      (x) => x.finding.category === "declared-incompatible",
    ),
  );
  assert.ok(
    result.changes.resolved.some(
      (x) => x.finding.method === "inspectCompositions",
    ),
  );
  assert.ok(result.exitCode > 0);
  const output = JSON.stringify(result);
  assert.equal(output.includes(f.root), false);
  assert.equal(output.includes("dsc-upgrade-input-"), false);
  assert.equal(output.includes("writeFileSync"), false);
  assert.match(renderUpgradePreview(result), /静态|未认证/);
});
test("unknown and approximate versions fail closed before touching inputs", async () => {
  for (const version of [
    "0.2.1",
    "0.2.1-rc.4",
    "0.2.0",
    "latest",
    "v0.2.1-rc.2",
  ]) {
    const result = await runUpgradePreview({
      nm: "/does/not/exist",
      currentVersion,
      targetVersion: version,
    });
    assert.equal(result.status, "unsupported-version");
    assert.equal(result.exitCode, 3);
    assert.equal(result.catalogs, null);
    assert.match(result.error, /未认证/);
    assertUpgradePreview(result);
  }
});
test("same-version comparisons preserve existing risks but have neutral exit", async (t) => {
  const f = fixture(t, {
    code: "export default ctx => ctx.settings.absentMethod();",
    range: "*",
  });
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion: currentVersion,
  });
  assert.equal(result.status, "compared", result.error);
  assert.equal(result.exitCode, 0);
  assert.ok(result.summary.unchanged > 0);
  assert.equal(result.summary.added, 0);
  assert.match(renderUpgradePreview(result), /无新增.*静态风险/);
});
test("package-root pnpm symlinks resolve while descendant escaped links remain diagnostic", async (t) => {
  const f = fixture(t, {
    code: "import './escape.js'; export default ctx => ctx.settings.get('x');",
    range: "*",
  });
  const real = path.join(f.root, "store", "fixture");
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.renameSync(f.pkg, real);
  fs.symlinkSync(real, f.pkg);
  const secret = path.join(f.root, "secret.js");
  fs.writeFileSync(
    secret,
    "UNREAD_TARGET_CODE_CANARY export default ctx => ctx.jobs.dropAll();",
  );
  fs.symlinkSync(secret, path.join(real, "escape.js"));
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  assert.equal(result.status, "compared", result.error);
  assert.equal(result.targetReport.extraction.scanComplete, false);
  assert.equal(JSON.stringify(result).includes("dropAll"), false);
  assert.ok(result.limitations.some((x) => /不完整|覆盖/.test(x)));
});
test("capture and worker budgets fail as tool errors without publishing partial reports", async (t) => {
  const f = fixture(t);
  for (const options of [
    { captureLimits: { bytes: 1 } },
    { timeoutMs: 1 },
    { timeoutMs: 10001 },
  ]) {
    const result = await runUpgradePreview(
      { nm: f.nm, currentVersion, targetVersion },
      options,
    );
    assert.equal(result.status, "error");
    assert.equal(result.exitCode, 3);
    assert.equal(result.currentReport, null);
    assert.equal(result.artifact, null);
    assertUpgradePreview(result);
  }
});
test("artifact identity tracks unscanned plugin bytes and malformed manifests stay diagnostics", async (t) => {
  const f = fixture(t, { range: "*" });
  const input = { nm: f.nm, currentVersion, targetVersion };
  fs.writeFileSync(path.join(f.pkg, "README.md"), "first");
  const first = await runUpgradePreview(input);
  fs.writeFileSync(path.join(f.pkg, "README.md"), "second");
  const malformed = path.join(f.nm, "broken-metadata");
  fs.mkdirSync(malformed);
  fs.writeFileSync(path.join(malformed, "package.json"), "{");
  const next = await runUpgradePreview(input);
  assert.equal(next.status, "compared", next.error);
  assert.notEqual(first.artifact.sha256, next.artifact.sha256);
  assert.equal(next.targetReport.extraction.scanComplete, false);
  assert.ok(
    next.targetReport.extraction.diagnostics.some(
      (x) => x.kind === "invalid-package-metadata",
    ),
  );
});
test("browser contract rejects incoherent counts, source identities and weakened report evidence", async (t) => {
  const f = fixture(t);
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  for (const mutate of [
    (x) => x.summary.added++,
    (x) => (x.catalogs.target.sha256 = "bad"),
    (x) => (x.targetReport.plugins["preview-fixture"].coverage = null),
    (x) => (x.exitCode = 0),
    (x) => (x.targetVersion = "latest"),
    (x) => (x.targetReport.observation.probedAt = "2026-10-21T00:00:00Z"),
    (x) =>
      (x.targetReport.plugins["preview-fixture"].findings[0].evidence = []),
  ]) {
    const corrupt = structuredClone(result);
    mutate(corrupt);
    assert.throws(() => assertUpgradePreview(corrupt), /契约/);
  }
});
test("profile paths resolve to the same installed inventory without reading adjacent probes", async (t) => {
  const f = fixture(t);
  const direct = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  const profile = await runUpgradePreview({
    nm: f.root,
    currentVersion,
    targetVersion,
  });
  assert.equal(profile.status, "compared", profile.error);
  assert.equal(profile.artifact.sha256, direct.artifact.sha256);
});
test("explicit runtime, exemption, cache and rule overrides are rejected", async (t) => {
  const f = fixture(t);
  for (const key of [
    "probe",
    "hostSurface",
    "compatibilityExemptions",
    "cache",
    "baseline",
    "catalog",
    "rules",
    "entryStates",
  ]) {
    const result = await runUpgradePreview({
      nm: f.nm,
      currentVersion,
      targetVersion,
      [key]: {},
    });
    assert.equal(result.status, "error", key);
    assert.equal(result.exitCode, 3);
  }
});
test("comparison keys retain package and source span; certainty can worsen despite severity improvement", async (t) => {
  const f = fixture(t, {
    code: "export default ctx => {ctx.settings.absentMethod();ctx.settings.absentMethod();};",
    range: "*",
  });
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  const before = structuredClone(result.currentReport),
    after = structuredClone(result.currentReport);
  const plugin = "preview-fixture";
  assert.ok(before.plugins[plugin].findings.length >= 2);
  before.plugins[plugin].findings[0].severity = "fatal";
  before.plugins[plugin].findings[0].certainty = "suspected";
  after.plugins[plugin].findings[0].severity = "degraded";
  after.plugins[plugin].findings[0].certainty = "certain";
  after.plugins[plugin].findings.pop();
  const changes = compareUpgradeFindings(before, after);
  assert.equal(changes.worsened.length, 1);
  assert.equal(changes.resolved.length, 1);
  assert.notDeepEqual(
    changes.worsened[0].before.location,
    changes.resolved[0].finding.location,
  );
});
test("owned snapshots clean up after timeout and concurrent mutation never publishes partial evidence", async (t) => {
  const f = fixture(t, { range: "*" });
  const temporary = path.join(f.root, "private-tmp"),
    oldTemp = process.env.TMPDIR;
  fs.mkdirSync(temporary);
  process.env.TMPDIR = temporary;
  t.after(() => {
    if (oldTemp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = oldTemp;
  });
  const file = path.join(f.pkg, "payload.bin");
  fs.writeFileSync(file, Buffer.alloc(7 * 1024 * 1024));
  const prefixes = () =>
    fs
      .readdirSync(temporary)
      .filter((x) => x.startsWith("dsc-upgrade-input-"))
      .sort();
  const original = prefixes();
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import fs from 'node:fs';const file=process.argv[1],fd=fs.openSync(file,'r+');process.stdout.write('ready');let n=0;while(true){fs.writeSync(fd,Buffer.from([n++%255]),0,1,0);}`,
      file,
    ],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  t.after(() => child.kill("SIGKILL"));
  await once(child.stdout, "data");
  const raced = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  child.kill("SIGKILL");
  await once(child, "exit");
  assert.equal(raced.status, "error", raced.error);
  assert.equal(raced.artifact, null);
  assert.equal(raced.currentReport, null);
  const timed = await runUpgradePreview(
    { nm: f.nm, currentVersion, targetVersion },
    { timeoutMs: 1 },
  );
  assert.equal(timed.status, "error");
  assert.deepEqual(prefixes(), original);
});
test("a captured snapshot owns its bytes and cleanup cannot delete the original plugin", async (t) => {
  const f = fixture(t);
  const snapshot = await captureUpgradeInput(f.nm);
  const file = path.join(snapshot.nm, "preview-fixture", "index.js");
  const copied = fs.readFileSync(file, "utf8");
  fs.writeFileSync(path.join(f.pkg, "index.js"), "changed");
  assert.equal(fs.readFileSync(file, "utf8"), copied);
  await snapshot.dispose();
  await snapshot.dispose();
  assert.equal(fs.existsSync(snapshot.nm), false);
  assert.equal(
    fs.readFileSync(path.join(f.pkg, "index.js"), "utf8"),
    "changed",
  );
});
test("fixed catalogue pair exposes a removed method as a new suspected static risk", async (t) => {
  const f = fixture(t, {
    code: "export default ctx => ctx.subagents.start();",
    range: "*",
  });
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  assert.equal(result.status, "compared", result.error);
  assert.equal(
    result.currentReport.plugins["preview-fixture"].findings.length,
    0,
  );
  const change = result.changes.added.find(
    (x) => x.finding.service === "subagents" && x.finding.method === "start",
  );
  assert.ok(change);
  assert.equal(change.finding.certainty, "suspected");
  assert.equal(change.finding.impactBasis, "inferred");
  assert.ok(result.exitCode > 0);
});
test("preview contract binds all plugin identities and both version reports to the same input", async (t) => {
  const f = fixture(t);
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  for (const mutate of [
    (x) => (x.artifact.packages = []),
    (x) => x.artifact.packages.push({ ...x.artifact.packages[0] }),
    (x) => (x.artifact.packages[0].name = "different-package"),
    (x) => (x.artifact.packages[0].version = "9.0.0"),
    (x) => (x.targetReport.plugins["preview-fixture"].version = "9.0.0"),
  ]) {
    const corrupt = structuredClone(result);
    mutate(corrupt);
    assert.throws(() => assertUpgradePreview(corrupt), /契约/);
  }
});
test("pure failure factory works without a kernel and core wrapper retains the real tool version", async () => {
  assert.equal(typeof PureUpgrade.createUpgradeFailure, "function");
  const bare = PureUpgrade.createUpgradeFailure({
    error: "kernel unavailable",
    currentVersion,
    targetVersion,
  });
  assertUpgradePreview(bare);
  assert.equal(bare.toolVersion, "unknown");
  const injected = PureUpgrade.createUpgradeFailure("missing kernel", {
    currentVersion,
    targetVersion,
    toolVersion: "1.2.3",
  });
  assert.equal(injected.toolVersion, "1.2.3");
  const { createUpgradeFailure } = await import("../lib/upgrade-preview.mjs");
  const wrapped = createUpgradeFailure({
    error: "missing kernel",
    currentVersion,
    targetVersion,
  });
  assert.notEqual(wrapped.toolVersion, "unknown");
  assert.deepEqual(wrapped.limitations, bare.limitations);
});
test("duplicate installed alias identities cannot hide a risk behind a healthy package of the same manifest name", async (t) => {
  const f = fixture(t, {
    code: "export function apply(ctx){ctx.subagents.start()}",
    range: "*",
  });
  const positive = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  assert(positive.changes.added.some((x) => x.finding.service === "subagents"));
  const alias = path.join(f.nm, "z-safe-alias");
  fs.mkdirSync(alias);
  fs.writeFileSync(
    path.join(alias, "package.json"),
    fs.readFileSync(path.join(f.pkg, "package.json")),
  );
  fs.writeFileSync(
    path.join(alias, "index.js"),
    "export function apply(ctx){ctx.settings.get('x')}",
  );
  const result = await runUpgradePreview({
    nm: f.nm,
    currentVersion,
    targetVersion,
  });
  assert.equal(result.ok, false);
  assert.equal(result.exitCode, 3);
  assert.match(result.error, /重复|同名/);
  assert.equal(result.artifact, null);
});

test("three reviewed versions compare every direction against one immutable input", async (t) => {
  const f = fixture(t, { range: ">=0.2.1-rc.3 <0.3.0" });
  const versions = ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.3"];
  for (const currentVersion of versions)
    for (const targetVersion of versions) {
      if (currentVersion === targetVersion) continue;
      const r = await runUpgradePreview({
        nm: f.nm,
        currentVersion,
        targetVersion,
      });
      assert.equal(r.status, "compared", r.error);
      assertUpgradePreview(r);
      assert.equal(r.currentReport.catalog.verified, true);
      assert.equal(r.targetReport.catalog.verified, true);
      assert.equal(r.artifact.packages[0].name, "preview-fixture");
      assert.notEqual(r.catalogs.current.sha256, r.catalogs.target.sha256);
    }
});
