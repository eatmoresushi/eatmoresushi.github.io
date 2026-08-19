import { GAME_CONFIG, KILN_SPACE_DEFINITIONS } from "./content.ts";
import type { BaseHeat, Glaze, KilnSpaceId, Quality } from "./types.ts";

/**
 * V1.1.1 replaces the contributor-scaled band table with a formula:
 * `clamp(2 + (totalWood - contributorCount), 0, 5)`. Contributors are players with at
 * least one ceramic in the kiln, including any who bid 0. One extra log is now worth
 * exactly one step of Base Heat at every player count, which is what makes bids of
 * 0-3 four distinct choices rather than the two the band table collapsed them into.
 */
export function determineBaseHeat(contributorCount: number, totalWood: number): BaseHeat {
  if (!Number.isInteger(contributorCount) || contributorCount < 1) {
    throw new RangeError("contributorCount must be at least 1");
  }
  if (!Number.isInteger(totalWood) || totalWood < 0) {
    throw new RangeError("totalWood must be a non-negative integer");
  }
  return Math.min(5, Math.max(0, 2 + totalWood - contributorCount)) as BaseHeat;
}

export function qualityFromDifference(difference: number): Quality {
  if (!Number.isInteger(difference) || difference < 0) {
    throw new RangeError("Heat Difference must be a non-negative integer");
  }
  if (difference === 0) return "masterpiece";
  if (difference === 1) return "fine";
  if (difference === 2) return "standard";
  return "flawed";
}

export function preferredHeat(glaze: Glaze): number {
  return GAME_CONFIG.glazes[glaze];
}

export function kilnZoneModifier(kilnSpaceId: KilnSpaceId): -1 | 0 | 1 {
  return KILN_SPACE_DEFINITIONS[kilnSpaceId].modifier;
}

export const QUALITY_RANK: Record<Quality, number> = {
  flawed: 0,
  standard: 1,
  fine: 2,
  masterpiece: 3,
};
