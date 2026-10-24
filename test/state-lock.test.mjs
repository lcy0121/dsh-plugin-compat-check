import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, fork } from "node:child_process";
import { once } from "node:events";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { baselineTransaction } from "../lib/state-store.mjs";
import { snapshotForBaseline } from "../lib/baseline.mjs";
const snapshot = () => snapshotForBaseline({ plugins: {} }, null);
const cli = new URL("../bin/recover-lock.mjs", import.meta.url);
test("state writers acquire and release locks without launching external commands", async (t) => {
  const { file, lock } = setup(t);
  const original = childProcess.spawnSync;
  let launched = 0;
  try {
    childProcess.spawnSync = () => {
      launched++;
      throw new Error("External process invocation is unavailable");
    };
    syncBuiltinESMExports();
    const result = baselineTransaction(file, snapshot());
    assert.equal(result.wrote, true);
    assert.equal(launched, 0);
    assert.equal(fs.existsSync(lock), false);
  } finally {
    childProcess.spawnSync = original;
    syncBuiltinESMExports();
  }
});
function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-recovery-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "baseline.test.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ ...snapshot(), original: true }) + "\n",
  );
  return { dir, file, lock: file + ".lock" };
}
function run(lock, token) {
  const r = spawnSync(
    process.execPath,
    [cli.pathname, lock, ...(token ? ["--confirm", token] : [])],
    { encoding: "utf8", timeout: 5000 },
  );
  return {
    ...r,
    body: (() => {
      try {
        return JSON.parse(r.stdout);
      } catch {
        return null;
      }
    })(),
  };
}
test("baseline lock records holder and creation info while transaction is active", (t) => {
  const { file, lock } = setup(t);
  let observed;
  baselineTransaction(file, {
    ...snapshot(),
    toJSON() {
      observed = JSON.parse(fs.readFileSync(lock));
      return snapshot();
    },
  });
  assert.equal(observed?.pid, process.pid);
  assert.equal(typeof observed?.createdAt, "string");
  assert.equal(typeof observed?.host, "string");
  assert.ok(Object.hasOwn(observed, "birth"));
  assert.equal(fs.existsSync(lock), false);
});
test("CLI inspects and explicitly recovers a crashed holder without touching state or unrelated files", async (t) => {
  const { file, lock, dir } = setup(t);
  const original = fs.readFileSync(file);
  const other = path.join(dir, ".reviews-unrelated.tmp");
  fs.writeFileSync(other, "keep");
  const child = fork(
    new URL("./support/state-lock-holder.mjs", import.meta.url),
    [lock],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  t.after(() => child.kill("SIGKILL"));
  const [ready] = await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error("holder exited before lock ready");
    }),
  ]);
  assert.equal(ready.ready, true);
  const active = run(lock);
  assert.equal(active.status, 1);
  assert.match(active.stderr, /active|live|identity/i);
  const exit = once(child, "exit");
  child.kill("SIGKILL");
  await exit;
  const inspect = run(lock);
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(inspect.body.status, "orphan");
  assert.ok(fs.existsSync(lock));
  const recovered = run(lock, inspect.body.token);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(recovered.body.status, "recovered");
  assert.equal(fs.existsSync(lock), false);
  assert.deepEqual(fs.readFileSync(file), original);
  assert.equal(fs.readFileSync(other, "utf8"), "keep");
  assert.equal(baselineTransaction(file, snapshot()).wrote, true);
  assert.equal(fs.existsSync(lock), false);
});
test("legacy incomplete symlink FIFO and oversized metadata are refused", (t) => {
  const { file, lock } = setup(t);
  for (const content of [
    "",
    "broken",
    JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      uid: process.getuid?.(),
      host: os.hostname(),
      birth: "reused",
      createdAt: new Date().toISOString(),
      nonce: "x",
    }),
    "x".repeat(20000),
  ]) {
    fs.writeFileSync(lock, content);
    const r = run(lock);
    assert.equal(r.status, 1);
    assert.ok(fs.existsSync(lock));
    fs.unlinkSync(lock);
  }
  fs.symlinkSync(file, lock);
  assert.equal(run(lock).status, 1);
  assert.equal(fs.lstatSync(lock).isSymbolicLink(), true);
  fs.unlinkSync(lock);
  const mk = spawnSync("mkfifo", [lock]);
  if (mk.status === 0) {
    assert.equal(run(lock).status, 1);
    fs.unlinkSync(lock);
  }
});

