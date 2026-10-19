import fs from "node:fs";
import { normalizeObservation } from "./observation.mjs";
import { privateDiagnostic } from "../plugin/lib/host-resources.js";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { stopOwnedChild, failureDiagnostic } from "./owned-process.mjs";
export { stopOwnedChild } from "./owned-process.mjs";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import semver from "semver";
import { relocateProfileLock } from "../tools/profile-lock.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (s) =>
  String(s)
    .replace(/([?&]token=)[^\s&]+/gi, "$1[redacted]")
    .replace(
      /((?:api[_-]?key|authorization)\s*[:=]\s*)[^\s,]+/gi,
      "$1[redacted]",
    );

function ownedChild(command, args, env) {
  return spawn(command, args, {
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export async function command(
  command,
  args,
  { env = process.env, timeoutMs = 180000, signal } = {},
) {
  if (signal?.aborted)
    return { code: null, output: "", error: "Command aborted" };
  const child = ownedChild(command, args, env);
  let output = "",
    bytes = 0;
  const stdoutDecoder = new StringDecoder("utf8"),
    stderrDecoder = new StringDecoder("utf8");
  return new Promise((resolve) => {
    let done = false;
    const finish = async (code, error = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      output += stdoutDecoder.end() + stderrDecoder.end();
      if (error) {
        try {
          await stopOwnedChild(child);
        } catch (failure) {
          resolve({
            code,
            output: redact(output),
            error: error + "; " + failure.message,
            cleanup: { stopped: false },
            diagnostics: failureDiagnostic(failure),
          });
          return;
        }
      }
      resolve({ code, output: redact(output), error });
    };
    const abort = () => void finish(null, "Command aborted");
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () => finish(null, "Command timed out"),
      timeoutMs,
    );
    const append = (b, decoder) => {
      if (done) return;
      const remaining = 1024 * 1024 - bytes;
      const accepted = b.subarray(0, remaining);
      bytes += accepted.length;
      output += decoder.write(accepted);
      if (b.length > remaining)
        void finish(null, "Command output exceeded limit");
    };
    child.stdout.on("data", (b) => append(b, stdoutDecoder));
    child.stderr.on("data", (b) => append(b, stderrDecoder));
    child.once("error", (e) => finish(null, e.message));
    child.once("close", (code) => finish(code));
  });
}
function allocate() {
  const name = `dsc-check-${randomUUID()}`;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-check-"));
  // DSH initializes only a non-existent profile. Its parent remains private and
  // owned, so no shared directory reservation or formal-profile write is needed.
  const home = path.join(work, "dsh-home");
  fs.mkdirSync(home, { mode: 0o700 });
  fs.mkdirSync(path.join(home, "profiles"), { mode: 0o700 });
  const profile = path.join(home, "profiles", name);
  const env = { ...process.env, DSH_HOME: home, DSC_OUT_DIR: work };
  delete env.DSC_DSH_VERSION;
  return {
    home,
    name,
    profile,
    work,
    env,
    host: null,
  };
}
async function observeDshVersion(run) {
  const queried = await command("dsh", ["--version"], {
    env: run.env,
    timeoutMs: 15000,
  });
  const value = queried.output.trim().split("\n").at(-1);
  const version = semver.valid(value);
  if (queried.code !== 0 || !version)
    throw Object.assign(
      new Error(
        `DSH version query failed or returned an invalid version: ${queried.error || queried.code}`,
      ),
      { diagnostics: queried.diagnostics || [] },
    );
  run.env.DSC_DSH_VERSION = version;
  return version;
}
async function cleanup(run, keep) {
  await stopOwnedChild(run.host);
  if (!keep) fs.rmSync(run.work, { recursive: true, force: true });
  return {
    tempProfile: run.profile,
    tempProfileRemoved: !fs.existsSync(run.profile),
    workDir: keep ? run.work : null,
  };
}
async function finishCleanup(run, keep, result, install) {
  try {
    const commandStillOwned = (result?.diagnostics || []).some(
      (d) =>
        d.component === "owned-process" &&
        ["OWNED_PROCESS_CLEANUP_FAILED", "OWNED_PROCESS_EXIT_TIMEOUT"].includes(
          d.code,
        ),
    );
    const cleaned = await cleanup(run, keep || commandStillOwned);
    return install
      ? { ...result, cleanup: cleaned }
      : { ...result, ...cleaned };
  } catch (error) {
    const diagnostics = [
      ...(result?.diagnostics || []),
      ...failureDiagnostic(error),
    ];
    const failed = {
      tempProfile: run.profile,
      tempProfileRemoved: false,
      workDir: run.work,
      error: error.message,
      diagnostics: failureDiagnostic(error),
    };
    const message = [result?.error, error.message].filter(Boolean).join("; ");
    return install
      ? {
          ...result,
          status: "tool-error",
          exitCode: 3,
          error: message,
          diagnostics,
          cleanup: failed,
        }
      : {
          ...result,
          ...failed,
          surface: null,
          error: message,
          diagnostics,
        };
  }
}
function commandFailure(prefix, result) {
  const error = new Error(prefix + ": " + (result.error || result.output));
  error.diagnostics = result.diagnostics || [];
  return error;
}
async function installProbe(run, { services = [], manifests = [] }) {
  const probeDir = path.join(run.work, "probe");
  fs.mkdirSync(probeDir);
  for (const f of ["index.mjs", "package.json", "cordis.patch.yml"])
    fs.copyFileSync(path.join(REPO, "probe", f), path.join(probeDir, f));
  const probeEntry = path.join(probeDir, "index.mjs");
  fs.writeFileSync(
    probeEntry,
    fs
      .readFileSync(probeEntry, "utf8")
      .replace("../lib/observation.mjs", "./observation.mjs")
      .replace("../plugin/lib/host-resources.js", "./host-resources.js"),
  );
  fs.copyFileSync(
    path.join(REPO, "lib/observation.mjs"),
    path.join(probeDir, "observation.mjs"),
  );
  fs.copyFileSync(
    path.join(REPO, "plugin/lib/host-resources.js"),
    path.join(probeDir, "host-resources.js"),
  );
  run.env.DSC_PROFILE_ID ||= path.join(run.profile, "node_modules");
  const added = await command(
    "dsh",
    ["plugin", "--profile", run.name, "add", `file:${probeDir}`],
    { env: run.env },
  );
  if (added.code !== 0)
    throw commandFailure("Probe installation failed", added);
  fs.writeFileSync(
    path.join(run.work, "services.json"),
    JSON.stringify({ services: [...new Set(services)].sort(), manifests }),
    { mode: 0o600 },
  );
}
async function boot(run, timeoutSec) {
  if (!Number.isFinite(Number(timeoutSec)) || Number(timeoutSec) <= 0)
    throw new Error("启动等待秒数必须为正数");
  const report = path.join(run.work, "probe-report.json");
  run.host = ownedChild(
    "dsh",
    ["--profile", run.name, "--", "--port", "0", "--no-open"],
    run.env,
  );
  let out = "",
    spawnError = null,
    exited = false;
  run.host.stdout.on("data", (b) => {
    if (out.length < 1024 * 1024) out += b;
  });
  run.host.stderr.on("data", (b) => {
    if (out.length < 1024 * 1024) out += b;
  });
  run.host.once("error", (e) => {
    spawnError = e.message;
  });
  run.host.once("exit", () => {
    exited = true;
  });
  const deadline = Date.now() + Number(timeoutSec) * 1000;
  while (Date.now() < deadline) {
    if (spawnError) throw new Error(`Host launch failed: ${spawnError}`);
    if (fs.existsSync(report)) {
      let surface = null;
      try {
        surface = JSON.parse(fs.readFileSync(report, "utf8"));
      } catch {
        /* wait for the complete write */
      }
      if (surface) {
        const observation = normalizeObservation(surface, {
          profileId: run.env.DSC_PROFILE_ID,
          dshVersion: run.env.DSC_DSH_VERSION,
          maxAgeMs: 24 * 60 * 60 * 1000,
        });
        if (!observation.usable)
          throw new Error("Probe readiness/identity validation failed");
        return { surface, log: redact(out) };
      }
    }
    if (exited)
      throw new Error(
        `Host exited before a probe report: ${redact(out).slice(-1000)}`,
      );
    await delay(100);
  }
  throw new Error(`Host probe timed out: ${redact(out).slice(-1000)}`);
}
export async function probeProfile(
  nm,
  { timeoutSec = 40, keepDir = null, services = [], manifests = [] } = {},
) {
  const source = path.dirname(nm);
  if (!fs.existsSync(path.join(source, "package.json")))
    return { surface: null, error: "--probe-boot 需要 profile 目录" };
  const run = allocate();
  run.env.DSC_PROFILE_ID = path.resolve(nm);
  let result;
  try {
    fs.cpSync(source, run.profile, {
      recursive: true,
      filter: (f) => {
        if (path.basename(f) === "node_modules") return false;
        if (fs.lstatSync(f).isSymbolicLink())
          throw new Error("Unsafe symlink in source profile clone");
        return true;
      },
    });
    const clonedStat = fs.lstatSync(run.profile);
    if (!clonedStat.isDirectory() || clonedStat.isSymbolicLink())
      throw new Error("Unsafe cloned profile directory");
    const pkgFile = path.join(run.profile, "package.json");
    const manifestStat = fs.lstatSync(pkgFile);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink())
      throw new Error("Unsafe cloned profile manifest");
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    // Moving a profile must not change where its local dependencies resolve.
    // Rewrite only known relative local specs in our copy, never the source.
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, spec] of Object.entries(pkg[field] || {})) {
        if (typeof spec !== "string") continue;
        const local = /^(file:|link:)(.+)$/.exec(spec);
        if (local && !path.isAbsolute(local[2]) && !local[2].startsWith("~"))
          pkg[field][name] = local[1] + path.resolve(source, local[2]);
        else if (/^\.\.?[\\/]/.test(spec))
          pkg[field][name] = `file:${path.resolve(source, spec)}`;
      }
    }
    relocateProfileLock(run.profile, source);
    const extra = process.env.DSC_EXTRA_BUNDLES
      ? JSON.parse(process.env.DSC_EXTRA_BUNDLES)
      : [];
    if (!Array.isArray(extra))
      throw new Error("DSC_EXTRA_BUNDLES 必须为目录数组");
    for (const dir of extra) {
      const meta = JSON.parse(
        fs.readFileSync(path.join(dir, "package.json"), "utf8"),
      );
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(meta.name))
        throw new Error("Invalid extra bundle name");
      pkg.dependencies = {
        ...(pkg.dependencies || {}),
        [meta.name]: `file:${path.resolve(dir)}`,
      };
      if (!pkg.dsh?.profile?.bundles)
        throw new Error("Profile has no bundle list");
      pkg.dsh.profile.bundles.push(meta.name);
    }
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
    const installed = await command(
      "dsh",
      ["plugin", "--profile", run.name, "install"],
      { env: run.env },
    );
    if (installed.code !== 0)
      throw commandFailure("Profile install failed", installed);
    await observeDshVersion(run);
    await installProbe(run, { services, manifests });
    const observed = await boot(run, timeoutSec);
    let labels = null;
    const labelFile = path.join(run.work, "loader-labels.json");
    try {
      labels = JSON.parse(fs.readFileSync(labelFile, "utf8"));
    } catch {
      /* Auxiliary gold labels are not required by normal CLI probes. */
    }
    fs.writeFileSync(path.join(run.work, "boot.log"), observed.log, {
      mode: 0o600,
    });
    if (keepDir) {
      fs.mkdirSync(keepDir, { recursive: true, mode: 0o700 });
      for (const name of [
        "services.json",
        "probe-report.json",
        ...(labels ? ["loader-labels.json"] : []),
      ])
        if (
          !privateDiagnostic(
            path.join(keepDir, name),
            JSON.parse(fs.readFileSync(path.join(run.work, name), "utf8")),
          )
        )
          throw new Error(
            "Keep directory must be private and refuse symlink output",
          );
    }
    result = {
      surface: observed.surface,
      labels,
      error: null,
      notes: ["运行时面来自显式启动的临时 profile"],
    };
  } catch (error) {
    result = {
      surface: null,
      error: error.message,
      notes: [],
      diagnostics: failureDiagnostic(error),
    };
  } finally {
    result = await finishCleanup(run, false, result || {}, false);
  }
  return result;
}
export async function installAndProbe(
  spec,
  { timeoutSec = 30, keep = false, servicesFor } = {},
) {
  const run = allocate();
  let result;
  try {
    const created = await command(
      "dsh",
      ["--profile", run.name, "--from-default-profile", "web", "--dump-config"],
      { env: run.env },
    );
    if (created.code !== 0)
      throw commandFailure("Profile creation failed", created);
    const installed = await command(
      "dsh",
      ["plugin", "--profile", run.name, "add", spec],
      { env: run.env },
    );
    if (installed.code !== 0) {
      const gate =
        /Plugin .+ is incompatible with dsh .+peerDependencies/i.test(
          installed.output,
        );
      result = {
        status: gate ? "gate-rejected" : "tool-error",
        exitCode: gate ? 2 : 3,
        error: installed.error || installed.output,
        diagnostics: installed.diagnostics || [],
      };
    } else {
      const inventory = servicesFor(path.join(run.profile, "node_modules"));
      const version = await observeDshVersion(run);
      await installProbe(
        run,
        Array.isArray(inventory) ? { services: inventory } : inventory,
      );
      const observed = await boot(run, timeoutSec);
      fs.writeFileSync(path.join(run.work, "boot.log"), observed.log, {
        mode: 0o600,
      });
      result = {
        status: "observed",
        surface: observed.surface,
        nm: path.join(run.profile, "node_modules"),
        dshVersion: version,
      };
      // Final computation must happen before the owned profile is removed.
      if (typeof servicesFor.finish === "function")
        result.report = servicesFor.finish(result);
    }
  } catch (error) {
    result = {
      status: "tool-error",
      exitCode: 3,
      error: error.message,
      diagnostics: failureDiagnostic(error),
    };
  } finally {
    result = await finishCleanup(run, keep, result || {}, true);
  }
  return result;
}
