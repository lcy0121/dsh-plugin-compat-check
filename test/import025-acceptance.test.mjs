import test from "node:test";
import assert from "node:assert/strict";
import { validateImportAcceptance } from "../tools/import025-acceptance.mjs";
function receipt() {
  const id = "owned-session",
    workspacePath = "/owned/workspace";
  return {
    hostVersion: "0.2.2-rc.3",
    ok: true,
    hostStopped: true,
    cleaned: true,
    workspacePath,
    before: { stored: [], importerDefaultAbsent: true },
    unauthorized: 401,
    lines: [
      { type: "progress", done: 0, total: 1 },
      { type: "progress", done: 1, total: 1 },
      { type: "outcome", outcome: { ok: true, value: { sessionIds: [id] } } },
    ],
    after: {
      stored: [
        {
          header: {
            id,
            cwd: workspacePath,
            createdAt: Date.UTC(2026, 10, 11, 2, 0, 0) + 999,
          },
        },
      ],
      guestCode: "deepseekChatImport/owner-only",
      members: [id],
      agentForSession: false,
      liveSession: false,
      events: [
        "turn/start",
        "step/start",
        "system/message",
        "user/message",
        "assistant/message",
        "step/end",
        "turn/end",
        "session/title",
      ].map((type) => ({
        type,
        data:
          type === "session/title"
            ? { title: "Owned synthetic import" }
            : { text: "Owned synthetic answer" },
      })),
    },
    routeAfterUnload: 404,
  };
}
test("import receipt binds actual ownership, stored Session semantics and teardown", () =>
  assert.equal(validateImportAcceptance(receipt()).ok, true));
test("import receipt rejects borrowed host, non-owner access, live Agent, stale times and missing teardown", () => {
  for (const change of [
    (r) => (r.hostVersion = "0.2.2-rc.2"),
    (r) => r.before.stored.push({}),
    (r) => (r.before.importerDefaultAbsent = false),
    (r) => (r.unauthorized = 200),
    (r) => (r.after.guestCode = undefined),
    (r) => (r.after.agentForSession = true),
    (r) => (r.after.liveSession = true),
    (r) => r.after.stored[0].header.createdAt++,
    (r) => (r.after.members = []),
    (r) => r.after.events.pop(),
    (r) => (r.routeAfterUnload = 200),
    (r) => (r.hostStopped = false),
    (r) => (r.cleaned = false),
    (r) => (r.cleanupError = "stop failure"),
  ]) {
    const r = receipt();
    change(r);
    assert.throws(() => validateImportAcceptance(r));
  }
});
