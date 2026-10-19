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

test("Linux startup evidence separates runnable time, runqueue wait and kernel wait without retaining names or arguments", async () => {
  const { linuxProcessSnapshot } = await import(
    "../lib/chrome-diagnostics.mjs"
  ).catch(() => ({}));
  assert.equal(typeof linuxProcessSnapshot, "function");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-proc-evidence-"));
  // stat fields3..24: state, ppid, pgrp, session, tty, tpgid, flags,
  // minflt, cminflt, majflt, cmajflt, utime, stime, cutime, cstime,
  // priority, nice, threads, itrealvalue, starttime, vsize, rss.
  const stat =
    "123 (private-name ) marker) S 1 123 123 0 -1 0 0 0 0 0 7 3 0 0 20 0 2 0 321 4096 5\n";
  try {
    fs.mkdirSync(path.join(dir, "123/task/123"), { recursive: true });
    fs.mkdirSync(path.join(dir, "123/task/456"), { recursive: true });
    fs.writeFileSync(path.join(dir, "123/stat"), stat);
    fs.writeFileSync(path.join(dir, "123/schedstat"), "9000000 2000000 4\n");
    fs.writeFileSync(path.join(dir, "123/task/123/stat"), stat);
    fs.writeFileSync(
      path.join(dir, "123/task/123/schedstat"),
      "9000000 2000000 4\n",
    );
    fs.writeFileSync(
      path.join(dir, "123/task/123/wchan"),
      "futex_wait_queue\n",
    );
    fs.writeFileSync(
      path.join(dir, "123/task/456/stat"),
      stat.replace(/^123/, "456").replace(") S ", ") R "),
    );
    fs.writeFileSync(
      path.join(dir, "123/task/456/schedstat"),
      "1000000 3000000 2\n",
    );
    fs.writeFileSync(path.join(dir, "123/task/456/wchan"), "0\n");
    const result = linuxProcessSnapshot(123, { procRoot: dir });
    assert.equal(result.available, true);
    assert.equal(result.leader.startTimeTicks, "321");
    assert.equal(result.leader.userTicks, "7");
    assert.equal(result.leader.systemTicks, "3");
    assert.deepEqual(result.leader.scheduler, {
      runtimeNs: "9000000",
      runqueueNs: "2000000",
      timeslices: "4",
    });
    assert.deepEqual(
      result.tasks.map((t) => [t.pid, t.state, t.waitChannel]),
      [
        [123, "S", "futex_wait_queue"],
        [456, "R", "0"],
      ],
    );
    assert.equal(result.truncated, false);
    assert.ok(!JSON.stringify(result).includes("private-name"));
    assert.ok(!JSON.stringify(result).includes("marker"));
    assert.ok(!JSON.stringify(result).includes(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Linux process evidence bounds thread enumeration and preserves unavailable fields instead of inventing zero work", async () => {
  const { linuxProcessSnapshot } = await import(
    "../lib/chrome-diagnostics.mjs"
  ).catch(() => ({}));
  assert.equal(typeof linuxProcessSnapshot, "function");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-proc-limit-"));
  try {
    fs.mkdirSync(path.join(dir, "123/task"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "123/stat"),
      "123 (worker) S 1 123 123 0 -1 0 0 0 0 0 0 0 0 0 20 0 40 0 321 4096 5\n",
    );
    for (let n = 123; n < 163; n++)
      fs.mkdirSync(path.join(dir, "123/task", String(n)));
    const result = linuxProcessSnapshot(123, { procRoot: dir });
    assert.equal(result.available, true);
    assert.equal(result.leader.scheduler, null);
    assert.deepEqual(result.schedulerStats, {
      enabled: null,
      reason: "ENOENT",
    });
    fs.mkdirSync(path.join(dir, "sys/kernel"), { recursive: true });
    fs.writeFileSync(path.join(dir, "sys/kernel/sched_schedstats"), "0\n");
    assert.equal(
      linuxProcessSnapshot(123, { procRoot: dir }).schedulerStats.enabled,
      false,
    );
    fs.writeFileSync(path.join(dir, "sys/kernel/sched_schedstats"), "1\n");
    assert.equal(
      linuxProcessSnapshot(123, { procRoot: dir }).schedulerStats.enabled,
      true,
    );
    assert.equal(result.tasks.length, 32);
    assert.equal(result.truncated, true);
    assert.ok(
      result.tasks.every((t) => t.available === false && t.reason === "ENOENT"),
    );
    assert.equal(linuxProcessSnapshot(999, { procRoot: dir }).reason, "ENOENT");
    assert.equal(
      linuxProcessSnapshot(-1, { procRoot: dir }).reason,
      "invalid-pid",
    );
    fs.writeFileSync(path.join(dir, "123/stat"), "private invalid stat\n");
    assert.equal(
      linuxProcessSnapshot(123, { procRoot: dir }).reason,
      "invalid-stat",
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("command timeout records a blocked parent's timer overrun separately from browser silence", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-parent-delay-"));
  const executable = path.join(dir, "chrome");
  fs.writeFileSync(
    executable,
    `#!${process.execPath}\nconst fs=require('fs');let b='';const out=fs.createWriteStream(null,{fd:4});fs.createReadStream(null,{fd:3}).on('data',v=>{b+=v;let n;while((n=b.indexOf('\\0'))>=0){const m=JSON.parse(b.slice(0,n));b=b.slice(n+1);if(m.method==='Runtime.evaluate')continue;const result=m.method==='Target.createTarget'?{targetId:'owned'}:m.method==='Target.attachToTarget'?{sessionId:'owned'}:{};out.write(JSON.stringify({id:m.id,result})+'\\0');}});`,
    { mode: 0o700 },
  );
  let browser;
  try {
    browser = await launchChromePipe(executable, { timeoutMs: 1000 });
    const pending = browser.send("Runtime.evaluate");
    const end = performance.now() + 1500;
    while (performance.now() < end) {}
    await assert.rejects(pending, (e) => {
      assert.equal(e.code, "CDP_COMMAND_TIMEOUT");
      assert.equal(e.diagnostic.phase, "session");
      assert.ok(e.diagnostic.timing, "Missing parent timer evidence");
      assert.ok(e.diagnostic.timing.requestElapsedMs >= 1000);
      assert.ok(e.diagnostic.timing.timerOverrunMs >= 300);
      assert.ok(e.diagnostic.timing.parentCpuMilliseconds >= 0);
      assert.ok(e.diagnostic.timing.eventLoopUtilization > 0.5);
      return true;
    });
  } finally {
    await browser?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "Linux real Chrome paused before a command retains the pre-kill kernel state and is reclaimed",
  {
    skip: process.env.DSC_SLOW !== "1" || process.platform !== "linux",
    timeout: 15000,
  },
  async () => {
    const exe =
      process.env.DSC_CHROME ||
      ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
        fs.existsSync(p),
      );
    assert.ok(exe, "Real Chrome is required for Linux startup acceptance");
    const { linuxProcessSnapshot } = await import(
      "../lib/chrome-diagnostics.mjs"
    );
    const browser = await launchChromePipe(exe, { timeoutMs: 2000 });
    const pid = browser.child.pid;
    try {
      process.kill(-pid, "SIGSTOP");
      const deadline = performance.now() + 1000;
      while (
        linuxProcessSnapshot(pid, { threads: false }).leader?.state !== "T"
      ) {
        assert.ok(
          performance.now() < deadline,
          "Owned Chrome did not enter stopped state",
        );
        await new Promise((r) => setTimeout(r, 5));
      }
      let failure;
      try {
        await browser.send("Browser.getVersion", {}, true);
      } catch (error) {
        failure = error;
      }
      await browser.close();
      assert.ok(failure, "Paused browser unexpectedly completed a command");
      const d = failure.diagnostic;
      assert.equal(failure.code, "CDP_COMMAND_TIMEOUT");
      assert.equal(d.phase, "session");
      assert.equal(d.method, "Browser.getVersion");
      assert.equal(d.linux.atFailure.available, true);
      assert.equal(d.linux.atFailure.leader.state, "T");
      assert.equal(
        d.linux.initial.leader.startTimeTicks,
        d.linux.atFailure.leader.startTimeTicks,
      );
      assert.ok(d.linux.atFailure.tasks.length >= 1);
      assert.equal(d.cleanup.stopped, true);
      assert.throws(
        () => process.kill(pid, 0),
        (e) => e.code === "ESRCH",
      );
    } finally {
      await browser.close();
    }
  },
);

test(
  "Linux real Chrome completes a fixed serial and parallel startup batch without retry",
  {
    skip: process.env.DSC_SLOW !== "1" || process.platform !== "linux",
    timeout: 45000,
  },
  async () => {
    const exe =
      process.env.DSC_CHROME ||
      ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
        fs.existsSync(p),
      );
    assert.ok(exe, "Real Chrome is required for Linux startup acceptance");
    const rows = [];
    async function once(mode, index) {
      const started = performance.now();
      let browser;
      try {
        browser = await launchChromePipe(exe, { timeoutMs: 10000 });
        const { product } = await browser.send("Browser.getVersion");
        const { result } = await browser.send("Runtime.evaluate", {
          expression: "6*7",
          returnByValue: true,
        });
        assert.equal(result.value, 42);
        rows.push({
          mode,
          index,
          product,
          milliseconds: performance.now() - started,
        });
      } finally {
        await browser?.close();
      }
    }
    for (let n = 0; n < 2; n++) await once("serial", n);
    await Promise.all([once("parallel", 0), once("parallel", 1)]);
    assert.equal(rows.length, 4);
    console.log(
      "Linux Chrome startup batch: " +
        JSON.stringify({
          node: process.versions.node,
          kernel: os.release(),
          arch: process.arch,
          attempts: 4,
          retries: 0,
          rows,
        }),
    );
  },
);

test(
  "Linux owned headless Chrome does not wait on an inherited unresponsive desktop session bus",
  {
    skip: process.env.DSC_SLOW !== "1" || process.platform !== "linux",
    timeout: 20000,
  },
  async () => {
    const { createServer } = await import("node:net");
    const exe =
      process.env.DSC_CHROME ||
      ["/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) =>
        fs.existsSync(p),
      );
    assert.ok(exe, "Real Chrome is required for Linux startup acceptance");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-cdp-dbus-"));
    const sockets = new Set();
    let connections = 0,
      browser;
    const server = createServer((socket) => {
      connections++;
      sockets.add(socket);
      socket.on("data", () => {});
      socket.on("close", () => sockets.delete(socket));
    });
    const prior = process.env.DBUS_SESSION_BUS_ADDRESS;
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(path.join(dir, "bus"), resolve);
      });
      process.env.DBUS_SESSION_BUS_ADDRESS =
        "unix:path=" + path.join(dir, "bus");
      // launchChromePipe spawns synchronously before its first await. Restore the
      // test runner immediately; only the owned Chrome may inherit this address.
      let pending;
      try {
        pending = launchChromePipe(exe, { timeoutMs: 10000 });
      } finally {
        if (prior === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS;
        else process.env.DBUS_SESSION_BUS_ADDRESS = prior;
      }
      browser = await pending;
      const { result } = await browser.send("Runtime.evaluate", {
        expression: "6*7",
        returnByValue: true,
      });
      assert.equal(result.value, 42);
      assert.equal(
        connections,
        0,
        "Owned browser contacted the unrelated desktop session bus",
      );
      assert.equal(process.env.DBUS_SESSION_BUS_ADDRESS, prior);
    } finally {
      await browser?.close();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
