import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  JUN_AB_CONTROL_CONFIG,
  JUN_AB_COST_ONE_CONFIG,
  SeededRandom,
} from "../game/index.ts";
import type {
  GameExperimentConfig,
  KilnId,
  PlayerCount,
  PlayerId,
} from "../game/index.ts";
import { sha256 } from "./sourceManifest.ts";
import type { AIStrategyProfile, StrategyIntent } from "./types.ts";

export const JUN_AB_EXPERIMENT_ID = "jun-ab-001" as const;
export const JUN_AB_POLICY_VERSION = "selfplay-003-frozen" as const;
export const JUN_AB_CONTROL_SIMULATION = "v1.0.1-jun-ab-001-control" as const;
export const JUN_AB_COST_ONE_SIMULATION = "v1.0.1-jun-ab-001-jun-cost-1" as const;
export const EXPECTED_FROZEN_PROFILE_HASH = "b878a436b3afbdb77ab3c285cfb9ddf69301afc29c5fb318de6276a3fa3a6972";

export type JunAbArm = "control" | "jun_cost_1";

export interface JunAbSeedCandidate {
  replacementIndex: number;
  gameSeed: number;
  aiSeed: number;
}

export interface JunAbScenario {
  pairId: string;
  sequence: number;
  playerCount: PlayerCount;
  junPlayerId: PlayerId;
  junSeat: number;
  opponentTraditions: KilnId[];
  opponentLineup: string;
  assignedTraditions: Record<PlayerId, KilnId>;
  assignedIntents: Record<PlayerId, StrategyIntent>;
  expectedFirstPlayerId: PlayerId;
  armOrder: [JunAbArm, JunAbArm];
  candidateSeeds: JunAbSeedCandidate[];
}

export interface JunAbSchedule {
  experimentId: typeof JUN_AB_EXPERIMENT_ID;
  rulesVersion: "1.0.1";
  policyVersion: typeof JUN_AB_POLICY_VERSION;
  frozenProfileHash: typeof EXPECTED_FROZEN_PROFILE_HASH;
  scenariosPerPlayerCount: 100;
  replacementsPerScenario: 50;
  scheduleRevision: 2;
  scenarios: JunAbScenario[];
}

export interface PriorSeedSets {
  gameSeeds: Set<number>;
  aiSeeds: Set<number>;
  pairs: Set<string>;
}

export interface JunAbAttemptLog {
  pairId: string;
  replacementIndex: number;
  arm: JunAbArm;
  gameSeed: number;
  aiSeed: number;
  valid: boolean;
  discardedWithPair: boolean;
  error: string;
}

export interface CompletedJunAbPair<T> {
  scenario: JunAbScenario;
  candidate: JunAbSeedCandidate;
  control: T;
  junCostOne: T;
  invalidAttempts: JunAbAttemptLog[];
}

const NON_JUN_TRADITIONS = ["RU", "GU", "GE", "DI"] as const satisfies readonly KilnId[];
const INTENTS = [
  "Market",
  "Imperial",
  "Hybrid",
  "Quality-control",
  "Volume-multi",
  "Technique-economy",
] as const satisfies readonly StrategyIntent[];
const THREE_PLAYER_PAIRS = [
  ["RU", "GU"],
  ["RU", "GE"],
  ["RU", "DI"],
  ["GU", "GE"],
  ["GU", "DI"],
  ["GE", "DI"],
] as const satisfies readonly (readonly [KilnId, KilnId])[];

export function experimentConfigForArm(arm: JunAbArm): GameExperimentConfig {
  return arm === "control" ? JUN_AB_CONTROL_CONFIG : JUN_AB_COST_ONE_CONFIG;
}

export function simulationVersionForArm(
  arm: JunAbArm,
): typeof JUN_AB_CONTROL_SIMULATION | typeof JUN_AB_COST_ONE_SIMULATION {
  return arm === "control" ? JUN_AB_CONTROL_SIMULATION : JUN_AB_COST_ONE_SIMULATION;
}

export function frozenProfileHash(profiles: Record<string, AIStrategyProfile>): string {
  return sha256(JSON.stringify(profiles));
}

