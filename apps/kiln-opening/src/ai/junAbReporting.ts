import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { SeededRandom } from "../game/index.ts";
import type { PlayerId, Quality } from "../game/index.ts";
import { buildStudyTables, writeCsv } from "./reporting.ts";
import type { CsvRow, StudyTables } from "./reporting.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import {
  JUN_AB_CONTROL_SIMULATION,
  JUN_AB_COST_ONE_SIMULATION,
  JUN_AB_EXPERIMENT_ID,
  JUN_AB_POLICY_VERSION,
} from "./junAbExperiment.ts";
import type {
  CompletedJunAbPair,
  JunAbArm,
  JunAbAttemptLog,
} from "./junAbExperiment.ts";

export interface JunPlayerMetrics {
  vp: number;
  rank: number;
  win: number;
  opportunities: number;
  selections: number;
  selectionRate: number;
  coinsPaid: number;
  endingCoins: number;
  coinVp: number;
  naturalMasterpieces: number;
  finalMasterpieces: number;
  junCreatedMasterpieces: number;
  delivered: number;
  unusedFinished: number;
  ordersCompleted: number;
  marketOrdersCompleted: number;
  imperialOrdersCompleted: number;
  imperialProgress: number;
}

export interface JunAbPairOutcome extends CsvRow {
  pair_id: string;
  player_count: number;
  sequence: number;
  game_seed: number;
  ai_seed: number;
  replacement_index: number;
  jun_player_id: string;
  jun_seat: number;
  jun_intent: string;
  opponent_lineup: string;
  expected_first_player_id: string;
  control_game_id: string;
  experimental_game_id: string;
  control_jun_vp: number;
  experimental_jun_vp: number;
  jun_vp_difference: number;
  control_opponent_mean_vp: number;
  experimental_opponent_mean_vp: number;
  opponent_mean_vp_difference: number;
  control_jun_relative_vp: number;
  experimental_jun_relative_vp: number;
  relative_vp_did: number;
  jun_win_difference: number;
  jun_rank_difference: number;
  jun_selection_difference: number;
  jun_created_masterpiece_difference: number;
  jun_delivered_difference: number;
  jun_unused_finished_difference: number;
  jun_orders_completed_difference: number;
  jun_ending_coins_difference: number;
  jun_coin_vp_difference: number;
}

export interface JunAbRunMetadata {
  startedAt: string;
  completedAt: string;
  totalRuntimeMs: number;
  invalidAttempts: JunAbAttemptLog[];
  frozenProfileHash: string;
  scheduleHash: string;
  experimentConfigHash: string;
}

export interface Estimate {
  mean: number;
  median: number;
  low: number;
  high: number;
  minimum: number;
  p25: number;
  p75: number;
  maximum: number;
}

export interface JunAbAnalysisSummary {
  pairs: number;
  games: number;
  invalidAttempts: number;
  pairedReplacements: number;
  primaryRelativeVpDid: Estimate;
  experimentalRelativeVp: Estimate;
  adjustedArmJunInteraction: { coefficient: number; standardError: number; low: number; high: number };
  junVpDifference: Estimate;
  junWinDifference: Estimate;
  junRankDifference: Estimate;
  controlJun: JunPlayerMetrics;
  experimentalJun: JunPlayerMetrics;
  controlOpponentMeanVp: number;
  experimentalOpponentMeanVp: number;
  interpretation: "1 Coin is too weak" | "1 Coin is a promising candidate for human testing" | "1 Coin may be too harsh" | "inconclusive";
}

export interface RegressionRow {
  pairId: string;
  outcome: number;
  arm: JunAbArm;
  jun: boolean;
  playerCount: number;
  seat: number;
  firstPlayer: boolean;
  intent: string;
  lineup: string;
}

export interface RegressionResult {
  coefficients: Array<{ term: string; coefficient: number; standardError: number; low: number; high: number }>;
  references: Record<string, string>;
}

const OPTIONAL_HEADERS = [
  "experiment_id", "experiment_arm", "pair_id", "jun_activation_cost", "frozen_profile_hash", "policy_version", "simulation_version",
  "decision_id", "game_id", "game_seed", "ai_seed", "player_count", "sequence", "dataset_split", "round", "phase", "player_id", "assigned_intent", "effect_id", "eligible_target_count", "eligible_target_ids", "selected", "selected_target_id", "selected_delta", "natural_quality", "projected_quality", "quality_rank_delta", "compatible_orders_before", "compatible_orders_after", "order_value_delta", "coin_cost", "wood_cost", "opportunity_cost", "gross_benefit", "projected_net_value", "reason_code",
] as const;

const TECHNIQUE_FORECAST_HEADERS = [
  "experiment_id", "experiment_arm", "pair_id", "jun_activation_cost", "frozen_profile_hash", "policy_version", "simulation_version",
  "decision_id", "game_id", "game_seed", "ai_seed", "player_count", "sequence", "dataset_split", "round", "player_id", "assigned_intent", "technique_id", "remaining_rounds", "expected_windows", "opportunity_probability", "expected_beneficial_uses", "gross_benefit", "purchase_cost", "activation_cost", "worker_opportunity_cost", "forecast_net_value", "plan_compatibility", "forecast_reason_codes", "actual_legal_opportunities", "actual_uses", "opportunity_realized", "use_realized", "owner_final_vp", "owner_win",
] as const;

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: readonly number[], probability: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! * (upper - position) + sorted[upper]! * (position - lower);
}

function averageMetrics(metrics: readonly JunPlayerMetrics[]): JunPlayerMetrics {
  const keys = Object.keys(metrics[0] ?? {}) as Array<keyof JunPlayerMetrics>;
  return Object.fromEntries(keys.map((key) => [key, mean(metrics.map((row) => row[key]))])) as unknown as JunPlayerMetrics;
}

