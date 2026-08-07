import { GAME_CONFIG } from "./content.ts";
import type {
  GamePhase,
  GameState,
  KilnSpaceId,
  LocationId,
  PlayerId,
  PlayerState,
  WorkerId,
} from "./types.ts";

export function turnOrderFromFirst(state: Pick<GameState, "playerOrder" | "firstPlayerId">): PlayerId[] {
  const firstIndex = state.playerOrder.indexOf(state.firstPlayerId);
  if (firstIndex < 0) {
    throw new Error("First Player must be in playerOrder");
  }
  return [...state.playerOrder.slice(firstIndex), ...state.playerOrder.slice(0, firstIndex)];
}

export function currentDecisionActor(phase: GamePhase): PlayerId | null {
  switch (phase.type) {
    case "setup_kiln_selection":
      return phase.selectionOrder[phase.currentIndex] ?? null;
    case "setup_starting_orders":
      return phase.decisionOrder[phase.currentIndex] ?? null;
    case "work":
      return phase.activePlayerId;
    case "work_office_orders":
    case "work_guild":
      return phase.actorId;
    case "firing_before_contribution":
    case "firing_after_reveal":
    case "firing_before_quality":
    case "firing_after_quality":
    case "firing_after_firing":
      return phase.queue.actors[phase.queue.currentIndex] ?? null;
    case "orders":
      return phase.activePlayerId;
    case "firing_contributions":
    case "presentation":
    case "finished":
      return null;
  }
}

export function orderHandLimit(player: PlayerState): number {
  return player.kilnId === "GU"
    ? GAME_CONFIG.orderDisplay.guanHandLimit
    : GAME_CONFIG.orderDisplay.baseHandLimit;
}

export function availableWorkerIds(player: PlayerState): WorkerId[] {
  return Object.values(player.workers)
    .filter((worker) => worker.status === "available")
    .map((worker) => worker.id);
}

export function kilnOccupant(state: GameState, kilnSpaceId: KilnSpaceId): string | null {
  for (const ceramic of Object.values(state.ceramics)) {
    if (ceramic.stage === "loaded" && ceramic.kilnSpaceId === kilnSpaceId) {
      return ceramic.id;
    }
  }
  return null;
}

export function actionOccupancy(state: GameState, locationId: LocationId): number {
  return state.actionBoard.placements[locationId].length;
}

export function emptyActionBoard(): Record<LocationId, WorkerId[]> {
  return {
    materials_yard: [],
    forming_studio: [],
    glaze_workshop: [],
    kiln_yard: [],
    market_imperial_office: [],
    guild_academy: [],
  };
}
