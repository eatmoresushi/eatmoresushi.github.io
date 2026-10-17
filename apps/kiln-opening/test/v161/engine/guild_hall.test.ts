/**
 * Guild Hall (v1.6.2 L202–214, L373–378, L625, L649, R4, B1, B2; owner revision 2026-10-17;
 * DESIGN §3.2 as amended by ENGINE_V1.6.2_DELTA.md §4.3):
 * - the Apprentice buys 1 face-up Tech at its printed cost;
 * - the Shifu privately inspects any discipline's top 2 (or as many as remain), then takes up
 *   to 2 Techs from different disciplines, face-up or inspected, each at its printed cost (no
 *   discount), and puts the untaken inspected Techs on the bottom in a chosen order (B2);
 * - a taken Tech's position stays empty until the taker's turn ends, then each discipline
 *   refills to 2 (v1.6.2 L209), so a Shifu's second Tech is chosen from what shows now;
 * - each gain resolves at once, before a second take: VP (A1), Cover token (L212), and
 *   Colour Samples' mandatory when-acquired reservation (L214, L625, R4), with no resource and
 *   no Main display refill; 3 total / 1 per discipline (L211).
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

function all<T extends GameEvent["type"]>(events: readonly GameEvent[], type: T): Array<Extract<GameEvent, { type: T }>> {
  return events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
}

function buy(workerId: string, techId: TechId): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId, choice: { kind: "buy_face_up", techId } };
}

function inspect(discipline: TechDiscipline): GameAction {
  return { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline } };
}

function take(kind: "face_up" | "inspected", techId: TechId): GameAction {
  return { type: "GUILD_TAKE", take: { kind, techId } };
}

function finish(bottomOrder: TechId[]): GameAction {
  return { type: "GUILD_FINISH", bottomOrder };
}

function owned(t: LocalTable, playerId: string): TechId[] {
  return t.player(playerId).techs.map((tech) => tech.id);
}

function coins(n: number): StateSpec {
  return { players: [{ resources: { coins: n } }, {}] };
}

/** p1 at Recognition 3 with a Shaped vessel: Imperial Priority keeps the after-action window
 * open, so the end of the turn can be observed separately (L293). */
function withWindow(extra: StateSpec = {}): StateSpec {
  return { players: [{ recognition: 3 }, {}], ceramics: [{ owner: "p1", shape: "vase", stage: "shaped", decoration: "carved" }], ...extra };
}

