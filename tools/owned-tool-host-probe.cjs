/** Run with the installed Electron carrier (ELECTRON_RUN_AS_NODE=1).
 * Uses authoritative packaged Cordis, ToolsService and both executors. The PTC
 * runtime seam is deliberately controlled; it does not claim OS sandbox coverage. */
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
(async () => {
  const archive =
    process.env.DSC_HOST_ASAR ||
    "/Applications/DeepSeek Harness.app/Contents/Resources/app.asar";
  const review = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../rules/dsh-0.2.2-rc.1-review.json"),
    ),
  );
  assert.equal(review.dshVersion, "0.2.2-rc.1");
  const digest = createHash("sha256");
  const physicalFs = process.versions.electron ? require("original-fs") : fs;
  for await (const chunk of physicalFs.createReadStream(archive))
    digest.update(chunk);
  const asarSha256 = digest.digest("hex");
  assert.equal(
    asarSha256,
    review.asar.sha256,
    "Refusing unreviewed host ASAR before importing official code",
  );
  const base = archive + "/dsh/node_modules/@deepseek-ai/";
  const load = (n) => import(pathToFileURL(base + n + "/lib/index.js").href);
  const [
    { Context },
    { ToolsService },
    { SystemPrompt },
    native,
    ptc,
    { createScope },
  ] = await Promise.all([
    load("cordis"),
    load("dsh-tools"),
    load("dsh-system-prompt"),
    load("dsh-tool-executor-native"),
    load("dsh-tool-executor-ptc"),
    load("dsh-scope"),
  ]);
  const { invokeOwnedTool } = await import(
    pathToFileURL(path.resolve("tools/owned-tool-invocation.mjs")).href
  );
  const ctx = new Context(),
    checks = [];
  const signal = new AbortController().signal;
  const schema = {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  };
  const def = (name, execute) => ({
    name,
    description: "Owned probe",
    parameters: { type: "object", properties: {} },
    output: {
      schema,
      render: (_a, v) => [{ type: "text", text: JSON.stringify(v) }],
    },
    execute,
  });
  try {
    await ctx.plugin(SystemPrompt, {}).await();
    await ctx.plugin(ToolsService).await();
    const a = { id: "owned-a" },
      b = { id: "owned-b" };
    await ctx
      .inject(["tools"], (c) => {
        a.ctx = createScope(c, a).ctx;
        b.ctx = createScope(c, b).ctx;
      })
      .await();
    await ctx.plugin(native).await();
    ctx.tools.register(def("probe", () => ({ ok: true })));
    const opts = {
      tools: ctx.tools,
      hostVersion: "0.2.2-rc.1",
      agent: a,
      callId: "owned",
      name: "probe",
      signal,
    };
    assert.equal((await invokeOwnedTool(opts)).value.ok, true);
    checks.push("native batch and no-argument parse");
    let admitted = 0;
    ctx.tools.register(
      def("conditional", () => ({ ok: true })),
      {
        when: ({ agent }) => {
          admitted++;
          return agent === a;
        },
      },
    );
    assert.equal(ctx.tools.executable("conditional", a), undefined);
    assert.equal(
      (await invokeOwnedTool({ ...opts, name: "conditional" })).value.ok,
      true,
    );
    await assert.rejects(
      invokeOwnedTool({ ...opts, agent: b, name: "conditional" }),
      /not admitted/,
    );
    assert.equal(admitted, 2);
    checks.push("per-step conditional admission and denial");
    const set = await ctx.tools.resolve({ agent: a, signal });
    assert.equal(set.view(b).size, 0);
    set.dispose();
    assert.equal(set.view(a).size, 0);
    checks.push("admission scope isolation and disposal");
    const executor = ctx.tools.selectExecutor(a);
    const ownedNative = new native.NativeToolExecutor(a.ctx);
    const unload = a.ctx.tools.setExecutor(ownedNative);
    assert.equal(ctx.tools.selectExecutor(a), ownedNative);
    assert.equal(ctx.tools.selectExecutor(b), executor);
    unload();
    await assert.rejects(invokeOwnedTool(opts), /executor/i);
    a.ctx.tools.setExecutor(ownedNative);
    b.ctx.tools.register(def("probe", () => ({ ok: false })));
    assert.equal(
      (await invokeOwnedTool({ ...opts, agent: b })).value.ok,
      false,
    );
    assert.equal((await invokeOwnedTool(opts)).value.ok, true);
    const lift = a.ctx.tools.restrict({ deny: ["probe"] });
    await assert.rejects(invokeOwnedTool(opts), /not admitted/);
    lift();
    checks.push(
      "Agent-scoped executor selection/unload, shadowing and restrictions",
    );
    ctx.tools.register(def("bad-json", () => ({ ok: true, extra: undefined })));
    ctx.tools.register(def("bad-schema", () => ({ ok: "wrong" })));
    for (const name of ["bad-json", "bad-schema"]) {
      const r = await invokeOwnedTool({ ...opts, name });
      assert.equal(r.isError, true);
      assert(r.error);
    }
    checks.push("real native strict JSON and output schema rejection");
    const aborter = new AbortController();
    let start;
    const started = new Promise((r) => (start = r));
    ctx.tools.register(
      def("cancel", async (_args, exec) => {
        start();
        await new Promise((r) =>
          exec.signal.addEventListener("abort", r, { once: true }),
        );
        return { ok: true };
      }),
    );
    const pending = invokeOwnedTool({
      ...opts,
      name: "cancel",
      signal: aborter.signal,
    });
    await started;
    aborter.abort();
    assert.equal((await pending).error.info.code, "ABORTED");
    checks.push("started cancellation ABORTED");
    const pre = new AbortController();
    pre.abort();
    const stopped = await ctx.tools.execute({
      calls: [{ id: "pre", name: "probe", arguments: "" }],
      agent: a,
      signal: pre.signal,
    });
    assert.equal(
      stopped.results[0].result.error.info.code,
      "ABORTED_BEFORE_DISPATCH",
    );
    checks.push("before-dispatch cancellation contract");
    // A separate real ToolsService selects PTC, with an explicit runtime seam.
    const pctx = new Context();
    try {
      await pctx.plugin(SystemPrompt, {}).await();
      await pctx.plugin(ToolsService).await();
      pctx.provide("ptcRuntime", {
        language: "typescript",
        programFormat: "function-body",
        resolve: (r) => r,
        run: async (r) => {
          const tools = r.bindings.find((x) => x.global === "tools").functions;
          try {
            return {
              logs: [],
              value: await new (Object.getPrototypeOf(
                async function () {},
              ).constructor)("tools", r.program)(tools),
            };
          } catch (e) {
            return {
              logs: [],
              error: {
                kind: r.signal.aborted ? "abort" : "exception",
                message: String(e),
              },
            };
          }
        },
      });
      pctx.provide("workingDirectory", { ensure: async () => process.cwd() });
      await pctx.plugin(native).await();
      const pa = { id: "owned-ptc", session: { id: "owned-ptc", append() {} } };
      await pctx
        .inject(["tools"], (c) => {
          pa.ctx = createScope(c, pa).ctx;
        })
        .await();
      await pa.ctx.plugin(ptc).await();
      assert.notEqual(
        pctx.tools.selectExecutor(pa),
        pctx.tools.selectExecutor(),
      );
      pctx.tools.register(def("probe", () => ({ ok: true })));
      const popts = { ...opts, tools: pctx.tools, agent: pa };
      assert.equal((await invokeOwnedTool(popts)).value.ok, true);
      const direct = await pctx.tools.execute({
        calls: [{ id: "direct", name: "probe", arguments: "{}" }],
        agent: pa,
        signal,
      });
      assert.equal(direct.results[0].result.isError, true);
      assert.equal(direct.results[0].result.error.info.code, "UNKNOWN_TOOL");
      let ptcStarted;
      const ptcStart = new Promise((r) => (ptcStarted = r));
      const pcancel = new AbortController();
      pctx.tools.register(
        def("cancel", async (_a, exec) => {
          ptcStarted();
          await new Promise((r) =>
            exec.signal.addEventListener("abort", r, { once: true }),
          );
          return { ok: true };
        }),
      );
      const pPending = invokeOwnedTool({
        ...popts,
        name: "cancel",
        signal: pcancel.signal,
      });
      await ptcStart;
      pcancel.abort();
      assert.equal((await pPending).error.info.code, "ABORTED");
      checks.push(
        "PTC started cancellation ABORTED and nested dispatch drain (controlled runtime seam)",
      );
      pctx.tools.register(def("bad-schema", () => ({ ok: "wrong" })));
      assert.equal(
        (await invokeOwnedTool({ ...popts, name: "bad-schema" })).isError,
        true,
      );
      const set = await pctx.tools.resolve({ agent: pa, signal });
      const prompt = await pctx.systemPrompt.assemble({
        scope: pa,
        toolSet: set,
      });
      assert.deepEqual(
        prompt.tools.map((t) => t.name),
        ["run_code"],
      );
      assert(prompt.sections.some((s) => s.text.includes("probe")));
      set.dispose();
      checks.push(
        "PTC selected transport, nested strict schema, direct-name denial and SDK prompt (controlled runtime seam)",
      );
    } finally {
      await pctx.fiber.dispose();
    }
    // An executor-less deployment must reject instead of silently accepting no calls.
    const empty = new Context();
    try {
      await empty.plugin(SystemPrompt, {}).await();
      await empty.plugin(ToolsService).await();
      await assert.rejects(
        empty.tools.execute({ calls: [], signal }),
        /executor/i,
      );
    } finally {
      await empty.fiber.dispose();
    }
    checks.push("missing executor fails closed");
    const hashes = {};
    for (const n of [
      "dsh-tools",
      "dsh-tool-executor-native",
      "dsh-tool-executor-ptc",
    ])
      hashes[n] = createHash("sha256")
        .update(fs.readFileSync(base + n + "/lib/index.js"))
        .digest("hex");
    console.log(
      JSON.stringify(
        {
          ok: true,
          node: process.version,
          version: JSON.parse(fs.readFileSync(base + "dsh-tools/package.json"))
            .version,
          source: archive,
          asarSha256,
          sourceSha256: hashes,
          checks,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctx.fiber.dispose();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
