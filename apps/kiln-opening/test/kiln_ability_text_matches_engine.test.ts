import { describe, expect, it } from "vitest";
import {
  DING_EXTRA_SHAPES,
  GE_ACTIVATION_WOOD,
  GE_CORRECTABLE_DIFFERENCES,
  GUAN_ORDER_COINS,
  GUAN_ORDER_VP,
  JUN_ACTIVATION_WOOD,
  KILN_DEFINITIONS,
  RU_BONUS_DECORATION,
  RU_BONUS_GLAZE,
  RU_BONUS_QUALITY,
  RU_ORDER_VP,
} from "../src/game";
import type { KilnId } from "../src/game";

/**
 * A Kiln's printed ability must state the rule the engine enforces.
 *
 * This is the last category where the two had nothing tying them together, and it is the
 * category that has drifted most. Guan's card claimed an Order hand limit that no code
 * implemented; Ding's said "at no Clay cost" after the cost was reinstated; Jun's said 1 Wood
 * after it went to 2. Each time the engine was right and only the player was misled, so
 * nothing failed anywhere.
 *
 * The English assertions are built from the constants, so repricing a rule without
 * rewriting the card breaks the build. The Chinese assertions check the same numbers,
 * because a translation that keeps a stale figure is just as wrong.
 */
const ability = (id: KilnId): string => KILN_DEFINITIONS[id].ability;
const abilityZh = (id: KilnId): string => KILN_DEFINITIONS[id].abilityZh;

describe("Kiln ability text agrees with the engine", () => {
  it("Ru states its award and all three conditions", () => {
    expect(ability("RU")).toContain(`${RU_ORDER_VP} VP`);
    expect(abilityZh("RU")).toContain(`${RU_ORDER_VP}分`);
    // Masterpiece is the condition most easily dropped when paraphrasing "Celadon, Plain".
    for (const term of [RU_BONUS_GLAZE, RU_BONUS_DECORATION, RU_BONUS_QUALITY]) {
      expect(ability("RU").toLowerCase(), `Ru must print its ${term} condition`).toContain(term);
    }
  });

  it("Guan states both halves of its award and no hand limit", () => {
    expect(ability("GU")).toContain(`${GUAN_ORDER_COINS} Coins`);
    expect(abilityZh("GU")).toContain(`${GUAN_ORDER_COINS}铜钱`);
    // The VP half was removed; the card must not still promise points, and must promise
    // them again if the award ever returns.
    if (GUAN_ORDER_VP > 0) {
      expect(ability("GU")).toContain(`${GUAN_ORDER_VP} VP`);
      expect(abilityZh("GU")).toContain(`${GUAN_ORDER_VP}分`);
    } else {
      expect(ability("GU")).not.toMatch(/\bVP\b/);
      expect(abilityZh("GU")).not.toMatch(/\d分/);
    }
    // The hand-limit clause was removed in v1.1.5; every Tradition trims to the same limit.
    expect(ability("GU")).not.toMatch(/hand limit/i);
    expect(abilityZh("GU")).not.toContain("手牌上限");
  });

  it("Ge states its Wood cost and its full correctable window", () => {
    expect(ability("GE")).toContain(`${GE_ACTIVATION_WOOD} Wood`);
    expect(abilityZh("GE")).toContain(`${GE_ACTIVATION_WOOD}柴薪`);
    // The window is 1 or 2 since v1.1.5. A card still saying only "1" understates the
    // ability by roughly ten points of win rate.
    for (const difference of GE_CORRECTABLE_DIFFERENCES) {
      expect(ability("GE"), `Ge must print difference ${difference}`).toContain(String(difference));
    }
    expect(ability("GE")).toMatch(/by 1 or 2/);
  });

  it("Ding names every eligible Shape and charges for the extra vessel", () => {
    for (const shape of DING_EXTRA_SHAPES) {
      expect(ability("DI").toLowerCase(), `Ding must print ${shape}`).toContain(shape);
    }
    // v1.1.5 reinstated the cost; the card said "at no Clay cost" for a while after.
    expect(ability("DI")).toMatch(/normal Clay cost/i);
    expect(ability("DI")).not.toMatch(/no Clay cost|free/i);
    expect(abilityZh("DI")).not.toContain("免付");
  });

  it("Jun states the Wood price the engine charges", () => {
    expect(ability("JU")).toContain(`${JUN_ACTIVATION_WOOD} Wood`);
    expect(abilityZh("JU")).toContain(`${JUN_ACTIVATION_WOOD}柴薪`);
    expect(ability("JU")).toMatch(/\+1 or -1|\+1 or −1/);
  });

  it("every Kiln prints a once-per-round clause, in both languages", () => {
    for (const id of Object.keys(KILN_DEFINITIONS) as KilnId[]) {
      expect(ability(id), `${id} must state its once-per-round limit`).toMatch(/once per round/i);
      expect(abilityZh(id), `${id} zh must state its once-per-round limit`).toContain("每轮一次");
    }
  });
});
