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
    // Opening selections remain hidden until the final simultaneous reveal.
    orderHand: state.phase.type === "setup_starting_orders" ? [] : [...player.orderHand],
    completedOrders: clone(player.completedOrders),
    techniques: clone(player.techniques),
    startingTechniqueId: player.startingTechniqueId,
    workshopSpaces: clone(player.workshopSpaces),
    imperialRecognition: player.imperialRecognition,
    imperialGrantResolved: player.imperialGrantResolved,
    imperialKilnUnlocked: player.imperialKilnUnlocked,
    imperialPriorityAvailable: player.imperialPriorityAvailable,
    imperialAudienceVpAwarded: player.imperialAudienceVpAwarded,
    passedWorkPhase: player.passedWorkPhase,
    kilnAbilityUsedThisRound: player.kilnAbilityUsedThisRound,
    kilnYardShifuUsedThisRound: player.kilnYardShifuUsedThisRound,
    shapesFormedThisRound: [...(player.shapesFormedThisRound ?? [])],
    presentationCeramicIds: [...player.presentationCeramicIds],
    presentationFeaturedCeramicIds: [...(player.presentationFeaturedCeramicIds ?? [])],
    score: clone(player.score),
  };
}

export function projectPublicGameState(state: GameState): PublicGameState {
  if (state.schemaVersion !== 2 || state.rulesVersion !== "1.2.2") {
    throw new Error("Only schema-2 V1.2.2 games may be projected by the current client");
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
    ceramics: clone(state.ceramics),
    commonSupply: clone(state.commonSupply),
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
      bottomedCount: event.bottomedOrderIds?.length ?? 1,
      ...(event.selectedOrderId === undefined ? {} : { selectedOrderId: event.selectedOrderId }),
    };
  }
  return clone(event) as PublicGameEvent;
}

export function projectPublicEvents(events: readonly GameEvent[]): PublicGameEvent[] {
  return events.map(projectPublicEvent);
}
