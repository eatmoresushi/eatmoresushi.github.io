import { describe, expect, it } from "vitest";
import { applyAction, createPrivateFiringState, submitWoodContribution } from "../../src/game/index.ts";
import type { GameAction, GameState, SeededRandom } from "../../src/game/index.ts";
import { addFinished, addLoaded, addTechnique, addWorkshop, expectError, finishWork, mustApply, mustResult, setWorkTurn, startedGame, workerId } from "../v127/helpers.ts";

function reveal(state: GameState, rng: SeededRandom): GameState {
  state.firstPlayerId = "P1";
  state.phase = { type: "firing_contributions", windowId: "v14-test", eligiblePlayerIds: ["P1"], submittedPlayerIds: [] };
  const submitted = submitWoodContribution(state, createPrivateFiringState(state), "P1", "TEND", rng);
  if (!submitted.ok) throw new Error(submitted.error.message);
  return mustApply(submitted.state, "P1", { type: "REVEAL_FIRE_CARD" }, rng);
}

describe("v1.4 workshop pipeline", () => {
  it("forms Plain for free and can skip Decoration to glaze and load for exactly 1 Coin", () => {
    const { state, rng } = startedGame(2, 140_001);
    const formed = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"] }, rng);
    const ceramic = Object.values(formed.ceramics)[0]!;
    expect(ceramic).toMatchObject({ stage: "workshop", decoration: "plain" });
    expect(ceramic).not.toHaveProperty("glaze");
    expect(formed.players["P1"]!.resources.coins).toBe(3);
    setWorkTurn(formed, "P1");
    const loaded = mustApply(formed, "P1", { type: "USE_KILN_YARD", workerId: workerId(formed, "P1", "apprentice"), loads: [{ ceramicId: ceramic.id, glaze: "celadon", kilnSpaceId: "middle_1" }] }, rng);
    expect(loaded.players["P1"]!.resources.coins).toBe(2);
    expect(loaded.ceramics[ceramic.id]).toMatchObject({ stage: "loaded", glaze: "celadon", decoration: "plain" });
  });

  it("requires the complete glazing payment before a Shifu loads two ceramics", () => {
    const { state, rng } = startedGame(2, 140_002);
    const first = addWorkshop(state, "P1");
    const second = addWorkshop(state, "P1", "plate", "painted");
    state.players["P1"]!.resources.coins = 1;
    const action: GameAction = { type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"), loads: [{ ceramicId: first.id, glaze: "white", kilnSpaceId: "middle_1" }, { ceramicId: second.id, glaze: "moon_white", kilnSpaceId: "middle_2" }], shifuCeramicId: first.id };
    const before = structuredClone(state);
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    expect(state).toEqual(before);
    state.players["P1"]!.resources.coins = 2;
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources.coins).toBe(0);
    expect(next.ceramics[second.id]).toMatchObject({ decoration: "painted", glaze: "moon_white", stage: "loaded" });
  });

  it.each(["plain", "carved", "impressed", "painted"] as const)("Plain is not an action and an already %s specialised vessel cannot be re-specialised", (decoration) => {
    const { state, rng } = startedGame(2, 140_003);
    const ceramic = addWorkshop(state, "P1", "bowl", decoration);
    const action: GameAction = { type: "DECORATE_CERAMICS", workerId: workerId(state, "P1", "apprentice"), selections: [{ ceramicId: ceramic.id, decoration: decoration === "plain" ? "plain" : "painted" }] };
    expectError(applyAction(state, "P1", action, rng), decoration === "plain" ? "INVALID_SELECTION" : "ILLEGAL_CERAMIC_STAGE");
  });

  it("White Slip uses Painted and Painting Brushes can waive its full 2-Coin cost", () => {
    const { state, rng } = startedGame(2, 140_004, ["ST02"]);
    addTechnique(state, "P1", "T09");
    state.players["P1"]!.resources.coins = 0;
    const action: Extract<GameAction, { type: "FORM_CERAMICS" }> = { type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], whiteSlip: { formedIndex: 0 } };
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    const next = mustApply(state, "P1", { ...action, useTechniqueIds: ["T09"] }, rng);
    expect(Object.values(next.ceramics)).toContainEqual(expect.objectContaining({ stage: "workshop", decoration: "painted" }));
    expect(next.players["P1"]!.techniques[0]?.exhausted).toBe(true);
  });

  it("Ding's extra Apprentice vessel is eligible for White Slip independently from Drying Frames", () => {
    const { state, rng } = startedGame(2, 140_005, ["ST02"]);
    state.players["P1"]!.resources.coins = 4;
    state.players["P1"]!.kilnId = "DI";
    addTechnique(state, "P1", "T04");
    const next = mustApply(state, "P1", { type: "FORM_CERAMICS", workerId: workerId(state, "P1", "apprentice"), shapes: ["bowl"], dingExtraShape: "bowl", whiteSlip: { formedIndex: 1 }, dryingFrames: { formedIndex: 0, decoration: "impressed" }, useTechniqueIds: ["T04"] }, rng);
    expect(Object.values(next.ceramics).map((ceramic) => ceramic.stage === "workshop" ? ceramic.decoration : null)).toEqual(["impressed", "painted"]);
    expect(next.players["P1"]!.resources).toEqual({ clay: 0, wood: 2, coins: 0 });
  });

  it("Rapid Drying pays the Decoration and exactly 1 Coin + 1 Wood for glazing/loading", () => {
    const { state, rng } = startedGame(2, 140_006, ["ST03"]);
    const ceramic = addWorkshop(state, "P1");
    const action: GameAction = { type: "DECORATE_CERAMICS", workerId: workerId(state, "P1", "apprentice"), selections: [{ ceramicId: ceramic.id, decoration: "carved" }], rapidDrying: { ceramicId: ceramic.id, glaze: "grey_green", kilnSpaceId: "high_1" } };
    state.players["P1"]!.resources.coins = 2;
    expectError(applyAction(state, "P1", action, rng), "INSUFFICIENT_RESOURCES");
    state.players["P1"]!.resources.coins = 3;
    const next = mustApply(state, "P1", action, rng);
    expect(next.players["P1"]!.resources).toEqual({ clay: 2, wood: 1, coins: 0 });
    expect(next.ceramics[ceramic.id]).toMatchObject({ stage: "loaded", glaze: "grey_green", decoration: "carved" });
  });

  it("a Shifu must supervise a ceramic loaded by that action, not an earlier load", () => {
    const { state, rng } = startedGame(2, 140_007);
    const earlier = addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    const current = addWorkshop(state, "P1");
    expectError(applyAction(state, "P1", { type: "USE_KILN_YARD", workerId: workerId(state, "P1", "shifu"), loads: [{ ceramicId: current.id, glaze: "white", kilnSpaceId: "middle_2" }], shifuCeramicId: earlier.id }, rng), "INVALID_SELECTION");
  });
});

