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
