import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STARTING_TECHNIQUES, TECHNIQUE_DEFINITIONS } from "../../src/game";
import { TechniqueFace } from "../../src/ui/PieceFaces";
import { TECHNIQUE_SHORT_COPY, techniqueFullCopy, techniqueShortPlainText } from "../../src/ui/TechniqueDescription";
import { TECHNIQUE_OVERVIEW_COPY, techniqueOverviewCopy } from "../../src/ui/TechniqueOverview";

const canonicalIds = [...STARTING_TECHNIQUES, ...Object.values(TECHNIQUE_DEFINITIONS)].map(({ id }) => id);

function visibleText(markup: string): string {
  return markup.replace(/<br\s*\/?\s*>/gu, "\n").replace(/<[^>]*>/gu, "")
    .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

describe("shared Tech component reminders", () => {
  it("uses one source for all 19 canonical IDs in both languages", () => {
    expect(TECHNIQUE_OVERVIEW_COPY).toBe(TECHNIQUE_SHORT_COPY);
    expect(Object.keys(TECHNIQUE_OVERVIEW_COPY).sort()).toEqual([...canonicalIds].sort());
    expect(canonicalIds).toHaveLength(19);
    for (const id of canonicalIds) {
      for (const locale of ["en", "zh-CN"] as const) {
        expect(techniqueOverviewCopy(id, locale)).toBe(techniqueShortPlainText(id, locale));
        expect(techniqueOverviewCopy(id, locale).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it.each(["en", "zh-CN"] as const)("keeps the complete component reminder and emphasis on overview tiles (%s)", (locale) => {
    for (const id of canonicalIds) {
      const normal = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, exhausted: true }));
      const overview = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, exhausted: true, overview: true }));
      const copyPattern = /<p class="kiln-piece-copy"[^>]*>[\s\S]*?<\/p>/u;
      const normalCopy = normal.match(copyPattern)![0];
      const overviewCopy = overview.match(copyPattern)![0];
      expect(visibleText(overviewCopy)).toBe(techniqueShortPlainText(id, locale));
      if (id.startsWith("ST")) expect(overviewCopy).toContain("<strong>");
      else expect(overviewCopy).not.toContain("<strong>");
      expect(overviewCopy).not.toContain("**");
      // Names, cost, category, timing, end-game VP and used state stay identical.
      expect(overview.replace(copyPattern, "")).toBe(normal.replace(copyPattern, ""));
      expect(visibleText(normalCopy)).toBe(techniqueShortPlainText(id, locale));
      const full = renderToStaticMarkup(createElement(TechniqueFace, { id, locale, layer: "full" }));
      expect(visibleText(full.match(copyPattern)![0])).toBe(techniqueFullCopy(id, locale));
    }
  });

  it("retains the owner-supplied costs, conditions and line breaks", () => {
    expect(techniqueOverviewCopy("ST04", "en")).toBe("Once during each Kiln Yard action, after loading at least 1 ceramic: gain 1 Clay or 1 Wood.");
    expect(techniqueOverviewCopy("T01", "en")).toContain("Stacks with the Shifu discount.");
    expect(techniqueOverviewCopy("T10", "en")).toBe("When acquired: make 1 Selection, without a worker or resource bonus.\nDuring Commission Market: replace 1 reservation choice with a Selection.");
    expect(techniqueOverviewCopy("T12", "en")).toBe("When acquired: gain +2 Stoke and −2 Bank Contribution cards. Each costs 2 Wood to play.");
    expect(techniqueOverviewCopy("T14", "en")).toContain("recalculate only its Actual Heat and Quality.");
    expect(techniqueOverviewCopy("T15", "en")).toContain("its zone modifier is 0 for this firing.");
    expect(techniqueFullCopy("T02", "en")).toContain("workshop");
    expect(techniqueFullCopy("T03", "en")).toContain("workshop");
  });
});
