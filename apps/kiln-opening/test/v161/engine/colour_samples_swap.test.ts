/**
 * The Colour Samples swap (T10; v1.6.2 L622, L646; rulebook changes 22, 24 and 25; R4, R16, R17,
 * R19, B1, B3; ENGINE_V1.6.2_DELTA.md §4.4): once per round, before or after one of your worker
 * actions, you may discard 1 held Order (a Main Order face down to the Main discard, a Starting
 * Order to the box) to Select 3: privately look at the top 3 Main Orders (as many as remain),
 * reserve 1 of them or 1 face-up Main Order from the display, and put the looked cards not
 * reserved face down on the bottom of the Main deck, several in random order. A face-up Order
 * taken leaves its position empty until the end of the turn, then the display refills as usual.
 * A Tech effect, not a worker or Commission Market action. Line citations are revision-3 lines
 * (Colour Samples is L622, its clarification L646).
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { legalActions } from "../../../src/game/legalActions.ts";
import { colourSamplesSwapOptions, lookedOrderOptions } from "../../../src/game/selectors.ts";
import type { GameAction, GameEvent, OrderId } from "../../../src/game/types.ts";
import { projectEvent, projectPublicState } from "../../../src/game/view.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function table(spec: StateSpec = {}): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function only<T extends GameEvent["type"]>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> {
  const found = events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  expect(found, `exactly one ${type}`).toHaveLength(1);
  return found[0] as Extract<GameEvent, { type: T }>;
}

const swap = (discardOrderId: OrderId): GameAction => ({ type: "USE_COLOUR_SAMPLES_SWAP", discardOrderId });
const choose = (orderId: OrderId): GameAction => ({ type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId }] });
const takeFaceUp = (slotIndex: number, orderId: OrderId): GameAction => ({ type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex, orderId }] });
const WHARF: GameAction = { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" };
const SELECT_3 = { n: 3, maxReservations: 1, fromDisplay: true };

/** The first card of the actor's open swap look. */
function firstLooked(t: LocalTable): OrderId {
  const look = t.state.hidden.pendingLook;
  if (look?.kind !== "colour_samples_swap" || look.orderIds[0] === undefined) throw new Error("no swap look is open");
  return look.orderIds[0];
}

const sorted = (ids: readonly OrderId[]): OrderId[] => [...ids].sort();

/** p1 owns Colour Samples and holds O40 and S01. */
const OWNER: StateSpec = { players: [{ techs: ["T10"], hand: ["O40", "S01"] }, {}] };

/** Every Main Order outside `keep` goes to p2's hand, so the deck and discard hold exactly `deck` and `discard`. */
function supply(hand: OrderId[], deck: OrderId[], discard: OrderId[], display: Array<OrderId | null> = ["O01", "O02", "O03", "O04", "O05", "O06"]): StateSpec {
  const keep = new Set<OrderId>([...display.filter((id): id is OrderId => id !== null), ...deck, ...discard, ...hand]);
  return {
    players: [{ techs: ["T10"], hand }, { hand: MAIN_ORDER_IDS.filter((id) => !keep.has(id)) }],
    display,
    mainDeck: deck,
    mainDiscard: discard,
  };
}

