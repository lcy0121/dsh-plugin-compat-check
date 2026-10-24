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
  // Move to a global panel first: an old draft must not prove navigation.
  const selected = (target, activePanelId = null) =>
    evaluate(
      `(()=>{const c=window.__DSC_RC3__;const rows=Object.values(c.sessions.list.getSnapshot().byId).filter(r=>(r.retainedBy.mainView??0)>0);return rows.length===1&&rows[0].id===${JSON.stringify(target)}&&c.layout.panelInfo.getSnapshot().activePanelId===${JSON.stringify(activePanelId)}})()`,
    );
  const readRich = (target) =>
    evaluate(
      `(()=>{const c=window.__DSC_RC3__,s=c.conversation.input.shell(${JSON.stringify(target)}),v=s.snapshot;return {draft:v.draft,phase:v.phase,attachments:[...v.attachmentIds],resolved:c.conversation.resolveDraftAttachments(v.attachmentIds).map(a=>a.id),references:s.draftSnapshot.references.map(({source,ref,offset,length,label,appearance,clipboardText})=>({source,ref,offset,length,label,appearance,clipboardText})),blank:c.sessions.list.getSnapshot().byId[${JSON.stringify(target)}]?.blank}})()`,
    );
  const seedRich = async (target, text) => {
    await evaluate(
      `(()=>{const c=window.__DSC_RC3__,s=c.conversation.input.shell(${JSON.stringify(target)});for(const id of [...s.snapshot.attachmentIds])s.removeAttachment(id);s.setDraft({text:${JSON.stringify(text + " @notes.md")},references:[{source:'file',ref:${JSON.stringify(workspace + "/notes.md")},offset:${text.length + 1},length:9,label:'notes.md',appearance:'file',clipboardText:'@notes.md'}]});const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='),c=>c.charCodeAt(0));const a=c.conversation.createDrafts(${JSON.stringify(target)},[new File([bytes],'owned.png',{type:'image/png'})]);if(a.length!==1||!s.addAttachments(a.map(a=>a.id)))throw Error('Creator rich draft seed failed')})()`,
    );
    const before = await readRich(target);
    requireTrue(
      before.draft === text + " @notes.md" &&
        before.references.length === 1 &&
        before.references[0].ref === workspace + "/notes.md" &&
        before.attachments.length === 1 &&
        before.resolved[0] === before.attachments[0],
      "Creator rich draft seed missing",
    );
    return before;
  };
  const richMatches = async (target, before, expected) => {
    const after = await readRich(target);
    return (
      (await selected(target)) &&
      after.blank === true &&
      after.phase === "plain" &&
      after.draft === expected &&
      JSON.stringify(after.references) === JSON.stringify(before.references) &&
      JSON.stringify(after.attachments) ===
        JSON.stringify(before.attachments) &&
      JSON.stringify(after.resolved) === JSON.stringify(before.attachments)
    );
  };
  const waitRich = async (target, before, expected, message) => {
    try {
      await poll(() => richMatches(target, before, expected), message);
    } catch (error) {
      throw Error(
        error.message +
          "; actual=" +
          JSON.stringify(await readRich(target)) +
          "; selected=" +
          (await selected(target)),
      );
    }
  };
  // Resolve the no-preset policy before the action; it may select another blank.
  const newId = await evaluate(
    "window.__DSC_RC3__.uiWorkspace.connectWorkspace(window.__DSC_RC3_WORKSPACE__)",
  );
  requireTrue(typeof newId === "string", "New Session target missing");
  await evaluate(
    `window.__DSC_RC3__.uiWorkspace.openSession(${JSON.stringify(newId)})`,
  );
  await poll(() => selected(newId), "New Session target precondition missing");
  const newSessionDraft = await seedRich(newId, "legacy");
  await evaluate(`window.__DSC_RC3__.layout.selectPanel('plugins')`);
  await poll(
    () => selected(newId, "plugins"),
    "New Session precondition missing",
  );
  await evaluate(
    "window.__DSC_RC3__.uiWorkspace.startSession(window.__DSC_RC3_WORKSPACE__)",
  );
  await waitRich(
    newId,
    newSessionDraft,
    "legacy @notes.md",
    "New Session did not select its retained blank with its rich draft",
  );
  // Resolve the expected Create target independently BEFORE clicking any menu.
  const creator = await evaluate(
    `(async()=>{const c=window.__DSC_RC3__;const w=c.workspaces.list.getSnapshot().items.find(w=>w.sessionIds.includes('rc3-navigation-seeded'));if(!w)throw Error('Creator fixture workspace missing');return c.uiWorkspace.connectWorkspace(w.workspaceId,{agentPreset:'cordis'})})()`,
  );
  requireTrue(
    typeof creator === "string" && creator !== id && creator !== second,
    "Creator target isolation failed",
  );
  // An unmounted rich draft needs an explicit lifetime owner. This checks
  // append on a retained target, not restoration of disposed browser objects.
  try {
    await evaluate(
      `(async()=>{const c=window.__DSC_RC3__;window.__DSC_RC3_CREATOR_REFERENCE__=c.sessions.retain(${JSON.stringify(creator)},{source:'controllerOperation'});await window.__DSC_RC3_CREATOR_REFERENCE__.ready})()`,
    );
    const selectors = [
      'nav[aria-label="全局面板"] button[aria-label="更多"][aria-haspopup="menu"]',
      'button[aria-label^="更多会话视图"][aria-haspopup="menu"]',
      'button[aria-label="更多工具"][aria-haspopup="menu"]',
    ];
    const prompts = [
      "创建一个带左侧栏入口的 DSH 插件。",
      "创建一个 DSH 会话视图插件。",
      "创建一个带右侧栏入口的 DSH 插件。",
    ];
    const menus = [];
    const openMenu = async (i) => {
      await evaluate(
        `window.__DSC_RC3__.uiWorkspace.openSession("rc3-navigation-seeded")`,
      );
      await poll(
        () => selected("rc3-navigation-seeded"),
        "Creator source session missing",
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
    };
    for (let i = 0; i < selectors.length; i++) {
      await openMenu(i);
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
            `window.__DSC_RC3__.layout.panelInfo.getSnapshot().activePanelId==='plugins' && [...document.querySelectorAll('button[aria-label="查看 dsh-plugin-compat-check"]')].some(e=>e.getClientRects().length>0)`,
          ),
        "rc.3 Plugins main list missing",
      );
      requireTrue(
        await evaluate(`!document.querySelector('[role="dialog"]')`),
        "Browse opened an installation modal",
      );
      const text = "owned draft " + i;
      const before = await seedRich(creator, text);
      await openMenu(i);
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
      await waitRich(
        creator,
        before,
        text + " @notes.md\n" + prompts[i],
        "Creator did not select its unsent rich draft: " + i,
      );
      menus.push({
        region: ["sidebar", "conversation", "rightbar"][i],
        browseMainList: true,
        createAction: true,
        createDraftOnly: true,
        referencesPreserved: true,
        attachmentsPreserved: true,
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
    // Preserve the runner's Conversation handoff: a hidden plugin report must
    // not compete with the later Settings report's DOM controls.
    await evaluate("window.__DSC_RC3__.layout.selectPanel(null)");
    await poll(() => selected(creator), "Creator conversation handoff missing");
    return {
      menus,
      detailAndBadge: true,
      blankReuse: true,
      newSessionSelected: true,
      presetIsolation: true,
      defaultKeep: true,
      append: true,
      legacyReplace: true,
      explicitPolicyPrecedence: true,
      createDraftOnly: true,
      retainedCreatorTarget: true,
    };
  } finally {
    await evaluate(
      `window.__DSC_RC3_CREATOR_REFERENCE__?.release();delete window.__DSC_RC3_CREATOR_REFERENCE__`,
    );
  }
}
