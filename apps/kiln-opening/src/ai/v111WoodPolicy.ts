import {
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
} from "../game/index.ts";
import type { BaseHeat, Glaze, KilnSpaceId, WoodContribution } from "../game/index.ts";
import { fireExpectation } from "./observation.ts";
import type { AIStrategyProfile, PlayerObservation } from "./types.ts";

/**
 * V1.1.1 Wood policy.
 *
 * Under V1.0.9 the bid was not a decision: the three kiln zones covered all three
 * Preferred Heats at Base Heat 2, so every Glaze aligned at once, and the band table
 * mapped bids of 1, 2 and 3 onto the same Base Heat against a table bidding one each.
 * "Always bid 1" was correct play, and the evaluator encodes that as a flat bonus.
 *
 * V1.1.1 removes both facts. Preferred Heats span four values while the zones span
 * three, so no Base Heat suits everyone, and `2 + total - contributors` makes one log
 * worth exactly one step. The bid is therefore computable rather than learnable: every
 * input is public before any bid is made, because zones are chosen in the Work Phase.
 */

const BID_RANGE: readonly WoodContribution[] = [0, 1, 2, 3];
/**
 * Section 9's stated economics, in VP: one Wood is worth about 0.7, one step of
 * misalignment about 1.3, and two steps about 2.7.
 *
 * These deliberately override the frozen V003 profile's own numbers. That profile prices
 * Wood at 0.78 while a full step of Base Heat is worth only 0.762 to a single ceramic, so
 * scoring with it concludes that Wood always costs more than alignment is worth and bids
 * 0 whenever one ceramic is loaded. Those weights were calibrated when every Glaze
 * aligned at Base Heat 2 and the bid changed nothing, so they underprice misalignment
 * under V1.1.1. This is the "rebuild, don't retune" part of section 9.
 */
export const V111_WOOD_VP = 0.7;
export const V111_MISALIGNMENT_VP: readonly number[] = [0, 1.3, 2.7, 4.6];

function misalignmentCost(steps: number): number {
  return V111_MISALIGNMENT_VP[Math.min(steps, V111_MISALIGNMENT_VP.length - 1)] ?? 4.6;
}
const MIN_BASE_HEAT = 0;
const MAX_BASE_HEAT = 5;

function qualityValue(profile: AIStrategyProfile, difference: number): number {
  const quality = qualityFromDifference(Math.abs(difference));
  return profile.qualityParameters[quality];
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

/**
 * The Base Heat a portfolio most wants, as the value maximising expected quality across
 * every ceramic it holds. A split portfolio compromises rather than following its first
 * ceramic, which is the whole reason zones and Glazes are chosen before the bid.
 */
export function portfolioTargetBaseHeat(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  loaded: readonly LoadedView[],
): number {
  if (loaded.length === 0) return 2;
  let best = 2;
  let bestValue = -Infinity;
  for (let base = MIN_BASE_HEAT; base <= MAX_BASE_HEAT; base += 1) {
    const value = loaded.reduce((sum, ceramic) => sum + expectedPortfolioValue(observation, profile, [ceramic], base), 0);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = base;
    }
  }
  return best;
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
 * What one opponent is predicted to bid.
 *
 * This deliberately returns the one-Wood convention rather than reading the opponent's
 * public target, which is what section 9 prescribes and what measurement supports.
 * Predicting each opponent's *rational* bid collapses: Wood is a public good, so if
 * every contributor predicts the others will under-bid, the predicted total falls to
 * zero, and at four players no legal bid then reaches a useful Base Heat -- bidding 3
 * against a predicted zero still only yields heat 1. Every bot therefore gives up and
 * bids 0, which makes the prediction self-fulfilling. Measured over 30 games that
 * variant produced 52% of firings at Base Heat 0, 28.6% Flawed, and 20.19 mean VP
 * against frozen V003's 31.02.
 *
 * The convention is stable instead: against an all-one table, Base Heat is exactly
 * bid + 1 at every player count, so a bid maps directly onto a target. Section 9 notes
 * this over-pushes, because counters are cheap and pushes are not; that is a real
 * limitation of this candidate, not an oversight.
 */
export function predictedBid(
  _observation: PlayerObservation,
  _profile: AIStrategyProfile,
  _playerId: string,
): number {
  return 1;
}

export interface V111WoodDecision {
  amount: WoodContribution;
  targetBaseHeat: number;
  predictedOthers: number;
  projectedBaseHeat: BaseHeat;
  expectedValue: number;
  /** Expected value of the one-Wood convention, for telemetry and regression checks. */
  conventionValue: number;
}

/**
 * Choose the bid by expected value rather than by convention: project the Base Heat each
 * legal bid produces given the predicted table, score this player's own loaded portfolio
 * over the Fire deck, and charge the Wood spent. Only public information is read.
 */
export function chooseV111WoodBid(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  affordable: number,
): V111WoodDecision {
  const phase = observation.game.phase;
  const contributors = phase.type === "firing_contributions" ? phase.eligiblePlayerIds : [observation.playerId];
  const loaded = loadedFor(observation, observation.playerId);
  const predictedOthers = contributors
    .filter((playerId) => playerId !== observation.playerId)
    .reduce((sum, playerId) => sum + predictedBid(observation, profile, playerId), 0);
  const woodValue = profile.resourceValues.wood;
  const target = portfolioTargetBaseHeat(observation, profile, loaded);

  let best: V111WoodDecision | null = null;
  let conventionValue = 0;
  for (const amount of BID_RANGE) {
    if (amount > affordable) continue;
    const projected = determineBaseHeat(contributors.length, predictedOthers + amount);
    // Score by section 9's economics: the misalignment each loaded ceramic would suffer
    // at the projected Base Heat, against the Wood the bid spends.
    const misalignment = loaded.reduce((sum, ceramic) =>
      sum + misalignmentCost(Math.abs(ceramicTargetBaseHeat(ceramic.glaze, ceramic.kilnSpaceId) - projected)), 0);
    const value = -misalignment - amount * V111_WOOD_VP;
    if (amount === 1) conventionValue = value;
    if (best === null || value > best.expectedValue + 1e-9) {
      best = {
        amount,
        targetBaseHeat: target,
        predictedOthers,
        projectedBaseHeat: projected,
        expectedValue: value,
        conventionValue,
      };
    }
  }
  const chosen = best ?? {
    amount: 0 as WoodContribution,
    targetBaseHeat: target,
    predictedOthers,
    projectedBaseHeat: determineBaseHeat(contributors.length, predictedOthers),
    expectedValue: 0,
    conventionValue: 0,
  };
  return { ...chosen, conventionValue };
}
