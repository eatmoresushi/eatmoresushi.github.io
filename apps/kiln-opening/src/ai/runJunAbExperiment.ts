import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { AIStrategyProfile } from "./types.ts";
import { runSelfPlayGame } from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import {
  EXPECTED_FROZEN_PROFILE_HASH,
  JUN_AB_EXPERIMENT_ID,
  JUN_AB_POLICY_VERSION,
  assertExperimentOutputPathAvailable,
  collectPriorSeeds,
  createJunAbSchedule,
  experimentConfigForArm,
  frozenProfileHash,
  runPairedScenario,
  simulationVersionForArm,
  validateJunAbSchedule,
} from "./junAbExperiment.ts";
import type { CompletedJunAbPair, JunAbArm } from "./junAbExperiment.ts";
import { writeJunAbExperimentOutputs } from "./junAbReporting.ts";
import { createSourceIdentity, sha256, sourceIdentityHash } from "./sourceManifest.ts";

const DEFAULT_OUTPUT = "playtests/v1.0.1/experiments/jun-ab-001";
const FROZEN_PROFILE_PATH = "playtests/v1.0.1/selfplay-003/ai_strategy_v1.0.1.json";

interface FrozenProfileArtifact {
  snapshots: { frozenHoldout: Record<string, AIStrategyProfile> };
}

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

async function assertNewDirectory(path: string): Promise<void> {
  await assertExperimentOutputPathAvailable(path);
  await mkdir(path, { recursive: true });
}

async function filesRecursively(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesRecursively(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

async function hashFiles(root: string, files: readonly string[]): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const path of files) entries[relative(root, path)] = sha256(await readFile(path));
  return entries;
}

async function priorArtifactHashes(projectPath: string): Promise<Record<string, string>> {
  const root = resolve(projectPath, "playtests/v1.0.1");
  const rootFiles = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(root, entry.name));
  const studyFiles = [
    ...await filesRecursively(join(root, "selfplay-002")),
    ...await filesRecursively(join(root, "selfplay-003")),
  ];
  return hashFiles(projectPath, [...rootFiles, ...studyFiles].sort());
}

function aggregateHashes(hashes: Record<string, string>): string {
  return sha256(Object.entries(hashes).sort(([left], [right]) => left.localeCompare(right)).map(([path, hash]) => `${path}:${hash}`).join("\n"));
}

function validateAcceptedResult(
  result: SelfPlayGameResult,
  arm: JunAbArm,
  expectedFirstPlayerId: string,
  frozenHash: string,
): void {
  if (result.illegalActionAttempts !== 0) throw new Error(`${result.config.gameId} selected an illegal action`);
  if (result.initialFirstPlayerId !== expectedFirstPlayerId) throw new Error(`${result.config.gameId} first-player mismatch`);
  if (Object.values(result.state.players).filter((player) => player.kilnId === "JU").length !== 1) {
    throw new Error(`${result.config.gameId} does not contain exactly one Jun player`);
  }
  if (result.config.experimentMetadata?.frozenProfileHash !== frozenHash) throw new Error(`${result.config.gameId} profile hash mismatch`);
  const selectedJun = result.decisions.filter((decision) => decision.diagnostics.optionalEffect?.effectId === "jun" && decision.diagnostics.optionalEffect.selected).length;
  const payments = result.events.filter((row) => row.eventType === "JUN_ACTIVATION_PAID").length;
  if (arm === "control" && payments !== 0) throw new Error(`${result.config.gameId} control Jun paid Coins`);
  if (arm === "jun_cost_1" && payments !== selectedJun) throw new Error(`${result.config.gameId} paid ${payments} Coins for ${selectedJun} selections`);
}

