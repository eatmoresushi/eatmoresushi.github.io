/**
 * Start of Round and the Setter's Mark window (P2 `round.ts`): L118, L124–132, L630, R4,
 * INT "Kiln Die", INT "Setter's Mark", B1; DESIGN §3.1, §3.6, §3.7, §7.
 */

import { describe, expect, it } from "vitest";
import { FIRING, KILN_SPACE_IDS, MAIN_ORDER_IDS } from "../../../src/game/content.ts";
import { handlers, settersMarkSpaces, startRound } from "../../../src/game/round.ts";
import { SeededRandom } from "../../../src/game/rng.ts";
import type { ActorView, GameEvent, GameState, KilnDieFace, OrderId, RoundNumber } from "../../../src/game/types.ts";
import { actorViewOf, projectEvent, viewOf } from "../../../src/game/view.ts";
import { buildState, testContext } from "./support/fixtures.ts";
import { LocalTable } from "./support/localTable.ts";
import { expectDocumentedDetails } from "./support/ruleErrors.ts";

const SIX: OrderId[] = ["O01", "O02", "O03", "O04", "O05", "O06"];

function expectedDie(seed: number): KilnDieFace {
  return FIRING.kilnDie.faces[new SeededRandom(seed).nextInt(FIRING.kilnDie.faces.length)] as KilnDieFace;
}

/** Postgres `jsonb` key order: by length, then bytes (DESIGN §7). */
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

function run(state: GameState, seed = 1): { events: GameEvent[]; halts: ReturnType<typeof testContext>["halts"] } {
  const ctx = testContext(seed);
  startRound(state, ctx);
  return { events: ctx.events, halts: ctx.halts };
}

