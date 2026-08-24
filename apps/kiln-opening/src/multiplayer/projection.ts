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
    imperialProgress: player.imperialProgress,
    imperialStipendsReceived: [...(player.imperialStipendsReceived ?? [])],
    passedWorkPhase: player.passedWorkPhase,
    pendingApprenticeUnlocks: player.pendingApprenticeUnlocks,
    kilnAbilityUsedThisRound: player.kilnAbilityUsedThisRound,
    presentationCeramicIds: [...player.presentationCeramicIds],
    score: clone(player.score),
  };
}

export function projectPublicGameState(state: GameState): PublicGameState {
  if (state.rulesVersion !== "1.1.6") throw new Error("Only V1.1.5 games may be projected by the current client");
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
    rulesVersion: state.rulesVersion as "1.1.6",
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
      imperialRemaining: state.imperialDeck.length,
      techniqueRemaining,
      fireRemaining: state.fireDeck.length,
    },
    displays: {
      market: [...state.marketDisplay],
      imperial: [...state.imperialDisplay],
      techniques: clone(state.techniqueDisplay),
    },
    discards: {
      market: [...state.marketDiscard],
      imperial: [...state.imperialDiscard],
      fire: [...state.fireDiscard],
    },
    imperialSealOwnerId: state.imperialSealOwnerId,
    firingContext: clone(state.firingContext),
    lastFiringResult: state.lastFiringResult === undefined ? null : clone(state.lastFiringResult),
    finalResult: clone(state.finalResult),
    ...(state.experimentConfig === undefined
      ? {}
      : { experimentConfig: clone(state.experimentConfig) }),
  };
}

export function projectPublicEvent(event: GameEvent): PublicGameEvent {
  switch (event.type) {
    case "KILN_SELECTED":
    case "STARTING_ORDERS_SUBMITTED":
    case "STARTING_ORDERS_REVEALED":
    case "STARTING_ORDER_KEPT":
    case "STARTING_ORDER_REDRAWN":
    case "WORKER_PLACED":
    case "PLAYER_PASSED":
    case "RESOURCES_CHANGED":
    case "CERAMIC_SHAPED":
    case "CERAMIC_GLAZED":
    case "CERAMIC_LOADED":
    case "CERAMIC_SOLD":
    case "CERAMIC_RETURNED_TO_GLAZED":
    case "ORDER_TAKEN":
    case "COLOUR_SAMPLES_USED":
    case "TECHNIQUE_REFRESHED":
    case "TECHNIQUE_ACQUIRED":
    case "TECHNIQUE_USED":
    case "KILN_ABILITY_USED":
    case "JUN_ACTIVATION_PAID":
    case "WORK_PHASE_ENDED":
    case "WOOD_SUBMITTED":
    case "WOOD_REVEALED":
    case "FIRE_REVEALED":
    case "QUALITY_ASSIGNED":
    case "FIRING_RESOLVED":
    case "ORDER_COMPLETED":
    case "IMPERIAL_PROGRESS_ADVANCED":
    case "COURT_PATRONAGE_USED":
    case "IMPERIAL_SEAL_CLAIMED":
    case "APPRENTICE_UNLOCKED":
    case "ROUND_FIVE_UNLOCK_VP_REWARD":
    case "ORDERS_DISCARDED_FOR_CLEANUP":
    case "IMPERIAL_STIPEND_RECEIVED":
    case "ORDER_DISPLAYS_ROTATED":
    case "ROUND_STARTED":
    case "PRESENTATION_SUBMITTED":
    case "FINAL_SCORE_CALCULATED":
      return clone(event);
  }
}

export function projectPublicEvents(events: readonly GameEvent[]): PublicGameEvent[] {
  return events.map(projectPublicEvent);
}
