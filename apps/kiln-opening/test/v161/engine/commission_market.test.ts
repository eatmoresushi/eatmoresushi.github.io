/**
 * Commission Market (v1.6.2 L64, L195–206, L395, L401, L615, L649; changes 24–25; R4, R12, B1,
 * B3; DESIGN §3.2 as amended by ENGINE_V1.6.2_DELTA.md §4.2): the placement always opens the
 * Select (Select 2 for the Apprentice effect, Select 3 reserving up to 2 for the Shifu effect),
 * then `SELECT_CHOOSE` reserves 1 (Apprentice) or 1–2 (Shifu) from the display and the looked
 * cards in any mix; the rest of the look goes face down to the bottom of the Main deck in random
 * order (rulebook change 24, L34; owner ruling R19), never to the discard; no resource; the
 * single deferred refill at the end of the turn; Senior Apprentice; the empty-supply rules (B1);
 * privacy (B3).
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { legalActions } from "../../../src/game/legalActions.ts";
import { lookedOrderOptions } from "../../../src/game/selectors.ts";
import { projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type { SelectPick, GameAction, GameEvent, OrderId } from "../../../src/game/types.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function table(spec: StateSpec = {}, seed?: number): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"], ...(seed === undefined ? {} : { seed }) });
}

/** The IDs sorted, to compare the cards a deck holds without their order. */
function sorted(ids: readonly OrderId[]): OrderId[] {
  return [...ids].sort();
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function only<T extends GameEvent["type"]>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> {
  const found = events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  expect(found, `exactly one ${type}`).toHaveLength(1);
  return found[0] as Extract<GameEvent, { type: T }>;
}

function place(workerId: string, seniorApprentice?: boolean): GameAction {
  return { type: "PLACE_COMMISSION_MARKET", workerId, ...(seniorApprentice === undefined ? {} : { seniorApprentice }) };
}

function choose(...reservations: SelectPick[]): GameAction {
  return { type: "SELECT_CHOOSE", reservations };
}

const faceUp = (slotIndex: number, orderId: OrderId): SelectPick => ({ kind: "face_up", slotIndex, orderId });
const looked = (orderId: OrderId): SelectPick => ({ kind: "looked", orderId });

function commissionStep(t: LocalTable) {
  const phase = t.state.phase;
  if (phase.type !== "work_turn" || phase.step.kind !== "commission_market") {
    throw new Error(`expected the Commission Market step, found ${JSON.stringify(phase)}`);
  }
  return phase.step;
}

function lookOf(t: LocalTable): OrderId[] {
  const look = t.state.hidden.pendingLook;
  if (look === null || look.kind !== "commission_market") {
    throw new Error(`expected a Commission look, found ${JSON.stringify(look)}`);
  }
  return look.orderIds;
}

/** Every Main Order outside `keep`, so a spec can pin the deck and discard (B1). */
function allMainOrdersExcept(keep: readonly (OrderId | null)[]): OrderId[] {
  return MAIN_ORDER_IDS.filter((id) => !keep.includes(id));
}

/** A spec whose Main deck and discard are pinned; every other Main Order is in p2's hand. */
function supplySpec(display: Array<OrderId | null>, mainDeck: OrderId[], mainDiscard: OrderId[], p1: StateSpec["players"] = undefined): StateSpec {
  const first = Array.isArray(p1) ? (p1[0] ?? {}) : {};
  return {
    players: [first, { hand: allMainOrdersExcept([...display, ...mainDeck, ...mainDiscard]) }],
    display,
    mainDeck,
    mainDiscard,
  };
}

const DISPLAY: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];