describe("v1.4 end-of-Work Glaze Palette", () => {
  it("waits for the final Imperial Priority, then changes its newly loaded ceramic before Test Pieces", () => {
    const { state, rng } = startedGame(2, 140_008);
    state.firstPlayerId = "P1";
    for (const player of Object.values(state.players)) for (const worker of Object.values(player.workers)) worker.status = "placed";
    const shifu = Object.values(state.players["P1"]!.workers).find((worker) => worker.kind === "shifu")!;
    shifu.status = "available";
    const ceramic = addWorkshop(state, "P1", "plate", "painted");
    Object.assign(state.players["P1"]!, { imperialKilnUnlocked: true, imperialPriorityAvailable: true });
    addTechnique(state, "P1", "T06");
    addTechnique(state, "P1", "T13");
    let next = mustApply(state, "P1", { type: "USE_LABOUR", workerId: shifu.id }, rng);
    expect(next.phase.type).toBe("work_imperial_priority");
    const beforeCoins = next.players["P1"]!.resources.coins;
    next = mustApply(next, "P1", { type: "RESOLVE_IMPERIAL_PRIORITY", ceramicId: ceramic.id, glaze: "white" }, rng);
    expect(next.phase.type).toBe("work_glaze_palette");
    expect(next.players["P1"]!.resources.coins).toBe(beforeCoins - 1);
    expectError(applyAction(next, "P1", { type: "RESOLVE_TEST_PIECES", use: true }, rng), "WRONG_PHASE");
    next = mustApply(next, "P1", { type: "RESOLVE_GLAZE_PALETTE", ceramicId: ceramic.id, glaze: "moon_white" }, rng);
    expect(next.ceramics[ceramic.id]).toMatchObject({ glaze: "moon_white", decoration: "painted", kilnSpaceId: "imperial" });
    expect(next.players["P1"]!.resources.coins).toBe(beforeCoins - 1);
    expect(next.phase.type).toBe("firing_before_contribution");
    expectError(applyAction(next, "P1", { type: "RESOLVE_GLAZE_PALETTE", ceramicId: ceramic.id, glaze: "celadon" }, rng), "WRONG_PHASE");
  });

  it("can decline and rejects workshop, opposing, and partial selections without spending its use", () => {
    const { state, rng } = startedGame(2, 140_009);
    const workshop = addWorkshop(state, "P1");
    addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    const rival = addLoaded(state, "P2", "plate", "white", "plain", "middle_2");
    addTechnique(state, "P1", "T06");
    const waiting = finishWork(state, rng).state;
    expect(waiting.phase.type).toBe("work_glaze_palette");
    for (const ceramicId of [workshop.id, rival.id, null]) expectError(applyAction(waiting, "P1", { type: "RESOLVE_GLAZE_PALETTE", ceramicId, glaze: "celadon" }, rng), "INVALID_SELECTION");
    const next = mustApply(waiting, "P1", { type: "RESOLVE_GLAZE_PALETTE", ceramicId: null, glaze: null }, rng);
    expect(next.players["P1"]!.techniques[0]?.exhausted).toBe(false);
    expect(next.phase.type).toBe("firing_contributions");
  });
});

