/** Plugin-only presentation locale. Canonical reports, identities and user text stay unchanged. */
import zh from "./zh.json" with { type: "json" };
import en from "./en.json" with { type: "json" };
import ko from "./ko.json" with { type: "json" };
export const messages = { zh, en, ko };
// Source dictionaries use readable gettext keys; builds replace repeated keys with compact IDs.
const messageIds = new Map(
  Object.entries(zh).map(([key, value]) => [value, key]),
);
const supported = ["auto", "zh", "en", "ko"];
const STORAGE_KEY = "dsh-plugin-compat-check.ui-language.v1";
const normalized = (value) =>
  String(value || "")
    .toLowerCase()
    .split(/[-_]/)[0];
export function formatMessage(text, params = {}) {
  return text.replace(/\{(p\d+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(params, key)
      ? String(params[key])
      : match,
  );
}
export function createLocaleStore({
  language = () => "",
  browserLanguages = () => [],
  storage,
  observe,
} = {}) {
  const read = () => {
    try {
      const value = storage?.getItem(STORAGE_KEY);
      return supported.includes(value) ? value : "auto";
    } catch {
      return "auto";
    }
  };
  let preference = read(),
    stop;
  const listeners = new Set();
  const hostLocale = () => {
    const hint = language() || browserLanguages().find(Boolean) || "zh";
    const value = normalized(hint);
    return Object.hasOwn(messages, value) ? value : "en";
  };
  const locale = () => (preference === "auto" ? hostLocale() : preference);
  let signature = `${preference}:${locale()}`;
  const refresh = (event) => {
    if (event?.storage) preference = read();
    const next = `${preference}:${locale()}`;
    if (next === signature) return;
    signature = next;
    for (const listener of [...listeners]) listener();
  };
  return {
    locale,
    hostLocale,
    preference: () => preference,
    setPreference(value) {
      if (!supported.includes(value)) throw Error("Unsupported UI language");
      preference = value;
      try {
        storage?.setItem(STORAGE_KEY, value);
      } catch {
        /* Memory-only preference remains usable. */
      }
      refresh();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) stop = observe?.(refresh);
      refresh();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = null;
        }
      };
    },
  };
}
const storage = {
  getItem: (key) =>
    globalThis.window ? globalThis.localStorage?.getItem(key) : undefined,
  setItem: (key, value) =>
    globalThis.window
      ? globalThis.localStorage?.setItem(key, value)
      : undefined,
};
export const localeStore = createLocaleStore({
  language: () => globalThis.document?.documentElement?.lang,
  browserLanguages: () =>
    globalThis.navigator?.languages ||
    [globalThis.navigator?.language].filter(Boolean),
  storage,
  observe: (refresh) => {
    const root = globalThis.document?.documentElement;
    const observer =
      root && typeof MutationObserver === "function"
        ? new MutationObserver(() => refresh())
        : null;
    observer?.observe(root, { attributes: true, attributeFilter: ["lang"] });
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY || event.key === null)
        refresh({ storage: true });
    };
    globalThis.addEventListener?.("languagechange", refresh);
    globalThis.addEventListener?.("storage", onStorage);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener?.("languagechange", refresh);
      globalThis.removeEventListener?.("storage", onStorage);
    };
  },
});
export const translate = (key, params, locale) =>
  formatMessage(
    messages[locale]?.[messageIds.get(key) ?? key] ??
      messages.en[messageIds.get(key) ?? key] ??
      key,
    params,
  );
export const t = (key, params) => translate(key, params, localeStore.locale());
/** Use only for known built-in labels/guidance, never for user-entered text or findings. */
export const builtin = (value) =>
  typeof value === "string" && messageIds.has(value) ? t(value) : value;

// Operation confirmations retain message identity so later locale changes can reformat them.
export const uiMessage = (key, params) => ({ uiMessage: true, key, params });
export const messageText = (value) =>
  value?.uiMessage === true ? t(value.key, value.params) : value;