export async function assertExperimentOutputPathAvailable(path: string): Promise<void> {
  try {
    await access(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw new Error(`Experiment output already exists: ${path}`);
}

function rotate<T>(values: readonly T[], amount: number): T[] {
  if (values.length === 0) return [];
  const offset = amount % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function playerId(seatIndex: number): PlayerId {
  return `P${seatIndex + 1}`;
}

function scheduleAssignments(playerCount: PlayerCount, index: number): {
  junSeatIndex: number;
  traditions: Record<PlayerId, KilnId>;
  opponentTraditions: KilnId[];
  desiredFirstSeatIndex: number;
} {
  if (playerCount === 2) {
    const opponent = NON_JUN_TRADITIONS[index % NON_JUN_TRADITIONS.length]!;
    const junSeatIndex = (Math.floor(index / NON_JUN_TRADITIONS.length) + index % NON_JUN_TRADITIONS.length) % 2;
    const occurrence = Math.floor(index / 8);
    let desiredFirstSeatIndex = (occurrence + index % NON_JUN_TRADITIONS.length) % 2 === 0
      ? junSeatIndex
      : 1 - junSeatIndex;
    if (index === 0 || index === 1) desiredFirstSeatIndex = 1 - desiredFirstSeatIndex;
    return {
      junSeatIndex,
      traditions: {
        [playerId(junSeatIndex)]: "JU",
        [playerId(1 - junSeatIndex)]: opponent,
      },
      opponentTraditions: [opponent],
      desiredFirstSeatIndex,
    };
  }
  if (playerCount === 3) {
    const pair = THREE_PLAYER_PAIRS[index % THREE_PLAYER_PAIRS.length]!;
    const occurrence = Math.floor(index / THREE_PLAYER_PAIRS.length);
    const junSeatIndex = (occurrence + index) % 3;
    const opponentSeats = [0, 1, 2].filter((seat) => seat !== junSeatIndex);
    const opponents = occurrence % 2 === 0 ? [...pair] : [...pair].reverse();
    const traditions = { [playerId(junSeatIndex)]: "JU" } as Record<PlayerId, KilnId>;
    opponentSeats.forEach((seat, opponentIndex) => {
      traditions[playerId(seat)] = opponents[opponentIndex]!;
    });
    return {
      junSeatIndex,
      traditions,
      opponentTraditions: [...pair],
      desiredFirstSeatIndex: Math.floor(index / 3) % 3,
    };
  }
  const omitted = NON_JUN_TRADITIONS[index % NON_JUN_TRADITIONS.length]!;
  const occurrence = Math.floor(index / NON_JUN_TRADITIONS.length);
  const junSeatIndex = (occurrence + index % NON_JUN_TRADITIONS.length) % 4;
  const opponentSeats = [0, 1, 2, 3].filter((seat) => seat !== junSeatIndex);
  let opponents = rotate(NON_JUN_TRADITIONS.filter((tradition) => tradition !== omitted), occurrence % 3);
  if (Math.floor(occurrence / 3) % 2 === 1) opponents = opponents.reverse();
  const traditions = { [playerId(junSeatIndex)]: "JU" } as Record<PlayerId, KilnId>;
  opponentSeats.forEach((seat, opponentIndex) => {
    traditions[playerId(seat)] = opponents[opponentIndex]!;
  });
  let desiredFirstSeatIndex = (occurrence + 2 * (index % NON_JUN_TRADITIONS.length) + Math.floor(occurrence / 4)) % 4;
  if (index === 1) desiredFirstSeatIndex = 3;
  if (index === 2) desiredFirstSeatIndex = 1;
  return {
    junSeatIndex,
    traditions,
    opponentTraditions: NON_JUN_TRADITIONS.filter((tradition) => tradition !== omitted),
    desiredFirstSeatIndex,
  };
}

function scheduleIntents(
  playerCount: PlayerCount,
  index: number,
  junSeatIndex: number,
  traditions: Record<PlayerId, KilnId>,
): Record<PlayerId, StrategyIntent> {
  const assigned = { [playerId(junSeatIndex)]: INTENTS[index % INTENTS.length]! } as Record<PlayerId, StrategyIntent>;
  const opponentSeats = Array.from({ length: playerCount }, (_, seat) => seat).filter((seat) => seat !== junSeatIndex);
  opponentSeats.forEach((seat) => {
    const tradition = traditions[playerId(seat)]!;
    const traditionIndex = NON_JUN_TRADITIONS.indexOf(tradition as typeof NON_JUN_TRADITIONS[number]);
    const priorAtTraditionAndSeat = Array.from({ length: index }, (_, priorIndex) => scheduleAssignments(playerCount, priorIndex))
      .filter((prior) => prior.traditions[playerId(seat)] === tradition)
      .length;
    assigned[playerId(seat)] = INTENTS[(priorAtTraditionAndSeat + 2 * traditionIndex + 2 * seat) % INTENTS.length]!;
  });
  return assigned;
}

function seedProducesFirstPlayer(seed: number, playerCount: PlayerCount, desiredSeatIndex: number): boolean {
  return new SeededRandom(seed).nextInt(playerCount) === desiredSeatIndex;
}

function reserveSeed(
  initial: number,
  forbidden: Set<number>,
  used: Set<number>,
  predicate: (seed: number) => boolean = () => true,
): number {
  let candidate = initial >>> 0;
  while (forbidden.has(candidate) || used.has(candidate) || !predicate(candidate)) candidate = (candidate + 1) >>> 0;
  used.add(candidate);
  return candidate;
}

export function createJunAbSchedule(prior: PriorSeedSets): JunAbSchedule {
  const usedGameSeeds = new Set<number>();
  const usedAiSeeds = new Set<number>();
  const scenarios: JunAbScenario[] = [];
  for (const playerCount of [2, 3, 4] as const) {
    for (let index = 0; index < 100; index += 1) {
      const sequence = index + 1;
      const assignment = scheduleAssignments(playerCount, index);
      const pairId = `jun-ab-001-${playerCount}p-${String(sequence).padStart(3, "0")}`;
      const candidates = Array.from({ length: 51 }, (_, replacementIndex): JunAbSeedCandidate => {
        const gameInitial = (
          0x5200_0000 + playerCount * 0x0100_0000 + sequence * 0x0000_1000 + replacementIndex * 0x0000_0040
        ) >>> 0;
        const gameSeed = reserveSeed(
          gameInitial,
          prior.gameSeeds,
          usedGameSeeds,
          (seed) => seedProducesFirstPlayer(seed, playerCount, assignment.desiredFirstSeatIndex),
        );
        const aiInitial = (
          0xc300_0000 + playerCount * 0x0100_0000 + sequence * 0x0000_0800 + replacementIndex * 0x0000_0020
        ) >>> 0;
        const aiSeed = reserveSeed(aiInitial, prior.aiSeeds, usedAiSeeds);
        return { replacementIndex, gameSeed, aiSeed };
      });
      scenarios.push({
        pairId,
        sequence,
        playerCount,
        junPlayerId: playerId(assignment.junSeatIndex),
        junSeat: assignment.junSeatIndex + 1,
        opponentTraditions: assignment.opponentTraditions,
        opponentLineup: [...assignment.opponentTraditions].sort().join("|"),
        assignedTraditions: assignment.traditions,
        assignedIntents: scheduleIntents(playerCount, index, assignment.junSeatIndex, assignment.traditions),
        expectedFirstPlayerId: playerId(assignment.desiredFirstSeatIndex),
        armOrder: index % 2 === 0 ? ["control", "jun_cost_1"] : ["jun_cost_1", "control"],
        candidateSeeds: candidates,
      });
    }
  }
  return {
    experimentId: JUN_AB_EXPERIMENT_ID,
    rulesVersion: "1.0.1",
    policyVersion: JUN_AB_POLICY_VERSION,
    frozenProfileHash: EXPECTED_FROZEN_PROFILE_HASH,
    scenariosPerPlayerCount: 100,
    replacementsPerScenario: 50,
    scheduleRevision: 2,
    scenarios,
  };
}

async function walkSeedArtifacts(directory: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await walkSeedArtifacts(path));
    else if (entry.isFile() && (
      entry.name.endsWith(".json") ||
      entry.name.endsWith(".jsonl") ||
      entry.name.endsWith("_games.csv")
    )) found.push(path);
  }
  return found;
}

function collectSeedValues(value: unknown, seeds: PriorSeedSets): void {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSeedValues(entry, seeds));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record["gameSeed"] === "number") seeds.gameSeeds.add(record["gameSeed"]);
  if (typeof record["aiSeed"] === "number") seeds.aiSeeds.add(record["aiSeed"]);
  if (typeof record["gameSeed"] === "number" && typeof record["aiSeed"] === "number") {
    seeds.pairs.add(`${record["gameSeed"]}:${record["aiSeed"]}`);
  }
  Object.values(record).forEach((entry) => collectSeedValues(entry, seeds));
}

