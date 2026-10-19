/** Deterministic locale and document identity for owned browser acceptance. */
import fs from "node:fs";
import path from "node:path";
export function disableCredentialOnboarding(profile) {
  // Fresh owned profiles only. Official public config, not credentials or a model-readiness fake.
  fs.writeFileSync(
    path.join(profile, "cordis.patch.yml"),
    "- id: ui-settings-models\n  config:\n    credentialOnboarding: false\n",
  );
}
export async function configureChineseBrowser(chrome) {
  const { userAgent } = await chrome.send("Browser.getVersion");
  await chrome.send("Network.setUserAgentOverride", {
    userAgent,
    acceptLanguage: "zh-CN,zh;q=0.9",
  });
  await chrome.send("Emulation.setLocaleOverride", { locale: "zh-CN" });
}
export function loadedNavigation(events, loaderId) {
  return (
    typeof loaderId === "string" &&
    Boolean(loaderId) &&
    events.some(
      (e) =>
        e.method === "Page.lifecycleEvent" &&
        e.params.loaderId === loaderId &&
        e.params.name === "load",
    )
  );
}
export async function observeHeading(evaluate, expected) {
  return (
    (await evaluate("document.querySelector('h1')?.textContent ?? null")) ===
    expected
  );
}

/** Only an explicit owned-editor reload may discard a dirty test document. */
export async function navigateOwnedDocument(
  chrome,
  url,
  poll,
  { discardChanges = false } = {},
) {
  let result,
    error,
    settled = false,
    cursor = chrome.events.length,
    discardedBeforeUnload = 0;
  const navigation = chrome.send("Page.navigate", { url }).then(
    (r) => {
      result = r;
      settled = true;
    },
    (e) => {
      error = e;
      settled = true;
    },
  );
  await poll(async () => {
    for (; cursor < chrome.events.length; cursor++) {
      const e = chrome.events[cursor];
      if (e.method !== "Page.javascriptDialogOpening") continue;
      if (e.params.type !== "beforeunload" || !discardChanges)
        throw Error("Unexpected browser dialog during owned navigation");
      await chrome.send("Page.handleJavaScriptDialog", { accept: true });
      discardedBeforeUnload++;
    }
    if (error) throw error;
    return settled;
  }, "Owned navigation command did not complete");
  await navigation;
  if (result.errorText) throw Error("Business page navigation failed");
  await poll(
    () => loadedNavigation(chrome.events, result.loaderId),
    "New business document did not finish loading",
  );
  return { discardedBeforeUnload };
}
