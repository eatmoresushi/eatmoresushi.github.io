import { describe, expect, it } from "vitest";
import { InvariantError } from "../../../src/game/errors.ts";
import {
  canAfford,
  ceramic,
  ceramicSequence,
  ceramicsInOrder,
  ceramicsOf,
  cloneState,
  decisionPrompt,
  emit,
  formCeramic,
  gain,
  imperialKilnCeramic,
  isSeated,
  kilnMasterCarrier,
  loadedCeramics,
  lookup,
  nextClockwise,
  phaseAs,
  player,
  returnVesselCard,
  spend,
  takeVesselCard,
  turnOrder,
  workStep,
} from "../../../src/game/state.ts";
import type { CeramicState, GamePhase } from "../../../src/game/types.ts";
import { buildState, testContext } from "./support/fixtures.ts";

describe("lookups", () => {
  it("player() returns the seat and throws InvariantError for an unknown ID", () => {
    const state = buildState();
    expect(player(state, "p2").id).toBe("p2");
    expect(() => player(state, "p9")).toThrow(InvariantError);
  });

  it("never returns inherited members for untrusted keys", () => {
    const state = buildState();
    expect(lookup(state.players, "__proto__")).toBeUndefined();
    expect(lookup(state.players, "constructor")).toBeUndefined();
    expect(isSeated(state, "toString")).toBe(false);
    expect(() => player(state, "hasOwnProperty")).toThrow(InvariantError);
    expect(() => ceramic(state, "__proto__")).toThrow(InvariantError);
  });

  it("cloneState is a deep, independent copy", () => {
    const state = buildState();
    const copy = cloneState(state);
    copy.players["p1"]!.resources.coins = 99;
    copy.hidden.mainDeck.pop();
    expect(state.players["p1"]?.resources.coins).toBe(3);
    expect(state.hidden.mainDeck).toHaveLength(42);
  });
});

describe("turn order", () => {
  it("starts with the First Player and proceeds clockwise (L158)", () => {
    const state = buildState({ players: 4, firstPlayerId: "p3" });
    expect(turnOrder(state)).toEqual(["p3", "p4", "p1", "p2"]);
    expect(turnOrder(buildState({ players: 3 }))).toEqual(["p1", "p2", "p3"]);
  });

  it("nextClockwise wraps around the table", () => {
    const state = buildState({ players: 3 });
    expect(nextClockwise(state, "p1")).toBe("p2");
    expect(nextClockwise(state, "p3")).toBe("p1");
    expect(() => nextClockwise(state, "p4")).toThrow(InvariantError);
  });
});

describe("decisionPrompt (DESIGN §3.4)", () => {
  const cases: Array<[label: string, phase: GamePhase, actorIds: string[], mode: string]> = [
    ["setup_kiln_selection", { type: "setup_kiln_selection", selectionOrder: ["p3", "p2", "p1"], index: 1 }, ["p2"], "single"],
    ["round_start_setters_mark", { type: "round_start_setters_mark", queue: { actorIds: ["p2", "p3"], index: 0 } }, ["p2"], "single"],
    [
      "work_turn",
      { type: "work_turn", activePlayerId: "p3", step: { kind: "commission_market", workerId: "p3:shifu", effect: "shifu", select: { n: 3, maxReservations: 2, fromDisplay: true, lookedCount: 3 } } },
      ["p3"],
      "single",
    ],
    [
      "firing_contributions",
      { type: "firing_contributions", windowId: "w", eligiblePlayerIds: ["p1", "p2", "p3"], submittedPlayerIds: ["p2"] },
      ["p1", "p3"],
      "simultaneous_secret",
    ],
    ["firing_test_pieces", { type: "firing_test_pieces", queue: { actorIds: ["p1", "p3"], index: 1 }, awaiting: "bury" }, ["p3"], "single"],
    ["firing_heat_adjustment", { type: "firing_heat_adjustment", queue: { actorIds: ["p1"], index: 0 } }, ["p1"], "single"],
    ["firing_after_quality", { type: "firing_after_quality", queue: { actorIds: ["p1", "p2"], index: 1 } }, ["p2"], "single"],
    ["firing_second_firing_choice", { type: "firing_second_firing_choice", actorId: "p1", ceramicId: "c1" }, ["p1"], "single"],
    ["orders", { type: "orders", turnOrder: ["p2", "p3", "p1"], index: 2 }, ["p1"], "single"],
    ["cleanup_hand_limit", { type: "cleanup_hand_limit", pendingPlayerIds: ["p2"], openedAtRevision: 9 }, ["p2"], "parallel"],
    ["finished", { type: "finished" }, [], "single"],
    ["an exhausted queue", { type: "firing_heat_adjustment", queue: { actorIds: ["p2"], index: 1 } }, [], "single"],
  ];

  it.each(cases)("%s", (_label, phase, actorIds, mode) => {
    const state = buildState({ players: 3, phase });
    expect(decisionPrompt(state)).toEqual({ phaseType: phase.type, actorIds, mode });
  });

  it("returns a copy that callers cannot use to mutate the phase", () => {
    const state = buildState({ players: 3, phase: { type: "cleanup_hand_limit", pendingPlayerIds: ["p1"], openedAtRevision: 0 } });
    decisionPrompt(state).actorIds.push("p2");
    expect(phaseAs(state, "cleanup_hand_limit").pendingPlayerIds).toEqual(["p1"]);
  });
});

