/**
 * Commission Market placement legality (L140, L142, L191–192, L199, B1): a worker may be
 * placed only if at least 1 reservation can be made, with every reservation taking an
 * available card. Legality reads public counts only. Also the shared placement checks as they
 * surface through this location: absolute capacity, worker availability, one worker action
 * per turn, and the first reservation's own checks.
 */

import { describe, expect, it } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import type { CommissionReservationChoice, GameAction, OrderId } from "../../../src/game/types.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function place(workerId: string, first: CommissionReservationChoice): GameAction {
  return { type: "PLACE_COMMISSION_MARKET", workerId, first };
}

function legality(spec: StateSpec, workerId: string, first: CommissionReservationChoice) {
  return validateAction(actorViewOf(buildState(spec), "p1"), place(workerId, first));
}

const EMPTY_DISPLAY: Array<OrderId | null> = [null, null, null, null, null, null];

/** A spec whose Main deck and discard are pinned; every other Main Order is in p2's hand. */
function supplySpec(display: Array<OrderId | null>, mainDeck: OrderId[], mainDiscard: OrderId[]): StateSpec {
  const placed = [...display, ...mainDeck, ...mainDiscard];
  return {
    players: [{}, { hand: MAIN_ORDER_IDS.filter((id) => !placed.includes(id)) }],
    display,
    mainDeck,
    mainDiscard,
  };
}

describe("at least 1 reservation is possible (L142, B1)", () => {
  it("is legal with face-up Orders only (deck and discard empty)", () => {
    const spec = supplySpec(["O01", null, null, null, null, null], [], []);
    expect(legality(spec, "p1:apprentice:1", { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "coins" })).toBeNull();
    expect(legality(spec, "p1:shifu", { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "coins" })).toBeNull();
  });

  it("is legal with an empty display and a non-empty deck", () => {
    const spec = supplySpec(EMPTY_DISPLAY, ["O07"], []);
    expect(legality(spec, "p1:apprentice:1", { kind: "blind" })).toBeNull();
    expect(legality(spec, "p1:shifu", { kind: "look_top_three" })).toBeNull();
  });

  it("is legal with only a discard: the blind draw reshuffles it (L511)", () => {
    const spec = supplySpec(EMPTY_DISPLAY, [], ["O07"]);
    expect(legality(spec, "p1:apprentice:1", { kind: "blind" })).toBeNull();
    expect(legality(spec, "p1:shifu", { kind: "look_top_three" })).toBeNull();
  });

  it("is NO_MAIN_ACTION_POSSIBLE for every worker when no Order is available anywhere", () => {
    const spec = supplySpec(EMPTY_DISPLAY, [], []);
    for (const workerId of ["p1:apprentice:1", "p1:shifu"]) {
      const error = legality(spec, workerId, { kind: "blind" });
      expect(error?.code).toBe("NO_MAIN_ACTION_POSSIBLE");
      expect(error?.details).toMatchObject({ locationId: "commission_market", workerId });
      expectDocumentedDetails(error);
    }
    const t = new LocalTable(buildState(spec));
    t.expectRuleError("p1", place("p1:shifu", { kind: "look_top_three" }), "NO_MAIN_ACTION_POSSIBLE");
  });
});

describe("the first reservation's own checks", () => {
  it("a face-up reservation must name the Order showing in that position", () => {
    const base: StateSpec = {};
    for (const first of [
      { kind: "face_up", slotIndex: 0, orderId: "O02", gain: "clay" },
      { kind: "face_up", slotIndex: 6, orderId: "O01", gain: "clay" },
      { kind: "face_up", slotIndex: 40, orderId: "O01", gain: "clay" },
    ] as const) {
      const error = legality(base, "p1:apprentice:1", first);
      expect(error?.code).toBe("ORDER_NOT_AVAILABLE");
      expectDocumentedDetails(error);
    }
    const gap = supplySpec(["O01", null, "O03", null, null, null], ["O07"], []);
    expect(legality(gap, "p1:apprentice:1", { kind: "face_up", slotIndex: 1, orderId: "O02", gain: "clay" })?.code).toBe(
      "ORDER_NOT_AVAILABLE",
    );
  });

  it("a blind reservation or a look needs a card in the deck after any reshuffle (B1)", () => {
    const spec = supplySpec(["O01", null, null, null, null, null], [], []);
    expect(legality(spec, "p1:apprentice:1", { kind: "blind" })?.code).toBe("ORDER_SUPPLY_EMPTY");
    expect(legality(spec, "p1:shifu", { kind: "look_top_three" })?.code).toBe("ORDER_SUPPLY_EMPTY");
  });

  it("only the Shifu effect may choose the top-3 selection", () => {
    const error = legality({}, "p1:apprentice:1", { kind: "look_top_three" });
    expect(error?.code).toBe("INVALID_CHOICE");
    expect(error?.details).toMatchObject({ choice: "look_top_three", effect: "apprentice" });
  });
});

describe("shared placement checks at the Commission Market (L140, L136)", () => {
  it("capacity is absolute: 2 / 3 / 4 spaces, the Shifu included", () => {
    for (const players of [2, 3, 4] as const) {
      const placements = Array.from({ length: players }, (_, index) => ({
        player: `p${(index % players) + 1}`,
        worker: (index < players - 1 ? 1 : 2) as 1 | 2,
        locationId: "commission_market" as const,
      }));
      const spec: StateSpec = { players, placements };
      for (const workerId of ["p1:shifu", "p1:apprentice:3"]) {
        const error = legality(spec, workerId, { kind: "blind" });
        expect(error?.code, `${players} players, ${workerId}`).toBe("LOCATION_FULL");
        expect(error?.details).toMatchObject({ locationId: "commission_market", capacity: players });
      }
      const oneFree: StateSpec = { players, placements: placements.slice(1) };
      expect(legality(oneFree, "p1:shifu", { kind: "blind" })).toBeNull();
    }
  });

  it("a placed worker is unavailable, and only one worker action is taken per turn", () => {
    const placed: StateSpec = { placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] };
    expect(legality(placed, "p1:apprentice:1", { kind: "blind" })?.code).toBe("WORKER_UNAVAILABLE");

    const t = new LocalTable(buildState({ players: [{ techs: ["T23"] }, {}] }), { flow: "halt", pass: ["worker_action_done"] });
    t.act("p1", place("p1:apprentice:1", { kind: "face_up", slotIndex: 0, orderId: "O01", gain: "coins" }));
    // Canal Barge keeps the after-action window open; a second placement is refused.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    t.expectRuleError("p1", place("p1:shifu", { kind: "blind" }), "WORKER_ACTION_ALREADY_TAKEN");
    t.expectRuleError("p2", place("p2:shifu", { kind: "blind" }), "NOT_YOUR_DECISION");
  });
});
