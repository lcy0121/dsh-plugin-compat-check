import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchChromePipe } from "../lib/debugger.mjs";
test("debugger commands use only the launched child pipe and its owned target session", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-fake-"));
  const executable = path.join(dir, "chrome");
  fs.writeFileSync(
    executable,
    `#!/usr/bin/env node
    const fs=require('node:fs');let buffer='';const output=fs.createWriteStream(null,{fd:4});
    fs.createReadStream(null,{fd:3}).on('data',b=>{buffer+=b;let pos;while((pos=buffer.indexOf('\\0'))>=0){const m=JSON.parse(buffer.slice(0,pos));buffer=buffer.slice(pos+1);let result={};if(m.method==='Target.createTarget')result={targetId:'owned-page'};if(m.method==='Target.attachToTarget')result={sessionId:'owned-session'};if(m.method==='Page.navigate')result={pipe:process.argv.includes('--remote-debugging-pipe'),session:m.sessionId,url:m.params.url};output.write(JSON.stringify({id:m.id,result})+'\\0');}});
  `,
    { mode: 0o755 },
  );
  let cdp;
  try {
    cdp = await launchChromePipe(executable, { timeoutMs: 10000 });
    const r = await cdp.send("Page.navigate", { url: "private-marker" });
    assert.deepEqual(r, {
      pipe: true,
      session: "owned-session",
      url: "private-marker",
    });
  } finally {
    await cdp?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("silent Chrome startup fails once with phase and pipe evidence, then stops its owned process", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-silent-"));
  const executable = path.join(dir, "chrome");
  const marker = path.join(dir, "pid");
  const requests = path.join(dir, "requests");
  fs.writeFileSync(
    executable,
    `#!${process.execPath}\nconst fs=require('fs');fs.writeFileSync(${JSON.stringify(marker)},String(process.pid));fs.writeSync(2,'authorization: Bearer secret-marker\\n');fs.createReadStream(null,{fd:3}).on('data',b=>fs.appendFileSync(${JSON.stringify(requests)},b));setInterval(()=>{},1000);`,
    { mode: 0o700 },
  );
  let pid;
  try {
    await assert.rejects(
      launchChromePipe(executable, { timeoutMs: 5000 }),
      (error) => {
        pid = Number(fs.readFileSync(marker));
        assert.equal(error.code, "CDP_COMMAND_TIMEOUT");
        assert.equal(error.diagnostic.phase, "browser-handshake");
        assert.equal(error.diagnostic.method, "Browser.getVersion");
        assert.equal(error.diagnostic.transport.receivedBytes, 0);
        assert.equal(error.diagnostic.cleanup.stopped, true);
        assert.ok(!JSON.stringify(error.diagnostic).includes("secret-marker"));
        return true;
      },
    );
    assert.throws(
      () => process.kill(pid, 0),
      (e) => e.code === "ESRCH",
    );
    const frames = fs
      .readFileSync(requests, "utf8")
      .split("\0")
      .filter(Boolean)
      .map(JSON.parse);
    assert.deepEqual(
      frames.map((x) => x.method),
      ["Browser.getVersion"],
    );
  } finally {
    if (pid)
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Chrome debugger pipe EOF reports the actual transport failure without waiting for a command timeout", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-eof-"));
  const executable = path.join(dir, "chrome");
  fs.writeFileSync(
    executable,
    `#!${process.execPath}\nrequire('fs').closeSync(4);setInterval(()=>{},1000);`,
    { mode: 0o700 },
  );

  try {
    await assert.rejects(
      launchChromePipe(executable, { timeoutMs: 2000 }),
      (error) => {
        assert.equal(error.code, "CDP_PIPE_CLOSED");
        assert.equal(error.diagnostic.transport.readEnded, true);
        assert.equal(error.diagnostic.cleanup.stopped, true);
        return true;
      },
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("responsive browser but stalled target creation is diagnosed separately, with private redacted stderr", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-target-"));
  const executable = path.join(dir, "chrome");
  const diagnostics = path.join(dir, "diagnostics");
  const prior = process.env.DSC_EXECUTION_DIAGNOSTICS;
  process.env.DSC_EXECUTION_DIAGNOSTICS = diagnostics;
  fs.writeFileSync(
    executable,
    `#!${process.execPath}\nconst fs=require('fs');let b='';const out=fs.createWriteStream(null,{fd:4});fs.writeSync(2,'authorization: Bearer secret-marker\\nhttps://example.invalid/?token=secret-marker\\n');fs.createReadStream(null,{fd:3}).on('data',v=>{b+=v;let n;while((n=b.indexOf('\\0'))>=0){const m=JSON.parse(b.slice(0,n));b=b.slice(n+1);if(m.method==='Browser.getVersion')out.write(JSON.stringify({id:m.id,result:{product:'Fixture/1'}})+'\\0');}});`,
    { mode: 0o700 },
  );
  try {
    await assert.rejects(
      launchChromePipe(executable, { timeoutMs: 5000 }),
      (error) => {
        assert.equal(error.code, "CDP_COMMAND_TIMEOUT");
        assert.equal(error.diagnostic.method, "Target.createTarget");
        assert.equal(error.diagnostic.phase, "target-create");
        assert.ok(error.diagnostic.transport.receivedBytes > 0);
        assert.equal(error.diagnostic.cleanup.stopped, true);
        assert.equal(error.diagnostic.persistence.written, true);
        return true;
      },
    );
    const files = fs.readdirSync(diagnostics);
    assert.equal(files.length, 1);
    const file = path.join(diagnostics, files[0]);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const raw = fs.readFileSync(file, "utf8");
    assert.ok(!raw.includes("secret-marker"));
    assert.match(raw, /redacted/);
    assert.equal(JSON.parse(raw).cleanup.stopped, true);
  } finally {
    if (prior === undefined) delete process.env.DSC_EXECUTION_DIAGNOSTICS;
    else process.env.DSC_EXECUTION_DIAGNOSTICS = prior;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Chrome spawn failure and malformed response fail with structured evidence and no lingering process", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-bad-"));
  const executable = path.join(dir, "chrome");
  try {
    await assert.rejects(launchChromePipe(path.join(dir, "missing")), (e) => {
      assert.equal(e.code, "CDP_SPAWN_FAILED");
      assert.equal(e.diagnostic.cleanup.stopped, true);
      return true;
    });
    fs.writeFileSync(
      executable,
      `#!${process.execPath}\nrequire('fs').writeSync(4,'not-json\\0');setInterval(()=>{},1000);`,
      { mode: 0o700 },
    );
    await assert.rejects(launchChromePipe(executable), (e) => {
      assert.equal(e.code, "CDP_INVALID_FRAME");
      assert.equal(e.diagnostic.cleanup.stopped, true);
      return true;
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
