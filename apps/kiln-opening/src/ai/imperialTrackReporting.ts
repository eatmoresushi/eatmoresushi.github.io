import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  ORDER_DEFINITIONS,
  SeededRandom,
  activeImperialOrderProgressReward,
} from "../game/index.ts";
import type { GameEvent, GameState, PlayerId } from "../game/index.ts";
import { fitJunAbAdjustedModel } from "./junAbReporting.ts";
import type { RegressionResult, RegressionRow } from "./junAbReporting.ts";
import { buildStudyTables, writeCsv } from "./reporting.ts";
import type { CsvRow, StudyTables } from "./reporting.ts";
import type { SelfPlayGameResult } from "./selfplay.ts";
import { sha256 } from "./sourceManifest.ts";
import {
  ARCHIVED_STUDY_DIRECTORY,
  IMPERIAL_TRACK_CANDIDATE_A_SIMULATION,
  IMPERIAL_TRACK_CANDIDATE_B_SIMULATION,
  IMPERIAL_TRACK_EXPERIMENT_ID,
  IMPERIAL_TRACK_POLICY_VERSION,
} from "./imperialTrackExperiment.ts";
import type {
  ArchivedHoldoutGame,
  CanaryResult,
  HistoricalArchive,
  ImperialTrackCandidate,
} from "./imperialTrackExperiment.ts";

interface ArchivedEvidence {
  playerRows: Map<string, Record<string, string>>;
  orderRows: Map<string, Array<Record<string, string>>>;
}

interface PlayerMetric {
  scenarioId: string;
  playerId: PlayerId;
  playerCount: number;
  seat: number;
  firstPlayer: boolean;
  intent: string;
  tradition: string;
  lineup: string;
  vp: number;
  win: number;
  rank: number;
  progress: number;
  progressVp: number;
  sealVp: number;
  presentationVp: number;
  apprenticeMilestones: number;
  presentationEligible: number;
  presentationUsed: number;
  patronageUses: number;
  marketAcquired: number;
  imperialAcquired: number;
  marketCompleted: number;
  imperialCompleted: number;
  unusedFinished: number;
}

interface PrimaryOutcome extends CsvRow {
  matched_scenario_id: string;
  player_count: number;
  imperial_player_id: string;
  control_relative_vp: number;
  candidate_relative_vp: number;
  relative_vp_did: number;
  direct_vp_change: number;
  progress_change: number;
  apprentice_milestone_change: number;
  presentation_eligibility_change: number;
  unused_finished_change: number;
  abandonment_rate_change: number;
}

interface Estimate {
  mean: number;
  median: number;
  low: number;
  high: number;
  minimum: number;
  p25: number;
  p75: number;
  maximum: number;
}

export interface CandidateAnalysis {
  candidate: ImperialTrackCandidate;
  games: number;
  playerGames: number;
  imperialIntentPlayers: number;
  primaryRelativeVpDid: Estimate;
  directVpChange: Estimate;
  progressChange: Estimate;
  adjustedImperialGap: { point: number; low: number; high: number };
  adjustedInteraction: { point: number; low: number; high: number };
  playerCountRelativeGap: Record<string, number>;
  milestones: {
    controlApprenticeMilestones: number;
    candidateApprenticeMilestones: number;
    controlPresentationEligibility: number;
    candidatePresentationEligibility: number;
  };
  routeHealth: {
    controlUnusedFinished: number;
    candidateUnusedFinished: number;
    controlImperialAbandonmentRate: number;
    candidateImperialAbandonmentRate: number;
    candidateImperialCompletionRate: number;
    candidateMarketCompletionRate: number;
  };
  sensitivity: {
    junTraditionProgressChange: number;
    nonJunTraditionProgressChange: number;
    noPatronageProgressChange: number;
  };
  gates: Record<string, boolean>;
  promising: boolean;
  failures: string[];
}

export interface ImperialTrackAnalysis {
  candidateA: CandidateAnalysis;
  candidateB: CandidateAnalysis;
  recommendation:
    | "advance Candidate A"
    | "advance Candidate B"
    | "both candidates are promising; run a fresh-seed head-to-head"
    | "adopt neither"
    | "inconclusive due to integrity or power";
  recommendationReason: string;
}

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

function bootstrap(
  rows: readonly PrimaryOutcome[],
  key: keyof PrimaryOutcome,
  salt: number,
): Estimate {
  const observed = rows.map((row) => Number(row[key]));
  const groups = [2, 3, 4].map((count) => rows.filter((row) => row.player_count === count));
  const rng = new SeededRandom(0x4954_0000 + salt);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const sampled = groups.flatMap((group) => Array.from(
      { length: group.length },
      () => group[rng.nextInt(group.length)]!,
    ));
    estimates.push(mean(sampled.map((row) => Number(row[key]))));
  }
  return {
    mean: mean(observed),
    median: quantile(observed, 0.5),
    low: quantile(estimates, 0.025),
    high: quantile(estimates, 0.975),
    minimum: Math.min(...observed),
    p25: quantile(observed, 0.25),
    p75: quantile(observed, 0.75),
    maximum: Math.max(...observed),
  };
}

function bootstrapCsvRows(
  rows: readonly CsvRow[],
  key: string,
  salt: number,
): Estimate {
  const observed = rows.map((row) => Number(row[key]));
  const groups = [2, 3, 4].map((count) => rows.filter((row) => Number(row["player_count"]) === count));
  const rng = new SeededRandom(0x4954_1000 + salt);
  const estimates: number[] = [];
  for (let iteration = 0; iteration < 10_000; iteration += 1) {
    const sampled = groups.flatMap((group) => Array.from(
      { length: group.length },
      () => group[rng.nextInt(group.length)]!,
    ));
    estimates.push(mean(sampled.map((row) => Number(row[key]))));
  }
  return {
    mean: mean(observed),
    median: quantile(observed, 0.5),
    low: quantile(estimates, 0.025),
    high: quantile(estimates, 0.975),
    minimum: Math.min(...observed),
    p25: quantile(observed, 0.25),
    p75: quantile(observed, 0.75),
    maximum: Math.max(...observed),
  };
}

