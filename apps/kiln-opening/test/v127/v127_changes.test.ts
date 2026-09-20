import { describe, expect, it } from "vitest";
import {
  applyAction, createPrivateFiringState, currentDecisionActor, locationCapacity,
  matchesOrder, matchesOrderWithGe, ORDER_DEFINITIONS, qualityForOrderOrExhibition, submitWoodContribution,
} from "../../src/game/index.ts";
import type { Decoration, GameState, Glaze, Shape } from "../../src/game/index.ts";
import { projectPublicEvents, projectPublicGameState } from "../../src/multiplayer/projection.ts";
import { createComputerObservation } from "../../src/multiplayer/computerObservation.ts";
import { addFinished, addGlazed, addLoaded, addShaped, addTechnique, expectError, finishWork, mustApply, mustResult, setWorkTurn, startedGame, workerId } from "./helpers.ts";

function orders(state: GameState): void {
  state.phase = { type: "orders", activePlayerId: "P1", turnOrder: ["P1", "P2"], currentIndex: 0, completedInCircuit: 0 };
}
function reveal(state: GameState, baseHeat: 0 | 1 | 2 | 3 | 4 | 5 = 4): void {
  state.firstPlayerId = "P1";
  state.phase = { type: "firing_reveal_fire", actorId: "P1" };
  state.fireDeck = [0];
  state.firingContext = { round: state.round, contributors: ["P1"], contributions: { P1: "TEND" }, fuelLedgerUpgradedBy: [], baseHeat, fireModifier: null, globalHeat: null, kilnYardShifuAdjustments: [], ceramicResults: {} };
}

describe("V1.2.7 Court Patronage and mandatory Work", () => {
  it.each(["shifu", "apprentice"] as const)("uses %s at each permitted Recognition step and resolves every milestone", (kind) => {
    const { state: initial, rng } = startedGame(2);
    for (const from of [0, 1, 2] as const) {
      const state = structuredClone(initial);
      state.players["P1"]!.imperialRecognition = from;
      state.players["P1"]!.resources.coins = 4;
      state.actionBoard.placements.court_patronage = Array(20).fill("occupied");
      const result = mustResult(state, "P1", { type: "USE_COURT_PATRONAGE", workerId: workerId(state, "P1", kind), imperialGrantChoice: "resources" }, rng);
      expect(result.state.players["P1"]!.imperialRecognition).toBe(from + 1);
      expect(result.state.players["P1"]!.resources.coins).toBe(from === 0 ? 1 : 0);
      if (from === 0) expect(result.state.players["P1"]!.resources).toEqual({ clay: 3, wood: 3, coins: 1 });
      if (from === 1) expect(result.state.players["P1"]!.imperialKilnUnlocked).toBe(true);
      if (from === 2) expect(result.state.players["P1"]!.imperialPriorityAvailable).toBe(true);
      expect(result.state.players["P1"]!.imperialAudienceVpAwarded).toBe(false);
      expect(result.events).toContainEqual(expect.objectContaining({ type: "IMPERIAL_RECOGNITION_ADVANCED", orderId: null, crowns: 0, appliedCrowns: 0, overflowVp: 0 }));
    }
    expect(locationCapacity("court_patronage", 4)).toBe(Infinity);
  });
  it("requires payment and a Grant choice, forbids advancing to 4, and permits repeat visits", () => {
    const { state, rng } = startedGame(2);
    const id = workerId(state, "P1", "apprentice");
    expectError(applyAction(state, "P1", { type: "USE_COURT_PATRONAGE", workerId: id, imperialGrantChoice: "coins" }, rng), "INSUFFICIENT_RESOURCES");
    state.players["P1"]!.resources.coins = 12;
    expectError(applyAction(state, "P1", { type: "USE_COURT_PATRONAGE", workerId: id }, rng), "INVALID_SELECTION");
    let next = state;
    for (let step = 0; step < 3; step += 1) {
      setWorkTurn(next, "P1");
      next = mustApply(next, "P1", { type: "USE_COURT_PATRONAGE", workerId: workerId(next, "P1", "apprentice"), imperialGrantChoice: "coins" }, rng);
    }
    expect(next.actionBoard.placements.court_patronage).toHaveLength(3);
    for (const recognition of [3, 4] as const) {
      setWorkTurn(next, "P1"); next.players["P1"]!.imperialRecognition = recognition;
      expectError(applyAction(next, "P1", { type: "USE_COURT_PATRONAGE", workerId: workerId(next, "P1", "shifu") }, rng), "INVALID_ACTION");
    }
  });
  it.each([2, 3, 4] as const)("places all four workers for every workshop at %i players", (count) => {
    const { state, rng } = startedGame(count);
    expectError(applyAction(state, "P1", { type: "PASS_WORK_PHASE" }, rng), "INVALID_ACTION");
    const result = finishWork(state, rng);
    expect(result.events.filter((event) => event.type === "WORKER_PLACED")).toHaveLength(count * 4);
    for (const player of Object.values(result.state.players)) expect(player.resources.coins).toBe(13);
    expect(result.state.phase.type).toBe("orders");
  });
});

