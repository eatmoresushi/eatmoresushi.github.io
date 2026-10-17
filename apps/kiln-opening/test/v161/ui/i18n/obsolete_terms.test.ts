import { describe, expect, it } from "vitest";
import { allStrings } from "./catalog_support.ts";

/**
 * §6.4 `obsolete_terms` (ports test/v127 `ui_labels`): no UI string names a mechanic that
 * AGENTS.md lists as explicitly obsolete for V1.6.1, nor one V1.6.2 removed (changes 21–24): the
 * blind reservation and the Shifu's top-3 selection at the Commission Market, its resource after
 * each reservation, the Materials Yard Shifu's Coin option, the Guild Hall Shifu's discount and
 * Canal Barge completing an Order.
 */
const OBSOLETE_EN: readonly RegExp[] = [
  /Kiln Yard/i,
  /Refin(ed Clay|ing House)/i,
  /Starting Tech/i,
  /\bHire\b|\bTrain(ed)?\b/i,
  /specialist/i,
  /Imperial (Court|Progress|Seal)/i,
  /\bOffice\b/i,
  /Glaze Palette|Dipping Vats|Measuring Calipers|White Slip|Drying Frames|Standardised Moulds/i,
  /Kiln Tending \(ST04\)|\bST0\d\b/,
  /five[- ]player|5[- ]player/i,
  /overfill|over-capacity/i,
  /Potter's Wheel|Decoration Workshop/i,
  /Imperial Grant (choice|option)/i,
  /Exhibition penalt/i,
  // V1.6.2 changes 21–22.
  /\bblind\b/i,
  /top[- ]3 selection|top three selection/i,
  /gain 1 Clay\/Wood\/Coin/i,
  /may pay 1 Coin|pay \{pay\}, gain/i,
  /complete (a|1) held Order (now|by)/i,
];

const OBSOLETE_ZH: readonly RegExp[] = [
  /窑坊/,
  /练泥坊|精泥/,
  /起始技艺/,
  /雇佣|培训/,
  /朝廷赞助|御印|御玺/,
  /釉彩盘|浸釉缸/,
  /五人/,
  /超放|超容量/,
  /陶车坊|纹饰坊/,
  // V1.6.2 changes 21–22 (glossary §2.12: 盲接 and 看三取一 are retired).
  /盲接|看三取一/,
  /少付1铜钱|付钱加得/,
  /所看的\{n\}张委托面朝下弃置/,
];

describe("no obsolete mechanics in UI strings", () => {
  const strings = allStrings();

  it("English", () => {
    const offences = strings
      .filter((entry) => entry.locale === "en")
      .flatMap((entry) => OBSOLETE_EN.filter((pattern) => pattern.test(entry.text)).map((pattern) => `${entry.id}: ${String(pattern)}`));
    expect(offences).toEqual([]);
  });

  it("Chinese", () => {
    const offences = strings
      .filter((entry) => entry.locale === "zh")
      .flatMap((entry) => OBSOLETE_ZH.filter((pattern) => pattern.test(entry.text)).map((pattern) => `${entry.id}: ${String(pattern)}`));
    expect(offences).toEqual([]);
  });
});
