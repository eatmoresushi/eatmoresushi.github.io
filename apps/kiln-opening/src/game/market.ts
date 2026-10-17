/**
 * Main Order deck, display and face-down discard; Tech decks and displays
 * (L128–130, L187–214, L387–391, L511–513, B1–B3). Package P2, layer 3.
 *
 * Conventions:
 * - Every pile is top-first (index 0 is the top card, `types.ts` header).
 * - The Main display always has `GAME_CONFIG.mainMarket.displaySize` positions, oldest
 *   (left) to newest (L389). `null` is an empty position: a face-up reservation waiting for
 *   the deferred end-of-turn refill (L191, L391), or a gap left because the deck and the
 *   discard are both exhausted (B1).
 * - The Main discard is face down (B3): only its count is public. Nothing here emits an
 *   Order identity that was not already public; the callers emit the private events
 *   (`ORDER_RESERVED.secret`, `LOOKED_ORDERS_DISCARDED.secret`, `HAND_TRIMMED.secret`).
 * - Randomness: the Main discard is shuffled into a new deck only when the deck is empty
 *   and a card is needed (L511). Tech decks are never reshuffled.
 * - Helpers that take a `draft` mutate only that draft and are called after validation;
 *   a broken precondition is an `InvariantError`, never a rule error.
 */

import { GAME_CONFIG, TECHS, isStartingOrderId } from "./content.ts";
import { invariant } from "./errors.ts";
import { shuffle } from "./rng.ts";
import { emit, isSeated, lookup } from "./state.ts";
import type {
  GameEvent,
  GameState,
  OrderId,
  PlayerId,
  PublicGameState,
  ResolveContext,
  TechDiscipline,
  TechId,
} from "./types.ts";

/** `DISPLAY_REFILLED.cause`. */
export type MainDisplayRefillCause = Extract<GameEvent, { type: "DISPLAY_REFILLED" }>["cause"];

// ── Main Order deck ──────────────────────────────────────────────────────────────────

/**
 * L511: when the deck is empty and a card is needed, the face-down discard is shuffled into
 * a new deck (`MAIN_DECK_RESHUFFLED`). No-op when the deck still has cards or the discard is
 * empty.
 */
function reshuffleIfDeckEmpty(draft: GameState, ctx: ResolveContext): void {
  const hidden = draft.hidden;
  if (hidden.mainDeck.length > 0 || hidden.mainDiscard.length === 0) {
    return;
  }
  hidden.mainDeck = shuffle(hidden.mainDiscard, ctx.rng);
  hidden.mainDiscard = [];
  emit(ctx, { type: "MAIN_DECK_RESHUFFLED", cardCount: hidden.mainDeck.length });
}

/**
 * Draws the top Main Order, shuffling the discard into a new deck first only when the deck
 * is empty (L511). Returns null when the deck and the discard are both empty (B1). The card
 * leaves the deck; the caller decides where it goes (`addToHand`, the display, …).
 */
export function drawMainOrder(draft: GameState, ctx: ResolveContext): OrderId | null {
  reshuffleIfDeckEmpty(draft, ctx);
  return draft.hidden.mainDeck.shift() ?? null;
}

/**
 * Takes up to `max` cards off the top of the Main deck for a private look (the Commission
 * Market top 2 or 3, v1.6.2 L195–196; Colour Samples). B1: the discard is reshuffled only if the deck is empty when the
 * look starts, never to complete the look, so a look may see fewer than `max` cards (or
 * none when both piles are empty). The cards leave the deck; the caller holds them in
 * `hidden.pendingLook`.
 */
export function takeTopMainOrders(draft: GameState, max: number, ctx: ResolveContext): OrderId[] {
  invariant(Number.isSafeInteger(max) && max >= 0, `A look takes a non-negative whole number of cards, not ${max}`);
  if (max === 0) {
    return [];
  }
  reshuffleIfDeckEmpty(draft, ctx);
  return draft.hidden.mainDeck.splice(0, max);
}

/**
 * Puts Main Orders face down on the Main discard (v1.6.2 L191, L195–196; L304, L626, B3), in the given order,
 * each on top of the last (so the last ID ends on top). Starting Orders never go here: they
 * return to the box (L304).
 */
export function discardMainOrders(draft: GameState, ids: readonly OrderId[]): void {
  const discard = draft.hidden.mainDiscard;
  for (const orderId of ids) {
    invariant(!isStartingOrderId(orderId), `Starting Order ${orderId} returns to the box, not the Main discard`);
    invariant(!discard.includes(orderId), `${orderId} is already in the Main discard`);
    discard.unshift(orderId);
  }
}

// ── Main display ─────────────────────────────────────────────────────────────────────

