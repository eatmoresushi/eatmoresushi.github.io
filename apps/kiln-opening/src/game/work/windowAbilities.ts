/**
 * The Colour Samples swap and Imperial Priority in the before/after-action window (L293, L434,
 * v1.6.2 L625, L645, L649, change 24, R4, R10, R11, R16, R17; DESIGN §3.2 step 1 and 3, §11 Q1).
 *
 * - Both are usable in `before_action` and `after_action`, in either order (INT: before/after
 *   window). Neither is a worker action (v1.6.2 L645, L649): the swap never touches a worker, the
 *   Main display or Senior Apprentice, and Imperial Priority loads with
 *   `loadedBy: "imperial_priority"`.
 * - Colour Samples swap (T10, v1.6.2 L625): once per round, optional (R4).
 *   `USE_COLOUR_SAMPLES_SWAP` discards the named held Order first (a Main Order face down to the
 *   Main discard, a Starting Order to the box, L649; R17), then privately looks at the top 2
 *   Main Orders, as many as remain, reshuffling the discard only when the deck is empty as the
 *   look starts (B1, R16), so the Order just discarded may come straight back. It is legal only
 *   when that look would show at least 1 card (B1: the reservation must take an available
 *   Order). `COLOUR_SAMPLES_SWAP_CHOOSE` reserves 1 of the looked cards; the other goes face down
 *   to the bottom of the Main deck (rulebook change 24, which superseded owner ruling R14). The
 *   hand size is unchanged.
 * - Imperial Priority: once per game, free, glaze and load 1 Shaped vessel into your empty
 *   Imperial Kiln with a chosen public modifier (L293, R10, R11). Reworking Table may change
 *   the Shape first (DESIGN §11 Q1 default P1: allowed, using its once-per-round allowance).
 * - After each use (for the swap, after its reservation) `work/turn.afterWindowAbilityUsed`
 *   rechecks the window and ends the turn when nothing is left after the worker action.
 * - Canal Barge (T23) is no longer a window ability: it gives 2 Coins when its owner completes
 *   an Order, in the Order Phase (v1.6.2 L630, `orders/completion.ts`).
 *
 * Layer 4 (P4). Imports layers 0–3 and `work/turn` (DESIGN §2.4).
 */

import { TECHS, isStartingOrderId } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { imperialKilnEmpty, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { addToHand, discardHeldOrder, lookCount, putMainOrdersOnBottom, takeTopMainOrders } from "../market.ts";
import { emit, phaseAs, player } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  GameAction,
  GameRuleError,
  LoadSpec,
  OrderId,
  PublicGameState,
  TechId,
} from "../types.ts";
import { afterWindowAbilityUsed } from "./turn.ts";

const COLOUR_SAMPLES: TechId = "T10";

type ImperialPriorityAction = Extract<GameAction, { type: "USE_IMPERIAL_PRIORITY" }>;

/** The window is open: the active player's turn, before or after the worker action. */
function windowError(view: ActorView): GameRuleError | null {
  const phase = view.game.phase;
  if (phase.type !== "work_turn") {
    return ruleError("WRONG_PHASE", "This ability is used before or after a worker action.", { phase: phase.type });
  }
  if (phase.activePlayerId !== view.viewerId) {
    return ruleError("NOT_YOUR_DECISION", "It is not your Work turn.", { playerId: view.viewerId });
  }
  const step = phase.step.kind;
  if (step !== "before_action" && step !== "after_action") {
    return ruleError("WRONG_PHASE", "Finish your worker action first.", { phase: phase.type, step });
  }
  return null;
}

/** The Imperial Priority load as a Glaze & Load `LoadSpec` into the Imperial Kiln. */
function imperialLoad(action: ImperialPriorityAction): LoadSpec {
  return {
    ceramicId: action.ceramicId,
    glaze: action.glaze,
    destination: { kiln: "imperial", imperialModifier: action.imperialModifier },
    ...(action.reworkShape === undefined ? {} : { reworkShape: action.reworkShape }),
  };
}

/**
 * How many cards the swap's look would show after discarding `orderId` (R16, R17), from public
 * counts and the actor's own hand only: a discarded Main Order is in the discard a reshuffle
 * would use; a Starting Order goes to the box.
 */
export function swapLookCount(game: PublicGameState, orderId: OrderId): number {
  return lookCount(game, TECHS.T10.params.swapLookSize, isStartingOrderId(orderId) ? 0 : TECHS.T10.params.swapDiscard);
}

/** The swap's legality for one held Order, on the actor's view (v1.6.2 L625, B1). */
export function validateColourSamplesSwap(view: ActorView, discardOrderId: OrderId): GameRuleError | null {
  const windowProblem = windowError(view);
  if (windowProblem !== null) {
    return windowProblem;
  }
  const p = player(view.game, view.viewerId);
  if (!ownsTech(p, COLOUR_SAMPLES)) {
    return ruleError("TECH_NOT_OWNED", `You do not own ${TECHS.T10.name}.`, { techId: COLOUR_SAMPLES });
  }
  if (!techReady(p, COLOUR_SAMPLES)) {
    return ruleError("TECH_ALREADY_USED", `${TECHS.T10.name} has already been used this round.`, { techId: COLOUR_SAMPLES });
  }
  if (!view.own.orderHand.includes(discardOrderId)) {
    return ruleError("ORDER_NOT_HELD", "That Order is not in your hand.", { orderId: discardOrderId });
  }
  if (swapLookCount(view.game, discardOrderId) < 1) {
    return ruleError("ORDER_SUPPLY_EMPTY", "The Main Order deck and discard pile are both empty.", {});
  }
  return null;
}

