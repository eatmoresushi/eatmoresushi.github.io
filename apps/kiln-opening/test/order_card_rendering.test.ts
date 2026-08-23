import { describe, expect, it } from "vitest";
import { IMPERIAL_ORDERS, MARKET_ORDERS } from "../src/game";
import { qualityLabel, relationLabel } from "../src/ui/GameTable.tsx";

/**
 * Every printed requirement must actually reach the card.
 *
 * `relationLabel` had no case for `same_shape` or `different_decoration`, so M24 and M26
 * rendered their relation as an empty string: the card showed two unconstrained ceramics
 * while the engine still required a same Shape / different Decorations. A player reading the
 * card could not know the rule existed. Nothing failed, because a `switch` with a missing
 * case simply returns undefined and `join` swallows it.
 */
const ALL = [...MARKET_ORDERS, ...IMPERIAL_ORDERS];

describe("Order card rendering", () => {
  it("prints a label for every relation on every Order, in both locales", () => {
    for (const order of ALL) {
      if ((order.relations ?? []).length === 0) continue;
      for (const locale of ["en", "zh-CN"] as const) {
        const label = relationLabel(order, locale);
        expect(label, `${order.id} renders no relation text in ${locale}`).not.toBe("");
        // A missing switch case leaves an empty segment behind the separator.
        expect(label, `${order.id} has an empty relation segment in ${locale}`)
          .not.toMatch(/·\s*(;|$)/);
        expect(label, `${order.id} rendered undefined in ${locale}`).not.toContain("undefined");
      }
    }
  });

  it("covers M24 and M26 specifically, the two that were blank", () => {
    const m24 = ALL.find((o) => o.id === "M24")!;
    const m26 = ALL.find((o) => o.id === "M26")!;
    expect(relationLabel(m24, "en")).toContain("same Shape");
    expect(relationLabel(m24, "en")).toContain("different Glazes");
    expect(relationLabel(m26, "en")).toContain("different Decorations");
    expect(relationLabel(m26, "zh-CN")).toContain("装饰不同");
  });

  it("names the Glazes a glaze_categories Order requires", () => {
    // I13 requires White, Celadon and Moon White. The generic wording left the card
    // unplayable from its own face.
    const i13 = ALL.find((o) => o.id === "I13")!;
    for (const glaze of ["White", "Celadon", "Moon White"]) {
      expect(relationLabel(i13, "en")).toContain(glaze);
    }
    expect(relationLabel(i13, "zh-CN")).toContain("白釉");
  });

  it("states Quality with a trailing + for minimums, and bare for Masterpiece", () => {
    // The "Minimum Quality:" prefix was dropped: the + already carries that meaning.
    for (const order of ALL) {
      const label = qualityLabel(order, "en");
      if (order.minQuality === "masterpiece") expect(label).not.toContain("+");
      else expect(label, `${order.id}`).toMatch(/\+$/);
    }
  });

  it("renders every Order without throwing", () => {
    for (const order of ALL) {
      for (const locale of ["en", "zh-CN"] as const) {
        expect(() => `${qualityLabel(order, locale)}${relationLabel(order, locale)}`).not.toThrow();
      }
    }
  });
});
