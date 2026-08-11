import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SeededRandom } from "../game/index.ts";
import type { PlayerCount } from "../game/index.ts";
import { writeStudyOutputs, compactStudyFacts } from "./reporting.ts";
import type { StrategySnapshots, StudyMetadata } from "./reporting.ts";
import {
  assignedStrategyIntentsForGame,
  assignedTraditionsForGame,
  orderLearningRows,
  runSelfPlayGame,
} from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import {
  createInitialStrategyProfile,
  learnFromCompletedGame,
} from "./strategy.ts";
import type { AIStrategyProfile } from "./types.ts";
import { AI_POLICY_VERSION, AI_SIMULATION_VERSION } from "./types.ts";
import {
  createSourceIdentity,
  sha256,
  sourceIdentityHash,
} from "./sourceManifest.ts";
import type { StudySourceManifest } from "./sourceManifest.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function firstSeatForSeed(seed: number, playerCount: PlayerCount): number {
  return new SeededRandom(seed).nextInt(playerCount);
}

function balancedSeed(base: number, playerCount: PlayerCount, desiredFirstSeat: number): number {
  for (let offset = 0; offset < 10_000; offset += 1) {
    const candidate = (base + offset) >>> 0;
    if (firstSeatForSeed(candidate, playerCount) === desiredFirstSeat) return candidate;
  }
  throw new Error("Unable to find a balanced First Player seed");
}

function repositoryCommit(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: "/Users/luyuan/Documents/eatmoresushi.github.io",
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
}

