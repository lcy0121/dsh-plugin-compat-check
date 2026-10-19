/** Explicit, opt-in real-provider acceptance. Credential values never enter artifacts. */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { zstdDecompressSync } from "node:zlib";
import crypto from "node:crypto";
import { editorPin, openOwnedSidebar } from "./business-sidebar-ui.mjs";
import { businessOutcome } from "./business-metrics.mjs";
export function prepareModelProfile(sourceProfile, home, profile) {
  const sourceHome = path.resolve(sourceProfile, "../..");
  if (path.resolve(home) === sourceHome)
    throw Error("Model acceptance requires an owned private home");
  let source, credentials;
  try {
    source = YAML.parse(
      fs.readFileSync(path.join(sourceProfile, "cordis.patch.yml"), "utf8"),
    );
  } catch {
    throw Error("Model source profile configuration is unavailable or invalid");
  }
  const selections = [];
  const walk = (v) => {
    if (!v || typeof v !== "object") return;
    if (v.id === "agent-default-model" && v.config) selections.push(v.config);
    for (const x of Object.values(v)) walk(x);
  };
  walk(source);
  const selection = selections.at(-1);
  if (
    !selection ||
    selection.provider !== "deepseek-official" ||
    typeof selection.model !== "string" ||
    !selection.model ||
    !/^[-\w.]+$/.test(selection.model)
  )
    throw Error(
      "This bounded model acceptance requires a configured deepseek-official model",
    );
  const credentialFile = path.join(sourceHome, ".credentials.yaml");
  if (process.platform !== "win32" && fs.statSync(credentialFile).mode & 0o077)
    throw Error("Source credentials must be owner-only");
  try {
    credentials = YAML.parse(fs.readFileSync(credentialFile, "utf8"));
  } catch {
    throw Error("Stored credentials document is unavailable or invalid");
  }
  const key =
    credentials?.version === 1 ? credentials.refs?.DEEPSEEK_API_KEY : undefined;
  if (typeof key !== "string" || !key.trim())
    throw Error("Selected model stored credential is unavailable");
  fs.chmodSync(home, 0o700);
  fs.writeFileSync(
    path.join(home, ".credentials.yaml"),
    YAML.stringify({ version: 1, refs: { DEEPSEEK_API_KEY: key } }),
    { mode: 0o600, flag: "wx" },
  );
  const file = path.join(profile, "cordis.patch.yml");
  const patches = fs.existsSync(file)
    ? YAML.parse(fs.readFileSync(file, "utf8"))
    : [];
  const chosen = {
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: "off",
  };
  fs.writeFileSync(
    file,
    YAML.stringify([
      ...patches,
      { id: "agent-default-model", config: chosen },
      { id: "session-title-llm", disabled: true },
      {
        id: "llm-deepseek",
        config: {
          thinking: "disabled",
          reasoningEffort: "off",
          maxTokens: 256,
          retryPolicy: { mode: "normal", maxRetries: 0 },
        },
      },
    ]),
  );
  return {
    ...chosen,
    credentialSource: "Selected managed credential reference only",
    automaticTitles: false,
    promptLimit: 2,
    providerStepLimit: 2,
    toolsAllowed: false,
    maxOutputTokens: 256,
    maxRetries: 0,
  };
}

