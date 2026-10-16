#!/usr/bin/env node
/** First-layer measurement: independent raw loader labels vs source/service
 * predictions. It does not measure silent feature degradation or client UI.
 * File mode requires paired --probe and --labels artifacts from the same sample.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { command, probeProfile } from "../lib/probe-runner.mjs";
import { predictionInput, scoreLabels } from "./label-metrics.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USAGE =
  "用法: node tools/labels.mjs --nm <profile|node_modules> [--probe-boot | --probe <服务观测.json> --labels <独立loader标签.json>] [--synthetic] [--dsh-version <v>] [--keep-dir <私有目录>] [--json]";
function parseArgs(argv) {
  const out = {};
  const values = {
    "--nm": "nm",
    "--probe": "probe",
    "--labels": "labels",
    "--dsh-version": "version",
    "--keep-dir": "keepDir",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (values[a]) {
      const v = argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${a}需要一个值`);
      out[values[a]] = v;
    } else if (a === "--json") out.json = true;
    else if (a === "--probe-boot") out.probeBoot = true;
    else if (a === "--synthetic") out.synthetic = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`无法识别的参数: ${a}`);
  }
  if (out.help) return out;
  if (!out.nm) throw new Error("缺少--nm");
  if ((out.probeBoot || out.synthetic) && (out.probe || out.labels))
    throw new Error("启动模式与文件观测模式不能混用");
  if (!out.probeBoot && !out.synthetic && (!out.probe || !out.labels))
    throw new Error("需要成对--probe/--labels，或--probe-boot");
  return out;
}
function resolveNodeModules(input) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
  let dir = path.resolve(input);
  if (!fs.existsSync(dir) && /^[\w.-]+$/.test(input))
    dir = path.join(home, "profiles", input);
  const nm =
    path.basename(dir) === "node_modules"
      ? dir
      : path.join(dir, "node_modules");
  if (!fs.statSync(nm).isDirectory()) throw new Error("node_modules不是目录");
  return path.resolve(nm);
}
async function syntheticProfile(root) {
  const home = path.join(root, "home");
  fs.mkdirSync(home, { mode: 0o700 });
  const env = {
    ...process.env,
    DSH_HOME: home,
    DSH_AGENTS_HOME: path.join(root, "agents"),
  };
  const init = await command(
    "dsh",
    ["--profile", "labels", "--from-default-profile", "web", "--dump-config"],
    { env },
  );
  if (init.code !== 0)
    throw new Error(`初始化合成profile失败: ${init.error || init.output}`);
  const fixture = path.join(root, "failed-apply");
  fs.mkdirSync(fixture);
  fs.writeFileSync(
    path.join(fixture, "package.json"),
    JSON.stringify({
      name: "@label/failed-apply",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: { bundle: { patch: "cordis.patch.yml" } },
    }),
  );
  fs.writeFileSync(
    path.join(fixture, "index.js"),
    "export function apply(){throw new Error('controlled label failure');}",
  );
  fs.writeFileSync(
    path.join(fixture, "cordis.patch.yml"),
    "- insert:\n    - name: '@label/failed-apply'\n",
  );
  const packages = ["broken-service", "healthy", "real-service"].map(
    (n) => `file:${path.join(REPO, "test/fixtures/labels", n)}`,
  );
  packages.push(`file:${fixture}`);
  const install = await command(
    "dsh",
    ["plugin", "--profile", "labels", "add", ...packages],
    { env },
  );
  if (install.code !== 0)
    throw new Error(`安装合成病例失败: ${install.error || install.output}`);
  return path.join(home, "profiles/labels/node_modules");
}
function show(report, json) {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (report.error) {
    console.error(`标注集测量失败：${report.error}\n${USAGE}`);
    return;
  }
  console.log(
    `标注集对账 — DSH ${report.dshVersion}\n覆盖：${report.coveredLayer}\n不覆盖：${report.notCovered.join("、")}`,
  );
  console.log("预测仅使用源码和服务观测；独立loader标签不进入判定器。");
  console.log(
    `计分 ${report.metrics.scored}，不计分 ${report.metrics.unscored}；TP=${report.metrics.truePositive} FP=${report.metrics.falsePositive} FN=${report.metrics.falseNegative} TN=${report.metrics.trueNegative}`,
  );
  console.log(
    `精确率 ${report.metrics.precision ?? "无分母"}；召回率 ${report.metrics.recall ?? "无分母"}（仅限本样本第一层）`,
  );
  for (const row of report.rows)
    console.log(
      `${row.verdict} ${row.plugin} loader=${row.labelState ?? "无标签"} fatal=${row.fatalCount}${row.reason ? " " + row.reason : ""}`,
    );
}
async function main() {
  let opts,
    root = null,
    report,
    code = 3;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(USAGE);
      return;
    }
    let nm,
      surface,
      labels,
      cleanup = {};
    if (opts.synthetic) {
      root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-labels-"));
      nm = await syntheticProfile(root);
    } else nm = resolveNodeModules(opts.nm);
    if (opts.probeBoot || opts.synthetic) {
      const extracted = run({ nm, baseline: false, _ignoreAutoProbe: true });
      if (extracted.error) throw new Error(extracted.error);
      if (!extracted.extract.report.scanComplete)
        throw new Error(
          "Source analysis is incomplete; measurement is not scored",
        );
      const boot = await probeProfile(nm, {
        services: extracted.extract.report.services,
        manifests: extracted.extract.report.manifests,
        keepDir: opts.keepDir || null,
      });
      cleanup = { tempProfileRemoved: boot.tempProfileRemoved };
      if (boot.error) throw new Error(boot.error);
      surface = boot.surface;
      labels = boot.labels;
    } else {
      surface = JSON.parse(fs.readFileSync(opts.probe, "utf8"));
      labels = JSON.parse(fs.readFileSync(opts.labels, "utf8"));
    }
    const input = predictionInput(surface, labels, nm, opts.version);
    const predicted = run({
      nm,
      dshVersion: input.version,
      baseline: false,
      _hostSurface: input.surface,
      _ignoreAutoProbe: true,
    });
    if (predicted.error) throw new Error(predicted.error);
    if (!predicted.extract.report.scanComplete)
      throw new Error(
        "Source analysis is incomplete; measurement is not scored",
      );
    if (!predicted.verdict.observation.usable)
      throw new Error("Service observation not usable by predictor");
    report = {
      profile: opts.nm,
      nodeModules: nm,
      toolVersion: toJSON(predicted).toolVersion,
      dshVersion: input.version,
      sampleId: surface.sampleId,
      synthetic: !!opts.synthetic,
      ...scoreLabels(toJSON(predicted), labels),
      cleanup,
    };
    code =
      report.metrics.scored === 0
        ? 3
        : report.metrics.falsePositive || report.metrics.falseNegative
          ? 1
          : 0;
  } catch (error) {
    report = { error: error.message };
  } finally {
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
      if (report?.cleanup)
        report.cleanup.syntheticRootRemoved = !fs.existsSync(root);
    }
  }
  show(report, opts?.json || process.argv.includes("--json"));
  process.exitCode = code;
}
await main();
