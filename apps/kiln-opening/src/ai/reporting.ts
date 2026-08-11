import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  IMPERIAL_ORDERS,
  IMPERIAL_PROGRESS,
  KILN_IDS,
  MARKET_ORDERS,
  ORDER_DEFINITIONS,
  TECHNIQUES,
  locationCapacity,
} from "../game/index.ts";
import type { GameEvent, KilnId, PlayerCount, PlayerId, Quality } from "../game/index.ts";
import { AI_POLICY_VERSION, AI_SIMULATION_VERSION } from "./types.ts";
import type { AIStrategyProfile } from "./types.ts";
import type {
  DisplayExposureRow,
  FiringCeramicRow,
  KilnFiringRow,
  SelfPlayActionRow,
  SelfPlayEventRow,
  SelfPlayGameResult,
} from "./selfplay.ts";

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

export interface StudyMetadata {
  repositoryCommit: string;
  startedAt: string;
  completedAt: string;
  totalRuntimeMs: number;
  invalidAttempts: number;
  replacements: Array<{ gameId: string; seed: number; error: string }>;
}

export interface StrategySnapshots {
  initial: Record<string, AIStrategyProfile>;
  after10: Record<string, AIStrategyProfile>;
  after30: Record<string, AIStrategyProfile>;
  final: Record<string, AIStrategyProfile>;
  frozenHoldout: Record<string, AIStrategyProfile>;
}

function eventValue(row: SelfPlayEventRow): GameEvent {
  return JSON.parse(row.eventJson) as GameEvent;
}

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function writeCsv(path: string, rows: readonly CsvRow[], headers?: readonly string[]): Promise<void> {
  const columns = headers ?? [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(","));
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

function phaseFor(sequence: number): string {
  if (sequence <= 10) return "early";
  if (sequence <= 30) return "developing";
  if (sequence <= 50) return "mature";
  return "holdout";
}

function splitFor(result: SelfPlayGameResult): "training" | "holdout" | "ab_evaluation" {
  return result.config.datasetSplit ?? (result.config.gameSequence <= 50 ? "training" : "holdout");
}

function phaseForResult(result: SelfPlayGameResult): string {
  return splitFor(result) === "ab_evaluation" ? "frozen" : phaseFor(result.config.gameSequence);
}

export interface StudyTables {
  players: CsvRow[];
  games: CsvRow[];
  rounds: CsvRow[];
  orderEvents: CsvRow[];
  orders: CsvRow[];
  techniqueEvents: CsvRow[];
  techniques: CsvRow[];
  actions: CsvRow[];
  decisions: CsvRow[];
  plans: CsvRow[];
  optionalEffects: CsvRow[];
  techniqueForecasts: CsvRow[];
  intentOutcomes: CsvRow[];
  firings: CsvRow[];
  kiln: CsvRow[];
}

export function buildStudyTables(results: readonly SelfPlayGameResult[]): StudyTables {
  const players = playerRows(results);
  const games = gameRows(results, players);
  const rounds = roundRows(results);
  const orderEvents = orderEventRows(results);
  const orders = orderRows(results, orderEvents);
  const techniqueEvents = techniqueEventRows(results);
  return {
    players,
    games,
    rounds,
    orderEvents,
    orders,
    techniqueEvents,
    techniques: techniqueRows(results, techniqueEvents),
    actions: actionRows(results),
    decisions: decisionRows(results),
    plans: planRows(results),
    optionalEffects: optionalEffectRows(results),
    techniqueForecasts: techniqueForecastRows(results),
    intentOutcomes: intentOutcomeRows(results),
    firings: firingRows(results),
    kiln: kilnRows(results),
  };
}

function rankMap(result: SelfPlayGameResult): Record<PlayerId, number> {
  const scores = result.state.finalResult?.scores ?? {};
  const ordered = result.state.playerOrder
    .map((id) => ({ id, score: scores[id]?.total ?? 0 }))
    .sort((left, right) => right.score - left.score);
  return Object.fromEntries(ordered.map((entry, index) => [
    entry.id,
    ordered.findIndex((candidate) => candidate.score === entry.score) + 1,
  ]));
}

function countEvents(result: SelfPlayGameResult, type: string, playerId?: PlayerId): number {
  return result.events.filter((row) => {
    if (row.eventType !== type) return false;
    if (playerId === undefined) return true;
    const event = eventValue(row) as GameEvent & { playerId?: PlayerId };
    return event.playerId === playerId;
  }).length;
}

function playerFinalFiringRows(result: SelfPlayGameResult, playerId: PlayerId): FiringCeramicRow[] {
  const last = new Map<string, FiringCeramicRow>();
  for (const row of result.firings) if (row.ownerId === playerId) last.set(row.ceramicId, row);
  return [...last.values()];
}

function resourceFlow(actions: readonly SelfPlayActionRow[], key: "clay" | "wood" | "coins"): { gained: number; spent: number } {
  const before = `${key}Before` as const;
  const after = `${key}After` as const;
  return actions.reduce((flow, row) => {
    const delta = row[after] - row[before];
    if (delta > 0) flow.gained += delta;
    else flow.spent -= delta;
    return flow;
  }, { gained: 0, spent: 0 });
}

function progressDetails(result: SelfPlayGameResult, playerId: PlayerId): {
  reached: Record<number, number | null>;
  orderProgress: number;
  patronageProgress: number;
  patronageRounds: number[];
} {
  const reached: Record<number, number | null> = { 1: null, 2: null, 3: null, 4: null, 5: null };
  let orderProgress = 0;
  let patronageProgress = 0;
  const patronageRounds: number[] = [];
  for (const row of result.events) {
    const event = eventValue(row);
    if (event.type === "IMPERIAL_PROGRESS_ADVANCED" && event.playerId === playerId) {
      for (let space = event.from + 1; space <= event.to; space += 1) if (reached[space] === null) reached[space] = row.round;
      if (event.source === "court_patronage") patronageProgress += event.appliedGain ?? event.to - event.from;
      else orderProgress += event.appliedGain ?? event.to - event.from;
    }
    if (event.type === "COURT_PATRONAGE_USED" && event.playerId === playerId) {
      patronageRounds.push(row.round);
      if (reached[event.to] === null) reached[event.to] = row.round;
    }
  }
  return { reached, orderProgress, patronageProgress, patronageRounds };
}

function playerRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => {
    const final = result.state.finalResult!;
    const ranks = rankMap(result);
    return result.state.playerOrder.map((playerId) => {
      const player = result.state.players[playerId]!;
      const score = final.scores[playerId]!;
      const actions = result.actions.filter((row) => row.playerId === playerId);
      const firingRows = result.firings.filter((row) => row.ownerId === playerId);
      const finalFirings = playerFinalFiringRows(result, playerId);
      const progress = progressDetails(result, playerId);
      const clay = resourceFlow(actions, "clay");
      const wood = resourceFlow(actions, "wood");
      const coins = resourceFlow(actions, "coins");
      const marketCompleted = player.completedOrders.filter(({ orderId }) => orderId.startsWith("M"));
      const imperialCompleted = player.completedOrders.filter(({ orderId }) => orderId.startsWith("I"));
      const marketVp = marketCompleted.reduce((sum, order) => sum + order.vpAwarded, 0);
      const imperialVp = imperialCompleted.reduce((sum, order) => sum + order.vpAwarded, 0);
      const acquiredEvents = result.events.filter((row) => {
        const event = eventValue(row);
        return (
          (event.type === "ORDER_TAKEN" && event.playerId === playerId) ||
          (event.type === "STARTING_ORDER_KEPT" && event.playerId === playerId) ||
          (event.type === "STARTING_ORDER_REDRAWN" && event.playerId === playerId)
        );
      });
      const presented = Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "presented");
      const finished = Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished");
      const finalQuality = (quality: Quality) => finalFirings.filter((row) => row.finalQuality === quality).length;
      const naturalQuality = (quality: Quality) => firingRows.filter((row) => row.naturalQuality === quality).length;
      const workerActions = actions.filter((row) => row.locationId !== null).length;
      const junDecisions = result.decisions.filter(
        (decision) => decision.playerId === playerId && decision.diagnostics.optionalEffect?.effectId === "jun",
      );
      const junPayments = result.events.flatMap((row) => {
        const event = eventValue(row);
        return event.type === "JUN_ACTIVATION_PAID" && event.playerId === playerId ? [event.coins] : [];
      });
      const connoisseurUses = result.events.filter((row) => {
        const event = eventValue(row);
        return event.type === "TECHNIQUE_USED" && event.playerId === playerId && event.techniqueId === "T14";
      }).length;
      return {
        game_id: result.config.gameId,
        game_seed: result.config.gameSeed,
        ai_seed: result.config.aiSeed,
        sequence: result.config.gameSequence,
        learning_phase: phaseForResult(result),
        dataset_split: splitFor(result),
        player_count: result.state.playerCount,
        player_id: playerId,
        seat: player.seatIndex + 1,
        first_player: result.initialFirstPlayerId === playerId,
        tradition: player.kilnId,
        rank: ranks[playerId],
        win: final.winnerIds.includes(playerId),
        total_vp: score.total,
        market_order_vp: marketVp,
        imperial_order_vp: imperialVp,
        imperial_progress_vp: score.imperialProgress,
        imperial_seal_vp: score.imperialSeal,
        presentation_vp: score.presentation,
        tradition_vp: player.score.kilnTraditionVp,
        remaining_coin_vp: score.leftoverCoins,
        other_vp: score.immediateAbilities - player.score.kilnTraditionVp,
        final_imperial_progress: player.imperialProgress,
        progress_1_round: progress.reached[1],
        progress_2_round: progress.reached[2],
        progress_3_round: progress.reached[3],
        progress_4_round: progress.reached[4],
        progress_5_round: progress.reached[5],
        progress_from_orders: progress.orderProgress,
        progress_from_patronage: progress.patronageProgress,
        apprentice_milestones_reached: Number(player.imperialProgress >= 1) + Number(player.imperialProgress >= 3),
        patronage_uses: progress.patronageRounds.length,
        patronage_rounds: progress.patronageRounds.join("|"),
        seal_obtained: result.state.imperialSealOwnerId === playerId,
        presentation_eligible: player.imperialProgress >= 4,
        presentation_used: presented.length > 0,
        presented: presented.length,
        formed: countEvents(result, "CERAMIC_SHAPED", playerId),
        glazed: countEvents(result, "CERAMIC_GLAZED", playerId),
        loaded: countEvents(result, "CERAMIC_LOADED", playerId),
        fired: firingRows.length,
        delivered: Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "delivered").length,
        sold: Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "sold").length,
        natural_masterpiece: naturalQuality("masterpiece"),
        natural_fine: naturalQuality("fine"),
        natural_standard: naturalQuality("standard"),
        natural_flawed: naturalQuality("flawed"),
        final_masterpiece: finalQuality("masterpiece"),
        final_fine: finalQuality("fine"),
        final_standard: finalQuality("standard"),
        final_flawed: finalQuality("flawed"),
        quality_modifications: firingRows.filter((row) => row.naturalQuality !== row.finalQuality).length,
        second_firing_uses: firingRows.filter((row) => row.secondFiring).length,
        unused_finished: finished.length,
        unused_masterpiece: finished.filter((ceramic) => ceramic.stage === "finished" && ceramic.quality === "masterpiece").length,
        unused_fine: finished.filter((ceramic) => ceramic.stage === "finished" && ceramic.quality === "fine").length,
        unused_standard: finished.filter((ceramic) => ceramic.stage === "finished" && ceramic.quality === "standard").length,
        unused_flawed: finished.filter((ceramic) => ceramic.stage === "finished" && ceramic.quality === "flawed").length,
        dead_ceramic_rate: finalFirings.length === 0 ? 0 : finished.length / finalFirings.length,
        orders_taken: acquiredEvents.length,
        market_orders_taken: acquiredEvents.filter((row) => {
          const event = eventValue(row);
          const id = event.type === "ORDER_TAKEN" ? event.orderId : event.type === "STARTING_ORDER_KEPT" ? event.orderId : event.type === "STARTING_ORDER_REDRAWN" ? event.drawnOrderId : "";
          return id.startsWith("M");
        }).length,
        imperial_orders_taken: acquiredEvents.filter((row) => {
          const event = eventValue(row);
          const id = event.type === "ORDER_TAKEN" ? event.orderId : event.type === "STARTING_ORDER_KEPT" ? event.orderId : event.type === "STARTING_ORDER_REDRAWN" ? event.drawnOrderId : "";
          return id.startsWith("I");
        }).length,
        face_up_orders_taken: result.events.filter((row) => {
          const event = eventValue(row);
          return event.type === "ORDER_TAKEN" && event.playerId === playerId && event.acquisition === "face_up";
        }).length,
        blind_orders_drawn: result.events.filter((row) => {
          const event = eventValue(row);
          return event.type === "ORDER_TAKEN" && event.playerId === playerId && event.acquisition === "blind_top";
        }).length,
        market_orders_completed: marketCompleted.length,
        imperial_orders_completed: imperialCompleted.length,
        orders_uncompleted: player.orderHand.length,
        techniques_owned: player.techniques.length,
        technique_uses: countEvents(result, "TECHNIQUE_USED", playerId),
        tradition_uses: countEvents(result, "KILN_ABILITY_USED", playerId),
        jun_legal_opportunities: junDecisions.length,
        jun_uses: junDecisions.filter((decision) => decision.diagnostics.optionalEffect?.selected).length,
        jun_activation_rate: junDecisions.length === 0 ? 0 : junDecisions.filter((decision) => decision.diagnostics.optionalEffect?.selected).length / junDecisions.length,
        jun_coins_spent: junPayments.reduce((sum, coinsPaid) => sum + coinsPaid, 0),
        jun_plus_one_uses: junDecisions.filter((decision) => decision.diagnostics.optionalEffect?.selectedDelta === 1).length,
        jun_minus_one_uses: junDecisions.filter((decision) => decision.diagnostics.optionalEffect?.selectedDelta === -1).length,
        jun_masterpieces_created: firingRows.filter((row) => row.jun && row.naturalQuality !== "masterpiece" && row.finalQuality === "masterpiece").length,
        jun_orders_enabled: junDecisions.reduce((sum, decision) => {
          const diagnostic = decision.diagnostics.optionalEffect;
          return sum + (diagnostic?.selected ? Math.max(0, diagnostic.compatibleOrdersAfter - diagnostic.compatibleOrdersBefore) : 0);
        }, 0),
        connoisseur_network_uses: connoisseurUses,
        connoisseur_coins_gained: connoisseurUses * 5,
        worker_actions: workerActions,
        passes: actions.filter((row) => row.actionType === "PASS_WORK_PHASE").length,
        clay_gained: clay.gained,
        clay_spent: clay.spent,
        clay_remaining: player.resources.clay,
        wood_gained: wood.gained,
        wood_spent: wood.spent,
        wood_remaining: player.resources.wood,
        coins_gained: coins.gained,
        coins_spent: coins.spent,
        coins_remaining: player.resources.coins,
        strategy_tags: (result.strategyTagsByPlayer[playerId] ?? []).join("|"),
        assigned_intent: result.config.assignedIntents?.[playerId] ?? "Hybrid",
      };
    });
  });
}

