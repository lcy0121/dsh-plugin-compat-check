import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { captureProfiles } from "./support/profile-snapshot.mjs";
import { extractWithProvenance } from "../lib/extract.mjs";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-snapshot-case-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const profilesDir = path.join(dir, "profiles");
  const nm = path.join(profilesDir, "sample/node_modules");
  const pkg = path.join(nm, "sample");
  fs.mkdirSync(path.join(pkg, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "sample",
      version: "1.0.0",
      dsh: {},
      main: "lib/index.js",
    }),
  );
  fs.writeFileSync(
    path.join(pkg, "lib/index.js"),
    "export function apply(ctx) { ctx.settings.register(); }\n",
  );
  return { dir, profilesDir, nm, pkg };
}

test("captured input survives original profile deletion through extraction and source reread", (t) => {
  const f = fixture(t);
  const snapshot = captureProfiles({ profilesDir: f.profilesDir });
  t.after(() => snapshot.dispose());
  fs.rmSync(f.profilesDir, { recursive: true });
  const r = extractWithProvenance(snapshot.profiles[0].nm);
  const site = r.report.perPlugin.sample.callSites.find(
    (s) => s.method === "register",
  );
  assert.ok(site);
  const text = fs.readFileSync(
    path.join(snapshot.profiles[0].nm, "sample", site.file),
    "utf8",
  );
  assert.ok(text.split("\n")[site.line - 1].includes(site.matched));
});

test("rewriting original source after extraction cannot change the captured source or a second extraction", (t) => {
  const f = fixture(t);
  const snapshot = captureProfiles({ profilesDir: f.profilesDir });
  t.after(() => snapshot.dispose());
  const nm = snapshot.profiles[0].nm;
  const before = extractWithProvenance(nm);
  fs.writeFileSync(
    path.join(f.pkg, "lib/index.js"),
    "\n\nexport const changed = true;\n",
  );
  assert.deepEqual(extractWithProvenance(nm), before);
  assert.match(
    fs.readFileSync(path.join(nm, "sample/lib/index.js"), "utf8"),
    /ctx.settings.register/,
  );
});

test("capture rejects a profile disappearing during capture and removes incomplete copies", (t) => {
  const f = fixture(t),
    tempDir = path.join(f.dir, "copies");
  fs.mkdirSync(tempDir);
  assert.throws(
    () =>
      captureProfiles({
        profilesDir: f.profilesDir,
        tempDir,
        beforeVerify: () => fs.rmSync(f.profilesDir, { recursive: true }),
      }),
    /PROFILE_SNAPSHOT_UNSTABLE/,
  );
  assert.deepEqual(fs.readdirSync(tempDir), []);
});

test("capture detects source rewrites and added plugins before publishing a snapshot", (t) => {
  for (const kind of ["rewrite", "add"]) {
    const f = fixture(t);
    assert.throws(
      () =>
        captureProfiles({
          profilesDir: f.profilesDir,
          beforeVerify: () => {
            if (kind === "rewrite")
              fs.writeFileSync(path.join(f.pkg, "lib/index.js"), "changed");
            else {
              fs.mkdirSync(path.join(f.nm, "new"));
              fs.writeFileSync(
                path.join(f.nm, "new/package.json"),
                '{"name":"new","dsh":{}}',
              );
            }
          },
        }),
      /PROFILE_SNAPSHOT_UNSTABLE/,
    );
  }
});

test("pnpm package roots and internal links are isolated; escaped links retain outside-package diagnostics", (t) => {
  const f = fixture(t),
    store = path.join(f.dir, "store/sample");
  fs.mkdirSync(path.dirname(store));
  fs.renameSync(f.pkg, store);
  fs.symlinkSync(store, f.pkg, "dir");
  fs.symlinkSync(
    path.join(store, "lib/index.js"),
    path.join(store, "alias.js"),
  );
  const outside = path.join(f.dir, "external-client.js");
  fs.writeFileSync(outside, "SECRET_EXTERNAL_SOURCE");
  fs.symlinkSync(outside, path.join(store, "client-outside.js"));
  fs.symlinkSync(path.join(f.dir, "missing"), path.join(store, "broken.js"));
  const original = extractWithProvenance(f.nm);
  const snapshot = captureProfiles({ profilesDir: f.profilesDir });
  t.after(() => snapshot.dispose());
  fs.rmSync(store, { recursive: true });
  fs.rmSync(outside);
  const copy = snapshot.profiles[0].nm;
  const r = extractWithProvenance(copy);
  assert.deepEqual(
    r.report.perPlugin.sample.calls,
    original.report.perPlugin.sample.calls,
  );
  assert.ok(
    r.report.perPlugin.sample.diagnostics.some(
      (d) => d.kind === "path-outside-package",
    ),
  );
  assert.equal(
    fs.realpathSync(path.join(copy, "sample/alias.js")),
    path.join(fs.realpathSync(copy), "sample/lib/index.js"),
  );
  assert.ok(
    !fs
      .readlinkSync(path.join(copy, "sample/client-outside.js"))
      .includes(f.dir),
  );
});

