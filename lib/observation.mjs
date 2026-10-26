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
  let collectionNote;
  if (surface.sampling?.truncated === true) {
    const budget =
      {
        services: "服务数量",
        properties: "总属性条目",
        bytes: "总输出字节",
        duration: "总采样耗时",
        inventory: "输入条目",
      }[surface.sampling.reason] || "总量";
    collectionNote = `运行时服务采样已截断（${budget}预算）；未采样服务保持未知`;
    notes.push(collectionNote);
  }
  for (const [name, info] of Object.entries(surface.root)) {
    if (!object(info)) throw new Error(`探针服务 ${name} 的记录必须为对象`);
    if (info.methods !== undefined && !object(info.methods))
      throw new Error(`探针服务 ${name}.methods 必须为对象`);
    let samplingNote;
    if (info.truncated === true) {
      const budget =
        {
          properties: "属性总数",
          bytes: "输出字节",
          duration: "采样耗时",
          methods: "方法数",
          depth: "原型深度",
        }[info.budgetReason] || "覆盖";
      samplingNote = `运行时服务 ${name} 的结构采样已截断（${budget}预算）；未采样方法保持未知`;
      notes.push(samplingNote);
    }
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
      ...(samplingNote ? { samplingNote } : {}),
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
    ...(collectionNote ? { collectionNote } : {}),
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
  {
    maxMethods = 200,
    maxDepth = 12,
    maxProperties = 1000,
    maxBytes = 65536,
    onProperty,
    maxDurationMs = 25,
    clock = () => performance.now(),
  } = {},
) {
  for (const [value, min, cap] of [
    [maxMethods, 1, 200],
    [maxDepth, 1, 12],
    [maxProperties, 1, 1000],
    [maxBytes, 512, 65536],
  ])
    if (!Number.isSafeInteger(value) || value < min || value > cap)
      throw new Error("Invalid service sampling budget");
  if (
    !Number.isFinite(maxDurationMs) ||
    maxDurationMs <= 0 ||
    maxDurationMs > 25
  )
    throw new Error("Invalid service sampling duration");
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
  const started = clock();
  // Reserve space for fixed JSON fields, counters and any budget reason. Names
  // account for their JSON escaping and UTF-8 encoding before being retained.
  let bytes = 256,
    properties = 0,
    methodCount = 0,
    depth = 0,
    budgetReason = null;
  let obj = Object(service);
  sampling: while (obj) {
    if (clock() - started >= maxDurationMs) {
      budgetReason = "duration";
      break;
    }
    if (depth++ >= maxDepth) {
      budgetReason = "depth";
      break;
    }
    const keys = Object.getOwnPropertyNames(obj);
    for (const key of keys) {
      if (clock() - started >= maxDurationMs) {
        budgetReason = "duration";
        break sampling;
      }
      if (properties >= maxProperties) {
        budgetReason = "properties";
        break sampling;
      }
      properties++;
      onProperty?.();
      if (seen.has(key)) continue;
      seen.add(key);
      const descriptor = Object.getOwnPropertyDescriptor(obj, key);
      if (!descriptor) continue;
      const accessor = !("value" in descriptor),
        method = !accessor && typeof descriptor.value === "function";
      if (method && methodCount >= maxMethods) {
        budgetReason = "methods";
        break sampling;
      }
      if (
        !accessor &&
        !method &&
        (descriptor.value === null || descriptor.value === undefined)
      )
        continue;
      const cost =
        Buffer.byteLength(JSON.stringify(key), "utf8") + (method ? 12 : 1);
      if (bytes + cost > maxBytes) {
        budgetReason = "bytes";
        break sampling;
      }
      bytes += cost;
      if (accessor) unknownMethods.push(key);
      else if (method) {
        Object.defineProperty(methods, key, {
          value: "function",
          enumerable: true,
        });
        methodCount++;
      } else nonCallableMethods.push(key);
    }
    obj = Object.getPrototypeOf(obj);
  }
  const truncated = budgetReason !== null;
  return {
    methods,
    complete: !truncated && unknownMethods.length === 0,
    namesComplete: !truncated,
    truncated,
    unknownMethods,
    nonCallableMethods,
    budgetReason,
    sampledProperties: properties,
  };
}

export function sampleServices(
  ctx,
  names,
  {
    profileId = null,
    dshVersion = null,
    maxServices = 1000,
    maxProperties = 10000,
    maxBytes = 1048576,
    maxDurationMs = 100,
    clock = () => performance.now(),
  } = {},
) {
  if (
    !Number.isSafeInteger(maxServices) ||
    maxServices < 1 ||
    maxServices > 1000 ||
    !Number.isSafeInteger(maxProperties) ||
    maxProperties < 1 ||
    maxProperties > 10000 ||
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 512 ||
    maxBytes > 1048576 ||
    !Number.isFinite(maxDurationMs) ||
    maxDurationMs <= 0 ||
    maxDurationMs > 100
  )
    throw new Error("Invalid aggregate sampling budget");
  const root = Object.create(null),
    sampling = {
      truncated: false,
      reason: null,
      sampledServices: 0,
      sampledProperties: 0,
      maxServices,
      maxProperties,
      maxBytes,
      maxDurationMs,
    };
  const result = {
    observationVersion: 1,
    probedAt: new Date().toISOString(),
    profileId,
    dshVersion,
    root,
    wanted: [],
    sampling,
  };
  let bytes = Buffer.byteLength(JSON.stringify(result), "utf8") + 256;
  if (bytes > maxBytes) throw new Error("采样身份超过输出字节预算");
  const started = clock(),
    selected = new Set();
  let reason = null,
    inputs = 0;
  for (const name of names) {
    if (clock() - started >= maxDurationMs) {
      reason = "duration";
      break;
    }
    if (++inputs > 50000 || typeof name !== "string") {
      reason = "inventory";
      break;
    }
    if (selected.has(name)) continue;
    if (selected.size >= maxServices) {
      reason = "services";
      break;
    }
    selected.add(name);
  }
  for (const name of [...selected].sort()) {
    if (sampling.sampledProperties >= maxProperties) {
      reason = "properties";
      break;
    }
    const remaining = maxDurationMs - (clock() - started);
    if (remaining <= 0) {
      reason = "duration";
      break;
    }
    let record;
    try {
      const value =
        typeof ctx.get === "function" ? ctx.get(name, false) : ctx[name];
      const reflectionBudget = maxDurationMs - (clock() - started);
      if (reflectionBudget <= 0) {
        reason = "duration";
        break;
      }
      record =
        value === undefined
          ? { present: false, status: "absent" }
          : value === null
            ? {
                present: true,
                status: "unreadable",
                error:
                  "Service value is null; dependency presence is not proven",
              }
            : {
                present: true,
                status: "present",
                ...serviceShape(value, {
                  clock,
                  onProperty: () => {
                    sampling.sampledProperties++;
                  },
                  maxProperties: Math.min(
                    1000,
                    maxProperties - sampling.sampledProperties,
                  ),
                  maxDurationMs: Math.min(25, reflectionBudget),
                }),
              };
    } catch {
      record = {
        status: "unreadable",
        error: "Service structure could not be read",
      };
    }
    const cost =
      2 * Buffer.byteLength(JSON.stringify(name), "utf8") +
      Buffer.byteLength(JSON.stringify(record), "utf8") +
      3;
    if (bytes + cost > maxBytes) {
      reason = "bytes";
      break;
    }
    bytes += cost;
    root[name] = record;
    result.wanted.push(name);
  }
  sampling.sampledServices = result.wanted.length;
  sampling.truncated = reason !== null;
  sampling.reason = reason;
  return result;
}