function gameRows(results: readonly SelfPlayGameResult[], players: readonly CsvRow[]): CsvRow[] {
  return results.map((result) => {
    const final = result.state.finalResult!;
    const gamePlayers = players.filter((row) => row["game_id"] === result.config.gameId);
    const totals = Object.values(final.scores).map((score) => score.total).sort((a, b) => b - a);
    const winnerId = final.winnerIds.join("|");
    const winnerTradition = final.winnerIds.map((id) => result.state.players[id]?.kilnId).join("|");
    return {
      game_id: result.config.gameId,
      game_seed: result.config.gameSeed,
      ai_seed: result.config.aiSeed,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      learning_phase: phaseForResult(result),
      dataset_split: splitFor(result),
      traditions: result.state.playerOrder.map((id) => result.state.players[id]?.kilnId).join("|"),
      seat_order: result.state.playerOrder.join("|"),
      first_player: result.initialFirstPlayerId,
      winner: winnerId,
      winning_tradition: winnerTradition,
      winning_strategy_tags: final.winnerIds.flatMap((id) => result.strategyTagsByPlayer[id] ?? []).join("|"),
      winning_assigned_intents: final.winnerIds.map((id) => result.config.assignedIntents?.[id] ?? "Hybrid").join("|"),
      final_scores: JSON.stringify(final.scores),
      score_spread: (totals[0] ?? 0) - (totals.at(-1) ?? 0),
      winner_margin: (totals[0] ?? 0) - (totals[1] ?? totals[0] ?? 0),
      tie: final.winnerIds.length > 1,
      tie_break_result: final.resolvedBy,
      ceramics_formed: gamePlayers.reduce((sum, row) => sum + Number(row["formed"]), 0),
      ceramics_glazed: gamePlayers.reduce((sum, row) => sum + Number(row["glazed"]), 0),
      ceramics_loaded: gamePlayers.reduce((sum, row) => sum + Number(row["loaded"]), 0),
      ceramics_fired: result.firings.length,
      ceramics_delivered: gamePlayers.reduce((sum, row) => sum + Number(row["delivered"]), 0),
      ceramics_sold: gamePlayers.reduce((sum, row) => sum + Number(row["sold"]), 0),
      ceramics_presented: gamePlayers.reduce((sum, row) => sum + Number(row["presented"]), 0),
      orders_completed: gamePlayers.reduce((sum, row) => sum + Number(row["market_orders_completed"]) + Number(row["imperial_orders_completed"]), 0),
      market_orders_completed: gamePlayers.reduce((sum, row) => sum + Number(row["market_orders_completed"]), 0),
      imperial_orders_completed: gamePlayers.reduce((sum, row) => sum + Number(row["imperial_orders_completed"]), 0),
      court_patronage_uses: gamePlayers.reduce((sum, row) => sum + Number(row["patronage_uses"]), 0),
      techniques_purchased: countEvents(result, "TECHNIQUE_ACQUIRED"),
      technique_activations: countEvents(result, "TECHNIQUE_USED"),
      tradition_activations: countEvents(result, "KILN_ABILITY_USED"),
      natural_masterpieces: result.firings.filter((row) => row.naturalQuality === "masterpiece").length,
      final_masterpieces: result.firings.filter((row) => row.finalQuality === "masterpiece").length,
      fine: result.firings.filter((row) => row.finalQuality === "fine").length,
      standard: result.firings.filter((row) => row.finalQuality === "standard").length,
      flawed: result.firings.filter((row) => row.finalQuality === "flawed").length,
      total_worker_actions: result.actions.filter((row) => row.locationId !== null).length,
      decisions: result.decisions.length,
      runtime_ms: result.durationMs,
      illegal_action_attempts: result.illegalActionAttempts,
    };
  });
}

function roundRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  const locations = ["materials_yard", "forming_studio", "glaze_workshop", "kiln_yard", "market_imperial_office", "guild_academy"] as const;
  return results.flatMap((result) => Array.from({ length: 5 }, (_, index) => index + 1).flatMap((round) => locations.map((locationId) => {
    const placements = result.actions.filter((row) => row.round === round && row.locationId === locationId);
    const capacity = locationCapacity(locationId, result.state.playerCount);
    return {
      game_id: result.config.gameId,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      learning_phase: phaseForResult(result),
      dataset_split: splitFor(result),
      round,
      location_id: locationId,
      capacity,
      workers_placed: placements.length,
      apprentice_placements: placements.filter((row) => row.workerKind === "apprentice").length,
      shifu_placements: placements.filter((row) => row.workerKind === "shifu").length,
      occupancy_rate: placements.length / capacity,
      full_capacity: placements.length >= capacity,
    };
  })));
}

interface OrderAcquisition {
  gameId: string;
  playerId: PlayerId;
  orderId: string;
  round: number;
  acquisition: "starting" | "face_up" | "blind_top";
  decisionIndex: number;
}

function orderAcquisitions(results: readonly SelfPlayGameResult[]): OrderAcquisition[] {
  return results.flatMap((result) => result.events.flatMap((row): OrderAcquisition[] => {
    const event = eventValue(row);
    if (event.type === "STARTING_ORDER_KEPT") return [{ gameId: result.config.gameId, playerId: event.playerId, orderId: event.orderId, round: row.round, acquisition: "starting", decisionIndex: row.decisionIndex }];
    if (event.type === "STARTING_ORDER_REDRAWN") return [{ gameId: result.config.gameId, playerId: event.playerId, orderId: event.drawnOrderId, round: row.round, acquisition: "starting", decisionIndex: row.decisionIndex }];
    if (event.type === "ORDER_TAKEN") return [{ gameId: result.config.gameId, playerId: event.playerId, orderId: event.orderId, round: row.round, acquisition: event.acquisition, decisionIndex: row.decisionIndex }];
    return [];
  }));
}

function orderEventRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  const acquisitions = orderAcquisitions(results);
  return acquisitions.map((acquisition) => {
    const result = results.find((candidate) => candidate.config.gameId === acquisition.gameId)!;
    const completionRow = result.events.find((row) => {
      const event = eventValue(row);
      return event.type === "ORDER_COMPLETED" && event.playerId === acquisition.playerId && event.orderId === acquisition.orderId;
    });
    const winner = result.state.finalResult?.winnerIds.includes(acquisition.playerId) ?? false;
    const postPlan = result.decisions.find((decision) => (
      decision.playerId === acquisition.playerId &&
      Number(decision.decisionId.split(":D").at(-1)) > acquisition.decisionIndex &&
      decision.plan.orderFeasibilities.some((feasibility) => feasibility.orderId === acquisition.orderId)
    ));
    const acquisitionPlan = postPlan?.plan.orderFeasibilities.find((feasibility) => feasibility.orderId === acquisition.orderId);
    return {
      game_id: acquisition.gameId,
      player_id: acquisition.playerId,
      order_id: acquisition.orderId,
      deck: acquisition.orderId.startsWith("I") ? "imperial" : "market",
      acquisition: acquisition.acquisition,
      acquisition_round: acquisition.round,
      acquisition_feasibility: acquisitionPlan?.probability,
      acquisition_action_debt: acquisitionPlan?.actionDebt,
      acquisition_earliest_completion_round: acquisitionPlan?.earliestCompletionRound,
      acquisition_reasons: acquisitionPlan?.reasons.join("|"),
      dataset_split: splitFor(result),
      completed: completionRow !== undefined,
      completion_round: completionRow?.round,
      rounds_held: completionRow === undefined ? 6 - acquisition.round : completionRow.round - acquisition.round,
      final_score: result.state.finalResult?.scores[acquisition.playerId]?.total,
      win: winner,
    };
  });
}

function orderRows(results: readonly SelfPlayGameResult[], eventRows: readonly CsvRow[]): CsvRow[] {
  const exposures = results.flatMap((result) => result.displayExposures).filter((row) => row.kind !== "technique");
  return [...MARKET_ORDERS, ...IMPERIAL_ORDERS].map((definition) => {
    const events = eventRows.filter((row) => row["order_id"] === definition.id);
    const completed = events.filter((row) => row["completed"] === true);
    const acquirerWins = events.filter((row) => row["win"] === true).length;
    const completeWins = completed.filter((row) => row["win"] === true).length;
    return {
      order_id: definition.id,
      deck: definition.id.startsWith("I") ? "imperial" : "market",
      quality_requirement: definition.minQuality,
      ceramics_required: definition.ceramics.length,
      times_displayed: exposures.filter((row) => row.itemId === definition.id).length,
      times_taken_face_up: events.filter((row) => row["acquisition"] === "face_up").length,
      times_blind_drawn: events.filter((row) => row["acquisition"] === "blind_top").length,
      starting_acquisitions: events.filter((row) => row["acquisition"] === "starting").length,
      total_acquisitions: events.length,
      completions: completed.length,
      uncompleted_acquisitions: events.length - completed.length,
      completion_rate: events.length === 0 ? 0 : completed.length / events.length,
      average_acquisition_round: mean(events.map((row) => Number(row["acquisition_round"]))),
      average_completion_round: mean(completed.map((row) => Number(row["completion_round"]))),
      average_rounds_held: mean(events.map((row) => Number(row["rounds_held"]))),
      completer_average_score: mean(completed.map((row) => Number(row["final_score"]))),
      completer_win_rate: completed.length === 0 ? 0 : completeWins / completed.length,
      acquirer_win_rate: events.length === 0 ? 0 : acquirerWins / events.length,
      printed_vp: definition.vp,
      printed_coins: definition.coins,
      progress_reward: definition.imperialProgressReward ?? 0,
      training_acquisitions: events.filter((row) => row["dataset_split"] === "training").length,
      holdout_acquisitions: events.filter((row) => row["dataset_split"] === "holdout").length,
      training_completions: events.filter((row) => row["dataset_split"] === "training" && row["completed"] === true).length,
      holdout_completions: events.filter((row) => row["dataset_split"] === "holdout" && row["completed"] === true).length,
    };
  });
}

function techniqueEventRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => {
    const opportunities = new Map<string, number>();
    for (const action of result.actions) {
      for (const techniqueId of JSON.parse(action.legalTechniqueIdsJson) as string[]) {
        const key = `${action.playerId}:${techniqueId}`;
        opportunities.set(key, (opportunities.get(key) ?? 0) + 1);
      }
    }
    return result.state.playerOrder.flatMap((playerId) => {
      const player = result.state.players[playerId]!;
      return player.techniques.map(({ id }) => {
        const acquisition = result.events.find((row) => {
          const event = eventValue(row);
          return event.type === "TECHNIQUE_ACQUIRED" && event.playerId === playerId && event.techniqueId === id;
        });
        const uses = result.events.filter((row) => {
          const event = eventValue(row);
          return event.type === "TECHNIQUE_USED" && event.playerId === playerId && event.techniqueId === id;
        }).length;
        const opportunityCount = opportunities.get(`${playerId}:${id}`) ?? 0;
        return {
          game_id: result.config.gameId,
          player_id: playerId,
          technique_id: id,
          acquisition_round: acquisition?.round,
          dataset_split: splitFor(result),
          opportunities: opportunityCount,
          uses,
          activation_rate: opportunityCount === 0 ? 0 : uses / opportunityCount,
          owner_score: result.state.finalResult?.scores[playerId]?.total,
          owner_win: result.state.finalResult?.winnerIds.includes(playerId),
          owner_rank: rankMap(result)[playerId],
        };
      });
    });
  });
}

function techniqueRows(results: readonly SelfPlayGameResult[], events: readonly CsvRow[]): CsvRow[] {
  const exposure = results.flatMap((result) => result.displayExposures).filter((row) => row.kind === "technique");
  return TECHNIQUES.map((definition) => {
    const owned = events.filter((row) => row["technique_id"] === definition.id);
    const purchased = results.flatMap((result) => result.events).filter((row) => {
      const event = eventValue(row);
      return event.type === "TECHNIQUE_ACQUIRED" && event.techniqueId === definition.id;
    });
    const uses = owned.reduce((sum, row) => sum + Number(row["uses"]), 0);
    const opportunities = owned.reduce((sum, row) => sum + Number(row["opportunities"]), 0);
    return {
      technique_id: definition.id,
      name: definition.name,
      discipline: definition.discipline,
      printed_cost: definition.cost,
      times_revealed: exposure.filter((row) => row.itemId === definition.id).length,
      times_purchased: purchased.length,
      purchase_rate_while_visible: exposure.filter((row) => row.itemId === definition.id).length === 0 ? 0 : purchased.length / exposure.filter((row) => row.itemId === definition.id).length,
      average_purchase_round: mean(purchased.map((row) => row.round)),
      owned_games: owned.length,
      owner_wins: owned.filter((row) => row["owner_win"] === true).length,
      owner_win_rate: owned.length === 0 ? 0 : owned.filter((row) => row["owner_win"] === true).length / owned.length,
      owner_average_score: mean(owned.map((row) => Number(row["owner_score"]))),
      owner_average_rank: mean(owned.map((row) => Number(row["owner_rank"]))),
      legal_opportunities: opportunities,
      uses,
      activation_rate: opportunities === 0 ? 0 : uses / opportunities,
      training_owned_games: owned.filter((row) => row["dataset_split"] === "training").length,
      holdout_owned_games: owned.filter((row) => row["dataset_split"] === "holdout").length,
    };
  });
}

function actionRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.actions.map((row) => ({
    ...row,
    playerCount: result.state.playerCount,
    sequence: result.config.gameSequence,
    learningPhase: phaseForResult(result),
    datasetSplit: splitFor(result),
    gameSeed: result.config.gameSeed,
    aiSeed: result.config.aiSeed,
  })));
}

function decisionRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.decisions.map((row) => ({
    decision_id: row.decisionId,
    game_id: row.gameId,
    player_id: row.playerId,
    player_count: result.state.playerCount,
    sequence: result.config.gameSequence,
    learning_phase: phaseForResult(result),
    dataset_split: splitFor(result),
    round: row.round,
    phase: row.phase,
    legal_action_count: row.legalActionCount,
    chosen_action_type: row.chosenActionType,
    chosen_action_score: row.chosenActionScore,
    top_alternatives: JSON.stringify(row.topAlternatives),
    strategy_tags: row.strategyTags.join("|"),
    evaluation_factors: JSON.stringify(row.factors),
    decision_duration_ms: row.decisionDurationMs,
    explored: row.explored,
    assigned_intent: row.assignedIntent,
    primary_order_id: row.plan.primaryOrderId,
    secondary_order_ids: row.plan.secondaryOrderIds.join("|"),
    conversion_urgency: row.plan.conversionUrgency,
    resource_demand_json: JSON.stringify(row.plan.resourceDemand),
    terminal_forecast_json: JSON.stringify(row.plan.terminalForecast),
    imperial_route_json: JSON.stringify(row.plan.imperialRoute),
    optional_effect_diagnostic_json: row.diagnostics.optionalEffect === null ? "" : JSON.stringify(row.diagnostics.optionalEffect),
    technique_forecast_json: row.diagnostics.techniqueForecast === null ? "" : JSON.stringify(row.diagnostics.techniqueForecast),
  })));
}

function planRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.decisions.map((row) => ({
    decision_id: row.decisionId,
    game_id: row.gameId,
    player_id: row.playerId,
    player_count: result.state.playerCount,
    sequence: result.config.gameSequence,
    dataset_split: splitFor(result),
      learning_phase: phaseForResult(result),
    round: row.round,
    phase: row.phase,
    assigned_intent: row.assignedIntent,
    primary_order_id: row.plan.primaryOrderId,
    secondary_order_ids: row.plan.secondaryOrderIds.join("|"),
    order_feasibilities_json: JSON.stringify(row.plan.orderFeasibilities),
    resource_demand_json: JSON.stringify(row.plan.resourceDemand),
    pipeline_json: JSON.stringify(row.plan.pipeline),
    conversion_urgency: row.plan.conversionUrgency,
    remaining_rounds: row.plan.remainingRounds,
    hand_conflict_count: row.plan.handConflictCount,
    reachable_imperial_space: row.plan.reachableImperialSpace,
    terminal_forecast_json: JSON.stringify(row.plan.terminalForecast),
    imperial_route_json: JSON.stringify(row.plan.imperialRoute),
  })));
}

function optionalEffectRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.decisions.flatMap((decision): CsvRow[] => {
    const diagnostic = decision.diagnostics.optionalEffect;
    if (diagnostic === null) return [];
    return [{
      decision_id: decision.decisionId,
      game_id: result.config.gameId,
      game_seed: result.config.gameSeed,
      ai_seed: result.config.aiSeed,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      dataset_split: splitFor(result),
      round: decision.round,
      phase: decision.phase,
      player_id: decision.playerId,
      assigned_intent: decision.assignedIntent,
      effect_id: diagnostic.effectId,
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
      coin_cost: diagnostic.coinCost,
      wood_cost: diagnostic.woodCost,
      opportunity_cost: diagnostic.opportunityCost,
      gross_benefit: diagnostic.grossBenefit,
      projected_net_value: diagnostic.projectedNetValue,
      reason_code: diagnostic.reasonCode,
    }];
  }));
}

function techniqueForecastRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.decisions.flatMap((decision): CsvRow[] => {
    const forecast = decision.diagnostics.techniqueForecast;
    if (forecast === null) return [];
    const uses = result.events.filter((row) => {
      const event = eventValue(row);
      return event.type === "TECHNIQUE_USED" && event.playerId === decision.playerId && event.techniqueId === forecast.techniqueId && row.decisionIndex > Number(decision.decisionId.split(":D").at(-1));
    }).length;
    const opportunities = result.actions.filter((row) => row.playerId === decision.playerId && row.decisionIndex > Number(decision.decisionId.split(":D").at(-1)) && (
      JSON.parse(row.legalTechniqueIdsJson) as string[]
    ).includes(forecast.techniqueId)).length;
    return [{
      decision_id: decision.decisionId,
      game_id: result.config.gameId,
      game_seed: result.config.gameSeed,
      ai_seed: result.config.aiSeed,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      dataset_split: splitFor(result),
      round: decision.round,
      player_id: decision.playerId,
      assigned_intent: decision.assignedIntent,
      technique_id: forecast.techniqueId,
      remaining_rounds: forecast.remainingRounds,
      expected_windows: forecast.expectedWindows,
      opportunity_probability: forecast.opportunityProbability,
      expected_beneficial_uses: forecast.expectedBeneficialUses,
      gross_benefit: forecast.grossBenefit,
      purchase_cost: forecast.purchaseCost,
      activation_cost: forecast.activationCost,
      worker_opportunity_cost: forecast.workerOpportunityCost,
      forecast_net_value: forecast.netValue,
      plan_compatibility: forecast.planCompatibility,
      forecast_reason_codes: forecast.reasonCodes.join("|"),
      actual_legal_opportunities: opportunities,
      actual_uses: uses,
      opportunity_realized: opportunities > 0,
      use_realized: uses > 0,
      owner_final_vp: result.state.finalResult?.scores[decision.playerId]?.total,
      owner_win: result.state.finalResult?.winnerIds.includes(decision.playerId),
    }];
  }));
}

function intentOutcomeRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.state.playerOrder.map((playerId): CsvRow => {
    const player = result.state.players[playerId]!;
    const acquisitions = result.events.flatMap((row) => {
      const event = eventValue(row);
      if (event.type === "ORDER_TAKEN" && event.playerId === playerId) return [{ orderId: event.orderId, round: row.round, source: event.acquisition }];
      if (event.type === "STARTING_ORDER_KEPT" && event.playerId === playerId) return [{ orderId: event.orderId, round: 1, source: "starting" }];
      if (event.type === "STARTING_ORDER_REDRAWN" && event.playerId === playerId) return [{ orderId: event.drawnOrderId, round: 1, source: "starting_redraw" }];
      return [];
    });
    const firstMarket = acquisitions.filter(({ orderId }) => orderId.startsWith("M")).sort((left, right) => left.round - right.round)[0];
    const firstImperial = acquisitions.filter(({ orderId }) => orderId.startsWith("I")).sort((left, right) => left.round - right.round)[0];
    const firstMulti = acquisitions.filter(({ orderId }) => (ORDER_DEFINITIONS[orderId]?.ceramics.length ?? 0) > 1).sort((left, right) => left.round - right.round)[0];
    const playerDecisions = result.decisions.filter((decision) => decision.playerId === playerId);
    const maximumReachable = Math.max(player.imperialProgress, ...playerDecisions.map((decision) => decision.plan.imperialRoute.projectedProgress));
    const viableEarly = playerDecisions.some((decision) => decision.round <= 2 && decision.plan.imperialRoute.viable);
    const fallback = playerDecisions.some((decision) => decision.plan.imperialRoute.preferredPath === "fallback");
    const unused = Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length;
    return {
      game_id: result.config.gameId,
      game_seed: result.config.gameSeed,
      ai_seed: result.config.aiSeed,
      player_count: result.state.playerCount,
      sequence: result.config.gameSequence,
      dataset_split: splitFor(result),
      player_id: playerId,
      assigned_intent: result.config.assignedIntents?.[playerId] ?? "Hybrid",
      final_vp: result.state.finalResult?.scores[playerId]?.total,
      first_market_acquisition_round: firstMarket?.round,
      first_market_acquisition_source: firstMarket?.source,
      first_imperial_acquisition_round: firstImperial?.round,
      first_imperial_acquisition_source: firstImperial?.source,
      first_multi_acquisition_round: firstMulti?.round,
      first_multi_acquisition_source: firstMulti?.source,
      viable_early_imperial_route: viableEarly,
      maximum_reachable_imperial_progress: maximumReachable,
      final_imperial_progress: player.imperialProgress,
      patronage_uses: countEvents(result, "COURT_PATRONAGE_USED", playerId),
      seal_obtained: result.state.imperialSealOwnerId === playerId,
      presentation_eligible: player.imperialProgress >= 4,
      presentation_used: player.presentationCeramicIds.length > 0,
      fallback_used: fallback,
      market_orders_completed: player.completedOrders.filter(({ orderId }) => orderId.startsWith("M")).length,
      imperial_orders_completed: player.completedOrders.filter(({ orderId }) => orderId.startsWith("I")).length,
      multi_orders_completed: player.completedOrders.filter(({ orderId }) => (ORDER_DEFINITIONS[orderId]?.ceramics.length ?? 0) > 1).length,
      unused_finished: unused,
      ending_clay: player.resources.clay,
      ending_wood: player.resources.wood,
      ending_coins: player.resources.coins,
      final_terminal_forecast_json: JSON.stringify(playerDecisions.at(-1)?.plan.terminalForecast ?? null),
      final_imperial_route_json: JSON.stringify(playerDecisions.at(-1)?.plan.imperialRoute ?? null),
    };
  }));
}

function firingRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.firings.map((row) => ({
    ...row,
    sequence: result.config.gameSequence,
    learning_phase: phaseForResult(result),
    dataset_split: splitFor(result),
    game_seed: result.config.gameSeed,
    ai_seed: result.config.aiSeed,
  })));
}

function kilnRows(results: readonly SelfPlayGameResult[]): CsvRow[] {
  return results.flatMap((result) => result.kilnFirings.map((row) => ({
    ...row,
    sequence: result.config.gameSequence,
    learning_phase: phaseForResult(result),
    dataset_split: splitFor(result),
  })));
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2 : sorted[middle] ?? 0;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? 0;
}

function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? "0.0%" : `${(100 * numerator / denominator).toFixed(1)}%`;
}

