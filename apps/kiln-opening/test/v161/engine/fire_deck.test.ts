/**
 * Fire deck (Appendix C L656–666, L512, L639, editorial L649): the 1/3/4/3/1 distribution,
 * the open discard, reshuffling only when the deck is empty, Test Pieces' bury to the bottom.
 */

import { describe, expect, it } from "vitest";
import { FIRING } from "../../../src/game/content.ts";
import { buryTopFire, discardFire, drawFire, peekFire } from "../../../src/game/firing/fireDeck.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import { SeededRandom, shuffle } from "../../../src/game/rng.ts";
import { projectPublicState } from "../../../src/game/view.ts";
import type { FireModifier } from "../../../src/game/types.ts";
import { buildState, cardZones, testContext } from "./support/fixtures.ts";

function counts(cards: readonly FireModifier[]): Record<string, number> {
  const result: Record<string, number> = { "-2": 0, "-1": 0, "0": 0, "1": 0, "2": 0 };
  for (const card of cards) {
    result[String(card)] = (result[String(card)] ?? 0) + 1;
  }
  return result;
}

describe("Fire deck distribution (Appendix C)", () => {
  it("has 12 cards: −2×1, −1×3, 0×4, +1×3, +2×1", () => {
    expect(FIRING.fireDeck).toHaveLength(12);
    expect(counts(FIRING.fireDeck)).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  });
});

describe("drawFire", () => {
  it("takes the top card, consumes no randomness and leaves the discard alone", () => {
    const state = buildState({ fireDeck: [2, -1, 0] });
    const discardBefore = [...state.fireDiscard];
    const ctx = testContext(5);
    const rngBefore = ctx.rng.getState();
    expect(drawFire(state, ctx)).toBe(2);
    expect(state.hidden.fireDeck).toEqual([-1, 0]);
    expect(state.fireDiscard).toEqual(discardBefore);
    expect(discardBefore).toHaveLength(9);
    expect(ctx.rng.getState()).toBe(rngBefore);
    expect(ctx.events).toEqual([]);
  });

  it("does not reshuffle while a single card remains, even with a large discard (L512)", () => {
    const state = buildState({ fireDeck: [0], fireDiscard: [-2, -1, -1, -1, 0, 0, 0, 1, 1, 1, 2] });
    const ctx = testContext(5);
    expect(drawFire(state, ctx)).toBe(0);
    expect(state.hidden.fireDeck).toEqual([]);
    expect(state.fireDiscard).toHaveLength(11);
    expect(ctx.events).toEqual([]);
  });

  it("reshuffles the open discard into a new deck only when the deck is empty, then draws (L512)", () => {
    const discard: FireModifier[] = [-2, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2];
    const state = buildState({ fireDeck: [], fireDiscard: discard });
    const ctx = testContext(9);
    const expectedDeck = shuffle(discard, new SeededRandom(9));
    const card = drawFire(state, ctx);
    expect(card).toBe(expectedDeck[0]);
    expect(state.hidden.fireDeck).toEqual(expectedDeck.slice(1));
    expect(state.fireDiscard).toEqual([]);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12 }]);
  });

  it("is an engine bug when deck and discard are both empty", () => {
    const state = buildState();
    state.hidden.fireDeck = [];
    state.fireDiscard = [];
    expect(() => drawFire(state, testContext())).toThrow(InvariantError);
  });
});

describe("peekFire and buryTopFire (Test Pieces, L639, editorial L649)", () => {
  it("peeks without moving the card", () => {
    const state = buildState({ fireDeck: [1, -2, 0] });
    const ctx = testContext();
    expect(peekFire(state, ctx)).toBe(1);
    expect(state.hidden.fireDeck.slice(0, 3)).toEqual([1, -2, 0]);
    expect(ctx.events).toEqual([]);
  });

  it("peek reshuffles only when the deck is empty", () => {
    const state = buildState({ fireDeck: [], fireDiscard: [-2, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2] });
    const ctx = testContext(3);
    const card = peekFire(state, ctx);
    expect(state.hidden.fireDeck).toHaveLength(12);
    expect(state.hidden.fireDeck[0]).toBe(card);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12 }]);
  });

  it("bury moves the top card to the end of the deck array", () => {
    // Every card not pinned to the deck starts in the discard.
    const state = buildState({ fireDeck: [2, -1, 0, 1] });
    buryTopFire(state);
    expect(state.hidden.fireDeck).toEqual([-1, 0, 1, 2]);
    expect(() => {
      state.hidden.fireDeck = [];
      buryTopFire(state);
    }).toThrow(InvariantError);
  });
});

describe("discardFire and the open discard (L512)", () => {
  it("adds the card face up, newest last, and keeps all 12 cards in exactly one zone", () => {
    const state = buildState({ fireDeck: [2, -1, 0] });
    const ctx = testContext();
    const before = state.fireDiscard.length;
    const card = drawFire(state, ctx);
    discardFire(state, card);
    expect(state.fireDiscard).toHaveLength(before + 1);
    expect(state.fireDiscard.at(-1)).toBe(2);
    expect(counts(cardZones(state).fire)).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  });

  it("the discard is public while the deck order is not", () => {
    const state = buildState({ fireDiscard: [1, 1] });
    const projected = projectPublicState(state);
    expect(projected.fireDiscard).toEqual([1, 1]);
    expect(projected.counts.fireDeck).toBe(state.hidden.fireDeck.length);
    expect(JSON.stringify(projected)).not.toContain('"fireDeck":[');
  });
});
