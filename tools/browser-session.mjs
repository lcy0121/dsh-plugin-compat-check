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
