/**
 * Worker availability, capacity, personal spaces and the worker effect (L135–155, L619).
 *
 * Location occupancy is derived from `WorkerState.placement` (the single source of truth),
 * never stored twice. The "at least 1 instance of the main action" check (L141) belongs to
 * each location module, not here.
 *
 * Layer 2 (imports `state.ts` and `techs.ts` within P0).
 */

import { LOCATIONS, TECHS, locationCapacity } from "./content.ts";
import { invariant, ruleError } from "./errors.ts";
import { emit, lookup, player } from "./state.ts";
import { markTechUsed, ownsTech, techReady } from "./techs.ts";
import type {
  ActorView,
  CentralLocationId,
  GameRuleError,
  GameState,
  LocationId,
  PersonalLocationId,
  PersonalSpaceIndex,
  PlayerId,
  PlayerState,
  PublicCore,
  ResolveContext,
  WorkerEffect,
  WorkerId,
  WorkerPlacement,
  WorkerState,
} from "./types.ts";

const SENIOR_APPRENTICE = "T18";
const PERSONAL_SPACE_INDEXES: readonly PersonalSpaceIndex[] = [0, 1];

export function isPersonalLocation(locationId: LocationId): locationId is PersonalLocationId {
  return LOCATIONS[locationId].scope === "personal";
}

