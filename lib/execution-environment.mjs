import fs from "node:fs";
import path from "node:path";

/** Private runner state and a minimal inherited environment; not an OS sandbox.
 * PATH still selects trusted executables. Copied profile configuration and
 * explicitly selected local dependencies remain readable by the host/plugin.
 */
export function isolatedEnvironment(root) {
  const env = {};
  for (const key of [
    "PATH",
    "SystemRoot",
    "COMSPEC",
    "PATHEXT",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "TEMP",
    "TMP",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, {
    HOME: path.join(root, "user"),
    USERPROFILE: path.join(root, "user"),
    XDG_CONFIG_HOME: path.join(root, "config"),
    XDG_CACHE_HOME: path.join(root, "cache"),
    DSH_HOME: path.join(root, "home"),
    DSH_AGENTS_HOME: path.join(root, "agents"),
    npm_config_cache: path.join(root, "npm-cache"),
    npm_config_store_dir: path.join(root, "pnpm-store"),
    npm_config_ignore_scripts: "true",
  });
  for (const directory of new Set([
    env.HOME,
    env.XDG_CONFIG_HOME,
    env.XDG_CACHE_HOME,
    env.DSH_HOME,
    env.DSH_AGENTS_HOME,
    env.npm_config_cache,
    env.npm_config_store_dir,
  ]))
    fs.mkdirSync(directory, { mode: 0o700 });
  for (const [key, name] of [
    ["npm_config_userconfig", "npm-user.rc"],
    ["npm_config_globalconfig", "npm-global.rc"],
  ]) {
    env[key] = path.join(root, name);
    fs.writeFileSync(env[key], "", { mode: 0o600, flag: "wx" });
  }
  return env;
}
