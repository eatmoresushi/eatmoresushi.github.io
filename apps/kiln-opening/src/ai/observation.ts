import {
  GAME_CONFIG,
  activeImperialTrackRules,
  dingExtraVesselIsFree,
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
  const ownCard = privateFiringState.contributions[playerId];
  const ownPendingContribution: PendingContribution | null =
    ownCard === undefined || state.phase.type !== "firing_contributions"
      ? null
      : { windowId: state.phase.windowId, card: ownCard, submitted: true };
  const knownFireRemaining = Object.fromEntries(
    FIRE_VALUES.map((modifier) => {
      const key = String(modifier) as keyof typeof GAME_CONFIG.fireDeck;
      const discarded = state.fireDiscard.filter((card) => card === modifier).length;
      return [key, GAME_CONFIG.fireDeck[key] - discarded];
    }),
  ) as PlayerObservation["knownFireRemaining"];

  return {
    rulesVersion: state.rulesVersion,
    playerId,
    game: projectPublicGameState(state),
    ownPendingContribution,
    ownFireModifierPeek: state.privateFirePeeks?.[playerId] ?? null,
    knownFireRemaining,
    junActivationCoinCost: junActivationCoinCost(state.experimentConfig),
    dingExtraVesselFree: dingExtraVesselIsFree(state.experimentConfig),
    imperialTrackRules: activeImperialTrackRules(state.experimentConfig),
  };
}

export function fireExpectation(observation: PlayerObservation): Array<{
  modifier: FireModifier;
  probability: number;
}> {
  if (observation.ownFireModifierPeek !== null) {
    return [{ modifier: observation.ownFireModifierPeek, probability: 1 }];
  }
  const total = Object.values(observation.knownFireRemaining).reduce((sum, count) => sum + count, 0);
  if (total === 0) return [{ modifier: 0, probability: 1 }];
  return FIRE_VALUES.map((modifier) => ({
    modifier,
    probability:
      observation.knownFireRemaining[String(modifier) as keyof PlayerObservation["knownFireRemaining"]] /
      total,
  }));
}
