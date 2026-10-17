/**
 * Main Order market and Tech displays (P2 `market.ts`): L128–130, L187–214, L387–391,
 * L511–513, B1–B3, DESIGN §2.4 and §11 Q2 (audit P2).
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  addToHand,
  discardMainOrders,
  drawMainOrder,
  drawTechsForInspection,
  lookCount,
  refillMainDisplay,
  refillTechDisplay,
  removeFromHand,
  reservable,
  returnTechsToBottom,
  rotateMainDisplay,
  takeFaceUpOrder,
  takeFaceUpTech,
  takeTopMainOrders,
} from "../../../src/game/market.ts";
import { SeededRandom, shuffle } from "../../../src/game/rng.ts";
import type { GameState, MainOrderId, OrderId, TechId } from "../../../src/game/types.ts";
import { projectPublicState, viewOf } from "../../../src/game/view.ts";
import { buildState, cardZones, testContext } from "./support/fixtures.ts";

const SIX: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];

/** Every Main Order not named goes to p2's hand, so the deck and discard hold exactly the
 * given cards (B1 scenarios). */
function exactSupply(display: Array<OrderId | null>, mainDeck: OrderId[], mainDiscard: OrderId[]): GameState {
  const named = new Set<OrderId>([...display.filter((id): id is OrderId => id !== null), ...mainDeck, ...mainDiscard]);
  const rest = MAIN_ORDER_IDS.filter((id) => !named.has(id));
  return buildState({ players: [{}, { hand: rest }], display, mainDeck, mainDiscard });
}

function expectConserved(state: GameState): void {
  const { orders } = cardZones(state);
  expect(orders.length).toBe(64);
  expect(new Set(orders).size).toBe(64);
}

describe("drawMainOrder (L511)", () => {
  it("draws the top card and leaves the discard alone while the deck has cards", () => {
    const state = buildState({ display: SIX, mainDeck: ["O10", "O11"] });
    const discardBefore = [...state.hidden.mainDiscard];
    const ctx = testContext(1);
    expect(drawMainOrder(state, ctx)).toBe("O10");
    expect(state.hidden.mainDeck).toEqual(["O11"]);
    expect(state.hidden.mainDiscard).toEqual(discardBefore);
    expect(ctx.events).toEqual([]);
  });

  it("shuffles the discard into a new deck only when the deck is empty", () => {
    const state = buildState({ display: SIX, mainDeck: [] });
    const discard = [...state.hidden.mainDiscard];
    expect(discard.length).toBe(42);
    const ctx = testContext(7);
    const expected = shuffle(discard, new SeededRandom(7));
    expect(drawMainOrder(state, ctx)).toBe(expected[0]);
    expect(state.hidden.mainDeck).toEqual(expected.slice(1));
    expect(state.hidden.mainDiscard).toEqual([]);
    expect(ctx.events).toEqual([{ type: "MAIN_DECK_RESHUFFLED", cardCount: 42 }]);
    expectConserved({ ...state, hidden: { ...state.hidden, mainDeck: [expected[0] as OrderId, ...state.hidden.mainDeck] } });
  });

  it("returns null without an event when the deck and discard are both empty (B1)", () => {
    const state = exactSupply(SIX, [], []);
    const ctx = testContext(1);
    const rngBefore = ctx.rng.getState();
    expect(drawMainOrder(state, ctx)).toBeNull();
    expect(ctx.events).toEqual([]);
    expect(ctx.rng.getState()).toBe(rngBefore);
  });
});

