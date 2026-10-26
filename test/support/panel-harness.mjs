/** Run the shipped client factory and its event handlers with persistent hooks. */
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
export async function panelHarness(
  data,
  { clipboard, subject, fetcher, timers } = {},
) {
  const stores = new Map(),
    effects = [],
    cleanups = [];
  let frame, loaded, tree;
  const React = {
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children: children.length
        ? children
        : props?.children === undefined
          ? []
          : [props.children],
    }),
    useState(initial) {
      const i = frame.i++,
        s = frame.store;
      if (!(i in s)) s[i] = typeof initial === "function" ? initial() : initial;
      return [
        s[i],
        (v) => {
          s[i] = typeof v === "function" ? v(s[i]) : v;
        },
      ];
    },
    useRef(initial) {
      const i = frame.i++,
        s = frame.store;
      return s[i] ?? (s[i] = { current: initial });
    },
    useCallback(fn, deps) {
      const i = frame.i++,
        s = frame.store;
      if (!s[i] || deps.some((x, j) => x !== s[i].deps[j])) s[i] = { fn, deps };
      return s[i].fn;
    },
    useEffect(fn, deps) {
      const i = frame.i++,
        s = frame.store;
      if (!s[i] || !deps || deps.some((x, j) => x !== s[i][j])) {
        s[i] = deps;
        effects.push(fn);
      }
    },
  };
  const win = {
    __ModuleLoader__: {
      load: (m) => {
        loaded = m;
      },
    },
  };
  vm.runInNewContext(
    fs.readFileSync(
      new URL("../../plugin/lib/client.js", import.meta.url),
      "utf8",
    ),
    {
      window: win,
      navigator: { clipboard },
      crypto: webcrypto,
      TextEncoder,
      console,
      fetch:
        fetcher ||
        (async () => ({
          ok: true,
          json: async () => JSON.parse(JSON.stringify(data)),
        })),
      setTimeout:
        timers?.setTimeout ||
        ((fn, ms) => {
          const timer = setTimeout(fn, ms);
          timer.unref?.();
          return timer;
        }),
      clearTimeout: timers?.clearTimeout || clearTimeout,
    },
  );
  const components = {};
  loaded
    .factory((n) => (n === "react" ? React : {}))
    .apply({
      slots: {
        inject: (_s, cb) => cb(),
        register: (spec, Comp) => {
          components[spec.name] = Comp;
        },
      },
    });
  function walk(el, key = "root") {
    if (el == null || typeof el === "boolean") return null;
    if (Array.isArray(el)) return el.map((v, i) => walk(v, key + "." + i));
    if (typeof el !== "object") return String(el);
    if (typeof el.type === "function") {
      const saved = frame;
      frame = { store: stores.get(key) || [], i: 0 };
      stores.set(key, frame.store);
      const out = el.type({ ...el.props, children: el.children });
      frame = saved;
      return walk(out, key + ".component");
    }
    return {
      ...el,
      children: el.children.map((v, i) => walk(v, key + "." + i)),
    };
  }
  function render() {
    tree = walk(
      React.createElement(
        components[subject ? "plugins.detail.section" : "settings.plugins.tab"],
        subject ? { subject: { kind: "package", pkg: { name: subject } } } : {},
      ),
    );
    const pending = effects.splice(0);
    for (const fn of pending) {
      const off = fn();
      if (typeof off === "function") cleanups.push(off);
    }
    return tree;
  }
  function nodes(el = tree) {
    if (el == null || typeof el !== "object") return [];
    if (Array.isArray(el)) return el.flatMap(nodes);
    return [el, ...el.children.flatMap(nodes)];
  }
  const text = (el = tree) =>
    el == null
      ? ""
      : Array.isArray(el)
        ? el.map(text).join(" ")
        : typeof el === "object"
          ? el.children.map(text).join(" ")
          : String(el);
  async function settle() {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      render();
    }
  }
  render();
  await settle();
  return {
    render,
    settle,
    dispose: () => {
      for (const off of cleanups.splice(0)) off();
    },
    text,
    nodes,
    find: (predicate) => nodes().find(predicate),
    button: (label) =>
      nodes().find((n) => n.type === "button" && text(n).trim() === label),
    field: (label) => nodes().find((n) => n.props["aria-label"] === label),
    rows: () =>
      nodes()
        .filter((n) => n.props["data-compat-plugin"])
        .map((n) => n.props["data-compat-plugin"]),
  };
}
