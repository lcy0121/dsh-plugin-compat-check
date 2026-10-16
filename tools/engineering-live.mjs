#!/usr/bin/env node
/** Real private DSH + packed plugin + HTTP responsiveness. No browser or model call. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { command } from "../lib/probe-runner.mjs";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-live-engineering-"));
const home = path.join(root, "home"),
  name = "engineering",
  env = {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: path.join(root, "agents"),
  };
for (const key of [
  "DSC_KERNEL",
  "DSC_PROBE_REPORT",
  "DSC_NODE_MODULES",
  "DSC_PROFILE",
  "DSC_OUT_DIR",
])
  delete env[key];
const cancellation = new AbortController(),
  commands = new Set();
let host = null,
  result = null,
  hostStopped = true;
const redact = (s) => String(s).replace(/([?&]token=)[^\s&]+/g, "$1[redacted]");
const run = async (executable, args, overrides = {}) => {
  const pending = command(executable, args, {
    env,
    ...overrides,
    signal: cancellation.signal,
  });
  commands.add(pending);
  let r;
  try {
    r = await pending;
  } finally {
    commands.delete(pending);
  }
  if (r.code !== 0)
    throw new Error(
      `${executable} failed: ${r.error || r.output.slice(-1200)}`,
    );
  return r.output;
};
async function stop() {
  if (!host?.pid || host.exitCode !== null) return;
  hostStopped = false;
  await new Promise((resolve) => {
    let timer;
    host.once("exit", () => {
      clearTimeout(timer);
      hostStopped = true;
      resolve();
    });
    const signal = (s) => {
      try {
        if (process.platform === "win32") host.kill(s);
        else process.kill(-host.pid, s);
      } catch {}
    };
    signal("SIGTERM");
    timer = setTimeout(() => signal("SIGKILL"), 1500);
  });
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    cancellation.abort();
    await Promise.allSettled([...commands]);
    await stop();
    fs.rmSync(root, { recursive: true, force: true });
    process.exit(130);
  });
try {
  fs.mkdirSync(home, { mode: 0o700 });
  const version = (await run("dsh", ["--version"])).trim().split("\n").at(-1);
  await run("dsh", [
    "--profile",
    name,
    "--from-default-profile",
    "web",
    "--dump-config",
  ]);
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  for (const dir of ["lib", "rules", "plugin", "skill"])
    fs.cpSync(path.join(repo, dir), path.join(source, dir), {
      recursive: true,
      filter: (file) =>
        path.basename(file) !== "node_modules" &&
        file !== path.join(repo, "plugin", "kernel"),
    });
  fs.copyFileSync(path.join(repo, "LICENSE"), path.join(source, "LICENSE"));
  await run("npm", [
    "pack",
    path.join(source, "plugin"),
    "--silent",
    "--pack-destination",
    root,
  ]);
  const tgz = fs.readdirSync(root).filter((n) => n.endsWith(".tgz"));
  if (tgz.length !== 1) throw new Error("Expected one owned tarball");
  await run("dsh", [
    "plugin",
    "--profile",
    name,
    "add",
    "file:" + path.join(root, tgz[0]),
  ]);
  const pressure = path.join(root, "pressure");
  fs.mkdirSync(pressure);
  fs.writeFileSync(
    path.join(pressure, "package.json"),
    JSON.stringify({
      name: "@engineering/pressure",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(pressure, "cordis.patch.yml"),
    `- insert:\n    - id: '@engineering/pressure'\n      name: '@engineering/pressure'\n`,
  );
  const functions = 4000;
  fs.writeFileSync(
    path.join(pressure, "index.js"),
    Array.from(
      { length: functions },
      (_, i) => `function f${i}(ctx){ctx.settings.get()}`,
    ).join("\n") + "\nexport function apply(){}",
  );
  await run("dsh", ["plugin", "--profile", name, "add", "file:" + pressure]);
  host = spawn("dsh", ["--profile", name, "--", "--port", "0", "--no-open"], {
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  hostStopped = false;
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Private DSH startup timed out: " + redact(output.slice(-1000)),
          ),
        ),
      60000,
    );
    const append = (b) => {
      if (output.length < 1024 * 1024) output += b;
      const match = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(
        output,
      );
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    host.stdout.on("data", append);
    host.stderr.on("data", append);
    host.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    host.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Private host exited: " + redact(output.slice(-1000))));
    });
  });
  const headers = {
    Authorization: "Bearer " + new URL(url).searchParams.get("token"),
  };
  const reportUrl = new URL("/plugin-compat-check/report?refresh=1", url);
  const fetchReport = async () => {
    const r = await fetch(reportUrl, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error("Report HTTP " + r.status);
    return r.json();
  };
  const initial = await fetchReport();
  if (!initial.ok)
    throw new Error(initial.error || "Initial artifact report unavailable");
  let completed = 0;
  const start = performance.now();
  const reports = Promise.all(
    Array.from({ length: 3 }, () => fetchReport().finally(() => completed++)),
  );
  // Attach a rejection handler immediately, while health polling is in progress.
  reports.catch(() => {});
  const latencies = [];
  let refreshingSamples = 0;
  do {
    const t = performance.now();
    const health = await fetch(new URL("/plugin-compat-check/report", url), {
      headers,
      signal: AbortSignal.timeout(1500),
    });
    const cached = await health.json();
    if (!health.ok || !cached.ok || cached.cache?.hit !== true)
      throw new Error("Cached report unavailable during refresh");
    if (cached.cache.refreshing) refreshingSamples++;
    latencies.push(performance.now() - t);
    await new Promise((r) => setTimeout(r, 10));
  } while (completed < 3);
  const values = await reports;
  if (values.some((v) => !v.ok))
    throw new Error("Concurrent report unavailable");
  const max = Math.max(...latencies);
  if (!refreshingSamples)
    throw new Error(
      "No cached response was observed during an in-flight refresh",
    );
  if (max >= 1500) throw new Error("Host responsiveness threshold exceeded");
  result = {
    schemaVersion: 1,
    kind: "plugin-compat-check/engineering-live",
    ok: true,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.versions.node,
    dshVersion: version,
    artifactVersion: values[0].toolVersion,
    pressureFunctions: functions,
    reportAvailable: true,
    reportMilliseconds: performance.now() - start,
    http: {
      samples: latencies.length,
      refreshingSamples,
      maxMilliseconds: max,
    },
    scope:
      "Owned web profile, actual tgz and synthetic uncalled functions; HTTP responsiveness only, not business behavior or a production performance guarantee.",
  };
} catch (error) {
  result = { ok: false, error: redact(error.message) };
  process.exitCode = 1;
} finally {
  cancellation.abort();
  await Promise.allSettled([...commands]);
  await stop();
  fs.rmSync(root, { recursive: true, force: true });
}
result.cleanup = { hostStopped, privateRootRemoved: !fs.existsSync(root) };
console.log(JSON.stringify(result, null, 2));
