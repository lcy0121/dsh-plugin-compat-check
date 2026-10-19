/** Real CodeMirror input/save/reload on immutable published sidebar versions. */
import fs from "node:fs";
import path from "node:path";
import {
  sidebarPin,
  sidebarFeatures,
  savedDocumentBytes,
} from "./business-sidebar.mjs";
import { businessOutcome } from "./business-metrics.mjs";
export const previousSidebarPin = {
  package: "dsh-better-sidebar",
  version: "0.26.1",
  files: 460,
  digest: "a262b6ef39c7bed72e6ebb47ac2d1c0f0f82544eb36966bb69494f2d1f059562",
  publishedTarballSha256:
    "cd2d3d85d3d4a2d54c36b8bf86a24f2ec099f85a2936a72ef83edf7612c7402a",
  publishedIntegrity:
    "sha512-0/BXLEAqFJnd3SI/aryQVFHayrjE+RHcFgWIy57GrCYUeppEFTujfQOkO4U9V4QRd3qTVHFE7DZzNzUyU+kscw==",
  sourceHashes: {
    "package.json":
      "6fe80e07a120792ad7e93951bd527cb4aecce9c66a397f1d83afb0d42ad38328",
    "lib/index.js":
      "8e019c68308d6dcb8eb209d01ccdd03f9118114c3c375d5a8dfd0405031c504a",
    "lib/client.js":
      "2b817830a027dafd8ce35e8b98d5ee96e45e7860d69aafed538ac7c0ae6396bc",
    "lib/client-editor.js":
      "24b9e78d5c945413a74c9cbcb8dd58f308002533dd8a4ef913c833522e5666c6",
    "src/index.ts":
      "11ade7d11580827f951b7c1d5b870b58678f465dc8f6ed2c781d70be0021a6e5",
    "src/client/TextEditor.tsx":
      "772e726a3e4cd16b8412f7f3cea4737e9a069f7841a06ac9e33e202f91144703",
    "src/client/EditorHost.tsx":
      "c39692e5fd9558cd14cc00786da8c0891112f0c36942520e456c53e6caa1cc8a",
    "src/fs-operations.ts":
      "1a0d84d4872f0fa42170dc1797bb3bd4d3a66b2186c94847b6e4ce2608de5511",
  },
};
export const editorPin = {
  ...sidebarPin,
  sourceHashes: {
    ...sidebarPin.sourceHashes,
    "lib/client.js":
      "53b70b1b5317205247c074b8121e1ececec1df2dc3771b0641f0a66b8fd127e1",
    "lib/client-editor.js":
      "e899df938ceb8ea29ff2319e15a89e76155775ba07c8cf65a970a1c8596b69fd",
    "src/client/TextEditor.tsx":
      "772e726a3e4cd16b8412f7f3cea4737e9a069f7841a06ac9e33e202f91144703",
    "src/client/EditorHost.tsx":
      "c39692e5fd9558cd14cc00786da8c0891112f0c36942520e456c53e6caa1cc8a",
  },
};
export const editorFeatures = ["utf8-bom", "utf16le"].map((encoding) => ({
  id: "sidebar.editor." + encoding,
  plugin: "dsh-better-sidebar",
  encoding,
  spans: [
    ...sidebarFeatures[0].spans,
    { file: "lib/client.js", start: 9989, end: 10440 },
    { file: "lib/client-editor.js", start: 54137, end: 54620 },
    { file: "src/client/TextEditor.tsx", start: 240, end: 250 },
    { file: "src/client/TextEditor.tsx", start: 606, end: 665 },
    { file: "src/client/EditorHost.tsx", start: 232, end: 268 },
    { file: "src/client/EditorHost.tsx", start: 286, end: 485 },
    { file: "src/fs-operations.ts", start: 162, end: 205 },
  ],
}));
// The older binary has a different layout; never apply current binary ranges to it.
export const previousEditorFeatures = editorFeatures.map((f) => ({
  ...f,
  spans: [
    { file: "lib/index.js", start: 7167, end: 7172 },
    { file: "lib/index.js", start: 8010, end: 8014 },
    { file: "lib/index.js", start: 7545, end: 7565 },
    { file: "lib/index.js", start: 8081, end: 8122 },
    { file: "lib/index.js", start: 8166, end: 8214 },
    { file: "lib/client.js", start: 9944, end: 10395 },
    { file: "lib/client-editor.js", start: 54071, end: 54554 },
    ...f.spans.filter((s) => s.file.startsWith("src/")),
  ],
}));
export async function openOwnedSidebar(driver) {
  const { navigate, url, poll, evalx, workspace } = driver;
  await poll(() => {
    const marker = path.join(workspace, "fixture.json");
    if (!fs.existsSync(marker)) return false;
    const d = JSON.parse(fs.readFileSync(marker));
    if (d.stage === "error") throw Error("Owned session fixture: " + d.error);
    return d.stage === "ready";
  }, "Owned session fixture did not become ready");
  await navigate(url, { discardChanges: true });
  await poll(
    () =>
      evalx(`(()=>{
 const visible=e=>e&&e.isConnected&&e.getClientRects().length&&!e.closest('[inert]')&&!e.disabled;
 const cont=[...document.querySelectorAll('button')].find(b=>visible(b)&&b.innerText.trim()==='继续');if(cont){cont.click();return false;}
 const b=document.querySelector('[data-row-key="session:business-sidebar"]');if(visible(b)){b.click();return true;}return false;
 })()`),
    "Owned sidebar session not visible",
  );
  await poll(
    () =>
      evalx(
        `(()=>{const b=document.querySelector('button[data-dsh-bottom-toggle]');if(!b||!b.getClientRects().length)return Boolean(document.querySelector('[data-dsh-bottom-panel]'));if(b.getAttribute('aria-pressed')!=='true')b.click();return true;})()`,
      ),
    "Sidebar bottom workbench toggle missing",
  );
}
export function editorLoadFailure(uiErrors, responses) {
  const match = responses.find(
    (r) =>
      r.completed &&
      r.method === "POST" &&
      r.path.startsWith("/sidebar/api/fs.") &&
      r.status >= 400 &&
      uiErrors.includes("HTTP " + r.status),
  );
  return match
    ? { path: match.path, status: match.status, method: match.method }
    : null;
}
export async function openEditorFile(driver, file) {
  const { evalx, poll, chrome } = driver;
  const current = await evalx(
    `Boolean([...document.querySelectorAll('input[title]')].find(e=>e.title===${JSON.stringify(file)}&&e.getClientRects().length))`,
  );
  if (!current) {
    const input = await evalx(
      `Boolean([...document.querySelectorAll('input')].find(e=>e.placeholder.startsWith('输入文件路径')&&e.getClientRects().length))`,
    );
    if (input) {
      await evalx(
        `(()=>{const i=[...document.querySelectorAll('input')].find(e=>e.placeholder.startsWith('输入文件路径')&&e.getClientRects().length);i.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(file)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await chrome.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await chrome.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
    } else {
      // The plugin restores existing tabs as draggable divs, while a fresh
      // workbench offers a button. Reuse the visible owned tab after reload.
      await poll(
        () =>
          evalx(`(()=>{
 const visible=e=>e&&e.isConnected&&e.getClientRects().length&&!e.closest('[inert]')&&!e.disabled;
 const tab=[...document.querySelectorAll('[data-dsh-bottom-panel] div[draggable][title="文件"]')].find(visible);
 const entry=tab||[...document.querySelectorAll('button')].find(e=>visible(e)&&e.innerText.trim()==='文件');
 if(!entry)return false;entry.click();return true;
 })()`),
        "Missing business control: 文件",
      );
      const opened = await poll(async () => {
        const clicked = await evalx(
          `(()=>{const e=[...document.querySelectorAll('[title]')].find(e=>e.title===${JSON.stringify(file)}&&e.getClientRects().length);if(!e)return false;e.click();return true;})()`,
        );
        if (clicked) return { available: true };
        const errors = await evalx(
          `[...document.querySelectorAll('[class*="explorerError"]')].filter(e=>e.getClientRects().length).map(e=>e.innerText.trim())`,
        );
        const failure = editorLoadFailure(errors, driver.responseRows());
        return failure
          ? { available: false, preconditionEvidence: failure }
          : false;
      }, "Sidebar target file row missing");
      if (!opened.available) return opened;
    }
  }
  await poll(
    () =>
      evalx(
        `Boolean([...document.querySelectorAll('.cm-content[contenteditable="true"]')].find(e=>e.getClientRects().length))`,
      ),
    "Editable CodeMirror document missing",
  );
  return { available: true };
}
export async function editorCases(driver) {
  const {
    workspace,
    evalx,
    chrome,
    poll,
    armFault,
    finishRequest,
    screenshot,
  } = driver;
  fs.mkdirSync(workspace, { recursive: true });
  const rows = [];
  for (const feature of editorFeatures) {
    const file = path.join(workspace, feature.encoding + ".txt");
    fs.writeFileSync(
      file,
      savedDocumentBytes("initial 中文 🐟\nsecond line\n", feature.encoding),
    );
    for (const phase of driver.suite === "sidebar-ui-previous"
      ? ["healthy"]
      : ["healthy", "blocked", "recovered"]) {
      driver.resetResponseWindow();
      await openOwnedSidebar(driver);
      const opened = await openEditorFile(driver, file);
      const content = phase + " 中文 🐟\nsecond line\n";
      const before = fs.readFileSync(file);
      const control = phase === "blocked" ? "http-503" : "none";
      if (!opened.available) {
        const observed = {
          ...(control === "http-503"
            ? {
                harnessError:
                  "Save fault could not be established because the file-tree precondition failed",
              }
            : {}),
          actionAvailable: false,
          persisted: false,
          uiAfterReload: false,
        };
        const caseId = feature.id + "." + phase;
        rows.push({
          caseId,
          featureId: feature.id,
          control,
          action: "Attempt file-tree open before any editor save",
          expected:
            "A published editor must expose the file and usable edit/save surface",
          observed,
          outcome: businessOutcome(observed),
          preconditionEvidence: opened.preconditionEvidence,
          byteEvidence: {
            encoding: feature.encoding,
            exactRequestedBytes: false,
            previousBytesPreserved: fs.readFileSync(file).equals(before),
          },
        });
        await screenshot(caseId);
        continue;
      }
      await evalx(
        `(()=>{const e=[...document.querySelectorAll('.cm-content[contenteditable="true"]')].find(e=>e.getClientRects().length);e.focus();})()`,
      );
      const modifiers = process.platform === "darwin" ? 4 : 2;
      await chrome.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers,
      });
      await chrome.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        windowsVirtualKeyCode: 65,
        modifiers,
      });
      await chrome.send("Input.insertText", { text: content });
      await poll(
        () =>
          evalx(
            `([...document.querySelectorAll('.cm-content')].find(e=>e.getClientRects().length)?.innerText ?? '').includes(${JSON.stringify(phase + " 中文 🐟")})`,
          ),
        "Native editor input was not reflected",
      );
      const start = await armFault(
        control === "http-503" ? "/sidebar/write" : null,
      );
      const actionAvailable = await evalx(
        `(()=>{const b=[...document.querySelectorAll('button[aria-label="保存"]')].find(e=>e.getClientRects().length&&!e.disabled);if(!b)return false;b.click();return true;})()`,
      );
      const response = actionAvailable
        ? await finishRequest("/sidebar/write", start)
        : null;
      const actual = fs.readFileSync(file),
        persisted = actual.equals(
          savedDocumentBytes(content, feature.encoding),
        );
      await openOwnedSidebar(driver);
      await openEditorFile(driver, file);
      const uiAfterReload = await evalx(
        `([...document.querySelectorAll('.cm-content')].find(e=>e.getClientRects().length)?.innerText ?? '').includes(${JSON.stringify(phase + " 中文 🐟")})`,
      );
      const observed = {
        actionAvailable,
        ...(response ? { requestStatus: response.status } : {}),
        persisted,
        uiAfterReload,
      };
      const caseId = feature.id + "." + phase;
      rows.push({
        caseId,
        featureId: feature.id,
        control,
        action:
          "Native CodeMirror select-all and insertText, visible Save button, fresh session/file reload",
        expected:
          "Requested text and original BOM/encoding/CRLF must persist and reappear in the editor",
        observed,
        outcome: businessOutcome(observed),
        byteEvidence: {
          encoding: feature.encoding,
          exactRequestedBytes: persisted,
          previousBytesPreserved: actual.equals(before),
        },
      });
      await screenshot(caseId);
    }
  }
  return rows;
}