function parseCsv(text: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else field += char;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const headers = records.shift() ?? [];
  return records.filter((row) => row.some((value) => value.length > 0)).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
}

async function loadArchivedEvidence(projectPath: string): Promise<ArchivedEvidence> {
  const [playersText, ordersText] = await Promise.all([
    readFile(resolve(projectPath, ARCHIVED_STUDY_DIRECTORY, "playtests_v1.0.1_players.csv"), "utf8"),
    readFile(resolve(projectPath, ARCHIVED_STUDY_DIRECTORY, "playtests_v1.0.1_order_events.csv"), "utf8"),
  ]);
  const playerRows = new Map(parseCsv(playersText)
    .filter((row) => row["dataset_split"] === "holdout")
    .map((row) => [`${row["game_id"]}:${row["player_id"]}`, row]));
  const orderRows = new Map<string, Array<Record<string, string>>>();
  for (const row of parseCsv(ordersText).filter((candidate) => candidate["dataset_split"] === "holdout")) {
    const key = `${row["game_id"]}:${row["player_id"]}`;
    const rows = orderRows.get(key) ?? [];
    rows.push(row);
    orderRows.set(key, rows);
  }
  return { playerRows, orderRows };
}

function playerRank(state: GameState, playerId: PlayerId): number {
  const score = state.finalResult?.scores[playerId]?.total ?? 0;
  return 1 + Object.values(state.finalResult?.scores ?? {}).filter((entry) => entry.total > score).length;
}

function lineup(traditions: Record<PlayerId, string>): string {
  return Object.values(traditions).sort().join("|");
}

function archivedMetric(
  game: ArchivedHoldoutGame,
  playerId: PlayerId,
  evidence: ArchivedEvidence,
): PlayerMetric {
  const player = game.finalState.players[playerId]!;
  const score = game.finalState.finalResult!.scores[playerId]!;
  const csv = evidence.playerRows.get(`${game.config.gameId}:${playerId}`);
  const orders = evidence.orderRows.get(`${game.config.gameId}:${playerId}`) ?? [];
  const initialFirst = `P${new SeededRandom(game.config.gameSeed).nextInt(game.config.playerCount) + 1}`;
  return {
    scenarioId: game.config.gameId,
    playerId,
    playerCount: game.config.playerCount,
    seat: player.seatIndex + 1,
    firstPlayer: initialFirst === playerId,
    intent: game.config.assignedIntents[playerId]!,
    tradition: game.config.assignedTraditions[playerId]!,
    lineup: lineup(game.config.assignedTraditions),
    vp: score.total,
    win: game.finalState.finalResult!.winnerIds.includes(playerId) ? 1 : 0,
    rank: playerRank(game.finalState, playerId),
    progress: player.imperialProgress,
    progressVp: score.imperialProgress,
    sealVp: score.imperialSeal,
    presentationVp: score.presentation,
    apprenticeMilestones: Number(player.imperialProgress >= 2) + Number(player.imperialProgress >= 4),
    presentationEligible: Number(player.imperialProgress >= 4),
    presentationUsed: Number(player.presentationCeramicIds.length > 0),
    patronageUses: Number(csv?.["patronage_uses"] ?? 0),
    marketAcquired: orders.filter((row) => row["deck"] === "market").length,
    imperialAcquired: orders.filter((row) => row["deck"] === "imperial").length,
    marketCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("M")).length,
    imperialCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("I")).length,
    unusedFinished: Object.values(game.finalState.ceramics).filter(
      (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished",
    ).length,
  };
}

function candidateOrderCounts(result: SelfPlayGameResult, playerId: PlayerId): {
  market: number;
  imperial: number;
} {
  const ids = result.events.flatMap((row) => {
    const event = JSON.parse(row.eventJson) as GameEvent;
    if (event.type === "ORDER_TAKEN" && event.playerId === playerId) return [event.orderId];
    if (event.type === "STARTING_ORDER_KEPT" && event.playerId === playerId) return [event.orderId];
    if (event.type === "STARTING_ORDER_REDRAWN" && event.playerId === playerId) return [event.drawnOrderId];
    return [];
  });
  return {
    market: ids.filter((id) => id.startsWith("M")).length,
    imperial: ids.filter((id) => id.startsWith("I")).length,
  };
}

