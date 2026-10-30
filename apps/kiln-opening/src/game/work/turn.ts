/**
 * Work Phase: turns, the before/after-action window, END_TURN and the deferred refills of the
 * Main display and the Tech displays (L156–166, L221, L314, L405, v1.6.2 L239, L632;
 * DESIGN §3.2).
 *
 * - Turns run First Player clockwise, one worker per turn, until nobody has an available
 *   worker (L158). Passing is impossible: END_TURN before the worker action is
 *   `WORKER_ACTION_REQUIRED` (L165).
 * - Every location module ends its worker action through `ctx.flow.workerActionDone`, which
 *   production wires to `completeWorkerAction` (DESIGN §2.2, §2.5).
 * - The before- and after-action steps are the player's free-action windows (rev. 5 L168–176):
 *   selling a Flawed ceramic, completing held Orders and spending Imperial Priority
 *   (`freeActions.ts`), and the Colour Samples swap (`work/windowAbilities.ts`), any number, in
 *   any order. Their rewards count for the placement that follows (L176).
 * - `completeWorkerAction` opens the after-action window only while it can offer something on
 *   public facts alone (I2, `afterActionWindowOpen`): the Colour Samples swap ready with at least
 *   1 held Order, Imperial Priority usable, a Finished Flawed ceramic to sell, or at least 1 held
 *   Order with at least 1 Finished ceramic that is not Flawed, deliberately regardless of what
 *   the hand holds (DESIGN §4.5). Otherwise the turn ends automatically (DESIGN §3.7). After each
 *   free action or swap there, `afterWindowAbilityUsed` rechecks it.
 * - `endTurn` runs the deferred refill (L221, L405) after the after-action window, so a swap
 *   there may discard an Order the same action reserved, and its look takes deck cards before
 *   the refill does (INT: deferred refill). It then refills each Tech discipline to 2 as its
 *   deck allows: a taken Tech's position stays empty until the taker's turn ends (v1.6.2 L239).
 *
 * Layer 4 (P4). Imports layers 0–3 only; `work/windowAbilities` imports this module.
 */

import { DISCIPLINES } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { afterActionWindowOpen, publicGameOf } from "../freeActionWindow.ts";
import { refillMainDisplay, refillTechDisplay } from "../market.ts";
import { availableWorkers } from "../placement.ts";
import { emit, nextClockwise, phaseAs } from "../state.ts";
import type { ActionHandlerTable, ActorView, GameRuleError, GameState, PlayerId, PublicCore, ResolveContext } from "../types.ts";

// The public-fact predicates moved to `freeActionWindow.ts` (DELTA §16.10.1); re-exported here
// so existing imports keep working.
export { afterActionWindowOpen, colourSamplesSwapUsable, imperialPriorityUsable } from "../freeActionWindow.ts";

/** The first player, from `start` clockwise (inclusive), who still has an available worker. */
function firstWithWorker(game: PublicCore, start: PlayerId): PlayerId | null {
  const order = game.playerOrder;
  const from = order.indexOf(start);
  invariant(from >= 0, `Player ${start} is not seated`);
  for (let offset = 0; offset < order.length; offset += 1) {
    const candidate = order[(from + offset) % order.length] as PlayerId;
    if (availableWorkers(game, candidate).length > 0) {
      return candidate;
    }
  }
  return null;
}

function startTurn(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  draft.phase = { type: "work_turn", activePlayerId: playerId, step: { kind: "before_action" } };
  emit(ctx, { type: "WORK_TURN_STARTED", playerId });
}

function endWorkPhase(draft: GameState, ctx: ResolveContext): void {
  emit(ctx, { type: "WORK_PHASE_ENDED", round: draft.round });
  ctx.flow.continueAfter("work_phase_done", draft, ctx);
}

/**
 * Opens the Work Phase after the Start of Round (wired to `round_start_done`): the First
 * Player takes the first turn (L154, L158). With nobody holding a worker the phase ends at
 * once (unreachable in play: workers return at Cleanup, L324).
 */
