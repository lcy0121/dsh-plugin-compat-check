// Generated from lib/functional-health-contract.mjs; run node plugin/scripts/stage-contract.mjs
/** Pure declarations/results contract. Author declarations never imply execution or compatibility. */
export const FUNCTIONAL_HEALTH_KIND = "plugin-compat-check/functional-health";
export const FUNCTIONAL_HEALTH_LIMITS = Object.freeze({
  checks: 32,
  path: 256,
  selector: 160,
  responseBytes: 65536,
  requestMs: 3000,
  totalMs: 180000,
});
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, allowed) =>
  object(v) && Object.keys(v).every((k) => allowed.includes(k));
const exactVersion = (v) =>
  typeof v === "string" &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
    v,
  );
const digest = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const bounded = (v, n) =>
  typeof v === "string" && v.length > 0 && v.length <= n;
const artifactValid = (a) =>
  keys(a, ["name", "version", "sha256"]) &&
  typeof a.name === "string" &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(a.name) &&
  a.name.length <= 214 &&
  exactVersion(a.version) &&
  digest(a.sha256);
export function validFunctionalPath(v) {
  return (
    bounded(v, FUNCTIONAL_HEALTH_LIMITS.path) &&
    /^\/(?!\/)[A-Za-z0-9/_.,~-]*$/.test(v) &&
    !v.split("/").some((p) => p === ".." || p === ".")
  );
}
export function validateFunctionalManifest(value) {
  const errors = [];
  if (
    !keys(value, ["schemaVersion", "artifact", "dshVersion", "checks"]) ||
    value.schemaVersion !== 1 ||
    !artifactValid(value.artifact) ||
    !exactVersion(value.dshVersion)
  )
    errors.push("Invalid manifest schema or exact artifact/DSH identity");
  if (
    !Array.isArray(value?.checks) ||
    value.checks.length < 1 ||
    value.checks.length > FUNCTIONAL_HEALTH_LIMITS.checks
  )
    errors.push("Expected 1..32 bounded checks");
  else {
    const seen = new Set();
    for (const c of value.checks) {
      if (
        !object(c) ||
        !bounded(c.id, 64) ||
        !/^[A-Za-z0-9_-]+$/.test(c.id) ||
        seen.has(c.id) ||
        !validFunctionalPath(c.path)
      ) {
        errors.push("Invalid check id/path or duplicate id");
        continue;
      }
      seen.add(c.id);
      if (c.type === "http") {
        if (
          !keys(c, ["id", "type", "path", "status", "json"]) ||
          !Number.isInteger(c.status) ||
          c.status < 200 ||
          c.status > 599 ||
          (c.status >= 300 && c.status < 400)
        )
          errors.push("Invalid HTTP check");
        if (
          c.json !== undefined &&
          (!keys(c.json, ["pointer", "equals"]) ||
            typeof c.json.pointer !== "string" ||
            c.json.pointer.length > 256 ||
            !/^(?:\/(?:[^~\u0000-\u001f]|~[01])*)*$/.test(c.json.pointer) ||
            !Object.hasOwn(c.json, "equals") ||
            ![null, "string", "boolean", "number"].includes(
              c.json.equals === null ? null : typeof c.json.equals,
            ) ||
            (typeof c.json.equals === "string" && c.json.equals.length > 256) ||
            (typeof c.json.equals === "number" &&
              !Number.isFinite(c.json.equals)))
        )
          errors.push(
            "JSON assertion must be a bounded JSON pointer and scalar value",
          );
      } else if (c.type === "dom") {
        if (
          !keys(c, [
            "id",
            "type",
            "path",
            "selector",
            "minCount",
            "maxCount",
          ]) ||
          !bounded(c.selector, FUNCTIONAL_HEALTH_LIMITS.selector) ||
          !/^[A-Za-z0-9_#.*\[\]="'\- >]+$/.test(c.selector) ||
          !Number.isInteger(c.minCount) ||
          !Number.isInteger(c.maxCount) ||
          c.minCount < 0 ||
          c.maxCount < c.minCount ||
          c.maxCount > 1000
        )
          errors.push("Invalid bounded DOM selector/count check");
      } else errors.push("Only HTTP GET and DOM selector counts are supported");
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, value };
}

/** Imported evidence is an offline assertion, not a signature or compatibility verdict. */
export function validateFunctionalHealthResult(value, expectedIdentity = {}) {
  const errors = [];
  const iso = (v) =>
    typeof v === "string" &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
  if (
    !keys(value, [
      "schemaVersion",
      "kind",
      "status",
      "identity",
      "startedAt",
      "completedAt",
      "checks",
      "cleanup",
      "limitations",
      "error",
      "declaration",
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== FUNCTIONAL_HEALTH_KIND ||
    !["tested-pass", "tested-failed", "error"].includes(value.status)
  )
    errors.push("Invalid functional health result schema/status");
  const declarationValidation = validateFunctionalManifest(value?.declaration);
  if (!declarationValidation.valid)
    errors.push("Missing or invalid executed declaration");
  const id = value?.identity;
  if (
    declarationValidation.valid &&
    (value.declaration.dshVersion !== id?.dshVersion ||
      ["name", "version", "sha256"].some(
        (k) => value.declaration.artifact[k] !== id?.artifact?.[k],
      ))
  )
    errors.push("Executed declaration identity differs from result");
  if (
    !keys(id, ["artifact", "dshVersion", "manifestSha256"]) ||
    !artifactValid(id.artifact) ||
    !exactVersion(id.dshVersion) ||
    !digest(id.manifestSha256)
  )
    errors.push("Invalid exact evidence identity");
  if (
    !iso(value?.startedAt) ||
    !iso(value?.completedAt) ||
    value.completedAt < value.startedAt ||
    Date.parse(value.completedAt) - Date.parse(value.startedAt) >
      FUNCTIONAL_HEALTH_LIMITS.totalMs + 30000
  )
    errors.push("Invalid bounded measurement times");
  if (
    !keys(value?.cleanup, ["stopped", "removed", "errors"]) ||
    typeof value.cleanup.stopped !== "boolean" ||
    typeof value.cleanup.removed !== "boolean" ||
    (value.cleanup.errors !== undefined &&
      (!Array.isArray(value.cleanup.errors) ||
        value.cleanup.errors.length > 8 ||
        value.cleanup.errors.some((x) => !bounded(x, 512))))
  )
    errors.push("Invalid cleanup evidence");
  if (
    !Array.isArray(value?.limitations) ||
    value.limitations.length < 1 ||
    value.limitations.length > 8 ||
    value.limitations.some((x) => !bounded(x, 512)) ||
    (value.error !== undefined && !bounded(value.error, 1024))
  )
    errors.push("Invalid limitations/error summary");
  const seen = new Set();
  if (!Array.isArray(value?.checks) || value.checks.length > 32)
    errors.push("Invalid check evidence");
  else
    for (const c of value.checks) {
      const e = c?.evidence;
      if (
        !keys(c, ["id", "type", "status", "evidence"]) ||
        !bounded(c.id, 64) ||
        !/^[A-Za-z0-9_-]+$/.test(c.id) ||
        seen.has(c.id) ||
        !["http", "dom"].includes(c.type) ||
        !["pass", "failed", "error"].includes(c.status) ||
        !keys(e, [
          "httpStatus",
          "responseBytes",
          "jsonMatched",
          "count",
          "elapsedMs",
          "error",
        ]) ||
        !Number.isFinite(e.elapsedMs) ||
        e.elapsedMs < 0 ||
        e.elapsedMs > FUNCTIONAL_HEALTH_LIMITS.totalMs
      ) {
        errors.push("Invalid check row");
        continue;
      }
      seen.add(c.id);
      if (c.status === "error") {
        if (!bounded(e.error, 256)) errors.push("Missing check error");
      } else if (c.type === "http") {
        if (
          !Number.isInteger(e.httpStatus) ||
          e.httpStatus < 200 ||
          e.httpStatus > 599 ||
          !Number.isInteger(e.responseBytes) ||
          e.responseBytes < 0 ||
          e.responseBytes > 65536 ||
          (e.jsonMatched !== undefined && typeof e.jsonMatched !== "boolean") ||
          e.count !== undefined ||
          e.error !== undefined
        )
          errors.push("Invalid HTTP evidence");
      } else if (
        !Number.isInteger(e.count) ||
        e.count < 0 ||
        e.httpStatus !== undefined ||
        e.responseBytes !== undefined ||
        e.jsonMatched !== undefined ||
        e.error !== undefined
      )
        errors.push("Invalid DOM evidence");
    }
  if (errors.length) return { valid: false, errors };
  if (declarationValidation.valid && Array.isArray(value?.checks)) {
    const expected = value.declaration.checks;
    if (
      (value.status !== "error" && value.checks.length !== expected.length) ||
      value.checks.length > expected.length
    )
      errors.push("Evidence must cover every declared check in order");
    for (let i = 0; i < value.checks.length; i++) {
      const row = value.checks[i],
        check = expected[i];
      if (!row || !check || row.id !== check.id || row.type !== check.type) {
        errors.push("Evidence check identity/order differs from declaration");
        continue;
      }
      if (row.status === "error") continue;
      const e = row.evidence;
      if (!object(e)) continue;
      const passed =
        check.type === "http"
          ? e.httpStatus === check.status &&
            (!check.json || e.jsonMatched === true)
          : e.count >= check.minCount && e.count <= check.maxCount;
      if (
        row.status !== (passed ? "pass" : "failed") ||
        (check.type === "http" &&
          Boolean(check.json) !== (e.jsonMatched !== undefined))
      )
        errors.push("Evidence outcome conflicts with executed expectation");
    }
  }
  if (
    value?.status === "tested-pass" &&
    (!value.checks?.length ||
      value.checks.some((c) => c?.status !== "pass") ||
      value.cleanup?.stopped !== true ||
      value.cleanup?.removed !== true ||
      value.cleanup?.errors?.length ||
      value.error !== undefined)
  )
    errors.push("Pass conflicts with checks or cleanup");
  if (
    value?.status === "tested-failed" &&
    (!value.checks?.some((c) => c?.status === "failed") ||
      value.checks.some((c) => c?.status === "error") ||
      value.cleanup?.stopped !== true ||
      value.cleanup?.removed !== true ||
      value.error !== undefined)
  )
    errors.push("Failed measurement conflicts with checks/cleanup");
  if (value?.status === "error" && !bounded(value.error, 1024))
    errors.push("Missing run error");
  if (errors.length) return { valid: false, errors };
  const staleReasons = [];
  if (
    !expectedIdentity.artifact ||
    !["name", "version", "sha256"].every(
      (k) => typeof expectedIdentity.artifact[k] === "string",
    )
  )
    staleReasons.push("Current artifact identity unavailable");
  else
    for (const key of ["name", "version", "sha256"])
      if (id.artifact[key] !== expectedIdentity.artifact[key])
        staleReasons.push("Artifact " + key + " changed");
  if (!expectedIdentity.dshVersion)
    staleReasons.push("Current DSH version unavailable");
  else if (id.dshVersion !== expectedIdentity.dshVersion)
    staleReasons.push("DSH version changed");
  if (!expectedIdentity.manifestSha256)
    staleReasons.push("Current declaration identity unavailable");
  else if (id.manifestSha256 !== expectedIdentity.manifestSha256)
    staleReasons.push("Declaration changed");
  return {
    valid: true,
    value,
    current: staleReasons.length === 0,
    staleReasons,
  };
}

/** SHA256 identity rule: UTF-8 of JSON with recursively sorted object keys and preserved array order, no whitespace. */
export function canonicalFunctionalManifest(value) {
  const validation = validateFunctionalManifest(value);
  if (!validation.valid) throw Error(validation.errors.join("; "));
  const ordered = (v) =>
    Array.isArray(v)
      ? v.map(ordered)
      : object(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, ordered(v[k])]),
          )
        : v;
  return JSON.stringify(ordered(value));
}
