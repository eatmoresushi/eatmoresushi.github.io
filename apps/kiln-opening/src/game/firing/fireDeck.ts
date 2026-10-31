/**
 * Fire deck: draw, peek, bury, discard, and the reshuffle when the deck runs out (L526, L664,
 * v1.6.2 L645–646, L655, Appendix C, R15).
 *
 * - `hidden.fireDeck` is top-first and secret; `fireDiscard` is open information (L526).
 * - Test Pieces buries a card at the bottom (L645). The deck's last `hidden.fireBuried` cards
 *   are such buried cards; every bury is public, so the count is public (`counts.fireBuried`).
 * - **When the deck runs out** (owner ruling R15): a card is needed (the Test Pieces peek, the
 *   round's reveal, each Second Firing reveal) and every card left in the deck is buried, an
 *   empty deck included. The open discard is then shuffled and placed on top, above the buried
 *   cards, so they are drawn last (L655), and `FIRE_DECK_RESHUFFLED` is emitted. Buried cards
 *   stay at the bottom through any number of reshuffles. Nothing is reshuffled to "complete"
 *   anything, and a draw from a deck with an unburied card consumes no randomness.
 * - With Second Firing taking 2 cards (v1.6.2 L646), a firing can use 3 cards and five firings
 *   up to 15 of the 12, so the reshuffle is reachable (the V1.6.1 editorial note that it never
 *   happens, 1.6.1:L649, is retired).
 *
 * Layer 3: imports layers 0–2.
 */

import { invariant } from "../errors.ts";
import { shuffle } from "../rng.ts";
import { emit } from "../state.ts";
import type { FireModifier, GameState, ResolveContext } from "../types.ts";

/** Every card left in the deck is buried (an empty deck included): the deck has run out (R15). */
export function fireDeckRunOut(fireDeckCount: number, fireBuried: number): boolean {
  return fireDeckCount <= fireBuried;
}

/**
 * Before a card is needed: when the deck has run out (R15) and the open discard holds a card,
 * shuffle the discard and put it on top, above the buried cards (L526, v1.6.2 L655).
 */
function prepareTop(draft: GameState, ctx: ResolveContext): void {
  const hidden = draft.hidden;
  invariant(
    Number.isSafeInteger(hidden.fireBuried) && hidden.fireBuried >= 0 && hidden.fireBuried <= hidden.fireDeck.length,
    `fireBuried ${hidden.fireBuried} does not fit a deck of ${hidden.fireDeck.length}`,
  );
  if (!fireDeckRunOut(hidden.fireDeck.length, hidden.fireBuried) || draft.fireDiscard.length === 0) {
    return;
  }
  const shuffled = shuffle(draft.fireDiscard, ctx.rng);
  hidden.fireDeck = [...shuffled, ...hidden.fireDeck];
  draft.fireDiscard = [];
  emit(ctx, { type: "FIRE_DECK_RESHUFFLED", cardCount: shuffled.length, buriedBelow: hidden.fireBuried });
}

/**
 * Takes the top Fire card (the round's reveal, L683, or a Second Firing card, v1.6.2 L646).
 * A buried card is drawn only when nothing else is left in the deck or the discard; it is then
 * no longer buried. The deck and discard both empty is an engine bug: at most 3 of the 12
 * cards are ever out of them at once.
 */
export function drawFire(draft: GameState, ctx: ResolveContext): FireModifier {
  prepareTop(draft, ctx);
  const hidden = draft.hidden;
  const card = hidden.fireDeck.shift();
  invariant(card !== undefined, "The Fire deck and discard are both empty");
  if (hidden.fireBuried > hidden.fireDeck.length) {
    // The card drawn was buried (only buried cards were left and the discard was empty).
    hidden.fireBuried = hidden.fireDeck.length;
  }
  return card;
}

/** The top Fire card without moving it (Test Pieces' private look, L645). It runs the same
 * reshuffle check as a draw (R15), so the peek sees the card the reveal will draw. */
export function peekFire(draft: GameState, ctx: ResolveContext): FireModifier {
  prepareTop(draft, ctx);
  const card = draft.hidden.fireDeck[0];
  invariant(card !== undefined, "The Fire deck and discard are both empty");
  return card;
}

/**
 * Test Pieces' bury (L645, v1.6.2 L655): the top card moves to the very bottom of the deck,
 * below any card buried earlier, and counts as buried. When every card in the deck is already
 * buried (possible only with an empty discard), it simply moves under the others.
 */
export function buryTopFire(draft: GameState): void {
  const hidden = draft.hidden;
  const wasUnburied = hidden.fireDeck.length > hidden.fireBuried;
  const card = hidden.fireDeck.shift();
  invariant(card !== undefined, "No Fire card to bury");
  hidden.fireDeck.push(card);
  if (wasUnburied) {
    hidden.fireBuried += 1;
  }
}

/** Puts a resolved Fire card face up on the open discard, newest last (L526, L683). */
export function discardFire(draft: GameState, modifier: FireModifier): void {
  draft.fireDiscard.push(modifier);
}