describe("the placement opens the private look (v1.6.2 L195–196; INT: Commission Market looks)", () => {
  it("Apprentice effect: Select 2, the top 2 Main Orders privately; no resource; the step waits for SELECT_CHOOSE", () => {
    const t = table();
    const [a, b, next] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    const deckBefore = t.state.hidden.mainDeck.length;
    const events = t.act("p1", place("p1:apprentice:1"));

    expect(types(events)).toEqual(["WORKER_PLACED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "PRIVATE_LOOK_OPENED")).toEqual({
      type: "PRIVATE_LOOK_OPENED",
      playerId: "p1",
      kind: "commission_market",
      discipline: null,
      count: 2,
      secret: { visibleTo: "p1", orderIds: [a, b], techIds: [] },
    });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "commission_market", playerId: "p1", orderIds: [a, b] });
    expect(t.state.hidden.mainDeck).toHaveLength(deckBefore - 2);
    expect(t.state.hidden.mainDeck[0]).toBe(next);
    expect(commissionStep(t)).toEqual({
      kind: "commission_market",
      workerId: "p1:apprentice:1",
      effect: "apprentice",
      select: { n: 2, maxReservations: 1, fromDisplay: true, lookedCount: 2 },
    });
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 3, coins: 3 });
    expect(t.state.market.display).toEqual(DISPLAY);
    // Nothing else may happen until the reservation is made.
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    t.expectRuleError("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:shifu" }, "WORKER_ACTION_ALREADY_TAKEN");
  });

  it("Shifu effect: Select 3, reserving up to 2", () => {
    const t = table();
    const top = t.state.hidden.mainDeck.slice(0, 3);
    const events = t.act("p1", place("p1:shifu"));
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ kind: "commission_market", count: 3, secret: { orderIds: top } });
    expect(commissionStep(t)).toMatchObject({ effect: "shifu", select: { n: 3, maxReservations: 2, fromDisplay: true, lookedCount: 3 } });
  });

  it("the look happens even when the actor will reserve a face-up Order", () => {
    const t = table();
    const top = t.state.hidden.mainDeck.slice(0, 2);
    t.act("p1", place("p1:apprentice:1"));
    const events = t.act("p1", choose(faceUp(0, "O01")));
    // Both looked cards go face down to the bottom of the deck (change 24), in random order
    // (R19); the secret names them in look order.
    expect(only(events, "LOOKED_ORDERS_TO_BOTTOM")).toEqual({
      type: "LOOKED_ORDERS_TO_BOTTOM",
      playerId: "p1",
      count: 2,
      secret: { visibleTo: "p1", orderIds: top },
    });
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted(top));
    expect(t.state.hidden.mainDiscard).toEqual([]);
  });
});

describe("Apprentice effect (v1.6.2 L195): reserve 1 from the display or the 2 looked cards", () => {
  it("a face-up reservation: the position stays empty until the turn ends, then one refill (v1.6.2 L191)", () => {
    const t = table();
    const top = t.state.hidden.mainDeck.slice(0, 2) as [OrderId, OrderId];
    const refillCard = t.state.hidden.mainDeck[2];
    t.act("p1", place("p1:apprentice:1"));
    const events = t.act("p1", choose(faceUp(2, "O03")));

    expect(t.state.hidden.orderHands["p1"]).toEqual(["O03"]);
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 3, coins: 3 });
    expect(types(events)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "commission_market",
      source: "face_up",
      slotIndex: 2,
      orderId: "O03",
    });
    // The refill comes from the deck after the look took its 2 cards.
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: [refillCard] });
    expect(t.state.market.display).toEqual(["O01", "O02", "O04", "O05", "O06", refillCard]);
    expect(t.state.market.refillPendingFor).toBeNull();
    // The 2 looked cards went to the bottom (in random order, R19) before the refill drew from the top.
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted(top));
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
  });

  it("a looked reservation: secret, the other card face down to the deck bottom, no refill", () => {
    const t = table();
    const [a, b] = t.state.hidden.mainDeck as [OrderId, OrderId];
    const deckBefore = t.state.hidden.mainDeck.length;
    t.act("p1", place("p1:apprentice:1"));
    const events = t.act("p1", choose(looked(b)));

    expect(t.state.hidden.orderHands["p1"]).toEqual([b]);
    expect(t.state.hidden.mainDeck.at(-1)).toBe(a);
    expect(t.state.hidden.mainDeck).toHaveLength(deckBefore - 1);
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.state.hidden.pendingLook).toBeNull();
    expect(types(events)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "LOOKED_ORDERS_TO_BOTTOM")).toEqual({ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 1, secret: { visibleTo: "p1", orderIds: [a] } });
    const reserved = only(events, "ORDER_RESERVED");
    expect(reserved).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "commission_market",
      source: "looked",
      slotIndex: null,
      orderId: null,
      secret: { visibleTo: "p1", orderId: b },
    });
    expect(projectEvent(reserved)).not.toHaveProperty("secret");
    expect(t.state.market.display).toEqual(DISPLAY);
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 3, coins: 3 });
  });

  it("must reserve exactly 1: 0 is RESERVATION_REQUIRED, 2 is RESERVATION_LIMIT", () => {
    const t = table();
    const [a, b] = t.state.hidden.mainDeck as [OrderId, OrderId];
    t.act("p1", place("p1:apprentice:1"));
    const none = t.expectRuleError("p1", choose(), "RESERVATION_REQUIRED");
    expectDocumentedDetails(none);
    const two = t.expectRuleError("p1", choose(looked(a), looked(b)), "RESERVATION_LIMIT");
    expect(two.details).toEqual({ limit: 1, requested: 2 });
    expectDocumentedDetails(two);
    expectDocumentedDetails(t.expectRuleError("p1", choose(faceUp(0, "O01"), looked(a)), "RESERVATION_LIMIT"));
    t.act("p1", choose(looked(a)));
    expect(t.state.hidden.orderHands["p1"]).toEqual([a]);
  });
});