describe("before the worker action (L622): Select 3", () => {
  it("discards a held Main Order face down, looks at the top 3 privately, reserves 1 and puts the other 2 on the deck bottom", () => {
    const t = table(OWNER);
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    const display = [...t.state.market.display];
    const resources = { ...t.player("p1").resources };
    const opened = t.act("p1", swap("O40"));

    expect(types(opened)).toEqual(["TECH_USED", "HELD_ORDER_DISCARDED", "PRIVATE_LOOK_OPENED"]);
    expect(only(opened, "HELD_ORDER_DISCARDED")).toEqual({
      type: "HELD_ORDER_DISCARDED",
      playerId: "p1",
      cause: "colour_samples_swap",
      to: "main_discard",
      secret: { visibleTo: "p1", orderId: "O40" },
    });
    // Change 25: the swap now looks at 3 (it looked at 2 before).
    expect(only(opened, "PRIVATE_LOOK_OPENED")).toEqual({
      type: "PRIVATE_LOOK_OPENED",
      playerId: "p1",
      kind: "colour_samples_swap",
      discipline: null,
      count: 3,
      secret: { visibleTo: "p1", orderIds: [a, b, c], techIds: [] },
    });
    expect(t.state.phase).toEqual({
      type: "work_turn",
      activePlayerId: "p1",
      step: { kind: "colour_samples_swap", returnTo: "before_action", select: { ...SELECT_3, lookedCount: 3 } },
    });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "colour_samples_swap", playerId: "p1", orderIds: [a, b, c] });
    // The discarded Main Order is face down on the discard (L646); the hand holds 1 now.
    expect(t.state.hidden.mainDiscard).toEqual(["O40"]);
    expect(t.state.hidden.orderHands["p1"]).toEqual(["S01"]);
    expect(t.player("p1").techs[0]).toMatchObject({ id: "T10", usedThisRound: true });

    // Nothing else until the reservation: no worker, no END_TURN.
    expectDocumentedDetails(t.expectRuleError("p1", WHARF, "WRONG_PHASE"));
    expectDocumentedDetails(t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE"));

    const chosen = t.act("p1", choose(b));
    expect(types(chosen)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM"]);
    expect(only(chosen, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "colour_samples_swap",
      source: "looked",
      slotIndex: null,
      orderId: null,
      secret: { visibleTo: "p1", orderId: b },
    });
    // The other 2 go face down to the bottom of the Main deck, in random order (R19); the secret
    // names them in look order.
    expect(only(chosen, "LOOKED_ORDERS_TO_BOTTOM")).toEqual({ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 2, secret: { visibleTo: "p1", orderIds: [a, c] } });
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted([a, c]));
    expect(t.state.hidden.mainDiscard).toEqual(["O40"]);
    // Back in the before-action window; the hand size is unchanged and the worker action is still due.
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    expect(t.state.hidden.orderHands["p1"]).toEqual(["S01", b]);
    expect(t.state.hidden.pendingLook).toBeNull();
    // A Tech effect (L646): no worker, no resource; a looked reservation leaves the display untouched.
    expect(t.player("p1").resources).toEqual(resources);
    expect(t.state.market).toEqual({ display, refillPendingFor: null });
    expect(Object.values(t.player("p1").workers).every((worker) => worker.placement === null)).toBe(true);
    t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");
    t.act("p1", WHARF);
  });

  it("may reserve a face-up Main Order instead: its position stays empty until the turn ends, and all 3 looked cards go under the deck (change 25)", () => {
    const t = table(OWNER);
    const [a, b, c, next] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId, OrderId];
    t.act("p1", swap("O40"));
    const chosen = t.act("p1", takeFaceUp(2, "O03"));
    expect(types(chosen)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM"]);
    // A face-up reservation is public, like at the Commission Market.
    expect(only(chosen, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "colour_samples_swap",
      source: "face_up",
      slotIndex: 2,
      orderId: "O03",
    });
    expect(only(chosen, "LOOKED_ORDERS_TO_BOTTOM")).toEqual({ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 3, secret: { visibleTo: "p1", orderIds: [a, b, c] } });
    expect(sorted(t.state.hidden.mainDeck.slice(-3))).toEqual(sorted([a, b, c]));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["S01", "O03"]);
    // The position stays empty through the worker action (v1.6.2 L646, L197) ...
    expect(t.state.market).toEqual({ display: ["O01", "O02", null, "O04", "O05", "O06"], refillPendingFor: "p1" });
    expect(t.state.phase).toMatchObject({ step: { kind: "before_action" } });
    // ... and the display slides and refills once when the turn ends.
    const ended = t.act("p1", WHARF);
    expect(only(ended, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: [next], display: ["O01", "O02", "O04", "O05", "O06", next] });
    expect(t.state.market.refillPendingFor).toBeNull();
  });

  it("a Starting Order goes to the box, not the Main discard (L646, L308)", () => {
    const t = table(OWNER);
    const box = [...t.state.hidden.startingBox];
    const events = t.act("p1", swap("S01"));
    expect(only(events, "HELD_ORDER_DISCARDED")).toMatchObject({ to: "box", secret: { orderId: "S01" } });
    expect(t.state.hidden.startingBox).toEqual([...box, "S01"]);
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(projectPublicState(t.state).counts.mainDiscard).toBe(0);
  });
});

