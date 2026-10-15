/**
 * Server-side validation of Playtest Form V3 (rules V1.6.1). The Edge Function runs this
 * before the service-role RPC, which re-checks the version gate and capacities in SQL.
 *
 * Every option list comes from the V1.6.1 content API (`src/game/content.ts`): Kilns,
 * Techs and their disciplines, Order IDs, Kiln Die faces, Shared Kiln capacity by player
 * count, the round count and the Recognition track.
 */

import {
  DISCIPLINES,
  FIRING,
  GAME_CONFIG,
  IMPERIAL_TRACK,
  KILN_IDS,
  ORDER_IDS,
  activeKilnSpaces,
  techsOfDiscipline,
} from "../game/content.ts";
import type { OrderId, PlayerCount, TechDiscipline, TechId } from "../game/types.ts";
import { PLAYTEST_FORM_VERSION } from "./types.ts";
import type {
  FireContribution,
  PlaytestFeedback,
  PlaytestValidationIssue,
  PlaytestValidationResult,
  PlayerMetrics,
  RoundMetrics,
  RoundPlayerMetrics,
} from "./types.ts";

/** The Firing-discipline Techs a round may record as used (V1.6.1 Appendix B). */
export const FIRING_TECH_IDS: readonly TechId[] = techsOfDiscipline("firing");
/** Fuel Ledger (T12): the only Tech that turns Bank/Stoke into −2/+2 (L638). */
export const FUEL_LEDGER_TECH_ID: TechId = "T12";
export const FIRE_CONTRIBUTIONS: readonly FireContribution[] = ["bank_2", "bank", "tend", "stoke", "stoke_2"];
export const KILN_DIE_FACES: readonly number[] = [...new Set(FIRING.kilnDie.faces)].sort((left, right) => left - right);
export const MAX_RECOGNITION: number = Math.max(...IMPERIAL_TRACK.track.map((entry) => entry.space));

/** The form field that records each discipline's Tech. */
export const TECH_FIELDS: Readonly<Record<TechDiscipline, "workshopTechId" | "glazingLoadingTechId" | "firingTechId">> = {
  workshop: "workshopTechId",
  glazing_loading: "glazingLoadingTechId",
  firing: "firingTechId",
};

export function sharedKilnCapacityFor(playerCount: PlayerCount): number {
  return activeKilnSpaces(playerCount).length;
}

/** The Contribution's Heat: ±1/0, or ±2 with Fuel Ledger. */
export function contributionHeat(contribution: FireContribution): number {
  switch (contribution) {
    case "bank_2":
      return -2;
    case "bank":
      return -1;
    case "tend":
      return 0;
    case "stoke":
      return 1;
    case "stoke_2":
      return 2;
  }
}

/** Base Heat = Kiln Die + revealed Contributions, clamped to the printed range (L262). */
export function baseHeatFor(kilnDie: number | null, contributions: ReadonlyArray<FireContribution | null>): number | null {
  if (kilnDie === null) return null;
  const sum = contributions.reduce<number>((total, contribution) => total + (contribution === null ? 0 : contributionHeat(contribution)), 0);
  return Math.min(FIRING.baseHeat.maximum, Math.max(FIRING.baseHeat.minimum, kilnDie + sum));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function issue(issues: PlaytestValidationIssue[], path: string, message: string): void {
  issues.push({ path, message });
}

function recordAt(value: unknown, path: string, issues: PlaytestValidationIssue[]): Record<string, unknown> {
  if (!isRecord(value)) {
    issue(issues, path, "This section is missing or invalid.");
    return {};
  }
  return value;
}

function arrayAt(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PlaytestValidationIssue[],
  maxLength: number,
): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    issue(issues, path, "This list is missing or invalid.");
    return [];
  }
  if (value.length > maxLength) issue(issues, path, `Keep this list to ${maxLength} entries or fewer.`);
  return value.slice(0, maxLength);
}

function text(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PlaytestValidationIssue[],
  maxLength: number,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    issue(issues, path, "Enter text or leave this blank.");
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) issue(issues, path, `Use ${maxLength} characters or fewer.`);
  return normalized.slice(0, maxLength);
}

function integer(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PlaytestValidationIssue[],
  min: number,
  max?: number,
  nullable = false,
): number | null {
  const value = record[key];
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || (max !== undefined && value > max)) {
    issue(
      issues,
      path,
      max === undefined ? `Enter a whole number of at least ${min}.` : `Enter a whole number from ${min} to ${max}.`,
    );
    return nullable ? null : min;
  }
  return value;
}

