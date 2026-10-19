import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  stopOwnedChild,
  publishDiagnostic,
  failureDiagnostic,
} from "./owned-process.mjs";

/** Inherited fd3/4 only: no TCP debugger endpoint, port discovery or shared tab. */
export async function launchChromePipe(
  executable,
  { timeoutMs = 15000, userDataDir = null } = {},
) {
  const dir =
    userDataDir || fs.mkdtempSync(path.join(os.tmpdir(), "dsc-chrome-pipe-"));
  const started = Date.now();
  let browserInfo = null;
  let phase = "spawn",
    id = 0,
    buffer = "",
    session = null,
    closed = false,
    terminal = null,
    closing,
    stderrTail = "",
    stderrBytes = 0,
    readEnded = false,
    writtenBytes = 0,
    receivedBytes = 0;
  const methods = [],
    pending = new Map(),
    events = [];
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
  const snapshot = (method) => ({
    schemaVersion: 1,
    kind: "plugin-compat-check/execution-diagnostic",
    component: "chrome-pipe",
    phase,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    executable: path.basename(executable),
    browser: browserInfo,
    method: method || null,
    elapsedMs: Date.now() - started,
    timeoutMs,
    pid: child.pid ?? null,
    parentPid: process.pid,
    exitCode: child.exitCode,
    signalCode: child.signalCode,
    transport: {
      readEnded,
      writtenBytes,
      receivedBytes,
      bufferedCharacters: buffer.length,
      pendingMethods: [...pending.values()].map((p) => p.method).slice(0, 16),
      recentMethods: methods.slice(-16),
    },
    stderr: {
      bytes: stderrBytes,
      tailSha256: createHash("sha256").update(stderrTail).digest("hex"),
    },
  });
  function diagnostic(error) {
    if (!error.diagnostic)
      error.diagnostic = { ...snapshot(), code: error.code || "CDP_ERROR" };
    return error;
  }
  function rejectAll(error) {
    terminal ||= diagnostic(error);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(terminal);
    }
    pending.clear();
  }
  function fault(code, message, method) {
    const error = new Error(message);
    error.code = code;
    error.diagnostic = { ...snapshot(method), code };
    return error;
  }
  function close() {
    return (closing ||= (async () => {
      closed = true;
      rejectAll(terminal || fault("CDP_CLOSED", "Debugger pipe closed"));
      try {
        const stopped = await stopOwnedChild(child);
        if (terminal?.diagnostic)
          terminal.diagnostic.cleanup = {
            stopped: stopped.stopped,
            status: stopped.status,
          };
        if (!userDataDir) fs.rmSync(dir, { recursive: true, force: true });
      } catch (error) {
        if (terminal?.diagnostic)
          terminal.diagnostic.cleanup = {
            stopped: false,
            diagnostics: failureDiagnostic(error),
          };
        throw error;
      } finally {
        child.stdio[3]?.destroy();
        child.stdio[4]?.destroy();
        if (terminal?.code !== "CDP_CLOSED") {
          terminal.diagnostic.exitCode = child.exitCode;
          terminal.diagnostic.signalCode = child.signalCode;
          publishDiagnostic(terminal.diagnostic, { stderrTail });
        }
      }
    })());
  }
  child.stderr.on("data", (b) => {
    stderrBytes += b.length;
    stderrTail = (stderrTail + b.toString("utf8")).slice(-8192);
  });
  child.stdio[4].setEncoding("utf8");
  child.stdio[4].on("end", () => {
    readEnded = true;
    if (!closed)
      rejectAll(fault("CDP_PIPE_CLOSED", "Chrome debugger output pipe ended"));
  });
  for (const pipe of [child.stdio[3], child.stdio[4]])
    pipe.on("error", (error) => {
      if (!closed)
        rejectAll(
          fault(
            "CDP_PIPE_ERROR",
            `Chrome debugger pipe failed: ${error.code || "unknown"}`,
          ),
        );
    });
  child.once("error", (error) =>
    rejectAll(
      fault(
        "CDP_SPAWN_FAILED",
        `Chrome launch failed: ${error.code || "unknown"}`,
      ),
    ),
  );
  child.once("exit", () => {
    if (!closed)
      rejectAll(
        fault(
          "CDP_PROCESS_EXIT",
          "Chrome exited before debugger command completed",
        ),
      );
  });
  child.stdio[4].on("data", (bytes) => {
    receivedBytes += Buffer.byteLength(bytes);
    buffer += bytes;
    if (buffer.length > 16 * 1024 * 1024) {
      rejectAll(fault("CDP_FRAME_LIMIT", "Debugger frame exceeded size limit"));
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
        if (!m || typeof m !== "object") throw Error();
      } catch {
        rejectAll(fault("CDP_INVALID_FRAME", "Invalid debugger frame"));
        return;
      }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        clearTimeout(p.timer);
        m.error
          ? p.reject(
              fault(
                "CDP_COMMAND_ERROR",
                `Debugger command failed: ${p.method}`,
                p.method,
              ),
            )
          : p.resolve(m.result || {});
      } else if (m.method) {
        if (events.length < 50000) events.push(m);
        else {
          rejectAll(fault("CDP_EVENT_LIMIT", "Debugger event limit exceeded"));
          return;
        }
      }
    }
  });
  const send = (method, params = {}, browser = false) =>
    new Promise((resolve, reject) => {
      if (
        terminal ||
        closed ||
        child.exitCode !== null ||
        child.signalCode !== null
      ) {
        reject(
          terminal ||
            fault("CDP_NOT_RUNNING", "Debugger is not running", method),
        );
        return;
      }
      const n = ++id;
      methods.push(method);
      if (methods.length > 16) methods.shift();
      const timer = setTimeout(
        () =>
          rejectAll(
            fault(
              "CDP_COMMAND_TIMEOUT",
              `Debugger command timed out: ${method}`,
              method,
            ),
          ),
        timeoutMs,
      );
      pending.set(n, { resolve, reject, timer, method });
      const frame =
        JSON.stringify({
          id: n,
          method,
          params,
          ...(!browser && session ? { sessionId: session } : {}),
        }) + "\0";
      writtenBytes += Buffer.byteLength(frame);
      child.stdio[3].write(frame, (error) => {
        if (error && !closed)
          rejectAll(
            fault(
              "CDP_PIPE_ERROR",
              `Chrome debugger write failed: ${error.code || "unknown"}`,
              method,
            ),
          );
      });
    });
  try {
    await new Promise((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", () =>
        reject(terminal || fault("CDP_SPAWN_FAILED", "Chrome launch failed")),
      );
    });
    phase = "browser-handshake";
    const version = await send("Browser.getVersion", {}, true);
    browserInfo = Object.fromEntries(
      ["product", "protocolVersion"]
        .filter((k) => typeof version[k] === "string")
        .map((k) => [
          k,
          version[k].slice(0, 80).replace(/[\x00-\x1f\x7f]/g, ""),
        ]),
    );
    phase = "target-create";
    const { targetId } = await send(
      "Target.createTarget",
      { url: "about:blank" },
      true,
    );
    if (typeof targetId !== "string" || !targetId)
      throw fault(
        "CDP_INVALID_TARGET",
        "Chrome did not return an owned target",
      );
    phase = "target-attach";
    const attached = await send(
      "Target.attachToTarget",
      { targetId, flatten: true },
      true,
    );
    session = attached.sessionId;
    if (typeof session !== "string" || !session)
      throw fault(
        "CDP_INVALID_SESSION",
        "Chrome did not return owned target session",
      );
    phase = "session";
    return { send, events, close, kill: close, child };
  } catch (error) {
    diagnostic(error);
    try {
      await close();
    } catch (cleanupError) {
      error.diagnostics = [
        error.diagnostic,
        ...failureDiagnostic(cleanupError),
      ];
    }
    error.diagnostic.exitCode = child.exitCode;
    error.diagnostic.signalCode = child.signalCode;
    throw error;
  }
}