describe("phaseAs / workStep", () => {
  it("narrow the current phase and step", () => {
    const state = buildState();
    expect(phaseAs(state, "work_turn").activePlayerId).toBe("p1");
    expect(() => phaseAs(state, "orders")).toThrow(InvariantError);
    expect(workStep(state, "before_action")).toEqual({ kind: "before_action" });
    expect(workStep(state, "after_action")).toBeNull();
    expect(workStep(buildState({ phase: { type: "finished" } }), "before_action")).toBeNull();
  });
});

describe("resources", () => {
  it("gain adds and emits RESOURCES_CHANGED; an all-zero gain emits nothing", () => {
    const state = buildState();
    const ctx = testContext();
    gain(state, "p1", { clay: 2, coins: 1 }, "materials_yard", ctx);
    gain(state, "p1", {}, "canal_wharf", ctx);
    expect(state.players["p1"]?.resources).toEqual({ clay: 4, wood: 3, coins: 4 });
    expect(ctx.events).toEqual([{ type: "RESOURCES_CHANGED", playerId: "p1", clay: 2, wood: 0, coins: 1, reason: "materials_yard" }]);
  });

  it("gain rejects negative or fractional amounts as engine bugs", () => {
    const state = buildState();
    expect(() => gain(state, "p1", { wood: -1 }, "jun", testContext())).toThrow(InvariantError);
    expect(() => gain(state, "p1", { wood: 0.5 }, "jun", testContext())).toThrow(InvariantError);
  });

  it("gain and spend normalise a -0 amount to +0 in state and events", () => {
    const state = buildState();
    const ctx = testContext();
    gain(state, "p1", { clay: -0, wood: 1 }, "materials_yard", ctx);
    spend(state, "p1", { clay: -0, wood: 1 }, "test_pieces", ctx);
    for (const event of ctx.events as Array<{ clay: number }>) {
      expect(Object.is(event.clay, -0)).toBe(false);
    }
    expect(Object.is(state.players["p1"]?.resources.clay, -0)).toBe(false);
  });

  it("spend pays and emits negative deltas without -0", () => {
    const state = buildState();
    const ctx = testContext();
    spend(state, "p2", { wood: 1, coins: 3 }, "test_pieces", ctx);
    expect(state.players["p2"]?.resources).toEqual({ clay: 2, wood: 2, coins: 0 });
    const [event] = ctx.events;
    expect(event).toEqual({ type: "RESOURCES_CHANGED", playerId: "p2", clay: 0, wood: -1, coins: -3, reason: "test_pieces" });
    expect(Object.is((event as { clay: number }).clay, -0)).toBe(false);
  });

  it("spend is atomic: an unaffordable cost is an InvariantError and pays nothing", () => {
    const state = buildState();
    const ctx = testContext();
    expect(() => spend(state, "p1", { clay: 1, coins: 4 }, "form_decorate", ctx)).toThrow(InvariantError);
    expect(state.players["p1"]?.resources).toEqual({ clay: 2, wood: 3, coins: 3 });
    expect(ctx.events).toEqual([]);
  });

  it("canAfford checks every resource", () => {
    expect(canAfford({ clay: 1, wood: 0, coins: 2 }, { clay: 1, coins: 2 })).toBe(true);
    expect(canAfford({ clay: 1, wood: 0, coins: 2 }, { wood: 1 })).toBe(false);
    expect(canAfford({ clay: 0, wood: 0, coins: 0 }, {})).toBe(true);
  });

  it("emit appends in resolution order", () => {
    const ctx = testContext();
    emit(ctx, { type: "ABILITIES_READIED", round: 2 });
    emit(ctx, { type: "WORK_PHASE_ENDED", round: 2 });
    expect(ctx.events.map((event) => event.type)).toEqual(["ABILITIES_READIED", "WORK_PHASE_ENDED"]);
  });
});

