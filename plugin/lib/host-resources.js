import fs from "node:fs";
import path from "node:path";

/** Iterate without awaiting inactive fibers, and map only verified package identities. */
export function loaderObservations(ctx, manifests, items = []) {
  const rows = [],
    unmapped = [];
  const names = new Set(manifests.map((m) => m.name));
  let loader;
  try {
    loader = ctx.get?.("loader", false) || ctx.loader;
  } catch {}
  if (!loader?.entries) return { rows, unmapped, available: false };
  try {
    let count = 0;
    for (const entry of loader.entries()) {
      if (count++ >= 20000) {
        unmapped.push("(entry limit)");
        break;
      }
      const opts = entry.options || {},
        id = entry.id ?? opts.id;
      // Nested entry ids are paths, not package names. Require an unambiguous
      // package identity; never let a colliding local id override module identity.
      const listing = items.filter((i) => i.id === id);
      const explicit = [
        entry.packageName,
        opts.packageName,
        ...listing.map((i) => i.packageName),
      ].filter((v) => typeof v === "string" && v.length > 0);
      // An explicit identity outside the manifest set is still evidence: do
      // not discard it and borrow a different package's matching module name.
      const identities = new Set(explicit);
      if (typeof opts.name === "string" && names.has(opts.name))
        identities.add(opts.name);
      const candidate = identities.size === 1 ? [...identities][0] : null;
      const packageName = names.has(candidate) ? candidate : null;
      const code = entry.fiber?.state;
      const disabled = entry.disabled;
      const state =
        Number.isInteger(code) && typeof disabled === "boolean"
          ? ["PENDING", "LOADING", "ACTIVE", "FAILED", "DISPOSED", "UNLOADING"][
              code
            ] || "UNREADABLE"
          : "UNREADABLE";
      if (!packageName) {
        unmapped.push(String(id ?? "(unknown)"));
        continue;
      }
      rows.push({
        packageName,
        id,
        state,
        disabled: disabled === true,
        group: opts.group === true,
      });
    }
    return { rows, unmapped, available: true };
  } catch {
    return {
      rows,
      unmapped: [...unmapped, "(loader unreadable)"],
      available: false,
    };
  }
}

/** Diagnostics are opt-in, user-owned and refuse symlink output. */
export function privateDiagnostic(file, data) {
  if (!file) return false;
  const dir = path.dirname(file);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(dir);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === "function" && stat.uid !== process.getuid())
    )
      throw new Error(
        "Diagnostic directory must be private and owned by this user",
      );
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink())
      throw new Error("Diagnostic output is a symlink");
    const fd = fs.openSync(
      file,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_TRUNC |
        (fs.constants.O_NOFOLLOW || 0),
      0o600,
    );
    try {
      fs.writeFileSync(fd, JSON.stringify(data, null, 2) + "\n");
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}