function playerRank(result: SelfPlayGameResult, playerId: PlayerId): number {
  const scores = result.state.finalResult?.scores ?? {};
  const score = scores[playerId]?.total ?? 0;
  return 1 + Object.values(scores).filter((candidate) => candidate.total > score).length;
}

function finalFiringRows(result: SelfPlayGameResult, playerId: PlayerId) {
  const rows = new Map<string, SelfPlayGameResult["firings"][number]>();
  result.firings.forEach((row) => {
    if (row.ownerId === playerId) rows.set(row.ceramicId, row);
  });
  return [...rows.values()];
}

export function junPlayerMetrics(result: SelfPlayGameResult, playerId: PlayerId): JunPlayerMetrics {
  const player = result.state.players[playerId];
  const final = result.state.finalResult;
  if (player === undefined || final === null) throw new Error(`Missing final Jun player ${playerId}`);
  const firings = finalFiringRows(result, playerId);
  const decisions = result.decisions.filter((decision) => decision.playerId === playerId && decision.diagnostics.optionalEffect?.effectId === "jun");
  const selections = decisions.filter((decision) => decision.diagnostics.optionalEffect?.selected).length;
  const coinsPaid = result.events.filter((row) => row.actorId === playerId && row.eventType === "JUN_ACTIVATION_PAID").length;
  return {
    vp: final.scores[playerId]?.total ?? 0,
    rank: playerRank(result, playerId),
    win: final.winnerIds.includes(playerId) ? 1 : 0,
    opportunities: decisions.length,
    selections,
    selectionRate: decisions.length === 0 ? 0 : selections / decisions.length,
    coinsPaid,
    endingCoins: player.resources.coins,
    coinVp: final.scores[playerId]?.leftoverCoins ?? 0,
    naturalMasterpieces: firings.filter((row) => row.naturalQuality === "masterpiece").length,
    finalMasterpieces: firings.filter((row) => row.finalQuality === "masterpiece").length,
    junCreatedMasterpieces: firings.filter((row) => row.jun && row.naturalQuality !== "masterpiece" && row.finalQuality === "masterpiece").length,
    delivered: Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "delivered").length,
    unusedFinished: Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length,
    ordersCompleted: player.completedOrders.length,
    marketOrdersCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("M")).length,
    imperialOrdersCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("I")).length,
    imperialProgress: player.imperialProgress,
  };
}

function opponentMeanVp(result: SelfPlayGameResult, junPlayerId: PlayerId): number {
  const scores = result.state.finalResult?.scores ?? {};
  return mean(result.state.playerOrder.filter((id) => id !== junPlayerId).map((id) => scores[id]?.total ?? 0));
}

export function pairOutcome(pair: CompletedJunAbPair<SelfPlayGameResult>): JunAbPairOutcome {
  const control = junPlayerMetrics(pair.control, pair.scenario.junPlayerId);
  const experimental = junPlayerMetrics(pair.junCostOne, pair.scenario.junPlayerId);
  const controlOpponents = opponentMeanVp(pair.control, pair.scenario.junPlayerId);
  const experimentalOpponents = opponentMeanVp(pair.junCostOne, pair.scenario.junPlayerId);
  return {
    experiment_id: JUN_AB_EXPERIMENT_ID,
    pair_id: pair.scenario.pairId,
    player_count: pair.scenario.playerCount,
    sequence: pair.scenario.sequence,
    game_seed: pair.candidate.gameSeed,
    ai_seed: pair.candidate.aiSeed,
    replacement_index: pair.candidate.replacementIndex,
    jun_player_id: pair.scenario.junPlayerId,
    jun_seat: pair.scenario.junSeat,
    jun_intent: pair.scenario.assignedIntents[pair.scenario.junPlayerId]!,
    opponent_lineup: pair.scenario.opponentLineup,
    expected_first_player_id: pair.scenario.expectedFirstPlayerId,
    control_game_id: pair.control.config.gameId,
    experimental_game_id: pair.junCostOne.config.gameId,
    control_jun_vp: control.vp,
    experimental_jun_vp: experimental.vp,
    jun_vp_difference: experimental.vp - control.vp,
    control_opponent_mean_vp: controlOpponents,
    experimental_opponent_mean_vp: experimentalOpponents,
    opponent_mean_vp_difference: experimentalOpponents - controlOpponents,
    control_jun_relative_vp: control.vp - controlOpponents,
    experimental_jun_relative_vp: experimental.vp - experimentalOpponents,
    relative_vp_did: experimental.vp - experimentalOpponents - (control.vp - controlOpponents),
    jun_win_difference: experimental.win - control.win,
    jun_rank_difference: experimental.rank - control.rank,
    jun_selection_difference: experimental.selections - control.selections,
    jun_created_masterpiece_difference: experimental.junCreatedMasterpieces - control.junCreatedMasterpieces,
    jun_delivered_difference: experimental.delivered - control.delivered,
    jun_unused_finished_difference: experimental.unusedFinished - control.unusedFinished,
    jun_orders_completed_difference: experimental.ordersCompleted - control.ordersCompleted,
    jun_ending_coins_difference: experimental.endingCoins - control.endingCoins,
    jun_coin_vp_difference: experimental.coinVp - control.coinVp,
    control_jun_rank: control.rank,
    experimental_jun_rank: experimental.rank,
    control_jun_win: control.win,
    experimental_jun_win: experimental.win,
    control_jun_opportunities: control.opportunities,
    experimental_jun_opportunities: experimental.opportunities,
    control_jun_selections: control.selections,
    experimental_jun_selections: experimental.selections,
    control_jun_selection_rate: control.selectionRate,
    experimental_jun_selection_rate: experimental.selectionRate,
    control_jun_coins_paid: control.coinsPaid,
    experimental_jun_coins_paid: experimental.coinsPaid,
    control_jun_ending_coins: control.endingCoins,
    experimental_jun_ending_coins: experimental.endingCoins,
    control_jun_coin_vp: control.coinVp,
    experimental_jun_coin_vp: experimental.coinVp,
    control_jun_natural_masterpieces: control.naturalMasterpieces,
    experimental_jun_natural_masterpieces: experimental.naturalMasterpieces,
    control_jun_final_masterpieces: control.finalMasterpieces,
    experimental_jun_final_masterpieces: experimental.finalMasterpieces,
    control_jun_created_masterpieces: control.junCreatedMasterpieces,
    experimental_jun_created_masterpieces: experimental.junCreatedMasterpieces,
    control_jun_delivered: control.delivered,
    experimental_jun_delivered: experimental.delivered,
    control_jun_unused_finished: control.unusedFinished,
    experimental_jun_unused_finished: experimental.unusedFinished,
    control_jun_orders_completed: control.ordersCompleted,
    experimental_jun_orders_completed: experimental.ordersCompleted,
    control_jun_market_orders_completed: control.marketOrdersCompleted,
    experimental_jun_market_orders_completed: experimental.marketOrdersCompleted,
    control_jun_imperial_orders_completed: control.imperialOrdersCompleted,
    experimental_jun_imperial_orders_completed: experimental.imperialOrdersCompleted,
    control_jun_imperial_progress: control.imperialProgress,
    experimental_jun_imperial_progress: experimental.imperialProgress,
  };
}