function n(value: CsvValue): number {
  return Number(value ?? 0);
}

function qualityTable(firings: readonly CsvRow[]): string {
  const lines = ["| Player Count | Learning Phase | N | Natural MP% | Final MP% | Fine% | Standard% | Flawed% |", "|---:|---|---:|---:|---:|---:|---:|---:|"];
  for (const playerCount of [2, 3, 4]) {
    for (const phase of ["early", "developing", "mature", "holdout", "holdout-last-20"]) {
      const rows = firings.filter((row) => n(row["playerCount"]) === playerCount && (
        phase === "holdout-last-20" ? n(row["sequence"]) >= 81 : row["learning_phase"] === phase
      ));
      lines.push(`| ${playerCount} | ${phase} | ${rows.length} | ${pct(rows.filter((row) => row["naturalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "fine").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "standard").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "flawed").length, rows.length)} |`);
    }
  }
  return lines.join("\n");
}

function playerCountTable(players: readonly CsvRow[], kiln: readonly CsvRow[]): string {
  const lines = ["| Players | Player-games | Avg VP | Avg fired | Avg Orders | Avg Progress | Natural MP% | Final MP% | Fine% | Standard% | Flawed% | Presentation% | Patronage% | Kiln occupancy |", "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const playerCount of [2, 3, 4]) {
    const rows = players.filter((row) => n(row["player_count"]) === playerCount);
    const firingTotal = rows.reduce((sum, row) => sum + n(row["fired"]), 0);
    const kilnRowsForCount = kiln.filter((row) => n(row["playerCount"]) === playerCount);
    const orders = rows.reduce((sum, row) => sum + n(row["market_orders_completed"]) + n(row["imperial_orders_completed"]), 0);
    lines.push(`| ${playerCount} | ${rows.length} | ${mean(rows.map((row) => n(row["total_vp"]))).toFixed(2)} | ${(firingTotal / rows.length).toFixed(2)} | ${(orders / rows.length).toFixed(2)} | ${mean(rows.map((row) => n(row["final_imperial_progress"]))).toFixed(2)} | ${pct(rows.reduce((sum, row) => sum + n(row["natural_masterpiece"]), 0), firingTotal)} | ${pct(rows.reduce((sum, row) => sum + n(row["final_masterpiece"]), 0), firingTotal)} | ${pct(rows.reduce((sum, row) => sum + n(row["final_fine"]), 0), firingTotal)} | ${pct(rows.reduce((sum, row) => sum + n(row["final_standard"]), 0), firingTotal)} | ${pct(rows.reduce((sum, row) => sum + n(row["final_flawed"]), 0), firingTotal)} | ${pct(rows.filter((row) => row["presentation_used"] === true).length, rows.length)} | ${pct(rows.filter((row) => n(row["patronage_uses"]) > 0).length, rows.length)} | ${pct(mean(kilnRowsForCount.map((row) => n(row["occupancyRate"]))) * 100, 100)} |`);
  }
  return lines.join("\n");
}

function traditionTable(players: readonly CsvRow[], actions: readonly CsvRow[]): string {
  const lines = ["| Tradition | N | Wins | Expected wins | Win% | Avg VP | Avg rank | Opportunities | Uses | Activation% |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  for (const tradition of KILN_IDS) {
    const rows = players.filter((row) => row["tradition"] === tradition);
    const wins = rows.filter((row) => row["win"] === true).length;
    const uses = rows.reduce((sum, row) => sum + n(row["tradition_uses"]), 0);
    const opportunities = tradition === "RU"
      ? uses
      : actions.filter((row) => row["tradition"] === tradition && row["traditionAbilityOpportunity"] === true).length;
    const expected = rows.reduce((sum, row) => sum + 1 / n(row["player_count"]), 0);
    lines.push(`| ${tradition} | ${rows.length} | ${wins} | ${expected.toFixed(1)} | ${pct(wins, rows.length)} | ${mean(rows.map((row) => n(row["total_vp"]))).toFixed(2)} | ${mean(rows.map((row) => n(row["rank"]))).toFixed(2)} | ${opportunities} | ${uses} | ${pct(uses, opportunities)} |`);
  }
  return lines.join("\n");
}

function alignmentTable(firings: readonly CsvRow[]): string {
  const lines = ["| Pre-fire difference | N | Nat MP% | Nat Fine% | Nat Standard% | Nat Flawed% | Final MP% | Final Fine% | Final Standard% | Final Flawed% |", "|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"];
  const bands = [0, 1, 2, 3];
  for (const difference of bands) {
    const rows = firings.filter((row) => difference === 3 ? n(row["preFireHeatDifference"]) >= 3 : n(row["preFireHeatDifference"]) === difference);
    const label = difference === 3 ? "3+" : String(difference);
    lines.push(`| ${label} | ${rows.length} | ${pct(rows.filter((row) => row["naturalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "fine").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "standard").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "flawed").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "fine").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "standard").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "flawed").length, rows.length)} |`);
  }
  return lines.join("\n");
}

function fireMatrix(firings: readonly CsvRow[]): string {
  const bands: Array<{ label: string; test: (value: number) => boolean }> = [
    { label: "≤-3", test: (value) => value <= -3 },
    { label: "-2", test: (value) => value === -2 },
    { label: "-1", test: (value) => value === -1 },
    { label: "0", test: (value) => value === 0 },
    { label: "+1", test: (value) => value === 1 },
    { label: "+2", test: (value) => value === 2 },
    { label: "≥+3", test: (value) => value >= 3 },
  ];
  const lines = ["| Fire | Pre-fire signed error | N | Natural MP% | Fine% | Standard% | Flawed% |", "|---:|---:|---:|---:|---:|---:|---:|"];
  for (const fire of [-2, -1, 0, 1, 2]) {
    for (const band of bands) {
      const rows = firings.filter((row) => n(row["fireModifier"]) === fire && band.test(n(row["preFireSignedError"])));
      if (rows.length === 0) continue;
      lines.push(`| ${fire > 0 ? "+" : ""}${fire} | ${band.label} | ${rows.length} | ${pct(rows.filter((row) => row["naturalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "fine").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "standard").length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "flawed").length, rows.length)} |`);
    }
  }
  return lines.join("\n");
}

function qualityByDimension(firings: readonly CsvRow[], key: string, title: string): string {
  const values = [...new Set(firings.map((row) => String(row[key])))];
  return [
    `| ${title} | N | Exact align% | Natural MP% | Final MP% | Fine% | Standard% | Flawed% |`,
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...values.map((value) => {
      const rows = firings.filter((row) => String(row[key]) === value);
      return `| ${value} | ${rows.length} | ${pct(rows.filter((row) => n(row["preFireHeatDifference"]) === 0).length, rows.length)} | ${pct(rows.filter((row) => row["naturalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "masterpiece").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "fine").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "standard").length, rows.length)} | ${pct(rows.filter((row) => row["finalQuality"] === "flawed").length, rows.length)} |`;
    }),
  ].join("\n");
}

