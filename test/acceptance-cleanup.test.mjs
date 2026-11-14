import test from "node:test";
import assert from "node:assert/strict";
import { cleanupAcceptance } from "../tools/acceptance-cleanup.mjs";
test("unconfirmed host stop retains root but still closes network and returns failure evidence", async () => {
  let removed = false,
    closed = false;
  const r = await cleanupAcceptance({
    host: { exitCode: null, signalCode: null },
    root: "/owned",
    stop: async () => {
      throw Error("stop failed");
    },
    closeNetwork: async () => {
      closed = true;
    },
    remove: () => {
      removed = true;
    },
    exists: () => true,
  });
  assert.equal(closed, true);
  assert.equal(removed, false);
  assert.equal(r.hostStopped, false);
  assert.equal(r.cleaned, false);
  assert.match(r.cleanupError, /stop failed/);
  assert.match(r.cleanupError, /root retained/);
});
test("confirmed exit permits root cleanup even after another cleanup stage throws", async () => {
  let removed = false;
  const r = await cleanupAcceptance({
    host: { exitCode: 0, signalCode: null },
    root: "/owned",
    stop: async () => {
      throw Error("transient stop");
    },
    closeNetwork: async () => {
      throw Error("network failed");
    },
    remove: () => {
      removed = true;
    },
    exists: () => !removed,
  });
  assert.equal(removed, true);
  assert.equal(r.hostStopped, true);
  assert.equal(r.cleaned, true);
  assert.match(r.cleanupError, /transient stop/);
  assert.match(r.cleanupError, /network failed/);
});
test("root removal errors cannot claim cleaned or prevent a failed receipt", async () => {
  const r = await cleanupAcceptance({
    root: "/owned",
    remove: () => {
      throw Error("disk failed");
    },
    exists: () => true,
  });
  assert.equal(r.hostStopped, true);
  assert.equal(r.cleaned, false);
  assert.match(r.cleanupError, /disk failed/);
});
