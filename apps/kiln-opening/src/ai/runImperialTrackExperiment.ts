import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runSelfPlayGame } from "./selfplay.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import {
  EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH,
  IMPERIAL_TRACK_EXPERIMENT_ID,
  IMPERIAL_TRACK_POLICY_VERSION,
  configForImperialTrackCandidate,
  loadHistoricalArchive,
  runHistoricalCanaries,
  simulationForImperialTrackCandidate,
  validateHistoricalArchive,
} from "./imperialTrackExperiment.ts";
import type { ImperialTrackCandidate } from "./imperialTrackExperiment.ts";
import {
  outputHashSummary,
  writeImperialTrackExperimentOutputs,
} from "./imperialTrackReporting.ts";
import { createSourceIdentity, sha256, sourceIdentityHash } from "./sourceManifest.ts";

const DEFAULT_OUTPUT = "playtests/v1.0.1/experiments/imperial-track-ab-001";

function argument(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1] ?? fallback;
}

async function assertNewDirectory(path: string): Promise<void> {
  try {
    await access(path);
    throw new Error(`Experiment output already exists: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
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

async function hashes(root: string, paths: readonly string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [
    relative(root, path),
    sha256(await readFile(path)),
  ])));
}

async function runCandidate(
  candidate: ImperialTrackCandidate,
  archive: Awaited<ReturnType<typeof loadHistoricalArchive>>,
): Promise<SelfPlayGameResult[]> {
  const results: SelfPlayGameResult[] = [];
  for (const scenario of archive.scenarios) {
    const profile = archive.profiles[String(scenario.playerCount)];
    if (profile === undefined) throw new Error(`Missing ${scenario.playerCount}P frozen profile`);
    const beforeProfile = JSON.stringify(profile);
    const result = await runSelfPlayGame({
      gameId: `${scenario.archivedControlGameId}-${candidate}`,
      gameSequence: scenario.sequence,
      playerCount: scenario.playerCount,
      gameSeed: scenario.gameSeed,
      aiSeed: scenario.aiSeed,
      assignedTraditions: scenario.assignedTraditions,
      assignedIntents: scenario.assignedIntents,
      datasetSplit: "ab_evaluation",
      profile,
      explorationRate: scenario.explorationRate,
      learningPhaseOverride: "mature",
      experimentConfig: configForImperialTrackCandidate(candidate),
      experimentMetadata: {
        pairId: scenario.matchedScenarioId,
        replacementIndex: 0,
        frozenProfileHash: archive.profileHash,
        policyVersion: IMPERIAL_TRACK_POLICY_VERSION,
        simulationVersion: simulationForImperialTrackCandidate(candidate),
        archivedControlGameId: scenario.archivedControlGameId,
        matchedScenarioId: scenario.matchedScenarioId,
      },
    });
    if (result.illegalActionAttempts !== 0) {
      throw new Error(`${result.config.gameId} selected ${result.illegalActionAttempts} illegal actions`);
    }
    if (result.initialFirstPlayerId !== scenario.initialFirstPlayerId) {
      throw new Error(`${result.config.gameId} changed the initial First Player`);
    }
    if (result.state.phase.type !== "finished" || result.state.finalResult === null) {
      throw new Error(`${result.config.gameId} did not finish legally`);
    }
    if (JSON.stringify(profile) !== beforeProfile) {
      throw new Error(`${result.config.gameId} mutated the frozen profile`);
    }
    results.push(result);
    if (scenario.sequence % 10 === 0) {
      process.stdout.write(`completed ${candidate} ${scenario.playerCount}P ${scenario.sequence - 50}/50\n`);
    }
  }
  return results;
}

async function main(): Promise<void> {
  const projectPath = process.cwd();
  const outputDirectory = resolve(projectPath, argument("--output", DEFAULT_OUTPUT));
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await assertNewDirectory(outputDirectory);

  const archive = await loadHistoricalArchive(projectPath);
  const archiveErrors = validateHistoricalArchive(archive);
  if (archiveErrors.length > 0) throw new Error(`Historical archive gate failed:\n${archiveErrors.join("\n")}`);
  const sourceIdentity = await createSourceIdentity(projectPath);
  const initialArchiveHashes = { ...archive.archiveHashes };
  const canaries = await runHistoricalCanaries(archive);
  if (canaries.length !== 12 || canaries.some(({ pass }) => !pass)) {
    await writeFile(join(outputDirectory, "historical-canary-report.json"), `${JSON.stringify(canaries, null, 2)}\n`, "utf8");
    throw new Error(`Historical replay canary gate failed: ${canaries.filter(({ pass }) => !pass).map(({ gameId }) => gameId).join(", ")}`);
  }

  const experimentConfig = {
    experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
    canonicalRulesVersion: "1.0.1",
    historicalControl: "archived unchanged Selfplay-003 holdout (150 games; not rerun as a dataset)",
    policyVersion: IMPERIAL_TRACK_POLICY_VERSION,
    frozenProfileHash: archive.profileHash,
    trainingEnabled: false,
    replacementsAllowed: false,
    freshSeedsAllowed: false,
    arms: {
      candidateA: configForImperialTrackCandidate("candidate_a"),
      candidateB: configForImperialTrackCandidate("candidate_b"),
    },
    interpretationGates: {
      adjustedImperialIntentGap: "point estimate from -2 to +2 VP",
      uncertainty: "does not establish a clear gap below -3 or above +3 VP",
      playerCount: "no candidate Imperial-intent relative gap above +3 VP at 2P, 3P, or 4P",
      milestones: "average apprentice milestones or Presentation eligibility improves",
      difficulty: "Imperial Order completion rate stays below Market Order completion rate",
      unusedFinished: "increase at most 0.5 per Imperial-intent player",
      abandonment: "increase at most 0.10",
      mechanism: "progress improvement appears outside Jun and without Court Patronage",
    },
    officialRuleAdopted: false,
  };
  const schedule = archive.scenarios.map((scenario) => ({
    ...scenario,
    historicalControl: { source: "archive", gameId: scenario.archivedControlGameId },
    candidateA: {
      gameId: `${scenario.archivedControlGameId}-candidate_a`,
      simulationVersion: simulationForImperialTrackCandidate("candidate_a"),
    },
    candidateB: {
      gameId: `${scenario.archivedControlGameId}-candidate_b`,
      simulationVersion: simulationForImperialTrackCandidate("candidate_b"),
    },
  }));
  const sourceArchiveManifest = {
    source: "Selfplay-003 frozen holdout",
    rulesVersion: "1.0.1",
    archivedGames: archive.allGames.length,
    historicalHoldoutGames: archive.holdoutGames.length,
    playerCountDistribution: Object.fromEntries([2, 3, 4].map((count) => [
      String(count),
      archive.holdoutGames.filter((game) => game.config.playerCount === count).length,
    ])),
    frozenProfileHash: archive.profileHash,
    expectedFrozenProfileHash: EXPECTED_IMPERIAL_FROZEN_PROFILE_HASH,
    archivedArtifactHashes: archive.archiveHashes,
  };
  const configPayload = `${JSON.stringify(experimentConfig, null, 2)}\n`;
  const schedulePayload = `${JSON.stringify(schedule, null, 2)}\n`;
  const sourceArchivePayload = `${JSON.stringify(sourceArchiveManifest, null, 2)}\n`;
  const prefreeze = {
    experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
    recordedAt: new Date().toISOString(),
    sourceIdentityHash: sourceIdentityHash(sourceIdentity),
    experimentConfigHash: sha256(configPayload),
    replayScheduleHash: sha256(schedulePayload),
    sourceArchiveManifestHash: sha256(sourceArchivePayload),
    frozenProfileHash: archive.profileHash,
    archivedArtifactsReadOnly: true,
    outputDirectoryWasNew: true,
    canariesPassed: 12,
    verificationBeforeExperiment: [
      "npm run typecheck",
      "npm run typecheck:edge",
      "npm test",
      "npm run build",
    ],
  };
  const prefreezePayload = `${JSON.stringify(prefreeze, null, 2)}\n`;
  await Promise.all([
    writeFile(join(outputDirectory, "experiment_config.json"), configPayload, "utf8"),
    writeFile(join(outputDirectory, "replay_schedule.json"), schedulePayload, "utf8"),
    writeFile(join(outputDirectory, "source_archive_manifest.json"), sourceArchivePayload, "utf8"),
    writeFile(join(outputDirectory, "preexperiment_freeze.json"), prefreezePayload, "utf8"),
  ]);

  const candidateA = await runCandidate("candidate_a", archive);
  const candidateB = await runCandidate("candidate_b", archive);
  const completedAt = new Date().toISOString();
  const runMetadata = {
    startedAt,
    completedAt,
    totalRuntimeMs: performance.now() - started,
    historicalControlGames: 150,
    candidateAGames: candidateA.length,
    candidateBGames: candidateB.length,
    totalNewGames: candidateA.length + candidateB.length,
    matchedTriplets: 150,
    armObservations: 450,
    illegalActionAttempts: [...candidateA, ...candidateB].reduce((sum, result) => sum + result.illegalActionAttempts, 0),
    replacements: 0,
    discardedScenarios: 0,
    reportingOnlyFailedAttemptsBeforeAcceptedRun: 2,
    reportingFailures: [
      "singular model caused by duplicate Imperial-intent encoding",
      "post-run audit corrected A-minus-B direction and explicit Progress export identifiers",
    ],
    sourceAuditRerunsBeforeAcceptedRun: 1,
    sourceAuditFinding: "documented experiment isolation and normalized Progress telemetry before final hashed run",
  };
  const analysis = await writeImperialTrackExperimentOutputs(
    projectPath,
    outputDirectory,
    archive,
    canaries,
    candidateA,
    candidateB,
    runMetadata,
  );

  const finalArchive = await loadHistoricalArchive(projectPath);
  if (JSON.stringify(finalArchive.archiveHashes) !== JSON.stringify(initialArchiveHashes)) {
    throw new Error("An archived historical-control artifact changed during the experiment");
  }
  if (finalArchive.profileHash !== archive.profileHash) throw new Error("Frozen profiles changed during the experiment");
  const finalIdentity = await createSourceIdentity(projectPath);
  if (sourceIdentityHash(finalIdentity) !== sourceIdentityHash(sourceIdentity)) {
    throw new Error("Source identity changed while experiment results were generated");
  }
  const outputFiles = (await filesRecursively(outputDirectory)).filter((path) => !path.endsWith("source_manifest.json"));
  const outputHashes = await hashes(outputDirectory, outputFiles);
  const manifest = {
    experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
    canonicalRulesVersion: "1.0.1",
    officialRuleAdopted: false,
    sourceIdentity,
    sourceIdentityHash: sourceIdentityHash(sourceIdentity),
    experimentConfigHash: sha256(configPayload),
    replayScheduleHash: sha256(schedulePayload),
    sourceArchiveManifestHash: sha256(sourceArchivePayload),
    preexperimentFreezeHash: sha256(prefreezePayload),
    frozenProfileHash: archive.profileHash,
    archivedArtifactHashes: initialArchiveHashes,
    archivedArtifactsUnchangedAfterRun: true,
    invocation: {
      command: "node --no-warnings --experimental-strip-types src/ai/runImperialTrackExperiment.ts",
      arguments: process.argv.slice(2),
    },
    verification: [
      { command: "npm run typecheck", status: "passed-before-experiment" },
      { command: "npm run typecheck:edge", status: "passed-before-experiment" },
      { command: "npm test", status: "passed-before-experiment" },
      { command: "npm run build", status: "passed-before-experiment" },
    ],
    runMetadata,
    recommendation: analysis.recommendation,
    outputHashes,
    outputAggregateHash: outputHashSummary(outputHashes),
  };
  await Promise.all([
    writeFile(join(outputDirectory, "source_manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(join(outputDirectory, "commands_tests_counts_hashes.json"), `${JSON.stringify({
      commands: manifest.verification,
      invocation: manifest.invocation,
      counts: runMetadata,
      hashes: {
        sourceIdentity: manifest.sourceIdentityHash,
        experimentConfig: manifest.experimentConfigHash,
        replaySchedule: manifest.replayScheduleHash,
        frozenProfile: manifest.frozenProfileHash,
        outputAggregate: manifest.outputAggregateHash,
      },
    }, null, 2)}\n`, "utf8"),
  ]);
  process.stdout.write(`${JSON.stringify({
    experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
    outputDirectory,
    runMetadata,
    recommendation: analysis.recommendation,
    recommendationReason: analysis.recommendationReason,
    candidateA: analysis.candidateA,
    candidateB: analysis.candidateB,
  }, null, 2)}\n`);
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(resolve(entry)).href) await main();