test("custom baseline names recover only metadata bound to that exact lock path", (t) => {
  for (const name of ["custom-state.json", "custom-state"]) {
    const { dir } = setup(t);
    const lock = path.join(dir, name + ".lock");
    const script = `import {acquireStateLock} from ${JSON.stringify(new URL("../lib/state-lock.mjs", import.meta.url).href)};acquireStateLock(${JSON.stringify(lock)});process.exit(23);`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.equal(child.status, 23, child.stderr);
    const original = fs.readFileSync(lock);
    const unrelated = path.join(
      dir,
      "reviews." + "a".repeat(64) + ".json.lock",
    );
    fs.writeFileSync(unrelated, original);
    assert.equal(
      run(unrelated).status,
      1,
      "a copied record cannot authorize removing another path",
    );
    assert.deepEqual(fs.readFileSync(unrelated), original);
    const inspected = run(lock);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(run(lock, inspected.body.token).status, 0);
    assert.equal(fs.existsSync(lock), false);
    assert.deepEqual(fs.readFileSync(unrelated), original);
  }
});
test("writer release never deletes replacement lock", (t) => {
  const { file, lock } = setup(t);
  baselineTransaction(file, {
    ...snapshot(),
    toJSON() {
      fs.unlinkSync(lock);
      fs.writeFileSync(lock, "replacement");
      return snapshot();
    },
  });
  assert.equal(fs.readFileSync(lock, "utf8"), "replacement");
});

test("unknown birth, foreign host/user and EPERM never authorize removal", async (t) => {
  const { file, lock } = setup(t);
  const { acquireStateLock } = await import("../lib/state-lock.mjs");
  const held = acquireStateLock(lock);
  const metadata = JSON.parse(fs.readFileSync(lock));
  held.release();
  for (const changes of [
    { birth: null },
    { host: "another-host.invalid" },
    { uid: -1 },
    { birth: "different-process-birth" },
  ]) {
    fs.writeFileSync(lock, JSON.stringify({ ...metadata, ...changes }));
    const r = run(lock);
    assert.equal(r.status, 1);
    assert.ok(fs.existsSync(lock));
    fs.unlinkSync(lock);
  }
  fs.writeFileSync(lock, JSON.stringify(metadata));
  const script = `import {recoverStateLock} from ${JSON.stringify(new URL("../lib/state-lock.mjs", import.meta.url).href)};process.kill=()=>{throw Object.assign(new Error('denied'),{code:'EPERM'})};try{recoverStateLock(${JSON.stringify(lock)})}catch(e){console.error(e.message);process.exitCode=1}`;
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown.*EPERM/);
  assert.ok(fs.existsSync(lock));
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
    ...snapshot(),
    original: true,
  });
});

test("recovery guard excludes writers and cannot be implicitly cleared", async (t) => {
  const { file, lock } = setup(t);
  const { acquireStateLock } = await import("../lib/state-lock.mjs");
  fs.writeFileSync(lock + ".recovery-lock", "interrupted recovery");
  assert.throws(() => acquireStateLock(lock), /recovery/);
  assert.equal(baselineTransaction(file, snapshot()).wrote, false);
  assert.equal(fs.existsSync(lock), false);
  assert.equal(run(lock).status, 1);
  assert.equal(
    fs.readFileSync(lock + ".recovery-lock", "utf8"),
    "interrupted recovery",
  );
});

