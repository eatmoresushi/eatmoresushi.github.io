import { describe, expect, it } from "vitest";
import { SeededRandom, createPrivateFiringState } from "../src/game/index.ts";
import type { GameState, PlayerId } from "../src/game/index.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import {
  buildPlayerPlan,
  evaluateOrderFeasibility,
  knownBlindOrderPool,
  marginalResourceValue,
  terminalPipelinePenalty,
} from "../src/ai/planning.ts";
import { HeuristicAIPolicy } from "../src/ai/policy.ts";
import { assignedStrategyIntentsForGame, assignedTraditionsForGame, runSelfPlayGame } from "../src/ai/selfplay.ts";
import { createInitialStrategyProfile, learnFromCompletedGame } from "../src/ai/strategy.ts";
import type { StrategyLearningResult } from "../src/ai/strategy.ts";
import type { AIDecisionContext } from "../src/ai/types.ts";
import { addFinished, addGlazed, addLoaded, addShaped, startedGame, workerId } from "./helpers.ts";

function fixture(playerCount: 2 | 3 | 4 = 2, seed = 9201): { state: GameState; actorId: PlayerId } {
  const { state } = startedGame(playerCount, seed);
  const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
  return { state, actorId };
}

function context(state: GameState, actorId: PlayerId, overrides: Partial<AIDecisionContext> = {}): AIDecisionContext {
  return {
    gameSequence: 50,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: state.players[actorId]!.kilnId!,
    assignedIntent: "Hybrid",
    explorationRate: 0,
    mode: "regression",
    ...overrides,
  };
}

