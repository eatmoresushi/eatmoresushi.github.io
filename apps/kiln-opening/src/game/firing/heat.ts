/**
 * Pure Base / Global / Actual Heat and Quality math, and previews (L245–279, L674–680).
 *
 * - Base Heat = Kiln Die + Σ Contributions, clamped to 0–5 (L249, L263, L674). Global and
 *   Actual Heat are never clamped.
 * - Actual Heat (rev. 4 L78, L255, L661): Shared = Global Heat + (Kiln Furniture modifier ??
 *   zone modifier) + Kiln Master marker; Imperial = Kiln Die + Fire + Imperial modifier + Kiln
 *   Master marker. The marker is chosen at loading (T24, rev. 4 L628, R22); there is no player
 *   Heat marker since revision 4 (changes 28, 31).
 * - Heat Difference is the absolute difference from Preferred Heat (L64); Quality follows
 *   the table (L274–279). Protective Saggars (T11, v1.6.2 L636): its owner's ceramics are never
 *   Flawed, a Heat Difference of 3 or more counts as Standard (`qualityFor`).
 * - Fuel Ledger (T12, v1.6.2 L266, L634, change 26): its owner's Bank and Stoke cost no Wood,
 *   and its Fuel Ledger Bank and Fuel Ledger Stoke cards cost 1 Wood for −2 / +2
 *   (`contributionWood`, `contributionHeat`: the card's printed values).
 *
 * Layer 2: imports only types, `content.ts` and `errors.ts` (DESIGN §2.2). Nothing here
 * mutates its input or reads hidden information.
 */

import { FIRING, TECHS, contributionCard, preferredHeat, qualityForDifference, zoneModifier } from "../content.ts";
import { InvariantError, invariant } from "../errors.ts";
import type {
  BaseHeat,
  PlayerState,
  CeramicId,
  ContributionHeat,
  ContributionSubmission,
  FireModifier,
  FiringCeramicRecord,
  FiringContext,
  HeatCalculation,
  HeatPreview,
  KilnDieFace,
  LoadedCeramic,
  PlayerView,
  PublicCore,
  Quality,
} from "../types.ts";

/** Input of `heatCalculation`: everything Actual Heat and the Heat Difference depend on. */
export interface HeatCalculationInput {
  fireModifier: FireModifier;
  /** Shared: Global Heat. Imperial: Kiln Die + Fire (L289). */
  heatSource: number;
  positionModifier: number;
  /** The ceramic's Kiln Master marker (rev. 4 L628), 0 without one. */
  kilnMasterMarker: -1 | 0 | 1;
  junAdjustment: -1 | 0 | 1;
  preferredHeat: number;
}

/** Where a loaded ceramic's position modifier comes from, and its value. */
export interface PositionModifier {
  source: FiringCeramicRecord["positionSource"];
  modifier: number;
}

/** Fire modifiers in deck-value order: the keys of `HeatPreview.qualityByFire`. */
export const FIRE_VALUES: readonly FireModifier[] = Object.freeze([-2, -1, 0, 1, 2] as const);

/** Base Heat (L263, L674): Kiln Die + the sum of final Contribution modifiers, clamped 0–5. */
export function baseHeat(die: KilnDieFace, contributionSum: number): BaseHeat {
  invariant(Number.isSafeInteger(contributionSum), `Contribution sum must be an integer, got ${contributionSum}`);
  const { minimum, maximum } = FIRING.baseHeat;
  return Math.min(maximum, Math.max(minimum, die + contributionSum)) as BaseHeat;
}

/**
 * A revealed Contribution's Heat: the card's printed modifier (v1.6.2 L262–266, change 26):
 * Bank −1, Tend 0, Stoke +1, Fuel Ledger Bank −2, Fuel Ledger Stoke +2.
 */