export function openWorkPhase(draft: GameState, ctx: ResolveContext): void {
  const first = firstWithWorker(draft, draft.firstPlayerId);
  if (first === null) {
    endWorkPhase(draft, ctx);
    return;
  }
  startTurn(draft, first, ctx);
}

/**
 * The production `flow.workerActionDone` (DESIGN §2.5): the worker action, including any
 * sub-steps, has fully resolved. Opens the after-action window, or ends the turn
 * automatically when it would offer nothing (DESIGN §3.7).
 */
export function completeWorkerAction(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} finished a worker action outside their turn`);
  if (afterActionWindowOpen(publicGameOf(draft), playerId)) {
    phase.step = { kind: "after_action" };
    return;
  }
  endTurn(draft, playerId, true, ctx);
}

/**
 * Called after each free action of a Work turn (`freeActions.ts`) and each completed Colour
 * Samples swap (`work/selectChoose.ts`). Before the worker action nothing changes (the action is
 * still due). After it, the window is rechecked (`afterActionWindowOpen`, I2) and the turn ends
 * automatically once nothing is left (DESIGN §3.2).
 */
export function afterWindowAbilityUsed(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} used a window ability outside their turn`);
  if (phase.step.kind !== "after_action") {
    return;
  }
  if (!afterActionWindowOpen(publicGameOf(draft), playerId)) {
    endTurn(draft, playerId, true, ctx);
  }
}

/**
 * Ends the active player's Work turn (DESIGN §3.2 step 4):
 * 1. the deferred Main display refill if this player reserved a face-up Order this turn (L221,
 *    L405): at a Select, or the Magistrate's Hall Shifu's Crown Order (L263), one refill
 *    for every face-up take of the turn;
 * 2. the deferred Tech refill: every discipline back to 2 as its deck allows, in
 *    `DISCIPLINES` order (v1.6.2 L239). Only a Guild Hall take this turn leaves a display
 *    short with cards in its deck, so this refills exactly the taker's disciplines;
 *    `TECH_DISPLAY_REFILLED` is emitted only where a Tech is revealed;
 * 3. `WORK_TURN_ENDED`;
 * 4. the next clockwise player with an available worker starts a turn, or, when nobody has
 *    one, `WORK_PHASE_ENDED` and the hand-over to the Firing Phase (L158).
 */
export function endTurn(draft: GameState, playerId: PlayerId, automatic: boolean, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} cannot end another player's turn`);
  if (draft.market.refillPendingFor === playerId) {
    refillMainDisplay(draft, "end_of_turn", ctx); // clears refillPendingFor
  }
  for (const discipline of DISCIPLINES) {
    refillTechDisplay(draft, discipline, ctx);
  }
  emit(ctx, { type: "WORK_TURN_ENDED", playerId, automatic });
  const next = firstWithWorker(draft, nextClockwise(draft, playerId));
  if (next === null) {
    // No sub-step outlives the phase; the Firing opener replaces the phase.
    phase.step = { kind: "before_action" };
    endWorkPhase(draft, ctx);
    return;
  }
  startTurn(draft, next, ctx);
}

function validateEndTurn(view: ActorView): GameRuleError | null {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "You can end a turn only during the Work Phase.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  switch (phase.step.kind) {
    case "after_action":
      return null;
    case "before_action":
      return ruleError(
        "WORKER_ACTION_REQUIRED",
        "You may not pass in the Work Phase: place 1 worker (the Canal Wharf is always available).",
        {},
      );
    default:
      return ruleError("WRONG_PHASE", "Finish your worker action before ending your turn.", {
        phase: phase.type,
        step: phase.step.kind,
      });
  }
}

export const handlers: Pick<ActionHandlerTable, "END_TURN"> = {
  END_TURN: {
    phases: ["work_turn"],
    validate: (view) => validateEndTurn(view),
    resolve: (draft, actorId, _action, ctx) => endTurn(draft, actorId, false, ctx),
  },
};