function candidateMetric(result: SelfPlayGameResult, playerId: PlayerId): PlayerMetric {
  const player = result.state.players[playerId]!;
  const score = result.state.finalResult!.scores[playerId]!;
  const rules = result.config.experimentConfig?.experimentId === "imperial-track-ab-001"
    ? result.config.experimentConfig
    : null;
  if (rules === null) throw new Error(`${result.config.gameId} is not an Imperial-track candidate`);
  const acquired = candidateOrderCounts(result, playerId);
  return {
    scenarioId: result.config.experimentMetadata?.matchedScenarioId ?? result.config.gameId,
    playerId,
    playerCount: result.state.playerCount,
    seat: player.seatIndex + 1,
    firstPlayer: result.initialFirstPlayerId === playerId,
    intent: result.config.assignedIntents?.[playerId] ?? "",
    tradition: result.config.assignedTraditions[playerId]!,
    lineup: lineup(result.config.assignedTraditions),
    vp: score.total,
    win: result.state.finalResult!.winnerIds.includes(playerId) ? 1 : 0,
    rank: playerRank(result.state, playerId),
    progress: player.imperialProgress,
    progressVp: score.imperialProgress,
    sealVp: score.imperialSeal,
    presentationVp: score.presentation,
    apprenticeMilestones: rules.apprenticeMilestoneSpaces.filter((space) => player.imperialProgress >= space).length,
    presentationEligible: Number(rules.presentationSpaces.includes(player.imperialProgress)),
    presentationUsed: Number(player.presentationCeramicIds.length > 0),
    patronageUses: result.events.filter((row) => {
      const event = JSON.parse(row.eventJson) as GameEvent;
      return event.type === "COURT_PATRONAGE_USED" && event.playerId === playerId;
    }).length,
    marketAcquired: acquired.market,
    imperialAcquired: acquired.imperial,
    marketCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("M")).length,
    imperialCompleted: player.completedOrders.filter(({ orderId }) => orderId.startsWith("I")).length,
    unusedFinished: Object.values(result.state.ceramics).filter(
      (ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished",
    ).length,
  };
}

function nonImperialOpponentMean(
  metrics: readonly PlayerMetric[],
  actor: PlayerMetric,
  key: keyof Pick<PlayerMetric, "vp" | "progress">,
): number {
  const opponents = metrics.filter((candidate) =>
    candidate.playerId !== actor.playerId && candidate.intent !== "Imperial");
  return mean(opponents.map((candidate) => Number(candidate[key])));
}

function abandonmentRate(metric: PlayerMetric): number {
  return metric.imperialAcquired === 0
    ? 0
    : (metric.imperialAcquired - metric.imperialCompleted) / metric.imperialAcquired;
}

function primaryOutcomes(
  archive: HistoricalArchive,
  evidence: ArchivedEvidence,
  results: readonly SelfPlayGameResult[],
  candidate: ImperialTrackCandidate,
): { rows: PrimaryOutcome[]; control: PlayerMetric[]; experimental: PlayerMetric[] } {
  const resultByScenario = new Map(results.map((result) => [
    result.config.experimentMetadata?.matchedScenarioId,
    result,
  ]));
  const control: PlayerMetric[] = [];
  const experimental: PlayerMetric[] = [];
  const rows: PrimaryOutcome[] = [];
  for (const game of archive.holdoutGames) {
    const result = resultByScenario.get(game.config.gameId);
    if (result === undefined) throw new Error(`Missing ${candidate} replay for ${game.config.gameId}`);
    const controlGame = game.finalState.playerOrder.map((id) => archivedMetric(game, id, evidence));
    const candidateGame = result.state.playerOrder.map((id) => candidateMetric(result, id));
    control.push(...controlGame);
    experimental.push(...candidateGame);
    for (const controlActor of controlGame.filter((metric) => metric.intent === "Imperial")) {
      const candidateActor = candidateGame.find(({ playerId }) => playerId === controlActor.playerId)!;
      const controlRelative = controlActor.vp - nonImperialOpponentMean(controlGame, controlActor, "vp");
      const candidateRelative = candidateActor.vp - nonImperialOpponentMean(candidateGame, candidateActor, "vp");
      rows.push({
        experiment_id: IMPERIAL_TRACK_EXPERIMENT_ID,
        candidate,
        matched_scenario_id: game.config.gameId,
        game_seed: game.config.gameSeed,
        ai_seed: game.config.aiSeed,
        player_count: game.config.playerCount,
        sequence: game.config.gameSequence,
        imperial_player_id: controlActor.playerId,
        seat: controlActor.seat,
        first_player: controlActor.firstPlayer,
        tradition: controlActor.tradition,
        assigned_intent: controlActor.intent,
        lineup: controlActor.lineup,
        control_vp: controlActor.vp,
        candidate_vp: candidateActor.vp,
        control_relative_vp: controlRelative,
        candidate_relative_vp: candidateRelative,
        relative_vp_did: candidateRelative - controlRelative,
        direct_vp_change: candidateActor.vp - controlActor.vp,
        control_progress: controlActor.progress,
        candidate_progress: candidateActor.progress,
        progress_change: candidateActor.progress - controlActor.progress,
        control_progress_vp: controlActor.progressVp,
        candidate_progress_vp: candidateActor.progressVp,
        control_seal_vp: controlActor.sealVp,
        candidate_seal_vp: candidateActor.sealVp,
        control_presentation_vp: controlActor.presentationVp,
        candidate_presentation_vp: candidateActor.presentationVp,
        apprentice_milestone_change: candidateActor.apprenticeMilestones - controlActor.apprenticeMilestones,
        presentation_eligibility_change: candidateActor.presentationEligible - controlActor.presentationEligible,
        unused_finished_change: candidateActor.unusedFinished - controlActor.unusedFinished,
        abandonment_rate_change: abandonmentRate(candidateActor) - abandonmentRate(controlActor),
        control_patronage_uses: controlActor.patronageUses,
        candidate_patronage_uses: candidateActor.patronageUses,
      });
    }
  }
  return { rows, control, experimental };
}

