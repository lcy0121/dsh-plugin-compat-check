import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { transformSync } from "esbuild";

const archive =
  process.env.DSC_RC22_5_SOURCE_ARCHIVE || "tmp/026-planning-20261120/rc5.tgz";
const review = JSON.parse(
  fs.readFileSync(
    new URL("../rules/dsh-0.2.2-rc.5-semantics-review.json", import.meta.url),
  ),
);
const skip = !fs.existsSync(archive);
function officialModules() {
  assert.equal(
    createHash("sha256").update(fs.readFileSync(archive)).digest("hex"),
    review.sourceArchiveSha256,
  );
  const sources = new Map();
  function read(file) {
    if (!sources.has(file)) {
      const bytes = execFileSync("tar", [
        "-xOf",
        archive,
        `deepseek-harness-${review.sourceTag}/${file}`,
      ]);
      if (Object.hasOwn(review.sources, file))
        assert.equal(
          createHash("sha256").update(bytes).digest("hex"),
          review.sources[file],
          file,
        );
      sources.set(file, bytes.toString());
    }
    return sources.get(file);
  }
  function load(file, dependencies = {}, globals = {}, appendix = "") {
    const module = { exports: {} };
    vm.runInNewContext(
      transformSync(read(file) + appendix, {
        loader: "ts",
        format: "cjs",
        tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
      }).code,
      {
        ...globals,
        module,
        exports: module.exports,
        require(name) {
          assert(
            Object.hasOwn(dependencies, name),
            "Unexpected dependency " + name,
          );
          return dependencies[name];
        },
      },
      { filename: file, timeout: 2000 },
    );
    return module.exports;
  }
  return { read, load };
}

test(
  "rc.5 official Messages translator distinguishes refusal, malformed response and cancellation",
  { skip },
  async () => {
    const { load } = officialModules();
    class LlmError extends Error {
      constructor(message, code) {
        super(message);
        this.code = code;
      }
    }
    const llm = { LlmError, ToolCallId: (id) => id };
    const deps = { "@deepseek-ai/dsh-llm": llm };
    const dir = "packages/llm/llm-deepseek/src";
    const replay = load(dir + "/replay.ts", deps);
    const { translate } = load(dir + "/translate.ts", {
      ...deps,
      "./replay.ts": replay,
    });
    function* response(stop, detail) {
      yield { type: "message_start", message: { usage: { input_tokens: 5 } } };
      yield {
        type: "message_delta",
        delta: { stop_reason: stop, stop_details: detail },
        usage: { output_tokens: 2 },
      };
      yield { type: "message_stop" };
    }
    const refusal = translate(
      response("refusal", { explanation: "fixture" }),
      "fixture-model",
    );
    const usage = (await refusal.next()).value;
    assert.equal(usage.type, "usage");
    assert.equal(usage.usage.totalTokens, 7);
    await assert.rejects(refusal.next(), {
      code: "CONTENT_REFUSED",
      message: /fixture/,
    });
    await assert.rejects(
      translate(response("malformed"), "fixture-model").next(),
      {
        code: "MALFORMED_RESPONSE",
      },
    );
    const abort = new AbortController();
    abort.abort(new DOMException("fixture cancelled", "AbortError"));
    async function* cancelled() {
      abort.signal.throwIfAborted();
    }
    await assert.rejects(
      translate(cancelled(), "fixture-model").next(),
      (error) => error === abort.signal.reason,
    );
  },
);

