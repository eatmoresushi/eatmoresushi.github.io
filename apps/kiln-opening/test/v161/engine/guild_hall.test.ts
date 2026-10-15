/**
 * Guild Hall (L202–213, L373–378, L626, L650, R4, B1, B2; DESIGN §3.2): the Apprentice buys a
 * face-up Tech at its printed cost; the Shifu privately inspects any discipline's top 2 (or
 * as many as remain), takes a face-up or inspected Tech at 1 Coin less, returns the rest to
 * the bottom in a chosen order and only then refills; 3 total / 1 per discipline; unlocking;
 * Colour Samples' mandatory when-acquired reservation with no resource and no display refill.
 */

import { describe, expect, it } from "vitest";
import { MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { validatePlacement } from "../../../src/game/placement.ts";
import { handLimit } from "../../../src/game/techs.ts";
import type { GameAction, GameEvent, OrderId, TechDiscipline, TechId } from "../../../src/game/types.ts";
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

function buy(workerId: string, techId: TechId): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId } };
}

function inspect(discipline: TechDiscipline): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline } };
}

function take(kind: "face_up" | "inspected", techId: TechId, bottomOrder: TechId[]): GameAction {
  return { type: "GUILD_TAKE", take: { kind, techId }, bottomOrder };
}

function owned(t: LocalTable, playerId: string): TechId[] {
  return t.player(playerId).techs.map((tech) => tech.id);
}

