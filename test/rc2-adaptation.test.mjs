import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { declaredSupport } from "../lib/declarations.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { packageFixture, fixtureCatalog as catalog } from "./fixture-utils.mjs";
const version = "0.2.1-rc.2";
const meta = {
  name: "sample",
  version: "1.0.0",
  engines: { dsh: ">=0.2.1-rc.2 <0.3.0" },
  peerDependencies: { "@deepseek-ai/dsh": "<0.2.1-rc.2" },
};

test("rc.2 engines alone accepts a matching plugin despite mismatched official peers", () => {
  const f = packageFixture("export function apply(){}", { meta });
  try {
    const { report } = extractWithProvenance(f.nm, { catalog });
    const p = buildVerdicts({ report, catalog, dshVersion: version }).plugins
      .sample;
    assert.ok(!p.findings.some((f) => f.category === "declared-incompatible"));
  } finally {
    f.cleanup();
  }
});
test("rc.2 rejects unmet engines even when the peer range matches", () => {
  const f = packageFixture("export function apply(){}", {
    meta: {
      ...meta,
      engines: { dsh: "<0.2.1-rc.2" },
      peerDependencies: { "@deepseek-ai/dsh": ">=0.2.1-rc.2 <0.3.0" },
    },
  });
  try {
    const { report } = extractWithProvenance(f.nm, { catalog });
    const p = buildVerdicts({ report, catalog, dshVersion: version }).plugins
      .sample;
    const finding = p.findings.find(
      (f) => f.category === "declared-incompatible",
    );
    assert.ok(finding);
    assert.equal(finding.ruleRef, "package.engines.dsh");
    assert.equal(finding.impactBasis, "inferred");
  } finally {
    f.cleanup();
  }
});
test("declaration adapter distinguishes peer workspace aliases, empty/invalid engines and inherited fields", () => {
  for (const range of ["workspace:^", "workspace:~", "workspace:*"]) {
    assert.equal(
      declaredSupport({ ...meta, engines: { dsh: range } }, version)
        .claimsCompatible,
      false,
    );
    assert.equal(
      declaredSupport(
        {
          name: "sample",
          version: "1.0.0",
          peerDependencies: { "@deepseek-ai/dsh": range },
        },
        version,
      ).claimsCompatible,
      true,
    );
  }
  for (const range of ["", "not-semver"])
    assert.equal(
      declaredSupport({ ...meta, engines: { dsh: range } }, version)
        .claimsCompatible,
      false,
    );
  const inherited = Object.assign(
    Object.create({ engines: { dsh: "<0.0.1" } }),
    { name: "sample", version: "1.0.0" },
  );
  assert.equal(declaredSupport(inherited, version), null);
});
test("legacy target retains peer rejection and advisory engines behavior", () => {
  const d = declaredSupport(
    {
      ...meta,
      engines: { dsh: ">=0.2.0-rc.2" },
      peerDependencies: { "@deepseek-ai/dsh": "<0.2.0-rc.2" },
    },
    "0.2.0-rc.2",
  );
  assert.equal(d.claimsCompatible, false);
  assert.equal(d.raw.peers[0].source, "peerDependencies");
});
test("ASAR byte reader returns complete first/last files without neighboring bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-asar-test-"));
  try {
    const r = spawnSync(
      "python3",
      ["-", "tools/catalog/extract-host-api.py", root],
      {
        encoding: "utf8",
        input: `import sys,struct,json,runpy,pathlib\nscript,root=sys.argv[1:];root=pathlib.Path(root)\nhost=b'export const SERVICE_API = ['+','.join('\\x7bkey: "svc%d", signature: "run()"\\x7d'%i for i in range(50)).encode()+b']; export const EVENT_API = [];'\nclient=b'const SERVICE_API = ['+','.join('\\x7bkey: "svc%d", signature: "go()"\\x7d'%i for i in range(3)).encode()+b'];'\nfiles={}\nfor key,data,offset in [('dsh/node_modules/@deepseek-ai/dsh-tool-cordis/lib/types/api-catalog.js',host,0),('dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js',client,len(host))]:\n node={'files':files}\n for part in key.split('/')[:-1]: node=node['files'].setdefault(part,{'files':{}})\n node['files'][key.split('/')[-1]]={'offset':str(offset),'size':len(data)}\nh=json.dumps({'files':files}).encode();pad=b'\\0'*((-len(h))%4);header=struct.pack('<II',len(h)+len(pad)+4,len(h))+h+pad\nasar=root/'fixture.asar';asar.write_bytes(struct.pack('<II',4,len(header))+header+host+client)\nsys.argv=[script,str(asar),str(root/'catalog.json')];ns=runpy.run_path(script)\nassert ns['read_asar_entry'](asar,ns['HOST_TARGET'])==host, 'host boundary mismatch'\nassert ns['read_asar_entry'](asar,ns['CLIENT_TARGET'])==client, 'client boundary mismatch'\nasar.write_bytes(asar.read_bytes()[:-1])\ntry: ns['read_asar_entry'](asar,ns['CLIENT_TARGET'])\nexcept ValueError: pass\nelse: raise AssertionError('truncated ASAR was silently accepted')\nprint('EXACT_BYTES')\n`,
      },
    );
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /EXACT_BYTES/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rc.2 exact exemption is scoped to plugin and runtime, never a manifest compatibility grant", () => {
  const f = packageFixture("export function apply(){}", {
    meta: { engines: { dsh: "<0.2.1-rc.2" } },
  });
  try {
    const { report } = extractWithProvenance(f.nm, { catalog });
    const check = (exemptions) =>
      buildVerdicts({
        report,
        catalog,
        dshVersion: version,
        compatibilityExemptions: exemptions,
      }).plugins.sample;
    const exempt = check({ "sample@1.0.0": [version] });
    assert.ok(
      !exempt.findings.some((f) => f.category === "declared-incompatible"),
    );
    assert.equal(exempt.coverage.status, "limited");
    assert.ok(exempt.coverage.limitations.some((x) => x.includes("豁免")));
    for (const grants of [
      {},
      { "sample@1.0.1": [version] },
      { "sample@1.0.0": ["0.2.1-rc.1"] },
    ])
      assert.ok(
        check(grants).findings.some(
          (f) => f.category === "declared-incompatible",
        ),
      );
  } finally {
    f.cleanup();
  }
});
test("rc.2 malformed declarations are reported without claiming measured activation failure", () => {
  for (const meta of [
    { engines: null },
    { engines: { dsh: 23 } },
    { peerDependencies: { unrelated: 23 } },
  ]) {
    const f = packageFixture("export function apply(){}", { meta });
    try {
      const { report } = extractWithProvenance(f.nm, { catalog });
      const p = buildVerdicts({ report, catalog, dshVersion: version }).plugins
        .sample;
      const finding = p.findings.find(
        (f) => f.category === "declared-incompatible",
      );
      assert.ok(finding, JSON.stringify(meta));
      assert.equal(finding.impactBasis, "inferred");
      assert.ok(!p.findings.some((f) => f.impactBasis === "measured"));
    } finally {
      f.cleanup();
    }
  }
});

