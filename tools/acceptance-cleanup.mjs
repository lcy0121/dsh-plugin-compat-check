/** Teardown evidence for owned acceptance roots; never remove a running host's files. */
import fs from "node:fs";
import { stopOwnedChild } from "../lib/probe-runner.mjs";
export async function cleanupAcceptance({
  host,
  root,
  closeNetwork = async () => {},
  stop = stopOwnedChild,
  remove = () => fs.rmSync(root, { recursive: true, force: true }),
  exists = () => fs.existsSync(root),
}) {
  const errors = [];
  if (host)
    try {
      await stop(host);
    } catch (e) {
      errors.push("host: " + String(e));
    }
  const hostStopped =
    !host || host.exitCode !== null || host.signalCode !== null;
  try {
    await closeNetwork();
  } catch (e) {
    errors.push("network: " + String(e));
  }
  if (hostStopped) {
    try {
      await remove();
    } catch (e) {
      errors.push("root: " + String(e));
    }
  } else errors.push("host stop unconfirmed; owned root retained");
  let cleaned = false;
  try {
    cleaned = hostStopped && !exists();
  } catch (e) {
    errors.push("root check: " + String(e));
  }
  return {
    hostStopped,
    cleaned,
    ...(errors.length ? { cleanupError: errors.join("\n") } : {}),
  };
}
