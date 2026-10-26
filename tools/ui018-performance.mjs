/** Repeatable synthetic rendering characterization; never reads a user profile. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { buildDependencyGraph } from "../lib/dependency-graph.mjs";
import { panelHarness } from "../test/support/panel-harness.mjs";
const repo = fileURLToPath(new URL("..", import.meta.url));
export async function measureUi018({
  baseline = "f5ec0d0",
  plugins = 1000,
} = {}) {
  if (
    !/^[a-f0-9]{7,40}$/.test(baseline) ||
    !Number.isSafeInteger(plugins) ||
    plugins < 1 ||
    plugins > 1000
  )
    throw Error(
      "Expected an immutable baseline commit and 1–1000 synthetic plugins",
    );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-ui018-metrics-"));
  try {
    const old = path.join(root, "before.js");
    fs.writeFileSync(
      old,
      execFileSync("git", ["show", `${baseline}:plugin/lib/client.js`], {
        cwd: repo,
      }),
    );
    const report = toJSON(
      run({
        nm: path.join(repo, "test/fixtures/labels"),
        dshVersion: "0.2.1-rc.3",
        baseline: false,
        _ignoreAutoProbe: true,
      }),
    );
    const seed = report.plugins["@label/broken-client"];
    report.plugins = Object.fromEntries(
      Array.from({ length: plugins }, (_, i) => {
        const name = `@large/plugin-${String(i).padStart(4, "0")}`;
        return [name, { ...structuredClone(seed), name }];
      }),
    );
    report.summary = {
      ok: 0,
      partial: 0,
      unknown: 0,
      broken: plugins,
      limited: seed.coverage.status === "limited" ? plugins : 0,
      vacuousOk: 0,
    };
    report.dependencyGraph = buildDependencyGraph({
      extraction: {
        report: {
          scanComplete: true,
          perPlugin: Object.fromEntries(
            Object.keys(report.plugins).map((name) => [name, {}]),
          ),
        },
      },
    });
    const data = {
      schemaVersion: 1,
      kind: "plugin-compat-check/report",
      ok: true,
      error: null,
      exitCode: report.exitCode,
      toolVersion: report.toolVersion,
      baseline: null,
      report,
      computedAt: "2026-10-26T00:00:00.000Z",
      nodeModules: "/synthetic/ui018/node_modules",
      cache: { hit: true, ageMs: 0 },
      issueReport: JSON.stringify(report),
    };
    const result = {
      baseline,
      plugins,
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      scope:
        "Synthetic persistent-hook harness using the actual generated clients. Elements are rendered host-element trees, not browser layout. Mean render time is diagnostic, not a timing gate or user-perceived latency.",
    };
    for (const [label, clientFile] of [
      ["before", old],
      ["after", undefined],
    ]) {
      const h = await panelHarness(data, {
        clientFile,
        logger: { log() {}, warn() {} },
      });
      try {
        for (let i = 0; i < 3; i++) h.render();
        const start = performance.now();
        for (let i = 0; i < 20; i++) h.render();
        const meanRenderMs = (performance.now() - start) / 20;
        result[label] = {
          initialElements: h.nodes().length,
          visiblePluginRows: h.rows().length,
          hiddenContentElements: h
            .nodes()
            .filter((n) => n.props.hidden)
            .reduce((sum, n) => sum + h.nodes(n).length, 0),
          meanRenderMs,
        };
        h.field("展开插件及 loader 条目").props.onClick();
        h.render();
        const table = h.field("插件及 loader 条目");
        result[label].expandedLoaderRows =
          h.nodes(table).filter((n) => n.type === "tr").length - 1;
        result[label].expandedElements = h.nodes().length;
      } finally {
        h.dispose();
      }
    }
    return result;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  console.log(JSON.stringify(await measureUi018(), null, 2));
