/**
 * The Colour Samples swap (a Work-turn before/after ability) and the Imperial Priority load (a
 * free action) (rev. 5 L174, L314, L632, v1.6.2 L656, changes 24–25, 36, R4, R10, R11, R16, R17;
 * DESIGN §3.2 step 1 and 3, §11 Q1).
 *
 * - The swap is usable in `before_action` and `after_action` of the owner's Work turn only, in
 *   either order with the free actions (INT: before/after window). It is not a free action
 *   (R28): it is not in the Order Phase. Imperial Priority is a free action, legal in every
 *   free-action window, the Order Phase turn included (R28); its handler is in `freeActions.ts`,
 *   which uses `imperialPriorityError` and `useImperialPriority` from here. Neither is a worker
 *   action (v1.6.2 L656, L656): the swap never touches a worker or Senior Apprentice, and
 *   Imperial Priority loads with `loadedBy: "imperial_priority"`.
 * - Colour Samples swap (T10, v1.6.2 L632, change 25): once per round, optional (R4).
 *   `USE_COLOUR_SAMPLES_SWAP` discards the named held Order first (a Main Order face down to the
 *   Main discard, a Starting Order to the box, L656; R17), then Selects 3 (`work/select.ts`): it
 *   privately looks at the top 3 Main Orders, as many as remain, reshuffling the discard only
 *   when the deck is empty as the look starts (B1, R16), so the Order just discarded may come
 *   straight back. It is legal only when a reservation is possible: a looked card or a face-up
 *   Main Order (B1: the reservation must take an available Order). `SELECT_CHOOSE` reserves 1 of
 *   the looked cards or 1 face-up Main Order, whose position stays empty until the turn ends
 *   (v1.6.2 L656); the looked cards not reserved are discarded face down to the Main Order
 *   discard (owner ruling R25). The hand size is unchanged.
 * - Imperial Priority: once per game, free (no Wood, L309), glaze and load 1 Shaped
 *   vessel into your empty Imperial Kiln with a chosen public modifier (L314, R10, R11).
 *   Reworking Table may change the Shape first (DESIGN §11 Q1 default P1: allowed, using its
 *   once-per-round allowance), and Kiln Master's marker may go on the ceramic as it is loaded
 *   (T24, L647, R22).
 * - After the swap's reservation (`work/selectChoose.ts`) `work/turn.afterWindowAbilityUsed`
 *   rechecks the window and ends the turn when nothing is left after the worker action.
 * - Canal Barge (T23) is no window ability: it gives 2 Coins when its owner completes an Order,
 *   in any free-action window (rev. 5 L176, L637, `orders/completion.ts`).
 *
 * Layer 4 (P4). Imports layers 0–3 and `work/turn` (DESIGN §2.4).
 */

import { TECHS, isStartingOrderId } from "../content.ts";
import { invariant, ruleError } from "../errors.ts";
import { workerActionInProgress } from "../freeActionWindow.ts";
import { imperialKilnEmpty, loadCeramic, validateLoads } from "../kilnLoading.ts";
import { discardHeldOrder, lookCount } from "../market.ts";
import { emit, phaseAs, player } from "../state.ts";
import { markTechUsed, ownsTech, techReady } from "../techs.ts";
import type {
  ActionHandlerTable,
  ActorView,
  FreeActionWindow,
  GameAction,
  GameRuleError,
  GameState,
  LoadSpec,
  OrderId,
  PlayerId,
  PublicGameState,
  ResolveContext,
  TechId,
} from "../types.ts";
import { openSelect, selectReservable } from "./select.ts";

const COLOUR_SAMPLES: TechId = "T10";

type ImperialPriorityAction = Extract<GameAction, { type: "USE_IMPERIAL_PRIORITY" }>;

/** The swap's window is open: the active player's Work turn, before or after the worker action
 * (rev. 5 L632); `WORKER_ACTION_IN_PROGRESS` during it (L170). */
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
    return workerActionInProgress(view.game, "USE_COLOUR_SAMPLES_SWAP");
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
    ...(action.kilnMaster === undefined ? {} : { kilnMaster: action.kilnMaster }),
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

/** The swap's legality for one held Order, on the actor's view (v1.6.2 L632, B1). */
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
  // B1: the Select must be able to reserve: a looked card, or a face-up Main Order (v1.6.2 L80).
  if (!selectReservable(view.game, TECHS.T10.params.swapSelect, swapExtraDiscard(discardOrderId))) {
    return ruleError("ORDER_SUPPLY_EMPTY", "There is no Main Order to reserve.", {});
  }
  return null;
}

/**
 * Imperial Priority's own checks, the free-action window aside (`freeActions.ts` checks it first):
 * the token is held (`IMPERIAL_PRIORITY_UNAVAILABLE`), the Imperial Kiln has been gained and is
 * empty (`IMPERIAL_KILN_UNAVAILABLE`; a ceramic loaded in an earlier Order Phase may still wait
 * there, R28), then the load itself as a Glaze & Load load into the Imperial Kiln (R10, R11, R22).
 */
export function imperialPriorityError(view: ActorView, action: ImperialPriorityAction): GameRuleError | null {
  const p = player(view.game, view.viewerId);
  if (p.imperial.priority !== "held") {
    return ruleError("IMPERIAL_PRIORITY_UNAVAILABLE", "You do not hold the Imperial Priority token.", {});
  }
  if (!imperialKilnEmpty(view.game, view.viewerId)) {
    return ruleError("IMPERIAL_KILN_UNAVAILABLE", "You have no Imperial Kiln, or it already holds a ceramic this firing.", {});
  }
  return validateLoads(view, [imperialLoad(action)], 1, "imperial_priority");
}

/**
 * Spends the token in `window` and loads (rev. 5 L174, L314): `IMPERIAL_PRIORITY_USED`, then the
 * load. Reworking Table, if chosen, changes the Shape first and uses its allowance (Q1); Kiln
 * Master's marker, if chosen, goes on as it is loaded (R22). No Wood. The caller continues the
 * window (`freeActions.ts`).
 */
export function useImperialPriority(
  draft: GameState,
  actorId: PlayerId,
  action: ImperialPriorityAction,
  window: FreeActionWindow,
  ctx: ResolveContext,
): void {
  player(draft, actorId).imperial.priority = "spent";
  emit(ctx, { type: "IMPERIAL_PRIORITY_USED", playerId: actorId, ceramicId: action.ceramicId, window });
  loadCeramic(draft, actorId, imperialLoad(action), "imperial_priority", ctx);
}

export const handlers: Pick<ActionHandlerTable, "USE_COLOUR_SAMPLES_SWAP"> = {
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
      // Select 3 (v1.6.2 L632, change 25): 1 reservation, a looked card or a face-up Main Order.
      const select = openSelect(draft, actorId, "colour_samples_swap", TECHS.T10.params.swapSelect, 1, ctx);
      invariant(select.lookedCount > 0 || draft.market.display.some((orderId) => orderId !== null), "The swap's Select has nothing to reserve");
      phase.step = { kind: "colour_samples_swap", returnTo, select };
    },
  },
};
