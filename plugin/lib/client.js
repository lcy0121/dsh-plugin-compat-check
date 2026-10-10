// Client half of the dsh-plugin-compat-check plugin skeleton.
//
// This file is a PREBUILT artifact: the host does not build plugin client code.
// When the bundle is missing the entry fails to activate with
// "run pnpm build before launch" (Plan.md §7.3), so nothing here may move to src/.
//
// Contract (Plan.md §7.3, verified on 0.2.0-rc.2):
//   window.__ModuleLoader__.load({ id: "<package name>", factory })
//   factory(require) -> { name, inject: ["slots"], apply(ctx) }
// `inject` lists OTHER CLIENT PLUGIN PACKAGES, not service names.
//
// This revision only proves the channel works: it registers one placeholder
// component into the settings -> plugins tab.

window.__ModuleLoader__.load({
  id: "dsh-plugin-compat-check",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    const SLOT = "settings.plugins.tab";
    const LABEL = "compat-check";
    const BODY = "compat-check 占位";

    // Render-side marker, so the CDP check can confirm the DOM text came from
    // this component rather than from anything that merely shares its wording.
    const Placeholder = function Placeholder() {
      try {
        window.__COMPAT_CHECK__ = {
          slot: SLOT,
          label: LABEL,
          body: BODY,
          renders: ((window.__COMPAT_CHECK__ || {}).renders || 0) + 1,
          at: Date.now(),
        };
      } catch (error) {
        // Never let diagnostics break rendering.
      }
      return React.createElement(
        "div",
        {
          "data-compat-check": "settings.plugins.tab",
          style: {
            padding: "8px 12px",
            border: "1px dashed #f59e0b",
            borderRadius: "6px",
            font: "12px ui-monospace, monospace",
          },
        },
        BODY,
      );
    };

    function apply(ctx) {
      console.log("[dsh-plugin-compat-check] CLIENT-HALF-APPLIED");
      try {
        ctx.slots.inject(SLOT, () =>
          ctx.slots.register(
            { name: SLOT, id: "dsh-plugin-compat-check", order: 1, label: LABEL },
            Placeholder,
          ),
        );
        console.log("[dsh-plugin-compat-check] REGISTERED " + SLOT);
      } catch (error) {
        // Registration failure must not take down the client boot either.
        console.warn("[dsh-plugin-compat-check] REGISTER-THREW " + String(error));
      }
    }

    exports.name = "dsh-plugin-compat-check";
    exports.apply = apply;
    exports.inject = ["slots"];
    return module.exports;
  },
});
