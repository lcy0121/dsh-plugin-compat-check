import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { nextSteps } from "../lib/finding-guidance.mjs";
import { nextSteps as packagedNextSteps } from "../plugin/lib/finding-guidance.js";

test("入口与版本声明发现给出实际制品和声明检查位置，不编造修复版本或API", () => {
  const client = nextSteps({ category: "client-entry-missing" }).join("\n");
  assert.match(client, /package\.json/);
  assert.match(client, /dsh\.client.*exports\["\.\/client"\]/);
  assert.match(client, /实际安装制品.*入口文件/);
  assert.match(client, /浏览器.*实际功能/);
  const declared = nextSteps({ category: "declared-incompatible" }).join("\n");
  assert.match(declared, /engines\.dsh.*peerDependencies/);
  assert.match(declared, /目标 DSH 版本/);
  assert.match(declared, /不证明.*实际加载失败/);
  assert.doesNotMatch(declared, /升级到|改用.*API|npm install|pnpm add/);
});

test("FAILED与PENDING给出各自日志或依赖核实步骤，不从basis反推状态", () => {
  const failed = nextSteps({
    category: "host-entry-inactive",
    evidence: { state: "FAILED" },
  }).join("\n");
  const pending = nextSteps({
    category: "host-entry-inactive",
    evidence: { state: "PENDING" },
  }).join("\n");
  assert.match(failed, /FAILED.*失败原因.*启动日志/);
  assert.match(pending, /PENDING.*必需 inject.*提供者/);
  assert.notEqual(failed, pending);
  const unknown = nextSteps({
    category: "host-entry-inactive",
    basis: "FAILED private log",
  }).join("\n");
  assert.match(unknown, /重新读取.*loader.*状态/);
  assert.doesNotMatch(unknown, /private log|失败原因.*启动日志/);
});

test("未观测、采样失败与明确absent保持待确认和作用域边界", () => {
  for (const status of ["unobserved", "unreadable", undefined]) {
    const text = nextSteps({
      category: "unprovided-dependency",
      evidence: { status, hardInject: true },
    }).join("\n");
    assert.match(text, /待确认.*同一 profile.*DSH 版本.*采样时间/);
    assert.match(text, /不能.*缺失.*挂起/);
    assert.match(text, /顶层必需 inject.*激活前提/);
    if (status === "unreadable") assert.match(text, /读取失败.*不执行 getter/);
  }
  const absent = nextSteps({
    category: "unprovided-dependency",
    evidence: { status: "absent", hardInject: false },
  }).join("\n");
  assert.match(absent, /明确 absent.*作用域/);
  assert.match(absent, /可选或子作用域.*不推断整个插件挂起/);
  assert.doesNotMatch(absent, /不能确认服务缺失/);
});

test("其余已知类别与新类别均提供保守核实步骤且不修改输入", () => {
  for (const category of [
    "host-service-missing",
    "host-method-missing",
    "declaration-mismatch",
    "future-category",
  ]) {
    const finding = Object.freeze({
      category,
      certainty: "certain",
      impactBasis: "inferred",
      basis: "/private/canary token=secret",
      evidence: Object.freeze({ state: "FAILED" }),
    });
    const before = JSON.stringify(finding),
      steps = nextSteps(finding);
    assert.ok(steps.length >= 2, category);
    assert.ok(steps.every((s) => typeof s === "string" && s.length > 10));
    assert.match(steps.join("\n"), /观测|证据/);
    assert.doesNotMatch(
      steps.join("\n"),
      /canary|token=|升级到|npm install|pnpm add/,
    );
    assert.equal(JSON.stringify(finding), before);
    steps.push("consumer change");
    assert.ok(!nextSteps(finding).includes("consumer change"));
  }
  assert.deepEqual(nextSteps(null), []);
});

test("host与实际client bundle生成的建议与纯模块逐字相同", () => {
  let loaded;
  const sandbox = {
    window: { __ModuleLoader__: { load: (value) => (loaded = value) } },
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../plugin/lib/client.js", import.meta.url),
      "utf8",
    ),
    sandbox,
  );
  const factory = loaded.factory
    .toString()
    .replace(
      "return module.exports;",
      "exports.__steps=FindingGuidance.nextSteps;return module.exports;",
    );
  const browserNextSteps = vm.runInNewContext(
    "(" + factory + ")",
    sandbox,
  )(() => ({})).__steps;
  for (const finding of [
    { category: "client-entry-missing" },
    { category: "declared-incompatible" },
    { category: "host-entry-inactive", evidence: { state: "FAILED" } },
    { category: "host-entry-inactive", evidence: { state: "PENDING" } },
    {
      category: "unprovided-dependency",
      evidence: { status: "unobserved", hardInject: true },
    },
    {
      category: "unprovided-dependency",
      evidence: { status: "absent", hardInject: false },
    },
    { category: "host-service-missing" },
    { category: "host-method-missing" },
    { category: "declaration-mismatch" },
    { category: "future-category" },
  ]) {
    assert.deepEqual(packagedNextSteps(finding), nextSteps(finding));
    assert.equal(
      JSON.stringify(browserNextSteps(finding)),
      JSON.stringify(nextSteps(finding)),
    );
  }
});
