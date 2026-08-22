import { describe, expect, it } from "vitest";
import { GAME_CONFIG, SeededRandom, createPrivateFiringState } from "../src/game/index.ts";
import type { GameState, PlayerId } from "../src/game/index.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { LookaheadAIPolicy, V4_SEARCH_CONFIGS } from "../src/ai/lookaheadPolicy.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { buildPlayerPlan } from "../src/ai/planning.ts";
import { buildV4PairedSchedule, runV4CrossplayEvaluation } from "../src/ai/selfplay004.ts";
import { runSelfPlayGame, assignedTraditionsForGame } from "../src/ai/selfplay.ts";
import { createInitialStrategyProfile, createV4StrategyProfile } from "../src/ai/strategy.ts";
import { strategicScenarioCoverage, STRATEGIC_SCENARIO_CATALOG } from "../src/ai/strategicScenarios.ts";
import { AI_POLICY_V4_VERSION, AI_POLICY_VERSION } from "../src/ai/types.ts";
import type { AIAction, AIDecisionContext } from "../src/ai/types.ts";
import { addGlazed, startedGame } from "./helpers.ts";

function fixture(seed = 10_401): { state: GameState; actorId: PlayerId } {
  const { state } = startedGame(2, seed);
  const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
  return { state, actorId };
}

function context(state: GameState, actorId: PlayerId): AIDecisionContext {
  return {
    gameSequence: 80,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: state.players[actorId]!.kilnId!,
    assignedIntent: "Hybrid",
    explorationRate: 0,
    mode: "regression",
  };
}

