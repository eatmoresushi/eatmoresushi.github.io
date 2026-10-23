/**
 * Fire deck (Appendix C L656–666, L511, L657, v1.6.2 L638–639, L648, owner ruling R15): the
 * 1/3/4/3/1 distribution, the open discard, Test Pieces' bury to the bottom, and the reshuffle
 * when the deck runs out: when a card is needed and every card left is buried (an empty deck
 * included), the open discard is shuffled and placed on top, above the buried cards, which are
 * drawn last.
 */

import { describe, expect, it } from "vitest";
import { FIRING } from "../../../src/game/content.ts";
import { buryTopFire, discardFire, drawFire, fireDeckRunOut, peekFire } from "../../../src/game/firing/fireDeck.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import { invariantViolations } from "../../../src/game/invariants.ts";
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

const FULL: FireModifier[] = [-2, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2];

describe("Fire deck distribution (Appendix C)", () => {
  it("has 12 cards: −2×1, −1×3, 0×4, +1×3, +2×1", () => {
    expect(FIRING.fireDeck).toHaveLength(12);
    expect(counts(FIRING.fireDeck)).toEqual({ "-2": 1, "-1": 3, "0": 4, "1": 3, "2": 1 });
  });
});

describe("fireDeckRunOut (R15)", () => {
  it("is true when every card left is buried, an empty deck included", () => {
    expect(fireDeckRunOut(0, 0)).toBe(true);
    expect(fireDeckRunOut(1, 1)).toBe(true);
    expect(fireDeckRunOut(2, 2)).toBe(true);
    expect(fireDeckRunOut(1, 0)).toBe(false);
    expect(fireDeckRunOut(3, 1)).toBe(false);
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

  it("does not reshuffle while a single unburied card remains, even with a large discard (L511)", () => {
    const state = buildState({ fireDeck: [0], fireDiscard: [-2, -1, -1, -1, 0, 0, 0, 1, 1, 1, 2] });
    const ctx = testContext(5);
    const rngBefore = ctx.rng.getState();
    expect(drawFire(state, ctx)).toBe(0);
    expect(state.hidden.fireDeck).toEqual([]);
    expect(state.fireDiscard).toHaveLength(11);
    expect(ctx.events).toEqual([]);
    expect(ctx.rng.getState()).toBe(rngBefore);
  });

  it("reshuffles the open discard into a new deck when the deck is empty, then draws (L511, L657)", () => {
    const state = buildState({ fireDeck: [], fireDiscard: FULL });
    const ctx = testContext(9);
    const expectedDeck = shuffle(FULL, new SeededRandom(9));
    const card = drawFire(state, ctx);
    expect(card).toBe(expectedDeck[0]);
    expect(state.hidden.fireDeck).toEqual(expectedDeck.slice(1));
    expect(state.hidden.fireBuried).toBe(0);
    expect(state.fireDiscard).toEqual([]);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12, buriedBelow: 0 }]);
  });

  it("R15: with only a buried card left, the shuffled discard goes on top of it, and the buried card is drawn last (v1.6.2 L648)", () => {
    const discard: FireModifier[] = [-2, -1, -1, -1, 0, 0, 0, 1, 1, 1, 2];
    const state = buildState({ fireDeck: [0], fireDiscard: discard, fireBuried: 1 });
    const ctx = testContext(4);
    const shuffled = shuffle(discard, new SeededRandom(4));
    expect(drawFire(state, ctx)).toBe(shuffled[0]);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 11, buriedBelow: 1 }]);
    expect(state.hidden.fireDeck).toEqual([...shuffled.slice(1), 0]);
    expect(state.hidden.fireBuried).toBe(1);
    expect(state.fireDiscard).toEqual([]);
    // The ten other cards come first; the buried 0 is the very last card drawn.
    const drawn: FireModifier[] = [];
    for (let n = 0; n < 10; n += 1) drawn.push(drawFire(state, ctx));
    expect(drawn).toEqual(shuffled.slice(1));
    expect(state.hidden.fireDeck).toEqual([0]);
    expect(state.hidden.fireBuried).toBe(1);
    // Nothing in the discard: the buried card is drawn, and is then no longer buried.
    expect(drawFire(state, ctx)).toBe(0);
    expect(state.hidden.fireDeck).toEqual([]);
    expect(state.hidden.fireBuried).toBe(0);
    // Exactly one reshuffle over the whole sequence.
    expect(ctx.events.filter((event) => event.type === "FIRE_DECK_RESHUFFLED")).toHaveLength(1);
  });

  it("R15: several buried cards stay at the bottom in their order through a reshuffle", () => {
    // Every card not pinned to the deck starts in the discard: 10 cards.
    const state = buildState({ fireDeck: [2, -2], fireBuried: 2 });
    const discard = [...state.fireDiscard];
    const ctx = testContext(11);
    const shuffled = shuffle(discard, new SeededRandom(11));
    expect(drawFire(state, ctx)).toBe(shuffled[0]);
    expect(state.hidden.fireDeck).toEqual([...shuffled.slice(1), 2, -2]);
    expect(state.hidden.fireBuried).toBe(2);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 10, buriedBelow: 2 }]);
  });

  it("an unburied card above buried ones is drawn without a reshuffle or randomness", () => {
    const state = buildState({ fireDeck: [1, 2], fireBuried: 1 });
    const ctx = testContext(3);
    const rngBefore = ctx.rng.getState();
    expect(drawFire(state, ctx)).toBe(1);
    expect(state.hidden.fireDeck).toEqual([2]);
    expect(state.hidden.fireBuried).toBe(1);
    expect(ctx.events).toEqual([]);
    expect(ctx.rng.getState()).toBe(rngBefore);
  });

  it("is an engine bug when deck and discard are both empty", () => {
    const state = buildState();
    state.hidden.fireDeck = [];
    state.fireDiscard = [];
    expect(() => drawFire(state, testContext())).toThrow(InvariantError);
  });

  it("is an engine bug when fireBuried does not fit the deck", () => {
    const state = buildState({ fireDeck: [1] });
    state.hidden.fireBuried = 2;
    expect(() => drawFire(state, testContext())).toThrow(InvariantError);
  });
});