export async function collectPriorSeeds(playtestsDirectory: string): Promise<PriorSeedSets> {
  const seeds: PriorSeedSets = { gameSeeds: new Set(), aiSeeds: new Set(), pairs: new Set() };
  for (const path of await walkSeedArtifacts(playtestsDirectory)) {
    if (path.includes("/experiments/jun-ab-001/")) continue;
    try {
      const text = await readFile(path, "utf8");
      if (path.endsWith(".jsonl")) {
        text.trim().split("\n").filter(Boolean).forEach((line) => collectSeedValues(JSON.parse(line), seeds));
      } else if (path.endsWith(".csv")) {
        const [header, ...lines] = text.trim().split("\n");
        const columns = header?.split(",") ?? [];
        const gameIndex = columns.indexOf("game_seed");
        const aiIndex = columns.indexOf("ai_seed");
        for (const line of lines) {
          const cells = line.split(",");
          const gameSeed = Number(cells[gameIndex]);
          const aiSeed = Number(cells[aiIndex]);
          if (Number.isFinite(gameSeed)) seeds.gameSeeds.add(gameSeed);
          if (Number.isFinite(aiSeed)) seeds.aiSeeds.add(aiSeed);
          if (Number.isFinite(gameSeed) && Number.isFinite(aiSeed)) seeds.pairs.add(`${gameSeed}:${aiSeed}`);
        }
      } else {
        collectSeedValues(JSON.parse(text), seeds);
      }
    } catch {
      // Only structured JSON study artifacts can carry a seed schedule.
    }
  }
  return seeds;
}

