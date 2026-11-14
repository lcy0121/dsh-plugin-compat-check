import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hostRuntimeDriver } from "../tools/host-runtime-driver.mjs";

test("selected npm launcher and its Node cannot borrow an installed Desktop", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "dsc-runtime-select-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin"),
    macRoot = path.join(root, "Desktop/Contents");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(macRoot, "Resources"), { recursive: true });
  fs.writeFileSync(path.join(macRoot, "Resources/app.asar"), "owned");
  for (const name of ["dsh", "node"])
    fs.writeFileSync(path.join(bin, name), "#!/bin/sh\nexit 0\n", {
      mode: 0o700,
    });
  const boot = path.join(root, "node_modules/@deepseek-ai/dsh-app-boot");
  fs.mkdirSync(boot, { recursive: true });
  fs.writeFileSync(
    path.join(boot, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-app-boot", main: "index.js" }),
  );
  fs.writeFileSync(path.join(boot, "index.js"), "");
  const env = { PATH: bin };
  const d = hostRuntimeDriver({ env, platform: "darwin", macRoot });
  assert.equal(d.command, path.join(bin, "node"));
  assert.equal(d.module, path.join(boot, "index.js"));
  assert.equal(d.env, env);
  fs.rmSync(boot, { recursive: true });
  assert.throws(
    () => hostRuntimeDriver({ env, platform: "darwin", macRoot }),
    /selected launcher|Selected launcher/,
  );
  assert.equal(
    hostRuntimeDriver({ env, runtimeOnly: true, platform: "darwin", macRoot })
      .command,
    path.join(bin, "node"),
  );
});

test("only a Desktop-owned launcher selects its Electron and ASAR", (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "dsc-runtime-desktop-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const macRoot = path.join(root, "App/Contents"),
    bin = path.join(macRoot, "Resources/runtime/cli/bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "dsh"), "#!/bin/sh\nexit 0\n", {
    mode: 0o700,
  });
  fs.writeFileSync(path.join(macRoot, "Resources/app.asar"), "owned");
  const d = hostRuntimeDriver({
    env: { PATH: bin },
    platform: "darwin",
    macRoot,
  });
  assert.equal(d.command, path.join(macRoot, "MacOS/DeepSeek Harness"));
  assert.equal(d.env.ELECTRON_RUN_AS_NODE, "1");
  assert(d.module.startsWith(path.join(macRoot, "Resources/app.asar")));
  assert.throws(
    () =>
      hostRuntimeDriver({ env: { PATH: root }, platform: "darwin", macRoot }),
    /launcher/,
  );
});
