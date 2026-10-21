import path from "node:path";

const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const samePath = (a, b) => path.resolve(a) === path.resolve(b);
export const MAX_OBSERVATION_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Legacy reports authorize only their explicit keys, never missing keys. */
export function normalizeObservation(surface, target = {}) {
  if (surface?.error) throw new Error(`Probe failed: ${String(surface.error)}`);
  const root = Object.create(null),
    notes = [];
  if (surface === null || surface === undefined)
    return { root, notes, bound: false, usable: false };
  if (!object(surface) || !object(surface.root))
    throw new Error("探针报告必须包含对象类型 root");
  const bound = surface.observationVersion === 1;
  if (
    bound &&
    ((target.profileId &&
      (!surface.profileId || !samePath(surface.profileId, target.profileId))) ||
      (target.dshVersion && surface.dshVersion !== target.dshVersion))
  ) {
    notes.push("探针的 profile/DSH 版本与体检对象不匹配，忽略运行时证据");
    return { root, notes, bound, usable: false };
  }
  if (bound) {
    const sampledAt =
      typeof surface.probedAt === "string" ? Date.parse(surface.probedAt) : NaN;
    if (!Number.isFinite(sampledAt)) {
      notes.push("探针采样时间缺失或无效，忽略运行时证据");
      return { root, notes, bound, usable: false };
    }
    const ageMs = Date.now() - sampledAt;
    if (ageMs < -MAX_OBSERVATION_FUTURE_SKEW_MS) {
      notes.push(
        "探针采样时间超出允许的未来时钟偏差（5 分钟），忽略运行时证据",
      );
      return { root, notes, bound, usable: false };
    }
    if (target.maxAgeMs && ageMs > target.maxAgeMs) {
      notes.push("探针采样时间已过期，忽略运行时证据");
      return { root, notes, bound, usable: false };
    }
  }
  if (!bound)
    notes.push(
      "旧格式探针未绑定 profile/DSH 版本；仅使用显式记录的服务，不推断缺项",
    );
  for (const [name, info] of Object.entries(surface.root)) {
    if (!object(info)) throw new Error(`探针服务 ${name} 的记录必须为对象`);
    if (info.methods !== undefined && !object(info.methods))
      throw new Error(`探针服务 ${name}.methods 必须为对象`);
    const status =
      info.error || info.status === "unreadable"
        ? "unreadable"
        : info.status === "unobserved"
          ? "unobserved"
          : info.present === true || info.status === "present"
            ? "present"
            : info.present === false || info.status === "absent"
              ? "absent"
              : "unobserved";
    root[name] = {
      status,
      methods: Object.keys(info.methods || {}),
      complete:
        info.methods !== undefined &&
        info.truncated !== true &&
        info.namesComplete !== false &&
        (info.namesComplete === true || info.complete !== false),
      unknownMethods: Array.isArray(info.unknownMethods)
        ? info.unknownMethods.filter((n) => typeof n === "string")
        : [],
      nonCallableMethods: Array.isArray(info.nonCallableMethods)
        ? info.nonCallableMethods.filter((n) => typeof n === "string")
        : [],
      reason: info.error || null,
    };
  }
  if (surface.entries?.note)
    notes.push(`Loader 覆盖限制：${String(surface.entries.note)}`);
  if (surface.entries?.unmapped?.length)
    notes.push(
      `Loader 有 ${surface.entries.unmapped.length} 个条目无法映射到包名`,
    );
  return {
    root,
    notes,
    bound,
    usable: true,
    probedAt: surface.probedAt ?? null,
    profileId: surface.profileId ?? null,
    dshVersion: surface.dshVersion ?? null,
  };
}

/** Shape inspection reads descriptors; it never invokes service getters. */
export function serviceShape(
  service,
  { maxMethods = 200, maxDepth = 12 } = {},
) {
  const methods = {},
    unknownMethods = [],
    nonCallableMethods = [],
    seen = new Set();
  if (service === null || service === undefined)
    return {
      methods,
      complete: false,
      namesComplete: false,
      truncated: false,
      unknownMethods,
      nonCallableMethods,
    };
  let obj = Object(service),
    depth = 0,
    truncated = false;
  while (obj) {
    if (depth++ >= maxDepth) {
      truncated = true;
      break;
    }
    for (const key of Object.getOwnPropertyNames(obj)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) {
        unknownMethods.push(key);
        continue;
      }
      if (typeof descriptor.value === "function") {
        if (Object.keys(methods).length >= maxMethods) {
          truncated = true;
          continue;
        }
        Object.defineProperty(methods, key, {
          value: "function",
          enumerable: true,
        });
      } else if (descriptor.value !== null && descriptor.value !== undefined)
        nonCallableMethods.push(key);
    }
    obj = Object.getPrototypeOf(obj);
  }
  return {
    methods,
    complete: !truncated && unknownMethods.length === 0,
    namesComplete: !truncated,
    truncated,
    unknownMethods,
    nonCallableMethods,
  };
}

export function sampleServices(
  ctx,
  names,
  { profileId = null, dshVersion = null } = {},
) {
  const root = Object.create(null);
  for (const name of [...new Set(names)].sort()) {
    try {
      const value =
        typeof ctx.get === "function" ? ctx.get(name, false) : ctx[name];
      root[name] =
        value === undefined
          ? { present: false, status: "absent" }
          : value === null
            ? {
                present: true,
                status: "unreadable",
                error:
                  "Service value is null; dependency presence is not proven",
              }
            : { present: true, status: "present", ...serviceShape(value) };
    } catch {
      root[name] = {
        status: "unreadable",
        error: "Service structure could not be read",
      };
    }
  }
  return {
    observationVersion: 1,
    probedAt: new Date().toISOString(),
    profileId,
    dshVersion,
    wanted: Object.keys(root),
    root,
  };
}
