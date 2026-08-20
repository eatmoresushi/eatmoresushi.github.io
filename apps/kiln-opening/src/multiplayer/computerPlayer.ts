import { SeededRandom, currentDecisionActor } from "../game/index.ts";
import type { GameState, PlayerId, PrivateFiringState } from "../game/index.ts";
import { getLegalAIActions } from "../ai/legalActions.ts";
import { createPlayerObservation } from "../ai/observation.ts";
import { HeuristicAIPolicy } from "../ai/policy.ts";
import { V111Policy, createV111Profile } from "../ai/v111Policy.ts";
import { createProductionV3Profile } from "../ai/productionProfile.ts";
import { AI_POLICY_V111_VERSION } from "../ai/types.ts";
import type { AIAction, AIDecisionContext, StrategyIntent } from "../ai/types.ts";
import type { StoredSeat } from "./types.ts";

/**
 * The policy the online computer seats play. Promoted from frozen V003 to the V1.1.1
 * Wood candidate: V003 was trained when every Glaze aligned at Base Heat 2 and the bid
 * changed nothing, so it bids exactly 1 in 100% of firings and never uses the 0-5 range
 * V1.1.1 opened. Measured at +0.577 focal VP over 300 matched pairs on disjoint seeds.
 */
export const ONLINE_COMPUTER_POLICY_VERSION = AI_POLICY_V111_VERSION;
/** Seats created before the promotion keep playing V003 for the rest of their game. */
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
  const supported = seatPolicy === ONLINE_COMPUTER_POLICY_VERSION ||
    seatPolicy === LEGACY_ONLINE_COMPUTER_POLICY_VERSION;
  if (!seat.isComputer || !supported || seat.aiSeed === null) {
    throw new Error(`Seat ${seat.seatId} is not a configured V003 computer`);
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
  // A seat plays the policy it was created with, so a game already in flight never
  // changes opponent behaviour underneath its players.
  const rng = new SeededRandom(policySeed);
  const policy = seatPolicy === LEGACY_ONLINE_COMPUTER_POLICY_VERSION
    ? new HeuristicAIPolicy(createProductionV3Profile(state.playerCount), rng)
    : new V111Policy(createV111Profile(state.playerCount), rng);
  const decision = await policy.chooseAction(observation, legalActions, context);
  return decision.action;
}
