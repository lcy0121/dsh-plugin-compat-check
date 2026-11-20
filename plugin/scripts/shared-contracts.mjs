/** Boot-time host contract paths and the one permitted staged import. */
export const SHARED_HOST = {
  "contracts.mjs": "report-contract.js",
  "upgrade-contract.mjs": "upgrade-contract.js",
  "finding-guidance.mjs": "finding-guidance.js",
};

export function stagedContractSource(file, source) {
  if (file === "upgrade-contract.mjs") {
    const catalogueImport =
      'import { CATALOG_REFERENCES } from "./contracts.mjs";';
    if (!source.includes(catalogueImport))
      throw Error("Missing catalogue import in " + file);
    source = source.replace(catalogueImport, "");
  }
  if (/^import\s/m.test(source))
    throw Error("Unexpected dependency in shared contract " + file);
  const header = `// Generated from lib/${file}; run node plugin/scripts/stage-contract.mjs\n`;
  const dependency =
    file === "upgrade-contract.mjs"
      ? 'import { CATALOG_REFERENCES } from "./report-contract.js";\n'
      : "";
  return header + dependency + source;
}
