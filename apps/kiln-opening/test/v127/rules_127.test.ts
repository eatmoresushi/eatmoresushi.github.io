import { finishWork } from "./helpers.ts";
import { describe, expect, it } from "vitest";
import {
  SHAPE_COSTS,
  applyAction,
  createPrivateFiringState,
  submitWoodContribution,
} from "../../src/game/index.ts";
import type { GameAction, GameState } from "../../src/game/index.ts";
import {
  addGlazed,
  addLoaded,
  addTechnique,
  expectError,
  mustApply,
  mustResult,
  setWorkTurn,
  startedGame,
  workerId,
} from "./helpers.ts";

function claySpent(before: GameState, after: GameState, playerId = "P1"): number {
  return before.players[playerId]!.resources.clay - after.players[playerId]!.resources.clay;
}

function ownedShapes(state: GameState, playerId = "P1"): string[] {
  return Object.values(state.ceramics)
    .filter((ceramic) => ceramic.ownerId === playerId)
    .map((ceramic) => ceramic.shape);
}

describe("V1.2.7 Ding Moulded Production", () => {
  it("charges Apprentice + Ding 2 Clay for two matching eligible vessels", () => {
    const { state: initial, rng } = startedGame(2, 12_601);
    const before = structuredClone(initial);
    before.players["P1"]!.kilnId = "DI";
    before.players["P1"]!.resources.clay = 10;
    const after = mustApply(before, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(before, "P1", "apprentice"),
      shapes: ["bowl"],
      dingExtraShape: "bowl",
    }, rng);

    expect(claySpent(before, after)).toBe(2);
    expect(ownedShapes(after)).toEqual(["bowl", "bowl"]);
  });

  it("keeps the Shifu effect and Ding vessel separate in all three cost cases", () => {
    const run = (seed: number, shapes: Array<"bowl" | "plate">, useDing: boolean) => {
      const { state: initial, rng } = startedGame(2, seed);
      const before = structuredClone(initial);
      before.players["P1"]!.kilnId = "DI";
      before.players["P1"]!.resources.clay = 10;
      const after = mustApply(before, "P1", {
        type: "FORM_CERAMICS",
        workerId: workerId(before, "P1", "shifu"),
        shapes,
        ...(useDing ? { dingExtraShape: "bowl" as const } : {}),
      }, rng);
      return { before, after };
    };

    const shifuTwo = run(12_602, ["bowl", "bowl"], false);
    expect(claySpent(shifuTwo.before, shifuTwo.after)).toBe(1);
    expect(ownedShapes(shifuTwo.after)).toHaveLength(2);

    const shifuOnePlusDing = run(12_603, ["bowl"], true);
    expect(claySpent(shifuOnePlusDing.before, shifuOnePlusDing.after)).toBe(2);
    expect(ownedShapes(shifuOnePlusDing.after)).toHaveLength(2);

    const shifuTwoPlusDing = run(12_604, ["bowl", "bowl"], true);
    expect(claySpent(shifuTwoPlusDing.before, shifuTwoPlusDing.after)).toBe(2);
    expect(ownedShapes(shifuTwoPlusDing.after)).toHaveLength(3);
  });

  it("rejects Vase/Censer triggers, remains once per round, and still triggers Standardised Moulds", () => {
    const { state: initial, rng } = startedGame(2, 12_605);
    let state = structuredClone(initial);
    state.players["P1"]!.kilnId = "DI";
    state.players["P1"]!.resources = { clay: 10, wood: 2, coins: 0 };
    expectError(applyAction(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "apprentice"),
      shapes: ["vase"],
      dingExtraShape: "vase",
    }, rng), "INVALID_ACTION");
    expectError(applyAction(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "apprentice"),
      shapes: ["censer"],
      dingExtraShape: "censer",
    }, rng), "INVALID_ACTION");

    addTechnique(state, "P1", "T03");
    state = mustApply(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "apprentice"),
      shapes: ["plate"],
      dingExtraShape: "plate",
      useTechniqueIds: ["T03"],
    }, rng);
    expect(state.players["P1"]!.resources.coins).toBe(2);
    expect(state.players["P1"]!.techniques.find((technique) => technique.id === "T03")?.exhausted).toBe(true);

    setWorkTurn(state, "P1");
    expectError(applyAction(state, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(state, "P1", "apprentice"),
      shapes: ["bowl"],
      dingExtraShape: "bowl",
    }, rng), "INVALID_ACTION");
  });

  it("charges Ding's own Clay even when the worker-effect vessel supply uses proxies", () => {
    const { state: initial, rng } = startedGame(2, 12_606);
    const before = structuredClone(initial);
    before.players["P1"]!.kilnId = "DI";
    before.players["P1"]!.resources.clay = 10;
    before.vesselSupply.washer = [];
    const after = mustApply(before, "P1", {
      type: "FORM_CERAMICS",
      workerId: workerId(before, "P1", "apprentice"),
      shapes: ["washer"],
      dingExtraShape: "washer",
    }, rng);
    expect(claySpent(before, after)).toBe(SHAPE_COSTS.washer * 2);
    expect(ownedShapes(after)).toEqual(["washer", "washer"]);
  });
});

