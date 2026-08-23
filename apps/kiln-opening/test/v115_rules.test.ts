import { describe, expect, it } from "vitest";
import {
  CONTRIBUTION_CARDS,
  CONTRIBUTION_CARD_DEFINITIONS,
  CONTRIBUTION_CARD_IDS,
  GAME_CONFIG,
  GLAZES,
  IMPERIAL_ORDERS,
  IMPERIAL_PROGRESS,
  KILN_SPACE_DEFINITIONS,
  KILN_SPACE_IDS,
  MARKET_ORDERS,
  ORDER_DEFINITIONS,
  TECHNIQUES,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  contributionHeatAdjustment,
  contributionWoodCost,
  determineBaseHeat,
  preferredHeat,
} from "../src/game";
import type { ContributionCardId } from "../src/game";

const adjustments = (...cards: ContributionCardId[]): number[] =>
  cards.map((card) => contributionHeatAdjustment(card));

describe("v1.1.5 authoritative content", () => {
  it("loads v1.1.5 content versions, deck sizes and Glaze heats", () => {
    expect(GAME_CONFIG.rulesVersion).toBe("1.1.5");
    expect(IMPERIAL_PROGRESS.rulesVersion).toBe("1.1.5");
    expect(MARKET_ORDERS.length).toBe(30);
    expect(IMPERIAL_ORDERS.length).toBe(22);
    expect(TECHNIQUES.length).toBe(15);
    expect(GLAZES.map((glaze) => preferredHeat(glaze))).toEqual([1, 2, 3, 4]);
  });

  /** Spec §4.2: exactly three cards, and no fourth may exist to be chosen by mistake. */
  it("ships exactly three Contribution cards with their printed costs", () => {
    expect(CONTRIBUTION_CARD_IDS).toEqual(["BANK", "TEND", "STOKE"]);
    expect(CONTRIBUTION_CARDS.map((card) => [card.id, card.woodCost, card.heatAdjustment])).toEqual([
      ["BANK", 1, -1],
      ["TEND", 0, 0],
      ["STOKE", 1, 1],
    ]);
    expect(CONTRIBUTION_CARD_DEFINITIONS).not.toHaveProperty("FIRE_HARD");
    expect(JSON.stringify(CONTRIBUTION_CARDS)).not.toMatch(/fire the kiln hard/i);
  });

  /** Spec §22 data validation. */
  it("carries the v1.1.5 Order values", () => {
    expect(ORDER_DEFINITIONS["M08"]).toMatchObject({ vp: 8, coins: 3 });
    expect(ORDER_DEFINITIONS["M17"]).toMatchObject({ vp: 9, coins: 5 });
    expect(ORDER_DEFINITIONS["M24"]).toMatchObject({ vp: 10, coins: 5 });
    expect(ORDER_DEFINITIONS["M26"]).toMatchObject({ vp: 10, coins: 5 });
    expect(ORDER_DEFINITIONS["M29"]).toMatchObject({ vp: 12, coins: 5 });
    expect(ORDER_DEFINITIONS["M30"]).toMatchObject({ vp: 4, coins: 3 });
    expect(ORDER_DEFINITIONS["I01"]).toMatchObject({ vp: 9, imperialProgressReward: 1 });
    expect(ORDER_DEFINITIONS["I03"]).toMatchObject({ vp: 10, imperialProgressReward: 1 });
  });

  it("prints one Imperial Progress per required ceramic on every Imperial Order", () => {
    for (const order of IMPERIAL_ORDERS) {
      expect(order.imperialProgressReward, order.id).toBe(order.ceramics.length);
    }
  });

  it("prices the v1.1.5 Techniques as printed", () => {
    expect(TECHNIQUE_DEFINITIONS["T01"]?.cost).toBe(2);
    expect(TECHNIQUE_DEFINITIONS["T02"]?.cost).toBe(1);
    expect(TECHNIQUE_DEFINITIONS["T10"]?.cost).toBe(3);
    expect(TECHNIQUE_DEFINITIONS["T11"]?.cost).toBe(3);
    expect(TECHNIQUE_DEFINITIONS["T12"]?.cost).toBe(3);
    expect(TECHNIQUE_DEFINITIONS["T16"]?.cost).toBe(3);
    // Firing Techniques activate with Wood in v1.1.5, never Coins.
    expect(TECHNIQUE_DEFINITIONS["T10"]?.ability).toMatch(/1 Wood/);
    expect(TECHNIQUE_DEFINITIONS["T12"]?.ability).toMatch(/1 Wood/);
    expect(TECHNIQUE_DEFINITIONS["T16"]?.ability).toMatch(/2 Wood/);
    expect(TECHNIQUE_DEFINITIONS["T02"]?.ability).toMatch(/1 Coin and 1 Clay/);
  });

  /** v1.1.5 turns over two cards from each display at the start of Rounds 2-5. */
  it("rotates two Orders from each display", () => {
    expect(GAME_CONFIG.orderDisplay.market).toBe(4);
    expect(GAME_CONFIG.orderDisplay.imperial).toBe(4);
  });

  it("awards no Coin stipend at Imperial Progress 2 or 4", () => {
    expect(IMPERIAL_PROGRESS).not.toHaveProperty("stipends");
    expect(IMPERIAL_PROGRESS.track.map((space) => space.endGameVp)).toEqual([0, 0, 2, 2, 4, 8]);
    for (const space of IMPERIAL_PROGRESS.track) {
      expect(space.reward ?? "", `space ${space.space}`).not.toMatch(/coin/i);
    }
  });
});

