import { GAME_CONFIG } from "../game/content.ts";
import type { PlaytestDraft, PlaytestFeedback, PlayerMetrics, RoundMetrics } from "./types.ts";

function localIsoDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function emptyPlayer(): PlaytestDraft["players"][number] {
  return {
    name: "",
    kilnId: null,
    startingTechniqueId: null,
    advancedTechnique1Id: null,
    advancedTechnique2Id: null,
    completedOrderIds: [],
    recognition: 0,
    kilnAbilityUses: null,
    finalVp: null,
    orderVp: null,
    traditionVp: null,
    exhibitionVp: null,
    coinVp: null,
  };
}

export function emptyRound(round: number): RoundMetrics {
  return {
    round,
    sharedLoaded: null,
    imperialLoaded: null,
    bank: null,
    tend: null,
    stoke: null,
    baseHeat: null,
    fireModifier: null,
    whiteLoaded: null,
    celadonLoaded: null,
    greyGreenLoaded: null,
    moonWhiteLoaded: null,
    heatConflict: null,
    orderStolen: null,
    shifuRepositionUsed: null,
    fuelLedgerUsed: null,
    notes: "",
  };
}

function emptyFeedback(): PlaytestFeedback {
  return {
    strongest: "",
    weakest: "",
    blockedOrIdleWorkers: "",
    softLock: "",
    impossibleOrder: "",
    sharedKilnNegotiation: "",
    heatHedging: "",
    tendMeaningful: "",
    recognitionWorthwhile: "",
    traditionConcern: "",
    techConcern: "",
    rulesAmbiguity: "",
    minorTuning: "",
  };
}

export function createPlaytestDraft(playerCount: 2 | 3 | 4 = 2): PlaytestDraft {
  return {
    formVersion: 1,
    rulesVersion: GAME_CONFIG.rulesVersion,
    playedOn: localIsoDate(),
    playerCount,
    firstPlayerIndex: 0,
    winnerIndex: 0,
    players: Array.from({ length: playerCount }, emptyPlayer),
    rounds: Array.from({ length: GAME_CONFIG.rounds }, (_, index) => emptyRound(index + 1)),
    feedback: emptyFeedback(),
  };
}

export function resizePlayers(draft: PlaytestDraft, playerCount: 2 | 3 | 4): PlaytestDraft {
  return {
    ...draft,
    playerCount,
    players: Array.from(
      { length: playerCount },
      (_, index) => draft.players[index] ?? emptyPlayer(),
    ),
    firstPlayerIndex: Math.min(draft.firstPlayerIndex, playerCount - 1),
    winnerIndex: Math.min(draft.winnerIndex, playerCount - 1),
  };
}

export function sharedKilnCapacity(playerCount: 2 | 3 | 4): number {
  return playerCount === 2 ? 5 : playerCount === 3 ? 6 : 7;
}

export function roundHasData(round: RoundMetrics): boolean {
  return Object.entries(round).some(([key, value]) => (
    key !== "round" && value !== null && value !== ""
  ));
}

export function submissionCandidate(draft: PlaytestDraft): unknown {
  return {
    ...draft,
    players: draft.players.map((player) => ({
      ...player,
      completedOrderIds: player.completedOrderIds.filter((orderId) => orderId !== ""),
    })) as PlayerMetrics[],
    rounds: draft.rounds.filter(roundHasData),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function restorePlaytestDraft(serialized: string): PlaytestDraft | null {
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value["formVersion"] !== 1) return null;
    if (![2, 3, 4].includes(Number(value["playerCount"]))) return null;
    if (!Array.isArray(value["players"]) || !Array.isArray(value["rounds"])) return null;
    if (!isRecord(value["feedback"])) return null;
    if (value["players"].length !== value["playerCount"] || value["rounds"].length !== 5) return null;
    if (!value["players"].every((player) => isRecord(player) && Array.isArray(player["completedOrderIds"]))) return null;
    return value as unknown as PlaytestDraft;
  } catch {
    return null;
  }
}
