/**
 * Cleanup (P2 `round.ts`): L199, L300–304, L489, L626 (Colour Samples hand limit 5), B3,
 * INT "Cleanup in Round 5"; DESIGN §3.4, §3.6, §4.2, §8.2 "Hand limit 4/5 at Cleanup".
 */

import { describe, expect, it } from "vitest";
import { KILN_SPACE_IDS } from "../../../src/game/content.ts";
import { openCleanup } from "../../../src/game/round.ts";
import type { GameEvent, GamePhase, GameState, OrderId, RoundNumber } from "../../../src/game/types.ts";
import { eventForViewer, projectEvent, projectPublicState } from "../../../src/game/view.ts";
import { type PlacementSpec, type PlayerSpec, buildState, cardZones, testContext } from "./support/fixtures.ts";
import { type FlowHalt, haltingFlow } from "./support/flow.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const ORDERS_DONE = (ids: string[]): GamePhase => ({ type: "orders", turnOrder: ids, index: ids.length });

const PLACEMENTS: PlacementSpec[] = [
  { player: "p1", worker: "shifu", locationId: "canal_wharf" },
  { player: "p1", worker: 1, locationId: "form_decorate" },
  { player: "p2", worker: 2, locationId: "materials_yard" },
  { player: "p2", worker: "shifu", locationId: "glaze_load" },
];

interface CleanupSpec {
  round?: RoundNumber;
  players?: Array<PlayerSpec & { id?: string }>;
  firstPlayerId?: string;
}

function cleanupState(spec: CleanupSpec = {}): GameState {
  const players = spec.players ?? [
    { hand: ["S01", "S02", "O10", "O11", "O12"] },
    { hand: ["S03", "S04", "O13", "O14"], techs: ["T22"] },
  ];
  const ids = players.map((p, seat) => p.id ?? `p${seat + 1}`);
  const state = buildState({
    round: spec.round ?? 2,
    players,
    ...(spec.firstPlayerId === undefined ? {} : { firstPlayerId: spec.firstPlayerId }),
    phase: ORDERS_DONE(ids),
    placements: PLACEMENTS.filter((placement) => ids.includes(placement.player)),
    settersMarks: players.some((p) => p.techs?.includes("T22")) ? { low_1: ids[players.findIndex((p) => p.techs?.includes("T22"))] as string } : {},
  });
  state.revision = 40;
  return state;
}

function open(state: GameState): { events: GameEvent[]; halts: ReturnType<typeof testContext>["halts"] } {
  const ctx = testContext(1);
  openCleanup(state, ctx);
  return { events: ctx.events, halts: ctx.halts };
}

describe("Cleanup step 1: return workers and Setter's Marks (L302)", () => {
  it("returns every worker, resets the placement order and returns the Setter's Mark", () => {
    const state = cleanupState();
    expect(state.placementSequence).toBe(4);
    const { events } = open(state);
    for (const playerId of state.playerOrder) {
      expect(Object.values(state.players[playerId]?.workers ?? {}).every((worker) => worker.placement === null)).toBe(true);
    }
    expect(state.placementSequence).toBe(0);
    expect(KILN_SPACE_IDS.every((id) => state.sharedKiln.spaces[id].setterMarkOwnerId === null)).toBe(true);
    expect(events.slice(0, 2)).toEqual([
      { type: "WORKERS_RETURNED", round: 2 },
      { type: "SETTERS_MARK_RETURNED", playerId: "p2", spaceId: "low_1", cause: "cleanup" },
    ]);
  });
});

