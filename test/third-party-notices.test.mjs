import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("..", import.meta.url));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-notices-"));
  const write = (file, value) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value));
  };
  fs.mkdirSync(path.join(root, "tools"));
  fs.copyFileSync(
    path.join(repo, "tools/third-party-notices.mjs"),
    path.join(root, "tools/third-party-notices.mjs"),
  );
  if (fs.existsSync(path.join(repo, "tools/licenses")))
    fs.cpSync(
      path.join(repo, "tools/licenses"),
      path.join(root, "tools/licenses"),
      { recursive: true },
    );
  const entry = JSON.parse(
    fs.readFileSync(path.join(repo, "package-lock.json")),
  ).packages["node_modules/fsevents"];
  const lock = {
    packages: {
      "": { devDependencies: { fsevents: "2.3.3" } },
      "node_modules/fsevents": entry,
    },
  };
  write("package.json", { devDependencies: { fsevents: "2.3.3" } });
  write("package-lock.json", lock);
  write("plugin/package.json", { dependencies: {} });
  fs.mkdirSync(path.join(root, "plugin/src/components/ui"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "plugin/src/components/ui/PROVENANCE.md"),
    "Fixture component provenance",
  );
  return {
    root,
    lock,
    write,
    run: () =>
      spawnSync(
        process.execPath,
        [path.join(root, "tools/third-party-notices.mjs")],
        { encoding: "utf8" },
      ),
    dispose: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
test("notices retain the locked Darwin-only optional dependency and its license when absent on Linux", () => {
  const f = fixture();
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const text = fs.readFileSync(
      path.join(f.root, "THIRD_PARTY_NOTICES.md"),
      "utf8",
    );
    assert.match(text, /fsevents\/v\/2\.3\.3/);
    assert.match(
      text,
      /Copyright \(C\) 2010-2020 by Philipp Dunkel, Ben Noordhuis, Elan Shankar, Paul Miller/,
    );
    assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS"/);
  } finally {
    f.dispose();
  }
});
test("missing ordinary dependencies are not silently accepted as optional license snapshots", () => {
  const f = fixture();
  try {
    f.lock.packages["node_modules/fsevents"].optional = false;
    f.write("package-lock.json", f.lock);
    assert.notEqual(f.run().status, 0);
  } finally {
    f.dispose();
  }
});
test("optional license fallback rejects lock identity drift", () => {
  for (const change of [
    { version: "2.3.4" },
    { integrity: "sha512-tampered" },
    { license: "ISC" },
    { os: ["linux"] },
  ]) {
    const f = fixture();
    try {
      Object.assign(f.lock.packages["node_modules/fsevents"], change);
      f.write("package-lock.json", f.lock);
      assert.notEqual(f.run().status, 0, JSON.stringify(change));
    } finally {
      f.dispose();
    }
  }
});
test("optional license fallback rejects altered license text", () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, "tools/licenses"), { recursive: true });
    fs.writeFileSync(
      path.join(f.root, "tools/licenses/fsevents-2.3.3.LICENSE"),
      "altered license",
    );
    assert.notEqual(f.run().status, 0);
  } finally {
    f.dispose();
  }
});
