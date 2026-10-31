/**
 * Canal Wharf (v1.6.2 L245–250) and Magistrate's Hall (L252–263, change 33, R21):
 * Apprentice and Shifu effects — the Canal Wharf Shifu's unseen top Main Order (v1.6.2 L250, B1,
 * B3) and the Magistrate's Hall Shifu's optional face-up Crown Order (R21) included — 4 Coins
 * for both Magistrate's Hall effects, Recognition 0–2 only, never to 4, the reached milestone
 * resolved (fixed Grant 1/1/1, L446, change 8), both spaces usable by one player at 4 players.
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { magistratesHallQuote } from "../../../src/game/selectors.ts";
import { projectEvent, projectPublicState, viewOf } from "../../../src/game/view.ts";
import type { GameAction, OrderId, Recognition } from "../../../src/game/types.ts";
import type { StateSpec } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";
import { expectPublicEvents, keySorted, reject, scrambleHidden, table, types, verdict, withHands, buildState } from "./workshop_support.ts";

const wharf = (workerId: string): GameAction => ({ type: "PLACE_CANAL_WHARF", workerId });
const hall = (workerId: string, crownOrder?: { slotIndex: number; orderId: OrderId }): GameAction => ({
  type: "PLACE_MAGISTRATES_HALL",
  workerId,
  ...(crownOrder === undefined ? {} : { crownOrder }),
});

/** Pins the Main deck and discard; every other Main Order is in p2's hand. */
function supply(mainDeck: OrderId[], mainDiscard: OrderId[]) {
  const display: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];
  const placed = [...display, ...mainDeck, ...mainDiscard];
  return { players: [{}, { hand: MAIN_ORDER_IDS.filter((id) => !placed.includes(id)) }], display, mainDeck, mainDiscard };
}

describe("Canal Wharf: 2 Coins (Apprentice) / 4 Coins and the top Main Order unseen (Shifu) (v1.6.2 L249–250)", () => {
  it("the Apprentice gains 2 Coins and hands over", () => {
    const t = table();
    const events = t.act("p1", wharf("p1:apprentice:2"));
    expect(events).toEqual([
      {
        type: "WORKER_PLACED",
        playerId: "p1",
        workerId: "p1:apprentice:2",
        kind: "apprentice",
        locationId: "canal_wharf",
        spaceIndex: 0,
        effect: "apprentice",
        viaSeniorApprentice: false,
      },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "canal_wharf" },
    ]);
    expect(t.player("p1").resources.coins).toBe(5);
    expect(t.state.hidden.orderHands["p1"]).toEqual([]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it("the Shifu gains 4 Coins, then takes the top Main Order into the hand without looking (secret)", () => {
    const t = table({ players: [{ hand: ["S01"] }, {}] });
    const top = t.state.hidden.mainDeck[0] as OrderId;
    const deckBefore = t.state.hidden.mainDeck.length;
    const events = t.act("p1", wharf("p1:shifu"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "ORDER_RESERVED"]);
    expect(events[1]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 4, reason: "canal_wharf" });
    const reserved = events[2];
    expect(reserved).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "canal_wharf",
      source: "deck_top",
      slotIndex: null,
      orderId: null,
      secret: { visibleTo: "p1", orderId: top },
    });
    expect(t.player("p1").resources.coins).toBe(7);
    expect(t.state.hidden.orderHands["p1"]).toEqual(["S01", top]);
    expect(t.state.hidden.mainDeck).toHaveLength(deckBefore - 1);
    // The display does not move and no look is opened.
    expect(t.state.market.display).toEqual(["O01", "O02", "O03", "O04", "O05", "O06"]);
    expect(t.state.market.refillPendingFor).toBeNull();
    expect(t.state.hidden.pendingLook).toBeNull();
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    // B3: the card is secret like every held Order; only the hand count is public.
    if (reserved === undefined) throw new Error("no ORDER_RESERVED");
    expect(projectEvent(reserved)).not.toHaveProperty("secret");
    expect(JSON.stringify(projectEvent(reserved))).not.toContain(`"${top}"`);
    expect(JSON.stringify(projectPublicState(t.state))).not.toContain(`"${top}"`);
    expect(t.view(null).game.counts.orderHands["p1"]).toBe(2);
    expect(t.view("p2").own?.orderHand).not.toContain(top);
    expect(t.view("p1").own?.orderHand).toEqual(["S01", top]);
  });

  it("with an empty deck the Shifu's card comes from the shuffled discard (L525)", () => {
    const t = table(supply([], ["O07", "O08"]));
    const events = t.act("p1", wharf("p1:shifu"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "MAIN_DECK_RESHUFFLED", "ORDER_RESERVED"]);
    const held = t.state.hidden.orderHands["p1"] ?? [];
    expect(held).toHaveLength(1);
    expect(["O07", "O08"]).toContain(held[0]);
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.state.hidden.mainDeck).toHaveLength(1);
  });

  it("with the deck and discard both empty the Shifu still gains 4 Coins and takes no card (B1)", () => {
    const t = table(supply([], []));
    const events = t.act("p1", wharf("p1:shifu"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED"]);
    expect(t.player("p1").resources.coins).toBe(7);
    expect(t.state.hidden.orderHands["p1"]).toEqual([]);
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
  });

  it("the drawn card counts toward the Cleanup hand limit like any held Order", () => {
    const t = table({ players: [{ hand: ["S01", "S02", "O40", "O41"] }, {}] });
    t.act("p1", wharf("p1:shifu"));
    expect(t.view(null).game.counts.orderHands["p1"]).toBe(5);
  });

  it("is uncapped and costs nothing, so it is always legal (L165), even with no supply (B1)", () => {
    const t = table({
      players: [{ resources: { clay: 0, wood: 0, coins: 0 } }, {}, {}, {}],
      placements: [
        { player: "p2", worker: "shifu", locationId: "canal_wharf" },
        { player: "p2", worker: 1, locationId: "canal_wharf" },
        { player: "p3", worker: "shifu", locationId: "canal_wharf" },
        { player: "p3", worker: 1, locationId: "canal_wharf" },
        { player: "p4", worker: "shifu", locationId: "canal_wharf" },
        { player: "p4", worker: 1, locationId: "canal_wharf" },
        { player: "p1", worker: 1, locationId: "canal_wharf" },
      ],
    });
    const events = t.act("p1", wharf("p1:shifu"));
    expect(events[0]).toMatchObject({ spaceIndex: 7 });
    expect(t.player("p1").resources).toEqual({ clay: 0, wood: 0, coins: 4 });
    expect(verdict(buildState(supply([], [])), "p1", wharf("p1:shifu"))).toBeNull();
    expect(verdict(buildState(supply([], [])), "p1", wharf("p1:apprentice:1"))).toBeNull();
  });
});