/**
 * Takes the face-up Order at `slotIndex` for a reservation (L191): the position stays empty
 * (`null`) until the reserving player's turn ends, and `refillPendingFor` records who owes
 * the deferred refill (L391: several takes in one turn → one refill). Returns the Order; the
 * caller puts it in the hand (`addToHand`) and emits `ORDER_RESERVED`.
 */
export function takeFaceUpOrder(draft: GameState, playerId: PlayerId, slotIndex: number): OrderId {
  const market = draft.market;
  invariant(isSeated(draft, playerId), `Unknown player ${playerId}`);
  invariant(Number.isSafeInteger(slotIndex) && slotIndex >= 0 && slotIndex < market.display.length, `No display position ${slotIndex}`);
  const orderId = market.display[slotIndex];
  invariant(orderId !== null && orderId !== undefined, `Display position ${slotIndex} is empty`);
  invariant(
    market.refillPendingFor === null || market.refillPendingFor === playerId,
    `A refill is still owed by ${market.refillPendingFor}`,
  );
  market.display[slotIndex] = null;
  market.refillPendingFor = playerId;
  return orderId;
}

/**
 * Compacts the display left (oldest stays leftmost), then reveals Main Orders into the empty
 * positions from left to right (L130, L191, L391). Draws reshuffle the discard only when the
 * deck is empty (L511); when both piles are exhausted the remaining positions stay `null`
 * (B1). Every empty position is filled as cards allow, aiming at the full display (DESIGN
 * §11 Q2, audit P2). Clears `refillPendingFor` and emits `DISPLAY_REFILLED`.
 */
export function refillMainDisplay(draft: GameState, cause: MainDisplayRefillCause, ctx: ResolveContext): void {
  const size = GAME_CONFIG.mainMarket.displaySize;
  const display = draft.market.display.filter((id): id is OrderId => id !== null);
  invariant(display.length <= size, `The Main display holds ${display.length} Orders, more than ${size}`);
  const revealed: OrderId[] = [];
  while (display.length < size) {
    const orderId = drawMainOrder(draft, ctx);
    if (orderId === null) {
      break;
    }
    display.push(orderId);
    revealed.push(orderId);
  }
  const padded: Array<OrderId | null> = [...display];
  while (padded.length < size) {
    padded.push(null);
  }
  draft.market.display = padded;
  draft.market.refillPendingFor = null;
  emit(ctx, { type: "DISPLAY_REFILLED", cause, revealedOrderIds: revealed, display: [...padded] });
}

/**
 * Start of Rounds 2–5 (L128–130, B1): discard the 2 leftmost face-up Orders face down (up to
 * 2 when fewer show), slide the rest left (`MAIN_DISPLAY_ROTATED`), then refill
 * (`DISPLAY_REFILLED`, cause `round_start`). The rotated-out Orders were public, so the
 * event names them.
 */
export function rotateMainDisplay(draft: GameState, ctx: ResolveContext): void {
  const count = GAME_CONFIG.mainMarket.roundStartDiscard;
  const showing = draft.market.display.filter((id): id is OrderId => id !== null);
  const discarded = showing.slice(0, count);
  const remaining: Array<OrderId | null> = showing.slice(count);
  while (remaining.length < GAME_CONFIG.mainMarket.displaySize) {
    remaining.push(null);
  }
  discardMainOrders(draft, discarded);
  draft.market.display = remaining;
  emit(ctx, { type: "MAIN_DISPLAY_ROTATED", round: draft.round, discardedOrderIds: [...discarded], display: [...remaining] });
  refillMainDisplay(draft, "round_start", ctx);
}

/**
 * What a reservation could take right now, from public information only (B1):
 * - `faceUpSlots`: positions still showing an Order (a position taken this turn stays empty
 *   until the turn ends, v1.6.2 L191, L198);
 * - `supply`: the deck or the discard holds a card, so a look or a draw would find one
 *   (after the reshuffle an empty deck forces, L511).
 */
export function reservable(game: PublicGameState): { faceUpSlots: number[]; supply: boolean } {
  const faceUpSlots: number[] = [];
  game.market.display.forEach((orderId, index) => {
    if (orderId !== null) {
      faceUpSlots.push(index);
    }
  });
  return { faceUpSlots, supply: game.counts.mainDeck + game.counts.mainDiscard > 0 };
}

/**
 * How many cards a private look of up to `size` cards would show now, from public counts
 * only. It mirrors `takeTopMainOrders` (B1): the discard is reshuffled only when the deck is
 * empty as the look starts, so a deck of 1 shows 1 card however large the discard. 0 when
 * both piles are empty. `extraDiscard` counts cards about to be discarded before the look.
 */
