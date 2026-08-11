import type { PlayerCount } from "../game/index.ts";
import { publicStateFingerprint } from "./beliefState.ts";
import {
  oracleSupports,
  publicLeafValue,
  simulatePublicBeliefTrajectory,
  stableActionKey,
} from "./decisionOracle.ts";
import { createPlayerObservation } from "./observation.ts";
import { rankV5BaseCandidates } from "./rolloutPolicy.ts";
import {
  assignedStrategyIntentsForGame,
  assignedTraditionsForGame,
  runSelfPlayGame,
} from "./selfplay.ts";
import type { SelfPlayDecisionSnapshot } from "./selfplay.ts";
import { createInitialStrategyProfile, createV6StrategyProfile } from "./strategy.ts";
import type { V6LeafTrainingExample } from "./v6LeafModel.ts";
import {
  extractV6LeafFeatures,
  realizedV6Outcome,
} from "./v6LeafModel.ts";

export interface V6TrainingGenerationConfig {
  rootWidth: number;
  samplesPerAction: number;
  maximumTrajectoryDecisions: number;
}

export interface V6TrainingGenerationResult {
  examples: V6LeafTrainingExample[];
  trajectoriesRequested: number;
  trajectoriesCompleted: number;
  trajectoriesFailed: number;
}

export interface V6TrainingSplit {
  training: V6LeafTrainingExample[];
  holdout: V6LeafTrainingExample[];
  trainingGameIds: string[];
  holdoutGameIds: string[];
}

/** Captures an equal quota of V1.0.2 public decisions at each player count. */
export async function collectV6PublicDecisionStates(
  maximumPerPlayerCount = 8,
  gamesPerPlayerCount = 3,
): Promise<SelfPlayDecisionSnapshot[]> {
  const captured: SelfPlayDecisionSnapshot[] = [];
  const fingerprints = new Set<string>();
  const phasePriority = [
    "work",
    "work_office_orders",
    "orders",
    "work_guild",
    "firing_before_contribution",
    "firing_after_fire_reveal",
    "firing_before_quality",
    "firing_after_quality",
    "firing_after_firing",
    "work_office_sale",
    "work_office_connoisseur",
    "presentation",
  ];
  for (const playerCount of [2, 3, 4] as const) {
    const pool: SelfPlayDecisionSnapshot[] = [];
    const poolPhaseCounts = new Map<string, number>();
    for (let gameIndex = 0; gameIndex < gamesPerPlayerCount; gameIndex += 1) {
      const sequence = 60_600 + playerCount * 100 + gameIndex;
      await runSelfPlayGame({
        gameId: `V006-LEAF-CAPTURE-${playerCount}-${gameIndex + 1}`,
        gameSequence: sequence,
        playerCount,
        gameSeed: (0x6006_1000 + sequence * 31) >>> 0,
        aiSeed: (0x6006_2000 + sequence * 67) >>> 0,
        assignedTraditions: assignedTraditionsForGame(playerCount, sequence),
        assignedIntents: assignedStrategyIntentsForGame(playerCount, sequence),
        profile: createInitialStrategyProfile(playerCount),
        explorationRate: 0,
        decisionObserver: (snapshot) => {
          if (!oracleSupports(snapshot.observation)) return;
          if (snapshot.observation.rulesVersion !== "1.0.2" || snapshot.legalActions.length < 2) return;
          const fingerprint = publicStateFingerprint(snapshot.observation);
          if (fingerprints.has(fingerprint)) return;
          const phase = snapshot.observation.game.phase.type;
          const poolKey = `${snapshot.gameId}:${phase}`;
          if ((poolPhaseCounts.get(poolKey) ?? 0) >= 3) return;
          fingerprints.add(fingerprint);
          poolPhaseCounts.set(poolKey, (poolPhaseCounts.get(poolKey) ?? 0) + 1);
          pool.push(snapshot);
        },
      });
    }
    const phaseGroups = new Map<string, SelfPlayDecisionSnapshot[]>();
    for (const snapshot of pool) {
      const phase = snapshot.observation.game.phase.type;
      phaseGroups.set(phase, [...phaseGroups.get(phase) ?? [], snapshot]);
    }
    const phases = [...phaseGroups.keys()].sort((left, right) => {
      const leftPriority = phasePriority.indexOf(left);
      const rightPriority = phasePriority.indexOf(right);
      return (leftPriority < 0 ? phasePriority.length : leftPriority) -
        (rightPriority < 0 ? phasePriority.length : rightPriority) || left.localeCompare(right);
    });
    const selectedByGame = new Map<string, number>();
    const perGameLimit = Math.ceil(maximumPerPlayerCount / gamesPerPlayerCount);
    let added = true;
    while (captured.filter(({ observation }) => observation.game.playerCount === playerCount).length < maximumPerPlayerCount && added) {
      added = false;
      for (const phase of phases) {
        const group = phaseGroups.get(phase);
        if (group === undefined) continue;
        const index = group.findIndex(({ gameId }) => (selectedByGame.get(gameId) ?? 0) < perGameLimit);
        if (index < 0) continue;
        const [snapshot] = group.splice(index, 1);
        if (snapshot === undefined) continue;
        captured.push(snapshot);
        selectedByGame.set(snapshot.gameId, (selectedByGame.get(snapshot.gameId) ?? 0) + 1);
        added = true;
        if (captured.filter(({ observation }) => observation.game.playerCount === playerCount).length >= maximumPerPlayerCount) break;
      }
    }
  }
  return captured;
}

