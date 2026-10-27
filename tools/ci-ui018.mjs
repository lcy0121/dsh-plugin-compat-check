#!/usr/bin/env node
/** One private tgz, one actual-host UI run, and provenance-bound CI evidence. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareOwnedPackageSource } from "./owned-package-source.mjs";
const repo = fileURLToPath(new URL("..", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function validateUi018Evidence(result, artifactSha256) {
  const expect = (value, label) => {
    if (!value) throw Error("Incomplete UI acceptance: " + label);
  };
  expect(
    result?.ok === true && result.applicable === true,
    "actual applicable host",
  );
  expect(result.dshVersion === "0.2.1-rc.3", "exact rc.3 host");
  expect(
    /^[a-f0-9]{64}$/.test(artifactSha256) &&
      result.artifactSha256 === artifactSha256,
    "same installed tgz",
  );
  const required = {
    ui: ["available", "reenabled", "httpRestored"],
    ui018: ["keyboard", "stylesRemovedAndRecovered"],
    httpAuth: [
      "realHost",
      "missingAndForgedDenied",
      "launchBearerAndQueryNotBypasses",
      "officialSignedCookieExpiry",
      "sameOriginCookieRecovery",
    ],
    ui018Recovery: [
      "realBrowser",
      "draftPreserved",
      "editorIdentityAndFocusPreserved",
      "staleSaveDisabled",
      "copyAndDiscard",
    ],
    ui018P2: [
      "realBrowser",
      "allFixturePagesVisited",
      "filteringResetsPage",
      "fullExport",
    ],
    ui018Hardening: [
      "realBrowser",
      "completeExport",
      "actualSamplingTruncation",
      "propertyValuesAbsent",
    ],
    reviewNavigation: [
      "realBrowser",
      "bidirectional",
      "identityBound",
      "filters",
      "keyboardFocus",
      "originalReportUnchanged",
    ],
    uiI18n: [
      "realBrowser",
      "hostLanguage",
      "threeLanguages",
      "draftPreserved",
      "identityPreserved",
      "narrowAndTheme",
      "canonicalReportUnchanged",
    ],
    localHistory: [
      "realBrowser",
      "explicitSnapshotSave",
      "archiveCapacityFreed",
      "referenceImportOnly",
      "fullExportPreview",
      "comparison",
      "criteriaMismatchNeutral",
      "explicitDelete",
      "originalReportAndBaselineUnchanged",
    ],
    cleanup: ["privateRootRemoved"],
  };
  for (const [section, keys] of Object.entries(required))
    for (const key of keys)
      expect(result[section]?.[key] === true, section + "." + key);
  expect(
    result.ui018.initial?.order === true &&
      result.ui018.initial.collapsed === true &&
      result.ui018.initial.styles === 1,
    "primary order and lazy panels",
  );
  expect(
    result.ui018.layout?.first >= 240 && result.ui018.layout.second >= 280,
    "loader columns",
  );
  expect(
    result.ui018.colors?.light &&
      result.ui018.colors.dark &&
      result.ui018.colors.light !== result.ui018.colors.dark,
    "both themes",
  );
  expect(
    result.ui018P2.mainPageSize === 50 &&
      result.ui018P2.loaderPageSize === 50 &&
      result.ui018Hardening.findingPageSize === 50,
    "bounded lists",
  );
  expect(
    result.networkGuard?.productionRequests === 0,
    "no production/model calls",
  );
  return true;
}
export function packedFilename(stdout) {
  const start = stdout.lastIndexOf("\n[");
  const rows = JSON.parse(start < 0 ? stdout : stdout.slice(start + 1));
  if (
    !Array.isArray(rows) ||
    rows.length !== 1 ||
    typeof rows[0]?.filename !== "string" ||
    path.basename(rows[0].filename) !== rows[0].filename ||
    !/^[a-zA-Z0-9_.-]+\.tgz$/.test(rows[0].filename)
  )
    throw Error("Unexpected npm pack file");
  return rows[0].filename;
}
function sourceIdentity() {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
  const paths = [
    ...new Set(
      git(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  const files = paths.map((file) => ({
    file,
    sha256: digest(fs.readFileSync(path.join(repo, file))),
  }));
  return {
    commit: git(["rev-parse", "HEAD"]).trim(),
    dirty: git(["status", "--porcelain"]).trim().length > 0,
    sha256: digest(JSON.stringify(files)),
    files,
  };
}
async function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repo,
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => child.kill("SIGTERM"), 8 * 60 * 1000);
    const kill = setTimeout(() => child.kill("SIGKILL"), 8 * 60 * 1000 + 30000);
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (b) => {
      stdout += b;
      if (stdout.length > 8 * 1024 * 1024) child.kill("SIGTERM");
    });
    child.stderr.on("data", (b) => {
      stderr += b;
      if (stderr.length > 8 * 1024 * 1024) child.kill("SIGTERM");
    });
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(kill);
    };
    child.once("error", (e) => {
      finish();
      reject(e);
    });
    child.once("close", (code, signal) => {
      finish();
      resolve({ code, signal, stdout, stderr });
    });
  });
}
export async function runUi018Ci(output) {
  output = path.resolve(output);
  fs.mkdirSync(output, { recursive: true, mode: 0o700 });
  const write = (name, value) =>
    fs.writeFileSync(
      path.join(output, name),
      typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const source = sourceIdentity();
  write("source.json", source);
  const summary = {
    ok: false,
    sourceCommit: source.commit,
    sourceDirty: source.dirty,
    sourceSha256: source.sha256,
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    scope:
      "Controlled real-host UI acceptance; no business-function or Windows certification.",
  };
  let staging;
  try {
    if (process.env.GITHUB_ACTIONS === "true" && source.dirty)
      throw Error("CI requires a clean, exact checkout");
    staging = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-ui018-ci-"));
    const packageSource = path.join(staging, "source");
    prepareOwnedPackageSource(repo, packageSource);
    const packed = await run(
      "npm",
      [
        "pack",
        path.join(packageSource, "plugin"),
        "--json",
        "--pack-destination",
        output,
      ],
      {
        env: {
          ...process.env,
          npm_config_cache: path.join(staging, "npm-cache"),
        },
      },
    );
    write("pack.stderr", packed.stderr);
    write("pack.stdout", packed.stdout);
    if (packed.code !== 0) throw Error("Independent package build failed");
    const filename = packedFilename(packed.stdout);
    if (path.basename(filename) !== filename || !filename.endsWith(".tgz"))
      throw Error("Unexpected npm pack file");
    const artifact = path.join(output, filename),
      artifactSha256 = digest(fs.readFileSync(artifact));
    summary.artifact = { filename, sha256: artifactSha256 };
    const flags = Object.fromEntries(
      [
        "DSC_REQUIRE_RC2_UI",
        "DSC_UI018_ACCEPTANCE",
        "DSC_UI018_P2",
        "DSC_UI018_RECOVERY",
        "DSC_HTTP_AUTH_ACCEPTANCE",
        "DSC_UI018_HARDENING",
        "DSC_UI018_REVIEW_NAVIGATION",
        "DSC_UI018_HISTORY",
        "DSC_UI018_I18N",
      ].map((key) => [key, "1"]),
    );
    write("flags.json", flags);
    const acceptance = await run(process.execPath, ["tools/rc2-live.mjs"], {
      env: {
        ...process.env,
        ...flags,
        DSC_ACCEPTANCE_DSH_VERSION: "0.2.1-rc.3",
        DSC_RC2_ARTIFACT: artifact,
        DSC_UI018_SCREENSHOTS: path.join(output, "screenshots"),
        DSC_RC2_LIVE_LOG: path.join(output, "live.json"),
      },
    });
    write("live.stdout", acceptance.stdout);
    write("live.stderr", acceptance.stderr);
    if (acceptance.code !== 0)
      throw Error(
        "Actual UI acceptance failed; inspect live.json and live.stderr",
      );
    const result = JSON.parse(acceptance.stdout);
    validateUi018Evidence(result, artifactSha256);
    for (const name of [
      "overview-light.png",
      "overview-dark.png",
      "loader-narrow-fixture.png",
      "large-upgrade.png",
      "review-navigation.png",
      "local-history.png",
      "ui-language-zh.png",
      "ui-language-en.png",
      "ui-language-ko.png",
      "ui-language-en-narrow.png",
      "ui-language-ko-narrow.png",
    ]) {
      const bytes = fs.readFileSync(path.join(output, "screenshots", name));
      if (
        bytes.length < 1000 ||
        bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
      )
        throw Error("Missing PNG evidence: " + name);
    }
    if (sourceIdentity().sha256 !== source.sha256)
      throw Error("Source changed during acceptance");
    summary.ok = true;
    summary.dshVersion = result.dshVersion;
  } catch (error) {
    summary.error = error.message;
    throw error;
  } finally {
    if (staging) fs.rmSync(staging, { recursive: true, force: true });
    write("summary.json", summary);
    const listed = [];
    function visit(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(target);
        else if (entry.isFile() && entry.name !== "SHA256SUMS")
          listed.push(
            `${digest(fs.readFileSync(target))}  ${path.relative(output, target)}`,
          );
      }
    }
    visit(output);
    write("SHA256SUMS", listed.sort().join("\n") + "\n");
  }
  return summary;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(
        await runUi018Ci(
          process.argv[2] ||
            fs.mkdtempSync(path.join(os.tmpdir(), "dsc-ui018-evidence-")),
        ),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