function enumValue<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PlaytestValidationIssue[],
  allowed: readonly T[],
  nullable = false,
): T | null {
  const value = record[key];
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    issue(issues, path, "Choose one of the available options.");
    return nullable ? null : (allowed[0] ?? null);
  }
  return value as T;
}

function parseCompletedOrders(record: Record<string, unknown>, path: string, issues: PlaytestValidationIssue[]): OrderId[] {
  const values = arrayAt(record, "completedOrderIds", `${path}.completedOrderIds`, issues, 20);
  const orderIds = values.flatMap((value, index) => {
    if (typeof value !== "string" || !(ORDER_IDS as readonly string[]).includes(value)) {
      issue(issues, `${path}.completedOrderIds.${index}`, "Choose a valid Order.");
      return [];
    }
    return [value as OrderId];
  });
  if (new Set(orderIds).size !== orderIds.length) {
    issue(issues, `${path}.completedOrderIds`, "Record each completed Order once.");
  }
  return orderIds;
}

function parsePlayer(value: unknown, index: number, issues: PlaytestValidationIssue[]): PlayerMetrics {
  const path = `players.${index}`;
  const record = recordAt(value, path, issues);
  const techFor = (discipline: TechDiscipline): TechId | null => {
    const field = TECH_FIELDS[discipline];
    return enumValue(record, field, `${path}.${field}`, issues, techsOfDiscipline(discipline), true);
  };
  if (Object.hasOwn(record, "startingTechniqueId")) {
    issue(issues, `${path}.startingTechniqueId`, "V1.6.1 has no Starting Techs.");
  }
  return {
    name: text(record, "name", `${path}.name`, issues, 40),
    kilnId: enumValue(record, "kilnId", `${path}.kilnId`, issues, KILN_IDS) ?? "RU",
    workshopTechId: techFor("workshop"),
    glazingLoadingTechId: techFor("glazing_loading"),
    firingTechId: techFor("firing"),
    completedOrderIds: parseCompletedOrders(record, path, issues),
    recognition: integer(record, "recognition", `${path}.recognition`, issues, 0, MAX_RECOGNITION) ?? 0,
    coinsRemaining: integer(record, "coinsRemaining", `${path}.coinsRemaining`, issues, 0) ?? 0,
    clayRemaining: integer(record, "clayRemaining", `${path}.clayRemaining`, issues, 0) ?? 0,
    woodRemaining: integer(record, "woodRemaining", `${path}.woodRemaining`, issues, 0) ?? 0,
    kilnAbilityUses: integer(record, "kilnAbilityUses", `${path}.kilnAbilityUses`, issues, 0, GAME_CONFIG.rounds) ?? 0,
    finalVp: integer(record, "finalVp", `${path}.finalVp`, issues, -100, 500) ?? 0,
    orderVp: integer(record, "orderVp", `${path}.orderVp`, issues, -100, 500, true),
    traditionVp: integer(record, "traditionVp", `${path}.traditionVp`, issues, -100, 500, true),
    exhibitionVp: integer(record, "exhibitionVp", `${path}.exhibitionVp`, issues, -100, 500, true),
    coinVp: integer(record, "coinVp", `${path}.coinVp`, issues, 0, GAME_CONFIG.coinEndGame.maxVp, true),
  };
}

function parseRoundPlayer(
  value: unknown,
  index: number,
  roundPath: string,
  sharedCapacity: number,
  issues: PlaytestValidationIssue[],
): RoundPlayerMetrics {
  const path = `${roundPath}.players.${index}`;
  const record = recordAt(value, path, issues);
  return {
    playerIndex: integer(record, "playerIndex", `${path}.playerIndex`, issues, 0, 3) ?? 0,
    contribution: enumValue(record, "contribution", `${path}.contribution`, issues, FIRE_CONTRIBUTIONS, true),
    sharedLoaded: integer(record, "sharedLoaded", `${path}.sharedLoaded`, issues, 0, sharedCapacity, true),
    imperialLoaded: integer(record, "imperialLoaded", `${path}.imperialLoaded`, issues, 0, 1) ?? 0,
    ordersCompleted: integer(record, "ordersCompleted", `${path}.ordersCompleted`, issues, 0, 20, true),
    kilnAbilityUses: integer(record, "kilnAbilityUses", `${path}.kilnAbilityUses`, issues, 0, 1) ?? 0,
  };
}

