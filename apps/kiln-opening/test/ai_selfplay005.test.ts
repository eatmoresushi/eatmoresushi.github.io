import { describe, expect, it } from "vitest";
import {
  SeededRandom,
  applyAction,
  createPrivateFiringState,
} from "../src/game/index.ts";
import type { GameAction, GameState, PlayerId } from "../src/game/index.ts";
import { projectPublicGameState } from "../src/multiplayer/projection.ts";
import { createPublicBeliefState } from "../src/ai/beliefState.ts";
import { auditTechniqueCompetencies } from "../src/ai/competencyAudit.ts";
import { evaluateDecisionOracle, oracleSupports, V5_ROLLOUT_CONFIGS } from "../src/ai/decisionOracle.ts";
import { evaluateAction } from "../src/ai/evaluator.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { collectPublicOracleObservations } from "../src/ai/oracleCalibration.ts";
import { buildPlayerPlan } from "../src/ai/planning.ts";
import { rankV5BaseCandidates, RolloutAIPolicy } from "../src/ai/rolloutPolicy.ts";
import { assignedStrategyIntentsForGame, assignedTraditionsForGame, runSelfPlayGame } from "../src/ai/selfplay.ts";
import { createInitialStrategyProfile, createV5StrategyProfile } from "../src/ai/strategy.ts";
import { STRATEGIC_SCENARIO_CATALOG } from "../src/ai/strategicScenarios.ts";
import { buildV5PairedSchedule, runV5CrossplayEvaluation } from "../src/ai/selfplay005.ts";
import { AI_POLICY_V5_VERSION } from "../src/ai/types.ts";
import type { AIAction, AIDecisionContext } from "../src/ai/types.ts";
import { addShaped, startedGame, workerId } from "./helpers.ts";

function fixture(seed = 15_501): { state: GameState; actorId: PlayerId } {
  const { state } = startedGame(2, seed);
  const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
  return { state, actorId };
}

function context(state: GameState, actorId: PlayerId): AIDecisionContext {
  return {
    gameSequence: 100,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: state.players[actorId]!.kilnId!,
    assignedIntent: "Hybrid",
    explorationRate: 0,
    mode: "regression",
  };
}