function masterpieceFrequency(players: readonly CsvRow[], firings: readonly CsvRow[]): string {
  const playerLines = ["| Masterpieces | Player-games | % |", "|---:|---:|---:|"];
  for (const bucket of [0, 1, 2, 3, 4]) {
    const count = players.filter((row) => bucket === 4 ? n(row["final_masterpiece"]) >= 4 : n(row["final_masterpiece"]) === bucket).length;
    playerLines.push(`| ${bucket === 4 ? "4+" : bucket} | ${count} | ${pct(count, players.length)} |`);
  }
  const groups = new Map<string, CsvRow[]>();
  for (const row of firings) {
    const key = `${row["gameId"]}:${row["round"]}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const firingCounts = [...groups.values()].map((rows) => rows.filter((row) => row["finalQuality"] === "masterpiece").length);
  const firingLines = ["| Masterpieces | Firing events | % |", "|---:|---:|---:|"];
  for (const bucket of [0, 1, 2, 3]) {
    const count = firingCounts.filter((value) => bucket === 3 ? value >= 3 : value === bucket).length;
    firingLines.push(`| ${bucket === 3 ? "3+" : bucket} | ${count} | ${pct(count, firingCounts.length)} |`);
  }
  return `### Masterpieces per Player-Game\n\n${playerLines.join("\n")}\n\n### Masterpieces per Firing\n\n${firingLines.join("\n")}`;
}

function qualityAnswers(players: readonly CsvRow[], firings: readonly CsvRow[], orders: readonly CsvRow[]): string {
  const mature = firings.filter((row) => row["dataset_split"] === "holdout");
  const count = (quality: string) => mature.filter((row) => row["finalQuality"] === quality).length;
  const earlyMp = firings.filter((row) => row["learning_phase"] === "early" && row["finalQuality"] === "masterpiece").length / Math.max(1, firings.filter((row) => row["learning_phase"] === "early").length);
  const matureMp = count("masterpiece") / Math.max(1, mature.length);
  const finalMp = firings.filter((row) => row["finalQuality"] === "masterpiece");
  const naturalMp = finalMp.filter((row) => row["naturalQuality"] === "masterpiece").length;
  const exact = firings.filter((row) => n(row["preFireHeatDifference"]) === 0);
  const multi = new Map<string, number>();
  for (const row of firings) if (row["finalQuality"] === "masterpiece") {
    const key = `${row["gameId"]}:${row["round"]}`;
    multi.set(key, (multi.get(key) ?? 0) + 1);
  }
  const mpOrders = orders.filter((row) => row["quality_requirement"] === "masterpiece");
  const mpAcquired = mpOrders.reduce((sum, row) => sum + n(row["total_acquisitions"]), 0);
  const mpCompleted = mpOrders.reduce((sum, row) => sum + n(row["completions"]), 0);
  return [
    `1. Standard is ${count("standard") >= Math.max(count("fine"), count("masterpiece"), count("flawed")) ? "the" : "not the"} most common mature result (${count("standard")}/${mature.length}).`,
    `2. Fine is ${count("fine") < count("standard") ? "less" : "not less"} common than Standard (${count("fine")} vs ${count("standard")}).`,
    `3. Masterpiece is ${count("masterpiece") < count("fine") ? "rarer" : "not rarer"} than Fine (${count("masterpiece")} vs ${count("fine")}).`,
    `4. Flawed is ${count("flawed") < count("masterpiece") ? "rarer" : "not rarer"} than Masterpiece (${count("flawed")} vs ${count("masterpiece")}).`,
    `5. Typical production is ${mean(players.map((row) => n(row["final_masterpiece"]))).toFixed(2)} final Masterpieces per player-game.`,
    `6. ${players.filter((row) => n(row["final_masterpiece"]) === 0).length}/${players.length} player-games finished with zero Masterpieces.`,
    `7. ${[...multi.values()].filter((value) => value >= 2).length} firing events produced multiple final Masterpieces.`,
    `8. Final MP rate changed from ${(earlyMp * 100).toFixed(1)}% early to ${(matureMp * 100).toFixed(1)}% mature.`,
    `9. ${pct(naturalMp, finalMp.length)} of final Masterpiece firing rows were already natural Masterpieces; the rest were ability-enabled.`,
    `10. Jun created ${finalMp.filter((row) => row["jun"] === true && row["naturalQuality"] !== "masterpiece").length} and Ge created ${finalMp.filter((row) => row["ge"] === true && row["naturalQuality"] !== "masterpiece").length} non-natural Masterpieces.`,
    `11. Sagger Selection created ${finalMp.filter((row) => row["saggerSelection"] === true && row["naturalQuality"] !== "masterpiece").length} non-natural Masterpieces; evaluate against its ${firings.filter((row) => row["saggerSelection"] === true).length} uses.`,
    `12. Second Firing was used on ${firings.filter((row) => row["secondFiring"] === true).length} firing rows; later outcomes are identifiable by the re-fired destination flag.`,
    `13. Masterpiece-required Orders completed ${mpCompleted}/${mpAcquired} acquisitions (${pct(mpCompleted, mpAcquired)}).`,
    `14. ${pct(exact.length, firings.length)} of ceramics were exactly aligned before Fire, evidence that Masterpiece pursuit was partly planned rather than wholly accidental.`,
    `15. Perfect pre-Fire alignment produced ${exact.filter((row) => row["naturalQuality"] === "flawed").length} natural Flawed results; the V1.0.2 theoretical invariant held if this is zero.`,
    `16. Final Flawed rates by player count are available in the player-count Quality table; observed scaling should be interpreted with kiln occupancy.`,
    `17. Mature observed ordering is Standard ${count("standard")} > Fine ${count("fine")} ${count("fine") > count("masterpiece") ? ">" : "≤"} Masterpiece ${count("masterpiece")} > Flawed ${count("flawed")}.`,
  ].join("\n");
}

function orderTable(orders: readonly CsvRow[]): string {
  return [
    "| ID | Acquired | Completed | Completion% | Avg completion round | Acquirer win% |",
    "|---|---:|---:|---:|---:|---:|",
    ...orders.map((row) => `| ${row["order_id"]} | ${row["total_acquisitions"]} | ${row["completions"]} | ${pct(n(row["completions"]), n(row["total_acquisitions"]))} | ${n(row["average_completion_round"]).toFixed(2)} | ${pct(Math.round(n(row["acquirer_win_rate"]) * n(row["total_acquisitions"])), n(row["total_acquisitions"]))} |`),
  ].join("\n");
}

function techniqueTable(techniques: readonly CsvRow[]): string {
  return [
    "| ID | Revealed | Bought | Purchase% | Opportunities | Uses | Activation% | Owner win% |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...techniques.map((row) => `| ${row["technique_id"]} | ${row["times_revealed"]} | ${row["times_purchased"]} | ${pct(n(row["times_purchased"]), n(row["times_revealed"]))} | ${row["legal_opportunities"]} | ${row["uses"]} | ${pct(n(row["uses"]), n(row["legal_opportunities"]))} | ${pct(Math.round(n(row["owner_win_rate"]) * n(row["owned_games"])), n(row["owned_games"]))} |`),
  ].join("\n");
}

function qualityVerdicts(firings: readonly CsvRow[]): { masterpiece: string; flawed: string; ladder: string; explanation: string } {
  const mature = firings.filter((row) => row["dataset_split"] === "holdout");
  const mp = mature.filter((row) => row["finalQuality"] === "masterpiece").length / Math.max(1, mature.length);
  const flawed = mature.filter((row) => row["finalQuality"] === "flawed").length / Math.max(1, mature.length);
  const counts = Object.fromEntries(["standard", "fine", "masterpiece", "flawed"].map((quality) => [quality, mature.filter((row) => row["finalQuality"] === quality).length])) as Record<string, number>;
  return {
    masterpiece: mp < 0.08 ? "TOO RARE" : mp <= 0.2 ? "HEALTHY" : mp <= 0.25 ? "BORDERLINE COMMON" : "TOO COMMON",
    flawed: flawed < 0.03 ? "TOO RARE TO MATTER" : flawed <= 0.1 ? "HEALTHY" : flawed <= 0.15 ? "BORDERLINE COMMON" : "TOO COMMON",
    ladder: counts["standard"]! > counts["fine"]! && counts["fine"]! > counts["masterpiece"]! && counts["masterpiece"]! > counts["flawed"]! ? "MATCHES INTENDED HIERARCHY" : counts["standard"]! >= counts["fine"]! ? "PARTIALLY MATCHES" : "DOES NOT MATCH",
    explanation: `Frozen holdout sample n=${mature.length}: Standard ${counts["standard"]}, Fine ${counts["fine"]}, Masterpiece ${counts["masterpiece"]}, Flawed ${counts["flawed"]}.`,
  };
}

function correlation(rows: readonly CsvRow[], left: string, right: string): number {
  if (rows.length < 2) return 0;
  const xs = rows.map((row) => n(row[left]));
  const ys = rows.map((row) => n(row[right]));
  const mx = mean(xs);
  const my = mean(ys);
  const numerator = xs.reduce((sum, x, index) => sum + (x - mx) * ((ys[index] ?? 0) - my), 0);
  const denominator = Math.sqrt(xs.reduce((sum, x) => sum + (x - mx) ** 2, 0) * ys.reduce((sum, y) => sum + (y - my) ** 2, 0));
  return denominator === 0 ? 0 : numerator / denominator;
}

function reportMarkdown(
  results: readonly SelfPlayGameResult[],
  players: readonly CsvRow[],
  games: readonly CsvRow[],
  firings: readonly CsvRow[],
  kiln: readonly CsvRow[],
  orders: readonly CsvRow[],
  techniques: readonly CsvRow[],
  actions: readonly CsvRow[],
  metadata: StudyMetadata,
): string {
  const verdicts = qualityVerdicts(firings);
  const mature = players.filter((row) => row["dataset_split"] === "holdout");
  const decisions = results.flatMap((result) => result.decisions).map((decision) => decision.decisionDurationMs);
  const masterpieceRequired = orders.filter((row) => row["quality_requirement"] === "masterpiece");
  const flags: string[] = [];
  if (verdicts.ladder !== "MATCHES INTENDED HIERARCHY") flags.push(`MEDIUM confidence — Quality ladder: ${verdicts.ladder}; ${verdicts.explanation}`);
  if (mean(mature.map((row) => n(row["final_imperial_progress"]))) < 2) flags.push(`MEDIUM confidence — mature players averaged ${mean(mature.map((row) => n(row["final_imperial_progress"]))).toFixed(2)} Imperial Progress, so the upper track is rarely reached by this policy.`);
  if (masterpieceRequired.reduce((sum, row) => sum + n(row["total_acquisitions"]), 0) > 0 && masterpieceRequired.reduce((sum, row) => sum + n(row["completions"]), 0) === 0) flags.push("MEDIUM confidence — no acquired Masterpiece-required Order was completed by the current AI.");
  if (flags.length === 0) flags.push("LOW confidence — no automatic threshold flag fired; inspect the detailed tables before drawing design conclusions.");
  return `# Kiln Opening V1.0.2 Self-Play Balance Report

## 1. Executive Summary

This report covers exactly ${results.length} valid, complete games (${results.filter((result) => result.state.playerCount === 2).length} × 2P, ${results.filter((result) => result.state.playerCount === 3).length} × 3P, ${results.filter((result) => result.state.playerCount === 4).length} × 4P): ${results.filter((result) => splitFor(result) === "training").length} adaptive training and ${results.filter((result) => splitFor(result) === "holdout").length} frozen holdout. The authoritative V1.0.2 engine accepted every selected action; illegal-action attempts: ${results.reduce((sum, result) => sum + result.illegalActionAttempts, 0)}. Balance interpretation should use the frozen holdout; early AI results are exploratory.

## 2. Player Count Results

### Adaptive Training

${playerCountTable(players.filter((row) => row["dataset_split"] === "training"), kiln.filter((row) => row["dataset_split"] === "training"))}

### Frozen Holdout

${playerCountTable(players.filter((row) => row["dataset_split"] === "holdout"), kiln.filter((row) => row["dataset_split"] === "holdout"))}

## 3. Strategy Results

Realised strategy tags are stored per player-game in the raw player file. Mature win association remains descriptive because each policy learns from the same population and correlation does not prove causation.

## 4. Imperial Track

Frozen holdout average ending Progress: ${mean(mature.map((row) => n(row["final_imperial_progress"]))).toFixed(2)}. Presentation use among eligible holdout players: ${pct(mature.filter((row) => row["presentation_eligible"] === true && row["presentation_used"] === true).length, mature.filter((row) => row["presentation_eligible"] === true).length)}. Court Patronage uses: ${mature.reduce((sum, row) => sum + n(row["patronage_uses"]), 0)}.

## 5. Market vs Imperial

Across all player-games, Market completions: ${players.reduce((sum, row) => sum + n(row["market_orders_completed"]), 0)}; Imperial completions: ${players.reduce((sum, row) => sum + n(row["imperial_orders_completed"]), 0)}.

## 6. Court Patronage

The raw player and action files retain uses, rounds, progress route, Coin flow, and every legal-action decision. Patronage opportunity is conservatively measurable wherever the command appears in the authoritative legal list.

## 7. Quality Mastery

${qualityTable(firings)}

## 8. V1.0.2 Quality Distribution / Masterpiece Difficulty

### Pre-Fire Alignment

${alignmentTable(firings)}

### Perfect Alignment Reference Check

Among ${firings.filter((row) => n(row["preFireHeatDifference"]) === 0).length} perfectly aligned ceramics, observed natural results were Masterpiece ${pct(firings.filter((row) => n(row["preFireHeatDifference"]) === 0 && row["naturalQuality"] === "masterpiece").length, firings.filter((row) => n(row["preFireHeatDifference"]) === 0).length)}, Fine ${pct(firings.filter((row) => n(row["preFireHeatDifference"]) === 0 && row["naturalQuality"] === "fine").length, firings.filter((row) => n(row["preFireHeatDifference"]) === 0).length)}, Standard ${pct(firings.filter((row) => n(row["preFireHeatDifference"]) === 0 && row["naturalQuality"] === "standard").length, firings.filter((row) => n(row["preFireHeatDifference"]) === 0).length)}, Flawed ${pct(firings.filter((row) => n(row["preFireHeatDifference"]) === 0 && row["naturalQuality"] === "flawed").length, firings.filter((row) => n(row["preFireHeatDifference"]) === 0).length)}. The printed-deck theoretical reference is 20% / 30% / 50% / 0%; observed differences reflect finite samples and conditional deck state.

### Fire Modifier × Signed Pre-Fire Error

${fireMatrix(firings)}

### Quality by Glaze

${qualityByDimension(firings, "glaze", "Glaze")}

### Quality by Kiln Zone

${qualityByDimension(firings, "kilnZone", "Zone")}

${masterpieceFrequency(players, firings)}

### Answers to the Quality Design Questions

${qualityAnswers(players, firings, orders)}

### Explicit Quality Verdict

- Masterpiece: **${verdicts.masterpiece}**
- Flawed: **${verdicts.flawed}**
- Overall Quality Ladder: **${verdicts.ladder}**
- Evidence: ${verdicts.explanation}

No rules were changed from these diagnostic labels.

## 9. Orders

${orderTable(orders)}

Masterpiece-required acquisitions: ${masterpieceRequired.reduce((sum, row) => sum + n(row["total_acquisitions"]), 0)}; completions: ${masterpieceRequired.reduce((sum, row) => sum + n(row["completions"]), 0)}. Sample sizes are shown; selection and winning associations are not causal.

## 10. Techniques

${techniqueTable(techniques)}

## 11. Traditions

${traditionTable(players, actions)}

## 12. Shared Kiln

Mean occupancy: ${pct(mean(kiln.map((row) => n(row["occupancyRate"]))) * 100, 100)} across ${kiln.length} firing events. Fire cards observed: -2=${kiln.filter((row) => n(row["fireModifier"]) === -2).length}, -1=${kiln.filter((row) => n(row["fireModifier"]) === -1).length}, 0=${kiln.filter((row) => n(row["fireModifier"]) === 0).length}, +1=${kiln.filter((row) => n(row["fireModifier"]) === 1).length}, +2=${kiln.filter((row) => n(row["fireModifier"]) === 2).length}.

## 13. Resource Economy

Per player-game means — Clay gained ${mean(players.map((row) => n(row["clay_gained"]))).toFixed(2)}, spent ${mean(players.map((row) => n(row["clay_spent"]))).toFixed(2)}; Wood gained ${mean(players.map((row) => n(row["wood_gained"]))).toFixed(2)}, spent ${mean(players.map((row) => n(row["wood_spent"]))).toFixed(2)}; Coins gained ${mean(players.map((row) => n(row["coins_gained"]))).toFixed(2)}, spent ${mean(players.map((row) => n(row["coins_spent"]))).toFixed(2)}.

## 14. Seat / First Player

First-player mean VP ${mean(players.filter((row) => row["first_player"] === true).map((row) => n(row["total_vp"]))).toFixed(2)} versus other seats ${mean(players.filter((row) => row["first_player"] !== true).map((row) => n(row["total_vp"]))).toFixed(2)}. Seeds and seats are retained for exact follow-up.

## 15. Player Count Scaling

The player-count table jointly reports score, production, Orders, Progress, Quality, Presentation, Patronage and occupancy. Action-space pressure is in the round file with capacity denominators.

## 16. Potential Balance Problems

${flags.map((flag) => `- ${flag}`).join("\n")}

## 17. Statistical Summary

Final VP mean ${mean(players.map((row) => n(row["total_vp"]))).toFixed(2)}, median ${median(players.map((row) => n(row["total_vp"]))).toFixed(2)}, SD ${standardDeviation(players.map((row) => n(row["total_vp"]))).toFixed(2)}, approximate 95% CI ±${(1.96 * standardDeviation(players.map((row) => n(row["total_vp"]))) / Math.sqrt(players.length)).toFixed(2)}. Correlations with VP: Progress ${correlation(players, "final_imperial_progress", "total_vp").toFixed(3)}, Orders ${correlation(players.map((row) => ({ ...row, completed_total: n(row["market_orders_completed"]) + n(row["imperial_orders_completed"]) })), "completed_total", "total_vp").toFixed(3)}, natural Masterpieces ${correlation(players, "natural_masterpiece", "total_vp").toFixed(3)}, final Masterpieces ${correlation(players, "final_masterpiece", "total_vp").toFixed(3)}, Techniques ${correlation(players, "techniques_owned", "total_vp").toFixed(3)}, Patronage ${correlation(players, "patronage_uses", "total_vp").toFixed(3)}, dead ceramic rate ${correlation(players, "dead_ceramic_rate", "total_vp").toFixed(3)}. Correlation does not prove causation.

## 18. Reproducibility and Performance

- Repository commit: ${metadata.repositoryCommit}
- Rules: V1.0.2
- AI policy: ${AI_POLICY_VERSION}
- Simulation: ${AI_SIMULATION_VERSION}
- Seeds: raw game file
- Runtime: ${(metadata.totalRuntimeMs / 1000).toFixed(2)} s total; mean ${(metadata.totalRuntimeMs / results.length).toFixed(2)} ms/game
- AI decision time: mean ${mean(decisions).toFixed(3)} ms; median ${median(decisions).toFixed(3)} ms; p95 ${percentile(decisions, 0.95).toFixed(3)} ms; max ${Math.max(0, ...decisions).toFixed(3)} ms
- Invalid/replaced attempts: ${metadata.invalidAttempts}
`;
}

function designerSummary(
  results: readonly SelfPlayGameResult[],
  players: readonly CsvRow[],
  firings: readonly CsvRow[],
  kiln: readonly CsvRow[],
  orders: readonly CsvRow[],
  techniques: readonly CsvRow[],
  actions: readonly CsvRow[],
): string {
  const verdicts = qualityVerdicts(firings);
  const finalMp = firings.filter((row) => row["finalQuality"] === "masterpiece");
  const source = (row: CsvRow) => row["jun"] === true ? "Jun" : row["ge"] === true ? "Ge" : row["saggerSelection"] === true ? "Sagger Selection" : row["secondFiringOrigin"] === true ? "Second Firing" : row["naturalQuality"] === "masterpiece" ? "Natural" : "Other";
  const sources = ["Natural", "Jun", "Ge", "Sagger Selection", "Second Firing", "Other"];
  return `# Kiln Opening V1.0.2 Designer Summary

Dataset: ${results.length} complete games and ${players.length} player-games. Treat AI-specific correlations as signals, not causal proof.

## Player Count

### Adaptive Training

${playerCountTable(players.filter((row) => row["dataset_split"] === "training"), kiln.filter((row) => row["dataset_split"] === "training"))}

### Frozen Holdout

${playerCountTable(players.filter((row) => row["dataset_split"] === "holdout"), kiln.filter((row) => row["dataset_split"] === "holdout"))}

## Traditions

${traditionTable(players, actions)}

## Quality Distribution

${qualityTable(firings)}

## Masterpiece Source

| Source | Count | % of Final Masterpieces |
|---|---:|---:|
${sources.map((name) => {
    const count = finalMp.filter((row) => source(row) === name).length;
    return `| ${name} | ${count} | ${pct(count, finalMp.length)} |`;
  }).join("\n")}

## Pre-Fire Alignment

${alignmentTable(firings)}

## Quality by Glaze

${qualityByDimension(firings, "glaze", "Glaze")}

## Quality by Kiln Zone

${qualityByDimension(firings, "kilnZone", "Zone")}

${masterpieceFrequency(players, firings)}

## Orders

${orderTable(orders)}

## Techniques

${techniqueTable(techniques)}

## Imperial Track

| Ending Progress | Player-games | % |
|---:|---:|---:|
${[0, 1, 2, 3, 4, 5].map((space) => {
    const count = players.filter((row) => n(row["final_imperial_progress"]) === space).length;
    return `| ${space} | ${count} | ${pct(count, players.length)} |`;
  }).join("\n")}

## Diagnostic Verdict

- Masterpiece: **${verdicts.masterpiece}**
- Flawed: **${verdicts.flawed}**
- Ladder: **${verdicts.ladder}**
- ${verdicts.explanation}
`;
}

function aiReport(results: readonly SelfPlayGameResult[], metadata: StudyMetadata): string {
  const decisions = results.flatMap((result) => result.decisions);
  const durations = decisions.map((decision) => decision.decisionDurationMs);
  const scoreByPhase = (target: "early" | "developing" | "mature" | "holdout") => results
    .filter((result) => phaseFor(result.config.gameSequence) === target)
    .flatMap((result) => Object.values(result.state.finalResult?.scores ?? {}).map((score) => score.total));
  const ordersByPhase = (target: "early" | "developing" | "mature" | "holdout") => results
    .filter((result) => phaseFor(result.config.gameSequence) === target)
    .flatMap((result) => Object.values(result.state.players).map((player) => player.completedOrders.length));
  const earlyScores = scoreByPhase("early");
  const matureScores = scoreByPhase("mature");
  const holdoutScores = scoreByPhase("holdout");
  return `# Kiln Opening V1.0.2 AI Self-Play Report

## Architecture

The reusable AI layer is split into a player observation projector, feasibility and portfolio planner, authoritative legal-action enumeration, structured evaluator, seeded policy, player-count strategy profile, and a runner. The policy consumes only a sanitized observation plus authoritative legal commands; it never receives the engine's deck arrays.

## Observation and Hidden-Information Safety

The observation contains public state, public Fire discard composition, and only that AI's own pending Wood contribution. Other unrevealed Wood values and hidden Market, Imperial, Technique and Fire order are absent. Blind-draw commands identify only the chosen deck.

## Legal Actions and Multi-Step Support

Candidates cover every V1.0.2 phase and intermediate window. The unchanged engine validates every candidate before it reaches the policy. Across ${results.length} valid games, ${decisions.reduce((sum, decision) => sum + decision.legalActionCount, 0)} legal commands were evaluated and ${results.reduce((sum, result) => sum + result.illegalActionAttempts, 0)} selected commands were rejected.

## Policy, Evaluation and Learning

The evaluator adds Order feasibility, destination-limited terminal conversion, an explicit Imperial route, projected resource demand, and opportunity cost to immediate VP, future VP, Imperial, Quality, blocking, risk and learned terms. Sagger and Ge use pure before/after counterfactuals, and Technique acquisition is priced by expected beneficial uses minus full purchase, activation, and worker-opportunity costs. Optional effects include explicit decline actions and normalized diagnostics. Separate 2P/3P/4P profiles update after each completed training game only; snapshots at initial, game 10, game 30, game 50 and frozen holdout are serialized. Exploration falls by training phase and is fixed at the mature value throughout holdout.

## Reproducibility

Game RNG and AI RNG use separate seeds. Repository ${metadata.repositoryCommit}; rules V1.0.2; policy ${AI_POLICY_VERSION}; simulation ${AI_SIMULATION_VERSION}. Exact seeds are in the game CSV and JSONL.

## Decision Performance

${decisions.length} decisions: mean ${mean(durations).toFixed(3)} ms, median ${median(durations).toFixed(3)} ms, p95 ${percentile(durations, 0.95).toFixed(3)} ms, maximum ${Math.max(0, ...durations).toFixed(3)} ms. This is compatible with future live inference; self-play currently uses one-ply heuristic evaluation rather than deep search.

## Learning Improvement

The first 50 games at each player count update bounded profiles; games 51–100 use the frozen game-50 profile and fixed mature exploration. Early training averaged ${mean(earlyScores).toFixed(2)} VP and ${mean(ordersByPhase("early")).toFixed(2)} completed Orders per player-game; mature training averaged ${mean(matureScores).toFixed(2)} VP and ${mean(ordersByPhase("mature")).toFixed(2)} Orders; frozen holdout averaged ${mean(holdoutScores).toFixed(2)} VP and ${mean(ordersByPhase("holdout")).toFixed(2)} Orders. Improvement claims must use the frozen holdout rather than the training trajectory alone.

## Known Weaknesses

- Bounded feasibility planning is not unrestricted multi-round search.
- Opponent modelling is visible-state heuristic only.
- Legal candidate enumeration is broad but prunes Glaze pair combinations in normal mode for latency.
- Learning is deliberately conservative and can inherit self-play population biases.
- Opportunity denominators are exact when an optional command is legal, but some passive abilities are inferred from events.

## Future Difficulty Levels

Difficulty can vary exploration, evaluation noise, candidate breadth, opponent awareness, risk tolerance and later search depth without changing rules.

## Readiness for Human vs AI

- Engine integration: ready.
- Observation safety: implemented and regression-tested.
- Action coverage: full V1.0.2 phase coverage through authoritative validation.
- Strategic competence: suitable for playtest bots, not yet expert.
- Performance: live-compatible at measured one-ply latency.
- Debugging: structured decisions, alternatives, factors, seeds and policy versions retained.
- Persistence: policy artifact is reusable; live room storage has not yet added AI-seat metadata.

The smallest remaining production task is to add an AI-controlled flag to lobby seats, then have the server invoke this policy whenever such a seat is the authoritative actor. The browser must not run authoritative AI decisions.
`;
}

interface ComparisonMetrics {
  games: number;
  playerGames: number;
  averageVp: number;
  firedPerPlayer: number;
  ordersPerPlayer: number;
  unusedFinishedPerPlayer: number;
  deadCeramicRate: number;
  endingClay: number;
  endingWood: number;
  endingCoins: number;
  averageProgress: number;
}

function metricsForResults(results: readonly SelfPlayGameResult[]): ComparisonMetrics {
  const players = results.flatMap((result) => result.state.playerOrder.map((playerId) => ({ result, playerId })));
  const fired = players.reduce((sum, { result, playerId }) => sum + result.firings.filter((row) => row.ownerId === playerId).length, 0);
  const unused = players.reduce((sum, { result, playerId }) => sum + Object.values(result.state.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length, 0);
  return {
    games: results.length,
    playerGames: players.length,
    averageVp: mean(players.map(({ result, playerId }) => result.state.finalResult?.scores[playerId]?.total ?? 0)),
    firedPerPlayer: fired / Math.max(1, players.length),
    ordersPerPlayer: mean(players.map(({ result, playerId }) => result.state.players[playerId]?.completedOrders.length ?? 0)),
    unusedFinishedPerPlayer: unused / Math.max(1, players.length),
    deadCeramicRate: unused / Math.max(1, fired),
    endingClay: mean(players.map(({ result, playerId }) => result.state.players[playerId]?.resources.clay ?? 0)),
    endingWood: mean(players.map(({ result, playerId }) => result.state.players[playerId]?.resources.wood ?? 0)),
    endingCoins: mean(players.map(({ result, playerId }) => result.state.players[playerId]?.resources.coins ?? 0)),
    averageProgress: mean(players.map(({ result, playerId }) => result.state.players[playerId]?.imperialProgress ?? 0)),
  };
}

async function baselineMetrics(_outputDirectory: string): Promise<ComparisonMetrics | null> {
  try {
    const path = resolve("playtests/v1.0.1/playtests_v1.0.1_games.jsonl");
    const records = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
      config: { gameSequence: number };
      finalState: SelfPlayGameResult["state"];
      firingCount: number;
    }).filter((record) => record.config.gameSequence >= 31);
    const playerRows = records.flatMap((record) => record.finalState.playerOrder.map((playerId) => ({ record, playerId })));
    const unused = playerRows.reduce((sum, { record, playerId }) => sum + Object.values(record.finalState.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length, 0);
    const fired = records.reduce((sum, record) => sum + record.firingCount, 0);
    return {
      games: records.length,
      playerGames: playerRows.length,
      averageVp: mean(playerRows.map(({ record, playerId }) => record.finalState.finalResult?.scores[playerId]?.total ?? 0)),
      firedPerPlayer: fired / Math.max(1, playerRows.length),
      ordersPerPlayer: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.completedOrders.length ?? 0)),
      unusedFinishedPerPlayer: unused / Math.max(1, playerRows.length),
      deadCeramicRate: unused / Math.max(1, fired),
      endingClay: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.clay ?? 0)),
      endingWood: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.wood ?? 0)),
      endingCoins: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.coins ?? 0)),
      averageProgress: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.imperialProgress ?? 0)),
    };
  } catch {
    return null;
  }
}

