/**
 * Order Phase: a single pass in First Player order (rev. 5 L143, L318, L700; INT: Order Phase).
 *
 * - Beginning with the First Player and going clockwise, each player may take any number of free
 *   actions (L170, L318): complete held Orders one at a time, sell Flawed ceramics, spend
 *   Imperial Priority (`freeActions.ts`); then they end their turn (`END_ORDER_TURN`). Each
 *   player gets exactly one turn; nobody acts twice.
 * - It is the first chance to deliver ceramics fired this round (L176, L318). In Round 5, with
 *   the Cleanup trim skipped, it is the last free-action window before scoring.
 * - Only held Orders can be completed; face-up Main Orders never can, and the display does not
 *   change during the phase (L318): nothing here touches `market`.
 * - A turn opens only while `orderTurnOpen` holds (I3): a held Order its player can complete
 *   (hidden; the accepted precedent, DESIGN §4.5), a Finished Flawed ceramic to sell or a usable
 *   Imperial Priority. Otherwise it is skipped, at its start and after each free action
 *   (`ORDER_TURN_ENDED{automatic: true}`, DESIGN §3.4, §3.7).
 * - When the pass ends the phase hands over through `ctx.flow.continueAfter("order_phase_done")`.
 *
 * Layer 4: imports layer 0–3.
 */

import { invariant } from "../errors.ts";
import { imperialPriorityUsable, sellableFlawed } from "../freeActionWindow.ts";
import { emit, phaseAs, turnOrder } from "../state.ts";
import type { ActionHandlerTable, GameState, PlayerId, ResolveContext } from "../types.ts";
import { completableOrderIds } from "./completion.ts";

/**
 * Whether `playerId`'s Order Phase turn has anything in it (I3): a held Order they can complete
 * now, a Finished Flawed ceramic to sell, or Imperial Priority usable (Round 5 included, where its
 * ceramic is never fired). The Colour Samples swap is not a free action and does not count.
 */
export function orderTurnOpen(draft: GameState, playerId: PlayerId): boolean {
  return (
    completableOrderIds(draft, playerId, draft.hidden.orderHands[playerId] ?? []).length > 0 ||
    sellableFlawed(draft, playerId).length > 0 ||
    imperialPriorityUsable(draft, playerId)
  );
}

/**
 * Starts the turn at `phase.index`, skipping (and ending) every turn with nothing in it; hands
 * over once every player has had their turn.
 */
function startNextTurn(draft: GameState, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  while (phase.index < phase.turnOrder.length) {
    const playerId = phase.turnOrder[phase.index] as PlayerId;
    emit(ctx, { type: "ORDER_TURN_STARTED", playerId });
    if (orderTurnOpen(draft, playerId)) {
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

/** After each free action of the current player's Order Phase turn: the turn ends
 * automatically once nothing is left in it (`orderTurnOpen`). */
export function continueOrderTurn(draft: GameState, playerId: PlayerId, ctx: ResolveContext): void {
  const phase = phaseAs(draft, "orders");
  invariant(phase.turnOrder[phase.index] === playerId, `${playerId} is not the Order Phase player`);
  if (!orderTurnOpen(draft, playerId)) {
    endTurn(draft, playerId, true, ctx);
  }
}

export const handlers: Pick<ActionHandlerTable, "END_ORDER_TURN"> = {
  END_ORDER_TURN: {
    phases: ["orders"],
    // Phase and actor are checked by the dispatcher; ending is always legal (DESIGN §3.6).
    validate: () => null,
    resolve: (draft, actorId, _action, ctx) => {
      endTurn(draft, actorId, false, ctx);
    },
  },
};
