/**
 * Order Phase: a single pass in First Player order (L294–298, INT: Order Phase).
 *
 * - Beginning with the First Player and going clockwise, each player may complete any number
 *   of held Orders, one at a time (`COMPLETE_ORDER`), then ends their turn (`END_ORDER_TURN`).
 *   Each player gets exactly one turn; nobody acts twice.
 * - Only held Orders can be completed; face-up Main Orders never can, and the display does
 *   not change during the phase (L296): nothing here touches `market`.
 * - A player with nothing completable is skipped automatically, at the start of their turn
 *   and after each completion (`ORDER_TURN_ENDED{automatic: true}`, DESIGN §3.4, §4.5).
 * - When the pass ends the phase hands over through `ctx.flow.continueAfter("order_phase_done")`.
 *
 * Layer 4: imports layer 0–3.
 */

import { phaseAs, emit, turnOrder } from "../state.ts";
import type { ActionHandlerTable, GameState, PlayerId, ResolveContext } from "../types.ts";
import { completableOrderIds, resolveOrderCompletion, validateOrderCompletion } from "./completion.ts";

function hasCompletableOrder(draft: GameState, playerId: PlayerId): boolean {
  return completableOrderIds(draft, playerId, draft.hidden.orderHands[playerId] ?? []).length > 0;
}

/**
 * Starts the turn at `phase.index`, skipping (and ending) every turn with nothing
 * completable; hands over once every player has had their turn.
 */
function startNextTurn(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  while (phase.index < phase.turnOrder.length) {
    const playerId = phase.turnOrder[phase.index] as PlayerId;
    emit(ctx, { type: "ORDER_TURN_STARTED", playerId });
    if (hasCompletableOrder(draft, playerId)) {
      return;
    }
    emit(ctx, { type: "ORDER_TURN_ENDED", playerId, automatic: true });
    phase.index += 1;
  }
  ctx.flow.continueAfter("order_phase_done", draft, ctx);
}

/** Ends the current player's turn and starts the next one. */
function endTurn(draft: GameState, playerId: PlayerId, automatic: boolean, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  emit(ctx, { type: "ORDER_TURN_ENDED", playerId, automatic });
  phase.index += 1;
  startNextTurn(draft, ctx);
}

/** Opens Phase 4 (wired to `firing_done`). */
export function openOrderPhase(draft: GameState, ctx: ResolveContext): void {
  draft.phase = { type: "orders", turnOrder: turnOrder(draft), index: 0 };
  startNextTurn(draft, ctx);
}

export const handlers: Pick<ActionHandlerTable, "COMPLETE_ORDER" | "END_ORDER_TURN"> = {
  COMPLETE_ORDER: {
    phases: ["orders"],
    validate: (view, action) => validateOrderCompletion(view, action),
    resolve: (draft, actorId, action, ctx) => {
      resolveOrderCompletion(draft, actorId, action, "order_phase", ctx);
      if (!hasCompletableOrder(draft, actorId)) {
        endTurn(draft, actorId, true, ctx);
      }
    },
  },
  END_ORDER_TURN: {
    phases: ["orders"],
    // Phase and actor are checked by the dispatcher; ending is always legal (DESIGN §3.6).
    validate: () => null,
    resolve: (draft, actorId, _action, ctx) => {
      endTurn(draft, actorId, false, ctx);
    },
  },
};