describe("Magistrate's Hall: 4 Coins for +1 Recognition, either worker (L258–259)", () => {
  it("Apprentice: pays 4, advances 0 → 1 and receives the fixed Imperial Grant (L446)", () => {
    const t = table({ players: [{ resources: { clay: 2, wood: 2, coins: 7 } }, {}] });
    const events = t.act("p1", hall("p1:apprentice:1"));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
    ]);
    expect(events[1]).toEqual({ type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: -4, reason: "magistrates_hall" });
    expect(events[2]).toEqual({ type: "RECOGNITION_ADVANCED", playerId: "p1", from: 0, to: 1, source: "magistrates_hall", orderId: null });
    expect(events[4]).toMatchObject({ clay: 1, wood: 1, coins: 1, reason: "imperial_grant" });
    expect(t.player("p1").resources).toEqual({ clay: 3, wood: 3, coins: 4 });
    expect(t.player("p1").imperial).toMatchObject({ recognition: 1, grantReceived: true });
    expect(t.halts).toEqual([{ kind: "worker_action_done", playerId: "p1" }]);
    expectPublicEvents(events);
  });

  it("its quote previews the milestone's resources: the Imperial Grant from 0 → 1, nothing later (L446)", () => {
    const first = table({ players: [{ resources: { clay: 2, wood: 2, coins: 7 } }, {}] });
    const quote = magistratesHallQuote(viewOf(first.state, "p1"), "apprentice");
    expect(quote).toMatchObject({ ok: true, reachable: 1, pay: { clay: 0, wood: 0, coins: 4 }, gain: { clay: 1, wood: 1, coins: 1 } });
    // The preview matches what the action pays and gains.
    first.act("p1", hall("p1:apprentice:1"));
    expect(first.player("p1").resources).toEqual({ clay: 2 - quote.pay.clay + quote.gain.clay, wood: 2 - quote.pay.wood + quote.gain.wood, coins: 7 - quote.pay.coins + quote.gain.coins });
    for (const recognition of [1, 2] as const) {
      const later = table({ players: [{ recognition, resources: { coins: 4 } }, {}] });
      expect(magistratesHallQuote(viewOf(later.state, "p1"), "shifu").gain).toEqual({ clay: 0, wood: 0, coins: 0 });
    }
  });

  it("Shifu: pays 4, advances 1 → 2 and gains the Imperial Kiln tile (L306, L447)", () => {
    const t = table({ players: [{ recognition: 1, resources: { coins: 4 } }, {}] });
    const events = t.act("p1", hall("p1:shifu"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "RECOGNITION_ADVANCED", "IMPERIAL_KILN_GAINED"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(t.player("p1").imperial).toMatchObject({ recognition: 2, kilnGained: true });
  });

  it("advances 2 → 3 and takes the Imperial Priority token (L448)", () => {
    const t = table({ players: [{ recognition: 2, resources: { coins: 4 } }, {}] });
    const events = t.act("p1", hall("p1:apprentice:3"));
    expect(types(events).slice(2)).toEqual(["RECOGNITION_ADVANCED", "IMPERIAL_PRIORITY_GAINED"]);
    expect(t.player("p1").imperial).toMatchObject({ recognition: 3, priority: "held" });
  });

  it.each([3, 4] as const)("cannot be used at Recognition %i: it never advances you to 4 (L261–262)", (recognition: Recognition) => {
    const error = reject(table({ players: [{ recognition, resources: { coins: 9 } }, {}] }), "p1", hall("p1:shifu"), "RECOGNITION_GATE");
    expect(error.details).toMatchObject({ recognition });
  });

  it("needs no Crown, only the Coins (L261)", () => {
    expect(verdict(buildState({ players: [{ resources: { coins: 4 } }, {}] }), "p1", hall("p1:apprentice:1"))).toBeNull();
    const short = reject(table({ players: [{ resources: { coins: 3 } }, {}] }), "p1", hall("p1:apprentice:1"), "INSUFFICIENT_RESOURCES");
    expect(short.details).toMatchObject({ resource: "coins", needed: 4, have: 3 });
    const shifu = reject(table({ players: [{ resources: { coins: 3 } }, {}] }), "p1", hall("p1:shifu"), "INSUFFICIENT_RESOURCES");
    expect(shifu.details).toMatchObject({ resource: "coins", needed: 4, have: 3 });
  });

  it("a player may use both spaces in a 4-player round (L254)", () => {
    const t = table({ players: [{ resources: { coins: 10 } }, {}, {}, {}] });
    t.act("p1", hall("p1:apprentice:1"));
    t.act("p1", hall("p1:shifu"));
    expect(t.player("p1").imperial.recognition).toBe(2);
    expect(t.player("p1").resources.coins).toBe(10 - 4 + 1 - 4);
    reject(t, "p1", hall("p1:apprentice:2"), "LOCATION_FULL");
  });
});