describe("takeTopMainOrders (B1 looks)", () => {
  it("takes up to the requested number off the top", () => {
    const state = buildState({ display: SIX, mainDeck: ["O20", "O21", "O22", "O23"] });
    const ctx = testContext(1);
    expect(takeTopMainOrders(state, 3, ctx)).toEqual(["O20", "O21", "O22"]);
    expect(state.hidden.mainDeck).toEqual(["O23"]);
    expect(ctx.events).toEqual([]);
  });

  it("sees only the cards that remain and never reshuffles to complete the look", () => {
    const state = buildState({ display: SIX, mainDeck: ["O20"] });
    const discard = [...state.hidden.mainDiscard];
    const ctx = testContext(1);
    expect(takeTopMainOrders(state, 3, ctx)).toEqual(["O20"]);
    expect(state.hidden.mainDeck).toEqual([]);
    expect(state.hidden.mainDiscard).toEqual(discard);
    expect(ctx.events).toEqual([]);
  });

  it("reshuffles first when the deck is empty as the look starts", () => {
    const state = exactSupply(SIX, [], ["O30", "O31", "O32", "O33", "O34"]);
    const ctx = testContext(3);
    const expected = shuffle(["O30", "O31", "O32", "O33", "O34"], new SeededRandom(3));
    expect(takeTopMainOrders(state, 3, ctx)).toEqual(expected.slice(0, 3));
    expect(state.hidden.mainDeck).toEqual(expected.slice(3));
    expect(state.hidden.mainDiscard).toEqual([]);
    expect(ctx.events).toEqual([{ type: "MAIN_DECK_RESHUFFLED", cardCount: 5 }]);
  });

  it("sees fewer than 3 after a reshuffle of a short discard, and nothing when both piles are empty", () => {
    const short = exactSupply(SIX, [], ["O30", "O31"]);
    expect(takeTopMainOrders(short, 3, testContext(1)).sort()).toEqual(["O30", "O31"]);
    const empty = exactSupply(SIX, [], []);
    const ctx = testContext(1);
    expect(takeTopMainOrders(empty, 3, ctx)).toEqual([]);
    expect(ctx.events).toEqual([]);
  });

  it("takes nothing and does not reshuffle for a zero-card look", () => {
    const state = exactSupply(SIX, [], ["O30"]);
    const ctx = testContext(1);
    expect(takeTopMainOrders(state, 0, ctx)).toEqual([]);
    expect(state.hidden.mainDiscard).toEqual(["O30"]);
    expect(ctx.events).toEqual([]);
  });
});

describe("discardMainOrders (face down, B3)", () => {
  it("puts Orders on the face-down discard, last one on top; only the count is public", () => {
    const state = exactSupply(SIX, ["O40"], ["O41"]);
    const looked: MainOrderId[] = ["O42", "O43"];
    // Take them out of p2's hand as if they had been looked at.
    for (const id of looked) removeFromHand(state, "p2", id);
    discardMainOrders(state, looked);
    expect(state.hidden.mainDiscard).toEqual(["O43", "O42", "O41"]);
    const view = projectPublicState(state);
    expect(view.counts.mainDiscard).toBe(3);
    const json = JSON.stringify(view);
    for (const id of ["O41", "O42", "O43"]) expect(json).not.toContain(`"${id}"`);
    expectConserved(state);
  });

  it("refuses Starting Orders (they return to the box) and double discards", () => {
    const state = buildState({ players: [{ hand: ["S01"] }, {}] });
    expect(() => discardMainOrders(state, ["S01"])).toThrow(InvariantError);
    const discard = buildState({ display: SIX, mainDeck: ["O10"] });
    const top = discard.hidden.mainDiscard[0] as OrderId;
    expect(() => discardMainOrders(discard, [top])).toThrow(InvariantError);
  });
});