describe("Selfplay-004 strategic policy", () => {
  it("covers all 15 official Techniques and all five Kilns with named strategic fixtures", () => {
    const coverage = strategicScenarioCoverage();
    expect(coverage.techniqueIds).toHaveLength(15);
    expect(coverage.kilnIds).toHaveLength(5);
    expect(coverage.missingTechniqueIds).toEqual([]);
    expect(coverage.missingKilnIds).toEqual([]);
    expect(STRATEGIC_SCENARIO_CATALOG.some(({ kind }) => kind === "terminal")).toBe(true);
  });

  it("builds an explicit multi-round action budget under the authoritative base rules", () => {
    const { state, actorId } = fixture(10_402);
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = buildPlayerPlan(observation, createV4StrategyProfile(2));
    expect(plan.multiRoundRoute.rounds.map(({ round }) => round)).toEqual([1, 2, 3, 4, 5]);
    expect(plan.multiRoundRoute.totalWorkerActionsAvailable).toBeGreaterThan(0);
    expect(plan.multiRoundRoute.orders.map(({ orderId }) => orderId)).toContain(plan.primaryOrderId);
    // The V004 policy is historical, but its observation must report the rules the
    // authoritative engine is actually running, not the version it was trained on.
    expect(observation.rulesVersion).toBe(GAME_CONFIG.rulesVersion);
  });

  it("is deterministic for the same public observation and AI seed", async () => {
    const { state, actorId } = fixture(10_403);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const profile = createV4StrategyProfile(2);
    const left = await new LookaheadAIPolicy(profile, new SeededRandom(404)).chooseAction(observation, legal, context(state, actorId));
    const right = await new LookaheadAIPolicy(profile, new SeededRandom(404)).chooseAction(observation, legal, context(state, actorId));
    expect(left.action).toEqual(right.action);
    expect(left.score).toBe(right.score);
    expect(left.diagnostics.search).toEqual(right.diagnostics.search);
  });

  it("is invariant to hidden deck ordering", async () => {
    const { state, actorId } = fixture(10_404);
    const changed = structuredClone(state);
    changed.marketDeck.reverse();
    changed.imperialDeck.reverse();
    changed.techniqueDecks.forming.reverse();
    changed.fireDeck.reverse();
    const own = createPrivateFiringState(state);
    const leftObservation = createPlayerObservation(state, actorId, own);
    const rightObservation = createPlayerObservation(changed, actorId, own);
    expect(leftObservation).toEqual(rightObservation);
    const legal = getLegalAIActions(state, actorId, own);
    const profile = createV4StrategyProfile(2);
    const left = await new LookaheadAIPolicy(profile, new SeededRandom(405)).chooseAction(leftObservation, legal, context(state, actorId));
    const right = await new LookaheadAIPolicy(profile, new SeededRandom(405)).chooseAction(rightObservation, legal, context(changed, actorId));
    expect(left.action).toEqual(right.action);
    expect(left.score).toBe(right.score);
  });

  it("honours the deterministic search node budget", async () => {
    const { state, actorId } = fixture(10_405);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const config = { ...V4_SEARCH_CONFIGS.hard, maxNodes: 12 };
    const decision = await new LookaheadAIPolicy(createV4StrategyProfile(2), new SeededRandom(406), config)
      .chooseAction(observation, legal, context(state, actorId));
    expect(decision.diagnostics.search?.searchedNodes).toBeLessThanOrEqual(12);
    expect(decision.diagnostics.search?.completedDepth).toBeLessThanOrEqual(3);
  });

  it("prefers converting a planned glazed ceramic over starting stray work in round five", async () => {
    const { state, actorId } = fixture(10_406);
    state.round = 5;
    const ceramic = addGlazed(state, actorId, "bowl", "white", "plain");
    state.players[actorId]!.resources.clay = 8;
    const worker = Object.values(state.players[actorId]!.workers).find(({ status }) => status === "available")!;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const actions: AIAction[] = [
      { type: "FORM_CERAMICS", workerId: worker.id, shapes: ["censer"] },
      { type: "USE_KILN_YARD", workerId: worker.id, loads: [{ ceramicId: ceramic.id, kilnSpaceId: "middle_1" }] },
    ];
    const decision = await new LookaheadAIPolicy(createV4StrategyProfile(2), new SeededRandom(407))
      .chooseAction(observation, actions, context(state, actorId));
    expect(decision.action.type).toBe("USE_KILN_YARD");
    expect(decision.diagnostics.search?.principalVariation[0]).toBe("load");
  });

  it("rotates the candidate through every seat in paired cross-play", () => {
    const schedule = buildV4PairedSchedule(12);
    for (const playerCount of [2, 3, 4] as const) {
      const seats = new Set(schedule.filter((row) => row.playerCount === playerCount).map(({ focalPlayerId }) => focalPlayerId));
      expect(seats.size).toBe(playerCount);
    }
    expect(new Set(schedule.map(({ gameSeed }) => gameSeed)).size).toBe(schedule.length);
  });

  it("preserves V003 as the default self-play policy", async () => {
    const result = await runSelfPlayGame({
      gameId: "V004-DEFAULT-V003",
      gameSequence: 1,
      playerCount: 2,
      gameSeed: 10_408,
      aiSeed: 20_408,
      assignedTraditions: assignedTraditionsForGame(2, 1),
      profile: createInitialStrategyProfile(2),
      explorationRate: 0,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(new Set(result.decisions.map(({ policyVersion }) => policyVersion))).toEqual(new Set([AI_POLICY_VERSION]));
    expect(result.decisions.every(({ diagnostics }) => diagnostics.search === null)).toBe(true);
  });

  it("completes a legal all-V004 game with search telemetry", async () => {
    const result = await runSelfPlayGame({
      gameId: "V004-ALL-CANDIDATE",
      gameSequence: 2,
      playerCount: 2,
      gameSeed: 10_409,
      aiSeed: 20_409,
      assignedTraditions: assignedTraditionsForGame(2, 2),
      profile: createV4StrategyProfile(2),
      policyVersion: AI_POLICY_V4_VERSION,
      explorationRate: 0,
      v4SearchConfig: V4_SEARCH_CONFIGS.balanced,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.illegalActionAttempts).toBe(0);
    expect(result.decisions.every(({ policyVersion }) => policyVersion === AI_POLICY_V4_VERSION)).toBe(true);
    expect(result.decisions.some(({ diagnostics }) => diagnostics.search !== null)).toBe(true);
  });

  it("runs matched baseline/candidate games and reports explicit promotion gates", async () => {
    const schedule = buildV4PairedSchedule(1).slice(0, 1);
    const result = await runV4CrossplayEvaluation(schedule, V4_SEARCH_CONFIGS.conservative);
    expect(result.pairs).toHaveLength(1);
    expect(result.summary.gamesRun).toBe(2);
    expect(result.pairs[0]?.baselineGameId).toContain("BASELINE");
    expect(result.pairs[0]?.candidateGameId).toContain("CANDIDATE");
    expect(result.summary.illegalActionAttempts).toBe(0);
    expect(result.summary.promotion.gates).toHaveProperty("positivePairedCi");
  });
});
