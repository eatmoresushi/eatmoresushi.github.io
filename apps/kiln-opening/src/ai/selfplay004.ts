import type { PlayerCount, PlayerId } from "../game/index.ts";
import { assignedStrategyIntentsForGame, assignedTraditionsForGame, runSelfPlayGame } from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import { createInitialStrategyProfile, createV4StrategyProfile } from "./strategy.ts";
import { strategicScenarioCoverage } from "./strategicScenarios.ts";
import { AI_POLICY_V4_VERSION, AI_POLICY_VERSION } from "./types.ts";
import type { V4SearchConfig } from "./types.ts";

export interface V4PairedScenario {
  pairId: string;
  playerCount: PlayerCount;
  sequence: number;
  gameSeed: number;
  aiSeed: number;
  focalPlayerId: PlayerId;
}

export interface V4PairResult {
  pairId: string;
  playerCount: PlayerCount;
  focalPlayerId: PlayerId;
  gameSeed: number;
  aiSeed: number;
  baselineGameId: string;
  candidateGameId: string;
  baselineScore: number;
  candidateScore: number;
  scoreDelta: number;
  baselineCompletedOrders: number;
  candidateCompletedOrders: number;
  completedOrderDelta: number;
  baselineWinCredit: number;
  candidateWinCredit: number;
  winCreditDelta: number;
  baselineUnusedFinished: number;
  candidateUnusedFinished: number;
  unusedFinishedDelta: number;
  candidateP95DecisionMs: number;
  illegalActionAttempts: number;
}

export interface V4CrossplaySummary {
  pairCount: number;
  gamesRun: number;
  byPlayerCount: Record<string, { pairs: number; meanScoreDelta: number; meanOrderDelta: number; winCreditDelta: number }>;
  meanScoreDelta: number;
  scoreDeltaCi95: [number, number];
  meanCompletedOrderDelta: number;
  meanWinCreditDelta: number;
  meanUnusedFinishedDelta: number;
  candidateP95DecisionMs: number;
  illegalActionAttempts: number;
  promotion: {
    promoted: boolean;
    gates: Record<string, boolean>;
    reasons: string[];
  };
}

export interface V4CrossplayResult {
  searchConfig: V4SearchConfig;
  pairs: V4PairResult[];
  summary: V4CrossplaySummary;
}

export interface V4TournamentResult {
  candidates: Array<{ id: string; score: number; result: V4CrossplayResult }>;
  selectedId: string;
  selectedConfig: V4SearchConfig;
}

export function buildV4PairedSchedule(
  pairsPerPlayerCount: number,
  seedOffset = 40_040,
): V4PairedScenario[] {
  const schedule: V4PairedScenario[] = [];
  for (const playerCount of [2, 3, 4] as const) {
    for (let index = 0; index < pairsPerPlayerCount; index += 1) {
      const sequence = seedOffset + playerCount * 1_000 + index + 1;
      schedule.push({
        pairId: `V004-${playerCount}P-${String(index + 1).padStart(3, "0")}`,
        playerCount,
        sequence,
        gameSeed: (0x4004_0000 + playerCount * 10_000 + index * 97) >>> 0,
        aiSeed: (0x4004_8000 + playerCount * 10_000 + index * 193) >>> 0,
        focalPlayerId: `P${index % playerCount + 1}`,
      });
    }
  }
  return schedule;
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))]!;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceInterval95(values: readonly number[]): [number, number] {
  if (values.length < 2) return [mean(values), mean(values)];
  const average = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  const margin = 1.96 * Math.sqrt(variance / values.length);
  return [average - margin, average + margin];
}

function playerMetrics(result: SelfPlayGameResult, playerId: PlayerId) {
  const player = result.state.players[playerId]!;
  const final = result.state.finalResult;
  const winners = final?.winnerIds ?? [];
  return {
    score: final?.scores[playerId]?.total ?? 0,
    orders: player.completedOrders.length,
    winCredit: winners.includes(playerId) ? 1 / Math.max(1, winners.length) : 0,
    unusedFinished: Object.values(result.state.ceramics).filter(({ ownerId, stage }) => ownerId === playerId && stage === "finished").length,
    decisionMs: result.decisions.filter((decision) => decision.playerId === playerId).map(({ decisionDurationMs }) => decisionDurationMs),
  };
}