describe("after the worker action (L622)", () => {
  it("is used in the after-action window; the turn then ends by itself when nothing is left", () => {
    const t = table(OWNER);
    t.act("p1", WHARF);
    expect(t.state.phase).toMatchObject({ step: { kind: "after_action" } });
    const top = t.state.hidden.mainDeck[0] as OrderId;
    t.act("p1", swap("O40"));
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", returnTo: "after_action" } });
    const events = t.act("p1", choose(top));
    expect(types(events)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "p1", automatic: true });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2", step: { kind: "before_action" } });
  });

  it("a face-up reservation in the after-action window refills when the turn then ends", () => {
    const t = table(OWNER);
    t.act("p1", WHARF);
    t.act("p1", swap("O40"));
    const events = t.act("p1", takeFaceUp(0, "O01"));
    expect(types(events)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(t.state.market.display.every((orderId) => orderId !== null)).toBe(true);
  });

  it("after a Commission Market action: may discard the Order just reserved, and its look comes before the deferred refill (INT: deferred refill)", () => {
    const t = table({ players: [{ techs: ["T10"] }, {}] });
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    const looked = t.state.hidden.pendingLook?.kind === "commission_market" ? t.state.hidden.pendingLook.orderIds : [];
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01" }] });
    expect(t.state.market.display[0]).toBeNull();
    expect(t.state.phase).toMatchObject({ step: { kind: "after_action" } });
    const [c, d, e, next] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId, OrderId];
    t.act("p1", swap("O01"));
    expect(t.state.hidden.pendingLook).toEqual({ kind: "colour_samples_swap", playerId: "p1", orderIds: [c, d, e] });
    // The position the Commission Market emptied cannot be chosen: it is still empty.
    expectDocumentedDetails(t.expectRuleError("p1", takeFaceUp(0, "O01"), "ORDER_NOT_AVAILABLE"));
    const events = t.act("p1", choose(d));
    // Then the turn ends: the refill reveals the next deck card, not a looked one.
    expect(types(events)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: [next] });
    expect(t.state.hidden.orderHands["p1"]).toEqual([d]);
    expect(t.state.hidden.mainDiscard).toEqual(["O01"]);
    // Both looks' unreserved cards are at the bottom: the Commission look's 2, then the swap's 2,
    // which went under after them (each pair in random order, R19).
    expect(sorted(t.state.hidden.mainDeck.slice(-4, -2))).toEqual(sorted(looked));
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted([c, e]));
  });
});

