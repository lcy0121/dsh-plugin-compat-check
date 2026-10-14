import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Chrome's inherited fd 3/4 pipe has no TCP endpoint another user can impersonate. */
export async function launchChromePipe(
  executable,
  { timeoutMs = 15000, userDataDir = null } = {},
) {
  const dir =
    userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), "dsc-chrome-pipe-"));
  const child = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--remote-debugging-pipe",
      `--user-data-dir=${dir}`,
      "about:blank",
    ],
    {
      detached: process.platform !== "win32",
      stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"],
    },
  );
  child.stderr.resume();
  child.stdio[4].setEncoding("utf8");
  let id = 0,
    buffer = "",
    closed = false,
    session = null;
  const pending = new Map(),
    events = [];
  const rejectAll = (error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };
  const stop = () => {
    if (!child.pid) return;
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {}
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    rejectAll(new Error("Debugger pipe closed"));
    stop();
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (process.platform !== "win32" && child.pid)
        process.kill(-child.pid, "SIGKILL");
      else child.kill("SIGKILL");
    } catch {}
    if (!userDataDir) fs.rmSync(dir, { recursive: true, force: true });
  };
  child.once("error", (error) => {
    closed = true;
    rejectAll(error);
    if (!userDataDir) fs.rmSync(dir, { recursive: true, force: true });
  });
  child.once("exit", () =>
    rejectAll(new Error("Chrome exited before debugger command completed")),
  );
  child.stdio[4].on("data", (bytes) => {
    buffer += bytes.toString("utf8");
    if (buffer.length > 16 * 1024 * 1024) {
      rejectAll(new Error("Debugger frame exceeded size limit"));
      stop();
      return;
    }
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const raw = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      if (!raw) continue;
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        rejectAll(new Error("Invalid debugger frame"));
        stop();
        return;
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error
          ? p.reject(new Error(m.error.message || "CDP error"))
          : p.resolve(m.result || {});
      } else if (m.method) {
        if (events.length < 50000) events.push(m);
        else {
          rejectAll(new Error("Debugger event limit exceeded"));
          stop();
        }
      }
    }
  });
  const send = (method, params = {}, browser = false) =>
    new Promise((resolve, reject) => {
      if (closed || child.exitCode !== null) {
        reject(new Error("Debugger is not running"));
        return;
      }
      const n = ++id,
        timer = setTimeout(() => {
          pending.delete(n);
          reject(new Error(`Debugger command timed out: ${method}`));
        }, timeoutMs);
      pending.set(n, { resolve, reject, timer });
      const request = {
        id: n,
        method,
        params,
        ...(!browser && session ? { sessionId: session } : {}),
      };
      child.stdio[3].write(JSON.stringify(request) + "\0", (error) => {
        if (error) {
          clearTimeout(timer);
          pending.delete(n);
          reject(error);
        }
      });
    });
  try {
    const { targetId } = await send(
      "Target.createTarget",
      { url: "about:blank" },
      true,
    );
    const attached = await send(
      "Target.attachToTarget",
      { targetId, flatten: true },
      true,
    );
    session = attached.sessionId;
    if (!session) throw new Error("Chrome did not return owned target session");
    return { send, events, close, kill: stop, child };
  } catch (error) {
    await close();
    throw error;
  }
}