export function contributionHeat(submission: ContributionSubmission): ContributionHeat {
  const printed = contributionCard(submission.card).heat;
  invariant(printed >= -2 && printed <= 2 && Number.isInteger(printed), `Contribution ${submission.card} has Heat ${printed}`);
  return printed as ContributionHeat;
}

/**
 * Wood paid at the reveal (v1.6.2 L246, L262–266, L508): the card's printed cost, except that a
 * Fuel Ledger owner's Bank and Stoke cost no Wood (T12 `freeCards`, v1.6.2 L634). The Fuel Ledger
 * cards cost their printed 1 Wood. `ownsFuelLedger` is the submitter's ownership of T12 (public).
 */
export function contributionWood(submission: ContributionSubmission, ownsFuelLedger: boolean): number {
  const card = contributionCard(submission.card);
  return ownsFuelLedger && TECHS.T12.params.freeCards.includes(card.id) ? 0 : card.woodCost;
}

/** Protective Saggars protects this player's ceramics from Flawed (T11, v1.6.2 L636): owning
 * the tile is enough, the floor has no allowance (INT: Protective Saggars floor). */
export function saggarsProtects(p: PlayerState): boolean {
  return p.techs.some((tech) => tech.id === "T11");
}

/**
 * The Quality a Heat Difference gives (L274–279), floored at Standard when `neverFlawed`
 * (Protective Saggars, v1.6.2 L636: "a Heat Difference of 3 or more counts as Standard").
 */
export function qualityFor(heatDifference: number, neverFlawed: boolean): Quality {
  const printed = qualityForDifference(heatDifference);
  return neverFlawed && printed === "flawed" ? TECHS.T11.params.floorQuality : printed;
}

/** Whether `qualityFor` floored this difference (the raw table says Flawed). */
export function saggarsFloored(heatDifference: number, neverFlawed: boolean): boolean {
  return neverFlawed && qualityForDifference(heatDifference) === "flawed";
}

/**
 * The position modifier a loaded ceramic uses (L245, L678): in the Shared Kiln the Kiln
 * Furniture modifier when a tile is in its space (every ceramic in the space uses it, R8),
 * else the printed zone modifier; in the Imperial Kiln the modifier chosen at loading (R11).
 */
export function positionFor(game: PublicCore, ceramic: LoadedCeramic): PositionModifier {
  const placement = ceramic.placement;
  if (placement.kiln === "imperial") {
    return { source: "imperial", modifier: placement.imperialModifier };
  }
  const furniture = game.sharedKiln.spaces[placement.spaceId].kilnFurniture;
  if (furniture !== null) {
    return { source: "kiln_furniture", modifier: furniture.modifier };
  }
  return { source: "zone", modifier: zoneModifier(placement.spaceId) };
}

/**
 * One Actual Heat calculation (rev. 4 L255, L661): heatSource + position + Kiln Master marker,
 * then Jun's ±1 (L478, on top of the marker, rev. 4 L635), then the absolute Heat Difference
 * from Preferred Heat (L64).
 */
export function heatCalculation(input: HeatCalculationInput): HeatCalculation {
  const actualHeat = input.heatSource + input.positionModifier + input.kilnMasterMarker;
  const finalActualHeat = actualHeat + input.junAdjustment;
  return {
    fireModifier: input.fireModifier,
    heatSource: input.heatSource,
    positionModifier: input.positionModifier,
    kilnMasterMarker: input.kilnMasterMarker,
    actualHeat,
    junAdjustment: input.junAdjustment,
    finalActualHeat,
    heatDifference: Math.abs(finalActualHeat - input.preferredHeat),
  };
}

/** The same calculation with Jun's adjustment replaced (Jun never carries over, L640). */
export function withJunAdjustment(calculation: HeatCalculation, junAdjustment: -1 | 0 | 1, preferred: number): HeatCalculation {
  return heatCalculation({
    fireModifier: calculation.fireModifier,
    heatSource: calculation.heatSource,
    positionModifier: calculation.positionModifier,
    kilnMasterMarker: calculation.kilnMasterMarker,
    junAdjustment,
    preferredHeat: preferred,
  });
}