describe("peekFire and buryTopFire (Test Pieces, v1.6.2 L638, L648, R15)", () => {
  it("peeks without moving the card", () => {
    const state = buildState({ fireDeck: [1, -2, 0] });
    const ctx = testContext();
    expect(peekFire(state, ctx)).toBe(1);
    expect(state.hidden.fireDeck.slice(0, 3)).toEqual([1, -2, 0]);
    expect(ctx.events).toEqual([]);
  });

  it("a peek at an empty deck reshuffles first", () => {
    const state = buildState({ fireDeck: [], fireDiscard: FULL });
    const ctx = testContext(3);
    const card = peekFire(state, ctx);
    expect(state.hidden.fireDeck).toHaveLength(12);
    expect(state.hidden.fireDeck[0]).toBe(card);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 12, buriedBelow: 0 }]);
  });

  it("R15: a peek at a deck of only buried cards reshuffles the discard above them, and sees its top", () => {
    const state = buildState({ fireDeck: [-1], fireBuried: 1 });
    const discard = [...state.fireDiscard];
    const ctx = testContext(6);
    const shuffled = shuffle(discard, new SeededRandom(6));
    expect(peekFire(state, ctx)).toBe(shuffled[0]);
    expect(state.hidden.fireDeck).toEqual([...shuffled, -1]);
    expect(state.hidden.fireBuried).toBe(1);
    expect(state.fireDiscard).toEqual([]);
    expect(ctx.events).toEqual([{ type: "FIRE_DECK_RESHUFFLED", cardCount: 11, buriedBelow: 1 }]);
  });

  it("bury moves the top card to the bottom and counts it as buried", () => {
    // Every card not pinned to the deck starts in the discard.
    const state = buildState({ fireDeck: [2, -1, 0, 1] });
    buryTopFire(state);
    expect(state.hidden.fireDeck).toEqual([-1, 0, 1, 2]);
    expect(state.hidden.fireBuried).toBe(1);
    // A second bury goes below the first: both stay at the bottom, the newer one last.
    buryTopFire(state);
    expect(state.hidden.fireDeck).toEqual([0, 1, 2, -1]);
    expect(state.hidden.fireBuried).toBe(2);
    expect(() => {
      state.hidden.fireDeck = [];
      state.hidden.fireBuried = 0;
      buryTopFire(state);
    }).toThrow(InvariantError);
  });

  it("burying when every card is already buried moves it under the others without a new count", () => {
    const state = buildState({ fireDeck: [1, -1], fireBuried: 2 });
    buryTopFire(state);
    expect(state.hidden.fireDeck).toEqual([-1, 1]);
    expect(state.hidden.fireBuried).toBe(2);
  });

  it("burying the card a peek's reshuffle put on top buries it below the old buried card", () => {
    const state = buildState({ fireDeck: [-1], fireBuried: 1 });
    const ctx = testContext(6);
    const top = peekFire(state, ctx);
    buryTopFire(state);
    expect(state.hidden.fireBuried).toBe(2);
    expect(state.hidden.fireDeck.slice(-2)).toEqual([-1, top]);
    expect(invariantViolations(state)).toEqual([]);
  });
});

describe("discardFire and the open discard (L511)", () => {
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

  it("the discard and the buried count are public while the deck order is not", () => {
    const state = buildState({ fireDiscard: [1, 1], fireBuried: 1 });
    const projected = projectPublicState(state);
    expect(projected.fireDiscard).toEqual([1, 1]);
    expect(projected.counts.fireDeck).toBe(state.hidden.fireDeck.length);
    expect(projected.counts.fireBuried).toBe(1);
    expect(JSON.stringify(projected)).not.toContain('"fireDeck":[');
  });

  it("the invariants reject a buried count larger than the deck", () => {
    const state = buildState({ fireDeck: [1] });
    state.hidden.fireBuried = 2;
    expect(invariantViolations(state).some((message) => message.includes("fireBuried"))).toBe(true);
  });
});