test("absent optional profiles are explicit and disposal is idempotent", (t) => {
  const f = fixture(t);
  const snapshot = captureProfiles({
    profilesDir: f.profilesDir,
    names: ["missing"],
  });
  assert.deepEqual(snapshot.profiles, []);
  assert.deepEqual(snapshot.missing, ["missing"]);
  const root = snapshot.root;
  snapshot.dispose();
  snapshot.dispose();
  assert.equal(fs.existsSync(root), false);
  assert.ok(fs.existsSync(f.pkg));
});

test("capture budgets reject oversized inputs rather than silently omitting them", (t) => {
  const f = fixture(t);
  assert.throws(
    () => captureProfiles({ profilesDir: f.profilesDir, limits: { bytes: 1 } }),
    /PROFILE_SNAPSHOT_BUDGET/,
  );
});

test("independent test processes borrow the same bytes without disposing the runner-owned snapshot", (t) => {
  const f = fixture(t),
    snapshot = captureProfiles({ profilesDir: f.profilesDir });
  t.after(() => snapshot.dispose());
  fs.rmSync(f.profilesDir, { recursive: true });
  const script = `import {optionalProfiles} from ${JSON.stringify(new URL("./support/profile-snapshot.mjs", import.meta.url).href)};
    import fs from 'node:fs';import path from 'node:path';
    console.log(fs.readFileSync(path.join(optionalProfiles()[0].nm,'sample/lib/index.js'),'utf8'));`;
  const run = () =>
    spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, DSC_TEST_PROFILE_SNAPSHOT: snapshot.root },
    });
  for (let i = 0; i < 2; i++) {
    const r = run();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /ctx.settings.register/);
    assert.ok(fs.existsSync(snapshot.root));
  }
  snapshot.dispose();
  assert.notEqual(
    run().status,
    0,
    "A missing borrowed snapshot must not fall back to mutable profiles",
  );
});

test("inventory metadata, scoped packages and empty profiles retain their extraction meaning", (t) => {
  const f = fixture(t);
  fs.mkdirSync(path.join(f.nm, "@community"));
  fs.renameSync(f.pkg, path.join(f.nm, "@community/sample"));
  fs.writeFileSync(
    path.join(f.nm, "@community/sample/package.json"),
    '{"name":"@community/sample","version":"1.0.0","dsh":{},"main":"lib/index.js"}',
  );
  fs.mkdirSync(path.join(f.nm, "malformed"));
  fs.writeFileSync(path.join(f.nm, "malformed/package.json"), "{");
  fs.mkdirSync(path.join(f.nm, "official"));
  fs.writeFileSync(
    path.join(f.nm, "official/package.json"),
    '{"name":"@deepseek-ai/official","dsh":{}}',
  );
  fs.writeFileSync(
    path.join(f.nm, "official/unused.js"),
    "DO_NOT_COPY_OFFICIAL_TREE",
  );
  fs.mkdirSync(path.join(f.profilesDir, "empty/node_modules"), {
    recursive: true,
  });
  const snapshot = captureProfiles({ profilesDir: f.profilesDir });
  t.after(() => snapshot.dispose());
  const copied = snapshot.profiles.find((p) => p.name === "sample").nm;
  assert.deepEqual(extractWithProvenance(copied), extractWithProvenance(f.nm));
  assert.equal(fs.existsSync(path.join(copied, "official/unused.js")), false);
  assert.deepEqual(
    fs.readdirSync(snapshot.profiles.find((p) => p.name === "empty").nm),
    [],
  );
  assert.equal(
    fs.statSync(path.join(copied, "@community/sample/lib/index.js")).mode &
      0o222,
    0,
  );
});