describe("Shifu effect (v1.6.2 L196, L198): reserve 1–2 from the display and the 3 looked cards", () => {
  it("two face-up reservations choose from the Orders showing now; one refill after the turn (L390)", () => {
    const t = table();
    const top = t.state.hidden.mainDeck.slice(0, 5);
    t.act("p1", place("p1:shifu"));
    const events = t.act("p1", choose(faceUp(0, "O01"), faceUp(3, "O04")));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O01", "O04"]);
    expect(types(events)).toEqual([
      "ORDER_RESERVED",
      "ORDER_RESERVED",
      "LOOKED_ORDERS_TO_BOTTOM",
      "DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(events, "LOOKED_ORDERS_TO_BOTTOM").count).toBe(3);
    expect(sorted(t.state.hidden.mainDeck.slice(-3))).toEqual(sorted(top.slice(0, 3)));
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: [top[3], top[4]] });
    expect(t.state.market.display).toEqual(["O02", "O03", "O05", "O06", top[3], top[4]]);
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 3, coins: 3 });
  });

  it("two looked reservations: the third card goes to the deck bottom, the display is untouched", () => {
    const t = table();
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    t.act("p1", place("p1:shifu"));
    const events = t.act("p1", choose(looked(c), looked(a)));
    expect(t.state.hidden.orderHands["p1"]).toEqual([c, a]);
    expect(t.state.hidden.mainDeck.at(-1)).toBe(b);
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(types(events)).toEqual(["ORDER_RESERVED", "ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "LOOKED_ORDERS_TO_BOTTOM").secret.orderIds).toEqual([b]);
    expect(t.state.market.display).toEqual(DISPLAY);
  });

  it("one face-up and one looked reservation, in the order given", () => {
    const t = table();
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    t.act("p1", place("p1:shifu"));
    const events = t.act("p1", choose(looked(b), faceUp(5, "O06")));
    expect(t.state.hidden.orderHands["p1"]).toEqual([b, "O06"]);
    expect(events.filter((e) => e.type === "ORDER_RESERVED").map((e) => (e as { source: string }).source)).toEqual(["looked", "face_up"]);
    // The unreserved looked cards go to the deck bottom, in random order (R19).
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted([a, c]));
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.state.market.display.slice(0, 5)).toEqual(["O01", "O02", "O03", "O04", "O05"]);
  });

  it("may stop at 1 reservation (at least 1, up to 2)", () => {
    const t = table();
    const top = t.state.hidden.mainDeck.slice(0, 3);
    t.act("p1", place("p1:shifu"));
    expectDocumentedDetails(t.expectRuleError("p1", choose(), "RESERVATION_REQUIRED"));
    const three = t.expectRuleError("p1", choose(faceUp(0, "O01"), faceUp(1, "O02"), faceUp(2, "O03")), "RESERVATION_LIMIT");
    expect(three.details).toEqual({ limit: 2, requested: 3 });
    t.act("p1", choose(faceUp(1, "O02")));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O02"]);
    expect(sorted(t.state.hidden.mainDeck.slice(-3))).toEqual(sorted(top));
    expect(t.state.hidden.mainDiscard).toEqual([]);
  });
});