describe("Selfplay-005 public-belief rollout policy", () => {
  it("reconstructs a full engine state with exactly the same public projection", () => {
    const { state, actorId } = fixture(15_501);
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    for (const sample of [0, 1, 2]) {
      const belief = createPublicBeliefState(observation, 505, sample);
      expect(projectPublicGameState(belief)).toEqual(observation.game);
    }
  });

  it("cannot distinguish authoritative states with the same public information", () => {
    const { state, actorId } = fixture(15_502);
    const hiddenChange = structuredClone(state);
    hiddenChange.marketDeck.reverse();
    hiddenChange.imperialDeck.reverse();
    hiddenChange.techniqueDecks.firing.reverse();
    hiddenChange.fireDeck.reverse();
    const privateState = createPrivateFiringState(state);
    const left = createPlayerObservation(state, actorId, privateState);
    const right = createPlayerObservation(hiddenChange, actorId, privateState);
    expect(left).toEqual(right);
    expect(createPublicBeliefState(left, 506, 1)).toEqual(createPublicBeliefState(right, 506, 1));
  });

  it("samples different hidden orders while preserving public deck counts", () => {
    const { state, actorId } = fixture(15_503);
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const left = createPublicBeliefState(observation, 507, 0);
    const right = createPublicBeliefState(observation, 507, 1);
    expect(left.marketDeck).not.toEqual(right.marketDeck);
    expect(left.marketDeck).toHaveLength(observation.game.decks.marketRemaining);
    expect(projectPublicGameState(left)).toEqual(projectPublicGameState(right));
  });

  it("can apply real legal engine transitions to a sampled belief", () => {
    const { state, actorId } = fixture(15_504);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState)
      .filter((action): action is GameAction => action.type !== "SUBMIT_WOOD_CONTRIBUTION")
      .filter((action) => action.type !== "PASS_WORK_PHASE")
      .slice(0, 12);
    expect(legal.length).toBeGreaterThan(0);
    for (const action of legal) {
      const belief = createPublicBeliefState(observation, 508, 0);
      const result = applyAction(belief, actorId, action, new SeededRandom(508));
      expect(result.ok, JSON.stringify(action)).toBe(true);
    }
  });

  it("produces deterministic common-random-number oracle estimates", () => {
    const { state, actorId } = fixture(15_505);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const profile = createV5StrategyProfile(2);
    const ranked = rankV5BaseCandidates(observation, legal, context(state, actorId), profile).scored;
    const left = evaluateDecisionOracle(observation, ranked, profile, V5_ROLLOUT_CONFIGS.fast, 509);
    const right = evaluateDecisionOracle(observation, ranked, profile, V5_ROLLOUT_CONFIGS.fast, 509);
    expect(left).toEqual(right);
    expect(left.estimates).toHaveLength(2);
    expect(left.estimates.every(({ successfulSamples }) => successfulSamples === 1)).toBe(true);
  });

  it("falls back rather than reading unrevealed Wood during contributions", () => {
    const { state, actorId } = fixture(15_506);
    state.phase = {
      type: "firing_contributions",
      windowId: "TEST-WINDOW",
      eligiblePlayerIds: [actorId],
      submittedPlayerIds: [],
    };
    state.firingContext = null;
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    expect(oracleSupports(observation)).toBe(false);
  });

  it("has positive and decline forecasts for every official Technique", () => {
    const { state, actorId } = fixture(15_507);
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const plan = buildPlayerPlan(observation, createV5StrategyProfile(2));
    const audit = auditTechniqueCompetencies(observation, plan);
    expect(audit).toHaveLength(15);
    expect(audit.filter(({ positivePassed }) => !positivePassed)).toEqual([]);
    expect(audit.filter(({ declinePassed }) => !declinePassed)).toEqual([]);
  });

  it("specifies positive and decline fixtures for every Technique and Kiln", () => {
    const strategic = STRATEGIC_SCENARIO_CATALOG.filter(({ kind }) => kind === "technique" || kind === "kiln");
    expect(strategic).toHaveLength(20);
    expect(strategic.every(({ positiveFixture, declineFixture }) => Boolean(positiveFixture && declineFixture))).toBe(true);
  });

  it("adds explicit Ru opportunity value and conserves an unnecessary Guan waiver", () => {
    const { state, actorId } = fixture(15_508);
    const worker = workerId(state, actorId, "shifu");
    const ceramic = addShaped(state, actorId, "bowl");
    const observation = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const profile = createV5StrategyProfile(2);
    state.players[actorId]!.kilnId = "RU";
    observation.game.players[actorId]!.kilnId = "RU";
    const glazeActions: AIAction[] = [
      { type: "GLAZE_CERAMICS", workerId: worker, selections: [{ ceramicId: ceramic.id, glaze: "celadon", decoration: "plain" }], shifuMode: "normal" },
      { type: "GLAZE_CERAMICS", workerId: worker, selections: [{ ceramicId: ceramic.id, glaze: "celadon", decoration: "carved" }], shifuMode: "normal" },
    ];
    const plan = buildPlayerPlan(observation, profile);
    const frozen = glazeActions.map((action) => evaluateAction(observation, action, context(state, actorId), profile, plan).totalScore);
    const v5 = rankV5BaseCandidates(observation, glazeActions, context(state, actorId), profile).scored;
    const celadonPlain = v5.find(({ action }) => action.type === "GLAZE_CERAMICS" && action.selections[0]?.decoration === "plain")!;
    const celadonCarved = v5.find(({ action }) => action.type === "GLAZE_CERAMICS" && action.selections[0]?.decoration === "carved")!;
    expect((celadonPlain.totalScore - celadonCarved.totalScore) - (frozen[0]! - frozen[1]!)).toBeCloseTo(0.9);

    observation.game.players[actorId]!.kilnId = "GU";
    const guActions: AIAction[] = [
      { type: "COMPLETE_ORDER", orderId: "M01", ceramicIds: [], useGuanWaiver: false },
      { type: "COMPLETE_ORDER", orderId: "M01", ceramicIds: [], useGuanWaiver: true },
    ];
    const gu = rankV5BaseCandidates(observation, guActions, context(state, actorId), profile).scored;
    expect(gu[0]?.action).toMatchObject({ type: "COMPLETE_ORDER", useGuanWaiver: false });
  });

  it("completes a full legal authoritative game with oracle telemetry", async () => {
    const result = await runSelfPlayGame({
      gameId: "V005-FULL-GAME",
      gameSequence: 1,
      playerCount: 2,
      gameSeed: 15_510,
      aiSeed: 25_510,
      assignedTraditions: assignedTraditionsForGame(2, 1),
      assignedIntents: assignedStrategyIntentsForGame(2, 1),
      profile: createV5StrategyProfile(2),
      policyVersion: AI_POLICY_V5_VERSION,
      v5RolloutConfig: V5_ROLLOUT_CONFIGS.fast,
      explorationRate: 0,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.illegalActionAttempts).toBe(0);
    expect(result.decisions.every(({ policyVersion }) => policyVersion === AI_POLICY_V5_VERSION)).toBe(true);
    expect(result.decisions.some(({ diagnostics }) => diagnostics.oracle?.fallbackReason === null)).toBe(true);
  });

  it("leaves the frozen V003 diagnostics and policy boundary intact", async () => {
    const { state, actorId } = fixture(15_511);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const legal = getLegalAIActions(state, actorId, privateState);
    const decision = await new RolloutAIPolicy(createV5StrategyProfile(2), new SeededRandom(511), V5_ROLLOUT_CONFIGS.fast, 511)
      .chooseAction(observation, legal, context(state, actorId));
    expect(decision.diagnostics.oracle).not.toBeNull();
    const frozen = evaluateAction(observation, legal[0]!, context(state, actorId), createInitialStrategyProfile(2));
    expect(frozen.diagnostics.oracle).toBeNull();
  });

  it("captures serialisable public oracle states without authoritative decks", async () => {
    const observations = await collectPublicOracleObservations(3, 1);
    expect(observations.length).toBeGreaterThan(0);
    const serialized = JSON.parse(JSON.stringify(observations[0])) as Record<string, unknown>;
    const observation = (serialized["observation"] ?? {}) as Record<string, unknown>;
    const game = (observation["game"] ?? {}) as Record<string, unknown>;
    expect(game).not.toHaveProperty("marketDeck");
    expect(game).not.toHaveProperty("fireDeck");
    expect(game).not.toHaveProperty("vesselSupply");
  });

  it("rotates V005 across every seat using unique fresh paired seeds", () => {
    const schedule = buildV5PairedSchedule(12);
    expect(new Set(schedule.map(({ gameSeed }) => gameSeed)).size).toBe(schedule.length);
    for (const playerCount of [2, 3, 4] as const) {
      expect(new Set(schedule.filter((row) => row.playerCount === playerCount).map(({ focalPlayerId }) => focalPlayerId)).size)
        .toBe(playerCount);
    }
  });

  it("reports practical, confidence, subgroup, legality, oracle and latency promotion gates", async () => {
    const result = await runV5CrossplayEvaluation(buildV5PairedSchedule(1).slice(0, 1), V5_ROLLOUT_CONFIGS.fast, true);
    expect(result.summary.gamesRun).toBe(2);
    expect(result.summary.illegalActionAttempts).toBe(0);
    expect(result.summary.promotion.gates).toMatchObject({
      meaningfulMeanVpGain: expect.any(Boolean),
      positiveBootstrapCi: expect.any(Boolean),
      noPlayerCountRegression: expect.any(Boolean),
      decisionP95Under20Ms: expect.any(Boolean),
      oracleFailureBelow1Percent: true,
    });
  });
});
