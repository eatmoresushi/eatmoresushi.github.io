/**
 * Commission Market (L186–200, L390, L396, L619, L653, R4, R12, B1, B3; DESIGN §3.2):
 * Apprentice and Shifu effects, the resource after each reservation, the Shifu's optional
 * private top-3 selection, stopping after the first reservation, the second reservation
 * choosing from the Orders still showing, the single deferred refill at the end of the turn,
 * Senior Apprentice, and the empty-supply rules.
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { projectEvent, projectPublicState } from "../../../src/game/view.ts";
import type { GameAction, GameEvent, OrderId } from "../../../src/game/types.ts";
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

function place(workerId: string, first: Extract<GameAction, { type: "PLACE_COMMISSION_MARKET" }>["first"], seniorApprentice?: boolean): GameAction {
  return {
    type: "PLACE_COMMISSION_MARKET",
    workerId,
    first,
    ...(seniorApprentice === undefined ? {} : { seniorApprentice }),
  };
}

function commissionStep(t: LocalTable) {
  const phase = t.state.phase;
  if (phase.type !== "work_turn" || phase.step.kind !== "commission_market") {
    throw new Error(`expected the Commission Market step, found ${JSON.stringify(phase)}`);
  }
  return phase.step;
}

/** Every Main Order outside `keep`, so a spec can pin the deck and discard empty (B1). */
function allMainOrdersExcept(keep: readonly (OrderId | null)[]): OrderId[] {
  return MAIN_ORDER_IDS.filter((id) => !keep.includes(id));
}

const DISPLAY: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];

describe("Apprentice effect (L195): reserve 1 Main Order, then gain 1 Clay, Wood or Coin", () => {
  it("a face-up reservation and its resource resolve in one command; the position stays empty until the turn ends (L190)", () => {
    const t = table();
    const events = t.act("p1", place("p1:apprentice:1", { kind: "face_up", slotIndex: 2, orderId: "O03", gain: "wood" }));

    expect(t.state.hidden.orderHands["p1"]).toEqual(["O03"]);
    expect(t.player("p1").resources).toEqual({ clay: 2, wood: 3, coins: 3 });
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "ORDER_RESERVED",
      "RESOURCES_CHANGED",
      "DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(events, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "commission_market",
      source: "face_up",
      slotIndex: 2,
      orderId: "O03",
    });
    expect(only(events, "RESOURCES_CHANGED")).toMatchObject({ clay: 0, wood: 1, coins: 0, reason: "commission_market" });
    // Deferred refill at the end of the turn: compact left, reveal into the rightmost position.
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: ["O07"] });
    expect(t.state.market.display).toEqual(["O01", "O02", "O04", "O05", "O06", "O07"]);
    expect(t.state.market.refillPendingFor).toBeNull();
    expect(only(events, "WORK_TURN_ENDED")).toEqual({ type: "WORK_TURN_ENDED", playerId: "p1", automatic: true });
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p2", step: { kind: "before_action" } });
  });

  it("a blind reservation takes the deck top unseen; the resource is chosen afterwards (COMMISSION_GAIN)", () => {
    const t = table();
    const deckTop = t.state.hidden.mainDeck[0];
    const events = t.act("p1", place("p1:apprentice:1", { kind: "blind" }));

    expect(t.state.hidden.orderHands["p1"]).toEqual([deckTop]);
    expect(t.state.market.display).toEqual(DISPLAY);
    expect(t.state.market.refillPendingFor).toBeNull();
    expect(commissionStep(t)).toEqual({
      kind: "commission_market",
      workerId: "p1:apprentice:1",
      effect: "apprentice",
      maxReservations: 1,
      reservationsMade: 1,
      topThreeAvailable: false,
      awaiting: "resource",
    });
    const reserved = only(events, "ORDER_RESERVED");
    expect(reserved).toMatchObject({ source: "blind", slotIndex: null, orderId: null, secret: { visibleTo: "p1", orderId: deckTop } });
    expect(projectEvent(reserved)).not.toHaveProperty("secret");

    const gainEvents = t.act("p1", { type: "COMMISSION_GAIN", resource: "coins" });
    expect(t.player("p1").resources.coins).toBe(4);
    // The display did not change, so nothing is refilled.
    expect(types(gainEvents)).toEqual(["RESOURCES_CHANGED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(t.state.market.display).toEqual(DISPLAY);
  });

  it("the Apprentice effect offers no top-3 selection and no second reservation", () => {
    const t = table();
    const error = t.expectRuleError("p1", place("p1:apprentice:1", { kind: "look_top_three" }), "INVALID_CHOICE");
    expectDocumentedDetails(error);

    t.act("p1", place("p1:apprentice:1", { kind: "blind" }));
    t.expectRuleError("p1", { type: "COMMISSION_RESERVE", choice: { kind: "blind" } }, "WRONG_PHASE");
    t.expectRuleError("p1", { type: "COMMISSION_STOP" }, "WRONG_PHASE");
    t.act("p1", { type: "COMMISSION_GAIN", resource: "clay" });
    expect(t.state.hidden.orderHands["p1"]).toHaveLength(1);
  });
});

