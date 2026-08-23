import { LOCATION_IDS, locationCapacity, orderHandLimit } from "../game/index.ts";
import type { LocationId, PlayerId } from "../game/index.ts";
import type { AIAction, PlayerObservation } from "./types.ts";

/**
 * V1.1.5 denial modelling.
 *
 * Frozen V003 scores an action purely by what it gains the actor; `evaluator.ts` has no
 * term for what the action costs everybody else. Across 2,000 measured 2-player
 * player-rounds it never once took both spaces at Forming or Glaze -- so self-play could
 * not see the lockout a human finds immediately, and every 2-player measurement taken
 * against it assumed a non-adversarial opponent.
 *
 * `lookaheadPolicy.ts` already carries an `opponentPressure` term, but it is a flat
 * `need / remaining` contention bonus attached to the V004 search, and it does not
 * separate the two cases that matter: taking a space an opponent merely wants, and taking
 * the *last* space at a step their pipeline has already committed to. This module splits
 * them, because only the second is a lockout.
 *
 * Every capacity and hand limit here is read from authoritative content -- no local copy
 * of a rules table.
 */

/** A location an opponent can be crowded out of. Labour and Court Patronage are uncapped. */
function isContestable(location: LocationId, playerCount: PlayerObservation["game"]["playerCount"]): boolean {
  if (location === "labour" || location === "court_patronage") return false;
  // Anything the whole table plus one cannot fill is not really contested.
  return locationCapacity(location, playerCount) <= playerCount + 1;
}

export function actionLocation(action: AIAction): LocationId | null {
  switch (action.type) {
    case "GAIN_MATERIALS": return "materials_yard";
    case "FORM_CERAMICS": return "forming_studio";
    case "GLAZE_CERAMICS": return "glaze_workshop";
    case "USE_KILN_YARD": return "kiln_yard";
    case "USE_LABOUR": return "labour";
    case "USE_COURT_PATRONAGE": return "court_patronage";
    case "BEGIN_OFFICE_ORDERS": return "market_imperial_office";
    case "BEGIN_GUILD_ACTION": return "guild_academy";
    default: return null;
  }
}

/**
 * How badly one opponent needs `location` this round, in units of "rounds of progress
 * lost if they never get in". A ceramic already past Forming is a *committed* investment:
 * strand it and the clay, the worker and the glaze that went into it earn nothing this
 * round, which is why the stranded-count terms dominate the speculative ones.
 */
function needForPlayer(
  observation: PlayerObservation,
  opponentId: PlayerId,
  location: LocationId,
): number {
  const player = observation.game.players[opponentId];
  if (player === undefined) return 0;
  const workersLeft = Object.values(player.workers).filter(({ status }) => status === "available").length;
  if (workersLeft === 0) return 0;

  const owned = Object.values(observation.game.ceramics).filter(({ ownerId }) => ownerId === opponentId);
  const shaped = owned.filter(({ stage }) => stage === "shaped").length;
  const glazed = owned.filter(({ stage }) => stage === "glazed").length;

  switch (location) {
    case "materials_yard":
      return player.resources.clay <= 1 || player.resources.wood <= 1 ? 1 : 0.25;
    case "forming_studio":
      // Speculative: they still need Glaze and Kiln afterwards, so a block here costs
      // them a ceramic they had not yet paid for.
      return player.resources.clay >= 1 && player.orderHand.length > 0 ? 0.8 : 0.2;
    case "glaze_workshop":
      // Committed: every shaped ceramic is already-spent clay that cannot reach the kiln.
      return shaped > 0 ? 1 + Math.min(2, shaped - 1) * 0.5 : 0.1;
    case "kiln_yard":
      // Most committed of all -- glazed stock one step from scoring.
      return glazed > 0 ? 1.2 + Math.min(2, glazed - 1) * 0.6 : 0.1;
    case "market_imperial_office":
      return player.orderHand.length < orderHandLimit() ? 0.6 : 0.15;
    case "guild_academy":
      return player.techniques.length < 2 && player.resources.coins >= 2 ? 0.55 : 0.1;
    case "labour":
    case "court_patronage":
      return 0;
  }
}

export interface DenialAssessment {
  location: LocationId | null;
  /** Summed need across opponents who still have a worker to spend. */
  opponentNeed: number;
  capacity: number;
  occupiedBefore: number;
  /** Spaces left for everybody else once this placement lands. */
  remainingAfter: number;
  /** True when this placement takes the last space at a step an opponent has committed to. */
  lockout: boolean;
  value: number;
}

export interface DenialWeights {
  /** Applied when the placement closes the location outright. */
  lockout: number;
  /** Applied when spaces remain -- crowding, not denial. */
  contention: number;
  /** Extra multiplier in the final round, where a blocked step cannot be recovered. */
  finalRoundMultiplier: number;
  /** Ceiling, so denial can never outweigh the action's own merits. */
  cap: number;
}

/** Denial disabled -- the shipped default, matching the configuration that was evaluated. */
export const V115_DENIAL_OFF: DenialWeights = {
  lockout: 0,
  contention: 0,
  finalRoundMultiplier: 1,
  cap: 0,
};

/** Researched weights, kept for the experiment record. Not enabled by default. */
export const V115_DENIAL_WEIGHTS: DenialWeights = {
  lockout: 1.9,
  contention: 0.55,
  finalRoundMultiplier: 1.5,
  cap: 4.5,
};

export function assessDenial(
  observation: PlayerObservation,
  action: AIAction,
  weights: DenialWeights = V115_DENIAL_WEIGHTS,
): DenialAssessment {
  const location = actionLocation(action);
  const empty: DenialAssessment = {
    location,
    opponentNeed: 0,
    capacity: 0,
    occupiedBefore: 0,
    remainingAfter: 0,
    lockout: false,
    value: 0,
  };
  if (location === null || !LOCATION_IDS.includes(location)) return empty;
  if (!isContestable(location, observation.game.playerCount)) return empty;

  const capacity = locationCapacity(location, observation.game.playerCount);
  const occupiedBefore = observation.game.actionBoard.placements[location].length;
  const remainingAfter = Math.max(0, capacity - occupiedBefore - 1);

  const opponentNeed = Object.keys(observation.game.players)
    .filter((id) => id !== observation.playerId)
    .reduce((sum, id) => sum + needForPlayer(observation, id, location), 0);
  if (opponentNeed <= 0) return { ...empty, capacity, occupiedBefore, remainingAfter };

  const lockout = remainingAfter === 0;
  const base = lockout
    ? opponentNeed * weights.lockout
    : (opponentNeed / (remainingAfter + 1)) * weights.contention;
  const roundScale = observation.game.round >= 5 ? weights.finalRoundMultiplier : 1;
  const value = Math.min(weights.cap, base * roundScale);

  return { location, opponentNeed, capacity, occupiedBefore, remainingAfter, lockout, value };
}