describe("v1.4 private choices and firing safeguards", () => {
  it("requires an exact private bottom-order permutation after Academy inspection", () => {
    const { state, rng } = startedGame(2, 140_010);
    state.players["P1"]!.resources.coins = 10;
    let next = mustApply(state, "P1", { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "shifu") }, rng);
    next = mustApply(next, "P1", { type: "GUILD_INSPECT_DISCIPLINE", discipline: "firing" }, rng);
    if (next.phase.type !== "work_guild") throw new Error("Expected inspection");
    const inspected = next.phase.inspectedTechniqueIds!;
    const action: Extract<GameAction, { type: "GUILD_BUY_TECHNIQUE" }> = { type: "GUILD_BUY_TECHNIQUE", techniqueId: next.techniqueDisplay.forming[0]! };
    expectError(applyAction(next, "P1", action, rng), "INVALID_SELECTION");
    expectError(applyAction(next, "P1", { ...action, returnTechniqueIds: [inspected[0]!, inspected[0]!] }, rng), "INVALID_SELECTION");
    const returned = [...inspected].reverse();
    const result = mustResult(next, "P1", { ...action, returnTechniqueIds: returned }, rng);
    expect(result.state.techniqueDecks.firing.slice(-2)).toEqual(returned);
    expect(JSON.stringify(result.events)).not.toContain(returned[0]!);
    expect(JSON.stringify(result.events)).not.toContain(returned[1]!);
  });

  it.each(["affordability", "ownership", "invalid card"] as const)("revalidates a sealed earlier Contribution's %s before any reveal/payment", (failure) => {
    const { state, rng } = startedGame(2, 140_011);
    state.phase = { type: "firing_contributions", windowId: "guard", eligiblePlayerIds: ["P1", "P2"], submittedPlayerIds: [] };
    addTechnique(state, "P1", "T12");
    const first = submitWoodContribution(state, createPrivateFiringState(state), "P1", "BANK_2", rng);
    if (!first.ok) throw new Error(first.error.message);
    if (failure === "affordability") first.state.players["P1"]!.resources.wood = 1;
    if (failure === "ownership") first.state.players["P1"]!.techniques = [];
    if (failure === "invalid card") first.privateState.contributions["P1"] = "FAKE" as never;
    const before = structuredClone(first);
    const result = submitWoodContribution(first.state, first.privateState, "P2", "TEND", rng);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("INVALID_CONTRIBUTION");
    expect(first).toEqual(before);
  });

  it("offers unused Jun only after the extra card and new Heat are revealed, only for that ceramic", () => {
    const { state, rng } = startedGame(2, 140_012);
    state.players["P1"]!.kilnId = "JU";
    addTechnique(state, "P1", "T14");
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    const other = addLoaded(state, "P1", "plate", "white", "plain", "low_1");
    state.fireDeck = [1, 0];
    let next = reveal(state, rng);
    next = mustApply(next, "P1", { type: "RESOLVE_JUN", ceramicId: null, delta: null }, rng);
    expect(next.firingContext?.ceramicResults[ceramic.id]?.assignedQuality).toBe("standard");
    next = mustApply(next, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    expect(next.phase).toMatchObject({ type: "firing_second_before_quality", fireModifier: 0, ceramicId: ceramic.id });
    expect(next.firingContext?.ceramicResults[ceramic.id]).toMatchObject({ finalActualHeat: 2, assignedQuality: null });
    expect(next.fireDeck).toEqual([]);
    expect(next.fireDiscard).toEqual([]);
    expectError(applyAction(next, "P1", { type: "RESOLVE_JUN", ceramicId: other.id, delta: -1 }, rng), "INVALID_SELECTION");
    next = mustApply(next, "P1", { type: "RESOLVE_JUN", ceramicId: ceramic.id, delta: -1 }, rng);
    expect(next.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "masterpiece" });
    expect(next.ceramics[other.id]).toMatchObject({ quality: "fine" });
    expect(next.players["P1"]!.resources.wood).toBe(1);
    expect(next.players["P1"]!.kilnAbilityUsedThisRound).toBe(true);
    expect(next.fireDiscard).toEqual([0, 1]);
  });

  it("does not carry a previously used Jun adjustment into Second Firing or offer it again", () => {
    const { state, rng } = startedGame(2, 140_013);
    state.players["P1"]!.kilnId = "JU";
    addTechnique(state, "P1", "T14");
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    state.fireDeck = [2, 0];
    let next = reveal(state, rng);
    next = mustApply(next, "P1", { type: "RESOLVE_JUN", ceramicId: ceramic.id, delta: -1 }, rng);
    expect(next.firingContext?.ceramicResults[ceramic.id]).toMatchObject({ finalActualHeat: 3, assignedQuality: "standard" });
    next = mustApply(next, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    expect(next.phase.type).toBe("orders");
    expect(next.ceramics[ceramic.id]).toMatchObject({ quality: "fine" });
    expect(next.lastFiringResult?.ceramicResults?.[ceramic.id]?.finalActualHeat).toBe(2);
    expect(next.players["P1"]!.resources.wood).toBe(1);
  });
});