export function lookCount(game: PublicGameState, size: number, extraDiscard = 0): number {
  const deck = game.counts.mainDeck;
  return Math.max(0, deck > 0 ? Math.min(size, deck) : Math.min(size, game.counts.mainDiscard + extraDiscard));
}

// ── Order hands (secret, L201, L507) ─────────────────────────────────────────────────

function handOf(draft: GameState, playerId: PlayerId): OrderId[] {
  invariant(isSeated(draft, playerId), `Unknown player ${playerId}`);
  const hands = draft.hidden.orderHands;
  const hand = lookup(hands, playerId);
  if (hand !== undefined) {
    return hand;
  }
  const created: OrderId[] = [];
  hands[playerId] = created;
  return created;
}

/** Puts an Order into the player's secret hand (newest last). */
export function addToHand(draft: GameState, playerId: PlayerId, orderId: OrderId): void {
  const hand = handOf(draft, playerId);
  invariant(!hand.includes(orderId), `${playerId} already holds ${orderId}`);
  hand.push(orderId);
}

/** Removes an Order from the player's secret hand; the caller decides where it goes. */
export function removeFromHand(draft: GameState, playerId: PlayerId, orderId: OrderId): void {
  const hand = handOf(draft, playerId);
  const index = hand.indexOf(orderId);
  invariant(index >= 0, `${playerId} does not hold ${orderId}`);
  hand.splice(index, 1);
}

// ── Tech decks and displays (L103, L207–210, L513, B2) ───────────────────────────────

function assertDiscipline(techId: TechId, discipline: TechDiscipline): void {
  invariant(TECHS[techId].discipline === discipline, `${techId} is not a ${discipline} Tech`);
}

/**
 * Guild Hall Shifu inspection (v1.6.2 L207, B2): takes the top `count` Techs of a discipline's
 * deck, "or as many as remain" (possibly none). The caller holds them in
 * `hidden.pendingLook`.
 */
export function drawTechsForInspection(draft: GameState, discipline: TechDiscipline, count: number): TechId[] {
  invariant(Number.isSafeInteger(count) && count >= 0, `An inspection takes a non-negative whole number of Techs, not ${count}`);
  return draft.hidden.techDecks[discipline].splice(0, count);
}

/**
 * Puts untaken inspected Techs on the bottom of their deck in the player's chosen order:
 * `ids[0]` sits above `ids[1]`, and the last ID is the new bottom card (B2). Call this
 * before `refillTechDisplay` (B2: return first, then refill).
 */
export function returnTechsToBottom(draft: GameState, discipline: TechDiscipline, ids: readonly TechId[]): void {
  const deck = draft.hidden.techDecks[discipline];
  invariant(new Set(ids).size === ids.length, "A Tech is returned to the bottom at most once");
  for (const techId of ids) {
    assertDiscipline(techId, discipline);
    invariant(!deck.includes(techId), `${techId} is already in the ${discipline} deck`);
    invariant(!draft.techDisplay[discipline].includes(techId), `${techId} is face up`);
    deck.push(techId);
  }
}

/**
 * Removes a face-up Tech from its discipline's display (v1.6.2 L206–207). The display keeps
 * the order of the Techs that remain. Its position stays empty until the taker's turn ends,
 * when `work/turn.endTurn` calls `refillTechDisplay` (v1.6.2 L209).
 */
export function takeFaceUpTech(draft: GameState, techId: TechId): void {
  const discipline = TECHS[techId].discipline;
  const display = draft.techDisplay[discipline];
  const index = display.indexOf(techId);
  invariant(index >= 0, `${techId} is not face up`);
  display.splice(index, 1);
}

/**
 * Refills a discipline's display to `faceUpPerDiscipline` (2) from the top of its deck, at
 * setup and when a taker's turn ends (v1.6.2 L209); when the deck runs short the display stays
 * partial (L513). Emits `TECH_DISPLAY_REFILLED` only when a Tech was revealed, so the
 * idempotent re-runs at every turn end and Start of Round are silent.
 */
export function refillTechDisplay(draft: GameState, discipline: TechDiscipline, ctx: ResolveContext): void {
  const display = draft.techDisplay[discipline];
  const deck = draft.hidden.techDecks[discipline];
  const revealed: TechId[] = [];
  while (display.length < GAME_CONFIG.techs.faceUpPerDiscipline) {
    const techId = deck.shift();
    if (techId === undefined) {
      break;
    }
    assertDiscipline(techId, discipline);
    display.push(techId);
    revealed.push(techId);
  }
  if (revealed.length > 0) {
    emit(ctx, { type: "TECH_DISPLAY_REFILLED", discipline, revealedTechIds: revealed, display: [...display] });
  }
}