describe("SELECT_CHOOSE refusals at the Commission Market", () => {
  it("a stale face-up pick is ORDER_NOT_AVAILABLE; a card outside the look or a duplicate is INVALID_CHOICE", () => {
    const t = table({ display: ["O01", null, "O03", "O04", "O05", "O06"], refillPendingFor: null });
    const top = t.state.hidden.mainDeck.slice(0, 3) as [OrderId, OrderId, OrderId];
    const outside = t.state.hidden.mainDeck[3] as OrderId;
    t.act("p1", place("p1:shifu"));
    for (const pick of [faceUp(0, "O02"), faceUp(1, "O02"), faceUp(6, "O01"), faceUp(40, "O01")]) {
      const error = t.expectRuleError("p1", choose(pick), "ORDER_NOT_AVAILABLE");
      expectDocumentedDetails(error);
    }
    const notLooked = t.expectRuleError("p1", choose(looked(outside)), "INVALID_CHOICE");
    expect(notLooked.details).toMatchObject({ choice: "looked", orderId: outside });
    expectDocumentedDetails(notLooked);
    // A face-up Order is not a looked card.
    expectDocumentedDetails(t.expectRuleError("p1", choose(looked("O01")), "INVALID_CHOICE"));
    const twiceSlot = t.expectRuleError("p1", choose(faceUp(0, "O01"), faceUp(0, "O01")), "INVALID_CHOICE");
    expect(twiceSlot.details).toMatchObject({ slotIndex: 0 });
    expectDocumentedDetails(twiceSlot);
    expectDocumentedDetails(t.expectRuleError("p1", choose(looked(top[0]), looked(top[0])), "INVALID_CHOICE"));
    t.act("p1", choose(looked(top[2]), faceUp(0, "O01")));
  });

  it("is due only in the actor's own Commission step", () => {
    const t = table();
    expectDocumentedDetails(t.expectRuleError("p1", choose(faceUp(0, "O01")), "WRONG_PHASE"));
    t.act("p1", place("p1:apprentice:1"));
    expectDocumentedDetails(t.expectRuleError("p2", choose(faceUp(0, "O01")), "NOT_YOUR_DECISION"));
  });
});

describe("Senior Apprentice at the Commission Market (v1.6.2 L618, L652, R12)", () => {
  it("an Apprentice resolves the whole Shifu effect: the top-3 look and up to 2 reservations", () => {
    const t = table({ players: [{ techs: ["T18"] }, {}] });
    const top = t.state.hidden.mainDeck.slice(0, 3) as [OrderId, OrderId, OrderId];
    const events = t.act("p1", place("p1:apprentice:1", true));
    expect(types(events)).toEqual(["WORKER_PLACED", "TECH_USED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "WORKER_PLACED")).toMatchObject({ kind: "apprentice", effect: "shifu", viaSeniorApprentice: true });
    expect(only(events, "PRIVATE_LOOK_OPENED").count).toBe(3);
    expect(commissionStep(t)).toMatchObject({ workerId: "p1:apprentice:1", effect: "shifu", select: { n: 3, maxReservations: 2 } });
    t.act("p1", choose(looked(top[1]), faceUp(0, "O01")));
    expect(t.state.hidden.orderHands["p1"]).toEqual([top[1], "O01"]);
    expect(t.player("p1").techs).toEqual([{ id: "T18", acquiredInRound: 1, usedThisRound: true }]);
  });

  it("is once per round, Apprentice only, and must be owned; declining keeps it (R4)", () => {
    const used = table({ players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}] });
    expectDocumentedDetails(used.expectRuleError("p1", place("p1:apprentice:1", true), "TECH_ALREADY_USED"));
    const unowned = table();
    expectDocumentedDetails(unowned.expectRuleError("p1", place("p1:apprentice:1", true), "TECH_NOT_OWNED"));
    const shifu = table({ players: [{ techs: ["T18"] }, {}] });
    expectDocumentedDetails(shifu.expectRuleError("p1", place("p1:shifu", true), "SENIOR_APPRENTICE_NOT_APPLICABLE"));
    const declined = table({ players: [{ techs: ["T18"] }, {}] });
    declined.act("p1", place("p1:apprentice:1"));
    expect(commissionStep(declined)).toMatchObject({ effect: "apprentice", select: { n: 2, maxReservations: 1 } });
    expect(declined.player("p1").techs[0]).toMatchObject({ usedThisRound: false });
  });
});