describe("once per round, optional (R4)", () => {
  it("a second swap the same round is TECH_ALREADY_USED, in either window", () => {
    const t = table({ players: [{ techs: ["T10"], hand: ["O40", "O41"] }, {}] });
    t.act("p1", swap("O40"));
    t.act("p1", choose(firstLooked(t)));
    const error = t.expectRuleError("p1", swap("O41"), "TECH_ALREADY_USED");
    expect(error.details).toMatchObject({ techId: "T10" });
    expectDocumentedDetails(error);
    // After the worker action the window does not open again for the spent swap.
    t.act("p1", WHARF);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("declining keeps the use: END_TURN without a swap leaves T10 ready for a later turn", () => {
    const t = table(OWNER);
    t.act("p1", WHARF);
    t.act("p1", { type: "END_TURN" });
    expect(t.player("p1").techs[0]).toMatchObject({ usedThisRound: false });
    t.act("p2", { type: "PLACE_CANAL_WHARF", workerId: "p2:apprentice:1" });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "before_action" } });
    expect(types(t.act("p1", swap("O40")))).toContain("PRIVATE_LOOK_OPENED");
  });

  it("may be used in either order with Imperial Priority in the same window", () => {
    const spec: StateSpec = {
      players: [{ techs: ["T10"], recognition: 3, hand: ["O40"] }, {}],
      ceramics: [{ owner: "p1", shape: "vase", stage: "shaped" }],
    };
    const swapFirst = table(spec);
    swapFirst.act("p1", WHARF);
    swapFirst.act("p1", swap("O40"));
    swapFirst.act("p1", choose(firstLooked(swapFirst)));
    // Imperial Priority is still usable, so the window stays open.
    expect(swapFirst.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    const loaded = swapFirst.act("p1", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "celadon", imperialModifier: 0 });
    expect(types(loaded).slice(-2)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);

    const priorityFirst = table(spec);
    priorityFirst.act("p1", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c1", glaze: "celadon", imperialModifier: 0 });
    priorityFirst.act("p1", swap("O40"));
    expect(priorityFirst.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", returnTo: "before_action" } });
  });
});

describe("the look's supply (B1, R16, R17)", () => {
  it("a deck of 1 shows 1 card, without reshuffling the discard; nothing goes to the bottom", () => {
    const t = table(supply(["O40"], ["O07"], ["O08", "O09"]));
    const events = t.act("p1", swap("O40"));
    expect(types(events)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 1, secret: { orderIds: ["O07"] } });
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", select: { lookedCount: 1 } } });
    expect(colourSamplesSwapOptions(t.view("p1"))).toEqual({ usable: false, discards: [], faceUpSlots: [] });
    const chosen = t.act("p1", choose("O07"));
    expect(types(chosen)).not.toContain("LOOKED_ORDERS_TO_BOTTOM");
    expect(t.state.hidden.mainDiscard).toEqual(["O40", "O08", "O09"]);
  });

  it("an empty deck: the discard, now holding the Order just discarded, is reshuffled as the look starts (R17)", () => {
    const t = table(supply(["O40"], [], []));
    const events = t.act("p1", swap("O40"));
    expect(types(events)).toEqual(["TECH_USED", "HELD_ORDER_DISCARDED", "MAIN_DECK_RESHUFFLED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "MAIN_DECK_RESHUFFLED").cardCount).toBe(1);
    // The Order just discarded comes straight back.
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 1, secret: { orderIds: ["O40"] } });
    t.act("p1", choose("O40"));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O40"]);
  });

  it("both piles empty and a Starting Order: a 0-card look still reserves from the display (change 25, B1)", () => {
    const t = table(supply(["S01", "O40"], [], []));
    expect(colourSamplesSwapOptions(t.view("p1"))).toEqual({
      usable: true,
      discards: [
        { orderId: "S01", lookCount: 0, legal: true },
        { orderId: "O40", lookCount: 1, legal: true },
      ],
      faceUpSlots: [0, 1, 2, 3, 4, 5],
    });
    const opened = t.act("p1", swap("S01"));
    expect(only(opened, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 0, secret: { orderIds: [] } });
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples_swap", select: { ...SELECT_3, lookedCount: 0 } } });
    expect(lookedOrderOptions(t.view("p1"))).toEqual({ kind: "colour_samples_swap", n: 3, orderIds: [], faceUpSlots: [0, 1, 2, 3, 4, 5], maxReservations: 1 });
    const chosen = t.act("p1", takeFaceUp(4, "O05"));
    expect(types(chosen)).toEqual(["ORDER_RESERVED"]);
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O40", "O05"]);
  });

  it("nothing to reserve anywhere: ORDER_SUPPLY_EMPTY for a Starting Order; a Main Order would refill the deck", () => {
    const t = table(supply(["S01", "O40"], [], [], [null, null, null, null, null, null]));
    expect(colourSamplesSwapOptions(t.view("p1"))).toEqual({
      usable: true,
      discards: [
        { orderId: "S01", lookCount: 0, legal: false },
        { orderId: "O40", lookCount: 1, legal: true },
      ],
      faceUpSlots: [],
    });
    const error = t.expectRuleError("p1", swap("S01"), "ORDER_SUPPLY_EMPTY");
    expectDocumentedDetails(error);
    expect(t.player("p1").techs[0]).toMatchObject({ usedThisRound: false });
    // Legal actions list only the workable discard.
    expect(legalActions(t.view("p1"), { mode: "canonical" }).filter((action) => action.type === "USE_COLOUR_SAMPLES_SWAP")).toEqual([swap("O40")]);
  });
});

