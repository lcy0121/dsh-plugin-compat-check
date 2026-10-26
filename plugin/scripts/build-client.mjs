/** Reproducible, host-external React bundle and plugin-scoped Tailwind CSS. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import { format } from "prettier";
import config from "../tailwind.config.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export async function buildClient({ check = false } = {}) {
  const result = await postcss([
    tailwind({
      ...config,
      content: config.content.map((file) => path.join(root, file)),
    }),
  ]).process(
    fs.readFileSync(path.join(root, "plugin/src/styles.css"), "utf8"),
    { from: undefined },
  );
  // Tailwind's utility defaults can emit universal selectors even without
  // preflight. Scope those too; keyframe selectors are never DOM selectors.
  result.root.walkRules((rule) => {
    if (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name))
      return;
    if (!rule.selector.startsWith(".dsc-ui"))
      rule.selector = rule.selector
        .split(",")
        .map((selector) => `.dsc-ui ${selector.trim()}`)
        .join(", ");
  });
  const css = result.root.toString();
  const output = await build({
    absWorkingDir: root,
    entryPoints: ["plugin/src/client.jsx"],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: ["es2020"],
    jsx: "transform",
    external: ["react", "react-dom", "react-dom/*"],
    legalComments: "inline",
    treeShaking: true,
    plugins: [
      {
        name: "compat-css",
        setup(builder) {
          builder.onResolve({ filter: /^virtual:compat-styles$/ }, () => ({
            path: "styles",
            namespace: "compat",
          }));
          builder.onLoad({ filter: /.*/, namespace: "compat" }, () => ({
            contents: JSON.stringify(css),
            loader: "json",
          }));
        },
      },
    ],
  });
  const body = output.outputFiles[0].text;
  const contents = await format(
    `// Generated from plugin/src/client.jsx and shared lib sources. Run npm run build:client.\n// React is supplied by DSH; CSS is precompiled and scoped to .dsc-ui.\nwindow.__ModuleLoader__.load({\n  id: "dsh-plugin-compat-check",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;\n${body}\n    return module.exports;\n  },\n});\n`,
    { parser: "babel" },
  );
  const file = path.join(root, "plugin/lib/client.js");
  if (check) {
    if (fs.readFileSync(file, "utf8") !== contents)
      throw Error("Stale client build; run npm run build:client");
  } else fs.writeFileSync(file, contents);
  return {
    bytes: Buffer.byteLength(contents),
    cssBytes: Buffer.byteLength(css),
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(
    JSON.stringify(
      await buildClient({ check: process.argv.includes("--check") }),
    ),
  );