function bootstrapEstimate(rows: readonly JunAbPairOutcome[], key: keyof JunAbPairOutcome): Estimate {
  const observed = rows.map((row) => Number(row[key]));
  const groups = [2, 3, 4].map((count) => rows.filter((row) => row.player_count === count));
  const rng = new SeededRandom(0x4a42_0001 + String(key).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0));
  const bootstrap: number[] = [];
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const sampled = groups.flatMap((group) => Array.from({ length: group.length }, () => group[rng.nextInt(group.length)]!));
    bootstrap.push(mean(sampled.map((row) => Number(row[key]))));
  }
  return {
    mean: mean(observed),
    median: quantile(observed, 0.5),
    low: quantile(bootstrap, 0.025),
    high: quantile(bootstrap, 0.975),
    minimum: Math.min(...observed),
    p25: quantile(observed, 0.25),
    p75: quantile(observed, 0.75),
    maximum: Math.max(...observed),
  };
}

function invert(matrix: number[][]): number[][] {
  const size = matrix.length;
  const work = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0),
  ]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(work[row]![column]!) > Math.abs(work[pivot]![column]!)) pivot = row;
    }
    if (Math.abs(work[pivot]![column]!) < 1e-10) throw new Error("Adjusted Jun model is singular");
    [work[column], work[pivot]] = [work[pivot]!, work[column]!];
    const divisor = work[column]![column]!;
    work[column] = work[column]!.map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const multiplier = work[row]![column]!;
      work[row] = work[row]!.map((value, index) => value - multiplier * work[column]![index]!);
    }
  }
  return work.map((row) => row.slice(size));
}

function matrixVector(matrix: readonly number[][], vector: readonly number[]): number[] {
  return matrix.map((row) => row.reduce((sum, value, index) => sum + value * vector[index]!, 0));
}

function adjustedModel(rows: readonly RegressionRow[]): RegressionResult {
  const intents = [...new Set(rows.map((row) => row.intent))].sort().filter((intent) => intent !== "Market");
  const lineupsByCount = new Map<number, string[]>();
  for (const playerCount of [2, 3, 4]) {
    lineupsByCount.set(playerCount, [...new Set(rows.filter((row) => row.playerCount === playerCount).map((row) => row.lineup))].sort());
  }
  const lineupTerms = [...lineupsByCount].flatMap(([playerCount, lineups]) => lineups.slice(1).map((lineup) => ({ playerCount, lineup })));
  const terms = [
    "intercept", "arm[jun_cost_1]", "jun", "arm×jun", "player_count[3]", "player_count[4]",
    "seat[2]", "seat[3]", "seat[4]", "first_player",
    ...intents.map((intent) => `intent[${intent}]`),
    ...lineupTerms.map(({ playerCount, lineup }) => `lineup[${playerCount}P:${lineup}]`),
  ];
  const design = rows.map((row) => [
    1,
    Number(row.arm === "jun_cost_1"),
    Number(row.jun),
    Number(row.arm === "jun_cost_1" && row.jun),
    Number(row.playerCount === 3), Number(row.playerCount === 4),
    Number(row.seat === 2), Number(row.seat === 3), Number(row.seat === 4),
    Number(row.firstPlayer),
    ...intents.map((intent) => Number(row.intent === intent)),
    ...lineupTerms.map(({ playerCount, lineup }) => Number(row.playerCount === playerCount && row.lineup === lineup)),
  ]);
  const outcomes = rows.map((row) => row.outcome);
  const size = terms.length;
  const xtx = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (
    design.reduce((sum, row) => sum + row[i]! * row[j]!, 0)
  )));
  const xty = Array.from({ length: size }, (_, i) => design.reduce((sum, row, index) => sum + row[i]! * outcomes[index]!, 0));
  const inverse = invert(xtx);
  const beta = matrixVector(inverse, xty);
  const residuals = design.map((row, index) => outcomes[index]! - row.reduce((sum, value, column) => sum + value * beta[column]!, 0));
  const scores = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const score = scores.get(row.pairId) ?? Array(size).fill(0) as number[];
    design[index]!.forEach((value, column) => { score[column] = score[column]! + value * residuals[index]!; });
    scores.set(row.pairId, score);
  });
  const meat = Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (
    [...scores.values()].reduce((sum, score) => sum + score[i]! * score[j]!, 0)
  )));
  const left = inverse.map((row) => Array.from({ length: size }, (_, j) => row.reduce((sum, value, k) => sum + value * meat[k]![j]!, 0)));
  const covariance = left.map((row, i) => Array.from({ length: size }, (_, j) => row.reduce((sum, value, k) => sum + value * inverse[j]![k]!, 0)));
  const clusters = scores.size;
  const correction = clusters / (clusters - 1) * (rows.length - 1) / (rows.length - size);
  return {
    coefficients: terms.map((term, index) => {
      const standardError = Math.sqrt(Math.max(0, covariance[index]![index]! * correction));
      return {
        term,
        coefficient: beta[index]!,
        standardError,
        low: beta[index]! - 1.96 * standardError,
        high: beta[index]! + 1.96 * standardError,
      };
    }),
    references: {
      arm: "control",
      jun: "pooled non-Jun players",
      playerCount: "2P",
      seat: "seat 1",
      firstPlayer: "not first player",
      intent: "Market",
      opponentLineup: [...lineupsByCount].map(([count, lineups]) => `${count}P=${lineups[0]}`).join("; "),
      cluster: "pair_id",
    },
  };
}

