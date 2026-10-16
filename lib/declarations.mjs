import semver from "semver";

/** DSH app-boot 0.2.0-rc.2 checks every official dsh peer, including prereleases. */
export function declaredSupport(pkg, version) {
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