describe("v1.4 optional abilities", () => {
  it("can decline Colour Samples on acquisition before privately looking at any card", () => {
    const { state, rng } = startedGame(2, 140_020);
    state.techniqueDisplay.glazing = ["T10", "T06"];
    const deck = [...state.marketDeck];
    const hand = [...state.players["P1"]!.orderHand];
    let next = mustApply(state, "P1", { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "apprentice") }, rng);
    next = mustApply(next, "P1", { type: "GUILD_BUY_TECHNIQUE", techniqueId: "T10" }, rng);
    expect(next.phase).toMatchObject({ type: "work_office_orders", step: "colour_samples_or_skip", onAcquisition: true });
    expect(next.marketDeck).toEqual(deck);
    expect(next.phase).not.toHaveProperty("colourSamplesChoices");
    next = mustApply(next, "P1", { type: "OFFICE_SKIP_COLOUR_SAMPLES" }, rng);
    expect(next.phase.type).toBe("work");
    expect(next.players["P1"]!.orderHand).toEqual(hand);
    expect(next.marketDeck).toEqual(deck);
    expect(next.players["P1"]!.techniques.find((technique) => technique.id === "T10")?.exhausted).toBe(false);
  });

  it("Colour Samples can reserve a public Order when there are no cards to inspect", () => {
    const { state, rng } = startedGame(2, 140_021);
    state.techniqueDisplay.glazing = ["T10", "T06"];
    state.marketDeck = [];
    state.marketDiscard = [];
    const orderId = state.marketDisplay[0]!;
    let next = mustApply(state, "P1", { type: "BEGIN_GUILD_ACTION", workerId: workerId(state, "P1", "apprentice") }, rng);
    next = mustApply(next, "P1", { type: "GUILD_BUY_TECHNIQUE", techniqueId: "T10" }, rng);
    next = mustApply(next, "P1", { type: "OFFICE_USE_COLOUR_SAMPLES" }, rng);
    expect(next.phase).toMatchObject({ colourSamplesChoices: [] });
    next = mustApply(next, "P1", { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId }, rng);
    expect(next.players["P1"]!.orderHand).toContain(orderId);
    expect(next.players["P1"]!.resources.coins).toBe(1);
    expect(next.players["P1"]!.techniques[0]?.exhausted).toBe(false);
  });

  it("declining Ru preserves its bonus for another Order later in the round", () => {
    const { state, rng } = startedGame(2, 140_022);
    state.players["P1"]!.kilnId = "RU";
    state.players["P1"]!.orderHand = ["O07", "O16"];
    const first = addFinished(state, "P1", "bowl", "masterpiece", "celadon", "plain");
    const second = addFinished(state, "P1", "plate", "masterpiece", "celadon", "plain");
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };
    let next = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O07", ceramicIds: [first.id], useKilnAbility: false }, rng);
    expect(next.players["P1"]!.score.kilnTraditionVp).toBe(0);
    expect(next.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
    next = mustApply(next, "P1", { type: "COMPLETE_ORDER", orderId: "O16", ceramicIds: [second.id], useKilnAbility: true }, rng);
    expect(next.players["P1"]!.score.kilnTraditionVp).toBe(4);
    expect(next.round).toBe(2); // No remaining Orders: Cleanup readies the next round.
  });

  it("declining Guan preserves its bonus for another Crown Order later in the round", () => {
    const { state, rng } = startedGame(2, 140_023);
    state.players["P1"]!.kilnId = "GU";
    state.players["P1"]!.orderHand = ["O17", "O24"];
    const first = addFinished(state, "P1", "washer", "fine", "white", "painted");
    const second = addFinished(state, "P1", "plate", "masterpiece", "moon_white", "plain");
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };
    let next = mustApply(state, "P1", { type: "COMPLETE_ORDER", orderId: "O17", ceramicIds: [first.id], useKilnAbility: false, imperialGrantChoice: "coins" }, rng);
    expect(next.players["P1"]!.score.kilnTraditionVp).toBe(0);
    expect(next.players["P1"]!.kilnAbilityUsedThisRound).toBe(false);
    const coins = next.players["P1"]!.resources.coins;
    next = mustApply(next, "P1", { type: "COMPLETE_ORDER", orderId: "O24", ceramicIds: [second.id], useKilnAbility: true }, rng);
    expect(next.players["P1"]!.resources.coins).toBe(coins + 3);
    expect(next.players["P1"]!.score.kilnTraditionVp).toBe(1);
    expect(next.round).toBe(2);
  });

  it("cannot use a Shifu Decoration action to rework two Shapes or bypass owning Reworking Table", () => {
    const { state, rng } = startedGame(2, 140_024);
    const first = addWorkshop(state, "P1");
    const second = addWorkshop(state, "P1");
    const action: Extract<GameAction, { type: "DECORATE_CERAMICS" }> = { type: "DECORATE_CERAMICS", workerId: workerId(state, "P1", "shifu"), selections: [{ ceramicId: first.id, decoration: "carved", newShape: "vase" }, { ceramicId: second.id, decoration: "impressed", newShape: "censer" }] };
    expectError(applyAction(state, "P1", action, rng), "INVALID_SELECTION");
    addTechnique(state, "P1", "T05");
    expectError(applyAction(state, "P1", { ...action, useTechniqueIds: ["T05"] }, rng), "INVALID_SELECTION");
  });
});


