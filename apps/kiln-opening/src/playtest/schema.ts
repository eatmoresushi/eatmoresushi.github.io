import {
  GAME_CONFIG,
  KILN_IDS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
} from "../game/content.ts";
import type {
  PlaytestFeedback,
  PlaytestSubmission,
  PlaytestValidationIssue,
  PlaytestValidationResult,
  PlayerMetrics,
  RoundMetrics,
} from "./types.ts";

const STARTING_TECH_IDS = STARTING_TECHNIQUES.map((technique) => technique.id);
const ADVANCED_TECH_IDS = TECHNIQUES.map((technique) => technique.id);
const ORDER_IDS = [...STARTING_ORDERS, ...MAIN_ORDERS].map((order) => order.id);

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
  max: number,
  nullable = false,
): number | null {
  const value = record[key];
  if (nullable && (value === null || value === "" || value === undefined)) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    issue(issues, path, `Enter a whole number from ${min} to ${max}.`);
    return nullable ? null : min;
  }
  return value;
}

function booleanOrNull(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: PlaytestValidationIssue[],
): boolean | null {
  const value = record[key];
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "boolean") {
    issue(issues, path, "Choose Yes, No, or leave this blank.");
    return null;
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
    return nullable ? null : allowed[0] ?? null;
  }
  return value as T;
}

function parseCompletedOrders(
  record: Record<string, unknown>,
  path: string,
  issues: PlaytestValidationIssue[],
): string[] {
  const values = arrayAt(record, "completedOrderIds", `${path}.completedOrderIds`, issues, 20);
  const orderIds = values.map((value, index) => {
    if (typeof value !== "string" || !ORDER_IDS.includes(value)) {
      issue(issues, `${path}.completedOrderIds.${index}`, "Choose a valid Order.");
      return "";
    }
    return value;
  }).filter((value) => value !== "");
  if (new Set(orderIds).size !== orderIds.length) {
    issue(issues, `${path}.completedOrderIds`, "Record each completed Order once.");
  }
  return orderIds;
}

function parsePlayer(value: unknown, index: number, issues: PlaytestValidationIssue[]): PlayerMetrics {
  const path = `players.${index}`;
  const record = recordAt(value, path, issues);
  return {
    name: text(record, "name", `${path}.name`, issues, 40),
    kilnId: enumValue(record, "kilnId", `${path}.kilnId`, issues, KILN_IDS)!,
    startingTechniqueId: enumValue(
      record,
      "startingTechniqueId",
      `${path}.startingTechniqueId`,
      issues,
      STARTING_TECH_IDS,
    )!,
    advancedTechnique1Id: enumValue(
      record,
      "advancedTechnique1Id",
      `${path}.advancedTechnique1Id`,
      issues,
      ADVANCED_TECH_IDS,
      true,
    ),
    advancedTechnique2Id: enumValue(
      record,
      "advancedTechnique2Id",
      `${path}.advancedTechnique2Id`,
      issues,
      ADVANCED_TECH_IDS,
      true,
    ),
    completedOrderIds: parseCompletedOrders(record, path, issues),
    recognition: integer(record, "recognition", `${path}.recognition`, issues, 0, 5)!,
    kilnAbilityUses: integer(record, "kilnAbilityUses", `${path}.kilnAbilityUses`, issues, 0, 5)!,
    finalVp: integer(record, "finalVp", `${path}.finalVp`, issues, -100, 500)!,
    orderVp: integer(record, "orderVp", `${path}.orderVp`, issues, -100, 500, true),
    traditionVp: integer(record, "traditionVp", `${path}.traditionVp`, issues, -100, 500, true),
    exhibitionVp: integer(record, "exhibitionVp", `${path}.exhibitionVp`, issues, -100, 500, true),
    coinVp: integer(record, "coinVp", `${path}.coinVp`, issues, 0, 5, true),
  };
}

