/** Owned real PluginManager acceptance; no production profile, package or registry. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { command } from "../lib/probe-runner.mjs";
import { cleanupAcceptance } from "./acceptance-cleanup.mjs";
import { ownedHostHeaders } from "./owned-host-session.mjs";
import { disableCredentialOnboarding } from "./browser-session.mjs";
import { acceptanceCapabilities } from "./acceptance-target.mjs";
const redact = (s) => String(s).replace(/([?&]token=)[^\s&]+/g, "$1[redacted]");

/** Green means all fixed controls and owned cleanup, never arbitrary bundle compatibility. */
export function validateManagerAcceptance(r, version) {
  assert(acceptanceCapabilities(version).modern, "exact manager host required");
  assert.equal(r.hostVersion, version);
  assert.equal(r.ok, true);
  assert.equal(r.hostStopped, true);
  assert.equal(r.cleaned, true);
  assert.equal(r.cleanupError, undefined);
  assert.equal(r.runtimePackageVersion, version);
  assert.equal(r.cases.length, 6);
  const cases = new Map(r.cases.map((x) => [x.id, x]));
  assert.equal(cases.size, 6);
  for (const id of [
    "install",
    "update",
    "enable-failure",
    "bad-archive",
    "cancel",
    "unexpected-package",
  ])
    assert(cases.has(id), "missing manager control: " + id);
  assert.equal(cases.get("install").result.application, "applied");
  assert.equal(cases.get("update").result.result.application, "applied");
  for (const c of r.cases) {
    const expected = c.id === "install" ? "1.0.0" : "1.1.0";
    assert.equal(c.state.dependency, expected);
    assert.equal(c.state.packageVersion, expected);
    assert.equal(c.state.bundle.enabled, true);
    assert.equal(c.state.bundle.availability, "profile");
    assert.equal(c.state.bundle.version, expected);
    assert(Number.isSafeInteger(c.before.lifecycle.length));
    assert(
      c.state.lifecycle.length > c.before.lifecycle.length,
      "no fresh lifecycle observation",
    );
    assert.deepEqual(
      c.state.lifecycle.slice(0, c.before.lifecycle.length),
      c.before.lifecycle,
      "lifecycle history was replaced",
    );
    assert(
      c.state.lifecycle
        .slice(c.before.lifecycle.length)
        .some((x) => x.event === "apply" && x.version === expected),
      "no fresh apply after operation",
    );
    assert.deepEqual(c.state.lifecycle.at(-1), {
      event: "apply",
      version: expected,
    });
    if (!["install", "update"].includes(c.id)) {
      assert.equal(
        c.result.result.application,
        c.id === "cancel" ? "cancelled" : "failed",
      );
      assert.equal(c.result.restore.application, "applied");
      assert.equal(c.result.restore.version, "1.1.0");
    }
  }
  assert.equal(cases.get("enable-failure").result.result.stage, "enable");
  assert.equal(
    cases.get("enable-failure").result.result.packageResult.exitCode,
    0,
  );
  assert.equal(cases.get("bad-archive").result.result.stage, "install");
  assert.equal(cases.get("cancel").cancelled.status, "cancelled");
  assert.equal(
    cases.get("unexpected-package").result.result.error.code,
    "unexpected-package",
  );
  assert(
    !r.cases.some((c) => c.state.lifecycle.some((x) => x.version === "9.9.9")),
    "unexpected package activated",
  );
  assert.equal(r.bundleContract.registryUpdate, "registry");
  assert.equal(r.bundleContract.fileUpdateAbsent, true);
  assert.equal(r.bundleContract.oldUpdatableAbsent, true);
  assert.equal(r.gitContract.mode, "git");
  assert.equal(r.gitContract.oldUpdatableAbsent, true);
  assert.equal(r.gitContract.install.application, "applied");
  assert.equal(r.gitContract.update.result.application, "applied");
  assert.match(
    r.gitContract.dependency,
    /^git\+http:\/\/127\.0\.0\.1:\d+\/git\/repo\.git#[0-9a-f]{40}$/,
  );
  assert.deepEqual(
    r.gitContract.lifecycle.map((x) => x.version),
    ["1.0.0", "1.1.0"],
  );
  return r;
}

