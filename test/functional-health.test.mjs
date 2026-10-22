import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawnSync, spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const contract = await import("../lib/functional-health-contract.mjs").catch(
  () => ({}),
);
const health = await import("../tools/functional-health.mjs").catch(() => ({}));
const declaration = () => ({
  schemaVersion: 1,
  artifact: {
    name: "@health/fixture",
    version: "1.0.0",
    sha256: "a".repeat(64),
  },
  dshVersion: "0.2.1-rc.2",
  checks: [
    {
      id: "ready",
      type: "http",
      path: "/health",
      status: 200,
      json: { pointer: "/ready", equals: true },
    },
  ],
});

test("declarations reject executable, external and unbounded instructions", () => {
  assert.equal(typeof contract.validateFunctionalManifest, "function");
  assert.equal(contract.validateFunctionalManifest(declaration()).valid, true);
  for (const mutate of [
    (m) => (m.command = "echo unsafe"),
    (m) => (m.checks[0].headers = {}),
    (m) => (m.checks[0].path = "//example.com"),
    (m) => (m.checks[0].path = "/%2f%2fexample.com"),
    (m) => (m.checks[0].path = "/x?token=secret"),
    (m) => (m.checks[0].path = "/x\\evil"),
    (m) => m.checks.push({ ...m.checks[0] }),
    (m) => (m.artifact.version = "^1.0.0"),
    (m) =>
      (m.checks = Array.from({ length: 33 }, (_, i) => ({
        ...m.checks[0],
        id: "a" + i,
      }))),
  ]) {
    const value = declaration();
    mutate(value);
    assert.equal(
      contract.validateFunctionalManifest(value).valid,
      false,
      JSON.stringify(value),
    );
  }
});

test("HTTP evidence observes healthy, 503 and recovered endpoints without following redirects", async () => {
  assert.equal(typeof health.executeFunctionalChecks, "function");
  let status = 200,
    outsideHits = 0;
  const server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/outside" });
      res.end();
      return;
    }
    if (req.url === "/outside") outsideHits++;
    res.writeHead(status, { "content-type": "application/json" });
    res.end(status === 503 ? "Unavailable" : '{"ready":true}');
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const check = declaration().checks;
    assert.equal(
      (await health.executeFunctionalChecks(check, { origin }))[0].status,
      "pass",
    );
    status = 503;
    const failed = (await health.executeFunctionalChecks(check, { origin }))[0];
    assert.equal(failed.status, "failed");
    assert.equal(failed.evidence.httpStatus, 503);
    status = 200;
    assert.equal(
      (await health.executeFunctionalChecks(check, { origin }))[0].status,
      "pass",
    );
    assert.equal(
      (
        await health.executeFunctionalChecks(
          [{ id: "redirect", type: "http", path: "/redirect", status: 200 }],
          { origin },
        )
      )[0].status,
      "error",
    );
    assert.equal(outsideHits, 0);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("review and invalid manifests never invoke DSH or create requested output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-test-"));
  try {
    const bin = path.join(root, "bin");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "dsh"),
      '#!/bin/sh\ntouch "$HEALTH_MARKER"\nexit 91\n',
      { mode: 0o700 },
    );
    const manifest = path.join(root, "manifest.json"),
      out = path.join(root, "out.json"),
      marker = path.join(root, "called");
    fs.writeFileSync(manifest, JSON.stringify(declaration()));
    const invoke = (extra) =>
      spawnSync(
        process.execPath,
        [
          "tools/functional-health.mjs",
          "--manifest",
          manifest,
          "--artifact",
          path.join(root, "missing.tgz"),
          "--out",
          out,
          ...extra,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: bin + path.delimiter + process.env.PATH,
            HEALTH_MARKER: marker,
          },
        },
      );
    const reviewed = invoke([]);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(JSON.parse(reviewed.stdout).status, "reviewed");
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(out), false);
    const invalid = declaration();
    invalid.checks[0].command = "touch marker";
    fs.writeFileSync(manifest, JSON.stringify(invalid));
    assert.notEqual(invoke(["--run"]).status, 0);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(out), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const runtime = await import("../tools/functional-health-runtime.mjs").catch(
  () => ({}),
);
const sampleResult = () => ({
  schemaVersion: 1,
  kind: "plugin-compat-check/functional-health",
  status: "tested-pass",
  declaration: declaration(),
  identity: {
    artifact: {
      name: "@health/fixture",
      version: "1.0.0",
      sha256: "a".repeat(64),
    },
    dshVersion: "0.2.1-rc.2",
    manifestSha256: "b".repeat(64),
  },
  startedAt: "2026-10-22T00:00:00.000Z",
  completedAt: "2026-10-22T00:00:01.000Z",
  checks: [
    {
      id: "ready",
      type: "http",
      status: "pass",
      evidence: {
        httpStatus: 200,
        responseBytes: 14,
        jsonMatched: true,
        elapsedMs: 1,
      },
    },
  ],
  cleanup: { stopped: true, removed: true },
  limitations: [
    "Private profile is not an OS sandbox",
    "Declared checks are not complete business certification",
  ],
});
test("import validation rejects forged pass, incomplete cleanup and stale artifact identity", () => {
  assert.equal(typeof contract.validateFunctionalHealthResult, "function");
  assert.equal(
    contract.validateFunctionalHealthResult(sampleResult()).valid,
    true,
  );
  for (const mutate of [
    (r) => (r.checks[0].status = "failed"),
    (r) => (r.checks[0].evidence.jsonMatched = false),
    (r) => (r.checks[0].evidence.httpStatus = 503),
    (r) => (r.declaration.checks[0].status = 503),
    (r) => (r.declaration.artifact.version = "2.0.0"),
    (r) => (r.checks = []),
    (r) => (r.cleanup.stopped = false),
    (r) => (r.completedAt = "yesterday"),
    (r) => (r.identity.artifact.sha256 = "unknown"),
    (r) => (r.ok = true),
    (r) => (r.checks[0].evidence = { script: "evil" }),
    (r) => (r.startedAt = "2026-10-23T00:00:00.000Z"),
  ]) {
    const result = sampleResult();
    mutate(result);
    assert.equal(
      contract.validateFunctionalHealthResult(result).valid,
      false,
      JSON.stringify(result),
    );
  }
  assert.equal(
    contract.validateFunctionalHealthResult(sampleResult(), {
      artifact: {
        name: "@health/fixture",
        version: "2.0.0",
        sha256: "a".repeat(64),
      },
    }).current,
    false,
  );
});

