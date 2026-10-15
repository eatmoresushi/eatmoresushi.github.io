/**
 * Catalogue walker for the i18n tests (UI_V1.6.1_ARCHITECTURE §6.4). Owned by A3.
 */
import { CATALOG, SOURCED_NAMESPACES } from "../../../../src/app/i18n/index.ts";
import type { NamespaceId } from "../../../../src/app/i18n/index.ts";
import type { EnEntry } from "../../../../src/app/i18n/defineNamespace.ts";

export interface CatalogEntry {
  /** `${namespace}.${key}` */
  id: string;
  namespace: NamespaceId;
  key: string;
  /** One English template, or the plural forms. */
  en: string[];
  zh: string;
  plural: boolean;
  sourced: boolean;
}

export function catalogEntries(): CatalogEntry[] {
  const entries: CatalogEntry[] = [];
  for (const namespace of Object.keys(CATALOG) as NamespaceId[]) {
    const ns = CATALOG[namespace] as unknown as { en: Record<string, EnEntry>; zh: Record<string, string> };
    for (const key of Object.keys(ns.en)) {
      const en = ns.en[key];
      if (en === undefined) continue;
      entries.push({
        id: `${namespace}.${key}`,
        namespace,
        key,
        en: typeof en === "string" ? [en] : [en.one, en.other],
        zh: ns.zh[key] ?? "",
        plural: typeof en !== "string",
        sourced: SOURCED_NAMESPACES.has(namespace),
      });
    }
  }
  return entries;
}

/** Every Chinese and English string, labelled. */
export function allStrings(): Array<{ id: string; locale: "en" | "zh"; text: string; sourced: boolean }> {
  return catalogEntries().flatMap((entry) => [
    ...entry.en.map((text) => ({ id: entry.id, locale: "en" as const, text, sourced: entry.sourced })),
    { id: entry.id, locale: "zh" as const, text: entry.zh, sourced: entry.sourced },
  ]);
}

/** A template with its `{placeholders}` and tag placeholders removed. */
export function bareText(template: string): string {
  return template.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "").replace(/<\/?(?:b|em)>/g, "");
}
