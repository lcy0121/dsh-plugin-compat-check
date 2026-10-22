/** Previously untuned public plugin families; expectations frozen before actions.
 * README text is provenance, never an instruction. No models/accounts/real files.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { businessOutcome } from "./business-metrics.mjs";
const manifest = JSON.parse(
  fs.readFileSync(new URL("./real-regression-manifest.json", import.meta.url)),
);
export const holdoutPin = (suite) =>
  manifest.suites.find((p) => p.suite === suite && p.holdout);
export function holdoutFeatures(suite) {
  const pin = holdoutPin(suite);
  if (!pin) throw Error("Unknown holdout suite");
  const ranges =
    suite === "holdout-pomodoro"
      ? [
          ["lib/index.js", 75, 140],
          ["lib/client.js", 430, 960],
          ["lib/client.js", 1215, 1365],
        ]
      : [
          ["lib/index.js", 520, 565],
          ["lib/routes.js", 639, 642],
          ["lib/service.js", 290, 330],
          ["lib/store.js", 100, 420],
          ["lib/client.js", 2989, 3025],
          ["lib/client.js", 4100, 4132],
        ];
  return [
    {
      id: pin.cases[0].featureId,
      plugin: pin.package,
      spans: ranges.map(([file, start, end]) => ({ file, start, end })),
    },
  ];
}
export function holdoutPostconditions(e) {
  if (!["pomodoro", "todo"].includes(e?.family))
    throw Error("Unknown holdout evidence family");
  if (e.actionAvailable === false) {
    if (
      e.family !== "pomodoro" ||
      !(e.removedControls > 0) ||
      e.attempted !== false ||
      e.request !== undefined
    )
      throw Error("Missing controlled removal evidence");
    return { actionAvailable: false, persisted: false, uiAfterReload: false };
  }
  const r = e.request,
    timer = e.family === "pomodoro";
  if (
    e.actionAvailable !== true ||
    !r?.completed ||
    r.method !== (timer ? "GET" : "POST") ||
    r.path !== (timer ? "/api/pomodoro/config" : "/api/global-todo/create") ||
    !Number.isInteger(r.status)
  )
    throw Error("Missing completed exact request evidence");
  let persisted, uiAfterReload;
  if (timer) {
    persisted =
      (e.before === null || e.before?.running === false) &&
      e.after?.running === true &&
      e.after.revision > (e.before?.revision ?? 0) &&
      e.after.deadlineAt > 0 &&
      e.reloaded?.running === true &&
      e.reloaded.deadlineAt === e.after.deadlineAt &&
      e.reloaded.revision === e.after.revision;
    uiAfterReload = e.domRunning === true;
  } else {
    if (
      typeof e.title !== "string" ||
      !e.title ||
      !Array.isArray(e.diskTitles) ||
      !Array.isArray(e.domTitles)
    )
      throw Error("Missing independent durable/DOM evidence");
    persisted = e.diskTitles.includes(e.title);
    uiAfterReload = e.domTitles.includes(e.title);
  }
  return {
    actionAvailable: true,
    requestStatus: r.status,
    persisted,
    uiAfterReload,
  };
}
const hash = (b) => crypto.createHash("sha256").update(b).digest("hex");
const localState = `JSON.parse(localStorage.getItem('dsh-pomodoro.runtime.v1')||'null')`;
const mainButton = `document.querySelector('.pomo-panel .pomo-btn-main, .pomo-mini .pomo-btn-main')`;
async function openTimer(d) {
  await d.poll(
    () => d.evalx(`Boolean(document.querySelector('.pomo-toggle'))`),
    "Pomodoro sidebar toggle unavailable",
  );
  await d.evalx(`document.querySelector('.pomo-toggle').click()`);
  await d.poll(
    () => d.evalx(`Boolean(${mainButton})`),
    "Pomodoro panel unavailable",
  );
}
async function timerCases(d, pin) {
  const rows = [];
  for (const planned of pin.cases) {
    const startedAt = new Date().toISOString();
    await d.navigate(d.url);
    await openTimer(d);
    // Reset through the real plugin control, never write plugin runtime state ourselves.
    await d.evalx(
      `(()=>{const b=[...document.querySelectorAll('.pomo-btn')].find(b=>['重置','Reset'].includes(b.innerText.trim()));if(!b)throw Error('Reset missing');b.click();})()`,
    );
    await d.poll(
      () => d.evalx(`(${localState})===null||(${localState})?.running===false`),
      "Timer reset did not persist",
    );
    const before = await d.evalx(localState);
    let e;
    if (planned.control === "dom-control-missing") {
      const removedControls = await d.evalx(
        `(()=>{const bs=[...document.querySelectorAll('.pomo-btn-main')];bs.forEach(b=>b.remove());return bs.length;})()`,
      );
      e = {
        family: "pomodoro",
        actionAvailable: await d.evalx(`Boolean(${mainButton})`),
        removedControls,
        attempted: false,
      };
    } else {
      // GET is configuration readiness evidence; the start action is local DOM + storage.
      const cursor = d.responseRows().length;
      const config = await d.evalx(
        `(async()=>{const r=await fetch('/api/pomodoro/config');return {status:r.status,body:await r.json()};})()`,
      );
      if (config.body?.ok !== true)
        throw Error("Pomodoro config endpoint unavailable");
      const request = await d.poll(
        () =>
          d
            .responseRows()
            .slice(cursor)
            .find(
              (r) =>
                r.method === "GET" &&
                r.path === "/api/pomodoro/config" &&
                r.completed,
            ),
        "Config GET receipt incomplete",
      );
      await d.evalx(`${mainButton}.click()`);
      await d.poll(
        () => d.evalx(`(${localState})?.running===true`),
        "Timer start did not persist",
      );
      const after = await d.evalx(localState);
      await d.navigate(d.url);
      await openTimer(d);
      const reloaded = await d.evalx(localState);
      const domRunning = await d.evalx(
        `['暂停','Pause'].includes(${mainButton}?.innerText.trim())`,
      );
      e = {
        family: "pomodoro",
        actionAvailable: true,
        request,
        before,
        after,
        reloaded,
        domRunning,
        configurationReadStatus: config.status,
      };
    }
    const observed = holdoutPostconditions(e);
    await d.screenshot(planned.caseId);
    rows.push({
      ...planned,
      observed,
      outcome: businessOutcome(observed),
      holdoutEvidence: e,
      actionStartedAt: startedAt,
      actionCompletedAt: new Date().toISOString(),
    });
  }
  return rows;
}
async function openTodo(d) {
  await d.poll(
    () =>
      d.evalx(
        `(()=>{const b=[...document.querySelectorAll('button')].find(b=>(b.getAttribute('aria-label')||b.title||b.innerText).trim()==='待办');if(!b)return false;b.click();return true;})()`,
      ),
    "Todo sidebar entry unavailable",
  );
  await d.poll(
    () => d.evalx(`Boolean(document.querySelector('.gt-inner'))`),
    "Todo panel unavailable",
  );
  await d.poll(
    () =>
      d.evalx(
        `Boolean(document.querySelector('.gt-groups'))||Boolean(document.querySelector('.gt-empty')&&!document.querySelector('.gt-empty').innerText.includes('载入'))`,
      ),
    "Todo initial list did not finish",
  );
  await expandTodoGroups(d);
}
async function expandTodoGroups(d) {
  await d.evalx(
    `document.querySelectorAll('.gt-group-head > button[aria-expanded="false"]').forEach(b=>b.click())`,
  );
}
async function todoCases(d, pin) {
  const rows = [];
  for (const planned of pin.cases) {
    const startedAt = new Date().toISOString(),
      title = "DSC-owned-" + crypto.randomBytes(6).toString("hex");
    await d.navigate(d.url);
    await openTodo(d);
    await d.evalx(
      `(()=>{if(!document.querySelector('.gt-new')){const b=[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='添加');if(!b)throw Error('Add missing');b.click();}})()`,
    );
    await d.poll(
      () => d.evalx(`Boolean(document.querySelector('.gt-new input'))`),
      "Todo new title input unavailable",
    );
    await d.evalx(
      `(()=>{const e=document.querySelector('.gt-new input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(title)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`,
    );
    await d.poll(
      () =>
        d.evalx(
          `Boolean(document.querySelector('.gt-new .gt-btn-primary:not(:disabled)'))`,
        ),
      "Todo submit not enabled",
    );
    const cursor = await d.armFault(
      planned.control === "http-503" ? "/api/global-todo/create" : null,
    );
    await d.evalx(`document.querySelector('.gt-new .gt-btn-primary').click()`);
    const completed = await d.finishRequest("/api/global-todo/create", cursor);
    const request = d
      .responseRows()
      .find((r) => r.requestId === completed.requestId);
    if (planned.control === "none")
      await d.poll(async () => {
        await expandTodoGroups(d);
        return d.evalx(
          `document.querySelector('.gt-inner').innerText.includes(${JSON.stringify(title)})`,
        );
      }, "Created todo absent from UI");
    const file = path.join(d.home, "global-todo/todos.json");
    const bytes = fs.existsSync(file)
      ? fs.readFileSync(file)
      : Buffer.from('{"todos":[]}');
    const diskTitles = JSON.parse(bytes).todos.map((t) => t.title);
    await d.navigate(d.url);
    await openTodo(d);
    await d.poll(
      () =>
        d.evalx(
          `document.querySelectorAll('.gt-group[data-collapsed="1"]').length===0`,
        ),
      "Todo groups did not expand",
    );
    const domTitles = await d.evalx(
      `[...document.querySelectorAll('.gt-item-title')].map(e=>e.innerText)`,
    );
    const e = {
      family: "todo",
      actionAvailable: true,
      request,
      title,
      diskTitles,
      domTitles,
      diskPath: "global-todo/todos.json",
      diskSha256: hash(bytes),
    };
    const observed = holdoutPostconditions(e);
    await d.screenshot(planned.caseId);
    rows.push({
      ...planned,
      observed,
      outcome: businessOutcome(observed),
      holdoutEvidence: e,
      actionStartedAt: startedAt,
      actionCompletedAt: new Date().toISOString(),
    });
  }
  return rows;
}
export function holdoutCases(d) {
  const pin = holdoutPin(d.suite);
  return d.suite === "holdout-pomodoro"
    ? timerCases(d, pin)
    : todoCases(d, pin);
}