async function selfplay002Metrics(_outputDirectory: string): Promise<ComparisonMetrics | null> {
  try {
    const path = resolve("playtests/v1.0.1/selfplay-002/playtests_v1.0.1_games.jsonl");
    const records = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as {
      config: { gameSequence: number; datasetSplit?: string };
      finalState: SelfPlayGameResult["state"];
      firingCount: number;
    }).filter((record) => record.config.datasetSplit === "holdout" || record.config.gameSequence >= 51);
    const playerRows = records.flatMap((record) => record.finalState.playerOrder.map((playerId) => ({ record, playerId })));
    const unused = playerRows.reduce((sum, { record, playerId }) => sum + Object.values(record.finalState.ceramics).filter((ceramic) => ceramic.ownerId === playerId && ceramic.stage === "finished").length, 0);
    const fired = records.reduce((sum, record) => sum + record.firingCount, 0);
    return {
      games: records.length,
      playerGames: playerRows.length,
      averageVp: mean(playerRows.map(({ record, playerId }) => record.finalState.finalResult?.scores[playerId]?.total ?? 0)),
      firedPerPlayer: fired / Math.max(1, playerRows.length),
      ordersPerPlayer: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.completedOrders.length ?? 0)),
      unusedFinishedPerPlayer: unused / Math.max(1, playerRows.length),
      deadCeramicRate: unused / Math.max(1, fired),
      endingClay: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.clay ?? 0)),
      endingWood: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.wood ?? 0)),
      endingCoins: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.resources.coins ?? 0)),
      averageProgress: mean(playerRows.map(({ record, playerId }) => record.finalState.players[playerId]?.imperialProgress ?? 0)),
    };
  } catch {
    return null;
  }
}

