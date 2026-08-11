import { describe, expect, it } from "vitest";
import { SeededRandom, createPrivateFiringState } from "../src/game/index.ts";
import type { GameState, PlayerId } from "../src/game/index.ts";
import { createPlayerObservation } from "../src/ai/observation.ts";
import { getLegalAIActions } from "../src/ai/legalActions.ts";
import { rankV5BaseCandidates, RolloutAIPolicy } from "../src/ai/rolloutPolicy.ts";
import { simulatePublicBeliefTrajectory } from "../src/ai/decisionOracle.ts";
import {
  assignedStrategyIntentsForGame,
  assignedTraditionsForGame,
  runSelfPlayGame,
} from "../src/ai/selfplay.ts";
import { buildV6PairedSchedule } from "../src/ai/selfplay006.ts";
import { createV6StrategyProfile } from "../src/ai/strategy.ts";
import { AI_POLICY_V6_VERSION } from "../src/ai/types.ts";
import type { AIDecisionContext } from "../src/ai/types.ts";
import {
  V6_LEAF_FEATURE_NAMES,
  createNeutralV6LeafModel,
  createV6LeafEvaluator,
  extractV6LeafFeatures,
  fitV6LeafModel,
  validateV6LeafModel,
} from "../src/ai/v6LeafModel.ts";
import type { V6LeafTrainingExample } from "../src/ai/v6LeafModel.ts";
import { splitV6TrainingExamples } from "../src/ai/v6Training.ts";
import { startedGame } from "./helpers.ts";

function fixture(seed = 16_601): { state: GameState; actorId: PlayerId } {
  const { state } = startedGame(2, seed);
  const actorId = state.phase.type === "work" ? state.phase.activePlayerId : state.playerOrder[0]!;
  return { state, actorId };
}

function context(state: GameState, actorId: PlayerId): AIDecisionContext {
  return {
    gameSequence: 60_600,
    decisionIndex: 1,
    learningPhase: "mature",
    assignedTradition: state.players[actorId]!.kilnId!,
    assignedIntent: "Hybrid",
    explorationRate: 0,
    mode: "regression",
  };
}

function syntheticExample(
  sourceGameId: string,
  groupId: string,
  candidateActionKey: string,
  signal: number,
  target: number,
): V6LeafTrainingExample {
  const features = Array.from({ length: V6_LEAF_FEATURE_NAMES.length }, () => 0);
  features[0] = signal;
  features[3] = signal * 0.5;
  return {
    sourceGameId,
    playerCount: 2,
    publicStateFingerprint: `PUB-${sourceGameId}`,
    groupId,
    candidateActionKey,
    sampleIndex: 0,
    checkpoint: "short",
    decisionsToCheckpoint: 1,
    features,
    handcraftedValue: -signal,
    outcome: {
      relativeVp: target,
      relativeCompletedOrders: 0,
      winCredit: target > 0 ? 1 : 0,
      strandedPipeline: 0,
      target,
    },
    target,
  };
}