test(
  "rc.5 official Web service routes search, forwards signals and keeps Fetch independent",
  { skip },
  async () => {
    const { load } = officialModules();
    const dir = "packages/web/web/src";
    const types = load(dir + "/types.ts", {
      "@deepseek-ai/dsh-llm": {
        HarnessError: class extends Error {
          constructor(message, code) {
            super(message);
            this.code = code;
          }
        },
      },
    });
    const { WebRuntime } = load(
      dir + "/index.ts",
      {
        "@deepseek-ai/dsh-typert-protocol": {
          Remote() {},
          TypertRemoteService: class {
            constructor(ctx) {
              this.ctx = ctx;
            }
          },
        },
        "@deepseek-ai/schemastery": {
          string: () => ({ volatile() {} }),
          object: () => ({}),
        },
        "./types.ts": types,
      },
      { process: { env: {} } },
    );
    let configured;
    const web = new WebRuntime(
      {
        events: { dispatch: () => [] },
        effect(fn) {
          const fiber = fn();
          return fiber.next().value;
        },
      },
      {
        searchProvider: { get: () => configured },
        fetchProvider: { get: () => "http" },
      },
    );
    const asked = [],
      searches = [];
    let messagesAvailable = true,
      messagesReady = true;
    function provider(id, available = () => true, ready = () => true) {
      return {
        id,
        available,
        ready: (route) => {
          asked.push([id, route]);
          return ready();
        },
        search: (request, signal) => {
          searches.push({ id, request, signal });
          signal?.throwIfAborted();
          return {
            content: id,
            sources: [
              { url: "https://fixture.invalid/a" },
              { url: "https://fixture.invalid/b" },
            ],
          };
        },
      };
    }
    web.registerSearchProvider(
      provider(
        "deepseek-official",
        () => messagesAvailable,
        () => messagesReady,
      ),
    );
    const removeAPI = web.registerSearchProvider(
      provider("deepseek-search-api"),
    );
    web.registerFetchProvider({
      id: "http",
      available: () => true,
      fetch: (request, signal) => ({ request, signal }),
    });
    const abort = new AbortController();
    for (const [route, expected] of [
      ["deepseek-account", "deepseek-official"],
      ["deepseek-official", "deepseek-official"],
      ["another-model", "deepseek-search-api"],
      [undefined, "deepseek-search-api"],
    ]) {
      assert.equal(await web.searchReady(route), true);
      assert.deepEqual(asked.at(-1), [expected, route]);
      const request = { query: "fixture", maxResults: 1, llmProvider: route };
      const result = await web.search(request, abort.signal);
      assert.equal(result.content, expected);
      assert.equal(result.sources.length, 1);
      assert.equal(result.truncated, true);
      assert.deepEqual(searches.at(-1), {
        id: expected,
        request,
        signal: abort.signal,
      });
    }
    messagesReady = false;
    assert.equal(await web.searchReady("deepseek-account"), false);
    messagesAvailable = false;
    assert.equal(
      (await web.search({ query: "fixture", llmProvider: "deepseek-account" }))
        .content,
      "deepseek-search-api",
    );
    configured = "deepseek-official";
    assert.equal(await web.searchReady("deepseek-account"), true);
    await assert.rejects(web.search({ query: "fixture" }), {
      code: "WEB_PROVIDER_CONFIGURED_UNAVAILABLE",
    });
    configured = undefined;
    removeAPI();
    await assert.rejects(web.search({ query: "fixture" }), {
      code: "WEB_PROVIDER_UNAVAILABLE",
    });
    const request = { url: "https://fixture.invalid" };
    const fetched = await web.fetch(request, abort.signal);
    assert.equal(fetched.request, request);
    assert.equal(fetched.signal, abort.signal);

    const calls = [];
    const { DeepSeekSearchProvider } = load(
      "packages/web/web-search-deepseek/src/provider.ts",
      {
        "@deepseek-ai/dsh-web": types,
      },
      {
        URL,
        fetch: async (endpoint, options) => {
          calls.push({
            endpoint,
            signal: options.signal,
            body: JSON.parse(options.body),
          });
          return Response.json({
            content: [
              {
                type: "web_search_tool_result",
                content: [
                  {
                    type: "web_search_result",
                    url: "https://fixture.invalid/result",
                  },
                ],
              },
            ],
          });
        },
      },
    );
    const endpoint = "https://owned-gateway.invalid/independent/v1";
    const messages = new DeepSeekSearchProvider(() => ({
      baseURL: endpoint,
      apiKey: "synthetic",
      model: "fixture-model",
      maxTokens: 32,
      maxUses: 1,
      apiVersion: "2023-06-01",
    }));
    const response = await messages.search(
      { query: "fixture", llmProvider: "deepseek-official" },
      abort.signal,
    );
    assert.equal(response.sources[0].url, "https://fixture.invalid/result");
    assert.equal(calls[0].endpoint, endpoint + "/messages");
    assert.equal(calls[0].signal, abort.signal);
    assert.equal(calls[0].body.tools[0].type, "web_search_20250305");
    abort.abort();
    await assert.rejects(messages.search({ query: "fixture" }, abort.signal), {
      code: "WEB_ABORTED",
    });
    assert.equal(calls.length, 1);
  },
);

test(
  "rc.5 official search tool reads admission and execution routes at the correct boundaries",
  { skip },
  async () => {
    const { load } = officialModules();
    const { applyWebSearchTool } = load(
      "packages/web/tool-web/src/search.ts",
      {
        "@deepseek-ai/dsh-tools": { defineTool: (tool) => tool },
        "@deepseek-ai/dsh-output-retention": {
          truncateWithoutSplittingSurrogatePair: (text) => text,
        },
        "./trust.ts": { EXTERNAL_WEB_CONTENT_NOTICE: "owned fixture" },
      },
      { AbortController, AbortSignal },
    );
    const readiness = [],
      calls = [];
    let registration;
    const ctx = {
      systemPrompt: { getSectionOrder: () => 1, section() {} },
      tools: {
        register: (tool, options) => {
          registration = { tool, options };
        },
      },
      web: {
        searchReady(route) {
          readiness.push(route);
          return false;
        },
        search(request, signal) {
          calls.push({ request, signal });
          signal.throwIfAborted();
          return { sources: [], truncated: false };
        },
      },
    };
    applyWebSearchTool(ctx, 5, 3, 100, 500, false);
    assert.equal(
      await registration.options.when({
        modelSelection: { provider: "fixture-admission" },
      }),
      false,
    );
    assert.deepEqual(readiness, ["fixture-admission"]);
    const controller = new AbortController();
    const exec = {
      signal: controller.signal,
      agent: {
        session: { requestContext: () => ({ provider: "deepseek-account" }) },
      },
    };
    await registration.tool.execute({ queries: ["a"] }, exec);
    assert.equal(calls[0].request.llmProvider, "deepseek-account");
    assert.equal(calls[0].signal, exec.signal);
    await registration.tool.execute(
      { queries: ["b"] },
      { signal: exec.signal },
    );
    assert.equal(Object.hasOwn(calls[1].request, "llmProvider"), false);
    controller.abort();
    await assert.rejects(
      registration.tool.execute({ queries: ["a", "b"] }, exec),
      { name: "AbortError" },
    );
    assert.equal(calls.length, 4);
  },
);
