/** Same-candidate HTTP auth/fail-closed/restart acceptance in owned npm profiles. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { command, stopOwnedChild } from "../lib/probe-runner.mjs";
import { ownedHostHeaders } from "./owned-host-session.mjs";
import { disableCredentialOnboarding } from "./browser-session.mjs";
import { cleanupAcceptance } from "./acceptance-cleanup.mjs";
import { hostRuntimeDriver } from "./host-runtime-driver.mjs";
import { assertHostRuntime } from "./acceptance-target.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";
const versions = ["0.2.2-rc.2", "0.2.2-rc.3"];
const redact = (s) =>
  String(s)
    .replace(/([?&]token=)[^\s&]+/g, "$1[redacted]")
    .replace(
      /dsh-auth-[a-zA-Z0-9_-]+=v[12]\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
      "[redacted-cookie]",
    );
export function validateAuthAcceptance(r, expectedVersion, expectedSha) {
  assert(versions.includes(expectedVersion));
  assert.equal(r.hostVersion, expectedVersion);
  assert.equal(r.artifactSha256, expectedSha);
  assert.match(expectedSha, /^[a-f0-9]{64}$/);
  assert.equal(r.ok, true);
  assert.equal(r.hostStopped, true);
  assert.equal(r.cleaned, true);
  assert.equal(r.cleanupError, undefined);
  assert.equal(r.carrier.kind, "npm");
  assert.equal(r.carrier.version, expectedVersion);
  assertHostRuntime(expectedVersion, r.carrier.node.replace(/^v/, ""));
  assert.equal(r.initial.status, 200);
  assert.equal(r.initial.ok, true);
  assert.equal(r.initial.dshVersion, expectedVersion);
  assert.equal(r.initial.toolVersion, TOOL_VERSION);
  assert.deepEqual(
    r.unavailable.responses.map((x) => [x.id, x.status, x.noStore, x.noReport]),
    [
      ["refresh", 503, true, true],
      ["metadata", 503, true, true],
      ["upgrade", 503, true, true],
      ["reviews", 503, true, true],
    ],
  );
  assert(
    r.unavailable.before.counters.gets > 0 &&
      r.unavailable.before.counters.starts > 0 &&
      r.unavailable.before.counters.workers > 0,
    "candidate instrumentation never observed real computation",
  );
  assert(
    Array.isArray(r.unavailable.before.files),
    "product state was not observed",
  );
  assert.deepEqual(r.unavailable.after, r.unavailable.before);
  assert.equal(r.unavailable.before.writeProbeConfirmed, true);
  assert(
    Number.isSafeInteger(r.unavailable.before.counters.writes) &&
      r.unavailable.before.counters.writes >= 2,
    "write counter was never positively exercised",
  );
  assert.equal(r.recovered.status, 200);
  assert.equal(r.recovered.ok, true);
  for (const value of [r.initial.computedAt, r.recovered.computedAt])
    assert(
      typeof value === "string" &&
        value.length > 0 &&
        Number.isFinite(Date.parse(value)),
      "missing computed timestamp",
    );
  assert.equal(r.recovered.computedAt, r.initial.computedAt);
  assert.equal(r.restart.sameAuthority, true);
  assert.equal(r.restart.oldCookieStatus, 200);
  assert.equal(r.restart.oldLaunchTokenStatus, 401);
  assert.equal(r.restart.oldLaunchNoSetCookie, true);
  assert.equal(r.restart.newCookieStatus, 200);
  assert.equal(r.restart.policy, "persistent-signing-secret-and-authority");
  assert.equal(r.newAuthority.differentPort, true);
  assert.equal(r.newAuthority.oldCookieStatus, 401);
  assert.equal(r.newAuthority.newCookieStatus, 200);
  assert.equal(r.restartsStopped, true);
  assert(Number.isFinite(r.elapsedMs) && r.elapsedMs > 0);
  return r;
}
export async function runAuthAcceptance(
  output,
  artifact,
  hostVersion,
  expectedSha,
) {
  assert.match(
    expectedSha || "",
    /^[a-f0-9]{64}$/,
    "explicit candidate SHA required",
  );
  assert(versions.includes(hostVersion), "exact auth host required");
  output = path.resolve(output);
  fs.mkdirSync(output, { recursive: true });
  assert.equal(fs.readdirSync(output).length, 0);
  artifact = path.resolve(artifact);
  const artifactBytes = fs.readFileSync(artifact),
    artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
  assert.equal(artifactSha256, expectedSha, "candidate SHA mismatch");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-auth025-")),
    env = isolatedEnvironment(root),
    profileName = "owned-auth025",
    profile = path.join(env.DSH_HOME, "profiles", profileName),
    fixture = "@acceptance/auth025",
    started = Date.now(),
    deadline = started + 300000,
    r = {
      hostVersion,
      artifactSha256,
      scope:
        "Actual unchanged candidate, owned npm profile and HTTP only; persistent signed-cookie authority and process launch-token semantics, not user-profile credential rotation.",
    };
  let host;
  const stopped = [];
  const exec = async (c, a) => {
    const x = await command(c, a, { env, timeoutMs: 120000 });
    assert.equal(x.code, 0, redact(x.error || x.output).slice(-1800));
    return x.output;
  };
  const poll = async (fn, label) => {
    while (Date.now() < deadline) {
      const x = await fn();
      if (x) return x;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error(label);
  };
  const boot = async (port = 0) => {
    host = spawn(
      "dsh",
      ["--profile", profileName, "--", "--port", String(port), "--no-open"],
      { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    for (const s of [host.stdout, host.stderr])
      s.on("data", (b) => {
        if (log.length < 1024 * 1024) log += b;
      });
    const url = await poll(() => {
      if (host.exitCode !== null) throw Error(redact(log).slice(-1600));
      return /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(log)?.[1];
    }, "owned auth host startup");
    return { url, log: () => log };
  };
  const stop = async () => {
    await stopOwnedChild(host);
    assert(host.exitCode !== null || host.signalCode !== null);
    stopped.push(true);
    host = null;
  };
  try {
    const actual = (await exec("dsh", ["--version"])).trim().split("\n").at(-1);
    assert.equal(actual, hostVersion);
    const driver = hostRuntimeDriver({ env });
    assert(
      !driver.env.ELECTRON_RUN_AS_NODE,
      "auth runner requires selected official npm host",
    );
    r.carrier = {
      kind: "npm",
      version: actual,
      node: (
        await exec(driver.command, ["-p", "process.versions.node"])
      ).trim(),
      launcher: driver.cli,
      module: driver.module,
    };
    await exec("dsh", [
      "--profile",
      profileName,
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(profile);
    const copy = path.join(root, "candidate.tgz");
    fs.writeFileSync(copy, artifactBytes);
    await exec("dsh", [
      "plugin",
      "--profile",
      profileName,
      "add",
      "file:" + copy,
    ]);
    assert.equal(
      createHash("sha256").update(fs.readFileSync(artifact)).digest("hex"),
      artifactSha256,
      "candidate mutated",
    );
    const installed = fs.realpathSync(
        path.join(profile, "node_modules/dsh-plugin-compat-check"),
      ),
      dir = path.join(profile, "node_modules", fixture);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: fixture,
        version: "1.0.0",
        type: "module",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "cordis.patch.yml"),
      '- insert:\n    - id: auth025-fixture\n      name: "@acceptance/auth025"\n',
    );
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `import {ReportService} from ${JSON.stringify(pathToFileURL(path.join(installed, "kernel/lib/report-service.mjs")).href)};import wt from 'node:worker_threads';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';export const inject=['webServer','connection'];export function apply(ctx){const counters={gets:0,starts:0,workers:0,writes:0};for(const holder of [fs,fs.promises])for(const key of ['writeFile','writeFileSync','appendFile','appendFileSync','rename','renameSync','mkdir','mkdirSync','unlink','unlinkSync','rm','rmSync']){if(typeof holder[key]!=='function')continue;const original=holder[key];holder[key]=function(...args){if(args.slice(0,2).some(p=>typeof p==='string'&&p.startsWith(process.env.DSH_HOME+'/')))counters.writes++;return original.apply(this,args)};ctx.effect(()=>()=>{holder[key]=original;syncBuiltinESMExports()})}syncBuiltinESMExports();const beforeProbe=counters.writes,probe=process.env.DSH_HOME+'/auth025-write-probe';fs.writeFileSync(probe,'owned acceptance write probe');fs.unlinkSync(probe);const writeProbeConfirmed=counters.writes===beforeProbe+2;for(const key of ['get','start']){const original=ReportService.prototype[key];ReportService.prototype[key]=function(...args){counters[key==='get'?'gets':'starts']++;return original.apply(this,args)};ctx.effect(()=>()=>{ReportService.prototype[key]=original})}const W=wt.Worker;wt.Worker=class extends W{constructor(...args){if(String(args[0]).includes(${JSON.stringify(installed)}))counters.workers++;super(...args)}};syncBuiltinESMExports();ctx.effect(()=>()=>{wt.Worker=W;syncBuiltinESMExports()});const connection=ctx.connection,descriptor=Object.getOwnPropertyDescriptor(connection,'requestRejection'),gate=connection.requestRejection.bind(connection);let disabled=false;const restore=()=>{if(descriptor)Object.defineProperty(connection,'requestRejection',descriptor);else delete connection.requestRejection;disabled=false;};ctx.effect(()=>restore);ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/acceptance/auth025',async handler(req,res){const reject=gate(req);if(reject!==undefined){res.writeHead(reject);res.end('{}');return;}if(req.method!=='POST'||req.headers['x-dsh-compat-request']!=='1'){res.writeHead(403);res.end('{}');return;}const action=new URL(req.url,'http://localhost').searchParams.get('action');if(action==='disable'){Object.defineProperty(connection,'requestRejection',{configurable:true,writable:true,value:undefined});disabled=true;}else if(action==='restore')restore();res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({counters,writeProbeConfirmed,disabled,available:typeof connection.requestRejection==='function'}));}}));}`,
    );
    const p = path.join(profile, "package.json"),
      pkg = JSON.parse(fs.readFileSync(p));
    pkg.dependencies[fixture] = "file:" + dir;
    pkg.dsh.profile.bundles.push(fixture);
    fs.writeFileSync(p, JSON.stringify(pkg));
    const request = async (
      url,
      headers,
      route = "/plugin-compat-check/report?metadata=1",
    ) => {
      const response = await fetch(new URL(route, url), {
        headers,
        signal: AbortSignal.timeout(60000),
      });
      return { status: response.status, body: await response.json() };
    };
    const admin = async (url, headers, action) => {
      const x = await fetch(
        new URL("/acceptance/auth025?action=" + action, url),
        { method: "POST", headers, signal: AbortSignal.timeout(10000) },
      );
      assert.equal(x.status, 200);
      return x.json();
    };
    const disk = () => {
      const base = path.join(env.DSH_HOME, "dsh-plugin-compat-check"),
        rows = [];
      const walk = (d) => {
        if (!fs.existsSync(d)) return;
        for (const name of fs.readdirSync(d).sort()) {
          const f = path.join(d, name),
            s = fs.lstatSync(f);
          assert(!s.isSymbolicLink());
          if (s.isDirectory()) walk(f);
          else
            rows.push([
              path.relative(base, f),
              createHash("sha256").update(fs.readFileSync(f)).digest("hex"),
            ]);
        }
      };
      walk(base);
      return rows;
    };
    const snapshot = async (url, headers) => {
      const state = await admin(url, headers, "state");
      return {
        counters: state.counters,
        writeProbeConfirmed: state.writeProbeConfirmed,
        files: disk(),
      };
    };
    const first = await boot(),
      headers = await ownedHostHeaders(first.url);
    await poll(
      () => first.log().includes("F2 启动自检:"),
      "candidate startup autorun completed",
    );
    const initial = await request(
      first.url,
      headers,
      "/plugin-compat-check/report",
    );
    assert.equal(initial.body.ok, true);
    r.initial = {
      status: initial.status,
      ok: initial.body.ok,
      computedAt: initial.body.computedAt,
      dshVersion: initial.body.dshVersion,
      toolVersion: initial.body.toolVersion,
    };
    r.initial.dshVersion ||= initial.body.report?.dshVersion;
    const switched = await admin(first.url, headers, "disable");
    assert.equal(switched.available, false);
    r.unavailable = {
      before: await snapshot(first.url, headers),
      responses: [],
    };
    for (const [id, route, method] of [
      ["refresh", "/report?refresh=1", "GET"],
      ["metadata", "/report?metadata=1", "GET"],
      ["upgrade", "/upgrade-preview?targetVersion=0.2.2-rc.1", "GET"],
      ["reviews", "/reviews", "POST"],
    ]) {
      const x = await fetch(
        new URL("/plugin-compat-check" + route, first.url),
        {
          method,
          headers: {
            ...headers,
            ...(method === "POST"
              ? { "content-type": "application/json" }
              : {}),
          },
          ...(method === "POST" ? { body: "{}" } : {}),
          signal: AbortSignal.timeout(10000),
        },
      );
      const text = await x.text();
      r.unavailable.responses.push({
        id,
        status: x.status,
        noStore: x.headers.get("cache-control") === "no-store",
        noReport: !text.includes('"nodeModules"') && !text.includes('"report"'),
      });
    }
    r.unavailable.after = await snapshot(first.url, headers);
    const restored = await admin(first.url, headers, "restore");
    assert.equal(restored.available, true);
    const recovered = await request(first.url, headers);
    r.recovered = {
      status: recovered.status,
      ok: recovered.body.ok,
      computedAt: recovered.body.computedAt,
    };
    const oldURL = first.url,
      port = Number(new URL(oldURL).port);
    await stop();
    const second = await boot(port),
      newHeaders = await ownedHostHeaders(second.url),
      oldStatus = (await request(second.url, headers)).status,
      oldTokenResponse = await fetch(oldURL, {
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      }),
      oldToken = oldTokenResponse.status,
      newStatus = (await request(second.url, newHeaders)).status;
    r.restart = {
      sameAuthority: new URL(second.url).origin === new URL(oldURL).origin,
      oldCookieStatus: oldStatus,
      oldLaunchTokenStatus: oldToken,
      oldLaunchNoSetCookie:
        oldTokenResponse.headers.getSetCookie().length === 0,
      newCookieStatus: newStatus,
      policy: "persistent-signing-secret-and-authority",
    };
    await stop();
    let third = await boot();
    if (new URL(third.url).port === String(port)) {
      await stop();
      third = await boot();
    }
    const thirdHeaders = await ownedHostHeaders(third.url);
    r.newAuthority = {
      differentPort: new URL(third.url).port !== String(port),
      oldCookieStatus: (await request(third.url, headers)).status,
      newCookieStatus: (await request(third.url, thirdHeaders)).status,
    };
    r.restartsStopped = stopped.every(Boolean) && stopped.length >= 2;
    r.ok = true;
  } catch (e) {
    r.ok = false;
    r.error = redact(e.stack);
  } finally {
    Object.assign(r, await cleanupAcceptance({ host, root }));
    r.elapsedMs = Date.now() - started;
    if (r.cleanupError) {
      r.ok = false;
      r.error ||= r.cleanupError;
    }
    try {
      validateAuthAcceptance(r, hostVersion, artifactSha256);
    } catch (e) {
      r.ok = false;
      r.error ||= redact(e.stack);
    }
    fs.writeFileSync(
      path.join(output, "summary.json"),
      JSON.stringify(r, null, 2) + "\n",
    );
  }
  return r;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const r = await runAuthAcceptance(
    process.argv[2],
    process.argv[3],
    process.env.DSC_ACCEPTANCE_DSH_VERSION,
    process.argv[4],
  );
  console.log(JSON.stringify(r));
  process.exitCode = r.ok ? 0 : 1;
}
