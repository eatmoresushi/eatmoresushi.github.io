/**
 * Commission Market placement legality (L160, L164, v1.6.2 L219–228, B1): a worker may be
 * placed only if at least 1 reservation can be made: a display position holds an Order, or the
 * Main deck plus discard holds a card (then the look shows at least 1). Legality reads public
 * counts only. Also Senior Apprentice (v1.6.2 L625, R12) and the shared placement checks as
 * they surface through this location: absolute capacity, worker availability, one worker
 * action per turn.
 */

import { describe, expect, it } from "vitest";
import { validateAction } from "../../../src/game/engine.ts";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { commissionOptions, placementOptions } from "../../../src/game/selectors.ts";
import { actorViewOf } from "../../../src/game/view.ts";
import type { GameAction, OrderId } from "../../../src/game/types.ts";
import { type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

function place(workerId: string, seniorApprentice?: boolean): GameAction {
  return { type: "PLACE_COMMISSION_MARKET", workerId, ...(seniorApprentice === undefined ? {} : { seniorApprentice }) };
}

function legality(spec: StateSpec, workerId: string, seniorApprentice?: boolean) {
  return validateAction(actorViewOf(buildState(spec), "p1"), place(workerId, seniorApprentice));
}

const EMPTY_DISPLAY: Array<OrderId | null> = [null, null, null, null, null, null];

/** A spec whose Main deck and discard are pinned; every other Main Order is in p2's hand. */
function supplySpec(display: Array<OrderId | null>, mainDeck: OrderId[], mainDiscard: OrderId[], p1: StateSpec["players"] = undefined): StateSpec {
  const placed = [...display, ...mainDeck, ...mainDiscard];
  const first = Array.isArray(p1) ? (p1[0] ?? {}) : {};
  return {
    players: [first, { hand: MAIN_ORDER_IDS.filter((id) => !placed.includes(id)) }],
    display,
    mainDeck,
    mainDiscard,
  };
}

const WORKERS: ReadonlyArray<[string, string, boolean | undefined]> = [
  ["the Apprentice effect", "p1:apprentice:1", undefined],
  ["the Shifu effect", "p1:shifu", undefined],
  ["Senior Apprentice", "p1:apprentice:1", true],
];

describe("at least 1 reservation is possible (L164, B1)", () => {
  it.each(WORKERS)("%s: legal with face-up Orders only (deck and discard empty)", (_, workerId, senior) => {
    const spec = supplySpec(["O01", null, null, null, null, null], [], [], [{ techs: ["T18"] }]);
    expect(legality(spec, workerId, senior)).toBeNull();
  });

  it.each(WORKERS)("%s: legal with an empty display and a non-empty deck", (_, workerId, senior) => {
    expect(legality(supplySpec(EMPTY_DISPLAY, ["O07"], [], [{ techs: ["T18"] }]), workerId, senior)).toBeNull();
  });

  it.each(WORKERS)("%s: legal with only a discard, which the look reshuffles (L526)", (_, workerId, senior) => {
    expect(legality(supplySpec(EMPTY_DISPLAY, [], ["O07"], [{ techs: ["T18"] }]), workerId, senior)).toBeNull();
  });

  it.each(WORKERS)("%s: NO_MAIN_ACTION_POSSIBLE when no Order is available anywhere", (_, workerId, senior) => {
    const spec = supplySpec(EMPTY_DISPLAY, [], [], [{ techs: ["T18"] }]);
    const error = legality(spec, workerId, senior);
    expect(error?.code).toBe("NO_MAIN_ACTION_POSSIBLE");
    expect(error?.details).toMatchObject({ locationId: "commission_market", workerId, effect: senior === true || workerId.endsWith("shifu") ? "shifu" : "apprentice" });
    expectDocumentedDetails(error);
    const t = new LocalTable(buildState(spec));
    t.expectRuleError("p1", place(workerId, senior), "NO_MAIN_ACTION_POSSIBLE");
  });

  it("commissionOptions and placementOptions agree with the validator (public counts only)", () => {
    const cases: Array<[StateSpec, boolean]> = [
      [supplySpec(EMPTY_DISPLAY, [], []), false],
      [supplySpec(EMPTY_DISPLAY, [], ["O07"]), true],
      [supplySpec(["O01", null, null, null, null, null], [], []), true],
      [{}, true],
    ];
    for (const [spec, legal] of cases) {
      const view = actorViewOf(buildState(spec), "p1");
      for (const effect of ["apprentice", "shifu"] as const) {
        expect(commissionOptions(view, effect).reservable).toBe(legal);
      }
      const option = placementOptions(view).find((o) => o.locationId === "commission_market");
      expect(option?.legal).toBe(legal);
      expect(option?.reason).toBe(legal ? null : "NO_MAIN_ACTION_POSSIBLE");
    }
  });

  it("commissionOptions counts the cards each look would show (B1)", () => {
    const view = (spec: StateSpec) => actorViewOf(buildState(spec), "p1");
    expect(commissionOptions(view({}), "apprentice")).toEqual({
      effect: "apprentice",
      n: 2,
      lookCount: 2,
      maxReservations: 1,
      faceUpSlots: [0, 1, 2, 3, 4, 5],
      reservable: true,
    });
    expect(commissionOptions(view({}), "shifu")).toMatchObject({ n: 3, lookCount: 3, maxReservations: 2 });
    // A deck of 1 shows 1 card, whatever the discard holds (B1: no reshuffle mid-look).
    const short = view(supplySpec(["O01", null, null, null, null, null], ["O07"], ["O08", "O09", "O10"]));
    expect(commissionOptions(short, "shifu")).toMatchObject({ lookCount: 1, faceUpSlots: [0] });
    // An empty deck is replaced by the shuffled discard when the look starts.
    const reshuffle = view(supplySpec(EMPTY_DISPLAY, [], ["O08", "O09"]));
    expect(commissionOptions(reshuffle, "shifu")).toMatchObject({ lookCount: 2, faceUpSlots: [], reservable: true });
    expect(commissionOptions(view(supplySpec(["O01", null, null, null, null, null], [], [])), "apprentice")).toMatchObject({ lookCount: 0, reservable: true });
  });
});

describe("Senior Apprentice (v1.6.2 L625, R12)", () => {
  it("applies to an Apprentice with T18 ready, never to the Shifu, and must be owned and unused", () => {
    expect(legality({ players: [{ techs: ["T18"] }, {}] }, "p1:apprentice:2", true)).toBeNull();
    const shifu = legality({ players: [{ techs: ["T18"] }, {}] }, "p1:shifu", true);
    expect(shifu?.code).toBe("SENIOR_APPRENTICE_NOT_APPLICABLE");
    expectDocumentedDetails(shifu);
    const unowned = legality({}, "p1:apprentice:1", true);
    expect(unowned?.code).toBe("TECH_NOT_OWNED");
    expectDocumentedDetails(unowned);
    const used = legality({ players: [{ techs: [{ id: "T18", usedThisRound: true }] }, {}] }, "p1:apprentice:1", true);
    expect(used?.code).toBe("TECH_ALREADY_USED");
    expectDocumentedDetails(used);
  });

  it("is offered as its own worker option at the Commission Market", () => {
    const view = actorViewOf(buildState({ players: [{ techs: ["T18"] }, {}] }), "p1");
    const option = placementOptions(view).find((o) => o.locationId === "commission_market");
    expect(option?.seniorApprentice).toBe(true);
    expect(option?.workers.map((w) => [w.workerId, w.effect, w.seniorApprentice, w.legal])).toEqual([
      ["p1:shifu", "shifu", false, true],
      ["p1:apprentice:1", "apprentice", false, true],
      ["p1:apprentice:1", "shifu", true, true],
    ]);
  });
});

describe("shared placement checks at the Commission Market (L162, L158)", () => {
  it("capacity is absolute: 2 / 3 / 4 spaces, the Shifu included", () => {
    for (const players of [2, 3, 4] as const) {
      const placements = Array.from({ length: players }, (_, index) => ({
        player: `p${(index % players) + 1}`,
        worker: (index < players - 1 ? 1 : 2) as 1 | 2,
        locationId: "commission_market" as const,
      }));
      const spec: StateSpec = { players, placements };
      for (const workerId of ["p1:shifu", "p1:apprentice:3"]) {
        const error = legality(spec, workerId);
        expect(error?.code, `${players} players, ${workerId}`).toBe("LOCATION_FULL");
        expect(error?.details).toMatchObject({ locationId: "commission_market", capacity: players });
      }
      const oneFree: StateSpec = { players, placements: placements.slice(1) };
      expect(legality(oneFree, "p1:shifu")).toBeNull();
    }
  });

  it("a placed worker is unavailable, and only one worker action is taken per turn", () => {
    const placed: StateSpec = { placements: [{ player: "p1", worker: 1, locationId: "canal_wharf" }] };
    expect(legality(placed, "p1:apprentice:1")?.code).toBe("WORKER_UNAVAILABLE");

    const t = new LocalTable(buildState({ players: [{ techs: ["T10"] }, {}] }), { flow: "halt", pass: ["worker_action_done"] });
    t.act("p1", place("p1:apprentice:1"));
    // During the reservation step no other placement is possible.
    t.expectRuleError("p1", place("p1:shifu"), "WORKER_ACTION_ALREADY_TAKEN");
    t.act("p1", { type: "SELECT_CHOOSE", reservations: [{ kind: "face_up", slotIndex: 0, orderId: "O01" }] });
    // The Colour Samples swap (ready, with the Order just reserved in hand) keeps the after-action
    // window open; a second placement is refused.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    t.expectRuleError("p1", place("p1:shifu"), "WORKER_ACTION_ALREADY_TAKEN");
    t.expectRuleError("p2", place("p2:shifu"), "NOT_YOUR_DECISION");
  });
});
