/** Rebase only a private clone's pnpm9 local locators; remote pins stay intact. */
import fs from "node:fs";
import path from "node:path";
import { parseDocument, stringify } from "yaml";
const MAX_BYTES = 8 * 1024 * 1024;
const local = /^(file:|link:)(.*)$/s;
export function relocateProfileLock(profile, source) {
  const file = path.join(profile, "pnpm-lock.yaml");
  if (!fs.existsSync(file)) return;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES)
    throw new Error("Unsafe or oversized profile lock");
  const doc = parseDocument(fs.readFileSync(file, "utf8"), {
    uniqueKeys: true,
  });
  if (doc.errors.length || doc.warnings.length)
    throw new Error("Invalid profile lock YAML");
  let data;
  try {
    data = doc.toJS({ mapAsMap: true, maxAliasCount: 50 });
  } catch {
    throw new Error("Invalid profile lock aliases");
  }
  if (!(data instanceof Map) || String(data.get("lockfileVersion")) !== "9.0")
    throw new Error("Unsupported profile lock version");
  const importers = data.get("importers");
  if (
    !(importers instanceof Map) ||
    importers.size !== 1 ||
    !importers.has(".")
  )
    throw new Error("Unsupported profile lock importers");
  const absolute = (value) => {
    if (path.win32.isAbsolute(value) && !path.isAbsolute(value))
      throw new Error("Cross-platform local lock path is unsupported");
    return path.resolve(source, value).split(path.sep).join("/");
  };
  const replacements = new Map();
  const add = (protocol, relative) => {
    const target = absolute(relative);
    replacements.set(protocol + relative, protocol + target);
    // pnpm's package key removes the peer suffix; paths containing '(' share
    // that locator syntax. Rebase the exact shortened key it actually emitted.
    const old = relative.split("(")[0],
      next = target.split("(")[0];
    if (old !== relative) replacements.set(protocol + old, protocol + next);
  };
  const packages = data.get("packages");
  if (packages instanceof Map)
    for (const info of packages.values()) {
      const resolution = info instanceof Map ? info.get("resolution") : null;
      if (!(resolution instanceof Map)) continue;
      if (typeof resolution.get("directory") === "string")
        add("file:", resolution.get("directory"));
      const tarball = resolution.get("tarball");
      if (typeof tarball === "string" && local.test(tarball)) {
        const [, protocol, body] = local.exec(tarball);
        add(protocol, body);
      }
    }
  const entries = [...replacements].sort((a, b) => b[0].length - a[0].length);
  const locator = (value) => {
    if (typeof value !== "string") return value;
    for (const [before, after] of entries) {
      const at = value.startsWith(before) ? 0 : value.indexOf("@" + before) + 1;
      if (at < 0 || (!at && !value.startsWith(before))) continue;
      const end = at + before.length;
      if (end === value.length || value[end] === "(")
        return value.slice(0, at) + after + value.slice(end);
    }
    const match = local.exec(value);
    return match ? match[1] + absolute(match[2]) : value;
  };
  const active = new Set();
  let nodes = 0;
  const walk = (value, context = "", depth = 0) => {
    if (++nodes > 200000 || depth > 100)
      throw new Error("Profile lock complexity budget exceeded");
    if (value instanceof Map) {
      if (active.has(value)) throw new Error("Recursive profile lock alias");
      active.add(value);
      const out = new Map();
      for (const [key, child] of value) {
        const nextKey = ["packages", "snapshots"].includes(context)
          ? locator(key)
          : key;
        if (out.has(nextKey))
          throw new Error("Relocated profile lock key collision");
        out.set(
          nextKey,
          context === "resolution" &&
            key === "directory" &&
            typeof child === "string"
            ? absolute(child)
            : walk(child, String(key), depth + 1),
        );
      }
      active.delete(value);
      return out;
    }
    if (Array.isArray(value)) {
      if (active.has(value)) throw new Error("Recursive profile lock alias");
      active.add(value);
      const out = value.map((v) => walk(v, context, depth + 1));
      active.delete(value);
      return out;
    }
    return locator(value);
  };
  const rebased = stringify(walk(data));
  if (Buffer.byteLength(rebased) > 2 * MAX_BYTES)
    throw new Error("Relocated profile lock exceeds byte budget");
  fs.writeFileSync(file, rebased);
}
