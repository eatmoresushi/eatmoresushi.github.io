/**
 * Canal Barge (T23, rev. 5 L637; change 22; INT: Canal Barge): once per round, when you complete
 * an Order, gain 2 Coins. It does not complete Orders itself. Completing an Order is a free action
 * (rev. 5 L173, L417, L422), so the 2 Coins come on the owner's first completion of the round in
 * whichever free-action window it is (before or after the worker action, or the Order Phase),
 * once per round across those windows (L176); automatic (I5), Starting Orders included.
 */

import { describe, expect, it } from "vitest";
import { parseCommand } from "../../../src/game/actionGuard.ts";
import { validateAction } from "../../../src/game/engine.ts";
import { completableOrders } from "../../../src/game/selectors.ts";
import type { GameAction, GameEvent, GameState } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent, viewOf } from "../../../src/game/view.ts";
import { type CeramicSpec, type StateSpec, buildState } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";

function ordersPhase(turnOrder: string[]): GameState["phase"] {
  return { type: "orders", turnOrder, index: 0 };
}

function orderTable(spec: StateSpec): LocalTable {
  const players = typeof spec.players === "number" ? spec.players : (spec.players?.length ?? 2);
  const order = Array.from({ length: players }, (_, index) => `p${index + 1}`);
  const first = spec.firstPlayerId ?? "p1";
  const start = order.indexOf(first);
  const turnOrder = order.map((_, offset) => order[(start + offset) % order.length] as string);
  return new LocalTable(buildState({ round: 2, ...spec, phase: ordersPhase(turnOrder) }), { flow: "halt" });
}

function types(events: readonly GameEvent[]): string[] {
  return events.map((event) => event.type);
}

function only<T extends GameEvent["type"]>(events: readonly GameEvent[], type: T): Extract<GameEvent, { type: T }> {
  const found = events.filter((event): event is Extract<GameEvent, { type: T }> => event.type === type);
  expect(found, `exactly one ${type}`).toHaveLength(1);
  return found[0] as Extract<GameEvent, { type: T }>;
}

function complete(orderId: string, ceramicIds: string[], extra: Partial<Extract<GameAction, { type: "COMPLETE_ORDER" }>> = {}): GameAction {
  return { type: "COMPLETE_ORDER", orderId: orderId as never, ceramicIds, ...extra };
}

const WHITE_BOWL: CeramicSpec = { owner: "p1", shape: "bowl", stage: "finished", glaze: "white", quality: "standard" };
const WHITE_PLATE: CeramicSpec = { owner: "p1", shape: "plate", stage: "finished", glaze: "white", quality: "standard" };

