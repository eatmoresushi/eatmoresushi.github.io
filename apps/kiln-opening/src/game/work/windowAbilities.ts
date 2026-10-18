/**
 * The Colour Samples swap and Imperial Priority in the before/after-action window (L293, L434,
 * v1.6.2 L622, L641, L646, changes 24–25, R4, R10, R11, R16, R17; DESIGN §3.2 step 1 and 3, §11 Q1).
 *
 * - Both are usable in `before_action` and `after_action`, in either order (INT: before/after
 *   window). Neither is a worker action (v1.6.2 L641, L646): the swap never touches a worker or
 *   Senior Apprentice, and Imperial Priority loads with `loadedBy: "imperial_priority"`.
 * - Colour Samples swap (T10, v1.6.2 L622, change 25): once per round, optional (R4).
 *   `USE_COLOUR_SAMPLES_SWAP` discards the named held Order first (a Main Order face down to the
 *   Main discard, a Starting Order to the box, L646; R17), then Selects 3 (`work/select.ts`): it
 *   privately looks at the top 3 Main Orders, as many as remain, reshuffling the discard only
 *   when the deck is empty as the look starts (B1, R16), so the Order just discarded may come
 *   straight back. It is legal only when a reservation is possible: a looked card or a face-up
 *   Main Order (B1: the reservation must take an available Order). `SELECT_CHOOSE` reserves 1 of
 *   the looked cards or 1 face-up Main Order, whose position stays empty until the turn ends
 *   (v1.6.2 L646); the looked cards not reserved go face down to the bottom of the Main deck in
 *   random order (change 24, R19). The hand size is unchanged.
 * - Imperial Priority: once per game, free, glaze and load 1 Shaped vessel into your empty
 *   Imperial Kiln with a chosen public modifier (L293, R10, R11). Reworking Table may change
 *   the Shape first (DESIGN §11 Q1 default P1: allowed, using its once-per-round allowance).
 * - After each use (for the swap, after its reservation in `work/selectChoose.ts`)
 *   `work/turn.afterWindowAbilityUsed` rechecks the window and ends the turn when nothing is left
 *   after the worker action.
 * - Canal Barge (T23) is no longer a window ability: it gives 2 Coins when its owner completes
 *   an Order, in the Order Phase (v1.6.2 L630, `orders/completion.ts`).
 *
 * Layer 4 (P4). Imports layers 0–3 and `work/turn` (DESIGN §2.4).
 */

import { TECHS, isStartingOrderId } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { imperialKilnEmpty, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { discardHeldOrder, lookCount } from "../market.ts";
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
import { openSelect, selectReservable } from "./select.ts";
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

/** Cards the swap's discard puts in the Main discard before its look (R17): 1 for a Main Order,
 * 0 for a Starting Order, which goes to the box. */
function swapExtraDiscard(orderId: OrderId): number {
  return isStartingOrderId(orderId) ? 0 : TECHS.T10.params.swapDiscard;
}

/**
 * How many cards the swap's Select 3 would show after discarding `orderId` (R16, R17), from
 * public counts and the actor's own hand only: a discarded Main Order is in the discard a
 * reshuffle would use; a Starting Order goes to the box.
 */
export function swapLookCount(game: PublicGameState, orderId: OrderId): number {
  return lookCount(game, TECHS.T10.params.swapSelect, swapExtraDiscard(orderId));
}

/** The swap's legality for one held Order, on the actor's view (v1.6.2 L622, B1). */
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
  // B1: the Select must be able to reserve: a looked card, or a face-up Main Order (v1.6.2 L64).
  if (!selectReservable(view.game, TECHS.T10.params.swapSelect, swapExtraDiscard(discardOrderId))) {
    return ruleError("ORDER_SUPPLY_EMPTY", "There is no Main Order to reserve.", {});
  }
  return null;
}

export const handlers: Pick<ActionHandlerTable, "USE_COLOUR_SAMPLES_SWAP" | "USE_IMPERIAL_PRIORITY"> = {
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
      // Select 3 (v1.6.2 L622, change 25): 1 reservation, a looked card or a face-up Main Order.
      const select = openSelect(draft, actorId, "colour_samples_swap", TECHS.T10.params.swapSelect, 1, ctx);
      invariant(select.lookedCount > 0 || draft.market.display.some((orderId) => orderId !== null), "The swap's Select has nothing to reserve");
      phase.step = { kind: "colour_samples_swap", returnTo, select };
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
