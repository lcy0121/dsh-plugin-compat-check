#!/usr/bin/env node
/** Owned real-host acceptance: declaration gates, metadata, actual settings UI and reload. */
import fs from "node:fs";
import { failureDiagnostic, cleanupOwned } from "../lib/owned-process.mjs";
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
  submitUpgradeTarget,
  upgradeRequestReceipts,
  reportResponseReceipts,
  upgradeFormSnapshot,
} from "./browser-session.mjs";
import { run as check } from "../bin/compat-check.mjs";
import { TOOL_VERSION } from "../lib/version.mjs";
import { assertUpgradePreview } from "../lib/upgrade-contract.mjs";

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
let chrome,
  chromeStarting,
  result,
  commandCleanupFailure,
  upgradeFailureSnapshot;
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
  if (r.cleanup?.stopped === false)
    commandCleanupFailure = Object.assign(new Error(r.error), {
      diagnostics: r.diagnostics || [],
    });
  if (r.code !== 0)
    throw Object.assign(
      new Error(c + " failed: " + redact(r.error || r.output).slice(-900)),
      { diagnostics: r.diagnostics || [] },
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
  await cleanupOwned([
    () => {
      if (commandCleanupFailure) throw commandCleanupFailure;
    },
    () => browser?.close(),
    ...[...children].map((child) => () => stopOwnedChild(child)),
  ]);
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
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
      fs.copyFileSync(path.join(repo, file), path.join(source, file));
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
    // Public synthetic packages give the real browser fixed filter/finding cases.
    // They are scanned from this owned node_modules, never activated as bundles.
    for (const entry of fs.readdirSync(
      path.join(repo, "test/fixtures/labels"),
    )) {
      const source = path.join(repo, "test/fixtures/labels", entry);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(source, "package.json")),
      );
      const target = path.join(profile, "node_modules", manifest.name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.cpSync(source, target, { recursive: true });
    }
    const upgradeFixture = path.join(
      profile,
      "node_modules",
      "@rc2",
      "upgrade-risk",
    );
    fs.mkdirSync(upgradeFixture, { recursive: true });
    writeJSON(path.join(upgradeFixture, "package.json"), {
      name: "@rc2/upgrade-risk",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: {},
      engines: { dsh: "0.2.1-rc.2" },
      peerDependencies: { "@deepseek-ai/dsh": "0.2.1-rc.2" },
    });
    // A scanned, inactive package makes a positive prediction reproducible without
    // loading its code or changing any real user's profile.
    fs.writeFileSync(
      path.join(upgradeFixture, "index.js"),
      "export function apply(){}\n",
    );
    const futureProbeFile = path.join(root, "future-probe.json");
    const host = await boot("rc2-ui", { DSC_PROBE_REPORT: futureProbeFile });
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
    requireTrue(
      initial.body.issueReport.includes("--probe <probe-report.json>") &&
        initial.body.issueReport.includes("仅静态扫描可能给出不同结论"),
      "Installed runtime export lost its evidence requirements",
    );
    result.runtimeExportContext = true;
    result.httpReport = true;
    requireTrue(
      initial.body.report.catalog?.verified === true &&
        initial.body.report.catalog.referenceVersion === version &&
        initial.body.report.catalog.sha256 ===
          "90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743",
      "Installed report lost reviewed catalogue identity",
    );
    result.catalogIdentity = true;
    const sameOrigin = await fetch(reportUrl, {
      headers: { ...headers, Origin: reportUrl.origin },
      signal: AbortSignal.timeout(15000),
    });
    requireTrue(
      sameOrigin.status === 200,
      "Same-origin report request rejected",
    );
    await sameOrigin.arrayBuffer();
    const wrongPort = new URL(reportUrl);
    wrongPort.port = String(
      Number(reportUrl.port) === 65535 ? 65534 : Number(reportUrl.port) + 1,
    );
    const crossOrigin = await fetch(reportUrl, {
      headers: { ...headers, Origin: wrongPort.origin },
      signal: AbortSignal.timeout(15000),
    });
    const forbiddenBody = await crossOrigin.text();
    requireTrue(
      crossOrigin.status === 403 && !forbiddenBody.includes("nodeModules"),
      "Cross-port origin can read the report",
    );
    result.originFence = {
      sameOriginStatus: sameOrigin.status,
      crossPortStatus: crossOrigin.status,
    };
    const upgradeUrl = new URL(
      "/plugin-compat-check/upgrade-preview",
      host.url,
    );
    upgradeUrl.searchParams.set("targetVersion", "0.2.0-rc.2");
    upgradeUrl.searchParams.set("currentVersion", version);
    const fetchUpgrade = async (url = upgradeUrl, options = {}) => {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(30000),
        ...options,
      });
      return { status: response.status, body: await response.json() };
    };
    const baselineDir = path.join(env.DSH_HOME, "dsh-plugin-compat-check");
    const stateFiles = () =>
      fs.existsSync(baselineDir)
        ? fs
            .readdirSync(baselineDir)
            .sort()
            .map((name) => [
              name,
              crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.join(baselineDir, name)))
                .digest("hex"),
            ])
        : [];
    const stateBeforeUpgrade = stateFiles();
    const upgrade = await fetchUpgrade();
    requireTrue(
      upgrade.status === 200 && upgrade.body.ok,
      "Installed upgrade preview failed: " + JSON.stringify(upgrade.body),
    );
    assertUpgradePreview(upgrade.body);
    requireTrue(
      upgrade.body.currentVersion === version &&
        upgrade.body.targetVersion === "0.2.0-rc.2" &&
        upgrade.body.changes.added.some(
          (x) =>
            x.plugin === "@rc2/upgrade-risk" &&
            x.finding.category === "declared-incompatible",
        ) &&
        upgrade.body.exitCode > 0,
      "Installed preview lost its positive declaration-risk case",
    );
    requireTrue(
      [upgrade.body.currentReport, upgrade.body.targetReport].every(
        (r) =>
          r.observation.mode === "catalogue" &&
          r.observation.usable === false &&
          r.observation.bound === false,
      ) &&
        upgrade.body.baseline === null &&
        upgrade.body.cache === null &&
        JSON.stringify(stateBeforeUpgrade) === JSON.stringify(stateFiles()),
      "Upgrade preview reused runtime evidence or changed ordinary state",
    );
    const installedKernel = path.join(
      profile,
      "node_modules",
      "dsh-plugin-compat-check",
      "kernel",
    );
    for (const side of ["current", "target"]) {
      const catalog = upgrade.body.catalogs[side];
      requireTrue(
        catalog.sha256 ===
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(installedKernel, catalog.file)))
            .digest("hex") &&
          Boolean(catalog.source.host && catalog.source.client),
        "Upgrade catalogue identity differs from the installed artifact",
      );
    }
    requireTrue(
      /^[a-f0-9]{64}$/.test(upgrade.body.artifact.sha256) &&
        upgrade.body.artifact.packages.some(
          (p) =>
            p.name === "@rc2/upgrade-risk" && /^[a-f0-9]{64}$/.test(p.sha256),
        ),
      "Upgrade preview lost installed input identities",
    );
    const sameOriginUpgrade = await fetchUpgrade(upgradeUrl, {
      headers: { ...headers, Origin: upgradeUrl.origin },
    });
    const crossOriginUpgrade = await fetchUpgrade(upgradeUrl, {
      headers: { ...headers, Origin: wrongPort.origin },
    });
    const methodUpgrade = await fetchUpgrade(upgradeUrl, { method: "POST" });
    const unknownUpgradeUrl = new URL(upgradeUrl);
    unknownUpgradeUrl.searchParams.set("targetVersion", "9.9.9");
    const unknownUpgrade = await fetchUpgrade(unknownUpgradeUrl);
    requireTrue(
      sameOriginUpgrade.status === 200 &&
        sameOriginUpgrade.body.ok &&
        crossOriginUpgrade.status === 403 &&
        !JSON.stringify(crossOriginUpgrade.body).includes("nodeModules") &&
        methodUpgrade.status === 405,
      "Installed upgrade route origin/method fence failed",
    );
    assertUpgradePreview(unknownUpgrade.body);
    requireTrue(
      unknownUpgrade.status === 200 &&
        unknownUpgrade.body.ok === false &&
        unknownUpgrade.body.status === "unsupported-version" &&
        unknownUpgrade.body.exitCode === 3 &&
        unknownUpgrade.body.currentReport === null &&
        unknownUpgrade.body.targetReport === null &&
        unknownUpgrade.body.error.includes("未认证"),
      "Unknown upgrade target was presented as a clean comparison",
    );
    result.upgradePreview = {
      installedArtifact: true,
      positiveNewRisk: true,
      staticEvidenceOnly: true,
      inputAndCatalogIdentities: true,
      ordinaryStateUnchanged: true,
      sameOriginStatus: sameOriginUpgrade.status,
      crossPortStatus: crossOriginUpgrade.status,
      wrongMethodStatus: methodUpgrade.status,
      unknownTargetUncertified: true,
      artifactSha256: upgrade.body.artifact.sha256,
      catalogSha256: Object.fromEntries(
        Object.entries(upgrade.body.catalogs).map(([side, item]) => [
          side,
          item.sha256,
        ]),
      ),
    };
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
      await chrome.send("Network.enable");
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
      requireTrue(
        await evalx(
          `document.querySelector('[data-catalog-status="verified"]')?.innerText.includes('90b4ae484ebc6660c53e5c9ad14ba657581534b30e8222c636c759e19587f743') && document.body.innerText.includes('目录认证范围：0.2.1-rc.2')`,
        ),
        "Actual DOM lacks catalogue digest and certification scope",
      );
      result.catalogUiIdentity = true;
      const explanationText = await evalx("document.body.innerText");
      requireTrue(
        explanationText.includes(
          "确定（certain）可由明确静态事实或合格运行时观测支持",
        ) &&
          explanationText.includes("推断（inferred）不等于业务影响已实测") &&
          explanationText.includes("证据覆盖：") &&
          !explanationText.includes("没有用过任何 DSH 服务"),
        "Actual compatibility DOM lost evidence explanations or coverage",
      );
      const rowNames = () =>
        evalx(
          `Array.from(document.querySelectorAll('[data-compat-plugin]')).map(e=>e.dataset.compatPlugin)`,
        );
      const field = (label) =>
        `document.querySelector('[aria-label="${label}"]')`;
      const selectFilter = async (label, value) => {
        await evalx(
          `(()=>{const e=${field(label)};e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`,
        );
      };
      await evalx(`${field("搜索插件")}.focus()`);
      await chrome.send("Input.insertText", { text: "broken" });
      await poll(
        async () => (await rowNames()).length === 2,
        "Panel search failed",
      );
      requireTrue(
        initial.body.report.plugins["@label/broken-service"].findings.some(
          (f) =>
            f.category === "host-service-missing" &&
            f.evidence?.status === "absent",
        ),
        "Real host prerequisite fixture lacks explicit absent evidence",
      );
      await selectFilter("按结论筛选", "broken");
      await poll(
        async () =>
          JSON.stringify(await rowNames()) ===
          JSON.stringify(["@label/broken-client", "@label/broken-service"]),
        "Panel verdict filter failed",
      );
      await selectFilter("按确定性筛选", "suspected");
      await poll(
        async () => (await rowNames()).length === 0,
        "Combined certainty filter failed",
      );
      await selectFilter("按确定性筛选", "certain");
      requireTrue(
        initial.body.report.plugins["@label/broken-service"].coverage.status ===
          "complete",
        "Observed absent service fixture must have complete API evidence, without certifying business behavior",
      );
      await selectFilter("按验证状态筛选", "pending");
      await poll(
        async () =>
          JSON.stringify(await rowNames()) ===
          JSON.stringify(["@label/broken-client"]),
        "Pending filter failed",
      );
      await evalx(
        `Array.from(document.querySelectorAll('[data-compat-plugin] summary')).find(e=>e.innerText.startsWith('查看')).click()`,
      );
      await poll(
        () =>
          evalx(
            `document.body.innerText.includes('下一步核实')&&document.body.innerText.includes('实际安装制品')`,
          ),
        "Finding guidance not visible after expansion",
      );
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='预览故障报告').click()`,
      );
      const preview = await poll(
        () => evalx(`${field("故障报告预览")}?.value`),
        "Issue preview missing",
      );
      requireTrue(
        preview === initial.body.issueReport &&
          preview.includes("@label/healthy"),
        "Panel export differs from the full canonical report",
      );
      await chrome.send("Browser.grantPermissions", {
        origin: new URL(host.url).origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='复制报告').click()`,
      );
      await poll(
        () => evalx(`document.body.innerText.includes('已复制')`),
        "Explicit clipboard copy failed",
      );
      const clipboard = await evalx("navigator.clipboard.readText()");
      requireTrue(clipboard === preview, "Clipboard lost full preview content");
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='关闭报告预览').click()`,
      );
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='本次新增风险').click()`,
      );
      await poll(
        () =>
          evalx(
            `document.body.innerText.includes('尚无可比较基线')&&document.body.innerText.includes('不表示没有风险')`,
          ),
        "Absent baseline shown as clean result",
      );
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='清除筛选').click()`,
      );
      await poll(
        async () => (await rowNames()).length === 6,
        "Clearing filters did not restore full report",
      );
      result.panelExperience = {
        realBrowser: true,
        syntheticCases: 5,
        searchAndCombinedFilters: true,
        expandedGuidance: true,
        fullReportPreview: true,
        explicitClipboardCopy: true,
        absentBaselineNeutral: true,
        clearFilters: true,
        scope:
          "Actual installed candidate with five scanned, inactive public synthetic packages; comparable baseline branches are covered by component tests. No business certification.",
      };
      await evalx(`${field("搜索插件")}.focus()`);
      await chrome.send("Input.insertText", { text: "healthy" });
      await poll(
        async () =>
          JSON.stringify(await rowNames()) ===
          JSON.stringify(["@label/healthy"]),
        "Pre-upgrade ordinary filter failed",
      );
      await evalx(
        `document.querySelector('[data-upgrade-preview] > summary').click()`,
      );
      await poll(
        () => evalx(`Boolean(${field("目标 DSH 版本")})`),
        "Upgrade target input missing",
      );
      const enterTarget = async (target) => {
        const cursor = chrome.events.length;
        upgradeFailureSnapshot = async () => ({
          target,
          form: await evalx(upgradeFormSnapshot),
          requests: upgradeRequestReceipts(chrome.events, cursor),
          reports: await reportResponseReceipts(chrome),
        });
        await submitUpgradeTarget(chrome, evalx, poll, target);
      };
      await enterTarget("0.2.0-rc.2");
      await poll(
        () =>
          evalx(
            `Boolean(document.querySelector('[data-upgrade-result="compared"]'))`,
          ),
        "Actual upgrade result did not render",
        40000,
      );
      const comparedRequests = (await upgradeFailureSnapshot()).requests;
      const upgradeDom = await evalx(
        `document.querySelector('[data-upgrade-result="compared"]').innerText`,
      );
      requireTrue(
        upgradeDom.includes("@rc2/upgrade-risk") &&
          upgradeDom.includes("declared-incompatible") &&
          upgradeDom.includes("新增") &&
          upgradeDom.includes("0.2.1-rc.2 → 0.2.0-rc.2"),
        "Actual DOM lost predicted new-risk details",
      );
      await evalx(
        `Array.from(document.querySelectorAll('[data-upgrade-result="compared"] summary')).find(e=>e.innerText==='查看输入制品、目录来源与预测限制').click()`,
      );
      const provenanceDom = await evalx(
        `document.querySelector('[data-upgrade-result="compared"]').innerText`,
      );
      requireTrue(
        provenanceDom.includes(upgrade.body.artifact.sha256) &&
          Object.values(upgrade.body.catalogs).every(
            (c) =>
              provenanceDom.includes(c.sha256) &&
              provenanceDom.includes(c.source.host) &&
              provenanceDom.includes(c.source.client),
          ) &&
          provenanceDom.includes("未认证未来环境或业务通过") &&
          JSON.stringify(await rowNames()) ===
            JSON.stringify(["@label/healthy"]) &&
          (await evalx(`${field("搜索插件")}.value==='healthy'`)),
        "Actual upgrade provenance or ordinary filter isolation failed",
      );
      await enterTarget("9.9.9");
      await poll(
        () =>
          evalx(
            `document.querySelector('[data-upgrade-preview]').innerText.includes('版本未认证')`,
          ),
        "Unknown version UI was not uncertified",
      );
      const unknownDom = await evalx(
        `document.querySelector('[data-upgrade-preview]').innerText`,
      );
      requireTrue(
        !(await evalx(
          `Boolean(document.querySelector('[data-upgrade-result="compared"]'))`,
        )) &&
          !/新增 0|没有发现新增|业务通过。/.test(unknownDom) &&
          JSON.stringify(await rowNames()) ===
            JSON.stringify(["@label/healthy"]),
        "Unknown version retained a stale clean comparison or reset ordinary rows",
      );
      result.upgradePreview.ui = {
        realBrowser: true,
        positiveNewRisk: true,
        sourceIdentitiesVisible: true,
        staticLimitationsVisible: true,
        unknownTargetUncertified: true,
        ordinaryRowsAndFiltersUnchanged: true,
        requests: [
          ...comparedRequests,
          ...(await upgradeFailureSnapshot()).requests,
        ],
      };
      upgradeFailureSnapshot = undefined;
      await evalx(
        `Array.from(document.querySelectorAll('button')).find(e=>e.innerText==='清除筛选').click()`,
      );
      await poll(
        async () => (await rowNames()).length === 6,
        "Post-upgrade full ordinary report changed",
      );
      result.explanationPresentation = {
        realBrowser: true,
        certaintyAndImpactSeparated: true,
        perPluginCoverageVisible: true,
        noServiceUseClaimRemoved: true,
        scope:
          "Actual installed artifact overview; fixed-case overview/details are also exercised by component tests. Not business certification.",
      };
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
      await poll(async () => {
        try {
          const response = await fetch(upgradeUrl, {
            headers,
            signal: AbortSignal.timeout(2000),
          });
          return (
            response.status === 404 ||
            (response.status === 200 &&
              !response.headers
                .get("content-type")
                ?.includes("application/json"))
          );
        } catch {
          return false;
        }
      }, "Upgrade route survived disable");
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
      await poll(
        async () => {
          try {
            const restored = await fetchUpgrade();
            return (
              restored.status === 200 &&
              restored.body.ok &&
              restored.body.changes.added.some(
                (x) =>
                  x.plugin === "@rc2/upgrade-risk" &&
                  x.finding.category === "declared-incompatible",
              )
            );
          } catch {
            return false;
          }
        },
        "Upgrade route did not recover after enable",
        40000,
      );
      result.upgradePreview.routeRemovedAndRestored = true;
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
      // The candidate initially samples the live host. Only this owned file is
      // then introduced; rejecting it must also reject its fabricated loader row.
      writeJSON(futureProbeFile, {
        observationVersion: 1,
        profileId: path.join(profile, "node_modules"),
        dshVersion: version,
        probedAt: "2100-01-01T00:00:00Z",
        root: { settings: { present: false } },
        entries: {
          plugins: [
            { packageName: "@label/healthy", state: "FAILED", disabled: false },
          ],
        },
      });
      try {
        const rejected = await fetchReport();
        requireTrue(
          rejected.body.ok &&
            rejected.body.report.observation.usable === false &&
            rejected.body.report.observation.mode === "catalogue" &&
            rejected.body.report.observation.notes.some((n) =>
              n.includes("未来时钟偏差"),
            ) &&
            !rejected.body.report.plugins["@label/healthy"].findings.some(
              (f) => f.category === "host-entry-inactive",
            ),
          "Installed candidate trusted the future probe or its loader failure",
        );
        await evalx(
          `[...document.querySelectorAll('button')].find(b=>b.innerText==='重新检查').click()`,
        );
        await poll(
          () => evalx(`document.body.textContent.includes('未来时钟偏差')`),
          "Panel lost future rejection reason",
        );
        await evalx(
          `[...document.querySelectorAll('summary')].find(e=>e.innerText==='查看采样与检查信息').parentElement.open=true`,
        );
        requireTrue(
          await evalx(`document.body.innerText.includes('未来时钟偏差')`),
          "Future reason is not visible in sampling details",
        );
        result.futureProbe = {
          installedArtifact: true,
          httpRejected: true,
          probeLoaderEvidenceRejected: true,
          realBrowserReasonVisible: true,
        };
      } finally {
        fs.rmSync(futureProbeFile, { force: true });
      }
      const recovered = await fetchReport();
      requireTrue(
        recovered.body.ok && recovered.body.report.observation.usable === true,
        "Live host sampling did not recover after removing the invalid probe",
      );
      await evalx(
        `[...document.querySelectorAll('button')].find(b=>b.innerText==='重新检查').click()`,
      );
      await poll(
        () => evalx(`!document.body.textContent.includes('未来时钟偏差')`),
        "Panel retained stale future rejection after a valid refresh",
      );
      result.futureProbe.validRefreshRecovered = true;
      // Mutate an inactive synthetic installed package, then rely only on the
      // ordinary background cache/watch and client polling, never force refresh.
      await selectFilter("按结论筛选", "broken");
      await evalx(`${field("搜索插件")}.focus();${field("搜索插件")}.select()`);
      await chrome.send("Input.insertText", { text: "healthy" });
      await poll(
        async () => (await rowNames()).length === 0,
        "Initial healthy package unexpectedly matches broken filter",
      );
      const cacheFixtureMeta = path.join(
        profile,
        "node_modules/@label/healthy/package.json",
      );
      const originalCacheFixture = fs.readFileSync(cacheFixtureMeta);
      try {
        const modified = JSON.parse(originalCacheFixture);
        modified.dsh = { ...modified.dsh, client: { platform: "web" } };
        modified.exports = {
          ...modified.exports,
          "./client": "./lib/cache-missing.js",
        };
        writeJSON(cacheFixtureMeta, modified);
        await poll(
          async () =>
            JSON.stringify(await rowNames()) ===
            JSON.stringify(["@label/healthy"]),
          "Installed manifest change did not invalidate ordinary cache and update the panel",
          40000,
        );
        requireTrue(
          await evalx(
            `${field("搜索插件")}.value==='healthy'&&${field("按结论筛选")}.value==='broken'`,
          ),
          "Background report update reset the user's filters",
        );
        result.cacheInvalidation = {
          installedArtifact: true,
          realBrowser: true,
          manifestChangeObserved: true,
          backgroundReportUpdated: true,
          filtersPreserved: true,
        };
      } finally {
        fs.writeFileSync(cacheFixtureMeta, originalCacheFixture);
      }
      await poll(
        async () => (await rowNames()).length === 0,
        "Restored installed package did not clear the stale broken row",
        40000,
      );
      result.cacheInvalidation.validChangeRecovered = true;
      await evalx(
        `[...document.querySelectorAll('button')].find(b=>b.innerText==='清除筛选').click()`,
      );
      // Exercise the installed candidate's additive workflows through real Chrome.
      const ordinaryUrl = new URL("/plugin-compat-check/report", host.url);
      const ordinary = async () =>
        (
          await fetch(ordinaryUrl, {
            headers,
            signal: AbortSignal.timeout(15000),
          })
        ).json();
      const beforeReview = await ordinary();
      requireTrue(
        beforeReview.report.dependencyGraph?.kind ===
          "plugin-compat-check/dependency-graph",
        "Installed report lacks dependency graph",
      );
      requireTrue(
        await evalx(
          `Boolean(document.querySelector('[aria-label="依赖关系与潜在影响"] table'))`,
        ),
        "Dependency view did not render in actual Chrome",
      );
      await poll(
        () =>
          evalx(
            `Boolean(document.querySelector('[data-review-finding] textarea'))`,
          ),
        "Manual review editor unavailable",
      );
      const baselineBeforeReview = stateFiles().filter(
        ([name]) => !name.startsWith("reviews."),
      );
      const reviewNote =
        "Owned real Chrome review; ordinary findings remain unchanged.";
      await evalx(
        `(()=>{const row=document.querySelector('[data-review-finding]'); const select=row.querySelector('select'); select.value='reviewed'; select.dispatchEvent(new Event('change',{bubbles:true}));row.querySelector('textarea').focus();})()`,
      );
      await chrome.send("Input.insertText", { text: reviewNote });
      await evalx(
        `document.querySelector('[data-review-finding] button').click()`,
      );
      await poll(
        async () =>
          (await ordinary()).reviews?.items.some(
            (x) => x.status === "reviewed" && x.note === reviewNote,
          ),
        "Manual review did not persist from actual UI",
      );
      const afterReview = await ordinary();
      requireTrue(
        JSON.stringify(beforeReview.report) ===
          JSON.stringify(afterReview.report),
        "Manual action changed ordinary report",
      );
      requireTrue(
        JSON.stringify(baselineBeforeReview) ===
          JSON.stringify(
            stateFiles().filter(([name]) => !name.startsWith("reviews.")),
          ),
        "Manual action changed baseline state",
      );
      result.p2Workflows = {
        realBrowser: true,
        dependencyView: true,
        manualReviewPersisted: true,
        ordinaryReportUnchanged: true,
        baselineUnchanged: true,
        healthImportAvailable: await evalx(
          `Boolean(document.querySelector('[aria-label="导入功能健康检查记录"]'))`,
        ),
      };
      if (process.env.DSC_HEALTH_IMPORT_RECORD) {
        const importPath = path.resolve(process.env.DSC_HEALTH_IMPORT_RECORD),
          record = JSON.parse(fs.readFileSync(importPath, "utf8"));
        const doc = await chrome.send("DOM.getDocument", { depth: -1 });
        const input = await chrome.send("DOM.querySelector", {
          nodeId: doc.root.nodeId,
          selector: '[aria-label="导入功能健康检查记录"]',
        });
        await chrome.send("DOM.setFileInputFiles", {
          nodeId: input.nodeId,
          files: [importPath],
        });
        await poll(
          () =>
            evalx(
              `Boolean(document.querySelector('[data-functional-health="tested-pass"]'))`,
            ),
          "Real health evidence did not import",
        );
        requireTrue(
          await evalx(
            `document.body.innerText.includes(${JSON.stringify(record.identity.artifact.sha256)}) && document.body.innerText.includes('不用于认证当前目标')`,
          ),
          "Imported evidence lost historical/artifact boundary",
        );
        requireTrue(
          JSON.stringify(afterReview.report) ===
            JSON.stringify((await ordinary()).report),
          "Health import changed compatibility report",
        );
        result.p2Workflows.importedHealth = {
          artifact: record.identity.artifact,
          manifestSha256: record.identity.manifestSha256,
          historicalOnly: true,
          ordinaryReportUnchanged: true,
        };
      }
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
  const upgradeUI = await upgradeFailureSnapshot?.().catch(() => ({
    unavailable: true,
  }));
  result = {
    ...result,
    ...(upgradeUI ? { upgradeUI } : {}),
    ok: false,
    error: redact(error.stack || error.message),
    diagnostics: failureDiagnostic(error),
  };
  process.exitCode = 1;
} finally {
  try {
    await cleanup();
  } catch (error) {
    result = {
      ...result,
      ok: false,
      error: [result?.error, error.message].filter(Boolean).join("; "),
      diagnostics: [
        ...(result?.diagnostics || []),
        ...failureDiagnostic(error),
      ],
    };
    process.exitCode = 1;
  }
}
result.cleanup = {
  privateRootRemoved: !fs.existsSync(root),
  ...(fs.existsSync(root) ? { workDir: root } : {}),
};
if (process.env.DSC_RC2_LIVE_LOG)
  writeJSON(process.env.DSC_RC2_LIVE_LOG, result);
console.log(JSON.stringify(result, null, 2));
