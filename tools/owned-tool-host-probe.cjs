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
  const hostVersion = process.env.DSC_ACCEPTANCE_DSH_VERSION || "0.2.2-rc.1";
  assert(
    ["0.2.2-rc.1", "0.2.2-rc.2", "0.2.2-rc.3"].includes(hostVersion),
    "Refusing unreviewed exact host probe target",
  );
  const review = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, `../rules/dsh-${hostVersion}-review.json`),
    ),
  );
  assert.equal(review.dshVersion, hostVersion);
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
  assert.equal(
    JSON.parse(fs.readFileSync(base + "dsh-tools/package.json")).version,
    hostVersion,
    "Reviewed archive must contain the selected tools version",
  );
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
      hostVersion,
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
    if (["0.2.2-rc.2", "0.2.2-rc.3"].includes(hostVersion)) {
      const [
        { Session, SessionStore },
        { SessionProjectionRegistry },
        { AgentRegistry },
        { AttachmentError, isAttachmentError },
        { HarnessError },
      ] = await Promise.all([
        load("dsh-session"),
        load("dsh-session-projection"),
        load("dsh-agent"),
        load("dsh-attachment"),
        load("dsh-error"),
      ]);
      const detached = Session.create("owned-overloads");
      detached.append = new Proxy(detached.append.bind(detached), {
        apply: (target, receiver, args) =>
          Reflect.apply(target, receiver, args),
      });
      assert.equal(detached.append("turn/start", { turn: 1 }).seq, 0);
      const appended = detached.append([["step/start", { turn: 1, step: 1 }]]);
      assert(Array.isArray(appended));
      assert.equal(appended[0].seq, 1);
      assert.deepEqual(detached.append([]), []);
      checks.push(
        "Session.append single/array overloads through Proxy forwarding; detached private Session only",
      );
      const attachment = new AttachmentError(
        "owned attachment failure",
        "INVALID_IMAGE",
      );
      assert(attachment instanceof HarnessError);
      assert(isAttachmentError(attachment));
      ctx.tools.register(
        def("attachment-error", () => {
          throw attachment;
        }),
      );
      const attachmentResult = await invokeOwnedTool({
        ...opts,
        name: "attachment-error",
      });
      assert.equal(attachmentResult.isError, true);
      assert.equal(attachmentResult.error.info.name, "AttachmentError");
      assert.equal(attachmentResult.error.info.code, "INVALID_IMAGE");
      checks.push(
        "real AttachmentError HarnessError inheritance and native tool error structure (non-prefix code)",
      );
      let releaseFirst;
      const firstGate = new Promise((resolve) => {
        releaseFirst = resolve;
      });
      let secondStarted;
      const secondGate = new Promise((resolve) => {
        secondStarted = resolve;
      });
      const order = [];
      ctx.tools.register({
        ...def("parallel-first", async () => {
          await firstGate;
          order.push("first");
          return { ok: true };
        }),
        isConcurrencySafe: () => true,
      });
      ctx.tools.register({
        ...def("parallel-second", () => {
          order.push("second");
          secondStarted();
          return { ok: true };
        }),
        isConcurrencySafe: () => true,
      });
      const parallel = ctx.tools.execute({
        agent: a,
        signal,
        maxParallelToolCalls: 2,
        calls: [
          { id: "first", name: "parallel-first", arguments: "" },
          { id: "second", name: "parallel-second", arguments: "" },
        ],
      });
      await secondGate;
      releaseFirst();
      const ordered = await parallel;
      assert.deepEqual(order, ["second", "first"]);
      assert.deepEqual(
        ordered.results.map((r) => r.callId),
        ["first", "second"],
      );
      await assert.rejects(
        ctx.tools.execute({
          agent: a,
          signal,
          calls: [],
          maxParallelToolCalls: 0,
        }),
        /positive integer/,
      );
      checks.push(
        "real native bounded parallel bodies settle out of order, results remain model-ordered; invalid budget rejected",
      );
      const actx = new Context();
      try {
        await actx.plugin(SessionStore).await();
        await actx.plugin(SessionProjectionRegistry).await();
        await actx.plugin(AgentRegistry).await();
        const captures = [];
        const factoryHandle = {
          agent: { id: "owned-factory" },
          dispose: async () => {},
        };
        actx.agents.setFactory({
          createAgent(ownerCtx) {
            captures.push(ownerCtx);
            return Promise.resolve(factoryHandle);
          },
          resume(ownerCtx) {
            captures.push(ownerCtx);
            return Promise.resolve(factoryHandle);
          },
        });
        let owner;
        const ownerFiber = actx.plugin({
          name: "owned-caller-context",
          inject: ["agents"],
          apply(caller) {
            owner = caller;
          },
        });
        await ownerFiber.await();
        assert.equal(await owner.agents.create({}), factoryHandle);
        assert.equal(await owner.agents.resume({}), factoryHandle);
        assert.equal(captures.length, 2);
        assert(captures.every((c) => c.fiber === owner.fiber));
        assert(captures.every((c) => c.fiber !== actx.fiber));
        assert.equal(actx.agents.get("owned-factory"), undefined);
        const borrowed = { id: detached.id, session: detached, ctx: actx };
        const detachBorrowed = actx.agents.enter(borrowed);
        assert.equal(actx.agents.get(detached.id), borrowed);
        assert.equal(Object.hasOwn(borrowed, "dispose"), false);
        detachBorrowed();
        assert.equal(actx.agents.get(detached.id), undefined);
        assert.equal(actx.agents.currentInitiator(), undefined);
        assert.throws(() => actx.agents.requireInitiator());
        const initiating = { id: "owned-initiator" };
        const returned = actx.agents.withInitiator(initiating, () => {
          assert.equal(actx.agents.requireInitiator(), initiating);
          assert.equal(
            actx.agents.withoutInitiator(() => actx.agents.currentInitiator()),
            undefined,
          );
          return 42;
        });
        assert.equal(returned, 42);
        await actx.agents.withInitiator(initiating, async () => {
          await Promise.resolve();
          assert.equal(actx.agents.currentInitiator(), initiating);
        });
        assert.equal(actx.agents.currentInitiator(), undefined);
        await ownerFiber.dispose();
        const registry = actx.agents;
        let finishForeground,
          registryDisposed = false;
        const foreground = registry.withInitiator(
          initiating,
          () =>
            new Promise((resolve) => {
              finishForeground = resolve;
            }),
        );
        const registryDisposal = actx.fiber.dispose().then(() => {
          registryDisposed = true;
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(registryDisposed, false);
        finishForeground("foreground-settled");
        assert.equal(await foreground, "foreground-settled");
        await registryDisposal;
        assert.throws(() => registry.currentInitiator(), /disposed|closing/i);
        checks.push(
          "real AgentRegistry forwards caller ownerCtx (controlled factory), borrowed get, sync/async initiator, clearing scopes and disposal drains returned foreground Promise",
        );
      } finally {
        await actx.fiber.dispose();
      }
    }

    // A separate real ToolsService selects PTC, with an explicit runtime seam.
    const pctx = new Context();
    try {
      await pctx.plugin(SystemPrompt, {}).await();
      await pctx.plugin(ToolsService).await();
      let releaseCount = 0,
        failRelease = false,
        programRuns = 0;
      const resetNotices = [];
      pctx.provide("ptcRuntime", {
        retainsState: true,
        release: async () => {
          releaseCount++;
          if (failRelease) throw Error("owned cleanup failure");
        },
        language: "typescript",
        programFormat: "function-body",
        resolve: (r) => r,
        run: async (r) => {
          programRuns++;
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
      const pa = {
        id: "owned-ptc",
        session: { id: "owned-ptc", append() {} },
        inject: (message) => resetNotices.push(message),
      };
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
      if (["0.2.2-rc.2", "0.2.2-rc.3"].includes(hostVersion)) {
        const selectedPtc = pctx.tools.selectExecutor(pa);
        const beforeReset = programRuns;
        await selectedPtc.reset(pa);
        assert.equal(programRuns, beforeReset);
        assert.equal(releaseCount, 1);
        assert.equal(resetNotices.length, 1);
        failRelease = true;
        await assert.rejects(
          selectedPtc.reset(pa),
          (error) => error.code === "CODE_RESET_FAILED",
        );
        const blocked = await invokeOwnedTool(popts);
        assert.equal(blocked.isError, true);
        assert.equal(blocked.error.info.code, "CODE_RUN_FAILED");
        assert.equal(programRuns, beforeReset);
        failRelease = false;
        await selectedPtc.reset(pa);
        assert.equal(releaseCount, 3);
        assert.equal(resetNotices.length, 2);
        assert.equal((await invokeOwnedTool(popts)).value.ok, true);
        checks.push(
          "real PTC reset release/no program run, cleanup failure blocks admission and retry recovers (controlled retained runtime seam)",
        );
      }
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
      ...(["0.2.2-rc.2", "0.2.2-rc.3"].includes(hostVersion)
        ? [
            "dsh-session",
            "dsh-session-projection",
            "dsh-agent",
            "dsh-attachment",
            "dsh-error",
          ]
        : []),
    ])
      hashes[n] = createHash("sha256")
        .update(fs.readFileSync(base + n + "/lib/index.js"))
        .digest("hex");
    console.log(
      JSON.stringify(
        {
          ok: true,
          node: process.version,
          electron: process.versions.electron,
          carrier: process.execPath,
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
