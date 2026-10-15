/** Static package inventory and public extraction/report adapter. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeSources } from "./source-analysis.mjs";
import {
  collectPackageSources,
  clientEntry as declaredClientEntry,
} from "./source-graph.mjs";
const { join, dirname, resolve } = path;
const cmp = (a, b) =>
  String(a ?? "") < String(b ?? "")
    ? -1
    : String(a ?? "") > String(b ?? "")
      ? 1
      : 0;
const pkgJson = (dir) => {
  try {
    const p = JSON.parse(fs.readFileSync(join(dir, "package.json"), "utf8"));
    return p && typeof p === "object" && !Array.isArray(p) ? p : null;
  } catch {
    return null;
  }
};
const sortCalls = (calls) =>
  Object.fromEntries(
    [...calls]
      .sort(([a], [b]) => cmp(a, b))
      .map(([s, ms]) => [s, [...ms].sort()]),
  );
function clientHalfDeliverable(pkgDir, j) {
  const client = j.dsh?.client;
  if (!client) return { declared: false, ok: null, why: null };
  if (client.platform !== "web")
    return {
      declared: true,
      platform: client.platform ?? null,
      ok: null,
      why: "Only web platform is loaded",
    };
  const entry = declaredClientEntry(j);
  if (!entry)
    return {
      declared: true,
      platform: "web",
      ok: false,
      declaredEntry: null,
      why: '声明了 dsh.client 却没有 exports["./client"]',
    };
  try {
    const root = fs.realpathSync(pkgDir),
      file = fs.realpathSync(join(root, entry));
    const inside =
      file.startsWith(root + path.sep) && fs.statSync(file).isFile();
    return {
      declared: true,
      platform: "web",
      ok: inside,
      declaredEntry: entry,
      why: inside ? null : "客户端入口不在包根内或不是文件",
    };
  } catch {
    return {
      declared: true,
      platform: "web",
      ok: false,
      declaredEntry: entry,
      why: `客户端入口 ${entry} 不存在或不可读`,
    };
  }
}
const KNOWN_CLIENT = new Set([
  "slots",
  "locale",
  "uiRenderer",
  "uiSlots",
  "themeStore",
  "modules",
  "clientModules",
  "connection",
]);
function clientHint(svc, files) {
  return (
    KNOWN_CLIENT.has(svc) ||
    [...files].some((f) => f.toLowerCase().includes("client"))
  );
}
export function extractWithProvenance(nm, options = {}) {
  // 官方双端 API 目录里出现过的服务名。用途**只有一个**：给「裸名/别名」这两条
  // 证据较弱的匹配规则划定边界（见 makeKnownService）。它**不参与**「服务存不存在」
  // 的判定 —— 那份判断需要运行时面或目录正文，不是一份名字清单能替代的。
  const catalogNames = new Set([
    ...Object.keys(options.catalog?.host || {}),
    ...Object.keys(options.catalog?.client || {}),
  ]);
  // 找出「社区插件」：package.json 里有 dsh 清单、且非 @deepseek-ai 官方
  const inventoryDiagnostics = [];
  const targets = [];
  for (const entry of fs.readdirSync(nm).sort()) {
    const names = entry.startsWith("@")
      ? (() => {
          try {
            return fs
              .readdirSync(join(nm, entry))
              .sort()
              .map((s) => join(entry, s));
          } catch (error) {
            throw new Error(
              `无法读取插件 scope ${entry}：${error.code || error.message}`,
            );
          }
        })()
      : [entry];
    for (const base of names) {
      const full = join(nm, base);
      const j = pkgJson(full);
      if (!j && fs.existsSync(join(full, "package.json")))
        inventoryDiagnostics.push({
          kind: "invalid-package-metadata",
          file: base,
        });
      if (
        !j ||
        !("dsh" in j) ||
        String(j.name ?? "").startsWith("@deepseek-ai/")
      )
        continue;
      targets.push([base, full, j]);
    }
  }

  const services = new Set();
  const calls = new Map();
  const manifests = [];
  const svcFiles = new Map();
  const fallbackPkgs = [];
  // ── v2 新增的累积量 ──
  const perPlugin = Object.create(null); // 权威视图：逐插件归属
  const providedAll = new Set(); // 所有插件自己 provide 出来的服务名
  const allSites = []; // 全局调用点（带 file:line）
  const provenance = {
    schemaVersion: 1,
    note:
      "每个被扫描文件的来源分桶。client-extra = 同包内其它「像客户端」的文件（可能是懒加载 chunk），" +
      "它们的调用点应当标为「疑似」而不是「确定」。skippedClientExtra = 被默认规则排除的文件（包内 src/ 源码树），" +
      '记下来是为了可审计：空谈"排了什么"没有意义，要能逐条查。',
    packages: Object.create(null),
  };

  const addCall = (svc, method) => {
    if (!calls.has(svc)) calls.set(svc, new Set());
    calls.get(svc).add(method);
  };

  for (const [, full, j] of targets) {
    const dsh = j.dsh || {};
    const client = dsh.client || {};
    // 注意：这里必须把 undefined 归一成 null。python 的 json.dump 会把缺失值写成
    // null，而 JSON.stringify **直接省略** undefined 的键 —— 对拍一开始就是被这个
    // 抓到的（三个字段只在 python 版出现）。
    manifests.push({
      name: j.name ?? null,
      version: j.version ?? null,
      dshBundle: Boolean(dsh.bundle),
      clientPlatform: client.platform ?? null,
      clientInject: client.inject ?? null,
      peerDependencies: j.peerDependencies ?? null,
      // ⚠️ `manifests` 是对拍严格比对的**旧兼容视图**，不要往里加新字段 ——
      // engines / compatibility 放在 perPlugin 里（对拍只严格比 manifests/services/fallbackPackages，
      // 加了新键会让对拍报"只在 node 版出现"）。这条是踩过的：加完当场被对拍抓住。
    });

    const [
      blob,
      fellBack,
      buckets,
      skipped,
      graphDiagnostics,
      fileSides,
      entryFiles,
      moduleLinks,
    ] = collectPackageSources(full, j, options);
    if (fellBack) fallbackPkgs.push(j.name || full);

    const byBucket = {
      "host-entry": [],
      "client-entry": [],
      "client-extra": [],
      fallback: [],
    };
    for (const [rel, bucket] of buckets) byBucket[bucket].push(rel);
    for (const k of Object.keys(byBucket)) byBucket[k].sort();
    provenance.packages[j.name || full] = {
      declaredClientEntry: declaredClientEntry(j),
      fallback: fellBack,
      counts: Object.fromEntries(
        Object.entries(byBucket).map(([k, v]) => [k, v.length]),
      ),
      files: byBucket,
      // 跳过的文件必须记下来：否则以后没人说得清"到底排了什么"
      skippedClientExtra: skipped.sort(),
    };

    // ── 逐插件归属（A6）+ 行号（A7）+ 插件自有服务（A5 的数据基础）──
    const scanned = analyzeSources(
      blob,
      catalogNames,
      j.name || full,
      fileSides,
      entryFiles,
      moduleLinks,
    );
    for (const s of scanned.services) services.add(s);
    for (const [s, files] of scanned.serviceFiles) {
      if (!svcFiles.has(s)) svcFiles.set(s, new Set());
      for (const f of files) svcFiles.get(s).add(f);
    }
    for (const [s, ms] of scanned.calls) for (const m of ms) addCall(s, m);
    for (const s of scanned.provided) providedAll.add(s);
    for (const s of scanned.sites) allSites.push(s);

    const pkgName = j.name || full;
    perPlugin[pkgName] = {
      name: j.name ?? null,
      version: j.version ?? null,
      dshBundle: Boolean(dsh.bundle),
      clientPlatform: client.platform ?? null,
      // H1' 的宿主侧那一半：声明了客户端半边，那半边真的端得出来吗。
      // ⚠️ 只放 perPlugin —— `manifests` 是对拍严格比对的旧兼容视图，
      // 往里加新键会当场被对拍抓住（这条踩过，见上面的注释）。
      clientHalf: clientHalfDeliverable(full, j),
      clientInject: client.inject ?? null,
      peerDependencies: j.peerDependencies ?? null,
      // 声明的兼容性口径（第 8 题：「声明与实测不符」这一类结论的输入）
      engines: j.engines ?? null,
      compatibility: dsh.compatibility ?? null,
      declaredClientEntry: declaredClientEntry(j),
      fallback: fellBack,
      files: byBucket,
      fileSides,
      entryFiles,
      dependencies: scanned.dependencies,
      diagnostics: [...graphDiagnostics, ...scanned.diagnostics],
      services: [...scanned.services].sort(),
      // 哪些服务来自可信声明（inject / ctx.inject / ctx.get）—— 确定性分档用
      declaredServices: [...scanned.declared].sort(),
      // 其中通过 ctx.get() 软取的（允许缺失的那一类）
      softDeclaredServices: [...scanned.softDeclared].sort(),
      // 「可被点号调用」的服务名 —— 与 services 的差集就是「仅出现过名字但没有可验证调用」的服务。
      // 记下来是因为 `services` 与 `calls` 的键集合不相等时会被误读成 bug，而它其实是设计。
      addressableServices: [...scanned.addressable].sort(),
      calls: sortCalls(scanned.calls),
      callSites: scanned.sites,
      providedServices: [...scanned.provided].sort(),
      // 变量名 → 服务名 的绑定表。调用点上的 via='alias' 必须能在这里找到解释；
      // 这也是「为什么这个调用点算在它头上」的可审计证据。
      localBindings: scanned.bindings,
      // 因「服务名被同名局部变量遮蔽」而弃权的裸名匹配。空谈"放弃了什么"没有意义，要能逐条查。
      shadowedBare: scanned.shadowedBare,
      unresolvedBindings: scanned.unresolvedBindings,
      subContexts: scanned.subContexts,
      // 「作者自己做了能力检测」的 service.method 对 —— 判定层据此**不报**，
      // 因为报出来就是假阳性（用户并没失去任何东西）。见 guardRegex。
      guardedPairs: scanned.guardedPairs,
      unguardedPairs: scanned.unguardedPairs,
      // 因为「同名变量绑定了多个服务」而被弃权的别名调用点。
      // 记下来是为了可审计：弃权也要有据可查，而不是静默丢掉。
      ambiguousAliases: scanned.ambiguousAliases,
      // 服务名 → 出现在哪些文件。判定层据此判断某个服务是宿主侧还是客户端侧
      // （只看客户端桶的文件 = 客户端服务），比按名字猜可靠得多。
      serviceFiles: Object.fromEntries(
        [...scanned.serviceFiles.entries()]
          .sort()
          .map(([k, v]) => [k, [...v].sort()]),
      ),
      clientHints: Object.fromEntries(
        [...scanned.services]
          .sort()
          .map((s) => [
            s,
            clientHint(s, scanned.serviceFiles.get(s) || new Set()),
          ]),
      ),
    };
  }

  const clientHints = {};
  for (const s of [...services].sort())
    clientHints[s] = clientHint(s, svcFiles.get(s) || new Set());

  return {
    report: {
      schemaVersion: 2,
      diagnostics: inventoryDiagnostics,
      scanComplete:
        inventoryDiagnostics.length === 0 &&
        Object.values(perPlugin).every(
          (p) => !p.diagnostics.some((d) => d.kind !== "entry-fallback"),
        ),
      manifests,
      services: [...services].sort(),
      clientHints,
      calls: sortCalls(calls),
      fallbackPackages: fallbackPkgs,
      // ── v2 新增 ──
      // perPlugin 是权威视图：谁用了什么、在哪一行、哪些是它自己提供的
      perPlugin,
      // 全局调用点（带 file:line 与来源桶），供面板与工具直接消费
      // 排序必须带 plugin：探针实测两个包都有 lib/index.js 时，两条调用点都是
      // {file:"lib/index.js",line:1} —— **按 file+line 定位会取到错插件的源码**。
      // 「位置」正是本工具的核心产物之一，所以 plugin 必须进排序键。
      callSites: allSites.sort(
        (a, b) =>
          cmp(a.plugin, b.plugin) ||
          cmp(a.file, b.file) ||
          (a.line ?? 0) - (b.line ?? 0) ||
          cmp(a.service, b.service) ||
          cmp(a.method, b.method),
      ),
      // 全部插件自己 provide 出来的服务名 —— 它们不该被当成宿主服务来判缺失
      providedServices: [...providedAll].sort(),
    },
    provenance,
  };
}

export function extract(nm) {
  return extractWithProvenance(nm).report;
}
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [nm, workdir] = process.argv.slice(2);
  if (!nm || !workdir) {
    console.error("用法: node lib/extract.mjs <node_modules 目录> <输出目录>");
    process.exit(2);
  }
  try {
    const catalog = JSON.parse(
      fs.readFileSync(join(REPO_ROOT, "rules/dsh-api-catalog.json"), "utf8"),
    );
    const { report, provenance } = extractWithProvenance(nm, { catalog });
    fs.mkdirSync(workdir, { recursive: true });
    for (const [file, data] of [
      ["static.json", report],
      ["services.json", { services: report.services }],
      ["provenance.json", provenance],
    ])
      fs.writeFileSync(join(workdir, file), JSON.stringify(data, null, 2));
    for (const m of report.manifests)
      console.log(
        `插件: ${m.name}@${m.version} bundle=${m.dshBundle} client=${m.clientPlatform}`,
      );
    console.log(
      `提取到 ${report.services.length} 个服务引用；${report.callSites.length} 个调用点`,
    );
  } catch (error) {
    console.error(`静态提取失败: ${error.message}`);
    process.exitCode = 3;
  }
}
