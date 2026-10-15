/**
 * Canal Barge (T23, L631, L646, R4, R6; INT: before/after window, deferred refill): once per
 * round, before or after one of your worker actions, complete 1 held Order following every
 * rule for completing Orders — including Ru, Guan, Tribute Ware and Crackle wildcards. It is
 * not a worker action; the worker action is still due when it is used before it.
 */

import { describe, expect, it } from "vitest";
import { projectEvent } from "../../../src/game/view.ts";
import type { GameAction, GameEvent, OrderId } from "../../../src/game/types.ts";
import { type CeramicSpec, type StateSpec, buildState } from "./support/fixtures.ts";
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

function barge(orderId: OrderId, ceramicIds: string[], extra: Partial<Extract<GameAction, { type: "USE_CANAL_BARGE" }>> = {}): GameAction {
  return { type: "USE_CANAL_BARGE", orderId, ceramicIds, ...extra };
}

/** A worker action that resolves in one command: a face-up reservation with its resource. */
function reserveFaceUp(t: LocalTable, playerId: string, workerId: string, slotIndex = 0): GameAction {
  const orderId = t.state.market.display[slotIndex];
  if (orderId === null || orderId === undefined) throw new Error(`no Order at ${slotIndex}`);
  return { type: "PLACE_COMMISSION_MARKET", workerId: `${playerId}:${workerId}`, first: { kind: "face_up", slotIndex, orderId, gain: "coins" } };
}

const WHITE_BOWL: CeramicSpec = { owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "standard" };
const WHITE_PLATE: CeramicSpec = { owner: "p1", shape: "plate", stage: "finished", glaze: "white", quality: "standard" };

describe("before the worker action", () => {
  it("completes a held Order; the worker action is still due and the barge is spent for the round", () => {
    const t = table({ players: [{ techs: ["T23"], hand: ["O01", "O02"] }, {}], ceramics: [WHITE_BOWL, WHITE_PLATE] });
    const events = t.act("p1", barge("O01", ["c1"]));
    expect(types(events)).toEqual(["TECH_USED", "ORDER_COMPLETED", "RESOURCES_CHANGED"]);
    expect(only(events, "TECH_USED")).toEqual({ type: "TECH_USED", playerId: "p1", techId: "T23" });
    expect(only(events, "ORDER_COMPLETED").record).toMatchObject({ orderId: "O01", via: "canal_barge", vp: 3, coins: 3, ceramicIds: ["c1"] });
    expect(t.player("p1").score.orders).toBe(3);
    expect(t.player("p1").resources.coins).toBe(6);
    expect(t.state.ceramics["c1"]).toMatchObject({ stage: "delivered", orderId: "O01" });
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O02"]);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });

    // Not a worker action: the turn cannot end yet (L142, L646).
    t.expectRuleError("p1", { type: "END_TURN" }, "WORKER_ACTION_REQUIRED");
    expectDocumentedDetails(t.expectRuleError("p1", barge("O02", ["c2"]), "TECH_ALREADY_USED"));

    // With the barge spent and no Imperial Priority, the turn ends right after the action.
    const placed = t.act("p1", reserveFaceUp(t, "p1", "apprentice:1"));
    expect(only(placed, "WORK_TURN_ENDED").automatic).toBe(true);
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });
});

