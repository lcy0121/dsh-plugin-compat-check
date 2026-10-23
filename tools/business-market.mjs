/** Browser-only market controls. Navigation readiness never requires a business action. */
import { businessOutcome } from "./business-metrics.mjs";
// Serialized into the owned browser; do not capture Node state here.
export function marketNavigationStep(tab) {
  const visible = (e) =>
    e &&
    e.isConnected &&
    e.getClientRects().length &&
    !e.closest("[inert]") &&
    !e.disabled;
  const button = (t) =>
    [...document.querySelectorAll("button")].find(
      (b) => visible(b) && b.innerText.trim() === t,
    );
  const cont = button("继续");
  if (cont) {
    cont.click();
    return false;
  }
  const root = document.querySelector("[data-dsh-market-root]");
  if (visible(root)) {
    if (root.dataset.dshMarketTab === tab) {
      // The independently identified card is ready even if its business controls are absent.
      return [...root.querySelectorAll("a[title]")].some(
        (a) =>
          visible(a) &&
          [
            "dsh-plugin-compat-check",
            "dsh-plugin-compat-check#plugin",
          ].includes(a.title),
      );
    }
    const target = [...root.querySelectorAll("button")].find(
      (b) =>
        visible(b) &&
        (tab === "installed"
          ? b.innerText.startsWith("已安装")
          : b.innerText.trim() === "发现"),
    );
    if (target) target.click();
    return false;
  }
  const market = button("插件市场");
  if (market) {
    market.click();
    return false;
  }
  const settings = [...document.querySelectorAll('[role="menuitem"]')].find(
    (b) => visible(b) && b.innerText.startsWith("设置"),
  );
  if (settings) {
    settings.click();
    return false;
  }
  const account = document.querySelector('button[aria-label="账号菜单"]');
  if (visible(account) && account.getAttribute("aria-expanded") !== "true")
    account.click();
  return false;
}
/** A card can mount before the independent notes/favorites read and React commit. */
export async function openMarketDocument(driver, url, tab) {
  const { chrome, navigate, evalx, poll } = driver;
  let cursor = chrome.events.length;
  const reads = new Map();
  await navigate(url);
  await poll(
    () => evalx(`(${marketNavigationStep})(${JSON.stringify(tab)})`),
    "Market target card did not become ready",
  );
  await poll(() => {
    for (; cursor < chrome.events.length; cursor++) {
      const event = chrome.events[cursor],
        p = event.params;
      if (event.method === "Network.requestWillBeSent") {
        if (
          p.request.method === "GET" &&
          new URL(p.request.url).pathname === "/dsh-market/installed"
        )
          reads.set(p.requestId, {});
      }
      const read = reads.get(p.requestId);
      if (!read) continue;
      if (event.method === "Network.responseReceived")
        read.status = p.response.status;
      if (event.method === "Network.loadingFinished") read.finished = true;
      if (event.method === "Network.loadingFailed") read.failed = true;
    }
    for (const read of reads.values()) {
      if (read.failed || (read.status !== undefined && read.status !== 200))
        throw Error(
          `Market installed-state read failed: ${read.status ?? "transport"}`,
        );
    }
    return [...reads.values()].some(
      (read) => read.status === 200 && read.finished,
    );
  }, "Market installed-state request did not complete");
  // Yield through rendering without waiting for a desired value or inventing controls.
  await evalx(
    "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
}
export function marketControl(feature, action = "observe", desired) {
  const visible = (e) =>
    e &&
    e.isConnected &&
    e.getClientRects().length &&
    !e.closest("[inert]") &&
    !e.disabled;
  const root = document.querySelector("[data-dsh-market-root]");
  let card =
    root &&
    [...root.querySelectorAll("a[title]")].find(
      (a) =>
        visible(a) &&
        ["dsh-plugin-compat-check", "dsh-plugin-compat-check#plugin"].includes(
          a.title,
        ),
    );
  while (card && ![...card.classList].some((c) => /_(irow|card)$/.test(c)))
    card = card.parentElement;
  if (!card || !root.contains(card)) return false;
  const controls = [...card.querySelectorAll("button")].filter(
    (b) =>
      visible(b) &&
      (feature === "market.note"
        ? ["添加备注", "编辑备注"].includes(b.innerText.trim())
        : ["加入收藏", "取消收藏"].includes(b.getAttribute("aria-label"))),
  );
  if (action === "value")
    return (
      controls.length === 1 &&
      (feature === "market.note"
        ? card.innerText.includes(desired)
        : controls[0].getAttribute("aria-label") ===
          (desired ? "取消收藏" : "加入收藏"))
    );
  if (action === "remove") {
    controls.forEach((b) => b.remove());
    return controls.length > 0;
  }
  if (action === "click" && controls.length === 1) controls[0].click();
  return controls.length === 1;
}
export const marketPhases = [
  { id: "healthy", control: "none", favorite: true },
  { id: "blocked", control: "http-503", favorite: false },
  { id: "missing-after", control: "dom-control-missing", favorite: false },
  { id: "missing-before", control: "dom-control-missing", favorite: true },
  { id: "recovered", control: "none", favorite: true },
];
export async function marketCases(driver, features) {
  const {
    evalx,
    openMarket,
    disk,
    entry,
    armFault,
    finishRequest,
    click,
    poll,
    screenshot,
  } = driver;
  const rows = [];
  for (const feature of features)
    for (const phase of marketPhases) {
      const note = feature.id === "market.note",
        caseId = feature.id + "." + phase.id;
      const tab = note ? "installed" : "discover";
      const desired = note ? "business-note-" + phase.id : phase.favorite;
      const route = note ? "/dsh-market/note" : "/dsh-market/favorite";
      await openMarket(tab);
      const initiallyAvailable = await evalx(
        `(${marketControl})(${JSON.stringify(feature.id)},'observe')`,
      );
      let injectionEstablished = phase.control === "none" || initiallyAvailable;
      if (phase.id === "missing-before" && initiallyAvailable) {
        injectionEstablished = await evalx(
          `(${marketControl})(${JSON.stringify(feature.id)},'remove')`,
        );
      }
      const actionAvailable = await evalx(
        `(${marketControl})(${JSON.stringify(feature.id)},'observe')`,
      );
      if (phase.id === "missing-before" && actionAvailable)
        injectionEstablished = false;
      let response;
      if (actionAvailable) {
        const start = await armFault(
          phase.control === "http-503" ? route : null,
        );
        if (
          !(await evalx(
            `(${marketControl})(${JSON.stringify(feature.id)},'click')`,
          ))
        )
          throw Error("Market action changed during click");
        if (note) {
          await poll(
            () =>
              evalx(
                "Boolean(document.querySelector('input[placeholder=\"用你自己的话描述这个插件，将代替作者简介显示\"]'))",
              ),
            "Note editor missing",
          );
          await evalx(
            `(()=>{const i=document.querySelector('input[placeholder="用你自己的话描述这个插件，将代替作者简介显示"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,${JSON.stringify(desired)});i.dispatchEvent(new Event('input',{bubbles:true}));})()`,
          );
          await click("保存");
        }
        response = await finishRequest(route, start);
        await openMarket(tab);
        if (phase.id === "missing-after") {
          injectionEstablished = await evalx(
            `(${marketControl})(${JSON.stringify(feature.id)},'remove')`,
          );
        }
      }
      const state = disk();
      const persisted = note
        ? state.notes?.["dsh-plugin-compat-check"] === desired
        : (state.favorites || []).includes(entry.url) === desired;
      const controlAfterReload = await evalx(
        `(${marketControl})(${JSON.stringify(feature.id)},'observe')`,
      );
      if (phase.id === "missing-after" && controlAfterReload)
        injectionEstablished = false;
      const valueVisible = await evalx(
        `(${marketControl})(${JSON.stringify(feature.id)},'value',${JSON.stringify(desired)})`,
      );
      const observed = {
        ...(!injectionEstablished
          ? {
              harnessError:
                "Requested control could not be established on the target action",
            }
          : {}),
        actionAvailable,
        ...(response ? { requestStatus: response.status } : {}),
        persisted,
        uiAfterReload: Boolean(controlAfterReload && valueVisible),
      };
      rows.push({
        caseId,
        featureId: feature.id,
        control: phase.control,
        action:
          "Target-card action and fresh reload, with independent durable-state observation",
        expected:
          "Target action must be available, requested value must persist and remain usable after reload",
        observed,
        outcome: businessOutcome(observed),
      });
      await screenshot(caseId);
    }
  return rows;
}
