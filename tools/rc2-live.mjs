#!/usr/bin/env node
/** Owned real-host acceptance: declaration gates, metadata, actual settings UI and reload. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { command, stopOwnedChild } from "../lib/probe-runner.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";
import {
  configureChineseBrowser,
  disableCredentialOnboarding,
  loadedNavigation,
} from "./browser-session.mjs";
import { run as check } from "../bin/compat-check.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-rc2-live-"));
const env = {
  ...process.env,
  DSH_HOME: path.join(root, "home"),
  DSH_AGENTS_HOME: path.join(root, "agents"),
  npm_config_cache: path.join(root, "npm-cache"),
};
for (const k of [
  "DSC_KERNEL",
  "DSC_PROBE_REPORT",
  "DSC_NODE_MODULES",
  "DSC_PROFILE",
  "DSC_OUT_DIR",
  "DSH_VERSION",
])
  delete env[k];
const children = new Set();
let chrome, chromeStarting, result;
const cancellation = new AbortController(),
  commands = new Set();
const redact = (text) =>
  String(text).replace(/([?&]token=)[^\s&]+/g, "$1[redacted]");
const requireTrue = (condition, message) => {
  if (!condition) throw Error(message);
};
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
  requireTrue(
    r.code === 0,
    c + " failed: " + redact(r.error || r.output).slice(-900),
  );
  return r.output;
};
const writeJSON = (p, value) =>
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n");
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
async function boot(name) {
  const child = spawn(
    "dsh",
    ["--profile", name, "--", "--port", "0", "--no-open"],
    {
      env,
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
      resolve({ child, url, output });
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        Error("Private host startup timeout: " + redact(output).slice(-900)),
      );
    }, 45000);
    const append = (b) => {
      if (output.length < 1024 * 1024) output += b;
      const m = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(output);
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function poll(fn, message, timeout = 20000) {
  const until = Date.now() + timeout;
  do {
    const value = await fn();
    if (value) return value;
    await wait(100);
  } while (Date.now() < until);
  throw Error(message);
}
function bootDriver() {
  const mac = "/Applications/DeepSeek Harness.app/Contents";
  if (
    process.platform === "darwin" &&
    fs.existsSync(mac + "/Resources/app.asar")
  )
    return {
      command: mac + "/MacOS/DeepSeek Harness",
      module:
        mac +
        "/Resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js",
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    };
  for (const d of process.env.PATH.split(path.delimiter))
    try {
      const cli = fs.realpathSync(path.join(d, "dsh"));
      return {
        command: process.execPath,
        module: createRequire(cli).resolve("@deepseek-ai/dsh-app-boot"),
        env,
      };
    } catch {}
  throw Error("Cannot locate actual official app-boot module");
}
async function cleanup() {
  cancellation.abort();
  await Promise.allSettled([...commands]);
  const browser = chrome || (await chromeStarting?.catch(() => null));
  await browser?.close();
  await Promise.allSettled([...children].map(stopOwnedChild));
  fs.rmSync(root, { recursive: true, force: true });
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, async () => {
    await cleanup();
    process.exit(130);
  });
try {
  const version = (await exec("dsh", ["--version"])).trim().split("\n").at(-1);
  if (version !== "0.2.1-rc.2")
    result = {
      ok: true,
      applicable: false,
      dshVersion: version,
      reason:
        "rc.2-specific live acceptance; legacy runtime remains covered by other live tests.",
    };
  else {
    result = {
      ok: false,
      applicable: true,
      dshVersion: version,
      artifactVersion: TOOL_VERSION,
      declarationCases: [],
      ui: { available: false },
      scope:
        "Controlled declaration gates and unprivileged local browser UI only; no model call, real plugin business-function or Windows certification.",
    };
    const cases = [
      {
        id: "engines-allow",
        engines: { dsh: ">=0.2.1-rc.2 <0.3.0" },
        peers: { "@deepseek-ai/dsh": "<0.2.1-rc.2" },
        accepted: true,
      },
      {
        id: "engines-reject",
        engines: { dsh: "<0.2.1-rc.2" },
        peers: { "@deepseek-ai/dsh": ">=0.2.1-rc.2 <0.3.0" },
        accepted: false,
      },
      {
        id: "exact-exemption",
        engines: { dsh: "<0.2.1-rc.2" },
        grant: true,
        accepted: true,
      },
      {
        id: "wrong-exemption",
        engines: { dsh: "<0.2.1-rc.2" },
        wrongGrant: true,
        accepted: false,
      },
      {
        id: "peer-fallback",
        peers: { "@deepseek-ai/dsh": "<0.2.1-rc.2" },
        accepted: false,
      },
    ];
    for (const c of cases) {
      const name = "rc2-" + c.id,
        profile = await init(name),
        fixture = path.join(profile, "node_modules", "@rc2", "fixture");
      fs.mkdirSync(fixture, { recursive: true });
      writeJSON(path.join(fixture, "package.json"), {
        name: "@rc2/fixture",
        version: "1.0.0",
        type: "module",
        main: "index.js",
        dsh: { bundle: { patch: "cordis.patch.yml" } },
        ...(c.engines ? { engines: c.engines } : {}),
        ...(c.peers ? { peerDependencies: c.peers } : {}),
      });
      fs.writeFileSync(
        path.join(fixture, "index.js"),
        'export function apply(){console.log("RC2_FIXTURE_ACTIVATED")}',
      );
      fs.writeFileSync(
        path.join(fixture, "cordis.patch.yml"),
        '- insert:\n    - id: rc2-fixture\n      name: "@rc2/fixture"\n',
      );
      const file = path.join(profile, "package.json"),
        manifest = JSON.parse(fs.readFileSync(file));
      manifest.dependencies = {
        ...manifest.dependencies,
        "@rc2/fixture": "file:" + fixture,
      };
      manifest.dsh.profile.bundles.push("@rc2/fixture");
      writeJSON(file, manifest);
      if (c.grant || c.wrongGrant)
        writeJSON(path.join(profile, "compatibility.json"), {
          [c.grant ? "@rc2/fixture@1.0.0" : "@rc2/fixture@1.0.1"]: [version],
        });
      const predicted = check({
        nm: path.join(profile, "node_modules"),
        dshVersion: version,
        baseline: false,
      });
      requireTrue(
        !predicted.error,
        "Checker failed before live gate: " + predicted.error,
      );
      const rejected = predicted.verdict.plugins["@rc2/fixture"].findings.some(
        (f) => f.category === "declared-incompatible",
      );
      const host = await boot(name);
      const actualAccepted =
        Boolean(host.url) && host.output.includes("RC2_FIXTURE_ACTIVATED");
      const actualRejected =
        !actualAccepted &&
        /incompatible with dsh.*requirements/.test(host.output);
      const matched =
        !rejected === c.accepted &&
        (c.accepted ? actualAccepted : actualRejected);
      await stop(host);
      requireTrue(
        matched,
        "Actual declaration gate disagreed: " +
          c.id +
          " " +
          redact(host.output).slice(-700),
      );
      result.declarationCases.push({
        id: c.id,
        expectedAccepted: c.accepted,
        checkerAccepted: !rejected,
        actualAccepted,
        actualRejected,
        matched,
      });
    }
    // Ask the installed official metadata implementation about a root and subpaths.
    const metaRoot = path.join(root, "metadata"),
      pkg = path.join(metaRoot, "node_modules", "@rc2", "metadata");
    fs.mkdirSync(pkg, { recursive: true });
    writeJSON(path.join(pkg, "package.json"), {
      name: "@rc2/metadata",
      version: "1.0.0",
      description: "ROOT_ONLY_DESCRIPTION",
      type: "module",
      exports: {
        ".": "./index.js",
        "./package.json": "./package.json",
        "./sub": "./sub.js",
        "./sub/locale/en.json": "./locale/en.json",
        "./plain": "./sub.js",
      },
    });
    for (const f of ["index.js", "sub.js"])
      fs.writeFileSync(path.join(pkg, f), "export function apply(){}");
    fs.mkdirSync(path.join(pkg, "locale"));
    writeJSON(path.join(pkg, "locale/en.json"), {
      meta: { title: "Scoped subpath" },
    });
    const driver = bootDriver(),
      script = path.join(root, "metadata-check.mjs");
    fs.writeFileSync(
      script,
      `import {readPluginMeta} from ${JSON.stringify(pathToFileURL(driver.module).href)};import {pathToFileURL} from 'node:url';const p=pathToFileURL(${JSON.stringify(path.join(metaRoot, "package.json"))}).href;const a=readPluginMeta('@rc2/metadata',p),b=readPluginMeta('@rc2/metadata/sub',p),c=readPluginMeta('@rc2/metadata/plain',p);if(a.description!=='ROOT_ONLY_DESCRIPTION'||b.title.en!=='Scoped subpath'||b.description!==undefined||c!==undefined)throw Error('Subpath borrowed root metadata');console.log('METADATA_PASS');`,
    );
    const metaOutput = await exec(driver.command, [script], 20000, driver.env);
    requireTrue(
      metaOutput.includes("METADATA_PASS"),
      "Actual subpath metadata check failed",
    );
    result.subpathMetadata = true;
    // Build and install the exact local candidate independently of the checkout.
    const profile = await init("rc2-ui"),
      source = path.join(root, "source");
    fs.mkdirSync(source);
    for (const d of ["lib", "rules", "plugin", "skill"])
      fs.cpSync(path.join(repo, d), path.join(source, d), {
        recursive: true,
        filter: (f) =>
          path.basename(f) !== "node_modules" &&
          f !== path.join(repo, "plugin", "kernel"),
      });
    fs.copyFileSync(path.join(repo, "LICENSE"), path.join(source, "LICENSE"));
    await exec("npm", [
      "pack",
      path.join(source, "plugin"),
      "--silent",
      "--pack-destination",
      root,
    ]);
    const tgz = fs.readdirSync(root).filter((f) => f.endsWith(".tgz"));
    requireTrue(tgz.length === 1, "Expected one candidate tgz");
    result.artifactSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(root, tgz[0])))
      .digest("hex");
    await exec("dsh", [
      "plugin",
      "--profile",
      "rc2-ui",
      "add",
      "file:" + path.join(root, tgz[0]),
    ]);
    const host = await boot("rc2-ui");
    requireTrue(
      host.url,
      "Candidate host failed: " + redact(host.output).slice(-900),
    );
    const headers = {
        Authorization: "Bearer " + new URL(host.url).searchParams.get("token"),
      },
      reportUrl = new URL("/plugin-compat-check/report?refresh=1", host.url);
    const fetchReport = async () => {
      const r = await fetch(reportUrl, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      return { status: r.status, body: await r.json() };
    };
    const initial = await fetchReport();
    requireTrue(
      initial.status === 200 &&
        initial.body.ok &&
        initial.body.report.dshVersion === version,
      "Actual candidate report lacks rc.2 identity",
    );
    result.httpReport = true;
    const chromePath =
      process.env.DSC_CHROME ||
      [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
      ].find((p) => fs.existsSync(p));
    if (chromePath) {
      chromeStarting = launchChromePipe(chromePath, {
        timeoutMs: 15000,
        userDataDir: path.join(root, "chrome"),
      });
      chrome = await chromeStarting;
      await configureChineseBrowser(chrome);
      await chrome.send("Emulation.setDeviceMetricsOverride", {
        width: 1280,
        height: 900,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await chrome.send("Runtime.enable");
      await chrome.send("Page.enable");
      await chrome.send("Page.setLifecycleEventsEnabled", { enabled: true });
      const navigation = await chrome.send("Page.navigate", { url: host.url });
      requireTrue(!navigation.errorText, "Browser navigation failed");
      await poll(
        () => loadedNavigation(chrome.events, navigation.loaderId),
        "Browser new document did not load",
      );
      const evalx = async (expression) =>
        (
          await chrome.send("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
          })
        ).result?.value;
      await poll(
        () =>
          evalx(
            `Boolean(document.querySelector('button[aria-label="账号菜单"]'))`,
          ),
        "Browser shell did not load",
      );
      const welcome = `[...document.querySelectorAll('button')].find(b=>b.innerText==='继续')`;
      await poll(
        () => evalx(`Boolean(${welcome})`),
        "Welcome dialog did not mount",
      );
      await evalx(`${welcome}.click()`);
      await poll(() => evalx(`!${welcome}`), "Welcome dialog did not close");
      const settings = async () => {
        await evalx(
          `document.querySelector('button[aria-label="账号菜单"]').click()`,
        );
        await poll(
          () =>
            evalx(
              `[...document.querySelectorAll('[role="menuitem"]')].some(b=>b.innerText.startsWith('设置'))`,
            ),
          "Settings menu missing",
        );
        await evalx(
          `[...document.querySelectorAll('[role="menuitem"]')].find(b=>b.innerText.startsWith('设置')).click()`,
        );
        await poll(
          () =>
            evalx(
              `[...document.querySelectorAll('button')].some(b=>b.innerText==='内置插件')`,
            ),
          "Built-in settings entry missing",
        );
        await evalx(
          `[...document.querySelectorAll('button')].find(b=>b.innerText==='内置插件').click()`,
        );
        await poll(
          () =>
            evalx(
              `[...document.querySelectorAll('[role="tab"]')].filter(b=>b.innerText==='兼容性').length===1&&document.body.innerText.includes('工具版本：')`,
            ),
          "Compatibility tab/report not actually rendered",
        );
      };
      await settings();
      await evalx(
        `[...document.querySelectorAll('button')].find(b=>b.innerText==='关闭').click();document.querySelector('button[aria-label="插件"]').click()`,
      );
      const toggle = `document.querySelector('button[aria-label="启用 dsh-plugin-compat-check"]')`;
      await poll(
        () => evalx(`Boolean(${toggle})`),
        "Installed plugin toggle missing",
      );
      await evalx(`${toggle}.click()`);
      await poll(
        () => evalx(`${toggle}?.getAttribute('aria-checked')==='false'`),
        "Plugin did not disable",
      );
      await poll(async () => {
        try {
          const r = await fetch(reportUrl, {
            headers,
            signal: AbortSignal.timeout(2000),
          });
          const type = r.headers.get("content-type");
          let body;
          try {
            body = await r.clone().json();
          } catch {}
          result.disabledDiagnostic = {
            status: r.status,
            type,
            ok: body?.ok,
            kind: body?.kind,
            error: body?.error,
          };
          return (
            r.status === 404 ||
            (r.status === 200 && !type?.includes("application/json"))
          );
        } catch {
          return false;
        }
      }, "Owned route survived disable");
      await evalx(`${toggle}.click()`);
      await poll(
        () => evalx(`${toggle}?.getAttribute('aria-checked')==='true'`),
        "Plugin did not re-enable",
      );
      await poll(async () => {
        try {
          const r = await fetchReport();
          return r.status === 200 && r.body.ok;
        } catch {
          return false;
        }
      }, "Report did not recover after enable");
      await settings();
      result.ui = {
        available: true,
        navigation: "More > Settings > Built-in plugins > Compatibility",
        tabCount: await evalx(
          `[...document.querySelectorAll('[role="tab"]')].filter(b=>b.innerText==='兼容性').length`,
        ),
        reenabled: true,
        httpRestored: true,
        scope:
          "Actual DOM report plus manager disable/re-enable and route removal/recovery; not a business-function certification.",
      };
      if (process.env.DSC_RC2_SCREENSHOT) {
        const s = await chrome.send("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          process.env.DSC_RC2_SCREENSHOT,
          Buffer.from(s.data, "base64"),
        );
      }
      await chrome.close();
      chrome = null;
    } else
      result.ui = {
        available: false,
        reason: "No Chrome binary; browser acceptance not performed.",
      };
    if (process.env.DSC_REQUIRE_RC2_UI === "1")
      requireTrue(
        result.ui.available,
        "Required real browser UI acceptance was not performed",
      );
    await stop(host);
    result.ok = true;
  }
} catch (error) {
  result = {
    ...result,
    ok: false,
    error: redact(error.stack || error.message),
  };
  process.exitCode = 1;
} finally {
  await cleanup();
}
result.cleanup = { privateRootRemoved: !fs.existsSync(root) };
if (process.env.DSC_RC2_LIVE_LOG)
  writeJSON(process.env.DSC_RC2_LIVE_LOG, result);
console.log(JSON.stringify(result, null, 2));
