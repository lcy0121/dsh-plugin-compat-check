import semver from "semver";

/** DSH app-boot 0.2.0-rc.2 checks every official dsh peer, including prereleases. */
function legacySupport(pkg, version) {
  if (!version || !semver.valid(version)) return null;
  const requirements = [];
  for (const [name, range] of Object.entries(pkg.peerDependencies || {})) {
    if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"))
      requirements.push({ name, range, source: "peerDependencies" });
  }
  if (typeof pkg.engines?.dsh === "string")
    requirements.push({
      name: "dsh",
      range: pkg.engines.dsh,
      source: "engines (advisory)",
    });
  const exact =
    pkg.compatibility?.[version] ?? pkg.compatibility?.dshReleases?.[version];
  let exactClaim =
    exact === "compatible" ? true : exact === "incompatible" ? false : null;
  const checks = requirements.map((r) => {
    const range = ["workspace:^", "workspace:~", "workspace:*"].includes(
      r.range,
    )
      ? version
      : r.range;
    return {
      ...r,
      valid: typeof range === "string" && semver.validRange(range) !== null,
      compatible:
        typeof range === "string" &&
        range.trim() !== "" &&
        semver.satisfies(version, range, { includePrerelease: true }),
    };
  });
  if (!checks.length && exactClaim === null) return null;
  return {
    claimsCompatible: checks.length
      ? checks.every((r) => r.valid && r.compatible) && exactClaim !== false
      : exactClaim,
    raw: {
      compatibility: pkg.compatibility ?? null,
      engines: pkg.engines ?? null,
      peers: checks,
    },
    notes: checks
      .filter((r) => !r.valid)
      .map((r) => `Invalid declared range for ${r.name}`),
  };
}

const own = (value, key) => value != null && Object.hasOwn(value, key);
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** Match the engines-first policy introduced by app-boot 0.2.1-rc.1.
 * This predicts declaration acceptance, never plugin activation or behavior.
 */
export function declaredSupport(pkg, version, { exemptions } = {}) {
  if (!version || !semver.valid(version)) return null;
  if (semver.lt(version, "0.2.1-rc.1")) return legacySupport(pkg, version);
  const compatibility = pkg.compatibility;
  pkg = pkg.declarationManifest ?? pkg;
  const requirements = [];
  let error = null;
  if (!record(pkg)) return null;
  const engines = own(pkg, "engines") ? pkg.engines : {};
  if (!record(engines)) error = "Plugin manifest engines must be an object";
  else if (own(engines, "dsh")) {
    if (typeof engines.dsh !== "string")
      error = "Plugin manifest engines.dsh must be a string";
    else
      requirements.push({
        name: "dsh",
        range: engines.dsh,
        source: "engines.dsh",
      });
  } else if (own(pkg, "peerDependencies")) {
    if (!record(pkg.peerDependencies))
      error = "Plugin manifest peerDependencies must be an object";
    else
      for (const [name, range] of Object.entries(pkg.peerDependencies)) {
        if (typeof range !== "string") {
          error = "Plugin manifest peerDependencies ranges must be strings";
          break;
        }
        if (name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"))
          requirements.push({ name, range, source: "peerDependencies" });
      }
  }
  const checks = requirements.map((r) => {
    const range =
      r.source === "peerDependencies" &&
      ["workspace:^", "workspace:~", "workspace:*"].includes(r.range)
        ? version
        : r.range;
    return {
      ...r,
      valid: semver.validRange(range) !== null,
      compatible:
        range.trim() !== "" &&
        semver.satisfies(version, range, { includePrerelease: true }),
    };
  });
  const rejected = checks.filter((r) => !r.compatible);
  if (
    !error &&
    rejected.length &&
    ["name", "version"].some(
      (key) =>
        !own(pkg, key) || typeof pkg[key] !== "string" || !pkg[key].trim(),
    )
  )
    error =
      "Plugin manifest name/version must be non-empty strings when requirements are unmet";
  const exact =
    compatibility?.[version] ?? compatibility?.dshReleases?.[version];
  const exactClaim =
    exact === "compatible" ? true : exact === "incompatible" ? false : null;
  if (!error && !checks.length && exactClaim === null) return null;
  const grant = error
    ? false
    : exemptions === undefined
      ? null
      : own(exemptions, pkg.name + "@" + pkg.version) &&
        Array.isArray(exemptions[pkg.name + "@" + pkg.version]) &&
        exemptions[pkg.name + "@" + pkg.version].includes(version);
  return {
    claimsCompatible:
      !error &&
      (checks.length
        ? checks.every((r) => r.compatible) && exactClaim !== false
        : exactClaim),
    policy: "engines-first",
    invalid: error,
    rejected,
    exempted: grant,
    raw: {
      compatibility: compatibility ?? null,
      engines: own(pkg, "engines") ? pkg.engines : null,
      peers: checks,
    },
    notes: error
      ? [error]
      : checks
          .filter((r) => !r.valid)
          .map((r) => "Invalid declared range for " + r.name),
  };
}
