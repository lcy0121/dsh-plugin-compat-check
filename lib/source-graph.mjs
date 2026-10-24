import fs from "node:fs";
import path from "node:path";
import { localImports } from "./syntax.mjs";
import {
  readStaticFile,
  readStaticDirectory,
  inputError,
  lowerInputLimits,
} from "./static-input.mjs";

const sourceFile = (file) =>
  /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".d.ts");
const portable = (file) => file.split(path.sep).join("/");
const inside = (root, file) =>
  file === root || file.startsWith(root + path.sep);

/** DSH imports host plugins with Node's normal ESM conditions, never types. */
function hostEntry(meta, uncertain) {
  if (meta.exports == null)
    return typeof meta.main === "string" ? meta.main : "index.js";
  let steps = 0;
  const active = new Set([
    "node",
    "import",
    "node-addons",
    "module-sync",
    "default",
  ]);
  const inactive = new Set(["types", "browser", "require"]);
  const invalid = (message, code) => {
    throw Object.assign(new Error(message), { code });
  };
  const select = (value, depth = 0) => {
    if (++steps > 128 || depth > 32)
      return invalid("Export resolution budget exceeded");
    if (value === null) return null;
    if (typeof value === "string") {
      if (
        !value.startsWith("./") ||
        value
          .slice(2)
          .split("/")
          .some((p) => p === "." || p === ".." || p === "node_modules")
      )
        return invalid(
          "Unsupported or invalid export target",
          "INVALID_EXPORT_TARGET",
        );
      if (/[%?#\\]/.test(value))
        return invalid(
          "URL-style export target cannot be mapped to source with certainty",
        );
      return value;
    }
    if (Array.isArray(value)) {
      let error;
      for (const entry of value) {
        try {
          const target = select(entry, depth + 1);
          if (target != null) return target;
        } catch (cause) {
          if (cause.code !== "INVALID_EXPORT_TARGET") throw cause;
          error = cause;
        }
      }
      if (error) throw error;
      return null;
    }
    if (!value || typeof value !== "object")
      return invalid("Unsupported export value", "INVALID_EXPORT_TARGET");
    for (const [condition, target] of Object.entries(value)) {
      if (/^\d+$/.test(condition) || condition.startsWith("."))
        return invalid("Invalid export condition");
      if (active.has(condition)) {
        const result = select(target, depth + 1);
        if (result !== undefined) return result;
      } else if (!inactive.has(condition))
        return invalid(
          "Custom export conditions are not established for this host",
        );
    }
    return undefined;
  };
  try {
    let value = meta.exports;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.some((k) => k.startsWith("."))) {
        if (keys.some((k) => !k.startsWith(".")) || !Object.hasOwn(value, "."))
          return invalid("Package root export is unavailable or invalid");
        value = value["."];
      }
    }
    const target = select(value);
    if (!target) return invalid("No host import target can be established");
    return target;
  } catch (error) {
    uncertain(error.message);
    return null;
  }
}
export function clientEntry(meta) {
  const value = meta.exports?.["./client"];
  if (typeof value === "string") return value;
  if (value && typeof value === "object")
    for (const key of ["browser", "import", "default"])
      if (typeof value[key] === "string") return value[key];
  return null;
}