test("stale confirmation and simultaneous recoverers preserve replacement and original JSON", async (t) => {
  const { file, lock } = setup(t);
  const child = fork(
    new URL("./support/state-lock-holder.mjs", import.meta.url),
    [lock],
    { stdio: ["ignore", "ignore", "pipe", "ipc"] },
  );
  t.after(() => child.kill("SIGKILL"));
  await Promise.race([
    once(child, "message"),
    once(child, "exit").then(() => {
      throw new Error("holder exited");
    }),
  ]);
  const exit = once(child, "exit");
  child.kill("SIGKILL");
  await exit;
  const inspect = run(lock);
  assert.equal(inspect.status, 0, inspect.stderr);
  const bytes = fs.readFileSync(lock);
  fs.unlinkSync(lock);
  fs.writeFileSync(lock, bytes);
  // A changed nonce guarantees replacement detection even if the filesystem reuses an inode.
  const next = JSON.parse(bytes);
  next.nonce += "replacement";
  fs.writeFileSync(lock, JSON.stringify(next));
  assert.equal(run(lock, inspect.body.token).status, 1);
  assert.ok(fs.existsSync(lock));
  const current = run(lock);
  assert.equal(current.status, 0, current.stderr);
  const children = Array.from(
    { length: 2 },
    () =>
      new Promise((resolve, reject) => {
        const p = fork(cli, [lock, "--confirm", current.body.token], {
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        p.on("error", reject);
        p.on("exit", (code) => resolve(code));
      }),
  );
  const codes = await Promise.all(children);
  assert.equal(codes.filter((code) => code === 0).length, 1);
  assert.equal(fs.existsSync(lock), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), {
    ...snapshot(),
    original: true,
  });
});

test("crashed manual review recovery preserves accepted sidecar and report until an explicit subsequent save", async (t) => {
  const { dir } = setup(t);
  const { reviewContext, saveReview, readReviews } = await import(
    "../lib/finding-review-store.mjs"
  );
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(nm);
  const report = {
    toolVersion: "0.1.7",
    dshVersion: "0.2.1-rc.2",
    observation: { mode: "catalogue" },
    plugins: {
      demo: {
        version: "1.0.0",
        findings: [
          {
            category: "client-entry-missing",
            severity: "fatal",
            certainty: "certain",
            service: null,
            method: null,
            location: null,
          },
        ],
      },
    },
  };
  const before = JSON.stringify(report);
  const context = await reviewContext(report, {
    nodeModules: nm,
    rulesIdentity: "r",
    catalogIdentity: "c",
    sourceIdentity: "s",
  });
  const body = {
    contextToken: context.contextToken,
    findingId: context.findings[0].findingId,
    status: "reviewed",
    note: "accepted",
  };
  await saveReview(context, body, { dshHome: dir });
  const accepted = await readReviews(context, { dshHome: dir });
  const state = path.join(
      dir,
      "dsh-plugin-compat-check",
      `reviews.${context.targetKey}.json`,
    ),
    lock = state + ".lock",
    bytes = fs.readFileSync(state);
  const source = `import {saveReview} from ${JSON.stringify(new URL("../lib/finding-review-store.mjs", import.meta.url).href)};await saveReview(${JSON.stringify(context)},${JSON.stringify({ ...body, status: "fixed" })},{dshHome:${JSON.stringify(dir)},canCommit:()=>process.exit(23)});`;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", source],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.status, 23, child.stderr);
  const record = JSON.parse(fs.readFileSync(lock));
  assert.equal(record.pid, child.pid);
  assert.ok(record.createdAt);
  assert.ok(record.birth);
  const filesBefore = fs.readdirSync(path.dirname(state)).sort();
  const inspect = run(lock);
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(run(lock, inspect.body.token).status, 0);
  assert.deepEqual(
    fs.readdirSync(path.dirname(state)).sort(),
    filesBefore.filter((name) => name !== path.basename(lock)),
  );
  assert.deepEqual(fs.readFileSync(state), bytes);
  assert.deepEqual(await readReviews(context, { dshHome: dir }), accepted);
  assert.equal(JSON.stringify(report), before);
  await saveReview(context, { ...body, status: "fixed" }, { dshHome: dir });
  assert.equal(
    (await readReviews(context, { dshHome: dir })).items[0].status,
    "fixed",
  );
});
