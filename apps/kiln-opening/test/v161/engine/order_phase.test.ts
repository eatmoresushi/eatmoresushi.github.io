/**
 * P6 `orders/phase.ts`: the Order Phase (rev. 4 L298–302, INT: Order Phase; DESIGN §3.4, §3.6,
 * §3.7, §8.2 "Single-pass Order Phase, held Orders only"; R20).
 *
 * - One pass, First Player then clockwise; any number of held Orders, one at a time.
 * - The turn is also a sale window (R20): a Flawed ceramic may be sold for 2 Coins.
 * - Players with nothing completable and no Flawed ceramic to sell are skipped automatically, at
 *   the start of their turn and after each completion or sale (DELTA §15.9.12).
 * - Face-up Main Orders can never be completed; the display never changes.
 * - The pass hands over through `continueAfter("order_phase_done")`.
 */

import { describe, expect, it } from "vitest";
import { applyAction } from "../../../src/game/engine.ts";
import { openOrderPhase } from "../../../src/game/orders/phase.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import { decisionPrompt, player } from "../../../src/game/state.ts";
import type { GameAction, GameEvent, GameState, OrderId, PlayerId } from "../../../src/game/types.ts";
import { projectEvent, projectPublicState } from "../../../src/game/view.ts";
import { buildState, type PlayerSpec, stageCeramic, testContext } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

/** Key order as Postgres `jsonb` stores it: by length, then bytes (DESIGN §7). */
function keySortedJsonRoundTrip<T>(value: T): T {
  const sortKeys = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortKeys);
    if (input !== null && typeof input === "object") {
      const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
        a.length !== b.length ? a.length - b.length : a < b ? -1 : a > b ? 1 : 0,
      );
      return Object.fromEntries(entries.map(([key, inner]) => [key, sortKeys(inner)]));
    }
    return input;
  };
  return sortKeys(JSON.parse(JSON.stringify(value))) as T;
}

function finished(state: GameState, owner: PlayerId, shape: "bowl" | "plate" | "vase", quality: "standard" | "fine" | "flawed" = "standard"): string {
  return stageCeramic(state, { owner, stage: "finished", shape, glaze: "white", quality }).id;
}

/** p2 is First Player: p2 holds two completable Orders, p3 none but a Flawed ceramic to sell
 * (R20), p1 one. */
interface TableIds {
  p1Vase: string;
  p2Bowl: string;
  p2Plate: string;
  p3Flawed: string;
}

function threePlayerTable(): { state: GameState; events: GameEvent[]; ids: TableIds } {
  const players: PlayerSpec[] = [
    { kilnId: "GE", hand: ["S08"] },
    { kilnId: "JU", hand: ["S01", "S05", "O11"] },
    { kilnId: "DI", hand: ["O01"] },
  ];
  const state = buildState({ players, firstPlayerId: "p2", round: 2 });
  const ids: TableIds = {
    p1Vase: finished(state, "p1", "vase"),
    p2Bowl: finished(state, "p2", "bowl"),
    p2Plate: finished(state, "p2", "plate"),
    p3Flawed: finished(state, "p3", "bowl", "flawed"),
  };
  const ctx = testContext();
  openOrderPhase(state, ctx);
  expect(ctx.halts).toEqual([]);
  return { state, events: ctx.events, ids };
}

