import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, applyAction, findGeDecorations, matchesOrder, matchesOrderWithGe } from "../../src/game/index.ts";
import type { GameState } from "../../src/game/index.ts";
import { addFinished, addLoaded, addTechnique, expectError, mustApply, mustResult, startedGame } from "./helpers.ts";

function orderPhase(state: GameState): void {
  state.phase = { type: "orders", activePlayerId: "P1", turnOrder: ["P1", "P2"], currentIndex: 0, completedInCircuit: 0 };
  state.players["P2"]!.orderHand = ["S01"];
  addFinished(state, "P2", "bowl", "standard");
}
function firing(state: GameState, baseHeat: 4 = 4): void {
  state.phase = { type: "firing_reveal_fire", actorId: "P1" };
  state.fireDeck = [0, -2];
  state.firingContext = { round: 1, contributors: ["P1"], contributions: { P1: "TEND" }, baseHeat, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {} };
}

describe("V1.4 permanent Crackle and actual Quality", () => {
  it.each([{ held: true, used: false }, { held: true, used: true }, { held: false, used: false }, { held: false, used: true }])("uses multiple independent persistent substitutions (held=$held, creation-used=$used)", ({ held, used }) => {
    const { state, rng } = startedGame(2);
    const player = state.players["P1"]!;
    player.kilnId = "GE"; player.kilnAbilityUsedThisRound = used;
    player.orderHand = held ? ["O46"] : []; state.marketDisplay = held ? [] : ["O46"];
    const ceramics = [addFinished(state, "P1", "plate", "fine", "grey_green", "plain"), addFinished(state, "P1", "vase", "fine", "moon_white", "plain"), addFinished(state, "P1", "censer", "fine", "celadon", "plain")];
    for (const ceramic of ceramics) ceramic.crackle = true;
    orderPhase(state);
    const choices = [{ ceramicId: ceramics[0]!.id, decoration: "painted" as const }, { ceramicId: ceramics[1]!.id, decoration: "impressed" as const }, { ceramicId: ceramics[2]!.id, decoration: "carved" as const }];
    expect(matchesOrder(ORDER_DEFINITIONS["O46"]!, ceramics)).toBe(false);
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: "O46", ceramicIds: ceramics.map(({ id }) => id), geDecorations: choices, imperialGrantChoice: "coins" }, rng);
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(used);
    expect(result.events).not.toContainEqual({ type: "KILN_ABILITY_USED", playerId: "P1", kilnId: "GE" });
    for (const ceramic of ceramics) expect(result.state.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: ceramic.quality, decoration: "plain", crackle: true });
  });

  it("can substitute on consecutive Orders even after this round's Crackle creation", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE"; state.players["P1"]!.kilnAbilityUsedThisRound = true;
    state.players["P1"]!.orderHand = ["O10", "O05"];
    const a = addFinished(state, "P1", "bowl", "fine", "white", "plain");
    const b = addFinished(state, "P1", "censer", "fine", "white", "plain"); a.crackle = true; b.crackle = true;
    orderPhase(state);
    expectError(applyAction(state, "P1", { type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [a.id] }, rng), "ORDER_REQUIREMENTS_NOT_MET");
    let next = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [a.id], geDecorations: [{ ceramicId: a.id, decoration: "painted" }] }, rng);
    orderPhase(next);
    next = mustApply(next, "P1", { type: "COMPLETE_ORDER", orderId: "O05", ceramicIds: [b.id], geDecorations: [{ ceramicId: b.id, decoration: "carved" }] }, rng);
    expect(next.ceramics[b.id]).toMatchObject({ stage: "delivered", quality: "fine", decoration: "plain", crackle: true });
  });

  it("does not substitute Quality or Glaze, and rejects duplicate or unmarked choices", () => {
    const { state } = startedGame(2);
    const a = addFinished(state, "P1", "bowl", "standard", "white", "plain"); a.crackle = true;
    const choice = [{ ceramicId: a.id, decoration: "painted" as const }];
    expect(matchesOrder(ORDER_DEFINITIONS["O06"]!, [a], "GE")).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [a], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "flawed" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O17"]!, [{ ...a, shape: "washer", quality: "fine", glaze: "celadon" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O16"]!, [{ ...a, quality: "fine" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "fine", crackle: false }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "fine" }], [...choice, ...choice])).toBe(false);
    expect(findGeDecorations(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "fine" }])).not.toBeNull();
  });

  it("uses one consistent virtual Decoration for every same/different/required check", () => {
    const { state } = startedGame(2);
    const a = addFinished(state, "P1", "bowl", "fine", "celadon", "plain"); a.crackle = true;
    const b = addFinished(state, "P1", "censer", "fine", "grey_green", "carved");
    const same = ORDER_DEFINITIONS["O37"]!;
    const choice = [{ ceramicId: a.id, decoration: "carved" as const }];
    expect(matchesOrderWithGe(same, [a, b], choice)).toBe(true);
    expect(matchesOrderWithGe({ ...same, relations: [...same.relations!, { type: "different_decoration", indices: [0, 1] }] }, [a, b], choice)).toBe(false);
    expect(a.decoration).toBe("plain");
  });

  it("scores actual Fine Crackle in Exhibition and leaves actual Glaze and Decoration unchanged", () => {
    const { state, rng } = startedGame(2); state.players["P1"]!.kilnId = "GE";
    const ceramics = [addFinished(state, "P1", "bowl", "fine", "white", "plain"), addFinished(state, "P1", "plate", "fine", "celadon", "carved"), addFinished(state, "P1", "vase", "fine", "moon_white", "painted")];
    ceramics.forEach((ceramic) => { ceramic.crackle = true; });
    const flawed = addFinished(state, "P1", "washer", "flawed", "white", "plain"); flawed.crackle = true;
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    expectError(applyAction(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: [flawed.id] }, rng), "PRESENTATION_NOT_ELIGIBLE");
    const first = mustApply(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: ceramics.map(({ id }) => id) }, rng);
    const final = mustApply(first, "P2", { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, rng);
    expect(final.finalResult!.scores["P1"]!.presentation).toBe(15);
    for (const ceramic of ceramics) expect(final.ceramics[ceramic.id]).toMatchObject({ stage: "presented", quality: "fine", decoration: ceramic.decoration, glaze: ceramic.glaze, crackle: true });
  });

  it("resolves Second Firing before deciding whether Ge may create Crackle", () => {
    const { state, rng } = startedGame(2); state.players["P1"]!.kilnId = "GE";
    addTechnique(state, "P1", "T14");
    const ceramic = addLoaded(state, "P1", "bowl", "celadon", "plain", "middle_1"); firing(state);
    const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(fired.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("standard");
    expect(fired.phase).toMatchObject({ type: "firing_after_quality", techniqueIds: ["T14"] });
    const refired = mustApply(fired, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    expect(refired.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "masterpiece", decoration: "plain" });
    expect(refired.ceramics[ceramic.id]?.crackle).toBeUndefined();
  });

  it("lets Protective Saggars save Flawed to Standard before Ge upgrades actual Quality to Fine", () => {
    const { state, rng } = startedGame(2); state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.orderHand = ["O06"]; addTechnique(state, "P1", "T11");
    const ceramic = addLoaded(state, "P1", "bowl", "white", "carved", "middle_1"); firing(state);
    const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    expect(fired.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("flawed");
    const saved = mustApply(fired, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id }, rng);
    expect(saved.phase.type).toBe("firing_ge");
    const cracked = mustApply(saved, "P1", { type: "RESOLVE_GE", ceramicId: ceramic.id }, rng);
    expect(cracked.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "fine", decoration: "carved", crackle: true });
    orderPhase(cracked);
    const completed = mustApply(cracked, "P1", { type: "COMPLETE_ORDER", orderId: "O06", ceramicIds: [ceramic.id] }, rng);
    expect(completed.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "fine", decoration: "carved", crackle: true });
  });
});
