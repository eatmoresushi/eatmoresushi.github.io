import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  IMPERIAL_TRACK_CANDIDATE_A_CONFIG,
  IMPERIAL_TRACK_CANDIDATE_B_CONFIG,
  SeededRandom,
} from "../game/index.ts";
import type {
  GameExperimentConfig,
  GameState,
  KilnId,
  PlayerCount,
  PlayerId,
} from "../game/index.ts";
import type { AIStrategyProfile, StrategyIntent } from "./types.ts";
import { runSelfPlayGame } from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import { sha256 } from "./sourceManifest.ts";

export const IMPERIAL_TRACK_EXPERIMENT_ID = "imperial-track-ab-001" as const;
export const IMPERIAL_TRACK_POLICY_VERSION = "selfplay-003-frozen" as const;
export const IMPERIAL_TRACK_CANDIDATE_A_SIMULATION =
  "v1.0.1-imperial-track-ab-001-candidate-a" as const;
export const IMPERIAL_TRACK_CANDIDATE_B_SIMULATION =
  "v1.0.1-imperial-track-ab-001-candidate-b" as const;
export const EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH =
  "b878a436b3afbdb77ab3c285cfb9ddf69301afc29c5fb318de6276a3fa3a6972";

export const ARCHIVED_STUDY_DIRECTORY = "playtests/v1.0.1/selfplay-003";
export const ARCHIVED_GAMES_PATH = `${ARCHIVED_STUDY_DIRECTORY}/playtests_v1.0.1_games.jsonl`;
export const ARCHIVED_PROFILE_PATH = `${ARCHIVED_STUDY_DIRECTORY}/ai_strategy_v1.0.1.json`;
export const ARCHIVED_SOURCE_MANIFEST_PATH = `${ARCHIVED_STUDY_DIRECTORY}/source_manifest.json`;

export type ImperialTrackCandidate = "candidate_a" | "candidate_b";

export interface ArchivedHoldoutGame {
  config: {
    gameId: string;
    gameSequence: number;
    playerCount: PlayerCount;
    gameSeed: number;
    aiSeed: number;
    assignedTraditions: Record<PlayerId, KilnId>;
    assignedIntents: Record<PlayerId, StrategyIntent>;
    datasetSplit: "training" | "holdout";
    profile: AIStrategyProfile;
    explorationRate: number;
  };
  finalState: GameState;
  durationMs: number;
  actionCount: number;
  firingCount: number;
  strategyTagsByPlayer: Record<PlayerId, string[]>;
}

export interface FrozenProfileArtifact {
  snapshots: { frozenHoldout: Record<string, AIStrategyProfile> };
}

export interface ImperialTrackScenario {
  matchedScenarioId: string;
  archivedControlGameId: string;
  sequence: number;
  playerCount: PlayerCount;
  gameSeed: number;
  aiSeed: number;
  assignedTraditions: Record<PlayerId, KilnId>;
  assignedIntents: Record<PlayerId, StrategyIntent>;
  initialFirstPlayerId: PlayerId;
  explorationRate: number;
}

export interface HistoricalArchive {
  allGames: ArchivedHoldoutGame[];
  holdoutGames: ArchivedHoldoutGame[];
  profiles: Record<string, AIStrategyProfile>;
  profileHash: string;
  archiveHashes: Record<string, string>;
  scenarios: ImperialTrackScenario[];
}

export interface CanaryResult {
  gameId: string;
  playerCount: PlayerCount;
  sequence: number;
  pass: boolean;
  illegalActionAttempts: number;
  fullFinalStateMatch: boolean;
  finalScoresMatch: boolean;
  winnersMatch: boolean;
  completedOrderCountsMatch: boolean;
  imperialProgressMatch: boolean;
  sealOwnerMatch: boolean;
  actionCountMatch: boolean;
  firingCountMatch: boolean;
  deterministicEventSummaryMatch: boolean;
  eventSummaryHash: string;
  eventTypeCounts: Record<string, number>;
}

