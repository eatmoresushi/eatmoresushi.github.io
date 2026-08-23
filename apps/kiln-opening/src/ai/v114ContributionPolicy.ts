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
 * v1.1.4 Contribution policy, derived for this ruleset rather than ported from the
 * numeric-bid era.
 *
 * Three facts about v1.1.4 drive the whole decision, and the earlier bid policy could use
 * none of them:
 *
 * 1. A card moves Base Heat by at most one step, and Bank and Stoke cost the same. The
 *    choice is therefore about *direction*, not about how much to spend, and there is no
 *    cheap defection to drift toward.
 * 2. Every contributor's ceramics are already on the board when cards are chosen, and
 *    zones are public. Section 8 says so outright: each loaded ceramic announces the Base
 *    Heat its owner wants. Opponents' intentions are readable, not guessable.
 * 3. The Fire discard is public and counting it is an intended skill, so the Fire
 *    distribution is the *remaining* deck rather than a static prior.
 *
 * The policy is a one-level model: it predicts each opponent's card by asking what that
 * opponent's own ceramics want against a neutral kiln, and never by asking what they
 * predict of anyone else. That bound is deliberate. Under the previous ruleset a recursive
 * "predict their rational bid" model collapsed -- each agent predicted the others would
 * under-bid, the predicted total fell to zero, and the prediction became self-fulfilling
 * at 52% of firings on Base Heat 0. Reading a fixed, public board state cannot spiral that
 * way because nothing in the model depends on the model.
 *
 * Everything is scored in the profile's own units. Wood is charged at
 * `profile.resourceValues.wood` and heat outcomes at `profile.qualityParameters`, so the
 * comparison is self-consistent rather than mixing a hand-set VP scale with profile
 * weights. A single ceramic rarely justifies paying for a step; two or three usually do,
 * which is the behaviour the rules intend.
 */

/** Base Heat with no contributions at all, and the value a neutral table lands on. */
const NEUTRAL_BASE_HEAT = 2;

interface Placement {
  glaze: Glaze;
  kilnSpaceId: KilnSpaceId;
}

function loadedFor(observation: PlayerObservation, playerId: string): Placement[] {
  return Object.values(observation.game.ceramics).flatMap((ceramic) =>
    ceramic.ownerId === playerId && ceramic.stage === "loaded"
      ? [{ glaze: ceramic.glaze, kilnSpaceId: ceramic.kilnSpaceId }]
      : []);
}

/** The Base Heat at which a loaded ceramic's Glaze is exact in the zone it already sits in. */
export function ceramicTargetBaseHeat(glaze: Glaze, kilnSpaceId: KilnSpaceId): number {
  return preferredHeat(glaze) - kilnZoneModifier(kilnSpaceId);
}

/**
 * Expected quality value of a set of placements at a Base Heat, averaged over the Fire
 * cards that remain in the deck.
 */
export function expectedPortfolioValue(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  loaded: readonly Placement[],
  baseHeat: number,
): number {
  const cards = fireExpectation(observation);
  return loaded.reduce((sum, ceramic) => {
    const zone = kilnZoneModifier(ceramic.kilnSpaceId);
    const preferred = preferredHeat(ceramic.glaze);
    return sum + cards.reduce((expected, card) => {
      const quality = qualityFromDifference(Math.abs(baseHeat + card.modifier + zone - preferred));
      return expected + card.probability * profile.qualityParameters[quality];
    }, 0);
  }, 0);
}

/**
 * How likely an opponent is to reveal each card, judged from their own public board.
 *
 * A point prediction is the wrong shape here. Measured against frozen V003 over 1,273
 * revealed cards, an argmax model predicted Tend every single time -- correct 77-82% of
 * the time, but never anticipating the 17% of Stokes, and therefore systematically
 * under-anticipating a warming kiln. Being right four times in five while being blind to
 * the whole error distribution is worse than being calibrated.
 *
 * So this returns a distribution. Each card's weight is exponential in the net gain that
 * card would give *that opponent's* ceramics against a neutral kiln, at a temperature of
 * one Wood -- the natural scale of the decision, since one Wood is exactly what a step
 * costs. Cards the opponent cannot pay for get no weight.
 *
 * It stays one level deep: it asks only what an opponent's ceramics want, never what that
 * opponent believes about anyone else. That bound matters. Under the previous ruleset a
 * recursive model collapsed -- every agent predicted the others would under-bid, the
 * predicted total fell to zero, and the belief became self-fulfilling at 52% of firings on
 * Base Heat 0. Reading a fixed, public board cannot spiral, because nothing in the model
 * depends on the model.
 */