describe("after the worker action", () => {
  it("the window opens whenever the barge is unused — even with nothing completable (DESIGN §4.5) — and declining keeps it (R4)", () => {
    const t = table({ players: [{ techs: ["T23"] }, {}] });
    t.act("p1", reserveFaceUp(t, "p1", "apprentice:1"));
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    // The deferred refill waits for the end of the turn.
    expect(t.state.market.display[0]).toBeNull();

    const ended = t.act("p1", { type: "END_TURN" });
    expect(types(ended)).toEqual(["DISPLAY_REFILLED", "WORK_TURN_ENDED", "WORK_TURN_STARTED"]);
    expect(only(ended, "WORK_TURN_ENDED").automatic).toBe(false);
    expect(t.player("p1").techs).toEqual([{ id: "T23", acquiredInRound: 1, usedThisRound: false }]);
  });

  it("completes an Order reserved by the same action, before the deferred refill (INT)", () => {
    const t = table({ players: [{ techs: ["T23"] }, {}], ceramics: [WHITE_BOWL] });
    expect(t.state.market.display[0]).toBe("O01");
    t.act("p1", reserveFaceUp(t, "p1", "apprentice:1"));
    expect(t.state.hidden.orderHands["p1"]).toEqual(["O01"]);
    expect(t.state.phase).toMatchObject({ step: { kind: "after_action" } });

    const events = t.act("p1", barge("O01", ["c1"]));
    expect(types(events)).toEqual([
      "TECH_USED",
      "ORDER_COMPLETED",
      "RESOURCES_CHANGED",
      "DISPLAY_REFILLED",
      "WORK_TURN_ENDED",
      "WORK_TURN_STARTED",
    ]);
    expect(only(events, "WORK_TURN_ENDED").automatic).toBe(true);
    expect(t.player("p1").completedOrders.map((record) => [record.orderId, record.via])).toEqual([["O01", "canal_barge"]]);
    expect(t.state.market.display).toEqual(["O02", "O03", "O04", "O05", "O06", "O07"]);
  });

  it("a Crown completed in the window that reaches Recognition 3 makes Imperial Priority usable within it (INT)", () => {
    const t = table({
      players: [{ techs: ["T23"], recognition: 2, hand: ["O18"] }, {}],
      ceramics: [
        { owner: "p1", shape: "vase", stage: "finished", glaze: "celadon", quality: "fine" },
        { owner: "p1", shape: "bowl", stage: "shaped" },
      ],
    });
    t.act("p1", reserveFaceUp(t, "p1", "apprentice:1"));
    const events = t.act("p1", barge("O18", ["c1"]));
    expect(types(events)).toContain("IMPERIAL_PRIORITY_GAINED");
    expect(t.player("p1").imperial).toMatchObject({ recognition: 3, priority: "held" });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });

    const used = t.act("p1", { type: "USE_IMPERIAL_PRIORITY", ceramicId: "c2", glaze: "white", imperialModifier: 0 });
    expect(only(used, "WORK_TURN_ENDED").automatic).toBe(true);
    expect(t.state.ceramics["c2"]).toMatchObject({ stage: "loaded", loadedBy: "imperial_priority" });
  });
});

describe("a Canal Barge acquired this round (L213)", () => {
  it("is usable right after the Guild Hall action that acquired it", () => {
    const t = table({ players: [{ hand: ["S01"] }, {}], ceramics: [WHITE_BOWL], techDisplay: { glazing_loading: ["T23", "T10"] } });
    t.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:apprentice:1", choice: { kind: "buy_face_up", techId: "T23" } });
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "after_action" } });
    const events = t.act("p1", barge("S01", ["c1"]));
    expect(only(events, "ORDER_COMPLETED").record).toMatchObject({ orderId: "S01", via: "canal_barge" });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("is usable after the Shifu's inspection step resolves", () => {
    const t = table({ players: [{ hand: ["S01"] }, {}], ceramics: [WHITE_BOWL], techDecks: { glazing_loading: ["T23", "T15", "T21", "T22"] } });
    t.act("p1", { type: "PLACE_GUILD_HALL", workerId: "p1:shifu", choice: { kind: "inspect", discipline: "glazing_loading" } });
    t.act("p1", { type: "GUILD_TAKE", take: { kind: "inspected", techId: "T23" }, bottomOrder: ["T15"] });
    expect(t.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    t.act("p1", barge("S01", ["c1"]));
    expect(t.player("p1").completedOrders).toHaveLength(1);
  });
});

