import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { panelHarness } from "./support/panel-harness.mjs";
const repo = path.resolve(".");
const version = "0.2.1-rc.2";
function fixture(t) {
  const f = packageFixture(
    "export function apply(ctx){ctx.settings.dscFutureMissing()}",
  );
  t.after(f.cleanup);
  const nm = path.join(f.root, "home/profiles/time/node_modules");
  fs.mkdirSync(path.dirname(nm), { recursive: true });
  fs.renameSync(f.nm, nm);
  f.nm = nm;
  f.file = path.join(f.root, "probe.json");
  f.surface = {
    observationVersion: 1,
    profileId: f.nm,
    dshVersion: version,
    probedAt: "2100-01-01T00:00:00Z",
    root: { settings: { present: true, methods: {}, complete: true } },
    entries: {
      plugins: [{ packageName: "sample", state: "FAILED", disabled: false }],
    },
  };
  fs.writeFileSync(f.file, JSON.stringify(f.surface));
  return f;
}
function checkRejected(body) {
  assert.equal(body.ok, true);
  assert.equal(body.observation.usable, false);
  assert.equal(body.observation.mode, "catalogue");
  assert.match(body.observation.notes.join(" "), /未来|时钟/);
  assert.equal(
    body.plugins.sample.findings.some(
      (x) => x.category === "host-entry-inactive",
    ),
    false,
  );
  const method = body.plugins.sample.findings.find(
    (x) => x.method === "dscFutureMissing",
  );
  assert(method);
  assert.equal(method.certainty, "suspected");
  assert.equal(method.impactBasis, "inferred");
}
test("CLI rejects a future file probe across JSON, text and sanitized issue output", (t) => {
  const f = fixture(t);
  const args = [
    "bin/compat-check.mjs",
    "--nm",
    f.nm,
    "--dsh-version",
    version,
    "--probe",
    f.file,
    "--no-baseline",
  ];
  for (const flag of ["--json", null, "--issue-report"]) {
    const out = spawnSync(
      process.execPath,
      [...args, ...(flag ? [flag] : [])],
      { encoding: "utf8", timeout: 15000 },
    );
    assert.equal(out.status, 1, out.stdout + out.stderr);
    if (flag === "--json") checkRejected(JSON.parse(out.stdout));
    else assert.match(out.stdout, /未来|时钟/);
  }
  assert.equal(
    JSON.parse(fs.readFileSync(f.file)).probedAt,
    "2100-01-01T00:00:00Z",
  );
});

test("quiet output keeps a future-probe rejection reason on its single summary line", (t) => {
  const f = fixture(t);
  const out = spawnSync(
    process.execPath,
    [
      "bin/compat-check.mjs",
      "--nm",
      f.nm,
      "--dsh-version",
      version,
      "--probe",
      f.file,
      "--no-baseline",
      "--quiet",
    ],
    { encoding: "utf8", timeout: 15000 },
  );
  assert.match(out.stdout, /未来|时钟/);
  assert.equal(out.stdout.trim().split("\n").length, 1);
});