export function splitV6TrainingExamples(examples: readonly V6LeafTrainingExample[]): V6TrainingSplit {
  const holdoutGameIds = new Set<string>();
  for (const playerCount of [2, 3, 4] as const) {
    const gameIds = [...new Set(examples.filter((row) => row.playerCount === playerCount).map(({ sourceGameId }) => sourceGameId))].sort();
    if (gameIds.length > 1) holdoutGameIds.add(gameIds[gameIds.length - 1]!);
  }
  const training = examples.filter(({ sourceGameId }) => !holdoutGameIds.has(sourceGameId));
  const holdout = examples.filter(({ sourceGameId }) => holdoutGameIds.has(sourceGameId));
  return {
    training,
    holdout,
    trainingGameIds: [...new Set(training.map(({ sourceGameId }) => sourceGameId))].sort(),
    holdoutGameIds: [...holdoutGameIds].sort(),
  };
}

export function summarizeV6ObservationCoverage(observations: readonly SelfPlayDecisionSnapshot[]) {
  return {
    total: observations.length,
    byPlayerCount: Object.fromEntries(([2, 3, 4] as const).map((playerCount) => [
      String(playerCount),
      observations.filter(({ observation }) => observation.game.playerCount === playerCount).length,
    ])),
    byPhase: Object.fromEntries([...new Set(observations.map(({ observation }) => observation.game.phase.type))]
      .sort()
      .map((phase) => [phase, observations.filter(({ observation }) => observation.game.phase.type === phase).length])),
  };
}

export async function generateV6LeafTrainingExamples(
  observations: readonly SelfPlayDecisionSnapshot[],
  config: V6TrainingGenerationConfig,
  onProgress?: (completed: number, total: number) => void,
): Promise<V6TrainingGenerationResult> {
  const examples: V6LeafTrainingExample[] = [];
  const candidateRows = observations.map((snapshot) => {
    const profile = createV6StrategyProfile(snapshot.observation.game.playerCount);
    const ranked = rankV5BaseCandidates(snapshot.observation, snapshot.legalActions, snapshot.context, profile).scored;
    return { snapshot, profile, candidates: ranked.slice(0, Math.max(1, config.rootWidth)) };
  });
  const trajectoriesRequested = candidateRows.reduce((sum, row) => sum + row.candidates.length * config.samplesPerAction, 0);
  let trajectoriesCompleted = 0;
  let trajectoriesFailed = 0;
  let processed = 0;
  for (let observationIndex = 0; observationIndex < candidateRows.length; observationIndex += 1) {
    const row = candidateRows[observationIndex]!;
    const fingerprint = publicStateFingerprint(row.snapshot.observation);
    for (let sampleIndex = 0; sampleIndex < config.samplesPerAction; sampleIndex += 1) {
      const commonSeed = (0x6006_5000 + observationIndex * 7_919) >>> 0;
      for (const candidate of row.candidates) {
        const trajectory = simulatePublicBeliefTrajectory(
          row.snapshot.observation,
          candidate.action,
          row.profile,
          commonSeed,
          sampleIndex,
          config.maximumTrajectoryDecisions,
        );
        processed += 1;
        if (trajectory === null || !trajectory.completed) {
          trajectoriesFailed += 1;
          onProgress?.(processed, trajectoriesRequested);
          continue;
        }
        trajectoriesCompleted += 1;
        const outcome = realizedV6Outcome(trajectory.terminalState, row.snapshot.observation.playerId);
        const candidateActionKey = stableActionKey(candidate.action);
        for (const checkpoint of trajectory.checkpoints) {
          const leafObservation = createPlayerObservation(
            checkpoint.state,
            row.snapshot.observation.playerId,
            checkpoint.privateState,
          );
          examples.push({
            sourceGameId: row.snapshot.gameId,
            playerCount: row.snapshot.observation.game.playerCount,
            publicStateFingerprint: fingerprint,
            groupId: `${fingerprint}:${sampleIndex}:${checkpoint.kind}`,
            candidateActionKey,
            sampleIndex,
            checkpoint: checkpoint.kind,
            decisionsToCheckpoint: checkpoint.decisionsApplied,
            features: extractV6LeafFeatures(leafObservation),
            handcraftedValue: publicLeafValue(
              checkpoint.state,
              checkpoint.privateState,
              row.snapshot.observation.playerId,
              row.profile,
            ),
            outcome,
            target: outcome.target,
          });
        }
        onProgress?.(processed, trajectoriesRequested);
      }
    }
  }
  return { examples, trajectoriesRequested, trajectoriesCompleted, trajectoriesFailed };
}

export function observationPlayerCounts(
  observations: readonly SelfPlayDecisionSnapshot[],
): Record<PlayerCount, number> {
  return Object.fromEntries(([2, 3, 4] as const).map((playerCount) => [
    playerCount,
    observations.filter(({ observation }) => observation.game.playerCount === playerCount).length,
  ])) as Record<PlayerCount, number>;
}