test("tarball identity mismatch is rejected before any process starts", async () => {
  assert.equal(typeof runtime.verifyFunctionalArtifact, "function");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-artifact-"));
  try {
    const artifact = path.join(root, "bad.tgz");
    fs.writeFileSync(artifact, "untrusted bytes");
    assert.throws(
      () => runtime.verifyFunctionalArtifact(artifact, declaration().artifact),
      /SHA256/,
    );
    const manifest = path.join(root, "manifest.json"),
      out = path.join(root, "result.json"),
      bin = path.join(root, "bin"),
      marker = path.join(root, "called");
    fs.mkdirSync(bin);
    fs.writeFileSync(
      path.join(bin, "dsh"),
      `#!/bin/sh\ntouch '${marker}'\nexit 91\n`,
      { mode: 0o700 },
    );
    fs.writeFileSync(manifest, JSON.stringify(declaration()));
    const result = spawnSync(
      process.execPath,
      [
        "tools/functional-health.mjs",
        "--manifest",
        manifest,
        "--artifact",
        artifact,
        "--run",
        "--out",
        out,
      ],
      {
        encoding: "utf8",
        env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH },
      },
    );
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(out), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function fixtureArtifact(root) {
  const body = Buffer.from(
    JSON.stringify({
      name: "@health/fixture",
      version: "1.0.0",
      type: "module",
      main: "index.js",
    }),
  );
  const header = tarHeader("package/package.json", body.length);
  const bytes = gzipSync(
    Buffer.concat([
      header,
      body,
      Buffer.alloc(((512 - (body.length % 512)) % 512) + 1024),
    ]),
  );
  const file = path.join(root, "fixture.tgz");
  fs.writeFileSync(file, bytes);
  return { file, sha256: createHash("sha256").update(bytes).digest("hex") };
}
function fixtureDsh(
  root,
  { status = 200, stall = false, stallVersion = false } = {},
) {
  const bin = path.join(root, "bin");
  fs.mkdirSync(bin);
  const marker = path.join(root, "pid.json");
  fs.writeFileSync(
    path.join(bin, "dsh"),
    `#!${process.execPath}
const fs=require('node:fs'),path=require('node:path');
const args=process.argv.slice(2);
if(args[0]==='--version'){${stallVersion ? `fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,home:process.env.DSH_HOME}));setInterval(()=>{},1000);return;` : "console.log('0.2.1-rc.2');process.exit(0);"}}
if(args.includes('--dump-config')){fs.mkdirSync(path.join(process.env.DSH_HOME,'profiles/health'),{recursive:true});process.exit(0);}
if(args[0]==='plugin'){process.exit(0);}
if(!args.includes('--no-open'))process.exit(92);
fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,home:process.env.DSH_HOME,account:process.env.OPENAI_API_KEY||null}));
${stall ? "setInterval(()=>{},1000);" : `const server=require('node:http').createServer((req,res)=>{res.writeHead(${status},{'content-type':'application/json'});res.end('{"ready":true}');});server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port+'/?token=owned-test'));`}
`,
    { mode: 0o700 },
  );
  return { bin, marker };
}
function fixtureArgs(root, artifact) {
  const manifest = declaration();
  manifest.artifact.sha256 = artifact.sha256;
  const file = path.join(root, "manifest.json");
  fs.writeFileSync(file, JSON.stringify(manifest));
  return [
    "tools/functional-health.mjs",
    "--manifest",
    file,
    "--artifact",
    artifact.file,
    "--run",
    "--out",
    path.join(root, "result.json"),
  ];
}
test("owned runner installs only reviewed bytes, records 503 and removes its host/profile", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-runner-"));
  try {
    const artifact = fixtureArtifact(root),
      fixture = fixtureDsh(root, { status: 503 });
    const result = spawnSync(process.execPath, fixtureArgs(root, artifact), {
      encoding: "utf8",
      env: {
        ...process.env,
        OPENAI_API_KEY: "must-not-inherit",
        PATH: fixture.bin + path.delimiter + process.env.PATH,
      },
      timeout: 15000,
    });
    assert.equal(result.status, 1, result.stderr + result.stdout);
    const output = JSON.parse(fs.readFileSync(path.join(root, "result.json")));
    assert.equal(output.status, "tested-failed");
    assert.equal(output.checks[0].evidence.httpStatus, 503);
    assert.equal(contract.validateFunctionalHealthResult(output).valid, true);
    const owned = JSON.parse(fs.readFileSync(fixture.marker));
    assert.equal(owned.account, null);
    assert.equal(fs.existsSync(owned.home), false);
    assert.throws(() => process.kill(owned.pid, 0), { code: "ESRCH" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("SIGTERM cancels owned startup and records cancellation after cleanup", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-cancel-"));
  let child;
  try {
    const artifact = fixtureArtifact(root),
      fixture = fixtureDsh(root, { stall: true });
    child = spawn(process.execPath, fixtureArgs(root, artifact), {
      env: {
        ...process.env,
        PATH: fixture.bin + path.delimiter + process.env.PATH,
      },
      stdio: "ignore",
    });
    const end = Date.now() + 10000;
    while (!fs.existsSync(fixture.marker) && Date.now() < end)
      await new Promise((r) => setTimeout(r, 20));
    assert.equal(
      fs.existsSync(fixture.marker),
      true,
      "owned startup must actually begin",
    );
    const completed = new Promise((resolve) =>
      child.once("exit", (code, signal) => resolve({ code, signal })),
    );
    child.kill("SIGTERM");
    assert.deepEqual(await completed, { code: 3, signal: null });
    const output = JSON.parse(fs.readFileSync(path.join(root, "result.json")));
    assert.equal(output.status, "error");
    assert.equal(contract.validateFunctionalHealthResult(output).valid, true);
    assert.match(output.error, /cancelled|timed out/i);
    assert.equal(output.cleanup.stopped, true);
    const owned = JSON.parse(fs.readFileSync(fixture.marker));
    assert.equal(fs.existsSync(owned.home), false);
    assert.throws(() => process.kill(owned.pid, 0), { code: "ESRCH" });
  } finally {
    child?.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const chromePath =
  process.env.DSC_CHROME ||
  [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((p) => fs.existsSync(p));
test(
  "real empty Chrome profile observes missing DOM control and recovery, and blocks redirect navigation",
  { skip: !chromePath },
  async () => {
    assert.equal(typeof runtime.createFunctionalDom, "function");
    let present = true,
      outsideHits = 0;
    const server = http.createServer((req, res) => {
      if (req.url === "/redirect") {
        res.writeHead(302, { location: "/outside" });
        res.end();
        return;
      }
      if (req.url === "/outside") outsideHits++;
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        "<!doctype html><body>" +
          (present ? '<button id="healthy-control">Ready</button>' : "") +
          "</body>",
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    let chrome, dom;
    try {
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      chrome = await launchChromePipe(chromePath, { timeoutMs: 5000 });
      const origin = `http://127.0.0.1:${server.address().port}`;
      dom = await runtime.createFunctionalDom(chrome, origin);
      const checks = [
        {
          id: "control",
          type: "dom",
          path: "/",
          selector: "#healthy-control",
          minCount: 1,
          maxCount: 1,
        },
      ];
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "pass",
      );
      present = false;
      const failed = (
        await health.executeFunctionalChecks(checks, { origin, dom })
      )[0];
      assert.equal(failed.status, "failed");
      assert.equal(failed.evidence.count, 0);
      present = true;
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "pass",
      );
      checks[0].path = "/redirect";
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "error",
      );
      assert.equal(outsideHits, 0);
    } finally {
      await dom?.close();
      await chrome?.close();
      await new Promise((r) => server.close(r));
    }
  },
);

test("canonical declaration identity is independent of author key ordering", () => {
  assert.equal(typeof contract.canonicalFunctionalManifest, "function");
  const declaration = {
    schemaVersion: 1,
    artifact: { name: "a", version: "1.0.0", sha256: "a".repeat(64) },
    dshVersion: "0.2.1",
    checks: [{ id: "a", type: "http", path: "/", status: 200 }],
  };
  const reordered = {
    checks: [{ status: 200, path: "/", type: "http", id: "a" }],
    dshVersion: "0.2.1",
    artifact: { sha256: "a".repeat(64), version: "1.0.0", name: "a" },
    schemaVersion: 1,
  };
  assert.equal(
    contract.canonicalFunctionalManifest(declaration),
    contract.canonicalFunctionalManifest(reordered),
  );
  assert.match(
    contract.canonicalFunctionalManifest(declaration),
    /^\{"artifact":/,
  );
});

test("malformed imported evidence is rejected without throwing", () => {
  for (const raw of [
    null,
    {},
    [],
    { ...sampleResult(), checks: "bad" },
    { ...sampleResult(), checks: [null] },
    { ...sampleResult(), cleanup: null },
  ])
    assert.doesNotThrow(() =>
      assert.equal(contract.validateFunctionalHealthResult(raw).valid, false),
    );
});
test("HTTP response budget errors do not poison later healthy checks", async () => {
  let oversized = true;
  const server = http.createServer((req, res) =>
    res.end(oversized ? "x".repeat(65537) : '{"ready":true}'),
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal(
      (
        await health.executeFunctionalChecks(declaration().checks, { origin })
      )[0].status,
      "error",
    );
    oversized = false;
    assert.equal(
      (
        await health.executeFunctionalChecks(declaration().checks, { origin })
      )[0].status,
      "pass",
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test(
  "command cancellation retains cleanup failure alongside primary cause and preserves owned files",
  { timeout: 15000 },
  async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), "dsc-health-cleanup-fail-"),
    );
    let child, owned;
    try {
      const artifact = fixtureArtifact(root),
        fixture = fixtureDsh(root, { stallVersion: true });
      const preload = path.join(root, "deny-signal.mjs");
      fs.writeFileSync(
        preload,
        "const original=process.kill;process.kill=(pid,signal)=>{if(pid<0 && (signal==='SIGTERM'||signal==='SIGKILL'))throw Object.assign(new Error('fixture denied signal'),{code:'EACCES'});return original(pid,signal);};",
      );
      child = spawn(
        process.execPath,
        ["--import", preload, ...fixtureArgs(root, artifact)],
        {
          env: {
            ...process.env,
            PATH: fixture.bin + path.delimiter + process.env.PATH,
          },
          stdio: "ignore",
        },
      );
      const end = Date.now() + 10000;
      while (!fs.existsSync(fixture.marker) && Date.now() < end)
        await new Promise((r) => setTimeout(r, 20));
      assert.equal(fs.existsSync(fixture.marker), true);
      owned = JSON.parse(fs.readFileSync(fixture.marker));
      const completed = new Promise((r) =>
        child.once("exit", (code) => r(code)),
      );
      child.kill("SIGTERM");
      assert.equal(await completed, 3);
      const result = JSON.parse(
        fs.readFileSync(path.join(root, "result.json")),
      );
      assert.equal(result.status, "error");
      assert.match(result.error, /aborted/i);
      assert.match(result.error, /cleanup/i);
      assert.equal(result.cleanup.stopped, false);
      assert.equal(result.cleanup.removed, false);
      assert.equal(fs.existsSync(owned.home), true);
    } finally {
      if (owned)
        try {
          process.kill(
            process.platform === "win32" ? owned.pid : -owned.pid,
            "SIGKILL",
          );
        } catch {}
      child?.kill("SIGKILL");
      if (owned)
        fs.rmSync(path.dirname(owned.home), { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

function tarHeader(name, size, type = "0") {
  const h = Buffer.alloc(512);
  h.write(name);
  h.write("0000644\0", 100);
  h.write("0000000\0", 108);
  h.write("0000000\0", 116);
  h.write(size.toString(8).padStart(11, "0") + "\0", 124);
  h.write("00000000000\0", 136);
  h.fill(32, 148, 156);
  h.write(type, 156);
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.write(
    [...h]
      .reduce((sum, b) => sum + b, 0)
      .toString(8)
      .padStart(6, "0") + "\0 ",
    148,
  );
  return h;
}
function writeFixtureTar(root, entries) {
  const blocks = entries.flatMap(
    ({ name, body = Buffer.alloc(0), type = "0" }) => {
      body = Buffer.from(body);
      return [
        tarHeader(name, body.length, type),
        body,
        Buffer.alloc((512 - (body.length % 512)) % 512),
      ];
    },
  );
  const bytes = gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
  const file = path.join(root, "crafted.tgz");
  fs.writeFileSync(file, bytes);
  return {
    file,
    expected: {
      name: "@health/fixture",
      version: "1.0.0",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
test("artifact verifier rejects PAX identity overrides and unsupported tar semantics before execution", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-tar-"));
  const pkg = { name: "@health/fixture", version: "1.0.0" };
  try {
    // A valid local PAX record changes the following raw other.json into the effective package.json.
    const pax = "29 path=package/package.json\n";
    for (const entries of [
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "PaxHeader/other", type: "x", body: pax },
        {
          name: "package/other.json",
          body: JSON.stringify({ ...pkg, version: "9.0.0" }),
        },
      ],
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "package/link", type: "2" },
      ],
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "package/../outside", body: "x" },
      ],
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "package//package.json", body: JSON.stringify(pkg) },
      ],
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "package/package.json", body: JSON.stringify(pkg) },
      ],
      [
        { name: "package/package.json", body: JSON.stringify(pkg) },
        { name: "././@LongLink", type: "L", body: "package/package.json" },
      ],
    ]) {
      const artifact = writeFixtureTar(root, entries);
      assert.throws(
        () =>
          runtime.verifyFunctionalArtifact(artifact.file, artifact.expected),
        /tar|artifact|identity|path|Unsupported|duplicate/i,
      );
    }
    const artifact = writeFixtureTar(root, [
      { name: "package/package.json", body: JSON.stringify(pkg) },
    ]);
    assert.doesNotThrow(() =>
      runtime.verifyFunctionalArtifact(artifact.file, artifact.expected),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("early failure evidence remains importable without pretending unrun checks passed", () => {
  const result = sampleResult();
  result.status = "error";
  result.checks = [];
  result.error = "Installed DSH version differs from declaration";
  assert.equal(contract.validateFunctionalHealthResult(result).valid, true);
  const missing = sampleResult();
  missing.checks = [];
  assert.equal(contract.validateFunctionalHealthResult(missing).valid, false);
});

test(
  "review rejects FIFO, symlink and oversized manifest files before reading or running",
  { skip: process.platform === "win32" },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-input-"));
    try {
      const normal = path.join(root, "normal.json");
      fs.writeFileSync(normal, JSON.stringify(declaration()));
      const fifo = path.join(root, "fifo.json");
      assert.equal(spawnSync("mkfifo", [fifo]).status, 0);
      const symlink = path.join(root, "symlink.json");
      fs.symlinkSync(normal, symlink);
      const large = path.join(root, "large.json");
      fs.writeFileSync(large, Buffer.alloc(65537, 32));
      for (const file of [fifo, symlink, large]) {
        const invoked = spawnSync(
          process.execPath,
          [
            "tools/functional-health.mjs",
            "--manifest",
            file,
            "--artifact",
            path.join(root, "unused.tgz"),
          ],
          { encoding: "utf8", timeout: 1500 },
        );
        assert.equal(
          invoked.error,
          undefined,
          `${path.basename(file)} must fail promptly without blocking: ${invoked.error}`,
        );
        assert.equal(invoked.status, 3);
        assert.match(invoked.stderr, /regular|symlink|budget/i);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);
test("ordinary npm pack artifact remains accepted by the conservative tar verifier", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-npm-tar-"));
  try {
    const source = path.join(root, "source");
    fs.mkdirSync(source);
    fs.writeFileSync(
      path.join(source, "package.json"),
      JSON.stringify({ name: "@health/fixture", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(source, "index.js"),
      "export function apply(){}",
    );
    const packed = spawnSync(
      "npm",
      [
        "pack",
        source,
        "--ignore-scripts",
        "--silent",
        "--cache",
        path.join(root, "cache"),
        "--pack-destination",
        root,
      ],
      { encoding: "utf8", timeout: 15000 },
    );
    assert.equal(packed.status, 0, packed.stderr);
    const file = path.join(root, packed.stdout.trim().split("\n").at(-1)),
      sha256 = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    assert.doesNotThrow(() =>
      runtime.verifyFunctionalArtifact(file, {
        name: "@health/fixture",
        version: "1.0.0",
        sha256,
      }),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("actual DSH version early failure emits valid importable error evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-health-early-fail-"));
  try {
    const artifact = fixtureArtifact(root),
      fixture = fixtureDsh(root);
    const executable = path.join(fixture.bin, "dsh");
    fs.writeFileSync(
      executable,
      fs
        .readFileSync(executable, "utf8")
        .replace("console.log('0.2.1-rc.2')", "console.log('0.0.1')"),
      { mode: 0o700 },
    );
    const invoked = spawnSync(process.execPath, fixtureArgs(root, artifact), {
      env: {
        ...process.env,
        PATH: fixture.bin + path.delimiter + process.env.PATH,
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(invoked.status, 3, invoked.stderr);
    const result = JSON.parse(fs.readFileSync(path.join(root, "result.json")));
    assert.equal(result.status, "error");
    assert.deepEqual(result.checks, []);
    assert.match(result.error, /DSH version/);
    assert.equal(result.cleanup.stopped, true);
    assert.equal(result.cleanup.removed, true);
    assert.equal(contract.validateFunctionalHealthResult(result).valid, true);
    assert.equal(fs.existsSync(fixture.marker), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "owned Chrome authenticates with same-origin bearer headers while query-login and external redirects remain unused",
  { skip: !chromePath },
  async () => {
    let queryLogins = 0,
      externalHits = 0;
    const external = http.createServer((req, res) => {
      externalHits++;
      res.end("outside");
    });
    await new Promise((r) => external.listen(0, "127.0.0.1", r));
    const outside = `http://127.0.0.1:${external.address().port}`;
    const server = http.createServer((req, res) => {
      if (req.url.includes("?token=")) {
        queryLogins++;
        res.writeHead(302, { location: "/" });
        res.end();
        return;
      }
      if (req.headers.authorization !== "Bearer owned-token") {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
      if (req.url === "/external") {
        res.writeHead(302, { location: outside + "/leak" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        '<!doctype html><body><button id="healthy-control">Ready</button></body>',
      );
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    let chrome, dom;
    try {
      const { launchChromePipe } = await import("../lib/debugger.mjs");
      chrome = await launchChromePipe(chromePath, { timeoutMs: 5000 });
      const origin = `http://127.0.0.1:${server.address().port}`;
      dom = await runtime.createFunctionalDom(chrome, origin, {
        token: "owned-token",
      });
      const checks = [
        {
          id: "control",
          type: "dom",
          path: "/",
          selector: "#healthy-control",
          minCount: 1,
          maxCount: 1,
        },
      ];
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "pass",
      );
      assert.equal(queryLogins, 0);
      checks[0].path = "/external";
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "error",
      );
      assert.equal(externalHits, 0);
      checks[0].path = "/";
      assert.equal(
        (await health.executeFunctionalChecks(checks, { origin, dom }))[0]
          .status,
        "pass",
      );
    } finally {
      await dom?.close();
      await chrome?.close();
      await new Promise((r) => server.close(r));
      await new Promise((r) => external.close(r));
    }
  },
);