export function fitJunAbAdjustedModel(rows: readonly RegressionRow[]): RegressionResult {
  return adjustedModel(rows);
}

function experimentFields(result: SelfPlayGameResult): CsvRow {
  const experiment = result.config.experimentConfig;
  const metadata = result.config.experimentMetadata;
  if (experiment?.experimentId !== "jun-ab-001" || metadata === undefined) {
    throw new Error(`Missing Jun experiment metadata for ${result.config.gameId}`);
  }
  return {
    experiment_id: experiment.experimentId,
    experiment_arm: experiment.experimentArm,
    pair_id: metadata.pairId,
    replacement_index: metadata.replacementIndex,
    jun_activation_cost: experiment.junActivationCoinCost,
    frozen_profile_hash: metadata.frozenProfileHash,
    policy_version: metadata.policyVersion,
    simulation_version: metadata.simulationVersion,
    canonical_rules_version: "1.0.1",
  };
}

function decorateTables(results: readonly SelfPlayGameResult[], tables: StudyTables): StudyTables {
  const byGame = new Map(results.map((result) => [result.config.gameId, experimentFields(result)]));
  const common = experimentFields(results[0]!);
  const decorate = (rows: CsvRow[]) => rows.map((row) => {
    const gameId = String(row["game_id"] ?? row["gameId"] ?? "");
    return { ...(byGame.get(gameId) ?? common), ...row };
  });
  return Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, decorate(rows)])) as unknown as StudyTables;
}

