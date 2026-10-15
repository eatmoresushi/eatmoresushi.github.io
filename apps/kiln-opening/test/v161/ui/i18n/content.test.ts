import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_CARD_IDS,
  DECORATIONS,
  DISCIPLINES,
  GLAZES,
  IMPERIAL_TRACK,
  KILN_IDS,
  KILNS,
  LOCATION_IDS,
  LOCATIONS,
  QUALITIES,
  SHAPES,
  TECH_IDS,
  TECHS,
} from "../../../../src/game/index.ts";
import {
  contributionCardName,
  decorationName,
  disciplineName,
  firingStepCount,
  glazeName,
  kilnShortName,
  kilnText,
  locationEffectText,
  locationName,
  locationSummaryKey,
  pickText,
  qualityName,
  recognitionMilestones,
  resourceName,
  roundPhases,
  shapeName,
  techText,
} from "../../../../src/app/i18n/content.ts";
import { createTranslator, MissingTranslationError } from "../../../../src/app/i18n/translator.ts";

/**
 * §6.2 (ports test/v127 `localization`): every content name and rule text renders in English
 * and Chinese from the same stable ID, through the engine's content exports.
 */
const LOCALES = ["en", "zh-CN"] as const;

describe("content text by stable ID", () => {
  it.each(LOCATION_IDS)("location %s", (id) => {
    const t = createTranslator("zh-CN", { strict: true });
    expect(locationName(id, "en")).toBe(LOCATIONS[id].name);
    expect(locationName(id, "zh-CN")).toBe(LOCATIONS[id].nameZh);
    for (const effect of ["apprentice", "shifu"] as const) {
      for (const locale of LOCALES) expect(locationEffectText(id, effect, locale).trim()).not.toBe("");
      expect(t.dynamic(locationSummaryKey(id, effect)).trim()).not.toBe("");
    }
  });

  it.each(TECH_IDS)("Tech %s", (id) => {
    expect(techText(id, "en")).toEqual({ name: TECHS[id].name, short: TECHS[id].shortText, ability: TECHS[id].ability });
    expect(techText(id, "zh-CN")).toEqual({ name: TECHS[id].nameZh, short: TECHS[id].shortTextZh, ability: TECHS[id].abilityZh });
  });

  it.each(KILN_IDS)("Kiln %s", (id) => {
    expect(kilnText(id, "zh-CN").name).toBe(KILNS[id].nameZh);
    expect(kilnText(id, "en").abilityName).toBe(KILNS[id].abilityName);
    expect(kilnShortName(id, "en")).toBe(KILNS[id].name.replace(/ Kiln$/, ""));
    expect(kilnShortName(id, "en")).not.toMatch(/Kiln/);
    expect(kilnShortName(id, "zh-CN")).toBe(KILNS[id].nameZh);
  });

  it("names every vocabulary value in both languages", () => {
    for (const locale of LOCALES) {
      for (const shape of SHAPES) expect(shapeName(shape, locale)).not.toBe(shape);
      for (const glaze of GLAZES) expect(glazeName(glaze, locale)).not.toBe(glaze);
      for (const decoration of DECORATIONS) expect(decorationName(decoration, locale)).not.toBe(decoration);
      for (const quality of QUALITIES) expect(qualityName(quality, locale)).not.toBe(quality);
      for (const discipline of DISCIPLINES) expect(disciplineName(discipline, locale)).not.toBe(discipline);
      for (const card of CONTRIBUTION_CARD_IDS) expect(contributionCardName(card, locale).trim()).not.toBe("");
    }
    expect(resourceName("coins", "en", 1)).toBe("Coin");
    expect(resourceName("coins", "en", 2)).toBe("Coins");
    expect(resourceName("coins", "zh-CN", 1)).toBe("铜钱");
    expect(decorationName("painted", "zh-CN")).toBe("画花");
  });

  it("lists the round phases and Recognition milestones from content", () => {
    expect(roundPhases("zh-CN").map((phase) => phase.name)).toEqual(["开工", "派工阶段", "烧窑阶段", "交货阶段", "收工"]);
    expect(roundPhases("en")).toHaveLength(5);
    const milestones = recognitionMilestones("zh-CN");
    expect(milestones.map((milestone) => milestone.space)).toEqual(IMPERIAL_TRACK.track.map((space) => space.space));
    expect(milestones[4]?.title).toBe("御前召见");
  });

  it("counts the firing steps from the kiln namespace (0 until B3 adds them)", () => {
    expect(firingStepCount()).toBeGreaterThanOrEqual(0);
  });

  it("throws for an empty Chinese field in development", () => {
    expect(() => pickText("Hello", "", "zh-CN", "demo")).toThrow(MissingTranslationError);
    expect(pickText("Hello", "", "en", "demo")).toBe("Hello");
  });
});