function frozenProfileHash(profiles: Record<string, AIStrategyProfile>): string {
  return sha256(JSON.stringify(profiles));
}

function initialFirstPlayer(gameSeed: number, playerCount: PlayerCount): PlayerId {
  return `P${new SeededRandom(gameSeed).nextInt(playerCount) + 1}`;
}

function scenarioFrom(game: ArchivedHoldoutGame): ImperialTrackScenario {
  return {
    matchedScenarioId: game.config.gameId,
    archivedControlGameId: game.config.gameId,
    sequence: game.config.gameSequence,
    playerCount: game.config.playerCount,
    gameSeed: game.config.gameSeed,
    aiSeed: game.config.aiSeed,
    assignedTraditions: game.config.assignedTraditions,
    assignedIntents: game.config.assignedIntents,
    initialFirstPlayerId: initialFirstPlayer(game.config.gameSeed, game.config.playerCount),
    explorationRate: game.config.explorationRate,
  };
}

export function configForImperialTrackCandidate(
  candidate: ImperialTrackCandidate,
): GameExperimentConfig {
  return candidate === "candidate_a"
    ? IMPERIAL_TRACK_CANDIDATE_A_CONFIG
    : IMPERIAL_TRACK_CANDIDATE_B_CONFIG;
}

export function simulationForImperialTrackCandidate(
  candidate: ImperialTrackCandidate,
): typeof IMPERIAL_TRACK_CANDIDATE_A_SIMULATION | typeof IMPERIAL_TRACK_CANDIDATE_B_SIMULATION {
  return candidate === "candidate_a"
    ? IMPERIAL_TRACK_CANDIDATE_A_SIMULATION
    : IMPERIAL_TRACK_CANDIDATE_B_SIMULATION;
}

export async function loadHistoricalArchive(projectPath: string): Promise<HistoricalArchive> {
  const gamesPayload = await readFile(resolve(projectPath, ARCHIVED_GAMES_PATH), "utf8");
  const allGames = gamesPayload.trim().split("\n").filter(Boolean).map(
    (line) => JSON.parse(line) as ArchivedHoldoutGame,
  );
  const holdoutGames = allGames.filter((game) => game.config.datasetSplit === "holdout")
    .sort((left, right) => left.config.playerCount - right.config.playerCount ||
      left.config.gameSequence - right.config.gameSequence);
  const profilePayload = await readFile(resolve(projectPath, ARCHIVED_PROFILE_PATH), "utf8");
  const artifact = JSON.parse(profilePayload) as FrozenProfileArtifact;
  const profiles = artifact.snapshots.frozenHoldout;
  const profileHash = frozenProfileHash(profiles);
  const sourceManifestPayload = await readFile(resolve(projectPath, ARCHIVED_SOURCE_MANIFEST_PATH), "utf8");
  return {
    allGames,
    holdoutGames,
    profiles,
    profileHash,
    scenarios: holdoutGames.map(scenarioFrom),
    archiveHashes: {
      [ARCHIVED_GAMES_PATH]: sha256(gamesPayload),
      [ARCHIVED_PROFILE_PATH]: sha256(profilePayload),
      [ARCHIVED_SOURCE_MANIFEST_PATH]: sha256(sourceManifestPayload),
    },
  };
}

export function validateHistoricalArchive(archive: HistoricalArchive): string[] {
  const errors: string[] = [];
  if (archive.allGames.length !== 300) errors.push(`archived game count ${archive.allGames.length} != 300`);
  if (archive.holdoutGames.length !== 150) errors.push(`holdout count ${archive.holdoutGames.length} != 150`);
  for (const playerCount of [2, 3, 4] as const) {
    const games = archive.holdoutGames.filter((game) => game.config.playerCount === playerCount);
    if (games.length !== 50) errors.push(`${playerCount}P holdout count ${games.length} != 50`);
    if (archive.profiles[String(playerCount)]?.gamesLearned !== 50) {
      errors.push(`${playerCount}P frozen profile is missing or not learned from 50 games`);
    }
    for (const game of games) {
      if (JSON.stringify(game.config.profile) !== JSON.stringify(archive.profiles[String(playerCount)])) {
        errors.push(`${game.config.gameId} does not carry the frozen ${playerCount}P profile`);
      }
      if (game.config.explorationRate !== game.config.profile.exploration.mature) {
        errors.push(`${game.config.gameId} exploration is not the frozen mature rate`);
      }
    }
  }
  if (archive.profileHash !== EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH) {
    errors.push(`frozen profile hash ${archive.profileHash} != ${EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH}`);
  }
  if (new Set(archive.scenarios.map((row) => `${row.gameSeed}:${row.aiSeed}`)).size !== 150) {
    errors.push("holdout seed pairs are not unique");
  }
  return errors;
}

