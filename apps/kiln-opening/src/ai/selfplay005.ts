import { SeededRandom } from "../game/index.ts";
import type { PlayerCount, PlayerId } from "../game/index.ts";
import { assignedStrategyIntentsForGame, assignedTraditionsForGame, runSelfPlayGame } from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import { createInitialStrategyProfile, createV5StrategyProfile } from "./strategy.ts";
import { AI_POLICY_V5_VERSION, AI_POLICY_VERSION } from "./types.ts";
import type { V5RolloutConfig } from "./types.ts";

export interface V5PairedScenario {
  pairId: string;
  playerCount: PlayerCount;
  sequence: number;
  gameSeed: number;
  aiSeed: number;
  focalPlayerId: PlayerId;
}

export interface V5PairResult {
  pairId: string;
  playerCount: PlayerCount;
  focalPlayerId: PlayerId;
  gameSeed: number;
  aiSeed: number;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  baselineCompletedOrders: number;
  candidateCompletedOrders: number;
  completedOrderDelta: number;
  winCreditDelta: number;
  unusedFinishedDelta: number;
  candidateP95DecisionMs: number;
  oracleDecisionCount: number;
  oracleFailureCount: number;
  meanPredictedRegret: number;
  baselineTechniquesAcquired: number;
  candidateTechniquesAcquired: number;
  techniqueAcquisitionDelta: number;
  candidateTechniqueUses: number;
  illegalActionAttempts: number;
}

export interface V5CrossplaySummary {
  pairCount: number;
  gamesRun: number;
  byPlayerCount: Record<string, {
    pairs: number;
    meanScoreDelta: number;
    meanOrderDelta: number;
    winCreditDelta: number;
  }>;
  meanScoreDelta: number;
  scoreDeltaBootstrapCi95: [number, number];
  meanCompletedOrderDelta: number;
  meanWinCreditDelta: number;
  meanUnusedFinishedDelta: number;
  candidateP95DecisionMs: number;
  oracleDecisionCount: number;
  oracleFailureRate: number;
  meanPredictedRegret: number;
  techniqueAcquisitionDelta: number;
  candidateTechniqueUses: number;
  illegalActionAttempts: number;
  promotion: {
    promoted: boolean;
    gates: Record<string, boolean>;
    reasons: string[];
  };
}

export interface V5CrossplayResult {
  rolloutConfig: V5RolloutConfig;
  pairs: V5PairResult[];
  summary: V5CrossplaySummary;
}

export function buildV5PairedSchedule(
  pairsPerPlayerCount: number,
  seedOffset = 55_050,
): V5PairedScenario[] {
  const rows: V5PairedScenario[] = [];
  for (const playerCount of [2, 3, 4] as const) {
    for (let index = 0; index < pairsPerPlayerCount; index += 1) {
      const sequence = seedOffset + playerCount * 1_000 + index + 1;
      rows.push({
        pairId: `V005-${playerCount}P-${String(index + 1).padStart(3, "0")}`,
        playerCount,
        sequence,
        gameSeed: (0x5005_0000 + playerCount * 10_000 + index * 101) >>> 0,
        aiSeed: (0x5005_8000 + playerCount * 10_000 + index * 197) >>> 0,
        focalPlayerId: `P${index % playerCount + 1}`,
      });
    }
  }
  return rows;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))]!;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bootstrapCi95(values: readonly number[], samples = 5_000): [number, number] {
  if (values.length < 2) return [mean(values), mean(values)];
  const rng = new SeededRandom(0x5005_cafe);
  const means = Array.from({ length: samples }, () => mean(Array.from({ length: values.length }, () => (
    values[rng.nextInt(values.length)]!
  )))).sort((left, right) => left - right);
  return [means[Math.floor(samples * 0.025)]!, means[Math.min(samples - 1, Math.floor(samples * 0.975))]!];
}