describe("refusals", () => {
  it("TECH_NOT_OWNED, ORDER_NOT_HELD, NOT_YOUR_DECISION and WRONG_PHASE, each with documented details", () => {
    expectDocumentedDetails(table({ players: [{ hand: ["O40"] }, {}] }).expectRuleError("p1", swap("O40"), "TECH_NOT_OWNED"));
    const t = table(OWNER);
    const notHeld = t.expectRuleError("p1", swap("O41"), "ORDER_NOT_HELD");
    expect(notHeld.details).toEqual({ orderId: "O41" });
    expectDocumentedDetails(notHeld);
    // A face-up Order is not held either.
    expectDocumentedDetails(t.expectRuleError("p1", swap("O01"), "ORDER_NOT_HELD"));
    expectDocumentedDetails(t.expectRuleError("p2", swap("O40"), "NOT_YOUR_DECISION"));
    expectDocumentedDetails(t.expectRuleError("p1", choose("O07"), "WRONG_PHASE"));
    // Not inside another worker action's sub-step.
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1" });
    expectDocumentedDetails(t.expectRuleError("p1", swap("O40"), "WRONG_PHASE"));
  });

  it("a looked pick must be one of the looked cards, a face-up pick an Order showing at that position; exactly 1", () => {
    const t = table(OWNER);
    t.act("p1", swap("O40"));
    const look = t.state.hidden.pendingLook?.kind === "colour_samples_swap" ? t.state.hidden.pendingLook.orderIds : [];
    const outside = t.state.hidden.mainDeck[0] as OrderId;
    for (const orderId of [outside, "O01", "O40"] as OrderId[]) {
      expectDocumentedDetails(t.expectRuleError("p1", choose(orderId), "INVALID_CHOICE"));
    }
    expectDocumentedDetails(t.expectRuleError("p1", takeFaceUp(0, "O02"), "ORDER_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", { type: "SELECT_CHOOSE", reservations: [] }, "RESERVATION_REQUIRED"));
    const limit = t.expectRuleError(
      "p1",
      { type: "SELECT_CHOOSE", reservations: [{ kind: "looked", orderId: look[0] as OrderId }, { kind: "face_up", slotIndex: 0, orderId: "O01" }] },
      "RESERVATION_LIMIT",
    );
    expect(limit.details).toEqual({ limit: 1, requested: 2 });
    expectDocumentedDetails(limit);
    expectDocumentedDetails(t.expectRuleError("p2", choose(outside), "NOT_YOUR_DECISION"));
  });
});