describe("Cleanup step 2: hand limit 4, or 5 with Colour Samples (L199, L303, L626)", () => {
  it("opens a trim window only for players above their limit, with the opening revision", () => {
    const state = cleanupState();
    const { halts } = open(state);
    expect(halts).toEqual([]);
    expect(state.phase).toEqual({ type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 41 });
    const table = new LocalTable(state, { flow: "halt" });
    expect(table.prompt()).toEqual({ phaseType: "cleanup_hand_limit", actorIds: ["p1"], mode: "parallel" });
    table.expectRuleError("p2", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S03"] }, "NOT_YOUR_DECISION");
  });

  it("returns a discarded Starting Order to the box, then passes the First Player and advances the round", () => {
    const state = cleanupState();
    open(state);
    const table = new LocalTable(state, { flow: "halt" });
    const events = table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S02"] });
    expect(events).toEqual([
      { type: "HAND_TRIMMED", playerId: "p1", count: 1, secret: { visibleTo: "p1", orderIds: ["S02"] } },
      { type: "FIRST_PLAYER_PASSED", from: "p1", to: "p2" },
    ]);
    expect(table.state.hidden.orderHands["p1"]).toEqual(["S01", "O10", "O11", "O12"]);
    expect(table.state.hidden.startingBox.at(-1)).toBe("S02");
    expect(table.state.hidden.mainDiscard).not.toContain("S02");
    expect(table.state.firstPlayerId).toBe("p2");
    expect(table.state.round).toBe(3);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "cleanup_done" }]);
    expect(cardZones(table.state).orders).toHaveLength(64);
  });

  it("puts a discarded Main Order face down on the Main discard (B3)", () => {
    const state = cleanupState();
    open(state);
    const table = new LocalTable(state, { flow: "halt" });
    const discardBefore = table.state.hidden.mainDiscard.length;
    table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O11"] });
    expect(table.state.hidden.mainDiscard[0]).toBe("O11");
    expect(table.state.hidden.mainDiscard).toHaveLength(discardBefore + 1);
    expect(table.state.hidden.startingBox).not.toContain("O11");
    const projected = projectPublicState(table.state);
    expect(projected.counts.mainDiscard).toBe(discardBefore + 1);
    expect(projected.counts.orderHands["p1"]).toBe(4);
    expect(JSON.stringify(projected)).not.toContain('"O11"');
  });

  it("requires exactly hand − limit distinct held Orders", () => {
    const state = cleanupState();
    open(state);
    const table = new LocalTable(state, { flow: "halt" });
    const tooMany = table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01", "S02"] }, "HAND_LIMIT_DISCARD_COUNT");
    expect(tooMany.details).toEqual({ limit: 4, needed: 1, held: 5, given: 2 });
    expectDocumentedDetails(tooMany);
    const none = table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: [] }, "HAND_LIMIT_DISCARD_COUNT");
    expect(none.details).toEqual({ limit: 4, needed: 1, held: 5, given: 0 });
    const notHeld = table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O13"] }, "ORDER_NOT_HELD");
    expect(notHeld.details).toEqual({ orderId: "O13" });
    expectDocumentedDetails(notHeld);
    const twice = table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01", "S01"] }, "INVALID_CHOICE");
    expect(twice.details).toEqual({ field: "orderIds", orderId: "S01" });
    expectDocumentedDetails(twice);
    // A wrong-count message names only the actor's own counts, never another hand.
    expect(tooMany.message).not.toMatch(/O1[0-4]|S0[1-4]/);
  });

  it("lets every player above the limit trim in any order (parallel window)", () => {
    const state = cleanupState({
      firstPlayerId: "p2",
      players: [
        { hand: ["S01", "S02", "O10", "O11", "O12"] },
        { hand: ["S03", "S04", "O13", "O14", "O15", "O16"] },
      ],
    });
    open(state);
    expect(state.phase).toEqual({ type: "cleanup_hand_limit", pendingPlayerIds: ["p2", "p1"], openedAtRevision: 41 });
    const table = new LocalTable(state, { flow: "halt" });
    expect(table.prompt()).toEqual({ phaseType: "cleanup_hand_limit", actorIds: ["p2", "p1"], mode: "parallel" });
    const first = table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O12"] });
    expect(first.map((event) => event.type)).toEqual(["HAND_TRIMMED"]);
    expect(table.prompt().actorIds).toEqual(["p2"]);
    expect(table.halts).toEqual([]);
    table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O10"] }, "NOT_YOUR_DECISION");
    const second = table.act("p2", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S03", "O16"] });
    expect(second.map((event) => event.type)).toEqual(["HAND_TRIMMED", "FIRST_PLAYER_PASSED"]);
    expect(second[1]).toEqual({ type: "FIRST_PLAYER_PASSED", from: "p2", to: "p1" });
    expect(table.state.hidden.orderHands["p2"]).toEqual(["S04", "O13", "O14", "O15"]);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "cleanup_done" }]);
  });

  it("uses a limit of 5 for the Colour Samples owner", () => {
    const five = cleanupState({ players: [{ hand: ["S01", "S02", "O10", "O11", "O12"], techs: ["T10"] }, { hand: ["S03"] }] });
    expect(open(five).halts).toEqual([{ kind: "continue_after", milestone: "cleanup_done" }]);
    const six = cleanupState({ players: [{ hand: ["S01", "S02", "O10", "O11", "O12", "O13"], techs: ["T10"] }, { hand: ["S03"] }] });
    open(six);
    const table = new LocalTable(six, { flow: "halt" });
    const error = table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01", "S02"] }, "HAND_LIMIT_DISCARD_COUNT");
    expect(error.details).toEqual({ limit: 5, needed: 1, held: 6, given: 2 });
    table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O13"] });
    expect(table.state.hidden.orderHands["p1"]).toHaveLength(5);
  });

  it("skips the window when nobody is above the limit: the round ends in the same command", () => {
    const state = cleanupState({ players: [{ hand: ["S01", "S02", "O10", "O11"] }, { hand: [] }] });
    const { events, halts } = open(state);
    expect(events.map((event) => event.type)).toEqual(["WORKERS_RETURNED", "FIRST_PLAYER_PASSED"]);
    expect(halts).toEqual([{ kind: "continue_after", milestone: "cleanup_done" }]);
    expect(state.round).toBe(3);
  });

  it("is only a Cleanup decision (WRONG_PHASE elsewhere)", () => {
    const table = new LocalTable(buildState({ players: [{ hand: ["S01", "S02", "O10", "O11", "O12"] }, {}] }), { flow: "halt" });
    table.expectRuleError("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01"] }, "WRONG_PHASE");
  });
});

