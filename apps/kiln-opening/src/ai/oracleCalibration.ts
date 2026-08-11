import type { PlayerCount } from "../game/index.ts";
import { publicStateFingerprint } from "./beliefState.ts";
import { evaluateDecisionOracle, oracleSupports } from "./decisionOracle.ts";
import { rankV5BaseCandidates } from "./rolloutPolicy.ts";
import {
  assignedStrategyIntentsForGame,
  assignedTraditionsForGame,
  runSelfPlayGame,
} from "./selfplay.ts";
import type { SelfPlayDecisionSnapshot } from "./selfplay.ts";
import { createInitialStrategyProfile, createV5StrategyProfile } from "./strategy.ts";
import type {
  OracleActionEstimate,
  V5RolloutConfig,
} from "./types.ts";

export const V5_CALIBRATION_CANDIDATES = {
  base_guarded: {
    rootWidth: 2,
    samplesPerAction: 1,
    horizonDecisions: 1,
    rolloutWeight: 0.9,
    baseScoreWeight: 0.55,
    maxOracleActions: 2,
    baseScoreConfidenceMargin: 3,
  },
  balanced: {
    rootWidth: 2,
    samplesPerAction: 1,
    horizonDecisions: 1,
    rolloutWeight: 1.25,
    baseScoreWeight: 0.38,
    maxOracleActions: 2,
    baseScoreConfidenceMargin: 3,
  },
  rollout_heavy: {
    rootWidth: 2,
    samplesPerAction: 1,
    horizonDecisions: 1,
    rolloutWeight: 1.55,
    baseScoreWeight: 0.22,
    maxOracleActions: 2,
    baseScoreConfidenceMargin: 3,
  },
  wider_balanced: {
    rootWidth: 3,
    samplesPerAction: 1,
    horizonDecisions: 1,
    rolloutWeight: 1.25,
    baseScoreWeight: 0.32,
    maxOracleActions: 3,
    baseScoreConfidenceMargin: 3,
  },
} as const satisfies Record<string, V5RolloutConfig>;

export const V5_DEEP_ORACLE_CONFIG: V5RolloutConfig = {
  rootWidth: 4,
  samplesPerAction: 4,
  horizonDecisions: 5,
  rolloutWeight: 1,
  baseScoreWeight: 0,
  maxOracleActions: 4,
  baseScoreConfidenceMargin: 0,
};

export interface OracleCandidateCalibration {
  id: string;
  config: V5RolloutConfig;
  observations: number;
  bestActionMatches: number;
  bestActionMatchRate: number;
  targetCoverageRate: number;
  averageTargetRegret: number;
  p95DurationMs: number;
  failedRolloutRate: number;
  objective: number;
}

export interface OracleCalibrationRecord {
  publicStateFingerprint: string;
  playerCount: PlayerCount;
  phase: string;
  legalActionCount: number;
  targetBestActionKey: string;
  targetBestValue: number;
  targetEstimates: OracleActionEstimate[];
  candidates: Array<{
    id: string;
    selectedActionKey: string;
    targetRegret: number;
    matchedTargetBest: boolean;
    targetInCandidateSet: boolean;
    durationMs: number;
    failedSamples: number;
    totalSamples: number;
  }>;
}

export interface OracleCalibrationResult {
  selectedId: string;
  selectedConfig: V5RolloutConfig;
  candidates: OracleCandidateCalibration[];
  records: OracleCalibrationRecord[];
}

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))]!;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function actionKey(action: { type: string }): string {
  return JSON.stringify(action);
}

export async function collectPublicOracleObservations(
  maximum = 24,
  gamesPerPlayerCount = 2,
): Promise<SelfPlayDecisionSnapshot[]> {
  const captured: SelfPlayDecisionSnapshot[] = [];
  const fingerprints = new Set<string>();
  const phaseCounts = new Map<string, number>();
  for (const playerCount of [2, 3, 4] as const) {
    for (let gameIndex = 0; gameIndex < gamesPerPlayerCount; gameIndex += 1) {
      const sequence = 50_500 + playerCount * 100 + gameIndex;
      await runSelfPlayGame({
        gameId: `V005-ORACLE-CAPTURE-${playerCount}-${gameIndex + 1}`,
        gameSequence: sequence,
        playerCount,
        gameSeed: (0x5005_1000 + sequence * 31) >>> 0,
        aiSeed: (0x5005_2000 + sequence * 67) >>> 0,
        assignedTraditions: assignedTraditionsForGame(playerCount, sequence),
        assignedIntents: assignedStrategyIntentsForGame(playerCount, sequence),
        profile: createInitialStrategyProfile(playerCount),
        explorationRate: 0,
        decisionObserver: (snapshot) => {
          if (captured.length >= maximum || !oracleSupports(snapshot.observation) || snapshot.legalActions.length < 2) return;
          if (new Set(snapshot.legalActions.map(({ type }) => type)).size < 2) return;
          const fingerprint = publicStateFingerprint(snapshot.observation);
          if (fingerprints.has(fingerprint)) return;
          const phase = snapshot.observation.game.phase.type;
          const phaseKey = `${playerCount}:${phase}`;
          const phaseLimit = Math.max(2, Math.ceil(maximum / 15));
          if ((phaseCounts.get(phaseKey) ?? 0) >= phaseLimit) return;
          fingerprints.add(fingerprint);
          phaseCounts.set(phaseKey, (phaseCounts.get(phaseKey) ?? 0) + 1);
          captured.push(snapshot);
        },
      });
    }
  }
  return captured.slice(0, maximum);
}

