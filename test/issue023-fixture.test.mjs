import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installIssue023Fixture } from "../tools/issue023-acceptance.mjs";

test("owned PTC fixture mounts composition during unpublished Agent setup", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-issue023-fixture-"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ dependencies: {}, dsh: { profile: { bundles: [] } } }),
  );
  let mounted = false,
    disposed = 0,
    handler;
  const cleanups = [];
  try {
    installIssue023Fixture(root, {
      hostVersion: "0.2.2-rc.1",
      agentPreset: "ptc",
    });
    const fixture = await import(
      pathToFileURL(
        path.join(root, "node_modules/@acceptance/issues023/index.js"),
      ).href
    );
    let restricted = false;
    const agentCtx = {
        tools: {
          restrict(filter) {
            assert.equal(mounted, true);
            assert.deepEqual(filter, { allow: ["compat_check"] });
            restricted = true;
            return () => {};
          },
        },
      },
      agent = {};
    const tools = {
      selectExecutor: () => ({
        describe: () => ({
          schemas: [{ name: mounted ? "run_code" : "compat_check" }],
        }),
      }),
      definitions: () => [],
      resolve: async () => {
        assert.equal(
          restricted,
          true,
          "must filter unrelated preset conditions before resolving tools",
        );
        return { dispose() {} };
      },
      executable: () => ({}),
      execute: async (input) => ({
        results: [
          {
            callId: input.calls[0].id,
            result: {
              isError: false,
              value: { logs: [], result: { ok: true } },
            },
          },
        ],
      }),
    };
    const ctx = {
      tools,
      connection: { requestRejection() {} },
      webServer: {
        register(route) {
          handler = route.handler;
          return () => {};
        },
      },
      effect(fn) {
        cleanups.push(fn());
      },
      agentPresets: {
        async mount(context, preset) {
          assert.equal(context, agentCtx);
          assert.equal(preset, "ptc");
          mounted = true;
          return {
            commit() {
              assert.fail(
                "preset mount receipt must not be returned as Agent setup commit",
              );
            },
          };
        },
      },
      agents: {
        async create(options) {
          assert.equal(
            typeof options.setup,
            "function",
            "PTC meta alone does not mount the executor",
          );
          assert.equal(await options.setup(agentCtx, agent), undefined);
          return {
            agent,
            dispose() {
              disposed++;
            },
          };
        },
      },
    };
    fixture.apply(ctx);
    let status, body;
    await handler(
      {
        url: "/acceptance/issues023?mode=ordinary",
        method: "GET",
        headers: { "x-dsh-compat-request": "1" },
      },
      {
        writeHead(s) {
          status = s;
        },
        end(s) {
          body = JSON.parse(s);
        },
      },
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(mounted, true);
    assert.deepEqual(body.executorSchemas, ["run_code"]);
    assert.equal(body.result.value.ok, true);
    assert(fixture.inject.includes("agentPresets"));
  } finally {
    for (const cleanup of cleanups.reverse()) await cleanup?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(disposed, 1);
});