function finalOrderCounts(state: GameState): Record<PlayerId, number> {
  return Object.fromEntries(state.playerOrder.map((id) => [id, state.players[id]!.completedOrders.length]));
}

function finalProgress(state: GameState): Record<PlayerId, number> {
  return Object.fromEntries(state.playerOrder.map((id) => [id, state.players[id]!.imperialProgress]));
}

function eventSummary(result: SelfPlayGameResult): {
  hash: string;
  counts: Record<string, number>;
} {
  const counts: Record<string, number> = {};
  for (const event of result.events) counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
  return {
    hash: sha256(JSON.stringify(result.events.map(({ round, eventType, eventJson }) => ({
      round,
      eventType,
      event: JSON.parse(eventJson),
    })))),
    counts,
  };
}

async function replayArchivedDefault(game: ArchivedHoldoutGame): Promise<SelfPlayGameResult> {
  return runSelfPlayGame({
    ...game.config,
    gameId: game.config.gameId,
    datasetSplit: "holdout",
    learningPhaseOverride: "mature",
    // Deliberately omit experimentConfig: this is the production-default gate.
  });
}

export async function runHistoricalCanaries(
  archive: HistoricalArchive,
): Promise<CanaryResult[]> {
  const selected = [2, 3, 4].flatMap((playerCount) => archive.holdoutGames
    .filter((game) => game.config.playerCount === playerCount)
    .slice(0, 4));
  const rows: CanaryResult[] = [];
  for (const archived of selected) {
    const first = await replayArchivedDefault(archived);
    const second = await replayArchivedDefault(archived);
    const firstSummary = eventSummary(first);
    const secondSummary = eventSummary(second);
    const checks = {
      fullFinalStateMatch: JSON.stringify(first.state) === JSON.stringify(archived.finalState),
      finalScoresMatch: JSON.stringify(first.state.finalResult?.scores) === JSON.stringify(archived.finalState.finalResult?.scores),
      winnersMatch: JSON.stringify(first.state.finalResult?.winnerIds) === JSON.stringify(archived.finalState.finalResult?.winnerIds),
      completedOrderCountsMatch: JSON.stringify(finalOrderCounts(first.state)) === JSON.stringify(finalOrderCounts(archived.finalState)),
      imperialProgressMatch: JSON.stringify(finalProgress(first.state)) === JSON.stringify(finalProgress(archived.finalState)),
      sealOwnerMatch: first.state.imperialSealOwnerId === archived.finalState.imperialSealOwnerId,
      actionCountMatch: first.actions.length === archived.actionCount,
      firingCountMatch: first.firings.length === archived.firingCount,
      deterministicEventSummaryMatch: firstSummary.hash === secondSummary.hash,
    };
    rows.push({
      gameId: archived.config.gameId,
      playerCount: archived.config.playerCount,
      sequence: archived.config.gameSequence,
      pass: first.illegalActionAttempts === 0 && second.illegalActionAttempts === 0 &&
        Object.values(checks).every(Boolean),
      illegalActionAttempts: first.illegalActionAttempts + second.illegalActionAttempts,
      ...checks,
      eventSummaryHash: firstSummary.hash,
      eventTypeCounts: firstSummary.counts,
    });
  }
  return rows;
}
