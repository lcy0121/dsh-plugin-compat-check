import semver from "semver";
/** Explicit targets fail closed; legacy auto mode retains its documented skip. */
export const LIVE_VERSIONS = Object.freeze([
  "0.2.1-rc.2",
  "0.2.1-rc.3",
  "0.2.1-rc.5",
  "0.2.2-rc.1",
]);
/** Contracts independently reviewed unchanged at these two exact tags. */
export const extendedAcceptance = (version) =>
  ["0.2.1-rc.3", "0.2.1-rc.5", "0.2.2-rc.1"].includes(version);
export function uiAcceptanceVersion(requested = "0.2.1-rc.3") {
  if (!extendedAcceptance(requested))
    throw Error("Full UI acceptance requires a reviewed exact target");
  return requested;
}
export function acceptanceTarget(actual, requested) {
  if (requested !== undefined) {
    if (!LIVE_VERSIONS.includes(requested) && requested !== "0.2.0-rc.2")
      throw Error("Acceptance requires a reviewed exact target");
    if (actual !== requested)
      throw Error(
        `Acceptance runtime mismatch: requested ${requested}, actual ${actual}`,
      );
  }
  return LIVE_VERSIONS.includes(actual);
}

/** Explicit rc.3 requests cannot claim full acceptance without an actual browser. */
export function assertBrowserAcceptance(requested, required, available) {
  if ((required || extendedAcceptance(requested)) && !available)
    throw Error("Required real browser UI acceptance was not performed");
}

export function assertHostRuntime(
  hostVersion,
  nodeVersion = process.versions.node,
) {
  if (!semver.valid(nodeVersion)) throw Error("Invalid host runtime version");
  if (
    semver.valid(hostVersion) &&
    semver.gte(hostVersion, "0.2.2-rc.1") &&
    !semver.gte(nodeVersion, "24.9.0")
  )
    throw Error("DSH 0.2.2 requires Node >=24.9.0 for host acceptance");
  return true;
}

export async function readHostRuntime(hostVersion, driver, run) {
  const value = String(
    await run(
      driver.command,
      ["-p", "process.versions.node"],
      20000,
      driver.env,
    ),
  )
    .trim()
    .split("\n")
    .at(-1);
  assertHostRuntime(hostVersion, value);
  return value;
}
