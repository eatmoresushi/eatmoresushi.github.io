import { describe, expect, it } from "vitest";
import {
  GAME_CONFIG,
  IMPERIAL_ORDERS,
  MARKET_ORDERS,
  ORDER_DEFINITIONS,
  TECHNIQUES,
  activeKilnSpaceIds,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
} from "../src/game";
import type { Glaze, KilnSpaceId } from "../src/game";

const GLAZES: readonly Glaze[] = ["white", "celadon", "grey_green", "moon_white"];
const ZONE_MODIFIERS = [-1, 0, 1] as const;

function zoneCounts(playerCount: 2 | 3 | 4): [number, number, number] {
  const active = activeKilnSpaceIds(playerCount);
  const of = (prefix: string) => active.filter((id) => id.startsWith(prefix)).length;
  return [of("high"), of("middle"), of("low")];
}

describe("V1.1.1 authoritative content", () => {
  it("loads the V1.1.1 content versions, deck sizes, and Glaze heats", () => {
    expect(GAME_CONFIG.rulesVersion).toBe("1.1.1");
    expect(MARKET_ORDERS).toHaveLength(30);
    expect(IMPERIAL_ORDERS).toHaveLength(22);
    expect(TECHNIQUES).toHaveLength(15);
    expect(GAME_CONFIG.glazes).toEqual({ white: 1, celadon: 2, grey_green: 3, moon_white: 4 });
  });

  it("prices Techniques as printed in V1.1.1", () => {
    expect(Object.fromEntries(TECHNIQUES.map((tile) => [tile.id, tile.cost]))).toEqual({
      T01: 2, T02: 1, T03: 3, T04: 3, T05: 2, T06: 2, T08: 2, T09: 3,
      T10: 3, T11: 3, T12: 3, T13: 2, T14: 2, T15: 2, T16: 3,
    });
  });

  it("carries the four new Order cards with their printed values", () => {
    expect(ORDER_DEFINITIONS["M29"]).toMatchObject({ vp: 12, coins: 4, minQuality: "fine" });
    expect(ORDER_DEFINITIONS["M30"]).toMatchObject({ vp: 5, coins: 3, minQuality: "standard" });
    expect(ORDER_DEFINITIONS["I21"]).toMatchObject({ vp: 13, imperialProgressReward: 2, minQuality: "fine" });
    expect(ORDER_DEFINITIONS["I22"]).toMatchObject({ vp: 3, imperialProgressReward: 1, minQuality: "standard" });
  });

  it("applies the V1.1.1 Order value and text changes", () => {
    expect(ORDER_DEFINITIONS["I11"]).toMatchObject({ vp: 10, imperialProgressReward: 1 });
    for (const id of ["I08", "I10", "I13"]) {
      expect(ORDER_DEFINITIONS[id]!.imperialProgressReward).toBe(3);
    }
    expect(ORDER_DEFINITIONS["M18"]).toMatchObject({ vp: 11, coins: 5 });
    // I13's old "Celadon or Grey-Green" bucket no longer exists.
    expect(JSON.stringify(ORDER_DEFINITIONS["I13"])).not.toContain("grey_green");
    // I18 is Grey-Green only.
    expect(ORDER_DEFINITIONS["I18"]!.ceramics[0]).toMatchObject({ glaze: "grey_green" });
  });
});

describe("V1.1.1 Base Heat formula", () => {
  it.each([
    [3, 3, 2], [3, 2, 1], [3, 5, 4], [3, 1, 0],
    [4, 4, 2], [4, 8, 5], [1, 0, 1],
  ] as const)("maps %i contributors and %i Wood to Base Heat %i", (contributors, wood, expected) => {
    expect(determineBaseHeat(contributors, wood)).toBe(expected);
  });

  it.each([2, 3, 4] as const)(
    "makes all four Contribution cards distinct against an all-one table at %iP",
    (playerCount) => {
      const others = playerCount - 1;
      expect([0, 1, 2, 3].map((bid) => determineBaseHeat(playerCount, others + bid))).toEqual([1, 2, 3, 4]);
    },
  );

  it("clamps to 0 and 5 rather than running past them", () => {
    expect(determineBaseHeat(4, 0)).toBe(0);
    expect(determineBaseHeat(2, 40)).toBe(5);
    expect(determineBaseHeat(1, 0)).toBe(1);
  });
});

describe("V1.1.1 kiln and Glaze coverage", () => {
  it.each([
    [2, [2, 2, 1]], [3, [2, 2, 2]], [4, [3, 2, 2]],
  ] as const)("gives %iP the printed active zone counts", (playerCount, expected) => {
    expect(zoneCounts(playerCount)).toEqual(expected);
  });

  it("modifies zones by +1 / 0 / -1 as printed", () => {
    const modifiers: Record<string, number> = {};
    for (const id of activeKilnSpaceIds(4)) modifiers[id] = kilnZoneModifier(id as KilnSpaceId);
    expect(modifiers["high_1"]).toBe(1);
    expect(modifiers["middle_1"]).toBe(0);
    expect(modifiers["low_1"]).toBe(-1);
  });

  it.each([
    ["grey_green", 3, 0, 0], ["moon_white", 2, 1, 1], ["moon_white", 2, 0, 2],
  ] as const)("puts %s at Base %i with zone %i at difference %i", (glaze, base, zone, expected) => {
    expect(Math.abs(base + zone - preferredHeat(glaze))).toBe(expected);
  });

  /**
   * The defining property of V1.1.1: Preferred Heats span four values while the zones
   * span three, so no single Base Heat can align every Glaze at once. If this ever
   * passes trivially again, the Wood Contribution has stopped being a real decision.
   */
  it("leaves no Base Heat that serves all four Glazes", () => {
    const universal = [0, 1, 2, 3, 4, 5].filter((base) =>
      GLAZES.every((glaze) => ZONE_MODIFIERS.some((zone) => base + zone === preferredHeat(glaze))));
    expect(universal).toEqual([]);
  });

  it("still serves every Glaze at some Base Heat", () => {
    for (const glaze of GLAZES) {
      const reachable = [0, 1, 2, 3, 4, 5].some((base) =>
        ZONE_MODIFIERS.some((zone) => base + zone === preferredHeat(glaze)));
      expect(reachable, `${glaze} can never align`).toBe(true);
    }
  });
});