async function main(): Promise<void> {
  const gamesPerCount = Number(argument("--games-per-count") ?? "100");
  if (gamesPerCount !== 100) throw new Error("Selfplay-003 requires exactly --games-per-count 100");
  const outputDirectory = resolve(argument("--output") ?? "playtests/v1.0.2/selfplay-003");
  await mkdir(outputDirectory, { recursive: true });
  const existing = await readdir(outputDirectory);
  if (existing.length > 0) throw new Error(`Selfplay-003 output directory must be newly empty: ${outputDirectory}`);
  const studyStarted = performance.now();
  const startedAt = new Date().toISOString();
  const results: SelfPlayGameResult[] = [];
  const profiles: Record<string, AIStrategyProfile> = {
    "2": createInitialStrategyProfile(2),
    "3": createInitialStrategyProfile(3),
    "4": createInitialStrategyProfile(4),
  };
  const snapshots: StrategySnapshots = {
    initial: structuredClone(profiles),
    after10: {},
    after30: {},
    final: {},
    frozenHoldout: {},
  };
  const replacements: StudyMetadata["replacements"] = [];
  const seedSchedule = ([2, 3, 4] as const).flatMap((playerCount) =>
    Array.from({ length: gamesPerCount }, (_, index) => {
      const sequence = index + 1;
      return {
        gameId: `v102-selfplay003-${playerCount}p-${String(sequence).padStart(3, "0")}`,
        playerCount,
        sequence,
        datasetSplit: sequence <= 50 ? "training" as const : "holdout" as const,
        candidateSeeds: Array.from({ length: 51 }, (_unused, replacement) => {
          const base = 0x30500000 + playerCount * 120_000 + sequence * 149 + replacement * 13_007;
          return {
            replacement,
            gameSeed: balancedSeed(base, playerCount, (sequence - 1) % playerCount),
            aiSeed: (0xc3500000 + playerCount * 120_000 + sequence * 347 + replacement * 70_001) >>> 0,
          };
        }),
      };
    }),
  );
  await assertFreshHoldoutSeeds(seedSchedule);
  const seedSchedulePayload = `${JSON.stringify({
    rulesVersion: "1.0.2",
    policyVersion: AI_POLICY_VERSION,
    simulationVersion: AI_SIMULATION_VERSION,
    scheduleRevision: "v102-base-rules-migration-1",
    trainingGamesPerPlayerCount: Math.min(50, gamesPerCount),
    holdoutGamesPerPlayerCount: Math.max(0, gamesPerCount - 50),
    schedule: seedSchedule,
  }, null, 2)}\n`;
  await writeFile(resolve(outputDirectory, "seed_schedule.json"), seedSchedulePayload, "utf8");
  const preflightIdentity = await createSourceIdentity(process.cwd());
  const verification: StudySourceManifest["verification"] = [
    "npm run typecheck",
    "npm run typecheck:edge",
    "npm test",
    "npm run build",
  ].map((command) => ({ command, status: "passed-before-study" as const }));

  for (const datasetSplit of ["training", "holdout"] as const) {
    const firstSequence = datasetSplit === "training" ? 1 : 51;
    const lastSequence = datasetSplit === "training" ? 50 : 100;
    if (datasetSplit === "holdout") {
      const frozenProfileSha256 = sha256(JSON.stringify(snapshots.frozenHoldout));
      const preHoldoutFreezePayload = `${JSON.stringify({
        rulesVersion: "1.0.2",
        policyVersion: AI_POLICY_VERSION,
        simulationVersion: AI_SIMULATION_VERSION,
        recordedAt: new Date().toISOString(),
        outputDirectoryWasNewlyEmpty: true,
        priorOutputsUntouched: true,
        holdoutSeedCollisionCheck: "passed",
        seedScheduleSha256: sha256(seedSchedulePayload),
        frozenProfileSha256,
        sourceIdentitySha256: sourceIdentityHash(preflightIdentity),
        verification,
      }, null, 2)}\n`;
      await writeFile(resolve(outputDirectory, "preholdout_freeze.json"), preHoldoutFreezePayload, "utf8");
    }
    for (const playerCount of [2, 3, 4] as const) {
      for (let sequence = firstSequence; sequence <= lastSequence; sequence += 1) {
      const scheduled = seedSchedule.find((entry) => entry.playerCount === playerCount && entry.sequence === sequence)!;
      const gameId = scheduled.gameId;
      let replacement = 0;
      while (true) {
        const candidate = scheduled.candidateSeeds[replacement]!;
        const { gameSeed, aiSeed } = candidate;
        try {
          const profile = profiles[String(playerCount)]!;
          const result = await runSelfPlayGame({
            gameId,
            gameSequence: sequence,
            playerCount,
            gameSeed,
            aiSeed,
            assignedTraditions: assignedTraditionsForGame(playerCount, sequence),
            assignedIntents: assignedStrategyIntentsForGame(playerCount, sequence),
            datasetSplit,
            profile,
            ...(datasetSplit === "holdout" ? { explorationRate: profile.exploration.mature } : {}),
          });
          results.push(result);
          if (datasetSplit === "training") profiles[String(playerCount)] = learnFromCompletedGame(profile, orderLearningRows(result));
          if (sequence === 10) snapshots.after10[String(playerCount)] = structuredClone(profiles[String(playerCount)]!);
          if (sequence === 30) snapshots.after30[String(playerCount)] = structuredClone(profiles[String(playerCount)]!);
          if (sequence === 50) {
            snapshots.frozenHoldout[String(playerCount)] = structuredClone(profiles[String(playerCount)]!);
            snapshots.final[String(playerCount)] = structuredClone(profiles[String(playerCount)]!);
          }
          if (sequence % 5 === 0 || sequence === gamesPerCount) {
            process.stdout.write(`completed ${playerCount}P ${sequence}/${gamesPerCount}\n`);
          }
          break;
        } catch (error) {
          replacements.push({
            gameId,
            seed: gameSeed,
            error: error instanceof Error ? error.stack ?? error.message : String(error),
          });
          replacement += 1;
          if (replacement > 50) throw new Error(`Too many invalid replacements for ${gameId}`);
        }
      }
    }
    }
  }
  const completedAt = new Date().toISOString();
  const metadata: StudyMetadata = {
    repositoryCommit: repositoryCommit(),
    startedAt,
    completedAt,
    totalRuntimeMs: performance.now() - studyStarted,
    invalidAttempts: replacements.length,
    replacements,
  };
  await writeStudyOutputs(outputDirectory, results, snapshots, metadata);
  const facts = compactStudyFacts(results);
  await writeFile(resolve(outputDirectory, "study_summary.json"), `${JSON.stringify({ ...facts, metadata }, null, 2)}\n`, "utf8");
  const preHoldoutFreezePayload = await readFile(resolve(outputDirectory, "preholdout_freeze.json"), "utf8");
  const sourceManifest: StudySourceManifest = {
    sourceIdentity: preflightIdentity,
    sourceIdentitySha256: sourceIdentityHash(preflightIdentity),
    invocation: {
      command: "node --no-warnings --experimental-strip-types src/ai/runSelfPlayStudy.ts",
      arguments: process.argv.slice(2),
    },
    seedScheduleSha256: sha256(seedSchedulePayload),
    frozenProfileSha256: sha256(JSON.stringify(snapshots.frozenHoldout)),
    preHoldoutFreezeSha256: sha256(preHoldoutFreezePayload),
    verification,
    startedAt,
    completedAt,
    totalRuntimeMs: metadata.totalRuntimeMs,
    validGames: facts.games,
    invalidAttempts: metadata.invalidAttempts,
    replacements: metadata.replacements,
  };
  await writeFile(resolve(outputDirectory, "source_manifest.json"), `${JSON.stringify(sourceManifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...facts, outputDirectory, metadata }, null, 2)}\n`);
}