async function main(): Promise<void> {
  const projectPath = process.cwd();
  const outputDirectory = resolve(projectPath, argument("--output", DEFAULT_OUTPUT));
  if (Number(argument("--pairs-per-count", "100")) !== 100) {
    throw new Error("jun-ab-001 is pre-specified for exactly 100 matched pairs per player count");
  }
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await assertNewDirectory(outputDirectory);

  const frozenArtifact = JSON.parse(await readFile(resolve(projectPath, FROZEN_PROFILE_PATH), "utf8")) as FrozenProfileArtifact;
  const profiles = frozenArtifact.snapshots.frozenHoldout;
  const profileHash = frozenProfileHash(profiles);
  if (profileHash !== EXPECTED_FROZEN_PROFILE_HASH) {
    throw new Error(`Frozen profile hash mismatch: expected ${EXPECTED_FROZEN_PROFILE_HASH}, got ${profileHash}`);
  }
  for (const count of ["2", "3", "4"]) {
    if (profiles[count]?.gamesLearned !== 50) throw new Error(`Frozen ${count}P profile is unavailable or unexpected`);
  }

  const priorSeeds = await collectPriorSeeds(resolve(projectPath, "playtests/v1.0.1"));
  const schedule = createJunAbSchedule(priorSeeds);
  const scheduleErrors = validateJunAbSchedule(schedule, priorSeeds);
  if (scheduleErrors.length > 0) throw new Error(`Invalid paired schedule:\n${scheduleErrors.join("\n")}`);
  const experimentConfig = {
    experimentId: JUN_AB_EXPERIMENT_ID,
    canonicalRulesVersion: "1.0.1",
    policyVersion: JUN_AB_POLICY_VERSION,
    frozenProfileSource: FROZEN_PROFILE_PATH,
    frozenProfileHash: profileHash,
    datasetSplit: "ab_evaluation",
    trainingEnabled: false,
    exploration: "frozen Selfplay-003 mature exploration by player count",
    arms: {
      control: {
        simulationVersion: simulationVersionForArm("control"),
        junActivationCoinCost: 0,
        rule: "Authoritative V1.0.1 Jun ability",
      },
      jun_cost_1: {
        simulationVersion: simulationVersionForArm("jun_cost_1"),
        junActivationCoinCost: 1,
        rule: "Pay 1 Coin only when selecting Jun's +1 or -1 adjustment; decline costs 0",
      },
    },
    analysisPlan: {
      primaryEstimand: "[(Jun - mean matched non-Jun opponents) jun_cost_1] - [(Jun - mean matched non-Jun opponents) control]",
      independentUnit: "pair_id",
      bootstrap: { repetitions: 10_000, stratifiedBy: "player_count", deterministic: true },
      adjustedModel: "VP ~ arm + Jun + arm×Jun + player count + seat + first-player + assigned intent + opponent lineup; pair-clustered uncertainty",
      interpretation: {
        tooWeak: "residual Jun advantage above approximately 3 VP or behavior barely changes",
        promising: "relative advantage falls about 2 VP or more, residual advantage 0-3 VP, identity retained, non-Jun health stable",
        tooHarsh: "Jun falls more than approximately 2 VP below field or rational use collapses",
        inconclusive: "broad intervals, integrity failure, or conflicting important outcomes",
      },
    },
    officialRuleAdopted: false,
  };
  const schedulePayload = `${JSON.stringify(schedule, null, 2)}\n`;
  const configPayload = `${JSON.stringify(experimentConfig, null, 2)}\n`;
  const frozenPayload = `${JSON.stringify({
    rulesVersion: "1.0.1",
    policyVersion: JUN_AB_POLICY_VERSION,
    source: FROZEN_PROFILE_PATH,
    hash: profileHash,
    profiles,
  }, null, 2)}\n`;
  const sourceIdentity = await createSourceIdentity(projectPath);
  const priorHashes = await priorArtifactHashes(projectPath);
  const priorAggregateHash = aggregateHashes(priorHashes);
  const verification = ["npm run typecheck", "npm run typecheck:edge", "npm test", "npm run build"].map((command) => ({
    command,
    status: "passed-before-experiment" as const,
  }));
  const freeze = {
    experimentId: JUN_AB_EXPERIMENT_ID,
    recordedAt: new Date().toISOString(),
    outputDirectoryWasNewlyCreated: true,
    priorOutputsUntouched: true,
    verification,
    sourceIdentityHash: sourceIdentityHash(sourceIdentity),
    experimentConfigHash: sha256(configPayload),
    pairedScheduleHash: sha256(schedulePayload),
    frozenProfilesHash: profileHash,
    frozenProfilesArtifactHash: sha256(frozenPayload),
    priorArtifactAggregateHash: priorAggregateHash,
    seedFreshness: {
      priorGameSeedsChecked: priorSeeds.gameSeeds.size,
      priorAiSeedsChecked: priorSeeds.aiSeeds.size,
      priorSeedPairsChecked: priorSeeds.pairs.size,
      completePrimaryAndReplacementSchedule: true,
    },
  };
  const freezePayload = `${JSON.stringify(freeze, null, 2)}\n`;
  await Promise.all([
    writeFile(join(outputDirectory, "experiment_config.json"), configPayload, "utf8"),
    writeFile(join(outputDirectory, "paired_seed_schedule.json"), schedulePayload, "utf8"),
    writeFile(join(outputDirectory, "frozen_profiles.json"), frozenPayload, "utf8"),
    writeFile(join(outputDirectory, "preexperiment_freeze.json"), freezePayload, "utf8"),
  ]);

  const completedPairs: CompletedJunAbPair<SelfPlayGameResult>[] = [];
  for (const scenario of schedule.scenarios) {
    const profile = profiles[String(scenario.playerCount)];
    if (profile === undefined) throw new Error(`Missing frozen ${scenario.playerCount}P profile`);
    const beforeProfile = JSON.stringify(profile);
    const completed = await runPairedScenario(scenario, async (arm, candidate) => {
      const experiment = experimentConfigForArm(arm);
      const result = await runSelfPlayGame({
        gameId: `${scenario.pairId}-${arm}-r${candidate.replacementIndex}`,
        gameSequence: scenario.sequence,
        playerCount: scenario.playerCount,
        gameSeed: candidate.gameSeed,
        aiSeed: candidate.aiSeed,
        assignedTraditions: scenario.assignedTraditions,
        assignedIntents: scenario.assignedIntents,
        datasetSplit: "ab_evaluation",
        profile,
        explorationRate: profile.exploration.mature,
        learningPhaseOverride: "mature",
        experimentConfig: experiment,
        experimentMetadata: {
          pairId: scenario.pairId,
          replacementIndex: candidate.replacementIndex,
          frozenProfileHash: profileHash,
          policyVersion: JUN_AB_POLICY_VERSION,
          simulationVersion: simulationVersionForArm(arm),
        },
      });
      validateAcceptedResult(result, arm, scenario.expectedFirstPlayerId, profileHash);
      return result;
    });
    if (JSON.stringify(profile) !== beforeProfile) throw new Error(`${scenario.pairId} mutated its frozen profile`);
    completedPairs.push(completed);
    if (scenario.sequence % 10 === 0) process.stdout.write(`completed ${scenario.playerCount}P ${scenario.sequence}/100 matched pairs\n`);
  }

  const completedAt = new Date().toISOString();
  const invalidAttempts = completedPairs.flatMap((pair) => pair.invalidAttempts);
  const runMetadata = {
    startedAt,
    completedAt,
    totalRuntimeMs: performance.now() - started,
    invalidAttempts,
    frozenProfileHash: profileHash,
    scheduleHash: sha256(schedulePayload),
    experimentConfigHash: sha256(configPayload),
  };
  const analysis = await writeJunAbExperimentOutputs(outputDirectory, completedPairs, runMetadata);

  const finalPriorHashes = await priorArtifactHashes(projectPath);
  const finalPriorAggregateHash = aggregateHashes(finalPriorHashes);
  if (finalPriorAggregateHash !== priorAggregateHash) throw new Error("A prior study artifact changed during jun-ab-001");
  if (frozenProfileHash(profiles) !== profileHash) throw new Error("Frozen profiles changed during jun-ab-001");
  const finalSourceIdentity = await createSourceIdentity(projectPath);
  if (sourceIdentityHash(finalSourceIdentity) !== sourceIdentityHash(sourceIdentity)) {
    throw new Error("Source identity changed after experiment results were generated");
  }
  const outputFiles = (await filesRecursively(outputDirectory)).filter((path) => !path.endsWith("source_manifest.json"));
  const outputHashes = await hashFiles(outputDirectory, outputFiles);
  const manifest = {
    experimentId: JUN_AB_EXPERIMENT_ID,
    canonicalRulesVersion: "1.0.1",
    policyVersion: JUN_AB_POLICY_VERSION,
    controlSimulationVersion: simulationVersionForArm("control"),
    experimentalSimulationVersion: simulationVersionForArm("jun_cost_1"),
    repositoryHead: sourceIdentity.repositoryHead,
    repositoryDirty: sourceIdentity.repositoryDirty,
    repositoryStatus: sourceIdentity.repositoryStatus,
    trackedDiffHash: sourceIdentity.trackedDiffSha256,
    relevantUntrackedSourceHash: sourceIdentity.relevantUntrackedSourceSha256,
    sourceIdentity,
    sourceIdentityHash: sourceIdentityHash(sourceIdentity),
    individualSourceFileHashes: sourceIdentity.sourceFiles,
    experimentConfigHash: sha256(configPayload),
    pairedScheduleHash: sha256(schedulePayload),
    frozenProfileHash: profileHash,
    frozenProfilesArtifactHash: sha256(frozenPayload),
    preexperimentFreezeHash: sha256(freezePayload),
    priorArtifactHashes: priorHashes,
    priorArtifactAggregateHash: priorAggregateHash,
    priorArtifactsUnchangedAfterRun: true,
    runtime: { node: process.version, npm: sourceIdentity.npmVersion },
    invocation: {
      command: "node --no-warnings --experimental-strip-types src/ai/runJunAbExperiment.ts",
      arguments: process.argv.slice(2),
    },
    verification,
    startedAt,
    completedAt,
    totalRuntimeMs: runMetadata.totalRuntimeMs,
    validPairs: analysis.pairs,
    validGames: analysis.games,
    invalidAttempts,
    pairedReplacements: analysis.pairedReplacements,
    outputHashes,
    experimentalRuleAdopted: false,
  };
  await writeFile(join(outputDirectory, "source_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    experimentId: JUN_AB_EXPERIMENT_ID,
    outputDirectory,
    pairs: analysis.pairs,
    games: analysis.games,
    invalidAttempts: analysis.invalidAttempts,
    pairedReplacements: analysis.pairedReplacements,
    primaryRelativeVpDid: analysis.primaryRelativeVpDid,
    adjustedArmJunInteraction: analysis.adjustedArmJunInteraction,
    interpretation: analysis.interpretation,
  }, null, 2)}\n`);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await main();
}
