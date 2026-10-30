import {
  REASONING_SLOT_NOTICE,
  SLOT_UNKNOWN_NOTICE,
  SLOT_UNREVIEWED_NOTICE,
} from "./finding-guidance.mjs";
/** Small, version-bound semantic checks. No plugin execution or argument contents. */
// Source-reviewed semantics are independent of catalogue/runtime certification.
// This explicit allowlist must not grow from a target's claimed version.
export const SEMANTIC_VERSIONS = Object.freeze([
  "0.2.1-rc.2",
  "0.2.1-rc.3",
  "0.2.1-rc.5",
]);
export const isSlotRegistration = (service, method) =>
  service === "slots" && method === "register";
const policyValues = new Set(["keep", "replace", "append"]);
const optionNames = [
  "prompt",
  "agentPreset",
  "clearPreviousDraft",
  "whenDraftExists",
];
export const semanticTarget = (service, method) =>
  (service === "uiWorkspace" && method === "startSession") ||
  (service === "timer" && ["setTimeout", "setInterval"].includes(method)) ||
  (service === "sessions" && method === "retain");
const unknown = () => ({ kind: "unknown" });
function scalar(value, name, generation) {
  if (value?.kind !== "constant" || value.semanticGeneration !== generation)
    return unknown();
  const kind = typeof value.value;
  if (!["string", "number", "boolean"].includes(kind)) return unknown();
  return {
    kind,
    ...(name === "whenDraftExists" && kind === "string"
      ? { policy: policyValues.has(value.value) ? value.value : "invalid" }
      : name === "clearPreviousDraft" && kind === "boolean"
        ? { enabled: value.value }
        : {}),
  };
}
/** Called after all argument expressions; copies facts, never mutable references. */
export function captureSemanticArguments(
  service,
  method,
  values,
  nodes,
  unboundUndefined,
  generation,
) {
  if (isSlotRegistration(service, method)) {
    const options = values[0];
    const name =
      options?.kind === "object" &&
      !options.opaque &&
      options.semanticGeneration === generation
        ? options.fields.get("name")
        : null;
    if (
      nodes.some((n) => n.type === "SpreadElement") ||
      name?.kind !== "constant" ||
      name.semanticGeneration !== generation ||
      typeof name.value !== "string"
    )
      return unknown();
    // Persist only a fixed enum, never a user-selected name or callback body.
    return {
      kind:
        name.value === "conversation.chat.reasoning.body"
          ? "reasoning-body"
          : "other-slot",
    };
  }
  if (service !== "uiWorkspace" || method !== "startSession") return null;
  if (nodes.some((node) => node.type === "SpreadElement")) return unknown();
  const value = values[1],
    node = nodes[1];
  if (!node || unboundUndefined(node)) return { kind: "omitted" };
  if (
    value?.kind !== "object" ||
    value.opaque ||
    value.semanticGeneration !== generation
  )
    return unknown();
  const fields = Object.create(null);
  for (const name of optionNames)
    if (value.fields.has(name))
      fields[name] = scalar(value.fields.get(name), name, generation);
  return { kind: "options", fields };
}
export function mergeSemanticArguments(a, b) {
  return JSON.stringify(a) === JSON.stringify(b) ? a : unknown();
}

const record = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
/** Metadata governance, not a substitute for source review or runtime acceptance. */
export function validateSemanticBaselines(rules) {
  const group = rules.apiSemantics;
  if (!record(group) || group.schemaVersion !== 1 || !record(group.baselines))
    return ["Invalid semantic baseline schema"];
  const errors = [],
    versions = SEMANTIC_VERSIONS;
  const entries = Object.entries(group.baselines);
  if (!entries.length || entries.length > versions.length)
    return ["Invalid semantic version count"];
  for (const [version, b] of entries) {
    if (
      !versions.includes(version) ||
      !record(b) ||
      b.sourceTag !== "dsh-v" + version ||
      !digest(b.sourceArchiveSha256) ||
      !record(b.sources) ||
      Object.keys(b.sources).length > 16 ||
      !Object.keys(b.sources).length ||
      Object.entries(b.sources).some(
        ([p, h]) =>
          !/^packages\/(?:[a-z0-9-]+\/)+[a-z0-9-]+\.ts$/.test(p) || !digest(h),
      ) ||
      !record(b.startSession) ||
      !Object.hasOwn(b.sources, b.startSession.source) ||
      !record(b.startSession.options) ||
      !Object.keys(b.startSession.options).length ||
      Object.entries(b.startSession.options).some(
        ([k, v]) =>
          !optionNames.includes(k) ||
          v !== (k === "clearPreviousDraft" ? "boolean" : "string"),
      ) ||
      (version === "0.2.1-rc.5" &&
        (!record(b.reasoningBody) ||
          b.reasoningBody.slot !== "conversation.chat.reasoning.body" ||
          b.reasoningBody.rawField !== "rawText" ||
          b.reasoningBody.displayField !== "text" ||
          !Object.hasOwn(b.sources, b.reasoningBody.source) ||
          !Object.hasOwn(b.sources, b.reasoningBody.displaySource))) ||
      (version !== "0.2.1-rc.5" && b.reasoningBody !== undefined) ||
      !record(b.notices) ||
      Object.keys(b.notices).length > 3 ||
      Object.entries(b.notices).some(
        ([api, n]) =>
          ![
            "timer.setTimeout",
            "timer.setInterval",
            "sessions.retain",
          ].includes(api) ||
          !record(n) ||
          !["弃用", "生命周期"].includes(n.kind) ||
          typeof n.message !== "string" ||
          !n.message ||
          n.message.length > 1024 ||
          !Object.hasOwn(b.sources, n.source),
      )
    )
      errors.push("Invalid semantic baseline: " + version);
  }
  return errors;
}