function clusteredMean(rows: readonly CsvRow[], key: string): { mean: number; low: number; high: number; se: number } {
  const average = mean(rows.map((row) => n(row[key])));
  const clusters = new Map<string, number>();
  for (const row of rows) {
    const gameId = String(row["game_id"]);
    clusters.set(gameId, (clusters.get(gameId) ?? 0) + n(row[key]) - average);
  }
  const count = Math.max(1, clusters.size);
  const se = rows.length === 0 || count <= 1 ? 0 : Math.sqrt(count / (count - 1) * [...clusters.values()].reduce((sum, value) => sum + value ** 2, 0)) / rows.length;
  return { mean: average, low: average - 1.96 * se, high: average + 1.96 * se, se };
}

function adjustedVpRows(players: readonly CsvRow[]): CsvRow[] {
  const overall = mean(players.map((row) => n(row["total_vp"])));
  const groupMean = (key: string, value: CsvValue) => mean(players.filter((row) => row[key] === value).map((row) => n(row["total_vp"])));
  return players.map((row): CsvRow => ({
    ...row,
    adjusted_vp: n(row["total_vp"])
      - groupMean("player_count", row["player_count"])
      - groupMean("seat", row["seat"])
      - groupMean("assigned_intent", row["assigned_intent"])
      + 2 * overall,
  }));
}

function adjustedTraditionTable(players: readonly CsvRow[]): string {
  const adjusted = adjustedVpRows(players);
  const ru = clusteredMean(adjusted.filter((row) => row["tradition"] === "RU"), "adjusted_vp");
  return [
    "| Tradition | N | Raw VP | Adjusted VP | Difference vs Ru | Approx. game-clustered 95% interval |",
    "|---|---:|---:|---:|---:|---:|",
    ...KILN_IDS.map((tradition) => {
      const rows = adjusted.filter((row) => row["tradition"] === tradition);
      const estimate = clusteredMean(rows, "adjusted_vp");
      const difference = estimate.mean - ru.mean;
      const differenceSe = Math.sqrt(estimate.se ** 2 + ru.se ** 2);
      return `| ${tradition} | ${rows.length} | ${mean(rows.map((row) => n(row["total_vp"]))).toFixed(2)} | ${estimate.mean.toFixed(2)} | ${difference >= 0 ? "+" : ""}${difference.toFixed(2)} | ${(difference - 1.96 * differenceSe).toFixed(2)} to ${(difference + 1.96 * differenceSe).toFixed(2)} |`;
    }),
  ].join("\n");
}

function selfplay003ComparisonReport(
  baseline: ComparisonMetrics | null,
  previous: ComparisonMetrics | null,
  training: ComparisonMetrics,
  holdout: ComparisonMetrics,
  players: readonly CsvRow[],
): string {
  const row = (label: string, select: (metrics: ComparisonMetrics) => number) =>
    `| ${label} | ${baseline === null ? "unavailable" : select(baseline).toFixed(3)} | ${previous === null ? "unavailable" : select(previous).toFixed(3)} | ${select(training).toFixed(3)} | ${select(holdout).toFixed(3)} |`;
  const holdoutPlayers = players.filter((player) => player["dataset_split"] === "holdout");
  const vp = clusteredMean(holdoutPlayers, "total_vp");
  const unused = clusteredMean(holdoutPlayers, "unused_finished");
  const ordersWithTotal = holdoutPlayers.map((player) => ({ ...player, completed_orders: n(player["market_orders_completed"]) + n(player["imperial_orders_completed"]) }));
  const orders = clusteredMean(ordersWithTotal, "completed_orders");
  return `# Selfplay-001 vs Selfplay-002 vs Selfplay-003

Rules remained frozen at V1.0.2 for this run. The primary Selfplay-003 evidence is its fresh-seed, frozen-profile holdout.

| Metric | Selfplay-001 mature | Selfplay-002 holdout | Selfplay-003 training | Selfplay-003 holdout |
|---|---:|---:|---:|---:|
${row("Average VP", (value) => value.averageVp)}
${row("Fired ceramics / player", (value) => value.firedPerPlayer)}
${row("Completed Orders / player", (value) => value.ordersPerPlayer)}
${row("Unused Finished / player", (value) => value.unusedFinishedPerPlayer)}
${row("Dead ceramic rate", (value) => value.deadCeramicRate)}
${row("Ending Clay", (value) => value.endingClay)}
${row("Ending Wood", (value) => value.endingWood)}
${row("Ending Coins", (value) => value.endingCoins)}
${row("Ending Imperial Progress", (value) => value.averageProgress)}

## Game-clustered uncertainty for Selfplay-003 holdout

- VP: ${vp.mean.toFixed(3)} (approx. 95% interval ${vp.low.toFixed(3)}–${vp.high.toFixed(3)}).
- Completed Orders: ${orders.mean.toFixed(3)} (${orders.low.toFixed(3)}–${orders.high.toFixed(3)}).
- Unused Finished: ${unused.mean.toFixed(3)} (${unused.low.toFixed(3)}–${unused.high.toFixed(3)}).

## Tradition estimate adjusted for player count, seat, and assigned intent

${adjustedTraditionTable(holdoutPlayers)}

Intervals use the game as the independent cluster. They are diagnostics for this mirror-policy population, not causal rule estimates.
`;
}

function selfplay003Audit(
  results: readonly SelfPlayGameResult[],
  players: readonly CsvRow[],
  optionalEffects: readonly CsvRow[],
  techniqueForecasts: readonly CsvRow[],
  intentOutcomes: readonly CsvRow[],
  snapshots: StrategySnapshots,
  metadata: StudyMetadata,
  previous: ComparisonMetrics | null,
): string {
  const holdoutPlayers = players.filter((row) => row["dataset_split"] === "holdout");
  const holdoutIntents = intentOutcomes.filter((row) => row["dataset_split"] === "holdout");
  const selectedOptional = optionalEffects.filter((row) => row["dataset_split"] === "holdout" && row["selected"] === true);
  const saggerDowngrades = selectedOptional.filter((row) => row["effect_id"] === "sagger_selection" && n(row["quality_rank_delta"]) < 0);
  const saggerNonPositive = selectedOptional.filter((row) => row["effect_id"] === "sagger_selection" && n(row["projected_net_value"]) <= 0);
  const harmfulGe = selectedOptional.filter((row) => row["effect_id"] === "ge" && n(row["order_value_delta"]) < 0 && n(row["projected_net_value"]) <= 0);
  const negativeTechniqueBuys = techniqueForecasts.filter((row) => n(row["forecast_net_value"]) <= 0);
  const profilesFrozen = ["2", "3", "4"].every((count) => JSON.stringify(snapshots.final[count]) === JSON.stringify(snapshots.frozenHoldout[count]));
  const profilesChanged = ["2", "3", "4"].some((count) => JSON.stringify(snapshots.initial[count]) !== JSON.stringify(snapshots.frozenHoldout[count]));
  const current = metricsForResults(results.filter((result) => splitFor(result) === "holdout"));
  const byIntent = (intent: string) => holdoutIntents.filter((row) => row["assigned_intent"] === intent);
  const intentLine = (intent: string) => {
    const rows = byIntent(intent);
    return `| ${intent} | ${rows.length} | ${mean(rows.map((row) => n(row["final_vp"]))).toFixed(2)} | ${mean(rows.map((row) => n(row["unused_finished"]))).toFixed(2)} | ${mean(rows.map((row) => n(row["final_imperial_progress"]))).toFixed(2)} | ${mean(rows.map((row) => n(row["imperial_orders_completed"]) + n(row["market_orders_completed"]))).toFixed(2)} |`;
  };
  const viableImperial = byIntent("Imperial").filter((row) => row["viable_early_imperial_route"] === true && String(row["first_imperial_acquisition_round"] ?? "") !== "");
  const earlyMedian = median(viableImperial.map((row) => n(row["first_imperial_acquisition_round"])));
  const lateBlindImperial = results.filter((result) => splitFor(result) === "holdout").flatMap((result) => result.events.filter((row) => {
    const event = eventValue(row);
    return event.type === "ORDER_TAKEN" && event.orderId.startsWith("I") && event.acquisition === "blind_top" && row.round >= 4;
  }));
  const earlyTraining = players.filter((row) => n(row["sequence"]) <= 10);
  const matureTraining = players.filter((row) => n(row["sequence"]) >= 31 && n(row["sequence"]) <= 50);
  const earlyEstimate = clusteredMean(earlyTraining, "total_vp");
  const matureEstimate = clusteredMean(matureTraining, "total_vp");
  const learningDifference = matureEstimate.mean - earlyEstimate.mean;
  const learningDifferenceSe = Math.sqrt(earlyEstimate.se ** 2 + matureEstimate.se ** 2);
  const learningDifferenceLow = learningDifference - 1.96 * learningDifferenceSe;
  const learningDifferenceHigh = learningDifference + 1.96 * learningDifferenceSe;
  const learningDemonstrated = profilesChanged
    && learningDifferenceLow > 0
    && current.averageVp >= mean(matureTraining.map((row) => n(row["total_vp"]))) - 0.5;
  const holdoutTraditions = adjustedVpRows(holdoutPlayers);
  const jun = clusteredMean(holdoutTraditions.filter((row) => row["tradition"] === "JU"), "adjusted_vp");
  const ru = clusteredMean(holdoutTraditions.filter((row) => row["tradition"] === "RU"), "adjusted_vp");
  const junDifference = jun.mean - ru.mean;
  const junSe = Math.sqrt(jun.se ** 2 + ru.se ** 2);
  const junLow = junDifference - 1.96 * junSe;
  const recommendationJun = junDifference >= 1.5 && junLow > 0
    ? "The Jun signal remains substantial and statistically credible in this policy population; run an isolated Jun A/B next, without changing V1.0.2 in this study."
    : "The corrected-policy holdout does not justify a Jun rules A/B yet; retain Jun and collect more independent evidence.";
  const imperialMean = mean(byIntent("Imperial").map((row) => n(row["final_imperial_progress"])));
  const imperialPresentation = byIntent("Imperial").filter((row) => row["presentation_eligible"] === true).length;
  const recommendationImperial = viableImperial.length > 0 && earlyMedian <= 2 && imperialMean < 1 && imperialPresentation === 0
    ? "The corrected policy committed early where viable but still produced no coherent upper-track route; a separate minimal Imperial rules A/B is now warranted."
    : "Imperial route evidence is not yet strong enough for a rules A/B; retain V1.0.2 and improve or expand route sampling first.";
  return `# Kiln Opening V1.0.2 Selfplay-003 Study Audit

## Run and provenance integrity

- Rules: V1.0.2, unchanged during this study.
- AI policy: \`${AI_POLICY_VERSION}\`; simulation: \`${AI_SIMULATION_VERSION}\`.
- Valid games: ${results.length} exactly — ${results.filter((result) => result.state.playerCount === 2).length} at 2P, ${results.filter((result) => result.state.playerCount === 3).length} at 3P, and ${results.filter((result) => result.state.playerCount === 4).length} at 4P.
- Training / frozen holdout: ${results.filter((result) => splitFor(result) === "training").length} / ${results.filter((result) => splitFor(result) === "holdout").length} games.
- Invalid attempts / replacements: ${metadata.invalidAttempts} / ${metadata.replacements.length}.
- Selected illegal actions: ${results.reduce((sum, result) => sum + result.illegalActionAttempts, 0)}.
- Holdout profile mutation: ${profilesFrozen ? "none" : "DETECTED"}.
- Source, diff, environment, schedule, and frozen-profile hashes are in \`source_manifest.json\`.

## Hard behavioral acceptance gates

- ${saggerDowngrades.length === 0 ? "PASS" : "FAIL"}: Sagger uses that downgrade Quality = ${saggerDowngrades.length}.
- ${saggerNonPositive.length === 0 ? "PASS" : "FAIL"}: Sagger uses with non-positive recorded counterfactual value = ${saggerNonPositive.length}.
- ${harmfulGe.length === 0 ? "PASS" : "FAIL"}: Ge uses where forced Crackle destroys the more valuable recorded route = ${harmfulGe.length}.
- ${negativeTechniqueBuys.length === 0 ? "PASS" : "FAIL"}: Technique purchases with non-positive forecast net value = ${negativeTechniqueBuys.length}.
- ${profilesFrozen ? "PASS" : "FAIL"}: frozen holdout profile did not mutate.
- ${metadata.invalidAttempts === 0 ? "PASS" : "FAIL"}: no invalid/replacement simulation.

## Primary fresh-seed holdout outcomes

| Metric | Selfplay-002 holdout | Selfplay-003 holdout | Target |
|---|---:|---:|---:|
| Average VP | ${previous?.averageVp.toFixed(3) ?? "unavailable"} | ${current.averageVp.toFixed(3)} | no material regression |
| Fired / player | ${previous?.firedPerPlayer.toFixed(3) ?? "unavailable"} | ${current.firedPerPlayer.toFixed(3)} | no material regression |
| Orders / player | ${previous?.ordersPerPlayer.toFixed(3) ?? "unavailable"} | ${current.ordersPerPlayer.toFixed(3)} | no material regression |
| Unused Finished / player | ${previous?.unusedFinishedPerPlayer.toFixed(3) ?? "unavailable"} | ${current.unusedFinishedPerPlayer.toFixed(3)} | <1.8; stretch <1.5 |
| Dead ceramic rate | ${previous?.deadCeramicRate.toFixed(3) ?? "unavailable"} | ${current.deadCeramicRate.toFixed(3)} | lower is better |

## Intent and terminal conversion

| Intent | N | VP | Unused Finished | Final Progress | Orders |
|---|---:|---:|---:|---:|---:|
${["Market", "Imperial", "Hybrid", "Quality-control", "Volume-multi", "Technique-economy"].map(intentLine).join("\n")}

- Imperial early-route cases with an Imperial acquisition: ${viableImperial.length}; median first Imperial acquisition round: ${earlyMedian.toFixed(2)}.
- Late blind Imperial acquisitions in rounds 4–5: ${lateBlindImperial.length}.
- Imperial-intent Presentation eligibility: ${imperialPresentation}/${byIntent("Imperial").length}; mean final Progress ${imperialMean.toFixed(2)}.

## Optional effects and Techniques

- Optional-effect decision rows: ${optionalEffects.length}; selected in holdout: ${selectedOptional.length}.
- Technique acquisition forecasts: ${techniqueForecasts.length}; later-use realized: ${techniqueForecasts.filter((row) => n(row["actual_uses"]) > 0).length}.
- T11/T13/T15 purchases: ${techniqueForecasts.filter((row) => ["T11", "T13", "T15"].includes(String(row["technique_id"]))).length}; non-positive forecasts: ${techniqueForecasts.filter((row) => ["T11", "T13", "T15"].includes(String(row["technique_id"])) && n(row["forecast_net_value"]) <= 0).length}.

## Learning audit

Profiles ${profilesChanged ? "changed deterministically and remained bounded" : "did not change"}. Early training VP was ${mean(earlyTraining.map((row) => n(row["total_vp"]))).toFixed(2)}, mature training VP ${mean(matureTraining.map((row) => n(row["total_vp"]))).toFixed(2)}, and frozen holdout VP ${current.averageVp.toFixed(2)}. The mature-minus-early estimate was ${learningDifference >= 0 ? "+" : ""}${learningDifference.toFixed(2)} VP with an approximate game-clustered 95% interval of ${learningDifferenceLow.toFixed(2)} to ${learningDifferenceHigh.toFixed(2)}. Learning is **${learningDemonstrated ? "demonstrated by this run" : profilesChanged ? "parameterized but not demonstrated as stronger play" : "disabled"}**.

## Final decisions

1. **V1.0.2 stability:** retain all rules and data unchanged. Legal execution is stable; balance conclusions remain bounded to this corrected mirror-policy population.
2. **Jun:** adjusted Jun-minus-Ru VP was ${junDifference >= 0 ? "+" : ""}${junDifference.toFixed(2)} with an approximate game-clustered lower 95% bound of ${junLow.toFixed(2)}. ${recommendationJun}
3. **Imperial:** ${recommendationImperial}
4. **Ge:** decoration-aware counterfactual use is now auditable; do not nerf Ge from created-Masterpiece counts alone.
5. **Techniques:** distinguish forecast-positive purchases that lost later opportunities from tiles whose expected-use forecast never repaid full costs. Do not infer underpower from zero activation without the acquisition forecast table.
6. **Learning:** classify it as ${learningDemonstrated ? "demonstrated" : profilesChanged ? "parameterized, not demonstrated" : "disabled"}; do not market learned profiles as stronger unless fresh holdout results support that claim.

No gameplay rule or balance value was changed.
`;
}

