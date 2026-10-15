/**
 * Work Phase: turns, the before/after-action window, END_TURN and the deferred Main display
 * refill (L133–143, L190, L292, L390, L631; DESIGN §3.2).
 *
 * - Turns run First Player clockwise, one worker per turn, until nobody has an available
 *   worker (L135). Passing is impossible: END_TURN before the worker action is
 *   `WORKER_ACTION_REQUIRED` (L142).
 * - Every location module ends its worker action through `ctx.flow.workerActionDone`, which
 *   production wires to `completeWorkerAction` (DESIGN §2.2, §2.5).
 * - `completeWorkerAction` opens the after-action window only when Canal Barge is owned and
 *   unused this round (deliberately regardless of the hand, DESIGN §4.5) or Imperial Priority
 *   is usable; otherwise the turn ends automatically (DESIGN §3.7).
 * - `endTurn` runs the deferred refill (L190, L390) after the after-action window, so a Canal
 *   Barge there may complete an Order reserved by the same action (INT: deferred refill).
 *
 * Layer 4 (P4). Imports layers 0–3 only; `work/windowAbilities` imports this module.
 */

import { invariant, ruleError } from "../errors.ts";
import { imperialKilnEmpty } from "../kilnLoading.ts";
import { refillMainDisplay } from "../market.ts";
import { availableWorkers } from "../placement.ts";
import { ceramicsOf, emit, nextClockwise, phaseAs, player } from "../state.ts";
import { techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameRuleError,
  GameState,
  PlayerId,
  PublicCore,
  ResolveContext,
  TechId,
} from "../types.ts";

/** Canal Barge (T23, L631): once per round, before or after one of your worker actions. */
const CANAL_BARGE: TechId = "T23";

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
 * Player takes the first turn (L131, L135). With nobody holding a worker the phase ends at
 * once (unreachable in play: workers return at Cleanup, L302).
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
 * Imperial Priority may be used now (L292, R10): the token is held, the Imperial Kiln has been
 * gained and is empty, and the player has at least 1 Shaped vessel. All public facts.
 */
export function imperialPriorityUsable(game: PublicCore, playerId: PlayerId): boolean {
  return (
    player(game, playerId).imperial.priority === "held" &&
    imperialKilnEmpty(game, playerId) &&
    ceramicsOf(game, playerId, "shaped").length > 0
  );
}

/**
 * The after-action window has something to offer: Canal Barge owned and unused this round
 * (regardless of the hand, so the window leaks nothing, DESIGN §4.5), or Imperial Priority
 * usable.
 */
export function afterActionWindowOpen(game: PublicCore, playerId: PlayerId): boolean {
  return techReady(player(game, playerId), CANAL_BARGE) || imperialPriorityUsable(game, playerId);
}

/**
 * The production `flow.workerActionDone` (DESIGN §2.5): the worker action, including any
 * sub-steps, has fully resolved. Opens the after-action window, or ends the turn
 * automatically when it would offer nothing (DESIGN §3.7).
 */
export function completeWorkerAction(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} finished a worker action outside their turn`);
  if (afterActionWindowOpen(draft, playerId)) {
    phase.step = { kind: "after_action" };
    return;
  }
  endTurn(draft, playerId, true, ctx);
}

/**
 * Called by `work/windowAbilities` after each Canal Barge or Imperial Priority use. Before the
 * worker action nothing changes (the action is still due). After it, the window is rechecked
 * and the turn ends automatically once nothing is left (DESIGN §3.2). A token or Imperial
 * Kiln gained in the window keeps it open (INT: before/after-action window).
 */
export function afterWindowAbilityUsed(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} used a window ability outside their turn`);
  if (phase.step.kind !== "after_action") {
    return;
  }
  if (!afterActionWindowOpen(draft, playerId)) {
    endTurn(draft, playerId, true, ctx);
  }
}

/**
 * Ends the active player's Work turn (DESIGN §3.2 step 4):
 * 1. the deferred Main display refill if this player reserved a face-up Order (L190, L390);
 * 2. `WORK_TURN_ENDED`;
 * 3. the next clockwise player with an available worker starts a turn, or, when nobody has
 *    one, `WORK_PHASE_ENDED` and the hand-over to the Firing Phase (L135).
 */
export function endTurn(draft: GameState, playerId: PlayerId, automatic: boolean, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "work_turn");
  invariant(phase.activePlayerId === playerId, `${playerId} cannot end another player's turn`);
  if (draft.market.refillPendingFor === playerId) {
    refillMainDisplay(draft, "end_of_turn", ctx); // clears refillPendingFor
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
