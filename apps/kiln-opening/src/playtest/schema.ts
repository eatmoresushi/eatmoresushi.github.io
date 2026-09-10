import {
  COMMON_SUPPLY,
  GAME_CONFIG,
  KILN_IDS,
  MAIN_ORDERS,
  STARTING_ORDERS,
  STARTING_TECHNIQUES,
  TECHNIQUES,
} from "../game/content.ts";
import type {
  FireContribution,
  FiringTechniqueId,
  PlaytestFeedback,
  PlaytestSubmission,
  PlaytestValidationIssue,
  PlaytestValidationResult,
  PlayerMetrics,
  RoundMetrics,
  RoundPlayerMetrics,
} from "./types.ts";

const STARTING_TECH_IDS = STARTING_TECHNIQUES.map((technique) => technique.id);
const ADVANCED_TECH_IDS = TECHNIQUES.map((technique) => technique.id);
const FIRING_TECH_IDS = TECHNIQUES
  .filter((technique) => technique.discipline === "firing")
  .map((technique) => technique.id) as FiringTechniqueId[];
const ORDER_IDS = [...STARTING_ORDERS, ...MAIN_ORDERS].map((order) => order.id);
const FIRE_CONTRIBUTIONS: readonly FireContribution[] = ["bank_2", "bank", "tend", "stoke", "stoke_2"];

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
    recognition: integer(record, "recognition", `${path}.recognition`, issues, 0, 4)!,
    coinsRemaining: integer(record, "coinsRemaining", `${path}.coinsRemaining`, issues, 0, COMMON_SUPPLY.coins)!,
    clayRemaining: integer(record, "clayRemaining", `${path}.clayRemaining`, issues, 0, COMMON_SUPPLY.clay)!,
    woodRemaining: integer(record, "woodRemaining", `${path}.woodRemaining`, issues, 0, COMMON_SUPPLY.wood)!,
    kilnAbilityUses: integer(record, "kilnAbilityUses", `${path}.kilnAbilityUses`, issues, 0, 5)!,
    finalVp: integer(record, "finalVp", `${path}.finalVp`, issues, -100, 500)!,
    orderVp: integer(record, "orderVp", `${path}.orderVp`, issues, -100, 500, true),
    traditionVp: integer(record, "traditionVp", `${path}.traditionVp`, issues, -100, 500, true),
    exhibitionVp: integer(record, "exhibitionVp", `${path}.exhibitionVp`, issues, -100, 500, true),
    coinVp: integer(record, "coinVp", `${path}.coinVp`, issues, 0, 5, true),
  };
}

function parseRoundPlayer(
  value: unknown,
  index: number,
  roundPath: string,
  issues: PlaytestValidationIssue[],
): RoundPlayerMetrics {
  const path = `${roundPath}.players.${index}`;
  const record = recordAt(value, path, issues);
  return {
    playerIndex: integer(record, "playerIndex", `${path}.playerIndex`, issues, 0, 3)!,
    contribution: enumValue(
      record,
      "contribution",
      `${path}.contribution`,
      issues,
      FIRE_CONTRIBUTIONS,
      true,
    ),
    sharedLoaded: integer(record, "sharedLoaded", `${path}.sharedLoaded`, issues, 0, 7, true),
    imperialLoaded: integer(record, "imperialLoaded", `${path}.imperialLoaded`, issues, 0, 1)!,
    ordersCompleted: integer(record, "ordersCompleted", `${path}.ordersCompleted`, issues, 0, 20, true),
    kilnAbilityUses: integer(record, "kilnAbilityUses", `${path}.kilnAbilityUses`, issues, 0, 1)!,
  };
}

function parseFiringTechniqueIds(
  record: Record<string, unknown>,
  path: string,
  issues: PlaytestValidationIssue[],
): FiringTechniqueId[] {
  const values = arrayAt(record, "firingTechniqueIds", path, issues, 5);
  const techniqueIds = values.map((value, index) => {
    if (typeof value !== "string" || !FIRING_TECH_IDS.includes(value as FiringTechniqueId)) {
      issue(issues, `${path}.${index}`, "Choose a valid Firing Advanced Tech.");
      return null;
    }
    return value as FiringTechniqueId;
  }).filter((value): value is FiringTechniqueId => value !== null);
  if (new Set(techniqueIds).size !== techniqueIds.length) {
    issue(issues, path, "Record each Firing Advanced Tech at most once per round.");
  }
  return techniqueIds;
}

