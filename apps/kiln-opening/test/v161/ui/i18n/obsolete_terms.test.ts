import { describe, expect, it } from "vitest";
import { allStrings } from "./catalog_support.ts";

/**
 * §6.4 `obsolete_terms` (ports test/v127 `ui_labels`): no UI string names a mechanic that
 * AGENTS.md lists as explicitly obsolete for V1.6.1, nor one V1.6.2 removed (changes 21–24): the
 * blind reservation and the Shifu's top-3 selection at the Commission Market, its resource after
 * each reservation, the Materials Yard Shifu's Coin option, the Guild Hall Shifu's discount and
 * Canal Barge completing an Order; nor one owner revision 4 removed: the Heat marker, salvaging
 * a Flawed ceramic, a Decoration cost, and looked-at Orders going to the bottom of the Main Order
 * deck (R25: they are discarded).
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
  // Owner revision 4 (changes 28–35) and R25.
  /Heat marker/i,
  /\bsalvag/i,
  /Decoration cost/i,
  /bottom of the Main Order deck/i,
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
  // The Guild Hall Shifu's discount and the Materials Yard Shifu's Coin option. 少付1铜钱 itself is
  // revision 4's word for a forming reduction (glossary §1.4), so only the Guild Hall use is banned.
  /(习得|行会)[^。；]*少付1铜钱|付钱加得/,
  // Owner revision 4 (changes 28–35) and R25.
  /火标/,
  /折卖|补救/,
  /纹饰费|纹饰减免/,
  /主委托牌堆底/,
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