test("CLI reads only independent profile compatibility grants and never edits them", () => {
  const f = packageFixture("export function apply(){}", {
    meta: { engines: { dsh: "<0.2.1-rc.2" } },
  });
  try {
    const file = path.join(f.root, "compatibility.json"),
      grants = JSON.stringify({ "sample@1.0.0": [version] });
    fs.writeFileSync(file, grants);
    const cli = spawnSync(
      process.execPath,
      [
        "bin/compat-check.mjs",
        "--nm",
        f.nm,
        "--dsh-version",
        version,
        "--no-baseline",
        "--json",
      ],
      { encoding: "utf8" },
    );
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.ok(
      !JSON.parse(cli.stdout).plugins.sample.findings.some(
        (f) => f.category === "declared-incompatible",
      ),
    );
    assert.equal(fs.readFileSync(file, "utf8"), grants);
    fs.writeFileSync(file, JSON.stringify({ "sample@1.0.0": ["*", version] }));
    const bad = spawnSync(
      process.execPath,
      [
        "bin/compat-check.mjs",
        "--nm",
        f.nm,
        "--dsh-version",
        version,
        "--no-baseline",
        "--json",
      ],
      { encoding: "utf8" },
    );
    assert.equal(bad.status, 1, bad.stdout);
    assert.ok(
      JSON.parse(bad.stdout).plugins.sample.coverage.limitations.some((s) =>
        s.includes("compatibility.json"),
      ),
    );
  } finally {
    f.cleanup();
  }
});

test("malformed fields cannot be bypassed with an exact exemption", () => {
  const f = packageFixture("export function apply(){}", {
    meta: { engines: { dsh: 23 } },
  });
  try {
    const { report } = extractWithProvenance(f.nm, { catalog });
    const p = buildVerdicts({
      report,
      catalog,
      dshVersion: version,
      compatibilityExemptions: { "sample@1.0.0": [version] },
    }).plugins.sample;
    assert.ok(p.findings.some((f) => f.category === "declared-incompatible"));
  } finally {
    f.cleanup();
  }
});
test("CLI selects rc.2 API methods without changing the old catalogue or explicit override", () => {
  const f = packageFixture(
    "export function apply(ctx){ctx.subagents.startActivation()}",
  );
  const call = (v, extra = []) =>
    JSON.parse(
      spawnSync(
        process.execPath,
        [
          "bin/compat-check.mjs",
          "--nm",
          f.nm,
          "--dsh-version",
          v,
          "--no-baseline",
          "--json",
          ...extra,
        ],
        { encoding: "utf8" },
      ).stdout,
    );
  try {
    assert.ok(
      !call(version).plugins.sample.findings.some(
        (f) => f.method === "startActivation",
      ),
    );
    assert.ok(
      call("0.2.0-rc.2").plugins.sample.findings.some(
        (f) => f.method === "startActivation",
      ),
    );
    assert.ok(
      call(version, [
        "--catalog",
        path.resolve("rules/dsh-api-catalog.json"),
      ]).plugins.sample.findings.some((f) => f.method === "startActivation"),
    );
  } finally {
    f.cleanup();
  }
});

test("unmet modern requirements require a nonempty manifest identity before exemption lookup", () => {
  const d = declaredSupport(
    { name: "", version: "1.0.0", engines: { dsh: "<0.2.1-rc.2" } },
    version,
  );
  assert.ok(d.invalid);
});

test(
  "non-regular compatibility input cannot hang the caller",
  { skip: process.platform === "win32" },
  () => {
    const f = packageFixture("export function apply(){}", {
      meta: { engines: { dsh: "<0.2.1-rc.2" } },
    });
    try {
      assert.equal(
        spawnSync("mkfifo", [path.join(f.root, "compatibility.json")]).status,
        0,
      );
      const cli = spawnSync(
        process.execPath,
        [
          "bin/compat-check.mjs",
          "--nm",
          f.nm,
          "--dsh-version",
          version,
          "--no-baseline",
          "--json",
        ],
        { encoding: "utf8", timeout: 2000 },
      );
      assert.equal(
        cli.status,
        1,
        cli.stderr || "compatibility FIFO blocked the CLI",
      );
      assert.ok(
        JSON.parse(cli.stdout).plugins.sample.coverage.limitations.some((s) =>
          s.includes("compatibility.json"),
        ),
      );
    } finally {
      f.cleanup();
    }
  },
);
