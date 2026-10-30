/**
 * Crowns, Recognition steps, milestones and overflow VP (L439–454, R13).
 *
 * - Recognition advances one step at a time, by a Crown (printed, or Tribute Ware's bonus
 *   Crown, R13) or by the Magistrate's Hall (L441, L258–262).
 * - Reaching a space resolves its milestone (L443–450), each gained only once (L454):
 *   1 Imperial Grant (1 Clay, 1 Wood, 1 Coin), 2 Imperial Kiln tile, 3 Imperial Priority
 *   token, 4 Imperial Audience (6 VP). Rewards come from `data/imperial_progress.json`.
 * - At Recognition 4 every further Crown scores 1 VP immediately (L450, L452). Crowns are
 *   resolved one at a time, so a multi-Crown Order may cross several milestones and then
 *   score overflow VP (L453).
 * - The Magistrate's Hall never advances to 4 (L441, L262); its location module checks
 *   `magistratesHallOpen` before calling `advanceRecognitionStep`.
 *
 * Layer 3: imports layer 0–2.
 */

import { IMPERIAL_TRACK, LOCATIONS } from "./content.ts";
import { invariant } from "./errors.ts";
import { emit, gain, player } from "./state.ts";
import type {
  GameEvent,
  GameState,
  ImperialTrackDefinition,
  OrderId,
  PlayerId,
  PlayerState,
  Recognition,
  ResolveContext,
} from "./types.ts";

/** Where a Crown comes from (`CROWN_OVERFLOW_VP.source`). */
export type CrownSource = Extract<GameEvent, { type: "CROWN_OVERFLOW_VP" }>["source"];
/** Where a Recognition step comes from (`RECOGNITION_ADVANCED.source`). */
export type RecognitionSource = Extract<GameEvent, { type: "RECOGNITION_ADVANCED" }>["source"];

type TrackSpace = ImperialTrackDefinition["track"][number];

/** The top of the track (Imperial Audience, L449). */
export const MAX_RECOGNITION: Recognition = 4;

function trackSpace(space: Recognition): TrackSpace {
  const entry = IMPERIAL_TRACK.track.find((candidate) => candidate.space === space);
  invariant(entry !== undefined, `Imperial track has no space ${space}`);
  return entry;
}

/**
 * The resources a player would gain from the milestones crossed moving from `from` to `to`
 * (each space after `from` up to `to`): the Imperial Grant (L446) if it is crossed and not yet
 * received. A preview only; `resolveMilestone` pays it.
 */
export function milestoneResourcesCrossed(owner: PlayerState, from: Recognition, to: Recognition): { clay: number; wood: number; coins: number } {
  const total = { clay: 0, wood: 0, coins: 0 };
  for (let space = from + 1; space <= to; space += 1) {
    const reward = trackSpace(space as Recognition).reward;
    if (reward !== null && reward.kind === "resources" && !owner.imperial.grantReceived) {
      total.clay += reward.clay;
      total.wood += reward.wood;
      total.coins += reward.coins;
    }
  }
  return total;
}

/**
 * Resolves the milestone of the space just reached (L443–450). Each flag guards its own
 * reward, so a milestone is gained at most once (L454).
 */
function resolveMilestone(draft: GameState, playerId: PlayerId, space: Recognition, ctx: ResolveContext): void {
  const owner = player(draft, playerId);
  const reward = trackSpace(space).reward;
  if (reward === null) {
    return;
  }
  switch (reward.kind) {
    case "resources": {
      if (owner.imperial.grantReceived) return;
      invariant(reward.clay === 1 && reward.wood === 1 && reward.coins === 1, "Imperial Grant is 1 Clay, 1 Wood, 1 Coin (L446)");
      owner.imperial.grantReceived = true;
      emit(ctx, { type: "IMPERIAL_GRANT_RECEIVED", playerId, clay: 1, wood: 1, coins: 1 });
      gain(draft, playerId, { clay: reward.clay, wood: reward.wood, coins: reward.coins }, "imperial_grant", ctx);
      return;
    }
    case "imperial_kiln": {
      if (owner.imperial.kilnGained) return;
      owner.imperial.kilnGained = true;
      emit(ctx, { type: "IMPERIAL_KILN_GAINED", playerId });
      return;
    }
    case "imperial_priority": {
      if (owner.imperial.priority !== "on_track") return;
      owner.imperial.priority = "held";
      emit(ctx, { type: "IMPERIAL_PRIORITY_GAINED", playerId });
      return;
    }
    case "vp": {
      if (owner.imperial.audienceReceived) return;
      invariant(reward.vp === 6, "Imperial Audience is 6 VP (L449)");
      owner.imperial.audienceReceived = true;
      owner.score.imperialAudience += reward.vp;
      emit(ctx, { type: "IMPERIAL_AUDIENCE_GAINED", playerId, vp: 6 });
      return;
    }
  }
}

/**
 * Resolves one Crown (L430, L452): one Recognition step while below 4, else +1 VP
 * immediately (`ScoreLedger.recognitionOverflow`, `CROWN_OVERFLOW_VP`). Callers resolve a
 * multi-Crown Order by calling this once per Crown (L453).
 */
export function gainCrown(
  draft: GameState,
  playerId: PlayerId,
  source: CrownSource,
  orderId: OrderId | null,
  ctx: ResolveContext,
): void {
  const owner = player(draft, playerId);
  if (owner.imperial.recognition < MAX_RECOGNITION) {
    advanceRecognitionStep(draft, playerId, source, orderId, ctx);
    return;
  }
  const vp = IMPERIAL_TRACK.overflowVpPerCrown;
  invariant(vp === 1, "Each Crown beyond Recognition 4 scores 1 VP (L450)");
  owner.score.recognitionOverflow += vp;
  emit(ctx, { type: "CROWN_OVERFLOW_VP", playerId, source, vp: 1 });
}

/**
 * Advances Recognition by exactly one step and resolves the milestone reached (L444–454).
 * Advancing past 4, or the Magistrate's Hall from a space it cannot use (L254, L262), is an
 * engine bug: callers validate first.
 */
export function advanceRecognitionStep(
  draft: GameState,
  playerId: PlayerId,
  source: RecognitionSource,
  orderId: OrderId | null,
  ctx: ResolveContext,
): void {
  const owner = player(draft, playerId);
  const from = owner.imperial.recognition;
  invariant(from < MAX_RECOGNITION, `${playerId} is already at Recognition ${MAX_RECOGNITION}`);
  invariant(
    source !== "magistrates_hall" || magistratesHallOpen(owner),
    `The Magistrate's Hall cannot advance ${playerId} from Recognition ${from} (L262)`,
  );
  const to = (from + 1) as Recognition;
  owner.imperial.recognition = to;
  emit(ctx, { type: "RECOGNITION_ADVANCED", playerId, from, to, source, orderId });
  resolveMilestone(draft, playerId, to, ctx);
}

/** The Magistrate's Hall may advance this player: Recognition 0–2 only (L254, L261–262). */
export function magistratesHallOpen(p: PlayerState): boolean {
  const usable = LOCATIONS.magistrates_hall.usableAtRecognition ?? [];
  return usable.includes(p.imperial.recognition);
}
