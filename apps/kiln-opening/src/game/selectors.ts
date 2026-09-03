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
    case "setup_starting_tech":
      return phase.decisionOrder[phase.currentIndex] ?? null;
    case "work":
      return phase.activePlayerId;
    case "work_office_orders":
    case "work_guild":
    case "work_commission_advance":
      return phase.actorId;
    case "firing_before_contribution":
    case "firing_reposition":
    case "firing_before_quality":
    case "firing_after_quality":
    case "firing_workshop_seconds":
      return phase.queue.actors[phase.queue.currentIndex] ?? null;
    case "orders":
      return phase.activePlayerId;
    case "cleanup_orders":
      return phase.queue.actors[phase.queue.currentIndex] ?? null;
    case "firing_contributions":
    case "presentation":
    case "finished":
      return null;
  }
}

/**
 * Every workshop trims to the same limit. Guan's +1 hand size was removed along with its
 * Decoration waiver: measured over 360 seats it completed 2.99 Orders against the field's
 * 3.11, so neither clause was earning its text.
 */
export function orderHandLimit(): number {
  return GAME_CONFIG.orderDisplay.baseHandLimit;
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
    labour: [],
    forming_studio: [],
    glaze_workshop: [],
    kiln_yard: [],
    market_imperial_office: [],
    guild_academy: [],
  };
}
