/** Explicit targets fail closed; legacy auto mode retains its documented skip. */
export const LIVE_VERSIONS = Object.freeze([
  "0.2.1-rc.2",
  "0.2.1-rc.3",
  "0.2.1-rc.5",
]);
/** Contracts independently reviewed unchanged at these two exact tags. */
export const extendedAcceptance = (version) =>
  ["0.2.1-rc.3", "0.2.1-rc.5"].includes(version);
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