function parseRound(value: unknown, index: number, issues: PlaytestValidationIssue[]): RoundMetrics {
  const path = `rounds.${index}`;
  const record = recordAt(value, path, issues);
  return {
    round: integer(record, "round", `${path}.round`, issues, 1, 5)!,
    sharedLoaded: integer(record, "sharedLoaded", `${path}.sharedLoaded`, issues, 0, 7, true),
    imperialLoaded: integer(record, "imperialLoaded", `${path}.imperialLoaded`, issues, 0, 4, true),
    bank: integer(record, "bank", `${path}.bank`, issues, 0, 4, true),
    tend: integer(record, "tend", `${path}.tend`, issues, 0, 4, true),
    stoke: integer(record, "stoke", `${path}.stoke`, issues, 0, 4, true),
    baseHeat: integer(record, "baseHeat", `${path}.baseHeat`, issues, 0, 5, true),
    fireModifier: integer(record, "fireModifier", `${path}.fireModifier`, issues, -2, 2, true),
    whiteLoaded: integer(record, "whiteLoaded", `${path}.whiteLoaded`, issues, 0, 11, true),
    celadonLoaded: integer(record, "celadonLoaded", `${path}.celadonLoaded`, issues, 0, 11, true),
    greyGreenLoaded: integer(record, "greyGreenLoaded", `${path}.greyGreenLoaded`, issues, 0, 11, true),
    moonWhiteLoaded: integer(record, "moonWhiteLoaded", `${path}.moonWhiteLoaded`, issues, 0, 11, true),
    heatConflict: booleanOrNull(record, "heatConflict", `${path}.heatConflict`, issues),
    orderStolen: booleanOrNull(record, "orderStolen", `${path}.orderStolen`, issues),
    shifuRepositionUsed: booleanOrNull(record, "shifuRepositionUsed", `${path}.shifuRepositionUsed`, issues),
    fuelLedgerUsed: booleanOrNull(record, "fuelLedgerUsed", `${path}.fuelLedgerUsed`, issues),
    notes: text(record, "notes", `${path}.notes`, issues, 1000),
  };
}

const FEEDBACK_FIELDS: ReadonlyArray<keyof PlaytestFeedback> = [
  "strongest", "weakest", "blockedOrIdleWorkers", "softLock", "impossibleOrder",
  "sharedKilnNegotiation", "heatHedging", "tendMeaningful", "recognitionWorthwhile",
  "traditionConcern", "techConcern", "rulesAmbiguity", "minorTuning",
];

function parseFeedback(value: unknown, issues: PlaytestValidationIssue[]): PlaytestFeedback {
  const record = recordAt(value, "feedback", issues);
  return Object.fromEntries(FEEDBACK_FIELDS.map((key) => [
    key,
    text(record, key, `feedback.${key}`, issues, 1500),
  ])) as unknown as PlaytestFeedback;
}

export function validatePlaytestSubmission(input: unknown): PlaytestValidationResult {
  const issues: PlaytestValidationIssue[] = [];
  const record = recordAt(input, "submission", issues);
  if (Object.prototype.hasOwnProperty.call(record, "gameId")) {
    issue(issues, "gameId", "The reference number is assigned by the server.");
  }
  if (record["formVersion"] !== 1) issue(issues, "formVersion", "Unsupported form version.");
  if (record["rulesVersion"] !== GAME_CONFIG.rulesVersion) {
    issue(issues, "rulesVersion", `This form records rules V${GAME_CONFIG.rulesVersion}.`);
  }

  const playedOn = text(record, "playedOn", "playedOn", issues, 10);
  if (!isIsoDate(playedOn)) issue(issues, "playedOn", "Enter a valid play date.");
  const playerCountValue = integer(record, "playerCount", "playerCount", issues, 2, 4)!;
  const playerCount = playerCountValue as 2 | 3 | 4;
  const firstPlayerIndex = integer(record, "firstPlayerIndex", "firstPlayerIndex", issues, 0, playerCount - 1)!;
  const winnerIndex = integer(record, "winnerIndex", "winnerIndex", issues, 0, playerCount - 1)!;

  const playerValues = arrayAt(record, "players", "players", issues, 4);
  if (playerValues.length !== playerCount) issue(issues, "players", `Add exactly ${playerCount} player records.`);
  const players = playerValues.map((value, index) => parsePlayer(value, index, issues));
  const kilnIds = players.map((player) => player.kilnId);
  if (new Set(kilnIds).size !== kilnIds.length) issue(issues, "players", "Each player should have a different Kiln.");
  const advancedIds = players.flatMap((player) => [player.advancedTechnique1Id, player.advancedTechnique2Id])
    .filter((value): value is string => value !== null);
  if (new Set(advancedIds).size !== advancedIds.length) {
    issue(issues, "players", "An Advanced Tech can only belong to one player.");
  }
  const completedOrders = players.flatMap((player) => player.completedOrderIds);
  if (new Set(completedOrders).size !== completedOrders.length) {
    issue(issues, "players", "A physical Order card can only be completed once per game.");
  }

  const rounds = arrayAt(record, "rounds", "rounds", issues, 5)
    .map((value, index) => parseRound(value, index, issues));
  if (new Set(rounds.map((round) => round.round)).size !== rounds.length) {
    issue(issues, "rounds", "Record each round at most once.");
  }
  for (const [index, round] of rounds.entries()) {
    const contributions = [round.bank, round.tend, round.stoke];
    if (contributions.every((value) => value !== null)) {
      const total = contributions.reduce<number>((sum, value) => sum + (value ?? 0), 0);
      if (total > playerCount) {
        issue(issues, `rounds.${index}`, "Contribution-card counts cannot exceed the player count.");
      }
    }
  }

  const feedback = parseFeedback(record["feedback"], issues);
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      formVersion: 1,
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
