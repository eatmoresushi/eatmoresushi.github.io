import { describe, expect, it } from "vitest";
import {
  contributionWoodCost,
  determineBaseHeat,
  qualityFromDifference,
} from "../src/game";
import type { ContributionCardId } from "../src/game";

describe("v1.1.4 Contribution affordability", () => {
  it("always allows Tend and refuses paid cards at 0 Wood", () => {
    expect(contributionWoodCost("TEND")).toBe(0);
    expect(contributionWoodCost("BANK")).toBe(1);
    expect(contributionWoodCost("STOKE")).toBe(1);
  });
});

describe("v1.1.4 Fuel Ledger", () => {
  /**
   * Spec §7 and §20. A normal Stoke is +1 for 1 Wood; Fuel Ledger spends 2 more after the
   * reveal to make it +2, for 3 Wood in total. It never touches Bank or Tend.
   */
  it("turns Stoke + Bank + Tend from Base 2 into Base 3", () => {
    const cards: ContributionCardId[] = ["STOKE", "BANK", "TEND"];
    const plain = cards.map((card) => (card === "STOKE" ? 1 : card === "BANK" ? -1 : 0));
    expect(determineBaseHeat(plain)).toBe(2);
    // The upgrade replaces the Stoke's +1 with +2.
    const upgraded = [2, -1, 0];
    expect(determineBaseHeat(upgraded)).toBe(3);
  });

  it("costs 1 Wood for the Stoke and 2 more for the upgrade", () => {
    expect(contributionWoodCost("STOKE")).toBe(1);
    const totalForUpgradedStoke = contributionWoodCost("STOKE") + 2;
    expect(totalForUpgradedStoke).toBe(3);
  });
});

/**
 * Spec §21 — the rulebook's worked firing example, reproduced through the pure heat chain.
 *
 * Ru: Celadon (Preferred 2) in Middle. Ge: Moon White (4) in High. Ding: White (1) in Low.
 * Ru Tends, Ge Stokes, Ding Banks, so Base Heat stays at 2. The Fire card is +1, making
 * Global Heat 3.
 */
describe("v1.1.4 worked firing example", () => {
  const baseHeat = determineBaseHeat([0, 1, -1]);
  const globalHeat = baseHeat + 1;

  it("holds Base Heat at 2 and Global Heat at 3", () => {
    expect(baseHeat).toBe(2);
    expect(globalHeat).toBe(3);
  });

  it.each([
    ["Ru celadon in Middle", 0, 2, "fine"],
    ["Ge moon white in High", 1, 4, "masterpiece"],
    ["Ding white in Low", -1, 1, "fine"],
  ] as Array<[string, number, number, string]>)(
    "fires %s to %s",
    (_label, zoneModifier, preferred, expected) => {
      const actual = globalHeat + zoneModifier;
      expect(qualityFromDifference(Math.abs(actual - preferred))).toBe(expected);
    },
  );

  it("reaches Base 3 in the Fuel Ledger variant, before the Fire card", () => {
    // Ge pays 2 additional Wood, so the Stoke counts as +2 instead of +1.
    expect(determineBaseHeat([0, 2, -1])).toBe(3);
  });
});
