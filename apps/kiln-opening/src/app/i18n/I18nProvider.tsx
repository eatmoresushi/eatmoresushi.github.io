/**
 * Locale state and the `useT()` hook (UI_V1.6.1_ARCHITECTURE §6.1).
 *
 * - The preference lives under the V1.4 key `kiln-opening:language` (`"en"` / `"zh-CN"`), so it
 *   survives the cutover. On a first visit the first `navigator.languages` entry starting with
 *   `zh` selects `zh-CN`; otherwise `en`.
 * - Every storage call is wrapped in `try`/`catch` (§3.2).
 * - The provider is controlled (`locale`) or uncontrolled (`defaultLocale`, else the stored or
 *   detected locale). Changing the locale keeps everything else: drafts, errors and
 *   announcements are stored as codes and re-render in the new language.
 * - On the client the provider keeps `<html lang>` in step (`en` / `zh-Hans`); SSR renders
 *   never touch `document`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createTranslator, htmlLang, isLocale } from "./translator.ts";
import type { Locale, Translator } from "./translator.ts";

export const LOCALE_STORAGE_KEY = "kiln-opening:language";

/** Browser storage, or null outside a browser (SSR, node tests). */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredLocale(): Locale | null {
  try {
    const value = storage()?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(value) ? value : null;
  } catch {
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    storage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage may be blocked (private mode, quota); the choice still applies to this page.
  }
}

/** The stored preference, else the browser's first language, else English. */
export function detectLocale(languages?: readonly string[]): Locale {
  const stored = readStoredLocale();
  if (stored !== null) return stored;
  let list: readonly string[] = languages ?? [];
  if (languages === undefined) {
    try {
      list = typeof navigator === "undefined" ? [] : navigator.languages;
    } catch {
      list = [];
    }
  }
  const first = list[0];
  return first !== undefined && first.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Sets `<html lang>` for the locale. A no-op without a document (SSR, node tests). */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = htmlLang(locale);
}

interface I18nContextValue {
  t: Translator;
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
  /** Controlled locale. When set, `setLocale` only calls `onLocaleChange`. */
  locale?: Locale;
  /** Uncontrolled initial locale; default: stored, then detected. */
  defaultLocale?: Locale;
  onLocaleChange?: (locale: Locale) => void;
  /** Translator strictness; default: development and tests throw on a missing key (§6.1). */
  strict?: boolean;
  children?: ReactNode;
}

export function I18nProvider({ locale, defaultLocale, onLocaleChange, strict, children }: I18nProviderProps) {
  const [own, setOwn] = useState<Locale>(() => locale ?? defaultLocale ?? detectLocale());
  const current = locale ?? own;
  const t = useMemo(() => createTranslator(current, strict === undefined ? {} : { strict }), [current, strict]);
  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    if (locale === undefined) setOwn(next);
    onLocaleChange?.(next);
  }, [locale, onLocaleChange]);
  useEffect(() => applyDocumentLocale(current), [current]);
  const value = useMemo(() => ({ t, locale: current, setLocale }), [t, current, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18nContext(): I18nContextValue {
  const value = useContext(I18nContext);
  if (value === null) throw new Error("useT() and useLocale() need an <I18nProvider> above them.");
  return value;
}

/** The translator for the current locale. */
export function useT(): Translator {
  return useI18nContext().t;
}

/** The surrounding provider's locale, or null without a provider (dev pages that may stand alone). */
export function useOptionalLocale(): Locale | null {
  return useContext(I18nContext)?.locale ?? null;
}

/** The current locale and its setter (the `LanguageToggle`). */
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void } {
  const { locale, setLocale } = useI18nContext();
  return { locale, setLocale };
}
