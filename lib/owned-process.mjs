/** Owned process-group lifecycle. No argv, environment or global process listing
 * is retained; ps is a bounded failure diagnostic, filtered to this group. */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { privateDiagnostic } from "../plugin/lib/host-resources.js";
export function failureDiagnostic(error) {
  return error?.diagnostics?.length
    ? error.diagnostics
    : error?.diagnostic
      ? [error.diagnostic]
      : [];
}
export function publishDiagnostic(diagnostic, privateDetails) {
  const dir = process.env.DSC_EXECUTION_DIAGNOSTICS;
  if (dir) {
    const redact = (value) =>
      String(value)
        .slice(-8192)
        .replace(/https?:\/\/[^\s"'<>]+/gi, "<url>")
        .replace(
          /(authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/gi,
          "$1[redacted]",
        )
        .replace(
          /((?:api[_-]?key|access[_-]?token|password)\s*[:=]\s*)[^\s,;]+/gi,
          "$1[redacted]",
        );
    const data = {
      ...diagnostic,
      ...(privateDetails
        ? {
            privateDetails: Object.fromEntries(
              Object.entries(privateDetails).map(([key, value]) => [
                key,
                redact(value),
              ]),
            ),
          }
        : {}),
    };
    const written = privateDiagnostic(
      path.join(dir, `${diagnostic.component}-${randomUUID()}.json`),
      data,
    );
    diagnostic.persistence = { requested: true, written };
  }
  return diagnostic;
}
export function groupSnapshot(pgid) {
  if (process.platform === "win32")
    return { available: false, reason: "unsupported-platform" };
  const args =
    process.platform === "darwin"
      ? ["-g", String(pgid), "-o", "pid=,ppid=,pgid=,uid=,stat="]
      : ["-axo", "pid=,ppid=,pgid=,uid=,stat="];
  const r = spawnSync("/bin/ps", args, {
    encoding: "utf8",
    timeout: 1000,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (
    process.platform === "darwin" &&
    r.status === 1 &&
    !r.error &&
    !r.stdout.trim() &&
    !r.stderr.trim()
  )
    return { available: true, members: [], truncated: false };
  if (r.status !== 0 || r.error)
    return { available: false, reason: r.error?.code || "ps-failed" };
  const lines = r.stdout.trim().split("\n");
  const members = [];
  for (const line of lines) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s*$/.exec(line);
    if (!m) return { available: false, reason: "invalid-ps-output" };
    if (Number(m[3]) === pgid)
      members.push({
        pid: Number(m[1]),
        ppid: Number(m[2]),
        pgid: Number(m[3]),
        uid: Number(m[4]),
        state: m[5],
      });
  }
  return {
    available: true,
    members: members.slice(0, 64),
    truncated: members.length > 64,
  };
}
const stopping = new WeakMap();
export function stopOwnedChild(child) {
  if (!child?.pid)
    return Promise.resolve({ stopped: true, status: "not-started" });
  if (stopping.has(child)) return stopping.get(child);
  const pending = (async () => {
    if (!Number.isSafeInteger(child.pid) || child.pid <= 1)
      throw new Error("Invalid owned child pid");
    const done = () => child.exitCode !== null || child.signalCode !== null;
    let exitListener;
    const exited = done()
      ? Promise.resolve()
      : new Promise((resolve) => {
          exitListener = resolve;
          child.once("exit", resolve);
        });
    const signals = [];
    let phase = "SIGTERM";
    const state = () => ({
      schemaVersion: 1,
      kind: "plugin-compat-check/execution-diagnostic",
      component: "owned-process",
      phase,
      pid: child.pid,
      pgid: process.platform === "win32" ? null : child.pid,
      parentPid: process.pid,
      uid: process.getuid?.() ?? null,
      leaderExited: done(),
      exitCode: child.exitCode,
      signalCode: child.signalCode,
      signals,
    });
    const waitExit = async () => {
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((resolve) => {
            timer = setTimeout(resolve, 2000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    const signal = async (sig) => {
      phase = sig;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, sig);
        else if (!done()) child.kill(sig);
        signals.push({ signal: sig, result: "sent" });
      } catch (error) {
        signals.push({ signal: sig, result: error.code || "error" });
        if (error.code === "ESRCH") return;
        let group = groupSnapshot(child.pid);
        if (
          process.platform === "darwin" &&
          error.code === "EPERM" &&
          !done() &&
          group.available &&
          !group.truncated &&
          group.members.every((m) => m.uid === process.getuid?.()) &&
          (sig === "SIGKILL" ||
            group.members.every(
              (m) => m.state.startsWith("Z") || m.state.includes("E"),
            ))
        ) {
          await waitExit();
          group = groupSnapshot(child.pid);
        }
        // Darwin filters zombies out of killpg and can return EPERM when only
        // zombies remain. Never infer this from EPERM alone or a failed ps.
        const zombieOnly =
          process.platform === "darwin" &&
          error.code === "EPERM" &&
          group.available &&
          (done() ||
            group.members.some(
              (m) => m.pid === child.pid && m.state.startsWith("Z"),
            )) &&
          !group.truncated &&
          (group.members.length > 0 || done()) &&
          group.members.every(
            (m) => m.uid === process.getuid?.() && m.state.startsWith("Z"),
          );
        if (zombieOnly) {
          signals[signals.length - 1].result = group.members.length
            ? "verified-zombie-only"
            : "verified-exited-group";
          signals[signals.length - 1].group = group;
          return;
        }
        const failure = new Error(
          `Owned process cleanup failed: ${sig} ${error.code || "error"}`,
          { cause: error },
        );
        failure.code = "OWNED_PROCESS_CLEANUP_FAILED";
        failure.diagnostic = publishDiagnostic({
          ...state(),
          code: failure.code,
          signalError: {
            code: error.code || null,
            syscall: error.syscall || null,
            stack: String(error.stack || "")
              .split("\n")
              .slice(1, 10)
              .map((line) =>
                line
                  .replace(/\((?:file:\/\/)?\/.*\/([^/]+:\d+:\d+)\)/g, "($1)")
                  .replace(/at (?:file:\/\/)?\/.*\/([^/]+:\d+:\d+)/g, "at $1"),
              ),
          },
          group,
        });
        throw failure;
      }
    };
    try {
      await signal("SIGTERM");
      await new Promise((r) => setTimeout(r, 100));
      await signal("SIGKILL");
      phase = "exit";
      let timer;
      try {
        await Promise.race([
          exited,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  Object.assign(
                    new Error("Owned process did not exit after SIGKILL"),
                    {
                      code: "OWNED_PROCESS_EXIT_TIMEOUT",
                      diagnostic: publishDiagnostic({
                        ...state(),
                        code: "OWNED_PROCESS_EXIT_TIMEOUT",
                        group: groupSnapshot(child.pid),
                      }),
                    },
                  ),
                ),
              2000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      return {
        stopped: true,
        status: signals.some((s) => s.result === "verified-zombie-only")
          ? "zombie-only"
          : "stopped",
        ...state(),
      };
    } catch (error) {
      child.unref?.();
      throw error;
    } finally {
      if (exitListener) child.off("exit", exitListener);
      child.stdout?.destroy();
      child.stderr?.destroy();
    }
  })();
  stopping.set(child, pending);
  return pending;
}

/** Attempt each owned cleanup even when another resource fails. */
export async function cleanupOwned(tasks) {
  const settled = await Promise.allSettled(
    tasks.map((task) => Promise.resolve().then(task)),
  );
  const failures = settled
    .filter((r) => r.status === "rejected")
    .map((r) => r.reason);
  if (failures.length) {
    const error = new AggregateError(failures, "Owned resource cleanup failed");
    error.code = "OWNED_RESOURCE_CLEANUP_FAILED";
    error.diagnostics = failures.flatMap(failureDiagnostic);
    throw error;
  }
}
export function combineFailure(primary, cleanup) {
  if (!primary) return cleanup;
  const error = new Error(primary.message + "; " + cleanup.message, {
    cause: primary,
  });
  error.code = primary.code || "EXECUTION_FAILED";
  error.diagnostics = [
    ...failureDiagnostic(primary),
    ...failureDiagnostic(cleanup),
  ];
  return error;
}
