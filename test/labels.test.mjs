/**
 * 标注集对账的**慢测试**：真的起一次宿主，用 loader 的真值核对工具的致命声明。
 *
 * 默认跳过（要起宿主，约 30~60 秒），用 `DSC_SLOW=1` 跑：
 *
 *     DSC_SLOW=1 node --test test/labels.test.mjs
 *
 * ## 这一层守的是什么
 *
 * 本工具向用户承诺三层，而**只有第一层有机器真值**：
 *
 * | 层 | 真值 |
 * |---|---|
 * | ① 宿主未激活 | ✅ `entry.fiber.state` —— 宿主自己说的 |
 * | ② 静默降级 | ❌ 没有 —— 要人试一次 |
 * | ③ 客户端半边 | ⚠️ 需要浏览器 |
 *
 * 本文件测的**只是第 ① 层**。**不要把它读成"准确性已验证"** ——
 * 第 ② 层才是这个工具唯一的卖点，而它在这里完全没被覆盖。
 * 这条范围声明写在断言里，也写在 `tools/labels.mjs` 的输出里。
 *
 * ## 为什么用合成正例
 *
 * 实测本机两个真实 profile：**0 个 PENDING、0 个 FAILED** —— 一个正例都没有，
 * 召回率无从谈起。所以"病例"由我们安排（`test/fixtures/labels/`），
 * 而**真值仍然来自宿主**。这个区别很要紧：真值若来自我们的期望，
 * 就变成了自己给自己打分。
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(new URL(".", import.meta.url).pathname, "..");
function offlineCase(check) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-label-metrics-"));
  const nm = path.join(dir, "profile", "node_modules");
  fs.mkdirSync(nm, { recursive: true });
  const add = (name, code = "export function apply(){}") => {
    const pkg = path.join(nm, name);
    fs.mkdirSync(pkg, { recursive: true });
    fs.writeFileSync(
      path.join(pkg, "package.json"),
      JSON.stringify({
        name,
        version: "1.0.0",
        type: "module",
        main: "index.js",
        dsh: { bundle: {} },
      }),
    );
    fs.writeFileSync(path.join(pkg, "index.js"), code);
  };
  for (const name of ["pending", "loading", "disabled", "unknown", "mixed"])
    add(name, "export const inject=['lost'];export function apply(){}");
  for (const name of ["healthy", "throws", "@one/same", "@two/same"]) add(name);
  const stamp = new Date().toISOString(),
    version = "0.9.7";
  const surface = {
    observationVersion: 1,
    profileId: nm,
    dshVersion: version,
    probedAt: stamp,
    sampleId: "sample-a",
    root: { lost: { present: false } },
    entries: { plugins: [{ packageName: "healthy", state: "FAILED" }] },
  };
  const labels = {
    labelVersion: 1,
    source: "loader.entries",
    profileId: nm,
    dshVersion: version,
    probedAt: stamp,
    sampleId: "sample-a",
    available: true,
    complete: true,
    entries: [
      { id: "include:pending", name: "pending", stateCode: 0 },
      { id: "include:throws", name: "throws", stateCode: 3 },
      { id: "include:healthy", name: "healthy", stateCode: 2 },
      { id: "include:loading", name: "loading", stateCode: 1 },
      {
        id: "include:disabled",
        name: "disabled",
        stateCode: 3,
        disabled: true,
      },
      { id: "include:unknown", name: "unknown", stateCode: null },
      { id: "include:mixed", name: "mixed", stateCode: 2 },
      { id: "include:mixed-loading", name: "mixed", stateCode: 1 },
      { id: "include:same", name: "same", stateCode: 3 },
    ],
  };
  const probe = path.join(dir, "probe.json"),
    gold = path.join(dir, "labels.json");
  const run = (extra = []) => {
    fs.writeFileSync(probe, JSON.stringify(surface));
    fs.writeFileSync(gold, JSON.stringify(labels));
    // An adjacent answer-bearing report must never be autodiscovered.
    fs.writeFileSync(
      path.join(dir, "profile", "probe-report.json"),
      JSON.stringify(surface),
    );
    const child = spawnSync(
      process.execPath,
      [
        "tools/labels.mjs",
        "--nm",
        nm,
        "--probe",
        probe,
        "--labels",
        gold,
        "--json",
        ...extra,
      ],
      { cwd: REPO, encoding: "utf8", timeout: 15000 },
    );
    let data;
    try {
      data = JSON.parse(child.stdout);
    } catch {
      data = null;
    }
    return { code: child.status, data, stderr: child.stderr };
  };
  try {
    check({ dir, nm, surface, labels, run });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("offline labels expose a genuine false negative instead of reading the loader answer", () =>
  offlineCase(({ labels, run }) => {
    const result = run();
    assert.equal(result.code, 1, JSON.stringify(result));
    const d = result.data;
    assert.equal(d.dshVersion, "0.9.7");
    assert.equal(d.prediction.loaderEntriesUsed, false);
    const row = (name) => d.rows.find((r) => r.plugin === name);
    assert.equal(row("pending").verdict, "true-positive");
    assert.equal(row("throws").verdict, "false-negative");
    assert.equal(row("healthy").verdict, "true-negative");
    assert.equal(row("healthy").fatalCount, 0);
    assert.equal(d.metrics.recall, 0.5);
    assert.equal(d.metrics.precision, 1);
    const before = d.rows.map((r) => [r.plugin, r.fatalCount]);
    labels.entries.find((r) => r.name === "pending").stateCode = 2;
    const changed = run();
    assert.equal(
      changed.data.rows.find((r) => r.plugin === "pending").verdict,
      "false-positive",
    );
    assert.deepEqual(
      changed.data.rows.map((r) => [r.plugin, r.fatalCount]),
      before,
    );
  }));

test("transient, disabled, unknown and ambiguous loader identities never inflate scored totals", () =>
  offlineCase(({ run }) => {
    const d = run().data;
    assert.ok(d, "CLI must return a metric report");
    const row = (name) => d.rows.find((r) => r.plugin === name);
    for (const name of [
      "loading",
      "disabled",
      "unknown",
      "mixed",
      "@one/same",
      "@two/same",
    ])
      assert.equal(row(name).verdict, "unscored", name);
    assert.equal(d.metrics.scored, 3);
    assert.equal(d.unmatched.length, 2);
    assert.ok(d.unmappedLabels.some((r) => r.id === "include:same"));
  }));

test("identity, version, freshness and paired sample mismatches reject measurement", () =>
  offlineCase(({ labels, run }) => {
    for (const [key, value] of [
      ["profileId", "/wrong/node_modules"],
      ["dshVersion", "0.1.0"],
      ["probedAt", "2000-01-01T00:00:00Z"],
      ["sampleId", "other"],
      ["complete", false],
      ["available", false],
    ]) {
      const old = labels[key];
      labels[key] = value;
      const r = run();
      assert.equal(r.code, 3, JSON.stringify([key, r]));
      assert.equal(r.data?.metrics, undefined);
      assert.equal(typeof r.data?.error, "string");
      labels[key] = old;
    }
    const mismatch = run(["--dsh-version", "0.1.0"]);
    assert.equal(mismatch.code, 3);
  }));

test("empty denominators stay null and an entirely unscored dataset cannot pass", () =>
  offlineCase(({ labels, run }) => {
    labels.entries = [{ id: "include:healthy", name: "healthy", stateCode: 2 }];
    let r = run();
    assert.equal(r.code, 0, JSON.stringify(r));
    assert.equal(r.data.metrics.recall, null);
    assert.equal(r.data.metrics.precision, null);
    labels.entries = [{ id: "include:loading", name: "loading", stateCode: 1 }];
    r = run();
    assert.equal(r.code, 3);
    assert.equal(r.data.metrics.scored, 0);
    assert.equal(r.data.metrics.recall, null);
  }));

test("incomplete source analysis cannot count as a successful prediction", () =>
  offlineCase(({ nm, run }) => {
    fs.writeFileSync(
      path.join(nm, "healthy/index.js"),
      "export function apply( {",
    );
    const r = run();
    assert.equal(r.code, 3, JSON.stringify(r));
    assert.equal(typeof r.data?.error, "string");
    assert.equal(r.data?.metrics, undefined);
  }));

test("real probe writes raw independent labels even when production package mapping has no manifests", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-label-capture-"));
  try {
    fs.writeFileSync(
      path.join(dir, "services.json"),
      JSON.stringify({ services: [], manifests: [] }),
    );
    const source = `global.setTimeout=fn=>{queueMicrotask(fn);return {unref(){}}};const {apply}=await import(${JSON.stringify(new URL("../probe/index.mjs", import.meta.url).href)});apply({get:n=>n==='loader'?{*entries(){yield {id:'include:opaque',options:{name:'@different/actual'},disabled:false,fiber:{state:3}};yield {id:'disabled',disabled:true};}}:undefined,effect(){}});`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", source],
      {
        env: {
          ...process.env,
          DSC_OUT_DIR: dir,
          DSC_PROFILE_ID: "/profile/node_modules",
          DSC_DSH_VERSION: "0.9.7",
        },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.ok(
      fs.existsSync(path.join(dir, "loader-labels.json")),
      "Independent raw loader artifact is missing",
    );
    const gold = JSON.parse(
        fs.readFileSync(path.join(dir, "loader-labels.json")),
      ),
      probe = JSON.parse(fs.readFileSync(path.join(dir, "probe-report.json")));
    assert.equal(gold.source, "loader.entries");
    assert.equal(gold.entries[0].name, "@different/actual");
    assert.equal(gold.entries[0].stateCode, 3);
    assert.equal(gold.entries[1].stateCode, null);
    assert.equal(gold.entries[1].disabled, true);
    assert.equal(probe.entries.plugins.length, 0);
    assert.equal(gold.sampleId, probe.sampleId);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SLOW = process.env.DSC_SLOW === "1";

/** 见 `test/probe-boot.test.mjs` 的同款说明：默认跳过也要**说出来**，不能静默消失。 */
if (!SLOW && !process.env.DSC_QUIET_SKIP_NOTICE) {
  process.stderr.write(
    "[labels] 慢测试已跳过（真的起一次宿主对账 label，约 30~60 秒）。" +
      "要跑：DSC_SLOW=1 node --test test/labels.test.mjs\n",
  );
}