describe("legal actions and selectors", () => {
  it("one swap per held Order in hand order, then one choice per face-up Order and per looked card", () => {
    const t = table(OWNER);
    const swaps = legalActions(t.view("p1"), { mode: "canonical" }).filter((action) => action.type === "USE_COLOUR_SAMPLES_SWAP");
    expect(swaps).toEqual([swap("O40"), swap("S01")]);
    expect(colourSamplesSwapOptions(t.view("p1"))).toEqual({
      usable: true,
      discards: [
        { orderId: "O40", lookCount: 3, legal: true },
        { orderId: "S01", lookCount: 3, legal: true },
      ],
      faceUpSlots: [0, 1, 2, 3, 4, 5],
    });
    expect(colourSamplesSwapOptions(t.view("p2"))).toEqual({ usable: false, discards: [], faceUpSlots: [] });
    t.act("p1", swap("S01"));
    const look = t.state.hidden.pendingLook?.kind === "colour_samples_swap" ? t.state.hidden.pendingLook.orderIds : [];
    expect(lookedOrderOptions(t.view("p1"))).toEqual({ kind: "colour_samples_swap", n: 3, orderIds: look, faceUpSlots: [0, 1, 2, 3, 4, 5], maxReservations: 1 });
    const display = t.state.market.display as OrderId[];
    expect(legalActions(t.view("p1"), { mode: "exhaustive" })).toEqual([
      ...display.map((orderId, slotIndex) => takeFaceUp(slotIndex, orderId)),
      ...look.map((orderId) => choose(orderId)),
    ]);
    expect(legalActions(t.view("p2"), { mode: "exhaustive" })).toEqual([]);
  });
});

describe("hidden information (B3)", () => {
  it("the discarded Order, the looked cards, the reservation and the cards put on the bottom reach only the actor", () => {
    const t = table(OWNER);
    const look = t.state.hidden.mainDeck.slice(0, 3) as [OrderId, OrderId, OrderId];
    t.act("p1", swap("O40"));
    expect(t.view(null).game.counts.pendingLook).toEqual({ playerId: "p1", kind: "colour_samples_swap", count: 3 });
    expect(t.view("p2").own?.pendingLook).toBeNull();
    t.act("p1", choose(look[1]));
    const secretIds: OrderId[] = ["O40", ...look];
    const publicLog = JSON.stringify(t.events.map(projectEvent));
    const publicState = JSON.stringify(projectPublicState(t.state));
    for (const id of secretIds) {
      expect(publicLog).not.toContain(`"${id}"`);
      expect(publicState).not.toContain(`"${id}"`);
    }
    // Where the held Order went is public (it changes the discard count), as at the table.
    expect(t.events.map(projectEvent).find((event) => event.type === "HELD_ORDER_DISCARDED")).toEqual({
      type: "HELD_ORDER_DISCARDED",
      playerId: "p1",
      cause: "colour_samples_swap",
      to: "main_discard",
    });
    expect(t.events.map(projectEvent).find((event) => event.type === "LOOKED_ORDERS_TO_BOTTOM")).toEqual({ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 2 });
    expect(projectPublicState(t.state).counts).toMatchObject({ mainDiscard: 1, pendingLook: null, orderHands: { p1: 2, p2: 0 } });
    expect(t.view("p2").own?.orderHand).toEqual([]);
    expect(t.view("p1").own?.orderHand).toEqual(["S01", look[1]]);
  });

  it("a face-up reservation is public, while the 3 looked cards stay private", () => {
    const t = table(OWNER);
    const look = t.state.hidden.mainDeck.slice(0, 3) as OrderId[];
    t.act("p1", swap("O40"));
    t.act("p1", takeFaceUp(1, "O02"));
    const publicLog = t.events.map(projectEvent);
    expect(publicLog.find((event) => event.type === "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "colour_samples_swap",
      source: "face_up",
      slotIndex: 1,
      orderId: "O02",
    });
    const text = JSON.stringify(publicLog) + JSON.stringify(projectPublicState(t.state)) + JSON.stringify(t.view("p2"));
    for (const id of look) expect(text).not.toContain(`"${id}"`);
  });
});
