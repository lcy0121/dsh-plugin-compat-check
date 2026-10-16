import { baselineTransaction } from "../../lib/state-store.mjs";
process.send({ ready: true });
process.once("message", ({ file, snapshot, count }) => {
  const outcomes = [];
  for (let i = 0; i < count; i++)
    outcomes.push(baselineTransaction(file, snapshot));
  process.send({ outcomes }, () => process.disconnect());
});
