import {
  GAME_CONFIG,
  activeImperialTrackRules,
  junActivationCoinCost,
} from "../game/index.ts";
import type { FireModifier, GameState, PlayerId, PrivateFiringState } from "../game/index.ts";
import { projectPublicGameState } from "../multiplayer/projection.ts";
import type { PendingContribution } from "../multiplayer/types.ts";
import type { PlayerObservation } from "./types.ts";

const FIRE_VALUES = [-2, -1, 0, 1, 2] as const;

export function createPlayerObservation(
  state: GameState,
  playerId: PlayerId,
  privateFiringState: PrivateFiringState,
): PlayerObservation {
  const ownAmount = privateFiringState.contributions[playerId];
  const normalizedOwnAmount = typeof ownAmount === "number" ? ownAmount : ownAmount?.amount;
  const ownPendingContribution: PendingContribution | null =
    ownAmount === undefined || state.phase.type !== "firing_contributions"
      ? null
      : {
          windowId: state.phase.windowId,
          amount: normalizedOwnAmount as PendingContribution["amount"],
          submitted: true,
        };
  const knownFireRemaining = Object.fromEntries(
    FIRE_VALUES.map((modifier) => {
      const key = String(modifier) as keyof typeof GAME_CONFIG.fireDeck;
      const discarded = state.fireDiscard.filter((card) => card === modifier).length;
      return [key, GAME_CONFIG.fireDeck[key] - discarded];
    }),
  ) as PlayerObservation["knownFireRemaining"];

  return {
    rulesVersion: "1.0.4",
    playerId,
    game: projectPublicGameState(state),
    ownPendingContribution,
    knownFireRemaining,
    junActivationCoinCost: junActivationCoinCost(state.experimentConfig),
    imperialTrackRules: activeImperialTrackRules(state.experimentConfig),
  };
}

export function fireExpectation(observation: PlayerObservation): Array<{
  modifier: FireModifier;
  probability: number;
}> {
  const total = Object.values(observation.knownFireRemaining).reduce((sum, count) => sum + count, 0);
  if (total === 0) return [{ modifier: 0, probability: 1 }];
  return FIRE_VALUES.map((modifier) => ({
    modifier,
    probability:
      observation.knownFireRemaining[String(modifier) as keyof PlayerObservation["knownFireRemaining"]] /
      total,
  }));
}
