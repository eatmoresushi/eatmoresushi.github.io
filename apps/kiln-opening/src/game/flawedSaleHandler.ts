/**
 * `SELL_FLAWED` (change 30, rev. 4 L282, L284; owner ruling R20; DELTA §15.9.11): sell 1 of your
 * Flawed ceramics for 2 Coins during your own turn. The rule helpers live in `flawedSale.ts`;
 * this handler adds only the hand-back to the turn the sale was made in:
 *
 * - `work_turn` (the before- or after-action window) and `cleanup_hand_limit` (a pending trim):
 *   nothing changes; the player still owes their worker action, `END_TURN` or their trim.
 * - `firing_after_quality`: the turn continues while an after-Quality ability is still
 *   eligible, otherwise it passes (`afterQuality.continueAfterSale`).
 * - `orders`: the turn ends automatically when nothing is left to complete or sell
 *   (`orders/phase.continueAfterSale`).
 *
 * Layer 5: imports the layer-4 turn continuations (DESIGN §2.2); `engine.ts` adds its handler.
 */

import { ruleError } from "./errors.ts";
import { continueAfterSale as continueAfterQualityTurn } from "./firing/afterQuality.ts";
import { saleWindowError, sellableFlawed, sellFlawedCeramic } from "./flawedSale.ts";
import { continueAfterSale as continueOrderTurn } from "./orders/phase.ts";
import { lookup } from "./state.ts";
import type { ActionHandlerTable } from "./types.ts";

export const handlers: Pick<ActionHandlerTable, "SELL_FLAWED"> = {
  SELL_FLAWED: {
    phases: ["work_turn", "orders", "firing_after_quality", "cleanup_hand_limit"],
    validate(view, action) {
      const windowError = saleWindowError(view.game, view.viewerId);
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
      sellFlawedCeramic(draft, actorId, action.ceramicId, ctx);
      switch (draft.phase.type) {
        case "firing_after_quality":
          continueAfterQualityTurn(draft, actorId, ctx);
          return;
        case "orders":
          continueOrderTurn(draft, actorId, ctx);
          return;
        default:
          return;
      }
    },
  },
};