function comparisonReport(baseline: ComparisonMetrics | null, training: ComparisonMetrics, holdout: ComparisonMetrics): string {
  const metric = (label: string, select: (value: ComparisonMetrics) => number, better: "higher" | "lower") => {
    const old = baseline === null ? 0 : select(baseline);
    const current = select(holdout);
    const improved = baseline !== null && (better === "higher" ? current > old : current < old);
    return `| ${label} | ${baseline === null ? "unavailable" : old.toFixed(3)} | ${select(training).toFixed(3)} | ${current.toFixed(3)} | ${baseline === null ? "not comparable" : improved ? "improved" : "not improved"} |`;
  };
  const targets = [
    ["Fired / player ≥ 4.5", holdout.firedPerPlayer >= 4.5],
    ["Orders / player ≥ 1.0", holdout.ordersPerPlayer >= 1],
    ["Unused Finished / player ≤ 1.25", holdout.unusedFinishedPerPlayer <= 1.25],
    ["Dead ceramic rate ≤ 45%", holdout.deadCeramicRate <= 0.45],
    ["Ending Clay < 4", holdout.endingClay < 4],
    ["Ending Wood < 5", holdout.endingWood < 5],
  ] as const;
  return `# Selfplay-001 Mature vs Selfplay-002

The historical Selfplay-002 comparison remains V1.0.1 evidence and is labelled separately. The current V1.0.2 study uses 150 adaptive training games followed by 150 frozen-policy holdout games; cross-rules comparisons are descriptive rather than promotion evidence. The historical comparison baseline is the ${baseline?.games ?? 0}-game mature segment (games 31–50 at each player count) of Selfplay-001; the Selfplay-002 holdout contains ${holdout.games} games.

| Metric | Selfplay-001 mature | Selfplay-002 training | Selfplay-002 frozen holdout | Direction |
|---|---:|---:|---:|---|
${metric("Average VP", (value) => value.averageVp, "higher")}
${metric("Fired ceramics / player", (value) => value.firedPerPlayer, "higher")}
${metric("Completed Orders / player", (value) => value.ordersPerPlayer, "higher")}
${metric("Unused Finished / player", (value) => value.unusedFinishedPerPlayer, "lower")}
${metric("Dead ceramic rate", (value) => value.deadCeramicRate, "lower")}
${metric("Ending Clay", (value) => value.endingClay, "lower")}
${metric("Ending Wood", (value) => value.endingWood, "lower")}
${metric("Ending Coins", (value) => value.endingCoins, "lower")}
${metric("Ending Imperial Progress", (value) => value.averageProgress, "higher")}

## Diagnostic Behavior Targets

${targets.map(([label, passed]) => `- ${passed ? "PASS" : "MISS"}: ${label}`).join("\n")}

These thresholds diagnose whether the policy is converting resources and ceramic pipelines; they are not rules or automatic balance changes. Training-only movement is not accepted as evidence of stronger play. Balance signals remain descriptive because every seat is controlled by variants of the same policy.
`;
}

export async function writeStudyOutputs(
  outputDirectory: string,
  results: readonly SelfPlayGameResult[],
  snapshots: StrategySnapshots,
  metadata: StudyMetadata,
): Promise<void> {
  const players = playerRows(results);
  const games = gameRows(results, players);
  const rounds = roundRows(results);
  const orderEvents = orderEventRows(results);
  const orders = orderRows(results, orderEvents);
  const techniqueEvents = techniqueEventRows(results);
  const techniques = techniqueRows(results, techniqueEvents);
  const actions = actionRows(results);
  const decisions = decisionRows(results);
  const plans = planRows(results);
  const optionalEffects = optionalEffectRows(results);
  const techniqueForecasts = techniqueForecastRows(results);
  const intentOutcomes = intentOutcomeRows(results);
  const firings = firingRows(results);
  const kiln = kilnRows(results);
  const trainingResults = results.filter((result) => splitFor(result) === "training");
  const holdoutResults = results.filter((result) => splitFor(result) === "holdout");
  const baseline = await baselineMetrics(outputDirectory);
  const previous = await selfplay002Metrics(outputDirectory);
  const comparison = selfplay003ComparisonReport(
    baseline,
    previous,
    metricsForResults(trainingResults),
    metricsForResults(holdoutResults),
    players,
  );
  const audit = selfplay003Audit(results, players, optionalEffects, techniqueForecasts, intentOutcomes, snapshots, metadata, previous);
  await Promise.all([
    writeCsv(join(outputDirectory, "playtests_v1.0.2_games.csv"), games),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_players.csv"), players),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_rounds.csv"), rounds),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_orders.csv"), orders),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_order_events.csv"), orderEvents),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_techniques.csv"), techniques),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_technique_events.csv"), techniqueEvents),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_kiln.csv"), kiln),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_firings.csv"), firings),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_actions.csv"), actions),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_ai_decisions.csv"), decisions),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_ai_plans.csv"), plans),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_optional_effects.csv"), optionalEffects, [
      "decision_id", "game_id", "game_seed", "ai_seed", "player_count", "sequence", "dataset_split", "round", "phase", "player_id", "assigned_intent", "effect_id", "eligible_target_count", "eligible_target_ids", "selected", "selected_target_id", "selected_delta", "natural_quality", "projected_quality", "quality_rank_delta", "compatible_orders_before", "compatible_orders_after", "order_value_delta", "coin_cost", "wood_cost", "opportunity_cost", "gross_benefit", "projected_net_value", "reason_code",
    ]),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_technique_forecasts.csv"), techniqueForecasts, [
      "decision_id", "game_id", "game_seed", "ai_seed", "player_count", "sequence", "dataset_split", "round", "player_id", "assigned_intent", "technique_id", "remaining_rounds", "expected_windows", "opportunity_probability", "expected_beneficial_uses", "gross_benefit", "purchase_cost", "activation_cost", "worker_opportunity_cost", "forecast_net_value", "plan_compatibility", "forecast_reason_codes", "actual_legal_opportunities", "actual_uses", "opportunity_realized", "use_realized", "owner_final_vp", "owner_win",
    ]),
    writeCsv(join(outputDirectory, "playtests_v1.0.2_intent_outcomes.csv"), intentOutcomes),
    writeFile(join(outputDirectory, "playtests_v1.0.2_games.jsonl"), `${results.map((result) => JSON.stringify({
      config: result.config,
      finalState: result.state,
      durationMs: result.durationMs,
      actionCount: result.actions.length,
      firingCount: result.firings.length,
      strategyTagsByPlayer: result.strategyTagsByPlayer,
    })).join("\n")}\n`, "utf8"),
    writeFile(join(outputDirectory, "ai_strategy_v1.0.2.json"), `${JSON.stringify({
      rulesVersion: "1.0.2",
      aiPolicyVersion: AI_POLICY_VERSION,
      simulationVersion: AI_SIMULATION_VERSION,
      snapshots,
    }, null, 2)}\n`, "utf8"),
    writeFile(join(outputDirectory, "playtests_v1.0.2_report.md"), reportMarkdown(results, players, games, firings, kiln, orders, techniques, actions, metadata), "utf8"),
    writeFile(join(outputDirectory, "playtests_v1.0.2_designer_summary.md"), designerSummary(results, players, firings, kiln, orders, techniques, actions), "utf8"),
    writeFile(join(outputDirectory, "ai_selfplay_v1.0.2_report.md"), aiReport(results, metadata), "utf8"),
    writeFile(join(outputDirectory, "selfplay-001-vs-002-vs-003.md"), comparison, "utf8"),
    writeFile(join(outputDirectory, "selfplay-002-vs-selfplay-003.md"), comparison, "utf8"),
    writeFile(join(outputDirectory, "selfplay-003-study-audit.md"), audit, "utf8"),
    writeFile(join(outputDirectory, "playtests_v1.0.2_bugs.md"), `# Kiln Opening V1.0.2 Self-Play Bug Log\n\nValid games: ${results.length}. Invalid attempts: ${metadata.invalidAttempts}.\n\n${metadata.replacements.length === 0 ? "No engine bug or invalid simulation was observed." : metadata.replacements.map((entry) => `## ${entry.gameId}\n\n- Seed: ${entry.seed}\n- Observed: ${entry.error}\n- Result: excluded and replaced; no rule was changed.\n`).join("\n")}\n`, "utf8"),
  ]);
}

export function compactStudyFacts(results: readonly SelfPlayGameResult[]): {
  games: number;
  playerGames: number;
  decisions: number;
  firings: number;
  ordersCompleted: number;
} {
  return {
    games: results.length,
    playerGames: results.reduce((sum, result) => sum + result.state.playerCount, 0),
    decisions: results.reduce((sum, result) => sum + result.decisions.length, 0),
    firings: results.reduce((sum, result) => sum + result.firings.length, 0),
    ordersCompleted: results.reduce((sum, result) => sum + Object.values(result.state.players).reduce((playerSum, player) => playerSum + player.completedOrders.length, 0), 0),
  };
}

export type { DisplayExposureRow, KilnFiringRow };