export function predictOpponentDistribution(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  opponentId: string,
): Array<{ adjustment: number; probability: number }> {
  const loaded = loadedFor(observation, opponentId);
  if (loaded.length === 0) return [{ adjustment: 0, probability: 1 }];
  const wood = observation.game.players[opponentId]?.resources.wood ?? 0;
  const neutral = expectedPortfolioValue(observation, profile, loaded, NEUTRAL_BASE_HEAT);
  const temperature = Math.max(1e-6, profile.resourceValues.wood);
  const weighted = CONTRIBUTION_CARD_IDS.flatMap((card) => {
    const cost = contributionWoodCost(card);
    if (cost > wood) return [];
    const adjustment = contributionHeatAdjustment(card);
    const gain = expectedPortfolioValue(observation, profile, loaded, NEUTRAL_BASE_HEAT + adjustment)
      - neutral - cost * profile.resourceValues.wood;
    return [{ adjustment, weight: Math.exp(gain / temperature) }];
  });
  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) return [{ adjustment: 0, probability: 1 }];
  return weighted.map(({ adjustment, weight }) => ({ adjustment, probability: weight / total }));
}

/** The single most likely opponent card. Retained for telemetry and diagnostics. */
export function predictOpponentCard(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  opponentId: string,
): ContributionCardId {
  const distribution = predictOpponentDistribution(observation, profile, opponentId);
  const best = distribution.reduce((a, b) => (b.probability > a.probability ? b : a));
  return best.adjustment < 0 ? "BANK" : best.adjustment > 0 ? "STOKE" : "TEND";
}

/**
 * Distribution over the summed Heat adjustment of everyone except this player, by
 * convolving the per-opponent distributions. Opponents choose independently and in secret,
 * so the convolution is the right combination.
 */
function opponentTotalDistribution(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  opponentIds: readonly string[],
): Array<{ adjustment: number; probability: number }> {
  let totals = new Map<number, number>([[0, 1]]);
  for (const opponentId of opponentIds) {
    const next = new Map<number, number>();
    for (const [runningTotal, runningProbability] of totals) {
      for (const { adjustment, probability } of predictOpponentDistribution(observation, profile, opponentId)) {
        const key = runningTotal + adjustment;
        next.set(key, (next.get(key) ?? 0) + runningProbability * probability);
      }
    }
    totals = next;
  }
  return [...totals].map(([adjustment, probability]) => ({ adjustment, probability }));
}

export interface ContributionDecision {
  card: ContributionCardId;
  /** The Base Heat this player's own ceramics most want. */
  targetBaseHeat: number;
  /** Summed Heat adjustment predicted from the rest of the table. */
  predictedOthers: number;
  projectedBaseHeat: BaseHeat;
  expectedValue: number;
  /** Expected value of the neutral card, for telemetry and regression checks. */
  conventionValue: number;
  /** Whether the score assumed a Fuel Ledger upgrade on a revealed Stoke. */
  assumesFuelLedger: boolean;
}

function ownsReadyFuelLedger(observation: PlayerObservation): boolean {
  const player = observation.game.players[observation.playerId];
  const technique = player?.techniques.find(({ id }) => id === "T11");
  return technique !== undefined && !technique.exhausted;
}

/**
 * Choose a Contribution card by expected value: predict the table from its public board,
 * project the Base Heat each affordable card would produce, score this player's own
 * ceramics over the remaining Fire deck, and charge the card's printed Wood cost.
 */
