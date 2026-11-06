import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";
import { loadHost } from "./support/host-harness.mjs";
for (const [version, archive, digest, prefix] of [
  [
    "rc5",
    process.env.DSC_HOST_SOURCE_ARCHIVE ||
      "tmp/rc5-review-20261030/rc5-source.tgz",
    "a2b94ff1183a87bb1f1d898c6274ae5f8b78accc38931594afd97b58cf0db81f",
    "deepseek-harness-dsh-v0.2.1-rc.5/",
  ],
  [
    "rc22",
    process.env.DSC_RC22_SOURCE_ARCHIVE ||
      "tmp/024-development-20261106/rc1-source-complete.tgz",
    "416750920b64272899259c26b2fa0a4341132c9c19b43337da502ab7ebd599f1",
    "deepseek-harness-dsh-v0.2.2-rc.1/",
  ],
]) {
  test(
    `official ${version} registration and output validator accepts ordinary, cached, failure and upgrade results`,
    { skip: !fs.existsSync(archive) },
    () => {
      assert.equal(
        createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
        digest,
      );
      const read = (p) =>
        execFileSync("tar", ["-xOf", archive, prefix + p], {
          encoding: "utf8",
        });
      const values = read("packages/util/values/src/index.ts").replace(
        /^export .*from .*$/gm,
        "",
      );
      const schema = read("packages/core/tools/src/json-schema.ts").replace(
        /^import .*$/gm,
        "",
      );
      const valueModule = { exports: {} };
      vm.runInNewContext(
        transformSync(values, { loader: "ts", format: "cjs" }).code,
        { module: valueModule, exports: valueModule.exports },
      );
      const module = { exports: {} };
      vm.runInNewContext(
        transformSync(schema, { loader: "ts", format: "cjs" }).code,
        {
          module,
          exports: module.exports,
          HarnessError: class extends Error {},
          assertNever: valueModule.exports.assertNever,
          isJsonValue: valueModule.exports.isJsonValue,
        },
      );
      const { assertSupportedJsonSchema, validateJsonSchemaValue } =
        module.exports;
      const { sandbox } = loadHost();
      const host = fs.readFileSync("plugin/index.js", "utf8");
      const start = host.indexOf("schema: {", host.indexOf("output: {")) + 8;
      let end = start,
        depth = 0;
      for (; end < host.length; end++) {
        if (host[end] === "{") depth++;
        if (host[end] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      const outputSchema = vm.runInNewContext(
        "(" + host.slice(start, end + 1) + ")",
      );
      assertSupportedJsonSchema(outputSchema);
      for (const compat of [
        { ok: true, exitCode: 0 },
        {
          ok: true,
          exitCode: 0,
          cache: { hit: true },
          report: { summary: { limited: 1 }, plugins: {} },
        },
        { ok: false, exitCode: 3, error: "original failure" },
      ]) {
        const result = sandbox.toolResult(compat, "coverage evidence");
        assert.deepEqual(
          Array.from(validateJsonSchemaValue(outputSchema, result)),
          [],
        );
      }
      const upgrade = {
        ...sandbox.toolResult({ ok: true, exitCode: 0 }, "static only"),
        upgradePreview: { ok: true, coverage: { runtime: false } },
      };
      assert.deepEqual(
        Array.from(validateJsonSchemaValue(outputSchema, upgrade)),
        [],
      );
      assert(
        validateJsonSchemaValue(outputSchema, { ...upgrade, error: undefined })
          .length > 0,
      );
    },
  );
}