describe("Kiln Die (L126, INT: every round, public)", () => {
  it.each([1, 2, 3, 4, 5] as RoundNumber[])("Round %i: rolled first, recorded for the round, then handed over", (round) => {
    const state = buildState({ round, kilnDie: round === 1 ? null : 3, display: SIX, mainDeck: ["O20", "O21", "O22"] });
    const seed = 40 + round;
    const { events, halts } = run(state, seed);
    const value = expectedDie(seed);
    expect(state.kilnDie).toEqual({ round, value });
    expect(events[0]).toEqual({ type: "ROUND_STARTED", round, firstPlayerId: "p1" });
    expect(events[1]).toEqual({ type: "KILN_DIE_ROLLED", round, value });
    expect(events.map((event) => event.type)).toEqual(
      round === 1
        ? ["ROUND_STARTED", "KILN_DIE_ROLLED", "ABILITIES_READIED"]
        : ["ROUND_STARTED", "KILN_DIE_ROLLED", "MAIN_DISPLAY_ROTATED", "DISPLAY_REFILLED", "ABILITIES_READIED"],
    );
    expect(events.at(-1)).toEqual({ type: "ABILITIES_READIED", round });
    expect(halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
    expect(state.phase).toEqual({ type: "round_start_setters_mark", queue: { actorIds: [], index: 0 } });
  });

  it("shows only the faces 1, 1, 2, 2, 3, 3 and all three of them across seeds", () => {
    const seen = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const state = buildState({ round: 2 });
      run(state, seed);
      expect([1, 2, 3]).toContain(state.kilnDie?.value);
      seen.add(state.kilnDie?.value ?? 0);
    }
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it("is public: in the projection and in the public event", () => {
    const state = buildState({ round: 2 });
    const { events } = run(state, 9);
    const rolled = events.find((event) => event.type === "KILN_DIE_ROLLED") as GameEvent;
    expect(projectEvent(rolled)).toEqual(rolled);
    expect(viewOf(state, null).game.kilnDie).toEqual(state.kilnDie);
  });
});

describe("Main display rotation at the start of Rounds 2–5 (L128–130, B1)", () => {
  it("does not rotate in Round 1", () => {
    const state = buildState({ round: 1, kilnDie: null, display: SIX, mainDeck: ["O20", "O21"] });
    run(state);
    expect(state.market.display).toEqual(SIX);
    expect(state.hidden.mainDeck).toEqual(["O20", "O21"]);
  });

  it("discards the 2 leftmost face down, slides 4 and reveals 2 in Rounds 2–5", () => {
    const state = buildState({ round: 4, display: SIX, mainDeck: ["O20", "O21", "O22"] });
    const discardBefore = state.hidden.mainDiscard.length;
    const { events } = run(state);
    expect(state.market.display).toEqual(["O03", "O04", "O05", "O06", "O20", "O21"]);
    expect(state.hidden.mainDiscard).toHaveLength(discardBefore + 2);
    expect(state.hidden.mainDiscard.slice(0, 2)).toEqual(["O02", "O01"]);
    expect(events.find((event) => event.type === "MAIN_DISPLAY_ROTATED")).toEqual({
      type: "MAIN_DISPLAY_ROTATED",
      round: 4,
      discardedOrderIds: ["O01", "O02"],
      display: ["O03", "O04", "O05", "O06", null, null],
    });
    expect(viewOf(state, null).game.counts.mainDiscard).toBe(discardBefore + 2);
  });

  it("with the supply exhausted, discards up to 2, slides the rest and leaves positions empty (B1)", () => {
    const rest = MAIN_ORDER_IDS.filter((id) => !["O01", "O02", "O03"].includes(id));
    const state = buildState({ round: 2, players: [{}, { hand: rest }], display: ["O01", "O02", "O03", null, null, null], mainDeck: [], mainDiscard: [] });
    const { events } = run(state, 2);
    // O01 and O02 go to the discard; the empty deck reshuffles them back to fill (L511).
    expect(state.market.display[0]).toBe("O03");
    expect([...state.market.display.slice(1, 3)].sort()).toEqual(["O01", "O02"]);
    expect(state.market.display.slice(3)).toEqual([null, null, null]);
    expect(events.map((event) => event.type)).toContain("MAIN_DECK_RESHUFFLED");
  });
});

describe("refill displays and ready abilities (L118, L132)", () => {
  it("readies every Tech and Kiln Tradition", () => {
    const state = buildState({
      round: 3,
      players: [
        { techs: [{ id: "T01", usedThisRound: true }, { id: "T11", usedThisRound: true }], kilnAbilityUsedThisRound: true },
        { techs: [{ id: "T20", usedThisRound: true }], kilnAbilityUsedThisRound: true },
      ],
    });
    run(state);
    for (const playerId of state.playerOrder) {
      const p = state.players[playerId];
      expect(p?.kilnAbilityUsedThisRound).toBe(false);
      expect(p?.techs.every((tech) => !tech.usedThisRound)).toBe(true);
    }
  });

  it("tops up a short Tech display from its deck, and stays silent when every display is full", () => {
    const short = buildState({ round: 2, techDisplay: { workshop: ["T01"] }, techDecks: { workshop: ["T16", "T05", "T17", "T18", "T19"] } });
    const { events } = run(short);
    expect(short.techDisplay.workshop).toEqual(["T01", "T16"]);
    expect(events.filter((event) => event.type === "TECH_DISPLAY_REFILLED")).toEqual([
      { type: "TECH_DISPLAY_REFILLED", discipline: "workshop", revealedTechIds: ["T16"], display: ["T01", "T16"] },
    ]);
    const full = buildState({ round: 2 });
    const before = structuredClone(full.techDisplay);
    expect(run(full).events.some((event) => event.type === "TECH_DISPLAY_REFILLED")).toBe(false);
    expect(full.techDisplay).toEqual(before);
  });
});

describe("Setter's Mark window (T22, L630, INT: optional, R4)", () => {
  function markWindow(round: RoundNumber = 2): GameState {
    const state = buildState({ round, players: [{}, { techs: ["T22"] }] });
    const { halts } = run(state, 3);
    expect(halts).toEqual([]);
    return state;
  }

  it("opens for the Setter's Mark owner in First Player order after the abilities are readied", () => {
    const state = markWindow();
    expect(state.phase).toEqual({ type: "round_start_setters_mark", queue: { actorIds: ["p2"], index: 0 } });
    const table = new LocalTable(state, { flow: "halt" });
    expect(table.prompt()).toEqual({ phaseType: "round_start_setters_mark", actorIds: ["p2"], mode: "single" });
    expect(settersMarkSpaces(state)).toEqual(["high_1", "high_2", "middle_1", "low_1"]);
    table.expectRuleError("p1", { type: "PLACE_SETTERS_MARK", spaceId: "high_1" }, "NOT_YOUR_DECISION");
  });

  it("places the Mark on an empty active space, uses the Tech and hands over round_start_done", () => {
    const table = new LocalTable(markWindow(), { flow: "halt" });
    const events = table.act("p2", { type: "PLACE_SETTERS_MARK", spaceId: "low_1" });
    expect(events).toEqual([
      { type: "SETTERS_MARK_PLACED", playerId: "p2", spaceId: "low_1" },
      { type: "TECH_USED", playerId: "p2", techId: "T22" },
    ]);
    expect(table.state.sharedKiln.spaces.low_1.setterMarkOwnerId).toBe("p2");
    expect(KILN_SPACE_IDS.filter((id) => table.state.sharedKiln.spaces[id].setterMarkOwnerId !== null)).toEqual(["low_1"]);
    expect(table.player("p2").techs.find((tech) => tech.id === "T22")?.usedThisRound).toBe(true);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
  });

  it("may be declined with null, which keeps the once-per-round use unspent (R4, §3.6 exit)", () => {
    const table = new LocalTable(markWindow(), { flow: "halt" });
    const events = table.act("p2", { type: "PLACE_SETTERS_MARK", spaceId: null });
    expect(events).toEqual([{ type: "SETTERS_MARK_PLACED", playerId: "p2", spaceId: null }]);
    expect(KILN_SPACE_IDS.every((id) => table.state.sharedKiln.spaces[id].setterMarkOwnerId === null)).toBe(true);
    expect(table.player("p2").techs.find((tech) => tech.id === "T22")?.usedThisRound).toBe(false);
    expect(table.halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
  });

  it("rejects a covered space and a space holding a ceramic (KILN_SPACE_UNAVAILABLE)", () => {
    const covered = new LocalTable(markWindow(), { flow: "halt" });
    const error = covered.expectRuleError("p2", { type: "PLACE_SETTERS_MARK", spaceId: "high_3" }, "KILN_SPACE_UNAVAILABLE");
    expect(error.details).toEqual({ spaceId: "high_3" });
    expectDocumentedDetails(error);

    const loaded = buildState({ round: 2, players: [{}, { techs: ["T22"] }], ceramics: [{ owner: "p1", shape: "bowl", stage: "loaded", glaze: "white", at: "high_1" }] });
    run(loaded);
    expect(settersMarkSpaces(loaded)).toEqual(["high_2", "middle_1", "low_1"]);
    const table = new LocalTable(loaded, { flow: "halt" });
    table.expectRuleError("p2", { type: "PLACE_SETTERS_MARK", spaceId: "high_1" }, "KILN_SPACE_UNAVAILABLE");
    table.act("p2", { type: "PLACE_SETTERS_MARK", spaceId: "high_2" });
  });

  it("validates ownership, readiness and other Marks on the view (TECH_NOT_OWNED, TECH_ALREADY_USED, KILN_SPACE_MARKED)", () => {
    const state = markWindow();
    const validate = handlers.PLACE_SETTERS_MARK.validate;
    const view = (mutate: (v: ActorView) => void): ActorView => {
      const v = actorViewOf(state, "p2");
      mutate(v);
      return v;
    };
    const notOwned = validate(view((v) => { v.game.players["p2"]!.techs = []; }), { type: "PLACE_SETTERS_MARK", spaceId: "high_1" });
    expect(notOwned?.code).toBe("TECH_NOT_OWNED");
    expectDocumentedDetails(notOwned);
    const used = validate(view((v) => { v.game.players["p2"]!.techs[0]!.usedThisRound = true; }), { type: "PLACE_SETTERS_MARK", spaceId: "high_1" });
    expect(used?.code).toBe("TECH_ALREADY_USED");
    expectDocumentedDetails(used);
    const marked = validate(view((v) => { v.game.sharedKiln.spaces.high_1.setterMarkOwnerId = "p1"; }), { type: "PLACE_SETTERS_MARK", spaceId: "high_1" });
    expect(marked).toMatchObject({ code: "KILN_SPACE_MARKED", details: { spaceId: "high_1", ownerId: "p1" } });
    expectDocumentedDetails(marked);
    // Declining is always legal.
    expect(validate(view((v) => { v.game.players["p2"]!.techs = []; }), { type: "PLACE_SETTERS_MARK", spaceId: null })).toBeNull();
  });

  it("opens no window without an owner, or when no space is open (DESIGN §3.6)", () => {
    const none = buildState({ round: 2 });
    expect(run(none).halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);

    const full = buildState({
      round: 2,
      players: [{}, { techs: ["T22"] }],
      ceramics: (["high_1", "high_2", "middle_1", "low_1"] as const).map((at) => ({ owner: "p1", shape: "bowl" as const, stage: "loaded" as const, glaze: "white" as const, at })),
    });
    const { events, halts } = run(full);
    expect(halts).toEqual([{ kind: "continue_after", milestone: "round_start_done" }]);
    expect(events.some((event) => event.type === "SETTERS_MARK_PLACED")).toBe(false);
  });

  it("is only a Start of Round decision (WRONG_PHASE elsewhere)", () => {
    const table = new LocalTable(buildState({ players: [{ techs: ["T22"] }, {}] }), { flow: "halt" });
    table.expectRuleError("p1", { type: "PLACE_SETTERS_MARK", spaceId: "high_1" }, "WRONG_PHASE");
  });

  it("a Setter's Mark bought last round is placed at this round's start (INT)", () => {
    const state = buildState({ round: 3, players: [{ techs: [{ id: "T22", acquiredInRound: 2, usedThisRound: false }] }, {}] });
    run(state);
    expect(state.phase).toEqual({ type: "round_start_setters_mark", queue: { actorIds: ["p1"], index: 0 } });
  });
});

describe("storage independence (DESIGN §2.3, §7)", () => {
  it("gives the same events and state after a jsonb-style key-sorted round trip", () => {
    const spec = { round: 3 as RoundNumber, players: [{ techs: ["T22" as const] }, { techs: [{ id: "T11" as const, usedThisRound: true }] }, {}], display: SIX };
    const plain = buildState(spec);
    const sorted = keySortedJsonRoundTrip(buildState(spec));
    const a = run(plain, 77);
    const b = run(sorted, 77);
    expect(b.events).toEqual(a.events);
    expect(b.halts).toEqual(a.halts);
    expect(sorted).toEqual(plain);
  });
});
