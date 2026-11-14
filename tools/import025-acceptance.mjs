/** Actual rc.3 optional importer; only synthetic data in an owned profile. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { command } from "../lib/probe-runner.mjs";
import { cleanupAcceptance } from "./acceptance-cleanup.mjs";
import { ownedHostHeaders } from "./owned-host-session.mjs";
import { disableCredentialOnboarding } from "./browser-session.mjs";
const version = "0.2.2-rc.3";
export function validateImportAcceptance(r) {
  assert.equal(r.hostVersion, version);
  assert.equal(r.ok, true);
  assert.equal(r.hostStopped, true);
  assert.equal(r.cleaned, true);
  assert.equal(r.cleanupError, undefined);
  assert.equal(r.before.stored.length, 0);
  assert.equal(r.before.importerDefaultAbsent, true);
  assert.equal(r.unauthorized, 401);
  assert.equal(r.after.guestCode, "deepseekChatImport/owner-only");
  assert.deepEqual(
    r.lines.map((x) => x.type),
    ["progress", "progress", "outcome"],
  );
  const result = r.lines.at(-1).outcome;
  assert.equal(result.ok, true);
  assert.equal(result.value.sessionIds.length, 1);
  const id = result.value.sessionIds[0];
  assert.equal(r.after.stored.length, 1);
  assert.equal(r.after.stored[0].header.id, id);
  assert.equal(
    r.after.stored[0].header.createdAt,
    Date.UTC(2026, 10, 11, 2, 0, 0) + 999,
  );
  assert.equal(r.after.stored[0].header.cwd, r.workspacePath);
  assert.deepEqual(r.after.members, [id]);
  assert.equal(r.after.agentForSession, false);
  assert.equal(r.after.liveSession, false);
  assert.deepEqual(
    r.after.events.map((e) => e.type),
    [
      "turn/start",
      "step/start",
      "system/message",
      "user/message",
      "assistant/message",
      "step/end",
      "turn/end",
      "session/title",
    ],
  );
  assert(
    r.after.events.some(
      (e) =>
        e.type === "session/title" && e.data.title === "Owned synthetic import",
    ),
  );
  assert(JSON.stringify(r.after.events).includes("Owned synthetic answer"));
  assert.equal(r.routeAfterUnload, 404);
  return r;
}
export async function runImportAcceptance(output) {
  output = path.resolve(output);
  fs.mkdirSync(output, { recursive: true });
  assert.equal(fs.readdirSync(output).length, 0);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-import025-")),
    env = isolatedEnvironment(root),
    profileName = "owned-import025",
    profile = path.join(env.DSH_HOME, "profiles", profileName),
    fixture = "@acceptance/import025";
  const receipt = {
    hostVersion: version,
    scope:
      "Actual rc.3 shipped optional importer, synthetic v3 archive only; no user data, account, production model or general import certification.",
  };
  let host;
  const deadline = Date.now() + 180000;
  const poll = async (fn, label) => {
    while (Date.now() < deadline) {
      const r = await fn();
      if (r) return r;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error(label);
  };
  const exec = async (c, a) => {
    const r = await command(c, a, { env, timeoutMs: 60000 });
    assert.equal(r.code, 0, r.error || r.output);
    return r.output;
  };
  try {
    assert.equal(
      (await exec("dsh", ["--version"])).trim().split("\n").at(-1),
      version,
    );
    await exec("dsh", [
      "--profile",
      profileName,
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(profile);
    receipt.workspacePath = path.join(root, "workspace");
    fs.mkdirSync(receipt.workspacePath);
    receipt.workspacePath = fs.realpathSync(receipt.workspacePath);
    const dir = path.join(profile, "node_modules", fixture);
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
      '- insert:\n    - id: import025-fixture\n      name: "@acceptance/import025"\n',
    );
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `export const inject=['pluginManager','webServer','connection','sessionPersistence','workspaceRegistry','agents','sessions'];export async function apply(ctx){const workspace=await ctx.workspaceRegistry.create(${JSON.stringify(receipt.workspacePath)});ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/acceptance/import025',async handler(req,res){const deny=ctx.connection.requestRejection(req);if(deny!==undefined){res.writeHead(deny);res.end('{}');return;}if(req.method!=='POST'||req.headers['x-dsh-compat-request']!=='1'){res.writeHead(403);res.end('{}');return;}try{const action=new URL(req.url,'http://localhost').searchParams.get('action');if(action==='enable'){const r=await ctx.pluginManager.setBundleEnabled('@deepseek-ai/dsh-deepseek-chat-import',true);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(r));return;}if(action==='unload'){const e=[...ctx.loader.entries()].find(e=>e.options.id==='deepseek-chat-import');await e.fiber.dispose();res.writeHead(200,{'content-type':'application/json'});res.end('{}');return;}const stored=await ctx.sessionPersistence.list();let events=[];if(stored.length){const h=await ctx.sessionPersistence.open(stored[0].header.id,'read');try{events=(await h.read()).events;}finally{await h.close();}}let guestCode=null;const service=ctx.get('deepseekChatImport',false);if(service){const signal=new AbortController().signal;try{ctx.extend({invocation:{peer:{principal:{kind:'acceptance-guest'},signal},signal}}).get('deepseekChatImport',false).limits(signal);}catch(e){guestCode=e.code||String(e.stack);}}const id=stored[0]?.header.id;res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({workspaceId:workspace.id,stored:stored.map(s=>({header:s.header})),events,members:[...workspace.sessionIds],agentForSession:id?!!ctx.agents.get(id):false,liveSession:id?!!ctx.sessions.get(id):false,guestCode,importerDefaultAbsent:!service}));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:String(e.stack)}));}}}));}`,
    );
    const manifest = path.join(profile, "package.json"),
      pkg = JSON.parse(fs.readFileSync(manifest));
    pkg.dependencies[fixture] = "file:" + dir;
    pkg.dsh.profile.bundles.push(fixture);
    fs.writeFileSync(manifest, JSON.stringify(pkg));
    const data = path.join(root, "archive");
    fs.mkdirSync(path.join(data, "chat_sessions"), { recursive: true });
    const base = Date.UTC(2026, 10, 11, 2, 0, 0),
      at = (n) => new Date(base + n).toISOString();
    fs.writeFileSync(
      path.join(data, "manifest.json"),
      '{"export_format_version":3}',
    );
    fs.writeFileSync(
      path.join(data, "chat_session_index.json"),
      JSON.stringify([
        {
          id: "owned",
          title: "Owned synthetic import",
          pinned: false,
          inserted_at: at(0),
          updated_at: at(1000),
          message_count: 2,
        },
      ]),
    );
    fs.writeFileSync(
      path.join(data, "chat_sessions/owned.json"),
      JSON.stringify({
        id: "owned",
        title: "Owned synthetic import",
        inserted_at: at(0),
        messages: [
          {
            id: 1,
            parent_id: null,
            role: "USER",
            status: "FINISHED",
            inserted_at: at(999),
            fragments: [
              { type: "REQUEST", content: "Owned synthetic question" },
            ],
          },
          {
            id: 2,
            parent_id: 1,
            role: "ASSISTANT",
            status: "FINISHED",
            inserted_at: at(1000),
            fragments: [
              { type: "RESPONSE", content: "Owned synthetic answer" },
            ],
          },
        ],
      }),
    );
    const archive = path.join(root, "owned.zip");
    await exec("python3", [
      "-c",
      "import pathlib,sys,zipfile\np=pathlib.Path(sys.argv[1])\nwith zipfile.ZipFile(sys.argv[2],'w') as z:\n for f in p.rglob('*'):\n  if f.is_file():z.write(f,f.relative_to(p))",
      data,
      archive,
    ]);
    host = spawn(
      "dsh",
      ["--profile", profileName, "--", "--port", "0", "--no-open"],
      { env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let log = "";
    for (const s of [host.stdout, host.stderr])
      s.on("data", (b) => {
        if (log.length < 1024 * 1024) log += b;
      });
    const url = await poll(() => {
      if (host.exitCode !== null)
        throw Error(
          log.replace(/([?&]token=)[\w.-]+/g, "$1[redacted]").slice(-1500),
        );
      return /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(log)?.[1];
    }, "owned importer host startup");
    const headers = await ownedHostHeaders(url);
    const call = async (action) => {
      const r = await fetch(
        new URL("/acceptance/import025?action=" + action, url),
        { method: "POST", headers, signal: AbortSignal.timeout(60000) },
      );
      const j = await r.json();
      assert.equal(r.status, 200, JSON.stringify(j));
      return j;
    };
    receipt.before = await call("state");
    receipt.enable = await call("enable");
    await poll(
      () => call("state").then((s) => !s.importerDefaultAbsent),
      "optional importer activation",
    );
    const endpoint = new URL(
        "/api/deepseek-chat-import/archive?workspaceId=" +
          receipt.before.workspaceId,
        url,
      ),
      body = fs.readFileSync(archive);
    receipt.unauthorized = (
      await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/octet-stream" },
        body,
        signal: AbortSignal.timeout(5000),
      })
    ).status;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { ...headers, "content-type": "application/octet-stream" },
      body,
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200);
    receipt.lines = (await response.text())
      .trim()
      .split("\n")
      .map((x) => JSON.parse(x));
    receipt.after = await call("state");
    await call("unload");
    receipt.routeAfterUnload = (
      await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "content-type": "application/octet-stream" },
        body,
        signal: AbortSignal.timeout(5000),
      })
    ).status;
    receipt.ok = true;
  } catch (e) {
    receipt.ok = false;
    receipt.error = String(e.stack).replace(
      /([?&]token=)[\w.-]+/g,
      "$1[redacted]",
    );
  } finally {
    Object.assign(receipt, await cleanupAcceptance({ host, root }));
    if (receipt.cleanupError) {
      receipt.ok = false;
      receipt.error ||= receipt.cleanupError;
    }
    try {
      validateImportAcceptance(receipt);
    } catch (e) {
      receipt.ok = false;
      receipt.error ||= String(e.stack);
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
  const r = await runImportAcceptance(process.argv[2]);
  console.log(JSON.stringify(r));
  process.exitCode = r.ok ? 0 : 1;
}
