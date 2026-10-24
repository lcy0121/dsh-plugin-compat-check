import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { command } from "../lib/probe-runner.mjs";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = (pid, group = false) => {
  try {
    process.kill(group ? -pid : pid, "SIGKILL");
  } catch {}
};

test(
  "closed output pipes do not establish that a timed-out command exited",
  { skip: process.platform === "win32" },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-closed-pipes-"));
    const marker = path.join(root, "pid");
    let pid;
    try {
      const result = await command(
        process.execPath,
        [
          "-e",
          `const fs=require('node:fs');process.on('SIGTERM',()=>{});fs.writeFileSync(process.argv[1],String(process.pid));fs.closeSync(1);fs.closeSync(2);setInterval(()=>{},1000)`,
          marker,
        ],
        { timeoutMs: 350 },
      );
      pid = Number(fs.readFileSync(marker));
      assert.equal(result.error, "Command timed out");
      assert.throws(
        () => process.kill(pid, 0),
        (e) => e.code === "ESRCH",
        "settlement must await child exit even when pipes closed earlier",
      );
    } finally {
      if (pid) kill(pid, true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "owned cleanup recognizes a host already terminated by signal",
  { skip: process.platform === "win32" },
  async () => {
    const { stopOwnedChild } = await import("../lib/probe-runner.mjs");
    const child = spawn(
      process.execPath,
      ["-e", "process.kill(process.pid,'SIGTERM')"],
      { detached: true, stdio: "ignore" },
    );
    try {
      await once(child, "exit");
      assert.equal(child.exitCode, null);
      assert.equal(child.signalCode, "SIGTERM");
      assert.equal(typeof stopOwnedChild, "function");
      assert.equal(
        await Promise.race([
          stopOwnedChild(child).then(() => true),
          delay(1000).then(() => false),
        ]),
        true,
        "cleanup cannot wait for an exit event that already happened",
      );
    } finally {
      kill(child.pid, true);
    }
  },
);

test(
  "leader exit cannot cancel escalation against an owned same-group child",
  { skip: process.platform === "win32" },
  async () => {
    const { stopOwnedChild } = await import("../lib/probe-runner.mjs");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-owned-group-"));
    const heartbeat = path.join(root, "heartbeat");
    const descendant = `const fs=require('node:fs');process.on('SIGTERM',()=>{});let n=0;fs.writeFileSync(process.argv[1],String(n));setInterval(()=>fs.writeFileSync(process.argv[1],String(++n)),10);process.send('ready')`;
    const script = `const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',process.argv[1],process.argv[2]],{stdio:['ignore','ignore','ignore','ipc']});c.on('message',()=>console.log(c.pid));setInterval(()=>{},1000)`;
    const leader = spawn(
      process.execPath,
      ["-e", script, descendant, heartbeat],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    // An unrelated group is a control: cleanup must never use a process-name kill.
    const unrelated = spawn(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      { detached: true, stdio: "ignore" },
    );
    try {
      await Promise.race([
        once(leader.stdout, "data"),
        delay(2000).then(() => {
          throw new Error("fixture startup timed out");
        }),
      ]);
      assert.equal(typeof stopOwnedChild, "function");
      await Promise.all([stopOwnedChild(leader), stopOwnedChild(leader)]);
      assert.notEqual(leader.signalCode, null);
      const stopped = fs.readFileSync(heartbeat, "utf8");
      await delay(100);
      assert.equal(
        fs.readFileSync(heartbeat, "utf8"),
        stopped,
        "same-group descendant must stop before cleanup settles",
      );
      assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
    } finally {
      kill(leader.pid, true);
      const exited =
        unrelated.exitCode !== null || unrelated.signalCode !== null
          ? Promise.resolve()
          : once(unrelated, "exit");
      kill(unrelated.pid, true);
      await exited;
      leader.stdout.destroy();
      leader.stderr.destroy();
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "rc.2 live cancellation removes its private host and directory",
  { skip: process.platform === "win32", timeout: 10000 },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-rc2-cancel-"));
    const marker = path.join(root, "owned.json");
    let runner, owned;
    try {
      const fake = path.join(root, "dsh");
      fs.writeFileSync(
        fake,
        `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2);if(a.includes('--version')){console.log('0.2.1-rc.2');}else if(a.includes('--dump-config')){const p=path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]);fs.mkdirSync(path.join(p,'node_modules'),{recursive:true});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));}else{fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,root:path.dirname(process.env.DSH_HOME)}));setInterval(()=>{},1000);}`,
        { mode: 0o700 },
      );
      runner = spawn(process.execPath, ["tools/rc2-live.mjs"], {
        env: {
          ...process.env,
          PATH: root + path.delimiter + process.env.PATH,
          DSC_CANCEL_MARKER: marker,
        },
        stdio: "ignore",
      });
      const exited = once(runner, "exit");
      for (let i = 0; i < 150 && !fs.existsSync(marker); i++) await delay(20);
      assert.ok(fs.existsSync(marker), "owned fake host must reach startup");
      owned = JSON.parse(fs.readFileSync(marker));
      runner.kill("SIGTERM");
      await exited;
      assert.ok(
        !fs.existsSync(owned.root),
        "cancellation must remove the private root",
      );
      assert.throws(
        () => process.kill(owned.pid, 0),
        (e) => e.code === "ESRCH",
        "detached host must stop",
      );
    } finally {
      if (runner?.exitCode === null && runner?.signalCode === null)
        kill(runner.pid);
      if (owned) {
        kill(owned.pid, true);
        fs.rmSync(owned.root, { recursive: true, force: true });
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "a live owned group denied by the OS remains a cleanup failure with bounded ownership evidence",
  { skip: process.platform === "win32" },
  async (t) => {
    const { stopOwnedChild } = await import("../lib/probe-runner.mjs");
    const child = spawn(
      process.execPath,
      ["-e", 'console.log("ready");setInterval(()=>{},1000)'],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    const original = process.kill.bind(process);
    try {
      await once(child.stdout, "data");
      const patch = t.mock.method(process, "kill", (pid, sig) => {
        if (pid === -child.pid)
          throw Object.assign(new Error("kill EPERM"), {
            code: "EPERM",
            syscall: "kill",
          });
        return original(pid, sig);
      });
      await assert.rejects(stopOwnedChild(child), (error) => {
        assert.equal(error.code, "OWNED_PROCESS_CLEANUP_FAILED");
        assert.equal(error.cause.code, "EPERM");
        assert.equal(error.diagnostic.component, "owned-process");
        assert.equal(error.diagnostic.pid, child.pid);
        assert.equal(error.diagnostic.group.available, true);
        assert.ok(
          error.diagnostic.group.members.some(
            (m) => m.pid === child.pid && !m.state.startsWith("Z"),
          ),
        );
        assert.ok(!JSON.stringify(error.diagnostic).includes("console.log"));
        return true;
      });
      patch.mock.restore();
    } finally {
      t.mock.restoreAll();
      // Failure cleanup intentionally unrefs this child; the fixture owns the
      // final kill and must keep the event loop alive until its exit arrives.
      child.ref();
      const exited = once(child, "exit");
      original(-child.pid, "SIGKILL");
      await exited;
      child.stdout.destroy();
      child.stderr.destroy();
    }
  },
);

test(
  "command timeout settles with both primary and cleanup errors instead of an unhandled rejection",
  { skip: process.platform === "win32", timeout: 10000 },
  async () => {
    const { spawnSync } = await import("node:child_process");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-command-denied-"));
    const marker = path.join(root, "pid");
    let pid;
    try {
      const mod = new URL("../lib/probe-runner.mjs", import.meta.url).href;
      const worker = `import {command} from ${JSON.stringify(mod)};process.kill=()=>{throw Object.assign(new Error('kill EPERM'),{code:'EPERM',syscall:'kill'});};const r=await command(process.execPath,['-e',${JSON.stringify("require('fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)")},${JSON.stringify(marker)}],{timeoutMs:250});console.log(JSON.stringify(r));`;
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", worker],
        { encoding: "utf8", timeout: 3000 },
      );
      if (fs.existsSync(marker)) pid = Number(fs.readFileSync(marker));
      assert.equal(result.status, 0, result.stderr);
      const r = JSON.parse(result.stdout);
      assert.match(r.error, /Command timed out/);
      assert.match(r.error, /cleanup/i);
      assert.equal(r.cleanup.stopped, false);
      assert.equal(r.diagnostics[0].component, "owned-process");
      assert.equal(r.diagnostics[0].code, "OWNED_PROCESS_CLEANUP_FAILED");
    } finally {
      if (pid) kill(pid, true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

test(
  "probe, measurement and installer CLIs preserve primary failure and private work when cleanup is denied",
  { skip: process.platform === "win32", timeout: 20000 },
  async () => {
    const { spawnSync } = await import("node:child_process");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-probe-denied-"));
    const profile = path.join(root, "source");
    const marker = path.join(root, "host.json");
    let owned;
    try {
      fs.mkdirSync(path.join(profile, "node_modules"), { recursive: true });
      fs.writeFileSync(
        path.join(profile, "package.json"),
        JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }),
      );
      const fake = path.join(root, "dsh");
      fs.writeFileSync(
        fake,
        `#!${process.execPath}\nconst fs=require('fs'),path=require('path');if(process.argv.includes('--version'))console.log('0.2.1-rc.2');else if(process.argv.includes('--dump-config')){const dir=path.join(process.env.DSH_HOME,'profiles',process.argv[process.argv.indexOf('--profile')+1]);fs.mkdirSync(path.join(dir,'node_modules'),{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({dependencies:{},dsh:{profile:{bundles:[]}}}));}else if(process.argv.includes('--no-open')||fs.existsSync(${JSON.stringify(path.join(root, "stall"))})){fs.writeFileSync(${JSON.stringify(marker)},JSON.stringify({pid:process.pid,work:process.env.DSC_OUT_DIR}));fs.writeFileSync(path.join(process.env.DSC_OUT_DIR,'probe-report.json'),JSON.stringify({observationVersion:1,profileId:'wrong-profile',dshVersion:'0.2.1-rc.2',probedAt:new Date().toISOString(),root:{}}));setInterval(()=>{},1000);}`,
        { mode: 0o700 },
      );
      const preload = path.join(root, "deny.mjs");
      fs.writeFileSync(
        preload,
        `import fs from 'node:fs';const original=process.kill.bind(process);process.kill=(pid,sig)=>{if(fs.existsSync(${JSON.stringify(marker)})&&pid===-JSON.parse(fs.readFileSync(${JSON.stringify(marker)})).pid)throw Object.assign(new Error('kill EPERM'),{code:'EPERM',syscall:'kill'});return original(pid,sig);};if(process.env.DSC_SETUP_STALL==='1'){const timer=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>{if(ms!==180000)return timer(fn,ms,...args);const poll=setInterval(()=>{if(fs.existsSync(${JSON.stringify(marker)})){clearInterval(poll);timer(fn,50,...args);}},20);return poll;};}`,
      );
      for (const args of [
        [
          "bin/compat-check.mjs",
          "--nm",
          path.join(profile, "node_modules"),
          "--probe-boot",
          "--probe-timeout",
          "1",
          "--no-baseline",
          "--json",
        ],
        [
          "tools/labels.mjs",
          "--nm",
          path.join(profile, "node_modules"),
          "--probe-boot",
          "--json",
        ],
        ["bin/check-install.mjs", "sample", "--timeout", "1", "--json"],
      ]) {
        const r = spawnSync(process.execPath, args, {
          env: {
            ...process.env,
            PATH: root + path.delimiter + process.env.PATH,
            NODE_OPTIONS: "--import=" + preload,
          },
          encoding: "utf8",
          timeout: 5000,
        });
        if (fs.existsSync(marker)) owned = JSON.parse(fs.readFileSync(marker));
        assert.equal(r.status, 3, r.stderr);
        const out = JSON.parse(r.stdout);
        assert.match(out.error, /Probe readiness\/identity validation failed/);
        assert.match(out.error, /cleanup/i);
        const info = out.inputs?.probeBoot || out.cleanup;
        assert.equal(info.tempProfileRemoved, false);
        assert.ok(fs.existsSync(info.workDir));
        assert.equal(
          (info.diagnostics || out.diagnostics)[0].code,
          "OWNED_PROCESS_CLEANUP_FAILED",
        );
        assert.ok(fs.existsSync(profile));
        kill(owned.pid, true);
        fs.rmSync(owned.work, { recursive: true, force: true });
        owned = null;
        fs.rmSync(marker);
      }
      fs.writeFileSync(path.join(root, "stall"), "");
      const stalled = spawnSync(
        process.execPath,
        [
          "bin/compat-check.mjs",
          "--nm",
          path.join(profile, "node_modules"),
          "--probe-boot",
          "--no-baseline",
          "--json",
        ],
        {
          env: {
            ...process.env,
            PATH: root + path.delimiter + process.env.PATH,
            NODE_OPTIONS: "--import=" + preload,
            DSC_SETUP_STALL: "1",
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      if (fs.existsSync(marker)) owned = JSON.parse(fs.readFileSync(marker));
      assert.equal(stalled.status, 3, stalled.stderr);
      const setup = JSON.parse(stalled.stdout);
      assert.match(setup.error, /Profile install failed: Command timed out/);
      assert.equal(setup.inputs.probeBoot.tempProfileRemoved, false);
      assert.ok(fs.existsSync(setup.inputs.probeBoot.workDir));
    } finally {
      if (owned) {
        kill(owned.pid, true);
        fs.rmSync(owned.work, { recursive: true, force: true });
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

describe(
  "real Darwin zombie-only group regression",
  { skip: process.platform !== "darwin" || process.env.DSC_SLOW !== "1" },
  () => {
    test(
      "verified same-uid zombies do not turn an exited group into a permission failure",
      { timeout: 15000 },
      async (t) => {
        const { spawnSync } = await import("node:child_process");
        const { stopOwnedChild } = await import("../lib/probe-runner.mjs");
        const root = fs.mkdtempSync(
          path.join(os.tmpdir(), "dsc-zombie-group-"),
        );
        const marker = path.join(root, "pids");
        const executable = path.join(root, "group");
        let waiter;
        try {
          const build = spawnSync(
            "cc",
            [
              fileURLToPath(
                new URL("./support/zombie-group.c", import.meta.url),
              ),
              "-o",
              executable,
            ],
            { encoding: "utf8", timeout: 6000 },
          );
          if (build.error?.code === "ENOENT") {
            t.skip("C compiler unavailable for real Darwin zombie fixture");
            return;
          }
          assert.equal(build.status, 0, build.stderr);
          const child = spawn(executable, [marker], {
            detached: true,
            stdio: "ignore",
          });
          await once(child, "exit");
          waiter = Number(fs.readFileSync(marker, "utf8").split(" ")[0]);
          const result = await stopOwnedChild(child);
          assert.equal(result.stopped, true);
          assert.equal(result.status, "zombie-only");
          assert.equal(result.leaderExited, true);
          assert.ok(
            result.signals.some((s) => s.result === "verified-zombie-only"),
          );
        } finally {
          if (waiter) kill(waiter);
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
    );
  },
);

test(
  "multi-resource cleanup waits for the healthy resource even when another owned group is denied",
  { skip: process.platform === "win32" },
  async (t) => {
    const { cleanupOwned, stopOwnedChild } = await import(
      "../lib/owned-process.mjs"
    );
    const make = () =>
      spawn(
        process.execPath,
        ["-e", 'console.log("ready");setInterval(()=>{},1000)'],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
    const denied = make(),
      healthy = make();
    const original = process.kill.bind(process);
    try {
      await Promise.all([
        once(denied.stdout, "data"),
        once(healthy.stdout, "data"),
      ]);
      t.mock.method(process, "kill", (pid, sig) => {
        if (pid === -denied.pid)
          throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
        return original(pid, sig);
      });
      await assert.rejects(
        cleanupOwned([
          () => stopOwnedChild(denied),
          () => stopOwnedChild(healthy),
        ]),
        (e) =>
          e.code === "OWNED_RESOURCE_CLEANUP_FAILED" &&
          e.diagnostics[0].pid === denied.pid,
      );
      assert.throws(
        () => original(healthy.pid, 0),
        (e) => e.code === "ESRCH",
      );
      assert.doesNotThrow(() => original(denied.pid, 0));
    } finally {
      t.mock.restoreAll();
      for (const child of [denied, healthy]) {
        if (child.exitCode === null && child.signalCode === null) {
          child.ref();
          const exited = once(child, "exit");
          kill(child.pid, true);
          await exited;
        }
        child.stdout.destroy();
        child.stderr.destroy();
      }
    }
  },
);

test("diagnostic output refuses a symlink directory and reports persistence failure", async () => {
  const { publishDiagnostic } = await import("../lib/owned-process.mjs");
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "dsc-private-diagnostic-"),
  );
  const original = process.env.DSC_EXECUTION_DIAGNOSTICS;
  try {
    const outside = path.join(root, "outside");
    fs.mkdirSync(outside);
    const link = path.join(root, "link");
    fs.symlinkSync(outside, link, "dir");
    process.env.DSC_EXECUTION_DIAGNOSTICS = link;
    const d = publishDiagnostic({
      component: "owned-process",
      code: "CONTROLLED",
    });
    assert.deepEqual(d.persistence, { requested: true, written: false });
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally {
    if (original === undefined) delete process.env.DSC_EXECUTION_DIAGNOSTICS;
    else process.env.DSC_EXECUTION_DIAGNOSTICS = original;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "Darwin kernel zombie state is authoritative before Node delivers the leader exit event",
  { skip: process.platform !== "darwin" },
  async () => {
    const { spawnSync } = await import("node:child_process");
    const { stopOwnedChild, groupSnapshot } = await import(
      "../lib/owned-process.mjs"
    );
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      detached: true,
      stdio: "ignore",
    });
    try {
      await once(child, "spawn");
      let before;
      const deadline = Date.now() + 5000;
      do {
        spawnSync("/bin/sleep", ["0.05"]);
        before = groupSnapshot(child.pid);
      } while (
        !before.members?.some(
          (m) => m.pid === child.pid && m.state.startsWith("Z"),
        ) &&
        Date.now() < deadline
      );
      assert.equal(child.exitCode, null);
      assert.ok(
        before.members.some(
          (m) => m.pid === child.pid && m.state.startsWith("Z"),
        ),
      );
      const r = await stopOwnedChild(child);
      assert.equal(r.stopped, true);
      assert.ok(
        r.signals.some((s) =>
          ["verified-zombie-only", "verified-exited-group"].includes(s.result),
        ),
      );
      assert.equal(child.exitCode, 0);
    } finally {
      kill(child.pid, true);
    }
  },
);

test(
  "Darwin EPERM during accepted TERM teardown waits for actual exit and verifies the group disappeared",
  { skip: process.platform !== "darwin" },
  async (t) => {
    const { stopOwnedChild } = await import("../lib/owned-process.mjs");
    const original = process.kill.bind(process);
    const child = spawn(
      process.execPath,
      [
        "-e",
        'process.on("SIGTERM",()=>setTimeout(()=>process.exit(0),300));console.log("ready");setInterval(()=>{},1000)',
      ],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    try {
      await once(child.stdout, "data");
      t.mock.method(process, "kill", (pid, sig) => {
        if (pid === -child.pid && sig === "SIGKILL")
          throw Object.assign(new Error("kill EPERM"), { code: "EPERM" });
        return original(pid, sig);
      });
      const r = await stopOwnedChild(child);
      assert.equal(r.stopped, true);
      assert.equal(child.exitCode, 0);
      assert.throws(
        () => original(child.pid, 0),
        (e) => e.code === "ESRCH",
      );
    } finally {
      t.mock.restoreAll();
      if (child.exitCode === null && child.signalCode === null) {
        child.ref();
        const exited = once(child, "exit");
        kill(child.pid, true);
        await exited;
      }
      child.stdout.destroy();
      child.stderr.destroy();
    }
  },
);
