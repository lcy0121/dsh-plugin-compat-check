#!/usr/bin/env node
/** Local-only explicit orphan recovery; inspection does not remove the state lock. */
import { terminalText } from "../lib/contracts.mjs";
import { recoverStateLock } from "../lib/state-lock.mjs";
const args = process.argv.slice(2);
try {
  if (
    !(
      args.length === 1 ||
      (args.length === 3 &&
        args[1] === "--confirm" &&
        /^[a-f0-9]{64}$/.test(args[2]))
    )
  )
    throw new Error(
      "Usage: node bin/recover-lock.mjs /exact/state.json.lock [--confirm <inspection-token>]",
    );
  console.log(JSON.stringify(recoverStateLock(args[0], { confirm: args[2] })));
} catch (error) {
  console.error(`State lock recovery refused: ${terminalText(error.message)}`);
  process.exitCode = 1;
}