/** Quality of a calculation (L274–279), with Protective Saggars' floor when `neverFlawed`. */
export function qualityOf(calculation: HeatCalculation, neverFlawed = false): Quality {
  return qualityFor(calculation.heatDifference, neverFlawed);
}

// ── Firing records ──────────────────────────────────────────────────────────────────

const CERAMIC_ID = /^c([1-9][0-9]*)$/;

function sequenceOf(id: CeramicId): number {
  const match = CERAMIC_ID.exec(id);
  if (match === null) {
    throw new InvariantError(`Malformed ceramic ID ${id}`);
  }
  return Number(match[1]);
}

/** Every record of a firing in ceramic sequence order — never `Record` key order (DESIGN §2.3). */
export function firingRecordsInOrder(firing: FiringContext): FiringCeramicRecord[] {
  return Object.values(firing.ceramics)
    .filter((record): record is FiringCeramicRecord => record !== undefined)
    .sort((a, b) => sequenceOf(a.ceramicId) - sequenceOf(b.ceramicId));
}

/** The open firing; reaching a firing step without one is an engine bug. */
export function requireFiring(game: PublicCore): FiringContext {
  invariant(game.firing !== null, "No firing is in progress");
  return game.firing;
}

/** The record of one ceramic in this firing (own-property lookup), or null. */
export function firingRecord(firing: FiringContext, ceramicId: CeramicId): FiringCeramicRecord | null {
  return Object.hasOwn(firing.ceramics, ceramicId) ? (firing.ceramics[ceramicId] ?? null) : null;
}

// ── Previews (public information only) ──────────────────────────────────────────────

/**
 * Per loaded ceramic, in sequence order: Preferred Heat and, when everything except the Fire
 * card is known, the Actual Heat before the Fire card and the Quality each Fire card would
 * give. A Shared ceramic needs Base Heat (from the reveal on); an Imperial ceramic needs only
 * the public Kiln Die (L289). The Kiln Master marker is known from loading (rev. 4 L635). Jun
 * is not included.
 * The owner's Protective Saggars floor applies (v1.6.2 L636). Computer use only (D3).
 */
export function heatPreviews(view: PlayerView): HeatPreview[] {
  const game = view.game;
  const loaded = Object.values(game.ceramics)
    .filter((c): c is LoadedCeramic => c.stage === "loaded")
    .sort((a, b) => sequenceOf(a.id) - sequenceOf(b.id));
  const die = game.firing?.kilnDie ?? (game.kilnDie !== null && game.kilnDie.round === game.round ? game.kilnDie.value : null);
  const base = game.firing?.baseHeat ?? null;
  return loaded.map((ceramic) => {
    const preferred = preferredHeat(ceramic.glaze);
    const source = ceramic.placement.kiln === "imperial" ? die : base;
    if (source === null) {
      return { ceramicId: ceramic.id, preferredHeat: preferred, heatBeforeFire: null, qualityByFire: null };
    }
    const heatBeforeFire = source + positionFor(game, ceramic).modifier + (ceramic.kilnMasterMarker ?? 0);
    const owner = Object.hasOwn(game.players, ceramic.ownerId) ? game.players[ceramic.ownerId] : undefined;
    const neverFlawed = owner !== undefined && saggarsProtects(owner);
    const qualityByFire = {} as Record<"-2" | "-1" | "0" | "1" | "2", Quality>;
    for (const fire of FIRE_VALUES) {
      qualityByFire[String(fire) as "-2" | "-1" | "0" | "1" | "2"] = qualityFor(heatBeforeFire + fire - preferred, neverFlawed);
    }
    return { ceramicId: ceramic.id, preferredHeat: preferred, heatBeforeFire, qualityByFire };
  });
}
