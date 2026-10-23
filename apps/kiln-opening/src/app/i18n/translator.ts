/**
 * The translator (UI_V1.6.1_ARCHITECTURE §6.1). Frozen after phase A.
 *
 * - Keys are `${namespace}.${key}`; each key's parameters are inferred from its English
 *   template(s). A key without placeholders takes no parameters.
 * - `t(key, params)` returns plain text (tag placeholders stripped), for `aria-label`, `title`
 *   and other attributes. `t.rich(key, params)` returns React nodes (`<b>` → `<strong>`).
 * - Plurals: an English `{ one, other }` entry is chosen with `Intl.PluralRules("en")` on the
 *   numeric `n` parameter. Chinese is always one string.
 * - Parameters are text: a string or a number (negative numbers use U+2212), a nested
 *   `RichMessage`, or a `Deferred` formatter that runs with this translator so it re-renders
 *   in the current language (ceramic descriptions, vocabulary names). `t.rich` also accepts
 *   React elements (icons, pieces). A parameter is never parsed as markup.
 * - Stored messages: `RichMessage` (`{ key, params }`) is what drafts, announcements and errors
 *   keep; it is formatted at render time with `t.message` / `t.richMessage`, so a language
 *   switch re-renders it.
 * - Fallback (§6.1): in strict mode (development and tests) a missing key, an empty Chinese
 *   string or a missing parameter throws. Otherwise the English text is used with a
 *   `console.warn`, and an unknown key renders as the key.
 */
import { isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { CATALOG } from "./index.ts";
import type { Catalog } from "./index.ts";
import type { EnEntry } from "./defineNamespace.ts";
import { parseTemplate, renderTokens, stripTags } from "./richText.tsx";

// ── Locale ────────────────────────────────────────────────────────────────────────────────

/** The two UI locales. `<html lang>` is `en` or `zh-Hans` (`htmlLang`). */
export type Locale = "en" | "zh-CN";

export const LOCALES: readonly Locale[] = ["en", "zh-CN"];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "zh-CN";
}

/** The BCP 47 tag for `<html lang>` and `lang` attributes. */
export function htmlLang(locale: Locale): "en" | "zh-Hans" {
  return locale === "zh-CN" ? "zh-Hans" : "en";
}

/** The rule-error locale of `src/game/ruleErrorText.ts`. */
export function ruleLocale(locale: Locale): "en" | "zh" {
  return locale === "zh-CN" ? "zh" : "en";
}

// ── Key and parameter types ───────────────────────────────────────────────────────────────

type NamespaceId = keyof Catalog;
type EnOf<N extends NamespaceId> = Catalog[N]["en"];

/** Every catalogue key, `${namespace}.${key}`. */
export type MessageKey = {
  [N in NamespaceId]: `${N}.${Extract<keyof EnOf<N>, string>}`;
}[NamespaceId];

type EntryOf<K extends string> = K extends `${infer N}.${infer Key}`
  ? N extends NamespaceId
    ? Key extends keyof EnOf<N>
      ? EnOf<N>[Key]
      : never
    : never
  : never;

/** Placeholder names in one template string. */
export type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;

type EntryPlaceholders<E> = E extends string
  ? Placeholders<E>
  : E extends { readonly one: infer O extends string; readonly other: infer X extends string }
    ? Placeholders<O> | Placeholders<X> | "n"
    : never;

type IsPlural<E> = E extends string ? false : true;

/** A formatter that runs with the current translator, so it follows the language. */
export type Deferred = (t: Translator) => string;

/**
 * A stored message: a key and its parameters, formatted when rendered.
 *
 * One object type, not a union with one member per key: with every package's catalogue filled
 * (well over 1,000 keys) a per-key union made TypeScript give up on any conditional or array
 * literal that mixed messages (TS2590, change request CR B2-5). Build messages with `msg()`,
 * which keeps the per-key parameter check; `t` and `t.rich` keep theirs too.
 */
export interface RichMessage {
  readonly key: MessageKey;
  readonly params?: Readonly<Record<string, MessageParam>> | undefined;
}

/** A plain-text parameter value. */
export type MessageParam = string | number | RichMessage | Deferred;

/** A `t.rich` parameter value: any plain parameter, or a React element. */
export type RichParam = MessageParam | ReactElement;

type ParamsFor<K extends MessageKey, V> = {
  readonly [P in EntryPlaceholders<EntryOf<K>>]: P extends "n"
    ? IsPlural<EntryOf<K>> extends true ? number : V
    : V;
};

type Args<K extends MessageKey, V> = [EntryPlaceholders<EntryOf<K>>] extends [never]
  ? [params?: Readonly<Record<string, never>>]
  : [params: ParamsFor<K, V>];

/** Parameters of a key, for callers that build them separately. */
export type MessageParams<K extends MessageKey> = ParamsFor<K, MessageParam>;

export interface Translator {
  readonly locale: Locale;
  /** Plain text (tags stripped). */
  <K extends MessageKey>(key: K, ...params: Args<K, MessageParam>): string;
  /** React nodes; `<b>` → `<strong>`, `<em>` → `<em>`. */
  rich<K extends MessageKey>(key: K, ...params: Args<K, RichParam>): ReactNode;
  /** Formats a stored message as plain text. */
  message(message: RichMessage): string;
  /** Formats a stored message as React nodes. */
  richMessage(message: RichMessage): ReactNode;
  /**
   * A key computed at runtime (for example `kiln.step.${n}.full`). Untyped: prefer `t()`.
   * Strict mode throws when the key is missing.
   */
  dynamic(key: string, params?: Readonly<Record<string, MessageParam>>): string;
  /** Whether the catalogue has this key. */
  has(key: string): boolean;
}

