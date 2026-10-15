/**
 * LanguageToggle (kit, §1.5, §6.1): the always-visible `EN / 中文` control. Each option names
 * itself in its own language (`lang` attribute). Switching keeps drafts, selections and state:
 * only the locale changes, and stored messages re-render in the new language.
 */
import { useLocale, useT } from "../i18n/I18nProvider.tsx";
import { htmlLang } from "../i18n/translator.ts";
import type { Locale } from "../i18n/translator.ts";
import "./Toggles.css";

const OPTIONS: ReadonlyArray<{ locale: Locale; short: "common.language.short.en" | "common.language.short.zh"; full: "common.language.en" | "common.language.zh" }> = [
  { locale: "en", short: "common.language.short.en", full: "common.language.en" },
  { locale: "zh-CN", short: "common.language.short.zh", full: "common.language.zh" },
];

export interface LanguageToggleProps {
  className?: string;
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div className={["kit-seg", className ?? ""].filter((part) => part !== "").join(" ")} role="group" aria-label={t("common.language.label")}>
      {OPTIONS.map((option) => (
        <button
          key={option.locale}
          type="button"
          className="kit-seg-btn"
          lang={htmlLang(option.locale)}
          aria-pressed={locale === option.locale}
          aria-label={t(option.full)}
          onClick={() => setLocale(option.locale)}
        >
          {t(option.short)}
        </button>
      ))}
    </div>
  );
}
