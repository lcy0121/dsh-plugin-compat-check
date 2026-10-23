/** Pinned real-plugin business actions. Browser transport faults never enter
 * source predictions. All state, profiles, child groups and browser are owned.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";
import {
  configureChineseBrowser,
  disableCredentialOnboarding,
  navigateOwnedDocument,
} from "./browser-session.mjs";
import { cleanupOwned, combineFailure } from "../lib/owned-process.mjs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { command, stopOwnedChild } from "../lib/probe-runner.mjs";
import { launchChromePipe } from "../lib/debugger.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { featurePredictions, scoreBusiness } from "./business-metrics.mjs";
import {
  marketCases,
  marketPhases,
  marketNavigationStep,
} from "./business-market.mjs";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceHashes = {
  "package.json":
    "bdad145d54f257db7a814df0bb4b7feb3ce82fd3d18b9aa57a0402e9e88b9a47",
  "lib/routes.js":
    "84bf6a9fd2acb24893a4cd81f577b413cf540ac166f2fc0572c408a2874ca48e",
  "lib/hot.js":
    "e0a8d32d02b400e02a90c97ef31895b96a4d22f773d7b3bb78f7def13eca1b0f",
  "client/client.js":
    "e40be7d4bbbc1b1380f5fb6d1817f2a2092ab59713bcc011b3e86d2f238d5bdf",
};
const span = (file, start, end) => ({ file, start, end });
// Hand-audited published 1.66.37 call paths, not a whole-plugin verdict proxy.
const marketFeatures = [
  {
    id: "market.note",
    plugin: "dshmarket",
    spans: [
      span("client/client.js", 10398, 10416),
      span("lib/routes.js", 3113, 3153),
      span("lib/routes.js", 1871, 1884),
      span("lib/hot.js", 310, 445),
    ],
  },
  {
    id: "market.favorite",
    plugin: "dshmarket",
    spans: [
      span("client/client.js", 10417, 10467),
      span("lib/routes.js", 3154, 3206),
      span("lib/routes.js", 1871, 1884),
      span("lib/hot.js", 310, 445),
    ],
  },
];
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export function packageFingerprint(root) {
  const files = [];
  function walk(dir, rel = "") {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const r = rel ? rel + "/" + e.name : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), r);
      else if (e.isFile()) files.push(r);
      else throw Error("Business artifact must contain regular files only");
    }
  }
  walk(root);
  files.sort();
  return {
    files: files.length,
    digest: hash(
      files
        .map((f) => f + ":" + hash(fs.readFileSync(path.join(root, f))))
        .join("\n"),
    ),
  };
}
export function completedResponse(rows, finished, failed, route, start) {
  const match = rows
    .slice(start)
    .find((r) => r.method === "POST" && r.path === route);
  if (match && failed.has(match.requestId))
    throw Error("Business request transport did not finish");
  return match && finished.has(match.requestId) ? match : null;
}
export { loadedNavigation } from "./browser-session.mjs";
export async function runBusiness({
  outDir,
  suite = "market",
  modelProfile,
  observeServices = false,
} = {}) {
  if (
    ![
      "market",
      "sidebar",
      "sidebar-ui",
      "sidebar-ui-previous",
      "sidebar-model",
      "holdout-pomodoro",
      "holdout-todo",
    ].includes(suite)
  )
    throw Error("Unknown business suite: " + suite);
  if (Boolean(modelProfile) !== (suite === "sidebar-model"))
    throw Error("--model-profile is required only for sidebar-model");
  if (
    observeServices &&
    ![
      "sidebar-ui",
      "sidebar-ui-previous",
      "holdout-pomodoro",
      "holdout-todo",
    ].includes(suite)
  )
    throw Error("Service observation requires a supported live suite");
  const holdout = suite.startsWith("holdout-")
    ? await import("./business-holdout.mjs")
    : null;
  const observer = observeServices
    ? await import("./business-observation.mjs")
    : null;
  const model =
    suite === "sidebar-model" ? await import("./business-model.mjs") : null;
  const sidebar = suite.startsWith("sidebar")
    ? await import("./business-sidebar.mjs")
    : null;
  const editor = suite.startsWith("sidebar-ui")
    ? await import("./business-sidebar-ui.mjs")
    : null;
  const features = holdout
    ? holdout.holdoutFeatures(suite)
    : model
      ? model.modelFeatures
      : editor
        ? suite === "sidebar-ui-previous"
          ? editor.previousEditorFeatures
          : editor.editorFeatures
        : sidebar
          ? sidebar.sidebarFeatures
          : marketFeatures;
  const pin = (holdout
    ? holdout.holdoutPin(suite)
    : model
      ? model.modelPin
      : editor
        ? suite === "sidebar-ui-previous"
          ? editor.previousSidebarPin
          : editor.editorPin
        : sidebar?.sidebarPin) || {
    package: "dshmarket",
    version: "1.66.37",
    files: 182,
    digest: "a26339e13c9adcff506c1d0c00842d0e6cf104226c5a1954a5e091c40dd6f583",
    sourceHashes,
    publishedTarballSha256:
      "8b29d156e3ea45330623b4cd66736992456f5ef4c92c8fb00243ccc3b101f188",
    publishedIntegrity:
      "sha512-6sr+x6W6PppAtygJra/khU1ehK8bmjmfVnFgmPyHixx3GzIXGX/iW04CoeqlExFpsyTWXnM2W/X7JLU78dHJLA==",
  };
  if (outDir) {
    outDir = path.resolve(outDir);
    fs.mkdirSync(outDir, { recursive: true });
    if (fs.readdirSync(outDir).length)
      throw Error("Business evidence directory must be empty");
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-business-live-")),
    home = path.join(root, "home"),
    profile = path.join(home, "profiles/business"),
    nm = path.join(profile, "node_modules");
  const env = {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: path.join(root, "agents"),
    npm_config_cache: path.join(root, "npm-cache"),
    npm_config_store_dir: path.join(root, "pnpm-store"),
  };
  for (const key of Object.keys(env))
    if (
      key.startsWith("DSC_") ||
      key.startsWith("DSHM_") ||
      [
        "DSH_VERSION",
        "DSH_PROFILE",
        "DSH_PROFILE_DIR",
        "DSH_ACTIVE_PROFILE",
        "DSH_PROFILE_NAME",
      ].includes(key)
    )
      delete env[key];
  const cancellation = new AbortController(),
    commands = new Set();
  let hostOutput = "";
  let host,
    chrome,
    chromeStarting,
    server,
    processing = null,
    faultRoute = null,
    eventCursor = 0,
    tick,
    result,
    predictions,
    labels,
    servicePredictions,
    serviceSurface,
    serviceSealed,
    serviceArtifact,
    serviceIdentity;
  const finishedRequests = new Set(),
    failedRequests = new Set();
  let cleanupPromise, primaryFailure, commandCleanupFailure;
  const pendingFaults = new Set(),
    requests = new Map(),
    responses = [];
  const exec = async (c, a) => {
    const p = command(c, a, {
      env,
      timeoutMs: 150000,
      signal: cancellation.signal,
    });
    commands.add(p);
    let r;
    try {
      r = await p;
    } finally {
      commands.delete(p);
    }
    if (r.cleanup?.stopped === false)
      commandCleanupFailure = Object.assign(new Error(r.error), {
        diagnostics: r.diagnostics || [],
      });
    if (r.code !== 0)
      throw Object.assign(
        Error(
          c +
            " failed: " +
            (r.error || r.output).slice(-900).replaceAll(root, "<private>"),
        ),
        { diagnostics: r.diagnostics || [] },
      );
    return r.output;
  };
  function cleanup() {
    return (cleanupPromise ||= (async () => {
      cancellation.abort();
      clearInterval(tick);
      await Promise.allSettled([...commands]);
      await processing?.catch(() => {});
      const browser = chrome || (await chromeStarting?.catch(() => null));
      await cleanupOwned([
        () => {
          if (commandCleanupFailure) throw commandCleanupFailure;
        },
        () => browser?.close(),
        () => stopOwnedChild(host),
        () =>
          server
            ? new Promise((resolve) => {
                server.closeAllConnections();
                server.close(resolve);
              })
            : undefined,
      ]);
      fs.rmSync(root, { recursive: true, force: true });
    })());
  }
  const interrupt = async () => {
    await cleanup();
    process.exit(130);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    fs.mkdirSync(home, { mode: 0o700 });
    const version = (await exec("dsh", ["--version"]))
      .trim()
      .split("\n")
      .at(-1);
    if (version !== "0.2.1-rc.2")
      return {
        applicable: false,
        dshVersion: version,
        reason:
          "Pinned business cohort is only certified for0.2.1-rc.2; no legacy business certification.",
      };
    await exec("dsh", [
      "--profile",
      "business",
      "--from-default-profile",
      "web",
      "--dump-config",
    ]);
    disableCredentialOnboarding(profile);
    const modelContext = model
      ? model.prepareModelProfile(path.resolve(modelProfile), home, profile)
      : null;
    await exec("dsh", [
      "plugin",
      "--profile",
      "business",
      "add",
      pin.package + "@" + pin.version,
      ...(sidebar || holdout ? [] : ["dsh-plugin-compat-check@0.1.2"]),
    ]);
    const workspace = path.join(profile, "business-workspace");
    if (sidebar || holdout) fs.mkdirSync(workspace, { recursive: true });
    const fixtureSource = sidebar
      ? sidebar.installSidebarFixture(
          profile,
          workspace,
          Boolean(editor || model),
          modelContext
            ? {
                provider: modelContext.provider,
                model: modelContext.model,
                reasoningEffort: modelContext.reasoningEffort,
              }
            : null,
        )
      : null;
    const pkg = path.join(nm, pin.package);
    for (const [file, digest] of Object.entries(pin.sourceHashes))
      if (hash(fs.readFileSync(path.join(pkg, file))) !== digest)
        throw Error("Pinned business source bytes changed: " + file);
    const fingerprint = packageFingerprint(pkg);
    if (fingerprint.files !== pin.files || fingerprint.digest !== pin.digest)
      throw Error("Full pinned business artifact bytes changed");
    const artifact = {
      suite,
      ...(modelContext ? { modelContext } : {}),
      package: pin.package,
      version: pin.version,
      sourceHashes: pin.sourceHashes,
      packageFingerprint: fingerprint,
      publishedTarballSha256: pin.publishedTarballSha256,
      publishedIntegrity: pin.publishedIntegrity,
      ...(holdout
        ? {
            holdoutSelection:
              "Previously untuned family; fixed actions and expectations before first live run",
            ruleTuning: false,
          }
        : sidebar
          ? { fixtureSourceHash: hash(fixtureSource) }
          : {
              seedPackage: "dsh-plugin-compat-check@0.1.2",
              seedManifestHash: hash(
                fs.readFileSync(
                  path.join(nm, "dsh-plugin-compat-check/package.json"),
                ),
              ),
            }),
      predictorSources: Object.fromEntries(
        [
          ...fs
            .readdirSync(path.join(REPO, "lib"))
            .filter((f) => f.endsWith(".mjs"))
            .sort()
            .map((f) => "lib/" + f),
          "bin/compat-check.mjs",
          "tools/business-metrics.mjs",
        ].map((f) => [f, hash(fs.readFileSync(path.join(REPO, f)))]),
      ),
      harnessSources: Object.fromEntries(
        [
          "tools/business-live.mjs",
          "tools/browser-session.mjs",
          ...(holdout
            ? ["tools/business-holdout.mjs", "tools/business-observation.mjs"]
            : sidebar
              ? [
                  "tools/business-sidebar.mjs",
                  ...(editor || model ? ["tools/business-sidebar-ui.mjs"] : []),
                  ...(model ? ["tools/business-model.mjs"] : []),
                  ...(observer ? ["tools/business-observation.mjs"] : []),
                ]
              : ["tools/business-market.mjs"]),
        ].map((f) => [f, hash(fs.readFileSync(path.join(REPO, f)))]),
      ),
      rulesHash: hash(fs.readFileSync(path.join(REPO, "rules/severity.json"))),
      catalogueHash: hash(
        fs.readFileSync(
          path.join(REPO, "rules/dsh-api-catalog-0.2.1-rc.2.json"),
        ),
      ),
    };
    const predicted = run({
      nm,
      dshVersion: version,
      baseline: false,
      _ignoreAutoProbe: true,
    });
    if (predicted.error)
      throw Error("Business prediction failed: " + predicted.error);
    const serviceObserver = observer
      ? observer.installServiceObserver(
          profile,
          predicted.extract.report.perPlugin[pin.package].services,
        )
      : null;
    if (serviceObserver)
      artifact.serviceObserverSourceHash = hash(serviceObserver.source);
    const canonical = toJSON(predicted),
      identity = {
        sampleId: crypto.randomUUID(),
        suiteId: holdout
          ? pin.suiteId
          : pin.package +
            "-" +
            pin.version +
            (model
              ? "-sidechat-actions-v1"
              : editor
                ? "-editor-actions-v1"
                : sidebar
                  ? "-actions-v1"
                  : "-actions-v2"),
        artifactDigest: hash(JSON.stringify(artifact)),
        dshVersion: version,
        toolVersion: canonical.toolVersion,
      };
    predictions = featurePredictions(canonical, features, identity);
    predictions.casePlan = holdout
      ? pin.cases.map(({ caseId, featureId, control }) => ({
          caseId,
          featureId,
          control,
        }))
      : suite === "sidebar-ui-previous"
        ? features.map((f) => ({
            caseId: f.id + ".healthy",
            featureId: f.id,
            control: "none",
          }))
        : model
          ? ["reply", "followup"].map((id) => ({
              caseId: "sidebar.sidechat." + id,
              featureId: "sidebar.sidechat.reply",
              control: "none",
            }))
          : features.flatMap((f) =>
              sidebar
                ? [
                    {
                      caseId: f.id + ".healthy",
                      featureId: f.id,
                      control: "none",
                    },
                    {
                      caseId: f.id + ".blocked",
                      featureId: f.id,
                      control: "http-503",
                    },
                    {
                      caseId: f.id + ".recovered",
                      featureId: f.id,
                      control: "none",
                    },
                  ]
                : marketPhases.map((p) => ({
                    caseId: f.id + "." + p.id,
                    featureId: f.id,
                    control: p.control,
                  })),
            );
    const sealed = JSON.stringify(predictions);
    fs.writeFileSync(path.join(root, "predictions.json"), sealed);
    // No host, browser, executed mutation/fault or gold observations existed when sealed.
    const entry = {
      name: "dsh-plugin-compat-check#plugin",
      owner: "lcy0121",
      url: "https://github.com/lcy0121/dsh-plugin-compat-check/tree/main/plugin",
      category: "dev",
      npm: "dsh-plugin-compat-check",
      version: "0.1.2",
      description: {
        zh: "已安装插件的兼容性检查",
        en: "Installed plugin compatibility checks",
      },
      added: "2026-10-17",
      install: "dsh plugin --profile web add dsh-plugin-compat-check",
    };
    if (!sidebar && !holdout) {
      server = http.createServer((req, res) => {
        if (req.url !== "/plugins.json") {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            updated: "2026-10-18",
            count: 1,
            categories: { dev: { zh: "开发与运行时", en: "Development" } },
            plugins: [entry],
          }),
        );
      });
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      env.DSHM_REGISTRY_URL =
        "http://127.0.0.1:" + server.address().port + "/plugins.json";
    }
    host = spawn(
      "dsh",
      ["--profile", "business", "--", "--port", "0", "--no-open"],
      {
        env,
        ...(holdout ? { cwd: workspace } : {}),
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const url = await new Promise((resolve, reject) => {
      let output = "",
        settled = false;
      const timer = setTimeout(() => {
        settled = true;
        reject(Error("Private business host startup timeout"));
      }, 45000);
      const append = (b) => {
        if (output.length < 1024 * 1024) output += b;
        hostOutput = output;
        const m = /(https?:\/\/127\.0\.0\.1:\d+\/?\?token=[\w.-]+)/.exec(
          output,
        );
        if (m && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      host.stdout.on("data", append);
      host.stderr.on("data", append);
      host.once("error", () => {
        clearTimeout(timer);
        reject(Error("Private host spawn failed"));
      });
      host.once("exit", () => {
        clearTimeout(timer);
        if (!settled) reject(Error("Private host exited before ready"));
      });
    });
    if (serviceObserver) {
      const until = Date.now() + 15000;
      while (!fs.existsSync(serviceObserver.output) && Date.now() < until)
        await wait(50);
      if (!fs.existsSync(serviceObserver.output))
        throw Error(
          "Owned service observer did not finish application readiness",
        );
      serviceSurface = observer.servicePredictionInput(
        JSON.parse(fs.readFileSync(serviceObserver.output)),
        { nm, dshVersion: version },
      );
      const servicesReport = run({
        nm,
        dshVersion: version,
        baseline: false,
        _ignoreAutoProbe: true,
        _hostSurface: serviceSurface,
      });
      if (servicesReport.error) throw Error("Service-only prediction failed");
      serviceArtifact = {
        staticArtifactDigest: identity.artifactDigest,
        rootServiceInputSha256: hash(JSON.stringify(serviceSurface)),
      };
      serviceIdentity = {
        ...identity,
        sampleId: identity.sampleId + "-services",
        suiteId: identity.suiteId + "-service-observed-v1",
        artifactDigest: hash(JSON.stringify(serviceArtifact)),
      };
      servicePredictions = {
        predictionContext: {
          mode: "feature-scoped-service-observed-api-risk",
          rootOnly: true,
          observationSha256: serviceArtifact.rootServiceInputSha256,
        },
        ...featurePredictions(
          toJSON(servicesReport),
          features,
          serviceIdentity,
        ),
        casePlan: predictions.casePlan,
      };
      serviceSealed = JSON.stringify(servicePredictions);
      fs.writeFileSync(
        path.join(root, "service-predictions.json"),
        serviceSealed,
      );
    }
    const chromePath =
      process.env.DSC_CHROME ||
      [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
      ].find((p) => fs.existsSync(p));
    if (!chromePath) throw Error("Real Chrome required for business labels");
    chromeStarting = launchChromePipe(chromePath, {
      timeoutMs: 10000,
      userDataDir: path.join(root, "chrome"),
    });
    chrome = await chromeStarting;
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await configureChineseBrowser(chrome);
    await chrome.send("Runtime.enable");
    await chrome.send("Page.enable");
    await chrome.send("Page.setLifecycleEventsEnabled", { enabled: true });
    await chrome.send("Network.enable");
    const evalx = async (expression) => {
      const r = await chrome.send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails)
        throw Error(
          "Business browser script failed: " +
            String(
              r.exceptionDetails.exception?.description ||
                r.exceptionDetails.text,
            )
              .split("\n")[0]
              .replaceAll(root, "<private>") +
            " at " +
            expression.slice(0, 200).replaceAll(root, "<private>"),
        );
      return r.result?.value;
    };
    async function poll(fn, message, budget = 15000) {
      const end = Date.now() + budget;
      do {
        const value = await fn();
        if (value) return value;
        await wait(50);
      } while (Date.now() < end);
      throw Error(message);
    }
    async function navigate(url, options) {
      return navigateOwnedDocument(chrome, url, poll, options);
    }
    const textButton = (t) =>
      `[...document.querySelectorAll('button')].find(b=>b.innerText.trim()===${JSON.stringify(t)})`;
    async function clickElement(selector, message) {
      await poll(
        () =>
          evalx(
            `(()=>{const b=${selector};if(!b||!b.isConnected||b.disabled||!b.getClientRects().length)return false;b.click();return true;})()`,
          ),
        message,
      );
    }
    const click = (t) =>
      clickElement(textButton(t), "Missing business control: " + t);
    async function openMarket(tab) {
      await navigate(url);
      await poll(
        () => evalx(`(${marketNavigationStep})(${JSON.stringify(tab)})`),
        "Market target card did not become ready",
      );
    }
    async function drain() {
      for (; eventCursor < chrome.events.length; eventCursor++) {
        const e = chrome.events[eventCursor];
        if (e.method === "Network.requestWillBeSent")
          requests.set(e.params.requestId, e.params.request.method);
        else if (e.method === "Network.responseReceived") {
          const p = e.params;
          try {
            responses.push({
              requestId: p.requestId,
              path: new URL(p.response.url).pathname,
              method: requests.get(p.requestId),
              status: p.response.status,
            });
          } catch {}
        } else if (e.method === "Network.loadingFinished") {
          finishedRequests.add(e.params.requestId);
        } else if (e.method === "Network.loadingFailed") {
          failedRequests.add(e.params.requestId);
        } else if (e.method === "Fetch.requestPaused") {
          const p = e.params;
          pendingFaults.add(p.requestId);
          try {
            if (
              faultRoute &&
              new URL(p.request.url).pathname === faultRoute &&
              p.request.method === "POST"
            )
              await chrome.send("Fetch.fulfillRequest", {
                requestId: p.requestId,
                responseCode: 503,
                responseHeaders: [
                  { name: "Content-Type", value: "application/json" },
                ],
                body: Buffer.from(
                  JSON.stringify({
                    error: "controlled business transport fault",
                  }),
                ).toString("base64"),
              });
            else
              await chrome.send("Fetch.continueRequest", {
                requestId: p.requestId,
              });
          } finally {
            pendingFaults.delete(p.requestId);
          }
        }
      }
    }
    let pumpError = null;
    tick = setInterval(() => {
      if (!processing)
        processing = drain()
          .catch((e) => {
            pumpError = e;
          })
          .finally(() => {
            processing = null;
          });
    }, 10);
    const disk = () => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(profile, ".dsh-market/state.json"), "utf8"),
        );
      } catch (e) {
        if (e.code === "ENOENT") return { notes: {}, favorites: [] };
        throw e;
      }
    };
    labels = {
      schemaVersion: 1,
      kind: "plugin-compat-check/business-labels",
      ...identity,
      source: "browser-action+profile-state",
      rows: [],
    };
    const screenshot = async (caseId) => {
      if (!outDir) return;
      const shot = await chrome.send("Page.captureScreenshot", {
        format: "png",
      });
      fs.writeFileSync(
        path.join(outDir, caseId + ".png"),
        Buffer.from(shot.data, "base64"),
        { flag: "wx" },
      );
    };
    let responseWindow = 0;
    const driver = {
      suite,
      resetResponseWindow: () => {
        responseWindow = responses.length;
      },
      responseRows: () =>
        responses.slice(responseWindow).map((r) => ({
          ...r,
          completed:
            finishedRequests.has(r.requestId) &&
            !failedRequests.has(r.requestId),
        })),
      workspace,
      home,
      modelContext,
      outDir,
      url,
      evalx,
      poll,
      screenshot,
      navigate,
      click,
      chrome,
      openMarket,
      disk,
      entry,
      armFault: async (route) => {
        faultRoute = route;
        if (route)
          await chrome.send("Fetch.enable", {
            patterns: [
              { urlPattern: "*" + route + "*", requestStage: "Request" },
            ],
          });
        return responses.length;
      },
      finishRequest: async (route, start) => {
        const receipt = await poll(() => {
          if (pumpError) throw pumpError;
          return completedResponse(
            responses,
            finishedRequests,
            failedRequests,
            route,
            start,
          );
        }, "Business action did not complete its request");
        if (faultRoute) {
          await chrome.send("Fetch.disable");
          faultRoute = null;
        }
        return receipt;
      },
    };
    labels.rows = holdout
      ? await holdout.holdoutCases(driver)
      : model
        ? await model.modelCases(driver)
        : editor
          ? await editor.editorCases(driver)
          : sidebar
            ? await sidebar.sidebarCases(driver)
            : await marketCases(driver, features);
    labels.collectedAt = new Date().toISOString();
    if (
      JSON.stringify(predictions) !== sealed ||
      fs.readFileSync(path.join(root, "predictions.json"), "utf8") !== sealed
    )
      throw Error("Sealed predictions changed after gold collection");
    let serviceObserved;
    if (servicePredictions) {
      if (
        JSON.stringify(servicePredictions) !== serviceSealed ||
        fs.readFileSync(path.join(root, "service-predictions.json"), "utf8") !==
          serviceSealed
      )
        throw Error("Sealed service predictions changed after gold collection");
      serviceObserved = {
        ...scoreBusiness(servicePredictions, { ...labels, ...serviceIdentity }),
        artifacts: serviceArtifact,
        prediction: {
          mode: "feature-scoped-service-observed-api-risk",
          loaderLabelsUsed: false,
          businessLabelsUsed: false,
          sealedBeforeActions: true,
          rootOnly: true,
          observationSha256: serviceArtifact.rootServiceInputSha256,
          sha256: hash(serviceSealed),
        },
      };
    }
    result = {
      ...scoreBusiness(predictions, labels),
      ...(serviceObserved ? { serviceObserved } : {}),
      applicable: true,
      artifacts: artifact,
      features,
      prediction: {
        mode: "feature-scoped-static-api-risk",
        businessLabelsUsed: false,
        loaderLabelsUsed: false,
        autoProbeDiscovery: false,
        sealedBeforeActions: true,
        sha256: hash(sealed),
      },
      controls: holdout
        ? {
            scope:
              "Public holdout package, private owned home/profile/browser; manual timer start or todo creation only; no model/account calls",
            faults:
              "DOM main-button removal for timer; HTTP503 POST/create for todo; installed plugin source unchanged",
            timerRequest:
              "GET config is readiness evidence; local timer action truth is actual DOM plus restored browser storage",
            rulesAdjustedForSamples: false,
          }
        : model
          ? {
              model: modelContext,
              fixture:
                "Owned workspace and official agent with an explicit closed empty fixture turn; no inherited assistant reply",
              scope:
                "Two real side-chat composer prompts; independent v4 JSONL assistant content and actual reloaded plugin assistant DOM; no broader model/task quality claim",
            }
          : sidebar
            ? {
                credentialOnboarding:
                  "Disabled through official private-profile config; no model readiness or credential claim",
                catalogue:
                  "No market catalog; published sidebar + owned empty official session and two disposable workspace files",
                faults:
                  "Browser intercepts only POST /sidebar/write with HTTP503; installed plugin bytes unchanged",
                scope: editor
                  ? "Native CodeMirror input and visible Save button, exact BOM/encoding/CRLF bytes, fresh editor reload; fixed published version comparison, not a pre-established natural regression."
                  : "Save/preview HTTP path for UTF8 BOM/UTF16LE + CRLF: healthy, blocked and recovery. Not editor widget UI, natural version regression, or original-plugin defect certification.",
              }
            : {
                credentialOnboarding:
                  "Disabled through official private-profile config; no model readiness or credential claim",
                catalogue:
                  "Single real public entry as a controlled local catalog; not a public-market installation test",
                faults:
                  "Browser intercepts selected POST with HTTP503, or removes only target-card action controls before action/after completed save; installed plugin bytes unchanged",
                scope:
                  "Target-card notes/favorites: healthy, HTTP503, missing controls before/after action, recovery. Controlled failures expose blind spots, not natural regressions or original-plugin defects.",
              },
    };
  } catch (error) {
    primaryFailure = error;
    if (outDir && suite !== "sidebar-model")
      fs.writeFileSync(
        path.join(outDir, "failure-host.txt"),
        hostOutput
          .replaceAll(root, "<private>")
          .replace(/([?&]token=)[\w.-]+/g, "$1<redacted>"),
      );
    if (outDir && chrome) {
      try {
        const text = await chrome.send("Runtime.evaluate", {
          expression: "document.body.innerText",
          returnByValue: true,
        });
        fs.writeFileSync(
          path.join(outDir, "failure-ui.txt"),
          text.result?.value || "",
        );
        const shot = await chrome.send("Page.captureScreenshot", {
          format: "png",
        });
        fs.writeFileSync(
          path.join(outDir, "failure.png"),
          Buffer.from(shot.data, "base64"),
        );
        const manifest = JSON.parse(
          fs.readFileSync(path.join(profile, "package.json")),
        );
        fs.writeFileSync(
          path.join(outDir, "failure-profile.json"),
          JSON.stringify(
            {
              dependencies: manifest.dependencies,
              bundles: manifest.dsh?.profile?.bundles,
            },
            null,
            2,
          ),
        );
      } catch {}
    }
    throw error;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      throw Object.assign(combineFailure(primaryFailure, error), {
        retainedWorkDir: root,
      });
    } finally {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", interrupt);
    }
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
    if (result) {
      result.cleanup = {
        privateRootRemoved: !fs.existsSync(root),
        hostStopped:
          !host || host.exitCode !== null || host.signalCode !== null,
      };
      if (outDir) {
        for (const [file, data] of Object.entries({
          "predictions.json": predictions,
          "labels.json": labels,
          "measurement.json": result,
          ...(servicePredictions
            ? {
                "service-predictions.json": servicePredictions,
                "service-labels.json": { ...labels, ...serviceIdentity },
                "service-observation.json": serviceSurface,
              }
            : {}),
        }))
          fs.writeFileSync(
            path.join(outDir, file),
            JSON.stringify(data, null, 2) + "\n",
            { flag: "wx" },
          );
      }
    }
  }
  return result;
}