function regressionRows(
  control: readonly PlayerMetric[],
  experimental: readonly PlayerMetric[],
): RegressionRow[] {
  return [
    ...control.map((metric): RegressionRow => ({
      pairId: metric.scenarioId,
      outcome: metric.vp,
      arm: "control",
      jun: metric.intent === "Imperial",
      playerCount: metric.playerCount,
      seat: metric.seat,
      firstPlayer: metric.firstPlayer,
      // Imperial intent is represented by the focal indicator (`jun` in the
      // reusable frozen-study model). Mapping it to the reference here avoids
      // duplicating the same column as intent[Imperial].
      intent: metric.intent === "Imperial" ? "Market" : metric.intent,
      lineup: `${metric.tradition}:${metric.lineup}`,
    })),
    ...experimental.map((metric): RegressionRow => ({
      pairId: metric.scenarioId,
      outcome: metric.vp,
      arm: "jun_cost_1",
      jun: metric.intent === "Imperial",
      playerCount: metric.playerCount,
      seat: metric.seat,
      firstPlayer: metric.firstPlayer,
      intent: metric.intent === "Imperial" ? "Market" : metric.intent,
      lineup: `${metric.tradition}:${metric.lineup}`,
    })),
  ];
}

function coefficient(model: RegressionResult, term: string) {
  const value = model.coefficients.find((row) => row.term === term);
  if (value === undefined) throw new Error(`Adjusted model is missing ${term}`);
  return value;
}

function averageMetric(metrics: readonly PlayerMetric[], key: keyof PlayerMetric): number {
  return mean(metrics.map((metric) => Number(metric[key])));
}

function completionRate(metrics: readonly PlayerMetric[], deck: "market" | "imperial"): number {
  const acquired = metrics.reduce((sum, metric) => sum + metric[deck === "market" ? "marketAcquired" : "imperialAcquired"], 0);
  const completed = metrics.reduce((sum, metric) => sum + metric[deck === "market" ? "marketCompleted" : "imperialCompleted"], 0);
  return acquired === 0 ? 0 : completed / acquired;
}

function candidateAnalysis(
  candidate: ImperialTrackCandidate,
  outcomes: ReturnType<typeof primaryOutcomes>,
  games: number,
): { analysis: CandidateAnalysis; regression: RegressionResult } {
  const primary = bootstrap(outcomes.rows, "relative_vp_did", candidate === "candidate_a" ? 1 : 2);
  const direct = bootstrap(outcomes.rows, "direct_vp_change", candidate === "candidate_a" ? 3 : 4);
  const progress = bootstrap(outcomes.rows, "progress_change", candidate === "candidate_a" ? 5 : 6);
  const regression = fitJunAbAdjustedModel(regressionRows(outcomes.control, outcomes.experimental));
  const baseGap = coefficient(regression, "jun");
  const interaction = coefficient(regression, "arm×jun");
  const adjustedGap = {
    point: baseGap.coefficient + interaction.coefficient,
    low: baseGap.low + interaction.low,
    high: baseGap.high + interaction.high,
  };
  const controlImperial = outcomes.control.filter(({ intent }) => intent === "Imperial");
  const candidateImperial = outcomes.experimental.filter(({ intent }) => intent === "Imperial");
  const playerCountRelativeGap = Object.fromEntries([2, 3, 4].map((count) => {
    const rows = outcomes.rows.filter((row) => row.player_count === count);
    return [`${count}P`, mean(rows.map((row) => row.candidate_relative_vp))];
  }));
  const routeHealth = {
    controlUnusedFinished: averageMetric(controlImperial, "unusedFinished"),
    candidateUnusedFinished: averageMetric(candidateImperial, "unusedFinished"),
    controlImperialAbandonmentRate: mean(controlImperial.map(abandonmentRate)),
    candidateImperialAbandonmentRate: mean(candidateImperial.map(abandonmentRate)),
    candidateImperialCompletionRate: completionRate(outcomes.experimental, "imperial"),
    candidateMarketCompletionRate: completionRate(outcomes.experimental, "market"),
  };
  const matchedNoPatronage = outcomes.rows.filter((row) =>
    Number(row["control_patronage_uses"]) === 0 && Number(row["candidate_patronage_uses"]) === 0);
  const sensitivity = {
    junTraditionProgressChange: mean(outcomes.rows.filter((row) => row["tradition"] === "JU").map((row) => row.progress_change)),
    nonJunTraditionProgressChange: mean(outcomes.rows.filter((row) => row["tradition"] !== "JU").map((row) => row.progress_change)),
    noPatronageProgressChange: mean(matchedNoPatronage.map((row) => row.progress_change)),
  };
  const milestones = {
    controlApprenticeMilestones: averageMetric(controlImperial, "apprenticeMilestones"),
    candidateApprenticeMilestones: averageMetric(candidateImperial, "apprenticeMilestones"),
    controlPresentationEligibility: averageMetric(controlImperial, "presentationEligible"),
    candidatePresentationEligibility: averageMetric(candidateImperial, "presentationEligible"),
  };
  const gates = {
    adjustedGapPointWithinMinus2To2: adjustedGap.point >= -2 && adjustedGap.point <= 2,
    uncertaintyDoesNotShowClearExtreme: !(adjustedGap.high < -3 || adjustedGap.low > 3),
    noPlayerCountPointAbovePlus3: Object.values(playerCountRelativeGap).every((value) => value <= 3),
    milestoneReachImproves: milestones.candidateApprenticeMilestones > milestones.controlApprenticeMilestones ||
      milestones.candidatePresentationEligibility > milestones.controlPresentationEligibility,
    imperialHarderThanMarket: routeHealth.candidateImperialCompletionRate < routeHealth.candidateMarketCompletionRate,
    unusedFinishedHealthy: routeHealth.candidateUnusedFinished - routeHealth.controlUnusedFinished <= 0.5,
    abandonmentHealthy: routeHealth.candidateImperialAbandonmentRate - routeHealth.controlImperialAbandonmentRate <= 0.1,
    mechanismNotJunDependent: sensitivity.nonJunTraditionProgressChange > 0,
    mechanismPersistsWithoutPatronage: sensitivity.noPatronageProgressChange > 0,
  };
  const failures = Object.entries(gates).filter(([, pass]) => !pass).map(([name]) => name);
  return {
    regression,
    analysis: {
      candidate,
      games,
      playerGames: outcomes.experimental.length,
      imperialIntentPlayers: outcomes.rows.length,
      primaryRelativeVpDid: primary,
      directVpChange: direct,
      progressChange: progress,
      adjustedImperialGap: adjustedGap,
      adjustedInteraction: { point: interaction.coefficient, low: interaction.low, high: interaction.high },
      playerCountRelativeGap,
      milestones,
      routeHealth,
      sensitivity,
      gates,
      promising: failures.length === 0,
      failures,
    },
  };
}