describe("Selfplay-002 planning policy", () => {
  it("is deterministic for a fixed seed, intent, observation and profile", async () => {
    const { state, actorId } = fixture(2, 9201);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const profile = createInitialStrategyProfile(2);
    const decisionContext = context(state, actorId, { explorationRate: 0.2, assignedIntent: "Volume-multi" });
    const left = await new HeuristicAIPolicy(profile, new SeededRandom(99)).chooseAction(observation, legal, decisionContext);
    const right = await new HeuristicAIPolicy(profile, new SeededRandom(99)).chooseAction(observation, legal, decisionContext);
    expect(left.action).toEqual(right.action);
    expect(left.plan).toEqual(right.plan);
  });

  it("keeps plans invariant when only hidden deck order changes", () => {
    const { state, actorId } = fixture(2, 9202);
    const changed = structuredClone(state);
    changed.marketDeck.reverse();
    changed.imperialDeck.reverse();
    changed.fireDeck.reverse();
    const privateState = createPrivateFiringState(state);
    const left = createPlayerObservation(state, actorId, privateState);
    const right = createPlayerObservation(changed, actorId, privateState);
    expect(left).toEqual(right);
    expect(buildPlayerPlan(left, createInitialStrategyProfile(2), "Hybrid"))
      .toEqual(buildPlayerPlan(right, createInitialStrategyProfile(2), "Hybrid"));
  });

  it("never assigns the same ceramic to two requirements", () => {
    const { state, actorId } = fixture(2, 9203);
    const ceramic = addFinished(state, actorId, "bowl", "standard", "white", "plain");
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = evaluateOrderFeasibility(observation, "M15");
    expect(plan.assignments).toHaveLength(2);
    expect(plan.assignments.filter(({ ceramicId }) => ceramicId === ceramic.id)).toHaveLength(1);
  });

  it("respects Order relationships in its assignment", () => {
    const { state, actorId } = fixture(2, 9204);
    const bowl = addFinished(state, actorId, "bowl", "standard", "celadon", "plain");
    const plate = addFinished(state, actorId, "plate", "standard", "celadon", "plain");
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = evaluateOrderFeasibility(observation, "M16");
    expect(plan.relationConflicts).toBe(0);
    expect(new Set(plan.assignments.map(({ ceramicId }) => ceramicId))).toEqual(new Set([bowl.id, plate.id]));
    expect(new Set(plan.assignments.map(({ glaze }) => glaze)).size).toBe(1);
  });

  it("values a low-reward feasible Order above a high-reward impossible Order", () => {
    const { state, actorId } = fixture(2, 9205);
    addFinished(state, actorId, "bowl", "standard", "white", "plain");
    state.round = 5;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    expect(evaluateOrderFeasibility(observation, "M01").probability)
      .toBeGreaterThan(evaluateOrderFeasibility(observation, "I10").probability);
  });

  it("avoids acquiring an Order too late to finish", () => {
    const { state, actorId } = fixture(2, 9206);
    state.round = 5;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const take = evaluateAction(observation, { type: "OFFICE_TAKE_ORDER", orderId: "M23" }, context(state, actorId), profile);
    const end = evaluateAction(observation, { type: "OFFICE_END_ORDERS" }, context(state, actorId), profile);
    expect(end.totalScore).toBeGreaterThan(take.totalScore);
  });

  it("prefers a compatible Market Order to an incompatible Imperial Order", () => {
    const { state, actorId } = fixture(2, 9207);
    addFinished(state, actorId, "bowl", "standard", "white", "plain");
    state.round = 4;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const market = evaluateAction(observation, { type: "OFFICE_TAKE_ORDER", orderId: "M01" }, context(state, actorId, { assignedIntent: "Market" }), profile);
    const imperial = evaluateAction(observation, { type: "OFFICE_TAKE_ORDER", orderId: "I10" }, context(state, actorId, { assignedIntent: "Market" }), profile);
    expect(market.totalScore).toBeGreaterThan(imperial.totalScore);
  });

  it("evaluates blind draws from public composition only", () => {
    const { state, actorId } = fixture(2, 9208);
    const changed = structuredClone(state);
    changed.marketDeck.reverse();
    const left = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const right = createPlayerObservation(changed, actorId, createPrivateFiringState(changed));
    expect(knownBlindOrderPool(left, "market")).toEqual(knownBlindOrderPool(right, "market"));
    const profile = createInitialStrategyProfile(2);
    expect(evaluateAction(left, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" }, context(state, actorId), profile).totalScore)
      .toBe(evaluateAction(right, { type: "OFFICE_DRAW_BLIND_ORDER", deck: "market" }, context(changed, actorId), profile).totalScore);
  });

  it("applies diminishing marginal value after resource demand is covered", () => {
    expect(marginalResourceValue(0, 4)).toBeGreaterThan(marginalResourceValue(4, 4));
    expect(marginalResourceValue(4, 4)).toBeGreaterThan(marginalResourceValue(9, 4));
  });

  it("penalizes stranded terminal pipeline stages", () => {
    const { state, actorId } = fixture(2, 9209);
    state.round = 5;
    state.players[actorId]!.orderHand = ["M01"];
    addShaped(state, actorId, "bowl");
    addGlazed(state, actorId, "bowl", "white", "plain");
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = buildPlayerPlan(observation, createInitialStrategyProfile(2));
    expect(terminalPipelinePenalty(plan)).toBeGreaterThan(0);
  });

  it("prioritizes Round-5 conversion over starting another ceramic", () => {
    const { state, actorId } = fixture(2, 9210);
    state.round = 5;
    state.players[actorId]!.orderHand = ["M01"];
    const glazed = addGlazed(state, actorId, "bowl", "white", "plain");
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const load = evaluateAction(observation, {
      type: "USE_KILN_YARD",
      workerId: workerId(state, actorId, "apprentice"),
      loads: [{ ceramicId: glazed.id, kilnSpaceId: "middle_1" }],
    }, context(state, actorId), profile);
    const form = evaluateAction(observation, {
      type: "FORM_CERAMICS",
      workerId: workerId(state, actorId, "apprentice"),
      shapes: ["plate"],
    }, context(state, actorId), profile);
    expect(load.totalScore).toBeGreaterThan(form.totalScore);
  });

  it("declines Second Firing when it is too late to convert again", () => {
    const { state, actorId } = fixture(2, 9211);
    state.round = 5;
    const ceramic = addLoaded(state, actorId, "bowl", "white", "plain", "middle_1");
    state.firingContext = {
      round: 5,
      contributors: [actorId],
      contributions: { [actorId]: 1 },
      baseHeat: 2,
      fireModifier: 1,
      globalHeat: 3,
      zeroFireModifierCeramicIds: [],
      ceramicResults: {
        [ceramic.id]: { ceramicId: ceramic.id, zoneModifier: 0, ignoredFireModifier: false, naturalActualHeat: 3, naturalHeatDifference: 2, naturalExactMatch: false, finalActualHeat: 3, finalHeatDifference: 2, forcedQuality: null, assignedQuality: "standard" },
      },
    };
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const use = evaluateAction(observation, { type: "RESOLVE_SECOND_FIRING", ceramicId: ceramic.id }, context(state, actorId), profile);
    const decline = evaluateAction(observation, { type: "RESOLVE_SECOND_FIRING", ceramicId: null }, context(state, actorId), profile);
    expect(decline.totalScore).toBeGreaterThan(use.totalScore);
  });

  it("uses Fuel Ledger only when the whole loaded portfolio benefits", () => {
    const make = (glaze: "white" | "celadon", seed: number) => {
      const { state, actorId } = fixture(2, seed);
      const first = addLoaded(state, actorId, "bowl", glaze, "plain", "middle_1");
      addLoaded(state, actorId, "plate", glaze, "plain", "middle_2");
      state.players[actorId]!.resources.wood = 3;
      state.players[actorId]!.resources.coins = 3;
      state.firingContext = {
        round: state.round,
        contributors: [actorId, state.playerOrder.find((id) => id !== actorId)!],
        contributions: { [actorId]: 1 },
        baseHeat: null,
        fireModifier: null,
        globalHeat: null,
        zeroFireModifierCeramicIds: [],
        ceramicResults: { [first.id]: { ceramicId: first.id, zoneModifier: 0, ignoredFireModifier: false, naturalActualHeat: 0, naturalHeatDifference: 0, naturalExactMatch: false, finalActualHeat: 0, finalHeatDifference: 0, forcedQuality: null, assignedQuality: null } },
      };
      return { state, actorId };
    };
    const helpful = make("celadon", 9212);
    const harmful = make("white", 9213);
    for (const current of [helpful, harmful]) current.state.firingContext!.contributions[current.state.playerOrder.find((id) => id !== current.actorId)!] = 0;
    const score = ({ state, actorId }: typeof helpful, use: boolean) => {
      const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
      return evaluateAction(observation, { type: "RESOLVE_FUEL_LEDGER", use }, context(state, actorId), createInitialStrategyProfile(2)).totalScore;
    };
    expect(score(helpful, true)).toBeGreaterThan(score(helpful, false));
    expect(score(harmful, true)).toBeLessThan(score(harmful, false));
  });

  it("uses Ding's extra Shape only when it advances the plan", () => {
    const { state, actorId } = fixture(2, 9214);
    state.players[actorId]!.kilnId = "DI";
    state.players[actorId]!.orderHand = ["M15"];
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createInitialStrategyProfile(2);
    const base = { type: "FORM_CERAMICS" as const, workerId: workerId(state, actorId, "apprentice"), shapes: ["bowl" as const] };
    const useful = evaluateAction(observation, { ...base, dingExtraShape: "bowl" }, context(state, actorId), profile);
    const wasteful = evaluateAction(observation, { ...base, dingExtraShape: "plate" }, context(state, actorId), profile);
    expect(useful.totalScore).toBeGreaterThan(wasteful.totalScore);
  });

  it("keeps learned priors bounded after repeated updates", () => {
    let profile = createInitialStrategyProfile(2);
    const row = (playerId: string, won: boolean): StrategyLearningResult => ({
      playerId,
      won,
      finalScore: won ? 30 : 0,
      actionCounts: { FORM_CERAMICS: 10 },
      completedOrderIds: won ? ["M01"] : [],
      uncompletedOrders: won ? [] : [{ orderId: "I10", acquisitionFeasibility: 0.8, actionsInvested: 8 }],
      acquiredTechniqueIds: ["T11"],
      techniquePerformance: [{ techniqueId: "T11", opportunities: 8, uses: won ? 6 : 0, contribution: won ? 1 : -0.25 }],
      traditionId: won ? "RU" : "DI",
      assignedIntent: won ? "Market" : "Imperial",
      realizedTags: won ? ["Market-heavy"] : ["Imperial-heavy"],
      resourceRemainder: { clay: 8, wood: 12, coins: 2 },
      naturalMasterpieces: 1,
      finalMasterpieces: 1,
      flawedCeramics: 0,
      firedCeramics: 5,
      unusedFinishedCeramics: 0,
    });
    for (let index = 0; index < 500; index += 1) profile = learnFromCompletedGame(profile, [row("P1", true), row("P2", false)]);
    expect(Math.abs(profile.intentPriors.Market)).toBeLessThanOrEqual(1.25);
    expect(Math.abs(profile.strategicPriors["Market-heavy"])).toBeLessThanOrEqual(1.25);
    expect(Math.abs(profile.actionWeights["FORM_CERAMICS"] ?? 0)).toBeLessThanOrEqual(1.5);
  });

  it("learns a negative signal from a costly uncompleted Order", () => {
    const profile = createInitialStrategyProfile(2);
    const baseline = profile.orderValues["I10"]!;
    const common = {
      actionCounts: { FORM_CERAMICS: 6 }, acquiredTechniqueIds: [], techniquePerformance: [], traditionId: "RU" as const,
      assignedIntent: "Hybrid" as const, realizedTags: ["Hybrid" as const], resourceRemainder: { clay: 2, wood: 2, coins: 2 },
      naturalMasterpieces: 0, finalMasterpieces: 0, flawedCeramics: 0, firedCeramics: 2, unusedFinishedCeramics: 1,
    };
    const next = learnFromCompletedGame(profile, [
      { ...common, playerId: "P1", won: false, finalScore: 2, completedOrderIds: [], uncompletedOrders: [{ orderId: "I10", acquisitionFeasibility: 0.9, actionsInvested: 8 }] },
      { ...common, playerId: "P2", won: true, finalScore: 10, completedOrderIds: ["M01"], uncompletedOrders: [] },
    ]);
    expect(next.orderValues["I10"]).toBeLessThan(baseline);
  });

  it("still completes a full legal authoritative game", async () => {
    const result = await runSelfPlayGame({
      gameId: "selfplay-002-legality",
      gameSequence: 51,
      playerCount: 2,
      gameSeed: 0x22002,
      aiSeed: 0x22003,
      assignedTraditions: assignedTraditionsForGame(2, 51),
      assignedIntents: assignedStrategyIntentsForGame(2, 51),
      datasetSplit: "holdout",
      profile: createInitialStrategyProfile(2),
      explorationRate: 0,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.illegalActionAttempts).toBe(0);
  });
});
