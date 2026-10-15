/** Real DSH probes with controlled fixtures and a private DSH_HOME. Opt in with DSC_SLOW=1. */
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { command } from "../lib/probe-runner.mjs";
import { REPO } from "./helpers.mjs";

const SLOW = process.env.DSC_SLOW === "1";
if (!SLOW && !process.env.DSC_QUIET_SKIP_NOTICE)
  console.error(
    "[probe-boot] 慢测试未启用：DSC_SLOW=1 node --test test/probe-boot.test.mjs（私有环境、真实DSH）",
  );

describe(
  "真实probe：身份、逐条确定性、loader状态及清理",
  { skip: !SLOW },
  () => {
    let root, home, nm, env;
    const cli = (args) => {
      const r = spawnSync(
        process.execPath,
        [
          path.join(REPO, "bin/compat-check.mjs"),
          "--nm",
          nm,
          "--no-baseline",
          "--json",
          ...args,
        ],
        { env, encoding: "utf8", timeout: 180000 },
      );
      assert.equal(r.error, undefined, r.error?.message);
      assert.ok(
        [0, 1, 2].includes(r.status),
        r.stderr + "\n" + r.stdout.slice(-1200),
      );
      return JSON.parse(r.stdout);
    };
    before(
      async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-probe-live-test-"));
        home = path.join(root, "home");
        fs.mkdirSync(home, { mode: 0o700 });
        env = {
          ...process.env,
          DSH_HOME: home,
          DSH_AGENTS_HOME: path.join(root, "agents"),
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
        const init = await command(
          "dsh",
          [
            "--profile",
            "source",
            "--from-default-profile",
            "web",
            "--dump-config",
          ],
          { env },
        );
        assert.equal(init.code, 0, init.error || init.output);
        const packages = [];
        for (const [name, code] of [
          [
            "failed",
            "export function apply(){throw new Error('controlled probe failure')}",
          ],
          [
            "partial",
            "export function apply(ctx){const feature=()=>ctx.tools.dscMissingForLiveAcceptance();}",
          ],
        ]) {
          const dir = path.join(root, name);
          fs.mkdirSync(dir);
          packages.push(`file:${dir}`);
          fs.writeFileSync(
            path.join(dir, "package.json"),
            JSON.stringify({
              name: `@acceptance/${name}`,
              version: "1.0.0",
              type: "module",
              main: "index.js",
              dsh: { bundle: { patch: "cordis.patch.yml" } },
            }),
          );
          fs.writeFileSync(path.join(dir, "index.js"), code);
          fs.writeFileSync(
            path.join(dir, "cordis.patch.yml"),
            `- insert:\n    - name: '@acceptance/${name}'\n`,
          );
        }
        packages.push(
          `file:${path.join(REPO, "test/fixtures/labels/broken-service")}`,
        );
        const install = await command(
          "dsh",
          ["plugin", "--profile", "source", "add", ...packages],
          { env },
        );
        assert.equal(install.code, 0, install.error || install.output);
        nm = path.join(home, "profiles/source/node_modules");
        // Exercise a real profile whose dependency path would break after a
        // move to the owned probe home unless rebased against the source.
        const pkgFile = path.join(path.dirname(nm), "package.json");
        const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
        pkg.dependencies["@acceptance/partial"] =
          `file:${path.relative(path.dirname(nm), path.join(root, "partial"))}`;
        fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
      },
      { timeout: 240000 },
    );
    after(() => {
      if (root) fs.rmSync(root, { recursive: true, force: true });
    });

    test(
      "采样绑定原目标，FAILED/PENDING为实际发现，退出后只清理自己的临时profile",
      { timeout: 180000 },
      () => {
        const data = cli(["--probe-boot", "--probe-timeout", "40"]);
        assert.equal(data.inputs.hasRuntimeSurface, true);
        assert.equal(data.inputs.probe, "(--probe-boot 实时采集)");
        assert.equal(data.observation.usable, true);
        assert.equal(data.observation.bound, true);
        assert.equal(
          fs.realpathSync(data.observation.profileId),
          fs.realpathSync(nm),
        );
        assert.equal(data.observation.dshVersion, data.dshVersion);
        assert.ok(Number.isFinite(Date.parse(data.observation.probedAt)));
        for (const name of ["@acceptance/failed", "@label/broken-service"]) {
          assert.equal(data.plugins[name].verdict, "broken");
          assert.ok(
            data.plugins[name].findings.some(
              (f) =>
                f.category === "host-entry-inactive" &&
                f.impactBasis === "measured",
            ),
          );
        }
        const finding = data.plugins["@acceptance/partial"].findings.find(
          (f) => f.category === "host-method-missing",
        );
        assert.equal(finding.certainty, "certain");
        assert.equal(finding.impactBasis, "inferred");
        const boot = data.inputs.probeBoot;
        assert.equal(boot.tempProfileRemoved, true);
        assert.equal(fs.existsSync(boot.tempProfile), false);
        assert.equal(
          fs.existsSync(
            path.dirname(path.dirname(path.dirname(boot.tempProfile))),
          ),
          false,
          "运行私有目录应一起清理",
        );
        assert.ok(fs.existsSync(nm), "原目标profile必须保留");
      },
    );

    test(
      "同一缺失方法从目录疑似变为观测确定，不要求所有推断都变certain",
      { timeout: 180000 },
      () => {
        const staticResult = cli([]),
          runtime = cli(["--probe-boot", "--probe-timeout", "40"]);
        assert.equal(staticResult.inputs.hasRuntimeSurface, false);
        const select = (data) =>
          data.plugins["@acceptance/partial"].findings.find(
            (f) => f.category === "host-method-missing",
          );
        assert.equal(select(staticResult).certainty, "suspected");
        assert.equal(select(runtime).certainty, "certain");
        assert.equal(select(runtime).impactBasis, "inferred");
      },
    );
  },
);
