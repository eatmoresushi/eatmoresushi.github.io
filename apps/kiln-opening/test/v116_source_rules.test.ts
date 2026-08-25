import { describe, expect, it } from "vitest";
import { applyAction, calculateFinalResult } from "../src/game";
import { projectPublicEvent } from "../src/multiplayer";
import {
  addFinished,
  addGlazed,
  addLoaded,
  addShaped,
  addTechnique,
  expectError,
  mustApply,
  setActive,
  startedGame,
  workerId,
} from "./helpers";

describe("V1.1.6 supplied-source Technique rules", () => {
  it("T01 ignores the full Clay cost of one Vase", () => {
    const { state, rng } = startedGame(2, 11601);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T01");
    const before = state.players[actorId]!.resources.clay;
    const next = mustApply(state, actorId, {
      type: "FORM_CERAMICS",
      workerId: workerId(state, actorId, "apprentice"),
      shapes: ["vase"],
      useTechniqueIds: ["T01"],
    }, rng);
    expect(next.players[actorId]!.resources.clay).toBe(before);
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T01")?.exhausted).toBe(true);
  });

  it("T02 triggers when the second different Shape is formed across separate actions", () => {
    const { state, rng } = startedGame(2, 11602);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T02");
    let next = mustApply(state, actorId, {
      type: "FORM_CERAMICS",
      workerId: workerId(state, actorId, "apprentice"),
      shapes: ["bowl"],
    }, rng);
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T02")?.exhausted).toBe(false);
    setActive(next, actorId);
    next.players[actorId]!.resources.clay = 2;
    const coinsBefore = next.players[actorId]!.resources.coins;
    next = mustApply(next, actorId, {
      type: "FORM_CERAMICS",
      workerId: workerId(next, actorId, "apprentice"),
      shapes: ["plate"],
    }, rng);
    expect(next.players[actorId]!.resources.clay).toBe(2);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore + 1);
    expect(next.players[actorId]!.shapesFormedThisRound).toEqual(["bowl", "plate"]);
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T02")?.exhausted).toBe(true);
  });

  it("T03 is a free on-turn 3-Coin action that gains exactly three resources", () => {
    const { state, rng } = startedGame(2, 11603);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T03");
    const next = mustApply(state, actorId, { type: "USE_CLAY_SUBSTITUTION", clay: 1, wood: 2 }, rng);
    expect(next.players[actorId]!.resources).toEqual({ clay: 3, wood: 4, coins: 0 });
    expect(next.phase).toEqual({ type: "work", activePlayerId: actorId });
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T03")?.exhausted).toBe(true);
    expectError(applyAction(next, actorId, { type: "USE_CLAY_SUBSTITUTION", clay: 3, wood: 0 }, rng), "TECHNIQUE_EXHAUSTED");
  });

  it("T04 delays loading until the following round and permits Decoration-only rework", () => {
    const { state, rng } = startedGame(2, 11604);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T04");
    const formed = mustApply(state, actorId, {
      type: "FORM_CERAMICS",
      workerId: workerId(state, actorId, "apprentice"),
      shapes: ["bowl"],
      useTechniqueIds: ["T04"],
      dryingFrames: { formedIndex: 0, glaze: "celadon" },
    }, rng);
    const ceramic = Object.values(formed.ceramics).find(({ ownerId }) => ownerId === actorId)!;
    expect(ceramic).toEqual(expect.objectContaining({
      stage: "glazed",
      glaze: "celadon",
      decoration: "plain",
      loadableFromRound: 2,
      dryingFramesApplied: true,
    }));

    setActive(formed, actorId);
    expectError(applyAction(formed, actorId, {
      type: "USE_KILN_YARD",
      workerId: workerId(formed, actorId, "apprentice"),
      loads: [{ ceramicId: ceramic.id, kilnSpaceId: "middle_1" }],
    }, rng), "ILLEGAL_CERAMIC_STAGE");

    setActive(formed, actorId);
    const redecorated = mustApply(formed, actorId, {
      type: "GLAZE_CERAMICS",
      workerId: workerId(formed, actorId, "apprentice"),
      selections: [{ ceramicId: ceramic.id, glaze: "celadon", decoration: "carved" }],
    }, rng);
    expect(redecorated.ceramics[ceramic.id]).toEqual(expect.objectContaining({ glaze: "celadon", decoration: "carved" }));
  });

  it("T05 and T06 waive every matching Decoration cost even after their rework use is exhausted", () => {
    const { state, rng } = startedGame(2, 11605);
    const actorId = state.firstPlayerId;
    const carved = addShaped(state, actorId, "bowl");
    const impressed = addShaped(state, actorId, "plate");
    addTechnique(state, actorId, "T05", true);
    addTechnique(state, actorId, "T06", true);
    const coinsBefore = state.players[actorId]!.resources.coins;
    const next = mustApply(state, actorId, {
      type: "GLAZE_CERAMICS",
      workerId: workerId(state, actorId, "shifu"),
      selections: [
        { ceramicId: carved.id, glaze: "white", decoration: "carved" },
        { ceramicId: impressed.id, glaze: "celadon", decoration: "impressed" },
      ],
    }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore);
  });

  it("T05 once-per-round use can re-decorate an unloaded Glazed ceramic for free", () => {
    const { state, rng } = startedGame(2, 11606);
    const actorId = state.firstPlayerId;
    const ceramic = addGlazed(state, actorId, "washer", "grey_green", "plain");
    addTechnique(state, actorId, "T05");
    const next = mustApply(state, actorId, {
      type: "GLAZE_CERAMICS",
      workerId: workerId(state, actorId, "apprentice"),
      selections: [{ ceramicId: ceramic.id, glaze: "grey_green", decoration: "carved" }],
      useTechniqueIds: ["T05"],
    }, rng);
    expect(next.ceramics[ceramic.id]).toEqual(expect.objectContaining({ glaze: "grey_green", decoration: "carved" }));
    expect(next.players[actorId]!.resources.coins).toBe(3);
    expect(next.players[actorId]!.techniques.find(({ id }) => id === "T05")?.exhausted).toBe(true);
  });

  it("T08 may take a face-up Order and bottoms both looked-at cards", () => {
    const { state, rng } = startedGame(2, 11608);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T08");
    const lookedAt = state.marketDeck.slice(0, 2);
    const faceUp = state.imperialDisplay[0]!;
    let next = mustApply(state, actorId, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, actorId, "shifu"),
      mode: "take_up_to_two",
    }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_USE_COLOUR_SAMPLES", deck: "market" }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_CHOOSE_COLOUR_SAMPLES_ORDER", orderId: faceUp }, rng);
    expect(next.players[actorId]!.orderHand).toContain(faceUp);
    expect(next.marketDeck.slice(-2)).toEqual(lookedAt);
    expect(next.phase).toEqual(expect.objectContaining({
      type: "work_office_orders",
      ordersTaken: 1,
      remainingTakes: 1,
      step: "take_or_end",
    }));
  });

  it("T08 remains available for a Shifu's second Order when skipped before the first", () => {
    const { state, rng } = startedGame(2, 11609);
    const actorId = state.firstPlayerId;
    addTechnique(state, actorId, "T08");
    let next = mustApply(state, actorId, {
      type: "BEGIN_OFFICE_ORDERS",
      workerId: workerId(state, actorId, "shifu"),
      mode: "take_up_to_two",
    }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_SKIP_COLOUR_SAMPLES" }, rng);
    next = mustApply(next, actorId, { type: "OFFICE_TAKE_ORDER", orderId: next.marketDisplay[0]! }, rng);
    expect(next.phase).toEqual(expect.objectContaining({
      type: "work_office_orders",
      ordersTaken: 1,
      remainingTakes: 1,
      step: "colour_samples_or_skip",
    }));
  });

  it("keeps unchosen T08 looked-at Order IDs out of public events", () => {
    const event = projectPublicEvent({
      type: "COLOUR_SAMPLES_USED",
      playerId: "P1",
      deck: "market",
      bottomedOrderId: "M01",
      bottomedOrderIds: ["M01", "M02"],
      selectedOrderId: "I01",
    });
    expect(event).toEqual({
      type: "COLOUR_SAMPLES_USED",
      playerId: "P1",
      deck: "market",
      bottomedCount: 2,
      selectedOrderId: "I01",
    });
    expect("bottomedOrderId" in event).toBe(false);
  });

  it("T10 spends Wood, not Coins", () => {
    const { state, rng } = startedGame(2, 11610);
    const actorId = state.firstPlayerId;
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    addTechnique(state, actorId, "T10");
    state.players[actorId]!.resources.coins = 0;
    state.players[actorId]!.resources.wood = 1;
    state.phase = { type: "firing_after_quality", queue: { actors: [actorId], currentIndex: 0 }, techniqueIds: ["T10"] };
    state.firingContext = {
      round: state.round,
      contributors: [actorId],
      contributions: { [actorId]: "TEND" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: 0,
      globalHeat: 2,
      saggerAdjustedCeramicIds: [],
      ceramicResults: {
        [ceramic.id]: {
          ceramicId: ceramic.id,
          zoneModifier: 0,
          ignoredFireModifier: false,
          naturalActualHeat: 2,
          naturalHeatDifference: 1,
          naturalExactMatch: false,
          finalActualHeat: 2,
          finalHeatDifference: 1,
          forcedQuality: null,
          assignedQuality: "flawed",
        },
      },
    };
    const next = mustApply(state, actorId, { type: "RESOLVE_PROTECTIVE_SAGGARS", ceramicId: ceramic.id }, rng);
    expect(next.players[actorId]!.resources).toEqual(expect.objectContaining({ wood: 0, coins: 0 }));
  });

  it("resolves the Kiln Yard Shifu reposition after Base Heat and before Fire", () => {
    const { state, rng } = startedGame(2, 11611);
    const actorId = state.firstPlayerId;
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    state.phase = { type: "firing_reposition", queue: { actors: [actorId], currentIndex: 0 } };
    state.firingContext = {
      round: state.round,
      contributors: [actorId],
      contributions: { [actorId]: "TEND" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      saggerAdjustedCeramicIds: [],
      ceramicResults: {},
    };
    const result = applyAction(state, actorId, {
      type: "RESOLVE_KILN_YARD_REPOSITION",
      ceramicId: ceramic.id,
      toSpaceId: "low_1",
    }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.events.find((event) => event.type === "FIRING_RESOLVED" && event.ceramicId === ceramic.id))
      .toEqual(expect.objectContaining({ zoneModifier: -1 }));
    expect(result.state.lastFiringResult).toEqual(expect.objectContaining({ baseHeat: 2 }));
    expect(result.state.lastFiringResult?.fireModifier).not.toBeNull();
  });
});

describe("V1.1.6 supplied-source Exhibition and Round-5 rules", () => {
  it("allows five exhibits at Progress 0 and scores diversity only from the featured three", () => {
    const { state, rng } = startedGame(2, 11620);
    const actorId = state.firstPlayerId;
    state.players[actorId]!.imperialProgress = 0;
    state.phase = { type: "presentation", eligiblePlayerIds: [actorId], submittedPlayerIds: [] };
    const ceramics = [
      addFinished(state, actorId, "bowl", "standard", "white"),
      addFinished(state, actorId, "plate", "fine", "celadon"),
      addFinished(state, actorId, "vase", "masterpiece", "grey_green"),
      addFinished(state, actorId, "censer", "standard", "white"),
      addFinished(state, actorId, "washer", "standard", "white"),
    ];
    const ceramicIds = ceramics.map(({ id }) => id);
    const featuredCeramicIds = ceramicIds.slice(0, 3);
    const next = mustApply(state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds, featuredCeramicIds }, rng);
    expect(next.phase.type).toBe("finished");
    expect(next.players[actorId]!.presentationCeramicIds).toHaveLength(5);
    expect(next.players[actorId]!.presentationFeaturedCeramicIds).toEqual(featuredCeramicIds);
    expect(next.finalResult?.scores[actorId]?.presentation).toBe(18);
  });

  it("requires exactly three featured ceramics whenever at least three are exhibited", () => {
    const { state, rng } = startedGame(2, 11621);
    const actorId = state.firstPlayerId;
    state.phase = { type: "presentation", eligiblePlayerIds: [actorId], submittedPlayerIds: [] };
    const ceramicIds = ["bowl", "plate", "vase"].map((shape) =>
      addFinished(state, actorId, shape as "bowl" | "plate" | "vase", "standard").id
    );
    expectError(applyAction(state, actorId, { type: "SUBMIT_PRESENTATION", ceramicIds, featuredCeramicIds: [] }, rng), "INVALID_SELECTION");
  });

  it("awards only 1 VP for a Round-5 Apprentice unlock, with no Coins", () => {
    const { state, rng } = startedGame(2, 11622);
    const turnOrder = [...state.playerOrder];
    const actorId = turnOrder[0]!;
    state.round = 5;
    state.players[actorId]!.pendingApprenticeUnlocks = 1;
    const coinsBefore = state.players[actorId]!.resources.coins;
    const immediateBefore = state.players[actorId]!.score.kilnTraditionVp;
    state.phase = { type: "orders", turnOrder, currentIndex: 0, activePlayerId: actorId };
    let next = state;
    for (const playerId of turnOrder) next = mustApply(next, playerId, { type: "END_ORDER_TURN" }, rng);
    expect(next.players[actorId]!.resources.coins).toBe(coinsBefore);
    expect(next.players[actorId]!.score.kilnTraditionVp).toBe(immediateBefore + 1);
    expect(calculateFinalResult(next).scores[actorId]!.immediateAbilities).toBe(immediateBefore + 1);
  });
});
