import { test } from "node:test";
import assert from "node:assert/strict";
const api = await import("../tools/business-holdout.mjs").catch(() => ({}));
// Break caught: counting a received response as completed, or a different todo as persisted.
test("todo business truth requires completed exact request and exact durable title", () => {
  assert.equal(typeof api.holdoutPostconditions, "function");
  const receipt = {
    family: "todo",
    actionAvailable: true,
    request: {
      method: "POST",
      path: "/api/global-todo/create",
      status: 200,
      completed: true,
    },
    title: "owned-A",
    diskTitles: ["owned-A"],
    domTitles: ["owned-A"],
  };
  assert.deepEqual(api.holdoutPostconditions(receipt), {
    actionAvailable: true,
    requestStatus: 200,
    persisted: true,
    uiAfterReload: true,
  });
  assert.deepEqual(
    api.holdoutPostconditions({ ...receipt, diskTitles: ["other"] }),
    {
      actionAvailable: true,
      requestStatus: 200,
      persisted: false,
      uiAfterReload: true,
    },
  );
  assert.throws(
    () =>
      api.holdoutPostconditions({
        ...receipt,
        request: { ...receipt.request, completed: false },
      }),
    /complete|request/i,
  );
  assert.throws(
    () =>
      api.holdoutPostconditions({
        ...receipt,
        request: { ...receipt.request, path: "/unrelated" },
      }),
    /request/i,
  );
});
// Break caught: accepting merely running state without the same restored deadline/revision.
test("timer truth requires a new running transition restored after document reload", () => {
  assert.equal(typeof api.holdoutPostconditions, "function");
  const receipt = {
    family: "pomodoro",
    actionAvailable: true,
    request: {
      method: "GET",
      path: "/api/pomodoro/config",
      status: 200,
      completed: true,
    },
    before: { running: false, revision: 1 },
    after: { running: true, revision: 2, deadlineAt: 2000 },
    reloaded: { running: true, revision: 2, deadlineAt: 2000 },
    domRunning: true,
  };
  assert.deepEqual(api.holdoutPostconditions(receipt), {
    actionAvailable: true,
    requestStatus: 200,
    persisted: true,
    uiAfterReload: true,
  });
  assert.equal(
    api.holdoutPostconditions({
      ...receipt,
      reloaded: { ...receipt.reloaded, deadlineAt: 2100 },
    }).persisted,
    false,
  );
  assert.equal(
    api.holdoutPostconditions({
      ...receipt,
      after: { ...receipt.after, revision: 1 },
    }).persisted,
    false,
  );
});
test("removed timer control is failed availability with no fabricated HTTP action", () => {
  assert.equal(typeof api.holdoutPostconditions, "function");
  assert.deepEqual(
    api.holdoutPostconditions({
      family: "pomodoro",
      actionAvailable: false,
      removedControls: 1,
      attempted: false,
    }),
    { actionAvailable: false, persisted: false, uiAfterReload: false },
  );
  assert.throws(
    () =>
      api.holdoutPostconditions({
        family: "pomodoro",
        actionAvailable: false,
        removedControls: 0,
        attempted: false,
      }),
    /control/i,
  );
});
test("first timer start may have no previous storage snapshot but must create and restore one", () => {
  const e = {
    family: "pomodoro",
    actionAvailable: true,
    request: {
      method: "GET",
      path: "/api/pomodoro/config",
      status: 200,
      completed: true,
    },
    before: null,
    after: { running: true, revision: 1, deadlineAt: 2000 },
    reloaded: { running: true, revision: 1, deadlineAt: 2000 },
    domRunning: true,
  };
  assert.equal(api.holdoutPostconditions(e).persisted, true);
});
