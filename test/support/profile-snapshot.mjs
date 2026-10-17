/** Test-only static inputs. Never execute copied plugins or follow escaped links. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inside = (root, file) =>
  file === root || file.startsWith(root + path.sep);
const validName = (name) =>
  typeof name === "string" &&
  name !== "." &&
  name !== ".." &&
  path.basename(name) === name &&
  !name.includes("\\");
const stamp = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs];
const failure = (code, message) =>
  Object.assign(new Error(`${code}: ${message}`), { code });
function remove(root) {
  if (!fs.existsSync(root)) return;
  const writable = (dir) => {
    fs.chmodSync(dir, 0o700);
    for (const e of fs.readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) writable(path.join(dir, e.name));
  };
  writable(root);
  fs.rmSync(root, { recursive: true, force: true });
}
function freeze(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, e.name);
    if (e.isDirectory()) freeze(file);
    else if (e.isFile()) fs.chmodSync(file, 0o444);
  }
  fs.chmodSync(dir, 0o555);
}

/** Two matching observations detect capture races; this is not an OS-atomic snapshot. */
export function captureProfiles({
  profilesDir = path.join(os.homedir(), ".dsh/profiles"),
  names,
  tempDir = os.tmpdir(),
  beforeVerify,
  limits: overrides = {},
} = {}) {
  const root = fs.mkdtempSync(path.join(tempDir, "dsc-profile-input-"));
  const started = Date.now();
  const limits = {
    bytes: 256 * 1024 * 1024,
    files: 50000,
    directories: 20000,
    timeMs: 30000,
    ...overrides,
  };
  for (const [key, value] of Object.entries(limits))
    if (!Number.isFinite(value) || value <= 0) {
      remove(root);
      throw failure("PROFILE_SNAPSHOT_BUDGET", `Invalid ${key}`);
    }
  const observe = (copy) => {
    let bytes = 0,
      files = 0,
      directories = 0;
    const records = [],
      profiles = [],
      missing = [];
    const budget = () => {
      if (
        bytes > limits.bytes ||
        files > limits.files ||
        directories > limits.directories ||
        Date.now() - started > limits.timeMs
      )
        throw failure(
          "PROFILE_SNAPSHOT_BUDGET",
          "Capture limits exceeded; no partial input published",
        );
    };
    const list = (dir) => {
      directories++;
      budget();
      return fs.readdirSync(dir).sort();
    };
    const read = (file) => {
      const before = fs.statSync(file);
      bytes += before.size;
      files++;
      budget();
      if (!before.isFile()) throw new Error(`Not a regular file: ${file}`);
      const data = fs.readFileSync(file),
        after = fs.statSync(file);
      if (JSON.stringify(stamp(before)) !== JSON.stringify(stamp(after)))
        throw new Error(`File changed while reading: ${file}`);
      records.push(["file", file, stamp(after), hash(data)]);
      return data;
    };
    const write = (file, data) => {
      if (!copy) return;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
    };
    const walk = (source, dest, packageRoot, packageDest) => {
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) {
        files++;
        budget();
        const target = fs.readlinkSync(source);
        let real = null;
        try {
          real = fs.realpathSync(source);
        } catch (e) {
          if (!["ENOENT", "ELOOP"].includes(e.code)) throw e;
        }
        records.push(["link", source, target, real]);
        if (copy) {
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          // Keep internal aliases relative to the copied canonical package root.
          // External/broken links point only to owned markers, never user files.
          let newTarget;
          if (real && inside(packageRoot, real))
            newTarget = path.join(
              packageDest,
              path.relative(packageRoot, real),
            );
          else {
            newTarget = path.join(root, "outside", hash(source));
            if (real)
              write(newTarget, "External source intentionally not copied\n");
          }
          fs.symlinkSync(path.relative(path.dirname(dest), newTarget), dest);
        }
      } else if (stat.isDirectory()) {
        const entries = list(source);
        records.push(["dir", source, stat.dev, stat.ino, entries]);
        if (copy) fs.mkdirSync(dest, { recursive: true });
        for (const entry of entries)
          walk(
            path.join(source, entry),
            path.join(dest, entry),
            packageRoot,
            packageDest,
          );
      } else if (stat.isFile()) write(dest, read(source));
      else throw new Error(`Unsupported input type: ${source}`);
    };
    let selected;
    try {
      selected = names ? [...names].sort() : list(profilesDir);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      selected = names ? [...names].sort() : [];
    }
    records.push(["profiles", selected]);
    for (const name of selected) {
      if (!validName(name)) throw new Error(`Unsafe profile name: ${name}`);
      const sourceNm = path.join(profilesDir, name, "node_modules");
      let canonical;
      try {
        canonical = fs.realpathSync(sourceNm);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
        missing.push(name);
        records.push(["missing", name]);
        continue;
      }
      const entries = list(canonical),
        nm = path.join(root, "profiles", name, "node_modules");
      profiles.push({ name, nm, sourceNm });
      records.push(["inventory", name, canonical, entries]);
      if (copy) fs.mkdirSync(nm, { recursive: true });
      for (const entry of entries) {
        const bases = entry.startsWith("@")
          ? list(path.join(canonical, entry)).map((x) => path.join(entry, x))
          : [entry];
        for (const base of bases) {
          const pkg = path.join(canonical, base),
            manifest = path.join(pkg, "package.json");
          let data;
          try {
            data = read(manifest);
          } catch (e) {
            if (!["ENOENT", "ENOTDIR"].includes(e.code)) throw e;
            records.push(["no-manifest", pkg]);
            continue;
          }
          let meta;
          try {
            meta = JSON.parse(data);
          } catch {
            /* retain malformed inventory metadata */
          }
          const dest = path.join(nm, base);
          if (
            meta &&
            typeof meta === "object" &&
            !Array.isArray(meta) &&
            "dsh" in meta &&
            !String(meta.name ?? "").startsWith("@deepseek-ai/")
          ) {
            const packageRoot = fs.realpathSync(pkg);
            if (fs.lstatSync(manifest).isSymbolicLink())
              throw new Error(
                `Linked package metadata is unsupported: ${manifest}`,
              );
            walk(packageRoot, dest, packageRoot, dest);
          } else write(path.join(dest, "package.json"), data);
        }
      }
    }
    return { signature: hash(JSON.stringify(records)), profiles, missing };
  };
  try {
    const first = observe(true);
    beforeVerify?.();
    const second = observe(false);
    if (first.signature !== second.signature)
      throw new Error(
        "Profile inventory, source bytes or link identity changed during capture",
      );
    const manifest = {
      schemaVersion: 1,
      profiles: first.profiles,
      missing: first.missing,
    };
    fs.writeFileSync(
      path.join(root, "snapshot.json"),
      JSON.stringify(manifest),
    );
    freeze(root);
    let disposed = false;
    return {
      root,
      ...manifest,
      dispose() {
        if (!disposed) {
          remove(root);
          disposed = true;
        }
      },
    };
  } catch (e) {
    remove(root);
    if (e.code === "PROFILE_SNAPSHOT_BUDGET") throw e;
    throw failure("PROFILE_SNAPSHOT_UNSTABLE", e.message);
  }
}

let cached;
/** A suite borrows one runner-owned snapshot; standalone files own their copy. */
export function optionalProfiles() {
  if (cached) return cached.profiles;
  const borrowed = process.env.DSC_TEST_PROFILE_SNAPSHOT;
  if (borrowed) {
    const data = JSON.parse(
      fs.readFileSync(path.join(borrowed, "snapshot.json"), "utf8"),
    );
    if (data.schemaVersion !== 1 || !Array.isArray(data.profiles))
      throw new Error("Invalid test profile snapshot");
    for (const p of data.profiles)
      if (
        !validName(p.name) ||
        p.nm !== path.join(borrowed, "profiles", p.name, "node_modules")
      )
        throw new Error("Invalid test profile input path");
    cached = data;
  } else {
    cached = captureProfiles();
    process.once("exit", () => cached.dispose());
  }
  return cached.profiles;
}
