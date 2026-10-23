/**
 * The Order quality line (UI_V1.6.1_ARCHITECTURE §5 gap 2; glossary §5.1).
 *
 * Built from an Order's `minQuality`, its number of ceramic slots and its `at_least_n_quality`
 * relations, so it never repeats a printed rule value: "Fine+ each; ≥1 Masterpiece" /
 * "均上品以上，至少1件臻品". It replaces the wireframe's `qualityText` / `QTXT`.
 *
 * - 1 slot: "{Quality}+" / "{品质}以上"; a Masterpiece minimum is just "Masterpiece" / "臻品".
 * - 2 slots: "{Quality}+ each" / "均{品质}以上"; 3 or more: "{Quality}+ all" / "均{品质}以上".
 * - each "at least n of a Quality" relation appends "; ≥n {Quality}(s)" / "，至少n件{品质}".
 */
import { ORDERS } from "../../game/index.ts";
import type { OrderDefinition, OrderId } from "../../game/index.ts";
import { qualityName } from "./content.ts";
import { translatorFor } from "./translator.ts";
import type { Locale, Translator } from "./translator.ts";

export function orderQualityLine(order: OrderId | OrderDefinition, locale: Locale | Translator): string {
  const t = translatorFor(locale);
  const definition = typeof order === "string" ? ORDERS[order] : order;
  const quality = qualityName(definition.minQuality, t.locale);
  const slots = definition.ceramics.length;
  let line = definition.minQuality === "masterpiece"
    ? quality
    : slots <= 1
      ? t("common.orderQuality.single", { quality })
      : slots === 2
        ? t("common.orderQuality.each", { quality })
        : t("common.orderQuality.all", { quality });
  for (const relation of definition.relations ?? []) {
    if (relation.type !== "at_least_n_quality") continue;
    line = t("common.orderQuality.atLeast", { line, n: relation.count, quality: qualityName(relation.quality, t.locale) });
  }
  return line;
}