describe("Empty Main supply (B1, L511)", () => {
  it("with the deck and discard both empty: a 0-card look, only face-up Orders, the gap stays empty", () => {
    const t = table(supplySpec(DISPLAY, [], []));
    const events = t.act("p1", place("p1:shifu"));
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 0, secret: { orderIds: [] } });
    expect(types(events)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(commissionStep(t).select.lookedCount).toBe(0);
    const reserved = t.act("p1", choose(faceUp(1, "O02")));
    expect(types(reserved)).not.toContain("LOOKED_ORDERS_TO_BOTTOM");
    expect(only(reserved, "DISPLAY_REFILLED")).toMatchObject({ revealedOrderIds: [] });
    expect(t.state.market.display).toEqual(["O01", "O03", "O04", "O05", "O06", null]);
  });

  it("a deck of 1 shows 1 card, without reshuffling the discard to complete the look", () => {
    const t = table(supplySpec(DISPLAY, ["O07"], ["O08", "O09", "O10", "O11", "O12"]));
    const events = t.act("p1", place("p1:shifu"));
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 1, secret: { orderIds: ["O07"] } });
    expect(types(events)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(t.state.hidden.mainDiscard).toEqual(["O08", "O09", "O10", "O11", "O12"]);
    expect(commissionStep(t)).toMatchObject({ select: { n: 3, lookedCount: 1 } });
    t.act("p1", choose(looked("O07")));
  });

  it("a looked card not reserved from a 1-card deck goes back as the whole deck (change 24, B1)", () => {
    const t = table(supplySpec(DISPLAY, ["O07"], ["O08", "O09"]));
    t.act("p1", place("p1:apprentice:1"));
    expect(t.state.hidden.mainDeck).toEqual([]);
    const events = t.act("p1", choose(faceUp(0, "O01")));
    expect(only(events, "LOOKED_ORDERS_TO_BOTTOM").secret.orderIds).toEqual(["O07"]);
    // The end-of-turn refill draws it straight back onto the display; the discard is untouched.
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ revealedOrderIds: ["O07"] });
    expect(types(events)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(t.state.hidden.mainDiscard).toEqual(["O08", "O09"]);
  });

  it("a look never empties the deck by itself: a Shifu look of the last 3 puts the unreserved back (change 24)", () => {
    const t = table(supplySpec(DISPLAY, ["O07", "O08", "O09"], ["O10"]));
    t.act("p1", place("p1:shifu"));
    expect(lookOf(t)).toEqual(["O07", "O08", "O09"]);
    t.act("p1", choose(looked("O08")));
    expect(sorted(t.state.hidden.mainDeck)).toEqual(["O07", "O09"]);
    // p2's look sees the same cards again, in the order they went under, without a reshuffle.
    const deck = [...t.state.hidden.mainDeck];
    const next = t.act("p2", place("p2:apprentice:1"));
    expect(types(next)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(only(next, "PRIVATE_LOOK_OPENED").secret.orderIds).toEqual(deck);
    expect(t.state.hidden.mainDiscard).toEqual(["O10"]);
  });

  it("R19: several unreserved looked cards go under the deck in random order; the looker's secret lists them in look order", () => {
    const bottoms = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const t = table(supplySpec(DISPLAY, ["O07", "O08", "O09", "O11"], ["O10"]), seed);
      t.act("p1", place("p1:shifu"));
      expect(lookOf(t)).toEqual(["O07", "O08", "O09"]);
      const events = t.act("p1", choose(faceUp(0, "O01")));
      // All 3 go back: the turn-end refill draws O11, the one card that was below them.
      expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ revealedOrderIds: ["O11"] });
      expect(only(events, "LOOKED_ORDERS_TO_BOTTOM").secret.orderIds).toEqual(["O07", "O08", "O09"]);
      expect(sorted(t.state.hidden.mainDeck)).toEqual(["O07", "O08", "O09"]);
      bottoms.add(t.state.hidden.mainDeck.join(" "));
    }
    // Every one of the 6 orders turns up over the seeds, not only the order of the look.
    expect(bottoms.size).toBe(6);
  });

  it("an empty deck is replaced by the shuffled discard when the look starts (L511)", () => {
    const t = table(supplySpec(DISPLAY, [], ["O07", "O08", "O09", "O10"]));
    const events = t.act("p1", place("p1:apprentice:1"));
    expect(types(events)).toEqual(["WORKER_PLACED", "MAIN_DECK_RESHUFFLED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "MAIN_DECK_RESHUFFLED").cardCount).toBe(4);
    const look = lookOf(t);
    expect(look).toHaveLength(2);
    expect(look.every((id) => ["O07", "O08", "O09", "O10"].includes(id))).toBe(true);
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.state.hidden.mainDeck).toHaveLength(2);
  });

  it("an empty display leaves only the looked cards to choose from", () => {
    const empty: Array<OrderId | null> = [null, null, null, null, null, null];
    const t = table(supplySpec(empty, ["O07", "O08"], []));
    t.act("p1", place("p1:shifu"));
    expect(lookedOrderOptions(t.view("p1"))).toEqual({ kind: "commission_market", n: 3, orderIds: ["O07", "O08"], faceUpSlots: [], maxReservations: 2 });
    const events = t.act("p1", choose(looked("O08"), looked("O07")));
    expect(types(events)).not.toContain("LOOKED_ORDERS_TO_BOTTOM");
    expect(types(events)).not.toContain("DISPLAY_REFILLED");
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O08", "O07"]);
  });
});