export function requireModelSelection(info, selected) {
  if (
    !info ||
    ["provider", "model", "reasoningEffort"].some(
      (k) => info[k] !== selected[k],
    )
  )
    throw Error("Owned model selection does not match configured route");
}
export function assistantReceipt(events, expected) {
  const messages = events.filter((e) => e.type === "assistant/message");
  const last = messages.at(-1);
  const turnStart = events.findLastIndex((e) => e.type === "turn/start");
  const lastIndex = events.lastIndexOf(last);
  const end = events.at(-1);
  const completed =
    end?.type === "turn/end" &&
    end.data?.reason?.kind === "completed" &&
    turnStart >= 0 &&
    lastIndex > turnStart &&
    !last?.data?.interrupted;

  const text = (last?.data?.message?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  const usage =
    messages.length &&
    messages.every(
      (e) =>
        Number.isFinite(e.data?.usage?.inputTokens) &&
        Number.isFinite(e.data?.usage?.outputTokens),
    )
      ? messages.reduce(
          (out, e) => ({
            inputTokens: out.inputTokens + e.data.usage.inputTokens,
            outputTokens: out.outputTokens + e.data.usage.outputTokens,
          }),
          { inputTokens: 0, outputTokens: 0 },
        )
      : null;
  return {
    matches: Boolean(last) && completed && text.trim() === expected,
    requestHeaders: events.filter((e) => e.type === "request/header").length,
    interruptedAttempts: events.filter((e) => e.type === "assistant/attempt")
      .length,
    usage,
    assistantMessages: messages.length,
  };
}

export const modelPin = {
  ...editorPin,
  sourceHashes: {
    ...editorPin.sourceHashes,
    "src/sidechat-routes.ts":
      "7409cde6fd2c3c6138bfbc973f986dacff11e59618566a7b2482a0efd7426e68",
    "src/sidechat-core.ts":
      "3256181ab3769e453161b3e4ab5bdd6bff07ff2dae974e54191b4eaa73eee1bf",
    "src/client/SideChatView.tsx":
      "6a24281082f20fee045728deaa6a58b60db85b51670d19b07bc050a174b08b1a",
  },
};
export const modelFeatures = [
  {
    id: "sidebar.sidechat.reply",
    plugin: "dsh-better-sidebar",
    spans: [
      { file: "lib/index.js", start: 8071, end: 8076 },
      { file: "lib/index.js", start: 6723, end: 6760 },
      { file: "lib/index.js", start: 7018, end: 7140 },
      { file: "src/sidechat-routes.ts", start: 237, end: 262 },
      { file: "src/sidechat-routes.ts", start: 610, end: 798 },
      { file: "src/client/SideChatView.tsx", start: 660, end: 800 },
      { file: "src/client/SideChatView.tsx", start: 1080, end: 1130 },
    ],
  },
];
export function readModelSession(sessionsRoot, childId) {
  if (!/^[\w-]+$/.test(childId))
    throw Error("Invalid owned model session identity");
  let visited = 0,
    found = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++visited > 1000)
        throw Error("Owned model session scan exceeded budget");
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (
        e.isFile() &&
        path.basename(dir) === encodeURIComponent(childId) &&
        /\.jsonl(?:\.zstd)?$/.test(e.name)
      )
        found.push(p);
    }
  };
  walk(sessionsRoot);
  if (!found.length) return [];
  if (found.length !== 1) throw Error("Ambiguous owned session generation");
  const p = found[0];
  if (fs.statSync(p).size > 4 * 1024 * 1024)
    throw Error("Model log exceeds evidence budget");
  const bytes = fs.readFileSync(p);
  const text = (
    p.endsWith(".zstd")
      ? zstdDecompressSync(bytes, { maxOutputLength: 4 * 1024 * 1024 })
      : bytes
  ).toString("utf8");
  const rows = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const header = rows.shift();
  if (
    header.type !== "session" ||
    header.version !== 4 ||
    header.id !== childId
  )
    throw Error("Owned model session header mismatch");
  const cut = rows.findLastIndex((e) => e.type === "session/end-seed");
  if (header.isSeeded && cut < 0)
    throw Error("Model child log has no inherited-history boundary");
  return rows.slice(cut + 1);
}
export async function modelCases(driver) {
  const {
    evalx,
    poll,
    chrome,
    click,
    finishRequest,
    home,
    screenshot,
    modelContext,
    workspace,
  } = driver;
  await openOwnedSidebar(driver);
  await click("侧边对话(beta)");
  await poll(
    () =>
      evalx(
        `Boolean([...document.querySelectorAll('textarea')].find(e=>e.placeholder.includes('第一个问题')&&e.getClientRects().length))`,
      ),
    "Side chat composer missing",
  );
  const created = await finishRequest("/sidebar/api/sidechat.start", 0);
  const body = await chrome.send("Network.getResponseBody", {
    requestId: created.requestId,
  });
  const payload = JSON.parse(
    body.base64Encoded
      ? Buffer.from(body.body, "base64").toString("utf8")
      : body.body,
  );
  const childId = payload.value?.childId;
  if (!payload.ok || typeof childId !== "string")
    throw Error("Side chat creation was not accepted");
  const rpc = async (method) =>
    evalx(
      `(async()=>{const r=await fetch('/sidebar/api/'+${JSON.stringify(method)},{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({childId:${JSON.stringify(childId)}})});const b=await r.json();return {status:r.status,ok:b.ok,value:b.value};})()`,
    );
  const selected = await rpc("sidechat.info");
  if (!selected.ok) throw Error("Owned model selection info unavailable");
  requireModelSelection(selected.value, modelContext);
  const rows = [];
  let firstNonce;
  try {
    for (const phase of ["reply", "followup"]) {
      const expected =
        "DSC-" + crypto.randomBytes(6).toString("hex") + "-" + phase;
      if (!firstNonce) firstNonce = expected;
      const prompt =
        expected +
        "\nAcceptance test: do not call tools, access files, or browse. Reply with exactly the token on the first line, no other text.";
      const before = readModelSession(path.join(home, "sessions"), childId);
      if (
        before.filter((e) =>
          ["assistant/message", "assistant/attempt"].includes(e.type),
        ).length >= modelContext.promptLimit
      )
        throw Error("Model request budget exhausted before next prompt");
      await evalx(
        `(()=>{const i=[...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length&&(e.placeholder.includes('第一个问题')||e.placeholder==='追问…'));if(!i)throw Error('Composer unavailable');i.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(i,${JSON.stringify(prompt)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      const start = await driver.armFault(null);
      const actionAvailable = await evalx(
        `(()=>{const b=[...document.querySelectorAll('button[aria-label="发送"]')].find(e=>e.getClientRects().length&&!e.disabled);if(!b)return false;b.click();return true;})()`,
      );
      if (!actionAvailable) throw Error("Side chat Send action unavailable");
      const response = await finishRequest(
        "/sidebar/api/sidechat.prompt",
        start,
      );
      await poll(
        async () => {
          const info = await rpc("sidechat.info");
          if (!info.ok) throw Error("Side chat runtime info unavailable");
          const events = readModelSession(path.join(home, "sessions"), childId);
          return (
            events.length > before.length &&
            events.at(-1)?.type === "turn/end" &&
            info.value?.status !== "running"
          );
        },
        "Real model turn did not settle within acceptance budget",
        120000,
      );
      const events = readModelSession(path.join(home, "sessions"), childId),
        receipt = assistantReceipt(events, expected);
      // Reload the actual plugin transcript; user bubbles / pending echoes cannot satisfy this selector.
      if (driver.outDir)
        fs.writeFileSync(
          path.join(driver.outDir, "model-receipts.json"),
          JSON.stringify(
            {
              phase,
              receipt,
              model: modelContext,
              turnEnd: events.filter((e) => e.type === "turn/end").at(-1)?.data
                ?.reason?.kind,
              requestErrors: events
                .filter(
                  (e) =>
                    e.type === "turn/end" && e.data?.reason?.kind === "error",
                )
                .map((e) => ({
                  kind: e.data.reason.kind,
                  code: e.data.reason.error?.code,
                  type: e.data.reason.error?.type,
                })),
            },
            null,
            2,
          ),
        );
      await openOwnedSidebar(driver);
      if (
        !(await evalx(
          `Boolean(document.querySelector('[class*="sidechatScroll"]'))`,
        ))
      ) {
        await click("侧边对话(beta)");
        await poll(
          () =>
            evalx(
              `(()=>{const b=[...document.querySelectorAll('button[aria-label="切换线程 / 新建"]')].find(e=>e.getClientRects().length);if(!b)return false;b.click();return true;})()`,
            ),
          "Side chat history menu missing",
        );
        await poll(
          () =>
            evalx(
              `(()=>{const b=[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.getClientRects().length&&e.innerText.includes(${JSON.stringify(firstNonce)}));if(!b)return false;b.click();return true;})()`,
            ),
          "Owned side chat history entry missing",
        );
      }
      await poll(
        () =>
          evalx(
            `Boolean([...document.querySelectorAll('textarea')].find(e=>e.getClientRects().length&&e.placeholder==='追问…'))`,
          ),
        "Reloaded side chat history has not loaded",
      );
      await evalx(
        "new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))",
      );
      const uiAfterReload = await evalx(
        `[...document.querySelectorAll('[class*="sidechatAssistant"]')].filter(e=>e.getClientRects().length).some(e=>e.innerText.trim()===${JSON.stringify(expected)})`,
      );
      const observed = {
        requestStatus: response.status,
        persisted: receipt.matches,
        uiAfterReload,
      };
      const budget = JSON.parse(
        fs.readFileSync(path.join(workspace, "model-budget.json"), "utf8"),
      );
      if (
        budget.limit !== 2 ||
        budget.admitted > 2 ||
        budget.toolsAllowed !== false
      )
        throw Error("Owned model admission evidence violates budget");
      const caseId = "sidebar.sidechat." + phase;
      rows.push({
        caseId,
        featureId: "sidebar.sidechat.reply",
        control: "none",
        action:
          "Real side-chat composer Send, actual configured model, durable assistant event and fresh transcript reload",
        expected:
          "Assistant text must exactly match the nonce; a prompt echo is insufficient",
        observed,
        outcome: businessOutcome(observed),
        modelEvidence: {
          ...receipt,
          budget,
          provider: modelContext.provider,
          model: modelContext.model,
          reasoningEffort: modelContext.reasoningEffort,
        },
      });
      await screenshot(caseId);
    }
  } finally {
    await rpc("sidechat.cancel").catch(() => {});
    await rpc("sidechat.dispose").catch(() => {});
  }
  return rows;
}