describe("V1.2.7 Kiln Yard Shifu commitment", () => {
  it("loads one ceramic and marks it during the Kiln Yard action", () => {
    const { state: initial, rng } = startedGame(2, 12_609);
    const state = structuredClone(initial);
    const ceramic = addGlazed(state, "P1", "bowl", "celadon", "plain");
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD",
      workerId: workerId(state, "P1", "shifu"),
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "high_1" }],
      shifuCeramicId: ceramic.id,
    }, rng);

    expect(result.state.players["P1"]!.kilnYardShifuCeramicId).toBe(ceramic.id);
    expect(result.events).toContainEqual({
      type: "KILN_YARD_SHIFU_MARKED",
      playerId: "P1",
      ceramicId: ceramic.id,
    });
  });

  it("requires exactly one selected target when a Shifu loads two Shared-Kiln ceramics", () => {
    const { state: initial, rng } = startedGame(2, 12_610);
    let state = structuredClone(initial);
    const first = addGlazed(state, "P1", "bowl", "celadon", "plain");
    const second = addGlazed(state, "P1", "plate", "celadon", "plain");
    const shifu = workerId(state, "P1", "shifu");

    expectError(applyAction(state, "P1", {
      type: "USE_KILN_YARD",
      workerId: shifu,
      loads: [{ ceramicId: first.id, kilnSpaceId: "high_1" }],
    }, rng), "INVALID_SELECTION");

    const loaded = mustResult(state, "P1", {
      type: "USE_KILN_YARD",
      workerId: shifu,
      loads: [
        { ceramicId: first.id, kilnSpaceId: "high_1" },
        { ceramicId: second.id, kilnSpaceId: "middle_1" },
      ],
      shifuCeramicId: second.id,
    }, rng);
    state = loaded.state;
    expect(state.players["P1"]!.kilnYardShifuCeramicId).toBe(second.id);
    expect(loaded.events).toContainEqual({ type: "KILN_YARD_SHIFU_MARKED", playerId: "P1", ceramicId: second.id });
    expect(Object.values(state.players["P1"]!.workers).filter((worker) => worker.kind === "shifu" && worker.status === "placed")).toHaveLength(1);
  });

  it("adjusts only the marked owned Shared-Kiln ceramic, even when the kiln is full, without Wood", () => {
    const { state: initial, rng } = startedGame(2, 12_611);
    let state = structuredClone(initial);
    const marked = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const other = addLoaded(state, "P1", "plate", "celadon", "plain", "high_2");
    const opponent = addLoaded(state, "P2", "washer", "celadon", "plain", "middle_1");
    addLoaded(state, "P2", "bowl", "celadon", "plain", "low_1");
    const imperial = addLoaded(state, "P1", "bowl", "celadon", "plain", "imperial");
    state.players["P1"]!.resources.wood = 0;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.firingContext = {
      round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [],
      baseHeat: 2, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {},
    };
    const adjustment: GameAction = { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: marked.id, adjustment: -1 };
    expectError(applyAction(state, "P1", adjustment, rng), "WRONG_PHASE");
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
    for (const invalidTarget of [other.id, opponent.id, imperial.id]) {
      expectError(applyAction(state, "P1", { ...adjustment, ceramicId: invalidTarget }, rng), "INVALID_SELECTION");
    }
    for (const invalidAdjustment of [0, 2, -2, undefined, "1"]) {
      expectError(applyAction(state, "P1", { ...adjustment, adjustment: invalidAdjustment } as unknown as GameAction, rng), "INVALID_SELECTION");
    }
    expectError(applyAction(state, "P1", { ...adjustment, adjustment: null }, rng), "INVALID_SELECTION");
    expectError(applyAction(state, "P1", { ...adjustment, ceramicId: null }, rng), "INVALID_SELECTION");
    expectError(applyAction(state, "P2", adjustment, rng), "NOT_ACTIVE_PLAYER");
    const resources = structuredClone(state.players["P1"]!.resources);
    const result = mustResult(state, "P1", adjustment, rng);
    state = result.state;
    expect(state.ceramics[marked.id]).toMatchObject({ kilnSpaceId: "high_1", shifuHeatAdjustment: -1 });
    expect(state.ceramics[other.id]).not.toHaveProperty("shifuHeatAdjustment");
    expect(state.ceramics[opponent.id]).not.toHaveProperty("shifuHeatAdjustment");
    expect(state.ceramics[imperial.id]).not.toHaveProperty("shifuHeatAdjustment");
    expect(state.players["P1"]!.resources).toEqual(resources);
    expect(state.firingContext).toMatchObject({ baseHeat: 2, fireModifier: null, globalHeat: null });
    expect(result.events).toContainEqual({ type: "KILN_YARD_SHIFU_ADJUSTED", playerId: "P1", ceramicId: marked.id, adjustment: -1 });
    expectError(applyAction(state, "P1", adjustment, rng), "WRONG_PHASE");
  });

  it("resolves in First Player order, preserves used Shifu until Cleanup, and removes markers after firing", () => {
    const { state: initial, rng } = startedGame(2, 12_612);
    let state = structuredClone(initial);
    state.firstPlayerId = "P2";
    const p1 = addGlazed(state, "P1", "bowl", "grey_green", "plain");
    const p2 = addGlazed(state, "P2", "plate", "celadon", "plain");
    state = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"),
      loads: [{ ceramicId: p1.id, kilnSpaceId: "middle_1" }], shifuCeramicId: p1.id,
    }, rng);
    setWorkTurn(state, "P2");
    state = mustApply(state, "P2", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P2", "shifu"),
      loads: [{ ceramicId: p2.id, kilnSpaceId: "low_1" }], shifuCeramicId: p2.id,
    }, rng);
    state.fireDeck = [0];
    state.fireDiscard = [];
    state.phase = { type: "work", activePlayerId: "P1" };
    state = finishWork(state, rng).state;
    let privateState = createPrivateFiringState(state);
    for (const playerId of ["P1", "P2"]) {
      const submitted = submitWoodContribution(state, privateState, playerId, "TEND", false, rng);
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) return;
      state = submitted.state;
      privateState = submitted.privateState;
    }
    expect(state.phase).toEqual({ type: "firing_shifu_adjustment", queue: { actors: ["P2", "P1"], currentIndex: 0 } });
    expectError(applyAction(state, "P1", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: p1.id, adjustment: 1 }, rng), "NOT_ACTIVE_PLAYER");
    state = mustApply(state, "P2", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: p2.id, adjustment: 1 }, rng);
    expect(state.phase).toEqual({ type: "firing_shifu_adjustment", queue: { actors: ["P2", "P1"], currentIndex: 1 } });
    expect(state.players["P2"]!.kilnYardShifuCeramicId).toBeNull();
    expectError(applyAction(state, "P2", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: p2.id, adjustment: -1 }, rng), "NOT_ACTIVE_PLAYER");
    const declined = mustResult(state, "P1", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: null, adjustment: null }, rng);
    state = declined.state;
    expect(declined.events).toContainEqual({ type: "KILN_YARD_SHIFU_ADJUSTMENT_DECLINED", playerId: "P1", ceramicId: p1.id });
    expect(state.ceramics[p1.id]).toMatchObject({ kilnSpaceId: "middle_1" });
    expect(state.ceramics[p1.id]).not.toHaveProperty("shifuHeatAdjustment");
    expect(state.ceramics[p2.id]).toMatchObject({ kilnSpaceId: "low_1", shifuHeatAdjustment: 1 });
    expect(state.phase).toEqual({ type: "firing_reveal_fire", actorId: "P2" });
    const history = [
      { playerId: "P2", ceramicId: p2.id, adjustment: 1 },
      { playerId: "P1", ceramicId: p1.id, adjustment: null },
    ];
    expect(state.firingContext?.kilnYardShifuAdjustments).toEqual(history);
    state = mustApply(state, "P2", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(state.lastFiringResult?.kilnYardShifuAdjustments).toEqual(history);
    expect(state.lastFiringResult).toMatchObject({ baseHeat: 2, fireModifier: 0, globalHeat: 2 });
    expect(state.lastFiringResult?.ceramicResults?.[p1.id]).toMatchObject({ zoneModifier: 0, shifuHeatAdjustment: 0, finalActualHeat: 2 });
    expect(state.lastFiringResult?.ceramicResults?.[p2.id]).toMatchObject({ zoneModifier: -1, shifuHeatAdjustment: 1, finalActualHeat: 2 });
    for (const playerId of ["P1", "P2"]) {
      expect(state.players[playerId]!.workers[`${playerId}:shifu`]?.status).toBe("placed");
      expect(state.players[playerId]!.kilnYardShifuUsedThisRound).toBe(true);
    }
    expect(state.ceramics[p2.id]).not.toHaveProperty("shifuHeatAdjustment");
    while (state.phase.type === "orders") state = mustApply(state, state.phase.activePlayerId, { type: "END_ORDER_TURN" }, rng);
    expect(state.round).toBe(2);
    for (const playerId of ["P1", "P2"]) {
      expect(state.players[playerId]!.workers[`${playerId}:shifu`]?.status).toBe("available");
      expect(state.players[playerId]!.kilnYardShifuUsedThisRound).toBe(false);
      expect(state.players[playerId]!.kilnYardShifuCeramicId).toBeNull();
    }
  });

  it.each([-1, 1] as const)("adds the %s Shifu marker independently of Kiln Furniture's neutral zone", (adjustment) => {
    const { state: initial, rng } = startedGame(2, 12_613);
    let state = structuredClone(initial);
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1", true);
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;
    state.players["P1"]!.kilnYardShifuCeramicId = ceramic.id;
    state.firingContext = {
      round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [],
      baseHeat: 2, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {},
    };
    state.fireDeck = [0];
    state.phase = { type: "firing_shifu_adjustment", queue: { actors: ["P1"], currentIndex: 0 } };
    state = mustApply(state, "P1", { type: "RESOLVE_KILN_YARD_ADJUSTMENT", ceramicId: ceramic.id, adjustment }, rng);
    expect(state.ceramics[ceramic.id]).toMatchObject({ stage: "loaded", kilnSpaceId: "high_1", kilnFurnitureUsed: true, shifuHeatAdjustment: adjustment });
    const result = mustResult(state, state.firstPlayerId, { type: "REVEAL_FIRE_CARD" }, rng);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "FIRING_RESOLVED", ceramicId: ceramic.id, zoneModifier: 0, shifuHeatAdjustment: adjustment, finalActualHeat: 2 + adjustment,
    }));
    expect(result.state.ceramics[ceramic.id]).not.toHaveProperty("shifuHeatAdjustment");
    expect(result.state.ceramics[ceramic.id]).not.toHaveProperty("kilnFurnitureUsed");
  });

  it("cannot mark the Imperial Kiln and gets no adjustment when no owned Shared-Kiln ceramic exists", () => {
    const { state: initial, rng } = startedGame(2, 12_614);
    let state = structuredClone(initial);
    const ceramic = addGlazed(state, "P1", "bowl", "celadon", "plain");
    state.players["P1"]!.imperialKilnUnlocked = true;
    const shifu = workerId(state, "P1", "shifu");
    expectError(applyAction(state, "P1", {
      type: "USE_KILN_YARD", workerId: shifu,
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "imperial" }], shifuCeramicId: ceramic.id,
    }, rng), "INVALID_SELECTION");
    state = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: shifu,
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "imperial" }],
    }, rng);
    expect(state.players["P1"]!.kilnYardShifuCeramicId).toBeNull();
    state.phase = { type: "work", activePlayerId: "P1" };
    state = finishWork(state, rng).state;
    expect(state.phase.type).toBe("firing_contributions");
    let privateState = createPrivateFiringState(state);
    const submitted = submitWoodContribution(state, privateState, "P1", "TEND", false, rng);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.state.phase.type).not.toBe("firing_shifu_adjustment");
  });

  it("commits the Shifu target before Test Pieces and keeps it through the pre-Contribution window", () => {
    const { state: initial, rng } = startedGame(2, 12_615);
    let state = structuredClone(initial);
    const ceramic = addGlazed(state, "P1", "bowl", "celadon", "plain");
    addTechnique(state, "P1", "T13");
    state.players["P1"]!.resources.wood = 2;
    state = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"),
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "middle_1" }], shifuCeramicId: ceramic.id,
    }, rng);
    state.phase = { type: "work", activePlayerId: "P1" };
    state = finishWork(state, rng).state;
    expect(state.phase.type).toBe("firing_before_contribution");
    expect(state.players["P1"]!.kilnYardShifuCeramicId).toBe(ceramic.id);
    state = mustApply(state, "P1", { type: "RESOLVE_TEST_PIECES", use: true }, rng);
    expect(state.phase.type).toBe("firing_contributions");
    expect(state.players["P1"]!.kilnYardShifuCeramicId).toBe(ceramic.id);
  });
});