async function runPair(scenario: V4PairedScenario, searchConfig: V4SearchConfig): Promise<V4PairResult> {
  const profile = createInitialStrategyProfile(scenario.playerCount);
  const traditions = assignedTraditionsForGame(scenario.playerCount, scenario.sequence);
  const intents = assignedStrategyIntentsForGame(scenario.playerCount, scenario.sequence);
  const shared = {
    gameSequence: scenario.sequence,
    playerCount: scenario.playerCount,
    gameSeed: scenario.gameSeed,
    aiSeed: scenario.aiSeed,
    assignedTraditions: traditions,
    assignedIntents: intents,
    datasetSplit: "ab_evaluation" as const,
    explorationRate: 0,
    learningPhaseOverride: "mature" as const,
  };
  const baseline = await runSelfPlayGame({
    ...shared,
    gameId: `${scenario.pairId}-BASELINE`,
    profile,
    policyVersion: AI_POLICY_VERSION,
  });
  const candidateProfile = createV4StrategyProfile(scenario.playerCount);
  const candidate = await runSelfPlayGame({
    ...shared,
    gameId: `${scenario.pairId}-CANDIDATE`,
    profile,
    profilesByPlayer: { [scenario.focalPlayerId]: candidateProfile },
    policyVersionsByPlayer: { [scenario.focalPlayerId]: AI_POLICY_V4_VERSION },
    v4SearchConfig: searchConfig,
  });
  const left = playerMetrics(baseline, scenario.focalPlayerId);
  const right = playerMetrics(candidate, scenario.focalPlayerId);
  return {
    pairId: scenario.pairId,
    playerCount: scenario.playerCount,
    focalPlayerId: scenario.focalPlayerId,
    gameSeed: scenario.gameSeed,
    aiSeed: scenario.aiSeed,
    baselineGameId: baseline.config.gameId,
    candidateGameId: candidate.config.gameId,
    baselineScore: left.score,
    candidateScore: right.score,
    scoreDelta: right.score - left.score,
    baselineCompletedOrders: left.orders,
    candidateCompletedOrders: right.orders,
    completedOrderDelta: right.orders - left.orders,
    baselineWinCredit: left.winCredit,
    candidateWinCredit: right.winCredit,
    winCreditDelta: right.winCredit - left.winCredit,
    baselineUnusedFinished: left.unusedFinished,
    candidateUnusedFinished: right.unusedFinished,
    unusedFinishedDelta: right.unusedFinished - left.unusedFinished,
    candidateP95DecisionMs: percentile(right.decisionMs, 0.95),
    illegalActionAttempts: baseline.illegalActionAttempts + candidate.illegalActionAttempts,
  };
}

function summarize(pairs: readonly V4PairResult[]): V4CrossplaySummary {
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
  const ci = confidenceInterval95(deltas);
  const coverage = strategicScenarioCoverage();
  const illegalActionAttempts = pairs.reduce((sum, pair) => sum + pair.illegalActionAttempts, 0);
  const latency = percentile(pairs.map(({ candidateP95DecisionMs }) => candidateP95DecisionMs), 0.95);
  const gates = {
    allGamesCompleted: pairs.length > 0,
    legalActionsOnly: illegalActionAttempts === 0,
    fullStrategicCatalog: coverage.missingTechniqueIds.length === 0 && coverage.missingKilnIds.length === 0,
    positiveMeanScore: mean(deltas) > 0,
    positivePairedCi: ci[0] > 0,
    noOrderRegression: mean(pairs.map(({ completedOrderDelta }) => completedOrderDelta)) >= 0,
    decisionP95Under20Ms: latency < 20,
  };
  const reasons = Object.entries(gates).filter(([, passed]) => !passed).map(([name]) => `failed:${name}`);
  return {
    pairCount: pairs.length,
    gamesRun: pairs.length * 2,
    byPlayerCount,
    meanScoreDelta: mean(deltas),
    scoreDeltaCi95: ci,
    meanCompletedOrderDelta: mean(pairs.map(({ completedOrderDelta }) => completedOrderDelta)),
    meanWinCreditDelta: mean(pairs.map(({ winCreditDelta }) => winCreditDelta)),
    meanUnusedFinishedDelta: mean(pairs.map(({ unusedFinishedDelta }) => unusedFinishedDelta)),
    candidateP95DecisionMs: latency,
    illegalActionAttempts,
    promotion: {
      promoted: Object.values(gates).every(Boolean),
      gates,
      reasons,
    },
  };
}

export async function runV4CrossplayEvaluation(
  schedule: readonly V4PairedScenario[],
  searchConfig: V4SearchConfig,
  onProgress?: (completed: number, total: number) => void,
): Promise<V4CrossplayResult> {
  const pairs: V4PairResult[] = [];
  for (const scenario of schedule) {
    pairs.push(await runPair(scenario, searchConfig));
    onProgress?.(pairs.length, schedule.length);
  }
  return { searchConfig, pairs, summary: summarize(pairs) };
}

export async function tuneV4Search(
  schedule: readonly V4PairedScenario[],
  candidates: Readonly<Record<string, V4SearchConfig>>,
  onProgress?: (candidateId: string, completed: number, total: number) => void,
): Promise<V4TournamentResult> {
  const results: V4TournamentResult["candidates"] = [];
  for (const [id, config] of Object.entries(candidates)) {
    const result = await runV4CrossplayEvaluation(schedule, config, (completed, total) => onProgress?.(id, completed, total));
    const score = result.summary.meanScoreDelta +
      result.summary.meanCompletedOrderDelta * 1.5 +
      result.summary.meanWinCreditDelta * 2 -
      Math.max(0, result.summary.meanUnusedFinishedDelta) * 0.5;
    results.push({ id, score, result });
  }
  results.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const selected = results[0];
  if (selected === undefined) throw new Error("V004 tuning requires at least one search candidate");
  return { candidates: results, selectedId: selected.id, selectedConfig: selected.result.searchConfig };
}