/** Findings are nonfatal contract risks; maintenance/lifetime notices stay limitations. */
export function checkApiSemantics(plugin, rules, version) {
  const findings = [],
    limitations = [];
  const baseline =
    validateSemanticBaselines(rules).length === 0 &&
    Object.hasOwn(rules.apiSemantics.baselines, version)
      ? rules.apiSemantics.baselines[version]
      : null;
  for (const site of plugin.callSites || []) {
    if (
      !site.sides?.includes("client") ||
      !(
        semanticTarget(site.service, site.method) ||
        isSlotRegistration(site.service, site.method)
      )
    )
      continue;
    const api = `${site.service}.${site.method}`;
    const at = `${site.file}:${site.line}`;
    const context = `${api} @ ${at} [DSH ${version ?? "未知"}]`;
    if (isSlotRegistration(site.service, site.method)) {
      const args = site.semanticArguments;
      if (args?.kind === "other-slot") continue;
      const notice = !baseline?.reasoningBody
        ? SLOT_UNREVIEWED_NOTICE
        : args?.kind !== "reasoning-body"
          ? SLOT_UNKNOWN_NOTICE
          : REASONING_SLOT_NOTICE;
      limitations.push(
        `${notice === REASONING_SLOT_NOTICE ? "槽位语义提示" : "槽位覆盖限制"}：${context}；${notice}`,
      );
      continue;
    }
    if (!baseline) {
      limitations.push(
        `语义未审查（参数/弃用/生命周期）：${context}；不借用邻近版本或回退目录认证`,
      );
      continue;
    }
    const notice = baseline.notices[api];
    if (notice)
      limitations.push(
        `语义提示·${notice.kind}：${context}；${notice.message}`,
      );
    if (api !== "uiWorkspace.startSession") continue;
    const args = site.semanticArguments;
    if (!args || args.kind === "unknown") {
      limitations.push(
        `参数未能静态确定：${context}；动态、展开、访问器或合并值不证明参数正确`,
      );
      continue;
    }
    const add = (option, category, message) =>
      findings.push({
        category,
        service: site.service,
        method: site.method,
        severity: "degraded",
        certainty: site.inferredReceiver ? "suspected" : "certain",
        impactBasis: "inferred",
        location: {
          file: site.file,
          line: site.line,
          column: site.column,
          start: site.start,
          end: site.end,
        },
        impact: `${option} ${message}；可能改变或忽略草稿处理，未实测业务失败`,
        basis: `固定官方源码的客户端参数契约，精确版本 ${version}；方法存在或能力守卫不验证参数`,
        ruleSource: "rule",
        ruleRef: `apiSemantics.baselines.${version}.startSession.${option}`,
        evidence: {
          dshVersion: version,
          side: "client",
          option,
          sourceArchiveSha256: baseline.sourceArchiveSha256,
          source: baseline.startSession.source,
        },
      });
    if (args.kind === "options") {
      for (const [name, value] of Object.entries(args.fields)) {
        if (value.kind === "unknown") {
          limitations.push(
            `参数未能静态确定：${context} 的 ${name}；不猜测运行时值`,
          );
          continue;
        }
        const expected = baseline.startSession.options[name];
        if (!expected) {
          add(
            name,
            "api-option-unsupported",
            "不在此版本已审查的选项中，官方实现未使用该字段",
          );
        } else if (
          value.kind !== expected ||
          (name === "whenDraftExists" && value.policy === "invalid")
        ) {
          add(
            name,
            "api-argument-invalid",
            "参数不符：类型或枚举值不符合公开契约",
          );
        }
      }
      if (baseline.startSession.options.whenDraftExists) {
        const explicit = args.fields.whenDraftExists;
        if (
          explicit?.kind === "string" &&
          explicit.policy !== "invalid" &&
          args.fields.clearPreviousDraft
        )
          limitations.push(
            `语义提示·选项：${context}；whenDraftExists 优先于兼容选项 clearPreviousDraft，后者仍受支持`,
          );
        else if (!explicit && args.fields.prompt?.kind === "string")
          limitations.push(
            `语义提示·选项：${context}；未显式提供 whenDraftExists 时默认保留已有草稿，clearPreviousDraft 为 true 才采用 replace；不证明已提交或创建了新会话`,
          );
      }
    }
  }
  return { findings, limitations };
}
