/**
 * UI view models, quotes and step-wise option lists (DESIGN §5.4). React reads only these,
 * plus `validateAction`, `decisionPrompt` and events.
 *
 * STUB written by P0 with the signatures of DESIGN §5.4; owned by P7. The option functions
 * owned by P3, P5 and P6 are re-exported, never reimplemented (DESIGN §2.4). Replace the
 * bodies, keep the signatures. Every stub throws `NotImplementedError`.
 */

import { NotImplementedError } from "./errors.ts";
import type {
  BoardView,
  CeramicId,
  CommissionOptions,
  ContributionOption,
  CostQuote,
  CrackleDeclaration,
  FiringContext,
  GameAction,
  GuildInspectionOptions,
  GuildOptions,
  KilnSelectionOption,
  KilnSpaceId,
  LoadSpec,
  LookedOrderOptions,
  OrderId,
  OrderMatchOption,
  OrderSelectionCheck,
  PlacementOption,
  PlayerId,
  PlayerSummary,
  PlayerView,
  Recognition,
  ScorePreview,
  ShapedCeramic,
  WorkerEffect,
} from "./types.ts";

export { decisionPrompt } from "./state.ts";
export { heatPreviews } from "./firing/heat.ts";
export { quoteMaterialsYard } from "./work/materialsYard.ts";
export { quoteFormDecorate } from "./work/formDecorate.ts";
export { loadDestinationOptions } from "./kilnLoading.ts";
export { heatMarkerStepOptions, junOptions, testPiecesOptions } from "./firing/pipeline.ts";
export { afterQualityOptions, salvageOptions } from "./firing/afterQuality.ts";
export { legalContributions } from "./firing/contributions.ts";
export { findOrderMatches } from "./orders/matching.ts";

function notImplemented(name: string): never {
  throw new NotImplementedError(`selectors.${name}`);
}

// ── Who acts, the board and the players (public) ────────────────────────────────────

export function boardView(_view: PlayerView): BoardView {
  return notImplemented("boardView");
}

export function playerSummary(_view: PlayerView, _playerId: PlayerId): PlayerSummary {
  return notImplemented("playerSummary");
}

export function scorePreview(_view: PlayerView, _playerId: PlayerId): ScorePreview {
  return notImplemented("scorePreview");
}

export function handLimitStatus(_view: PlayerView, _playerId: PlayerId): { held: number; limit: number; mustDiscard: number } {
  return notImplemented("handLimitStatus");
}

export function firingSummary(_view: PlayerView): FiringContext | null {
  return notImplemented("firingSummary");
}

// ── Setup and Start of Round ─────────────────────────────────────────────────────────

export function kilnSelectionOptions(_view: PlayerView): KilnSelectionOption[] {
  return notImplemented("kilnSelectionOptions");
}

export function settersMarkOptions(_view: PlayerView): KilnSpaceId[] {
  return notImplemented("settersMarkOptions");
}

// ── Work Phase ───────────────────────────────────────────────────────────────────────

export function placementOptions(_view: PlayerView): PlacementOption[] {
  return notImplemented("placementOptions");
}

export function dingCopyableVesselIndexes(
  _view: PlayerView,
  _draft: Extract<GameAction, { type: "PLACE_FORM_DECORATE" }>,
): number[] {
  return notImplemented("dingCopyableVesselIndexes");
}

export function shapedVessels(_view: PlayerView, _playerId: PlayerId): ShapedCeramic[] {
  return notImplemented("shapedVessels");
}

export function heatMarkerTargets(_view: PlayerView, _playerId: PlayerId, _pendingLoads: readonly LoadSpec[]): CeramicId[] {
  return notImplemented("heatMarkerTargets");
}

export function commissionOptions(_view: PlayerView, _effect: WorkerEffect): CommissionOptions {
  return notImplemented("commissionOptions");
}

export function lookedOrderOptions(_view: PlayerView): LookedOrderOptions | null {
  return notImplemented("lookedOrderOptions");
}

export function guildOptions(_view: PlayerView, _effect: WorkerEffect): GuildOptions {
  return notImplemented("guildOptions");
}

export function guildInspectionOptions(_view: PlayerView): GuildInspectionOptions | null {
  return notImplemented("guildInspectionOptions");
}

export function magistratesHallQuote(_view: PlayerView, _effect: WorkerEffect): CostQuote & { reachable: Recognition | null } {
  return notImplemented("magistratesHallQuote");
}

export function canalBargeOptions(_view: PlayerView): OrderMatchOption[] {
  return notImplemented("canalBargeOptions");
}

export function imperialPriorityOptions(_view: PlayerView): { usable: boolean; ceramicIds: CeramicId[] } {
  return notImplemented("imperialPriorityOptions");
}

// ── Orders (Order Phase and Canal Barge pickers) ─────────────────────────────────────

export function completableOrders(_view: PlayerView): OrderMatchOption[] {
  return notImplemented("completableOrders");
}

export function orderMatchOptions(_view: PlayerView, _orderId: OrderId, _limit?: number): OrderMatchOption[] {
  return notImplemented("orderMatchOptions");
}

export function orderSelectionCheck(
  _view: PlayerView,
  _orderId: OrderId,
  _ceramicIds: readonly CeramicId[],
  _declarations?: readonly CrackleDeclaration[],
): OrderSelectionCheck {
  return notImplemented("orderSelectionCheck");
}

// ── Firing ───────────────────────────────────────────────────────────────────────────

export function contributionOptions(_view: PlayerView): ContributionOption[] {
  return notImplemented("contributionOptions");
}
