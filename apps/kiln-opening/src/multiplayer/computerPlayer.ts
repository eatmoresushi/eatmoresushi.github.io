import { SeededRandom, currentDecisionActor } from "../game/index.ts";
import type { GameState, PlayerId, PrivateFiringState } from "../game/index.ts";
import { getLegalAIActions } from "../ai/legalActions.ts";
import { createPlayerObservation } from "../ai/observation.ts";
import { HeuristicAIPolicy } from "../ai/policy.ts";
import { createProductionV3Profile } from "../ai/productionProfile.ts";
import type { AIAction, AIDecisionContext, StrategyIntent } from "../ai/types.ts";
import type { StoredSeat } from "./types.ts";

export const ONLINE_COMPUTER_POLICY_VERSION = "selfplay-003" as const;

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
  if (!seat.isComputer || seat.aiPolicyVersion !== ONLINE_COMPUTER_POLICY_VERSION || seat.aiSeed === null) {
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
  const decision = await new HeuristicAIPolicy(
    createProductionV3Profile(state.playerCount),
    new SeededRandom(policySeed),
  ).chooseAction(observation, legalActions, context);
  return decision.action;
}