export async function runManagerAcceptance(output, hostVersion) {
  assert(
    acceptanceCapabilities(hostVersion).modern,
    "reviewed exact manager host required",
  );
  output = path.resolve(output);
  fs.mkdirSync(output, { recursive: true });
  assert.equal(fs.readdirSync(output).length, 0, "output must be empty");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-manager025-")),
    env = isolatedEnvironment(root),
    profileName = "owned-manager025",
    profile = path.join(env.DSH_HOME, "profiles", profileName),
    name = "dsc-owned-manager025",
    fixtureName = "@acceptance/manager025",
    receipt = {
      hostVersion,
      cases: [],
      scope:
        "Actual selected host PluginManager, own loopback registry and packages only; no user profile/model/account or general business certification.",
    };
  const deadline = Date.now() + 600000;
  const remaining = () => {
    assert(Date.now() < deadline, "manager suite exceeded10minute budget");
    return deadline - Date.now();
  };
  let host, registry;
  const sockets = new Set();
  const exec = async (c, a, timeoutMs = 120000) => {
    const r = await command(c, a, {
      env,
      timeoutMs: Math.min(timeoutMs, remaining()),
    });
    assert.equal(r.code, 0, redact(r.error || r.output).slice(-1800));
    return r.output;
  };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const poll = async (fn, label, ms = 60000) => {
    const end = Date.now() + Math.min(ms, remaining());
    while (Date.now() < end) {
      const r = await fn();
      if (r) return r;
      await delay(100);
    }
    throw Error(label);
  };
  try {
    const actual = (await exec("dsh", ["--version"])).trim().split("\n").at(-1);
    assert.equal(
      actual,
      hostVersion,
      "selected CLI does not match manager target",
    );
    receipt.runtimePackageVersion = actual;
    const tarballs = {},
      manifests = {};
    let registryURL,
      stallSeen = false;
    for (const v of ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0"]) {
      const dir = path.join(root, "pkg-" + v);
      fs.mkdirSync(dir);
      const manifestVersion = v === "1.5.0" ? "9.9.9" : v;
      const pkg = {
        name,
        version: manifestVersion,
        type: "module",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
      };
      manifests[v] = { ...pkg, version: v };
      fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg));
      fs.writeFileSync(
        path.join(dir, "cordis.patch.yml"),
        "- insert:\n    - id: owned-update-probe\n      name: ./index.js\n",
      );
      fs.writeFileSync(
        path.join(dir, "index.js"),
        v === "1.2.0"
          ? "export function apply(){throw Error('owned enable failure')}\n"
          : `import fs from 'node:fs';export function apply(ctx){const emit=event=>fs.appendFileSync(${JSON.stringify(path.join(root, "lifecycle.jsonl"))},JSON.stringify({event,version:'${manifestVersion}'})+'\\n');emit('apply');ctx.effect(()=>()=>emit('dispose'));}\n`,
      );
      await exec("npm", [
        "pack",
        dir,
        "--ignore-scripts",
        "--silent",
        "--pack-destination",
        root,
      ]);
      tarballs[v] = fs.readFileSync(
        path.join(root, name + "-" + manifestVersion + ".tgz"),
      );
    }
    const gitName = "dsc-owned-git025",
      gitSource = path.join(root, "git-source"),
      gitBare = path.join(root, "repo.git");
    fs.mkdirSync(gitSource);
    await exec("git", ["init", gitSource]);
    await exec("git", [
      "-C",
      gitSource,
      "config",
      "user.name",
      "Owned acceptance",
    ]);
    await exec("git", [
      "-C",
      gitSource,
      "config",
      "user.email",
      "owned@acceptance.invalid",
    ]);
    const gitCommits = [];
    for (const version of ["1.0.0", "1.1.0"]) {
      fs.writeFileSync(
        path.join(gitSource, "package.json"),
        JSON.stringify({
          name: gitName,
          version,
          type: "module",
          main: "index.js",
          dsh: { bundle: { patch: "cordis.patch.yml" } },
        }),
      );
      fs.writeFileSync(
        path.join(gitSource, "cordis.patch.yml"),
        "- insert:\n    - id: git025-probe\n      name: ./index.js\n",
      );
      fs.writeFileSync(
        path.join(gitSource, "index.js"),
        `import fs from 'node:fs';export function apply(ctx){fs.appendFileSync(${JSON.stringify(path.join(root, "git-lifecycle.jsonl"))},JSON.stringify({event:'apply',version:'${version}'})+'\\n');}\n`,
      );
      await exec("git", ["-C", gitSource, "add", "."]);
      await exec("git", ["-C", gitSource, "commit", "-m", "Owned " + version]);
      gitCommits.push(
        (await exec("git", ["-C", gitSource, "rev-parse", "HEAD"])).trim(),
      );
    }
    await exec("git", ["clone", "--bare", gitSource, gitBare]);
    await exec("git", ["-C", gitBare, "update-server-info"]);
    registry = http.createServer((req, res) => {
      const u = new URL(req.url, "http://localhost");
      if (u.pathname.startsWith("/git/repo.git/")) {
        const file = path.resolve(
          gitBare,
          u.pathname.slice("/git/repo.git/".length),
        );
        if (
          !file.startsWith(gitBare + path.sep) ||
          !fs.existsSync(file) ||
          !fs.statSync(file).isFile()
        ) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(fs.readFileSync(file));
        return;
      }
      if (u.pathname.startsWith("/tar/")) {
        const v = u.pathname.split("/").at(-1).replace(".tgz", "");
        if (v === "1.4.0") {
          stallSeen = true;
          return;
        }
        if (!tarballs[v]) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(
          v === "1.3.0" ? Buffer.from("owned malformed tarball") : tarballs[v],
        );
        return;
      }
      if (u.pathname === "/" + name) {
        const vs = Object.fromEntries(
          Object.entries(manifests).map(([v, pkg]) => [
            v,
            {
              ...pkg,
              dist: {
                tarball: registryURL + "/tar/" + v + ".tgz",
                shasum: createHash("sha1")
                  .update(
                    v === "1.3.0"
                      ? Buffer.from("owned malformed tarball")
                      : tarballs[v],
                  )
                  .digest("hex"),
              },
            },
          ]),
        );
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            name,
            "dist-tags": { latest: "1.5.0" },
            versions: vs,
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end("{}");
    });
    registry.on("connection", (s) => {
      sockets.add(s);
      s.on("close", () => sockets.delete(s));
    });
    await new Promise((r) => registry.listen(0, "127.0.0.1", r));
    registryURL = "http://127.0.0.1:" + registry.address().port;
    env.npm_config_registry = registryURL;
    await exec("dsh", [
      "--profile",
      profileName,
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(profile);
    fs.appendFileSync(
      path.join(profile, "cordis.patch.yml"),
      `- id: plugin-manager\n  config:\n    registry: ${registryURL}\n    fallbackRegistries: []\n`,
    );
    const dir = path.join(profile, "node_modules", fixtureName);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: fixtureName,
        version: "1.0.0",
        type: "module",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
      }),
    );
    fs.writeFileSync(
      path.join(dir, "cordis.patch.yml"),
      '- insert:\n    - id: manager025-fixture\n      name: "@acceptance/manager025"\n',
    );
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `export const inject=['pluginManager','webServer','connection'];export function apply(ctx){ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/acceptance/manager025',async handler(req,res){const denied=ctx.connection.requestRejection(req);if(denied!==undefined){res.writeHead(denied);res.end('{}');return;}if(req.method!=='POST'||req.headers['x-dsh-compat-request']!=='1'){res.writeHead(403);res.end('{}');return;}const u=new URL(req.url,'http://localhost'),a=u.searchParams.get('action'),v=u.searchParams.get('v'),id=u.searchParams.get('id');try{let result;if(a==='bundles')result=(await ctx.pluginManager.listBundles()).filter(x=>[${JSON.stringify(name)},${JSON.stringify(fixtureName)}].includes(x.name)).map(x=>({name:x.name,enabled:x.enabled,availability:x.availability,version:x.version,update:x.update,hasUpdatable:Object.hasOwn(x,'updatable')}));else if(a==='install')result=await ctx.pluginManager.installBundle(${JSON.stringify(name)}+'@'+v,{registry:${JSON.stringify(registryURL)}});else if(a==='git-install')result=await ctx.pluginManager.installBundle(${JSON.stringify("git+" + registryURL + "/git/repo.git")}+'#'+v);else if(a==='git-update')result=await ctx.pluginManager.updateBundle('dsc-owned-git025','1.1.0',{spec:${JSON.stringify("git+" + registryURL + "/git/repo.git")}+'#'+v});else if(a==='git-bundles')result=(await ctx.pluginManager.listBundles()).filter(x=>x.name==='dsc-owned-git025').map(x=>({name:x.name,update:x.update,hasUpdatable:Object.hasOwn(x,'updatable')}));else if(a==='cancel')result=await ctx.pluginManager.cancelInstall(id);else if(a==='update')result=await ctx.pluginManager.updateBundle(${JSON.stringify(name)},v,{registry:${JSON.stringify(registryURL)},requestId:id});else{res.writeHead(400);res.end('{}');return;}res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(result));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e)}));}}}));}`,
    );
    const file = path.join(profile, "package.json"),
      pkg = JSON.parse(fs.readFileSync(file));
    pkg.dependencies[fixtureName] = "file:" + dir;
    pkg.dsh.profile.bundles.push(fixtureName);
    fs.writeFileSync(file, JSON.stringify(pkg));
    host = spawn(
      "dsh",
      ["--profile", profileName, "--", "--port", "0", "--no-open"],
      { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    for (const stream of [host.stdout, host.stderr])
      stream.on("data", (b) => {
        if (log.length < 1024 * 1024) log += b;
      });
    const url = await poll(() => {
      if (host.exitCode !== null) throw Error(redact(log).slice(-1600));
      return /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(log)?.[1];
    }, "manager host startup");
    const headers = await ownedHostHeaders(url);
    const call = async (action, v = "", id = randomUUID()) => {
      const r = await fetch(
        new URL(
          "/acceptance/manager025?" + new URLSearchParams({ action, v, id }),
          url,
        ),
        { method: "POST", headers, signal: AbortSignal.timeout(120000) },
      );
      const data = await r.json();
      assert.equal(r.status, 200, JSON.stringify(data));
      return data;
    };
    const state = async () => ({
      packageVersion: fs.existsSync(
        path.join(profile, "node_modules", name, "package.json"),
      )
        ? JSON.parse(
            fs.readFileSync(
              path.join(profile, "node_modules", name, "package.json"),
            ),
          ).version
        : null,
      bundle: (await call("bundles")).find((b) => b.name === name) ?? null,
      dependency: JSON.parse(fs.readFileSync(file)).dependencies[name] ?? null,
      lifecycle: fs.existsSync(path.join(root, "lifecycle.jsonl"))
        ? fs
            .readFileSync(path.join(root, "lifecycle.jsonl"), "utf8")
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line))
        : [],
    });
    const record = async (id, action, v) => {
      const before = await state();
      receipt.cases.push({
        id,
        before,
        result: await call(action, v),
        state: await state(),
      });
    };
    await record("install", "install", "1.0.0");
    await record("update", "update", "1.1.0");
    const bundles = await call("bundles"),
      installed = bundles.find((b) => b.name === name),
      local = bundles.find((b) => b.name === fixtureName);
    assert(installed && local);
    receipt.bundleContract = {
      registryUpdate: installed.update,
      fileUpdateAbsent: !Object.hasOwn(local, "update"),
      oldUpdatableAbsent: bundles.every((b) => b.hasUpdatable === false),
    };
    await record("enable-failure", "update", "1.2.0");
    await record("bad-archive", "update", "1.3.0");
    const beforeCancel = await state();
    const id = randomUUID(),
      pending = call("update", "1.4.0", id);
    await poll(() => stallSeen, "cancellation download started");
    const cancelled = await call("cancel", "1.4.0", id);
    receipt.cases.push({
      id: "cancel",
      before: beforeCancel,
      cancelled,
      result: await pending,
      state: await state(),
    });
    await record("unexpected-package", "update", "1.5.0");
    const gitInstall = await call("git-install", gitCommits[0]),
      gitBundles = await call("git-bundles"),
      gitUpdate = await call("git-update", gitCommits[1]);
    receipt.gitContract = {
      install: gitInstall,
      update: gitUpdate,
      mode: gitBundles[0]?.update,
      oldUpdatableAbsent: gitBundles.every((b) => !b.hasUpdatable),
      dependency: JSON.parse(fs.readFileSync(file)).dependencies[gitName],
      lifecycle: fs
        .readFileSync(path.join(root, "git-lifecycle.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((x) => JSON.parse(x)),
    };
    receipt.ok = true;
  } catch (error) {
    receipt.ok = false;
    receipt.error = redact(error.stack);
  } finally {
    Object.assign(
      receipt,
      await cleanupAcceptance({
        host,
        root,
        closeNetwork: async () => {
          for (const s of sockets) s.destroy();
          if (registry)
            await new Promise((resolve, reject) =>
              registry.close((e) => (e ? reject(e) : resolve())),
            );
        },
      }),
    );
    if (receipt.cleanupError) {
      receipt.ok = false;
      receipt.error ||= receipt.cleanupError;
    }
    try {
      validateManagerAcceptance(receipt, hostVersion);
    } catch (error) {
      receipt.ok = false;
      receipt.error ||= String(error.stack);
    }
    fs.writeFileSync(
      path.join(output, "summary.json"),
      JSON.stringify(receipt, null, 2) + "\n",
    );
  }
  return receipt;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const r = await runManagerAcceptance(
    process.argv[2],
    process.env.DSC_ACCEPTANCE_DSH_VERSION,
  );
  console.log(JSON.stringify(r));
  process.exitCode = r.ok ? 0 : 1;
}
