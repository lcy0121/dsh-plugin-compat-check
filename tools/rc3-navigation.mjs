/** Actual owned browser context and stable region/role selectors; never submit. */
export async function verifyRc3Navigation(evaluate, poll, workspace) {
  const requireTrue = (v, m) => {
    if (!v) throw Error(m);
  };
  await poll(
    () => evaluate("Boolean(window.__DSC_RC3__)"),
    "rc.3 test bridge missing",
  );
  const id = await evaluate(
    `(async()=>{const c=window.__DSC_RC3__;const w=await c.workspaces.create({path:${JSON.stringify(workspace)}});window.__DSC_RC3_WORKSPACE__=w.workspaceId;const id=await c.uiWorkspace.connectWorkspace(w.workspaceId,{agentPreset:'cordis'});await c.uiWorkspace.openWorkspace(w.workspaceId,undefined,{agentPreset:'cordis'});window.__DSC_RC3_SESSION__=id;return id})()`,
  );
  requireTrue(
    typeof id === "string",
    "rc.3 workspace failed to create a blank session",
  );
  const draft = () =>
    evaluate(
      `window.__DSC_RC3__.conversation.input.shell(${JSON.stringify(id)}).snapshot.draft`,
    );
  const initialize = async (options, expected) => {
    await evaluate(
      `window.__DSC_RC3__.uiWorkspace.startSession(window.__DSC_RC3_WORKSPACE__,${JSON.stringify({ agentPreset: "cordis", ...options })})`,
    );
    try {
      await poll(
        async () => (await draft()) === expected,
        "rc.3 draft policy failed: " + JSON.stringify(options),
      );
    } catch (e) {
      throw Error(e.message + "; actual=" + JSON.stringify(await draft()));
    }
  };
  await initialize(
    { prompt: "owned draft", whenDraftExists: "replace" },
    "owned draft",
  );
  await initialize({ prompt: "ignored" }, "owned draft");
  await initialize(
    { prompt: "appended", whenDraftExists: "append" },
    "owned draft\nappended",
  );
  await initialize({ prompt: "legacy", clearPreviousDraft: true }, "legacy");
  await initialize(
    { prompt: "ignored", clearPreviousDraft: true, whenDraftExists: "keep" },
    "legacy",
  );
  const second = await evaluate(
    `window.__DSC_RC3__.uiWorkspace.connectWorkspace(window.__DSC_RC3_WORKSPACE__,{agentPreset:'ptc'})`,
  );
  requireTrue(second !== id, "rc.3 reused a blank listing another preset");
  await evaluate(
    "window.__DSC_RC3__.uiWorkspace.startSession(window.__DSC_RC3_WORKSPACE__)",
  );
  await poll(
    async () => (await draft()) === "legacy",
    "New Session lost the existing draft",
  );
  requireTrue(
    await evaluate(
      `window.__DSC_RC3__.uiWorkspace.connectWorkspace(window.__DSC_RC3_WORKSPACE__,{agentPreset:'cordis'}).then(id=>id===${JSON.stringify(id)})`,
    ),
    "rc.3 blank identity not reused",
  );
  const selectors = [
    'nav[aria-label="全局面板"] button[aria-label="更多"][aria-haspopup="menu"]',
    'button[aria-label^="更多会话视图"][aria-haspopup="menu"]',
    'button[aria-label="更多工具"][aria-haspopup="menu"]',
  ];
  const menus = [];
  for (let i = 0; i < selectors.length; i++) {
    // Reopen the conversation after plugin-list navigation; right guide may be collapsed.
    await evaluate(
      `window.__DSC_RC3__.uiWorkspace.openSession("rc3-navigation-seeded")`,
    );
    if (i === 2)
      await evaluate(
        `document.querySelector('button[aria-label="打开右侧边栏"]')?.click()`,
      );
    const query = `document.querySelectorAll(${JSON.stringify(selectors[i])})`;
    await poll(
      () => evaluate(`${query}.length===1`),
      "rc.3 region menu missing: " + i,
    );
    await evaluate(`${query}[0].click()`);
    await poll(
      () =>
        evaluate(
          `[...document.querySelectorAll('[role="menuitem"]')].some(e=>e.innerText==='浏览更多插件')`,
        ),
      "rc.3 browse action missing",
    );
    requireTrue(
      await evaluate(
        `[...document.querySelectorAll('[role="menuitem"]')].some(e=>e.innerText==='创建你的插件')`,
      ),
      "rc.3 create action missing",
    );
    await evaluate(
      `[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.innerText==='浏览更多插件').click()`,
    );
    await poll(
      () =>
        evaluate(
          `Boolean(document.querySelector('button[aria-label="查看 dsh-plugin-compat-check"]')) || document.body.innerText.includes('dsh-plugin-compat-check')`,
        ),
      "rc.3 Plugins main list missing",
    );
    requireTrue(
      await evaluate(`!document.querySelector('[role="dialog"]')`),
      "Browse opened an installation modal",
    );
    menus.push({
      region: ["sidebar", "conversation", "rightbar"][i],
      browseMainList: true,
      createAction: true,
    });
  }
  await evaluate(
    "window.__DSC_RC3__.pluginNavigation.openBundle('dsh-plugin-compat-check')",
  );
  await poll(
    () =>
      evaluate(
        `Boolean(document.querySelector('[data-compat-detail="dsh-plugin-compat-check"]')) && Boolean(document.querySelector('[data-compat-detail-badge="dsh-plugin-compat-check"]'))`,
      ),
    "rc.3 plugin detail/badge missing",
  );
  // Actual Create action must append its prompt to the existing Cordis draft.
  await evaluate(
    `window.__DSC_RC3__.uiWorkspace.openSession(${JSON.stringify(id)})`,
  );
  await poll(
    () =>
      evaluate(
        `document.querySelectorAll(${JSON.stringify(selectors[0])}).length===1`,
      ),
    "Sidebar More missing after navigation",
  );
  await evaluate(
    `document.querySelector(${JSON.stringify(selectors[0])}).click()`,
  );
  await poll(
    () =>
      evaluate(
        `[...document.querySelectorAll('[role="menuitem"]')].some(e=>e.innerText==='创建你的插件')`,
      ),
    "Creator row missing",
  );
  await evaluate(
    `[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.innerText==='创建你的插件').click()`,
  );
  await poll(
    async () => (await draft()) === "legacy\n创建一个带左侧栏入口的 DSH 插件。",
    "Creator did not append its unsent draft",
  );
  requireTrue(
    await evaluate(
      `window.__DSC_RC3__.sessions.list.getSnapshot().byId[${JSON.stringify(id)}]?.blank===true`,
    ),
    "Creator submitted a turn instead of retaining a blank draft",
  );
  return {
    menus,
    detailAndBadge: true,
    blankReuse: true,
    presetIsolation: true,
    defaultKeep: true,
    append: true,
    legacyReplace: true,
    explicitPolicyPrecedence: true,
    createDraftOnly: true,
  };
}
