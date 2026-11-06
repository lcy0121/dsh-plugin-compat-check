import { test } from "node:test";
import assert from "node:assert/strict";
import { invokeOwnedTool } from "../tools/owned-tool-invocation.mjs";

test("rc5 retains the single call contract and supplied cancellation", async () => {
  const signal = new AbortController().signal;
  const result = { isError: false, value: { ok: true } };
  const tools = {
    execute(input) {
      assert.equal(input.callId, "old");
      assert.equal(input.name, "compat_check");
      assert.equal(input.signal, signal);
      assert.deepEqual(input.arguments, {});
      assert.equal(input.calls, undefined);
      return result;
    },
  };
  assert.equal(
    await invokeOwnedTool({
      tools,
      hostVersion: "0.2.1-rc.5",
      callId: "old",
      name: "compat_check",
      signal,
    }),
    result,
  );
});
test("batch call uses Agent admission and cleans it after dispatch failure", async () => {
  const agent = {},
    signal = new AbortController().signal;
  let disposed = 0;
  const toolSet = {
      dispose() {
        disposed++;
      },
    },
    definition = {};
  const tools = {
    selectExecutor(a) {
      assert.equal(a, agent);
      return {
        describe() {
          return { schemas: [{ name: "compat_check" }] };
        },
      };
    },
    async resolve(c) {
      assert.equal(c.agent, agent);
      return toolSet;
    },
    executable(n, a, s) {
      assert.equal(s, toolSet);
      assert.equal(a, agent);
      return definition;
    },
    async execute(input) {
      assert.equal(input.agent, agent);
      assert.equal(input.toolSet, toolSet);
      assert.deepEqual(input.calls, [
        { id: "new", name: "compat_check", arguments: "" },
      ]);
      throw Error("dispatch failed");
    },
  };
  await assert.rejects(
    invokeOwnedTool({
      tools,
      hostVersion: "0.2.2-rc.1",
      agent,
      callId: "new",
      name: "compat_check",
      signal,
    }),
    /dispatch failed/,
  );
  assert.equal(disposed, 1);
});
test("missing executor or missing/empty results fail closed", async () => {
  const options = {
    hostVersion: "0.2.2-rc.1",
    agent: {},
    callId: "x",
    name: "compat_check",
    signal: new AbortController().signal,
  };
  let resolved = 0,
    disposed = 0;
  const tools = {
    selectExecutor() {
      throw Error("unavailable");
    },
    resolve() {
      resolved++;
    },
  };
  await assert.rejects(invokeOwnedTool({ ...options, tools }), /unavailable/);
  assert.equal(resolved, 0);
  tools.selectExecutor = () => ({
    describe: () => ({ schemas: [{ name: "compat_check" }] }),
  });
  tools.resolve = async () => ({
    dispose() {
      disposed++;
    },
  });
  tools.executable = () => ({});
  tools.execute = async () => ({ results: [] });
  await assert.rejects(
    invokeOwnedTool({ ...options, tools }),
    /exactly one|missing/,
  );
  assert.equal(disposed, 1);
  tools.executable = () => undefined;
  tools.execute = () => assert.fail("unavailable tool dispatched");
  await assert.rejects(invokeOwnedTool({ ...options, tools }), /not admitted/);
  assert.equal(disposed, 2);
});
test("PTC selected executor gets run_code transport, never direct capability call", async () => {
  const tools = {
    selectExecutor: () => ({
      describe: () => ({ schemas: [{ name: "run_code" }] }),
    }),
    resolve: async () => ({ dispose() {} }),
    executable: () => ({}),
    execute: async (input) => {
      assert.equal(input.calls[0].name, "run_code");
      assert.match(
        JSON.parse(input.calls[0].arguments).code,
        /await tools\["compat_check"\]/,
      );
      return {
        results: [
          {
            callId: "p",
            result: {
              isError: false,
              value: { logs: [], result: { ok: true } },
              content: [],
            },
          },
        ],
      };
    },
  };
  const r = await invokeOwnedTool({
    tools,
    hostVersion: "0.2.2-rc.1",
    agent: {},
    callId: "p",
    name: "compat_check",
    signal: new AbortController().signal,
  });
  assert.deepEqual(r.value, { ok: true });
});

test("activation receives one captured modelSelection, including Agent route fallback", async () => {
  const selection = { provider: "owned", model: "fixture" };
  let reads = 0,
    disposed = 0;
  const agent = {
    model: {
      current() {
        reads++;
        return selection;
      },
    },
  };
  const tools = {
    selectExecutor: () => ({
      describe: () => ({ schemas: [{ name: "probe" }] }),
    }),
    resolve: async (c) => {
      assert.equal(c.modelSelection, selection);
      return {
        dispose() {
          disposed++;
        },
      };
    },
    executable: () => ({}),
    execute: async () => ({
      results: [
        { callId: "x", result: { isError: false, value: { ok: true } } },
      ],
    }),
  };
  const options = {
    tools,
    hostVersion: "0.2.2-rc.1",
    agent,
    callId: "x",
    name: "probe",
    signal: new AbortController().signal,
  };
  await invokeOwnedTool(options);
  assert.equal(reads, 1);
  await invokeOwnedTool({ ...options, modelSelection: selection });
  assert.equal(reads, 1);
  assert.equal(disposed, 2);
});