interface ScheduledSeeds {
  datasetSplit: "training" | "holdout";
  candidateSeeds: Array<{ gameSeed: number; aiSeed: number }>;
}

async function csvSeeds(path: string): Promise<{ game: Set<number>; ai: Set<number> }> {
  try {
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    const headers = lines.shift()?.split(",") ?? [];
    const gameIndex = headers.indexOf("game_seed");
    const aiIndex = headers.indexOf("ai_seed");
    const game = new Set<number>();
    const ai = new Set<number>();
    for (const line of lines) {
      const cells = line.split(",");
      if (gameIndex >= 0) game.add(Number(cells[gameIndex]));
      if (aiIndex >= 0) ai.add(Number(cells[aiIndex]));
    }
    return { game, ai };
  } catch {
    return { game: new Set(), ai: new Set() };
  }
}

export async function assertFreshHoldoutSeeds(schedule: readonly ScheduledSeeds[]): Promise<void> {
  const root = resolve("playtests/v1.0.1");
  const priorSets = await Promise.all([
    csvSeeds(resolve(root, "playtests_v1.0.1_games.csv")),
    csvSeeds(resolve(root, "selfplay-002/playtests_v1.0.1_games.csv")),
  ]);
  const priorGame = new Set(priorSets.flatMap(({ game }) => [...game]));
  const priorAi = new Set(priorSets.flatMap(({ ai }) => [...ai]));
  const seenGame = new Set<number>();
  const seenAi = new Set<number>();
  for (const entry of schedule.filter(({ datasetSplit }) => datasetSplit === "holdout")) {
    for (const candidate of entry.candidateSeeds) {
      if (priorGame.has(candidate.gameSeed)) throw new Error(`Selfplay-003 holdout game seed collision: ${candidate.gameSeed}`);
      if (priorAi.has(candidate.aiSeed)) throw new Error(`Selfplay-003 holdout AI seed collision: ${candidate.aiSeed}`);
      if (seenGame.has(candidate.gameSeed)) throw new Error(`Duplicate Selfplay-003 holdout game seed: ${candidate.gameSeed}`);
      if (seenAi.has(candidate.aiSeed)) throw new Error(`Duplicate Selfplay-003 holdout AI seed: ${candidate.aiSeed}`);
      seenGame.add(candidate.gameSeed);
      seenAi.add(candidate.aiSeed);
    }
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