describe("takeFaceUpOrder and the deferred refill (L191, L199, L391)", () => {
  it("leaves the position empty until the turn ends and records who owes the refill", () => {
    const state = buildState({ display: SIX, mainDeck: ["O20", "O21"] });
    expect(takeFaceUpOrder(state, "p1", 2)).toBe("O03");
    expect(state.market.display).toEqual(["O01", "O02", null, "O04", "O05", "O06"]);
    expect(state.market.refillPendingFor).toBe("p1");
    expect(state.hidden.orderHands["p1"]).toEqual([]);
    expect(state.hidden.mainDeck).toEqual(["O20", "O21"]);
  });

  it("refills once after two takes in one turn: slide left, reveal into the rightmost positions", () => {
    const state = buildState({ display: SIX, mainDeck: ["O20", "O21", "O22"] });
    addToHand(state, "p1", takeFaceUpOrder(state, "p1", 1));
    // The Shifu's second reservation sees only the Orders still showing (L199).
    expect(reservable(viewOf(state, "p1").game).faceUpSlots).toEqual([0, 2, 3, 4, 5]);
    addToHand(state, "p1", takeFaceUpOrder(state, "p1", 3));
    expect(state.market.display).toEqual(["O01", null, "O03", null, "O05", "O06"]);
    const ctx = testContext(1);
    refillMainDisplay(state, "end_of_turn", ctx);
    expect(state.market.display).toEqual(["O01", "O03", "O05", "O06", "O20", "O21"]);
    expect(state.market.refillPendingFor).toBeNull();
    expect(state.hidden.mainDeck).toEqual(["O22"]);
    expect(state.hidden.orderHands["p1"]).toEqual(["O02", "O04"]);
    expect(ctx.events).toEqual([
      {
        type: "DISPLAY_REFILLED",
        cause: "end_of_turn",
        revealedOrderIds: ["O20", "O21"],
        display: ["O01", "O03", "O05", "O06", "O20", "O21"],
      },
    ]);
    expectConserved(state);
  });

  it("rejects an empty position, an unknown player and a refill still owed by someone else", () => {
    const state = buildState({ display: ["O01", null, "O03", "O04", "O05", "O06"], refillPendingFor: "p1" });
    expect(() => takeFaceUpOrder(state, "p1", 1)).toThrow(InvariantError);
    expect(() => takeFaceUpOrder(state, "p1", 6)).toThrow(InvariantError);
    expect(() => takeFaceUpOrder(state, "p9", 0)).toThrow(InvariantError);
    expect(() => takeFaceUpOrder(state, "p2", 0)).toThrow(InvariantError);
    expect(takeFaceUpOrder(state, "p1", 0)).toBe("O01");
  });
});

describe("refillMainDisplay", () => {
  it("compacts any gaps and fills from the deck left to right, with the cause given", () => {
    const state = buildState({ display: [null, "O02", null, "O04", null, "O06"], mainDeck: ["O30", "O31", "O32", "O33"] });
    const ctx = testContext(1);
    refillMainDisplay(state, "round_start", ctx);
    expect(state.market.display).toEqual(["O02", "O04", "O06", "O30", "O31", "O32"]);
    expect(ctx.events).toEqual([
      { type: "DISPLAY_REFILLED", cause: "round_start", revealedOrderIds: ["O30", "O31", "O32"], display: state.market.display },
    ]);
  });

  it("fills every empty position as cards allow, not just two (DESIGN §11 Q2 default, audit P2)", () => {
    const state = buildState({ display: ["O01", null, null, null, null, null], mainDeck: ["O30", "O31", "O32", "O33", "O34", "O35"] });
    refillMainDisplay(state, "round_start", testContext(1));
    expect(state.market.display).toEqual(["O01", "O30", "O31", "O32", "O33", "O34"]);
    expect(state.hidden.mainDeck).toEqual(["O35"]);
  });

  it("reshuffles the discard when the deck runs out mid-refill (L511)", () => {
    const state = exactSupply(["O01", "O02", "O03", "O04", null, null], ["O30"], ["O40", "O41", "O42"]);
    const ctx = testContext(11);
    const reshuffled = shuffle(["O40", "O41", "O42"], new SeededRandom(11));
    refillMainDisplay(state, "end_of_turn", ctx);
    expect(state.market.display).toEqual(["O01", "O02", "O03", "O04", "O30", reshuffled[0]]);
    expect(state.hidden.mainDeck).toEqual(reshuffled.slice(1));
    expect(ctx.events.map((event) => event.type)).toEqual(["MAIN_DECK_RESHUFFLED", "DISPLAY_REFILLED"]);
    expectConserved(state);
  });

  it("leaves positions empty at the right when the deck and discard are exhausted (B1)", () => {
    const state = exactSupply(["O01", null, "O03", null, null, null], ["O30"], []);
    const ctx = testContext(1);
    refillMainDisplay(state, "end_of_turn", ctx);
    expect(state.market.display).toEqual(["O01", "O03", "O30", null, null, null]);
    expect(ctx.events).toEqual([
      { type: "DISPLAY_REFILLED", cause: "end_of_turn", revealedOrderIds: ["O30"], display: ["O01", "O03", "O30", null, null, null] },
    ]);
    expectConserved(state);
  });

  it("builds a full display from an empty one (setup)", () => {
    const state = buildState({ display: [], mainDeck: ["O07", "O08", "O09", "O10", "O11", "O12", "O13"] });
    refillMainDisplay(state, "setup", testContext(1));
    expect(state.market.display).toEqual(["O07", "O08", "O09", "O10", "O11", "O12"]);
  });
});

