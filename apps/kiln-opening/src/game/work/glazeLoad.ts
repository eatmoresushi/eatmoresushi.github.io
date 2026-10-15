/**
 * Glaze & Load (L174–184), incl. the Shifu's optional face-down Heat marker (L179, R9) and
 * Kiln Tending (T20, L627; automatic on the first qualifying action each round, INT).
 *
 * One atomic command (DESIGN §3.5): every choice — 1 or 2 ordered loads, Glaze, destination,
 * Imperial modifier, Kiln Furniture, Inverted Firing, Reworking Table, Heat-marker target — is
 * known when it is made. Loading rules live in `kilnLoading.ts`.
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2).
 */

import { LOCATIONS, TECHS } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { hasAnyLegalLoad, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { ceramic, emit, gain, heatMarkerOf, lookup, player } from "../state.ts";
import { markTechUsed, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  ResolveContext,
  TechId,
  WorkerEffect,
} from "../types.ts";

type GlazeLoadAction = Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>;

const KILN_TENDING: TechId = "T20";

/**
 * R9: optional, Shifu effect only; your own marker (L75: 1 per player) on 1 of your ceramics
 * in the Shared Kiln or your Imperial Kiln — loaded by this action, earlier this round, or by
 * Imperial Priority — that carries no marker (L184).
 */
function heatMarkerError(view: ActorView, action: GlazeLoadAction, effect: WorkerEffect): GameRuleError | null {
  const targetId = action.heatMarkerCeramicId;
  if (targetId === undefined) {
    return null;
  }
  const game = view.game;
  const playerId = view.viewerId;
  if (effect !== "shifu" || !LOCATIONS.glaze_load.effects.shifu.placesHeatMarker) {
    return ruleError("NOT_SHIFU_EFFECT", "Only the Glaze & Load Shifu places a Heat marker.", {
      workerId: action.workerId,
      effect,
      locationId: "glaze_load",
      field: "heatMarkerCeramicId",
    });
  }
  const placed = heatMarkerOf(game, playerId, "own");
  if (placed !== null) {
    return ruleError("HEAT_MARKER_INVALID", "Your Heat marker is already on a ceramic.", {
      ceramicId: placed.id,
      source: "own",
      field: "heatMarkerCeramicId",
    });
  }
  const target = lookup(game.ceramics, targetId);
  if (target === undefined) {
    return ruleError("CERAMIC_NOT_FOUND", "That ceramic does not exist.", { ceramicId: targetId, field: "heatMarkerCeramicId" });
  }
  if (target.ownerId !== playerId) {
    return ruleError("CERAMIC_NOT_OWNED", "The Heat marker goes on one of your own ceramics.", {
      ceramicId: targetId,
      field: "heatMarkerCeramicId",
    });
  }
  const loadedNow = action.loads.some((load) => load.ceramicId === targetId);
  if (target.stage !== "loaded" && !loadedNow) {
    return ruleError("ILLEGAL_CERAMIC_STAGE", "The Heat marker goes on a ceramic in the Shared or Imperial Kiln.", {
      ceramicId: targetId,
      stage: target.stage,
      expectedStage: "loaded",
      field: "heatMarkerCeramicId",
    });
  }
  if (target.stage === "loaded" && target.heatMarker !== null) {
    return ruleError("HEAT_MARKER_INVALID", "A ceramic may carry at most 1 Heat marker.", {
      ceramicId: targetId,
      source: target.heatMarker.source,
      field: "heatMarkerCeramicId",
    });
  }
  return null;
}

function validate(view: ActorView, action: GlazeLoadAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "glaze_load", false);
  if (placementError !== null) {
    return placementError;
  }
  const effect = workerEffectFor(view, action.workerId, false);
  // L141, L182, R5: at least 1 Shaped vessel with a legal destination (current Shapes, §11 Q3).
  if (!hasAnyLegalLoad(view.game, view.viewerId)) {
    return ruleError("NO_MAIN_ACTION_POSSIBLE", "You have no Shaped vessel with a legal destination.", {
      locationId: "glaze_load",
      workerId: action.workerId,
      effect,
    });
  }
  const loadError = validateLoads(view, action.loads, LOCATIONS.glaze_load.effects[effect].maxLoads, "glaze_load");
  if (loadError !== null) {
    return loadError;
  }
  return heatMarkerError(view, action, effect);
}

/** Kiln Tending (T20, L627): once per round, after a Glaze & Load action that loaded ≥ 1
 * ceramic, +1 Clay +1 Wood. Automatic: saving it gains nothing (INT). */
function resolveKilnTending(draft: GameState, playerId: PlayerId, loadCount: number, ctx: ResolveContext): void {
  if (loadCount < 1 || !techReady(player(draft, playerId), KILN_TENDING)) {
    return;
  }
  markTechUsed(draft, playerId, KILN_TENDING, ctx);
  const { clay, wood } = TECHS.T20.params;
  gain(draft, playerId, { clay, wood }, "kiln_tending", ctx);
}

function resolve(draft: GameState, playerId: PlayerId, action: GlazeLoadAction, ctx: ResolveContext): void {
  placeWorker(draft, playerId, action.workerId, "glaze_load", false, ctx);
  for (const spec of action.loads) {
    loadCeramic(draft, playerId, spec, "glaze_load", ctx);
  }
  if (action.heatMarkerCeramicId !== undefined) {
    const target = ceramic(draft, action.heatMarkerCeramicId);
    invariant(target.stage === "loaded" && target.heatMarker === null, `${target.id} cannot take a Heat marker`);
    // Face down: nothing hidden is committed yet; the face is chosen in the Heat-marker step (INT).
    target.heatMarker = { source: "own", faceDown: true };
    emit(ctx, { type: "HEAT_MARKER_PLACED", playerId, ceramicId: target.id });
  }
  resolveKilnTending(draft, playerId, action.loads.length, ctx);
  ctx.flow.workerActionDone(draft, playerId, ctx);
}

export const handlers: Pick<ActionHandlerTable, "PLACE_GLAZE_LOAD"> = {
  PLACE_GLAZE_LOAD: {
    phases: ["work_turn"],
    validate,
    resolve,
  },
};
