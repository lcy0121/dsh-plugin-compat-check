import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotPackage } from "../tools/static-sample.mjs";
import { captureUpgradeInputOwned } from "../lib/upgrade-input.mjs";
import { reportIdentity } from "../lib/report-identity.mjs";

function fixture(t) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "dsc-input-bound-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, "node_modules"),
    pkg = path.join(nm, "demo");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(
    path.join(pkg, "package.json"),
    JSON.stringify({
      name: "demo",
      version: "1.0.0",
      dsh: {},
      main: "index.js",
    }),
  );
  fs.writeFileSync(path.join(pkg, "index.js"), 'throw Error("never execute")');
  return { root, nm, pkg };
}
// A complete readdir allocates the untrusted list before any caller can enforce its budget.
for (const kind of ["author", "upgrade"])
  test(`${kind} snapshot bounds enumeration before collecting an oversized directory`, (t) => {
    const f = fixture(t);
    for (let i = 0; i < 8; i++)
      fs.writeFileSync(path.join(f.pkg, `data-${i}`), "x");
    const original = fs.readdirSync;
    fs.readdirSync = (dir, ...args) => {
      if (String(dir).startsWith(f.root))
        throw Error("unbounded listing allocated");
      return original(dir, ...args);
    };
    try {
      const dest = path.join(f.root, "copy");
      fs.mkdirSync(dest);
      assert.throws(
        () =>
          kind === "author"
            ? snapshotPackage(f.pkg, dest, { entries: 4 })
            : captureUpgradeInputOwned(f.nm, { entries: 4 }, dest),
        /budget|预算/,
      );
    } finally {
      fs.readdirSync = original;
    }
  });
for (const kind of ["author", "upgrade"])
  test(`${kind} snapshot checks time within directory iteration`, (t) => {
    const f = fixture(t),
      original = Date.now;
    let now = 0;
    Date.now = () => now++;
    try {
      const dest = path.join(f.root, "copy");
      fs.mkdirSync(dest);
      assert.throws(
        () =>
          kind === "author"
            ? snapshotPackage(f.pkg, dest, { timeMs: 1 })
            : captureUpgradeInputOwned(f.nm, { timeMs: 1 }, dest),
        /budget|预算/,
      );
    } finally {
      Date.now = original;
    }
  });
for (const layout of ["inventory", "scope", "source"])
  test(`cache identity bounds ${layout} enumeration`, async (t) => {
    const f = fixture(t);
    const dir =
      layout === "inventory"
        ? f.nm
        : layout === "scope"
          ? path.join(f.nm, "@scope")
          : f.pkg;
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < 8; i++)
      fs.writeFileSync(path.join(dir, `extra-${i}`), "x");
    await assert.rejects(
      reportIdentity({ nodeModules: f.nm, limits: { entries: 4 } }),
      /budget|预算/,
    );
    assert.equal(
      typeof (await reportIdentity({ nodeModules: f.nm })).digest,
      "string",
    );
  });
test("cache identity rejects linked control inputs instead of trusting their replacement", async (t) => {
  const f = fixture(t),
    file = path.join(f.root, "probe.json"),
    link = path.join(f.root, "probe-link.json");
  fs.writeFileSync(file, "{}");
  fs.symlinkSync(file, link);
  await assert.rejects(
    reportIdentity({ nodeModules: f.nm, files: [link] }),
    /regular|普通文件/,
  );
});