describe("ceramics", () => {
  it("ceramicSequence parses c-IDs and rejects anything else", () => {
    expect(ceramicSequence("c12")).toBe(12);
    expect(() => ceramicSequence("c0")).toThrow(InvariantError);
    expect(() => ceramicSequence("12")).toThrow(InvariantError);
  });

  it("ceramicsInOrder sorts by sequence, never by key order (DESIGN §2.3)", () => {
    const state = buildState({
      ceramics: Array.from({ length: 11 }, (_, index) => ({
        owner: index % 2 === 0 ? "p1" : "p2",
        stage: "shaped" as const,
        shape: "bowl" as const,
      })),
    });
    // Rebuild the record with keys in jsonb order (length, then bytes) and reversed.
    const reordered: Record<string, CeramicState> = {};
    for (const id of Object.keys(state.ceramics).sort((a, b) => b.length - a.length || (a < b ? 1 : -1))) {
      reordered[id] = state.ceramics[id]!;
    }
    state.ceramics = reordered;
    expect(ceramicsInOrder(state).map((c) => c.id)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9", "c10", "c11"]);
    expect(ceramicsOf(state, "p2", "shaped").map((c) => c.id)).toEqual(["c2", "c4", "c6", "c8", "c10"]);
    expect(ceramicsOf(state, "p2", "loaded")).toEqual([]);
  });

  it("formCeramic takes the top Vessel card, mints the next ID and emits CERAMIC_FORMED", () => {
    const state = buildState();
    const ctx = testContext();
    const formed = formCeramic(state, "p2", "vase", "impressed", "form_decorate", ctx);
    expect(formed).toEqual({
      id: "c1",
      ownerId: "p2",
      vesselInstanceId: "vase-01",
      shape: "vase",
      decoration: "impressed",
      formedInRound: 1,
      formedBy: "form_decorate",
      stage: "shaped",
    });
    expect(state.ceramics["c1"]).toEqual(formed);
    expect(state.vesselSupply.vase[0]).toBe("vase-02");
    expect(state.nextCeramicSequence).toBe(2);
    expect(ctx.events).toEqual([
      { type: "CERAMIC_FORMED", playerId: "p2", ceramicId: "c1", shape: "vase", decoration: "impressed", formedBy: "form_decorate" },
    ]);
  });

  it("mints proxies when a Shape's Vessel cards run out (L350), and proxies vanish on return", () => {
    const state = buildState();
    state.vesselSupply.plate = [];
    const ctx = testContext();
    const first = formCeramic(state, "p1", "plate", "plain", "ding_extra", ctx);
    const second = formCeramic(state, "p1", "plate", "plain", "ding_extra", ctx);
    expect([first.vesselInstanceId, second.vesselInstanceId]).toEqual(["plate-proxy-1", "plate-proxy-2"]);
    expect(state.nextProxySequence).toBe(3);
    returnVesselCard(state, "plate-proxy-1");
    expect(state.vesselSupply.plate).toEqual([]);
  });

  it("returnVesselCard keeps the supply sorted and rejects a double return", () => {
    const state = buildState();
    const a = takeVesselCard(state, "washer");
    const b = takeVesselCard(state, "washer");
    returnVesselCard(state, b);
    returnVesselCard(state, a);
    expect(state.vesselSupply.washer.slice(0, 3)).toEqual(["washer-01", "washer-02", "washer-03"]);
    expect(() => returnVesselCard(state, "washer-01")).toThrow(InvariantError);
    expect(() => returnVesselCard(state, "teapot-01")).toThrow(InvariantError);
  });

  it("loadedCeramics, kilnMasterCarrier and imperialKilnCeramic", () => {
    const state = buildState({
      players: [{ recognition: 2 }, { techs: [{ id: "T24", usedThisRound: true }] }],
      ceramics: [
        { owner: "p1", stage: "shaped", shape: "bowl" },
        { owner: "p1", stage: "loaded", shape: "bowl", glaze: "white", at: "high_1" },
        { owner: "p1", stage: "loaded", shape: "vase", glaze: "celadon", at: "imperial", imperialModifier: -1 },
        { owner: "p2", stage: "loaded", shape: "plate", glaze: "white", at: "low_1", kilnMaster: 1 },
      ],
    });
    expect(loadedCeramics(state).map((c) => c.id)).toEqual(["c2", "c3", "c4"]);
    expect(kilnMasterCarrier(state, "p1")).toBeNull();
    expect(kilnMasterCarrier(state, "p2")?.id).toBe("c4");
    expect(imperialKilnCeramic(state, "p1")?.id).toBe("c3");
    expect(imperialKilnCeramic(state, "p2")).toBeNull();
  });
});