export function validateJunAbSchedule(schedule: JunAbSchedule, prior?: PriorSeedSets): string[] {
  const errors: string[] = [];
  if (schedule.scenarios.length !== 300) errors.push(`expected 300 scenarios, found ${schedule.scenarios.length}`);
  const pairIds = new Set<string>();
  const gameSeeds = new Set<number>();
  const aiSeeds = new Set<number>();
  const seedPairs = new Set<string>();
  for (const scenario of schedule.scenarios) {
    if (pairIds.has(scenario.pairId)) errors.push(`duplicate pair ${scenario.pairId}`);
    pairIds.add(scenario.pairId);
    const traditions = Object.values(scenario.assignedTraditions);
    if (traditions.filter((tradition) => tradition === "JU").length !== 1) errors.push(`${scenario.pairId} does not have exactly one Jun`);
    if (scenario.assignedTraditions[scenario.junPlayerId] !== "JU") errors.push(`${scenario.pairId} Jun player mismatch`);
    if (scenario.candidateSeeds.length !== 51) errors.push(`${scenario.pairId} lacks 50 replacements`);
    if (new Set(scenario.armOrder).size !== 2) errors.push(`${scenario.pairId} arm order is invalid`);
    for (const candidate of scenario.candidateSeeds) {
      const key = `${candidate.gameSeed}:${candidate.aiSeed}`;
      if (gameSeeds.has(candidate.gameSeed)) errors.push(`duplicate game seed ${candidate.gameSeed}`);
      if (aiSeeds.has(candidate.aiSeed)) errors.push(`duplicate AI seed ${candidate.aiSeed}`);
      if (seedPairs.has(key)) errors.push(`duplicate seed pair ${key}`);
      if (prior?.gameSeeds.has(candidate.gameSeed)) errors.push(`prior game seed collision ${candidate.gameSeed}`);
      if (prior?.aiSeeds.has(candidate.aiSeed)) errors.push(`prior AI seed collision ${candidate.aiSeed}`);
      if (prior?.pairs.has(key)) errors.push(`prior seed-pair collision ${key}`);
      gameSeeds.add(candidate.gameSeed);
      aiSeeds.add(candidate.aiSeed);
      seedPairs.add(key);
      if (!seedProducesFirstPlayer(candidate.gameSeed, scenario.playerCount, Number(scenario.expectedFirstPlayerId.slice(1)) - 1)) {
        errors.push(`${scenario.pairId} candidate ${candidate.replacementIndex} first-player mismatch`);
      }
    }
  }
  for (const playerCount of [2, 3, 4] as const) {
    const group = schedule.scenarios.filter((scenario) => scenario.playerCount === playerCount);
    if (group.length !== 100) errors.push(`${playerCount}P has ${group.length} scenarios`);
    const junSeats = new Map<number, number>();
    const junIntents = new Map<string, number>();
    group.forEach((scenario) => {
      junSeats.set(scenario.junSeat, (junSeats.get(scenario.junSeat) ?? 0) + 1);
      const intent = scenario.assignedIntents[scenario.junPlayerId]!;
      junIntents.set(intent, (junIntents.get(intent) ?? 0) + 1);
    });
    if (Math.max(...junSeats.values()) - Math.min(...junSeats.values()) > 1) errors.push(`${playerCount}P Jun seats are imbalanced`);
    if (Math.max(...junIntents.values()) - Math.min(...junIntents.values()) > 1) errors.push(`${playerCount}P Jun intents are imbalanced`);
    const firstPlayerSeats = Array.from({ length: playerCount }, (_, seat) => playerId(seat));
      const firstCounts = firstPlayerSeats.map((id) => group.filter((scenario) => scenario.expectedFirstPlayerId === id).length);
    if (Math.max(...firstCounts) - Math.min(...firstCounts) > 1) errors.push(`${playerCount}P first-player seats are imbalanced`);
    const junFirst = group.filter((scenario) => scenario.expectedFirstPlayerId === scenario.junPlayerId).length;
    if (Math.abs(junFirst - 100 / playerCount) > 1) errors.push(`${playerCount}P Jun first-player status is imbalanced`);
    for (const tradition of NON_JUN_TRADITIONS) {
      const assigned = group.flatMap((scenario) => Object.entries(scenario.assignedTraditions)
        .filter(([, value]) => value === tradition)
        .map(([id]) => scenario.assignedIntents[id]!));
      const counts = INTENTS.map((intent) => assigned.filter((value) => value === intent).length);
      if (Math.max(...counts) - Math.min(...counts) > 2) errors.push(`${playerCount}P ${tradition} opponent intents are imbalanced`);
    }
    for (let seat = 0; seat < playerCount; seat += 1) {
      const id = playerId(seat);
      const assigned = group.filter((scenario) => scenario.assignedTraditions[id] !== "JU").map((scenario) => scenario.assignedIntents[id]!);
      const counts = INTENTS.map((intent) => assigned.filter((value) => value === intent).length);
      if (Math.max(...counts) - Math.min(...counts) > 2) errors.push(`${playerCount}P seat ${seat + 1} opponent intents are imbalanced`);
    }
  }
  const twoPlayer = schedule.scenarios.filter((scenario) => scenario.playerCount === 2);
  for (const tradition of NON_JUN_TRADITIONS) {
    const count = twoPlayer.filter((scenario) => scenario.opponentTraditions[0] === tradition).length;
    if (count !== 25) errors.push(`2P ${tradition} opponent count is ${count}`);
  }
  const fourPlayer = schedule.scenarios.filter((scenario) => scenario.playerCount === 4);
  for (const tradition of NON_JUN_TRADITIONS) {
    const omitted = fourPlayer.filter((scenario) => !scenario.opponentTraditions.includes(tradition)).length;
    if (omitted !== 25) errors.push(`4P ${tradition} omission count is ${omitted}`);
  }
  const threePlayer = schedule.scenarios.filter((scenario) => scenario.playerCount === 3);
  const pairCounts = THREE_PLAYER_PAIRS.map((pair) => threePlayer.filter((scenario) => scenario.opponentLineup === [...pair].sort().join("|")).length);
  if (Math.max(...pairCounts) - Math.min(...pairCounts) > 1) errors.push("3P opponent lineups are imbalanced");
  return errors;
}