describe("Shifu effect (L196, L198): up to 2 separate reservations with a resource after each", () => {
  it("the second reservation chooses from the Orders still showing; one refill after the turn (L390)", () => {
    const t = table();
    t.act("p1", place("p1:shifu", { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "clay" }));
    expect(commissionStep(t)).toMatchObject({ effect: "shifu", maxReservations: 2, reservationsMade: 1, awaiting: "reservation" });
    expect(t.state.market.display).toEqual([null, "O02", "O03", "O04", "O05", "O06"]);
    expect(t.state.market.refillPendingFor).toBe("p1");

    // The taken position stays empty until the turn ends.
    const gone = t.expectRuleError(
      "p1",
      { type: "COMMISSION_RESERVE", choice: { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "wood" } },
      "ORDER_NOT_AVAILABLE",
    );
    expectDocumentedDetails(gone);
    t.expectRuleError("p1", { type: "COMMISSION_GAIN", resource: "wood" }, "WRONG_PHASE");
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");

    const events = t.act("p1", {
      type: "COMMISSION_RESERVE",
      choice: { kind: "face_up", slotIndex: 3, orderId: "O04", gain: "coins" },
    });
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O01", "O04"]);
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 2, coins: 4 });
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: ["O07", "O08"] });
    expect(t.state.market.display).toEqual(["O02", "O03", "O05", "O06", "O07", "O08"]);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2", step: { kind: "before_action" } });
  });

  it("the Shifu may stop after the first reservation (L198); stopping is legal only between reservations", () => {
    const t = table();
    t.act("p1", place("p1:shifu", { kind: "blind" }));
    const stopEarly = t.expectRuleError("p1", { type: "COMMISSION_STOP" }, "WRONG_PHASE");
    expectDocumentedDetails(stopEarly);
    t.act("p1", { type: "COMMISSION_GAIN", resource: "wood" });
    expect(commissionStep(t).awaiting).toBe("reservation");

    const events = t.act("p1", { type: "COMMISSION_STOP" });
    expect(types(events)).toEqual(["WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(t.state.hidden.orderHands["p1"]).toHaveLength(1);
    expect(t.player("p1").resources.wood).toBe(3);
  });

  it("the Shifu's private top-3 selection: reserve 1, discard the rest face down, then gain (L196, B3)", () => {
    const t = table();
    const [a, b, c, next] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId, OrderId];
    const deckBefore = t.state.hidden.mainDeck.length;

    const lookEvents = t.act("p1", place("p1:shifu", { kind: "look_top_three" }));
    expect(commissionStep(t)).toMatchObject({ reservationsMade: 0, topThreeAvailable: false, awaiting: "look_choice" });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "commission_top_three", playerId: "p1", orderIds: [a, b, c] });
    expect(t.state.hidden.mainDeck).toHaveLength(deckBefore - 3);
    expect(only(lookEvents, "PRIVATE_LOOK_OPENED")).toEqual({
      type: "PRIVATE_LOOK_OPENED",
      playerId: "p1",
      kind: "commission_top_three",
      discipline: null,
      count: 3,
      secret: { visibleTo: "p1", orderIds: [a, b, c], techIds: [] },
    });

    // Private to the actor (B3): counts in public, identities only in the actor's own view.
    const publicJson = JSON.stringify(projectPublicState(t.state));
    for (const id of [a, b, c]) {
      expect(publicJson).not.toContain(`"${id}"`);
    }
    expect(t.view(null).game.counts.pendingLook).toEqual({ playerId: "p1", kind: "commission_top_three", count: 3 });
    expect(t.view("p2").own?.pendingLook).toBeNull();
    expect(t.view("p1").own?.pendingLook).toEqual({ kind: "commission_top_three", playerId: "p1", orderIds: [a, b, c] });

    const notLooked = t.expectRuleError("p1", { type: "COMMISSION_CHOOSE_LOOKED", orderId: next }, "INVALID_CHOICE");
    expectDocumentedDetails(notLooked);

    const chooseEvents = t.act("p1", { type: "COMMISSION_CHOOSE_LOOKED", orderId: b });
    expect(t.state.hidden.orderHands["p1"]).toEqual([b]);
    expect(t.state.hidden.pendingLook).toBeNull();
    expect([...t.state.hidden.mainDiscard].sort()).toEqual([a, c].sort());
    expect(types(chooseEvents)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_DISCARDED"]);
    expect(only(chooseEvents, "ORDER_RESERVED")).toMatchObject({ source: "top_three", orderId: null, secret: { orderId: b } });
    expect(only(chooseEvents, "LOOKED_ORDERS_DISCARDED")).toEqual({
      type: "LOOKED_ORDERS_DISCARDED",
      playerId: "p1",
      count: 2,
      secret: { visibleTo: "p1", orderIds: [a, c] },
    });
    expect(t.view(null).game.counts.mainDiscard).toBe(2);
    expect(commissionStep(t)).toMatchObject({ reservationsMade: 1, awaiting: "resource" });

    t.act("p1", { type: "COMMISSION_GAIN", resource: "coins" });
    // The top-3 selection replaces only 1 reservation (L196).
    const twice = t.expectRuleError("p1", { type: "COMMISSION_RESERVE", choice: { kind: "look_top_three" } }, "INVALID_CHOICE");
    expectDocumentedDetails(twice);

    t.act("p1", { type: "COMMISSION_RESERVE", choice: { kind: "blind" } });
    expect(t.state.hidden.orderHands["p1"]).toEqual([b, next]);
    t.act("p1", { type: "COMMISSION_GAIN", resource: "clay" });
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 2, coins: 4 });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("the top-3 selection is optional (editorial L714): two blind reservations are legal", () => {
    const t = table();
    t.act("p1", place("p1:shifu", { kind: "blind" }));
    t.act("p1", { type: "COMMISSION_GAIN", resource: "clay" });
    t.act("p1", { type: "COMMISSION_RESERVE", choice: { kind: "blind" } });
    t.act("p1", { type: "COMMISSION_GAIN", resource: "clay" });
    expect(t.state.hidden.orderHands["p1"]).toHaveLength(2);
    expect(t.player("p1").resources.clay).toBe(4);
  });

  it("RESERVATION_LIMIT guards a third reservation", () => {
    const t = table({
      placements: [{ player: "p1", worker: "shifu", locationId: "commission_market" }],
      phase: {
        type: "work_turn",
        activePlayerId: "p1",
        step: {
          kind: "commission_market",
          workerId: "p1:shifu",
          effect: "shifu",
          maxReservations: 2,
          reservationsMade: 2,
          topThreeAvailable: false,
          awaiting: "reservation",
        },
      },
    });
    const error = t.expectRuleError("p1", { type: "COMMISSION_RESERVE", choice: { kind: "blind" } }, "RESERVATION_LIMIT");
    expectDocumentedDetails(error);
  });
});

