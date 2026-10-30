/**
 * Free actions (rev. 5 L168–176, change 36; DELTA §16.6, §16.10.2): `SELL_FLAWED`,
 * `COMPLETE_ORDER` and `USE_IMPERIAL_PRIORITY`, any number, in any order, in a free-action window:
 * before or after the worker action of the actor's own Work turn (not during it), and the
 * actor's own Order Phase turn. Never on another player's turn, during the firing, at Setup, in
 * the Setter's Mark window or at Cleanup (L176, I1).
 *
 * Validation order: the dispatcher (game over, seat, `phases`, the decision prompt's actor),
 * then `freeActionWindowError` (`WORKER_ACTION_IN_PROGRESS` in a Work sub-step), then the
 * action's own checks.
 *
 * - **Rewards count at once** (L176): a completion's Coins, Crowns and milestones resolve inside
 *   the command, so a completion before the worker action pays for the placement that follows
 *   (a Crown to Recognition 2 gives the Imperial Kiln for a Glaze & Load, to Recognition 3 the
 *   Imperial Priority token for the same window, and makes the Magistrate's Hall illegal).
 * - **Once-per-round completion effects** (Ru, Guan, Tribute Ware, Canal Barge) share one use per
 *   round across every window of the round (L176; `orders/completion.ts`).
 * - **Continuation** (`continueAfterFreeAction`): in a Work turn, `work/turn.afterWindowAbilityUsed`
 *   (before the action nothing changes; after it the window is rechecked on public facts, I2);
 *   in the Order Phase, `orders/phase.continueOrderTurn` (the turn ends when `orderTurnOpen` no
 *   longer holds, I3).
 *
 * Layer 5: imports layers 0–4 (`freeActionWindow` 3, `orders/completion` 3, `flawedSale`,
 * `orders/phase`, `work/turn`, `work/windowAbilities` 4); `engine.ts` adds its handlers.
 */

import { invariant, ruleError } from "./errors.ts";
import { freeActionWindowError, freeActionWindowOf, sellableFlawed } from "./freeActionWindow.ts";
import { sellFlawedCeramic } from "./flawedSale.ts";
import { resolveOrderCompletion, validateOrderCompletion } from "./orders/completion.ts";
import { continueOrderTurn } from "./orders/phase.ts";
import { lookup } from "./state.ts";
import type { ActionHandlerTable, FreeActionWindow, GameState, PlayerId, ResolveContext } from "./types.ts";
import { afterWindowAbilityUsed } from "./work/turn.ts";
import { imperialPriorityError, useImperialPriority } from "./work/windowAbilities.ts";

/** The actor's free-action window, read before resolving (the validator guaranteed one). */
function windowOf(draft: GameState, actorId: PlayerId): FreeActionWindow {
  const window = freeActionWindowOf(draft, actorId);
  invariant(window !== null, `${actorId} took a free action outside a free-action window`);
  return window;
}

/**
 * After each free action: a Work turn's after-action window is rechecked (and the turn ends
 * automatically when it has nothing left, I2; before the action nothing changes); an Order Phase
 * turn ends automatically when nothing is left in it (I3).
 */
export function continueAfterFreeAction(draft: GameState, actorId: PlayerId, ctx: ResolveContext): void {
  switch (draft.phase.type) {
    case "work_turn":
      afterWindowAbilityUsed(draft, actorId, ctx);
      return;
    case "orders":
      continueOrderTurn(draft, actorId, ctx);
      return;
    default:
      invariant(false, `A free action resolved in ${draft.phase.type}`);
  }
}

export const handlers: Pick<ActionHandlerTable, "SELL_FLAWED" | "COMPLETE_ORDER" | "USE_IMPERIAL_PRIORITY"> = {
  SELL_FLAWED: {
    phases: ["work_turn", "orders"],
    validate(view, action) {
      const windowError = freeActionWindowError(view.game, view.viewerId, action.type);
      if (windowError !== null) {
        return windowError;
      }
      const found = lookup(view.game.ceramics, action.ceramicId);
      if (found === undefined) {
        return ruleError("CERAMIC_NOT_FOUND", "That ceramic does not exist.", { ceramicId: action.ceramicId });
      }
      if (found.ownerId !== view.viewerId) {
        return ruleError("CERAMIC_NOT_OWNED", "That ceramic is not yours.", { ceramicId: action.ceramicId, ownerId: found.ownerId });
      }
      if (!sellableFlawed(view.game, view.viewerId).includes(action.ceramicId)) {
        return ruleError("INVALID_TARGET", "Only a Flawed ceramic can be sold.", { ceramicId: action.ceramicId, reason: "not_flawed" });
      }
      return null;
    },
    resolve(draft, actorId, action, ctx) {
      sellFlawedCeramic(draft, actorId, action.ceramicId, windowOf(draft, actorId), ctx);
      continueAfterFreeAction(draft, actorId, ctx);
    },
  },
  COMPLETE_ORDER: {
    phases: ["work_turn", "orders"],
    validate(view, action) {
      return freeActionWindowError(view.game, view.viewerId, action.type) ?? validateOrderCompletion(view, action);
    },
    resolve(draft, actorId, action, ctx) {
      resolveOrderCompletion(draft, actorId, action, windowOf(draft, actorId), ctx);
      continueAfterFreeAction(draft, actorId, ctx);
    },
  },
  USE_IMPERIAL_PRIORITY: {
    phases: ["work_turn", "orders"],
    validate(view, action) {
      return freeActionWindowError(view.game, view.viewerId, action.type) ?? imperialPriorityError(view, action);
    },
    resolve(draft, actorId, action, ctx) {
      useImperialPriority(draft, actorId, action, windowOf(draft, actorId), ctx);
      continueAfterFreeAction(draft, actorId, ctx);
    },
  },
};
