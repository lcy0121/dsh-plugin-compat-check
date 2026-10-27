import * as React from "react";
import { localeStore, t } from "./runtime.mjs";
export function useLocale() {
  const [, render] = React.useState(0);
  React.useEffect(() => localeStore.subscribe(() => render((x) => x + 1)), []);
  return localeStore.locale();
}
export function LanguageSelect() {
  useLocale();
  return (
    <label
      className="compat-language"
      title={t("原始诊断与证据保留原文；切换语言不会改变报告或人工依据。")}
    >
      <span>{t("界面语言")}</span>
      <select
        data-slot="native-select"
        data-ui-language=""
        aria-label={t("界面语言")}
        value={localeStore.preference()}
        onChange={(event) => localeStore.setPreference(event.target.value)}
      >
        <option value="auto">{t("跟随宿主")}</option>
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="ko">한국어</option>
      </select>
    </label>
  );
}