function compareWorkers(a: WorkerState, b: WorkerState): number {
  if (a.kind !== b.kind) {
    return a.kind === "shifu" ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Workers not yet placed this round: the Shifu first, then Apprentices by ID. */
export function availableWorkers(game: PublicCore, playerId: PlayerId): WorkerState[] {
  return Object.values(player(game, playerId).workers)
    .filter((worker) => worker.placement === null)
    .sort(compareWorkers);
}

/** Every worker at a location, all players, in placement order. */
export function workersAt(game: PublicCore, locationId: LocationId): Array<{ playerId: PlayerId; worker: WorkerState }> {
  const found: Array<{ playerId: PlayerId; worker: WorkerState; sequence: number }> = [];
  for (const playerId of game.playerOrder) {
    for (const worker of Object.values(player(game, playerId).workers)) {
      if (worker.placement !== null && worker.placement.locationId === locationId) {
        found.push({ playerId, worker, sequence: worker.placement.sequence });
      }
    }
  }
  return found.sort((a, b) => a.sequence - b.sequence).map(({ playerId, worker }) => ({ playerId, worker }));
}

/** Absolute capacity at this player count (L139, L147–155); null = uncapped (Canal Wharf). */
export function centralCapacity(game: PublicCore, locationId: CentralLocationId): number | null {
  return locationCapacity(locationId, game.playerCount);
}

function usedPersonalSpaces(p: PlayerState, locationId: PersonalLocationId): Set<number> {
  const used = new Set<number>();
  for (const worker of Object.values(p.workers)) {
    if (worker.placement !== null && worker.placement.locationId === locationId) {
      used.add(worker.placement.spaceIndex);
    }
  }
  return used;
}

/** The first unlocked personal space not used this round (L143), or null. */
export function nextPersonalSpace(
  game: PublicCore,
  playerId: PlayerId,
  locationId: PersonalLocationId,
): PersonalSpaceIndex | null {
  const p = player(game, playerId);
  const used = usedPersonalSpaces(p, locationId);
  for (const index of PERSONAL_SPACE_INDEXES) {
    if (p.personalSpaces[locationId][index].unlocked && !used.has(index)) {
      return index;
    }
  }
  return null;
}

function seniorApprenticeError(p: PlayerState, worker: WorkerState, locationId: LocationId): GameRuleError | null {
  const locations: readonly LocationId[] = TECHS[SENIOR_APPRENTICE].params.locations;
  if (worker.kind !== "apprentice" || !locations.includes(locationId)) {
    return ruleError(
      "SENIOR_APPRENTICE_NOT_APPLICABLE",
      "Senior Apprentice applies only to an Apprentice at the Materials Yard or Commission Market.",
      { workerId: worker.id, locationId },
    );
  }
  if (!ownsTech(p, SENIOR_APPRENTICE)) {
    return ruleError("TECH_NOT_OWNED", "You do not own Senior Apprentice.", { techId: SENIOR_APPRENTICE });
  }
  if (!techReady(p, SENIOR_APPRENTICE)) {
    return ruleError("TECH_ALREADY_USED", "Senior Apprentice has already been used this round.", {
      techId: SENIOR_APPRENTICE,
    });
  }
  return null;
}

/**
 * Placement checks shared by every location (DESIGN §2.3): phase `work_turn`, step
 * `before_action`, the active player; the worker available; absolute capacity (L139); the
 * personal space unlocked and unused this round (L143); Senior Apprentice only for an
 * Apprentice at the Materials Yard or Commission Market with T18 ready (L619, R12).
 */
export function validatePlacement(
  view: ActorView,
  workerId: WorkerId,
  locationId: LocationId,
  seniorApprentice: boolean,
): GameRuleError | null {
  const game = view.game;
  const actorId = view.viewerId;
  const phase = game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "Workers are placed only during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== actorId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: actorId });
  }
  if (phase.step.kind !== "before_action") {
    return ruleError("WORKER_ACTION_ALREADY_TAKEN", "You have already taken this turn's worker action.", {
      step: phase.step.kind,
    });
  }
  const p = lookup(game.players, actorId);
  if (p === undefined) {
    return ruleError("UNKNOWN_PLAYER", "You are not seated in this game.", { playerId: actorId });
  }
  const worker = lookup(p.workers, workerId);
  if (worker === undefined || worker.placement !== null) {
    return ruleError("WORKER_UNAVAILABLE", "That worker is not available.", { workerId });
  }
  if (seniorApprentice) {
    const error = seniorApprenticeError(p, worker, locationId);
    if (error !== null) {
      return error;
    }
  }
  if (isPersonalLocation(locationId)) {
    if (nextPersonalSpace(game, actorId, locationId) === null) {
      const anyLocked = PERSONAL_SPACE_INDEXES.some((index) => !p.personalSpaces[locationId][index].unlocked);
      return anyLocked
        ? ruleError("PERSONAL_SPACE_LOCKED", "You have not added a free space at this location yet.", { locationId })
        : ruleError("PERSONAL_SPACE_USED", "Each personal space may be used once per round.", { locationId });
    }
    return null;
  }
  const capacity = centralCapacity(game, locationId);
  if (capacity !== null && workersAt(game, locationId).length >= capacity) {
    return ruleError("LOCATION_FULL", "Every space at this location is occupied.", { locationId, capacity });
  }
  return null;
}

/** The printed effect a placement resolves: the Shifu's, or an Apprentice's unless Senior
 * Apprentice upgrades it (L140, L619, R12). */
export function workerEffectFor(view: ActorView, workerId: WorkerId, seniorApprentice: boolean): WorkerEffect {
  const worker = lookup(player(view.game, view.viewerId).workers, workerId);
  invariant(worker !== undefined, `Unknown worker ${workerId}`);
  return worker.kind === "shifu" || seniorApprentice ? "shifu" : "apprentice";
}

/**
 * Places the worker, emits `WORKER_PLACED` and, with Senior Apprentice, marks T18 used
 * (`TECH_USED`). Personal locations take the next free unlocked space; central locations
 * record the meeple's display slot. Callers validate first.
 */
export function placeWorker(
  draft: GameState,
  playerId: PlayerId,
  workerId: WorkerId,
  locationId: LocationId,
  seniorApprentice: boolean,
  ctx: ResolveContext,
): WorkerPlacement {
  const owner = player(draft, playerId);
  const worker = lookup(owner.workers, workerId);
  invariant(worker !== undefined && worker.placement === null, `Worker ${workerId} is not available`);
  invariant(!seniorApprentice || worker.kind === "apprentice", "Senior Apprentice applies only to an Apprentice");
  let spaceIndex: number;
  if (isPersonalLocation(locationId)) {
    const next = nextPersonalSpace(draft, playerId, locationId);
    invariant(next !== null, `${playerId} has no free ${locationId} space`);
    spaceIndex = next;
  } else {
    spaceIndex = workersAt(draft, locationId).length;
  }
  const effect: WorkerEffect = worker.kind === "shifu" || seniorApprentice ? "shifu" : "apprentice";
  const placement: WorkerPlacement = {
    locationId,
    spaceIndex,
    effect,
    viaSeniorApprentice: seniorApprentice,
    sequence: draft.placementSequence,
  };
  draft.placementSequence += 1;
  worker.placement = placement;
  emit(ctx, {
    type: "WORKER_PLACED",
    playerId,
    workerId,
    kind: worker.kind,
    locationId,
    spaceIndex,
    effect,
    viaSeniorApprentice: seniorApprentice,
  });
  if (seniorApprentice) {
    markTechUsed(draft, playerId, SENIOR_APPRENTICE, ctx);
  }
  return { ...placement };
}