function playerMetrics(result: SelfPlayGameResult, playerId: PlayerId) {
  const player = result.state.players[playerId]!;
  const winners = result.state.finalResult?.winnerIds ?? [];
  const decisions = result.decisions.filter((decision) => decision.playerId === playerId);
  const oracle = decisions.flatMap(({ diagnostics }) => diagnostics.oracle === null ? [] : [diagnostics.oracle]);
  const techniqueUses = result.events.filter((event) => {
    if (event.eventType !== "TECHNIQUE_USED") return false;
    return (JSON.parse(event.eventJson) as { playerId?: string }).playerId === playerId;
  }).length;
  return {
    score: result.state.finalResult?.scores[playerId]?.total ?? 0,
    orders: player.completedOrders.length,
    winCredit: winners.includes(playerId) ? 1 / Math.max(1, winners.length) : 0,
    unusedFinished: Object.values(result.state.ceramics).filter(({ ownerId, stage }) => ownerId === playerId && stage === "finished").length,
    p95DecisionMs: percentile(decisions.map(({ decisionDurationMs }) => decisionDurationMs), 0.95),
    oracleCount: oracle.length,
    oracleFailures: oracle.filter(({ fallbackReason }) => fallbackReason === "no_successful_rollout").length,
    predictedRegret: mean(oracle.filter(({ fallbackReason }) => fallbackReason === null).map(({ predictedRegret }) => predictedRegret)),
    techniques: player.techniques.length,
    techniqueUses,
  };
}

async function runPair(scenario: V5PairedScenario, rolloutConfig: V5RolloutConfig): Promise<V5PairResult> {
  const baseProfile = createInitialStrategyProfile(scenario.playerCount);
  const shared = {
    gameSequence: scenario.sequence,
    playerCount: scenario.playerCount,
    gameSeed: scenario.gameSeed,
    aiSeed: scenario.aiSeed,
    assignedTraditions: assignedTraditionsForGame(scenario.playerCount, scenario.sequence),
    assignedIntents: assignedStrategyIntentsForGame(scenario.playerCount, scenario.sequence),
    datasetSplit: "ab_evaluation" as const,
    explorationRate: 0,
    learningPhaseOverride: "mature" as const,
  };
  const baseline = await runSelfPlayGame({
    ...shared,
    gameId: `${scenario.pairId}-BASELINE`,
    profile: baseProfile,
    policyVersion: AI_POLICY_VERSION,
  });
  const candidate = await runSelfPlayGame({
    ...shared,
    gameId: `${scenario.pairId}-CANDIDATE`,
    profile: baseProfile,
    profilesByPlayer: { [scenario.focalPlayerId]: createV5StrategyProfile(scenario.playerCount) },
    policyVersionsByPlayer: { [scenario.focalPlayerId]: AI_POLICY_V5_VERSION },
    v5RolloutConfig: rolloutConfig,
  });
  const left = playerMetrics(baseline, scenario.focalPlayerId);
  const right = playerMetrics(candidate, scenario.focalPlayerId);
  return {
    pairId: scenario.pairId,
    playerCount: scenario.playerCount,
    focalPlayerId: scenario.focalPlayerId,
    gameSeed: scenario.gameSeed,
    aiSeed: scenario.aiSeed,
    baselineScore: left.score,
    candidateScore: right.score,
    scoreDelta: right.score - left.score,
    baselineCompletedOrders: left.orders,
    candidateCompletedOrders: right.orders,
    completedOrderDelta: right.orders - left.orders,
    winCreditDelta: right.winCredit - left.winCredit,
    unusedFinishedDelta: right.unusedFinished - left.unusedFinished,
    candidateP95DecisionMs: right.p95DecisionMs,
    oracleDecisionCount: right.oracleCount,
    oracleFailureCount: right.oracleFailures,
    meanPredictedRegret: right.predictedRegret,
    baselineTechniquesAcquired: left.techniques,
    candidateTechniquesAcquired: right.techniques,
    techniqueAcquisitionDelta: right.techniques - left.techniques,
    candidateTechniqueUses: right.techniqueUses,
    illegalActionAttempts: baseline.illegalActionAttempts + candidate.illegalActionAttempts,
  };
}