describe("Selfplay-006 calibrated public leaf model", () => {
  it("extracts identical features when authoritative hidden decks differ", () => {
    const { state, actorId } = fixture(16_601);
    const hiddenChange = structuredClone(state);
    hiddenChange.marketDeck.reverse();
    hiddenChange.imperialDeck.reverse();
    hiddenChange.techniqueDecks.firing.reverse();
    hiddenChange.fireDeck.reverse();
    const left = createPlayerObservation(state, actorId, createPrivateFiringState(state));
    const right = createPlayerObservation(hiddenChange, actorId, createPrivateFiringState(hiddenChange));
    expect(left).toEqual(right);
    expect(extractV6LeafFeatures(left)).toEqual(extractV6LeafFeatures(right));
  });

  it("fits a deterministic regularized model that improves a held-out ranking", () => {
    const training = [
      syntheticExample("TRAIN-1", "G1", "A", -2, -4),
      syntheticExample("TRAIN-1", "G1", "B", 2, 4),
      syntheticExample("TRAIN-2", "G2", "A", -1, -2),
      syntheticExample("TRAIN-2", "G2", "B", 1, 2),
    ];
    const holdout = [
      syntheticExample("HOLDOUT", "G3", "A", -1.5, -3),
      syntheticExample("HOLDOUT", "G3", "B", 1.5, 3),
    ];
    const left = fitV6LeafModel(training, 0.1);
    const right = fitV6LeafModel(training, 0.1);
    expect(left).toEqual(right);
    const metrics = validateV6LeafModel(left, holdout);
    expect(metrics.bestActionAccuracy).toBe(1);
    expect(metrics.handcraftedBestActionAccuracy).toBe(0);
    expect(metrics.pairwiseAccuracy).toBe(1);
  });

  it("holds out entire capture games at every player count", () => {
    const rows = ([2, 3, 4] as const).flatMap((playerCount) => [
      { ...syntheticExample(`${playerCount}P-TRAIN`, `${playerCount}P-G1`, "A", -1, -2), playerCount },
      { ...syntheticExample(`${playerCount}P-HOLDOUT`, `${playerCount}P-G2`, "B", 1, 2), playerCount },
    ]);
    const split = splitV6TrainingExamples(rows);
    expect(split.trainingGameIds).toHaveLength(3);
    expect(split.holdoutGameIds).toHaveLength(3);
    const trainingIds = new Set(split.training.map(({ sourceGameId }) => sourceGameId));
    expect(split.holdout.every(({ sourceGameId }) => !trainingIds.has(sourceGameId))).toBe(true);
  });

  it("generates common-seed checkpoints and a complete realized continuation", () => {
    const { state, actorId } = fixture(16_602);
    const privateState = createPrivateFiringState(state);
    const observation = createPlayerObservation(state, actorId, privateState);
    const profile = createV6StrategyProfile(2);
    const legal = getLegalAIActions(state, actorId, privateState);
    const candidate = rankV5BaseCandidates(observation, legal, context(state, actorId), profile).scored[0];
    expect(candidate).toBeDefined();
    const trajectory = simulatePublicBeliefTrajectory(observation, candidate!.action, profile, 6_606, 0);
    expect(trajectory?.completed).toBe(true);
    expect(trajectory?.terminalState.phase.type).toBe("finished");
    expect(trajectory?.checkpoints.map(({ kind }) => kind)).toEqual(["short", "one_round", "two_rounds"]);
  });

  it("makes identical deterministic choices for identical public observations", async () => {
    const { state, actorId } = fixture(16_603);
    const hiddenChange = structuredClone(state);
    hiddenChange.marketDeck.reverse();
    hiddenChange.imperialDeck.reverse();
    hiddenChange.fireDeck.reverse();
    const leftPrivate = createPrivateFiringState(state);
    const rightPrivate = createPrivateFiringState(hiddenChange);
    const leftObservation = createPlayerObservation(state, actorId, leftPrivate);
    const rightObservation = createPlayerObservation(hiddenChange, actorId, rightPrivate);
    const legal = getLegalAIActions(state, actorId, leftPrivate);
    const model = createNeutralV6LeafModel();
    const profile = createV6StrategyProfile(2);
    const config = {
      rootWidth: 2,
      samplesPerAction: 1,
      horizonDecisions: 1,
      rolloutWeight: 1,
      baseScoreWeight: 0.42,
      maxOracleActions: 2,
      baseScoreConfidenceMargin: 3,
    };
    const options = {
      leafEvaluator: createV6LeafEvaluator(model),
      oracleVersion: "decision-oracle-002" as const,
      leafModelId: model.modelId,
    };
    const left = await new RolloutAIPolicy(profile, new SeededRandom(606), config, 60_606, options)
      .chooseAction(leftObservation, legal, context(state, actorId));
    const right = await new RolloutAIPolicy(profile, new SeededRandom(606), config, 60_606, options)
      .chooseAction(rightObservation, legal, context(hiddenChange, actorId));
    expect(left.action).toEqual(right.action);
    expect(left.diagnostics.oracle?.leafModelId).toBe(model.modelId);
  });

  it("completes a legal authoritative game with V006 diagnostics", async () => {
    const playerCount = 2;
    const result = await runSelfPlayGame({
      gameId: "V006-FULL-GAME",
      gameSequence: 60_606,
      playerCount,
      gameSeed: 16_604,
      aiSeed: 26_604,
      assignedTraditions: assignedTraditionsForGame(playerCount, 60_606),
      assignedIntents: assignedStrategyIntentsForGame(playerCount, 60_606),
      profile: createV6StrategyProfile(playerCount),
      policyVersion: AI_POLICY_V6_VERSION,
      v6LeafModel: createNeutralV6LeafModel(),
      explorationRate: 0,
    });
    expect(result.state.phase.type).toBe("finished");
    expect(result.illegalActionAttempts).toBe(0);
    expect(result.decisions.every(({ policyVersion }) => policyVersion === AI_POLICY_V6_VERSION)).toBe(true);
    expect(result.decisions.some(({ diagnostics }) => diagnostics.oracle?.oracleVersion === "decision-oracle-002")).toBe(true);
  });

  it("rotates V006 through every focal seat", () => {
    const schedule = buildV6PairedSchedule(12);
    for (const playerCount of [2, 3, 4] as const) {
      expect(new Set(schedule.filter((row) => row.playerCount === playerCount).map(({ focalPlayerId }) => focalPlayerId)).size)
        .toBe(playerCount);
    }
  });
});