test(
  "probe-boot explains a future sample and reclaims its owned process and profile",
  { skip: process.platform === "win32", timeout: 15000 },
  (t) => {
    const f = fixture(t),
      commands = path.join(f.root, "commands"),
      marker = path.join(f.root, "started.json");
    fs.mkdirSync(commands);
    fs.writeFileSync(
      path.join(path.dirname(f.nm), "package.json"),
      JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }),
    );
    fs.writeFileSync(
      path.join(commands, "dsh"),
      `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');if(process.argv.includes('--version'))console.log('0.2.1-rc.2');else if(process.argv.includes('--no-open')){fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,work:process.env.DSC_OUT_DIR,profile:path.join(process.env.DSH_HOME,'profiles',process.argv[process.argv.indexOf('--profile')+1])}));fs.writeFileSync(path.join(process.env.DSC_OUT_DIR,'probe-report.json'),JSON.stringify({observationVersion:1,profileId:process.env.DSC_PROFILE_ID,dshVersion:process.env.DSC_DSH_VERSION,probedAt:'2100-01-01T00:00:00Z',root:{}}));setInterval(()=>{},1000);}`,
      { mode: 0o700 },
    );
    const out = spawnSync(
      process.execPath,
      [
        "bin/compat-check.mjs",
        "--nm",
        f.nm,
        "--dsh-version",
        version,
        "--probe-boot",
        "--probe-timeout",
        "3",
        "--no-baseline",
        "--json",
      ],
      {
        encoding: "utf8",
        timeout: 12000,
        env: {
          ...process.env,
          PATH: commands + path.delimiter + process.env.PATH,
        },
      },
    );
    assert.equal(out.status, 3, out.stdout + out.stderr);
    const body = JSON.parse(out.stdout);
    assert.match(body.error, /未来|时钟/);
    assert.equal(body.inputs.probeBoot.tempProfileRemoved, true);
    const owned = JSON.parse(fs.readFileSync(marker));
    assert.throws(() => process.kill(owned.pid, 0), { code: "ESRCH" });
    assert.equal(fs.existsSync(owned.profile), false);
    assert.equal(fs.existsSync(owned.work), false);
    assert.equal(
      fs.existsSync(path.join(path.dirname(f.nm), "package.json")),
      true,
    );
  },
);

test("host HTTP, agent and actual client factory retain future-probe rejection and allow a later valid refresh", async (t) => {
  const f = fixture(t);
  const script = `
    import fs from 'node:fs';
    import {apply} from ${JSON.stringify(new URL("../plugin/index.js", import.meta.url).href)};
    const routes=new Map(),effects=[]; let tool;
    const ctx={get:()=>undefined,inject:(deps,cb)=>{const off=cb({webServer:{register:r=>{routes.set(r.path,r);return()=>routes.delete(r.path)}},tools:{register:t=>{tool=t;return()=>{}}}});if(typeof off==='function')effects.push(off);return off;},effect:fn=>{const off=fn();if(typeof off==='function')effects.push(off)}};
    apply(ctx);
    const request=async()=>{let text,status;await routes.get('/plugin-compat-check/report').handler({headers:{'x-dsh-compat-request':'1',host:'127.0.0.1:8123'},method:'GET',url:'/plugin-compat-check/report?refresh=1',socket:{encrypted:false}},{writeHead:c=>status=c,setHeader(){},end:t=>text=t});return {status,body:JSON.parse(text)}};
    try {
      const http=await request(),agent=await tool.execute({});
      const file=${JSON.stringify(f.file)},surface=JSON.parse(fs.readFileSync(file));surface.probedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(surface));
      const recovered=await request();
      console.log('TIME_RESULT '+JSON.stringify({http,agent,recovered}));
    } finally {for(const off of effects)off()}
    process.exit(0);
  `;
  const out = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    {
      encoding: "utf8",
      timeout: 20000,
      env: {
        ...process.env,
        DSH_HOME: path.join(f.root, "home"),
        DSC_KERNEL: repo,
        DSC_PROFILE: "time",
        DSC_PROBE_REPORT: f.file,
        DSH_VERSION: version,
        DSC_AUTORUN_MS: "60000",
        DSC_OUT_DIR: path.join(f.root, "diagnostic"),
      },
    },
  );
  assert.equal(out.status, 0, out.stdout + out.stderr);
  const data = JSON.parse(
    out.stdout
      .split("\n")
      .find((l) => l.startsWith("TIME_RESULT "))
      .slice(12),
  );
  assert.equal(data.http.status, 200);
  checkRejected(data.http.body.report);
  checkRejected(data.agent.report);
  assert.match(data.agent.text, /未来|时钟/);
  const h = await panelHarness(data.http.body);
  assert.match(h.text(), /未来|时钟/);
  assert.equal(data.recovered.body.report.observation.usable, true);
  assert(
    data.recovered.body.report.plugins.sample.findings.some(
      (x) => x.category === "host-entry-inactive",
    ),
  );
});