describe("Cleanup step 3: First Player and round (L304, L489)", () => {
  it.each([1, 2, 3, 4] as RoundNumber[])("Round %i passes the First Player clockwise and advances", (round) => {
    const state = cleanupState({ round, firstPlayerId: "p3", players: [{ hand: [] }, { hand: [] }, { hand: [] }] });
    const { events, halts } = open(state);
    expect(events.at(-1)).toEqual({ type: "FIRST_PLAYER_PASSED", from: "p3", to: "p1" });
    expect(state.firstPlayerId).toBe("p1");
    expect(state.round).toBe(round + 1);
    expect(halts).toEqual([{ kind: "continue_after", milestone: "cleanup_done" }]);
  });

  it("Round 5 skips the trim (INT), keeps the First Player and hands over game_over", () => {
    const hand: OrderId[] = ["S01", "S02", "O10", "O11", "O12", "O13", "O14"];
    const state = cleanupState({ round: 5, players: [{ hand }, { hand: ["S03", "S04", "O15", "O16", "O17", "O18"], techs: ["T22"] }] });
    const { events, halts } = open(state);
    expect(events.map((event) => event.type)).toEqual(["WORKERS_RETURNED", "SETTERS_MARK_RETURNED"]);
    expect(state.phase).toEqual({ type: "cleanup_hand_limit", pendingPlayerIds: [], openedAtRevision: 41 });
    expect(halts).toEqual([{ kind: "continue_after", milestone: "game_over" }]);
    expect(state.round).toBe(5);
    expect(state.firstPlayerId).toBe("p1");
    expect(state.hidden.orderHands["p1"]).toEqual(hand);
  });

  it("then the next round starts with the new First Player (cleanup_done → startRound)", () => {
    const state = cleanupState({ players: [{ hand: [] }, { hand: [], techs: ["T22"] }] });
    const halts: FlowHalt[] = [];
    const ctx = testContext(5, haltingFlow(halts, { pass: ["cleanup_done"] }));
    openCleanup(state, ctx);
    const types = ctx.events.map((event) => event.type);
    expect(types).toEqual([
      "WORKERS_RETURNED",
      "SETTERS_MARK_RETURNED",
      "FIRST_PLAYER_PASSED",
      "ROUND_STARTED",
      "KILN_DIE_ROLLED",
      "MAIN_DISPLAY_ROTATED",
      "DISPLAY_REFILLED",
      "ABILITIES_READIED",
    ]);
    expect(ctx.events[3]).toEqual({ type: "ROUND_STARTED", round: 3, firstPlayerId: "p2" });
    expect(state.kilnDie?.round).toBe(3);
    // p2 owns Setter's Mark, so the next round opens its window.
    expect(state.phase).toEqual({ type: "round_start_setters_mark", queue: { actorIds: ["p2"], index: 0 } });
    expect(halts).toEqual([]);
  });
});

