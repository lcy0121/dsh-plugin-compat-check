import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { extractWithProvenance } from "../lib/extract.mjs";
import { extractInWorker } from "../lib/worker-analysis.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const pluginName = "@example/duplicate";
const aliases = ["@installed/a-risk-alias", "z-safe-alias"];

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-duplicate-"));
  const home = path.join(root, "home");
  const nm = path.join(home, "profiles/duplicate/node_modules");
  fs.mkdirSync(nm, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function install(
    alias,
    { name = pluginName, version = "1.0.0", broken = false, dsh = true } = {},
  ) {
    const pkg = path.join(nm, alias);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name,
        version,
        type: "module",
        main: "index.js",
        ...(dsh
          ? {
              dsh: {
                bundle: { patch: "cordis.patch.yml" },
                ...(broken ? { client: { platform: "web" } } : {}),
              },
            }
          : {}),
      }),
    );
    fs.writeFileSync(
      path.join(pkg, "cordis.patch.yml"),
      "- name: ./index.js\n",
    );
    fs.writeFileSync(
      path.join(pkg, "index.js"),
      'export function apply(){throw Error("static scans must not execute plugins")}',
    );
    return pkg;
  }
  return { root, home, nm, install };
}

function assertDuplicate(error) {
  const message = typeof error === "string" ? error : error.message;
  assert.match(message, /同名|重复/);
  for (const value of [pluginName, ...aliases])
    assert.ok(
      message.includes(value),
      `duplicate error must identify ${value}: ${message}`,
    );
  return true;
}

test("malformed manifest names cannot bypass duplicate property identity rejection", (t) => {
  for (const [left, right] of [
    [" ", " "],
    [7, "7"],
    [{}, "[object Object]"],
  ]) {
    const f = fixture(t);
    f.install(aliases[0], { name: left });
    f.install(aliases[1], { name: right });
    assert.throws(() => extractWithProvenance(f.nm), /同名插件重复安装/);
  }
});

// Removing the inventory identity check must fail each case, even when neither
// package has findings. Rejection must not depend on which version/health wins.
for (const versions of [
  ["1.0.0", "1.0.0"],
  ["1.0.0", "2.0.0"],
]) {
  for (const health of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    test(`ordinary extraction rejects duplicate names at versions ${versions.join("/")} with broken aliases ${health.join("/")}`, (t) => {
      const f = fixture(t);
      aliases.forEach((alias, i) =>
        f.install(alias, { version: versions[i], broken: health[i] }),
      );
      assert.throws(() => extractWithProvenance(f.nm), assertDuplicate);
    });
  }
}

test("distinct manifest names preserve both installation instances and their provenance", (t) => {
  const f = fixture(t);
  f.install(aliases[0], { broken: true });
  f.install(aliases[1], { name: "@example/healthy" });
  const out = extractWithProvenance(f.nm);
  assert.deepEqual(
    Object.keys(out.report.perPlugin).sort(),
    [pluginName, "@example/healthy"].sort(),
  );
  assert.equal(out.report.perPlugin[pluginName].clientHalf.ok, false);
  assert.equal(
    out.report.perPlugin["@example/healthy"].clientHalf.declared,
    false,
  );
  assert.deepEqual(
    Object.keys(out.provenance.packages).sort(),
    [pluginName, "@example/healthy"].sort(),
  );
});

test("non-plugin and official packages do not create community identity conflicts", (t) => {
  const f = fixture(t);
  f.install(aliases[0]);
  f.install(aliases[1], { dsh: false });
  f.install("official-a", { name: "@deepseek-ai/official" });
  f.install("official-b", { name: "@deepseek-ai/official" });
  assert.deepEqual(Object.keys(extractWithProvenance(f.nm).report.perPlugin), [
    pluginName,
  ]);
});

test("unnamed plugin manifests retain their separate installation-path identities", (t) => {
  const f = fixture(t);
  f.install(aliases[0], { name: null });
  f.install(aliases[1], { name: "" });
  assert.equal(
    Object.keys(extractWithProvenance(f.nm).report.perPlugin).length,
    2,
  );
});

test("extract worker propagates duplicate identity failure instead of returning a partial report", async (t) => {
  const f = fixture(t);
  f.install(aliases[0], { broken: true });
  f.install(aliases[1]);
  await assert.rejects(extractInWorker(f.nm), assertDuplicate);
});

function cli(f, baseline) {
  return spawnSync(
    process.execPath,
    [
      path.join(repo, "bin/compat-check.mjs"),
      "--nm",
      f.nm,
      "--dsh-version",
      "0.2.1-rc.2",
      "--baseline-file",
      baseline,
      "--json",
    ],
    {
      encoding: "utf8",
      timeout: 20000,
      env: { ...process.env, DSH_HOME: f.home, HOME: f.home },
    },
  );
}

