/**
 * The keyword **Select N** (L80, change 25; component text, keyword lines 3 and 5): look
 * at the top N cards of the Main Order deck, then reserve 1 of them or 1 face-up Main Order from
 * the display; discard the rest of the N (owner ruling R25). One model for every Select:
 *
 * | Select | N | Reservations | Opened by |
 * | --- | --- | --- | --- |
 * | Commission Market, Apprentice effect (v1.6.2 L225) | 2 | 1 | `PLACE_COMMISSION_MARKET` |
 * | Commission Market, Shifu effect incl. Senior Apprentice (v1.6.2 L226, R12) | 3 | up to 2, any mix | `PLACE_COMMISSION_MARKET` |
 * | Colour Samples when acquired (v1.6.2 L632, R4) | 3 | 1 | the Guild Hall take of T10 |
 * | Colour Samples swap (v1.6.2 L632, R17) | 3 | 1 | `USE_COLOUR_SAMPLES_SWAP` |
 *
 * Every Select may reserve a face-up Main Order instead of a looked card (`SelectSpec.fromDisplay`
 * is true for all four). A face-up position taken stays empty until the end of the turn, then the
 * display refills as usual (`work/turn.endTurn`, v1.6.2 L221, L405). The looked cards not
 * reserved are discarded face down to the Main Order discard (owner ruling R25, 2026-10-23,
 * which reverses change 24's deck bottom and makes R19 obsolete; L221), so the deck runs
 * out in long games and the discard is reshuffled when a card is needed (L525). A look
 * shows as many cards as remain and never reshuffles to complete itself (B1, R16); a Select whose
 * look shows no card can still reserve from the display. Which cards were looked at, reserved
 * from the look or discarded is private to the looker (B3); the public sees the counts and the
 * face-up picks. Resolving a Select uses no randomness.
 *
 * This module holds the shared model (open, validate, resolve). The `SELECT_CHOOSE` handler that
 * continues each kind of step is `work/selectChoose.ts`.
 *
 * Layer 4 helper (P4): imports layers 0–3 only, so the Guild Hall, the window abilities and the
 * Commission Market can all use it.
 */

import { invariant, ruleError } from "../errors.ts";
import { addToHand, discardMainOrders, lookCount, reservable, takeFaceUpOrder, takeTopMainOrders } from "../market.ts";
import { emit } from "../state.ts";
import type {
  ActorView,
  GameRuleError,
  GameState,
  OrderId,
  PendingLook,
  PlayerId,
  PublicGameState,
  ResolveContext,
  SelectPick,
  SelectSpec,
  TechDiscipline,
  TechId,
} from "../types.ts";

/** The look kinds that are a Select. */
export type SelectLookKind = "commission_market" | "colour_samples" | "colour_samples_swap";

type SelectLook = Extract<PendingLook, { kind: SelectLookKind }>;

/** A Guild Hall Shifu's untaken inspected Techs, waiting behind Colour Samples' Select. */
export type WaitingInspection = { discipline: TechDiscipline; techIds: TechId[] } | null;

/** A Select's spec: N, the reservations allowed and the cards its look showed (B1). The display
 * option is part of every Select (v1.6.2 L80). */
export function selectSpec(n: number, maxReservations: number, lookedCount: number): SelectSpec {
  invariant(n === 2 || n === 3, `A Select looks at 2 or 3 cards, not ${n}`);
  invariant(maxReservations === 1 || maxReservations === 2, `A Select reserves 1 or 2 Orders, not ${maxReservations}`);
  invariant(Number.isSafeInteger(lookedCount) && lookedCount >= 0 && lookedCount <= n, `A Select of ${n} cannot show ${lookedCount} cards`);
  return { n, maxReservations, fromDisplay: true, lookedCount };
}

/**
 * Whether a Select of `n` could make its reservation now, from public facts only (B1: every
 * reservation takes an available Order): a face-up Main Order shows, or its look would show at
 * least 1 card. `extraDiscard` counts cards discarded just before the look (the Main Order a
 * Colour Samples swap discards first, R17), which a reshuffle at the start of the look would use.
 */
export function selectReservable(game: PublicGameState, n: number, extraDiscard = 0): boolean {
  return reservable(game).faceUpSlots.length > 0 || lookCount(game, n, extraDiscard) > 0;
}

/**
 * Opens a Select for `playerId`: takes the top `n` Main Orders (as many as remain, reshuffling
 * the discard only when the deck is empty as the look starts, B1, R16) into
 * `hidden.pendingLook` and emits `PRIVATE_LOOK_OPENED`, even when the look shows no card. Returns
 * the spec the step records. `inspection` is the Guild Hall inspection that waits behind Colour
 * Samples' when-acquired Select (null otherwise; ignored for the other kinds).
 */
export function openSelect(
  draft: GameState,
  playerId: PlayerId,
  kind: SelectLookKind,
  n: number,
  maxReservations: number,
  ctx: ResolveContext,
  inspection: WaitingInspection = null,
): SelectSpec {
  invariant(draft.hidden.pendingLook === null, "Another private look is still pending");
  const orderIds = takeTopMainOrders(draft, n, ctx);
  draft.hidden.pendingLook =
    kind === "colour_samples"
      ? { kind, playerId, orderIds: [...orderIds], inspection: inspection === null ? null : { discipline: inspection.discipline, techIds: [...inspection.techIds] } }
      : { kind, playerId, orderIds: [...orderIds] };
  emit(ctx, {
    type: "PRIVATE_LOOK_OPENED",
    playerId,
    kind,
    discipline: null,
    count: orderIds.length,
    secret: { visibleTo: playerId, orderIds: [...orderIds], techIds: [] },
  });
  return selectSpec(n, maxReservations, orderIds.length);
}