describe("hidden information (L200, B3, DESIGN §4.2)", () => {
  it("HAND_TRIMMED shows the count to everyone and the Orders only to their owner", () => {
    const state = cleanupState();
    open(state);
    const table = new LocalTable(state, { flow: "halt" });
    const [trimmed] = table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O10"] });
    const event = trimmed as GameEvent;
    expect(projectEvent(event)).toEqual({ type: "HAND_TRIMMED", playerId: "p1", count: 1 });
    expect(JSON.stringify(eventForViewer(event, "p2"))).not.toContain("O10");
    expect(JSON.stringify(eventForViewer(event, null))).not.toContain("O10");
    expect(eventForViewer(event, "p1")).toEqual(event);
    expect(JSON.stringify(table.view("p2"))).not.toContain('"O10"');
  });
});

describe("storage independence (DESIGN §2.3, §7)", () => {
  /** Postgres `jsonb` key order: by length, then bytes. */
  function keySortedJsonRoundTrip<T>(value: T): T {
    const sortKeys = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(sortKeys);
      if (node !== null && typeof node === "object") {
        const entries = Object.entries(node as Record<string, unknown>).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
        return Object.fromEntries(entries.map(([key, child]) => [key, sortKeys(child)]));
      }
      return node;
    };
    return JSON.parse(JSON.stringify(sortKeys(value))) as T;
  }

  it("gives the same Cleanup events, window and trim after a jsonb-style key-sorted round trip", () => {
    const spec: CleanupSpec = {
      firstPlayerId: "p3",
      players: [
        { hand: ["S01", "S02", "O10", "O11", "O12"] },
        { hand: ["S03", "S04", "O13", "O14", "O15"], techs: ["T22"] },
        { hand: ["S05", "S06", "O16", "O17", "O18", "O19"], techs: ["T10"] },
      ],
    };
    const plain = cleanupState(spec);
    const sorted = keySortedJsonRoundTrip(cleanupState(spec));
    const a = open(plain);
    const b = open(sorted);
    expect(b).toEqual(a);
    // p3 (First Player, Colour Samples: limit 5) holds 6; p1 and p2 hold 5 against 4.
    expect(sorted.phase).toEqual({ type: "cleanup_hand_limit", pendingPlayerIds: ["p3", "p1", "p2"], openedAtRevision: 41 });
    const tableA = new LocalTable(plain, { flow: "halt" });
    const tableB = new LocalTable(sorted, { flow: "halt" });
    for (const table of [tableA, tableB]) {
      table.act("p2", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O15"] });
      table.act("p1", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["S01"] });
      table.act("p3", { type: "DISCARD_TO_HAND_LIMIT", orderIds: ["O19"] });
    }
    expect(tableB.events).toEqual(tableA.events);
    expect(tableB.state).toEqual(tableA.state);
    expect(tableA.events.at(-1)).toEqual({ type: "FIRST_PLAYER_PASSED", from: "p3", to: "p1" });
  });
});
