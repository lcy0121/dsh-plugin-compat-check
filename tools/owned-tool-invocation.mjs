/** Acceptance-only bridge. The new service dispatches batches through the Agent's
 * selected executor; falling back to a direct definition would bypass policy,
 * admission and strict JSON/output validation. This file has no dependencies so
 * a private fixture can copy it beside its own entry point. */
export async function invokeOwnedTool({
  tools,
  hostVersion,
  agent,
  callId,
  name,
  arguments: args,
  signal,
  modelSelection,
  programLanguage = "typescript",
}) {
  if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(hostVersion ?? ""))
    throw new Error("Owned tool invocation requires an explicit host version");
  const [major, minor] = hostVersion.split(".").map(Number);
  if (
    (major === 0 && minor < 2) ||
    (major === 0 && minor === 2 && /^0\.2\.[01](?:-|$)/.test(hostVersion))
  )
    return tools.execute({
      callId,
      name,
      arguments: args ?? {},
      signal,
      parent: Symbol("owned-acceptance"),
    });
  if (!agent) throw new Error("Batch tool invocation requires its owned Agent");
  const executor = tools.selectExecutor(agent); // unavailable must reject, never an empty success
  const toolSet = await tools.resolve({
    agent,
    signal,
    modelSelection: modelSelection ?? agent.model?.current(),
  });
  try {
    if (!tools.executable(name, agent, toolSet))
      throw new Error(`Owned tool ${name} is not admitted`);
    const names = executor
      .describe(tools.definitions?.(agent, toolSet) ?? [])
      .schemas.map((s) => s.name);
    const ptc = names.length === 1 && names[0] === "run_code";
    if (!ptc && !names.includes(name))
      throw new Error(`Selected executor does not expose ${name}`);
    if (ptc && programLanguage !== "typescript")
      throw new Error(
        "Owned PTC invocation supports the TypeScript runtime only",
      );
    const block = {
      id: callId,
      name: ptc ? "run_code" : name,
      arguments: ptc
        ? JSON.stringify({
            description: `Owned acceptance: ${name}`,
            code: `return await tools[${JSON.stringify(name)}](${JSON.stringify(args ?? {})});`,
          })
        : args === undefined
          ? ""
          : JSON.stringify(args),
    };
    const batch = await tools.execute({
      calls: [block],
      agent,
      toolSet,
      signal,
    });
    if (
      !Array.isArray(batch?.results) ||
      batch.results.length !== 1 ||
      batch.results[0].callId !== callId ||
      typeof batch.results[0].result?.isError !== "boolean"
    )
      throw new Error(
        "Owned tool batch must settle exactly one correlated result",
      );
    const result = batch.results[0].result;
    if (!ptc || result.isError) return result;
    if (!Object.hasOwn(result.value ?? {}, "result"))
      throw new Error("Owned PTC transport missing capability result");
    return { ...result, value: result.value.result };
  } finally {
    toolSet.dispose();
  }
}
