/**
 * Selling a Flawed ceramic (change 30, rev. 4 L282, L284, L729; owner ruling R20; DELTA
 * §15.9.11). It replaces revision 3's salvage step (Appendix D step 11), which is gone.
 *
 * - **What:** 1 of your Flawed ceramics per `SELL_FLAWED`, for `FIRING.flawedSaleCoins` (2)
 *   Coins; its Vessel card goes back to its Shape's supply (rev. 4 L284). Sellable: any Finished
 *   Flawed ceramic of yours, and, in your own after-Quality turn, also a ceramic of this firing
 *   whose Quality is Flawed now. That one leaves its kiln space (and the game) at once, so
 *   Second Firing can no longer take it; Kiln Furniture beneath it moves to the ceramic left in
 *   a stacked space, or returns.
 * - **When (R20):** "at any time" (rev. 4 L284) means during its owner's turn, while the game
 *   waits for that player's own decision: the before- or after-action window of their Work
 *   turn, their Order Phase turn, their own after-Quality turn, or their Cleanup hand trim
 *   while it is pending. Never during another player's turn, never in the simultaneous
 *   Contribution choice and never in the middle of resolving an action (a Work sub-step such
 *   as a Select or the Guild Hall inspection, Test Pieces, Jun, the Second Firing choice,
 *   Setter's Mark, Setup).
 * - The sale is free: it never ends the turn or changes the step by itself. The handler
 *   (`flawedSaleHandler.ts`, layer 5) only lets the after-Quality and Order Phase turns pass
 *   when nothing is left to do in them.
 *
 * Everything here is public (L508): which ceramics are Flawed, and every sale.
 *
 * Layer 3: imports layers 0–2 (`state.ts`, `content.ts`, `firing/heat.ts`).
 */

import { FIRING } from "./content.ts";
import { invariant, ruleError } from "./errors.ts";
import { firingRecord, firingRecordsInOrder } from "./firing/heat.ts";
import { ceramicSequence, ceramicsOf, emit, gain, lookup, returnVesselCard } from "./state.ts";
import type {
  CeramicId,
  GameRuleError,
  GameState,
  PlayerId,
  PlayerView,
  PublicCore,
  ResolveContext,
  SellFlawedOptions,
} from "./types.ts";

/**
 * The player's sellable Flawed ceramics, in ceramic sequence order: their Finished Flawed
 * ceramics and, only during `firing_after_quality`, their ceramics of this firing that are
 * Flawed now and not yet sold. Ignores whose turn it is (see `saleWindowError`).
 */
export function sellableFlawed(game: PublicCore, playerId: PlayerId): CeramicId[] {
  const ids = ceramicsOf(game, playerId, "finished")
    .filter((c) => c.quality === "flawed")
    .map((c) => c.id);
  const firing = game.firing;
  if (game.phase.type === "firing_after_quality" && firing !== null) {
    for (const record of firingRecordsInOrder(firing)) {
      if (
        record.ownerId === playerId &&
        record.quality === "flawed" &&
        !record.sold &&
        lookup(game.ceramics, record.ceramicId)?.stage === "loaded"
      ) {
        ids.push(record.ceramicId);
      }
    }
  }
  return ids.sort((a, b) => ceramicSequence(a) - ceramicSequence(b));
}

function notInWindow(game: PublicCore, message: string): GameRuleError {
  const phase = game.phase;
  const details: GameRuleError["details"] = { phase: phase.type, actionType: "SELL_FLAWED" };
  if (phase.type === "work_turn") {
    details["step"] = phase.step.kind;
  }
  return ruleError("WRONG_PHASE", message, details);
}

/**
 * Null when `viewerId` may sell now (R20): the active player in the before- or after-action
 * window of a Work turn; the current Order Phase player; the head of the after-Quality queue; a
 * player pending in the Cleanup hand trim. Otherwise `WRONG_PHASE` in a Work sub-step
 * ("Finish your worker action first.") or another phase, and `NOT_YOUR_DECISION` in a sale
 * phase where the game waits for someone else. The dispatcher checks the phase and the actor
 * first, so its own errors come before these.
 */
