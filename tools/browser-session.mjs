/** Deterministic locale and document identity for owned browser acceptance. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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

/** Request receipts deliberately omit URLs, headers and bodies (including host tokens). */
export function upgradeRequestReceipts(events, cursor = 0) {
  const requests = new Map();
  const version = (value) =>
    /^[0-9A-Za-z.+-]{1,80}$/.test(value || "") ? value : null;
  for (const event of events.slice(cursor)) {
    const p = event.params || {};
    if (event.method === "Network.requestWillBeSent") {
      let url;
      try {
        url = new URL(p.request.url);
      } catch {
        continue;
      }
      if (url.pathname !== "/plugin-compat-check/upgrade-preview") continue;
      requests.set(p.requestId, {
        targetVersion: version(url.searchParams.get("targetVersion")),
        currentVersion: version(url.searchParams.get("currentVersion")),
        status: null,
        finished: false,
        failed: false,
      });
    }
    const request = requests.get(p.requestId);
    if (!request) continue;
    if (event.method === "Network.responseReceived")
      request.status = p.response.status;
    if (event.method === "Network.loadingFinished") request.finished = true;
    if (event.method === "Network.loadingFailed") request.failed = true;
  }
  return [...requests.values()].slice(-8);
}

/** Bounded report identities distinguish a real recomputation from sidecar/full-read churn. */
export async function reportResponseReceipts(chrome) {
  const requests = new Map();
  for (const event of chrome.events) {
    const p = event.params || {};
    if (event.method === "Network.requestWillBeSent") {
      try {
        const url = new URL(p.request.url);
        if (url.pathname === "/plugin-compat-check/report")
          requests.set(p.requestId, {
            metadata: url.searchParams.get("metadata") === "1",
            finished: false,
          });
      } catch {
        /* Ignore unrelated/malformed requests. */
      }
    }
    if (event.method === "Network.loadingFinished" && requests.has(p.requestId))
      requests.get(p.requestId).finished = true;
  }
  const digest = (value) =>
    createHash("sha256")
      .update(JSON.stringify(value ?? null))
      .digest("hex");
  return await Promise.all(
    [...requests]
      .filter(([, r]) => r.finished)
      .slice(-24)
      .map(async ([requestId, receipt]) => {
        try {
          const body = await chrome.send("Network.getResponseBody", {
            requestId,
          });
          const data = JSON.parse(
            body.base64Encoded
              ? Buffer.from(body.body, "base64").toString()
              : body.body,
          );
          return {
            ...receipt,
            computedAt: /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(data.computedAt || "")
              ? data.computedAt
              : null,
            targetSha256: digest(data.nodeModules),
            reportSha256: data.report ? digest(data.report) : null,
            reviewsSha256: digest(
              data.reviews || [
                data.reviewsRevision,
                data.reviewsError,
                data.reviewsContextToken,
              ],
            ),
          };
        } catch {
          return { ...receipt, unavailable: true };
        }
      }),
  );
}

/** Refresh through the actual UI after first-client lazy services have initialized. */
export async function refreshVisibleReport(chrome, evaluate, poll) {
  const cursor = chrome.events.length;
  await evaluate(
    `Array.from(document.querySelectorAll('button')).find(e => e.innerText === '重新检查').click()`,
  );
  let requestId;
  await poll(() => {
    for (const event of chrome.events.slice(cursor)) {
      const p = event.params || {};
      if (event.method === "Network.requestWillBeSent") {
        const url = new URL(p.request.url);
        if (
          url.pathname === "/plugin-compat-check/report" &&
          url.searchParams.get("refresh") === "1"
        )
          requestId = p.requestId;
      }
      if (
        requestId &&
        p.requestId === requestId &&
        event.method === "Network.loadingFinished"
      )
        return true;
      if (
        requestId &&
        p.requestId === requestId &&
        event.method === "Network.loadingFailed"
      )
        throw Error("Visible report refresh transport failed");
    }
    return false;
  }, "Visible report refresh did not complete");
  const response = await chrome.send("Network.getResponseBody", { requestId });
  const data = JSON.parse(
    response.base64Encoded
      ? Buffer.from(response.body, "base64").toString()
      : response.body,
  );
  if (
    !data.ok ||
    !data.computedAt ||
    data.cache?.stale ||
    data.cache?.refreshing
  )
    throw Error(
      "Visible report refresh did not return current successful evidence",
    );
  await poll(
    () =>
      evaluate(
        `document.body.innerText.includes(${JSON.stringify("报告时间：" + data.computedAt)})`,
      ),
    "Refreshed report did not render",
  );
  return data;
}

export const upgradeFormSnapshot = `(() => {
  const form = document.querySelector('[data-upgrade-preview]');
  const input = form?.querySelector('input[aria-label="目标 DSH 版本"]');
  const button = [...(form?.querySelectorAll('button') || [])].find(e => e.innerText === '运行升级预检');
  const status = form?.querySelector('[role="status"]')?.innerText || '';
  return {
    present: Boolean(form), target: /^[0-9A-Za-z.+-]{0,80}$/.test(input?.value || '') ? input?.value || '' : '[invalid]',
    buttonPresent: Boolean(button), buttonDisabled: button?.disabled ?? null,
    result: form?.querySelector('[data-upgrade-result]')?.getAttribute('data-upgrade-result') || null,
    status: status.replace(/([?&]token=)[^\\s&]+/gi, '$1[redacted]').slice(0, 240)
  };
})()`;

/** Wait for the controlled form to commit, then prove this single click started its request. */
export async function submitUpgradeTarget(chrome, evaluate, poll, target) {
  const input = `document.querySelector('[data-upgrade-preview] input[aria-label="目标 DSH 版本"]')`;
  await evaluate(`${input}.focus();${input}.select()`);
  await chrome.send("Input.insertText", { text: target });
  await poll(
    async () => {
      const state = await evaluate(upgradeFormSnapshot);
      return (
        state.target === target &&
        state.buttonPresent &&
        state.buttonDisabled === false
      );
    },
    "Upgrade target form did not commit an enabled submit button",
    5000,
  );
  const cursor = chrome.events.length;
  await evaluate(
    `Array.from(document.querySelector('[data-upgrade-preview]').querySelectorAll('button')).find(e=>e.innerText==='运行升级预检').click()`,
  );
  await poll(
    () =>
      upgradeRequestReceipts(chrome.events, cursor).some(
        (r) => r.targetVersion === target,
      ),
    "Upgrade UI click did not start the requested preview",
    5000,
  );
  return cursor;
}