test("direct compatReport bounds rules and probe files without relying on cache preflight", async (t) => {
  const { spawnSync } = await import("node:child_process");
  const { pathToFileURL } = await import("node:url");
  for (const target of ["rules", "probe"])
    for (const kind of ["link", "oversize", "fifo", "changed"])
      await t.test(`${target} ${kind}`, () => {
        const f = fixture(t),
          kernel = path.join(f.root, "kernel"),
          rulesDir = path.join(kernel, "rules");
        fs.mkdirSync(rulesDir, { recursive: true });
        fs.symlinkSync(path.resolve("lib"), path.join(kernel, "lib"));
        for (const name of fs.readdirSync("rules"))
          fs.copyFileSync(path.join("rules", name), path.join(rulesDir, name));
        const file =
          target === "rules"
            ? path.join(rulesDir, "severity.json")
            : path.join(f.root, "probe.json");
        const initialBytes =
          target === "rules"
            ? fs.readFileSync(file)
            : Buffer.from('{"root":{}}');
        if (fs.existsSync(file)) fs.unlinkSync(file);
        if (kind === "link") {
          const src = path.join(f.root, "source.json");
          fs.writeFileSync(src, "{}");
          fs.symlinkSync(src, file);
        }
        if (kind === "oversize") {
          fs.writeFileSync(file, "{}" + " ".repeat(8 * 1024 * 1024));
        }
        if (kind === "changed") fs.writeFileSync(file, initialBytes);
        if (kind === "fifo")
          assert.equal(spawnSync("mkfifo", [file]).status, 0);
        const script = `import fs from "node:fs";
          const changedFile=${JSON.stringify(kind === "changed" ? file : null)};
          let swapped=false;
          if(changedFile){const inode=fs.statSync(changedFile).ino, read=fs.readSync;
            fs.readSync=(fd,...args)=>{const n=read(fd,...args);if(!swapped && fs.fstatSync(fd).ino===inode){swapped=true;fs.renameSync(changedFile,changedFile+".saved");fs.copyFileSync(changedFile+".saved",changedFile);}return n;};}
          import {apply} from ${JSON.stringify(pathToFileURL(path.resolve("plugin/index.js")).href)};
      const effects=[];const ctx={get(){},effect(f){const off=f();if(off)effects.push(off)},inject(){}};apply(ctx);
      const out=await globalThis.__DSH_COMPAT_CHECK__.compatReport();for(const off of effects)off();
      console.log('MUTATED:'+swapped);console.log('RESULT:'+JSON.stringify(out));process.exit(0);`;
        const child = spawnSync(
          process.execPath,
          ["--input-type=module", "-e", script],
          {
            encoding: "utf8",
            timeout: 5000,
            env: {
              ...process.env,
              DSC_KERNEL: kernel,
              DSH_PROFILE_DIR: f.root,
              DSH_HOME: f.root,
              DSC_PROFILE: "",
              DSH_VERSION: "0.2.0-rc.2",
              DSC_PROBE_REPORT: target === "probe" ? file : "",
              DSC_OUT_DIR: "",
              DSC_AUTORUN_MS: "60000",
            },
          },
        );
        assert.equal(
          child.status,
          0,
          child.stdout + child.stderr + child.error,
        );
        if (kind === "changed") assert.match(child.stdout, /MUTATED:true/);
        const out = JSON.parse(child.stdout.split("RESULT:")[1]);
        if (target === "rules") {
          assert.equal(out.ok, false);
          assert.match(out.error, /regular|budget|changed|普通文件|预算/);
        } else {
          assert.equal(out.ok, true, out.error);
          assert.match(out.surfaceWhy, /读不动/);
        }
      });
});
test("author snapshot checks its deadline between file read chunks", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.pkg, "index.js"), "x".repeat(100000));
  const realRead = fs.readSync,
    realNow = Date.now;
  let now = 0,
    reads = 0;
  Date.now = () => now;
  fs.readSync = (...args) => {
    const n = realRead(...args);
    now = 100;
    reads++;
    return n;
  };
  try {
    assert.throws(
      () => snapshotPackage(f.pkg, path.join(f.root, "copy"), { timeMs: 50 }),
      /budget|预算/,
    );
    assert.equal(reads, 1, "deadline must stop before another chunk is read");
  } finally {
    fs.readSync = realRead;
    Date.now = realNow;
  }
});