export function saleWindowError(game: PublicCore, viewerId: PlayerId): GameRuleError | null {
  const phase = game.phase;
  let actorIds: readonly PlayerId[];
  switch (phase.type) {
    case "work_turn":
      if (phase.activePlayerId === viewerId && phase.step.kind !== "before_action" && phase.step.kind !== "after_action") {
        return notInWindow(game, "Finish your worker action first.");
      }
      actorIds = [phase.activePlayerId];
      break;
    case "orders":
      actorIds = phase.turnOrder.slice(phase.index, phase.index + 1);
      break;
    case "firing_after_quality":
      actorIds = phase.queue.actorIds.slice(phase.queue.index, phase.queue.index + 1);
      break;
    case "cleanup_hand_limit":
      actorIds = phase.pendingPlayerIds;
      break;
    default:
      return notInWindow(game, "A Flawed ceramic can be sold only during your own turn.");
  }
  if (!actorIds.includes(viewerId)) {
    return ruleError("NOT_YOUR_DECISION", "A Flawed ceramic can be sold only during your own turn.", { playerId: viewerId });
  }
  return null;
}

/** The viewer's sale choice (R20), or null outside their sale windows or with nothing to sell. */
export function sellFlawedOptions(view: PlayerView): SellFlawedOptions | null {
  const viewerId = view.viewerId;
  if (viewerId === null || saleWindowError(view.game, viewerId) !== null) {
    return null;
  }
  const ceramicIds = sellableFlawed(view.game, viewerId);
  return ceramicIds.length === 0 ? null : { ceramicIds, coins: FIRING.flawedSaleCoins };
}

/** Takes a ceramic of this firing off its Shared Kiln space; Kiln Furniture beneath it moves to
 * the ceramic left in a stacked space, or returns (it would return after the firing anyway). */
function leaveKilnSpace(draft: GameState, ceramicId: CeramicId): void {
  const loaded = lookup(draft.ceramics, ceramicId);
  invariant(loaded !== undefined && loaded.stage === "loaded", `${ceramicId} is not a loaded ceramic`);
  if (loaded.placement.kiln !== "shared") {
    return;
  }
  const space = draft.sharedKiln.spaces[loaded.placement.spaceId];
  space.ceramicIds = space.ceramicIds.filter((id) => id !== ceramicId);
  const furniture = space.kilnFurniture;
  if (furniture !== null && furniture.underCeramicId === ceramicId) {
    const remaining = space.ceramicIds[0];
    space.kilnFurniture = remaining === undefined ? null : { ...furniture, underCeramicId: remaining };
  }
}

/**
 * Sells one of `playerId`'s sellable Flawed ceramics (the validator checked the window and the
 * target): a Finished one leaves the game; one of this firing is marked `sold` in its firing
 * record and leaves its kiln space first. Its Vessel card returns to the supply (rev. 4 L284).
 * Emits `CERAMIC_SOLD`, then `RESOURCES_CHANGED { reason: "flawed_sale" }`.
 */
export function sellFlawedCeramic(draft: GameState, playerId: PlayerId, ceramicId: CeramicId, ctx: ResolveContext): void {
  const sold = lookup(draft.ceramics, ceramicId);
  invariant(sold !== undefined && sold.ownerId === playerId, `${ceramicId} is not ${playerId}'s ceramic`);
  let from: "finished" | "firing";
  if (sold.stage === "finished") {
    invariant(sold.quality === "flawed", `${ceramicId} is not Flawed`);
    from = "finished";
  } else {
    invariant(sold.stage === "loaded" && draft.phase.type === "firing_after_quality", `${ceramicId} cannot be sold now`);
    const record = draft.firing === null ? null : firingRecord(draft.firing, ceramicId);
    invariant(record !== null && record.quality === "flawed" && !record.sold, `${ceramicId} is not Flawed in this firing`);
    record.sold = true;
    leaveKilnSpace(draft, ceramicId);
    from = "firing";
  }
  delete draft.ceramics[ceramicId];
  returnVesselCard(draft, sold.vesselInstanceId);
  const coins = FIRING.flawedSaleCoins;
  emit(ctx, { type: "CERAMIC_SOLD", playerId, ceramicId, coins, from });
  gain(draft, playerId, { coins }, "flawed_sale", ctx);
}
