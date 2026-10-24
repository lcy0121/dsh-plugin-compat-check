import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { writePackageFixture } from "./fixture-utils.mjs";

test("copyable workflow runs a single scan, renders its saved evidence, archives failures and preserves gate exit", (t) => {
  const workflow = YAML.parse(
    fs.readFileSync(
      new URL("../examples/author-ci.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.on.workflow_dispatch.inputs.tool_ref.required, true);
  const steps = workflow.jobs.compatibility.steps;
  for (const s of steps.filter((s) => s.uses))
    assert.match(s.uses, /@[a-f0-9]{40}$/);
  const upload = steps.find((s) =>
    s.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.equal(upload.if, "always()");
  assert.equal(upload.with["retention-days"], 7);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "author-workflow-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selected = path.join(root, "dist-plugin");
  writePackageFixture(
    selected,
    {
      name: "workflow-fixture",
      version: "1.0.0",
      type: "module",
      main: "index.js",
      dsh: {},
    },
    "export function apply(ctx){ ctx.noSuchService.missing(); }",
  );
  const step = steps.find((s) => s.id === "scan");
  const env = {
    ...process.env,
    TOOL_DIR: path.resolve(new URL("..", import.meta.url).pathname),
    SELECTED_PACKAGE: selected,
    RESULTS_DIR: path.join(root, "results"),
  };
  const r = spawnSync("bash", ["-e", "-c", step.run], {
    cwd: root,
    env,
    encoding: "utf8",
  });
  assert.equal(r.status, 1, r.stderr);
  const m = JSON.parse(
    fs.readFileSync(path.join(env.RESULTS_DIR, "compatibility.json"), "utf8"),
  );
  assert.equal(m.gate.exitCode, r.status);
  assert.match(
    fs.readFileSync(path.join(env.RESULTS_DIR, "compatibility.html"), "utf8"),
    /workflow-fixture/,
  );
  assert.equal(
    fs
      .readFileSync(path.join(env.RESULTS_DIR, "gate-exit-code.txt"), "utf8")
      .trim(),
    String(r.status),
  );
  assert.equal(
    fs.readFileSync(path.join(env.RESULTS_DIR, "scan.stderr.log"), "utf8"),
    "",
  );
  assert.equal(
    fs.readFileSync(path.join(env.RESULTS_DIR, "render.stderr.log"), "utf8"),
    "",
  );
});

test("failed workflow scan archives the same tool error in JSON and HTML and exits 3", (t) => {
  const workflow = YAML.parse(
    fs.readFileSync(
      new URL("../examples/author-ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "author-workflow-error-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    TOOL_DIR: path.resolve("."),
    SELECTED_PACKAGE: path.join(root, "missing-package"),
    RESULTS_DIR: path.join(root, "results"),
  };
  const step = workflow.jobs.compatibility.steps.find((s) => s.id === "scan");
  const result = spawnSync("bash", ["-e", "-c", step.run], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 15000,
  });
  assert.equal(result.status, 3, result.stderr);
  const json = JSON.parse(
    fs.readFileSync(path.join(env.RESULTS_DIR, "compatibility.json"), "utf8"),
  );
  const html = fs.readFileSync(
    path.join(env.RESULTS_DIR, "compatibility.html"),
    "utf8",
  );
  const evidence = html
    .match(/<pre id="evidence">([\s\S]*?)<\/pre>/)[1]
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  assert.deepEqual(JSON.parse(evidence), json);
  assert.equal(json.gate.exitCode, 3);
  assert.equal(json.cells.length, 0);
  assert.equal(
    fs
      .readFileSync(path.join(env.RESULTS_DIR, "gate-exit-code.txt"), "utf8")
      .trim(),
    "3",
  );
  for (const name of ["scan.stderr.log", "render.stderr.log"])
    assert.equal(fs.readFileSync(path.join(env.RESULTS_DIR, name), "utf8"), "");
});
