import { describe, expect, it } from "vitest";
import {
  applyAction,
  contributionHeatAdjustment,
  contributionWoodCost,
  createPrivateFiringState,
  determineBaseHeat,
  kilnZoneModifier,
  preferredHeat,
  qualityFromDifference,
  submitWoodContribution,
} from "../../src/game/index.ts";
import type { FiringCeramicResult, FiringContext, GameState } from "../../src/game/index.ts";
import {
  addGlazed,
  addLoaded,
  addTechnique,
  expectError,
  mustApply,
  mustResult,
  startedGame,
  workerId,
} from "./helpers.ts";

function openContributions(state: GameState, eligiblePlayerIds: string[]): void {
  state.phase = {
    type: "firing_contributions",
    windowId: `${state.gameId}:test-contributions`,
    eligiblePlayerIds,
    submittedPlayerIds: [],
  };
  state.firingContext = null;
}

function pendingResult(ceramicId: string, values: Partial<FiringCeramicResult> = {}): FiringCeramicResult {
  return {
    ceramicId,
    zoneModifier: 0,
    naturalActualHeat: 2,
    naturalHeatDifference: 0,
    naturalExactMatch: true,
    finalActualHeat: 2,
    finalHeatDifference: 0,
    forcedQuality: null,
    assignedQuality: null,
    ...values,
  };
}

function firingContext(ceramicResults: Record<string, FiringCeramicResult>): FiringContext {
  return {
    round: 1,
    contributors: ["P1"],
    contributions: { P1: "TEND" },
    fuelLedgerUpgradedBy: [],
    baseHeat: 2,
    fireModifier: 0,
    globalHeat: 2,
    ceramicResults,
  };
}

