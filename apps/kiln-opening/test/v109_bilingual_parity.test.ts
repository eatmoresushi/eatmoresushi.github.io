import { describe, expect, it } from "vitest";
import { GAME_CONFIG, IMPERIAL_ORDERS, MARKET_ORDERS, TECHNIQUES } from "../src/game";
import { term } from "../src/ui/i18n";
import type { Locale } from "../src/ui/i18n";

/**
 * Migration Spec v1.0.4 → v1.0.9, §11.6 — bilingual parity gate.
 *
 * The English and Chinese v1.0.9 rulebooks were written as a matched pair and their
 * numeric parity was verified at source, so this suite is not re-deriving the design.
 * It fails the build when an import or edit lets the two builds drift apart, which
 * §11.6 anticipates happening "when card values change again — and they will".
 *
 * Card numbers are single-sourced in `data/*.json` and rendered structurally, so parity
 * is held by construction rather than by two parallel tables. The assertions below lock
 * in that property: the published values, one shared numeric source per card, complete
 * Chinese coverage for every translated string, and none of the §11.4 traps.
 */

const LOCALES: readonly Locale[] = ["en", "zh-CN"];

/** §4.5 — the 28 published Market Orders, as [id, vp, coins]. */
const MARKET_TABLE: readonly (readonly [string, number, number])[] = [
  ["M01", 3, 2], ["M02", 3, 2], ["M03", 3, 2], ["M04", 4, 3], ["M05", 4, 3],
  ["M06", 5, 3], ["M07", 6, 2], ["M08", 6, 2], ["M09", 7, 3], ["M10", 8, 3],
  ["M11", 6, 3], ["M12", 6, 3], ["M13", 7, 2], ["M14", 7, 3], ["M15", 7, 5],
  ["M16", 8, 5], ["M17", 9, 5], ["M18", 10, 4], ["M19", 13, 6], ["M20", 10, 5],
  ["M21", 5, 5], ["M22", 10, 5], ["M23", 16, 5], ["M24", 9, 4], ["M25", 8, 5],
  ["M26", 9, 4], ["M27", 8, 5], ["M28", 9, 5],
];

/** §4.6 — the 20 published Imperial Orders, as [id, vp, progress]. */
const IMPERIAL_TABLE: readonly (readonly [string, number, number])[] = [
  ["I01", 7, 2], ["I02", 8, 1], ["I03", 8, 2], ["I04", 9, 1], ["I05", 8, 1],
  ["I06", 11, 2], ["I07", 12, 2], ["I08", 14, 3], ["I09", 13, 2], ["I10", 15, 3],
  ["I11", 8, 2], ["I12", 11, 2], ["I13", 14, 3], ["I14", 3, 1], ["I15", 3, 1],
  ["I16", 5, 1], ["I17", 5, 2], ["I18", 7, 1], ["I19", 12, 2], ["I20", 7, 1],
];

/** §5.1 — the 15 published Technique costs. */
const TECHNIQUE_COSTS: Readonly<Record<string, number>> = {
  T01: 1, T02: 1, T03: 2, T04: 3, T05: 2, T06: 2, T08: 2, T09: 3,
  T10: 3, T11: 3, T12: 3, T13: 2, T14: 3, T15: 3, T16: 3,
};

/** §11.3 — glossary keys that must carry a curated label in both locales. */
const GLOSSARY_KEYS: readonly string[] = [
  "bowl", "plate", "washer", "vase", "censer",
  "white", "celadon", "grey_green", "moon_white",
  "plain", "carved", "impressed", "crackle",
  "masterpiece", "fine", "standard", "flawed",
  "clay", "wood", "coins",
  "shifu", "apprentice",
  "materials_yard", "forming_studio", "glaze_workshop", "kiln_yard",
  "market_imperial_office", "guild_academy",
];

/**
 * §11.4 — what a machine translator produces instead of the domain term. Each of these
 * reads plausibly, which is why they have to be asserted against rather than reviewed.
 */
const TRANSLATION_TRAPS: readonly (readonly [string, string, string])[] = [
  ["垫圈", "washer", "a hardware washer, not the Song brush-washer 洗"],
  ["木头", "wood", "timber, not kiln fuel 柴薪"],
  ["木材", "wood", "lumber, not kiln fuel 柴薪"],
  ["温度", "heat", "temperature, not the potter's 火候"],
  ["裂纹", "crackle", "damage, not the prized 开片"],
  ["杰作", "masterpiece", "does not fit the tier set 珍/精/合格/次"],
  ["朴素", "plain", "plain-as-adjective, not the surface term 素面"],
  ["打开窑炉", "kiln opening", "literal, not the trade term 开窑"],
];