// ── Implementation ────────────────────────────────────────────────────────────────────────

/** Number formatting for parameters: tabular-ready digits, U+2212 for negatives. */
export function formatNumberParam(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return value < 0 ? `−${String(Math.abs(value))}` : String(value);
}

export interface TranslatorOptions {
  /** Throw on a missing key, empty Chinese string or missing parameter. Default: dev and tests. */
  strict?: boolean;
  /** Override for tests. */
  catalog?: Readonly<Record<string, { readonly en: Readonly<Record<string, EnEntry>>; readonly zh: Readonly<Record<string, string>> }>>;
  /** Warning sink for production fallbacks. Default `console.warn`. */
  warn?: (message: string) => void;
}

/** True in Vite development and in vitest; false in a production build. */
export function defaultStrict(): boolean {
  try {
    return import.meta.env.DEV !== false;
  } catch {
    return true;
  }
}

export class MissingTranslationError extends Error {
  override readonly name = "MissingTranslationError";
}

const PLURAL_EN = new Intl.PluralRules("en");

function isRichMessage(value: unknown): value is RichMessage {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && typeof (value as { key?: unknown }).key === "string" && !("$$typeof" in value);
}

export function createTranslator(locale: Locale, options: TranslatorOptions = {}): Translator {
  const strict = options.strict ?? defaultStrict();
  const catalog = options.catalog ?? (CATALOG as unknown as NonNullable<TranslatorOptions["catalog"]>);
  const warn = options.warn ?? ((message: string) => console.warn(message));

  function fail(message: string): void {
    if (strict) throw new MissingTranslationError(message);
    warn(`[i18n] ${message}`);
  }

  function lookup(key: string): { en: EnEntry; zh: string | undefined } | null {
    const dot = key.indexOf(".");
    if (dot <= 0) return null;
    const ns = catalog[key.slice(0, dot)];
    if (ns === undefined) return null;
    const name = key.slice(dot + 1);
    if (!Object.prototype.hasOwnProperty.call(ns.en, name)) return null;
    const en = ns.en[name];
    if (en === undefined) return null;
    return { en, zh: Object.prototype.hasOwnProperty.call(ns.zh, name) ? ns.zh[name] : undefined };
  }

  /** The template for this locale, after plural selection and fallbacks. */
  function template(key: string, params: Readonly<Record<string, unknown>> | undefined): string {
    const entry = lookup(key);
    if (entry === null) {
      fail(`missing key "${key}"`);
      return key;
    }
    const pickEn = (): string => {
      if (typeof entry.en === "string") return entry.en;
      const n = params?.["n"];
      if (typeof n !== "number") {
        fail(`plural key "${key}" needs a numeric n`);
        return entry.en.other;
      }
      return PLURAL_EN.select(n) === "one" ? entry.en.one : entry.en.other;
    };
    if (locale === "en") return pickEn();
    if (entry.zh === undefined || entry.zh.trim() === "") {
      fail(`empty Chinese text for "${key}"`);
      return pickEn();
    }
    return entry.zh;
  }

  function plainParam(key: string, name: string, value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return formatNumberParam(value);
    if (typeof value === "function") return (value as Deferred)(t);
    if (isRichMessage(value)) return t.message(value);
    fail(`missing parameter "${name}" for "${key}"`);
    return "";
  }

  function format(key: string, params: Readonly<Record<string, unknown>> | undefined): string {
    const tokens = parseTemplate(stripTags(template(key, params)));
    return tokens.map((token) => {
      if (token.kind === "text") return token.text;
      if (token.kind === "param") return plainParam(key, token.name, params?.[token.name]);
      return "";
    }).join("");
  }

  function formatRich(key: string, params: Readonly<Record<string, unknown>> | undefined): ReactNode {
    const tokens = parseTemplate(template(key, params));
    return renderTokens(tokens, (name) => {
      const value = params?.[name];
      if (isRichMessage(value)) return t.richMessage(value);
      if (isValidElement(value)) return value;
      return plainParam(key, name, value);
    });
  }

  const t = ((key: string, params?: Readonly<Record<string, unknown>>) => format(key, params)) as Translator;
  Object.defineProperties(t, {
    locale: { value: locale, enumerable: true },
    rich: { value: (key: string, params?: Readonly<Record<string, unknown>>) => formatRich(key, params) },
    message: { value: (message: RichMessage) => format(message.key, message.params as Readonly<Record<string, unknown>> | undefined) },
    richMessage: { value: (message: RichMessage) => formatRich(message.key, message.params as Readonly<Record<string, unknown>> | undefined) },
    dynamic: { value: (key: string, params?: Readonly<Record<string, MessageParam>>) => format(key, params) },
    has: { value: (key: string) => lookup(key) !== null },
  });
  return t;
}

const SHARED = new Map<Locale, Translator>();

/**
 * A shared default translator for a locale (or the given translator itself), for plain
 * functions such as `orderQualityLine` and `ceramicLabel` that take a locale.
 */
export function translatorFor(locale: Locale | Translator): Translator {
  if (typeof locale === "function") return locale;
  let t = SHARED.get(locale);
  if (t === undefined) {
    t = createTranslator(locale);
    SHARED.set(locale, t);
  }
  return t;
}

/** Builds a `RichMessage` with checked parameters (the identity at runtime). */
export function msg<K extends MessageKey>(key: K, ...params: Args<K, MessageParam>): RichMessage {
  const [values] = params;
  return (values === undefined ? { key } : { key, params: values }) as unknown as RichMessage;
}
