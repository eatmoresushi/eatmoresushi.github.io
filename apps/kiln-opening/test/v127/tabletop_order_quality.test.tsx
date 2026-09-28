import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { OrderId } from "../../src/game/index.ts";
import { OrderCard, OrderInspection, StaticOrderCard } from "../../src/ui/TabletopGameExperience.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";

const MASTERPIECE_ORDERS = [
  ["O32", 1], ["O33", 1], ["O34", 1], ["O40", 1],
  ["O41", 1], ["O42", 1], ["O47", 2], ["O48", 1],
] as const satisfies readonly (readonly [OrderId, number])[];

function labels(count: number, locale: Locale) {
  return locale === "zh-CN"
    ? { compact: `≥${count}件臻品`, full: `至少${count}件臻品` }
    : { compact: `≥${count} Masterpiece${count === 1 ? "" : "s"}`, full: `At least ${count} Masterpiece${count === 1 ? "" : "s"}` };
}

describe.each(["en", "zh-CN"] as const)("tabletop Order quality requirements (%s)", (locale) => {
  it.each(MASTERPIECE_ORDERS)("shows %s's Masterpiece requirement on market and owned cards", (id, count) => {
    const expected = labels(count, locale);
    for (const owned of [false, true]) {
      const markup = renderToStaticMarkup(createElement(OrderCard, { id, locale, owned, onInspect: () => {} }));
      // Extra Quality is visible in the Quality section, separately from the rewards.
      const qualitySection = markup.slice(markup.indexOf('class="kiln-piece-quality"'), markup.indexOf('class="kiln-piece-footer"'));
      expect(qualitySection).toContain(`class="kiln-piece-quality-requirements"><span aria-label="${expected.full}">${expected.compact}</span>`);
      const description = markup.match(/<span class="sr-only"[^>]*>(.*?)<\/span>/u)?.[1];
      expect(description).toContain(expected.full);
      expect(qualitySection).toContain(locale === "zh-CN" ? "<small>品质</small>" : "<small>Quality</small>");
      expect(qualitySection).toMatch(locale === "zh-CN" ? /<b>上品\+(?:（每件）)?<\/b>/u : /<b>Fine\+(?: each)?<\/b>/u);
      expect(markup).toContain(locale === "zh-CN" ? '>分</small>' : '>VP</small>');
      expect(markup).toMatch(locale === "zh-CN" ? /aria-label="\d+铜钱"/u : /aria-label="\d+ Coins"/u);
    }
  });

  it.each(MASTERPIECE_ORDERS)("shows %s's Masterpiece requirement on reference faces and click details", (id, count) => {
    const expected = labels(count, locale);
    const preview = renderToStaticMarkup(createElement(StaticOrderCard, { id, locale }));
    expect(preview).toContain(`aria-label="${expected.full}">${expected.compact}</span>`);
    const details = renderToStaticMarkup(createElement(OrderInspection, { id, locale }));
    expect(details).toContain(`aria-label="${expected.full}">${expected.compact}</span>`);
    expect(details).toContain(`<dt>${locale === "zh-CN" ? "额外要求" : "Also required"}</dt><dd>${expected.full}</dd>`);
  });

  it("does not add an extra Masterpiece requirement to other Orders", () => {
    for (const id of ["S01", "O01", "O30", "O31", "O43", "O46", "O16"] as const) {
      for (const component of [StaticOrderCard, OrderInspection]) {
        const markup = renderToStaticMarkup(createElement(component, { id, locale }));
        expect(markup).not.toContain("kiln-piece-quality-requirements");
        expect(markup).not.toContain(locale === "zh-CN" ? "额外要求" : "Also required");
      }
    }
  });
});