describe("Senior Apprentice at the Commission Market (L619, L653, R12)", () => {
  it("an Apprentice resolves the whole Shifu effect: 2 reservations, the top-3 selection, a resource after each", () => {
    const t = table({ players: [{ techs: ["T18"] }, {}] });
    const events = t.act("p1", place("p1:apprentice:1", { kind: "blind" }, true));
    expect(types(events).slice(0, 3)).toEqual(["WORKER_PLACED", "TECH_USED", "ORDER_RESERVED"]);
    expect(only(events, "WORKER_PLACED")).toMatchObject({ kind: "apprentice", effect: "shifu", viaSeniorApprentice: true });
    expect(commissionStep(t)).toMatchObject({ effect: "shifu", maxReservations: 2, topThreeAvailable: true });

    t.act("p1", { type: "COMMISSION_GAIN", resource: "wood" });
    t.act("p1", { type: "COMMISSION_RESERVE", choice: { kind: "look_top_three" } });
    const look = t.state.hidden.pendingLook;
    expect(look?.kind).toBe("commission_top_three");
    t.act("p1", { type: "COMMISSION_CHOOSE_LOOKED", orderId: (look as { orderIds: OrderId[] }).orderIds[0] as OrderId });
    t.act("p1", { type: "COMMISSION_GAIN", resource: "wood" });
    expect(t.state.hidden.orderHands["p1"]).toHaveLength(2);
    expect(t.player("p1").resources.wood).toBe(4);
    expect(t.player("p1").techs).toEqual([{ id: "T18", acquiredInRound: 1, usedThisRound: true }]);
  });

  it("Senior Apprentice is once per round, Apprentice only, and must be owned", () => {
    const used = table({ players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}] });
    expectDocumentedDetails(used.expectRuleError("p1", place("p1:apprentice:1", { kind: "blind" }, true), "TECH_ALREADY_USED"));

    const unowned = table();
    expectDocumentedDetails(unowned.expectRuleError("p1", place("p1:apprentice:1", { kind: "blind" }, true), "TECH_NOT_OWNED"));

    const shifu = table({ players: [{ techs: ["T18"] }, {}] });
    expectDocumentedDetails(shifu.expectRuleError("p1", place("p1:shifu", { kind: "blind" }, true), "SENIOR_APPRENTICE_NOT_APPLICABLE"));
  });
});