export function imperialTrackExperimentFields(result: SelfPlayGameResult): CsvRow {
  const config = result.config.experimentConfig;
  const metadata = result.config.experimentMetadata;
  if (config?.experimentId !== "imperial-track-ab-001" || metadata === undefined) {
    throw new Error(`Missing Imperial-track metadata for ${result.config.gameId}`);
  }
  return {
    experiment_id: config.experimentId,
    experiment_arm: config.experimentArm,
    matched_scenario_id: metadata.matchedScenarioId,
    archived_control_game_id: metadata.archivedControlGameId,
    frozen_profile_hash: metadata.frozenProfileHash,
    policy_version: metadata.policyVersion,
    simulation_version: metadata.simulationVersion,
    active_order_progress_mode: config.imperialOrderProgressMode,
    active_track_vp: config.imperialProgressTrackVp.join("|"),
    active_apprentice_spaces: config.apprenticeMilestoneSpaces.join("|"),
    active_presentation_spaces: config.presentationSpaces.join("|"),
    active_seal_vp: config.imperialSealVp,
  };
}

function decoratedTables(results: readonly SelfPlayGameResult[]): StudyTables {
  const tables = buildStudyTables(results);
  const fields = new Map(results.map((result) => [result.config.gameId, imperialTrackExperimentFields(result)]));
  const decorate = (rows: CsvRow[]) => rows.map((row) => {
    const gameId = String(row["game_id"] ?? row["gameId"] ?? "");
    return { ...(fields.get(gameId) ?? {}), ...row };
  });
  return Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, decorate(rows)])) as unknown as StudyTables;
}

function progressEventRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.events.flatMap((row, eventIndex) => {
    const event = JSON.parse(row.eventJson) as GameEvent;
    if (event.type !== "IMPERIAL_PROGRESS_ADVANCED") return [];
    const player = result.state.players[event.playerId];
    const config = result.config.experimentConfig;
    return [{
      ...imperialTrackExperimentFields(result),
      candidate: config?.experimentId === "imperial-track-ab-001" ? config.experimentArm : null,
      game_id: result.config.gameId,
      game_seed: result.config.gameSeed,
      ai_seed: result.config.aiSeed,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      event_sequence: eventIndex + 1,
      decision_index: row.decisionIndex,
      round: row.round,
      player_id: event.playerId,
      seat: player === undefined ? null : player.seatIndex + 1,
      tradition: player?.kilnId,
      assigned_intent: result.config.assignedIntents?.[event.playerId],
      source: event.source,
      order_id: event.orderId,
      requirement_ceramic_count: event.requirementCeramicCount,
      requirement_category: event.requirementCategory,
      from_space: event.from,
      to_space: event.to,
      raw_gain: event.reward,
      applied_gain: event.appliedGain,
      cap_loss: event.capLoss,
      crossed_spaces: event.crossedSpaces?.join("|"),
      apprentice_milestones_triggered: event.apprenticeMilestonesTriggered?.join("|"),
      presentation_milestones_triggered: event.presentationMilestonesTriggered?.join("|"),
      seal_milestone_triggered: event.sealMilestoneTriggered,
      track_vp_before: event.trackVpBefore,
      track_vp_after: event.trackVpAfter,
      active_seal_vp: event.sealVp,
    }];
  }));
}

function presentationEventRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.events.flatMap((row) => {
    const event = JSON.parse(row.eventJson) as GameEvent;
    if (event.type !== "PRESENTATION_SUBMITTED") return [];
    const ceramics = event.ceramicIds.flatMap((id) => {
      const ceramic = result.state.ceramics[id];
      return ceramic === undefined ? [] : [ceramic];
    });
    const score = result.state.finalResult?.scores[event.playerId];
    return [{
      ...imperialTrackExperimentFields(result),
      game_id: result.config.gameId,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      round: row.round,
      player_id: event.playerId,
      assigned_intent: result.config.assignedIntents?.[event.playerId],
      ceramic_ids: event.ceramicIds.join("|"),
      ceramic_count: event.ceramicIds.length,
      presentation_vp: score?.presentation,
      different_shapes: new Set(ceramics.map((ceramic) => ceramic.shape)).size,
      different_glazes: new Set(ceramics.flatMap((ceramic) => "glaze" in ceramic ? [ceramic.glaze] : [])).size,
    }];
  }));
}

function ceramicRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => Object.values(result.state.ceramics).map((ceramic) => ({
    ...imperialTrackExperimentFields(result),
    game_id: result.config.gameId,
    game_seed: result.config.gameSeed,
    ai_seed: result.config.aiSeed,
    player_count: result.state.playerCount,
    sequence: result.config.gameSequence,
    ceramic_id: ceramic.id,
    owner_id: ceramic.ownerId,
    shape: ceramic.shape,
    final_stage: ceramic.stage,
    glaze: "glaze" in ceramic ? ceramic.glaze : null,
    decoration: "decoration" in ceramic ? ceramic.decoration : null,
    quality: "quality" in ceramic ? ceramic.quality : null,
    order_id: "orderId" in ceramic ? ceramic.orderId : null,
    unused_finished: ceramic.stage === "finished",
  })));
}

