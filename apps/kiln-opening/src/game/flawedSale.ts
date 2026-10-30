/**
 * Selling a Flawed ceramic (rev. 5 L172, L300, L302, L748; change 36; DELTA §16.10.3).
 *
 * - **What:** 1 of your Finished Flawed ceramics per `SELL_FLAWED`, for `FIRING.flawedSaleCoins`
 *   (2) Coins; its Vessel card goes back to its Shape's supply (L172). A ceramic still in a kiln
 *   is never sold: ceramics fired this round become available only after the firing (L176).
 * - **When:** it is a free action (L168–176), so only in a free-action window: before or after
 *   the worker action of your own Work turn, and in your own Order Phase turn
 *   (`freeActionWindow.ts`). Never on another player's turn, never during the firing (the
 *   after-Quality step included) and never at Cleanup (R26: owner ruling R20's after-Quality and
 *   Cleanup trim windows are withdrawn). In Round 5 the Order Phase turn is the last chance
 *   before scoring.
 * - The sale is not a worker action. The handler (`freeActions.ts`, layer 5) rechecks an
 *   after-action window or an Order Phase turn after it, as after every free action.
 *
 * Everything here is public: which ceramics are Flawed, and every sale.
 *
 * Layer 4: imports layers 0–3 (`content.ts`, `state.ts`, `freeActionWindow.ts`).
 */

import { FIRING } from "./content.ts";
import { invariant } from "./errors.ts";
import { freeActionWindowOf, sellableFlawed } from "./freeActionWindow.ts";
import { emit, gain, lookup, returnVesselCard } from "./state.ts";
import type { CeramicId, FreeActionWindow, GameState, PlayerId, PlayerView, ResolveContext, SellFlawedOptions } from "./types.ts";

export { sellableFlawed } from "./freeActionWindow.ts";

/** The viewer's sale choice (rev. 5 L172), or null outside their free-action windows or with
 * nothing to sell. */
export function sellFlawedOptions(view: PlayerView): SellFlawedOptions | null {
  const viewerId = view.viewerId;
  if (viewerId === null || freeActionWindowOf(view.game, viewerId) === null) {
    return null;
  }
  const ceramicIds = sellableFlawed(view.game, viewerId);
  return ceramicIds.length === 0 ? null : { ceramicIds, coins: FIRING.flawedSaleCoins };
}

/**
 * Sells one of `playerId`'s Finished Flawed ceramics in `window` (the validator checked the
 * window and the target): the ceramic leaves the game and its Vessel card returns to the supply
 * (L172). Emits `CERAMIC_SOLD`, then `RESOURCES_CHANGED { reason: "flawed_sale" }`.
 */
export function sellFlawedCeramic(
  draft: GameState,
  playerId: PlayerId,
  ceramicId: CeramicId,
  window: FreeActionWindow,
  ctx: ResolveContext,
): void {
  const sold = lookup(draft.ceramics, ceramicId);
  invariant(sold !== undefined && sold.ownerId === playerId, `${ceramicId} is not ${playerId}'s ceramic`);
  invariant(sold.stage === "finished" && sold.quality === "flawed", `${ceramicId} is not a Finished Flawed ceramic`);
  delete draft.ceramics[ceramicId];
  returnVesselCard(draft, sold.vesselInstanceId);
  const coins = FIRING.flawedSaleCoins;
  emit(ctx, { type: "CERAMIC_SOLD", playerId, ceramicId, coins, window });
  gain(draft, playerId, { coins }, "flawed_sale", ctx);
}
