/**
 * Pure Base / Global / Actual Heat and Quality math, and previews (L244–278, L674–680).
 *
 * STUB written by P0 with the exact exported signatures of DESIGN §2.4; owned by P5.
 * Replace the bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "../errors.ts";
import type {
  BaseHeat,
  ContributionHeat,
  ContributionSubmission,
  FireModifier,
  FiringCeramicRecord,
  HeatCalculation,
  HeatPreview,
  KilnDieFace,
  LoadedCeramic,
  PlayerView,
  PublicCore,
} from "../types.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`firing/heat.${name}`);
}

/** Input of `heatCalculation`: everything Actual Heat and the Heat Difference depend on. */
export interface HeatCalculationInput {
  fireModifier: FireModifier;
  /** Shared: Global Heat. Imperial: Kiln Die + Fire (L288). */
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

export function baseHeat(_die: KilnDieFace, _contributionSum: number): BaseHeat {
  return notImplemented("baseHeat");
}

export function contributionHeat(_submission: ContributionSubmission): ContributionHeat {
  return notImplemented("contributionHeat");
}

export function contributionWood(_submission: ContributionSubmission): number {
  return notImplemented("contributionWood");
}

export function positionFor(_game: PublicCore, _ceramic: LoadedCeramic): PositionModifier {
  return notImplemented("positionFor");
}

export function heatCalculation(_input: HeatCalculationInput): HeatCalculation {
  return notImplemented("heatCalculation");
}

export function heatPreviews(_view: PlayerView): HeatPreview[] {
  return notImplemented("heatPreviews");
}