describe("2 Coins on the first Order completed each round (v1.6.2 L637)", () => {
  it("adds 2 Coins to the first completion, after its own rewards, and nothing to the next", () => {
    const t = orderTable({ players: [{ techs: ["T23"], hand: ["O01", "O02"] }, {}], ceramics: [WHITE_BOWL, WHITE_PLATE] });
    const coins = t.player("p1").resources.coins;
    const first = t.act("p1", complete("O01", ["c1"]));
    expect(types(first)).toEqual(["ORDER_COMPLETED", "RESOURCES_CHANGED", "TECH_USED", "RESOURCES_CHANGED"]);
    expect(only(first, "ORDER_COMPLETED").record).toMatchObject({ orderId: "O01", canalBargeCoins: 2, vp: 4, coins: 3 });
    expect(first.filter((event) => event.type === "RESOURCES_CHANGED")).toEqual([
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 3, reason: "order_reward" },
      { type: "RESOURCES_CHANGED", playerId: "p1", clay: 0, wood: 0, coins: 2, reason: "canal_barge" },
    ]);
    expect(only(first, "TECH_USED")).toEqual({ type: "TECH_USED", playerId: "p1", techId: "T23" });
    expect(t.player("p1").resources.coins).toBe(coins + 3 + 2);
    expect(t.player("p1").techs).toEqual([{ id: "T23", acquiredInRound: 2, usedThisRound: true }]);

    const second = t.act("p1", complete("O02", ["c2"]));
    expect(types(second)).not.toContain("TECH_USED");
    expect(only(second, "ORDER_COMPLETED").record.canalBargeCoins).toBe(0);
    expect(t.player("p1").resources.coins).toBe(coins + 3 + 2 + 3);
    expect(t.player("p1").completedOrders.map((record) => record.canalBargeCoins)).toEqual([2, 0]);
  });

  it("counts a Starting Order (L535) and works the round Canal Barge is acquired (L243)", () => {
    const t = orderTable({ players: [{ techs: [{ id: "T23", acquiredInRound: 2 }], hand: ["S01"] }, {}], ceramics: [WHITE_BOWL] });
    const events = t.act("p1", complete("S01", ["c1"]));
    expect(only(events, "ORDER_COMPLETED").record).toMatchObject({ orderId: "S01", canalBargeCoins: 2 });
  });

  it("is automatic: nobody without Canal Barge gains it, and it cannot be declined", () => {
    const t = orderTable({ players: [{ hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    const events = t.act("p1", complete("O01", ["c1"]));
    expect(only(events, "ORDER_COMPLETED").record.canalBargeCoins).toBe(0);
    expect(events.some((event) => event.type === "RESOURCES_CHANGED" && event.reason === "canal_barge")).toBe(false);
    // There is no flag to decline it: an unknown key is a malformed command.
    expect(parseCommand({ type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: ["c1"], declineCanalBarge: true })).toMatchObject({ code: "MALFORMED_ACTION" });
  });

  it("gives nothing once used this round (it is readied at the Start of Round, L154)", () => {
    const t = orderTable({ players: [{ techs: [{ id: "T23", usedThisRound: true, acquiredInRound: 1 }], hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    const spent = t.act("p1", complete("O01", ["c1"]));
    expect(only(spent, "ORDER_COMPLETED").record.canalBargeCoins).toBe(0);
  });

  it("shows on the completion options as an automatic trigger", () => {
    const t = orderTable({ players: [{ techs: ["T23"], hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    expect(completableOrders(viewOf(t.state, "p1")).map((option) => option.triggers)).toEqual([
      { ru: false, guan: false, tributeWare: false, canalBarge: true, crackleVp: 0 },
    ]);
  });
});

describe("with the other completion effects (rev. 5 L499)", () => {
  it("Guan: an Order showing a Crown gains Guan's 2 Coins + 1 VP and Canal Barge's 2 Coins; Tribute Ware's Crown too", () => {
    const t = orderTable({
      firstPlayerId: "p2",
      players: [{}, { techs: ["T23", "T25"], hand: ["O18"] }],
      ceramics: [{ owner: "p2", shape: "vase", stage: "finished", glaze: "celadon", quality: "fine" }],
    });
    expect(t.player("p2").kilnId).toBe("GU");
    const coins = t.player("p2").resources.coins;
    const events = t.act("p2", complete("O18", ["c1"]));
    const record = only(events, "ORDER_COMPLETED").record;
    expect(record).toMatchObject({ printedCrowns: 1, bonusCrowns: 1, kilnAbility: { kilnId: "GU", vp: 1, coins: 2 }, canalBargeCoins: 2 });
    // Canal Barge comes after Ru/Guan (DELTA §2.4).
    const order = types(events);
    expect(order.lastIndexOf("KILN_ABILITY_USED")).toBeLessThan(order.lastIndexOf("TECH_USED"));
    expect(events.filter((event) => event.type === "TECH_USED").map((event) => (event as { techId: string }).techId)).toEqual(["T25", "T23"]);
    expect(t.player("p2").resources.coins - coins).toBe(record.coins + 2 + 2 + (t.player("p2").imperial.grantReceived ? 1 : 0));
  });

  it("Ru and Crackle wildcards trigger with Canal Barge too", () => {
    const ru = orderTable({
      players: [{ techs: ["T23"], hand: ["O22"] }, {}],
      ceramics: [{ owner: "p1", shape: "bowl", stage: "finished", glaze: "celadon", decoration: "plain", quality: "masterpiece" }],
    });
    const ruEvents = ru.act("p1", complete("O22", ["c1"]));
    expect(only(ruEvents, "ORDER_COMPLETED").record).toMatchObject({ kilnAbility: { kilnId: "RU", vp: 4, coins: 0 }, canalBargeCoins: 2 });

    const crackle = orderTable({
      firstPlayerId: "p3",
      players: [{}, {}, { techs: ["T23"], hand: ["O17"] }],
      ceramics: [{ owner: "p3", shape: "washer", stage: "finished", glaze: "white", decoration: "carved", quality: "fine", crackle: true }],
    });
    const crackleEvents = crackle.act("p3", complete("O17", ["c1"]));
    expect(only(crackleEvents, "ORDER_COMPLETED").record).toMatchObject({
      crackleDeclarations: [{ ceramicId: "c1", decoration: "painted" }],
      canalBargeCoins: 2,
    });
  });
});

describe("in any free-action window, once per round across windows (rev. 5 L176, L637)", () => {
  it("has no command of its own: USE_CANAL_BARGE is malformed and unknown to the dispatcher", () => {
    expect(parseCommand({ type: "USE_CANAL_BARGE", orderId: "O01", ceramicIds: ["c1"] })).toMatchObject({ code: "MALFORMED_ACTION", details: { field: "type" } });
    const state = buildState({ players: [{ techs: ["T23"], hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    expect(validateAction(actorViewOf(state, "p1"), { type: "USE_CANAL_BARGE" } as unknown as GameAction)).toMatchObject({ code: "MALFORMED_ACTION" });
    // Completing the Order before the worker action is a free action, and Canal Barge pays there.
    expect(validateAction(actorViewOf(state, "p1"), complete("O01", ["c1"]))).toBeNull();
  });

  it("pays on the round's first completion, before the worker action, spendable at once; nothing on later completions in either window", () => {
    const t = new LocalTable(
      buildState({ round: 2, players: [{ techs: ["T23"], hand: ["O01", "O02", "S01"], resources: { coins: 0 } }, {}], ceramics: [WHITE_BOWL, WHITE_PLATE, { ...WHITE_BOWL }] }),
      { flow: "halt", pass: ["worker_action_done", "work_phase_done"] },
    );
    const before = t.act("p1", complete("O01", ["c1"]));
    expect(only(before, "ORDER_COMPLETED")).toMatchObject({ window: "before_action", record: { canalBargeCoins: 2 } });
    expect(t.player("p1").resources.coins).toBe(3 + 2);
    expect(t.state.phase).toEqual({ type: "work_turn", activePlayerId: "p1", step: { kind: "before_action" } });
    // After the action: the window opens on public facts (2 held Orders, a Finished Standard ceramic).
    t.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(t.state.phase).toMatchObject({ step: { kind: "after_action" } });
    const after = t.act("p1", complete("O02", ["c2"]));
    expect(only(after, "ORDER_COMPLETED")).toMatchObject({ window: "after_action", record: { canalBargeCoins: 0 } });
    expect(types(after)).not.toContain("TECH_USED");
    // The Order Phase later in the round: still spent.
    t.state.phase = ordersPhase(["p1", "p2"]);
    const orders = t.act("p1", complete("S01", ["c3"]));
    expect(only(orders, "ORDER_COMPLETED")).toMatchObject({ window: "order_phase", record: { canalBargeCoins: 0 } });
    expect(t.player("p1").completedOrders.map((record) => record.canalBargeCoins)).toEqual([2, 0, 0]);
  });

  it("a completion in the Order Phase pays when the round's Work turns had none", () => {
    const t = orderTable({ players: [{ techs: ["T23"], hand: ["O01"] }, {}], ceramics: [WHITE_BOWL] });
    expect(only(t.act("p1", complete("O01", ["c1"])), "ORDER_COMPLETED")).toMatchObject({ window: "order_phase", record: { canalBargeCoins: 2 } });
  });

  it("opens the after-action window only on public facts: a held Order and a Finished ceramic that is not Flawed (I2)", () => {
    const open = new LocalTable(buildState({ players: [{ techs: ["T23"], hand: ["O30"] }, {}], ceramics: [WHITE_BOWL] }), {
      flow: "halt",
      pass: ["worker_action_done"],
    });
    open.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    // O30 cannot be completed with a Bowl, but the window cannot tell (the hand is secret).
    expect(open.state.phase).toMatchObject({ activePlayerId: "p1", step: { kind: "after_action" } });
    expect(completableOrders(viewOf(open.state, "p1"))).toEqual([]);

    const closed = new LocalTable(buildState({ players: [{ techs: ["T23"], hand: ["O01"] }, {}] }), { flow: "halt", pass: ["worker_action_done"] });
    const events = closed.act("p1", { type: "PLACE_CANAL_WHARF", workerId: "p1:apprentice:1" });
    expect(only(events, "WORK_TURN_ENDED").automatic).toBe(true);
    expect(closed.state.phase).toMatchObject({ activePlayerId: "p2" });
  });

  it("the public log shows the 2 Coins with the completed Order but no other held Order", () => {
    const t = orderTable({ players: [{ techs: ["T23"], hand: ["O01", "O30"] }, {}], ceramics: [WHITE_BOWL] });
    t.act("p1", complete("O01", ["c1"]));
    const publicLog = JSON.stringify(t.events.map(projectEvent));
    expect(publicLog).toContain('"canalBargeCoins":2');
    expect(publicLog).toContain('"canal_barge"');
    expect(publicLog).not.toContain('"O30"');
  });
});
