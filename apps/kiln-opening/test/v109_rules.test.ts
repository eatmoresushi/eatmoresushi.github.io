import { describe, expect, it } from "vitest";
import {
  FIRE_CARDS,
  GAME_CONFIG,
  IMPERIAL_ORDERS,
  KILN_IDS,
  MARKET_ORDERS,
  ORDER_DEFINITIONS,
  SeededRandom,
  TECHNIQUES,
  activeKilnSpaceIds,
  applyAction,
  calculateFinalResult,
  createGame,
  createPrivateFiringState,
  currentDecisionActor,
  determineBaseHeat,
  matchesOrder,
  submitWoodContribution,
  turnOrderFromFirst,
} from "../src/game";
import { getLegalAIActions } from "../src/ai/legalActions";
import type { GameState, KilnId, PlayerCount } from "../src/game";
import { projectPublicGameState } from "../src/multiplayer";
import {
  addFinished,
  addGlazed,
  addLoaded,
  addTechnique,
  mustApply,
  playerInputs,
  startedGame,
  workerId,
} from "./helpers";

function enterFiring(state: GameState, rng: SeededRandom): GameState {
  let next = state;
  while (next.phase.type === "work") {
    next = mustApply(next, next.phase.activePlayerId, { type: "PASS_WORK_PHASE" }, rng);
  }
  return next;
}

describe("V1.0.9 authoritative content", () => {
  it("loads the exact component counts, kiln layout, Fire distribution, and Technique costs", () => {
    expect(GAME_CONFIG.rulesVersion).toBe("1.0.9");
    expect(MARKET_ORDERS).toHaveLength(28);
    expect(IMPERIAL_ORDERS).toHaveLength(20);
    expect(TECHNIQUES).toHaveLength(15);
    expect(FIRE_CARDS).toEqual([-2, -1, -1, -1, 0, 0, 0, 0, 1, 1, 1, 2]);
    expect(TECHNIQUES.reduce<Record<number, number>>((counts, technique) => {
      counts[technique.cost] = (counts[technique.cost] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ 1: 2, 2: 5, 3: 8 });
    expect(activeKilnSpaceIds(2)).toEqual(["high_1", "middle_1", "middle_2", "middle_3", "low_1"]);
    expect(activeKilnSpaceIds(3)).toEqual(["high_1", "middle_1", "middle_2", "middle_3", "middle_4", "low_1"]);
    expect(activeKilnSpaceIds(4)).toEqual(["high_1", "middle_1", "middle_2", "middle_3", "middle_4", "middle_5", "low_1"]);
  });

  it("uses each Imperial card's printed +1/+2/+3 Progress", () => {
    const expected = {
      I01: 2, I02: 1, I03: 2, I04: 1, I05: 1, I06: 2, I07: 2,
      I08: 3, I09: 2, I10: 3, I11: 2, I12: 2, I13: 3, I14: 1,
      I15: 1, I16: 1, I17: 2, I18: 1, I19: 2, I20: 1,
    } as const;
    expect(Object.fromEntries(IMPERIAL_ORDERS.map((order) => [order.id, order.imperialProgressReward]))).toEqual(expected);
  });

  it.each([
    [1, 0, 1], [1, 1, 2], [1, 2, 2], [1, 3, 3], [1, 4, 3],
    [2, 1, 1], [2, 2, 2], [2, 4, 2], [2, 5, 3],
    [3, 2, 1], [3, 3, 2], [3, 5, 2], [3, 6, 3],
    [4, 3, 1], [4, 4, 2], [4, 6, 2], [4, 7, 3],
  ] as const)("maps N=%i and total Wood=%i to Base Heat %i", (contributors, wood, expected) => {
    expect(determineBaseHeat(contributors, wood)).toBe(expected);
  });
});

describe("V1.0.9 setup and hidden information", () => {
  it.each([2, 3, 4] as const)("deals private 2 Market + 2 Imperial choices at %i players and reveals kept pairs together", (playerCount) => {
    const rng = new SeededRandom(91_000 + playerCount);
    const created = createGame({ gameId: `v109-setup-${playerCount}`, players: playerInputs(playerCount) }, rng);
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error.message);
    let state = created.state;
    let kilnIndex = 0;
    while (state.phase.type === "setup_kiln_selection") {
      state = mustApply(
        state,
        currentDecisionActor(state.phase)!,
        { type: "SELECT_KILN", kilnId: KILN_IDS[kilnIndex++] as KilnId },
        rng,
      );
    }
    expect(state.phase.type).toBe("setup_starting_orders");
    if (state.phase.type !== "setup_starting_orders") throw new Error("Opening choices did not start");
    for (const offer of Object.values(state.phase.offeredOrderIds)) {
      expect(offer).toHaveLength(4);
      expect(offer.filter((id) => id.startsWith("M"))).toHaveLength(2);
      expect(offer.filter((id) => id.startsWith("I"))).toHaveLength(2);
    }
    const firstActor = currentDecisionActor(state.phase)!;
    const firstKept = state.phase.offeredOrderIds[firstActor]!.slice(0, 2);
    state = mustApply(state, firstActor, { type: "SUBMIT_STARTING_ORDERS", orderIds: firstKept }, rng);
    expect(state.phase.type).toBe("setup_starting_orders");
    const interimPublic = projectPublicGameState(state);
    expect(Object.values(interimPublic.players).every((player) => player.orderHand.length === 0)).toBe(true);
    while (state.phase.type === "setup_starting_orders") {
      const actorId = currentDecisionActor(state.phase)!;
      state = mustApply(
        state,
        actorId,
        { type: "SUBMIT_STARTING_ORDERS", orderIds: state.phase.offeredOrderIds[actorId]!.slice(0, 2) },
        rng,
      );
    }
    expect(state.phase.type).toBe("work");
    expect(Object.values(projectPublicGameState(state).players).every((player) => player.orderHand.length === 2)).toBe(true);
  });

  it("keeps Wood and Fuel Ledger sealed until the atomic reveal", () => {
    const { state: initial, rng } = startedGame(2, 91_100);
    const [firstId, secondId] = turnOrderFromFirst(initial);
    addTechnique(initial, firstId!, "T11");
    initial.players[firstId!]!.resources.wood = 4;
    addLoaded(initial, firstId!, "bowl", "white", "plain", "middle_1");
    addLoaded(initial, secondId!, "bowl", "celadon", "plain", "middle_2");
    let state = enterFiring(initial, rng);
    let privateState = createPrivateFiringState(state);
    const startingResources = { ...state.players[firstId!]!.resources };
    const first = submitWoodContribution(state, privateState, firstId!, 3, true, rng);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.message);
    state = first.state;
    privateState = first.privateState;
    expect(state.players[firstId!]!.resources).toEqual(startingResources);
    expect(projectPublicGameState(state).firingContext).toBeNull();
    expect(JSON.stringify(projectPublicGameState(state))).not.toContain("useFuelLedger");
    const second = submitWoodContribution(state, privateState, secondId!, 0, false, rng);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error.message);
    expect(second.state.lastFiringResult?.contributions?.[firstId!]).toBe(4);
    expect(second.state.players[firstId!]!.resources.wood).toBe(startingResources.wood - 4);
    expect(second.state.players[firstId!]!.resources.coins).toBe(startingResources.coins - 1);
  });
});

