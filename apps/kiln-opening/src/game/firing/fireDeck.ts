/**
 * Fire deck: draw, peek, bury, discard, reshuffle only when empty (L512, L639, L649, Appendix C).
 *
 * - `hidden.fireDeck` is top-first and secret; `fireDiscard` is open information (L512).
 * - The deck is reshuffled only when it is empty at the moment a card is needed (L512): the
 *   whole open discard is shuffled into a new deck and `FIRE_DECK_RESHUFFLED` is emitted.
 *   Never to "complete" anything; a draw from a non-empty deck consumes no randomness.
 * - A buried card goes to the end of the deck array (editorial note on L649).
 *
 * Layer 3: imports layers 0–2.
 */

import { invariant } from "../errors.ts";
import { shuffle } from "../rng.ts";
import { emit } from "../state.ts";
import type { FireModifier, GameState, ResolveContext } from "../types.ts";

/** Shuffles the open discard into a new deck if, and only if, the deck is empty (L512). */
function ensureCard(draft: GameState, ctx: ResolveContext): void {
  if (draft.hidden.fireDeck.length > 0) {
    return;
  }
  invariant(draft.fireDiscard.length > 0, "The Fire deck and discard are both empty");
  draft.hidden.fireDeck = shuffle(draft.fireDiscard, ctx.rng);
  draft.fireDiscard = [];
  emit(ctx, { type: "FIRE_DECK_RESHUFFLED", cardCount: draft.hidden.fireDeck.length });
}

/** Takes the top Fire card (the round's reveal, L677, or Second Firing's extra card, L640). */
export function drawFire(draft: GameState, ctx: ResolveContext): FireModifier {
  ensureCard(draft, ctx);
  const card = draft.hidden.fireDeck.shift();
  invariant(card !== undefined, "No Fire card to draw");
  return card;
}

/** The top Fire card without moving it (Test Pieces' private look, L639). */
export function peekFire(draft: GameState, ctx: ResolveContext): FireModifier {
  ensureCard(draft, ctx);
  const card = draft.hidden.fireDeck[0];
  invariant(card !== undefined, "No Fire card to peek at");
  return card;
}

/** Test Pieces' bury: the top card moves to the bottom of the deck (L639, editorial L649). */
export function buryTopFire(draft: GameState): void {
  const card = draft.hidden.fireDeck.shift();
  invariant(card !== undefined, "No Fire card to bury");
  draft.hidden.fireDeck.push(card);
}

/** Puts a resolved Fire card face up on the open discard, newest last (L512, L683). */
export function discardFire(draft: GameState, modifier: FireModifier): void {
  draft.fireDiscard.push(modifier);
}