describe("openOrderPhase", () => {
  it("starts with the First Player and waits on the first player with a completable Order", () => {
    const { state, events } = threePlayerTable();
    expect(state.phase).toEqual({ type: "orders", turnOrder: ["p2", "p3", "p1"], index: 0 });
    expect(decisionPrompt(state)).toEqual({ phaseType: "orders", actorIds: ["p2"], mode: "single" });
    expect(events).toEqual([{ type: "ORDER_TURN_STARTED", playerId: "p2" }]);
  });

  it("skips every player with nothing completable and hands over when nobody can complete", () => {
    // p3's White Plate cannot complete S02 (Celadon).
    const state = buildState({ players: [{ hand: ["O11"] }, { hand: [] }, { hand: ["S02"] }], firstPlayerId: "p3" });
    finished(state, "p1", "bowl", "fine");
    finished(state, "p3", "plate");
    const ctx = testContext();
    openOrderPhase(state, ctx);
    expect(ctx.events).toEqual([
      { type: "ORDER_TURN_STARTED", playerId: "p3" },
      { type: "ORDER_TURN_ENDED", playerId: "p3", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p1" },
      { type: "ORDER_TURN_ENDED", playerId: "p1", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p2" },
      { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
    ]);
    expect(ctx.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(state.phase).toEqual({ type: "orders", turnOrder: ["p3", "p1", "p2"], index: 3 });
  });

  it("does not depend on the key order of state Records (jsonb round trip)", () => {
    const build = (): GameState => {
      const state = buildState({ players: [{ hand: ["S08"] }, { hand: ["S01"] }, { hand: ["O01"] }], firstPlayerId: "p2" });
      finished(state, "p1", "vase");
      finished(state, "p3", "bowl");
      return state;
    };
    const plain = build();
    const sorted = keySortedJsonRoundTrip(build());
    const plainCtx = testContext();
    const sortedCtx = testContext();
    openOrderPhase(plain, plainCtx);
    openOrderPhase(sorted, sortedCtx);
    expect(sortedCtx.events).toEqual(plainCtx.events);
    expect(sorted.phase).toEqual(plain.phase);
  });
});

describe("the single pass (L297)", () => {
  it("completes any number of held Orders one at a time, auto-ends, skips, and nobody acts twice", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });

    const first = table.act("p2", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [ids.p2Bowl] });
    expect(first.map((e) => e.type)).toEqual(["ORDER_COMPLETED", "RESOURCES_CHANGED"]);
    expect(table.prompt().actorIds).toEqual(["p2"]);

    // S05 is the last completable Order (O11 needs a Masterpiece): the turn ends automatically.
    const second = table.act("p2", { type: "COMPLETE_ORDER", orderId: "S05", ceramicIds: [ids.p2Plate] });
    expect(second.slice(2)).toEqual([
      { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p3" },
    ]);
    // p3 can complete nothing, but holds a Flawed ceramic: the turn opens for the sale (R20).
    expect(table.prompt().actorIds).toEqual(["p3"]);
    const sale = table.act("p3", { type: "SELL_FLAWED", ceramicId: ids.p3Flawed });
    expect(sale).toEqual([
      { type: "CERAMIC_SOLD", playerId: "p3", ceramicId: ids.p3Flawed, coins: 2, from: "finished" },
      { type: "RESOURCES_CHANGED", playerId: "p3", clay: 0, wood: 0, coins: 2, reason: "flawed_sale" },
      { type: "ORDER_TURN_ENDED", playerId: "p3", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p1" },
    ]);
    expect(table.prompt().actorIds).toEqual(["p1"]);
    expect(table.player("p2").completedOrders.map((r) => [r.orderId, r.canalBargeCoins])).toEqual([
      ["S01", 0],
      ["S05", 0],
    ]);
    expect(table.state.hidden.orderHands["p2"]).toEqual(["O11"]);

    // Completing is never required: p1 ends with S08 still completable.
    expect(table.act("p1", { type: "END_ORDER_TURN" })).toEqual([{ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: false }]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(table.state.phase).toEqual({ type: "orders", turnOrder: ["p2", "p3", "p1"], index: 3 });
    expect(table.state.hidden.orderHands["p1"]).toEqual(["S08"]);
    expect(table.prompt().actorIds).toEqual([]);
  });

  it("ending a turn early passes to the next player; a player never gets a second turn", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    table.act("p2", { type: "END_ORDER_TURN" });
    expect(table.prompt().actorIds).toEqual(["p3"]);
    table.expectRuleError("p2", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [ids.p2Bowl] }, "NOT_YOUR_DECISION");
    // Keeping the Flawed ceramic is allowed: p3 simply ends the turn (R4).
    table.act("p3", { type: "END_ORDER_TURN" });
    expect(table.prompt().actorIds).toEqual(["p1"]);
    expectDocumentedDetails(table.expectRuleError("p3", { type: "SELL_FLAWED", ceramicId: ids.p3Flawed }, "NOT_YOUR_DECISION"));
    table.act("p1", { type: "END_ORDER_TURN" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(table.player("p2").completedOrders).toEqual([]);
    expect(table.state.ceramics[ids.p3Flawed]).toMatchObject({ stage: "finished", quality: "flawed" });
  });

  it("a sale keeps the turn while something is left to complete or sell (R20)", () => {
    const state = buildState({ players: [{ hand: ["S08"] }, {}] });
    const vase = finished(state, "p1", "vase");
    const flawedA = finished(state, "p1", "bowl", "flawed");
    const flawedB = finished(state, "p1", "plate", "flawed");
    openOrderPhase(state, testContext());
    const table = new LocalTable(state, { flow: "halt" });
    expect(table.act("p1", { type: "SELL_FLAWED", ceramicId: flawedA }).map((e) => e.type)).toEqual(["CERAMIC_SOLD", "RESOURCES_CHANGED"]);
    expect(table.prompt().actorIds).toEqual(["p1"]);
    table.act("p1", { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: [vase] });
    // S08 is done, but flawedB can still be sold: the turn stays open.
    expect(table.prompt().actorIds).toEqual(["p1"]);
    const last = table.act("p1", { type: "SELL_FLAWED", ceramicId: flawedB });
    expect(last.map((e) => e.type)).toEqual(["CERAMIC_SOLD", "RESOURCES_CHANGED", "ORDER_TURN_ENDED", "ORDER_TURN_STARTED", "ORDER_TURN_ENDED"]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(table.player("p1").resources.coins).toBe(3 + 4 + (table.player("p1").completedOrders[0]?.coins ?? 0));
  });

  it("only the active player may act, and only during the Order Phase", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    table.expectRuleError("p1", { type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: [ids.p1Vase] }, "NOT_YOUR_DECISION");
    table.expectRuleError("p3", { type: "END_ORDER_TURN" }, "NOT_YOUR_DECISION");

    const work = buildState({ players: [{ hand: ["S08"] }, {}] });
    const vase = finished(work, "p1", "vase");
    const actions: GameAction[] = [{ type: "COMPLETE_ORDER", orderId: "S08", ceramicIds: [vase] }, { type: "END_ORDER_TURN" }];
    for (const action of actions) {
      const result = applyAction(work, "p1", action, new SeededRandom(1));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("WRONG_PHASE");
    }
  });

  it("face-up Main Orders cannot be completed and the display never changes (L297)", () => {
    const state = buildState({ players: [{ hand: ["S01"] }, {}], display: ["O01", "O02", "O03", "O04", "O05", "O06"] });
    const bowl = finished(state, "p1", "bowl");
    openOrderPhase(state, testContext());
    const table = new LocalTable(state, { flow: "halt" });
    const displayBefore = structuredClone(table.state.market);
    const deckBefore = [...table.state.hidden.mainDeck];
    const error = table.expectRuleError("p1", { type: "COMPLETE_ORDER", orderId: "O01", ceramicIds: [bowl] }, "ORDER_NOT_HELD");
    expectDocumentedDetails(error);
    table.act("p1", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [bowl] });
    expect(table.state.market).toEqual(displayBefore);
    expect(table.state.hidden.mainDeck).toEqual(deckBefore);
  });

  it("rejects requirement failures without changing state", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    const error = table.expectRuleError("p2", { type: "COMPLETE_ORDER", orderId: "O11", ceramicIds: [ids.p2Bowl] }, "ORDER_REQUIREMENTS_NOT_MET");
    expect(error.details).toMatchObject({ orderId: "O11", reason: "masterpiece_required" });
    expectDocumentedDetails(error);
    table.expectRuleError("p2", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [ids.p1Vase] }, "CERAMIC_NOT_OWNED");
  });

  it("emits only public events and the projection hides the remaining hands", () => {
    const { state, ids, events } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    const all = [
      ...events,
      ...table.act("p2", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [ids.p2Bowl] }),
      ...table.act("p2", { type: "END_ORDER_TURN" }),
      ...table.act("p3", { type: "SELL_FLAWED", ceramicId: ids.p3Flawed }),
      ...table.act("p1", { type: "END_ORDER_TURN" }),
    ];
    for (const event of all) {
      expect(event).not.toHaveProperty("secret");
      expect(projectEvent(event)).toEqual(event);
    }
    const stillHeld: OrderId[] = ["S05", "O11", "O01", "S08"];
    const publicJson = JSON.stringify([projectPublicState(table.state), all]);
    for (const orderId of stillHeld) {
      expect(publicJson).not.toContain(`"${orderId}"`);
    }
    expect(projectPublicState(table.state).counts.orderHands).toEqual({ p1: 1, p2: 2, p3: 1 });
    expect(player(table.state, "p2").completedOrders.map((r) => r.orderId)).toEqual(["S01"]);
  });
});
