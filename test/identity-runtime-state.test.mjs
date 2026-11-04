import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reportIdentity } from "../lib/report-identity.mjs";
import { ReportService } from "../lib/report-service.mjs";

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dsc-state-identity-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const nm = path.join(root, "node_modules"),
    pkg = path.join(nm, "demo"),
    state = path.join(pkg, "state");
  await fs.mkdir(state, { recursive: true });
  await fs.writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "demo",
      version: "1",
      dsh: { bundle: { patch: "mounts.data" } },
      main: "index.js",
    }),
  );
  await fs.writeFile(
    path.join(pkg, "index.js"),
    "export function apply(ctx){ctx.settings.get();}",
  );
  await fs.writeFile(path.join(pkg, "mounts.data"), "- insert: []\n");
  await fs.writeFile(path.join(state, "video-usage.json"), '{"count":1}');
  return { root, nm, pkg, state };
}
test("unrelated state atomic replacements and directory touches keep input identity stable", async (t) => {
  const { nm, pkg, state } = await fixture(t);
  const before = (await reportIdentity({ nodeModules: nm })).digest;
  for (let i = 0; i < 3; i++) {
    await fs.utimes(state, new Date(), new Date(Date.now() + 5000 * (i + 1)));
    const temp = path.join(state, "video-usage.tmp");
    await fs.writeFile(temp, JSON.stringify({ count: i + 20 }));
    await fs.rename(temp, path.join(state, "video-usage.json"));
    assert.equal(
      (await reportIdentity({ nodeModules: nm })).digest,
      before,
      "state writes must not invalidate source analysis",
    );
  }
  await fs.writeFile(
    path.join(state, "active.js"),
    "export function apply(ctx){ctx.settings.get();}",
  );
  const source = (await reportIdentity({ nodeModules: nm })).digest;
  assert.notEqual(source, before);
  await fs.writeFile(
    path.join(state, "active.js"),
    "export function apply(ctx){ctx.settings.missing();}",
  );
  assert.notEqual(
    (await reportIdentity({ nodeModules: nm })).digest,
    source,
    "state folder can contain actual source",
  );
  const previous = (await reportIdentity({ nodeModules: nm })).digest;
  await fs.writeFile(
    path.join(pkg, "mounts.data"),
    "- insert: [{name: ./state/active.js}]\n",
  );
  assert.notEqual(
    (await reportIdentity({ nodeModules: nm })).digest,
    previous,
    "patches with arbitrary extension are inputs",
  );
});
test("report publication succeeds while non-source runtime state changes during computation", async (t) => {
  const { nm, state } = await fixture(t);
  let computes = 0;
  const service = new ReportService(
    async () => {
      computes++;
      await fs.writeFile(
        path.join(state, "next.tmp"),
        JSON.stringify({ count: computes }),
      );
      await fs.rename(
        path.join(state, "next.tmp"),
        path.join(state, "video-usage.json"),
      );
      return { ok: true, report: { version: computes } };
    },
    {
      identity: async () => (await reportIdentity({ nodeModules: nm })).digest,
    },
  );
  t.after(() => service.dispose());
  const out = await service.get("A");
  assert.equal(out.ok, true, out.error);
  assert.equal(computes, 1);
});
test("exact unsupported import candidates invalidate on creation and removal", async (t) => {
  const { nm, pkg } = await fixture(t);
  await fs.writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "demo", dsh: {}, main: "index.js" }),
  );
  await fs.writeFile(path.join(pkg, "index.js"), 'import "./payload.data";');
  const missing = (await reportIdentity({ nodeModules: nm })).digest;
  await fs.writeFile(path.join(pkg, "payload.data"), "one");
  const present = (await reportIdentity({ nodeModules: nm })).digest;
  assert.notEqual(present, missing);
  await fs.writeFile(path.join(pkg, "payload.data"), "different data");
  assert.equal((await reportIdentity({ nodeModules: nm })).digest, present);
  await fs.unlink(path.join(pkg, "payload.data"));
  assert.equal((await reportIdentity({ nodeModules: nm })).digest, missing);
});
test("unreferenced temporary file vanishing after enumeration does not affect identity", async (t) => {
  const { Worker } = await import("node:worker_threads");
  const { nm, state } = await fixture(t);
  const before = (await reportIdentity({ nodeModules: nm })).digest;
  const temp = path.join(state, "next.tmp");
  await fs.writeFile(temp, "pending");
  const result = await new Promise((resolve, reject) => {
    const worker = new Worker(
      `
      const fs = require("node:fs");
      const { workerData } = require("node:worker_threads");
      const original = fs.statSync;
      fs.statSync = function(file, ...args) {
        if (file === workerData.temp && fs.existsSync(file)) fs.unlinkSync(file);
        return original.call(this, file, ...args);
      };
      import(workerData.module);
    `,
      {
        eval: true,
        workerData: {
          nodeModules: nm,
          temp,
          module: new URL("../lib/report-identity-worker.mjs", import.meta.url)
            .href,
        },
      },
    );
    worker.once("message", resolve);
    worker.once("error", reject);
    t.after(() => worker.terminate());
  });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.value.digest, before);
});
