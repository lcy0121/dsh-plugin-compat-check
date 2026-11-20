/** Owned worker IPC startup/disconnect check, with no share or relay commands. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createRequire } from "node:module";
import { isolatedEnvironment } from "../lib/execution-environment.mjs";
import { stopOwnedChild } from "../lib/owned-process.mjs";
import { hostRuntimeDriver } from "./host-runtime-driver.mjs";

const name = "@deepseek-ai/dsh-experimental-liveshare";
const entry = "lib/owner-gateway/cli.js";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-liveshare-worker-"));
let child;
try {
  const env = isolatedEnvironment(root);
  const carrier = hostRuntimeDriver({ env });
  const electron = carrier.env.ELECTRON_RUN_AS_NODE === "1";
  const worker = electron
    ? path.resolve(
        path.dirname(carrier.module),
        "../../",
        name.split("/")[1],
        entry,
      )
    : path.join(
        path.dirname(
          createRequire(carrier.module).resolve(name + "/package.json"),
        ),
        entry,
      );
  child = spawn(carrier.command, [...carrier.args, worker], {
    env: { ...carrier.env, LIVESHARE_TUNNEL_MODE: "gateway" },
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  const deadline = AbortSignal.timeout(15000);
  const exited = once(child, "exit", { signal: deadline });
  // Observe early exit while waiting for readiness, then require normal exit.
  const [message] = await Promise.race([
    once(child, "message", { signal: deadline }),
    exited.then(([code, signal]) => {
      throw Error(`LiveShare worker exited before ready (${code ?? signal})`);
    }),
  ]);
  if (message?.type !== "ready")
    throw Error("LiveShare worker did not issue the IPC readiness frame");
  child.disconnect();
  const [code, signal] = await exited;
  if (code !== 0 || signal)
    throw Error(`LiveShare worker disconnect failed (${code ?? signal})`);
  console.log(
    JSON.stringify({
      ok: true,
      carrier: electron ? "desktop-asar" : "npm",
      ready: true,
      exited: true,
      shareCommands: 0,
    }),
  );
} finally {
  if (child) await stopOwnedChild(child);
  fs.rmSync(root, { recursive: true, force: true });
}