describe("Empty Main supply (B1, L511)", () => {
  it("with the deck and discard both empty, only face-up Orders can be reserved and the gap stays empty", () => {
    const hand = allMainOrdersExcept(DISPLAY);
    const t = table({ players: [{}, { hand }], display: DISPLAY, mainDeck: [], mainDiscard: [] });
    expectDocumentedDetails(t.expectRuleError("p1", place("p1:apprentice:1", { kind: "blind" }), "ORDER_SUPPLY_EMPTY"));
    expectDocumentedDetails(t.expectRuleError("p1", place("p1:shifu", { kind: "look_top_three" }), "ORDER_SUPPLY_EMPTY"));

    const events = t.act("p1", place("p1:apprentice:1", { kind: "face_up", slotIndex: 1, orderId: "O02", gain: "coins" }));
    expect(only(events, "DISPLAY_REFILLED")).toMatchObject({ revealedOrderIds: [] });
    expect(t.state.market.display).toEqual(["O01", "O03", "O04", "O05", "O06", null]);
  });

  it("a top-3 look sees as many cards as remain, without reshuffling the discard to complete it", () => {
    const hand = allMainOrdersExcept([...DISPLAY, "O07", "O08", "O09"]);
    const t = table({ players: [{}, { hand }], display: DISPLAY, mainDeck: ["O07", "O08"], mainDiscard: ["O09"] });
    const events = t.act("p1", place("p1:shifu", { kind: "look_top_three" }));
    expect(only(events, "PRIVATE_LOOK_OPENED")).toMatchObject({ count: 2 });
    expect(types(events)).not.toContain("MAIN_DECK_RESHUFFLED");
    expect(t.state.hidden.mainDiscard).toEqual(["O09"]);
    expect(commissionStep(t).awaiting).toBe("look_choice");
  });

  it("a blind reservation from an empty deck shuffles the discard into a new deck first (L511)", () => {
    const hand = allMainOrdersExcept([...DISPLAY, "O07", "O08"]);
    const t = table({ players: [{}, { hand }], display: DISPLAY, mainDeck: [], mainDiscard: ["O07", "O08"] });
    const events = t.act("p1", place("p1:apprentice:1", { kind: "blind" }));
    expect(types(events)).toEqual(["WORKER_PLACED", "MAIN_DECK_RESHUFFLED", "ORDER_RESERVED"]);
    const held = t.state.hidden.orderHands["p1"] ?? [];
    expect(held).toHaveLength(1);
    expect(["O07", "O08"]).toContain(held[0]);
    expect(t.state.hidden.mainDiscard).toEqual([]);
  });

  it("when nothing is left to reserve after the first reservation, the Shifu's action completes at once", () => {
    const display: Array<OrderId | null> = ["O01", null, null, null, null, null];
    const t = table({ players: [{}, { hand: allMainOrdersExcept(["O01"]) }], display, mainDeck: [], mainDiscard: [] });
    const events = t.act("p1", place("p1:shifu", { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "wood" }));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "ORDER_RESERVED",
      "RESOURCES_CHANGED",
      "DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(t.state.market.display).toEqual([null, null, null, null, null, null]);
  });
});

describe("hidden information (L200, B3)", () => {
  it("public events carry sources and counts only; the actor's secrets reach only the actor", () => {
    const t = table();
    t.act("p1", place("p1:shifu", { kind: "blind" }));
    t.act("p1", { type: "COMMISSION_GAIN", resource: "coins" });
    t.act("p1", { type: "COMMISSION_RESERVE", choice: { kind: "look_top_three" } });
    const look = (t.state.hidden.pendingLook as { orderIds: OrderId[] }).orderIds;
    t.act("p1", { type: "COMMISSION_CHOOSE_LOOKED", orderId: look[2] as OrderId });
    t.act("p1", { type: "COMMISSION_GAIN", resource: "coins" });

    const hand = t.state.hidden.orderHands["p1"] ?? [];
    expect(hand).toHaveLength(2);
    const publicLog = JSON.stringify(t.events.map(projectEvent));
    const publicState = JSON.stringify(projectPublicState(t.state));
    for (const id of [...hand, ...look]) {
      expect(publicLog).not.toContain(`"${id}"`);
      expect(publicState).not.toContain(`"${id}"`);
    }
    expect(t.view(null).game.counts.orderHands["p1"]).toBe(2);
    expect(t.view("p2").own?.orderHand).toEqual([]);
    expect(t.view("p1").own?.orderHand).toEqual(hand);
  });
});
