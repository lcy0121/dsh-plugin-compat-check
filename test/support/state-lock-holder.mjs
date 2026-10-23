import { acquireStateLock } from "../../lib/state-lock.mjs";
const lock = acquireStateLock(process.argv[2]);
process.send({ ready: true });
setInterval(() => {}, 1000);
process.on("SIGTERM", () => {
  lock.release();
  process.exit(0);
});