describe("rotateMainDisplay (L128–130, B1)", () => {
  it("discards the 2 leftmost face down, slides the other 4 left and reveals 2", () => {
    const state = buildState({ round: 2, display: SIX, mainDeck: ["O20", "O21", "O22"] });
    const ctx = testContext(1);
    rotateMainDisplay(state, ctx);
    expect(state.market.display).toEqual(["O03", "O04", "O05", "O06", "O20", "O21"]);
    expect(state.hidden.mainDiscard.slice(0, 2)).toEqual(["O02", "O01"]);
    expect(state.hidden.mainDeck).toEqual(["O22"]);
    expect(ctx.events).toEqual([
      { type: "MAIN_DISPLAY_ROTATED", round: 2, discardedOrderIds: ["O01", "O02"], display: ["O03", "O04", "O05", "O06", null, null] },
      { type: "DISPLAY_REFILLED", cause: "round_start", revealedOrderIds: ["O20", "O21"], display: ["O03", "O04", "O05", "O06", "O20", "O21"] },
    ]);
    expectConserved(state);
  });

  it("with a 1-card deck, reveals it and then reshuffles the discard, which now holds the rotated-out Orders (L511)", () => {
    const state = exactSupply(SIX, ["O20"], []);
    const ctx = testContext(5);
    rotateMainDisplay(state, ctx);
    const display = state.market.display;
    expect(display.slice(0, 5)).toEqual(["O03", "O04", "O05", "O06", "O20"]);
    expect(["O01", "O02"]).toContain(display[5]);
    expect(ctx.events.map((event) => event.type)).toEqual(["MAIN_DISPLAY_ROTATED", "MAIN_DECK_RESHUFFLED", "DISPLAY_REFILLED"]);
    expectConserved(state);
  });

  it("discards up to 2 and slides the rest when fewer Orders show, leaving positions empty (B1)", () => {
    const state = exactSupply(["O01", null, null, null, null, null], [], []);
    const ctx = testContext(1);
    rotateMainDisplay(state, ctx);
    // The only Order goes to the discard; the empty deck then reshuffles it back (L511).
    expect(ctx.events[0]).toEqual({ type: "MAIN_DISPLAY_ROTATED", round: 1, discardedOrderIds: ["O01"], display: [null, null, null, null, null, null] });
    expect(state.market.display).toEqual(["O01", null, null, null, null, null]);
    expectConserved(state);
  });

  it("does nothing to the piles when the display is empty and the supply exhausted", () => {
    const rest = MAIN_ORDER_IDS;
    const state = buildState({ players: [{}, { hand: [...rest] }], display: [null, null, null, null, null, null], mainDeck: [], mainDiscard: [] });
    const ctx = testContext(1);
    rotateMainDisplay(state, ctx);
    expect(state.market.display).toEqual([null, null, null, null, null, null]);
    expect(ctx.events).toEqual([
      { type: "MAIN_DISPLAY_ROTATED", round: 1, discardedOrderIds: [], display: [null, null, null, null, null, null] },
      { type: "DISPLAY_REFILLED", cause: "round_start", revealedOrderIds: [], display: [null, null, null, null, null, null] },
    ]);
  });
});

describe("reservable (B1, public information only)", () => {
  it("lists showing positions and reports a supply while the deck has a card", () => {
    const state = buildState({ display: ["O01", null, "O03", "O04", "O05", "O06"], mainDeck: ["O20"] });
    expect(reservable(viewOf(state, null).game)).toEqual({ faceUpSlots: [0, 2, 3, 4, 5], supply: true });
  });

  it("counts the discard: a look or a draw reshuffles it first (L511)", () => {
    const state = exactSupply(SIX, [], ["O20"]);
    expect(reservable(viewOf(state, "p1").game)).toEqual({ faceUpSlots: [0, 1, 2, 3, 4, 5], supply: true });
  });

  it("reports no supply when the deck and discard are both empty", () => {
    const state = exactSupply(["O01", null, null, null, null, null], [], []);
    expect(reservable(viewOf(state, "p2").game)).toEqual({ faceUpSlots: [0], supply: false });
  });

  it("offers nothing at all when the whole supply is exhausted", () => {
    const state = buildState({ players: [{}, { hand: [...MAIN_ORDER_IDS] }], display: [null, null, null, null, null, null], mainDeck: [], mainDiscard: [] });
    expect(reservable(viewOf(state, "p1").game)).toEqual({ faceUpSlots: [], supply: false });
  });
});