function summarize(pairs: readonly V5PairResult[], competencyPassed: boolean): V5CrossplaySummary {
  const deltas = pairs.map(({ scoreDelta }) => scoreDelta);
  const byPlayerCount = Object.fromEntries(([2, 3, 4] as const).map((playerCount) => {
    const selected = pairs.filter((pair) => pair.playerCount === playerCount);
    return [String(playerCount), {
      pairs: selected.length,
      meanScoreDelta: mean(selected.map(({ scoreDelta }) => scoreDelta)),
      meanOrderDelta: mean(selected.map(({ completedOrderDelta }) => completedOrderDelta)),
      winCreditDelta: mean(selected.map(({ winCreditDelta }) => winCreditDelta)),
    }];
  }));
  const ci = bootstrapCi95(deltas);
  const illegalActionAttempts = pairs.reduce((sum, pair) => sum + pair.illegalActionAttempts, 0);
  const oracleDecisionCount = pairs.reduce((sum, pair) => sum + pair.oracleDecisionCount, 0);
  const oracleFailures = pairs.reduce((sum, pair) => sum + pair.oracleFailureCount, 0);
  const latency = percentile(pairs.map(({ candidateP95DecisionMs }) => candidateP95DecisionMs), 0.95);
  const gates = {
    allGamesCompleted: pairs.length > 0,
    legalActionsOnly: illegalActionAttempts === 0,
    competenciesPassed: competencyPassed,
    meaningfulMeanVpGain: mean(deltas) >= 0.75,
    positiveBootstrapCi: ci[0] > 0,
    noPlayerCountRegression: Object.values(byPlayerCount).every(({ meanScoreDelta }) => meanScoreDelta >= -0.25),
    noOrderRegression: mean(pairs.map(({ completedOrderDelta }) => completedOrderDelta)) >= 0,
    decisionP95Under20Ms: latency < 20,
    oracleFailureBelow1Percent: oracleDecisionCount > 0 && oracleFailures / oracleDecisionCount < 0.01,
  };
  return {
    pairCount: pairs.length,
    gamesRun: pairs.length * 2,
    byPlayerCount,
    meanScoreDelta: mean(deltas),
    scoreDeltaBootstrapCi95: ci,
    meanCompletedOrderDelta: mean(pairs.map(({ completedOrderDelta }) => completedOrderDelta)),
    meanWinCreditDelta: mean(pairs.map(({ winCreditDelta }) => winCreditDelta)),
    meanUnusedFinishedDelta: mean(pairs.map(({ unusedFinishedDelta }) => unusedFinishedDelta)),
    candidateP95DecisionMs: latency,
    oracleDecisionCount,
    oracleFailureRate: oracleDecisionCount === 0 ? 1 : oracleFailures / oracleDecisionCount,
    meanPredictedRegret: mean(pairs.map(({ meanPredictedRegret }) => meanPredictedRegret)),
    techniqueAcquisitionDelta: mean(pairs.map(({ techniqueAcquisitionDelta }) => techniqueAcquisitionDelta)),
    candidateTechniqueUses: pairs.reduce((sum, pair) => sum + pair.candidateTechniqueUses, 0),
    illegalActionAttempts,
    promotion: {
      promoted: Object.values(gates).every(Boolean),
      gates,
      reasons: Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => `failed:${name}`),
    },
  };
}

export async function runV5CrossplayEvaluation(
  schedule: readonly V5PairedScenario[],
  rolloutConfig: V5RolloutConfig,
  competencyPassed: boolean,
  onProgress?: (completed: number, total: number) => void,
): Promise<V5CrossplayResult> {
  const pairs: V5PairResult[] = [];
  for (const scenario of schedule) {
    pairs.push(await runPair(scenario, rolloutConfig));
    onProgress?.(pairs.length, schedule.length);
  }
  return { rolloutConfig, pairs, summary: summarize(pairs, competencyPassed) };
}
