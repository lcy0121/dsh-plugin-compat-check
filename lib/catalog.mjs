/** Keep the frozen legacy catalogue available for older targets and overrides. */
import path from "node:path";
import semver from "semver";

export function catalogPathFor(root, version, override) {
  if (override) return override;
  const modern =
    typeof version === "string" &&
    semver.valid(version) &&
    semver.gte(version, "0.2.1-rc.2");
  return path.join(
    root,
    "rules",
    modern ? "dsh-api-catalog-0.2.1-rc.2.json" : "dsh-api-catalog.json",
  );
}
