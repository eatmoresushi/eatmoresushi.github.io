import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STARTING_TECHNIQUES, TECHNIQUE_DEFINITIONS } from "../../src/game";
import { TechniqueFace } from "../../src/ui/PieceFaces";
import { techniqueFullCopy, techniqueShortPlainText } from "../../src/ui/TechniqueDescription";
import { TECHNIQUE_OVERVIEW_COPY, techniqueOverviewCopy } from "../../src/ui/TechniqueOverview";

const canonicalIds = [...STARTING_TECHNIQUES, ...Object.values(TECHNIQUE_DEFINITIONS)].map(({ id }) => id);

function visibleText(markup: string): string {
  return markup.replace(/<[^>]*>/gu, "")
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

describe("compact Tech overview reminders", () => {
  it("covers all 19 canonical IDs in both languages with concise, nonempty copy", () => {
    expect(Object.keys(TECHNIQUE_OVERVIEW_COPY).sort()).toEqual([...canonicalIds].sort());
    expect(canonicalIds).toHaveLength(19);
    for (const id of canonicalIds) {
      for (const locale of ["en", "zh-CN"] as const) {
        const copy = techniqueOverviewCopy(id, locale);
        expect(copy.trim().length, `${id} ${locale}`).toBeGreaterThan(0);
        expect(copy.length, `${id} ${locale}`).toBeLessThanOrEqual(locale === "en" ? 75 : 40);
      }
    }
  });

  it.each(["en", "zh-CN"] as const)("changes only reminder copy when overview is requested (%s)", (locale) => {
    for (const id of canonicalIds) {
      const normal = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, exhausted: true }));
      const overview = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, exhausted: true, overview: true }));
      const copyPattern = /<p class="kiln-piece-copy"[^>]*>[\s\S]*?<\/p>/u;
      expect(overview).toContain('data-overview="true"');
      expect(visibleText(overview.match(copyPattern)![0])).toBe(techniqueOverviewCopy(id, locale));
      // Artwork, names, cost, category, timing, end-game VP and used state stay identical.
      expect(overview.replace(copyPattern, "")).toBe(normal.replace(copyPattern, ""));
      expect(visibleText(normal.match(copyPattern)![0])).toBe(techniqueShortPlainText(id, locale));
      const full = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, layer: "full" }));
      expect(visibleText(full.match(copyPattern)![0])).toBe(techniqueFullCopy(id, locale));
    }
  });

  it("keeps the effect and essential choices visible for the long timing-sensitive Techs", () => {
    expect(TECHNIQUE_OVERVIEW_COPY.T06.en).toMatch(/End of Work:.*Glaze.*1 loaded ceramic/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T06["zh-CN"]).toMatch(/工人阶段结束.*1件已装窑.*釉色/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T10.en).toMatch(/inspect 3 Main Orders; reserve 1 inspected or face-up/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T10["zh-CN"]).toMatch(/3张主委托.*其中或公开的1张/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T14.en).toMatch(/Re-fire 1 Flawed\/Standard.*new result, even if worse/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T14["zh-CN"]).toMatch(/1件瑕品／良品.*新结果.*更差/u);
    expect(TECHNIQUE_OVERVIEW_COPY.T11.en).toContain("1 Wood");
    expect(TECHNIQUE_OVERVIEW_COPY.T11.en).toContain("Flawed → Standard or Standard → Fine");
    expect(TECHNIQUE_OVERVIEW_COPY.T12.en).toContain("±2 Contribution cards");
    expect(TECHNIQUE_OVERVIEW_COPY.T12.en).toContain("2 Wood");
  });
});
