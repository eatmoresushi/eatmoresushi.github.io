/**
 * Typed, ID-keyed i18n namespaces (UI_V1.6.1_ARCHITECTURE §6.1, K7).
 *
 * One namespace file per work package lives in `catalog/`. Each declares its English entries
 * and its Simplified Chinese strings with exactly the same keys: a missing or extra Chinese key
 * fails `typecheck`. An English entry is either a template string or a `{ one, other }` pair
 * chosen with `Intl.PluralRules("en")` on the `n` parameter. Chinese has no plural forms, so it
 * is always one string.
 *
 * Templates:
 * - `{name}` placeholders; their names are inferred from the English template(s), and the
 *   catalogue test requires the Chinese string to use the same set.
 * - only the tag placeholders `<b>…</b>` and `<em>…</em>` (rendered by `t.rich`); never HTML.
 * - no literal rule numbers (except the sourced `locationSummary` namespace): numbers arrive
 *   as placeholders (§5 gap 19).
 */

/** An English catalogue entry: a template, or plural forms selected on `{n}`. */
export type EnEntry = string | { readonly one: string; readonly other: string };

/** A namespace: English entries plus one Chinese string per English key. */
export interface Namespace<E extends Readonly<Record<string, EnEntry>>> {
  readonly en: E;
  readonly zh: { readonly [K in keyof E]: string };
}

/**
 * Declares a namespace. The `const` type parameter keeps every English template as a literal
 * type, so `t()` can infer each key's parameters from it.
 */
export function defineNamespace<const E extends Readonly<Record<string, EnEntry>>>(ns: {
  en: E;
  zh: { [K in keyof E]: string };
}): Namespace<E> {
  return ns;
}