describe("lookCount (B1: mirrors takeTopMainOrders, public counts only)", () => {
  it("shows up to the look's size from a non-empty deck, never completing it from the discard", () => {
    expect(lookCount(viewOf(exactSupply(SIX, ["O20", "O21", "O22", "O23"], []), null).game, 3)).toBe(3);
    expect(lookCount(viewOf(exactSupply(SIX, ["O20", "O21"], ["O30", "O31"]), null).game, 3)).toBe(2);
    expect(lookCount(viewOf(exactSupply(SIX, ["O20"], ["O30", "O31", "O32"]), null).game, 2)).toBe(1);
  });

  it("an empty deck counts the discard the look would reshuffle; both empty gives 0", () => {
    expect(lookCount(viewOf(exactSupply(SIX, [], ["O30", "O31", "O32", "O33"]), null).game, 3)).toBe(3);
    expect(lookCount(viewOf(exactSupply(SIX, [], ["O30"]), null).game, 3)).toBe(1);
    expect(lookCount(viewOf(exactSupply(SIX, [], []), null).game, 2)).toBe(0);
  });

  it("counts cards about to be discarded before the look (extraDiscard)", () => {
    expect(lookCount(viewOf(exactSupply(SIX, [], []), null).game, 2, 1)).toBe(1);
    expect(lookCount(viewOf(exactSupply(SIX, [], ["O30"]), null).game, 2, 1)).toBe(2);
    // A non-empty deck ignores the discard altogether.
    expect(lookCount(viewOf(exactSupply(SIX, ["O20"], []), null).game, 2, 1)).toBe(1);
  });

  it("agrees with takeTopMainOrders on the authoritative state", () => {
    for (const [deck, discard, size] of [
      [["O20", "O21", "O22"], ["O30"], 2],
      [["O20"], ["O30", "O31"], 3],
      [[], ["O30", "O31"], 3],
      [[], [], 3],
    ] as Array<[OrderId[], OrderId[], number]>) {
      const state = exactSupply(SIX, deck, discard);
      const expected = lookCount(viewOf(state, null).game, size);
      expect(takeTopMainOrders(state, size, testContext(1))).toHaveLength(expected);
    }
  });
});

describe("Order hands (secret, L201)", () => {
  it("adds and removes Orders in the hidden hand; only counts are public", () => {
    const state = buildState({ display: SIX, mainDeck: ["O20", "O21"] });
    const drawn = drawMainOrder(state, testContext(1)) as OrderId;
    addToHand(state, "p2", drawn);
    expect(state.hidden.orderHands["p2"]).toEqual(["O20"]);
    expect(viewOf(state, "p1").game.counts.orderHands).toEqual({ p1: 0, p2: 1 });
    expect(JSON.stringify(viewOf(state, "p1"))).not.toContain("O20");
    expect(viewOf(state, "p2").own?.orderHand).toEqual(["O20"]);
    removeFromHand(state, "p2", "O20");
    expect(state.hidden.orderHands["p2"]).toEqual([]);
  });

  it("rejects double adds, removing an Order not held, and unknown players", () => {
    const state = buildState({ players: [{ hand: ["S01"] }, {}] });
    expect(() => addToHand(state, "p1", "S01")).toThrow(InvariantError);
    expect(() => removeFromHand(state, "p2", "S01")).toThrow(InvariantError);
    expect(() => addToHand(state, "p9", "O01")).toThrow(InvariantError);
  });
});

