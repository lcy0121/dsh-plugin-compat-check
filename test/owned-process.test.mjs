import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
        `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2);if(a.includes('--version')){console.log('0.2.1-rc.2');}else if(a.includes('--dump-config')){const p=path.join(process.env.DSH_HOME,'profiles',a[a.indexOf('--profile')+1]);fs.mkdirSync(path.join(p,'node_modules'),{recursive:true});fs.writeFileSync(path.join(p,'package.json'),JSON.stringify({dsh:{profile:{bundles:[]}}}));}else{fs.writeFileSync(process.env.DSC_CANCEL_MARKER,JSON.stringify({pid:process.pid,root:path.dirname(process.env.DSH_HOME)}));setInterval(()=>{},1000);}`,
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
