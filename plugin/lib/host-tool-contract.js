/** JSON arguments, output schema and strict serialization for compat_check. */
import { SUPPORTED_PREVIEW_VERSIONS } from "./upgrade-contract.js";

export function strictToolJson(value, location = "$", ancestors = new Set()) {
  const reject = (reason) => {
    throw new TypeError(`Invalid JSON tool evidence at ${location}: ${reason}`);
  };
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) reject("non-finite number");
    return value;
  }
  if (typeof value !== "object") reject(typeof value);
  if (ancestors.has(value)) reject("cycle");
  if (
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) !== "[object Object]"
  )
    reject("special object");
  if (!Array.isArray(value)) {
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && Object.getPrototypeOf(proto) !== null)
      reject("custom prototype");
  }
  ancestors.add(value);
  const copy = Array.isArray(value) ? [] : {};
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === "length") continue;
    if (typeof key !== "string") reject("symbol key");
    if (
      Array.isArray(value) &&
      (!/^(0|[1-9][0-9]*)$/.test(key) ||
        Number(key) >= value.length ||
        Number(key) >= 4294967295)
    )
      reject("non-index array property");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value"))
      reject("hidden or accessor property");
    Object.defineProperty(copy, key, {
      value: strictToolJson(descriptor.value, `${location}.${key}`, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++)
      if (!Object.hasOwn(value, i)) reject("sparse array");
  }
  ancestors.delete(value);
  return copy;
}

export function toolResult(compat, text) {
  const s = compat.report?.summary || {};
  return strictToolJson({
    schemaVersion: 1,
    kind: "plugin-compat-check/tool-result",
    ok: compat.ok,
    error: compat.error ?? null,
    toolVersion: compat.toolVersion ?? null,
    exitCode: compat.exitCode,
    report: compat.report ?? null,
    baseline: compat.baseline ?? null,
    cache: compat.cache || null,
    reviews: compat.reviews || null,
    summary: compat.ok
      ? `可用 ${s.ok || 0} / 部分可用 ${s.partial || 0} / 不兼容 ${s.broken || 0}；覆盖有限 ${s.limited || 0}；无已验证调用 ${s.vacuousOk || 0}`
      : "无法判定",
    nodeModules: compat.nodeModules || "",
    hasRuntimeSurface: !!compat.report?.hasRuntimeSurface,
    text,
  });
}

export function toolSchemas() {
  return {
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        upgradeTo: {
          type: "string",
          description:
            "Optional exact target DSH version for static upgrade preflight; known catalogues: " +
            SUPPORTED_PREVIEW_VERSIONS.join(", ") +
            ". Unknown versions are uncertified.",
        },
        profile: {
          type: "string",
          description:
            'Optional profile name to inspect (e.g. "desktop"). Defaults to the profile this ' +
            "DSH instance is running when it can be determined. An explicit profile is required otherwise; no profile is guessed.",
        },
      },
    },
    output: {
      // ⚠️ **工具 DSL 不是 JSON Schema**：`required` 是**顶层数组**，
      // 不是每个属性上的 `required: true`。写成后者会被宿主直接拒掉，
      // 报 `schema.properties.X.required is not supported on type "string"`。
      // 实测踩过：注册失败、工具不存在，而**面板与路由照常工作** ——
      // 所以只有真的去调一次工具才发现得了。
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          schemaVersion: { type: "integer", enum: [1] },
          kind: { type: "string" },
          ok: { type: "boolean" },
          error: { oneOf: [{ type: "string" }, { type: "null" }] },
          exitCode: { type: "integer", enum: [0, 1, 2, 3] },
          toolVersion: { oneOf: [{ type: "string" }, { type: "null" }] },
          report: {
            oneOf: [
              { type: "object", additionalProperties: true },
              { type: "null" },
            ],
          },
          upgradePreview: { type: "object", additionalProperties: true },
          baseline: {
            oneOf: [
              { type: "object", additionalProperties: true },
              { type: "null" },
            ],
          },
          cache: {
            oneOf: [
              { type: "object", additionalProperties: true },
              { type: "null" },
            ],
          },
          reviews: {
            oneOf: [
              { type: "object", additionalProperties: true },
              { type: "null" },
            ],
          },
          summary: { type: "string" },
          nodeModules: { type: "string" },
          hasRuntimeSurface: { type: "boolean" },
          text: { type: "string" },
        },
        required: [
          "schemaVersion",
          "kind",
          "ok",
          "error",
          "exitCode",
          "toolVersion",
          "report",
          "baseline",
          "summary",
          "nodeModules",
          "hasRuntimeSurface",
          "text",
        ],
      },
      render: (_args, value) => [
        {
          type: "text",
          text: value && typeof value.text === "string" ? value.text : "",
        },
      ],
    },
  };
}