test("CLI returns tool error 3 for duplicate aliases and never advances or creates a baseline", (t) => {
  const f = fixture(t),
    baseline = path.join(f.root, "baseline.json");
  f.install(aliases[0], { broken: true });
  const initial = cli(f, baseline);
  assert.equal(initial.status, 2, initial.stdout + initial.stderr);
  const before = fs.readFileSync(baseline, "utf8");
  f.install(aliases[1]);
  const result = cli(f, baseline);
  assert.equal(result.status, 3, result.stdout + result.stderr);
  const body = JSON.parse(result.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.exitCode, 3);
  assertDuplicate(body.error);
  assert.equal(body.plugins, undefined);
  assert.equal(fs.readFileSync(baseline, "utf8"), before);
  assert.equal(fs.existsSync(baseline + ".lock"), false);
  const absent = path.join(f.root, "absent/baseline.json");
  assert.equal(cli(f, absent).status, 3);
  assert.equal(fs.existsSync(path.dirname(absent)), false);
});

function hostReport(f, dshVersion = "0.2.1-rc.2") {
  const script = `
    import fs from 'node:fs';
    import {apply} from ${JSON.stringify(new URL("../plugin/index.js", import.meta.url).href)};
    import {baselinePath} from ${JSON.stringify(new URL("../lib/state-store.mjs", import.meta.url).href)};
    const nm=${JSON.stringify(f.nm)},routes=new Map(),effects=[];
    let tool;
    const baseline=baselinePath(nm),before='existing baseline must survive duplicate inventory\\n';
    fs.mkdirSync(${JSON.stringify(path.join(f.home, "dsh-plugin-compat-check"))},{recursive:true});
    fs.writeFileSync(baseline,before);
    const ctx={get:()=>undefined,inject:(deps,cb)=>{
      const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path);}},tools:{register:t=>{tool=t;return()=>{};}}});
      if(typeof off==='function')effects.push(off);return off;
    },effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off);}};
    apply(ctx);
    try {
      let status,text;
      await routes.get('/plugin-compat-check/report').handler({headers:{host:'127.0.0.1:8123'},method:'GET',url:'/plugin-compat-check/report?refresh=1',socket:{encrypted:false}},
        {writeHead:c=>status=c,setHeader(){},end:t=>text=t});
      const agent=await tool.execute({});
      console.log('DUPLICATE_RESULT '+JSON.stringify({status,host:JSON.parse(text),agent,unchanged:fs.readFileSync(baseline,'utf8')===before,files:fs.readdirSync(${JSON.stringify(path.join(f.home, "dsh-plugin-compat-check"))})}));
    } finally {for(const off of effects)off();}
    process.exit(0);
  `;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        HOME: f.home,
        DSH_HOME: f.home,
        DSC_KERNEL: repo,
        DSC_PROFILE: "duplicate",
        DSH_VERSION: dshVersion,
        DSC_AUTORUN_MS: "60000",
        DSC_OUT_DIR: path.join(f.root, "diagnostic"),
      },
    },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const line = result.stdout
    .split("\n")
    .find((row) => row.startsWith("DUPLICATE_RESULT "));
  assert.ok(line, result.stdout);
  return JSON.parse(line.slice("DUPLICATE_RESULT ".length));
}

test("host report route and agent tool return explicit duplicate failure without touching baseline state", (t) => {
  const f = fixture(t);
  f.install(aliases[0], { broken: true });
  f.install(aliases[1], { version: "2.0.0" });
  const body = hostReport(f);
  assert.equal(body.status, 200);
  for (const out of [body.host, body.agent]) {
    assert.equal(out.ok, false);
    assert.equal(out.exitCode, 3);
    assert.equal(out.report.ok, false);
    assert.equal(out.report.exitCode, 3);
    assert.equal(out.report.plugins, undefined);
    assert.equal(out.baseline, null);
    assertDuplicate(out.error);
  }
  assert.equal(body.unchanged, true);
  assert.equal(body.files.length, 1);
});

test("host and agent expose an uncertified future DSH version with the actual reference catalogue digest", (t) => {
  const f = fixture(t);
  f.install(aliases[0]);
  const body = hostReport(f, "9.9.9");
  assert.equal(body.status, 200);
  assert.equal(body.host.ok, true);
  assert.equal(body.agent.ok, true);
  for (const out of [body.host, body.agent]) {
    assert.equal(out.report.catalog.targetVersion, "9.9.9");
    assert.equal(out.report.catalog.referenceVersion, "0.2.1-rc.2");
    assert.equal(out.report.catalog.verified, false);
    assert.equal(
      out.report.catalog.sha256,
      "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
    );
  }
  assert.match(body.agent.text, /未认证/);
  assert.ok(
    body.agent.text.includes(
      "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
    ),
  );
});