export async function runPairedScenario<T>(
  scenario: JunAbScenario,
  runArm: (arm: JunAbArm, candidate: JunAbSeedCandidate) => Promise<T>,
): Promise<CompletedJunAbPair<T>> {
  const invalidAttempts: JunAbAttemptLog[] = [];
  for (const candidate of scenario.candidateSeeds) {
    const attempts = new Map<JunAbArm, { value?: T; error?: string }>();
    for (const arm of scenario.armOrder) {
      try {
        attempts.set(arm, { value: await runArm(arm, candidate) });
      } catch (error) {
        attempts.set(arm, { error: error instanceof Error ? error.stack ?? error.message : String(error) });
      }
    }
    const control = attempts.get("control");
    const junCostOne = attempts.get("jun_cost_1");
    if (control?.value !== undefined && junCostOne?.value !== undefined) {
      return { scenario, candidate, control: control.value, junCostOne: junCostOne.value, invalidAttempts };
    }
    for (const arm of scenario.armOrder) {
      const attempt = attempts.get(arm);
      invalidAttempts.push({
        pairId: scenario.pairId,
        replacementIndex: candidate.replacementIndex,
        arm,
        gameSeed: candidate.gameSeed,
        aiSeed: candidate.aiSeed,
        valid: attempt?.value !== undefined,
        discardedWithPair: true,
        error: attempt?.error ?? "paired arm was valid but discarded because its mate was invalid",
      });
    }
  }
  throw new Error(`All precommitted replacement pairs failed for ${scenario.pairId}`);
}
