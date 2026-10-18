/** Published sidebar save path, independent raw-byte oracle, and recovery cases.
 * The browser calls real plugin HTTP routes; this is not an editor-widget test.
 */
import fs from "node:fs";
import path from "node:path";
import { businessOutcome } from "./business-metrics.mjs";
export const sidebarPin = {
  package: "dsh-better-sidebar",
  version: "0.28.0",
  files: 471,
  digest: "2c3b5619b4a8ee9ab87ea179b0163a1230dbbb63e8cdbea3de8b08f9147d6892",
  publishedTarballSha256:
    "40b7ce32a6d90bff069b3bb4d0e5dd692281e0ac0598163196b816ac12335b6f",
  publishedIntegrity:
    "sha512-x7+/YmH/HrSlXWOBZkhL7qQqcDgZEnDcWrhR5GlizzUZjz+w84FbQ6jo8trJC9tyaQxMaNvXVnXwDxn4I330Ew==",
  sourceHashes: {
    "package.json":
      "e557306a7af1f8ea020caffae62c36df4591ced90cf4626db464df5dce8fcc36",
    "lib/index.js":
      "00080091516184efe0005d8521cb890ae89032b9abcd514b752c4ef7642fa129",
    "src/index.ts":
      "7658d35cb8a0d9c8c9ea816413817c338b56a18fe6f21d62f55ec3e849682f42",
    "src/fs-operations.ts":
      "1a0d84d4872f0fa42170dc1797bb3bd4d3a66b2186c94847b6e4ce2608de5511",
    "src/html-route.ts":
      "73974a8649ac8332258dae896f0129da2b16541ad9ea1ab5cb1c40576ec6885e",
  },
};
// Hand-audited save -> durable bytes -> HTML preview route, including cwd resolution.
const spans = [
  ["lib/index.js", 8907, 8907],
  ["src/index.ts", 1316, 1316],
  ["lib/index.js", 7742, 7761],
  ["lib/index.js", 7942, 7947],
  ["lib/index.js", 2276, 2318],
  ["lib/index.js", 3974, 4005],
  ["lib/index.js", 7960, 8015],
  ["lib/index.js", 8102, 8145],
  ["lib/index.js", 9070, 9114],
  ["lib/index.js", 9192, 9235],
  ["src/index.ts", 141, 178],
  ["src/index.ts", 1530, 1571],
  ["src/index.ts", 1680, 1734],
  ["src/fs-operations.ts", 162, 205],
].map(([file, start, end]) => ({ file, start, end }));
export const sidebarFeatures = ["utf8-bom", "utf16le"].map((encoding) => ({
  id: "sidebar.save." + encoding,
  plugin: "dsh-better-sidebar",
  encoding,
  spans,
}));
export function savedDocumentBytes(text, encoding) {
  const crlf = text.replace(/\r?\n/g, "\r\n");
  if (encoding === "utf8-bom")
    return Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(crlf, "utf8"),
    ]);
  if (encoding === "utf16le")
    return Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(crlf, "utf16le"),
    ]);
  throw Error("Unknown business document encoding");
}
export function installSidebarFixture(profile, workspace) {
  const dir = path.join(profile, "node_modules/@business/session");
  fs.mkdirSync(dir, { recursive: true });
  const source = `export const inject=['sessions'];export function apply(ctx){ctx.sessions.create('business-sidebar',{meta:{cwd:${JSON.stringify(workspace)}}});}`;
  fs.writeFileSync(path.join(dir, "index.js"), source);
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      name: "@business/session",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "cordis.patch.yml"),
    '- insert:\n    - id: business-session\n      name: "@business/session"\n',
  );
  const file = path.join(profile, "package.json"),
    manifest = JSON.parse(fs.readFileSync(file));
  manifest.dependencies["@business/session"] = "file:" + dir;
  manifest.dsh.profile.bundles.push("@business/session");
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return source;
}
export async function sidebarCases(driver) {
  const {
    workspace,
    url,
    evalx,
    poll,
    navigate,
    armFault,
    finishRequest,
    screenshot,
  } = driver;
  fs.mkdirSync(workspace, { recursive: true });
  const rows = [];
  for (const feature of sidebarFeatures) {
    const file = path.join(workspace, feature.encoding + ".html");
    const document = (word) =>
      `<!doctype html>\n<html><body><h1>${word} 中文 🐟</h1></body></html>\n`;
    fs.writeFileSync(
      file,
      savedDocumentBytes(document("initial"), feature.encoding),
    );
    for (const phase of ["healthy", "blocked", "recovered"]) {
      const control = phase === "blocked" ? "http-503" : "none",
        caseId = feature.id + "." + phase;
      await navigate(url);
      await poll(
        () =>
          evalx(
            'document.readyState === "complete" && Boolean(document.querySelector("button"))',
          ),
        "Sidebar host shell unavailable",
      );
      const beforeBytes = fs.readFileSync(file);
      const desired = phase + " 中文 🐟",
        content = document(phase);
      const endpoint =
        "/sidebar/write?" +
        new URLSearchParams({
          sessionId: "business-sidebar",
          path: file,
          expectedMtimeMs: String(fs.statSync(file).mtimeMs),
        });
      const start = await armFault(
        control === "http-503" ? "/sidebar/write" : null,
      );
      const reply = await evalx(
        `(async()=>{const r=await fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'content-type':'text/plain'},body:${JSON.stringify(content)}});await r.text();return r.status;})()`,
      );
      const response = await finishRequest("/sidebar/write", start);
      if (reply !== response.status)
        throw Error("Sidebar browser receipt status mismatch");
      // Read raw disk bytes without importing any target plugin encoding/read helper.
      const actual = fs.readFileSync(file),
        expected = savedDocumentBytes(content, feature.encoding);
      const persisted = actual.equals(expected);
      const preview = new URL(
        "/sidebar/html/business-sidebar/" +
          file
            .split(path.sep)
            .filter(Boolean)
            .map(encodeURIComponent)
            .join("/"),
        url,
      ).href;
      await navigate(preview);
      await poll(
        () =>
          evalx(
            'document.readyState === "complete" && Boolean(document.querySelector("h1"))',
          ),
        "Sidebar HTML preview unavailable",
      );
      const uiAfterReload = await evalx(
        `document.querySelector('h1').textContent===${JSON.stringify(desired)}`,
      );
      const observed = {
        requestStatus: response.status,
        persisted,
        uiAfterReload,
      };
      rows.push({
        caseId,
        featureId: feature.id,
        control,
        action:
          "Browser POST to real editor-save route, then fresh plugin HTML preview",
        expected:
          "Requested content, original BOM/encoding and CRLF bytes must survive; preview text must match",
        observed,
        outcome: businessOutcome(observed),
        byteEvidence: {
          encoding: feature.encoding,
          exactRequestedBytes: persisted,
          previousBytesPreserved: actual.equals(beforeBytes),
        },
      });
      await screenshot(caseId);
    }
  }
  return rows;
}
