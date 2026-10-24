/** Bounded, non-evaluating subset of DSH's ordered bundle patch composition.
 * Unsupported expressions/aliases and cross-bundle targets limit coverage.
 * Only insert rows (and known group descendants) introduce module roots.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseDocument, isAlias, isMap, isSeq, isPair } from "yaml";
import { inputError } from "./static-input.mjs";

export function patchMounts(files, { root, read, check, note, limits }) {
  const rows = [],
    index = new Map(),
    bases = new WeakMap(),
    assertionNames = new WeakMap();
  let nodes = 0,
    complete = true;
  const uncertain = (file, message) => {
    complete = false;
    note("patch-resolution-uncertain", file, message);
  };
  const invalid = (message) => {
    throw new Error(message);
  };
  const inspect = (root) => {
    const queue = [[root, 0]];
    while (queue.length) {
      check();
      const [node, depth] = queue.pop();
      if (!node || typeof node !== "object") continue;
      if (++nodes > limits.yamlNodes || depth > limits.yamlDepth)
        throw inputError(
          "STATIC_INPUT_BUDGET",
          "Patch node/depth budget exceeded",
        );
      // Zero alias expansion: anchors alone are harmless, aliases are explicit
      // unsupported input. No cyclic graph or expansion reaches composition.
      if (isAlias(node))
        invalid("Patch aliases are unsupported (expansion budget 0)");
      if (isMap(node) || isSeq(node))
        for (const item of node.items) queue.push([item, depth + 1]);
      else if (isPair(node)) {
        queue.push([node.key, depth + 1], [node.value, depth + 1]);
      }
    }
  };
  const rowList = (entries, base) => {
    if (!Array.isArray(entries))
      invalid("Patch insert/group config must be a literal row list");
    for (const row of entries) {
      if (!(row instanceof Map)) invalid("Patch row must be a literal mapping");
      for (const key of ["group", "disabled"])
        if (
          row.has(key) &&
          row.get(key) !== null &&
          typeof row.get(key) !== "boolean"
        )
          invalid("Patch row flags must be literal booleans");
      if (typeof row.get("name") !== "string" || !row.get("name"))
        invalid("Patch row name is unavailable");
      if (row.has("id") && typeof row.get("id") !== "string")
        invalid("Patch row id must be a string");
      bases.set(row, base);
      const name = row.get("name");
      assertionNames.set(
        row,
        path.isAbsolute(name) || name.startsWith("./") || name.startsWith("../")
          ? pathToFileURL(path.resolve(root, base, name)).href
          : name,
      );
      const id = row.get("id");
      if (id) {
        if (index.has(id)) invalid("Duplicate patch row id is ambiguous");
        index.set(id, row);
      }
      if (row.get("group") && Array.isArray(row.get("config")))
        rowList(row.get("config"), base);
    }
    return entries;
  };
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      check();
      if (i >= limits.yamlFiles)
        throw inputError(
          "STATIC_INPUT_BUDGET",
          "Patch file count budget exceeded",
        );
      const doc = parseDocument(read(file), {
        uniqueKeys: true,
        schema: "core",
      });
      check();
      if (doc.errors.length || doc.warnings.length)
        invalid("Invalid or unsupported patch YAML");
      inspect(doc.contents);
      const patches = doc.toJS({ mapAsMap: true, maxAliasCount: 0 });
      if (!Array.isArray(patches)) invalid("Patch must be a top-level list");
      for (const patch of patches) {
        check();
        if (!(patch instanceof Map))
          invalid("Patch operation must be a mapping");
        const id = patch.get("id"),
          insert = patch.get("insert");
        if (patch.has("insert")) {
          const target = id ? index.get(id) : null;
          if (id && (!target || !target.get("group"))) {
            uncertain(file, "Insert target is unavailable or not a group");
            continue;
          }
          const added = rowList(insert, path.dirname(file));
          if (target) {
            if (!Array.isArray(target.get("config"))) target.set("config", []);
            target.get("config").push(...added);
          } else rows.push(...added);
          continue;
        }
        const target = id && index.get(id);
        if (!target) {
          uncertain(
            file,
            "Override target is unavailable; name is an assertion, not a mount",
          );
          continue;
        }
        if (
          patch.get("name") &&
          patch.get("name") !== assertionNames.get(target)
        ) {
          uncertain(file, "Override name assertion did not match");
          continue;
        }
        for (const [key, value] of patch) {
          if (["id", "name"].includes(key)) continue;
          if (
            ["group", "disabled"].includes(key) &&
            value !== null &&
            typeof value !== "boolean"
          )
            invalid("Dynamic patch flags cannot establish mounts");
          target.set(key, value);
        }
        // Like the host, config replacements do not reindex new child ids.
        // Relative paths in such replacements use the profile tree, not the
        // patch file's base, so they must not be guessed package-relative.
      }
    } catch (error) {
      complete = false;
      note(
        error.code === "STATIC_INPUT_BUDGET"
          ? "scan-budget-exceeded"
          : "patch-unreadable",
        file,
        error.message,
      );
      return { mounts: [], complete: false };
    }
  }
  const mounts = [];
  const walk = (entries, disabled = false) => {
    for (const row of entries) {
      check();
      if (!(row instanceof Map)) {
        uncertain(null, "Group replacement contains an invalid row");
        continue;
      }
      const name = row.get("name"),
        group = row.get("group") === true;
      if (
        ["group", "disabled"].some(
          (key) =>
            row.has(key) &&
            row.get(key) !== null &&
            typeof row.get(key) !== "boolean",
        )
      ) {
        uncertain(null, "Replacement row flags are not literal booleans");
        continue;
      }
      const blocked = disabled || row.get("disabled") === true;
      if (!group && blocked) continue;
      if (typeof name !== "string") {
        uncertain(null, "Group replacement name is unavailable");
        continue;
      }
      if (name === "cordis:group" && group) {
        const children = row.get("config");
        if (!Array.isArray(children))
          uncertain(null, "Group config is not a literal row list");
        else walk(children, blocked);
      } else if (name.startsWith("cordis:")) {
        uncertain(null, "Builtin subtree semantics are not established");
      } else {
        if (path.isAbsolute(name)) mounts.push(name);
        else if (name.startsWith("file://")) {
          try {
            const url = new URL(name);
            if (url.search || url.hash)
              throw Error("URL modifiers are not established");
            mounts.push(fileURLToPath(url));
          } catch {
            uncertain(null, "File URL mount is not established");
          }
        } else if (name.startsWith("./") || name.startsWith("../")) {
          if (!bases.has(row))
            uncertain(
              null,
              "Relative replacement row depends on the profile base",
            );
          else mounts.push("./" + path.join(bases.get(row), name));
        } else if (name.startsWith("."))
          uncertain(null, "Relative mount depends on the profile base");
        else mounts.push(name);
        if (group)
          uncertain(null, "Custom group descendants are not established");
      }
    }
  };
  try {
    walk(rows);
  } catch (error) {
    note(
      error.code === "STATIC_INPUT_BUDGET"
        ? "scan-budget-exceeded"
        : "patch-unreadable",
      null,
      error.message,
    );
    return { mounts: [], complete: false };
  }
  return { mounts, complete };
}