describe("V1.0.9 engine transitions", () => {
  it("reshuffles the Fire discard when a reveal is required", () => {
    const { state: initial, rng } = startedGame(2, 91_200);
    const actorId = initial.firstPlayerId;
    addLoaded(initial, actorId, "bowl", "celadon", "plain", "middle_1");
    initial.fireDeck = [];
    initial.fireDiscard = [2];
    const firing = enterFiring(initial, rng);
    const result = submitWoodContribution(firing, createPrivateFiringState(firing), actorId, 1, false, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.lastFiringResult?.fireModifier).toBe(2);
    expect(result.state.fireDeck).toHaveLength(0);
    expect(result.state.fireDiscard).toEqual([2]);
  });

  it("applies an I08 card's printed +3 Progress and all crossed milestones", () => {
    const { state, rng } = startedGame(2, 91_201);
    const actorId = state.firstPlayerId;
    const order = turnOrderFromFirst(state);
    state.phase = { type: "orders", turnOrder: order, currentIndex: 0, activePlayerId: actorId };
    state.players[actorId]!.orderHand = ["I08"];
    const ceramics = [
      addFinished(state, actorId, "bowl", "fine"),
      addFinished(state, actorId, "plate", "fine"),
      addFinished(state, actorId, "washer", "fine"),
    ];
    const result = applyAction(state, actorId, {
      type: "COMPLETE_ORDER",
      orderId: "I08",
      ceramicIds: ceramics.map(({ id }) => id),
      useGuanWaiver: false,
    }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.state.players[actorId]!.imperialProgress).toBe(3);
    expect(result.state.players[actorId]!.pendingApprenticeUnlocks).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: "IMPERIAL_PROGRESS_ADVANCED",
      reward: 3,
      crossedSpaces: [1, 2, 3],
      apprenticeMilestonesTriggered: [1, 3],
      stipendMilestonesTriggered: [2],
    }));
  });

  it("grants Kiln Yard Wood per ceramic actually loaded", () => {
    const { state, rng } = startedGame(2, 91_202);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.firstPlayerId;
    const ceramic = addGlazed(state, actorId, "bowl", "celadon", "plain");
    const beforeWood = state.players[actorId]!.resources.wood;
    const next = mustApply(state, actorId, {
      type: "USE_KILN_YARD",
      workerId: workerId(state, actorId, "apprentice"),
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "middle_1" }],
    }, rng);
    expect(next.players[actorId]!.resources.wood).toBe(beforeWood + 1);
  });

  it("allows unlimited Clay Substitution within one Forming action", () => {
    const { state, rng } = startedGame(2, 91_203);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.firstPlayerId;
    addTechnique(state, actorId, "T03");
    state.players[actorId]!.resources.clay = 0;
    state.players[actorId]!.resources.coins = 3;
    const next = mustApply(state, actorId, {
      type: "FORM_CERAMICS",
      workerId: workerId(state, actorId, "shifu"),
      shapes: ["bowl", "plate"],
      useTechniqueIds: ["T03"],
      claySubstitutions: 2,
    }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(1);
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T03")?.exhausted).toBe(false);
  });

  it("charges a Forming Shifu 1 Clay for each Vase or Censer without changing their base costs", () => {
    const first = startedGame(2, 91_206);
    const firstActor = first.state.phase.type === "work" ? first.state.phase.activePlayerId : first.state.firstPlayerId;
    first.state.players[firstActor]!.resources.clay = 2;
    const formed = mustApply(first.state, firstActor, {
      type: "FORM_CERAMICS",
      workerId: workerId(first.state, firstActor, "shifu"),
      shapes: ["vase", "censer"],
    }, first.rng);
    expect(formed.players[firstActor]!.resources.clay).toBe(0);
    expect(Object.values(formed.ceramics).filter(({ ownerId }) => ownerId === firstActor).map(({ shape }) => shape)).toEqual([
      "vase",
      "censer",
    ]);

    const second = startedGame(2, 91_207);
    const secondActor = second.state.phase.type === "work" ? second.state.phase.activePlayerId : second.state.firstPlayerId;
    addTechnique(second.state, secondActor, "T03");
    second.state.players[secondActor]!.resources.clay = 0;
    second.state.players[secondActor]!.resources.coins = 1;
    const substituted = mustApply(second.state, secondActor, {
      type: "FORM_CERAMICS",
      workerId: workerId(second.state, secondActor, "shifu"),
      shapes: ["vase"],
      useTechniqueIds: ["T03"],
      claySubstitutions: 1,
    }, second.rng);
    expect(substituted.players[secondActor]!.resources).toEqual({ clay: 0, wood: 2, coins: 0 });
  });

  it("lets Ge mutate only a current difference-1 Actual Heat result before normal Quality assignment", () => {
    const { state: initial, rng } = startedGame(2, 91_208);
    const actorId = initial.firstPlayerId;
    initial.players[actorId]!.kilnId = "GE";
    const exact = addLoaded(initial, actorId, "bowl", "celadon", "plain", "low_1");
    const eligible = addLoaded(initial, actorId, "plate", "celadon", "plain", "middle_1");
    const tooFar = addLoaded(initial, actorId, "washer", "celadon", "plain", "high_1");
    initial.fireDeck[0] = 1;
    const firing = enterFiring(initial, rng);
    const submitted = submitWoodContribution(
      firing,
      createPrivateFiringState(firing),
      actorId,
      1,
      false,
      rng,
    );
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) throw new Error(submitted.error.message);
    const state = submitted.state;
    expect(state.firingContext?.ceramicResults[exact.id]?.finalHeatDifference).toBe(0);
    expect(state.firingContext?.ceramicResults[eligible.id]?.finalHeatDifference).toBe(1);
    expect(state.firingContext?.ceramicResults[tooFar.id]?.finalHeatDifference).toBe(2);

    for (const ceramicId of [exact.id, tooFar.id]) {
      const invalid = applyAction(state, actorId, { type: "RESOLVE_GE", ceramicId }, rng);
      expect(invalid.ok).toBe(false);
      if (!invalid.ok) expect(invalid.error.code).toBe("INVALID_SELECTION");
    }
    const legalActions = getLegalAIActions(
      state,
      actorId,
      createPrivateFiringState(state),
      { exhaustive: true },
    );
    expect(legalActions).toEqual(expect.arrayContaining([
        { type: "RESOLVE_GE", ceramicId: null },
        { type: "RESOLVE_GE", ceramicId: eligible.id },
      ]));
    expect(legalActions).not.toContainEqual({ type: "RESOLVE_GE", ceramicId: exact.id });
    expect(legalActions).not.toContainEqual({ type: "RESOLVE_GE", ceramicId: tooFar.id });

    const resolved = applyAction(state, actorId, { type: "RESOLVE_GE", ceramicId: eligible.id }, rng);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error(resolved.error.message);
    expect(resolved.state.ceramics[eligible.id]).toEqual(expect.objectContaining({
      stage: "finished",
      decoration: "crackle",
      quality: "masterpiece",
    }));
    expect(resolved.events).toContainEqual(expect.objectContaining({
      type: "FIRING_RESOLVED",
      ceramicId: eligible.id,
      finalActualHeat: 2,
      finalHeatDifference: 0,
      finalQuality: "masterpiece",
    }));
  });

  it("resolves Jun and Ge in turn order through the same mutable Actual Heat window", () => {
    const { state: initial, rng } = startedGame(2, 91_210);
    const [junId, geId] = turnOrderFromFirst(initial);
    initial.players[junId!]!.kilnId = "JU";
    initial.players[geId!]!.kilnId = "GE";
    const junCeramic = addLoaded(initial, junId!, "bowl", "celadon", "plain", "middle_1");
    const geCeramic = addLoaded(initial, geId!, "plate", "celadon", "plain", "middle_2");
    initial.fireDeck[0] = 1;
    let state = enterFiring(initial, rng);
    let privateState = createPrivateFiringState(state);
    for (const actorId of [junId!, geId!]) {
      const submitted = submitWoodContribution(state, privateState, actorId, 1, false, rng);
      expect(submitted.ok).toBe(true);
      if (!submitted.ok) throw new Error(submitted.error.message);
      state = submitted.state;
      privateState = submitted.privateState;
    }
    expect(state.phase).toEqual({
      type: "firing_before_quality",
      queue: { actors: [junId, geId], currentIndex: 0 },
    });
    expect(state.firingContext?.ceramicResults[junCeramic.id]?.finalHeatDifference).toBe(1);
    expect(state.firingContext?.ceramicResults[geCeramic.id]?.finalHeatDifference).toBe(1);

    state = mustApply(state, junId!, {
      type: "RESOLVE_JUN",
      ceramicId: junCeramic.id,
      delta: -1,
    }, rng);
    expect(currentDecisionActor(state.phase)).toBe(geId);
    expect(state.firingContext?.ceramicResults[junCeramic.id]).toEqual(expect.objectContaining({
      finalActualHeat: 2,
      finalHeatDifference: 0,
    }));
    expect(state.firingContext?.ceramicResults[geCeramic.id]?.finalHeatDifference).toBe(1);

    state = mustApply(state, geId!, { type: "RESOLVE_GE", ceramicId: geCeramic.id }, rng);
    expect(state.ceramics[junCeramic.id]).toEqual(expect.objectContaining({ quality: "masterpiece" }));
    expect(state.ceramics[geCeramic.id]).toEqual(expect.objectContaining({
      quality: "masterpiece",
      decoration: "crackle",
    }));
  });

  it("requires different Shapes for Market Order M20", () => {
    const { state } = startedGame(2, 91_209);
    const actorId = state.firstPlayerId;
    const whiteBowl = addFinished(state, actorId, "bowl", "fine", "white");
    const celadonBowl = addFinished(state, actorId, "bowl", "fine", "celadon");
    const celadonPlate = addFinished(state, actorId, "plate", "fine", "celadon");
    expect(matchesOrder(ORDER_DEFINITIONS["M20"]!, [whiteBowl, celadonBowl], false)).toBe(false);
    expect(matchesOrder(ORDER_DEFINITIONS["M20"]!, [whiteBowl, celadonPlate], false)).toBe(true);
  });

  it("offers Connoisseur Network for an affordable Standard ceramic", () => {
    const { state, rng } = startedGame(2, 91_205);
    const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.firstPlayerId;
    addTechnique(state, actorId, "T14");
    addFinished(state, actorId, "bowl", "standard");
    let next = mustApply(state, actorId, {
      type: "OFFICE_GAIN_COINS",
      workerId: workerId(state, actorId, "apprentice"),
    }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_RESOLVE_FLAWED_SALE", ceramicIds: [] }, rng);
    expect(next.phase).toEqual(expect.objectContaining({ type: "work_office_connoisseur", actorId }));
  });

  it("scores 1 VP per owned Technique", () => {
    const { state } = startedGame(2, 91_204);
    const actorId = state.firstPlayerId;
    const before = calculateFinalResult(state).scores[actorId]!;
    addTechnique(state, actorId, "T01");
    addTechnique(state, actorId, "T02");
    const after = calculateFinalResult(state).scores[actorId]!;
    expect(after.techniques).toBe(2);
    expect(after.total - before.total).toBe(2);
  });

  it.each([2, 3, 4] as const)("creates live states only as V1.0.9 at %i players", (playerCount: PlayerCount) => {
    expect(startedGame(playerCount, 91_300 + playerCount).state.rulesVersion).toBe("1.0.9");
    expect(ORDER_DEFINITIONS["I10"]?.imperialProgressReward).toBe(3);
  });
});