function parseRound(
  value: unknown,
  index: number,
  playerCount: 2 | 3 | 4,
  issues: PlaytestValidationIssue[],
): RoundMetrics {
  const path = `rounds.${index}`;
  const record = recordAt(value, path, issues);
  const playerValues = arrayAt(record, "players", `${path}.players`, issues, 4);
  if (playerValues.length !== playerCount) {
    issue(issues, `${path}.players`, `Add exactly ${playerCount} player rows for this round.`);
  }
  const players = playerValues.map((player, playerIndex) => parseRoundPlayer(player, playerIndex, path, issues));
  for (const [playerIndex, player] of players.entries()) {
    if (player.playerIndex !== playerIndex) {
      issue(issues, `${path}.players.${playerIndex}.playerIndex`, "Player rows must stay in seat order.");
    }
  }
  const sharedLoaded = players.reduce((total, player) => total + (player.sharedLoaded ?? 0), 0);
  const sharedCapacity = playerCount === 2 ? 5 : playerCount === 3 ? 6 : 7;
  if (sharedLoaded > sharedCapacity) {
    issue(issues, `${path}.players`, `Shared Kiln loading cannot exceed ${sharedCapacity} ceramics.`);
  }
  const firingTechniqueIds = parseFiringTechniqueIds(record, `${path}.firingTechniqueIds`, issues);
  const adjustedContributions = players.filter((player) => (
    player.contribution === "bank_2" || player.contribution === "stoke_2"
  )).length;
  const fuelLedgerRecorded = firingTechniqueIds.includes("T12");
  if (adjustedContributions > 0 && !fuelLedgerRecorded) {
    issue(issues, `${path}.firingTechniqueIds`, "Check Fuel Ledger when a −2 or +2 Contribution was used.");
  }
  if (fuelLedgerRecorded && adjustedContributions !== 1) {
    issue(issues, `${path}.players`, "Fuel Ledger requires exactly one Bank −2 or Stoke +2 Contribution.");
  }
  return {
    round: integer(record, "round", `${path}.round`, issues, 1, 5)!,
    players,
    fireModifier: integer(record, "fireModifier", `${path}.fireModifier`, issues, -2, 2, true),
    firingTechniqueIds,
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
  if (record["formVersion"] !== 2) issue(issues, "formVersion", "Unsupported form version.");
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
    .map((value, index) => parseRound(value, index, playerCount, issues));
  if (rounds.length !== GAME_CONFIG.rounds) {
    issue(issues, "rounds", `Add exactly ${GAME_CONFIG.rounds} firing rounds.`);
  }
  if (new Set(rounds.map((round) => round.round)).size !== rounds.length) {
    issue(issues, "rounds", "Record each round at most once.");
  }
  const ownedFiringTechIds = new Set(
    advancedIds.filter((techniqueId) => FIRING_TECH_IDS.includes(techniqueId as FiringTechniqueId)),
  );
  const fuelLedgerOwnerIndex = players.findIndex((player) => (
    player.advancedTechnique1Id === "T12" || player.advancedTechnique2Id === "T12"
  ));
  for (const [roundIndex, round] of rounds.entries()) {
    for (const techniqueId of round.firingTechniqueIds) {
      if (!ownedFiringTechIds.has(techniqueId)) {
        issue(
          issues,
          `rounds.${roundIndex}.firingTechniqueIds`,
          "A Firing Advanced Tech can only be used after assigning it to a player in setup.",
        );
      }
    }
    for (const [playerIndex, roundPlayer] of round.players.entries()) {
      if (
        (roundPlayer.contribution === "bank_2" || roundPlayer.contribution === "stoke_2")
        && playerIndex !== fuelLedgerOwnerIndex
      ) {
        issue(
          issues,
          `rounds.${roundIndex}.players.${playerIndex}.contribution`,
          "Only the player who owns Fuel Ledger can record a −2 or +2 Contribution.",
        );
      }
    }
  }
  for (const [playerIndex, player] of players.entries()) {
    const kilnAbilityUses = rounds.reduce(
      (total, round) => total + (round.players[playerIndex]?.kilnAbilityUses ?? 0),
      0,
    );
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
      formVersion: 2,
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
