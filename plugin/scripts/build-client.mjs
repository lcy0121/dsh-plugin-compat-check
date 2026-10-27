/** Reproducible, host-external React bundle and plugin-scoped Tailwind CSS. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
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
  const css = (
    await transform(result.root.toString(), {
      loader: "css",
      minify: true,
      legalComments: "inline",
    })
  ).code;
  const output = await build({
    absWorkingDir: root,
    entryPoints: ["plugin/src/client.jsx"],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "browser",
    target: ["es2020"],
    jsx: "transform",
    charset: "utf8",
    external: ["react", "react-dom", "react-dom/*"],
    legalComments: "inline",
    treeShaking: true,
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: false,
    plugins: [
      {
        name: "compact-locale-keys",
        setup(builder) {
          const keys = Object.keys(
            JSON.parse(
              fs.readFileSync(
                path.join(root, "plugin/src/i18n/zh.json"),
                "utf8",
              ),
            ),
          ).sort();
          const ids = new Map(keys.map((key, index) => [key, `m${index}`]));
          builder.onLoad(
            { filter: /[\/]i18n[\/](?:zh|en|ko)\.json$/ },
            (args) => {
              const dictionary = JSON.parse(fs.readFileSync(args.path, "utf8"));
              if (
                Object.keys(dictionary).length !== keys.length ||
                keys.some((key) => typeof dictionary[key] !== "string")
              )
                throw Error("Incomplete UI locale: " + args.path);
              return {
                contents: JSON.stringify(
                  Object.fromEntries(
                    keys.map((key) => [ids.get(key), dictionary[key]]),
                  ),
                ),
                loader: "json",
              };
            },
          );
        },
      },
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
  // Keep stable diagnostic names while shipping compact generated code. The
  // handwritten sources are formatted; --check verifies this exact artifact.
  const contents = `// Generated from plugin/src/client.jsx and shared lib sources. Run npm run build:client.
// React is supplied by DSH; CSS is precompiled and scoped to .dsc-ui.
window.__ModuleLoader__.load({
  id: "dsh-plugin-compat-check",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${body}
    return module.exports;
  },
});
`;
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
