import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResponsiveTabletop } from "../../src/ui/ResponsiveTabletop";
import { calculateTabletopLayout } from "../../src/ui/tabletopLayout";

describe("responsive tabletop sizing", () => {
  it("scales the complete wide table continuously in both resize directions", () => {
    const widths = [1800, 1440, 1200, 960, 1200, 1440, 1800, 2560, 3440];
    const scales = widths.map((availableWidth) => calculateTabletopLayout({
      availableWidth,
    }));
    expect(scales.map(({ mode }) => mode)).toEqual(widths.map(() => "wide"));
    scales.forEach(({ scale, cardScale }, index) => {
      expect(scale).toBeCloseTo(widths[index]! / 1800);
      expect(cardScale).toBe(scale);
    });
  });

  it("limits enlargement on very large monitors", () => {
    expect(calculateTabletopLayout({ availableWidth: 3840 }))
      .toEqual({ mode: "wide", scale: 2, cardScale: 2 });
  });

  it("fills the available width through the larger maximum", () => {
    for (const availableWidth of [960, 1366, 1920, 2560, 3600]) {
      const result = calculateTabletopLayout({ availableWidth });
      expect(result.scale * 1800).toBeCloseTo(availableWidth);
    }
  });

  it("uses a safe unscaled layout when the available width is not finite", () => {
    for (const availableWidth of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(calculateTabletopLayout({ availableWidth }))
        .toEqual({ mode: "compact", scale: 1, cardScale: 1 });
    }
  });

  it("reflows narrow viewports without scaling and restores wide mode after expansion", () => {
    for (const availableWidth of [959, 768, 390, 320]) {
      const layout = calculateTabletopLayout({ availableWidth });
      expect(layout.mode).toBe("compact");
      expect(layout.scale).toBe(1);
    }
    expect(calculateTabletopLayout({ availableWidth: 960 }).mode)
      .toBe("wide");
  });

  it("sizes compact cards consistently while keeping the surrounding UI unscaled", () => {
    for (const [availableWidth, expected] of [[320, .8], [390, 390 / 430], [768, 1]] as const) {
      const layout = calculateTabletopLayout({ availableWidth });
      expect(layout.scale).toBe(1);
      expect(layout.cardScale).toBeCloseTo(expected);
    }
  });

  it("uses the reference size without needing any content or viewport height measurement", () => {
    expect(calculateTabletopLayout({ availableWidth: 1800 }))
      .toEqual({ mode: "wide", scale: 1, cardScale: 1 });
  });

  it("flows enlarged text instead of shrinking the board beside larger pieces", () => {
    const measurements = { availableWidth: 1440 };
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
    expect(markup).toContain("width:1800px");
  });
});