export const handlers: Pick<ActionHandlerTable, "USE_COLOUR_SAMPLES_SWAP" | "COLOUR_SAMPLES_SWAP_CHOOSE" | "USE_IMPERIAL_PRIORITY"> = {
  USE_COLOUR_SAMPLES_SWAP: {
    phases: ["work_turn"],
    validate: (view, action) => validateColourSamplesSwap(view, action.discardOrderId),
    resolve: (draft, actorId, action, ctx) => {
      const phase = phaseAs(draft, "work_turn");
      const returnTo = phase.step.kind;
      invariant(returnTo === "before_action" || returnTo === "after_action", `The swap was used in ${returnTo}`);
      markTechUsed(draft, actorId, COLOUR_SAMPLES, ctx);
      // R17: discard first, then look.
      const to = discardHeldOrder(draft, actorId, action.discardOrderId);
      emit(ctx, {
        type: "HELD_ORDER_DISCARDED",
        playerId: actorId,
        cause: "colour_samples_swap",
        to,
        secret: { visibleTo: actorId, orderId: action.discardOrderId },
      });
      const orderIds = takeTopMainOrders(draft, TECHS.T10.params.swapLookSize, ctx);
      invariant(orderIds.length > 0, "The swap's look shows no card");
      draft.hidden.pendingLook = { kind: "colour_samples_swap", playerId: actorId, orderIds: [...orderIds] };
      emit(ctx, {
        type: "PRIVATE_LOOK_OPENED",
        playerId: actorId,
        kind: "colour_samples_swap",
        discipline: null,
        count: orderIds.length,
        secret: { visibleTo: actorId, orderIds: [...orderIds], techIds: [] },
      });
      phase.step = { kind: "colour_samples_swap", returnTo, lookedCount: orderIds.length };
    },
  },
  COLOUR_SAMPLES_SWAP_CHOOSE: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const phase = view.game.phase;
      if (phase.type !== "work_turn" || phase.activePlayerId !== view.viewerId || phase.step.kind !== "colour_samples_swap") {
        return ruleError("WRONG_PHASE", "That choice is not due now.", {
          phase: phase.type,
          ...(phase.type === "work_turn" ? { step: phase.step.kind } : {}),
        });
      }
      const look = view.own.pendingLook;
      if (look === null || look.kind !== "colour_samples_swap" || !look.orderIds.includes(action.orderId)) {
        return ruleError("INVALID_CHOICE", "Choose one of the Orders you looked at.", { orderId: action.orderId });
      }
      return null;
    },
    resolve: (draft, actorId, action, ctx) => {
      const phase = phaseAs(draft, "work_turn");
      const step = phase.step;
      const look = draft.hidden.pendingLook;
      invariant(step.kind === "colour_samples_swap", `Expected the Colour Samples swap step, found ${step.kind}`);
      invariant(look !== null && look.kind === "colour_samples_swap" && look.playerId === actorId, "No swap look is pending for the actor");
      const rest = look.orderIds.filter((orderId) => orderId !== action.orderId);
      draft.hidden.pendingLook = null;
      addToHand(draft, actorId, action.orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId: actorId,
        via: "colour_samples_swap",
        source: "looked",
        slotIndex: null,
        orderId: null,
        secret: { visibleTo: actorId, orderId: action.orderId },
      });
      if (rest.length > 0) {
        // Change 24 (v1.6.2 L34, Appendix B): the card not reserved goes face down to the bottom
        // of the Main deck (it superseded owner ruling R14's discard). Private to the actor (B3).
        putMainOrdersOnBottom(draft, rest, ctx);
        emit(ctx, { type: "LOOKED_ORDERS_TO_BOTTOM", playerId: actorId, count: rest.length, secret: { visibleTo: actorId, orderIds: rest } });
      }
      phase.step = { kind: step.returnTo };
      afterWindowAbilityUsed(draft, actorId, ctx);
    },
  },
  USE_IMPERIAL_PRIORITY: {
    phases: ["work_turn"],
    validate: (view, action) => {
      const error = windowError(view);
      if (error !== null) {
        return error;
      }
      const p = player(view.game, view.viewerId);
      if (p.imperial.priority !== "held") {
        return ruleError("IMPERIAL_PRIORITY_UNAVAILABLE", "You do not hold the Imperial Priority token.", {});
      }
      if (!imperialKilnEmpty(view.game, view.viewerId)) {
        return ruleError("IMPERIAL_KILN_UNAVAILABLE", "You have no Imperial Kiln, or it already holds a ceramic this firing.", {});
      }
      return validateLoads(view, [imperialLoad(action)], 1, "imperial_priority");
    },
    resolve: (draft, actorId, action, ctx) => {
      player(draft, actorId).imperial.priority = "spent";
      emit(ctx, { type: "IMPERIAL_PRIORITY_USED", playerId: actorId, ceramicId: action.ceramicId });
      // Reworking Table, if chosen, changes the Shape first and uses its allowance (Q1).
      loadCeramic(draft, actorId, imperialLoad(action), "imperial_priority", ctx);
      afterWindowAbilityUsed(draft, actorId, ctx);
    },
  },
};
