import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, applyAction, matchesOrder, matchesOrderWithGe } from "../../src/game/index.ts";
import type { GameState } from "../../src/game/index.ts";
import { addFinished, addLoaded, addTechnique, expectError, mustApply, mustResult, startedGame } from "./helpers.ts";

function orderPhase(state: GameState): void {
  state.phase = { type: "orders", activePlayerId: "P1", turnOrder: ["P1", "P2"], currentIndex: 0, completedInCircuit: 0 };
  // Keep the Order circuit open so round-use checks are observed before Cleanup.
  state.players["P2"]!.orderHand = ["S01"];
  addFinished(state, "P2", "bowl", "standard");
}

describe("Ge owner amendment: contextual Quality", () => {
  it.each([
    { held: true, used: false }, { held: true, used: true },
    { held: false, used: false }, { held: false, used: true },
  ])("fulfils Fine Orders with multiple Standard Crackle pieces (held=$held, active-used=$used)", ({ held, used }) => {
    const { state, rng } = startedGame(2);
    const player = state.players["P1"]!;
    player.kilnId = "GE";
    player.kilnAbilityUsedThisRound = used;
    player.orderHand = held ? ["O35"] : [];
    state.marketDisplay = held ? [] : ["O35"];
    const ceramics = (["bowl", "plate"] as const).map((shape) => addFinished(state, "P1", shape, "standard", "celadon", "crackle"));
    orderPhase(state);
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: "O35", ceramicIds: ceramics.map(({ id }) => id), imperialGrantChoice: "coins" }, rng);
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(used);
    expect(result.events).not.toContainEqual({ type: "KILN_ABILITY_USED", playerId: "P1", kilnId: "GE" });
    for (const ceramic of ceramics) expect(result.state.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "standard", decoration: "crackle" });
  });

  it("applies the Quality bonus before a temporary Plain Decoration and permits only one use per round", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.orderHand = ["O10", "O05"];
    const a = addFinished(state, "P1", "bowl", "standard", "white", "crackle");
    const b = addFinished(state, "P1", "censer", "standard", "white", "crackle");
    orderPhase(state);
    expectError(applyAction(state, "P1", { type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [a.id] }, rng), "ORDER_REQUIREMENTS_NOT_MET");
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [a.id], geDecoration: { ceramicId: a.id, decoration: "plain" } }, rng);
    expect(result.state.ceramics[a.id]).toMatchObject({ stage: "delivered", quality: "standard", decoration: "crackle" });
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);
    expect(result.events).toContainEqual({ type: "KILN_ABILITY_USED", playerId: "P1", kilnId: "GE" });
    if (result.state.phase.type !== "orders") throw new Error("Expected Order phase");
    result.state.phase.activePlayerId = "P1";
    expectError(applyAction(result.state, "P1", { type: "COMPLETE_ORDER", orderId: "O05", ceramicIds: [b.id], geDecoration: { ceramicId: b.id, decoration: "carved" } }, rng), "ABILITY_ALREADY_USED");
  });

  it("does not upgrade Flawed ceramics, other Decorations, other Kilns or Masterpiece requirements", () => {
    const { state } = startedGame(2);
    const fineOrder = ORDER_DEFINITIONS["O06"]!;
    const crackle = addFinished(state, "P1", "bowl", "standard", "white", "crackle");
    expect(matchesOrder(fineOrder, [crackle], "GE")).toBe(true);
    expect(matchesOrder(fineOrder, [crackle], "RU")).toBe(false);
    expect(matchesOrder(fineOrder, [{ ...crackle, decoration: "carved" }], "GE")).toBe(false);
    expect(matchesOrder(fineOrder, [{ ...crackle, quality: "flawed" }], "GE")).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["O16"]!, [crackle], "GE")).toBe(false);
    const other = addFinished(state, "P1", "vase", "fine", "white", "carved");
    expect(matchesOrder(ORDER_DEFINITIONS["O33"]!, [crackle, other], "GE")).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["O33"]!, [crackle, { ...other, quality: "masterpiece" }], "GE")).toBe(true);
    const fineCount = { ...ORDER_DEFINITIONS["O33"]!, relations: [{ type: "at_least_n_quality" as const, quality: "fine" as const, count: 2 }] };
    expect(matchesOrder(fineCount, [crackle, other], "GE")).toBe(true);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [{ ...crackle, quality: "flawed" }], { ceramicId: crackle.id, decoration: "plain" })).toBe(false);
  });

  it("scores every Standard Crackle as Fine in Exhibition without changing recorded attributes", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.kilnAbilityUsedThisRound = true;
    state.players["P2"]!.kilnId = "RU";
    const idsByPlayer = state.playerOrder.map((id) => [
      addFinished(state, id, "bowl", "standard", "white", "crackle"),
      addFinished(state, id, "plate", "standard", "white", "crackle"),
      addFinished(state, id, "bowl", "standard", "white", "plain"),
      addFinished(state, id, "bowl", "fine", "white", "crackle"),
      addFinished(state, id, "bowl", "masterpiece", "white", "crackle"),
    ].map(({ id: ceramicId }) => ceramicId));
    const flawed = addFinished(state, "P1", "vase", "flawed", "white", "crackle");
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    expectError(applyAction(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: [flawed.id] }, rng), "PRESENTATION_NOT_ELIGIBLE");
    const first = mustApply(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: idsByPlayer[0]! }, rng);
    const final = mustApply(first, "P2", { type: "SUBMIT_PRESENTATION", ceramicIds: idsByPlayer[1]! }, rng);
    expect(final.finalResult!.scores["P1"]!.presentation).toBe(16);
    expect(final.finalResult!.scores["P2"]!.presentation).toBe(14);
    for (const id of idsByPlayer[0]!.slice(0, 2)) expect(final.ceramics[id]).toMatchObject({ stage: "presented", quality: "standard", decoration: "crackle" });
  });

  it("keeps Standard Crackle eligible for Second Firing", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    addTechnique(state, "P1", "T14");
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "crackle", "middle_1");
    state.phase = { type: "firing_reveal_fire", actorId: "P1" };
    state.fireDeck = [0, -2];
    state.firingContext = { round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [], baseHeat: 4, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {} };
    const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(fired.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("standard");
    expect(fired.phase).toMatchObject({ type: "firing_after_quality", techniqueIds: ["T14"] });
    const refired = mustApply(fired, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    expect(refired.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "masterpiece", decoration: "crackle" });
  });

  it("counts a Crackle ceramic saved to Standard by Protective Saggars as Fine for an Order", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.orderHand = ["O06"];
    addTechnique(state, "P1", "T11");
    const ceramic = addLoaded(state, "P1", "bowl", "white", "crackle", "middle_1");
    state.phase = { type: "firing_reveal_fire", actorId: "P1" };
    state.fireDeck = [0];
    state.firingContext = { round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [], baseHeat: 4, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {} };
    const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(fired.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("flawed");
    const saved = mustApply(fired, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id }, rng);
    expect(saved.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "standard", decoration: "crackle" });
    orderPhase(saved);
    const completed = mustApply(saved, "P1", { type: "COMPLETE_ORDER", orderId: "O06", ceramicIds: [ceramic.id] }, rng);
    expect(completed.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "standard", decoration: "crackle" });
  });
});
