/**
 * Order Phase: a single pass in First Player order (rev. 4 L298–302, INT: Order Phase). It is
 * the only place Orders are completed (rev. 4 L300): Ru, Guan, Tribute Ware, Crackle wildcards,
 * Crackle VP (rev. 4 L465, L480) and Canal Barge's 2 Coins all trigger here.
 *
 * - Beginning with the First Player and going clockwise, each player may complete any number
 *   of held Orders, one at a time (`COMPLETE_ORDER`), then ends their turn (`END_ORDER_TURN`).
 *   Each player gets exactly one turn; nobody acts twice.
 * - The Order Phase turn is also one of its player's sale windows (R20): they may sell Flawed
 *   ceramics (`SELL_FLAWED`, `flawedSaleHandler.ts`). In Round 5, with the Cleanup trim skipped,
 *   it is the last one before scoring.
 * - Only held Orders can be completed; face-up Main Orders never can, and the display does
 *   not change during the phase (L297): nothing here touches `market`.
 * - A player with nothing completable and no Flawed ceramic to sell is skipped automatically,
 *   at the start of their turn and after each completion or sale
 *   (`ORDER_TURN_ENDED{automatic: true}`, DESIGN §3.4, §4.5; DELTA §15.9.12). Which ceramics
 *   are Flawed is public, so a turn opened for a sale reveals nothing hidden.
 * - When the pass ends the phase hands over through `ctx.flow.continueAfter("order_phase_done")`.
 *
 * Layer 4: imports layer 0–3.
 */

import { invariant } from "../errors.ts";
import { sellableFlawed } from "../flawedSale.ts";
import { phaseAs, emit, turnOrder } from "../state.ts";
import type { ActionHandlerTable, GameState, PlayerId, ResolveContext } from "../types.ts";
import { completableOrderIds, resolveOrderCompletion, validateOrderCompletion } from "./completion.ts";

function hasCompletableOrder(draft: GameState, playerId: PlayerId): boolean {
  return completableOrderIds(draft, playerId, draft.hidden.orderHands[playerId] ?? []).length > 0;
}

/** Whether `playerId`'s Order Phase turn has anything left in it: an Order to complete or a
 * Flawed ceramic to sell (R20). */
function hasOrderTurnBusiness(draft: GameState, playerId: PlayerId): boolean {
  return hasCompletableOrder(draft, playerId) || sellableFlawed(draft, playerId).length > 0;
}

/**
 * Starts the turn at `phase.index`, skipping (and ending) every turn with nothing to complete
 * or sell; hands over once every player has had their turn.
 */
function startNextTurn(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  while (phase.index < phase.turnOrder.length) {
    const playerId = phase.turnOrder[phase.index] as PlayerId;
    emit(ctx, { type: "ORDER_TURN_STARTED", playerId });
    if (hasOrderTurnBusiness(draft, playerId)) {
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

/** After the current player sold a Flawed ceramic in their Order Phase turn (R20): the turn
 * ends automatically when nothing is left to complete or sell, as after a completion. */
export function continueAfterSale(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  invariant(phase.turnOrder[phase.index] === playerId, `${playerId} is not the Order Phase player`);
  if (!hasOrderTurnBusiness(draft, playerId)) {
    endTurn(draft, playerId, true, ctx);
  }
}

export const handlers: Pick<ActionHandlerTable, "COMPLETE_ORDER" | "END_ORDER_TURN"> = {
  COMPLETE_ORDER: {
    phases: ["orders"],
    validate: (view, action) => validateOrderCompletion(view, action),
    resolve: (draft, actorId, action, ctx) => {
      resolveOrderCompletion(draft, actorId, action, ctx);
      if (!hasOrderTurnBusiness(draft, actorId)) {
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