/** Package-root links (pnpm) are resolved once; descendants stay in that root. */
export function collectPackageSources(pkg, meta, options = {}) {
  const root = fs.realpathSync(pkg),
    started = Date.now();
  const diagnostics = [],
    skipped = [],
    files = [],
    buckets = new Map(),
    fileSides = {};
  const limits = lowerInputLimits(
    {
      files: 2000,
      bytes: 32 * 1024 * 1024,
      fileBytes: 2 * 1024 * 1024,
      directories: 10000,
      entries: 10000,
      timeMs: 5000,
    },
    options.limits,
  );
  const texts = new Map(),
    resolvedFiles = new Map(),
    moduleLinks = new Map();
  let bytes = 0;
  const note = (kind, file, message) => {
    if (diagnostics.length < 100) diagnostics.push({ kind, file, message });
  };
  let hostResolved = false,
    hostTarget;
  const hostEntryFor = () => {
    if (!hostResolved) {
      hostResolved = true;
      hostTarget = hostEntry(meta, (message) =>
        note("entry-resolution-uncertain", "package.json", message),
      );
      if (hostTarget) {
        // Only legacy package main resolution has extension/index fallbacks.
        // An exports target, like an explicit import URL, is an exact file.
        hostTarget =
          meta.exports == null
            ? resolveLegacyMain(hostTarget)
            : resolveFile(hostTarget, true);
      }
    }
    return hostTarget;
  };
  const expired = () => Date.now() - started > limits.timeMs;
  const checkTime = () => {
    if (expired())
      throw inputError("STATIC_INPUT_BUDGET", "Source time budget exceeded");
  };
  const resolveFile = (rel, required = false) => {
    if (typeof rel !== "string") return null;
    const abs = path.resolve(root, rel);
    if (!inside(root, abs)) {
      note(
        "path-outside-package",
        portable(rel),
        "Relative path leaves canonical package root",
      );
      return null;
    }
    if (!rel.endsWith("/") && !rel.endsWith(path.sep)) {
      try {
        const canonical = fs.realpathSync(abs);
        if (!inside(root, canonical)) {
          note(
            "path-outside-package",
            portable(rel),
            "Symlink leaves canonical package root",
          );
          return null;
        }
        if (fs.statSync(canonical).isFile())
          return portable(path.relative(root, canonical));
      } catch {
        /* The caller decides whether a different resolution mode may try more. */
      }
    }
    if (required)
      note(
        "source-unresolved",
        portable(rel),
        "Entry or relative import cannot be read",
      );
    return null;
  };
  const nodeFile = (rel) => {
    if (rel.endsWith("/") || rel.endsWith(path.sep)) return null;
    for (const suffix of ["", ".js", ".json", ".node"]) {
      const found = resolveFile(rel + suffix);
      if (found) return found;
    }
    return null;
  };
  const directoryIndex = (rel) => {
    for (const suffix of [".js", ".json", ".node"]) {
      const found = resolveFile(path.join(rel, "index" + suffix));
      if (found) return found;
    }
    return null;
  };
  const unresolved = (rel) => {
    note(
      "source-unresolved",
      portable(rel),
      "Node entry or relative module cannot be resolved",
    );
    return null;
  };
  const resolveLegacyMain = (rel) =>
    nodeFile(rel) ||
    directoryIndex(rel) ||
    directoryIndex(".") ||
    unresolved(rel);
  const resolveRequire = (rel) => {
    checkTime();
    const found = nodeFile(rel);
    if (found) return found;
    const abs = path.resolve(root, rel);
    if (!inside(root, abs)) return resolveFile(rel, true);
    let directory;
    try {
      directory = fs.realpathSync(abs);
      if (!inside(root, directory)) return resolveFile(rel, true);
      if (!fs.statSync(directory).isDirectory()) return null;
    } catch {
      return null;
    }
    let manifest;
    try {
      // A present but unsafe manifest is not equivalent to a missing one.
      const candidate = path.join(rel, "package.json");
      fs.lstatSync(path.join(root, candidate));
      manifest = portable(candidate);
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code)) {
        note(
          "source-unreadable",
          portable(rel),
          "CommonJS package metadata cannot be inspected",
        );
        return null;
      }
    }
    if (manifest) {
      const text = read(manifest, 65536);
      if (text === null) return null;
      try {
        const metadata = JSON.parse(text);
        if (
          !metadata ||
          typeof metadata !== "object" ||
          Array.isArray(metadata)
        )
          throw new Error("Invalid CommonJS package object");
        if (typeof metadata?.main === "string" && metadata.main) {
          const main = path.join(rel, metadata.main);
          // Node LOAD_AS_DIRECTORY tries main as file, then main/index;
          // it does not recursively read another directory's package.json.
          const resolved = nodeFile(main) || directoryIndex(main);
          if (resolved) return resolved;
        }
      } catch {
        note(
          "entry-resolution-uncertain",
          manifest,
          "Invalid CommonJS package metadata",
        );
        return null;
      }
    }
    return directoryIndex(rel);
  };
  const read = (rel, fileLimit = limits.fileBytes) => {
    if (texts.has(rel)) return texts.get(rel);
    if (expired() || texts.size >= limits.files) {
      note("scan-budget-exceeded", rel, "File/time limit reached");
      return null;
    }
    try {
      const data = readStaticFile(
        path.join(root, rel),
        Math.min(fileLimit, limits.fileBytes, limits.bytes - bytes),
        checkTime,
      );
      const text = data.toString("utf8");
      bytes += data.length;
      texts.set(rel, text);
      return text;
    } catch (error) {
      note(
        error.code === "STATIC_INPUT_BUDGET"
          ? "scan-budget-exceeded"
          : "source-unreadable",
        rel,
        error.message,
      );
      return null;
    }
  };
  const graph = (seeds) => {
    const seen = new Set(),
      queue = seeds.slice();
    while (queue.length) {
      if (expired()) {
        note("scan-budget-exceeded", null, "Source graph time limit reached");
        break;
      }
      const rel = resolveFile(queue.pop(), true);
      if (!rel || seen.has(rel)) continue;
      if (!sourceFile(rel)) {
        note(
          "source-format-uncertain",
          rel,
          "Resolved module is not supported JavaScript/TypeScript source",
        );
        continue;
      }
      seen.add(rel);
      const text = read(rel);
      if (text === null) continue;
      const parsed = localImports(text, rel);
      if (parsed.error) note("parse-error", rel, parsed.error.message);
      for (const { source: spec, kind } of parsed.edges) {
        if (!moduleLinks.has(rel)) moduleLinks.set(rel, new Map());
        const local = path.join(path.dirname(rel), spec);
        let target;
        try {
          if (kind === "require")
            target = resolveRequire(local) || unresolved(local);
          else if (/[%?#\\]/.test(spec)) target = unresolved(local);
          else target = resolveFile(local, true);
        } catch (error) {
          if (error.code !== "STATIC_INPUT_BUDGET") throw error;
          note("scan-budget-exceeded", rel, error.message);
          break;
        }
        // The same spelling may resolve for require but fail for import.
        moduleLinks
          .get(rel)
          .set(kind === "require" ? "require:" + spec : spec, target);
        if (target) queue.push(target);
      }
    }
    return seen;
  };
  const walk = () => {
    const out = [],
      queue = [root],
      visited = new Set();
    let entriesSeen = 0;
    while (queue.length) {
      if (
        expired() ||
        visited.size >= limits.directories ||
        out.length >= limits.files * 4
      ) {
        note("scan-budget-exceeded", null, "Directory walk limit reached");
        break;
      }
      const abs = queue.pop();
      let real;
      try {
        real = fs.realpathSync(abs);
      } catch {
        continue;
      }
      if (!inside(root, real)) {
        note(
          "path-outside-package",
          portable(path.relative(root, abs)),
          "Directory link leaves package",
        );
        continue;
      }
      if (visited.has(real)) continue;
      visited.add(real);
      let entries;
      try {
        entries = readStaticDirectory(
          real,
          limits.entries - entriesSeen,
          checkTime,
        );
        entriesSeen += entries.length;
      } catch (error) {
        note(
          error.code === "STATIC_INPUT_BUDGET"
            ? "scan-budget-exceeded"
            : "source-unreadable",
          portable(path.relative(root, real)),
          error.message,
        );
        if (error.code === "STATIC_INPUT_BUDGET") break;
        continue;
      }
      for (const entry of entries) {
        if (expired()) {
          note(
            "scan-budget-exceeded",
            null,
            "Directory walk time limit reached",
          );
          return out;
        }
        const file = path.join(real, entry);
        try {
          const resolved = fs.realpathSync(file);
          if (!inside(root, resolved)) {
            note(
              "path-outside-package",
              portable(path.relative(root, file)),
              "File link leaves package",
            );
            continue;
          }
          const stat = fs.statSync(resolved);
          if (stat.isDirectory()) queue.push(resolved);
          else if (stat.isFile() && sourceFile(resolved))
            out.push(portable(path.relative(root, resolved)));
        } catch {
          /* broken links have no readable source */
        }
      }
    }
    return [...new Set(out)].sort();
  };
  const mounted = [];
  const patch = meta.dsh?.bundle?.patch;
  if (typeof patch === "string") {
    const count = diagnostics.length;
    const rel = resolveFile(patch);
    if (rel)
      try {
        const data = readStaticFile(
          path.join(root, rel),
          Math.min(limits.fileBytes, limits.bytes - bytes),
          checkTime,
        );
        bytes += data.length;
        const txt = data.toString("utf8");
        for (const m of txt.matchAll(/^\s*-\s*name:\s*['"]?([^\s'"]+)/gm))
          mounted.push(
            m[1].startsWith(".") ? resolveFile(m[1], true) : hostEntryFor(),
          );
      } catch (error) {
        note(
          error.code === "STATIC_INPUT_BUDGET"
            ? "scan-budget-exceeded"
            : "patch-unreadable",
          rel,
          error.message,
        );
      }
    else if (diagnostics.length === count)
      note(
        "patch-unreadable",
        patch,
        "Declared patch is missing, nonregular or unreadable",
      );
  }
  const hostSeeds = mounted.length ? mounted : [hostEntryFor()];
  const entryFiles = [
    ...new Set(
      [...hostSeeds, clientEntry(meta)]
        .filter(Boolean)
        .map((s) => resolveFile(s))
        .filter(Boolean),
    ),
  ];
  const host = graph(hostSeeds);
  const fallback = host.size === 0;
  const all = walk();
  const add = (rel, bucket, side) => {
    const text = read(rel);
    if (text === null) return;
    if (!fileSides[rel]) fileSides[rel] = [];
    if (!fileSides[rel].includes(side)) fileSides[rel].push(side);
    if (resolvedFiles.has(rel)) return;
    resolvedFiles.set(rel, true);
    files.push([rel, text]);
    buckets.set(rel, bucket);
  };
  if (fallback) {
    note(
      "entry-fallback",
      hostTarget ?? null,
      "No resolved host entry; candidate source coverage is uncertain",
    );
    for (const rel of all)
      add(
        rel,
        "fallback",
        rel.toLowerCase().includes("client") ? "client" : "host",
      );
  } else {
    for (const rel of [...host].sort()) add(rel, "host-entry", "host");
    const client = clientEntry(meta);
    if (client)
      for (const rel of [...graph([client])].sort())
        add(rel, "client-entry", "client");
    const seeds = all.filter((rel) => rel.toLowerCase().includes("client"));
    const skip =
      options.skipClientExtra === undefined
        ? (rel) => rel.startsWith("src/") || rel.includes("/src/")
        : options.skipClientExtra;
    for (const rel of [...graph(seeds)].sort()) {
      if (!resolvedFiles.has(rel) && skip?.(rel)) {
        skipped.push(rel);
        continue;
      }
      add(rel, "client-extra", "client");
    }
  }
  return [
    files,
    fallback,
    buckets,
    skipped,
    diagnostics,
    fileSides,
    entryFiles,
    moduleLinks,
  ];
}
