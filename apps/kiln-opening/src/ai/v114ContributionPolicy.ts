import {
  CONTRIBUTION_CARD_IDS,
  contributionHeatAdjustment,
  contributionWoodCost,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "../game/index.ts";
import type { BaseHeat, ContributionCardId, Glaze, KilnSpaceId } from "../game/index.ts";
import { fireExpectation } from "./observation.ts";
import type { AIStrategyProfile, PlayerObservation } from "./types.ts";

/**
 * v1.1.4 Contribution policy.
 *
 * Each player with a ceramic in the kiln reveals one of Bank (-1 Heat, 1 Wood),
 * Tend (0, 0) or Stoke (+1, 1), and Base Heat is `clamp(2 + sum of adjustments, 0, 5)`.
 *
 * Two properties of that cost curve drive the whole policy. Cooling and heating cost the
 * same, so there is no cheap defection to drift toward; and the neutral card is free, so
 * "everyone Tends" is a prediction nobody is individually paid to abandon. That makes
 * Tend a stable model of the rest of the table -- unlike the pre-v1.1.4 numeric bid,
 * where the convention was strictly dominated by under-bidding and the prediction
 * collapsed to a cold kiln.
 *
 * Section 17 also requires that a bot must not assume it can reach Base 4 alone: from the
 * neutral 2 a single Stoke reaches 3, and only Fuel Ledger's upgrade reaches 4.
 */

/** VP-denominated economics, matching the measured value of a step of misalignment. */
export const CONTRIBUTION_WOOD_VP = 0.7;
export const MISALIGNMENT_VP: readonly number[] = [0, 1.3, 2.7, 4.6];

function misalignmentCost(steps: number): number {
  return MISALIGNMENT_VP[Math.min(steps, MISALIGNMENT_VP.length - 1)] ?? 4.6;
}

function qualityValue(profile: AIStrategyProfile, difference: number): number {
  return profile.qualityParameters[qualityFromDifference(Math.abs(difference))];
}

/** The Base Heat at which a loaded ceramic's Glaze aligns in the zone it already sits in. */
export function ceramicTargetBaseHeat(glaze: Glaze, kilnSpaceId: KilnSpaceId): number {
  return preferredHeat(glaze) - kilnZoneModifier(kilnSpaceId);
}

interface LoadedView {
  glaze: Glaze;
  kilnSpaceId: KilnSpaceId;
}

function loadedFor(observation: PlayerObservation, playerId: string): LoadedView[] {
  return Object.values(observation.game.ceramics).flatMap((ceramic) =>
    ceramic.ownerId === playerId && ceramic.stage === "loaded"
      ? [{ glaze: ceramic.glaze, kilnSpaceId: ceramic.kilnSpaceId }]
      : []);
}

/** Expected quality value of a portfolio at a Base Heat, averaged over the Fire deck. */
export function expectedPortfolioValue(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  loaded: readonly LoadedView[],
  baseHeat: number,
): number {
  const cards = fireExpectation(observation);
  return loaded.reduce((sum, ceramic) => {
    const zone = kilnZoneModifier(ceramic.kilnSpaceId);
    const preferred = preferredHeat(ceramic.glaze);
    return sum + cards.reduce((expected, card) =>
      expected + card.probability * qualityValue(profile, baseHeat + card.modifier + zone - preferred), 0);
  }, 0);
}

/**
 * What every other contributor is predicted to reveal.
 *
 * Tend is both free and neutral, so predicting it is self-consistent: an opponent has no
 * cost incentive to deviate, only an alignment one. Opponents' zones and Glazes are public
 * before any card is chosen, so a caller wanting a sharper read can consult them; the
 * baseline deliberately stays on the focal card.
 */
export function predictedCard(
  _observation: PlayerObservation,
  _playerId: string,
): ContributionCardId {
  return "TEND";
}

export interface ContributionDecision {
  card: ContributionCardId;
  targetBaseHeat: number;
  predictedOthers: number;
  projectedBaseHeat: BaseHeat;
  expectedValue: number;
  /** Expected value of the neutral card, for telemetry and regression checks. */
  conventionValue: number;
}

/**
 * Choose the Contribution card by expected value: project the Base Heat each card would
 * produce against a Tend-ing table, score this player's own loaded portfolio, and charge
 * the card's printed Wood cost. Only public information is read.
 */
export function chooseContributionCard(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  affordableWood: number,
): ContributionDecision {
  const phase = observation.game.phase;
  const contributors = phase.type === "firing_contributions" ? phase.eligiblePlayerIds : [observation.playerId];
  const loaded = loadedFor(observation, observation.playerId);
  const predictedOthers = contributors
    .filter((playerId) => playerId !== observation.playerId)
    .reduce((sum, playerId) => sum + contributionHeatAdjustment(predictedCard(observation, playerId)), 0);

  let best: ContributionDecision | null = null;
  let conventionValue = 0;
  for (const card of CONTRIBUTION_CARD_IDS) {
    const cost = contributionWoodCost(card);
    if (cost > affordableWood) continue;
    const projected = determineBaseHeat([predictedOthers, contributionHeatAdjustment(card)]);
    const misalignment = loaded.reduce((sum, ceramic) =>
      sum + misalignmentCost(Math.abs(ceramicTargetBaseHeat(ceramic.glaze, ceramic.kilnSpaceId) - projected)), 0);
    const value = -misalignment - cost * CONTRIBUTION_WOOD_VP;
    if (card === "TEND") conventionValue = value;
    // Ties resolve to the first card that reaches this value, and CONTRIBUTION_CARD_IDS is
    // Bank / Tend / Stoke, so a tie between paying and not paying keeps the Wood.
    if (best === null || value > best.expectedValue + 1e-9) {
      best = {
        card,
        targetBaseHeat: portfolioTargetBaseHeat(observation, profile, loaded),
        predictedOthers,
        projectedBaseHeat: projected,
        expectedValue: value,
        conventionValue,
      };
    }
  }
  const chosen = best ?? {
    card: "TEND" as ContributionCardId,
    targetBaseHeat: 2,
    predictedOthers,
    projectedBaseHeat: determineBaseHeat([predictedOthers]),
    expectedValue: 0,
    conventionValue: 0,
  };
  return { ...chosen, conventionValue };
}

/**
 * The Base Heat a portfolio most wants, as the value maximising expected quality across
 * every ceramic it holds. Reported for telemetry; the card choice is scored directly.
 */
export function portfolioTargetBaseHeat(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  loaded: readonly LoadedView[],
): number {
  if (loaded.length === 0) return 2;
  let best = 2;
  let bestValue = -Infinity;
  // Scan outward from the neutral Base Heat so ties settle on the focal value rather than
  // on the numerically lowest one, which would bias every indifferent portfolio cold.
  for (const base of [2, 1, 3, 0, 4, 5]) {
    const value = expectedPortfolioValue(observation, profile, loaded, base);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = base;
    }
  }
  return best;
}