describe("Second Firing reopens the after-Quality timing window", () => {
  it.each(["RU", "JU"] as const)("offers previously declined but unused Saggars after the new Quality for %s", (kilnId) => {
    const { state, rng } = startedGame(2, 140_030);
    state.players["P1"]!.kilnId = kilnId;
    addTechnique(state, "P1", "T11");
    addTechnique(state, "P1", "T14");
    const ceramic = addLoaded(state, "P1", "bowl", "white", "plain", "middle_1");
    state.fireDeck = [1, 1];
    let next = reveal(state, rng);
    if (kilnId === "JU") next = mustApply(next, "P1", { type: "RESOLVE_JUN", ceramicId: null, delta: null }, rng);
    next = mustApply(next, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: null }, rng);
    expect(next.phase).toMatchObject({ techniqueIds: ["T14"] });
    next = mustApply(next, "P1", { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, rng);
    if (kilnId === "JU") next = mustApply(next, "P1", { type: "RESOLVE_JUN", ceramicId: null, delta: null }, rng);
    expect(next.phase).toMatchObject({ type: "firing_after_quality", techniqueIds: ["T11"] });
    next = mustApply(next, "P1", { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id }, rng);
    expect(next.ceramics[ceramic.id]).toMatchObject({ stage: "finished", quality: "fine" });
    expect(next.players["P1"]!.resources.wood).toBe(1);
    expect(next.players["P1"]!.techniques.every((technique) => technique.exhausted)).toBe(true);
  });
});
