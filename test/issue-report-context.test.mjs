import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFixture } from "./fixture-utils.mjs";
import { run } from "../bin/compat-check.mjs";
import { toJSON } from "../lib/report.mjs";
import { buildVerdicts } from "../lib/verdict.mjs";
import { renderIssueReport } from "../lib/issue-report.mjs";

const version = "0.2.1-rc.2";
const commands = (report) => {
  const values = [...report.matchAll(/```sh\n([^`]+)\n```/g)].map((m) => m[1]);
  assert.ok(values.length > 0, "复核命令必须存在");
  return values;
};

test("同宿主absent结论的分享报告要求另行取得合格probe，不能把静态复核当复现", () => {
  const fixture = packageFixture(
    "export const inject=['legacySurface'];export function apply(ctx){ctx.legacySurface.route()}",
  );
  try {
    const options = {
      nm: fixture.nm,
      dshVersion: version,
      baseline: false,
      _ignoreAutoProbe: true,
    };
    const staticResult = run(options);
    const runtimeResult = run({
      ...options,
      _hostSurface: {
        observationVersion: 1,
        profileId: fixture.nm,
        dshVersion: version,
        probedAt: new Date().toISOString(),
        root: { legacySurface: { present: false } },
      },
    });
    assert.equal(staticResult.verdict.plugins.sample.verdict, "partial");
    assert.equal(runtimeResult.verdict.plugins.sample.verdict, "broken");
    const body = toJSON(runtimeResult),
      before = JSON.stringify(body);
    assert.equal(body.inputs.probe, undefined);
    const report = renderIssueReport(body);
    assert.match(report, /仅静态扫描.*不同结论.*不能复现/);
    assert.match(
      report,
      /另行取得.*同一 profile.*DSH 版本.*采样时间.*合格 probe/,
    );
    assert.match(report, /不会自动创建 probe 或启动宿主/);
    assert.ok(
      commands(report).every((command) =>
        command.includes("--probe <probe-report.json>"),
      ),
    );
    assert.ok(
      commands(report).every((command) => !command.includes("--probe-boot")),
    );
    assert.ok(!report.includes(fixture.nm));
    assert.equal(JSON.stringify(body), before);
    const withoutInputHints = { ...body, inputs: {} };
    assert.ok(
      commands(renderIssueReport(withoutInputHints)).every((command) =>
        command.includes("--probe <probe-report.json>"),
      ),
    );
  } finally {
    fixture.cleanup();
  }
});

test("FAILED与PENDING必须回原同宿主刷新，静态和文件probe均不冒充loader事实复现", () => {
  const fixture = packageFixture("export function apply(ctx){}");
  try {
    for (const state of ["FAILED", "PENDING"]) {
      const result = run({
        nm: fixture.nm,
        dshVersion: version,
        baseline: false,
        _ignoreAutoProbe: true,
      });
      assert.equal(result.verdict.plugins.sample.verdict, "ok");
      result.verdict = buildVerdicts({
        report: result.extract.report,
        dshVersion: version,
        entryStates: [
          {
            packageName: "sample",
            id: "entry-canary",
            state,
            disabled: false,
            group: false,
          },
        ],
      });
      assert.equal(result.verdict.plugins.sample.verdict, "broken");
      const body = toJSON(result),
        before = JSON.stringify(body);
      const report = renderIssueReport(body);
      assert.match(report, /FAILED\/PENDING.*原来的同一宿主刷新报告/);
      assert.match(report, /静态扫描或文件 probe 不能复现这些状态/);
      assert.match(report, /命令只用于复核文件、声明与目录/);
      assert.equal(JSON.stringify(body), before);
    }
  } finally {
    fixture.cleanup();
  }
});

test("rules和catalog从canonical输入或options保留固定占位，不导出输入路径", () => {
  const fixture = packageFixture("export function apply(ctx){}");
  try {
    const body = toJSON(
      run({
        nm: fixture.nm,
        dshVersion: version,
        baseline: false,
        _ignoreAutoProbe: true,
      }),
    );
    for (const context of ["inputs", "options"]) {
      const copy = structuredClone(body);
      copy.inputs =
        context === "inputs"
          ? {
              rules: "/private/canary-rule.json",
              catalog: "/private/canary-catalog.json",
            }
          : {};
      const options =
        context === "options"
          ? {
              rules: "/private/canary-rule.json",
              catalog: "/private/canary-catalog.json",
            }
          : {};
      const report = renderIssueReport(copy, options);
      assert.ok(
        commands(report).every((command) =>
          command.includes("--rules <rules.json> --catalog <catalog.json>"),
        ),
      );
      assert.ok(!report.includes("canary"));
      assert.match(report, /相同工具版本.*制品.*规则.*目录/);
    }
    for (const [copy, options] of [
      [body, { probeBoot: true }],
      [
        {
          ...body,
          inputs: {
            ...body.inputs,
            probeBoot: { requested: true },
            probe: "(实时采集)",
          },
        },
        {},
      ],
    ]) {
      const report = renderIssueReport(copy, options);
      assert.ok(
        commands(report).every((command) => command.includes("--probe-boot")),
      );
      assert.match(report, /原 CLI 显式请求.*安装依赖、启动并执行目标插件/);
      assert.match(report, /新宿主.*不能复现原宿主.*loader.*业务事实/);
    }
    const preferred = renderIssueReport(body, {
      probe: "/private/canary-probe.json",
      probeBoot: true,
    });
    assert.ok(
      commands(preferred).every(
        (command) =>
          command.includes("--probe <probe-report.json>") &&
          !command.includes("--probe-boot"),
      ),
    );
  } finally {
    fixture.cleanup();
  }
});
