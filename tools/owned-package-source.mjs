/** Prepare a private source tree for real prepack hooks without mutating the checkout. */
import fs from "node:fs";
import path from "node:path";

export function prepareOwnedPackageSource(repo, destination) {
  let prettier;
  try {
    const read = (name) =>
      JSON.parse(fs.readFileSync(path.join(repo, name), "utf8"));
    const manifest = read("package.json");
    const lock = read("package-lock.json");
    const installed = read("node_modules/prettier/package.json");
    const version = lock.packages?.["node_modules/prettier"]?.version;
    if (
      typeof version !== "string" ||
      manifest.devDependencies?.prettier !== version ||
      lock.packages?.[""]?.devDependencies?.prettier !== version ||
      installed.name !== "prettier" ||
      installed.version !== version ||
      Object.keys(installed.dependencies || {}).length ||
      Object.keys(installed.optionalDependencies || {}).length
    )
      throw new Error("Build dependency drift");
    prettier = fs.realpathSync(path.join(repo, "node_modules", "prettier"));
  } catch {
    throw new Error(
      "Prettier build dependency is missing or differs from the frozen workspace lock; run npm ci --ignore-scripts before preparing a private package source",
    );
  }
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const name of ["lib", "rules", "plugin", "skill"])
    fs.cpSync(path.join(repo, name), path.join(destination, name), {
      recursive: true,
      filter: (file) =>
        path.basename(file) !== "node_modules" &&
        file !== path.join(repo, "plugin", "kernel"),
    });
  for (const name of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
    fs.copyFileSync(path.join(repo, name), path.join(destination, name));

  // Prettier is a self-contained build dependency. Copy its installed package
  // only into the private workspace, outside plugin/files and the final tgz.
  fs.mkdirSync(path.join(destination, "node_modules"), { mode: 0o700 });
  fs.cpSync(prettier, path.join(destination, "node_modules", "prettier"), {
    recursive: true,
  });
}
