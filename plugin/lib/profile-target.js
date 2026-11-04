import path from "node:path";
import { homedir } from "node:os";
import { existsSync as exists } from "node:fs";

/** Resolve running identity conservatively. Loader context is deliberately not trusted. */
export function resolveProfileTarget({
  requestedProfile = null,
  argv = process.argv,
  env = process.env,
  platform = process.platform,
  home = homedir(),
  modulePath = null,
  existsSync = exists,
} = {}) {
  const windows =
    platform === "win32" ||
    argv.some((a) => /^(?:[A-Za-z]:\\|\\\\)/.test(String(a)));
  const p = windows ? path.win32 : path.posix;
  const homeDir = env.DSH_HOME || p.join(home, ".dsh");
  const fail = (why) => ({
    dir: null,
    why: `${why}；请显式指定 profile：compat_check({profile:"名称"})，或 CLI --nm <profile/node_modules>`,
  });
  const valid = (n) =>
    typeof n === "string" && /^[\w.-]+$/.test(n) && n !== "." && n !== "..";
  const finish = (name, root, why) => {
    if (!valid(name)) return fail("profile 名称非法");
    const dir = p.join(root, "node_modules");
    return existsSync(dir)
      ? { dir, why }
      : fail("指定 profile 不存在: " + name);
  };
  if (requestedProfile !== null && requestedProfile !== undefined)
    return finish(
      requestedProfile,
      p.join(homeDir, "profiles", String(requestedProfile)),
      "请求明确指定的 profile " + requestedProfile,
    );
  const evidence = [];
  for (let i = 0; i < argv.length; i++) {
    const a = String(argv[i]);
    const inline = /^--profile=(.*)$/.exec(a);
    if (inline) evidence.push({ name: inline[1] });
    else if (a === "--profile") {
      if (argv[i + 1] && !String(argv[i + 1]).startsWith("-"))
        evidence.push({ name: argv[++i] });
      else return fail("无法确认当前 profile：--profile 缺少名称");
    } else if (p.isAbsolute(a)) {
      const m =
        /^(.*[\\/]profiles[\\/]([^\\/]+))(?:[\\/]node_modules(?:[\\/].*)?|[\\/]?)$/.exec(
          a,
        );
      if (m) evidence.push({ name: m[2], root: p.normalize(m[1]) });
    }
  }
  const names = new Set(
    evidence.map((e) => (windows ? e.name?.toLowerCase() : e.name)),
  );
  const roots = new Set(
    evidence
      .filter((e) => e.root)
      .map((e) => (windows ? e.root.toLowerCase() : e.root)),
  );
  if (names.size > 1 || roots.size > 1)
    return fail("当前 profile 身份存在冲突");
  if (evidence.length) {
    const e = evidence.find((e) => e.root) || evidence[0];
    return finish(
      e.name,
      e.root || p.join(homeDir, "profiles", String(e.name)),
      (e.root
        ? "process.argv 的 profile 路径 "
        : "process.argv 的当前 profile ") + (e.root || e.name),
    );
  }
  if (env.DSC_PROFILE)
    return finish(
      env.DSC_PROFILE,
      p.join(homeDir, "profiles", env.DSC_PROFILE),
      "DSC_PROFILE=" + env.DSC_PROFILE,
    );
  // Installation is corroboration only: never equate a shared/global package with a running instance.
  const hints = ["DSH_PROFILE", "DSH_ACTIVE_PROFILE", "DSH_PROFILE_NAME"]
    .map((k) => env[k])
    .filter(Boolean);
  if (new Set(hints).size > 1) return fail("profile 环境变量存在冲突");
  if (hints.length && valid(hints[0]) && modulePath) {
    const root = p.join(homeDir, "profiles", hints[0]);
    const prefix = p.join(root, "node_modules") + p.sep;
    if (p.normalize(modulePath).startsWith(prefix))
      return finish(hints[0], root, "环境 profile 与当前安装位置相互印证");
  }
  return fail("无法确认当前 profile");
}

/** Identity inference is independent of whether node_modules currently exists. */
export function resolveProfileIdentity(options = {}) {
  const target = resolveProfileTarget({ ...options, existsSync: () => true });
  const name = target.dir
    ? target.dir.replace(/\\/g, "/").split("/").at(-2)
    : null;
  return { name, why: target.why };
}
