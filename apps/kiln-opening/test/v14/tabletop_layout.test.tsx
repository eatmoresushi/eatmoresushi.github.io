import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsiveTabletop } from "../../src/ui/ResponsiveTabletop";
import { calculateTabletopLayout } from "../../src/ui/tabletopLayout";

describe("responsive tabletop sizing", () => {
  it("scales the complete wide table continuously in both resize directions", () => {
    const widths = [1440, 1200, 960, 1200, 1440, 1800];
    const scales = widths.map((availableWidth) => calculateTabletopLayout({
      availableWidth, availableHeight: 1400, overviewHeight: 800,
    }));
    expect(scales.map(({ mode }) => mode)).toEqual(widths.map(() => "wide"));
    scales.forEach(({ scale, cardScale }, index) => {
      expect(scale).toBeCloseTo(widths[index]! / 1440);
      expect(cardScale).toBe(scale);
    });
  });

  it("limits enlargement on very large monitors", () => {
    expect(calculateTabletopLayout({ availableWidth: 3440, availableHeight: 2000, overviewHeight: 700 }))
      .toEqual({ mode: "wide", scale: 1.25, cardScale: 1.25 });
  });

  it("uses the shared overview height instead of shrinking to fit the whole workshop", () => {
    const result = calculateTabletopLayout({ availableWidth: 1440, availableHeight: 700, overviewHeight: 800 });
    expect(result).toEqual({ mode: "wide", scale: .875, cardScale: .875 });
  });

  it("bounds extra shrinkage when a window is unusually short", () => {
    const result = calculateTabletopLayout({ availableWidth: 1200, availableHeight: 300, overviewHeight: 900 });
    expect(result.scale).toBeCloseTo((1200 / 1440) * .8);
    expect(result.scale * 900).toBeGreaterThan(300);
  });

  it("reflows narrow viewports without scaling and restores wide mode after expansion", () => {
    for (const availableWidth of [959, 768, 390, 320]) {
      const layout = calculateTabletopLayout({ availableWidth, availableHeight: 300, overviewHeight: 1000 });
      expect(layout.mode).toBe("compact");
      expect(layout.scale).toBe(1);
    }
    expect(calculateTabletopLayout({ availableWidth: 960, availableHeight: 1000, overviewHeight: 800 }).mode)
      .toBe("wide");
  });

  it("sizes compact cards consistently while keeping the surrounding UI unscaled", () => {
    for (const [availableWidth, expected] of [[320, .8], [390, 390 / 430], [768, 1]] as const) {
      const layout = calculateTabletopLayout({ availableWidth, availableHeight: 700, overviewHeight: 1000 });
      expect(layout.scale).toBe(1);
      expect(layout.cardScale).toBeCloseTo(expected);
    }
  });

  it("uses width until an overview measurement becomes available", () => {
    expect(calculateTabletopLayout({ availableWidth: 1440, availableHeight: 700, overviewHeight: 0 }))
      .toEqual({ mode: "wide", scale: 1, cardScale: 1 });
  });

  it("flows enlarged text instead of shrinking the board beside larger pieces", () => {
    const measurements = { availableWidth: 1440, availableHeight: 900, overviewHeight: 800 };
    expect(calculateTabletopLayout({ ...measurements, textScale: 1.25 }).mode).toBe("wide");
    expect(calculateTabletopLayout({ ...measurements, textScale: 1.5 }))
      .toEqual({ mode: "compact", scale: 1, cardScale: 1 });
    expect(calculateTabletopLayout({ ...measurements, textScale: 2 }))
      .toEqual({ mode: "compact", scale: 1, cardScale: 1 });
  });

  it("renders safely before browser measurement and retains its children", () => {
    const markup = renderToStaticMarkup(createElement(ResponsiveTabletop, {
      children: createElement("main", { className: "kiln-tabletop-play-area" }, "Shared board"),
    }));
    expect(markup).toContain('class="kiln-responsive-tabletop" data-layout="wide"');
    expect(markup).toContain('class="kiln-responsive-tabletop-scene" data-layout="wide"');
    expect(markup).toContain("Shared board");
    expect(markup).toContain("width:1440px");
  });
});