describe("every completion effect applies (R6)", () => {
  it("Ru: an actual Celadon Plain Masterpiece scores 4 VP; declining keeps the Ru use", () => {
    const spec: StateSpec = {
      players: [{ techs: ["T23"], hand: ["O22"] }, {}],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "finished", glaze: "celadon", decoration: "plain", quality: "masterpiece" }],
    };
    const t = table(spec);
    expect(t.player("p1").kilnId).toBe("RU");
    const events = t.act("p1", barge("O22", ["c1"]));
    expect(only(events, "ORDER_COMPLETED").record).toMatchObject({ via: "canal_barge", kilnAbility: { kilnId: "RU", vp: 4, coins: 0 } });
    expect(types(events)).toContain("KILN_ABILITY_USED");
    expect(t.player("p1").score.kilnAbilities).toBe(4);
    expect(t.player("p1").kilnAbilityUsedThisRound).toBe(true);

    const declined = table(spec);
    const declinedEvents = declined.act("p1", barge("O22", ["c1"], { declineKilnAbility: true }));
    expect(only(declinedEvents, "ORDER_COMPLETED").record.kilnAbility).toBeNull();
    expect(declined.player("p1").kilnAbilityUsedThisRound).toBe(false);
  });

  it("Guan and Tribute Ware: an Order showing a Crown gains 2 Coins + 1 VP and a bonus Crown", () => {
    const t = table({
      firstPlayerId: "p2",
      players: [{}, { techs: ["T23", "T25"], hand: ["O18"] }],
      ceramics: [{ owner: "p2", shape: "vase", stage: "finished", glaze: "celadon", quality: "fine" }],
    });
    expect(t.player("p2").kilnId).toBe("GU");
    const events = t.act("p2", barge("O18", ["c1"]));
    const record = only(events, "ORDER_COMPLETED").record;
    expect(record).toMatchObject({ via: "canal_barge", printedCrowns: 1, bonusCrowns: 1, kilnAbility: { kilnId: "GU", vp: 1, coins: 2 } });
    expect(t.player("p2").imperial).toMatchObject({ recognition: 2, kilnGained: true });
    expect(t.player("p2").score).toMatchObject({ orders: 6, kilnAbilities: 1 });
    expect(t.player("p2").techs.map((tech) => [tech.id, tech.usedThisRound])).toEqual([
      ["T23", true],
      ["T25", true],
    ]);
  });

  it("Crackle: a Crackle ceramic counts as a declared Decoration (searched when omitted)", () => {
    const spec: StateSpec = {
      firstPlayerId: "p3",
      players: [{}, {}, { techs: ["T23"], hand: ["O17"] }],
      ceramics: [{ owner: "p3", shape: "washer", stage: "finished", glaze: "white", decoration: "carved", quality: "fine", crackle: true }],
    };
    const searched = table(spec);
    const events = searched.act("p3", barge("O17", ["c1"]));
    expect(only(events, "ORDER_COMPLETED").record.crackleDeclarations).toEqual([{ ceramicId: "c1", decoration: "painted" }]);
    expect(searched.state.ceramics["c1"]).toMatchObject({ stage: "delivered", decoration: "carved", crackle: true });

    const declared = table(spec);
    declared.act("p3", barge("O17", ["c1"], { crackleDeclarations: [{ ceramicId: "c1", decoration: "painted" }] }));
    expect(declared.player("p3").completedOrders).toHaveLength(1);
    const wrong = table(spec);
    expectDocumentedDetails(
      wrong.expectRuleError("p3", barge("O17", ["c1"], { crackleDeclarations: [{ ceramicId: "c1", decoration: "impressed" }] }), "INVALID_CRACKLE_DECLARATION"),
    );
  });
});

describe("refusals", () => {
  it("needs the Tech, a held Order and matching Finished ceramics", () => {
    const unowned = table({ players: [{ hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    expectDocumentedDetails(unowned.expectRuleError("p1", barge("O01", ["c1"]), "TECH_NOT_OWNED"));

    const t = table({ players: [{ techs: ["T23"], hand: ["O02"] }, {}], ceramics: [WHITE_BOWL] });
    // Face-up Orders cannot be completed (L296): only held Orders.
    expectDocumentedDetails(t.expectRuleError("p1", barge("O01", ["c1"]), "ORDER_NOT_HELD"));
    expectDocumentedDetails(t.expectRuleError("p1", barge("O02", ["c1"]), "ORDER_REQUIREMENTS_NOT_MET"));
    t.expectRuleError("p2", barge("O02", ["c1"]), "NOT_YOUR_DECISION");
  });

  it("is not usable in the middle of a worker action", () => {
    const t = table({ players: [{ techs: ["T23"], hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    t.act("p1", { type: "PLACE_COMMISSION_MARKET", workerId: "p1:apprentice:1", first: { kind: "blind" } });
    const error = t.expectRuleError("p1", barge("O01", ["c1"]), "WRONG_PHASE");
    expect(error.details).toMatchObject({ step: "commission_market" });
    expectDocumentedDetails(error);
    t.act("p1", { type: "COMMISSION_GAIN", resource: "wood" });
    t.act("p1", barge("O01", ["c1"]));
    expect(t.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("the public log reveals the completed Order (L409) but no other held Order", () => {
    const t = table({ players: [{ techs: ["T23"], hand: ["O01", "O30"] }, {}], ceramics: [WHITE_BOWL] });
    t.act("p1", barge("O01", ["c1"]));
    const publicLog = JSON.stringify(t.events.map(projectEvent));
    expect(publicLog).toContain('"O01"');
    expect(publicLog).not.toContain('"O30"');
  });
});
