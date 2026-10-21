import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const severities = ["info", "low", "moderate", "high", "critical"];
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const text = (x) =>
  String(x ?? "unknown")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 256);
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function advisoryUrl(value) {
  try {
    const url = new URL(value);
    // Only public advisory pages are evidence; never retain credentials/query data.
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      !/^\/advisories\/GHSA-[a-z0-9-]+$/i.test(url.pathname)
    )
      return null;
    return url.origin + url.pathname;
  } catch {
    return null;
  }
}
function npm(args, cwd, timeout) {
  const child = spawnSync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    args.concat([
      "--registry=https://registry.npmjs.org",
      "--fetch-retries=0",
      "--fetch-timeout=45000",
    ]),
    {
      cwd,
      encoding: "utf8",
      timeout,
      killSignal: "SIGKILL",
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (child.error || child.signal)
    throw new Error(
      child.error?.code === "ETIMEDOUT" ? "npm-timeout" : "npm-process-error",
    );
  return child;
}
function audit(target, directory, timeout, graph) {
  try {
    const lockfile = path.join(directory, "package-lock.json");
    const lock = read(lockfile);
    if (
      !object(lock.packages) ||
      !object(lock.packages[""]) ||
      ![2, 3].includes(lock.lockfileVersion)
    )
      throw new Error("invalid-lockfile");
    const manifestFile = path.join(directory, "package.json"),
      manifest = read(manifestFile);
    for (const field of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]) {
      const actual = manifest[field] ?? {},
        frozen = lock.packages[""][field] ?? {};
      if (
        !object(actual) ||
        !object(frozen) ||
        Object.keys(actual).length !== Object.keys(frozen).length ||
        Object.entries(actual).some(
          ([name, pin]) => typeof pin !== "string" || frozen[name] !== pin,
        )
      )
        throw new Error("manifest-lock-mismatch");
    }
    const child = npm(
      [
        "audit",
        "--package-lock-only",
        "--ignore-scripts",
        "--json",
        "--include=dev",
        "--include=optional",
        "--include=peer",
        "--audit-level=info",
      ],
      directory,
      timeout,
    );
    let report;
    try {
      report = JSON.parse(child.stdout);
    } catch {
      throw new Error("invalid-audit-json");
    }
    if (!object(report)) throw new Error("invalid-audit-schema");
    if (report.error) throw new Error("npm-registry-error");
    const counts = report.metadata?.vulnerabilities;
    if (
      report.auditReportVersion !== 2 ||
      !object(report.vulnerabilities) ||
      !object(counts) ||
      ![...severities, "total"].every(
        (key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0,
      ) ||
      severities.reduce((sum, key) => sum + counts[key], 0) !== counts.total ||
      Object.keys(report.vulnerabilities).length !== counts.total
    )
      throw new Error("invalid-audit-schema");
    if (child.status !== (counts.total ? 1 : 0))
      throw new Error("unexpected-npm-exit");
    const findings = [];
    let truncated = false;
    for (const [name, entry] of Object.entries(report.vulnerabilities)) {
      if (
        !object(entry) ||
        typeof entry.severity !== "string" ||
        !Array.isArray(entry.via) ||
        !entry.via.length ||
        !Array.isArray(entry.nodes) ||
        !entry.nodes.length
      )
        throw new Error("invalid-audit-schema");
      for (const node of entry.nodes) {
        if (
          typeof node !== "string" ||
          !node.startsWith("node_modules/") ||
          !object(lock.packages[node]) ||
          typeof lock.packages[node].version !== "string"
        )
          throw new Error("audit-lock-path-mismatch");
        for (const via of entry.via) {
          if (!(typeof via === "string" || object(via)))
            throw new Error("invalid-audit-schema");
          if (findings.length >= 1000) {
            truncated = true;
            continue;
          }
          findings.push({
            dependency: text(name),
            source: text(object(via) ? via.source : via),
            path: text(node),
            version: text(lock.packages[node].version),
            severity: text(object(via) ? via.severity : entry.severity),
            url: object(via) ? advisoryUrl(via.url) : null,
            range: text(object(via) ? via.range : entry.range),
          });
        }
      }
    }
    return {
      target,
      graph,
      manifestSha256: digest(manifestFile),
      lockSha256: digest(lockfile),
      status: counts.total ? "vulnerable" : "clean",
      vulnerabilities: counts.total,
      findings,
      truncated,
    };
  } catch (error) {
    // Fixed diagnostics only: npm stdout/stderr can include registry credentials.
    const allowed = new Set([
      "invalid-lockfile",
      "manifest-lock-mismatch",
      "npm-timeout",
      "npm-process-error",
      "invalid-audit-json",
      "npm-registry-error",
      "invalid-audit-schema",
      "unexpected-npm-exit",
      "audit-lock-path-mismatch",
    ]);
    return {
      target,
      graph,
      status: "error",
      error: allowed.has(error.message)
        ? error.message
        : "manifest-or-lock-error",
      findings: [],
    };
  }
}

let output;
try {
  const { values } = parseArgs({
    options: {
      root: { type: "string", default: process.cwd() },
      output: { type: "string", default: "dependency-security.json" },
      "timeout-ms": { type: "string", default: "120000" },
    },
  });
  const root = path.resolve(values.root),
    timeout = Number(values["timeout-ms"]);
  output = path.resolve(values.output);
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 120000)
    throw new Error("invalid-options");
  const targets = [
    audit("workspace-lock", root, timeout, "frozen-root-lock-including-dev"),
  ];
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-dependency-audit-"));
    const plugin = read(path.join(root, "plugin/package.json"));
    const pluginLock = path.join(root, "plugin/package-lock.json");
    const manifest = {
      name: plugin.name,
      version: plugin.version,
      dependencies: plugin.dependencies,
      optionalDependencies: plugin.optionalDependencies,
      peerDependencies: plugin.peerDependencies,
      peerDependenciesMeta: plugin.peerDependenciesMeta,
      ...(fs.existsSync(pluginLock)
        ? { devDependencies: plugin.devDependencies }
        : {}),
    };
    if (
      typeof manifest.name !== "string" ||
      typeof manifest.version !== "string"
    )
      throw new Error("invalid-manifest");
    fs.writeFileSync(
      path.join(temporary, "package.json"),
      JSON.stringify(manifest),
    );
    const graph = fs.existsSync(pluginLock)
      ? "frozen-plugin-lock"
      : "current-registry-runtime-resolution";
    if (fs.existsSync(pluginLock))
      fs.copyFileSync(pluginLock, path.join(temporary, "package-lock.json"));
    else {
      const installation = npm(
        [
          "install",
          "--package-lock-only",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--include=optional",
          "--include=peer",
        ],
        temporary,
        timeout,
      );
      if (installation.status !== 0)
        throw new Error("plugin-lock-resolution-failed");
    }
    targets.push(audit("plugin-runtime", temporary, timeout, graph));
  } catch (error) {
    targets.push({
      target: "plugin-runtime",
      status: "error",
      error: [
        "npm-timeout",
        "npm-process-error",
        "plugin-lock-resolution-failed",
      ].includes(error.message)
        ? error.message
        : "plugin-manifest-or-lock-error",
      findings: [],
    });
  } finally {
    if (temporary) fs.rmSync(temporary, { recursive: true, force: true });
  }
  const exitCode = targets.some((x) => x.status === "error")
    ? 2
    : targets.some((x) => x.status === "vulnerable")
      ? 1
      : 0;
  const result = {
    schemaVersion: 1,
    status: ["clean", "vulnerable", "error"][exitCode],
    targets,
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  for (const target of targets) {
    console.log(
      `${target.target}: ${target.status}${target.error ? " (" + target.error + ")" : ""}`,
    );
    for (const finding of target.findings)
      console.log(
        `${target.target}: ${finding.severity} ${finding.dependency}@${finding.version} ${finding.path} source=${finding.source} ${finding.url ?? "advisory URL unavailable"}`,
      );
  }
  process.exitCode = exitCode;
} catch {
  console.error(
    "dependency-security: invalid options or evidence write failed",
  );
  process.exitCode = 2;
}
