import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildV6PairedSchedule, runV6CrossplayEvaluation, V6_RUNTIME_ROLLOUT_CONFIG } from "./selfplay006.ts";
import type { V6PairResult } from "./selfplay006.ts";
import {
  collectV6PublicDecisionStates,
  generateV6LeafTrainingExamples,
  splitV6TrainingExamples,
  summarizeV6ObservationCoverage,
} from "./v6Training.ts";
import {
  fitV6LeafModel,
  validateV6LeafModel,
} from "./v6LeafModel.ts";
import { AI_POLICY_V6_VERSION, AI_POLICY_VERSION, AI_SIMULATION_V6_VERSION } from "./types.ts";

const quick = process.argv.includes("--quick");
const outputDirectory = resolve("playtests/v1.0.2/selfplay-006");
const observationsPerPlayerCount = quick ? 6 : 12;
const captureGamesPerPlayerCount = quick ? 2 : 4;
const samplesPerAction = quick ? 2 : 4;
const rootWidth = 3;
const evaluationPairsPerPlayerCount = quick ? 2 : 30;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonLines(values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n") + "\n";
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pairsCsv(pairs: readonly V6PairResult[]): string {
  const keys = Object.keys(pairs[0] ?? {}) as Array<keyof V6PairResult>;
  return [keys.join(","), ...pairs.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n";
}

async function historicalV5Audit() {
  const path = resolve("playtests/v1.0.1/selfplay-005/oracle_observations.jsonl");
  try {
    const lines = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
    const parsed = lines.map((line) => JSON.parse(line) as {
      observation?: { rulesVersion?: string; game?: { phase?: { type?: string } } };
    });
    return {
      path,
      found: true,
      observations: parsed.length,
      rulesVersions: [...new Set(parsed.map(({ observation }) => observation?.rulesVersion ?? "unknown"))].sort(),
      phases: [...new Set(parsed.map(({ observation }) => observation?.game?.phase?.type ?? "unknown"))].sort(),
      usedForFinalFit: false,
      reason: "Historical V1.0.1 states validate the pipeline schema but cannot calibrate V1.0.2 incentives.",
    };
  } catch (error) {
    return {
      path,
      found: false,
      observations: 0,
      rulesVersions: [],
      phases: [],
      usedForFinalFit: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function reportMarkdown(
  modelId: string,
  coverage: ReturnType<typeof summarizeV6ObservationCoverage>,
  generated: Awaited<ReturnType<typeof generateV6LeafTrainingExamples>>,
  split: ReturnType<typeof splitV6TrainingExamples>,
  trainingMetrics: ReturnType<typeof validateV6LeafModel>,
  holdoutMetrics: ReturnType<typeof validateV6LeafModel>,
  evaluation: Awaited<ReturnType<typeof runV6CrossplayEvaluation>>,
  leafValidationPassed: boolean,
): string {
  const summary = evaluation.summary;
  const countRows = ([2, 3, 4] as const).map((playerCount) => {
    const row = summary.byPlayerCount[String(playerCount)]!;
    return `| ${playerCount} | ${row.pairs} | ${row.meanScoreDelta.toFixed(3)} | ${row.meanOrderDelta.toFixed(3)} | ${row.winCreditDelta.toFixed(3)} |`;
  }).join("\n");
  return `# Kiln Opening Selfplay-006 ${quick ? "Quick Trial" : "Promotion Study"}

## Status

This is a **${quick ? "bounded, provisional trial" : "precommitted promotion study"}** under authoritative V1.0.2 rules. Selfplay-003 remains the default unless a full study passes every gate.

- Model: \`${modelId}\`.
- Public observations: ${coverage.total} (${Object.entries(coverage.byPlayerCount).map(([count, value]) => `${count}P=${value}`).join(", ")}).
- Synthetic common-seed trajectories: ${generated.trajectoriesCompleted}/${generated.trajectoriesRequested} completed; ${generated.trajectoriesFailed} failed.
- Training examples: ${split.training.length} from ${split.trainingGameIds.length} capture games.
- Held-out examples: ${split.holdout.length} from ${split.holdoutGameIds.length} entirely separate capture games.
- Historical V1.0.1 observations were audited but not used to fit V1.0.2 weights.

## Decision-state holdout

| Metric | Learned V006 | Handcrafted V005 |
|---|---:|---:|
| Correlation with realized target | ${holdoutMetrics.correlation.toFixed(3)} | ${holdoutMetrics.handcraftedCorrelation.toFixed(3)} |
| Best-action accuracy | ${(holdoutMetrics.bestActionAccuracy * 100).toFixed(1)}% | ${(holdoutMetrics.handcraftedBestActionAccuracy * 100).toFixed(1)}% |
| Pairwise ranking accuracy | ${(holdoutMetrics.pairwiseAccuracy * 100).toFixed(1)}% | ${(holdoutMetrics.handcraftedPairwiseAccuracy * 100).toFixed(1)}% |
| RMSE | ${holdoutMetrics.rmse.toFixed(3)} | n/a |

Training correlation was ${trainingMetrics.correlation.toFixed(3)}. The conservative leaf-ranking gate ${leafValidationPassed ? "passed" : "did not pass"}; it requires the learned model to improve held-out best-action accuracy without reducing pairwise accuracy.

## Matched V006 versus V003

| Players | Pairs | Mean focal VP delta | Mean completed-Order delta | Mean win-credit delta |
|---:|---:|---:|---:|---:|
${countRows}

- Overall focal VP delta: ${summary.meanScoreDelta.toFixed(3)}.
- Bootstrap 95% interval: [${summary.scoreDeltaBootstrapCi95[0].toFixed(3)}, ${summary.scoreDeltaBootstrapCi95[1].toFixed(3)}].
- Completed-Order delta: ${summary.meanCompletedOrderDelta.toFixed(3)}.
- Decision p95: ${summary.candidateP95DecisionMs.toFixed(3)} ms.
- Oracle failure rate: ${(summary.oracleFailureRate * 100).toFixed(3)}%.
- Illegal action attempts: ${summary.illegalActionAttempts}.

${quick ? "These few pairs are a smoke/canary, not statistical promotion evidence. Run the full command only after reviewing this model and holdout." : `Promotion recommendation: **${summary.promotion.promoted ? "PROMOTE" : "RETAIN SELFPLAY-003"}**.`}
`;
}

async function sourceManifest(startedAt: string, runtimeMs: number, modelId: string) {
  const files = [
    "AGENTS.md",
    "docs/GAME_RULES.md",
    "src/ai/decisionOracle.ts",
    "src/ai/rolloutPolicy.ts",
    "src/ai/selfplay.ts",
    "src/ai/selfplay006.ts",
    "src/ai/v6LeafModel.ts",
    "src/ai/v6Training.ts",
  ];
  const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(file))])));
  return {
    rulesVersion: "1.0.2",
    baselinePolicyVersion: AI_POLICY_VERSION,
    candidatePolicyVersion: AI_POLICY_V6_VERSION,
    simulationVersion: AI_SIMULATION_V6_VERSION,
    modelId,
    quick,
    provisional: quick,
    observationsPerPlayerCount,
    captureGamesPerPlayerCount,
    rootWidth,
    samplesPerAction,
    evaluationPairsPerPlayerCount,
    startedAt,
    completedAt: new Date().toISOString(),
    runtimeMs,
    sourceFiles: hashes,
    aggregateSourceSha256: sha256(JSON.stringify(hashes)),
    evaluationScheduleSha256: sha256(JSON.stringify(buildV6PairedSchedule(evaluationPairsPerPlayerCount))),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await mkdir(outputDirectory, { recursive: true });
  const historicalAudit = await historicalV5Audit();
  console.log("capturing balanced V1.0.2 public decision states");
  const observations = await collectV6PublicDecisionStates(observationsPerPlayerCount, captureGamesPerPlayerCount);
  const coverage = summarizeV6ObservationCoverage(observations);
  console.log(`captured ${coverage.total} states; generating realized multi-round targets`);
  const generated = await generateV6LeafTrainingExamples(
    observations,
    { rootWidth, samplesPerAction, maximumTrajectoryDecisions: 2_500 },
    (completed, total) => {
      if (completed === total || completed % Math.max(1, Math.floor(total / 10)) === 0) console.log(`trajectories: ${completed}/${total}`);
    },
  );
  const split = splitV6TrainingExamples(generated.examples);
  if (split.training.length === 0 || split.holdout.length === 0) throw new Error("V006 requires non-empty game-level training and holdout splits");
  const model = fitV6LeafModel(split.training, 10);
  const trainingMetrics = validateV6LeafModel(model, split.training);
  const holdoutMetrics = validateV6LeafModel(model, split.holdout);
  const leafValidationPassed = holdoutMetrics.bestActionAccuracy > holdoutMetrics.handcraftedBestActionAccuracy &&
    holdoutMetrics.pairwiseAccuracy >= holdoutMetrics.handcraftedPairwiseAccuracy;
  console.log(`trained ${model.modelId}; running ${quick ? "quick" : "full"} matched cross-play`);
  const evaluation = await runV6CrossplayEvaluation(
    buildV6PairedSchedule(evaluationPairsPerPlayerCount),
    model,
    V6_RUNTIME_ROLLOUT_CONFIG,
    leafValidationPassed,
    (completed, total) => console.log(`evaluation: ${completed}/${total}`),
  );
  const runtimeMs = performance.now() - started;
  await Promise.all([
    writeFile(resolve(outputDirectory, "historical_v005_audit.json"), JSON.stringify(historicalAudit, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "public_observations.jsonl"), jsonLines(observations)),
    writeFile(resolve(outputDirectory, "realized_leaf_examples.jsonl"), jsonLines(generated.examples)),
    writeFile(resolve(outputDirectory, "leaf_model.json"), JSON.stringify(model, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "leaf_validation.json"), JSON.stringify({ coverage, generation: { ...generated, examples: undefined }, split: { trainingGameIds: split.trainingGameIds, holdoutGameIds: split.holdoutGameIds }, trainingMetrics, holdoutMetrics, leafValidationPassed }, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.json"), JSON.stringify(evaluation.pairs, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.csv"), pairsCsv(evaluation.pairs)),
    writeFile(resolve(outputDirectory, "study_summary.json"), JSON.stringify({ quick, provisional: quick, leafValidationPassed, leafModelId: model.modelId, leafValidation: holdoutMetrics, crossplay: evaluation.summary }, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "designer_summary.md"), reportMarkdown(model.modelId, coverage, generated, split, trainingMetrics, holdoutMetrics, evaluation, leafValidationPassed)),
    writeFile(resolve(outputDirectory, "source_manifest.json"), JSON.stringify(await sourceManifest(startedAt, runtimeMs, model.modelId), null, 2) + "\n"),
  ]);
  console.log(JSON.stringify({
    quick,
    provisional: quick,
    runtimeMs,
    modelId: model.modelId,
    coverage,
    trajectories: {
      requested: generated.trajectoriesRequested,
      completed: generated.trajectoriesCompleted,
      failed: generated.trajectoriesFailed,
    },
    trainingExamples: split.training.length,
    holdoutExamples: split.holdout.length,
    trainingMetrics,
    holdoutMetrics,
    leafValidationPassed,
    crossplay: evaluation.summary,
  }, null, 2));
}

await main();
