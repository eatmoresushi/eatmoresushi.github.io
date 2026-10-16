/**
 * Pure Base / Global / Actual Heat and Quality math, and previews (L245–279, L674–680).
 *
 * - Base Heat = Kiln Die + Σ Contributions, clamped to 0–5 (L249, L263, L674). Global and
 *   Actual Heat are never clamped.
 * - Actual Heat (L245, L678): Shared = Global Heat + (Kiln Furniture modifier ?? zone
 *   modifier) + Heat marker; Imperial = Kiln Die + Fire + Imperial modifier + Heat marker.
 * - Heat Difference is the absolute difference from Preferred Heat (L64); Quality follows
 *   the table (L274–279).
 *
 * Layer 2: imports only types, `content.ts` and `errors.ts` (DESIGN §2.2). Nothing here
 * mutates its input or reads hidden information.
 */

import { FIRING, TECHS, contributionCard, preferredHeat, qualityForDifference, zoneModifier } from "../content.ts";
import { InvariantError, invariant } from "../errors.ts";
import type {
  BaseHeat,
  CeramicHeatMarker,
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
  heatMarker: -1 | 0 | 1;
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
 * A revealed Contribution's Heat (L253–259): Bank −1, Tend 0, Stoke +1. A Fuel Ledger
 * commitment adds T12's `heat` in the card's direction, so ±1 becomes ±2 (L638). Fuel Ledger
 * with Tend is rejected by validation; reaching it here is an engine bug.
 */
export function contributionHeat(submission: ContributionSubmission): ContributionHeat {
  const printed = contributionCard(submission.card).heat;
  if (!submission.fuelLedger) {
    return printed as ContributionHeat;
  }
  if (printed === 0) {
    throw new InvariantError("Fuel Ledger only applies to Bank or Stoke");
  }
  return (printed + Math.sign(printed) * TECHS.T12.params.heat) as ContributionHeat;
}

/** Wood paid at the reveal: the card's cost plus Fuel Ledger's extra Wood (L253–259, L638). */
export function contributionWood(submission: ContributionSubmission): number {
  const printed = contributionCard(submission.card).woodCost;
  if (!submission.fuelLedger) {
    return printed;
  }
  if (contributionCard(submission.card).heat === 0) {
    throw new InvariantError("Fuel Ledger only applies to Bank or Stoke");
  }
  return printed + TECHS.T12.params.extraWood;
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

/** The value a Heat marker adds (L59, L269): a face-down marker has none yet (0). */
export function markerValue(marker: CeramicHeatMarker | null): -1 | 0 | 1 {
  return marker === null || marker.faceDown ? 0 : marker.value;
}

/**
 * One Actual Heat calculation (L245, L678): heatSource + position + marker, then Jun's ±1
 * (L478), then the absolute Heat Difference from Preferred Heat (L64).
 */
export function heatCalculation(input: HeatCalculationInput): HeatCalculation {
  const actualHeat = input.heatSource + input.positionModifier + input.heatMarker;
  const finalActualHeat = actualHeat + input.junAdjustment;
  return {
    fireModifier: input.fireModifier,
    heatSource: input.heatSource,
    positionModifier: input.positionModifier,
    heatMarker: input.heatMarker,
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
    heatMarker: calculation.heatMarker,
    junAdjustment,
    preferredHeat: preferred,
  });
}

/** Quality of a calculation (L274–279). */
export function qualityOf(calculation: HeatCalculation): Quality {
  return qualityForDifference(calculation.heatDifference);
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
 * the public Kiln Die (L289). A face-down Heat marker has no value yet (INT), so its
 * ceramic's preview stays unknown until the marker is turned or returned. Jun is not included.
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
    const marker = ceramic.heatMarker;
    const source = ceramic.placement.kiln === "imperial" ? die : base;
    const known = source !== null && !(marker !== null && marker.faceDown);
    if (!known) {
      return { ceramicId: ceramic.id, preferredHeat: preferred, heatBeforeFire: null, qualityByFire: null };
    }
    const heatBeforeFire = source + positionFor(game, ceramic).modifier + markerValue(marker);
    const qualityByFire = {} as Record<"-2" | "-1" | "0" | "1" | "2", Quality>;
    for (const fire of FIRE_VALUES) {
      qualityByFire[String(fire) as "-2" | "-1" | "0" | "1" | "2"] = qualityForDifference(heatBeforeFire + fire - preferred);
    }
    return { ceramicId: ceramic.id, preferredHeat: preferred, heatBeforeFire, qualityByFire };
  });
}
