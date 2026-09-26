import { describe, expect, it } from "vitest";
import { applyAction, currentDecisionActor } from "../../src/game/index.ts";
import type { FireModifier, GameAction, GameState, Glaze, KilnSpaceId, PlayerId, SeededRandom, TechniqueId } from "../../src/game/index.ts";
import { addLoaded, addTechnique, mustApply, startedGame } from "../v127/helpers.ts";

interface LoadFixture {
  space: KilnSpaceId | "imperial";
  glaze?: Glaze;
  ownerId?: PlayerId;
}

/** Base 3 + Fire 0: White/Middle and Celadon/High are Standard; White/High is Flawed. */
function firingFixture(loads: LoadFixture[], techniques: TechniqueId[] = ["T11", "T14"], extraFire: FireModifier = 0) {
  const { state, rng } = startedGame(2, 140_830);
  state.firstPlayerId = "P1";
  state.players["P1"]!.kilnId = "GE";
  state.players["P2"]!.kilnId = "RU";
  state.players["P1"]!.resources.wood = 4;
  for (const id of techniques) addTechnique(state, "P1", id);
  const ceramics = loads.map((load, index) => addLoaded(state, load.ownerId ?? "P1", index === 0 ? "bowl" : "plate", load.glaze ?? "white", "plain", load.space));
  state.fireDeck = [0, extraFire];
  state.fireDiscard = [];
  state.phase = { type: "firing_reveal_fire", actorId: "P1" };
  state.firingContext = {
    round: 1, contributors: [...new Set(ceramics.map((ceramic) => ceramic.ownerId))],
    contributions: { P1: "STOKE", ...(ceramics.some((ceramic) => ceramic.ownerId === "P2") ? { P2: "TEND" as const } : {}) },
    baseHeat: 3, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {},
  };
  return { state, rng, ceramics };
}

function reveal(state: GameState, rng: SeededRandom): GameState {
  return mustApply(state, state.firstPlayerId, { type: "REVEAL_FIRE_CARD" }, rng);
}

function afterQuality(state: GameState) {
  expect(state.phase.type).toBe("firing_after_quality");
  if (state.phase.type !== "firing_after_quality") throw new Error("Expected combined after-Quality window");
  return state.phase;
}

function quality(state: GameState, ceramicId: string) {
  const ceramic = state.ceramics[ceramicId];
  return ceramic !== undefined && "quality" in ceramic ? ceramic.quality : state.firingContext?.ceramicResults[ceramicId]?.assignedQuality;
}

function rejectsWithoutMutation(state: GameState, action: GameAction, rng: SeededRandom, actorId = "P1"): void {
  const before = structuredClone(state);
  expect(applyAction(state, actorId, action, rng).ok).toBe(false);
  expect(state).toEqual(before);
}

const twoStandard: LoadFixture[] = [{ space: "middle_1" }, { space: "high_1", glaze: "celadon" }];

