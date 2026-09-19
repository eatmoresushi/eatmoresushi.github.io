import type { GameEvent, GameState, PlayerId, Shape, TechniqueDiscipline } from "../game/index.ts";
import type {
  PublicGameEvent,
  PublicGameState,
  PublicPlayerState,
} from "./types.ts";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function projectPlayer(state: GameState, playerId: PlayerId): PublicPlayerState {
  const player = state.players[playerId];
  if (player === undefined) throw new Error(`Missing player ${playerId}`);
  return {
    id: player.id,
    seatIndex: player.seatIndex,
    displayName: player.displayName,
    kilnId: player.kilnId,
    resources: clone(player.resources),
    workers: clone(player.workers),
    orderHand: [],
    orderHandCount: player.orderHand.length,
    completedOrders: clone(player.completedOrders),
    techniques: clone(player.techniques),
    startingTechniqueId: player.startingTechniqueId,
    imperialRecognition: player.imperialRecognition,
    imperialGrantResolved: player.imperialGrantResolved,
    imperialKilnUnlocked: player.imperialKilnUnlocked,
    imperialPriorityAvailable: player.imperialPriorityAvailable,
    imperialAudienceVpAwarded: player.imperialAudienceVpAwarded,
    passedWorkPhase: player.passedWorkPhase,
    kilnAbilityUsedThisRound: player.kilnAbilityUsedThisRound,
    kilnYardShifuUsedThisRound: player.kilnYardShifuUsedThisRound,
    kilnYardShifuCeramicId: player.kilnYardShifuCeramicId,
    shapesFormedThisRound: [...(player.shapesFormedThisRound ?? [])],
    presentationCeramicIds: [...player.presentationCeramicIds],
    presentationFeaturedCeramicIds: [...(player.presentationFeaturedCeramicIds ?? [])],
    score: clone(player.score),
  };
}

export function projectPublicGameState(state: GameState): PublicGameState {
  if (state.schemaVersion !== 4 || state.rulesVersion !== "1.2.7") {
    throw new Error("Only schema-4 V1.2.7 games may be projected by the current client");
  }
  if (state.phase.type === "firing_contributions" && state.firingContext !== null) {
    throw new Error("Unrevealed Contributions must never enter the public firing context");
  }
  const players = Object.fromEntries(
    state.playerOrder.map((playerId) => [playerId, projectPlayer(state, playerId)]),
  ) as Record<PlayerId, PublicPlayerState>;
  const vesselSupplyCounts = Object.fromEntries(
    (Object.keys(state.vesselSupply) as Shape[]).map((shape) => [shape, state.vesselSupply[shape].length]),
  ) as Record<Shape, number>;
  const techniqueRemaining = Object.fromEntries(
    (["forming", "glazing", "firing"] as TechniqueDiscipline[]).map((discipline) => [
      discipline,
      state.techniqueDecks[discipline].length,
    ]),
  ) as Record<TechniqueDiscipline, number>;

  const phase = clone(state.phase);
  if (phase.type === "setup_starting_orders") {
    phase.offeredOrderIds = {};
    phase.initialOrderIds = {};
  }
  if (phase.type === "work_office_orders" && phase.step === "colour_samples_choose") {
    phase.colourSamplesChoices = [];
  }
  if (phase.type === "orders") delete phase.declinedCompletableOrderIdsByPlayer;
  // The Guild Shifu's inspected Techs are private to that player.
  if (phase.type === "work_guild" && phase.inspectedTechniqueIds !== undefined) {
    phase.inspectedTechniqueIds = [];
  }
  return {
    schemaVersion: state.schemaVersion,
    rulesVersion: state.rulesVersion,
    gameId: state.gameId,
    revision: state.revision,
    eventSequence: state.eventSequence,
    playerCount: state.playerCount,
    round: state.round,
    playerOrder: [...state.playerOrder],
    firstPlayerId: state.firstPlayerId,
    phase,
    players,
    actionBoard: clone(state.actionBoard),
    // All ceramic attributes are public, including opponents' workshop/Imperial pieces.
    ceramics: clone(state.ceramics),
    vesselSupplyCounts,
    decks: {
      marketRemaining: state.marketDeck.length,
      techniqueRemaining,
      fireRemaining: state.fireDeck.length,
    },
    displays: {
      market: [...state.marketDisplay],
      techniques: clone(state.techniqueDisplay),
    },
    discards: {
      market: [...state.marketDiscard],
      fire: [...state.fireDiscard],
    },
    firingContext: clone(state.firingContext),
    lastFiringResult: state.lastFiringResult === undefined ? null : clone(state.lastFiringResult),
    finalResult: clone(state.finalResult),
  };
}

export function projectPublicEvent(event: GameEvent): PublicGameEvent {
  if (event.type === "ORDER_TAKEN") return { type: event.type, playerId: event.playerId, deck: event.deck, acquisition: event.acquisition };
  if (event.type === "STARTING_ORDERS_REVEALED") return { type: event.type, ordersByPlayer: {} };
  if (event.type === "ORDERS_DISCARDED_FOR_CLEANUP") return { type: event.type, playerId: event.playerId, count: event.orderIds.length, orderIds: [] };
  if (event.type === "WOOD_SUBMITTED") {
    // Construct this record explicitly. Even if the private engine event gains more
    // fields later, a Fuel Ledger commitment must not cross the public event boundary.
    return { type: "WOOD_SUBMITTED", playerId: event.playerId, windowId: event.windowId };
  }
  if (event.type === "COLOUR_SAMPLES_USED") {
    return {
      type: event.type,
      playerId: event.playerId,
      deck: event.deck,
      discardedCount: event.discardedOrderIds.length,

    };
  }
  return clone(event) as PublicGameEvent;
}

export function projectPublicEvents(events: readonly GameEvent[]): PublicGameEvent[] {
  return events.map(projectPublicEvent);
}

/** Owner-only composition for rendering/AI. Never persist or broadcast this view. */
export function withOwnOrderHand(game: PublicGameState, playerId: PlayerId, orderHand: readonly string[] | undefined): PublicGameState {
  const player = game.players[playerId];
  if (player === undefined || orderHand === undefined) return game;
  return { ...game, players: { ...game.players, [playerId]: { ...player, orderHand: [...orderHand] } } };
}