describe("v1.1.5 Base Heat", () => {
  /** Spec §20 contribution math. */
  it.each([
    [["TEND", "TEND", "TEND"], 2],
    [["STOKE", "TEND", "TEND"], 3],
    [["BANK", "TEND", "TEND"], 1],
    [["STOKE", "BANK", "TEND"], 2],
    [["STOKE", "STOKE", "TEND"], 4],
    [["BANK", "BANK", "TEND"], 0],
  ] as Array<[ContributionCardId[], number]>)("resolves %s to Base Heat %i", (cards, expected) => {
    expect(determineBaseHeat(adjustments(...cards))).toBe(expected);
  });

  it("clamps rather than running past 0 and 5", () => {
    expect(determineBaseHeat(adjustments("STOKE", "STOKE", "STOKE"))).toBe(5);
    expect(determineBaseHeat(adjustments("BANK", "BANK", "BANK"))).toBe(0);
    expect(determineBaseHeat(adjustments("STOKE", "STOKE", "STOKE", "STOKE", "STOKE"))).toBe(5);
  });

  /** Spec §20, four players. */
  it.each([
    [["STOKE", "STOKE", "BANK", "TEND"], 3],
    [["BANK", "BANK", "STOKE", "TEND"], 1],
    [["STOKE", "STOKE", "STOKE", "BANK"], 4],
  ] as Array<[ContributionCardId[], number]>)("resolves a four-player %s to %i", (cards, expected) => {
    expect(determineBaseHeat(adjustments(...cards))).toBe(expected);
  });

  it("starts at 2 with an empty table and no adjustments", () => {
    expect(determineBaseHeat([])).toBe(2);
  });

  it("makes cooling cost exactly what heating costs", () => {
    expect(contributionWoodCost("BANK")).toBe(contributionWoodCost("STOKE"));
    expect(contributionWoodCost("TEND")).toBe(0);
  });
});

describe("v1.1.5 kiln layout", () => {
  /** Spec §5 and §20: 2P is 2 High / 1 Middle / 2 Low, covering 1 High and 1 Middle. */
  it.each([
    [2, [2, 1, 2], 5],
    [3, [2, 2, 2], 6],
    [4, [3, 2, 2], 7],
  ] as Array<[2 | 3 | 4, [number, number, number], number]>)(
    "activates %i-player spaces as %s",
    (playerCount, expected, total) => {
      const active = activeKilnSpaceIds(playerCount);
      expect(active.length).toBe(total);
      const zones = (["high", "middle", "low"] as const).map((zone) =>
        active.filter((spaceId) => KILN_SPACE_DEFINITIONS[spaceId].zone === zone).length);
      expect(zones).toEqual(expected);
    },
  );

  it("covers exactly 1 High and 1 Middle at two players", () => {
    const active = new Set(activeKilnSpaceIds(2));
    const covered = KILN_SPACE_IDS.filter((spaceId) => !active.has(spaceId));
    const zones = covered.map((spaceId) => KILN_SPACE_DEFINITIONS[spaceId].zone).sort();
    expect(zones).toEqual(["high", "middle"]);
  });

  it("leaves one Glaze unserved at every Base Heat", () => {
    for (let base = 0; base <= 5; base += 1) {
      const served = GLAZES.filter((glaze) =>
        [-1, 0, 1].some((zone) => base + zone === preferredHeat(glaze)));
      expect(served.length, `Base Heat ${base}`).toBeLessThan(GLAZES.length);
    }
  });
});
