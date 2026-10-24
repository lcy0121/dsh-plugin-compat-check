/** Keep the frozen legacy catalogue available for older targets and overrides. */
import path from "node:path";
import semver from "semver";
import { createHash } from "node:crypto";
import { CATALOG_REFERENCES, describeCatalog } from "./contracts.mjs";
import { readStaticFile } from "./static-input.mjs";

export function catalogPathFor(root, version, override) {
  if (override) return override;
  const newest =
    typeof version === "string" &&
    semver.valid(version) &&
    semver.gte(version, "0.2.1-rc.3");
  const modern =
    typeof version === "string" &&
    semver.valid(version) &&
    semver.gte(version, "0.2.1-rc.2");
  return path.join(
    root,
    "rules",
    newest
      ? "dsh-api-catalog-0.2.1-rc.3.json"
      : modern
        ? "dsh-api-catalog-0.2.1-rc.2.json"
        : "dsh-api-catalog.json",
  );
}

/** Read once: the reported digest always describes the bytes used to judge. */
export function loadCatalog(root, version, override) {
  const file = catalogPathFor(root, version, override),
    bytes = readStaticFile(file, 8 * 1024 * 1024);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const known = CATALOG_REFERENCES.find(
    (c) => c.file === path.basename(file) && c.sha256 === sha256,
  );
  if (!override && !known)
    throw new Error(
      "内置 API 目录摘要与已验收记录不符，无法判定；请核对目录来源",
    );
  const catalog = JSON.parse(bytes);
  if (
    !catalog ||
    typeof catalog !== "object" ||
    Array.isArray(catalog) ||
    !catalog.host ||
    !catalog.client
  )
    throw new Error("API 目录格式无效");
  return {
    file,
    catalog,
    evidence: describeCatalog({
      targetVersion: version || null,
      referenceVersion:
        known?.version ||
        (typeof catalog._dshVersion === "string" ? catalog._dshVersion : null),
      sha256,
      override: Boolean(override),
    }),
  };
}