export function calibrateV5Oracle(
  observations: readonly SelfPlayDecisionSnapshot[],
  candidates: Readonly<Record<string, V5RolloutConfig>> = V5_CALIBRATION_CANDIDATES,
): OracleCalibrationResult {
  const records: OracleCalibrationRecord[] = [];
  observations.forEach((snapshot, observationIndex) => {
    const profile = createV5StrategyProfile(snapshot.observation.game.playerCount);
    const ranked = rankV5BaseCandidates(snapshot.observation, snapshot.legalActions, snapshot.context, profile).scored;
    const target = evaluateDecisionOracle(
      snapshot.observation,
      ranked,
      profile,
      V5_DEEP_ORACLE_CONFIG,
      0x5005_5000 + observationIndex,
    );
    const targetSuccessful = target.estimates.filter(({ successfulSamples }) => successfulSamples > 0);
    if (targetSuccessful.length === 0) return;
    const targetBest = [...targetSuccessful].sort((left, right) => right.rolloutMean - left.rolloutMean || actionKey(left.action).localeCompare(actionKey(right.action)))[0]!;
    const targetByAction = new Map(targetSuccessful.map((estimate) => [actionKey(estimate.action), estimate.rolloutMean]));
    const candidateRows: OracleCalibrationRecord["candidates"] = [];
    for (const [id, config] of Object.entries(candidates)) {
      const started = performance.now();
      const evaluated = evaluateDecisionOracle(
        snapshot.observation,
        ranked,
        profile,
        config,
        0x5005_6000 + observationIndex,
      );
      const durationMs = performance.now() - started;
      const selected = evaluated.estimates[0];
      if (selected === undefined) continue;
      const selectedKey = actionKey(selected.action);
      const selectedTarget = targetByAction.get(selectedKey);
      const targetRegret = selectedTarget === undefined
        ? Math.max(2, targetBest.rolloutMean + 2)
        : Math.max(0, targetBest.rolloutMean - selectedTarget);
      const failedSamples = evaluated.estimates.reduce((sum, estimate) => sum + estimate.failedSamples, 0);
      const totalSamples = evaluated.estimates.reduce((sum, estimate) => sum + estimate.failedSamples + estimate.successfulSamples, 0);
      candidateRows.push({
        id,
        selectedActionKey: selectedKey,
        targetRegret,
        matchedTargetBest: selectedKey === actionKey(targetBest.action),
        targetInCandidateSet: evaluated.estimates.some(({ action }) => actionKey(action) === actionKey(targetBest.action)),
        durationMs,
        failedSamples,
        totalSamples,
      });
    }
    records.push({
      publicStateFingerprint: publicStateFingerprint(snapshot.observation),
      playerCount: snapshot.observation.game.playerCount,
      phase: snapshot.observation.game.phase.type,
      legalActionCount: snapshot.legalActions.length,
      targetBestActionKey: actionKey(targetBest.action),
      targetBestValue: targetBest.rolloutMean,
      targetEstimates: target.estimates,
      candidates: candidateRows,
    });
  });
  const summaries = Object.entries(candidates).map(([id, config]): OracleCandidateCalibration => {
    const rows = records.flatMap((record) => record.candidates.filter((candidate) => candidate.id === id));
    const matches = rows.filter(({ matchedTargetBest }) => matchedTargetBest).length;
    const failed = rows.reduce((sum, row) => sum + row.failedSamples, 0);
    const total = rows.reduce((sum, row) => sum + row.totalSamples, 0);
    const averageTargetRegret = mean(rows.map(({ targetRegret }) => targetRegret));
    const bestActionMatchRate = rows.length === 0 ? 0 : matches / rows.length;
    const targetCoverageRate = rows.length === 0 ? 0 : rows.filter(({ targetInCandidateSet }) => targetInCandidateSet).length / rows.length;
    const p95DurationMs = percentile(rows.map(({ durationMs }) => durationMs), 0.95);
    const failedRolloutRate = total === 0 ? 1 : failed / total;
    const objective = averageTargetRegret + (1 - bestActionMatchRate) * 0.35 + (1 - targetCoverageRate) * 0.5 +
      Math.max(0, p95DurationMs - 20) * 0.1 + failedRolloutRate * 5;
    return {
      id,
      config,
      observations: rows.length,
      bestActionMatches: matches,
      bestActionMatchRate,
      targetCoverageRate,
      averageTargetRegret,
      p95DurationMs,
      failedRolloutRate,
      objective,
    };
  }).sort((left, right) => left.objective - right.objective || left.id.localeCompare(right.id));
  const selected = summaries[0];
  if (selected === undefined) throw new Error("V005 calibration produced no candidate result");
  return { selectedId: selected.id, selectedConfig: selected.config, candidates: summaries, records };
}
