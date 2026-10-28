import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { terminalText } from "../lib/contracts.mjs";
import { compatibilityText } from "../tools/arrival-text.mjs";

const bad = "sample\x1b]8;;https://example.invalid\x07\r\nFORGED\x9b\u202e";
const child = (args) =>
  spawnSync(process.execPath, args, { encoding: "utf8", timeout: 10000 });
function safe(text) {
  assert(
    !/[\x00-\x09\x0b-\x1f\x7f-\x9f\u202e]/.test(text),
    JSON.stringify(text),
  );
  assert(!text.split("\n").some((line) => line.startsWith("FORGED")));
}
test("labels and direct extraction escape manifest text while JSON preserves identity", () => {
  const f = packageFixture("throw Error('must never execute')", {
    meta: { name: bad },
  });
  try {
    const probe = path.join(f.root, "probe.json"),
      labels = path.join(f.root, "labels.json");
    const identity = {
      profileId: f.nm,
      dshVersion: "0.2.1-rc.3",
      probedAt: new Date().toISOString(),
      sampleId: "terminal-fixture",
    };
    fs.writeFileSync(
      probe,
      JSON.stringify({ ...identity, observationVersion: 1, root: {} }),
    );
    const args = [
      "tools/labels.mjs",
      "--nm",
      f.nm,
      "--probe",
      probe,
      "--labels",
      labels,
    ];
    for (const entries of [[], [{ name: bad, stateCode: 2 }]]) {
      fs.writeFileSync(
        labels,
        JSON.stringify({
          ...identity,
          labelVersion: 1,
          source: "loader.entries",
          available: true,
          complete: true,
          entries,
        }),
      );
      const json = child([...args, "--json"]),
        text = child(args);
      assert.equal(text.status, json.status);
      assert.equal(JSON.parse(json.stdout).rows[0].plugin, bad);
      assert(text.stdout.includes(terminalText(bad)));
      safe(text.stdout + text.stderr);
    }
    const out = path.join(f.root, "extract");
    const extracted = child(["lib/extract.mjs", f.nm, out]);
    assert.equal(extracted.status, 0, extracted.stderr);
    assert(extracted.stdout.includes(terminalText(bad)));
    safe(extracted.stdout + extracted.stderr);
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(out, "static.json"))).manifests[0]
        .name,
      bad,
    );
    // Duplicate names produce an error containing attacker-controlled metadata.
    fs.cpSync(f.pkg, path.join(f.nm, "duplicate"), { recursive: true });
    for (const invocation of [args, ["lib/extract.mjs", f.nm, out]]) {
      const failed = child(invocation);
      assert.equal(failed.status, 3);
      safe(failed.stdout + failed.stderr);
      assert(failed.stderr.includes(terminalText(bad)));
    }
  } finally {
    f.cleanup();
  }
});
test("arrival summaries escape low-trust versions and failure details", () => {
  safe(compatibilityText({ ok: true, toolVersion: bad }));
  safe(compatibilityText({ ok: false, error: bad }));
});
