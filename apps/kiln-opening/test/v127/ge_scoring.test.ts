import { describe, expect, it } from "vitest";
import { ORDER_DEFINITIONS, applyAction, findGeGlazes, matchesOrder, matchesOrderWithGe } from "../../src/game/index.ts";
import type { GameAction, GameState, GeGlazeChoice } from "../../src/game/index.ts";
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
    const ceramics = [addFinished(state, "P1", "plate", "fine", "white", "painted"), addFinished(state, "P1", "vase", "fine", "white", "impressed"), addFinished(state, "P1", "censer", "fine", "white", "carved")];
    for (const ceramic of ceramics) ceramic.crackle = true;
    orderPhase(state);
    const choices = [{ ceramicId: ceramics[0]!.id, glaze: "grey_green" as const }, { ceramicId: ceramics[1]!.id, glaze: "moon_white" as const }, { ceramicId: ceramics[2]!.id, glaze: "celadon" as const }];
    expect(matchesOrder(ORDER_DEFINITIONS["O46"]!, ceramics)).toBe(false);
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: "O46", ceramicIds: ceramics.map(({ id }) => id), geGlazes: choices, imperialGrantChoice: "coins" }, rng);
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(used);
    expect(result.events).not.toContainEqual({ type: "KILN_ABILITY_USED", playerId: "P1", kilnId: "GE" });
    for (const ceramic of ceramics) expect(result.state.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: ceramic.quality, glaze: "white", decoration: ceramic.decoration, crackle: true });
  });

  it("can substitute on consecutive Orders even after this round's Crackle creation", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE"; state.players["P1"]!.kilnAbilityUsedThisRound = true;
    state.players["P1"]!.orderHand = ["O07", "O08"];
    const a = addFinished(state, "P1", "bowl", "fine", "white", "plain");
    const b = addFinished(state, "P1", "censer", "fine", "white", "plain"); a.crackle = true; b.crackle = true;
    orderPhase(state);
    expectError(applyAction(state, "P1", { type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [a.id] }, rng), "ORDER_REQUIREMENTS_NOT_MET");
    let next = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [a.id], geGlazes: [{ ceramicId: a.id, glaze: "celadon" }] }, rng);
    orderPhase(next);
    next = mustApply(next, "P1", { type: "COMPLETE_ORDER", orderId: "O08", ceramicIds: [b.id], geGlazes: [{ ceramicId: b.id, glaze: "grey_green" }] }, rng);
    expect(next.ceramics[b.id]).toMatchObject({ stage: "delivered", quality: "fine", glaze: "white", decoration: "plain", crackle: true });
  });

  it("does not substitute Quality, Shape or Decoration, and requires a distinct marked target", () => {
    const { state } = startedGame(2);
    const a = addFinished(state, "P1", "bowl", "standard", "white", "plain"); a.crackle = true;
    const choice = [{ ceramicId: a.id, glaze: "celadon" as const }];
    expect(matchesOrder(ORDER_DEFINITIONS["O06"]!, [a], "GE")).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [a], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [{ ...a, quality: "flawed" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O18"]!, [{ ...a, quality: "fine" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "fine" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O16"]!, [{ ...a, quality: "fine" }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [{ ...a, quality: "fine", crackle: false }], choice)).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [{ ...a, quality: "fine" }], [...choice, ...choice])).toBe(false);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [{ ...a, quality: "fine" }], [{ ceramicId: "not-selected", glaze: "celadon" }])).toBe(false);
    expect(findGeGlazes(ORDER_DEFINITIONS["O07"]!, [{ ...a, quality: "fine" }])).toEqual(choice);
    expect(findGeGlazes(ORDER_DEFINITIONS["O10"]!, [{ ...a, quality: "fine" }])).toBeNull();
  });

  it("uses one consistent virtual Glaze for every named, same, different and category check", () => {
    const { state } = startedGame(2);
    const a = addFinished(state, "P1", "bowl", "fine", "white", "plain"); a.crackle = true;
    const b = addFinished(state, "P1", "plate", "fine", "celadon", "carved");
    const bothCeladon = ORDER_DEFINITIONS["O35"]!;
    const choice = [{ ceramicId: a.id, glaze: "celadon" as const }];
    expect(matchesOrderWithGe(bothCeladon, [a, b], choice)).toBe(true);
    expect(matchesOrderWithGe({ ...bothCeladon, relations: [...bothCeladon.relations!, { type: "same_glaze", indices: [0, 1] }] }, [a, b], choice)).toBe(true);
    expect(matchesOrderWithGe({ ...bothCeladon, relations: [...bothCeladon.relations!, { type: "different_glaze", indices: [0, 1] }] }, [a, b], choice)).toBe(false);
    expect(matchesOrderWithGe({ ...bothCeladon, relations: [...bothCeladon.relations!, { type: "required_glazes", values: ["white", "celadon"] }] }, [a, b], choice)).toBe(false);
    expect(matchesOrderWithGe({ ...bothCeladon, relations: [...bothCeladon.relations!, { type: "glaze_categories", indices: [0, 1], categories: [["white"], ["celadon"]] }] }, [a, b], choice)).toBe(false);
    expect(matchesOrderWithGe({ ...bothCeladon, relations: [...bothCeladon.relations!, { type: "at_least_n_distinct_glazes", indices: [0, 1], count: 2 }] }, [a, b], choice)).toBe(false);
    expect(a).toMatchObject({ glaze: "white", decoration: "plain" });
  });

  it("rejects malformed Glaze choices and obsolete Decoration commands without changing the state", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    state.players["P1"]!.orderHand = ["O07"];
    const ceramic = addFinished(state, "P1", "bowl", "fine", "white", "plain"); ceramic.crackle = true;
    orderPhase(state);
    const before = structuredClone(state);
    for (const geGlazes of [null, {}, [null], [{ ceramicId: ceramic.id, glaze: "painted" }], [{ ceramicId: ceramic.id, decoration: "painted" }], [{ ceramicId: ceramic.id, glaze: "celadon" }, { ceramicId: ceramic.id, glaze: "white" }]]) {
      const action = { type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [ceramic.id], geGlazes } as unknown as GameAction;
      expectError(applyAction(state, "P1", action, rng), "ORDER_REQUIREMENTS_NOT_MET");
    }
    expectError(applyAction(state, "P1", { type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [ceramic.id], geDecorations: [{ ceramicId: ceramic.id, decoration: "painted" }] } as unknown as GameAction, rng), "INVALID_SELECTION");
    expect(state).toEqual(before);
    expect(matchesOrderWithGe(ORDER_DEFINITIONS["O07"]!, [ceramic], [{ ceramicId: ceramic.id, glaze: "invalid" }] as unknown as GeGlazeChoice[])).toBe(false);
  });

  it.each([false, true])("scores only actual Fine Quality and Glaze diversity in Exhibition (diverse Glazes: %s)", (diverseGlazes) => {
    const { state, rng } = startedGame(2); state.players["P1"]!.kilnId = "GE";
    const ceramics = [addFinished(state, "P1", "bowl", "fine", "white", "plain"), addFinished(state, "P1", "plate", "fine", "celadon", "carved"), addFinished(state, "P1", "vase", "fine", "moon_white", "painted")];
    ceramics.forEach((ceramic) => { ceramic.crackle = true; if (!diverseGlazes) ceramic.glaze = "white"; });
    const flawed = addFinished(state, "P1", "washer", "flawed", "white", "plain"); flawed.crackle = true;
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    expectError(applyAction(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: [flawed.id] }, rng), "PRESENTATION_NOT_ELIGIBLE");
    const first = mustApply(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: ceramics.map(({ id }) => id) }, rng);
    const final = mustApply(first, "P2", { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, rng);
    expect(final.finalResult!.scores["P1"]!.presentation).toBe(diverseGlazes ? 15 : 12);
    for (const ceramic of ceramics) expect(final.ceramics[ceramic.id]).toMatchObject({ stage: "presented", quality: "fine", decoration: ceramic.decoration, glaze: ceramic.glaze, crackle: true });
  });

  it("can choose Second Firing before Ge and rechecks the resulting Quality", () => {
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
    expect(saved.phase).toMatchObject({ type: "firing_after_quality", geAvailable: true });
    const cracked = mustApply(saved, "P1", { type: "RESOLVE_GE", ceramicId: ceramic.id }, rng);
    expect(cracked.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "fine", decoration: "carved", crackle: true });
    orderPhase(cracked);
    const completed = mustApply(cracked, "P1", { type: "COMPLETE_ORDER", orderId: "O06", ceramicIds: [ceramic.id] }, rng);
    expect(completed.ceramics[ceramic.id]).toMatchObject({ stage: "delivered", quality: "fine", decoration: "carved", crackle: true });
  });
});