/**
 * The reservations of a `SELECT_CHOOSE`, on the actor's view, in this order: the count (at least
 * 1, at most `spec.maxReservations`), duplicates, then each pick: a face-up pick needs the display
 * option and the Order still showing at that position; a looked pick names a card of the actor's
 * own Select look of `kind`.
 */
export function selectPicksError(view: ActorView, kind: SelectLookKind, spec: SelectSpec, picks: readonly SelectPick[]): GameRuleError | null {
  if (picks.length === 0) {
    return ruleError("RESERVATION_REQUIRED", "Reserve at least 1 Order.", {});
  }
  if (picks.length > spec.maxReservations) {
    return ruleError("RESERVATION_LIMIT", `This Select reserves at most ${spec.maxReservations}; you chose ${picks.length} Orders.`, {
      limit: spec.maxReservations,
      requested: picks.length,
    });
  }
  const slots = new Set<number>();
  const looked = new Set<OrderId>();
  for (const pick of picks) {
    const duplicate = pick.kind === "face_up" ? slots.has(pick.slotIndex) : looked.has(pick.orderId);
    if (duplicate) {
      return ruleError("INVALID_CHOICE", "Each Order can be reserved only once.", {
        choice: pick.kind,
        orderId: pick.orderId,
        ...(pick.kind === "face_up" ? { slotIndex: pick.slotIndex } : {}),
      });
    }
    if (pick.kind === "face_up") {
      slots.add(pick.slotIndex);
    } else {
      looked.add(pick.orderId);
    }
  }
  const display = view.game.market.display;
  const look = view.own.pendingLook;
  for (const pick of picks) {
    if (pick.kind === "face_up") {
      if (!spec.fromDisplay) {
        return ruleError("INVALID_CHOICE", "This choice reserves only from the cards you looked at.", { choice: pick.kind, orderId: pick.orderId });
      }
      const shown = display[pick.slotIndex] ?? null;
      if (shown === null || shown !== pick.orderId) {
        return ruleError("ORDER_NOT_AVAILABLE", "That Order is no longer on the display.", {
          orderId: pick.orderId,
          slotIndex: pick.slotIndex,
        });
      }
    } else if (look === null || look.kind !== kind || !look.orderIds.includes(pick.orderId)) {
      return ruleError("INVALID_CHOICE", "Choose one of the Orders you looked at.", { choice: pick.kind, orderId: pick.orderId });
    }
  }
  return null;
}

/**
 * Resolves validated picks in array order: a face-up pick takes the Order off the display (its
 * position stays empty until the turn ends, `refillPendingFor`) with a public `ORDER_RESERVED`; a
 * looked pick goes to the hand with a secret one (B3). Then the looked cards not reserved are
 * discarded face down to the Main Order discard (owner ruling R25), in look order, the last on
 * top, with `LOOKED_ORDERS_DISCARDED` naming them privately in look order. Clears the look and
 * returns it (Colour Samples' carries the waiting Guild Hall inspection). No resource is gained
 * and no random draw is used.
 */
export function resolveSelectPicks(
  draft: GameState,
  playerId: PlayerId,
  kind: SelectLookKind,
  picks: readonly SelectPick[],
  ctx: ResolveContext,
): SelectLook {
  const look = draft.hidden.pendingLook;
  invariant(look !== null && look.kind === kind && look.playerId === playerId, `No ${kind} Select is pending for ${playerId}`);
  const reservedLooked = new Set<OrderId>();
  for (const pick of picks) {
    if (pick.kind === "face_up") {
      const orderId = takeFaceUpOrder(draft, playerId, pick.slotIndex);
      invariant(orderId === pick.orderId, `Display position ${pick.slotIndex} held ${orderId}, not ${pick.orderId}`);
      addToHand(draft, playerId, orderId);
      emit(ctx, { type: "ORDER_RESERVED", playerId, via: kind, source: "face_up", slotIndex: pick.slotIndex, orderId });
    } else {
      invariant(look.orderIds.includes(pick.orderId), `${pick.orderId} is not in ${playerId}'s ${kind} look`);
      reservedLooked.add(pick.orderId);
      addToHand(draft, playerId, pick.orderId);
      emit(ctx, {
        type: "ORDER_RESERVED",
        playerId,
        via: kind,
        source: "looked",
        slotIndex: null,
        orderId: null,
        secret: { visibleTo: playerId, orderId: pick.orderId },
      });
    }
  }
  // Discard the rest of the N face down (L80, L221; owner ruling R25). The secret names
  // them in look order.
  const rest = look.orderIds.filter((orderId) => !reservedLooked.has(orderId));
  draft.hidden.pendingLook = null;
  if (rest.length > 0) {
    discardMainOrders(draft, rest);
    emit(ctx, { type: "LOOKED_ORDERS_DISCARDED", playerId, count: rest.length, secret: { visibleTo: playerId, orderIds: rest } });
  }
  return look;
}