describe("legal actions in the Commission step (DESIGN §5.2)", () => {
  it("the Apprentice effect enumerates every single pick: face-up slots, then looked cards", () => {
    const t = table();
    const [a, b] = t.state.hidden.mainDeck as [OrderId, OrderId];
    t.act("p1", place("p1:apprentice:1"));
    const actions = legalActions(t.view("p1"), { mode: "canonical" });
    expect(actions).toEqual([
      ...DISPLAY.map((orderId, slotIndex) => choose(faceUp(slotIndex, orderId))),
      choose(looked(a)),
      choose(looked(b)),
    ]);
  });

  it("the Shifu effect adds every unordered pair (≤ 9 + 36)", () => {
    const t = table();
    t.act("p1", place("p1:shifu"));
    const actions = legalActions(t.view("p1"), { mode: "exhaustive" });
    expect(actions).toHaveLength(9 + 36);
    expect(actions.every((action) => action.type === "SELECT_CHOOSE")).toBe(true);
    expect(actions.filter((action) => action.type === "SELECT_CHOOSE" && action.reservations.length === 2)).toHaveLength(36);
  });

  it("other seats have no Commission action and never see the look", () => {
    const t = table();
    t.act("p1", place("p1:shifu"));
    expect(legalActions(t.view("p2"), { mode: "canonical" })).toEqual([]);
    expect(lookedOrderOptions(t.view("p2"))).toBeNull();
  });
});

describe("hidden information (B3)", () => {
  it("the look and the looked reservations reach only the actor; the public sees counts and face-up IDs", () => {
    const t = table();
    const deckBefore = t.view(null).game.counts.mainDeck;
    t.act("p1", place("p1:shifu"));
    const look = lookOf(t);
    expect(t.view(null).game.counts.pendingLook).toEqual({ playerId: "p1", kind: "commission_market", count: 3 });
    // The deck count is public: the look holds 3 cards out of it.
    expect(t.view(null).game.counts.mainDeck).toBe(deckBefore - 3);
    expect(t.view("p2").own?.pendingLook).toBeNull();
    expect(t.view("p1").own?.pendingLook).toEqual({ kind: "commission_market", playerId: "p1", orderIds: look });
    let publicState = JSON.stringify(projectPublicState(t.state));
    for (const id of look) expect(publicState).not.toContain(`"${id}"`);

    t.act("p1", choose(looked(look[2] as OrderId), faceUp(4, "O05")));
    const hand = t.state.hidden.orderHands["p1"] ?? [];
    expect(hand).toEqual([look[2], "O05"]);
    const publicLog = JSON.stringify(t.events.map(projectEvent));
    publicState = JSON.stringify(projectPublicState(t.state));
    for (const id of look) {
      expect(publicLog).not.toContain(`"${id}"`);
      expect(publicState).not.toContain(`"${id}"`);
    }
    // The face-up Order was already public.
    expect(publicLog).toContain('"O05"');
    // The 2 unreserved cards went to the deck bottom (change 24): only the deck count shows them.
    // Public count: −3 for the look, +2 back under the deck, −1 for the end-of-turn refill.
    expect(t.view(null).game.counts).toMatchObject({ pendingLook: null, mainDiscard: 0, mainDeck: deckBefore - 2 });
    expect(sorted(t.state.hidden.mainDeck.slice(-2))).toEqual(sorted(look.filter((id) => id !== look[2])));
    const toBottom = t.events.filter((event) => event.type === "LOOKED_ORDERS_TO_BOTTOM");
    expect(toBottom.map(projectEvent)).toEqual([{ type: "LOOKED_ORDERS_TO_BOTTOM", playerId: "p1", count: 2 }]);
    expect(t.view(null).game.counts.orderHands["p1"]).toBe(2);
    expect(t.view("p2").own?.orderHand).toEqual([]);
    expect(t.view("p1").own?.orderHand).toEqual(hand);
  });
});
