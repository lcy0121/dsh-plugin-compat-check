/** Linux-only kernel evidence for the owned Chrome PID, never argv/env or paths.
 * Snapshots describe observations, not a diagnosis. Counters may be disabled,
 * threads can disappear and /proc may be restricted; preserve those gaps. */
import fs from "node:fs";
import path from "node:path";

function read(file) {
  const fd = fs.openSync(file, "r");
  try {
    const bytes = Buffer.alloc(4097);
    const size = fs.readSync(fd, bytes, 0, bytes.length, 0);
    if (size > 4096) throw Object.assign(Error(), { code: "read-limit" });
    return bytes.subarray(0, size).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}
function task(base, pid) {
  let raw;
  try {
    raw = read(path.join(base, "stat"));
  } catch (e) {
    return { pid, available: false, reason: e.code || "read-failed" };
  }
  // comm can itself contain spaces and closing parentheses; it is not retained.
  const fields = raw
    .slice(raw.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/);
  if (
    !raw.startsWith(`${pid} (`) ||
    raw.lastIndexOf(")") < 0 ||
    fields.length < 22 ||
    !/^[A-Za-z]$/.test(fields[0]) ||
    ![11, 12, 17, 19].every((i) => /^\d+$/.test(fields[i]))
  )
    return { pid, available: false, reason: "invalid-stat" };
  let scheduler = null,
    schedulerReason = null,
    waitChannel = null,
    waitReason = null;
  try {
    const counters = read(path.join(base, "schedstat")).trim().split(/\s+/);
    if (counters.length !== 3 || !counters.every((n) => /^\d{1,24}$/.test(n)))
      schedulerReason = "invalid-schedstat";
    else
      scheduler = {
        runtimeNs: counters[0],
        runqueueNs: counters[1],
        timeslices: counters[2],
      };
  } catch (e) {
    schedulerReason = e.code || "read-failed";
  }
  try {
    const value = read(path.join(base, "wchan")).trim();
    if (/^[\w.]{1,80}$/.test(value)) waitChannel = value;
    else waitReason = "invalid-wchan";
  } catch (e) {
    waitReason = e.code || "read-failed";
  }
  return {
    pid,
    available: true,
    state: fields[0],
    userTicks: fields[11],
    systemTicks: fields[12],
    threadCount: fields[17],
    startTimeTicks: fields[19],
    scheduler,
    schedulerReason,
    waitChannel,
    waitReason,
  };
}
export function linuxProcessSnapshot(
  pid,
  { procRoot = "/proc", threads = true } = {},
) {
  if (!Number.isSafeInteger(pid) || pid <= 1)
    return { available: false, reason: "invalid-pid" };
  const base = path.join(procRoot, String(pid));
  const leader = task(base, pid);
  if (!leader.available) return { available: false, reason: leader.reason };
  let schedulerStats;
  try {
    const value = read(
      path.join(procRoot, "sys/kernel/sched_schedstats"),
    ).trim();
    schedulerStats = /^[01]$/.test(value)
      ? { enabled: value === "1", reason: null }
      : { enabled: null, reason: "invalid-schedstats-setting" };
  } catch (e) {
    schedulerStats = { enabled: null, reason: e.code || "read-failed" };
  }
  const tasks = [];
  let truncated = false,
    tasksReason = null;
  if (threads) {
    let dir;
    try {
      dir = fs.opendirSync(path.join(base, "task"));
      let entry;
      while ((entry = dir.readSync())) {
        if (!/^\d+$/.test(entry.name)) continue;
        if (tasks.length === 32) {
          truncated = true;
          break;
        }
        const tid = Number(entry.name);
        if (!Number.isSafeInteger(tid)) continue;
        tasks.push(task(path.join(base, "task", entry.name), tid));
      }
    } catch (e) {
      tasksReason = e.code || "read-failed";
    } finally {
      dir?.closeSync();
    }
    tasks.sort((a, b) => a.pid - b.pid);
  }
  return {
    available: true,
    leader,
    schedulerStats,
    tasks,
    truncated,
    tasksReason,
  };
}