function parseFiringTechIds(record: Record<string, unknown>, path: string, issues: PlaytestValidationIssue[]): TechId[] {
  const values = arrayAt(record, "firingTechIds", path, issues, FIRING_TECH_IDS.length);
  const techIds = values.flatMap((value, index) => {
    if (typeof value !== "string" || !FIRING_TECH_IDS.includes(value as TechId)) {
      issue(issues, `${path}.${index}`, "Choose a valid Firing Tech.");
      return [];
    }
    return [value as TechId];
  });
  if (new Set(techIds).size !== techIds.length) {
    issue(issues, path, "Record each Firing Tech at most once per round.");
  }
  return techIds;
}

function parseRound(value: unknown, index: number, playerCount: PlayerCount, issues: PlaytestValidationIssue[]): RoundMetrics {
  const path = `rounds.${index}`;
  const record = recordAt(value, path, issues);
  const playerValues = arrayAt(record, "players", `${path}.players`, issues, 4);
  if (playerValues.length !== playerCount) {
    issue(issues, `${path}.players`, `Add exactly ${playerCount} player rows for this round.`);
  }
  const sharedCapacity = sharedKilnCapacityFor(playerCount);
  const players = playerValues.map((player, playerIndex) => parseRoundPlayer(player, playerIndex, path, sharedCapacity, issues));
  for (const [playerIndex, player] of players.entries()) {
    if (player.playerIndex !== playerIndex) {
      issue(issues, `${path}.players.${playerIndex}.playerIndex`, "Player rows must stay in seat order.");
    }
  }
  const sharedLoaded = players.reduce((total, player) => total + (player.sharedLoaded ?? 0), 0);
  if (sharedLoaded > sharedCapacity) {
    issue(issues, `${path}.players`, `Shared Kiln loading cannot exceed ${sharedCapacity} ceramics.`);
  }
  const kilnDie = integer(record, "kilnDie", `${path}.kilnDie`, issues, Math.min(...KILN_DIE_FACES), Math.max(...KILN_DIE_FACES), true);
  if (kilnDie !== null && !KILN_DIE_FACES.includes(kilnDie)) {
    issue(issues, `${path}.kilnDie`, "Choose a Kiln Die face.");
  }
  const firingTechIds = parseFiringTechIds(record, `${path}.firingTechIds`, issues);
  const adjustedContributions = players.filter(
    (player) => player.contribution === "bank_2" || player.contribution === "stoke_2",
  ).length;
  const fuelLedgerRecorded = firingTechIds.includes(FUEL_LEDGER_TECH_ID);
  if (adjustedContributions > 0 && !fuelLedgerRecorded) {
    issue(issues, `${path}.firingTechIds`, "Check Fuel Ledger when a −2 or +2 Contribution was used.");
  }
  if (fuelLedgerRecorded && adjustedContributions !== 1) {
    issue(issues, `${path}.players`, "Fuel Ledger requires exactly one Bank −2 or Stoke +2 Contribution.");
  }
  return {
    round: integer(record, "round", `${path}.round`, issues, 1, GAME_CONFIG.rounds) ?? 1,
    kilnDie,
    players,
    fireModifier: integer(record, "fireModifier", `${path}.fireModifier`, issues, -2, 2, true),
    firingTechIds,
  };
}

const FEEDBACK_FIELDS: ReadonlyArray<keyof PlaytestFeedback> = [
  "strongest", "weakest", "blockedOrIdleWorkers", "softLock", "impossibleOrder",
  "sharedKilnNegotiation", "heatHedging", "tendMeaningful", "recognitionWorthwhile",
  "traditionConcern", "techConcern", "rulesAmbiguity", "minorTuning",
];

function parseFeedback(value: unknown, issues: PlaytestValidationIssue[]): PlaytestFeedback {
  const record = recordAt(value, "feedback", issues);
  return Object.fromEntries(
    FEEDBACK_FIELDS.map((key) => [key, text(record, key, `feedback.${key}`, issues, 1500)]),
  ) as unknown as PlaytestFeedback;
}

/** The Techs a player recorded, in discipline order. */
export function playerTechIds(player: Pick<PlayerMetrics, "workshopTechId" | "glazingLoadingTechId" | "firingTechId">): TechId[] {
  return DISCIPLINES.flatMap((discipline) => {
    const techId = player[TECH_FIELDS[discipline]];
    return techId === null ? [] : [techId];
  });
}