/** O17 (1 Crown) at position 1 and O39 (2 Crowns) at position 3; the rest show no Crown. */
const CROWN_DISPLAY: OrderId[] = ["O01", "O17", "O03", "O39", "O05", "O06"];

/** A table that passes the worker hand-over, so the turn ends and the display refills. */
function fullTurn(spec: StateSpec): LocalTable {
  return new LocalTable(buildState(spec), { flow: "halt", pass: ["worker_action_done"] });
}

describe("Magistrate's Hall Shifu: then reserve 1 face-up Crown Order (L259, L263, change 33, R21)", () => {
  it("reserves the chosen Crown Order after the payment and the step; its position stays empty until the turn ends", () => {
    const t = table({ players: [{ resources: { coins: 4 } }, {}], display: CROWN_DISPLAY });
    const events = t.act("p1", hall("p1:shifu", { slotIndex: 3, orderId: "O39" }));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "RECOGNITION_ADVANCED",
      "IMPERIAL_GRANT_RECEIVED",
      "RESOURCES_CHANGED",
      "ORDER_RESERVED",
    ]);
    expect(events[1]).toMatchObject({ coins: -4, reason: "magistrates_hall" });
    // A face-up reservation is public, like any other (L263).
    expect(events[5]).toEqual({ type: "ORDER_RESERVED", playerId: "p1", via: "magistrates_hall", source: "face_up", slotIndex: 3, orderId: "O39" });
    expectPublicEvents(events);
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O39"]);
    expect(t.state.market).toEqual({ display: ["O01", "O17", "O03", null, "O05", "O06"], refillPendingFor: "p1" });
    expect(t.player("p1").imperial.recognition).toBe(1);
  });

  it("the milestone of the step resolves first, then the reservation (L259)", () => {
    const t = table({ players: [{ recognition: 1, resources: { coins: 4 } }, {}], display: CROWN_DISPLAY });
    const events = t.act("p1", hall("p1:shifu", { slotIndex: 1, orderId: "O17" }));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "RECOGNITION_ADVANCED", "IMPERIAL_KILN_GAINED", "ORDER_RESERVED"]);
  });

  it("refills the display once at the end of the turn, as at the Commission Market (L263, L405)", () => {
    const t = fullTurn({ players: [{ resources: { coins: 4 } }, {}], display: CROWN_DISPLAY });
    const next = t.state.hidden.mainDeck[0];
    const events = t.act("p1", hall("p1:shifu", { slotIndex: 3, orderId: "O39" }));
    expect(types(events).slice(-4)).toEqual(["ORDER_RESERVED", "DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(events.find((e) => e.type === "DISPLAY_REFILLED")).toMatchObject({ cause: "end_of_turn", revealedOrderIds: [next] });
    expect(t.state.market).toEqual({ display: ["O01", "O17", "O03", "O05", "O06", next], refillPendingFor: null });
  });

  it("is optional (R21): without a pick Recognition still advances and the display is untouched", () => {
    const t = table({ players: [{ resources: { coins: 4 } }, {}], display: CROWN_DISPLAY });
    const events = t.act("p1", hall("p1:shifu"));
    expect(types(events)).not.toContain("ORDER_RESERVED");
    expect(t.player("p1").imperial.recognition).toBe(1);
    expect(t.state.hidden.orderHands["p1"]).toEqual([]);
    expect(t.state.market).toEqual({ display: CROWN_DISPLAY, refillPendingFor: null });
  });

  it("with no Crown Order showing nothing is reserved; a non-Crown pick is refused (L263)", () => {
    const plain: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];
    expect(verdict(buildState({ players: [{ resources: { coins: 4 } }, {}], display: plain }), "p1", hall("p1:shifu"))).toBeNull();
    const error = reject(
      table({ players: [{ resources: { coins: 4 } }, {}], display: plain }),
      "p1",
      hall("p1:shifu", { slotIndex: 2, orderId: "O03" }),
      "INVALID_TARGET",
    );
    expect(error.details).toMatchObject({ reason: "no_crown", orderId: "O03", slotIndex: 2, field: "crownOrder" });
    expectDocumentedDetails(error);
  });

  it("names the Order at its display position: a stale, empty or out-of-range position is refused", () => {
    const spec = { players: [{ resources: { coins: 4 } }, {}], display: CROWN_DISPLAY };
    for (const crownOrder of [
      { slotIndex: 3, orderId: "O17" as OrderId },
      { slotIndex: 9, orderId: "O39" as OrderId },
      { slotIndex: 0, orderId: "O40" as OrderId },
    ]) {
      const error = reject(table(spec), "p1", hall("p1:shifu", crownOrder), "ORDER_NOT_AVAILABLE");
      expect(error.details).toMatchObject({ ...crownOrder, field: "crownOrder" });
      expectDocumentedDetails(error);
    }
    // A position emptied earlier in the turn stays empty (L263).
    const emptied = table({ players: [{ resources: { coins: 4 } }, {}], display: ["O01", "O17", null, "O39", "O05", "O06"], refillPendingFor: "p1" });
    reject(emptied, "p1", hall("p1:shifu", { slotIndex: 2, orderId: "O03" }), "ORDER_NOT_AVAILABLE");
  });

  it("is the Shifu effect only: an Apprentice's pick is refused, and Senior Apprentice never applies here (R12)", () => {
    for (const techs of [[], ["T18" as const]]) {
      const error = reject(
        table({ players: [{ techs, resources: { coins: 4 } }, {}], display: CROWN_DISPLAY }),
        "p1",
        hall("p1:apprentice:1", { slotIndex: 1, orderId: "O17" }),
        "NOT_SHIFU_EFFECT",
      );
      expect(error.details).toMatchObject({ effect: "apprentice", field: "crownOrder" });
      expectDocumentedDetails(error);
    }
  });

  it("the Recognition gate and the Coins are checked before the pick", () => {
    reject(table({ players: [{ recognition: 3, resources: { coins: 9 } }, {}], display: CROWN_DISPLAY }), "p1", hall("p1:shifu", { slotIndex: 1, orderId: "O17" }), "RECOGNITION_GATE");
    reject(table({ players: [{ resources: { coins: 3 } }, {}], display: CROWN_DISPLAY }), "p1", hall("p1:shifu", { slotIndex: 1, orderId: "O17" }), "INSUFFICIENT_RESOURCES");
  });
});

describe("privacy and determinism", () => {
  it("validation depends on the public view only (hidden contents scrambled)", () => {
    for (const recognition of [0, 2, 3] as const) {
      const state = buildState(withHands({ players: [{ recognition, resources: { coins: 4 } }, {}] }));
      for (const command of [hall("p1:apprentice:1"), hall("p1:shifu"), hall("p1:shifu", { slotIndex: 0, orderId: "O01" }), wharf("p1:apprentice:1")]) {
        expect(verdict(scrambleHidden(state), "p1", command)).toBe(verdict(state, "p1", command));
      }
    }
  });

  it("a key-sorted (jsonb) state resolves to the same events and state", () => {
    const spec = withHands({ players: [{ recognition: 1, resources: { coins: 5 } }, {}] });
    const plain = table(spec);
    const sorted = table(spec);
    sorted.state = keySorted(sorted.state);
    expect(sorted.act("p1", hall("p1:shifu"))).toEqual(plain.act("p1", hall("p1:shifu")));
    expect(keySorted(sorted.state)).toEqual(keySorted(plain.state));
  });
});
