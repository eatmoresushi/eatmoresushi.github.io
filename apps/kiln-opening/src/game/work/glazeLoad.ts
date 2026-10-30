/**
 * Glaze & Load (L207–217, changes 31, 34, 35), incl. the kiln fuel (R24), Kiln Master's
 * marker at loading (T24, L647, R22) and Kiln Tending (T20, L633; automatic on the first
 * qualifying action each round, INT).
 *
 * One atomic command (DESIGN §3.5): every choice — 1 or 2 ordered loads, Glaze, destination,
 * Imperial modifier, Kiln Furniture, Inverted Firing, Reworking Table, Kiln Master — is known
 * when it is made. The Shifu simply loads up to 2: there is no player Heat marker since
 * revision 4 (changes 28, 31). Loading rules live in `kilnLoading.ts`.
 *
 * Kiln fuel (L215, change 35, R24): the action pays 1 Wood when any of its loads goes into
 * the Shared Kiln, whether it loads 1 vessel or 2, Apprentice or Shifu; an action that loads only
 * into the Imperial Kiln pays nothing. The Wood is paid once the worker is placed, before the
 * loads; Kiln Tending's +1 Wood comes after them and never pays this action's fuel.
 *
 * Layer 4. Hands over through `ctx.flow.workerActionDone` (DESIGN §2.2), after recording the
 * command's `endTurn` (owner UI decision D21, `state.noteEndTurnRequest`; DELTA §16.24).
 */

import { LOCATIONS, TECHS } from "../content.ts";
import { ruleError } from "../errors.ts";
import { actionFuel, hasAnyLegalLoad, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { placeWorker, validatePlacement, workerEffectFor } from "../placement.ts";
import { gain, lookup, noteEndTurnRequest, player, spend } from "../state.ts";
import { markTechUsed, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  CostLine,
  CostQuote,
  GameAction,
  GameRuleError,
  GameState,
  PlayerId,
  ResolveContext,
  ResourceState,
  TechId,
} from "../types.ts";

type GlazeLoadAction = Extract<GameAction, { type: "PLACE_GLAZE_LOAD" }>;

const KILN_TENDING: TechId = "T20";

function zero(): ResourceState {
  return { clay: 0, wood: 0, coins: 0 };
}

function validate(view: ActorView, action: GlazeLoadAction): GameRuleError | null {
  const placementError = validatePlacement(view, action.workerId, "glaze_load", false);
  if (placementError !== null) {
    return placementError;
  }
  const effect = workerEffectFor(view, action.workerId, false);
  // L164, L216, R5, R24: at least 1 Shaped vessel with a destination you can pay for
  // (current Shapes, §11 Q3).
  if (!hasAnyLegalLoad(view.game, view.viewerId)) {
    return ruleError(
      "NO_MAIN_ACTION_POSSIBLE",
      "You have no Shaped vessel with a legal destination you can pay for: the Shared Kiln needs 1 Wood.",
      { locationId: "glaze_load", workerId: action.workerId, effect },
    );
  }
  return validateLoads(view, action.loads, LOCATIONS.glaze_load.effects[effect].maxLoads, "glaze_load");
}

/**
 * The engine's cost of a Glaze & Load command (DESIGN §5.4, ENGINE_V1.6.2_DELTA.md §15.9.4): a
 * `kiln_fuel` line of 1 Wood when any load goes into the Shared Kiln (R24), nothing otherwise.
 * `ok` and `error` are the validator's (`validateAction` also checks the phase and the actor).
 * Kiln Tending's gain is not quoted: it is automatic and comes after the loads.
 */
export function quoteGlazeLoad(view: ActorView, action: GlazeLoadAction): CostQuote {
  const pay = zero();
  const lines: CostLine[] = [];
  const fuel = actionFuel(action.loads, "glaze_load");
  if (fuel > 0) {
    pay.wood = fuel;
    lines.push({ kind: "kiln_fuel", resource: "wood", amount: fuel, itemIndex: null });
  }
  const p = player(view.game, view.viewerId);
  const error =
    lookup(p.workers, action.workerId) === undefined
      ? ruleError("WORKER_UNAVAILABLE", "That worker is not available.", { workerId: action.workerId })
      : validate(view, action);
  return { ok: error === null, error, pay, gain: zero(), lines };
}

/** Kiln Tending (T20, L633): once per round, after a Glaze & Load action that loaded ≥ 1
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
  noteEndTurnRequest(draft, playerId, action.endTurn);
  placeWorker(draft, playerId, action.workerId, "glaze_load", false, ctx);
  // Kiln fuel (L215, R24): 1 Wood for the whole action when it loads into the Shared Kiln.
  spend(draft, playerId, { wood: actionFuel(action.loads, "glaze_load") }, "kiln_fuel", ctx);
  for (const spec of action.loads) {
    loadCeramic(draft, playerId, spec, "glaze_load", ctx);
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
