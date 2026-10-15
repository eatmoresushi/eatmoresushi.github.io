import { describe, expect, it } from "vitest";
import { RULE_ERROR_TEXT, formatRuleError } from "../../../../src/game/index.ts";
import { ruleErrorText } from "../../../../src/app/i18n/errors.ts";
import { allStrings } from "./catalog_support.ts";

/**
 * §6.4 `d7_wording` (owner decision D7): no lock or unlock in player-facing text. A second
 * personal space is added by learning a Tech; a covered kiln space is never 封. D11: the
 * Workshop discipline is called Form & Decorate in English, so "Workshop Tech" never reaches a
 * player.
 */
describe("D7: no lock wording", () => {
  const strings = allStrings();
  const ruleTemplates = Object.entries(RULE_ERROR_TEXT).flatMap(([code, entry]) =>
    [entry, ...(entry.fallbacks ?? [])].flatMap((template) => [
      { id: code, locale: "en" as const, text: template.en },
      { id: code, locale: "zh" as const, text: template.zh },
    ]));

  it("has no lock/unlock in English", () => {
    expect([...strings, ...ruleTemplates].filter((entry) => entry.locale === "en" && /\b(un)?lock/i.test(entry.text)).map((entry) => entry.id)).toEqual([]);
  });

  it("has no 锁/封 wording in Chinese", () => {
    const banned = /锁|封条|启封|封存|上锁|解锁|封(?=窑位|工位)|(?<=窑位|工位)封/;
    expect([...strings, ...ruleTemplates].filter((entry) => entry.locale === "zh" && banned.test(entry.text)).map((entry) => entry.id)).toEqual([]);
  });

  it("keeps PERSONAL_SPACE_LOCKED in the §6.4 form for both personal locations", () => {
    const form = { code: "PERSONAL_SPACE_LOCKED", details: { locationId: "form_decorate" } } as const;
    const glaze = { code: "PERSONAL_SPACE_LOCKED", details: { locationId: "glaze_load" } } as const;
    expect(formatRuleError(form, "en")).toBe("Learn a Form & Decorate Tech to add this space.");
    expect(formatRuleError(form, "zh")).toBe("习得坯作技艺即添此工位");
    expect(formatRuleError(glaze, "en")).toBe("Learn a Glazing & Loading Tech to add this space.");
    expect(formatRuleError(glaze, "zh")).toBe("习得釉作技艺即添此工位");
    // The UI path gives the same sentence.
    expect(ruleErrorText(form, "en")).toBe("Learn a Form & Decorate Tech to add this space.");
    expect(ruleErrorText(glaze, "zh-CN")).toBe("习得釉作技艺即添此工位");
  });

  it("never says \"Workshop Tech\" in English (D11: Form & Decorate)", () => {
    const english = [
      ...strings.filter((entry) => entry.locale === "en"),
      ...ruleTemplates.filter((entry) => entry.locale === "en"),
      ...(["form_decorate", "glaze_load"] as const).map((locationId) => ({
        id: `PERSONAL_SPACE_LOCKED:${locationId}`,
        text: formatRuleError({ code: "PERSONAL_SPACE_LOCKED", details: { locationId } }, "en"),
      })),
    ];
    expect(english.filter((entry) => /Workshop Tech/i.test(entry.text)).map((entry) => entry.id)).toEqual([]);
  });
});
