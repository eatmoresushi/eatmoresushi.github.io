import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { V4_SEARCH_CONFIGS } from "./lookaheadPolicy.ts";
import { buildV4PairedSchedule, runV4CrossplayEvaluation, tuneV4Search } from "./selfplay004.ts";
import type { V4CrossplayResult, V4PairResult } from "./selfplay004.ts";
import { AI_POLICY_V4_VERSION, AI_POLICY_VERSION, AI_SIMULATION_V4_VERSION } from "./types.ts";

const quick = process.argv.includes("--quick");
const outputDirectory = resolve("playtests/v1.0.2/selfplay-004");
const tuningPairsPerCount = quick ? 2 : 6;
const evaluationPairsPerCount = quick ? 5 : 30;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function csvCell(value: unknown): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function pairsCsv(pairs: readonly V4PairResult[]): string {
  const keys = [
    "pairId", "playerCount", "focalPlayerId", "gameSeed", "aiSeed", "baselineScore", "candidateScore", "scoreDelta",
    "baselineCompletedOrders", "candidateCompletedOrders", "completedOrderDelta", "baselineWinCredit", "candidateWinCredit",
    "winCreditDelta", "baselineUnusedFinished", "candidateUnusedFinished", "unusedFinishedDelta", "candidateP95DecisionMs",
    "illegalActionAttempts",
  ] as const;
  return [keys.join(","), ...pairs.map((row) => keys.map((key) => csvCell(row[key])).join(","))].join("\n") + "\n";
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function summaryMarkdown(result: V4CrossplayResult, selectedId: string): string {
  const summary = result.summary;
  const rows = ([2, 3, 4] as const).map((playerCount) => {
    const row = summary.byPlayerCount[String(playerCount)]!;
    return `| ${playerCount} | ${row.pairs} | ${number(row.meanScoreDelta)} | ${number(row.meanOrderDelta)} | ${number(row.winCreditDelta)} |`;
  }).join("\n");
  const gates = Object.entries(summary.promotion.gates).map(([gate, passed]) => `- ${passed ? "PASS" : "FAIL"}: ${gate}`).join("\n");
  return `# Kiln Opening Selfplay-004 Designer Summary

## Outcome

Selfplay-004 is evaluated as a separate candidate against the Selfplay-003 baseline under authoritative V1.0.2 rules. The tournament selected the **${selectedId}** bounded-search configuration before the held-out paired evaluation. Historical V1.0.1 outputs are not read as current results or overwritten.

Promotion recommendation: **${summary.promotion.promoted ? "PROMOTE Selfplay-004" : "RETAIN Selfplay-003"}**.

## What changed

- explicit multi-round worker-action and Order-route budgets;
- deterministic public-information lookahead, capped by depth, beam width, and node count;
- longer-horizon recurring-use valuation for all 15 Techniques;
- visible-opponent pressure at all six worker-placement locations;
- round-four/five conversion pressure to reduce stranded ceramics;
- per-seat mixed-policy self-play and matched baseline/candidate evaluation.

No hidden deck order or unrevealed Wood contribution is available to the policy.

## Held-out paired result

| Players | Pairs | Mean focal VP delta | Mean completed-Order delta | Mean win-credit delta |
|---:|---:|---:|---:|---:|
${rows}

- Pairs: ${summary.pairCount}; games: ${summary.gamesRun}.
- Overall focal VP delta: ${number(summary.meanScoreDelta)}.
- 95% paired normal CI: [${number(summary.scoreDeltaCi95[0])}, ${number(summary.scoreDeltaCi95[1])}].
- Completed-Order delta: ${number(summary.meanCompletedOrderDelta)}.
- Unused Finished ceramic delta: ${number(summary.meanUnusedFinishedDelta)} (negative is better).
- Candidate decision p95: ${number(summary.candidateP95DecisionMs)} ms.
- Illegal action attempts: ${summary.illegalActionAttempts}.

## Promotion gates

${gates}

Promotion is deliberately statistical rather than subjective. A positive point estimate alone is not enough: the paired 95% interval must also exclude zero, completed Orders may not regress, legality must remain perfect, and decision latency must stay below budget.

## Interpretation

This study changes the focal seat only; every opponent remains on frozen Selfplay-003. Each candidate game reuses its baseline's game seed, AI seed, traditions, intents, player count, and focal seat. Candidate seats rotate across every seat for 2-, 3-, and 4-player games. This isolates policy strength more cleanly than comparing unrelated batches.

The detailed paired rows are in \`paired_results.csv\`; exact tuning and held-out configurations are in the JSON artifacts.
`;
}

async function sourceManifest(startedAt: string, runtimeMs: number, result: V4CrossplayResult, selectedId: string) {
  const files = [
    "AGENTS.md", "docs/GAME_RULES.md", "data/techniques.json", "data/kilns.json",
    "src/ai/lookaheadPolicy.ts", "src/ai/planning.ts", "src/ai/selfplay.ts", "src/ai/selfplay004.ts",
    "src/ai/strategicScenarios.ts", "src/ai/types.ts",
  ];
  const hashes = Object.fromEntries(await Promise.all(files.map(async (file) => [file, sha256(await readFile(file))])));
  return {
    rulesVersion: "1.0.2",
    baselinePolicyVersion: AI_POLICY_VERSION,
    candidatePolicyVersion: AI_POLICY_V4_VERSION,
    simulationVersion: AI_SIMULATION_V4_VERSION,
    selectedSearchCandidate: selectedId,
    selectedSearchConfig: result.searchConfig,
    quick,
    tuningPairsPerPlayerCount: tuningPairsPerCount,
    evaluationPairsPerPlayerCount: evaluationPairsPerCount,
    startedAt,
    completedAt: new Date().toISOString(),
    runtimeMs,
    sourceFiles: hashes,
    aggregateSourceSha256: sha256(JSON.stringify(hashes)),
    heldOutScheduleSha256: sha256(JSON.stringify(buildV4PairedSchedule(evaluationPairsPerCount, 44_040))),
  };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  await mkdir(outputDirectory, { recursive: true });
  const tuningSchedule = buildV4PairedSchedule(tuningPairsPerCount, 41_040);
  const tournament = await tuneV4Search(tuningSchedule, V4_SEARCH_CONFIGS, (candidate, completed, total) => {
    if (completed === total || completed % Math.max(1, Math.floor(total / 3)) === 0) console.log(`tuning ${candidate}: ${completed}/${total}`);
  });
  const evaluationSchedule = buildV4PairedSchedule(evaluationPairsPerCount, 44_040);
  const evaluation = await runV4CrossplayEvaluation(evaluationSchedule, tournament.selectedConfig, (completed, total) => {
    if (completed === total || completed % Math.max(1, Math.floor(total / 6)) === 0) console.log(`evaluation: ${completed}/${total}`);
  });
  const runtimeMs = performance.now() - started;
  const compactTournament = {
    selectedId: tournament.selectedId,
    selectedConfig: tournament.selectedConfig,
    candidates: tournament.candidates.map(({ id, score, result }) => ({ id, score, summary: result.summary, searchConfig: result.searchConfig })),
    tuningSchedule,
  };
  await Promise.all([
    writeFile(resolve(outputDirectory, "tuning_results.json"), JSON.stringify(compactTournament, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "study_summary.json"), JSON.stringify(evaluation.summary, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.json"), JSON.stringify(evaluation.pairs, null, 2) + "\n"),
    writeFile(resolve(outputDirectory, "paired_results.csv"), pairsCsv(evaluation.pairs)),
    writeFile(resolve(outputDirectory, "designer_summary.md"), summaryMarkdown(evaluation, tournament.selectedId)),
    writeFile(resolve(outputDirectory, "source_manifest.json"), JSON.stringify(await sourceManifest(startedAt, runtimeMs, evaluation, tournament.selectedId), null, 2) + "\n"),
  ]);
  console.log(JSON.stringify({ selectedId: tournament.selectedId, runtimeMs, summary: evaluation.summary }, null, 2));
}

await main();