describe("Apprentice (L206): pay the printed cost and take 1 face-up Advanced Tech", () => {
  it("pays the printed cost, unlocks the matching personal space and refills the discipline (L209, L211)", () => {
    const t = table();
    expect(t.state.techDisplay.workshop).toEqual(["T01", "T16"]);
    const events = t.act("p1", buy("p1:apprentice:1", "T01"));

    expect(owned(t, "p1")).toEqual(["T01"]);
    expect(t.player("p1").resources.coins).toBe(1);
    expect(t.player("p1").personalSpaces.form_decorate[1].unlocked).toBe(true);
    expect(t.state.techDisplay.workshop).toEqual(["T16", "T05"]);
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "PERSONAL_SPACE_UNLOCKED",
      "TECH_DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(events, "RESOURCES_CHANGED")).toMatchObject({ coins: -2, reason: "guild_hall" });
    expect(only(events, "TECH_ACQUIRED")).toEqual({ type: "TECH_ACQUIRED", playerId: "p1", techId: "T01", source: "face_up", cost: 2 });
    expect(only(events, "PERSONAL_SPACE_UNLOCKED")).toMatchObject({ locationId: "form_decorate" });
    expect(only(events, "TECH_DISPLAY_REFILLED")).toMatchObject({ discipline: "workshop", revealedTechIds: ["T05"] });
  });

  it("a Firing Tech unlocks nothing (L211); a 3-Coin Tech costs 3", () => {
    const t = table();
    const events = t.act("p1", buy("p1:apprentice:1", "T12"));
    expect(t.player("p1").resources.coins).toBe(0);
    expect(types(events)).not.toContain("PERSONAL_SPACE_UNLOCKED");
    expect(t.player("p1").personalSpaces.form_decorate[1].unlocked).toBe(false);
    expect(t.player("p1").personalSpaces.glaze_load[1].unlocked).toBe(false);
  });

  it("an unlocked space may be used later the same round (L211)", () => {
    const t = table({ placements: [{ player: "p1", worker: 2, locationId: "form_decorate" }] });
    expect(validatePlacement(t.actorView("p1"), "p1:shifu", "form_decorate", false)?.code).toBe("PERSONAL_SPACE_LOCKED");
    t.act("p1", buy("p1:apprentice:1", "T16"));
    t.act("p2", { type: "PLACE_COMMISSION_MARKET", workerId: "p2:shifu", first: { kind: "blind" } });
    t.act("p2", { type: "COMMISSION_GAIN", resource: "coins" });
    t.act("p2", { type: "COMMISSION_STOP" });
    expect(t.prompt().actorIds).toEqual(["p1"]);
    expect(validatePlacement(t.actorView("p1"), "p1:shifu", "form_decorate", false)).toBeNull();
  });

  it("refuses a Tech that is not face up, one it cannot afford, and a second Tech of an owned discipline", () => {
    const t = table({ players: [{ techs: ["T11"], resources: { coins: 2 } }, {}] });
    expectDocumentedDetails(t.expectRuleError("p1", buy("p1:apprentice:1", "T05"), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", buy("p1:apprentice:1", "T12"), "TECH_DISCIPLINE_OWNED"));
    expect(t.state.techDisplay.workshop).toEqual(["T01", "T16"]);

    const poor = table({ players: [{ resources: { coins: 2 } }, {}] });
    const error = poor.expectRuleError("p1", buy("p1:apprentice:1", "T12"), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 3, have: 2 });
    expectDocumentedDetails(error);
  });
});

describe("Shifu (L207, B2): private inspection, then take a face-up or inspected Tech at −1", () => {
  it("inspects the top 2 of a discipline and takes one of them at 1 Coin less; the other goes to the bottom", () => {
    const t = table();
    expect(t.state.hidden.techDecks.firing).toEqual(["T13", "T14", "T24", "T25"]);
    const lookEvents = t.act("p1", inspect("firing"));
    expect(t.state.hidden.pendingLook).toEqual({ kind: "guild_inspection", playerId: "p1", discipline: "firing", techIds: ["T13", "T14"] });
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25"]);
    expect(t.state.phase).toEqual({
      type: "work_turn",
      activePlayerId: "p1",
      step: { kind: "guild_inspection", workerId: "p1:shifu", discipline: "firing", inspectedCount: 2 },
    });
    expect(types(lookEvents)).toEqual(["WORKER_PLACED", "PRIVATE_LOOK_OPENED"]);
    expect(t.player("p1").resources.coins).toBe(3);

    const events = t.act("p1", take("inspected", "T13", ["T14"]));
    expect(owned(t, "p1")).toEqual(["T13"]);
    expect(t.player("p1").resources.coins).toBe(1);
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T14"]);
    expect(t.state.techDisplay.firing).toEqual(["T11", "T12"]);
    expect(t.state.hidden.pendingLook).toBeNull();
    expect(types(events)).toEqual([
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "TECHS_RETURNED_TO_BOTTOM",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(events, "TECH_ACQUIRED")).toMatchObject({ techId: "T13", source: "inspected", cost: 2 });
  });

  it("may instead take a face-up Tech of any discipline at 1 Coin less", () => {
    const t = table({ players: [{ resources: { coins: 1 } }, {}] });
    t.act("p1", inspect("firing"));
    const events = t.act("p1", take("face_up", "T20", ["T14", "T13"]));
    expect(owned(t, "p1")).toEqual(["T20"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(only(events, "TECH_ACQUIRED")).toMatchObject({ source: "face_up", cost: 1 });
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T14", "T13"]);
    expect(t.state.techDisplay.glazing_loading).toEqual(["T10", "T15"]);
    expect(t.player("p1").personalSpaces.glaze_load[1].unlocked).toBe(true);
  });

  it("returns the untaken Techs to the bottom first, then refills, so the chosen order decides the reveal (B2)", () => {
    // 3 players: p2 and p3 own Workshop Techs, so the Workshop deck holds exactly 2.
    const spec: StateSpec = { players: [{}, { techs: ["T18"] }, { techs: ["T19"] }] };
    for (const [bottomOrder, revealed] of [
      [["T17", "T05"], "T17"],
      [["T05", "T17"], "T05"],
    ] as const) {
      const t = table(spec);
      expect(t.state.hidden.techDecks.workshop).toEqual(["T05", "T17"]);
      t.act("p1", inspect("workshop"));
      expect(t.state.hidden.techDecks.workshop).toEqual([]);
      const events = t.act("p1", take("face_up", "T01", [...bottomOrder]));
      expect(types(events).indexOf("TECHS_RETURNED_TO_BOTTOM")).toBeLessThan(types(events).indexOf("TECH_DISPLAY_REFILLED"));
      expect(t.state.techDisplay.workshop).toEqual(["T16", revealed]);
      expect(t.state.hidden.techDecks.workshop).toEqual(bottomOrder.filter((id) => id !== revealed));
    }
  });

  it("may inspect a discipline it already owns (B2) and an exhausted deck, then take a face-up Tech", () => {
    // 4 players each own a Firing Tech, so the Firing deck is empty and p1 owns Firing.
    const t = table({ players: [{ techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }, { techs: ["T25"] }] });
    expect(t.state.hidden.techDecks.firing).toEqual([]);
    const lookEvents = t.act("p1", inspect("firing"));
    expect(only(lookEvents, "PRIVATE_LOOK_OPENED")).toMatchObject({ discipline: "firing", count: 0 });
    expect(t.state.phase).toMatchObject({ step: { kind: "guild_inspection", inspectedCount: 0 } });
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T11", []), "TECH_DISCIPLINE_OWNED"));
    const events = t.act("p1", take("face_up", "T01", []));
    expect(types(events)).not.toContain("TECHS_RETURNED_TO_BOTTOM");
    expect(owned(t, "p1")).toEqual(["T13", "T01"]);
  });

  it("sees as many as remain when fewer than 2 are left (L207)", () => {
    const t = table({ players: [{}, { techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }] });
    expect(t.state.hidden.techDecks.firing).toEqual(["T25"]);
    t.act("p1", inspect("firing"));
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T25"] });
    t.act("p1", take("inspected", "T25", []));
    expect(owned(t, "p1")).toEqual(["T25"]);
    expect(t.player("p1").resources.coins).toBe(0);
  });

  it("refuses a Tech that is neither face up nor inspected, an owned discipline, and an unaffordable price", () => {
    const t = table({ players: [{ techs: ["T01"], resources: { coins: 2 } }, {}] });
    t.act("p1", inspect("workshop"));
    expect(t.state.techDisplay.workshop).toEqual(["T16", "T05"]);
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T17", "T18"] });
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T19", ["T17", "T18"]), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T13", ["T17", "T18"]), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T17", ["T18"]), "TECH_DISCIPLINE_OWNED"));
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T05", ["T17", "T18"]), "TECH_DISCIPLINE_OWNED"));
    // T13 costs 3; the Shifu pays 2, which 1 Coin cannot cover.
    const poor = table({ players: [{ resources: { coins: 1 } }, {}] });
    poor.act("p1", inspect("firing"));
    const error = poor.expectRuleError("p1", take("inspected", "T13", ["T14"]), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 2, have: 1 });
    expectDocumentedDetails(error);
    poor.act("p1", take("face_up", "T11", ["T14", "T13"]));
    expect(poor.player("p1").resources.coins).toBe(0);
    expect(poor.player("p1").techs.map((tech) => tech.id)).toEqual(["T11"]);
  });

  it("the bottom order must list every untaken inspected Tech exactly once (INVALID_BOTTOM_ORDER)", () => {
    const t = table();
    t.act("p1", inspect("glazing_loading"));
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T15", "T21"] });
    for (const bottomOrder of [[], ["T15"], ["T15", "T15"], ["T15", "T21", "T22"], ["T15", "T22"]] as TechId[][]) {
      const error = t.expectRuleError("p1", take("face_up", "T01", bottomOrder), "INVALID_BOTTOM_ORDER");
      expectDocumentedDetails(error);
    }
    // When an inspected Tech is taken, it is not returned.
    t.expectRuleError("p1", take("inspected", "T15", ["T15", "T21"]), "INVALID_BOTTOM_ORDER");
    t.expectRuleError("p1", take("inspected", "T15", []), "INVALID_BOTTOM_ORDER");
    t.act("p1", take("inspected", "T15", ["T21"]));
    expect(t.state.hidden.techDecks.glazing_loading).toEqual(["T22", "T23", "T21"]);
  });

  it("GUILD_TAKE is the only way out of the inspection step", () => {
    const t = table();
    t.act("p1", inspect("firing"));
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    t.expectRuleError("p1", buy("p1:apprentice:1", "T01"), "WORKER_ACTION_ALREADY_TAKEN");
    t.expectRuleError("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O07" }, "WRONG_PHASE");
    t.expectRuleError("p2", take("face_up", "T01", ["T13", "T14"]), "NOT_YOUR_DECISION");
  });
});

describe("Colour Samples when acquired (L626, L650, R4, B1)", () => {
  it("looks at the top 3 Main Orders and reserves 1 — no resource, no display refill; hand limit 5", () => {
    const t = table();
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    const display = [...t.state.market.display];
    const events = t.act("p1", buy("p1:apprentice:1", "T10"));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "PERSONAL_SPACE_UNLOCKED",
      "TECH_DISPLAY_REFILLED",
      "PRIVATE_LOOK_OPENED",
    ]);
    expect(only(events, "PRIVATE_LOOK_OPENED")).toEqual({
      type: "PRIVATE_LOOK_OPENED",
      playerId: "p1",
      kind: "colour_samples",
      discipline: null,
      count: 3,
      secret: { visibleTo: "p1", orderIds: [a, b, c], techIds: [] },
    });
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "colour_samples", lookedCount: 3 } });

    // Mandatory: the turn cannot end until a card is reserved.
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    expectDocumentedDetails(t.expectRuleError("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O01" }, "INVALID_CHOICE"));

    const resources = { ...t.player("p1").resources };
    const chosen = t.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: c });
    expect(t.state.hidden.orderHands["p1"]).toEqual([c]);
    expect(types(chosen)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_DISCARDED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(chosen, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "colour_samples",
      source: "colour_samples",
      slotIndex: null,
      orderId: null,
      secret: { visibleTo: "p1", orderId: c },
    });
    expect(only(chosen, "LOOKED_ORDERS_DISCARDED")).toMatchObject({ count: 2, secret: { orderIds: [a, b] } });
    expect([...t.state.hidden.mainDiscard].sort()).toEqual([a, b].sort());
    expect(t.player("p1").resources).toEqual(resources);
    expect(t.state.market.display).toEqual(display);
    expect(t.state.market.refillPendingFor).toBeNull();
    expect(handLimit(t.player("p1"))).toBe(5);
    expect(handLimit(t.player("p2"))).toBe(4);
  });

  it("looks at as many as remain; with nothing to look at there is no reservation step", () => {
    const keep: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06", "O07"];
    const oneLeft = table({
      players: [{}, { hand: MAIN_ORDER_IDS.filter((id) => !keep.includes(id)) }],
      display: keep.slice(0, 6),
      mainDeck: ["O07"],
      mainDiscard: [],
    });
    oneLeft.act("p1", buy("p1:apprentice:1", "T10"));
    expect(oneLeft.state.phase).toMatchObject({ step: { kind: "colour_samples", lookedCount: 1 } });
    const chosen = oneLeft.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O07" });
    expect(types(chosen)).not.toContain("LOOKED_ORDERS_DISCARDED");

    const none = table({
      players: [{}, { hand: MAIN_ORDER_IDS.filter((id) => !keep.slice(0, 6).includes(id)) }],
      display: keep.slice(0, 6),
      mainDeck: [],
      mainDiscard: [],
    });
    const events = none.act("p1", buy("p1:apprentice:1", "T10"));
    expect(types(events)).not.toContain("PRIVATE_LOOK_OPENED");
    expect(none.state.phase).toMatchObject({ activePlayerId: "p2", step: { kind: "before_action" } });
    expect(none.state.hidden.orderHands["p1"]).toEqual([]);
  });

  it("takes from the deck only, reshuffling the discard when the deck is empty (editorial L390, L511)", () => {
    const keep: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08"];
    const t = table({
      players: [{}, { hand: MAIN_ORDER_IDS.filter((id) => !keep.includes(id)) }],
      display: keep.slice(0, 6),
      mainDeck: [],
      mainDiscard: ["O07", "O08"],
    });
    const events = t.act("p1", buy("p1:apprentice:1", "T10"));
    expect(types(events)).toContain("MAIN_DECK_RESHUFFLED");
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples", lookedCount: 2 } });
    expect(t.state.market.display).toEqual(keep.slice(0, 6));
  });

  it("also triggers when the Shifu takes it, after the return to the bottom and the refill", () => {
    const t = table();
    t.act("p1", inspect("glazing_loading"));
    const events = t.act("p1", take("face_up", "T10", ["T21", "T15"]));
    expect(t.player("p1").resources.coins).toBe(2);
    expect(types(events)).toEqual([
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "PERSONAL_SPACE_UNLOCKED",
      "TECHS_RETURNED_TO_BOTTOM",
      "TECH_DISPLAY_REFILLED",
      "PRIVATE_LOOK_OPENED",
    ]);
    expect(t.state.techDisplay.glazing_loading).toEqual(["T20", "T22"]);
    expect(t.state.hidden.techDecks.glazing_loading).toEqual(["T23", "T21", "T15"]);
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples", lookedCount: 3 } });
  });
});