export function validatePlaytestSubmission(input: unknown): PlaytestValidationResult {
  const issues: PlaytestValidationIssue[] = [];
  const record = recordAt(input, "submission", issues);
  if (Object.hasOwn(record, "gameId")) {
    issue(issues, "gameId", "The reference number is assigned by the server.");
  }
  if (record["formVersion"] !== PLAYTEST_FORM_VERSION) issue(issues, "formVersion", "Unsupported form version.");
  if (record["rulesVersion"] !== GAME_CONFIG.rulesVersion) {
    issue(issues, "rulesVersion", `This form records rules V${GAME_CONFIG.rulesVersion}.`);
  }

  const playedOn = text(record, "playedOn", "playedOn", issues, 10);
  if (!isIsoDate(playedOn)) issue(issues, "playedOn", "Enter a valid play date.");
  const playerCount = (integer(record, "playerCount", "playerCount", issues, GAME_CONFIG.players.min, GAME_CONFIG.players.max) ??
    GAME_CONFIG.players.min) as PlayerCount;
  const firstPlayerIndex = integer(record, "firstPlayerIndex", "firstPlayerIndex", issues, 0, playerCount - 1) ?? 0;
  const winnerIndex = integer(record, "winnerIndex", "winnerIndex", issues, 0, playerCount - 1) ?? 0;

  const playerValues = arrayAt(record, "players", "players", issues, 4);
  if (playerValues.length !== playerCount) issue(issues, "players", `Add exactly ${playerCount} player records.`);
  const players = playerValues.map((value, index) => parsePlayer(value, index, issues));
  const kilnIds = players.map((player) => player.kilnId);
  if (new Set(kilnIds).size !== kilnIds.length) issue(issues, "players", "Each player should have a different Kiln.");
  const ownedTechIds = players.flatMap(playerTechIds);
  if (new Set(ownedTechIds).size !== ownedTechIds.length) {
    issue(issues, "players", "A Tech tile can only belong to one player.");
  }
  const completedOrders = players.flatMap((player) => player.completedOrderIds);
  if (new Set(completedOrders).size !== completedOrders.length) {
    issue(issues, "players", "A physical Order card can only be completed once per game.");
  }

  const rounds = arrayAt(record, "rounds", "rounds", issues, GAME_CONFIG.rounds).map((value, index) =>
    parseRound(value, index, playerCount, issues),
  );
  if (rounds.length !== GAME_CONFIG.rounds) {
    issue(issues, "rounds", `Add exactly ${GAME_CONFIG.rounds} rounds.`);
  }
  if (new Set(rounds.map((round) => round.round)).size !== rounds.length) {
    issue(issues, "rounds", "Record each round at most once.");
  }
  const ownedFiringTechIds = new Set(players.flatMap((player) => (player.firingTechId === null ? [] : [player.firingTechId])));
  const fuelLedgerOwnerIndex = players.findIndex((player) => player.firingTechId === FUEL_LEDGER_TECH_ID);
  for (const [roundIndex, round] of rounds.entries()) {
    for (const techId of round.firingTechIds) {
      if (!ownedFiringTechIds.has(techId)) {
        issue(issues, `rounds.${roundIndex}.firingTechIds`, "A Firing Tech can only be used after assigning it to a player.");
      }
    }
    for (const [playerIndex, roundPlayer] of round.players.entries()) {
      if ((roundPlayer.contribution === "bank_2" || roundPlayer.contribution === "stoke_2") && playerIndex !== fuelLedgerOwnerIndex) {
        issue(
          issues,
          `rounds.${roundIndex}.players.${playerIndex}.contribution`,
          "Only the player who owns Fuel Ledger can record a −2 or +2 Contribution.",
        );
      }
    }
  }
  for (const [playerIndex, player] of players.entries()) {
    const kilnAbilityUses = rounds.reduce((total, round) => total + (round.players[playerIndex]?.kilnAbilityUses ?? 0), 0);
    if (player.kilnAbilityUses !== kilnAbilityUses) {
      issue(issues, `players.${playerIndex}.kilnAbilityUses`, "Kiln ability total must match the five round counters.");
    }
    const roundOrderCounts = rounds.map((round) => round.players[playerIndex]?.ordersCompleted ?? null);
    if (roundOrderCounts.every((count) => count !== null)) {
      const roundOrderTotal = roundOrderCounts.reduce<number>((total, count) => total + (count ?? 0), 0);
      if (roundOrderTotal !== player.completedOrderIds.length) {
        issue(issues, `players.${playerIndex}.completedOrderIds`, "Completed Orders must match the total recorded across rounds.");
      }
    }
  }

  const feedback = parseFeedback(record["feedback"], issues);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      formVersion: PLAYTEST_FORM_VERSION,
      rulesVersion: GAME_CONFIG.rulesVersion,
      playedOn,
      playerCount,
      firstPlayerIndex,
      winnerIndex,
      players,
      rounds,
      feedback,
    },
  };
}
