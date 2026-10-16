import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parse, stringify } from "yaml";
import { relocateProfileLock } from "../tools/profile-lock.mjs";
import { command } from "../lib/probe-runner.mjs";
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dsc lock 中文-")),
    source = path.join(root, "source", "profiles", "source"),
    copy = path.join(root, "copy");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(copy);
  return {
    root,
    source,
    copy,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
const input = (dir) => ({
  lockfileVersion: "9.0",
  importers: {
    ".": {
      dependencies: {
        sample: { specifier: "file:" + dir, version: "file:" + dir },
      },
    },
  },
  packages: {
    ["sample@file:" + dir]: {
      resolution: { directory: dir, type: "directory" },
    },
    "remote@1.2.3": { resolution: { integrity: "sha512-fixed-remote" } },
  },
  snapshots: {
    ["sample@file:" + dir + "(peer@1.0.0)"]: {
      dependencies: { peer: "1.0.0" },
    },
    "remote@1.2.3": {},
  },
});
test("clone lock relocates every local locator while preserving remote pins and peer suffixes", () => {
  const f = setup();
  try {
    const target = path.join(f.root, "source", "profiles", "neighbor space"),
      lock = stringify(input("../neighbor space"));
    fs.writeFileSync(path.join(f.source, "pnpm-lock.yaml"), lock);
    fs.writeFileSync(path.join(f.copy, "pnpm-lock.yaml"), lock);
    relocateProfileLock(f.copy, f.source);
    const out = parse(
      fs.readFileSync(path.join(f.copy, "pnpm-lock.yaml"), "utf8"),
    );
    assert.equal(
      out.importers["."].dependencies.sample.version,
      "file:" + target,
    );
    assert.deepEqual(out.packages["remote@1.2.3"], {
      resolution: { integrity: "sha512-fixed-remote" },
    });
    assert.equal(
      out.packages["sample@file:" + target].resolution.directory,
      target,
    );
    assert.deepEqual(out.snapshots["sample@file:" + target + "(peer@1.0.0)"], {
      dependencies: { peer: "1.0.0" },
    });
    assert.equal(
      fs.readFileSync(path.join(f.source, "pnpm-lock.yaml"), "utf8"),
      lock,
    );
  } finally {
    f.cleanup();
  }
});
test("local tarball and link references relocate without changing registry URLs", () => {
  const f = setup();
  try {
    const data = input("../neighbor");
    data.packages.tarball = { resolution: { tarball: "file:../archive.tgz" } };
    data.snapshots.linked = {
      dependencies: {
        local: "link:../neighbor",
        remote: "https://registry.example/fixed.tgz",
      },
    };
    fs.writeFileSync(path.join(f.copy, "pnpm-lock.yaml"), stringify(data));
    relocateProfileLock(f.copy, f.source);
    const out = parse(
      fs.readFileSync(path.join(f.copy, "pnpm-lock.yaml"), "utf8"),
    );
    assert.equal(
      out.packages.tarball.resolution.tarball,
      "file:" + path.join(f.root, "source", "profiles", "archive.tgz"),
    );
    assert.equal(
      out.snapshots.linked.dependencies.local,
      "link:" + path.join(f.root, "source", "profiles", "neighbor"),
    );
    assert.equal(
      out.snapshots.linked.dependencies.remote,
      "https://registry.example/fixed.tgz",
    );
  } finally {
    f.cleanup();
  }
});
test("unsupported, malformed and recursive locks fail without rewriting their input", () => {
  const f = setup();
  try {
    for (const text of [
      "lockfileVersion: '6.0'\n",
      "lockfileVersion: 9\nlockfileVersion: 9\n",
      "lockfileVersion: '9.0'\nimporters:\n  .: &cycle\n    self: *cycle\n",
      stringify({
        ...input("../neighbor"),
        importers: { ".": {}, "../workspace": {} },
      }),
    ]) {
      const file = path.join(f.copy, "pnpm-lock.yaml");
      fs.writeFileSync(file, text);
      assert.throws(
        () => relocateProfileLock(f.copy, f.source),
        /lock|Lock|锁/,
      );
      assert.equal(fs.readFileSync(file, "utf8"), text);
    }
  } finally {
    f.cleanup();
  }
});
test("clone lock refuses symlinks and oversized data, preserving the original file", () => {
  const f = setup();
  try {
    const original = path.join(f.source, "pnpm-lock.yaml"),
      file = path.join(f.copy, "pnpm-lock.yaml");
    fs.writeFileSync(original, "untouched");
    fs.symlinkSync(original, file);
    assert.throws(() => relocateProfileLock(f.copy, f.source), /lock|Lock|锁/);
    assert.equal(fs.readFileSync(original, "utf8"), "untouched");
    fs.unlinkSync(file);
    fs.writeFileSync(file, "x".repeat(8 * 1024 * 1024 + 1));
    assert.throws(() => relocateProfileLock(f.copy, f.source), /lock|Lock|锁/);
  } finally {
    f.cleanup();
  }
});
test("profiles with no lock do not create a replacement resolution", () => {
  const f = setup();
  try {
    relocateProfileLock(f.copy, f.source);
    assert.deepEqual(fs.readdirSync(f.copy), []);
  } finally {
    f.cleanup();
  }
});

describe(
  "real pnpm local lock relocation",
  { skip: process.env.DSC_SLOW !== "1" },
  () => {
    test(
      "pnpm installs the relocated locked package from a path with spaces and parentheses",
      { timeout: 30000 },
      async () => {
        const f = setup();
        try {
          const dep = path.join(
            f.root,
            "source",
            "profiles",
            "neighbor space (x)",
          );
          fs.mkdirSync(dep);
          fs.writeFileSync(
            path.join(dep, "package.json"),
            ' {"name":"sample","version":"1.0.0"}',
          );
          fs.writeFileSync(
            path.join(f.source, "package.json"),
            JSON.stringify({
              name: "profile",
              dependencies: { sample: "file:" + dep },
            }),
          );
          const env = {
            ...process.env,
            npm_config_store_dir: path.join(f.root, "store"),
          };
          const originalCwd = process.cwd();
          // pnpm --dir fixes the project root without changing the test runner cwd.
          const locked = await command(
            "pnpm",
            [
              "--dir",
              f.source,
              "install",
              "--lockfile-only",
              "--offline",
              "--ignore-scripts",
            ],
            { env },
          );
          assert.equal(locked.code, 0, locked.error || locked.output);
          fs.copyFileSync(
            path.join(f.source, "package.json"),
            path.join(f.copy, "package.json"),
          );
          fs.copyFileSync(
            path.join(f.source, "pnpm-lock.yaml"),
            path.join(f.copy, "pnpm-lock.yaml"),
          );
          const before = fs.readFileSync(
            path.join(f.source, "pnpm-lock.yaml"),
            "utf8",
          );
          relocateProfileLock(f.copy, f.source);
          const installed = await command(
            "pnpm",
            [
              "--dir",
              f.copy,
              "install",
              "--offline",
              "--ignore-scripts",
              "--frozen-lockfile",
            ],
            { env },
          );
          assert.equal(installed.code, 0, installed.error || installed.output);
          assert.equal(
            JSON.parse(
              fs.readFileSync(
                path.join(f.copy, "node_modules/sample/package.json"),
              ),
            ).version,
            "1.0.0",
          );
          assert.equal(
            fs.readFileSync(path.join(f.source, "pnpm-lock.yaml"), "utf8"),
            before,
          );
          assert.equal(process.cwd(), originalCwd);
        } finally {
          f.cleanup();
        }
      },
    );
  },
);
