import { SeededRandom, currentDecisionActor } from "../game/index.ts";
import type { GameState, PlayerId, PrivateFiringState } from "../game/index.ts";
import { getLegalAIActions } from "../ai/legalActions.ts";
import { createPlayerObservation } from "../ai/observation.ts";
import { HeuristicAIPolicy } from "../ai/policy.ts";
import { V115Policy, createV115Profile } from "../ai/v115Policy.ts";
import { createProductionV3Profile } from "../ai/productionProfile.ts";
import { AI_POLICY_V115_VERSION } from "../ai/types.ts";
import type { AIAction, AIDecisionContext, StrategyIntent } from "../ai/types.ts";
import type { StoredSeat } from "./types.ts";

/**
 * The policy online computer seats play.
 *
 * v1.1.4 replaced the numeric 0-3 Wood bid with three Contribution cards, so the policy is
 * built around Bank / Tend / Stoke rather than retuned. Frozen V003 cannot play this
 * ruleset at all -- it chooses a numeric bid that no longer exists -- and every room below
 * the current rules version is rejected by the version gate before reaching this code, so
 * the legacy path is retired rather than kept as a live branch.
 *
 * v1.1.5 keeps all of that and corrects Order valuation. The previous model charged a
 * multi-ceramic Order the product of single-attempt Quality probabilities, as though every
 * requirement had to land simultaneously on one firing; it predicted 25.6% for two-ceramic
 * Orders that complete 51.4% of the time and ranked them below one-ceramic Orders worth
 * half as much. Against this same policy without the correction: +7.00 pp win rate
 * (95% CI [2.11, 12.00], 450 matched pairs) and VP per completed Order 7.93 -> 9.02.
 */
export const ONLINE_COMPUTER_POLICY_VERSION = AI_POLICY_V115_VERSION;
/**
 * Retained so a stored pre-v1.1.5 seat still decodes. Rooms carrying it are rejected by
 * the rules-version gate, so it is never dispatched to a policy.
 */
export const LEGACY_ONLINE_COMPUTER_POLICY_VERSION = "selfplay-003" as const;

export function nextOnlineDecisionActor(state: GameState): PlayerId | null {
  const phase = state.phase;
  if (phase.type === "firing_contributions") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  if (phase.type === "presentation") {
    return phase.eligiblePlayerIds.find((id) => !phase.submittedPlayerIds.includes(id)) ?? null;
  }
  return currentDecisionActor(phase);
}

function inferredIntent(state: GameState, playerId: PlayerId): StrategyIntent {
  const player = state.players[playerId];
  if (player === undefined) return "Hybrid";
  const imperial = player.orderHand.filter((id) => id.startsWith("I")).length;
  const market = player.orderHand.length - imperial;
  if (imperial > market) return "Imperial";
  if (market > imperial) return "Market";
  if (player.techniques.length >= 2) return "Technique-economy";
  return "Hybrid";
}

/** Chooses from a sanitized observation; full hidden deck order never reaches the policy. */
export async function chooseOnlineComputerAction(
  state: GameState,
  privateState: PrivateFiringState,
  seat: StoredSeat,
): Promise<AIAction> {
  const seatPolicy = seat.aiPolicyVersion;
  if (!seat.isComputer || seatPolicy !== ONLINE_COMPUTER_POLICY_VERSION || seat.aiSeed === null) {
    throw new Error(`Seat ${seat.seatId} is not a configured v1.1.4 computer seat`);
  }
  const actorId = nextOnlineDecisionActor(state);
  if (actorId !== seat.playerId) throw new Error(`Computer ${seat.playerId} is not the current actor`);
  const legalActions = getLegalAIActions(state, seat.playerId, privateState);
  if (legalActions.length === 0) throw new Error(`Computer ${seat.playerId} has no legal action`);
  const observation = createPlayerObservation(state, seat.playerId, privateState);
  const policySeed = (seat.aiSeed ^ Math.imul(state.revision + 1, 0x9e37_79b9)) >>> 0;
  const context: AIDecisionContext = {
    gameSequence: 0,
    decisionIndex: state.revision + 1,
    learningPhase: "mature",
    assignedTradition: state.players[seat.playerId]?.kilnId ?? "RU",
    assignedIntent: inferredIntent(state, seat.playerId),
    explorationRate: 0,
    mode: "live",
  };
  const rng = new SeededRandom(policySeed);
  const policy = new V115Policy(createV115Profile(state.playerCount), rng);
  const decision = await policy.chooseAction(observation, legalActions, context);
  return decision.action;
}
