import type {
  FireModifier,
  GameState,
  OrderId,
  PlayerId,
  TechniqueId,
} from "../game/index.ts";
import { projectPublicGameState } from "./projection.ts";
import type { PublicGameState } from "./types.ts";

/**
 * The complete information boundary presented to a computer player.
 *
 * Keeping this separate from `GameState` makes it impossible for a policy to accidentally
 * inspect deck order, another workshop's setup offer, a private Guild inspection, or an
 * unrevealed Contribution. Add private fields here only when the acting human would see them.
 */
export interface ComputerObservation {
  game: PublicGameState;
  playerId: PlayerId;
  ownPrivate: {
    orderHand: OrderId[];
    startingOrderOffer: OrderId[];
    colourSamplesChoices: OrderId[];
    inspectedTechniqueIds: TechniqueId[];
    firePeek: FireModifier | null;
  };
}

export function createComputerObservation(
  state: GameState,
  playerId: PlayerId,
): ComputerObservation {
  if (state.players[playerId] === undefined) {
    throw new Error(`Cannot observe missing computer player ${playerId}`);
  }

  const startingOrderOffer = state.phase.type === "setup_starting_orders"
    ? [...(state.phase.offeredOrderIds[playerId] ?? [])]
    : [];
  const colourSamplesChoices = state.phase.type === "work_office_orders"
    && state.phase.actorId === playerId
    && state.phase.step === "colour_samples_choose"
    ? [...(state.phase.colourSamplesChoices ?? [])]
    : [];
  const inspectedTechniqueIds = state.phase.type === "work_guild"
    && state.phase.actorId === playerId
    && state.phase.step === "buy"
    ? [...(state.phase.inspectedTechniqueIds ?? [])]
    : [];

  return {
    game: projectPublicGameState(state),
    playerId,
    ownPrivate: {
      orderHand: [...state.players[playerId]!.orderHand],
      startingOrderOffer,
      colourSamplesChoices,
      inspectedTechniqueIds,
      firePeek: state.privateFirePeeks?.[playerId] ?? null,
    },
  };
}