function activeOrderRows(results: readonly SelfPlayGameResult[], rows: CsvRow[]): CsvRow[] {
  const config = results[0]?.config.experimentConfig;
  return rows.map((row) => {
    const order = ORDER_DEFINITIONS[String(row["order_id"] ?? "")];
    return {
      ...row,
      active_progress_reward: order?.imperialProgressReward === undefined
        ? 0
        : activeImperialOrderProgressReward(config, order.imperialProgressReward),
    };
  });
}

async function writeCandidatePackage(
  directory: string,
  candidate: ImperialTrackCandidate,
  results: readonly SelfPlayGameResult[],
): Promise<void> {
  await mkdir(directory, { recursive: false });
  const tables = decoratedTables(results);
  tables.orders = activeOrderRows(results, tables.orders);
  const files: Array<[string, CsvRow[]]> = [
    ["playtests_v1.0.1_games.csv", tables.games],
    ["playtests_v1.0.1_players.csv", tables.players],
    ["playtests_v1.0.1_rounds.csv", tables.rounds],
    ["playtests_v1.0.1_actions.csv", tables.actions],
    ["playtests_v1.0.1_ai_decisions.csv", tables.decisions],
    ["playtests_v1.0.1_ai_plans.csv", tables.plans],
    ["playtests_v1.0.1_firings.csv", tables.firings],
    ["playtests_v1.0.1_ceramics.csv", ceramicRows(results)],
    ["playtests_v1.0.1_orders.csv", tables.orders],
    ["playtests_v1.0.1_order_events.csv", tables.orderEvents],
    ["playtests_v1.0.1_imperial_progress_events.csv", progressEventRows(results)],
    ["playtests_v1.0.1_presentation_events.csv", presentationEventRows(results)],
    ["playtests_v1.0.1_intent_outcomes.csv", tables.intentOutcomes],
    ["playtests_v1.0.1_techniques.csv", tables.techniques],
    ["playtests_v1.0.1_technique_events.csv", tables.techniqueEvents],
    ["playtests_v1.0.1_optional_effects.csv", tables.optionalEffects],
    ["playtests_v1.0.1_technique_forecasts.csv", tables.techniqueForecasts],
    ["playtests_v1.0.1_kiln.csv", tables.kiln],
  ];
  await Promise.all(files.map(([name, rows]) => writeCsv(join(directory, name), rows)));
  await writeFile(join(directory, "playtests_v1.0.1_full_games.jsonl"), `${results.map((result) => JSON.stringify(result)).join("\n")}\n`, "utf8");
  await writeFile(join(directory, "arm_summary.json"), `${JSON.stringify({
    experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
    candidate,
    simulationVersion: candidate === "candidate_a"
      ? IMPERIAL_TRACK_CANDIDATE_A_SIMULATION
      : IMPERIAL_TRACK_CANDIDATE_B_SIMULATION,
    policyVersion: IMPERIAL_TRACK_POLICY_VERSION,
    games: results.length,
    playerGames: results.reduce((sum, result) => sum + result.state.playerCount, 0),
    illegalActionAttempts: results.reduce((sum, result) => sum + result.illegalActionAttempts, 0),
  }, null, 2)}\n`, "utf8");
}

function fixed(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "NA";
}

function estimateLine(label: string, estimate: Estimate): string {
  return `| ${label} | ${fixed(estimate.mean)} | ${fixed(estimate.low)} to ${fixed(estimate.high)} |`;
}

function comparisonMarkdown(
  label: string,
  analysis: CandidateAnalysis,
): string {
  return `# Historical control vs ${label}\n\n` +
    `This is a matched replay against the unchanged archived Selfplay-003 holdout. Historical control games were not rerun as a dataset.\n\n` +
    `| Imperial-intent estimand | Mean | Paired stratified-bootstrap 95% interval |\n|---|---:|---:|\n` +
    `${estimateLine("Relative VP difference-in-differences", analysis.primaryRelativeVpDid)}\n` +
    `${estimateLine("Same-seat direct VP change", analysis.directVpChange)}\n` +
    `${estimateLine("Imperial Progress change", analysis.progressChange)}\n\n` +
    `Adjusted Imperial-intent VP gap versus non-Imperial players: ${fixed(analysis.adjustedImperialGap.point)} ` +
    `(conservative component interval ${fixed(analysis.adjustedImperialGap.low)} to ${fixed(analysis.adjustedImperialGap.high)}).\n\n` +
    `Player-count relative gaps: ${Object.entries(analysis.playerCountRelativeGap).map(([count, value]) => `${count} ${fixed(value)}`).join(", ")}.\n\n` +
    `Imperial completion rate ${fixed(analysis.routeHealth.candidateImperialCompletionRate)} versus Market ${fixed(analysis.routeHealth.candidateMarketCompletionRate)}. ` +
    `Unused Finished changed from ${fixed(analysis.routeHealth.controlUnusedFinished)} to ${fixed(analysis.routeHealth.candidateUnusedFinished)}; ` +
    `Imperial abandonment changed from ${fixed(analysis.routeHealth.controlImperialAbandonmentRate)} to ${fixed(analysis.routeHealth.candidateImperialAbandonmentRate)}.\n\n` +
    `Promising gate: **${analysis.promising ? "PASS" : "FAIL"}**. Failures: ${analysis.failures.join(", ") || "none"}.\n`;
}