describe("V1.2.7 Ge", () => {
  it.each(["flawed", "standard", "fine", "masterpiece"] as const)("counts %s Crackle Quality only for Orders and Exhibition", (quality) => {
    expect(qualityForOrderOrExhibition({ quality, decoration: "crackle" }, "GE")).toBe(quality === "standard" ? "fine" : quality);
    expect(qualityForOrderOrExhibition({ quality, decoration: "plain" }, "GE")).toBe(quality);
    expect(qualityForOrderOrExhibition({ quality, decoration: "crackle" }, "RU")).toBe(quality);
  });
  it("preserves actual Standard Quality on Ge Shared and Imperial ceramics", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE"; state.players["P1"]!.kilnAbilityUsedThisRound = true;
    const a = addLoaded(state, "P1", "bowl", "celadon", "crackle", "middle_1");
    const b = addLoaded(state, "P1", "plate", "celadon", "crackle", "imperial");
    const c = addLoaded(state, "P2", "vase", "celadon", "crackle", "middle_2");
    state.players["P2"]!.kilnId = "RU";
    reveal(state);
    const result = mustResult(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    for (const id of [a.id, b.id]) expect(result.state.ceramics[id]).toMatchObject({ stage: "finished", quality: "standard", decoration: "crackle" });
    expect(result.state.ceramics[c.id]).toMatchObject({ stage: "finished", quality: "standard" });
    expect(result.state.lastFiringResult!.ceramicResults![a.id]!.finalHeatDifference).toBe(2);
  });
  it("preserves actual Standard Quality after Second Firing without a Ge prompt", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE";
    const ceramic = addLoaded(state, "P1", "bowl", "white", "crackle", "middle_1");
    addTechnique(state, "P1", "T14");
    reveal(state, 4); state.fireDeck = [0, -1];
    const fired = mustApply(state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
    const result = mustResult(fired, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    expect(result.state.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "standard", decoration: "crackle" });
    expect(result.state.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
  });
  it("uses one consistent virtual Decoration for same/different and required decorations", () => {
    const { state } = startedGame(2);
    const a = addFinished(state, "P1", "bowl", "standard", "celadon", "crackle");
    const b = addFinished(state, "P1", "censer", "fine", "grey_green", "carved");
    const same = ORDER_DEFINITIONS["O37"]!;
    expect(matchesOrder(same, [a,b])).toBe(false);
    expect(matchesOrderWithGe(same, [a,b], { ceramicId: a.id, decoration: "carved" })).toBe(true);
    expect(matchesOrderWithGe(same, [a,b], { ceramicId: b.id, decoration: "crackle" })).toBe(false);
    const contradiction = { ...same, relations: [...same.relations!, { type: "different_decoration" as const, indices: [0,1] }] };
    expect(matchesOrderWithGe(contradiction, [a,b], { ceramicId: a.id, decoration: "carved" })).toBe(false);
    expect(a.decoration).toBe("crackle");
  });
  it("reveals a completed held Order and preserves actual Crackle while consuming only one round use", () => {
    const { state, rng } = startedGame(2);
    state.players["P1"]!.kilnId = "GE"; state.players["P1"]!.orderHand = ["O10"];
    const c = addFinished(state, "P1", "bowl", "standard", "celadon", "crackle");
    orders(state);
    const result = mustResult(state, "P1", { type: "COMPLETE_ORDER", orderId: "O10", ceramicIds: [c.id], geDecoration: { ceramicId: c.id, decoration: "plain" } }, rng);
    expect(result.state.ceramics[c.id]).toMatchObject({ stage: "delivered", decoration: "crackle" });
    expect(projectPublicEvents(result.events)).toContainEqual({ type: "ORDER_COMPLETED", playerId: "P1", orderId: "O10", ceramicIds: [c.id] });
    // Reset opportunity only; the round-use restriction still applies.
    orders(result.state); result.state.players["P1"]!.kilnAbilityUsedThisRound = true;
    result.state.players["P1"]!.orderHand = ["O11"];
    const d = addFinished(result.state, "P1", "bowl", "masterpiece", "white", "crackle");
    expectError(applyAction(result.state, "P1", { type: "COMPLETE_ORDER", orderId: "O11", ceramicIds: [d.id], geDecoration: { ceramicId: d.id, decoration: "carved" } }, rng), "ABILITY_ALREADY_USED");
  });
});

describe("V1.2.7 Tech timing", () => {
  it.each(["kiln", "rapid", "priority"] as const)("uses Glaze Palette immediately before %s loading", (path) => {
    const { state, rng } = startedGame(2, 1274, ["ST03"]);
    addTechnique(state, "P1", "T06");
    state.players["P1"]!.imperialKilnUnlocked = true; state.players["P1"]!.imperialPriorityAvailable = path === "priority";
    const c = path === "rapid" ? addShaped(state, "P1", "bowl") : addGlazed(state, "P1", "bowl", "white", "carved");
    const resources = { ...state.players["P1"]!.resources };
    const action = path === "kiln" ? { type: "USE_KILN_YARD" as const, workerId: workerId(state, "P1", "apprentice"), loads: [{ ceramicId: c.id, kilnSpaceId: "imperial" as const, glazePalette: "moon_white" as const }] }
      : path === "rapid" ? { type: "GLAZE_CERAMICS" as const, workerId: workerId(state, "P1", "apprentice"), selections: [{ ceramicId: c.id, glaze: "white" as const, decoration: "carved" as const }], rapidDrying: { ceramicId: c.id, kilnSpaceId: "imperial" as const, glazePalette: "moon_white" as const } }
      : { type: "RESOLVE_IMPERIAL_PRIORITY" as const, ceramicId: c.id, glazePalette: "moon_white" as const };
    const next = mustApply(state, "P1", action, rng);
    expect(next.ceramics[c.id]).toMatchObject({ stage: "loaded", kilnSpaceId: "imperial", glaze: "moon_white", decoration: "carved", shape: "bowl" });
    expect(next.players["P1"]!.resources.coins).toBe(resources.coins - (path === "rapid" ? 2 : 0));
    expect(next.players["P1"]!.techniques).toContainEqual({ id: "T06", exhausted: true });
    setWorkTurn(next, "P1");
    const second = addGlazed(next, "P1");
    expectError(applyAction(next, "P1", { type: "USE_KILN_YARD", workerId: workerId(next, "P1", "apprentice"), loads: [{ ceramicId: second.id, kilnSpaceId: "low_1", glazePalette: "celadon" }] }, rng), "INVALID_ACTION");
  });
  it.each([false, true])("Colour Samples acquisition reserves immediately, preserves round use and gives no advance (display %s)", (fromDisplay) => {
    const { state, rng } = startedGame(2);
    for (const discipline of ["forming", "glazing", "firing"] as const) {
      state.techniqueDecks[discipline] = state.techniqueDecks[discipline].filter((id) => id !== "T10");
      state.techniqueDisplay[discipline] = state.techniqueDisplay[discipline].filter((id) => id !== "T10");
    }
    state.techniqueDisplay.glazing.unshift("T10");
    let next = mustApply(state, "P1", { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "apprentice") }, rng);
    const before = { ...next.players["P1"]!.resources };
    const display = [...next.marketDisplay];
    const deck = [...next.marketDeck];
    next = mustApply(next, "P1", { type: "GUILD_BUY_TECHNIQUE", techniqueId: "T10" }, rng);
    expect(next.phase).toMatchObject({ type: "work_office_orders", onAcquisition: true, colourSamplesChoices: deck.slice(0,3) });
    const selected = fromDisplay ? display[2]! : deck[1]!;
    const result = mustResult(next, "P1", { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: selected }, rng);
    next = result.state;
    expect(next.players["P1"]!.resources).toEqual({ ...before, coins: before.coins - 2 });
    expect(next.players["P1"]!.techniques).toContainEqual({ id: "T10", exhausted: false });
    expect(next.players["P1"]!.orderHand).toContain(selected);
    expect(next.phase.type).toBe("work");
    expect(next.marketDisplay).toEqual(fromDisplay ? [...display.filter((id) => id !== selected), deck[3]] : display);
    expect(JSON.stringify(projectPublicEvents(result.events))).not.toContain(selected);
    setWorkTurn(next, "P1");
    next = mustApply(next, "P1", { type: "BEGIN_OFFICE_ORDERS", workerId: workerId(next, "P1", "apprentice"), mode: "take_one" }, rng);
    next = mustApply(next, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES" }, rng);
    if (next.phase.type !== "work_office_orders") throw new Error("Missing selection");
    next = mustApply(next, "P1", { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: next.phase.colourSamplesChoices![0]! }, rng);
    expect(next.phase).toMatchObject({ type: "work_office_orders", step: "gain_advance" });
    expect(next.players["P1"]!.techniques).toContainEqual({ id: "T10", exhausted: true });
  });
  it("Large Throwing Wheel stacks, clamps to zero and charges Ding separately", () => {
    const { state, rng } = startedGame(2); state.players["P1"]!.kilnId = "DI"; state.players["P1"]!.resources.clay = 1;
    addTechnique(state, "P1", "T01");
    const next = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: workerId(state, "P1", "shifu"), shapes: ["vase", "bowl"], dingExtraShape: "bowl", useTechniqueIds: ["T01"] }, rng);
    expect(next.players["P1"]!.resources.clay).toBe(0);
    expect(Object.values(next.ceramics)).toHaveLength(3);
  });
  it("Prepared Clay triggers forming Techs and Drying Frames accepts a Decoration waiver", () => {
    const { state, rng } = startedGame(2, 1271, ["ST01"]);
    addTechnique(state, "P1", "T02"); addShaped(state, "P1", "plate");
    const next = mustApply(state, "P1", { type: "GAIN_MATERIALS", workerId: workerId(state, "P1", "apprentice"), clay: 3, wood: 0, preparedClayShape: "vase", useTechniqueIds: ["T02"] }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(5);
    next.players["P1"]!.techniques = [{ id: "T04", exhausted: false }, { id: "T07", exhausted: false }];
    next.players["P1"]!.resources.coins = 0; setWorkTurn(next, "P1");
    const formed = mustApply(next, "P1", { type: "FORM_CERAMICS", workerId: workerId(next, "P1", "apprentice"), shapes: ["bowl"], useTechniqueIds: ["T04", "T07"], dryingFrames: { formedIndex: 0, glaze: "white", decoration: "carved" } }, rng);
    expect(Object.values(formed.ceramics)).toContainEqual(expect.objectContaining({ stage: "glazed", decoration: "carved" }));
    expect(formed.players["P1"]!.resources.coins).toBe(0);
  });
});

