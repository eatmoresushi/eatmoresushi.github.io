/**
 * B3's kiln catalogue facts: the Techs the kiln and stage show tiles and records for, the Imperial
 * Recognition constants the kiln reads, and the twelve firing-step names of glossary §2.11. The
 * rules-details panel and its content accessors (D10, K15) are tested once, in
 * `test/v161/ui/rules/rules_detail.test.tsx` (B6 consolidated the four package copies).
 */
import { describe, expect, it } from "vitest";
import { IMPERIAL_TRACK, TECHS } from "../../../../src/game/index.ts";
import { CATALOG } from "../../../../src/app/i18n/index.ts";
import { KILN_TECHS } from "../../../../src/app/i18n/catalog/kiln.ts";
import { IMPERIAL_AUDIENCE_RECOGNITION, IMPERIAL_KILN_RECOGNITION, IMPERIAL_MODIFIER_OPTIONS, firingStepCount } from "../../../../src/app/i18n/content.ts";
import { glossaryTableAfter } from "../../support/glossary.ts";

describe("kiln content (B3)", () => {
  it("reads the Imperial Recognition milestones and modifiers the kiln shows from content", () => {
    expect(IMPERIAL_KILN_RECOGNITION).toBe(IMPERIAL_TRACK.track.find((entry) => entry.reward?.kind === "imperial_kiln")?.space);
    expect(IMPERIAL_AUDIENCE_RECOGNITION).toBe(IMPERIAL_TRACK.track.find((entry) => entry.reward?.kind === "vp")?.space);
    expect([...IMPERIAL_MODIFIER_OPTIONS]).toEqual([-1, 0, 1]);
  });

  it("names the Techs the kiln and stage show tiles and records for", () => {
    expect(TECHS[KILN_TECHS.kilnFurniture].name).toBe("Kiln Furniture");
    expect(TECHS[KILN_TECHS.invertedFiring].name).toBe("Inverted Firing");
    expect(TECHS[KILN_TECHS.settersMark].name).toBe("Setter's Mark");
    expect(TECHS[KILN_TECHS.testPieces].name).toBe("Test Pieces");
    expect(TECHS[KILN_TECHS.secondFiring].name).toBe("Second Firing");
    expect(TECHS[KILN_TECHS.connoisseur].name).toBe("Connoisseur's Cabinet");
  });
});

describe("firing step names (glossary §2.11)", () => {
  it("has the twelve Appendix D steps in English and Chinese", () => {
    expect(firingStepCount()).toBe(12);
    const rows = glossaryTableAfter("### 2.11").filter(([en]) => /^(Firing )?step \d+ /.test(en ?? ""));
    expect(rows).toHaveLength(12);
    rows.forEach(([en, zh], index) => {
      const n = index + 1;
      expect(CATALOG.kiln.en[`step.${String(n)}.full` as keyof typeof CATALOG.kiln.en]).toBe((en ?? "").replace(/^(Firing )?step \d+ /, ""));
      expect(CATALOG.kiln.zh[`step.${String(n)}.full` as keyof typeof CATALOG.kiln.zh]).toBe((zh ?? "").replace(/^[^、]+、/, ""));
    });
  });
});
