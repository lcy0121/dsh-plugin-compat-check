/** Owns each isolated launcher, browser, command and temporary profile. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { cleanupOwned } from "../lib/owned-process.mjs";
import { command, stopOwnedChild } from "../lib/probe-runner.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";
import { hostRuntimeDriver } from "./host-runtime-driver.mjs";
import { disableCredentialOnboarding } from "./browser-session.mjs";
export const redactLiveUrl = (text) =>
  String(text).replace(/([?&]token=)[^\s&]+/g, "$1[redacted]");
export function createOwnedLiveHost() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-rc2-live-"));
  const env = isolatedEnvironment(root);
  const children = new Set();
  let chrome, chromeStarting, commandCleanupFailure, cleaning;
  const cancellation = new AbortController(),
    commands = new Set();
  const exec = async (c, a, timeoutMs = 120000, commandEnv = env) => {
    const pending = command(c, a, {
      env: commandEnv,
      timeoutMs,
      signal: cancellation.signal,
    });
    commands.add(pending);
    let r;
    try {
      r = await pending;
    } finally {
      commands.delete(pending);
    }
    if (r.cleanup?.stopped === false)
      commandCleanupFailure = Object.assign(new Error(r.error), {
        diagnostics: r.diagnostics || [],
      });
    if (r.code !== 0)
      throw Object.assign(
        new Error(
          c + " failed: " + redactLiveUrl(r.error || r.output).slice(-900),
        ),
        { diagnostics: r.diagnostics || [] },
      );
    return r.output;
  };
  const profilePath = (name) => path.join(env.DSH_HOME, "profiles", name);
  const init = async (name) => {
    await exec("dsh", [
      "--profile",
      name,
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(profilePath(name));
    return profilePath(name);
  };
  async function boot(name, overrides = {}) {
    const child = spawn(
      "dsh",
      ["--profile", name, "--", "--port", "0", "--no-open"],
      {
        env: { ...env, ...overrides },
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.add(child);
    return new Promise((resolve, reject) => {
      let output = "",
        settled = false;
      const finish = (url) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          child,
          url,
          get output() {
            return output;
          },
        });
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(
          Error(
            "Private host startup timeout: " +
              redactLiveUrl(output).slice(-900),
          ),
        );
      }, 45000);
      const append = (b) => {
        if (output.length < 1024 * 1024) output += b;
        const m = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(
          output,
        );
        if (m) finish(m[1]);
      };
      child.stdout.on("data", append);
      child.stderr.on("data", append);
      child.once("exit", () => finish(null));
      child.once("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(Error("Host spawn failed"));
      });
    });
  }
  const stop = async (host) => {
    await stopOwnedChild(host.child);
    children.delete(host.child);
  };
  function bootDriver({ runtimeOnly = false } = {}) {
    return hostRuntimeDriver({ env, runtimeOnly });
  }

  async function removeOwnedResources() {
    cancellation.abort();
    await Promise.allSettled([...commands]);
    const browser = chrome || (await chromeStarting?.catch(() => null));
    await cleanupOwned([
      () => {
        if (commandCleanupFailure) throw commandCleanupFailure;
      },
      () => browser?.close(),
      ...[...children].map((child) => () => stopOwnedChild(child)),
    ]);
    fs.rmSync(root, { recursive: true, force: true });
  }

  async function openChrome(chromePath) {
    chromeStarting = launchChromePipe(chromePath, {
      timeoutMs: 15000,
      userDataDir: path.join(root, "chrome"),
    });
    chrome = await chromeStarting;
    return chrome;
  }

  async function closeChrome() {
    await chrome?.close();
    chrome = null;
    chromeStarting = null;
  }

  return {
    root,
    env,
    exec,
    profilePath,
    init,
    boot,
    stop,
    bootDriver,
    openChrome,
    closeChrome,
    cleanup: () => (cleaning ??= removeOwnedResources()),
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function poll(fn, message, timeout = 20000) {
  const until = Date.now() + timeout;
  do {
    const value = await fn();
    if (value) return value;
    await wait(100);
  } while (Date.now() < until);
  throw Error(message);
}