describe("独立标签真实验收", { skip: !SLOW }, () => {
  test(
    "真实FAILED成为漏报、PENDING被源码预测，两个健康病例无假阳性",
    { timeout: 240000 },
    (t) => {
      const dir = fs.mkdtempSync(
        path.join(os.tmpdir(), "dsc-labels-live-test-"),
      );
      const env = {
        ...process.env,
        DSH_HOME: path.join(dir, "unused-home"),
        DSH_AGENTS_HOME: path.join(dir, "agents"),
      };
      for (const key of [
        "DSC_EXTRA_BUNDLES",
        "DSC_KERNEL",
        "DSC_PROBE_REPORT",
        "DSC_PROFILE",
        "DSC_NODE_MODULES",
        "DSC_OUT_DIR",
      ])
        delete env[key];
      try {
        const child = spawnSync(
          process.execPath,
          [
            "tools/labels.mjs",
            "--nm",
            "web",
            "--synthetic",
            "--keep-dir",
            path.join(dir, "evidence"),
            "--json",
          ],
          { cwd: REPO, env, encoding: "utf8", timeout: 230000 },
        );
        assert.equal(child.error, undefined, child.error?.message);
        const data = JSON.parse(child.stdout);
        assert.equal(child.status, 1, JSON.stringify(data));
        const row = (name) => data.rows.find((r) => r.plugin === name);
        assert.equal(row("@label/broken-service").labelState, "PENDING");
        assert.equal(row("@label/broken-service").verdict, "true-positive");
        assert.equal(row("@label/failed-apply").labelState, "FAILED");
        assert.equal(row("@label/failed-apply").verdict, "false-negative");
        assert.equal(row("@label/failed-apply").fatalCount, 0);
        for (const name of ["@label/healthy", "@label/real-service"]) {
          assert.equal(row(name).labelState, "ACTIVE");
          assert.equal(row(name).verdict, "true-negative");
        }
        assert.equal(data.metrics.scored, 4);
        assert.equal(data.metrics.recall, 0.5);
        assert.equal(data.metrics.falsePositive, 0);
        assert.equal(data.prediction.loaderEntriesUsed, false);
        assert.equal(data.prediction.autoProbeDiscovery, false);
        const probe = JSON.parse(
          fs.readFileSync(path.join(dir, "evidence/probe-report.json")),
        );
        const gold = JSON.parse(
          fs.readFileSync(path.join(dir, "evidence/loader-labels.json")),
        );
        assert.equal(data.dshVersion, probe.dshVersion);
        assert.equal(gold.sampleId, probe.sampleId);
        assert.equal(data.cleanup.tempProfileRemoved, true);
        assert.equal(data.cleanup.syntheticRootRemoved, true);
        assert.equal(fs.existsSync(data.nodeModules), false);
        assert.ok(data.notCovered.some((x) => x.includes("静默降级")));
        t.diagnostic(
          JSON.stringify({
            dshVersion: data.dshVersion,
            metrics: data.metrics,
            cleanup: data.cleanup,
          }),
        );
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