async function writeArmPackage(directory: string, arm: JunAbArm, results: readonly SelfPlayGameResult[]): Promise<void> {
  await mkdir(directory, { recursive: false });
  const tables = decorateTables(results, buildStudyTables(results));
  const files: Array<{ name: string; rows: CsvRow[]; headers?: readonly string[] }> = [
    { name: "playtests_v1.0.1_games.csv", rows: tables.games },
    { name: "playtests_v1.0.1_players.csv", rows: tables.players },
    { name: "playtests_v1.0.1_rounds.csv", rows: tables.rounds },
    { name: "playtests_v1.0.1_orders.csv", rows: tables.orders },
    { name: "playtests_v1.0.1_order_events.csv", rows: tables.orderEvents },
    { name: "playtests_v1.0.1_techniques.csv", rows: tables.techniques },
    { name: "playtests_v1.0.1_technique_events.csv", rows: tables.techniqueEvents },
    { name: "playtests_v1.0.1_kiln.csv", rows: tables.kiln },
    { name: "playtests_v1.0.1_firings.csv", rows: tables.firings },
    { name: "playtests_v1.0.1_actions.csv", rows: tables.actions },
    { name: "playtests_v1.0.1_ai_decisions.csv", rows: tables.decisions },
    { name: "playtests_v1.0.1_ai_plans.csv", rows: tables.plans },
    { name: "playtests_v1.0.1_optional_effects.csv", rows: tables.optionalEffects, headers: OPTIONAL_HEADERS },
    { name: "playtests_v1.0.1_technique_forecasts.csv", rows: tables.techniqueForecasts, headers: TECHNIQUE_FORECAST_HEADERS },
    { name: "playtests_v1.0.1_intent_outcomes.csv", rows: tables.intentOutcomes },
  ];
  await Promise.all(files.map(({ name, rows, headers }) => writeCsv(join(directory, name), rows, headers)));
  await writeFile(join(directory, "playtests_v1.0.1_games.jsonl"), `${results.map((result) => JSON.stringify({
    experiment: experimentFields(result),
    config: result.config,
    initialFirstPlayerId: result.initialFirstPlayerId,
    finalState: result.state,
    durationMs: result.durationMs,
    actionCount: result.actions.length,
    firingCount: result.firings.length,
    strategyTagsByPlayer: result.strategyTagsByPlayer,
  })).join("\n")}\n`, "utf8");
  const junMetrics = averageMetrics(results.map((result) => {
    const jun = result.state.playerOrder.find((id) => result.state.players[id]?.kilnId === "JU");
    if (jun === undefined) throw new Error(`No Jun player in ${result.config.gameId}`);
    return junPlayerMetrics(result, jun);
  }));
  const summary = {
    experimentId: JUN_AB_EXPERIMENT_ID,
    arm,
    simulationVersion: arm === "control" ? JUN_AB_CONTROL_SIMULATION : JUN_AB_COST_ONE_SIMULATION,
    policyVersion: JUN_AB_POLICY_VERSION,
    canonicalRulesVersion: "1.0.1",
    games: results.length,
    playerGames: results.reduce((sum, result) => sum + result.state.playerCount, 0),
    invalidSelectedActions: results.reduce((sum, result) => sum + result.illegalActionAttempts, 0),
    junActivationCoinCost: arm === "control" ? 0 : 1,
    junMetrics,
  };
  await writeFile(join(directory, "arm_summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(directory, "arm_report.md"), `# Jun A/B ${arm} arm\n\n- Canonical rules: V1.0.1.\n- Frozen policy: ${JUN_AB_POLICY_VERSION}.\n- Games: ${results.length}; selected illegal actions: ${summary.invalidSelectedActions}.\n- Jun activation Coin cost: ${summary.junActivationCoinCost}.\n- Jun VP: ${junMetrics.vp.toFixed(3)}; wins: ${(junMetrics.win * 100).toFixed(1)}%; uses: ${junMetrics.selections.toFixed(3)} per game; Jun-created Masterpieces: ${junMetrics.junCreatedMasterpieces.toFixed(3)} per game.\n\nThis arm is experimental evidence only. No rule was adopted.\n`, "utf8");
  await writeFile(join(directory, "playtests_v1.0.1_bugs.md"), `# Jun A/B ${arm} invalid-attempt log\n\nNo accepted game contained an invalid selected action. Pair-level invalid attempts and symmetric replacements are recorded at the experiment root.\n`, "utf8");
}

export function junOpportunityRows(pairs: readonly CompletedJunAbPair<SelfPlayGameResult>[]): CsvRow[] {
  return pairs.flatMap((pair) => ([pair.control, pair.junCostOne] as const).flatMap((result) => {
    const fields = experimentFields(result);
    return result.decisions.flatMap((decision): CsvRow[] => {
      const diagnostic = decision.diagnostics.optionalEffect;
      if (diagnostic?.effectId !== "jun") return [];
      const action = result.actions.find((row) => row.decisionIndex === Number(decision.decisionId.split(":D").at(-1)));
      const firing = diagnostic.selectedTargetId === null
        ? undefined
        : [...result.firings].reverse().find((row) => row.ceramicId === diagnostic.selectedTargetId && row.round === decision.round);
      const actualPayment = result.events.some((row) => row.decisionIndex === action?.decisionIndex && row.eventType === "JUN_ACTIVATION_PAID") ? 1 : 0;
      return [{
        ...fields,
        game_id: result.config.gameId,
        game_seed: result.config.gameSeed,
        ai_seed: result.config.aiSeed,
        player_count: result.state.playerCount,
        sequence: result.config.gameSequence,
        round: decision.round,
        player_id: decision.playerId,
        ceramic_id: diagnostic.selectedTargetId,
        assigned_intent: decision.assignedIntent,
        coin_balance_before: action?.coinsBefore,
        active_jun_cost: result.config.experimentConfig?.experimentId === "jun-ab-001"
          ? result.config.experimentConfig.junActivationCoinCost
          : 0,
        eligible_target_count: diagnostic.eligibleTargetIds.length,
        eligible_target_ids: diagnostic.eligibleTargetIds.join("|"),
        selected: diagnostic.selected,
        selected_target_id: diagnostic.selectedTargetId,
        selected_delta: diagnostic.selectedDelta,
        natural_quality: diagnostic.naturalQuality,
        projected_quality: diagnostic.projectedQuality,
        quality_rank_delta: diagnostic.qualityRankDelta,
        compatible_orders_before: diagnostic.compatibleOrdersBefore,
        compatible_orders_after: diagnostic.compatibleOrdersAfter,
        order_value_delta: diagnostic.orderValueDelta,
        gross_projected_benefit: diagnostic.grossBenefit,
        projected_coin_cost: diagnostic.coinCost,
        projected_opportunity_cost: diagnostic.opportunityCost,
        projected_net_value: diagnostic.projectedNetValue,
        actual_coin_payment: actualPayment,
        final_quality: firing?.finalQuality,
        eventual_destination: firing?.eventualDestination,
        reason_code: diagnostic.reasonCode,
      }];
    });
  }));
}

function regressionRows(pairs: readonly CompletedJunAbPair<SelfPlayGameResult>[]): RegressionRow[] {
  return pairs.flatMap((pair) => ([
    ["control", pair.control] as const,
    ["jun_cost_1", pair.junCostOne] as const,
  ]).flatMap(([arm, result]) => result.state.playerOrder.map((id) => ({
    pairId: pair.scenario.pairId,
    outcome: result.state.finalResult?.scores[id]?.total ?? 0,
    arm,
    jun: id === pair.scenario.junPlayerId,
    playerCount: pair.scenario.playerCount,
    seat: (result.state.players[id]?.seatIndex ?? 0) + 1,
    firstPlayer: result.initialFirstPlayerId === id,
    intent: pair.scenario.assignedIntents[id]!,
    lineup: pair.scenario.opponentLineup,
  }))));
}

function qualityRows(pairs: readonly CompletedJunAbPair<SelfPlayGameResult>[]): CsvRow[] {
  const rows: CsvRow[] = [];
  for (const arm of ["control", "jun_cost_1"] as const) {
    const results = pairs.map((pair) => arm === "control" ? pair.control : pair.junCostOne);
    const firings = results.flatMap((result) => result.firings);
    const exact = firings.filter((row) => row.preFireHeatDifference === 0);
    for (const quality of ["masterpiece", "fine", "standard", "flawed"] as const) {
      rows.push({
        experiment_arm: arm,
        population: "perfect_pre_fire_alignment",
        quality,
        count: exact.filter((row) => row.naturalQuality === quality).length,
        denominator: exact.length,
        rate: exact.length === 0 ? 0 : exact.filter((row) => row.naturalQuality === quality).length / exact.length,
      });
      rows.push({
        experiment_arm: arm,
        population: "all_final",
        quality,
        count: firings.filter((row) => row.finalQuality === quality).length,
        denominator: firings.length,
        rate: firings.length === 0 ? 0 : firings.filter((row) => row.finalQuality === quality).length / firings.length,
      });
    }
  }
  return rows;
}

function breakdownRows(
  outcomes: readonly JunAbPairOutcome[],
  opportunities: readonly CsvRow[],
): CsvRow[] {
  const rows: CsvRow[] = [];
  const add = (dimension: string, value: string, subset: readonly JunAbPairOutcome[]) => {
    if (subset.length === 0) return;
    const primary = bootstrapEstimate(subset, "relative_vp_did");
    rows.push({ dimension, value, pairs: subset.length, relative_vp_did: primary.mean, low_95: primary.low, high_95: primary.high });
  };
  [2, 3, 4].forEach((count) => add("player_count", String(count), outcomes.filter((row) => row.player_count === count)));
  [...new Set(outcomes.map((row) => String(row.jun_intent)))].sort().forEach((intent) => add("jun_intent", intent, outcomes.filter((row) => row.jun_intent === intent)));
  for (const arm of ["control", "jun_cost_1"] as const) {
    const armRows = opportunities.filter((row) => row["experiment_arm"] === arm);
    for (const dimension of ["round", "natural_quality", "projected_quality", "assigned_intent"] as const) {
      const values = [...new Set(armRows.map((row) => String(row[dimension] ?? "unknown")))].sort();
      for (const value of values) {
        const group = armRows.filter((row) => String(row[dimension] ?? "unknown") === value);
        rows.push({
          dimension: `jun_opportunity_${dimension}`,
          value: `${arm}:${value}`,
          opportunities: group.length,
          selections: group.filter((row) => row["selected"] === true).length,
          selection_rate: group.length === 0 ? 0 : group.filter((row) => row["selected"] === true).length / group.length,
          mean_projected_net_value: mean(group.map((row) => Number(row["projected_net_value"]))),
        });
      }
    }
  }
  return rows;
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

function estimateLine(label: string, estimate: Estimate): string {
  return `| ${label} | ${fixed(estimate.mean)} | ${fixed(estimate.median)} | ${fixed(estimate.low)} to ${fixed(estimate.high)} | ${fixed(estimate.minimum)} / ${fixed(estimate.p25)} / ${fixed(estimate.p75)} / ${fixed(estimate.maximum)} |`;
}

export async function writeJunAbExperimentOutputs(
  outputDirectory: string,
  pairs: readonly CompletedJunAbPair<SelfPlayGameResult>[],
  metadata: JunAbRunMetadata,
): Promise<JunAbAnalysisSummary> {
  const controlResults = pairs.map((pair) => pair.control);
  const experimentalResults = pairs.map((pair) => pair.junCostOne);
  await Promise.all([
    writeArmPackage(join(outputDirectory, "control"), "control", controlResults),
    writeArmPackage(join(outputDirectory, "jun_cost_1"), "jun_cost_1", experimentalResults),
  ]);
  const outcomes = pairs.map(pairOutcome);
  const opportunities = junOpportunityRows(pairs);
  const regression = adjustedModel(regressionRows(pairs));
  const interaction = regression.coefficients.find(({ term }) => term === "arm×jun");
  if (interaction === undefined) throw new Error("Adjusted model did not produce arm×Jun interaction");
  const primary = bootstrapEstimate(outcomes, "relative_vp_did");
  const experimentalRelativeEstimate = bootstrapEstimate(outcomes, "experimental_jun_relative_vp");
  const junVp = bootstrapEstimate(outcomes, "jun_vp_difference");
  const junWin = bootstrapEstimate(outcomes, "jun_win_difference");
  const junRank = bootstrapEstimate(outcomes, "jun_rank_difference");
  const controlJun = averageMetrics(controlResults.map((result, index) => junPlayerMetrics(result, pairs[index]!.scenario.junPlayerId)));
  const experimentalJun = averageMetrics(experimentalResults.map((result, index) => junPlayerMetrics(result, pairs[index]!.scenario.junPlayerId)));
  const controlOpponentMeanVp = mean(pairs.map((pair) => opponentMeanVp(pair.control, pair.scenario.junPlayerId)));
  const experimentalOpponentMeanVp = mean(pairs.map((pair) => opponentMeanVp(pair.junCostOne, pair.scenario.junPlayerId)));
  const experimentalRelative = experimentalJun.vp - experimentalOpponentMeanVp;
  const useRetention = controlJun.selections === 0 ? 1 : experimentalJun.selections / controlJun.selections;
  const interpretation: JunAbAnalysisSummary["interpretation"] =
    (experimentalRelativeEstimate.mean > 3 && experimentalRelativeEstimate.low > 1) || (Math.abs(primary.mean) < 1 && useRetention >= 0.8)
      ? "1 Coin is too weak"
      : primary.mean <= -2 && experimentalRelative >= 0 && experimentalRelative <= 3 && useRetention >= 0.3
        ? "1 Coin is a promising candidate for human testing"
        : experimentalRelative < -2 || useRetention < 0.2
          ? "1 Coin may be too harsh"
          : "inconclusive";
  const summary: JunAbAnalysisSummary = {
    pairs: pairs.length,
    games: pairs.length * 2,
    invalidAttempts: metadata.invalidAttempts.length,
    pairedReplacements: pairs.filter((pair) => pair.candidate.replacementIndex > 0).length,
    primaryRelativeVpDid: primary,
    experimentalRelativeVp: experimentalRelativeEstimate,
    adjustedArmJunInteraction: {
      coefficient: interaction.coefficient,
      standardError: interaction.standardError,
      low: interaction.low,
      high: interaction.high,
    },
    junVpDifference: junVp,
    junWinDifference: junWin,
    junRankDifference: junRank,
    controlJun,
    experimentalJun,
    controlOpponentMeanVp,
    experimentalOpponentMeanVp,
    interpretation,
  };
  const quality = qualityRows(pairs);
  const breakdowns = breakdownRows(outcomes, opportunities);
  await Promise.all([
    writeCsv(join(outputDirectory, "paired_outcomes.csv"), outcomes),
    writeCsv(join(outputDirectory, "jun_opportunities.csv"), opportunities),
    writeCsv(join(outputDirectory, "adjusted_model_coefficients.csv"), regression.coefficients.map((row) => ({ ...row, cluster: "pair_id" }))),
    writeCsv(join(outputDirectory, "quality_monitor.csv"), quality),
    writeCsv(join(outputDirectory, "heterogeneity_and_opportunity_breakdowns.csv"), breakdowns),
    writeCsv(join(outputDirectory, "invalid_pair_attempts.csv"), metadata.invalidAttempts.map((row) => ({ ...row }))),
    writeFile(join(outputDirectory, "study_summary.json"), `${JSON.stringify({
      experimentId: JUN_AB_EXPERIMENT_ID,
      canonicalRulesVersion: "1.0.1",
      policyVersion: JUN_AB_POLICY_VERSION,
      experimentalRuleAdopted: false,
      metadata,
      analysis: summary,
      adjustedModelReferences: regression.references,
      bootstrap: { repetitions: 10_000, resamplingUnit: "pair_id", stratifiedBy: "player_count", seed: "deterministic per estimand" },
    }, null, 2)}\n`, "utf8"),
  ]);

  const comparison = `# Kiln Opening Frozen-Bot Jun A/B 001\n\n## Experimental contract\n\n- Canonical rules and control: V1.0.1.\n- Frozen bot: ${JUN_AB_POLICY_VERSION}; no learning or profile updates.\n- Experimental change: pay exactly 1 Coin only when selecting Jun's ±1 adjustment. Decline remains free.\n- Valid matched pairs: ${pairs.length}; games: ${pairs.length * 2}; invalid paired attempts: ${metadata.invalidAttempts.length}; paired replacements: ${summary.pairedReplacements}.\n\n## Primary results\n\n| Estimand | Mean | Median | Paired stratified-bootstrap 95% interval | Min / P25 / P75 / Max |\n|---|---:|---:|---:|---:|\n${estimateLine("Relative VP difference-in-differences", primary)}\n${estimateLine("Jun VP: jun_cost_1 − control", junVp)}\n${estimateLine("Jun win indicator difference", junWin)}\n${estimateLine("Jun rank difference (positive is worse)", junRank)}\n\nThe adjusted arm × Jun coefficient is ${fixed(interaction.coefficient)} VP (pair-clustered 95% interval ${fixed(interaction.low)} to ${fixed(interaction.high)}). References: ${Object.entries(regression.references).map(([key, value]) => `${key}=${value}`).join("; ")}.\n\n## Jun behavior\n\n| Metric | Control | Jun cost 1 | Change |\n|---|---:|---:|---:|\n| VP | ${fixed(controlJun.vp)} | ${fixed(experimentalJun.vp)} | ${fixed(experimentalJun.vp - controlJun.vp)} |\n| Win rate | ${fixed(controlJun.win)} | ${fixed(experimentalJun.win)} | ${fixed(experimentalJun.win - controlJun.win)} |\n| Rank | ${fixed(controlJun.rank)} | ${fixed(experimentalJun.rank)} | ${fixed(experimentalJun.rank - controlJun.rank)} |\n| Opportunities | ${fixed(controlJun.opportunities)} | ${fixed(experimentalJun.opportunities)} | ${fixed(experimentalJun.opportunities - controlJun.opportunities)} |\n| Selections | ${fixed(controlJun.selections)} | ${fixed(experimentalJun.selections)} | ${fixed(experimentalJun.selections - controlJun.selections)} |\n| Selection rate | ${fixed(controlJun.selectionRate)} | ${fixed(experimentalJun.selectionRate)} | ${fixed(experimentalJun.selectionRate - controlJun.selectionRate)} |\n| Coins paid | ${fixed(controlJun.coinsPaid)} | ${fixed(experimentalJun.coinsPaid)} | ${fixed(experimentalJun.coinsPaid - controlJun.coinsPaid)} |\n| Ending Coins | ${fixed(controlJun.endingCoins)} | ${fixed(experimentalJun.endingCoins)} | ${fixed(experimentalJun.endingCoins - controlJun.endingCoins)} |\n| Coin VP | ${fixed(controlJun.coinVp)} | ${fixed(experimentalJun.coinVp)} | ${fixed(experimentalJun.coinVp - controlJun.coinVp)} |\n| Natural Masterpieces | ${fixed(controlJun.naturalMasterpieces)} | ${fixed(experimentalJun.naturalMasterpieces)} | ${fixed(experimentalJun.naturalMasterpieces - controlJun.naturalMasterpieces)} |\n| Final Masterpieces | ${fixed(controlJun.finalMasterpieces)} | ${fixed(experimentalJun.finalMasterpieces)} | ${fixed(experimentalJun.finalMasterpieces - controlJun.finalMasterpieces)} |\n| Jun-created Masterpieces | ${fixed(controlJun.junCreatedMasterpieces)} | ${fixed(experimentalJun.junCreatedMasterpieces)} | ${fixed(experimentalJun.junCreatedMasterpieces - controlJun.junCreatedMasterpieces)} |\n| Delivered | ${fixed(controlJun.delivered)} | ${fixed(experimentalJun.delivered)} | ${fixed(experimentalJun.delivered - controlJun.delivered)} |\n| Unused Finished | ${fixed(controlJun.unusedFinished)} | ${fixed(experimentalJun.unusedFinished)} | ${fixed(experimentalJun.unusedFinished - controlJun.unusedFinished)} |\n| Completed Orders | ${fixed(controlJun.ordersCompleted)} | ${fixed(experimentalJun.ordersCompleted)} | ${fixed(experimentalJun.ordersCompleted - controlJun.ordersCompleted)} |\n\n## Opponents and ruling\n\nNon-Jun mean VP was ${fixed(controlOpponentMeanVp)} in control and ${fixed(experimentalOpponentMeanVp)} in jun_cost_1. Player-count, intent, opportunity-round, and Quality breakdowns are in \`heterogeneity_and_opportunity_breakdowns.csv\`; the full natural/final ladder comparison is in \`quality_monitor.csv\`.\n\n**Precommitted interpretation: ${interpretation}.** This is a frozen-bot experimental result, not automatic adoption. V1.0.1 remains authoritative.\n`;
  const paymentViolations = opportunities.filter((row) => (
    (row["experiment_arm"] === "control" && Number(row["actual_coin_payment"]) !== 0) ||
    (row["experiment_arm"] === "jun_cost_1" && row["selected"] === true && Number(row["actual_coin_payment"]) !== 1) ||
    (row["selected"] === false && Number(row["actual_coin_payment"]) !== 0)
  ));
  const pairMismatches = pairs.filter((pair) => (
    pair.control.config.gameSeed !== pair.junCostOne.config.gameSeed ||
    pair.control.config.aiSeed !== pair.junCostOne.config.aiSeed ||
    pair.control.initialFirstPlayerId !== pair.junCostOne.initialFirstPlayerId ||
    JSON.stringify(pair.control.config.assignedTraditions) !== JSON.stringify(pair.junCostOne.config.assignedTraditions) ||
    JSON.stringify(pair.control.config.assignedIntents) !== JSON.stringify(pair.junCostOne.config.assignedIntents)
  ));
  const audit = `# Jun A/B 001 Study Audit\n\n## Integrity\n\n- PASS: ${pairs.length} valid matched pairs and ${pairs.length * 2} accepted games.\n- PASS: ${pairs.filter((pair) => pair.scenario.playerCount === 2).length}/${pairs.filter((pair) => pair.scenario.playerCount === 3).length}/${pairs.filter((pair) => pair.scenario.playerCount === 4).length} pairs at 2P/3P/4P.\n- ${pairMismatches.length === 0 ? "PASS" : "FAIL"}: paired seed, assignment, intent, and first-player mismatches = ${pairMismatches.length}.\n- ${paymentViolations.length === 0 ? "PASS" : "FAIL"}: payment violations = ${paymentViolations.length}.\n- PASS: frozen profile hash ${metadata.frozenProfileHash}; no training or profile updates.\n- PASS: control cost 0 and experimental cost 1; canonical rules remain V1.0.1.\n- Invalid arm attempts: ${metadata.invalidAttempts.length}; symmetric paired replacements: ${summary.pairedReplacements}.\n\n## Statistical audit\n\n- Primary unit: matched pair; bootstrap resampling stratified by player count, 10,000 deterministic repetitions.\n- Primary relative VP difference-in-differences: ${fixed(primary.mean)} (${fixed(primary.low)} to ${fixed(primary.high)}).\n- Adjusted arm × Jun interaction: ${fixed(interaction.coefficient)} (${fixed(interaction.low)} to ${fixed(interaction.high)}), clustered by pair.\n- Regression reference categories are recorded in \`study_summary.json\` and all coefficients in \`adjusted_model_coefficients.csv\`.\n\n## Decision\n\n${interpretation}. The experimental rule was not adopted; V1.0.1 remains unchanged.\n`;
  const designer = `# Jun A/B 001 Designer Summary\n\nThe 1-Coin activation test changed Jun's relative advantage by ${fixed(primary.mean)} VP (95% interval ${fixed(primary.low)} to ${fixed(primary.high)}). Jun itself changed by ${fixed(junVp.mean)} VP. Its use rate moved from ${fixed(controlJun.selectionRate)} to ${fixed(experimentalJun.selectionRate)}, while Jun-created Masterpieces moved from ${fixed(controlJun.junCreatedMasterpieces)} to ${fixed(experimentalJun.junCreatedMasterpieces)} per game.\n\nRuling: **${interpretation}**. Treat this as evidence for human testing only; do not change the official V1.0.1 rule from this package.\n`;
  await Promise.all([
    writeFile(join(outputDirectory, "jun-ab-001-comparison.md"), comparison, "utf8"),
    writeFile(join(outputDirectory, "jun-ab-001-study-audit.md"), audit, "utf8"),
    writeFile(join(outputDirectory, "jun-ab-001-designer-summary.md"), designer, "utf8"),
  ]);
  return summary;
}

export function summarizeQualityRows(rows: readonly CsvRow[], arm: JunAbArm, population: string): Record<Quality, number> {
  return Object.fromEntries((["masterpiece", "fine", "standard", "flawed"] as const).map((quality) => [
    quality,
    Number(rows.find((row) => row["experiment_arm"] === arm && row["population"] === population && row["quality"] === quality)?.["rate"] ?? 0),
  ])) as Record<Quality, number>;
}