describe("owner amendment: choose the order of Ge, Saggars and Second Firing", () => {
  it("offers Ge alongside both Techs and permits Ge first, then the Techs on other ceramics", () => {
    const fixture = firingFixture([...twoStandard, { space: "low_1", glaze: "moon_white" }]);
    const [geTarget, saggarTarget, refireTarget] = fixture.ceramics;
    let state = reveal(fixture.state, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: ["T11", "T14"] });

    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: geTarget!.id }, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T11", "T14"] });
    expect(quality(state, geTarget!.id)).toBe("fine");
    expect(state.ceramics[geTarget!.id]).toMatchObject({ crackle: true, decoration: "plain" });
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: saggarTarget!.id }, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T14"] });
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: refireTarget!.id }, fixture.rng);
    expect(state.phase.type).toBe("orders");
    expect([geTarget, saggarTarget, refireTarget].map((ceramic) => quality(state, ceramic!.id))).toEqual(["fine", "fine", "standard"]);
    expect(state.players["P1"]!.resources.wood).toBe(3);
  });

  it("Ge first makes that Fine ceramic ineligible for either Tech while another Standard remains eligible", () => {
    const fixture = firingFixture(twoStandard);
    const [first, second] = fixture.ceramics;
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: first!.id }, fixture.rng);
    expect(afterQuality(state).techniqueIds).toEqual(["T11", "T14"]);
    rejectsWithoutMutation(state, { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: first!.id }, fixture.rng);
    rejectsWithoutMutation(state, { type: "RESOLVE_SECOND_FIRING", ceramicId: first!.id }, fixture.rng);
    expect(applyAction(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: second!.id }, fixture.rng).ok).toBe(true);
  });

  it("Saggars Standard → Fine removes Ge eligibility immediately", () => {
    const fixture = firingFixture([{ space: "middle_1" }, { space: "high_1" }]);
    const target = fixture.ceramics[0]!;
    let state = reveal(fixture.state, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(true);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: target.id }, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T14"] });
    expect(quality(state, target.id)).toBe("fine");
    rejectsWithoutMutation(state, { type: "RESOLVE_GE", ceramicId: target.id }, fixture.rng);
    expect(state.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
  });

  it("Saggars Flawed → Standard unlocks Ge in the same window", () => {
    const fixture = firingFixture([{ space: "high_1" }], ["T11"]);
    const target = fixture.ceramics[0]!;
    let state = reveal(fixture.state, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T11"] });
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: target.id }, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: [] });
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: target.id }, fixture.rng);
    expect(state.ceramics[target.id]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
  });

  it("Second Firing can remove the only Ge target without forcing a stale Ge decision", () => {
    const fixture = firingFixture([{ space: "middle_1" }, { space: "high_1" }], ["T11", "T14"], -1);
    const target = fixture.ceramics[0]!;
    let state = reveal(fixture.state, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(true);
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: target.id }, fixture.rng);
    expect(quality(state, target.id)).toBe("fine");
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T11"] });
    rejectsWithoutMutation(state, { type: "RESOLVE_GE", ceramicId: target.id }, fixture.rng);
  });

  it("Second Firing can create a Standard result and immediately unlock Ge", () => {
    const fixture = firingFixture([{ space: "high_1" }], ["T14"], -1);
    const target = fixture.ceramics[0]!;
    let state = reveal(fixture.state, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(false);
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: target.id }, fixture.rng);
    expect(quality(state, target.id)).toBe("standard");
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: [] });
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: target.id }, fixture.rng);
    expect(state.ceramics[target.id]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
    expect(state.fireDiscard).toEqual([-1, 0]);
  });

  it("used Techs stay unavailable after a later Quality change makes a ceramic eligible again", () => {
    const fixture = firingFixture([{ space: "high_1" }, { space: "middle_1" }], ["T11", "T14"], 1);
    const target = fixture.ceramics[0]!;
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: target.id }, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: target.id }, fixture.rng);
    expect(quality(state, target.id)).toBe("flawed");
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: [] });
    expect(state.players["P1"]!.techniques).toEqual(expect.arrayContaining([{ id: "T11", exhausted: true }, { id: "T14", exhausted: true }]));
    rejectsWithoutMutation(state, { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: target.id }, fixture.rng);
    rejectsWithoutMutation(state, { type: "RESOLVE_SECOND_FIRING", ceramicId: target.id }, fixture.rng);
  });

  it("used Ge does not become available again after another effect produces Standard Quality", () => {
    const fixture = firingFixture([{ space: "middle_1" }, { space: "high_1" }]);
    const [geTarget, flawedTarget] = fixture.ceramics;
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: geTarget!.id }, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: flawedTarget!.id }, fixture.rng);
    expect(quality(state, flawedTarget!.id)).toBe("standard");
    expect(afterQuality(state)).toMatchObject({ geAvailable: false, techniqueIds: ["T14"] });
    rejectsWithoutMutation(state, { type: "RESOLVE_GE", ceramicId: flawedTarget!.id }, fixture.rng);
  });

  it("declining all three ends the window without costs or ability use", () => {
    const fixture = firingFixture(twoStandard);
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: null }, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(false);
    expect(afterQuality(state).declinedGePlayerIds).toContain("P1");
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }, fixture.rng);
    expect(afterQuality(state).techniqueIds).toEqual(["T14"]);
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: null }, fixture.rng);
    expect(state.phase.type).toBe("orders");
    expect(state.players["P1"]!.resources.wood).toBe(4);
    expect(state.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
    expect(state.players["P1"]!.techniques.every((technique) => !technique.exhausted)).toBe(true);
    for (const ceramic of fixture.ceramics) expect(state.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "standard" });
  });

  it("reoffers declined Ge after an actual Tech use while preserving its unused allowance", () => {
    const fixture = firingFixture(twoStandard);
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: null }, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(false);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: fixture.ceramics[0]!.id }, fixture.rng);
    expect(afterQuality(state).geAvailable).toBe(true);
    expect(afterQuality(state).declinedGePlayerIds).not.toContain("P1");
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: fixture.ceramics[1]!.id }, fixture.rng);
    expect(state.ceramics[fixture.ceramics[1]!.id]).toMatchObject({ stage: "finished", quality: "fine", crackle: true });
  });

  it("reoffers a declined Tech after an actual Ge use, allowing a different eligible ceramic", () => {
    const fixture = firingFixture(twoStandard);
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }, fixture.rng);
    expect(afterQuality(state).techniqueIds).not.toContain("T11");
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: fixture.ceramics[0]!.id }, fixture.rng);
    expect(afterQuality(state).techniqueIds).toContain("T11");
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: fixture.ceramics[1]!.id }, fixture.rng);
    expect(state.players["P1"]!.techniques.find((technique) => technique.id === "T11")?.exhausted).toBe(true);
    expect(quality(state, fixture.ceramics[1]!.id)).toBe("fine");
  });

  it("clears both kinds of declines after Second Firing actually changes the result", () => {
    const fixture = firingFixture(twoStandard, ["T11", "T14"], 1);
    let state = reveal(fixture.state, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: null }, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }, fixture.rng);
    state = mustApply(state, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: fixture.ceramics[0]!.id }, fixture.rng);
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: ["T11"] });
    expect(afterQuality(state).declinedGePlayerIds).not.toContain("P1");
    expect(afterQuality(state).declinedTechniqueIds["P1"] ?? []).toEqual([]);
    expect(quality(state, fixture.ceramics[0]!.id)).toBe("flawed");
  });

  it("finishes each player's combined choices in First Player order", () => {
    const fixture = firingFixture([{ space: "middle_1" }, { ownerId: "P2", space: "high_1", glaze: "celadon" }], []);
    fixture.state.firstPlayerId = "P2";
    fixture.state.phase = { type: "firing_reveal_fire", actorId: "P2" };
    addTechnique(fixture.state, "P2", "T11");
    let state = reveal(fixture.state, fixture.rng);
    expect(currentDecisionActor(state.phase)).toBe("P2");
    expect(afterQuality(state).geAvailable).toBe(false);
    rejectsWithoutMutation(state, { type: "RESOLVE_GE", ceramicId: fixture.ceramics[0]!.id }, fixture.rng, "P1");
    state = mustApply(state, "P2", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: fixture.ceramics[1]!.id }, fixture.rng);
    expect(currentDecisionActor(state.phase)).toBe("P1");
    expect(afterQuality(state)).toMatchObject({ geAvailable: true, techniqueIds: [] });
    state = mustApply(state, "P1", { type: "RESOLVE_GE", ceramicId: fixture.ceramics[0]!.id }, fixture.rng);
    expect(state.phase.type).toBe("orders");
  });
});