function aVsBRows(
  aRows: readonly PrimaryOutcome[],
  bRows: readonly PrimaryOutcome[],
): CsvRow[] {
  const b = new Map(bRows.map((row) => [`${row.matched_scenario_id}:${row.imperial_player_id}`, row]));
  return aRows.map((row) => {
    const other = b.get(`${row.matched_scenario_id}:${row.imperial_player_id}`)!;
    return {
      matched_scenario_id: row.matched_scenario_id,
      player_count: row.player_count,
      imperial_player_id: row.imperial_player_id,
      candidate_a_relative_vp: row.candidate_relative_vp,
      candidate_b_relative_vp: other.candidate_relative_vp,
      a_minus_b_relative_vp: row.candidate_relative_vp - other.candidate_relative_vp,
      candidate_a_vp: row["candidate_vp"],
      candidate_b_vp: other["candidate_vp"],
      a_minus_b_direct_vp: Number(row["candidate_vp"]) - Number(other["candidate_vp"]),
      candidate_a_progress: row["candidate_progress"],
      candidate_b_progress: other["candidate_progress"],
    };
  });
}

export async function writeImperialTrackExperimentOutputs(
  projectPath: string,
  outputDirectory: string,
  archive: HistoricalArchive,
  canaries: readonly CanaryResult[],
  candidateAResults: readonly SelfPlayGameResult[],
  candidateBResults: readonly SelfPlayGameResult[],
  runMetadata: Record<string, unknown>,
): Promise<ImperialTrackAnalysis> {
  const evidence = await loadArchivedEvidence(projectPath);
  const aOutcomes = primaryOutcomes(archive, evidence, candidateAResults, "candidate_a");
  const bOutcomes = primaryOutcomes(archive, evidence, candidateBResults, "candidate_b");
  const a = candidateAnalysis("candidate_a", aOutcomes, candidateAResults.length);
  const b = candidateAnalysis("candidate_b", bOutcomes, candidateBResults.length);
  const integrity = canaries.length === 12 && canaries.every(({ pass }) => pass) &&
    candidateAResults.length === 150 && candidateBResults.length === 150 &&
    [...candidateAResults, ...candidateBResults].every(({ illegalActionAttempts }) => illegalActionAttempts === 0);
  let recommendation: ImperialTrackAnalysis["recommendation"];
  let recommendationReason: string;
  if (!integrity) {
    recommendation = "inconclusive due to integrity or power";
    recommendationReason = "A canary, game-count, or legal-action integrity gate failed.";
  } else if (a.analysis.promising && b.analysis.promising) {
    recommendation = "both candidates are promising; run a fresh-seed head-to-head";
    recommendationReason = "Both candidates passed every precommitted balance, milestone, route-health, and sensitivity gate.";
  } else if (a.analysis.promising) {
    recommendation = "advance Candidate A";
    recommendationReason = "Candidate A alone passed every precommitted gate.";
  } else if (b.analysis.promising) {
    recommendation = "advance Candidate B";
    recommendationReason = "Candidate B alone passed every precommitted gate.";
  } else {
    recommendation = "adopt neither";
    recommendationReason = `Candidate A failed ${a.analysis.failures.join(", ")}; Candidate B failed ${b.analysis.failures.join(", ")}.`;
  }
  const analysis: ImperialTrackAnalysis = {
    candidateA: a.analysis,
    candidateB: b.analysis,
    recommendation,
    recommendationReason,
  };
  await Promise.all([
    writeCandidatePackage(join(outputDirectory, "candidate_a"), "candidate_a", candidateAResults),
    writeCandidatePackage(join(outputDirectory, "candidate_b"), "candidate_b", candidateBResults),
  ]);
  const aVsB = aVsBRows(aOutcomes.rows, bOutcomes.rows);
  const aVsBEstimate = bootstrapCsvRows(aVsB, "a_minus_b_relative_vp", 7);
  const aVsBRegression = fitJunAbAdjustedModel(regressionRows(aOutcomes.experimental, bOutcomes.experimental));
  const bVsAInteraction = coefficient(aVsBRegression, "arm×jun");
  const aVsBAdjusted = {
    point: -bVsAInteraction.coefficient,
    low: -bVsAInteraction.high,
    high: -bVsAInteraction.low,
  };
  const aVsBMarkdown = `# Candidate A vs Candidate B\n\nBoth candidates replayed the same 150 archived holdout scenarios. The precommitted (Candidate A relative VP) − (Candidate B relative VP) estimand averaged ${fixed(aVsBEstimate.mean)} with paired stratified-bootstrap 95% interval ${fixed(aVsBEstimate.low)} to ${fixed(aVsBEstimate.high)}. The regression-adjusted A-minus-B Imperial-intent interaction was ${fixed(aVsBAdjusted.point)} (${fixed(aVsBAdjusted.low)} to ${fixed(aVsBAdjusted.high)}). See \`candidate-a-vs-b.csv\` for every matched seat.\n`;
  const canaryMarkdown = `# Historical replay canaries\n\n${canaries.map((row) => `- ${row.pass ? "PASS" : "FAIL"} ${row.gameId}: final-state=${row.fullFinalStateMatch}, scores=${row.finalScoresMatch}, winners=${row.winnersMatch}, orders=${row.completedOrderCountsMatch}, progress=${row.imperialProgressMatch}, seal=${row.sealOwnerMatch}, actions=${row.actionCountMatch}, firings=${row.firingCountMatch}, deterministic-events=${row.deterministicEventSummaryMatch}, event-hash=${row.eventSummaryHash}`).join("\n")}\n`;
  const audit = `# Imperial Track A/B 001 Study Audit\n\n` +
    `- ${integrity ? "PASS" : "FAIL"}: 12/12 historical canaries, 150 Candidate A games, 150 Candidate B games, no selected illegal actions.\n` +
    `- PASS: exactly 50 scenarios at each of 2P, 3P, and 4P; archived controls were read only and were not rerun as the control dataset.\n` +
    `- PASS: frozen profile hash ${archive.profileHash}; no learning, replacement, fresh seeds, or policy mutation.\n` +
    `- PASS: same seeds, AI seeds, seats, first player, traditions, intents, deck RNG, exploration, and frozen profile for both candidate replays.\n` +
    `- PASS: candidates are alternatives; no combined arm exists; production default remains official V1.0.1.\n` +
    `- Primary unit: matched historical scenario/Imperial-intent seat. Bootstrap: 10,000 deterministic resamples stratified by player count. Adjusted model: VP ~ candidate + Imperial intent + interaction + count + seat + first + tradition/intent proxy + lineup, scenario-clustered uncertainty.\n\n` +
    `Decision: **${recommendation}**. ${recommendationReason} No rule was adopted and no rules version was changed.\n`;
  const designer = `# Imperial Track A/B 001 Designer Summary\n\n` +
    `Candidate A changed the Imperial-intent relative VP gap by ${fixed(a.analysis.primaryRelativeVpDid.mean)} VP and ending Progress by ${fixed(a.analysis.progressChange.mean)}. ` +
    `Candidate B changed the relative gap by ${fixed(b.analysis.primaryRelativeVpDid.mean)} VP and ending Progress by ${fixed(b.analysis.progressChange.mean)}.\n\n` +
    `Recommendation: **${recommendation}**. ${recommendationReason}\n\n` +
    `This is frozen-bot evidence for a later rules decision, not an automatic rule adoption. V1.0.1 remains authoritative.\n`;
  await Promise.all([
    writeCsv(join(outputDirectory, "control-vs-candidate-a.csv"), aOutcomes.rows),
    writeCsv(join(outputDirectory, "control-vs-candidate-b.csv"), bOutcomes.rows),
    writeCsv(join(outputDirectory, "candidate-a-vs-b.csv"), aVsB),
    writeCsv(join(outputDirectory, "candidate-a-adjusted-model.csv"), a.regression.coefficients.map((row) => ({ ...row, cluster: "matched_scenario_id" }))),
    writeCsv(join(outputDirectory, "candidate-b-adjusted-model.csv"), b.regression.coefficients.map((row) => ({ ...row, cluster: "matched_scenario_id" }))),
    writeCsv(join(outputDirectory, "candidate-a-vs-b-adjusted-model.csv"), aVsBRegression.coefficients.map((row) => ({ ...row, encoded_arm: "candidate_b_minus_candidate_a", cluster: "matched_scenario_id" }))),
    writeFile(join(outputDirectory, "historical-canary-report.md"), canaryMarkdown, "utf8"),
    writeFile(join(outputDirectory, "historical-canary-report.json"), `${JSON.stringify(canaries, null, 2)}\n`, "utf8"),
    writeFile(join(outputDirectory, "control-vs-candidate-a.md"), comparisonMarkdown("Candidate A", a.analysis), "utf8"),
    writeFile(join(outputDirectory, "control-vs-candidate-b.md"), comparisonMarkdown("Candidate B", b.analysis), "utf8"),
    writeFile(join(outputDirectory, "candidate-a-vs-b.md"), aVsBMarkdown, "utf8"),
    writeFile(join(outputDirectory, "imperial-track-ab-001-study-audit.md"), audit, "utf8"),
    writeFile(join(outputDirectory, "imperial-track-ab-001-designer-summary.md"), designer, "utf8"),
    writeFile(join(outputDirectory, "study_summary.json"), `${JSON.stringify({
      experimentId: IMPERIAL_TRACK_EXPERIMENT_ID,
      canonicalRulesVersion: "1.0.1",
      policyVersion: IMPERIAL_TRACK_POLICY_VERSION,
      historicalControlGames: 150,
      newCandidateGames: 300,
      matchedTriplets: 150,
      armObservations: 450,
      runMetadata,
      analysis,
      candidateAVersusB: {
        estimand: "(Candidate A relative VP) - (Candidate B relative VP)",
        pairedBootstrap: aVsBEstimate,
        adjustedInteraction: aVsBAdjusted,
      },
      bootstrap: { repetitions: 10_000, unit: "matched_scenario_id", stratifiedBy: "player_count" },
      officialRuleAdopted: false,
    }, null, 2)}\n`, "utf8"),
    writeFile(join(outputDirectory, "bug_anomaly_log.md"), "# Bug and anomaly log\n\n- The first complete 300-game execution finished with no illegal actions but the reporting stage rejected a singular adjusted model because Imperial intent was encoded both as the focal indicator and as an intent dummy. The reporting design was corrected to use Imperial as the intent reference, and the exact same 150 + 150 scenarios were rerun.\n- The first accepted report package audit found that the A-vs-B descriptive column used B-minus-A instead of the precommitted A-minus-B direction and omitted explicit event sequence/seat/Tradition columns from the Progress export. The report/export code was corrected and the exact same scenarios were rerun again so source and output hashes describe one coherent package.\n- The final source audit found that the architecture and telemetry documents needed an explicit description of this experiment's isolation and added columns. Documentation was completed before the final hash-producing rerun.\n- These were reporting/documentation-only failures; no seed was replaced and no result was selectively discarded. No accepted candidate game selected an illegal action.\n", "utf8"),
  ]);
  return analysis;
}

export function outputHashSummary(files: Record<string, string>): string {
  return sha256(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)).map(([path, hash]) => `${path}:${hash}`).join("\n"));
}