export function chooseContributionCard(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  affordableWood: number,
): ContributionDecision {
  const phase = observation.game.phase;
  const contributors = phase.type === "firing_contributions" ? phase.eligiblePlayerIds : [observation.playerId];
  const loaded = loadedFor(observation, observation.playerId);
  const woodValue = profile.resourceValues.wood;

  const opponentIds = contributors.filter((playerId) => playerId !== observation.playerId);
  const opponentTotals = opponentTotalDistribution(observation, profile, opponentIds);
  const predictedOthers = opponentTotals.reduce(
    (sum, { adjustment, probability }) => sum + adjustment * probability, 0);

  // Fuel Ledger turns a revealed Stoke into +2 for 2 more Wood, resolved in its own window
  // after the reveal. The card choice has to anticipate it, because Stoke is the only card
  // it can upgrade -- and it is the only unilateral route past a single step.
  const ledgerAvailable = ownsReadyFuelLedger(observation) &&
    affordableWood >= contributionWoodCost("STOKE") + 2;

  const targetBaseHeat = bestBaseHeatFor(observation, profile, loaded);
  let best: ContributionDecision | null = null;
  let conventionValue = 0;

  for (const card of CONTRIBUTION_CARD_IDS) {
    const cost = contributionWoodCost(card);
    if (cost > affordableWood) continue;
    for (const useLedger of card === "STOKE" && ledgerAvailable ? [false, true] : [false]) {
      const adjustment = contributionHeatAdjustment(card) + (useLedger ? 1 : 0);
      const spend = cost + (useLedger ? 2 : 0);
      // Score across every Base Heat the table might produce, not just the modal one. A
      // card that is excellent at the expected heat but ruinous one step either side is
      // worse than a card that is merely good across the spread.
      const value = opponentTotals.reduce((sum, { adjustment: others, probability }) =>
        sum + probability * expectedPortfolioValue(
          observation, profile, loaded, determineBaseHeat([others, adjustment]),
        ), 0) - spend * woodValue;
      const projected = determineBaseHeat([Math.round(predictedOthers), adjustment]);
      if (card === "TEND") conventionValue = value;
      // Ties keep the Wood: a strictly cheaper card that scores the same is preferred, and
      // CONTRIBUTION_CARD_IDS is ordered Bank / Tend / Stoke so the neutral card wins a
      // tie against a paid one without needing a special case.
      const better = best === null || value > best.expectedValue + 1e-9 ||
        (Math.abs(value - best.expectedValue) <= 1e-9 && spend < woodSpent(best));
      if (better) {
        best = {
          card,
          targetBaseHeat,
          predictedOthers,
          projectedBaseHeat: projected,
          expectedValue: value,
          conventionValue,
          assumesFuelLedger: useLedger,
        };
      }
    }
  }

  const chosen = best ?? {
    card: "TEND" as ContributionCardId,
    targetBaseHeat,
    predictedOthers,
    projectedBaseHeat: determineBaseHeat([predictedOthers]),
    expectedValue: 0,
    conventionValue: 0,
    assumesFuelLedger: false,
  };
  return { ...chosen, conventionValue };
}

function woodSpent(decision: ContributionDecision): number {
  return contributionWoodCost(decision.card) + (decision.assumesFuelLedger ? 2 : 0);
}

/**
 * The Base Heat this player's own ceramics most want, ignoring what it would cost to get
 * there. Reported for telemetry; the card choice is scored directly rather than steered
 * toward this value.
 */
export function bestBaseHeatFor(
  observation: PlayerObservation,
  profile: AIStrategyProfile,
  loaded: readonly Placement[],
): number {
  if (loaded.length === 0) return NEUTRAL_BASE_HEAT;
  let best = NEUTRAL_BASE_HEAT;
  let bestValue = -Infinity;
  // Scan outward from neutral so an indifferent portfolio reports the focal value rather
  // than the numerically lowest one.
  for (const base of [2, 1, 3, 0, 4, 5]) {
    const value = expectedPortfolioValue(observation, profile, loaded, base);
    if (value > bestValue + 1e-9) {
      bestValue = value;
      best = base;
    }
  }
  return best;
}
