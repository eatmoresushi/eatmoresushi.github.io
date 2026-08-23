import { BASE_HEAT_START, CONTRIBUTION_CARD_DEFINITIONS, GAME_CONFIG, KILN_SPACE_DEFINITIONS } from "./content.ts";
import type { BaseHeat, ContributionCardId, Glaze, KilnSpaceId, Quality } from "./types.ts";

/**
 * v1.1.4 Base Heat: `clamp(2 + sum of revealed Heat adjustments, 0, 5)`.
 *
 * There is no contributor-count term and no rebate. Each player with a ceramic in the kiln
 * reveals one card and pays its printed Wood cost, so cooling costs exactly what heating
 * costs and the neutral card is free.
 */
export function determineBaseHeat(heatAdjustments: readonly number[]): BaseHeat {
  for (const adjustment of heatAdjustments) {
    if (!Number.isInteger(adjustment)) {
      throw new RangeError("Every Heat adjustment must be an integer");
    }
  }
  const total = heatAdjustments.reduce((sum, adjustment) => sum + adjustment, 0);
  return Math.min(5, Math.max(0, BASE_HEAT_START + total)) as BaseHeat;
}

/** Printed Heat adjustment of a Contribution card. */
export function contributionHeatAdjustment(card: ContributionCardId): number {
  return CONTRIBUTION_CARD_DEFINITIONS[card].heatAdjustment;
}

/** Printed Wood cost of a Contribution card. Tend is free and always affordable. */
export function contributionWoodCost(card: ContributionCardId): number {
  return CONTRIBUTION_CARD_DEFINITIONS[card].woodCost;
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

/**
 * Kiln Tradition activation costs, in Wood.
 *
 * Both were previously module-private in `engine.ts` with hand-copied duplicates in
 * `src/ai/evaluator.ts`, so a repricing updated the engine and left the AI valuing the old
 * number. They live here now and are imported by both.
 */
/** Extra Wood a revealed Stoke pays to become +2 Heat instead of +1. */
export const FUEL_LEDGER_WOOD = 1;

export const JUN_ACTIVATION_WOOD = 2;
export const GE_ACTIVATION_WOOD = 1;