/** Every Chinese string the build can show, gathered from both content and UI. */
function chineseStrings(): { source: string; value: string }[] {
  const strings: { source: string; value: string }[] = [];
  for (const technique of TECHNIQUES) {
    strings.push({ source: `${technique.id}.nameZh`, value: technique.nameZh });
    strings.push({ source: `${technique.id}.abilityZh`, value: technique.abilityZh });
  }
  for (const key of GLOSSARY_KEYS) {
    strings.push({ source: `term(${key})`, value: term("zh-CN", key) });
  }
  return strings;
}

describe("V1.0.9 bilingual parity (Migration Spec §11.6)", () => {
  it("carries 28 Market, 20 Imperial, and 15 Techniques for both locales", () => {
    expect(MARKET_ORDERS).toHaveLength(28);
    expect(IMPERIAL_ORDERS).toHaveLength(20);
    expect(TECHNIQUES).toHaveLength(15);
    expect(GAME_CONFIG.rulesVersion).toBe("1.0.9");
  });

  it("matches the published Market VP and Coin values for every ID", () => {
    expect(MARKET_ORDERS.map((order) => [order.id, order.vp, order.coins])).toEqual(
      MARKET_TABLE.map((row) => [...row]),
    );
  });

  it("matches the published Imperial VP and Progress values for every ID", () => {
    expect(
      IMPERIAL_ORDERS.map((order) => [order.id, order.vp, order.imperialProgressReward]),
    ).toEqual(IMPERIAL_TABLE.map((row) => [...row]));
  });

  it("matches the published Technique costs and the 2/5/8 distribution", () => {
    expect(Object.fromEntries(TECHNIQUES.map((tile) => [tile.id, tile.cost]))).toEqual(TECHNIQUE_COSTS);
    expect(TECHNIQUES.reduce<Record<number, number>>((counts, tile) => {
      counts[tile.cost] = (counts[tile.cost] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ 1: 2, 2: 5, 3: 8 });
  });

  // §11.6's first two checks exist to catch one language's numbers drifting from the
  // other's. A locale-suffixed numeric field would reintroduce exactly that risk, so the
  // single shared source is asserted rather than assumed.
  it("keeps every card number on one shared source with no locale-specific override", () => {
    const numericFields = ["vp", "coins", "imperialProgressReward", "cost"];
    const localeSuffixed = /(Zh|ZhCn|En|Cn)$/;
    for (const card of [...MARKET_ORDERS, ...IMPERIAL_ORDERS, ...TECHNIQUES]) {
      const record = card as unknown as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (!localeSuffixed.test(key)) continue;
        expect(typeof record[key], `${key} must not be numeric card data`).not.toBe("number");
      }
      for (const field of numericFields) {
        for (const suffix of ["Zh", "ZhCn", "En", "Cn"]) {
          expect(record).not.toHaveProperty(`${field}${suffix}`);
        }
      }
    }
  });

  it("resolves every §11.3 glossary key to a curated label in both locales", () => {
    for (const key of GLOSSARY_KEYS) {
      const fallback = key.replaceAll("_", " ");
      for (const locale of LOCALES) {
        const label = term(locale, key);
        expect(label.length, `${key} is empty in ${locale}`).toBeGreaterThan(0);
      }
      // `term` falls back to the de-underscored id, so a missing Chinese entry surfaces
      // as Latin text rather than as an empty string.
      const chinese = term("zh-CN", key);
      expect(chinese, `${key} has no Chinese label`).not.toBe(fallback);
      expect(chinese, `${key} resolved to Latin fallback text`).toMatch(/[一-鿿]/);
    }
  });

  it("gives all 15 Techniques a Chinese name and ability", () => {
    for (const technique of TECHNIQUES) {
      expect(technique.nameZh.length, `${technique.id} has no Chinese name`).toBeGreaterThan(0);
      expect(technique.abilityZh.length, `${technique.id} has no Chinese ability`).toBeGreaterThan(0);
      expect(technique.nameZh).toMatch(/[一-鿿]/);
      expect(technique.abilityZh).toMatch(/[一-鿿]/);
    }
  });

  it("contains none of the §11.4 machine-translation traps", () => {
    const strings = chineseStrings();
    expect(strings.length).toBeGreaterThan(0);
    for (const [trap, english, why] of TRANSLATION_TRAPS) {
      const offenders = strings.filter(({ value }) => value.includes(trap));
      expect(
        offenders.map(({ source }) => source),
        `"${trap}" (${english}) is ${why}`,
      ).toEqual([]);
    }
  });

  // §11.5 — IDs are cross-reference keys printed on the physical components, and the
  // numerals stay Arabic, so neither may pick up localised forms.
  it("keeps card IDs Latin and numerals Arabic in both locales", () => {
    for (const card of [...MARKET_ORDERS, ...IMPERIAL_ORDERS, ...TECHNIQUES]) {
      expect(card.id).toMatch(/^[MIT]\d{2}$/);
    }
    for (const { source, value } of chineseStrings()) {
      expect(value, `${source} uses Chinese numerals`).not.toMatch(/[一二三四五六七八九十]\s*(VP|铜钱|进度)/);
    }
  });
});
