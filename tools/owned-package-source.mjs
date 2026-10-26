/** Prepare a private source tree for real prepack hooks without mutating the checkout. */
import fs from "node:fs";
import path from "node:path";

export function prepareOwnedPackageSource(repo, destination) {
  let dependencies;
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
    for (const name of [
      "esbuild",
      "tailwindcss",
      "postcss",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
    ]) {
      const actual = read(`node_modules/${name}/package.json`);
      const pinned = lock.packages?.[`node_modules/${name}`]?.version;
      if (
        !pinned ||
        manifest.devDependencies?.[name] !== pinned ||
        lock.packages?.[""]?.devDependencies?.[name] !== pinned ||
        actual.version !== pinned ||
        actual.name !== name
      )
        throw Error("Client build dependency drift: " + name);
    }
    dependencies = fs.realpathSync(path.join(repo, "node_modules"));
  } catch {
    throw new Error(
      "Prettier/client build dependencies are missing or differ from the frozen workspace lock; run npm ci --ignore-scripts before preparing a private package source",
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
  for (const name of [
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "package.json",
    "package-lock.json",
  ])
    fs.copyFileSync(path.join(repo, name), path.join(destination, name));

  // Preserve the frozen build closure, including esbuild's platform binary,
  // only in the owned workspace, outside plugin/files and the final tgz.
  fs.cpSync(dependencies, path.join(destination, "node_modules"), {
    recursive: true,
  });
}