describe("V1.2.7 privacy and Exhibition", () => {
  it("redacts hand IDs and passed choices from public state, events and rival observations", () => {
    const { state } = startedGame(2); state.players["P1"]!.orderHand = ["S01", "O11"]; state.players["P2"]!.orderHand = ["S08", "O48"];
    state.marketDisplay = ["O01"]; state.marketDiscard = []; orders(state);
    if (state.phase.type === "orders") state.phase.declinedCompletableOrderIdsByPlayer = { P2: ["S08", "O48"] };
    const publicState = projectPublicGameState(state);
    expect(publicState.players["P2"]!.orderHandCount).toBe(2);
    const publicJson = JSON.stringify(publicState);
    for (const id of ["S01", "O11", "S08", "O48"]) expect(publicJson).not.toContain(`"${id}"`);
    const observation = createComputerObservation(state, "P1");
    expect(observation.ownPrivate.orderHand).toEqual(["S01", "O11"]);
    expect(JSON.stringify(observation)).not.toContain('"O48"');
    const events = projectPublicEvents([
      { type: "ORDER_TAKEN", playerId: "P2", orderId: "O48", deck: "market", acquisition: "blind_deck" },
      { type: "COLOUR_SAMPLES_USED", playerId: "P2", deck: "market", selectedOrderId: "O48", discardedOrderIds: ["O47"], reservedFromDisplay: false },
      { type: "ORDERS_DISCARDED_FOR_CLEANUP", playerId: "P2", orderIds: ["S08"] },
    ]);
    for (const id of ["O48", "O47", "S08"]) expect(JSON.stringify(events)).not.toContain(id);
  });
  it("exhibits more than five and checks independent diversity bonuses across the whole collection", () => {
    const { state, rng } = startedGame(2);
    const shapes: Shape[] = ["bowl", "bowl", "plate", "washer", "vase", "censer"];
    const glazes: Glaze[] = ["white", "white", "white", "celadon", "moon_white", "grey_green"];
    const ids = shapes.map((shape, i) => addFinished(state, "P1", shape, "standard", glazes[i]!).id);
    state.phase = { type: "presentation", eligiblePlayerIds: ["P1","P2"], submittedPlayerIds: [] };
    const first = mustApply(state, "P1", { type: "SUBMIT_PRESENTATION", ceramicIds: ids }, rng);
    const final = mustApply(first, "P2", { type: "SUBMIT_PRESENTATION", ceramicIds: [] }, rng);
    expect(final.finalResult!.scores["P1"]!.presentation).toBe(18);
    expect(final.finalResult!.scores["P2"]!.presentation).toBe(0);
  });
});


describe("post-forming payment timing", () => {
  it("can spend Measuring Calipers income on the same action's Drying Frames", () => {
    const { state, rng } = startedGame(2);
    addTechnique(state, "P1", "T02"); addTechnique(state, "P1", "T04");
    addShaped(state, "P1", "bowl");
    state.players["P1"]!.resources.coins = 0;
    const result = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["vase"], useTechniqueIds: ["T02", "T04"], dryingFrames: { formedIndex: 0, glaze: "celadon", decoration: "carved" } }, rng);
    expect(result.players["P1"]!.resources.coins).toBe(0);
    expect(Object.values(result.ceramics)).toContainEqual(expect.objectContaining({ shape: "vase", stage: "glazed", decoration: "carved" }));
    expect(result.players["P1"]!.techniques.every((tech) => tech.exhausted)).toBe(true);
  });
});
