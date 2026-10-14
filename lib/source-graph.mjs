import fs from "node:fs";
import path from "node:path";
import { localImports } from "./syntax.mjs";

const sourceFile = (file) =>
  /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith(".d.ts");
const portable = (file) => file.split(path.sep).join("/");
const inside = (root, file) =>
  file === root || file.startsWith(root + path.sep);

function hostEntry(meta) {
  const exp = meta.exports;
  const value = typeof exp === "string" ? exp : exp?.["."];
  if (typeof value === "string") return value;
  if (value && typeof value === "object")
    for (const key of ["import", "node", "default", "require"]) {
      if (typeof value[key] === "string") return value[key];
      if (value[key] && typeof value[key] === "object")
        for (const v of Object.values(value[key]))
          if (typeof v === "string") return v;
    }
  return typeof meta.main === "string" ? meta.main : "index.js";
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
  const limits = {
    files: 2000,
    bytes: 32 * 1024 * 1024,
    fileBytes: 2 * 1024 * 1024,
    directories: 10000,
    timeMs: 5000,
    ...options.limits,
  };
  const texts = new Map(),
    resolvedFiles = new Map();
  let bytes = 0;
  const note = (kind, file, message) => {
    if (diagnostics.length < 100) diagnostics.push({ kind, file, message });
  };
  const expired = () => Date.now() - started > limits.timeMs;
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
    for (const name of [
      abs,
      ...[
        ".js",
        ".mjs",
        ".cjs",
        ".ts",
        ".tsx",
        ".jsx",
        ".mts",
        ".cts",
        "/index.js",
        "/index.mjs",
        "/index.ts",
      ].map((e) => abs + e),
    ]) {
      try {
        const canonical = fs.realpathSync(name);
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
        /* try next supported resolution */
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
  const read = (rel) => {
    if (texts.has(rel)) return texts.get(rel);
    if (expired() || texts.size >= limits.files) {
      note("scan-budget-exceeded", rel, "File/time limit reached");
      return null;
    }
    try {
      const stat = fs.statSync(path.join(root, rel));
      if (stat.size > limits.fileBytes || bytes + stat.size > limits.bytes) {
        note("scan-budget-exceeded", rel, "Source byte limit reached");
        return null;
      }
      const text = fs.readFileSync(path.join(root, rel), "utf8");
      bytes += stat.size;
      texts.set(rel, text);
      return text;
    } catch (error) {
      note("source-unreadable", rel, error.message);
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
      if (!rel || seen.has(rel) || !sourceFile(rel)) continue;
      seen.add(rel);
      const text = read(rel);
      if (text === null) continue;
      const parsed = localImports(text, rel);
      if (parsed.error) note("parse-error", rel, parsed.error.message);
      for (const spec of parsed.imports)
        queue.push(path.join(path.dirname(rel), spec));
    }
    return seen;
  };
  const walk = () => {
    const out = [],
      queue = [root],
      visited = new Set();
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
        entries = fs.readdirSync(real, { withFileTypes: true });
      } catch (error) {
        note(
          "source-unreadable",
          portable(path.relative(root, real)),
          error.message,
        );
        continue;
      }
      for (const entry of entries.sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      )) {
        const file = path.join(real, entry.name);
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
    const rel = resolveFile(patch);
    if (rel)
      try {
        const txt = fs.readFileSync(path.join(root, rel), "utf8");
        for (const m of txt.matchAll(/^\s*-\s*name:\s*['"]?([^\s'"]+)/gm))
          mounted.push(m[1].startsWith(".") ? m[1] : hostEntry(meta));
      } catch (error) {
        note("patch-unreadable", rel, error.message);
      }
  }
  const hostSeeds = mounted.length ? mounted : [hostEntry(meta)];
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
      hostEntry(meta),
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
  ];
}
