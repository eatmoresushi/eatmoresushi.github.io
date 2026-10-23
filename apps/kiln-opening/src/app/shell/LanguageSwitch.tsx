/**
 * LanguageSwitch (UI_V1.6.1_ARCHITECTURE §1.5, §4.1, §6.1). Owner: B1 (shell, log, lobby).
 *
 * The top bar's compact, always-visible language control: one button that shows the other
 * language in its own script (`中文` while English is shown, `EN` while Chinese is shown) and
 * switches to it. Its accessible name is that language ("中文", "English"), spoken in it (`lang`),
 * as the kit toggle's options are. It is the same element in both languages, so focus
 * stays on it after a switch. Switching keeps drafts, selections and state: only the locale
 * changes (as the kit `LanguageToggle`, which the lobby frame keeps).
 *
 * Local to the shell until B6 decides whether the kit takes a compact variant (CR B1-5).
 */
import { useLocale, useT } from "../i18n/I18nProvider.tsx";
import { htmlLang } from "../i18n/translator.ts";
import type { Locale } from "../i18n/translator.ts";

const OTHER: Readonly<Record<Locale, { locale: Locale; short: "common.language.short.en" | "common.language.short.zh"; full: "common.language.en" | "common.language.zh" }>> = {
  en: { locale: "zh-CN", short: "common.language.short.zh", full: "common.language.zh" },
  "zh-CN": { locale: "en", short: "common.language.short.en", full: "common.language.en" },
};

export function LanguageSwitch() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const other = OTHER[locale];
  return (
    <button
      type="button"
      className="language-switch"
      lang={htmlLang(other.locale)}
      aria-label={t(other.full)}
      onClick={() => setLocale(other.locale)}
    >
      {t(other.short)}
    </button>
  );
}
