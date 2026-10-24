/** Explicitly authorized repository runner. A private profile is not an OS sandbox. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { command, stopOwnedChild } from "../lib/probe-runner.mjs";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";
import {
  navigateOwnedDocument,
  disableCredentialOnboarding,
} from "./browser-session.mjs";
import {
  FUNCTIONAL_HEALTH_KIND,
  FUNCTIONAL_HEALTH_LIMITS as LIMITS,
  validateFunctionalManifest,
  canonicalFunctionalManifest,
} from "../lib/functional-health-contract.mjs";
import { executeFunctionalChecks } from "./functional-health.mjs";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const summary = (error) =>
  String(error?.message || error)
    .replace(/Bearer\s+\S+|([?&]token=)[^\s&]+/gi, "[redacted]")
    .slice(0, 1024);

export {
  verifyFunctionalArtifact,
  verifyFunctionalArtifactInWorker,
} from "./functional-artifact.mjs";
import { verifyFunctionalArtifactInWorker } from "./functional-artifact.mjs";

export async function createFunctionalDom(
  chrome,
  origin,
  { signal, token = null } = {},
) {
  const allowed = new URL(origin);
  if (
    allowed.protocol !== "http:" ||
    allowed.hostname !== "127.0.0.1" ||
    !allowed.port ||
    allowed.origin !== origin
  )
    throw Error("Expected owned loopback origin");
  await chrome.send("Page.enable");
  await chrome.send("Page.setLifecycleEventsEnabled", { enabled: true });
  await chrome.send("Network.enable");
  await chrome.send("Fetch.enable", {
    patterns: [{ urlPattern: "*", requestStage: "Request" }],
  });
  let cursor = chrome.events.length,
    fault = null,
    pumping = false,
    closed = false;
  const pump = async () => {
    if (pumping || closed) return;
    pumping = true;
    try {
      while (cursor < chrome.events.length) {
        const event = chrome.events[cursor++];
        if (event.method !== "Fetch.requestPaused") continue;
        const p = event.params;
        let same = false;
        try {
          same = new URL(p.request.url).origin === origin;
        } catch {}
        const block = !same || Boolean(p.redirectedRequestId);
        await chrome.send(
          block ? "Fetch.failRequest" : "Fetch.continueRequest",
          {
            requestId: p.requestId,
            ...(block
              ? { errorReason: "BlockedByClient" }
              : token
                ? {
                    headers: [
                      ...Object.entries(p.request.headers)
                        .filter(
                          ([name]) => name.toLowerCase() !== "authorization",
                        )
                        .map(([name, value]) => ({
                          name,
                          value: String(value),
                        })),
                      { name: "Authorization", value: "Bearer " + token },
                    ],
                  }
                : {}),
          },
        );
        if (block && p.resourceType === "Document")
          fault = Error("External navigation or redirect refused");
      }
    } catch (error) {
      fault = error;
    } finally {
      pumping = false;
    }
  };
  const interval = setInterval(() => void pump(), 5);
  const poll = async (fn, message) => {
    const deadline = Date.now() + LIMITS.requestMs;
    do {
      signal?.throwIfAborted();
      if (fault) throw fault;
      const v = await fn();
      if (v) return v;
      await wait(10);
    } while (Date.now() < deadline);
    throw Error(message);
  };
  const navigate = async (url) => {
    signal?.throwIfAborted();
    fault = null;
    await navigateOwnedDocument(chrome, url, poll);
    const tree = await chrome.send("Page.getFrameTree");
    if (new URL(tree.frameTree.frame.url).origin !== origin)
      throw Error("DOM document left owned origin");
  };
  try {
    // DSH query-token login redirects. Fixed bearer headers are added only
    // after the owned-origin and no-redirect checks, without navigating a login page.
    return {
      async count(check) {
        await navigate(new URL(check.path, origin).href);
        const { root } = await chrome.send("DOM.getDocument", { depth: 0 });
        const { nodeIds } = await chrome.send("DOM.querySelectorAll", {
          nodeId: root.nodeId,
          selector: check.selector,
        });
        return nodeIds.length;
      },
      async close() {
        closed = true;
        clearInterval(interval);
        while (pumping) await wait(5);
      },
    };
  } catch (error) {
    closed = true;
    clearInterval(interval);
    while (pumping) await wait(5);
    throw error;
  }
}

async function bootHost(child, signal) {
  return new Promise((resolve, reject) => {
    let output = "",
      bytes = 0;
    const finish = (error, value) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", aborted);
      child.stdout.off("data", append);
      child.stderr.off("data", append);
      child.off("error", failed);
      child.off("exit", exited);
      error ? reject(error) : resolve(value);
    };
    const aborted = () =>
      finish(Error("Functional health cancelled or timed out"));
    const failed = () => finish(Error("Owned DSH host launch failed"));
    const exited = () => finish(Error("Owned DSH host exited before ready"));
    const append = (chunk) => {
      bytes += chunk.length;
      if (bytes > 1024 * 1024) {
        finish(Error("Host startup output exceeds limit"));
        return;
      }
      output += chunk.toString("utf8");
      const match = /(http:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(
        output,
      );
      if (match) finish(null, match[1]);
    };
    const timer = setTimeout(
      () => finish(Error("Owned DSH startup timed out")),
      45000,
    );
    signal.addEventListener("abort", aborted, { once: true });
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.once("error", failed);
    child.once("exit", exited);
    if (signal.aborted) aborted();
  });
}

export async function runFunctionalHealth({
  manifest,
  artifact,
  out,
  chromePath,
}) {
  const validation = validateFunctionalManifest(manifest);
  if (!validation.valid) throw Error(validation.errors.join("; "));
  const cancellation = new AbortController(),
    timer = setTimeout(() => cancellation.abort(), LIMITS.totalMs);
  const cancel = () => cancellation.abort();
  for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, cancel);
  const startedAt = new Date().toISOString();
  try {
    // Verification, hashing, decompression and tar parsing share total supervision.
    const bytes = await verifyFunctionalArtifactInWorker(
      artifact,
      manifest.artifact,
      { signal: cancellation.signal },
    );
    cancellation.signal.throwIfAborted();
    return await runVerifiedHealth(
      { manifest, out, chromePath },
      bytes,
      cancellation,
      startedAt,
    );
  } finally {
    cancellation.abort();
    clearTimeout(timer);
    for (const sig of ["SIGINT", "SIGTERM"])
      process.removeListener(sig, cancel);
  }
}

async function runVerifiedHealth(
  { manifest, out, chromePath },
  bytes,
  cancellation,
  startedAt,
) {
  // All identity and destination checks precede DSH execution or network.
  if (fs.existsSync(out)) throw Error("Output must be a new JSON file");
  if (!fs.statSync(path.dirname(out)).isDirectory())
    throw Error("Output parent is not a directory");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-functional-health-"));
  fs.chmodSync(root, 0o700);
  const cleanupErrors = [];
  let host = null,
    chrome = null,
    dom = null,
    result;
  const env = isolatedEnvironment(root);
  const execute = async (args) => {
    const r = await command("dsh", args, {
      env,
      timeoutMs: 60000,
      signal: cancellation.signal,
    });
    if (r.cleanup?.stopped === false) {
      const pid = r.diagnostics?.find(
        (d) => d.component === "owned-process",
      )?.pid;
      cleanupErrors.push(
        (
          "Owned command group " +
          (pid ?? "unknown") +
          ": " +
          summary(r.error)
        ).slice(0, 512),
      );
    }
    if (r.code !== 0 || r.error)
      throw Error("Owned DSH command failed: " + (r.error || "exit " + r.code));
    return r.output;
  };
  try {
    const version = (await execute(["--version"])).trim().split("\n").at(-1);
    if (version !== manifest.dshVersion)
      throw Error("Installed DSH version differs from declaration");
    const selected = path.join(root, "selected.tgz");
    fs.writeFileSync(selected, bytes, { mode: 0o600 });
    await execute([
      "--profile",
      "health",
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(path.join(env.DSH_HOME, "profiles", "health"));
    await execute(["plugin", "--profile", "health", "add", "file:" + selected]);
    cancellation.signal.throwIfAborted();
    host = spawn(
      "dsh",
      ["--profile", "health", "--", "--port", "0", "--no-open"],
      {
        env,
        cwd: root,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const url = new URL(await bootHost(host, cancellation.signal));
    // Keep draining bounded startup logs without retaining credentials/content.
    host.stdout.resume();
    host.stderr.resume();
    if (manifest.checks.some((c) => c.type === "dom")) {
      chromePath ||=
        process.env.DSC_CHROME ||
        [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/usr/bin/google-chrome",
          "/usr/bin/chromium",
        ].find((f) => fs.existsSync(f));
      if (!chromePath) throw Error("Chrome executable required for DOM checks");
      chrome = await launchChromePipe(chromePath, {
        timeoutMs: 5000,
        userDataDir: path.join(root, "chrome"),
      });
      cancellation.signal.throwIfAborted();
      dom = await createFunctionalDom(chrome, url.origin, {
        signal: cancellation.signal,
        token: url.searchParams.get("token"),
      });
    }
    const checks = await executeFunctionalChecks(manifest.checks, {
      origin: url.origin,
      token: url.searchParams.get("token"),
      signal: cancellation.signal,
      dom,
    });
    const error = checks.find((c) => c.status === "error");
    result = {
      status: error
        ? "error"
        : checks.some((c) => c.status === "failed")
          ? "tested-failed"
          : "tested-pass",
      checks,
      ...(error
        ? { error: "One or more functional checks could not complete" }
        : {}),
    };
  } catch (error) {
    result = { status: "error", checks: [], error: summary(error) };
  } finally {
    cancellation.abort();
    for (const stop of [
      () => dom?.close(),
      () => chrome?.close(),
      () => stopOwnedChild(host),
    ])
      try {
        await stop();
      } catch (error) {
        cleanupErrors.push(summary(error).slice(0, 512));
      }
    let removed = false;
    if (!cleanupErrors.length)
      try {
        fs.rmSync(root, { recursive: true, force: true });
        removed = true;
      } catch (error) {
        cleanupErrors.push(summary(error).slice(0, 512));
      }
    if (cleanupErrors.length) {
      cleanupErrors.push(("Owned files retained at " + root).slice(0, 512));
      result = {
        ...result,
        status: "error",
        error: [result?.error, "Owned resource cleanup failed"]
          .filter(Boolean)
          .join("; "),
      };
    }
    result = {
      schemaVersion: 1,
      kind: FUNCTIONAL_HEALTH_KIND,
      ...result,
      declaration: manifest,
      identity: {
        artifact: manifest.artifact,
        dshVersion: manifest.dshVersion,
        manifestSha256: hash(canonicalFunctionalManifest(manifest)),
      },
      startedAt,
      completedAt: new Date().toISOString(),
      cleanup: {
        stopped: cleanupErrors.length === 0,
        removed,
        ...(cleanupErrors.length ? { errors: cleanupErrors } : {}),
      },
      limitations: [
        "Private profile is not an OS sandbox; selected plugin code may execute during authorized installation and startup",
        "Only declared same-origin HTTP GET and read-only DOM counts were tested; no complete business or compatibility certification",
        "No account/model configuration is supplied; author declarations and imported JSON are not automatically trusted",
      ],
    };
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  return result;
}
