import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { auditTechniqueCompetencies } from "./competencyAudit.ts";
import { collectPublicOracleObservations, calibrateV5Oracle, V5_CALIBRATION_CANDIDATES } from "./oracleCalibration.ts";
import type { OracleCalibrationResult } from "./oracleCalibration.ts";
import { buildPlayerPlan } from "./planning.ts";
import { buildV5PairedSchedule, runV5CrossplayEvaluation } from "./selfplay005.ts";
import type { V5CrossplayResult, V5PairResult } from "./selfplay005.ts";
import type { SelfPlayDecisionSnapshot } from "./selfplay.ts";
import { createV5StrategyProfile } from "./strategy.ts";
import { STRATEGIC_SCENARIO_CATALOG } from "./strategicScenarios.ts";
import { AI_POLICY_V5_VERSION, AI_POLICY_VERSION, AI_SIMULATION_V5_VERSION } from "./types.ts";

const quick = process.argv.includes("--quick");
const outputDirectory = resolve("playtests/v1.0.2/selfplay-005");
const captureMaximum = quick ? 24 : 120;
const captureGamesPerPlayerCount = quick ? 2 : 6;
const calibrationMaximum = quick ? 12 : 30;
const evaluationPairsPerPlayerCount = quick ? 5 : 30;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function jsonLines(values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join("\n") + "\n";
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pairsCsv(pairs: readonly V5PairResult[]): string {
  const keys = Object.keys(pairs[0] ?? {}) as Array<keyof V5PairResult>;
  return [keys.join(","), ...pairs.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n";
}

function selectCalibrationObservations(
  observations: readonly SelfPlayDecisionSnapshot[],
  maximum: number,
): SelfPlayDecisionSnapshot[] {
  const groups = new Map<string, SelfPlayDecisionSnapshot[]>();
  for (const observation of observations) {
    const key = `${observation.observation.game.playerCount}:${observation.observation.game.phase.type}`;
    groups.set(key, [...groups.get(key) ?? [], observation]);
  }
  const selected: SelfPlayDecisionSnapshot[] = [];
  while (selected.length < maximum) {
    let added = false;
    for (const key of [...groups.keys()].sort()) {
      const next = groups.get(key)?.shift();
      if (next === undefined) continue;
      selected.push(next);
      added = true;
      if (selected.length >= maximum) break;
    }
    if (!added) break;
  }
  return selected;
}

function reportMarkdown(
  result: V5CrossplayResult,
  calibration: OracleCalibrationResult,
  finalSelectedId: string,
  canarySummary: V5CrossplayResult["summary"],
  captured: number,
  calibrated: number,
  techniqueAuditPassed: boolean,
): string {
  const summary = result.summary;
  const rows = ([2, 3, 4] as const).map((playerCount) => {
    const row = summary.byPlayerCount[String(playerCount)]!;
    return `| ${playerCount} | ${row.pairs} | ${number(row.meanScoreDelta)} | ${number(row.meanOrderDelta)} | ${number(row.winCreditDelta)} |`;
  }).join("\n");
  const gates = Object.entries(summary.promotion.gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n");
  const calibratedCandidate = calibration.candidates.find(({ id }) => id === finalSelectedId)!;
  return `# Kiln Opening Selfplay-005 Designer Summary

## Outcome

Selfplay-005 is evaluated as a public-belief rollout candidate against Selfplay-003 under authoritative V1.0.2 rules. Historical V1.0.1 outputs remain unchanged.

Promotion recommendation: **${summary.promotion.promoted ? "PROMOTE Selfplay-005" : "RETAIN Selfplay-003"}**.

## Decision oracle and calibration

- Captured public decision states: ${captured}.
- Deep-oracle calibration states: ${calibrated}.
- Oracle-only selection: **${calibration.selectedId}**.
- Final latency-qualified selection: **${finalSelectedId}**.
- Deep-oracle best-action match: ${number(calibratedCandidate.bestActionMatchRate * 100)}%.
- Average target regret: ${number(calibratedCandidate.averageTargetRegret)}.
- Calibration p95: ${number(calibratedCandidate.p95DurationMs)} ms.
- Pre-holdout cross-play p95: ${number(canarySummary.candidateP95DecisionMs)} ms.
- Technique positive/decline audit: ${techniqueAuditPassed ? "PASS" : "FAIL"}.

Belief states are reconstructed only from the serialized public observation. Unknown Order, Technique, and Fire cards are sampled from publicly possible remaining cards. Unrevealed Wood contributions are unsupported by the oracle and use the frozen safe evaluator instead.

## Held-out paired result

| Players | Pairs | Mean focal VP delta | Mean completed-Order delta | Mean win-credit delta |
|---:|---:|---:|---:|---:|
${rows}

- Pairs: ${summary.pairCount}; games: ${summary.gamesRun}.
- Overall focal VP delta: ${number(summary.meanScoreDelta)}.
- Paired bootstrap 95% CI: [${number(summary.scoreDeltaBootstrapCi95[0])}, ${number(summary.scoreDeltaBootstrapCi95[1])}].
- Completed-Order delta: ${number(summary.meanCompletedOrderDelta)}.
- Unused Finished ceramic delta: ${number(summary.meanUnusedFinishedDelta)} (negative is better).
- Technique acquisition delta: ${number(summary.techniqueAcquisitionDelta)}; candidate Technique uses: ${summary.candidateTechniqueUses}.
- Candidate decision p95: ${number(summary.candidateP95DecisionMs)} ms.
- Oracle failure rate: ${number(summary.oracleFailureRate * 100)}% across ${summary.oracleDecisionCount} oracle decisions.
- Illegal action attempts: ${summary.illegalActionAttempts}.

## Promotion gates

${gates}

V005 requires a practically meaningful +0.75 VP mean, a bootstrap interval above zero, no player-count or completed-Order regression, full competency coverage, zero illegal actions, less than 1% oracle failure, and sub-20-ms decision p95. The default changes only if every gate passes.
`;
}

async function sourceManifest(
  startedAt: string,
  runtimeMs: number,
  result: V5CrossplayResult,
  calibration: OracleCalibrationResult,
  finalSelectedId: string,
) {
  const files = [
    "AGENTS.md", "docs/GAME_RULES.md", "data/orders.json", "data/techniques.json", "data/kilns.json", "data/firing.json",
    "src/ai/beliefState.ts", "src/ai/competencyAudit.ts", "src/ai/decisionOracle.ts", "src/ai/oracleCalibration.ts",
    "src/ai/rolloutPolicy.ts", "src/ai/selfplay.ts", "src/ai/selfplay005.ts", "src/ai/types.ts",
  ];
  const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(file))])));
  return {
    rulesVersion: "1.0.2",
    baselinePolicyVersion: AI_POLICY_VERSION,
    candidatePolicyVersion: AI_POLICY_V5_VERSION,
    simulationVersion: AI_SIMULATION_V5_VERSION,
    quick,
    oracleSelectedCalibrationCandidate: calibration.selectedId,
    finalSelectedCalibrationCandidate: finalSelectedId,
    selectedRolloutConfig: result.rolloutConfig,
    captureMaximum,
    captureGamesPerPlayerCount,
    calibrationMaximum,
    evaluationPairsPerPlayerCount,
    startedAt,
    completedAt: new Date().toISOString(),
    runtimeMs,
    sourceFiles: hashes,
    aggregateSourceSha256: sha256(JSON.stringify(hashes)),
    evaluationScheduleSha256: sha256(JSON.stringify(buildV5PairedSchedule(evaluationPairsPerPlayerCount))),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await mkdir(outputDirectory, { recursive: true });
  console.log("capturing public decision states");
  const observations = await collectPublicOracleObservations(captureMaximum, captureGamesPerPlayerCount);
  const calibrationObservations = selectCalibrationObservations(observations, calibrationMaximum);
  console.log(`calibrating ${calibrationObservations.length} of ${observations.length} captured states`);
  const calibration = calibrateV5Oracle(calibrationObservations);
  const first = observations[0];
  if (first === undefined) throw new Error("V005 study captured no oracle observations");
  const firstProfile = createV5StrategyProfile(first.observation.game.playerCount);
  const techniqueAudit = auditTechniqueCompetencies(first.observation, buildPlayerPlan(first.observation, firstProfile));
  const strategicFixturesComplete = STRATEGIC_SCENARIO_CATALOG
    .filter(({ kind }) => kind === "technique" || kind === "kiln")
    .every(({ positiveFixture, declineFixture }) => Boolean(positiveFixture && declineFixture));
  const competencyPassed = techniqueAudit.every(({ positivePassed, declinePassed }) => positivePassed && declinePassed) && strategicFixturesComplete;
  console.log("running pre-holdout latency and cross-play canaries");
  const canarySchedule = buildV5PairedSchedule(quick ? 1 : 3, 53_050);
  const canaryRows: Array<{
    id: string;
    oracleObjective: number;
    selectionScore: number;
    eligible: boolean;
    summary: V5CrossplayResult["summary"];
  }> = [];
  for (const candidate of calibration.candidates) {
    const config = V5_CALIBRATION_CANDIDATES[candidate.id as keyof typeof V5_CALIBRATION_CANDIDATES];
    if (config === undefined) continue;
    const canary = await runV5CrossplayEvaluation(canarySchedule, config, competencyPassed);
    const eligible = canary.summary.illegalActionAttempts === 0 &&
      canary.summary.oracleFailureRate < 0.01 &&
      canary.summary.candidateP95DecisionMs < 20;
    const selectionScore = canary.summary.meanScoreDelta + canary.summary.meanCompletedOrderDelta * 1.5 +
      canary.summary.meanWinCreditDelta * 2 - candidate.objective * 0.2;
    canaryRows.push({ id: candidate.id, oracleObjective: candidate.objective, selectionScore, eligible, summary: canary.summary });
  }
  canaryRows.sort((left, right) => (
    Number(right.eligible) - Number(left.eligible) ||
    right.selectionScore - left.selectionScore ||
    left.oracleObjective - right.oracleObjective ||
    left.id.localeCompare(right.id)
  ));
  const selectedCanary = canaryRows[0];
  if (selectedCanary === undefined) throw new Error("V005 pre-holdout canary produced no candidate");
  const selectedConfig = V5_CALIBRATION_CANDIDATES[selectedCanary.id as keyof typeof V5_CALIBRATION_CANDIDATES];
  if (selectedConfig === undefined) throw new Error(`Missing selected V005 config ${selectedCanary.id}`);
  const schedule = buildV5PairedSchedule(evaluationPairsPerPlayerCount);
  const evaluation = await runV5CrossplayEvaluation(schedule, selectedConfig, competencyPassed, (completed, total) => {
    if (completed === total || completed % Math.max(1, Math.floor(total / 6)) === 0) console.log(`evaluation: ${completed}/${total}`);
  });
  const runtimeMs = performance.now() - started;
  const calibrationSummary = {
    selectedId: calibration.selectedId,
    selectedConfig: calibration.selectedConfig,
    finalSelectedId: selectedCanary.id,
    finalSelectedConfig: selectedConfig,
    candidates: calibration.candidates,
    capturedObservationCount: observations.length,
    calibratedObservationCount: calibration.records.length,
    meanTargetBestValue: mean(calibration.records.map(({ targetBestValue }) => targetBestValue)),
  };
  await Promise.all([
    writeFile(resolve(outputDirectory, "oracle_observations.jsonl"), jsonLines(observations)),
    writeFile(resolve(outputDirectory, "oracle_targets.jsonl"), jsonLines(calibration.records)),
    writeFile(resolve(outputDirectory, "oracle_calibration.json"), JSON.stringify(calibrationSummary, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "pre_holdout_canary.json"), JSON.stringify({ selectedId: selectedCanary.id, selectedConfig, candidates: canaryRows }, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "competency_audit.json"), JSON.stringify({ techniqueAudit, strategicFixturesComplete, competencyPassed }, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.json"), JSON.stringify(evaluation.pairs, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.csv"), pairsCsv(evaluation.pairs)),
    writeFile(resolve(outputDirectory, "study_summary.json"), JSON.stringify(evaluation.summary, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "designer_summary.md"), reportMarkdown(evaluation, calibration, selectedCanary.id, selectedCanary.summary, observations.length, calibration.records.length, competencyPassed)),
    writeFile(resolve(outputDirectory, "source_manifest.json"), JSON.stringify(await sourceManifest(startedAt, runtimeMs, evaluation, calibration, selectedCanary.id), null, 2) + "\n"),
  ]);
  console.log(JSON.stringify({
    captured: observations.length,
    calibrated: calibration.records.length,
    oracleSelectedId: calibration.selectedId,
    finalSelectedId: selectedCanary.id,
    runtimeMs,
    summary: evaluation.summary,
  }, null, 2));
}

await main();
