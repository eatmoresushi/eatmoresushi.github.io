import { GAME_CONFIG, KILN_SPACE_DEFINITIONS } from "./content.ts";
import type { Glaze, KilnSpaceId, Quality } from "./types.ts";

export function determineBaseHeat(contributorCount: number, totalWood: number): 1 | 2 | 3 {
  if (!Number.isInteger(contributorCount) || contributorCount < 1) {
    throw new RangeError("contributorCount must be at least 1");
  }
  if (!Number.isInteger(totalWood) || totalWood < 0) {
    throw new RangeError("totalWood must be a non-negative integer");
  }
  if (totalWood < contributorCount) return 1;
  if (contributorCount === 1 ? totalWood <= 2 : totalWood <= contributorCount + 2) return 2;
  return 3;
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
