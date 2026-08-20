import { describe, expect, it } from "vitest";
import { determineBaseHeat, kilnZoneModifier, preferredHeat } from "../src/game";
import type { Glaze, KilnSpaceId } from "../src/game";
import {
  V111_MISALIGNMENT_VP,
  V111_WOOD_VP,
  ceramicTargetBaseHeat,
  predictedBid,
} from "../src/ai/v111WoodPolicy.ts";
import type { AIStrategyProfile, PlayerObservation } from "../src/ai/types.ts";

describe("V1.1.1 Wood policy reasoning", () => {
  it.each([
    ["white", "middle_1", 1], ["white", "low_1", 2], ["white", "high_1", 0],
    ["celadon", "middle_1", 2], ["grey_green", "middle_1", 3], ["grey_green", "high_1", 2],
    ["moon_white", "middle_1", 4], ["moon_white", "high_1", 3], ["moon_white", "low_1", 5],
  ] as const)("targets Base Heat %s in %s at %i", (glaze, space, expected) => {
    expect(ceramicTargetBaseHeat(glaze as Glaze, space as KilnSpaceId)).toBe(expected);
  });

  it("derives the target as Preferred Heat minus the zone modifier", () => {
    for (const glaze of ["white", "celadon", "grey_green", "moon_white"] as const) {
      for (const space of ["low_1", "middle_1", "high_1"] as const) {
        expect(ceramicTargetBaseHeat(glaze, space))
          .toBe(preferredHeat(glaze) - kilnZoneModifier(space));
      }
    }
  });

  /**
   * The bid that reaches a target is target - 1, because against a table bidding one
   * each the formula gives Base Heat = bid + 1 at every player count. This is the
   * property that makes the bid computable rather than learnable.
   */
  it.each([2, 3, 4] as const)("reaches target T by bidding T-1 at %iP", (playerCount) => {
    for (const target of [1, 2, 3, 4]) {
      const bid = target - 1;
      expect(determineBaseHeat(playerCount, (playerCount - 1) + bid)).toBe(target);
    }
  });

  /**
   * Predicting each opponent's rational bid collapses: Wood is a public good, so mutual
   * under-prediction drives the predicted total to zero, and at 4P no legal bid then
   * reaches a useful Base Heat. The convention anchor is what keeps the model stable.
   */
  it("anchors opponent prediction on the one-Wood convention", () => {
    const stub = {} as PlayerObservation;
    const profile = {} as AIStrategyProfile;
    expect(predictedBid(stub, profile, "P2")).toBe(1);
    // A predicted total of 0 would leave even a maximum bid short at four players.
    expect(determineBaseHeat(4, 0 + 3)).toBe(1);
    // The convention keeps every bid meaningful instead.
    expect([0, 1, 2, 3].map((bid) => determineBaseHeat(4, 3 + bid))).toEqual([1, 2, 3, 4]);
  });

  /**
   * V003's own weights price Wood at 0.78 while a full step of Base Heat is worth 0.762
   * to a single ceramic, so scoring with them bids 0 whenever one ceramic is loaded.
   * Section 9's economics must dominate, or the policy underbids by construction.
   */
  it("prices misalignment above Wood, unlike the frozen V003 weights", () => {
    expect(V111_MISALIGNMENT_VP[1]!).toBeGreaterThan(V111_WOOD_VP);
    expect(V111_MISALIGNMENT_VP[2]!).toBeGreaterThan(2 * V111_WOOD_VP);
    // Monotonic: further from target is never cheaper.
    for (let steps = 1; steps < V111_MISALIGNMENT_VP.length; steps += 1) {
      expect(V111_MISALIGNMENT_VP[steps]!).toBeGreaterThan(V111_MISALIGNMENT_VP[steps - 1]!);
    }
  });
});