describe("Tech decks and displays (L208, L210, L513, B2)", () => {
  function techState(): GameState {
    return buildState({
      players: [{ techs: ["T18"] }, { techs: ["T19"] }],
      techDisplay: { workshop: ["T01", "T16"] },
      techDecks: { workshop: ["T05", "T17"] },
    });
  }

  it("inspects the top 2, or as many as remain (possibly none)", () => {
    const state = techState();
    expect(drawTechsForInspection(state, "workshop", 2)).toEqual(["T05", "T17"]);
    expect(state.hidden.techDecks.workshop).toEqual([]);
    expect(drawTechsForInspection(state, "workshop", 2)).toEqual([]);
    const one = techState();
    expect(drawTechsForInspection(one, "workshop", 1)).toEqual(["T05"]);
    expect(drawTechsForInspection(one, "workshop", 2)).toEqual(["T17"]);
    expect(projectPublicState(one).counts.techDecks.workshop).toBe(0);
  });

  it("returns untaken Techs to the bottom in the chosen order, then refills (B2)", () => {
    const state = techState();
    const inspected = drawTechsForInspection(state, "workshop", 2);
    expect(inspected).toEqual(["T05", "T17"]);
    takeFaceUpTech(state, "T01");
    expect(state.techDisplay.workshop).toEqual(["T16"]);
    returnTechsToBottom(state, "workshop", ["T17", "T05"]);
    expect(state.hidden.techDecks.workshop).toEqual(["T17", "T05"]);
    const ctx = testContext(1);
    refillTechDisplay(state, "workshop", ctx);
    expect(state.techDisplay.workshop).toEqual(["T16", "T17"]);
    expect(state.hidden.techDecks.workshop).toEqual(["T05"]);
    expect(ctx.events).toEqual([{ type: "TECH_DISPLAY_REFILLED", discipline: "workshop", revealedTechIds: ["T17"], display: ["T16", "T17"] }]);
  });

  it("leaves a partial display when the deck runs out (L513) and is silent when nothing is revealed", () => {
    // Four players each own a Workshop Tech, so the Workshop deck is empty.
    const state = buildState({
      players: [{ techs: ["T18"] }, { techs: ["T19"] }, { techs: ["T05"] }, { techs: ["T17"] }],
      techDisplay: { workshop: ["T01", "T16"] },
      techDecks: { workshop: [] },
    });
    takeFaceUpTech(state, "T16");
    const ctx = testContext(1);
    refillTechDisplay(state, "workshop", ctx);
    expect(state.techDisplay.workshop).toEqual(["T01"]);
    expect(ctx.events).toEqual([]);
    refillTechDisplay(state, "glazing_loading", ctx);
    expect(state.techDisplay.glazing_loading).toHaveLength(2);
    expect(ctx.events).toEqual([]);
  });

  it("refills from the deck top with an event naming the revealed Techs", () => {
    const state = buildState();
    const deck = [...state.hidden.techDecks.firing];
    const shown = [...state.techDisplay.firing];
    takeFaceUpTech(state, shown[0] as TechId);
    const ctx = testContext(1);
    refillTechDisplay(state, "firing", ctx);
    expect(state.techDisplay.firing).toEqual([shown[1], deck[0]]);
    expect(ctx.events).toEqual([{ type: "TECH_DISPLAY_REFILLED", discipline: "firing", revealedTechIds: [deck[0]], display: [shown[1], deck[0]] }]);
  });

  it("rejects taking a Tech that is not face up and returning a Tech to the wrong deck", () => {
    const state = techState();
    expect(() => takeFaceUpTech(state, "T05")).toThrow(InvariantError);
    expect(() => returnTechsToBottom(state, "firing", ["T05"])).toThrow(InvariantError);
    expect(() => returnTechsToBottom(state, "workshop", ["T01"])).toThrow(InvariantError);
    expect(() => returnTechsToBottom(state, "workshop", ["T05"])).toThrow(InvariantError);
  });
});

describe("determinism", () => {
  it("the same seed reshuffles the same way; another seed may not", () => {
    const run = (seed: number): Array<OrderId | null> => {
      const state = exactSupply([null, null, null, null, null, null], [], ["O30", "O31", "O32", "O33", "O34", "O35", "O36", "O37"]);
      refillMainDisplay(state, "end_of_turn", testContext(seed));
      return state.market.display;
    };
    expect(run(4)).toEqual(run(4));
    const outcomes = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => JSON.stringify(run(seed))));
    expect(outcomes.size).toBeGreaterThan(1);
  });
});