describe("Apprentice (v1.6.2 L206): pay the printed cost and take 1 face-up Advanced Tech", () => {
  it("pays the printed cost and removes the Cover token at once; the position stays empty until the turn ends (v1.6.2 L209, L212)", () => {
    const t = table(withWindow());
    expect(t.state.techDisplay.workshop).toEqual(["T01", "T16"]);
    const events = t.act("p1", buy("p1:apprentice:1", "T01"));

    expect(owned(t, "p1")).toEqual(["T01"]);
    expect(t.player("p1").resources.coins).toBe(1);
    expect(t.player("p1").personalSpaces.form_decorate[1].unlocked).toBe(true);
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "TECH_ACQUIRED", "PERSONAL_SPACE_UNLOCKED"]);
    expect(only(events, "RESOURCES_CHANGED")).toMatchObject({ coins: -2, reason: "guild_hall" });
    expect(only(events, "TECH_ACQUIRED")).toEqual({ type: "TECH_ACQUIRED", playerId: "p1", techId: "T01", source: "face_up", cost: 2, vp: 1 });
    // The after-action window is still the taker's turn: the position stays empty.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    expect(t.state.techDisplay.workshop).toEqual(["T16"]);
    expect(t.state.hidden.techDecks.workshop).toEqual(["T05", "T17", "T18", "T19"]);

    const ended = t.act("p1", { type: "END_TURN" });
    expect(types(ended)).toEqual(["TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(ended, "TECH_DISPLAY_REFILLED")).toEqual({ type: "TECH_DISPLAY_REFILLED", discipline: "workshop", revealedTechIds: ["T05"], display: ["T16", "T05"] });
    expect(t.state.techDisplay.workshop).toEqual(["T16", "T05"]);
  });

  it("refills when a turn with no after-action window ends by itself", () => {
    const t = table();
    const events = t.act("p1", buy("p1:apprentice:1", "T01"));
    expect(types(events)).toEqual([
      "WORKER_PLACED",
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "PERSONAL_SPACE_UNLOCKED",
      "TECH_DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(t.state.techDisplay.workshop).toEqual(["T16", "T05"]);
  });

  it("a Firing Tech removes no Cover token (L212); Protective Saggars costs 3 (v1.6.2 L636)", () => {
    const t = table();
    const events = t.act("p1", buy("p1:apprentice:1", "T11"));
    expect(only(events, "TECH_ACQUIRED")).toMatchObject({ techId: "T11", cost: 3 });
    expect(t.player("p1").resources.coins).toBe(0);
    expect(types(events)).not.toContain("PERSONAL_SPACE_UNLOCKED");
    expect(t.player("p1").personalSpaces.form_decorate[1].unlocked).toBe(false);
    expect(t.player("p1").personalSpaces.glaze_load[1].unlocked).toBe(false);
  });

  it("a space whose Cover token is removed may be used later the same round (L212)", () => {
    const t = table({ placements: [{ player: "p1", worker: 2, locationId: "form_decorate" }] });
    expect(validatePlacement(t.actorView("p1"), "p1:shifu", "form_decorate", false)?.code).toBe("PERSONAL_SPACE_LOCKED");
    t.act("p1", buy("p1:apprentice:1", "T16"));
    t.act("p2", { type: "PLACE_COMMISSION_MARKET", workerId: "p2:shifu" });
    const looked = t.state.hidden.pendingLook?.kind === "commission_market" ? t.state.hidden.pendingLook.orderIds : [];
    t.act("p2", { type: "COMMISSION_CHOOSE", reservations: [{ kind: "looked", orderId: looked[0] as OrderId }] });
    expect(t.prompt().actorIds).toEqual(["p1"]);
    expect(validatePlacement(t.actorView("p1"), "p1:shifu", "form_decorate", false)).toBeNull();
  });

  it("refuses a Tech that is not face up, one it cannot afford, and a second Tech of an owned discipline", () => {
    const t = table({ players: [{ techs: ["T11"], resources: { coins: 2 } }, {}] });
    expectDocumentedDetails(t.expectRuleError("p1", buy("p1:apprentice:1", "T05"), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", buy("p1:apprentice:1", "T12"), "TECH_DISCIPLINE_OWNED"));
    expect(t.state.techDisplay.workshop).toEqual(["T01", "T16"]);

    const poor = table(coins(2));
    const error = poor.expectRuleError("p1", buy("p1:apprentice:1", "T11"), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 3, have: 2 });
    expectDocumentedDetails(error);
    // Fuel Ledger now costs 2 (v1.6.2 L637), which 2 Coins cover.
    poor.act("p1", buy("p1:apprentice:1", "T12"));
    expect(poor.player("p1").resources.coins).toBe(0);
  });
});

describe("Shifu (v1.6.2 L207, B2): private inspection, then up to 2 Techs from different disciplines at printed cost", () => {
  it("takes 1 inspected Tech at its printed cost; with no second take possible the step closes by itself", () => {
    const t = table();
    expect(t.state.hidden.techDecks.firing).toEqual(["T13", "T14", "T24", "T25"]);
    const lookEvents = t.act("p1", inspect("firing"));
    expect(t.state.hidden.pendingLook).toEqual({ kind: "guild_inspection", playerId: "p1", discipline: "firing", techIds: ["T13", "T14"] });
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25"]);
    expect(t.state.phase).toEqual({
      type: "work_turn",
      activePlayerId: "p1",
      step: { kind: "guild_inspection", workerId: "p1:shifu", discipline: "firing", inspectedCount: 2, takes: [] },
    });
    expect(types(lookEvents)).toEqual(["WORKER_PLACED", "PRIVATE_LOOK_OPENED"]);
    expect(t.player("p1").resources.coins).toBe(3);

    // Test Pieces costs 3 and the Shifu pays all 3 (no discount); with 0 Coins left and Firing
    // owned, no second take is possible, so T14 goes to the bottom by itself (forced order).
    const events = t.act("p1", take("inspected", "T13"));
    expect(owned(t, "p1")).toEqual(["T13"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T14"]);
    expect(t.state.techDisplay.firing).toEqual(["T11", "T12"]);
    expect(t.state.hidden.pendingLook).toBeNull();
    expect(types(events)).toEqual(["RESOURCES_CHANGED", "TECH_ACQUIRED", "TECHS_RETURNED_TO_BOTTOM", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(events, "TECH_ACQUIRED")).toMatchObject({ techId: "T13", source: "inspected", cost: 3, vp: 1 });
    expect(only(events, "RESOURCES_CHANGED")).toMatchObject({ coins: -3, reason: "guild_hall" });
  });

  it("takes a face-up and an inspected Tech of different disciplines, the second chosen from what shows now", () => {
    const t = table(coins(5));
    t.act("p1", inspect("firing"));
    const first = t.act("p1", take("face_up", "T01"));
    // The Cover token comes off at once, before the second take (L212, L214).
    expect(types(first)).toEqual(["RESOURCES_CHANGED", "TECH_ACQUIRED", "PERSONAL_SPACE_UNLOCKED"]);
    expect(t.player("p1").resources.coins).toBe(3);
    expect(t.player("p1").score.techs).toBe(1);
    expect(t.state.phase).toMatchObject({ step: { kind: "guild_inspection", takes: [{ kind: "face_up", techId: "T01" }] } });
    // T01's position stays empty: the Workshop deck's top card is not showing, and the other
    // Workshop Tech is of a discipline now owned.
    expect(t.state.techDisplay.workshop).toEqual(["T16"]);
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T05"), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T16"), "TECH_DISCIPLINE_OWNED"));

    const second = t.act("p1", take("inspected", "T13"));
    expect(owned(t, "p1")).toEqual(["T01", "T13"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(t.player("p1").score.techs).toBe(2);
    expect(types(second)).toEqual([
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "TECHS_RETURNED_TO_BOTTOM",
      "TECH_DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(second, "TECH_ACQUIRED")).toMatchObject({ techId: "T13", source: "inspected", cost: 3 });
    expect(only(second, "TECHS_RETURNED_TO_BOTTOM")).toMatchObject({ discipline: "firing", count: 1, secret: { techIds: ["T14"] } });
    expect(only(second, "TECH_DISPLAY_REFILLED")).toMatchObject({ discipline: "workshop", revealedTechIds: ["T05"] });
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T14"]);
  });

  it("two face-up takes, then GUILD_FINISH with the bottom order; a third take is refused; both disciplines refill when the turn ends", () => {
    const t = table(coins(6));
    t.act("p1", inspect("workshop"));
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T05", "T17"] });
    t.act("p1", take("face_up", "T20"));
    t.act("p1", take("face_up", "T12"));
    expect(t.player("p1").resources.coins).toBe(1);
    // Two inspected Techs are still untaken, so the bottom order is the Shifu's to choose.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "guild_inspection", takes: [{ techId: "T20" }, { techId: "T12" }] } });
    const limit = t.expectRuleError("p1", take("inspected", "T05"), "TECH_TAKE_LIMIT");
    expect(limit.details).toMatchObject({ limit: 2 });
    expectDocumentedDetails(limit);
    expect(t.state.techDisplay.glazing_loading).toEqual(["T10"]);
    expect(t.state.techDisplay.firing).toEqual(["T11"]);

    const events = t.act("p1", finish(["T17", "T05"]));
    expect(types(events)).toEqual(["TECHS_RETURNED_TO_BOTTOM", "TECH_DISPLAY_REFILLED", "TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(all(events, "TECH_DISPLAY_REFILLED").map((event) => [event.discipline, event.revealedTechIds])).toEqual([
      ["glazing_loading", ["T15"]],
      ["firing", ["T13"]],
    ]);
    expect(t.state.hidden.techDecks.workshop).toEqual(["T18", "T19", "T17", "T05"]);
    expect(t.state.techDisplay.workshop).toEqual(["T01", "T16"]);
    expect(owned(t, "p1")).toEqual(["T20", "T12"]);
  });

  it("returns the untaken Techs to the bottom first and refills at the turn end, so the chosen order decides the reveal (B2)", () => {
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
      t.act("p1", take("face_up", "T01"));
      expect(t.state.techDisplay.workshop).toEqual(["T16"]);
      const events = t.act("p1", finish([...bottomOrder]));
      expect(types(events).indexOf("TECHS_RETURNED_TO_BOTTOM")).toBeLessThan(types(events).indexOf("TECH_DISPLAY_REFILLED"));
      expect(t.state.techDisplay.workshop).toEqual(["T16", revealed]);
      expect(t.state.hidden.techDecks.workshop).toEqual(bottomOrder.filter((id) => id !== revealed));
    }
  });

  it("'up to 2' is 1 or 2, never 0: GUILD_FINISH needs a take, and after 1 it declines the second", () => {
    const t = table(coins(5));
    t.act("p1", inspect("firing"));
    const required = t.expectRuleError("p1", finish(["T13", "T14"]), "TECH_TAKE_REQUIRED");
    expectDocumentedDetails(required);
    t.act("p1", take("face_up", "T01"));
    const events = t.act("p1", finish(["T14", "T13"]));
    expect(owned(t, "p1")).toEqual(["T01"]);
    expect(t.player("p1").resources.coins).toBe(3);
    expect(types(events)).toEqual(["TECHS_RETURNED_TO_BOTTOM", "TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T14", "T13"]);
  });

  it("stays open while a second take may be possible and closes by itself after the second take", () => {
    const t = table(coins(5));
    t.act("p1", inspect("firing"));
    t.act("p1", take("inspected", "T14"));
    // Firing is owned now, but a 2-Coin face-up Tech of another discipline is affordable.
    expect(t.player("p1").resources.coins).toBe(3);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "guild_inspection", takes: [{ kind: "inspected", techId: "T14" }] } });
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T13"] });
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T13"), "TECH_DISCIPLINE_OWNED"));
    const events = t.act("p1", take("face_up", "T01"));
    expect(types(events)).toEqual([
      "RESOURCES_CHANGED",
      "TECH_ACQUIRED",
      "PERSONAL_SPACE_UNLOCKED",
      "TECHS_RETURNED_TO_BOTTOM",
      "TECH_DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(owned(t, "p1")).toEqual(["T14", "T01"]);
    expect(t.state.hidden.techDecks.firing).toEqual(["T24", "T25", "T13"]);
  });

  it("the 3-total limit applies to both takes (L211)", () => {
    // Owning 2 Techs, the first take makes 3: the second is refused (TECH_LIMIT).
    const t = table({ players: [{ techs: ["T01", "T20"], resources: { coins: 6 } }, {}] });
    t.act("p1", inspect("firing"));
    t.act("p1", take("face_up", "T11"));
    expect(t.player("p1").techs).toHaveLength(3);
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T13"), "TECH_LIMIT"));
    t.act("p1", finish(["T13", "T14"]));
    expect(t.player("p1").techs).toHaveLength(3);
    // With 1 untaken inspected Tech and 3 Techs owned, the step closes by itself.
    const u = table({ players: [{ techs: ["T01", "T20"], resources: { coins: 6 } }, {}] });
    u.act("p1", inspect("firing"));
    const events = u.act("p1", take("inspected", "T13"));
    expect(types(events)).toContain("TECHS_RETURNED_TO_BOTTOM");
    expect(u.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("may inspect a discipline it already owns (B2) and an exhausted deck, then take a face-up Tech", () => {
    // 4 players each own a Firing Tech, so the Firing deck is empty and p1 owns Firing.
    const t = table({ players: [{ techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }, { techs: ["T25"] }] });
    expect(t.state.hidden.techDecks.firing).toEqual([]);
    const lookEvents = t.act("p1", inspect("firing"));
    expect(only(lookEvents, "PRIVATE_LOOK_OPENED")).toMatchObject({ discipline: "firing", count: 0 });
    expect(t.state.phase).toMatchObject({ step: { kind: "guild_inspection", inspectedCount: 0, takes: [] } });
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T11"), "TECH_DISCIPLINE_OWNED"));
    const events = t.act("p1", take("face_up", "T01"));
    expect(types(events)).not.toContain("TECHS_RETURNED_TO_BOTTOM");
    expect(owned(t, "p1")).toEqual(["T13", "T01"]);
    // 1 Coin left buys nothing more, and nothing was inspected: the step closed by itself.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("sees as many as remain when fewer than 2 are left (v1.6.2 L207), and pays the printed 4 for Tribute Ware", () => {
    const t = table({ players: [{ resources: { coins: 4 } }, { techs: ["T13"] }, { techs: ["T14"] }, { techs: ["T24"] }] });
    expect(t.state.hidden.techDecks.firing).toEqual(["T25"]);
    t.act("p1", inspect("firing"));
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T25"] });
    t.act("p1", take("inspected", "T25"));
    expect(owned(t, "p1")).toEqual(["T25"]);
    expect(t.player("p1").resources.coins).toBe(0);
  });

  it("refuses a Tech that is neither face up nor inspected, an owned discipline, and a printed cost it cannot pay", () => {
    const t = table({ players: [{ techs: ["T01"], resources: { coins: 2 } }, {}] });
    t.act("p1", inspect("workshop"));
    expect(t.state.techDisplay.workshop).toEqual(["T16", "T05"]);
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T17", "T18"] });
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T19"), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T13"), "TECH_NOT_AVAILABLE"));
    expectDocumentedDetails(t.expectRuleError("p1", take("inspected", "T17"), "TECH_DISCIPLINE_OWNED"));
    expectDocumentedDetails(t.expectRuleError("p1", take("face_up", "T05"), "TECH_DISCIPLINE_OWNED"));
    // No Shifu discount: Protective Saggars costs the Shifu the printed 3.
    const error = t.expectRuleError("p1", take("face_up", "T11"), "INSUFFICIENT_RESOURCES");
    expect(error.details).toMatchObject({ resource: "coins", needed: 3, have: 2 });
    expectDocumentedDetails(error);
    const paid = t.act("p1", take("face_up", "T12"));
    expect(only(paid, "TECH_ACQUIRED")).toMatchObject({ techId: "T12", cost: 2 });
    expect(t.player("p1").resources.coins).toBe(0);
  });

  it("the bottom order must list every untaken inspected Tech exactly once (INVALID_BOTTOM_ORDER)", () => {
    const t = table();
    t.act("p1", inspect("glazing_loading"));
    expect(t.state.hidden.pendingLook).toMatchObject({ techIds: ["T15", "T21"] });
    t.act("p1", take("face_up", "T01"));
    for (const bottomOrder of [[], ["T15"], ["T15", "T15"], ["T15", "T21", "T22"], ["T15", "T22"]] as TechId[][]) {
      const error = t.expectRuleError("p1", finish(bottomOrder), "INVALID_BOTTOM_ORDER");
      expectDocumentedDetails(error);
    }
    t.act("p1", finish(["T21", "T15"]));
    expect(t.state.hidden.techDecks.glazing_loading).toEqual(["T22", "T23", "T21", "T15"]);

    // An inspected take leaves the look; its forced bottom order of 1 is applied by itself.
    const u = table();
    u.act("p1", inspect("glazing_loading"));
    u.act("p1", take("inspected", "T15"));
    expect(u.state.hidden.techDecks.glazing_loading).toEqual(["T22", "T23", "T21"]);
    expect(u.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("GUILD_TAKE and GUILD_FINISH are the only ways out of the inspection step, and only there", () => {
    const t = table();
    t.expectRuleError("p1", take("face_up", "T01"), "WRONG_PHASE");
    t.expectRuleError("p1", finish([]), "WRONG_PHASE");
    t.act("p1", inspect("firing"));
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    t.expectRuleError("p1", buy("p1:apprentice:1", "T01"), "WORKER_ACTION_ALREADY_TAKEN");
    t.expectRuleError("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O07" }, "WRONG_PHASE");
    t.expectRuleError("p2", take("face_up", "T01"), "NOT_YOUR_DECISION");
    t.expectRuleError("p2", finish(["T13", "T14"]), "NOT_YOUR_DECISION");
  });
});

describe("Colour Samples when acquired (v1.6.2 L214, L625, L649, R4, B1)", () => {
  it("an Apprentice buy looks at the top 3 Main Orders and reserves 1 — no resource, no Main display refill; hand limit 5", () => {
    const t = table();
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    const display = [...t.state.market.display];
    const events = t.act("p1", buy("p1:apprentice:1", "T10"));
    expect(types(events)).toEqual(["WORKER_PLACED", "RESOURCES_CHANGED", "TECH_ACQUIRED", "PERSONAL_SPACE_UNLOCKED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "PRIVATE_LOOK_OPENED")).toEqual({
      type: "PRIVATE_LOOK_OPENED",
      playerId: "p1",
      kind: "colour_samples",
      discipline: null,
      count: 3,
      secret: { visibleTo: "p1", orderIds: [a, b, c], techIds: [] },
    });
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "colour_samples", lookedCount: 3, resume: null } });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "colour_samples", playerId: "p1", orderIds: [a, b, c], inspection: null });
    expect(t.state.techDisplay.glazing_loading).toEqual(["T20"]);

    // Mandatory: the turn cannot end until a card is reserved.
    t.expectRuleError("p1", { type: "END_TURN" }, "WRONG_PHASE");
    expectDocumentedDetails(t.expectRuleError("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: "O01" }, "INVALID_CHOICE"));

    const resources = { ...t.player("p1").resources };
    const chosen = t.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: c });
    expect(t.state.hidden.orderHands["p1"]).toEqual([c]);
    // The swap is usable the round Colour Samples is acquired (v1.6.2 L213, L625): with an Order
    // now held, the after-action window opens, and the Tech display refills only at END_TURN.
    expect(types(chosen)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM"]);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    expect(t.state.techDisplay.glazing_loading).toEqual(["T20"]);
    expect(types(t.act("p1", { type: "END_TURN" }))).toEqual(["TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(chosen, "ORDER_RESERVED")).toEqual({
      type: "ORDER_RESERVED",
      playerId: "p1",
      via: "colour_samples",
      source: "looked",
      slotIndex: null,
      orderId: null,
      secret: { visibleTo: "p1", orderId: c },
    });
    // The other 2 go to the bottom of the Main deck (change 24), not the discard, in random
    // order (R19); the secret names them in look order.
    expect(only(chosen, "LOOKED_ORDERS_TO_BOTTOM")).toMatchObject({ count: 2, secret: { orderIds: [a, b] } });
    expect([...t.state.hidden.mainDeck.slice(-2)].sort()).toEqual([a, b].sort());
    expect(t.state.hidden.mainDiscard).toEqual([]);
    expect(t.player("p1").resources).toEqual(resources);
    expect(t.state.market.display).toEqual(display);
    expect(t.state.market.refillPendingFor).toBeNull();
    expect(t.state.techDisplay.glazing_loading).toEqual(["T20", "T15"]);
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
    expect(types(chosen)).not.toContain("LOOKED_ORDERS_TO_BOTTOM");

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

  it("takes from the deck only, reshuffling the discard when the deck is empty (L511)", () => {
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

  it("a Shifu's first take: the reservation resolves before the second take, while the inspection waits privately", () => {
    const t = table(coins(5));
    const [a, b, c] = t.state.hidden.mainDeck as [OrderId, OrderId, OrderId];
    t.act("p1", inspect("firing"));
    const events = t.act("p1", take("face_up", "T10"));
    expect(types(events)).toEqual(["RESOURCES_CHANGED", "TECH_ACQUIRED", "PERSONAL_SPACE_UNLOCKED", "PRIVATE_LOOK_OPENED"]);
    expect(only(events, "TECH_ACQUIRED")).toMatchObject({ techId: "T10", cost: 2 });
    expect(t.state.phase).toEqual({
      type: "work_turn",
      activePlayerId: "p1",
      step: {
        kind: "colour_samples",
        lookedCount: 3,
        resume: { kind: "guild_inspection", workerId: "p1:shifu", discipline: "firing", inspectedCount: 2, takes: [{ kind: "face_up", techId: "T10" }] },
      },
    });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "colour_samples", playerId: "p1", orderIds: [a, b, c], inspection: { discipline: "firing", techIds: ["T13", "T14"] } });
    // L214: the reservation comes first.
    t.expectRuleError("p1", take("inspected", "T13"), "WRONG_PHASE");
    t.expectRuleError("p1", finish(["T13", "T14"]), "WRONG_PHASE");

    const chosen = t.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId: b });
    expect(types(chosen)).toEqual(["ORDER_RESERVED", "LOOKED_ORDERS_TO_BOTTOM"]);
    expect([...t.state.hidden.mainDeck.slice(-2)].sort()).toEqual([a, c].sort());
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "guild_inspection", takes: [{ kind: "face_up", techId: "T10" }] } });
    expect(t.state.hidden.pendingLook).toEqual({ kind: "guild_inspection", playerId: "p1", discipline: "firing", techIds: ["T13", "T14"] });
    expect(t.state.hidden.orderHands["p1"]).toEqual([b]);

    const second = t.act("p1", take("inspected", "T13"));
    expect(types(second)).toEqual(["RESOURCES_CHANGED", "TECH_ACQUIRED", "TECHS_RETURNED_TO_BOTTOM"]);
    // Colour Samples' swap is ready and an Order is held: the after-action window opens.
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    expect(types(t.act("p1", { type: "END_TURN" }))).toEqual(["TECH_DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(owned(t, "p1")).toEqual(["T10", "T13"]);
    expect(t.player("p1").resources.coins).toBe(0);
    expect(t.state.techDisplay.glazing_loading).toEqual(["T20", "T15"]);
  });

  it("a Shifu's second take: after the reservation the Shifu still chooses the bottom order", () => {
    const t = table(coins(5));
    t.act("p1", inspect("workshop"));
    t.act("p1", take("face_up", "T12"));
    t.act("p1", take("face_up", "T10"));
    expect(t.state.phase).toMatchObject({ step: { kind: "colour_samples", resume: { takes: [{ techId: "T12" }, { techId: "T10" }] } } });
    const look = t.state.hidden.pendingLook;
    const orderId = look?.kind === "colour_samples" ? (look.orderIds[0] as OrderId) : ("O01" as OrderId);
    t.act("p1", { type: "COLOUR_SAMPLES_CHOOSE", orderId });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "guild_inspection", takes: [{ techId: "T12" }, { techId: "T10" }] } });
    t.expectRuleError("p1", take("inspected", "T05"), "TECH_TAKE_LIMIT");
    const finished = t.act("p1", finish(["T05", "T17"]));
    expect(types(finished)).toEqual(["TECHS_RETURNED_TO_BOTTOM"]);
    const events = t.act("p1", { type: "END_TURN" });
    expect(all(events, "TECH_DISPLAY_REFILLED").map((event) => event.discipline)).toEqual(["glazing_loading", "firing"]);
    expect(t.state.hidden.techDecks.workshop).toEqual(["T18", "T19", "T05", "T17"]);
  });
});
