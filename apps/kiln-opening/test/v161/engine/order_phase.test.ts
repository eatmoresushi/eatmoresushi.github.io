/**
 * P6 `orders/phase.ts`: the Order Phase (L295–299, INT: Order Phase; DESIGN §3.4, §3.6,
 * §3.7, §8.2 "Single-pass Order Phase, held Orders only").
 *
 * - One pass, First Player then clockwise; any number of held Orders, one at a time.
 * - Players with nothing completable are skipped automatically, at the start of their turn and
 *   after each completion.
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

/** p2 is First Player: p2 holds two completable Orders, p3 none, p1 one. */
interface TableIds {
  p1Vase: string;
  p2Bowl: string;
  p2Plate: string;
  p3Flawed: string;
}

function threePlayerTable(): { state: GameState; events: GameEvent[]; ids: TableIds } {
  const players: PlayerSpec[] = [
    { kilnId: "GE", hand: ["S16"] },
    { kilnId: "JU", hand: ["S01", "S02", "O11"] },
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
    const state = buildState({ players: [{ hand: ["O11"] }, { hand: [] }, { hand: ["S01"] }], firstPlayerId: "p3" });
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
      const state = buildState({ players: [{ hand: ["S16"] }, { hand: ["S01"] }, { hand: ["O01"] }], firstPlayerId: "p2" });
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

    // S02 is the last completable Order (O11 needs a Masterpiece): the turn ends automatically.
    const second = table.act("p2", { type: "COMPLETE_ORDER", orderId: "S02", ceramicIds: [ids.p2Plate] });
    expect(second.slice(2)).toEqual([
      { type: "ORDER_TURN_ENDED", playerId: "p2", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p3" },
      { type: "ORDER_TURN_ENDED", playerId: "p3", automatic: true },
      { type: "ORDER_TURN_STARTED", playerId: "p1" },
    ]);
    expect(table.prompt().actorIds).toEqual(["p1"]);
    expect(table.player("p2").completedOrders.map((r) => [r.orderId, r.via])).toEqual([
      ["S01", "order_phase"],
      ["S02", "order_phase"],
    ]);
    expect(table.state.hidden.orderHands["p2"]).toEqual(["O11"]);

    // Completing is never required: p1 ends with S16 still completable.
    expect(table.act("p1", { type: "END_ORDER_TURN" })).toEqual([{ type: "ORDER_TURN_ENDED", playerId: "p1", automatic: false }]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(table.state.phase).toEqual({ type: "orders", turnOrder: ["p2", "p3", "p1"], index: 3 });
    expect(table.state.hidden.orderHands["p1"]).toEqual(["S16"]);
    expect(table.prompt().actorIds).toEqual([]);
  });

  it("ending a turn early passes to the next player; a player never gets a second turn", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    table.act("p2", { type: "END_ORDER_TURN" });
    expect(table.prompt().actorIds).toEqual(["p1"]);
    table.expectRuleError("p2", { type: "COMPLETE_ORDER", orderId: "S01", ceramicIds: [ids.p2Bowl] }, "NOT_YOUR_DECISION");
    table.act("p1", { type: "END_ORDER_TURN" });
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "order_phase_done" }]);
    expect(table.player("p2").completedOrders).toEqual([]);
  });

  it("only the active player may act, and only during the Order Phase", () => {
    const { state, ids } = threePlayerTable();
    const table = new LocalTable(state, { flow: "halt" });
    table.expectRuleError("p1", { type: "COMPLETE_ORDER", orderId: "S16", ceramicIds: [ids.p1Vase] }, "NOT_YOUR_DECISION");
    table.expectRuleError("p3", { type: "END_ORDER_TURN" }, "NOT_YOUR_DECISION");

    const work = buildState({ players: [{ hand: ["S16"] }, {}] });
    const vase = finished(work, "p1", "vase");
    const actions: GameAction[] = [{ type: "COMPLETE_ORDER", orderId: "S16", ceramicIds: [vase] }, { type: "END_ORDER_TURN" }];
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
      ...table.act("p1", { type: "END_ORDER_TURN" }),
    ];
    for (const event of all) {
      expect(event).not.toHaveProperty("secret");
      expect(projectEvent(event)).toEqual(event);
    }
    const stillHeld: OrderId[] = ["S02", "O11", "O01", "S16"];
    const publicJson = JSON.stringify([projectPublicState(table.state), all]);
    for (const orderId of stillHeld) {
      expect(publicJson).not.toContain(`"${orderId}"`);
    }
    expect(projectPublicState(table.state).counts.orderHands).toEqual({ p1: 1, p2: 2, p3: 1 });
    expect(player(table.state, "p2").completedOrders.map((r) => r.orderId)).toEqual(["S01"]);
  });
});
