import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

const hostPath =
  "dsh/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js";
const clientPath =
  "dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js";
const bootPath = "dsh/node_modules/@deepseek-ai/dsh-app-boot/package.json";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("registry maintenance checks exact pinned catalogues without granting new certification", () => {
  const r = spawnSync(
    process.execPath,
    ["tools/catalog-review.mjs", "--check-registry", "--json"],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const result = JSON.parse(r.stdout);
  assert.equal(result.kind, "plugin-compat-check/catalog-registry-check");
  assert.deepEqual(
    result.entries.map((entry) => entry.version),
    ["0.2.0-rc.2", "0.2.1-rc.2", "0.2.1-rc.3"],
  );
  assert.ok(result.entries.every((entry) => entry.verified === true));
  assert.equal(result.certification, "unchanged");
  const invalid = spawnSync(
    process.execPath,
    [
      "tools/catalog-review.mjs",
      "--check-registry",
      "--candidate",
      "unused",
      "--json",
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(invalid.status, 3);
});

test("registry maintenance rejects changed pinned bytes and ignores unregistered candidates", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-registry-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "rules"));
  for (const file of [
    "dsh-api-catalog.json",
    "dsh-api-catalog-0.2.1-rc.2.json",
    "dsh-api-catalog-0.2.1-rc.3.json",
  ])
    fs.copyFileSync(path.join("rules", file), path.join(root, "rules", file));
  const mod = await import("../tools/catalog-review.mjs");
  const first = mod.checkCatalogRegistry(root);
  fs.writeFileSync(path.join(root, "rules/dsh-api-catalog-9.9.9.json"), "{}");
  assert.deepEqual(mod.checkCatalogRegistry(root), first);
  fs.appendFileSync(
    path.join(root, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
    " ",
  );
  assert.throws(() => mod.checkCatalogRegistry(root), /摘要|digest/);
});

// Real packed ASAR plus hand-authored generated API text: the test never uses
// the extractor to calculate its candidate or expected diff.
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-review-test-"));
  const scratch = path.join(root, "scratch");
  fs.mkdirSync(scratch);
  const host = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`svc${i}`, { methods: ["run"] }]),
  );
  const client = {
    shared: { methods: ["read"] },
    panel: { methods: ["show"] },
    editor: { methods: ["open"] },
  };
  const render = (entries) =>
    Object.entries(entries)
      .map(
        ([key, { methods }]) =>
          `{key: ${JSON.stringify(key)}, methods: [${methods.map((m) => `{signature: ${JSON.stringify(m + "()")}}`).join(",")}]}`,
      )
      .join(",");
  const hostBytes = Buffer.from(
    `export const SERVICE_API = [${render(host)}]; export const EVENT_API = [];`,
  );
  const clientBytes = Buffer.from(`const SERVICE_API = [${render(client)}];`);
  const files = {};
  const data = [];
  let offset = 0;
  for (const [name, bytes] of [
    [hostPath, hostBytes],
    [clientPath, clientBytes],
    [bootPath, Buffer.from('{"version":"0.3.0-rc.1"}')],
  ]) {
    let node = { files };
    const parts = name.split("/");
    for (const part of parts.slice(0, -1))
      node = node.files[part] ??= { files: {} };
    node.files[parts.at(-1)] = { offset: String(offset), size: bytes.length };
    offset += bytes.length;
    data.push(bytes);
  }
  const headerJson = Buffer.from(JSON.stringify({ files }));
  const paddedSize = Math.ceil(headerJson.length / 4) * 4;
  const prefix = Buffer.alloc(16);
  prefix.writeUInt32LE(4, 0);
  prefix.writeUInt32LE(paddedSize + 8, 4);
  prefix.writeUInt32LE(paddedSize + 4, 8);
  prefix.writeUInt32LE(headerJson.length, 12);
  const asar = path.join(root, "app.asar");
  fs.writeFileSync(
    asar,
    Buffer.concat([
      prefix,
      headerJson,
      Buffer.alloc(paddedSize - headerJson.length),
      ...data,
    ]),
  );
  const candidate = {
    _dshVersion: "0.3.0-rc.1",
    _source: { host: hostPath, client: clientPath },
    _sourceSha256: { host: sha(hostBytes), client: sha(clientBytes) },
    host,
    client,
  };
  const before = structuredClone({ host, client });
  delete before.host.svc49;
  before.host.oldHost = { methods: ["gone"] };
  before.host.svc0.methods = ["old"];
  delete before.client.panel;
  before.client.oldClient = { methods: ["gone"] };
  before.client.shared.methods = ["read", "write"];
  const beforePath = path.join(root, "before.json");
  const candidatePath = path.join(root, "candidate.json");
  fs.writeFileSync(beforePath, JSON.stringify(before));
  fs.writeFileSync(candidatePath, JSON.stringify(candidate));
  return {
    root,
    scratch,
    asar,
    beforePath,
    candidatePath,
    candidate,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
function run(f, extra = [], env = {}) {
  return spawnSync(
    process.execPath,
    [
      "tools/catalog-review.mjs",
      "--before",
      f.beforePath,
      "--candidate",
      f.candidatePath,
      "--asar",
      f.asar,
      "--json",
      ...extra,
    ],
    {
      encoding: "utf8",
      timeout: 15000,
      env: { ...process.env, TMPDIR: f.scratch, ...env },
    },
  );
}
function unchanged(f, original) {
  for (const [file, bytes] of original)
    assert.deepEqual(fs.readFileSync(file), bytes, file);
  assert.deepEqual(
    fs.readdirSync(f.scratch),
    [],
    "owned extraction directories must be cleaned",
  );
}

test("offline review verifies ASAR contents, reports separate host/client additions and removals, and leaves acceptance pending", () => {
  const f = fixture();
  try {
    const original = [f.asar, f.beforePath, f.candidatePath].map((file) => [
      file,
      fs.readFileSync(file),
    ]);
    const r = run(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const result = JSON.parse(r.stdout);
    assert.equal(result.sourceVerified, true);
    assert.equal(
      result.candidate.sha256,
      sha(fs.readFileSync(f.candidatePath)),
    );
    assert.equal(result.candidate.dshVersion, "0.3.0-rc.1");
    assert.equal(result.before.dshVersion, null);
    assert.equal(result.semanticReview, "pending");
    assert.equal(result.integrationAcceptance, "pending");
    assert.equal(result.certification, "not-granted");
    assert.deepEqual(result.diff.host, {
      servicesAdded: ["svc49"],
      servicesRemoved: ["oldHost"],
      methodsAdded: [
        { service: "svc0", method: "run" },
        { service: "svc49", method: "run" },
      ],
      methodsRemoved: [
        { service: "oldHost", method: "gone" },
        { service: "svc0", method: "old" },
      ],
    });
    assert.deepEqual(result.diff.client, {
      servicesAdded: ["panel"],
      servicesRemoved: ["oldClient"],
      methodsAdded: [{ service: "panel", method: "show" }],
      methodsRemoved: [
        { service: "oldClient", method: "gone" },
        { service: "shared", method: "write" },
      ],
    });
    unchanged(f, original);
  } finally {
    f.cleanup();
  }
});

test("review rejects version, source path, source hash and API tampering even when claimed hashes match the original source", () => {
  for (const mutate of [
    (c) => {
      delete c._dshVersion;
    },
    (c) => {
      c._dshVersion = "0.3.1";
    },
    (c) => {
      c._source.host = "other.js";
    },
    (c) => {
      delete c._sourceSha256;
    },
    (c) => {
      c._sourceSha256.client = "0".repeat(64);
    },
    (c) => {
      c.host.svc0.methods = ["fabricated"];
    },
    (c) => {
      c.client.shared.methods = ["fabricated"];
    },
    (c) => {
      c.host.svc0.methods = "run";
    },
    (c) => {
      c.host.svc0.methods = ["run", "run"];
    },
    (c) => {
      c.host = [];
    },
  ]) {
    const f = fixture();
    try {
      mutate(f.candidate);
      fs.writeFileSync(f.candidatePath, JSON.stringify(f.candidate));
      const original = [f.asar, f.beforePath, f.candidatePath].map((file) => [
        file,
        fs.readFileSync(file),
      ]);
      const r = run(f);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      const error = JSON.parse(r.stdout);
      assert.equal(error.sourceVerified, false);
      assert.ok(error.error);
      unchanged(f, original);
    } finally {
      f.cleanup();
    }
  }
});

test("review fails closed and cleans extraction output on Python failure or missing Python", () => {
  for (const missingPython of [false, true]) {
    const f = fixture();
    try {
      if (!missingPython) {
        // Still a valid packed archive, but the actual generator marker is absent.
        const bytes = fs.readFileSync(f.asar);
        bytes.write(
          "export const BROKEN__API",
          bytes.indexOf("export const SERVICE_API"),
        );
        fs.writeFileSync(f.asar, bytes);
      }
      const r = run(f, [], missingPython ? { PATH: "" } : {});
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.equal(JSON.parse(r.stdout).sourceVerified, false);
      assert.deepEqual(fs.readdirSync(f.scratch), []);
    } finally {
      f.cleanup();
    }
  }
});

test("review rejects oversized catalogues, out-of-bounds ASAR entries and unknown arguments without hanging", () => {
  for (const mode of ["catalog-size", "asar-bounds", "argument"]) {
    const f = fixture();
    try {
      if (mode === "catalog-size")
        fs.writeFileSync(f.candidatePath, " ".repeat(2 * 1024 * 1024 + 1));
      if (mode === "asar-bounds")
        fs.truncateSync(f.asar, fs.statSync(f.asar).size - 1);
      const r = run(f, mode === "argument" ? ["--certify"] : []);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.equal(JSON.parse(r.stdout).sourceVerified, false);
      assert.deepEqual(fs.readdirSync(f.scratch), []);
    } finally {
      f.cleanup();
    }
  }
});

test(
  "review rejects FIFO inputs before starting extraction",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture();
    try {
      fs.unlinkSync(f.candidatePath);
      assert.equal(spawnSync("mkfifo", [f.candidatePath]).status, 0);
      const r = run(f);
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.match(JSON.parse(r.stdout).error, /regular file/);
      assert.deepEqual(fs.readdirSync(f.scratch), []);
    } finally {
      f.cleanup();
    }
  },
);

// A deliberately stalled executable stands in only for the external Python
// dependency: observe start, bounded termination, owned-file cleanup and recovery.
test(
  "review kills a stalled extractor within its budget, cleans up and permits a fresh review",
  { skip: process.platform === "win32", timeout: 20000 },
  () => {
    const f = fixture();
    try {
      const commands = path.join(f.root, "commands");
      fs.mkdirSync(commands);
      const marker = path.join(f.root, "started");
      const stall = path.join(f.root, "stall.cjs");
      fs.writeFileSync(
        stall,
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000);`,
      );
      const quote = (s) => "'" + s.replaceAll("'", "'\\''") + "'";
      fs.writeFileSync(
        path.join(commands, "python3"),
        `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(stall)}\n`,
        { mode: 0o700 },
      );
      const start = Date.now();
      const r = run(f, [], { PATH: commands });
      assert.equal(r.status, 3, r.stdout + r.stderr);
      assert.ok(fs.existsSync(marker), "extractor must actually start");
      assert.match(JSON.parse(r.stdout).error, /ETIMEDOUT|SIGKILL/);
      assert.ok(
        Date.now() - start < 15000,
        "termination must complete within end-to-end bound",
      );
      const pid = Number(fs.readFileSync(marker, "utf8"));
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      assert.deepEqual(fs.readdirSync(f.scratch), []);
      assert.equal(run(f).status, 0, "a later real Python review must recover");
      assert.deepEqual(fs.readdirSync(f.scratch), []);
    } finally {
      f.cleanup();
    }
  },
);
