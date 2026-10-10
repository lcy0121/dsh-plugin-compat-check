window.__ModuleLoader__.load({
  id: "compat-slot-probe",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");

    const KEYS = [
      "settings.plugins.tab", "settings.section", "settings.general.item",
      "plugins.detail.section", "plugins.detail.badge", "plugins.detail.actions",
      "plugins.item", "plugins.row.config", "plugins.bundle.config", "plugins.bundle.activation",
      "sidebar.right.pane.tab", "sidebar.right.pane.tab.title", "shell.overlay",
      "sidebar.footer.action", "conversation.session.header.utilities",
      "main", "sidebar.panellist"
    ];

    const mark = (slot, detail) => {
      const w = window;
      const prev = w.__COMPAT_PROBE__ || {};
      prev[slot] = { rendered: true, detail: detail, at: Date.now() };
      w.__COMPAT_PROBE__ = prev;
      console.log("[compat-slot-probe] RENDERED " + slot);
    };
    const make = (slot, detail) => function Probe() {
      mark(slot, detail);
      return React.createElement("div",
        { "data-compat-probe": slot,
          style: { padding: "6px 10px", border: "1px dashed #f59e0b", borderRadius: "6px",
                   font: "12px ui-monospace, monospace", whiteSpace: "nowrap" } },
        "COMPAT-PROBE " + detail);
    };

    let slotsRef = null;
    function diag() {
      const out = {};
      for (const key of KEYS) {
        const row = { declared: false, entries: 0 };
        try {
          const spec = slotsRef && slotsRef.spec ? slotsRef.spec(key) : undefined;
          row.declared = !!spec;
          if (spec && typeof spec === "object") {
            row.kind = spec.kind; row.scope = spec.scope; row.replaceRisk = spec.replaceRisk;
            row.declaredBy = spec.declaredBy || (spec.owner && String(spec.owner)) || undefined;
          }
        } catch (error) { row.specError = String(error).slice(0, 120); }
        try {
          if (slotsRef && typeof slotsRef.entries === "function") {
            const list = slotsRef.entries(key);
            row.entries = Array.isArray(list) ? list.length : (list ? 1 : 0);
          }
        } catch (error) { row.entriesError = String(error).slice(0, 120); }
        out[key] = row;
      }
      out.__hasSpec = !!(slotsRef && slotsRef.spec);
      out.__hasEntries = !!(slotsRef && typeof slotsRef.entries === "function");
      out.__hasEntriesOfSlot = !!(slotsRef && typeof slotsRef.entriesOfSlot === "function");
      out.__api = slotsRef ? Object.getOwnPropertyNames(Object.getPrototypeOf(slotsRef)).sort() : null;
      window.__COMPAT_SLOTSPEC__ = out;
      console.log("[compat-slot-probe] DIAG " + JSON.stringify(out));
    }

    const tryRegister = (ctx, slot, detail, extra) => {
      try {
        ctx.slots.inject(slot, () =>
          ctx.slots.register(
            Object.assign({ name: slot, id: "compat-probe-" + detail, order: 1, label: "COMPAT PROBE" }, extra || {}),
            make(slot, detail)));
        const w = window;
        w.__COMPAT_PROBE_INJECT__ = Object.assign(w.__COMPAT_PROBE_INJECT__ || {}, { [slot]: "ok" });
        console.log("[compat-slot-probe] INJECT-CALLED " + slot);
      } catch (error) {
        const w = window;
        w.__COMPAT_PROBE_INJECT__ = Object.assign(w.__COMPAT_PROBE_INJECT__ || {}, { [slot]: "THREW " + String(error) });
        console.warn("[compat-slot-probe] INJECT-THREW " + slot + " :: " + String(error));
      }
    };

    function apply(ctx) {
      slotsRef = ctx.slots;
      console.log("[compat-slot-probe] CLIENT-HALF-APPLIED");
      tryRegister(ctx, "sidebar.footer.action", "control");
      tryRegister(ctx, "settings.section", "fallback");
      tryRegister(ctx, "settings.plugins.tab", "target");
      tryRegister(ctx, "plugins.detail.section", "detail");
      tryRegister(ctx, "plugins.detail.badge", "badge");
      tryRegister(ctx, "plugins.detail.actions", "actions");
      tryRegister(ctx, "plugins.bundle.activation", "bundleact", { key: "compat-probe-bundle" });
      tryRegister(ctx, "plugins.item", "item", { key: "compat-probe-item" });
      tryRegister(ctx, "plugins.row.config", "rowcfg", { key: "compat-probe-row" });
      tryRegister(ctx, "plugins.bundle.config", "bundlecfg", { key: "compat-probe-bundle" });
      diag();
      [3000, 8000, 15000].forEach(ms => setTimeout(diag, ms));
    }
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  }
});
