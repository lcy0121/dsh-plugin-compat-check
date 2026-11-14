import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

function executable(name, searchPath) {
  for (const directory of searchPath.split(path.delimiter)) {
    if (!directory) continue;
    try {
      const file = fs.realpathSync(path.join(directory, name));
      if (!fs.statSync(file).isFile()) continue;
      fs.accessSync(file, fs.constants.X_OK);
      return file;
    } catch {}
  }
  return null;
}

/** Match the selected PATH launcher; never borrow an unrelated installed app. */
export function hostRuntimeDriver({
  env,
  runtimeOnly = false,
  platform = process.platform,
  macRoot = "/Applications/DeepSeek Harness.app/Contents",
}) {
  const cli = executable("dsh", env.PATH || "");
  if (!cli) throw Error("Cannot locate selected dsh launcher");
  if (fs.existsSync(macRoot)) macRoot = fs.realpathSync(macRoot);
  const relative = path.relative(macRoot, cli);
  if (
    platform === "darwin" &&
    relative !== ".." &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  ) {
    const asar = path.join(macRoot, "Resources/app.asar");
    if (!fs.statSync(asar).isFile())
      throw Error("Selected Desktop ASAR missing");
    return {
      command: path.join(macRoot, "MacOS/DeepSeek Harness"),
      args: ["--expose-internals"],
      module: path.join(
        asar,
        "dsh/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js",
      ),
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
      cli,
    };
  }
  const node = executable("node", env.PATH || "") || process.execPath;
  const selected = { command: node, args: ["--expose-internals"], env, cli };
  // Runtime queries must also work for the owned cancellation-test launcher.
  if (runtimeOnly) return selected;
  try {
    const module = createRequire(cli).resolve("@deepseek-ai/dsh-app-boot");
    if (!fs.statSync(module).isFile()) throw Error("Selected module missing");
    return { ...selected, module };
  } catch {
    throw Error("Selected launcher has no official app-boot module");
  }
}