describe("V1.2.2 firing, Tech timing, and Kiln Traditions", () => {
  it("uses the exact Contribution costs and clamps Base Heat only", () => {
    expect(contributionWoodCost("BANK")).toBe(1);
    expect(contributionWoodCost("TEND")).toBe(0);
    expect(contributionWoodCost("STOKE")).toBe(1);
    expect(contributionHeatAdjustment("BANK")).toBe(-1);
    expect(contributionHeatAdjustment("TEND")).toBe(0);
    expect(contributionHeatAdjustment("STOKE")).toBe(1);
    expect(determineBaseHeat([-2, -2, -2, -2])).toBe(0);
    expect(determineBaseHeat([2, 2, 2, 2])).toBe(5);
    expect(determineBaseHeat([-1, 0, 1])).toBe(2);
  });

  it("maps all Heat differences and Shared Kiln zones exactly", () => {
    expect([0, 1, 2, 3, 8].map(qualityFromDifference)).toEqual([
      "masterpiece", "fine", "standard", "flawed", "flawed",
    ]);
    expect(preferredHeat("white")).toBe(1);
    expect(preferredHeat("celadon")).toBe(2);
    expect(preferredHeat("grey_green")).toBe(3);
    expect(preferredHeat("moon_white")).toBe(4);
    expect(kilnZoneModifier("high_1")).toBe(1);
    expect(kilnZoneModifier("middle_1")).toBe(0);
    expect(kilnZoneModifier("low_1")).toBe(-1);
  });

  it("offers Fuel Ledger as secret -2/+2 contributions, charges 2 Wood total, and reveals atomically", () => {
    const { state: initial, rng } = startedGame(2, 1401);
    let state = structuredClone(initial);
    addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1");
    addLoaded(state, "P2", "plate", "celadon", "plain", "low_1");
    addTechnique(state, "P1", "T12");
    state.players["P1"]!.resources.wood = 2;
    state.players["P2"]!.resources.wood = 1;
    state.players["P1"]!.kilnId = "RU";
    state.players["P2"]!.kilnId = "GU";
    state.fireDeck = [0];
    state.fireDiscard = [];
    openContributions(state, ["P1", "P2"]);
    let privateState = createPrivateFiringState(state);

    const first = submitWoodContribution(state, privateState, "P1", "BANK", true, rng);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.state;
    privateState = first.privateState;
    expect(state.phase).toEqual(expect.objectContaining({ type: "firing_contributions", submittedPlayerIds: ["P1"] }));
    expect(state.firingContext).toBeNull();
    expect(state.players["P1"]!.resources.wood).toBe(2);
    expect(privateState.contributions).toEqual({ P1: "BANK" });
    expect(privateState.fuelLedgerCommittedBy).toEqual(["P1"]);
    expect(first.events).toEqual([expect.objectContaining({ type: "WOOD_SUBMITTED", playerId: "P1" })]);

    const second = submitWoodContribution(state, privateState, "P2", "STOKE", false, rng);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    state = second.state;
    expect(state.players["P1"]!.resources.wood).toBe(0);
    expect(state.players["P2"]!.resources.wood).toBe(0);
    expect(second.events).toContainEqual({
      type: "WOOD_REVEALED",
      contributions: { P1: "BANK", P2: "STOKE" },
      effectiveHeatAdjustments: { P1: -2, P2: 1 },
    });
    expect(second.events).toContainEqual(expect.objectContaining({ type: "FIRE_REVEALED", baseHeat: 1 }));
    expect(second.privateState.contributions).toEqual({});
    expect(second.privateState.fuelLedgerCommittedBy).toEqual([]);
  });

  it("rejects a Fuel Ledger option without its Tech, with Tend, or without 2 Wood", () => {
    const { state: initial, rng } = startedGame(2, 1402);
    let state = structuredClone(initial);
    addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    openContributions(state, ["P1"]);
    let privateState = createPrivateFiringState(state);
    let result = submitWoodContribution(state, privateState, "P1", "STOKE", true, rng);
    expect(result.ok).toBe(false);

    addTechnique(state, "P1", "T12");
    state.players["P1"]!.resources.wood = 2;
    privateState = createPrivateFiringState(state);
    result = submitWoodContribution(state, privateState, "P1", "TEND", true, rng);
    expect(result.ok).toBe(false);

    state.players["P1"]!.resources.wood = 1;
    privateState = createPrivateFiringState(state);
    result = submitWoodContribution(state, privateState, "P1", "BANK", true, rng);
    expect(result.ok).toBe(false);
  });

  it("does not clamp Global or Actual Heat, and gives the Imperial Kiln no zone modifier", () => {
    const { state: initial, rng } = startedGame(4, 1403);
    let state = structuredClone(initial);
    const high = addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    const imperial = addLoaded(state, "P2", "plate", "white", "plain", "imperial");
    const furniture = addLoaded(state, "P3", "washer", "white", "plain", "low_1", true);
    addLoaded(state, "P4", "vase", "white", "plain", "middle_1");
    for (const id of ["P1", "P2", "P3", "P4"]) {
      state.players[id]!.resources.wood = 1;
      state.players[id]!.kilnId = "RU";
    }
    state.fireDeck = [2];
    state.fireDiscard = [];
    openContributions(state, ["P1", "P2", "P3", "P4"]);
    let privateState = createPrivateFiringState(state);
    for (const id of ["P1", "P2", "P3", "P4"] as const) {
      const result = submitWoodContribution(state, privateState, id, "STOKE", false, rng);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      state = result.state;
      privateState = result.privateState;
    }
    expect(state.firingContext?.baseHeat).toBe(5);
    expect(state.firingContext?.globalHeat).toBe(7);
    expect(state.firingContext?.ceramicResults[high.id]?.finalActualHeat).toBe(8);
    expect(state.firingContext?.ceramicResults[imperial.id]?.finalActualHeat).toBe(7);
    expect(state.firingContext?.ceramicResults[furniture.id]?.finalActualHeat).toBe(7);
    expect(state.firingContext?.ceramicResults[imperial.id]?.zoneModifier).toBe(0);
    expect(state.firingContext?.ceramicResults[furniture.id]?.zoneModifier).toBe(0);
  });

  it("lets a Kiln Yard Shifu reposition only a Shared-Kiln ceramic after Base Heat and before Fire", () => {
    const { state: initial, rng } = startedGame(2, 1404);
    let state = structuredClone(initial);
    const shared = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    const imperial = addLoaded(state, "P1", "plate", "celadon", "plain", "imperial");
    const shifu = Object.values(state.players["P1"]!.workers).find(({ kind }) => kind === "shifu")!;
    shifu.status = "placed";
    shifu.locationId = "kiln_yard";
    state.actionBoard.placements.kiln_yard.push(shifu.id);
    state.players["P1"]!.kilnId = "RU";
    state.fireDeck = [0];
    openContributions(state, ["P1"]);
    const privateState = createPrivateFiringState(state);
    const submitted = submitWoodContribution(state, privateState, "P1", "TEND", false, rng);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    state = submitted.state;
    expect(state.phase.type).toBe("firing_reposition");
    expect(state.firingContext?.baseHeat).toBe(2);
    expect(state.firingContext?.fireModifier).toBeNull();
    expectError(applyAction(state, "P1", { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: imperial.id, toSpaceId: "low_1" }, rng), "ILLEGAL_CERAMIC_STAGE");
    const moved = mustResult(state, "P1", { type: "RESOLVE_KILN_YARD_REPOSITION", ceramicId: shared.id, toSpaceId: "low_1" }, rng);
    state = moved.state;
    expect(moved.events).toContainEqual(expect.objectContaining({ type: "FIRING_RESOLVED", ceramicId: shared.id, zoneModifier: -1 }));
    expect(state.ceramics[shared.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "fine" }));
    expect(moved.events).toContainEqual(expect.objectContaining({ type: "FIRE_REVEALED", baseHeat: 2, modifier: 0 }));
  });

  it("uses Imperial Priority once to add an Imperial-Kiln load beyond the worker's normal limit", () => {
    const { state: initial, rng } = startedGame(2, 1405);
    let state = structuredClone(initial);
    const shared = addGlazed(state, "P1", "bowl", "white", "plain");
    const imperial = addGlazed(state, "P1", "plate", "celadon", "plain");
    state.players["P1"]!.imperialKilnUnlocked = true;
    state.players["P1"]!.imperialPriorityAvailable = true;
    const result = mustResult(state, "P1", {
      type: "USE_KILN_YARD",
      workerId: workerId(state, "P1", "apprentice"),
      loads: [
        { ceramicId: shared.id, kilnSpaceId: "high_1" },
        { ceramicId: imperial.id, kilnSpaceId: "imperial" },
      ],
      useImperialPriority: true,
    }, rng);
    state = result.state;
    expect(state.players["P1"]!.imperialPriorityAvailable).toBe(false);
    expect(result.events).toContainEqual({ type: "IMPERIAL_PRIORITY_USED", playerId: "P1" });
    expect(state.ceramics[imperial.id]).toEqual(expect.objectContaining({ stage: "loaded", kilnSpaceId: "imperial" }));
  });

  it("applies Kiln Furniture only to a High/Low load and preserves its zero modifier", () => {
    const { state: initial, rng } = startedGame(2, 1406);
    let state = structuredClone(initial);
    addTechnique(state, "P1", "T15");
    const ceramic = addGlazed(state, "P1", "bowl", "white", "plain");
    state = mustApply(state, "P1", {
      type: "USE_KILN_YARD", workerId: workerId(state, "P1", "apprentice"),
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "high_1", useKilnFurniture: true }],
    }, rng);
    expect(state.ceramics[ceramic.id]).toEqual(expect.objectContaining({ kilnFurnitureUsed: true }));
    expect(state.players["P1"]!.techniques.find(({ id }) => id === "T15")?.exhausted).toBe(true);
  });

  it("lets Test Pieces privately peek without removing the Fire card", () => {
    const { state: initial, rng } = startedGame(2, 1407);
    let state = structuredClone(initial);
    addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    addTechnique(state, "P1", "T13");
    state.players["P1"]!.resources.wood = 2;
    state.fireDeck = [-2, 1];
    state.phase = { type: "firing_before_contribution", queue: { actors: ["P1"], currentIndex: 0 }, techniqueIds: ["T13"] };
    const before = [...state.fireDeck];
    state = mustApply(state, "P1", { type: "RESOLVE_TEST_PIECES", use: true }, rng);
    expect(state.privateFirePeeks?.["P1"]).toBe(-2);
    expect(state.fireDeck).toEqual(before);
    expect(state.players["P1"]!.resources.wood).toBe(1);
    expect(state.phase.type).toBe("firing_contributions");
  });

  it("resolves Jun at 1 Wood and Ge at no cost before Quality", () => {
    const { state: initial, rng } = startedGame(2, 1408);

    let state = structuredClone(initial);
    const junCeramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "high_1");
    state.players["P1"]!.kilnId = "JU";
    state.players["P1"]!.resources.wood = 1;
    state.firingContext = firingContext({ [junCeramic.id]: pendingResult(junCeramic.id, { zoneModifier: 1, finalActualHeat: 3, finalHeatDifference: 1 }) });
    state.phase = { type: "firing_before_quality", queue: { actors: ["P1"], currentIndex: 0 } };
    state = mustApply(state, "P1", { type: "RESOLVE_JUN", ceramicId: junCeramic.id, delta: -1 }, rng);
    expect(state.players["P1"]!.resources.wood).toBe(0);
    expect(state.ceramics[junCeramic.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "masterpiece" }));

    state = structuredClone(initial);
    const geCeramic = addLoaded(state, "P1", "plate", "celadon", "plain", "high_1");
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.resources.wood = 0;
    state.firingContext = firingContext({ [geCeramic.id]: pendingResult(geCeramic.id, { zoneModifier: 1, finalActualHeat: 3, finalHeatDifference: 1 }) });
    state.phase = { type: "firing_before_quality", queue: { actors: ["P1"], currentIndex: 0 } };
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: geCeramic.id }, rng);
    expect(state.players["P1"]!.resources.wood).toBe(0);
    expect(state.ceramics[geCeramic.id]).toEqual(expect.objectContaining({ decoration: "crackle" }));
    expect(state.ceramics[geCeramic.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "masterpiece", decoration: "crackle" }));
  });

  it("resolves Protective Saggars and immediate Second Firing in after-Quality order", () => {
    const { state: initial, rng } = startedGame(2, 1409);

    let state = structuredClone(initial);
    const protectedCeramic = addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    addTechnique(state, "P1", "T11");
    state.players["P1"]!.resources.wood = 1;
    state.firingContext = firingContext({ [protectedCeramic.id]: pendingResult(protectedCeramic.id, { assignedQuality: "standard", finalHeatDifference: 2 }) });
    state.phase = { type: "firing_after_quality", queue: { actors: ["P1"], currentIndex: 0 }, techniqueIds: ["T11"] };
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: protectedCeramic.id }, rng);
    expect(state.ceramics[protectedCeramic.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "fine" }));
    expect(state.players["P1"]!.resources.wood).toBe(0);

    state = structuredClone(initial);
    const refired = addLoaded(state, "P1", "vase", "moon_white", "plain", "high_1");
    addTechnique(state, "P1", "T14");
    state.fireDeck = [1];
    state.fireDiscard = [];
    state.firingContext = firingContext({ [refired.id]: pendingResult(refired.id, { zoneModifier: 1, assignedQuality: "standard", finalActualHeat: 2, finalHeatDifference: 2 }) });
    state.phase = { type: "firing_after_quality", queue: { actors: ["P1"], currentIndex: 0 }, techniqueIds: ["T14"] };
    const second = mustResult(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: refired.id }, rng);
    state = second.state;
    expect(second.events).toContainEqual({ type: "SECOND_FIRING_RESOLVED", playerId: "P1", ceramicId: refired.id, fireModifier: 1, quality: "masterpiece" });
    expect(state.fireDiscard).toContain(1);
    expect(state.ceramics[refired.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "masterpiece" }));
  });

  it("offers Workshop Seconds after after-Quality effects and discards at most one Flawed ceramic for 2 Coins", () => {
    const { state: initial, rng } = startedGame(2, 1410);
    let state = structuredClone(initial);
    const first = addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    const second = addLoaded(state, "P1", "plate", "white", "plain", "high_2");
    state.firingContext = firingContext({
      [first.id]: pendingResult(first.id, { zoneModifier: 1, assignedQuality: "flawed", finalHeatDifference: 3 }),
      [second.id]: pendingResult(second.id, { zoneModifier: 1, assignedQuality: "flawed", finalHeatDifference: 3 }),
    });
    state.phase = { type: "firing_workshop_seconds", queue: { actors: ["P1"], currentIndex: 0 } };
    const coinsBefore = state.players["P1"]!.resources.coins;
    const result = mustResult(state, "P1", { type: "RESOLVE_WORKSHOP_SECONDS", ceramicId: first.id }, rng);
    state = result.state;
    expect(state.ceramics[first.id]).toBeUndefined();
    expect(state.ceramics[second.id]).toEqual(expect.objectContaining({ stage: "finished", quality: "flawed" }));
    expect(state.players["P1"]!.resources.coins).toBe(coinsBefore + 2);
    expect(state.phase.type).toBe("orders");
    expect(result.events.filter(({ type }) => type === "WORKSHOP_SECONDS_SOLD")).toHaveLength(1);
  });
});
