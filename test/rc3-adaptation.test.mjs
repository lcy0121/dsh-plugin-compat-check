import test from "node:test";
import assert from "node:assert/strict";
const acceptance = await import("../tools/acceptance-target.mjs").catch(
  () => ({}),
);

test("an explicit acceptance target must match the actual host; rc.3 cannot skip green", () => {
  assert.equal(typeof acceptance.acceptanceTarget, "function");
  assert.equal(acceptance.acceptanceTarget("0.2.1-rc.3", "0.2.1-rc.3"), true);
  assert.throws(
    () => acceptance.acceptanceTarget("0.2.1-rc.2", "0.2.1-rc.3"),
    /mismatch/,
  );
  assert.throws(
    () => acceptance.acceptanceTarget("0.2.1-rc.3", "latest"),
    /exact/,
  );
  assert.equal(acceptance.acceptanceTarget("0.2.0-rc.2"), false);
  assert.equal(acceptance.acceptanceTarget("0.2.1-rc.3"), true);
  assert.equal(typeof acceptance.assertBrowserAcceptance, "function");
  assert.throws(
    () => acceptance.assertBrowserAcceptance("0.2.1-rc.3", false, false),
    /browser/,
  );
  assert.throws(
    () => acceptance.assertBrowserAcceptance(undefined, true, false),
    /browser/,
  );
  assert.doesNotThrow(() =>
    acceptance.assertBrowserAcceptance(undefined, false, false),
  );
  assert.doesNotThrow(() =>
    acceptance.assertBrowserAcceptance("0.2.1-rc.3", false, true),
  );
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { packageFixture } from "./fixture-utils.mjs";
import { run } from "../bin/compat-check.mjs";
import vm from "node:vm";
import { verifyRc3Navigation } from "../tools/rc3-navigation.mjs";

// The external host/browser boundary is simulated here; the entire verifier
// executes unchanged. Real rc.3 acceptance separately checks these contracts.
function navigationHarness(fault) {
  let panel = null,
    selected,
    menu = -1,
    references = 0;
  const rows = {
    "rc3-navigation-seeded": {
      id: "rc3-navigation-seeded",
      blank: false,
      retainedBy: {},
    },
  };
  const shells = new Map();
  const prompts = [
    "创建一个带左侧栏入口的 DSH 插件。",
    "创建一个 DSH 会话视图插件。",
    "创建一个带右侧栏入口的 DSH 插件。",
  ];
  const shell = (id) => {
    if (!shells.has(id))
      shells.set(id, {
        snapshot: { draft: "", attachmentIds: [], phase: "plain" },
        draftSnapshot: { text: "", references: [] },
        setDraft(value) {
          this.draftSnapshot =
            typeof value === "string"
              ? { text: value, references: [] }
              : structuredClone(value);
          this.snapshot.draft = this.draftSnapshot.text;
        },
        addAttachments(ids) {
          this.snapshot.attachmentIds.push(...ids);
          return true;
        },
        removeAttachment(id) {
          this.snapshot.attachmentIds = this.snapshot.attachmentIds.filter(
            (value) => value !== id,
          );
        },
      });
    return shells.get(id);
  };
  const open = (id) => {
    selected = id;
    panel = null;
    rows[id] ||= { id, blank: true, retainedBy: {} };
    for (const row of Object.values(rows))
      row.retainedBy = { mainView: row.id === id ? 1 : 0 };
  };
  const connect = (w, options) => {
    const id =
      w === "seeded-workspace"
        ? "creator"
        : options?.agentPreset === "ptc" ||
            (!options && fault === "default-ptc")
          ? "second"
          : "first";
    rows[id] ||= { id, blank: true, retainedBy: {} };
    return Promise.resolve(id);
  };
  const attachments = [{ id: "owned-image", kind: "image" }];
  const ctx = {
    workspaces: {
      create: async () => ({ workspaceId: "owned-workspace" }),
      list: {
        getSnapshot: () => ({
          items: [
            {
              workspaceId: "seeded-workspace",
              sessionIds: ["rc3-navigation-seeded"],
            },
          ],
        }),
      },
    },
    sessions: {
      retain: () => {
        references++;
        return {
          ready:
            fault === "retain-not-ready"
              ? Promise.reject(Error("Creator target readiness failed"))
              : Promise.resolve(),
          release() {
            references--;
          },
        };
      },
      list: { getSnapshot: () => ({ byId: rows }) },
    },
    layout: {
      selectPanel(value) {
        panel = value;
      },
      panelInfo: { getSnapshot: () => ({ activePanelId: panel }) },
    },
    conversation: {
      input: { shell },
      createDrafts: () => attachments,
      resolveDraftAttachments: () => attachments,
    },
    uiWorkspace: {
      connectWorkspace: connect,
      async openWorkspace(w, _, options) {
        open(await connect(w, options));
      },
      openSession: open,
      async startSession(w, options) {
        if (!options && fault === "new-session-noop") return;
        const id = await connect(
          w ||
            (["rc3-navigation-seeded", "creator"].includes(selected)
              ? "seeded-workspace"
              : "owned-workspace"),
          options,
        );
        const s = shell(id);
        if (options?.prompt !== undefined) {
          const policy =
            options.whenDraftExists ||
            (options.clearPreviousDraft ? "replace" : "keep");
          if (!s.snapshot.draft || policy === "replace")
            s.setDraft(options.prompt);
          else if (policy === "append") {
            s.snapshot.draft += "\n" + options.prompt;
            s.draftSnapshot.text = s.snapshot.draft;
          }
        }
        open(fault === "new-session-wrong-target" && !options ? "second" : id);
      },
    },
    pluginNavigation: {
      openBundle() {
        panel = "plugins";
      },
    },
  };
  const buttons = prompts.map((_, i) => ({
    click() {
      menu = i;
    },
  }));
  const menuItems = () =>
    menu < 0
      ? []
      : [
          {
            innerText: "浏览更多插件",
            click() {
              panel =
                fault === "browse-noop"
                  ? null
                  : fault === "browse-wrong-panel"
                    ? "settings"
                    : "plugins";
              menu = -1;
            },
          },
          {
            innerText: "创建你的插件",
            async click() {
              const i = menu;
              menu = -1;
              if (fault === `create-noop-${i}`) return;
              await ctx.uiWorkspace.startSession(undefined, {
                agentPreset: "cordis",
                prompt:
                  fault === `create-wrong-prompt-${i}`
                    ? prompts[(i + 1) % 3]
                    : prompts[i],
                whenDraftExists: "append",
              });
              if (fault === "create-wrong-target") open("second");
              if (fault === "drop-references")
                shell("creator").draftSnapshot.references = [];
              if (fault === "drop-attachments")
                shell("creator").snapshot.attachmentIds = [];
              if (fault === "submitted-turn") rows.creator.blank = false;
            },
          },
        ];
  const document = {
    body: { innerText: "stale dsh-plugin-compat-check text" },
    querySelectorAll(selector) {
      if (selector === '[role="menuitem"]') return menuItems();
      if (selector.includes("查看 dsh-plugin-compat-check"))
        return [{ getClientRects: () => (panel === "plugins" ? [1] : []) }];
      const i = selector.includes("全局面板")
        ? 0
        : selector.includes("更多会话视图")
          ? 1
          : selector.includes("更多工具")
            ? 2
            : -1;
      return i < 0 ? [] : [buttons[i]];
    },
    querySelector(selector) {
      if (selector.includes("data-compat-detail"))
        return panel === "plugins" ? {} : null;
      if (selector.includes("查看 dsh-plugin-compat-check"))
        return { getClientRects: () => (panel === "plugins" ? [1] : []) };
      if (selector.includes("打开右侧边栏")) return { click() {} };
      return this.querySelectorAll(selector)[0] || null;
    },
  };
  const window = { __DSC_RC3__: ctx };
  const context = vm.createContext({
    window,
    document,
    File: class {},
    Uint8Array,
    atob: () => "image",
  });
  const evaluate = async (source) => vm.runInContext(source, context);
  const poll = async (predicate, message) => {
    for (let i = 0; i < 8; i++) {
      if (await predicate()) return;
      await new Promise((resolve) => setImmediate(resolve));
    }
    throw Error(message);
  };
  return {
    evaluate,
    poll,
    selected: () => selected,
    activePanel: () => panel,
    references: () => references,
  };
}

for (const fault of [
  "new-session-noop",
  "new-session-wrong-target",
  "browse-noop",
  "browse-wrong-panel",
  "create-noop-0",
  "create-noop-1",
  "create-noop-2",
  "create-wrong-prompt-0",
  "create-wrong-prompt-1",
  "create-wrong-prompt-2",
  "create-wrong-target",
  "drop-references",
  "drop-attachments",
  "submitted-turn",
  "retain-not-ready",
]) {
  test(`rc.3 navigation refuses false green: ${fault}`, async () => {
    const h = navigationHarness(fault);
    await assert.rejects(
      verifyRc3Navigation(h.evaluate, h.poll, "/owned-workspace"),
      /New Session|Plugins main list|Creator/,
    );
    assert.equal(
      h.references(),
      0,
      "failed acceptance must release its owned target",
    );
  });
}
for (const preference of [undefined, "default-ptc"])
  test(`rc.3 navigation exercises all creators; default blank=${preference || "cordis"}`, async () => {
    const h = navigationHarness(preference);
    const receipt = await verifyRc3Navigation(
      h.evaluate,
      h.poll,
      "/owned-workspace",
    );
    assert.equal(h.selected(), "creator");
    assert.equal(receipt.menus.length, 3);
    assert(
      receipt.menus.every(
        (m) =>
          m.createDraftOnly && m.referencesPreserved && m.attachmentsPreserved,
      ),
    );
    assert.equal(receipt.newSessionSelected, true);
    assert.equal(
      h.activePanel(),
      null,
      "return to Conversation before later settings checks",
    );
    assert.equal(h.references(), 0);
  });

for (const version of [
  "0.2.0-rc.2",
  "0.2.1-rc.2",
  "0.2.1-rc.3",
  "0.2.1-rc.5",
]) {
  for (const [label, client, entry, ok] of [
    ["string", "./bundle.js", "./bundle.js", true],
    [
      "default beats missing browser",
      { browser: "./missing.js", default: "./bundle.js" },
      "./bundle.js",
      true,
    ],
    [
      "default beats existing browser/import",
      { browser: "./other.js", import: "./other.js", default: "./bundle.js" },
      "./bundle.js",
      true,
    ],
    [
      "missing default target",
      { browser: "./other.js", default: "./missing.js" },
      "./missing.js",
      false,
    ],
    ["browser only", { browser: "./other.js" }, null, false],
    ["import only", { import: "./other.js" }, null, false],
    ["nested default", { default: { import: "./bundle.js" } }, null, false],
    ["array", ["./bundle.js"], null, false],
    ["directory is not an entry", "./dir", "./dir", false],
    ["no extension fallback", "./bundle", "./bundle", false],
  ]) {
    test(`${version} client loader: ${label}`, () => {
      const f = packageFixture("export function apply(){}", {
        meta: {
          exports: { ".": "./index.js", "./client": client },
          dsh: { client: { platform: "web" } },
        },
        files: {
          "bundle.js":
            "export function apply(ctx){ctx.slots.register({name:'actual'})}",
          "other.js": "export function apply(ctx){ctx.locale.define('wrong')}",
          "dir/index.js": "export function apply(){}",
        },
      });
      try {
        const result = run({
          nm: f.nm,
          dshVersion: version,
          baseline: false,
          _ignoreAutoProbe: true,
        });
        assert.equal(result.error, null);
        const p = result.extract.report.perPlugin.sample;
        assert.equal(p.clientHalf.ok, ok);
        assert.equal(p.clientHalf.declaredEntry, entry);
        assert.equal(p.declaredClientEntry, entry);
        assert.equal(
          result.extract.provenance.packages.sample.declaredClientEntry,
          entry,
        );
        if (entry === null) {
          assert.equal(
            result.verdict.plugins.sample.coverage.status,
            "limited",
          );
          assert(
            result.verdict.plugins.sample.coverage.limitations.some((s) =>
              s.includes("客户端入口"),
            ),
          );
        }
        assert.deepEqual(p.files["client-entry"], ok ? ["bundle.js"] : []);
        assert.equal(
          result.verdict.plugins.sample.findings.some(
            (f) => f.category === "client-entry-missing",
          ),
          !ok,
        );
        if (ok) {
          assert(
            p.callSites.some(
              (s) => s.file === "bundle.js" && s.service === "slots",
            ),
          );
          assert(!p.callSites.some((s) => s.file === "other.js"));
        }
      } finally {
        f.cleanup();
      }
    });
  }
}

test("explicit rc.3 real runner refuses a mismatched executable without applicable:false success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dsc-runtime-mismatch-"));
  try {
    fs.writeFileSync(path.join(dir, "dsh"), "#!/bin/sh\necho 0.2.1-rc.2\n", {
      mode: 0o700,
    });
    const r = spawnSync(process.execPath, ["tools/rc2-live.mjs"], {
      env: {
        ...process.env,
        PATH: dir + path.delimiter + process.env.PATH,
        DSC_ACCEPTANCE_DSH_VERSION: "0.2.1-rc.3",
        DEEPSEEK_API_KEY: "test-must-not-inherit",
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    const value = JSON.parse(r.stdout);
    assert.equal(value.ok, false);
    assert.match(value.error, /mismatch/);
    assert.equal(value.cleanup.privateRootRemoved, true);
    assert(!r.stdout.includes("test-must-not-inherit"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
